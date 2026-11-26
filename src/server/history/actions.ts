"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { requireOwner } from "@/server/auth/session";
import { restoreChange } from "./service";

/** Change history → Restore (owner only). Comes back to the same filtered list with a message. */
export async function restoreChangeAction(fd: FormData) {
  const me = await requireOwner();
  const back = String(fd.get("back") ?? "/history");
  const res = await restoreChange(db(), Number(fd.get("id")), me.id);
  revalidatePath("/", "layout");
  const sep = back.includes("?") ? "&" : "?";
  const safeBack = back.startsWith("/history") ? back : "/history";
  redirect(`${safeBack}${sep}${res.ok ? "restored=1" : `error=${encodeURIComponent(res.error)}`}`);
}
