"use client";

import { upload, uploadPresigned } from "@vercel/blob/client";
import type { BlobUploadFlavor, StorageMode } from "@/server/storage";

/** SHA-256 of the file, computed in the browser (R-06 duplicate check before uploading). */
export async function sha256OfFile(file: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Sends the original file to storage and returns its URL. Production: straight to Vercel Blob
 * (client upload, D14). Local dev and tests: to the app's local-disk route.
 */
export async function uploadGcode(
  file: File,
  mode: StorageMode,
  access: "private" | "public",
  flavor: BlobUploadFlavor,
): Promise<string> {
  if (mode === "blob") {
    // Same route serves both: it answers the client-token or the presigned-URL request.
    const send = flavor === "presigned" ? uploadPresigned : upload;
    const res = await send(`gcode/${file.name}`, file, {
      access,
      handleUploadUrl: "/api/uploads/blob",
      contentType: "text/x-gcode",
      multipart: file.size > 8 * 1024 * 1024,
    });
    return res.url;
  }
  const res = await fetch("/api/uploads/local", {
    method: "POST",
    headers: { "x-file-name": encodeURIComponent(file.name) },
    body: file,
  });
  if (!res.ok) throw new Error("Upload failed");
  return ((await res.json()) as { url: string }).url;
}

/**
 * D32 "Save as recipe": the calculator hands its file to the import screen. Kept in memory
 * only (client-side navigation), so nothing is uploaded until the import is saved.
 */
let handoff: File | null = null;
export function handOffFile(file: File) {
  handoff = file;
}
export function takeHandedOffFile(): File | null {
  const f = handoff;
  handoff = null;
  return f;
}
