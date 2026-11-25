import { count, eq, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
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
    columns: { id: true, username: true, passwordHash: true },
  });
  if (!user || passwordFingerprint(user.passwordHash) !== pwv) return null;
  return { id: user.id, username: user.username };
}

/** D42: create or reset a user's password (used by scripts/set-password.ts). Resets throttling. */
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
  const [row] = await db.insert(users).values({ username: username.trim(), passwordHash }).returning({ id: users.id });
  return row!.id;
}

/** First run: if ADMIN_USERNAME/PASSWORD are set and no user exists, create that user. Idempotent. */
export async function ensureInitialUser(db: Db, username?: string, password?: string): Promise<boolean> {
  if (!username || !password) return false;
  const [{ n }] = (await db.select({ n: count() }).from(users)) as [{ n: number }];
  if (n > 0) return false;
  await setPassword(db, username, password);
  return true;
}
