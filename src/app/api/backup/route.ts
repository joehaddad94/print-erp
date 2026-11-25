import { connection } from "next/server";
import { db } from "@/db";
import { currentUser } from "@/server/auth/session";
import { createBackup } from "@/server/backup";

/** Settings → Download backup: the full JSON dump, so a copy can live off Vercel. Restorable with `pnpm db:restore`. */
export async function GET() {
  await connection();
  if (!(await currentUser())) return new Response("Sign in first", { status: 401 });
  const backup = await createBackup(db());
  const day = backup.createdAt.slice(0, 10);
  return new Response(JSON.stringify(backup), {
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="print-erp-backup-${day}.json"`,
      "cache-control": "no-store",
    },
  });
}
