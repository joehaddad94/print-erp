import { randomInt } from "node:crypto";

/**
 * R1: the app always generates passwords (new person, reset). Shown once, changed at first sign-in.
 * 16 characters from a 31-letter alphabet without look-alikes (0/O, 1/l/I), in groups of 4 so
 * it can be read out over the phone: about 79 bits. crypto.randomInt has no modulo bias.
 */
export const PASSWORD_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

export function generatePassword(groups = 4, size = 4): string {
  const parts: string[] = [];
  for (let g = 0; g < groups; g++) {
    let part = "";
    for (let i = 0; i < size; i++) part += PASSWORD_ALPHABET[randomInt(PASSWORD_ALPHABET.length)];
    parts.push(part);
  }
  return parts.join("-");
}

/** Rules for a password a person chooses (Change password). */
export function passwordProblem(next: string, username: string): string | null {
  if (next.length < 10) return "Use at least 10 characters.";
  if (next.length > 200) return "Use at most 200 characters.";
  if (next.trim().toLowerCase() === username.trim().toLowerCase()) return "Don't use your username.";
  return null;
}
