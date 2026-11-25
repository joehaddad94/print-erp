import { currentUser } from "@/server/auth/session";
import { putLocal, storageMode } from "@/server/storage";

/** Local dev and tests only (no Blob token): the browser posts the file bytes here. */
export async function POST(request: Request) {
  if (storageMode() !== "local") return Response.json({ error: "Not available" }, { status: 404 });
  if (!(await currentUser())) return Response.json({ error: "Sign in first" }, { status: 401 });
  const name = decodeURIComponent(request.headers.get("x-file-name") ?? "upload.gcode");
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength === 0) return Response.json({ error: "Empty file" }, { status: 400 });
  return Response.json({ url: await putLocal(name, bytes) });
}
