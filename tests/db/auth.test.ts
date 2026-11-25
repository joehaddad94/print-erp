import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { users } from "@/db/schema";
import { passwordFingerprint } from "@/lib/auth/token";
import { attemptLogin, ensureInitialUser, setPassword, userForSession } from "@/server/auth/service";
import { setupTestDb } from "./helpers";

const { db } = setupTestDb();
const PW = "correct horse battery";

describe("A-04 login throttle against the database", () => {
  it("throttles after 5 failures, doubles, and resets on success", async () => {
    await setPassword(db, "joe", PW);
    const t0 = new Date("2026-11-24T12:00:00Z");
    for (let i = 0; i < 5; i++)
      expect(await attemptLogin(db, "joe", "nope", t0)).toEqual({ ok: false, reason: "invalid" });
    // 6th try inside 30 s: refused without checking, even with the right password
    expect(await attemptLogin(db, "joe", PW, new Date(t0.getTime() + 10_000))).toMatchObject({
      ok: false,
      reason: "throttled",
      waitSeconds: 20,
    });
    // after 30 s a wrong password counts again → next wait 60 s
    const t1 = new Date(t0.getTime() + 31_000);
    expect(await attemptLogin(db, "joe", "nope", t1)).toEqual({ ok: false, reason: "invalid" });
    expect(await attemptLogin(db, "joe", PW, new Date(t1.getTime() + 59_000))).toMatchObject({ reason: "throttled" });
    const ok = await attemptLogin(db, "JOE ", PW, new Date(t1.getTime() + 61_000));
    expect(ok.ok).toBe(true);
    const [row] = await db.select().from(users);
    expect(row).toMatchObject({ failedLogins: 0, lastFailedLoginAt: null });
    expect(row!.lastLoginAt).not.toBeNull();
  });
  it("unknown usernames get the same generic answer", async () => {
    expect(await attemptLogin(db, "ghost", PW)).toEqual({ ok: false, reason: "invalid" });
  });
});

describe("A-03 password change invalidates sessions", () => {
  it("old fingerprint no longer resolves to a user", async () => {
    const id = await setPassword(db, "joe", PW);
    const [before] = await db.select().from(users).where(eq(users.id, id));
    const pwv = passwordFingerprint(before!.passwordHash);
    expect(await userForSession(db, id, pwv)).toEqual({ id, username: "joe" });
    await setPassword(db, "joe", "a brand new password");
    expect(await userForSession(db, id, pwv)).toBeNull();
  });
  it("a soft-deleted user has no session", async () => {
    const id = await setPassword(db, "joe", PW);
    const [u] = await db.select().from(users);
    await db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, id));
    expect(await userForSession(db, id, passwordFingerprint(u!.passwordHash))).toBeNull();
  });
});

describe("A-08 first user from ADMIN_* env", () => {
  it("creates exactly one user when the table is empty, and never again", async () => {
    expect(await ensureInitialUser(db, undefined, undefined)).toBe(false);
    expect(await ensureInitialUser(db, "joe", PW)).toBe(true);
    expect(await ensureInitialUser(db, "other", "another password")).toBe(false);
    expect((await db.select().from(users)).map((u) => u.username)).toEqual(["joe"]);
    expect((await attemptLogin(db, "joe", PW)).ok).toBe(true);
  });
});
