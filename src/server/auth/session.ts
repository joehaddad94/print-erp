import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { db } from "@/db";
import { env } from "@/lib/env";
import { SESSION_TTL_SECONDS, createToken, readToken } from "@/lib/auth/token";
import { userForSession } from "./service";

export const SESSION_COOKIE = "session";

export async function startSession(userId: number, passwordHash: string) {
  const store = await cookies();
  store.set(SESSION_COOKIE, createToken(userId, passwordHash, env().AUTH_SECRET), {
    httpOnly: true,
    secure: env().NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function endSession() {
  (await cookies()).delete(SESSION_COOKIE);
}

/** The signed-in user or null. Cached per request. */
export const currentUser = cache(async () => {
  await connection();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const payload = readToken(token, env().AUTH_SECRET);
  if (!payload) return null;
  return userForSession(db(), payload.sub, payload.pwv);
});

/**
 * D42: every signed-in page and EVERY Server Action starts with this.
 * tests/unit/actions-guarded.test.ts fails if an action file forgets it.
 */
export async function requireUser() {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}
