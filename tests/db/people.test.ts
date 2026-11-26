import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { users } from "@/db/schema";
import { verifyPassword } from "@/lib/auth/password";
import { passwordFingerprint } from "@/lib/auth/token";
import {
  attemptLogin,
  changePassword,
  createPerson,
  listPeople,
  removePerson,
  resetPassword,
  setPassword,
  userForSession,
} from "@/server/auth/service";
import { setupTestDb } from "./helpers";

const { db } = setupTestDb();

describe("R1 roles and one-time passwords", () => {
  it("a server-admin user is an owner; an added person gets the role chosen and a generated password", async () => {
    const ownerId = await setPassword(db, "joe", "correct horse battery");
    const res = await createPerson(db, " rami ", "staff");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const [row] = await db.select().from(users).where(eq(users.id, res.id));
    expect(row).toMatchObject({ username: "rami", role: "staff", mustChangePassword: true });
    expect(await verifyPassword(row!.passwordHash, res.password)).toBe(true);
    const owner = await userForSession(
      db,
      ownerId,
      passwordFingerprint((await db.select().from(users).where(eq(users.id, ownerId)))[0]!.passwordHash),
    );
    expect(owner).toMatchObject({ role: "owner", mustChangePassword: false });
  });

  it("the one-time password signs in, then must be changed; after that the flag is cleared", async () => {
    const res = await createPerson(db, "rami", "staff");
    if (!res.ok) throw new Error("create failed");
    const login = await attemptLogin(db, "rami", res.password);
    expect(login.ok).toBe(true);
    if (!login.ok) return;
    expect(await userForSession(db, login.userId, passwordFingerprint(login.passwordHash))).toMatchObject({
      mustChangePassword: true,
    });
    expect(await changePassword(db, login.userId, "wrong", "a new password 1")).toEqual({
      ok: false,
      error: "The current password is wrong.",
    });
    expect(await changePassword(db, login.userId, res.password, "short")).toMatchObject({ ok: false });
    const changed = await changePassword(db, login.userId, res.password, "a new password 1");
    expect(changed.ok).toBe(true);
    if (!changed.ok) return;
    expect(await userForSession(db, login.userId, passwordFingerprint(changed.passwordHash))).toMatchObject({
      mustChangePassword: false,
    });
    // The one-time password no longer works.
    expect((await attemptLogin(db, "rami", res.password)).ok).toBe(false);
  });

  it("a reset gives a new one-time password and signs the person out everywhere", async () => {
    const res = await createPerson(db, "rami", "staff");
    if (!res.ok) throw new Error("create failed");
    const [before] = await db.select().from(users).where(eq(users.id, res.id));
    const reset = await resetPassword(db, res.id);
    expect(reset.ok).toBe(true);
    if (!reset.ok) return;
    expect(reset.password).not.toBe(res.password);
    expect(await userForSession(db, res.id, passwordFingerprint(before!.passwordHash))).toBeNull();
    expect((await attemptLogin(db, "rami", reset.password)).ok).toBe(true);
    expect(await resetPassword(db, 9999)).toEqual({ ok: false, error: "not_found" });
  });

  it("refuses bad or taken usernames, including removed people's", async () => {
    await setPassword(db, "joe", "correct horse battery");
    expect(await createPerson(db, "JOE", "staff")).toEqual({ ok: false, error: "taken" });
    expect(await createPerson(db, "a b", "staff")).toEqual({ ok: false, error: "bad_username" });
    expect(await createPerson(db, "x", "staff")).toEqual({ ok: false, error: "bad_username" });
    const r = await createPerson(db, "rami", "staff");
    if (!r.ok) throw new Error("create failed");
    const ownerId = (await db.select().from(users).where(eq(users.username, "joe")))[0]!.id;
    expect(await removePerson(db, ownerId, r.id)).toEqual({ ok: true });
    expect(await createPerson(db, "rami", "staff")).toEqual({ ok: false, error: "taken" });
  });

  it("can't remove yourself or the last owner; a removed person can't sign in and leaves the list", async () => {
    const joe = await setPassword(db, "joe", "correct horse battery");
    const sam = await createPerson(db, "sam", "owner");
    const rami = await createPerson(db, "rami", "staff");
    if (!sam.ok || !rami.ok) throw new Error("create failed");
    expect(await removePerson(db, joe, joe)).toEqual({ ok: false, error: "self" });
    expect(await removePerson(db, joe, sam.id)).toEqual({ ok: true });
    // sam was removed, joe is now the only owner: rami (staff) can't remove joe even via a crafted call.
    expect(await removePerson(db, rami.id, joe)).toEqual({ ok: false, error: "last_owner" });
    expect((await attemptLogin(db, "sam", sam.password)).ok).toBe(false);
    expect((await listPeople(db)).map((p) => p.username).sort()).toEqual(["joe", "rami"]);
  });
});
