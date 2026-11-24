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

  const result = await attemptLogin(db(), parsed.data.username, parsed.data.password);
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

export async function logoutAction() {
  await requireUser();
  await endSession();
  redirect("/login");
}
