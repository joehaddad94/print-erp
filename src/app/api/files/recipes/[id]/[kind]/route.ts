import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { recipes } from "@/db/schema";
import { currentUser } from "@/server/auth/session";
import { readStoredFile } from "@/server/storage";

/**
 * Download the original .gcode (rule 7: identical bytes) or the thumbnail. Goes through the app
 * so files stay behind the login even in a private Blob store.
 */
export async function GET(_req: Request, ctx: RouteContext<"/api/files/recipes/[id]/[kind]">) {
  if (!(await currentUser())) return new Response("Sign in first", { status: 401 });
  const { id, kind } = await ctx.params;
  if (kind !== "gcode" && kind !== "thumbnail") return new Response("Not found", { status: 404 });
  const [r] = await db()
    .select({ file: recipes.fileBlobUrl, thumb: recipes.thumbnailBlobUrl, name: recipes.fileName })
    .from(recipes)
    .where(and(eq(recipes.id, Number(id) || 0), isNull(recipes.deletedAt)));
  const url = kind === "gcode" ? r?.file : r?.thumb;
  const bytes = url ? await readStoredFile(url) : null;
  if (!r || !bytes) return new Response("Not found", { status: 404 });
  const headers: Record<string, string> =
    kind === "gcode"
      ? {
          "content-type": "text/x-gcode",
          "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(r.name)}`,
        }
      : { "content-type": "image/png", "cache-control": "private, max-age=86400" };
  return new Response(bytes as Uint8Array<ArrayBuffer>, { headers });
}
