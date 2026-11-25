import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { currentUser } from "@/server/auth/session";
import { storageMode } from "@/server/storage";

/**
 * Issues a short-lived token so the browser uploads the .gcode straight to Vercel Blob
 * (no 4.5 MB function body limit). Signed-in users only (D42). The import action then
 * re-reads and checks the file, so nothing here is trusted.
 */
export async function POST(request: Request) {
  if (storageMode() !== "blob") return Response.json({ error: "Blob storage is not configured" }, { status: 404 });
  if (!(await currentUser())) return Response.json({ error: "Sign in first" }, { status: 401 });
  const body = (await request.json()) as HandleUploadBody;
  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.toLowerCase().endsWith(".gcode")) throw new Error("Only .gcode files");
        return {
          allowedContentTypes: ["text/x-gcode", "application/octet-stream", "text/plain"],
          addRandomSuffix: true,
          maximumSizeInBytes: 200 * 1024 * 1024,
        };
      },
    });
    return Response.json(result);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Upload refused" }, { status: 400 });
  }
}
