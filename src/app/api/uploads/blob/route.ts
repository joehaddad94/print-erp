import { issueSignedToken } from "@vercel/blob";
import {
  handleUpload,
  handleUploadPresigned,
  type HandleUploadBody,
  type HandleUploadPresignedBody,
} from "@vercel/blob/client";
import { currentUser } from "@/server/auth/session";
import { storageMode } from "@/server/storage";

const ALLOWED_TYPES = ["text/x-gcode", "application/octet-stream", "text/plain"];
const MAX_BYTES = 200 * 1024 * 1024;

function checkPath(pathname: string) {
  if (!pathname.toLowerCase().endsWith(".gcode")) throw new Error("Only .gcode files");
}

/**
 * Lets the browser upload the .gcode straight to Vercel Blob (no 4.5 MB function body limit).
 * Signed-in users only (D42). The import action then re-reads and checks the file, so nothing
 * here is trusted.
 *
 * Two ways in, depending on how the store is connected:
 * - read-write token (BLOB_READ_WRITE_TOKEN): `upload()` asks for a client token (handleUpload).
 * - OIDC (BLOB_STORE_ID, Vercel's default): `uploadPresigned()` asks for a presigned URL.
 */
export async function POST(request: Request) {
  if (storageMode() !== "blob") return Response.json({ error: "Blob storage is not configured" }, { status: 404 });
  if (!(await currentUser())) return Response.json({ error: "Sign in first" }, { status: 401 });
  const body = (await request.json()) as HandleUploadBody | HandleUploadPresignedBody;
  try {
    if (body.type === "blob.generate-presigned-url") {
      const result = await handleUploadPresigned({
        body,
        request,
        // Only needed to verify upload-completed callbacks, which this app never asks for.
        webhookPublicKey: process.env.BLOB_WEBHOOK_PUBLIC_KEY || "unused",
        getSignedToken: async (pathname) => {
          checkPath(pathname);
          const token = await issueSignedToken({
            pathname,
            operations: ["put"],
            validUntil: Date.now() + 60 * 60 * 1000,
            allowedContentTypes: ALLOWED_TYPES,
            maximumSizeInBytes: MAX_BYTES,
          });
          return {
            token,
            urlOptions: { allowedContentTypes: ALLOWED_TYPES, maximumSizeInBytes: MAX_BYTES, addRandomSuffix: true },
          };
        },
      });
      return Response.json(result);
    }
    const result = await handleUpload({
      body: body as HandleUploadBody,
      request,
      onBeforeGenerateToken: async (pathname) => {
        checkPath(pathname);
        return { allowedContentTypes: ALLOWED_TYPES, addRandomSuffix: true, maximumSizeInBytes: MAX_BYTES };
      },
    });
    return Response.json(result);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Upload refused" }, { status: 400 });
  }
}
