import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Stateless session token: base64url(JSON payload) + "." + base64url(HMAC-SHA256).
 * `pwv` is a short fingerprint of the password hash: changing the password
 * invalidates every existing session. Pure module so it is unit-testable.
 */
export type SessionPayload = { sub: number; pwv: string; iat: number; exp: number };

export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

const b64 = (buf: Buffer | string) => Buffer.from(buf).toString("base64url");

function sign(data: string, secret: string): string {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

export function passwordFingerprint(passwordHash: string): string {
  return createHash("sha256").update(passwordHash).digest("base64url").slice(0, 16);
}

export function createToken(
  userId: number,
  passwordHash: string,
  secret: string,
  now = Math.floor(Date.now() / 1000),
): string {
  const payload: SessionPayload = { sub: userId, pwv: passwordFingerprint(passwordHash), iat: now, exp: now + SESSION_TTL_SECONDS };
  const body = b64(JSON.stringify(payload));
  return `${body}.${sign(body, secret)}`;
}

/** Returns the payload if the signature is valid and not expired; otherwise null. Never throws. */
export function readToken(token: string | undefined, secret: string, now = Math.floor(Date.now() / 1000)): SessionPayload | null {
  if (!token) return null;
  const [body, sig, ...rest] = token.split(".");
  if (!body || !sig || rest.length) return null;
  const expected = Buffer.from(sign(body, secret));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload;
    if (typeof p.sub !== "number" || typeof p.exp !== "number" || typeof p.pwv !== "string") return null;
    if (p.exp <= now) return null;
    return p;
  } catch {
    return null;
  }
}
