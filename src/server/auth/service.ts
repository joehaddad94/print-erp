import { and, count, eq, isNull, ne, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { generatePassword, passwordProblem } from "@/lib/auth/generate";
import { dummyHash, hashPassword, verifyPassword } from "@/lib/auth/password";
import { passwordFingerprint } from "@/lib/auth/token";
import { waitRemainingMs } from "@/lib/auth/throttle";
import type * as schema from "@/db/schema";
import { users } from "@/db/schema";

type Db = PostgresJsDatabase<typeof schema>;

export type LoginResult =
  | { ok: true; userId: number; passwordHash: string }
  | { ok: false; reason: "invalid" }
  | { ok: false; reason: "throttled"; waitSeconds: number };

const findUser = (db: Db, username: string) =>
  db.query.users.findFirst({
    where: (u, { and, isNull }) =>
      and(eq(sql`lower(${u.username})`, username.trim().toLowerCase()), isNull(u.deletedAt)),
  });

/** Checks a username/password with throttling. Unknown users cost the same time as wrong passwords. */
export async function attemptLogin(db: Db, username: string, password: string, now = new Date()): Promise<LoginResult> {
  const user = await findUser(db, username);
  if (!user) {
    await verifyPassword(await dummyHash(), password);
    return { ok: false, reason: "invalid" };
  }
  const wait = waitRemainingMs(user.failedLogins, user.lastFailedLoginAt, now);
  if (wait > 0) return { ok: false, reason: "throttled", waitSeconds: Math.ceil(wait / 1000) };

  if (!(await verifyPassword(user.passwordHash, password))) {
    await db
      .update(users)
      .set({ failedLogins: sql`${users.failedLogins} + 1`, lastFailedLoginAt: now })
      .where(eq(users.id, user.id));
    return { ok: false, reason: "invalid" };
  }
  await db
    .update(users)
    .set({ failedLogins: 0, lastFailedLoginAt: null, lastLoginAt: now })
    .where(eq(users.id, user.id));
  return { ok: true, userId: user.id, passwordHash: user.passwordHash };
}

/** The signed-in user, if the session's password fingerprint still matches. */
export async function userForSession(db: Db, userId: number, pwv: string) {
  const user = await db.query.users.findFirst({
    where: (u, { and, isNull }) => and(eq(u.id, userId), isNull(u.deletedAt)),
    columns: { id: true, username: true, passwordHash: true, role: true, mustChangePassword: true },
  });
  if (!user || passwordFingerprint(user.passwordHash) !== pwv) return null;
  return { id: user.id, username: user.username, role: user.role, mustChangePassword: user.mustChangePassword };
}

/**
 * D42: create or reset a user's password (server admin: scripts/set-password.ts, first-run bootstrap).
 * Resets throttling. A user created this way is an owner: only the person running the server can do it.
 */
export async function setPassword(db: Db, username: string, password: string) {
  const passwordHash = await hashPassword(password);
  const existing = await findUser(db, username);
  if (existing) {
    await db
      .update(users)
      .set({ passwordHash, failedLogins: 0, lastFailedLoginAt: null })
      .where(eq(users.id, existing.id));
    return existing.id;
  }
  const [row] = await db
    .insert(users)
    .values({ username: username.trim(), passwordHash, role: "owner" })
    .returning({ id: users.id });
  return row!.id;
}

export type Role = "owner" | "staff";
export type PeopleError = "taken" | "bad_username" | "last_owner" | "self" | "not_found";

const USERNAME = /^[a-z0-9._-]{2,32}$/i;

/** R1 Add person: the app generates the password; it is shown once and must be changed at first sign-in. */
export async function createPerson(
  db: Db,
  username: string,
  role: Role,
): Promise<{ ok: true; id: number; password: string } | { ok: false; error: PeopleError }> {
  const name = username.trim();
  if (!USERNAME.test(name)) return { ok: false, error: "bad_username" };
  // Removed people keep their name (history points at them), so it counts as taken too.
  const clash = await db.query.users.findFirst({ where: (u) => eq(sql`lower(${u.username})`, name.toLowerCase()) });
  if (clash) return { ok: false, error: "taken" };
  const password = generatePassword();
  const [row] = await db
    .insert(users)
    .values({ username: name, passwordHash: await hashPassword(password), role, mustChangePassword: true })
    .returning({ id: users.id });
  return { ok: true, id: row!.id, password };
}

/** R1 Reset password: a new generated one-time password. Signs out the person's sessions (fingerprint changes). */
export async function resetPassword(
  db: Db,
  userId: number,
): Promise<{ ok: true; password: string } | { ok: false; error: PeopleError }> {
  const password = generatePassword();
  const rows = await db
    .update(users)
    .set({
      passwordHash: await hashPassword(password),
      mustChangePassword: true,
      failedLogins: 0,
      lastFailedLoginAt: null,
    })
    .where(and(eq(users.id, userId), isNull(users.deletedAt)))
    .returning({ id: users.id });
  return rows.length ? { ok: true, password } : { ok: false, error: "not_found" };
}

/** R1 Change password (first sign-in or Settings). Needs the current one. */
export async function changePassword(
  db: Db,
  userId: number,
  current: string,
  next: string,
): Promise<{ ok: true; passwordHash: string } | { ok: false; error: string }> {
  const user = await db.query.users.findFirst({ where: (u) => and(eq(u.id, userId), isNull(u.deletedAt)) });
  if (!user) return { ok: false, error: "Account not found." };
  if (!(await verifyPassword(user.passwordHash, current)))
    return { ok: false, error: "The current password is wrong." };
  if (current === next) return { ok: false, error: "Choose a password different from the current one." };
  const problem = passwordProblem(next, user.username);
  if (problem) return { ok: false, error: problem };
  const passwordHash = await hashPassword(next);
  await db.update(users).set({ passwordHash, mustChangePassword: false }).where(eq(users.id, userId));
  return { ok: true, passwordHash };
}

/** R1 Remove person: soft delete. You can't remove yourself or the last owner. */
export async function removePerson(
  db: Db,
  actorId: number,
  userId: number,
): Promise<{ ok: true } | { ok: false; error: PeopleError }> {
  if (actorId === userId) return { ok: false, error: "self" };
  return db.transaction(async (tx) => {
    const user = await tx.query.users.findFirst({ where: (u) => and(eq(u.id, userId), isNull(u.deletedAt)) });
    if (!user) return { ok: false as const, error: "not_found" as const };
    if (user.role === "owner") {
      const [{ n }] = (await tx
        .select({ n: count() })
        .from(users)
        .where(and(eq(users.role, "owner"), isNull(users.deletedAt), ne(users.id, userId)))) as [{ n: number }];
      if (n === 0) return { ok: false as const, error: "last_owner" as const };
    }
    await tx.update(users).set({ deletedAt: new Date() }).where(eq(users.id, userId));
    return { ok: true as const };
  });
}

/** Settings → People. */
export function listPeople(db: Db) {
  return db.query.users.findMany({
    where: (u) => isNull(u.deletedAt),
    columns: { id: true, username: true, role: true, lastLoginAt: true, mustChangePassword: true },
    orderBy: (u, { asc }) => [asc(u.role), asc(u.username)],
  });
}

/** First run: if ADMIN_USERNAME/PASSWORD are set and no user exists, create that user. Idempotent. */
export async function ensureInitialUser(db: Db, username?: string, password?: string): Promise<boolean> {
  if (!username || !password) return false;
  const [{ n }] = (await db.select({ n: count() }).from(users)) as [{ n: number }];
  if (n > 0) return false;
  await setPassword(db, username, password);
  return true;
}
