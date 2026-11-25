"use server";

import { redirect } from "next/navigation";
import { db } from "@/db";
import { loginSchema } from "./schema";
import { attemptLogin } from "./service";
import { endSession, requireUser, startSession } from "./session";

export type LoginState = {
  error?: string;
  fieldErrors?: Partial<Record<"username" | "password", string>>;
  username?: string;
};

// Public by design: the one action a signed-out visitor may call. Listed in PUBLIC_ACTIONS in the guard test.
export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const raw = { username: String(formData.get("username") ?? ""), password: String(formData.get("password") ?? "") };
  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: LoginState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as "username" | "password";
      fieldErrors[key] ??= issue.message;
    }
    return { fieldErrors, username: raw.username };
  }

  let result: Awaited<ReturnType<typeof attemptLogin>>;
  try {
    result = await withTimeout(attemptLogin(db(), parsed.data.username, parsed.data.password), 15_000);
  } catch (e) {
    const code = errorCode(e);
    console.error(`login failed: ${code}`, e instanceof Error ? e.message : e);
    return {
      username: parsed.data.username,
      error: `Can't reach the database right now (${code}). Nothing was changed. Try again in a minute.`,
    };
  }
  if (!result.ok) {
    return {
      username: parsed.data.username,
      error:
        result.reason === "throttled"
          ? `Too many wrong passwords. Try again in ${result.waitSeconds} seconds.`
          : "Wrong username or password.",
    };
  }
  await startSession(result.userId, result.passwordHash);
  redirect("/");
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(Object.assign(new Error("timed out"), { code: "TIMEOUT" })), ms);
    p.then(resolve, reject).finally(() => clearTimeout(t));
  });
}

/** A short, secret-free code to show and log: Postgres SQLSTATE (28P01 = wrong password), ENOTFOUND, TIMEOUT… */
function errorCode(e: unknown): string {
  const c =
    (e as { code?: unknown; cause?: { code?: unknown } })?.code ?? (e as { cause?: { code?: unknown } })?.cause?.code;
  return typeof c === "string" && /^[A-Z0-9_]{2,30}$/.test(c) ? c : "UNKNOWN";
}

export async function logoutAction() {
  await requireUser();
  await endSession();
  redirect("/login");
}
