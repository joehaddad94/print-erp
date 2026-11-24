/**
 * Login throttle (D42: "repeated wrong passwords are slowed down").
 * Up to 5 failures: no wait. Then 30 s, doubling per further failure, capped at 15 min.
 */
export const FREE_ATTEMPTS = 5;
const BASE_MS = 30_000;
const MAX_MS = 15 * 60_000;

export function lockoutMs(failedLogins: number): number {
  if (failedLogins < FREE_ATTEMPTS) return 0;
  return Math.min(BASE_MS * 2 ** (failedLogins - FREE_ATTEMPTS), MAX_MS);
}

/** Milliseconds the user must still wait before trying again (0 = may try now). */
export function waitRemainingMs(failedLogins: number, lastFailedAt: Date | null, now = new Date()): number {
  if (!lastFailedAt) return 0;
  const until = lastFailedAt.getTime() + lockoutMs(failedLogins);
  return Math.max(0, until - now.getTime());
}
