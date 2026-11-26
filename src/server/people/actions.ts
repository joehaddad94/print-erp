"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  changePassword,
  createPerson,
  removePerson,
  resetPassword,
  type PeopleError,
  type Role,
} from "@/server/auth/service";
import { requireOwner, requireSession, startSession } from "@/server/auth/session";
import { logPeopleChange } from "@/server/history/service";

/** What the People panel shows after an action: an error, or a one-time password to copy (shown once). */
export type PeopleState = { error?: string; username?: string; password?: string; version?: number };

const MESSAGES: Record<PeopleError, string> = {
  taken: "That username is already used (removed people keep theirs).",
  bad_username: "Use 2 to 32 letters, numbers, dots, dashes or underscores.",
  last_owner: "Keep at least one owner.",
  self: "You can't remove yourself.",
  not_found: "That person no longer exists. Reload the page.",
};

export async function addPersonAction(_prev: PeopleState, fd: FormData): Promise<PeopleState> {
  const me = await requireOwner();
  const username = String(fd.get("username") ?? "");
  const role: Role = fd.get("role") === "owner" ? "owner" : "staff";
  const res = await createPerson(db(), username, role);
  if (!res.ok) return { error: MESSAGES[res.error], username, version: Date.now() };
  await logPeopleChange(db(), { userId: res.id, actorId: me.id, field: "role", after: role, before: "Added" });
  revalidatePath("/settings");
  return { username: username.trim(), password: res.password, version: Date.now() };
}

export async function resetPasswordAction(_prev: PeopleState, fd: FormData): Promise<PeopleState> {
  const me = await requireOwner();
  const id = Number(fd.get("id"));
  const username = String(fd.get("username") ?? "");
  const res = await resetPassword(db(), id);
  if (!res.ok) return { error: MESSAGES[res.error], version: Date.now() };
  await logPeopleChange(db(), { userId: id, actorId: me.id, field: "password", after: "One-time password" });
  revalidatePath("/settings");
  return { username, password: res.password, version: Date.now() };
}

export async function removePersonAction(_prev: PeopleState, fd: FormData): Promise<PeopleState> {
  const me = await requireOwner();
  const id = Number(fd.get("id"));
  const res = await removePerson(db(), me.id, id);
  if (!res.ok) return { error: MESSAGES[res.error], version: Date.now() };
  await logPeopleChange(db(), { userId: id, actorId: me.id, field: "*", action: "delete" });
  revalidatePath("/settings");
  return { version: Date.now() };
}

export type ChangePasswordState = { error?: string; done?: boolean };

/** First sign-in (forced) or Settings → Change password. Keeps you signed in with the new password. */
export async function changePasswordAction(_prev: ChangePasswordState, fd: FormData): Promise<ChangePasswordState> {
  const me = await requireSession();
  const next = String(fd.get("next") ?? "");
  if (next !== String(fd.get("confirm") ?? "")) return { error: "The two new passwords don't match." };
  const res = await changePassword(db(), me.id, String(fd.get("current") ?? ""), next);
  if (!res.ok) return { error: res.error };
  await startSession(me.id, res.passwordHash);
  // The form does a full page load to Today: a client redirect can bounce back here, because the
  // browser cached "/" while it still sent a first sign-in to this screen.
  return { done: true };
}
