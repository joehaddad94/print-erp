import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { get, put } from "@vercel/blob";

/**
 * File storage for original G-code files and thumbnails (D14, rule 7).
 * Production: Vercel Blob. Without a Blob token (local dev, tests): a folder on disk,
 * addressed as `local:<name>`. Files are never changed or deleted once stored.
 * Reads process.env directly so tests can point it at a temp folder.
 */
export type StorageMode = "blob" | "local";

export function storageMode(): StorageMode {
  return process.env.BLOB_READ_WRITE_TOKEN ? "blob" : "local";
}

export function blobAccess(): "private" | "public" {
  return process.env.BLOB_ACCESS === "public" ? "public" : "private";
}

const LOCAL_PREFIX = "local:";

function localDir() {
  // Dev/test only; the ignore hint stops the build from tracing the whole project into the bundle.
  return path.resolve(/* turbopackIgnore: true */ process.cwd(), process.env.LOCAL_UPLOAD_DIR || ".data/uploads");
}

/** Keeps a readable, safe file name and adds a random part so names never collide. */
export function storageName(fileName: string): string {
  const base =
    path
      .basename(fileName)
      .replace(/[^\w.-]+/g, "-")
      .slice(-120) || "file";
  return `${randomBytes(8).toString("hex")}-${base}`;
}

function localPath(url: string): string {
  const name = url.slice(LOCAL_PREFIX.length);
  if (!name || name.includes("/") || name.includes("\\") || name.startsWith("."))
    throw new Error("Bad local file name");
  return path.join(localDir(), name);
}

export async function putLocal(fileName: string, bytes: Uint8Array): Promise<string> {
  await mkdir(localDir(), { recursive: true });
  const name = storageName(fileName);
  await writeFile(path.join(localDir(), name), bytes, { flag: "wx" });
  return LOCAL_PREFIX + name;
}

/** Server-side write (thumbnails). Uploads of G-code files go straight from the browser. */
export async function putFile(pathname: string, bytes: Uint8Array, contentType: string): Promise<string> {
  if (storageMode() === "local") return putLocal(pathname, bytes);
  const res = await put(`${pathname}`, Buffer.from(bytes), {
    access: blobAccess(),
    contentType,
    addRandomSuffix: true,
  });
  return res.url;
}

/** Reads a stored file back in full. Returns null if it does not exist. */
export async function readStoredFile(url: string): Promise<Uint8Array | null> {
  if (url.startsWith(LOCAL_PREFIX)) {
    try {
      return new Uint8Array(await readFile(localPath(url)));
    } catch {
      return null;
    }
  }
  if (storageMode() !== "blob") return null;
  const res = await get(url, { access: blobAccess() });
  if (!res || res.statusCode !== 200) return null;
  return new Uint8Array(await new Response(res.stream).arrayBuffer());
}

/** True when the URL points at a file this app stored (local or our Blob store). */
export function isOwnStorageUrl(url: string): boolean {
  if (url.startsWith(LOCAL_PREFIX)) return storageMode() === "local";
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname.endsWith(".blob.vercel-storage.com");
  } catch {
    return false;
  }
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
