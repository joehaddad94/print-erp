import { eq } from "drizzle-orm";
import { connection } from "next/server";
import { db } from "@/db";
import { recipes } from "@/db/schema";
import { currentUser, isOwner } from "@/server/auth/session";
import { readStoredFile } from "@/server/storage";

/** R8 full backup: one recipe's original G-code, deleted recipes included. Owner only. */
export async function GET(_req: Request, ctx: RouteContext<"/api/backup/files/[id]">) {
  await connection();
  const user = await currentUser();
  if (!user) return new Response("Sign in first", { status: 401 });
  if (!isOwner(user) || user.mustChangePassword)
    return new Response("Only the owner can download backups", { status: 403 });
  const [r] = await db()
    .select({ url: recipes.fileBlobUrl })
    .from(recipes)
    .where(eq(recipes.id, Number((await ctx.params).id) || 0));
  const bytes = r?.url ? await readStoredFile(r.url) : null;
  if (!bytes) return new Response("Not found", { status: 404 });
  return new Response(bytes as Uint8Array<ArrayBuffer>, {
    headers: { "content-type": "text/x-gcode", "cache-control": "no-store" },
  });
}
