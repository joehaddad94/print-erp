import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { FREE_ATTEMPTS, lockoutMs, waitRemainingMs } from "@/lib/auth/throttle";
import { SESSION_TTL_SECONDS, createToken, readToken } from "@/lib/auth/token";

const SECRET = "a".repeat(40);
const OTHER = "b".repeat(40);

describe("A-01 argon2id", () => {
  it("round-trips and rejects a wrong password", async () => {
    const h = await hashPassword("correct horse");
    expect(h.startsWith("$argon2id$")).toBe(true);
    expect(await verifyPassword(h, "correct horse")).toBe(true);
    expect(await verifyPassword(h, "wrong horse")).toBe(false);
  });
  it("returns false (never throws) for a malformed hash", async () => {
    expect(await verifyPassword("not-a-hash", "x")).toBe(false);
  });
});

describe("A-02 session token", () => {
  const now = 1_800_000_000;
  const token = createToken(7, "$argon2id$hash", SECRET, now);

  it("accepts a valid token", () => {
    expect(readToken(token, SECRET, now + 10)).toMatchObject({ sub: 7, iat: now, exp: now + SESSION_TTL_SECONDS });
  });
  it("rejects a tampered payload", () => {
    const [body, sig] = token.split(".");
    const forged = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(body!, "base64url").toString()), sub: 1 }),
    ).toString("base64url");
    expect(readToken(`${forged}.${sig}`, SECRET, now)).toBeNull();
  });
  it("rejects a wrong secret, an expired token and garbage", () => {
    expect(readToken(token, OTHER, now)).toBeNull();
    expect(readToken(token, SECRET, now + SESSION_TTL_SECONDS)).toBeNull();
    for (const bad of [undefined, "", "abc", "a.b.c", `${token}x`]) expect(readToken(bad, SECRET, now)).toBeNull();
  });
  it("A-03 a different password hash gives a different fingerprint", () => {
    const other = createToken(7, "$argon2id$other", SECRET, now);
    expect(readToken(other, SECRET, now)!.pwv).not.toBe(readToken(token, SECRET, now)!.pwv);
  });
});

describe("A-04 throttle schedule", () => {
  it("is free for the first 5 failures, then 30 s doubling, capped at 15 min", () => {
    expect(FREE_ATTEMPTS).toBe(5);
    expect([0, 4].map(lockoutMs)).toEqual([0, 0]);
    expect([5, 6, 7].map(lockoutMs)).toEqual([30_000, 60_000, 120_000]);
    expect(lockoutMs(30)).toBe(15 * 60_000);
  });
  it("computes the remaining wait", () => {
    const t = new Date("2026-11-24T12:00:00Z");
    expect(waitRemainingMs(5, t, new Date(t.getTime() + 10_000))).toBe(20_000);
    expect(waitRemainingMs(5, t, new Date(t.getTime() + 31_000))).toBe(0);
    expect(waitRemainingMs(9, null)).toBe(0);
  });
});
