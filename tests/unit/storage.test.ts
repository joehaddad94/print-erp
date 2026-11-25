import { afterEach, describe, expect, it } from "vitest";
import { blobUploadFlavor, storageMode } from "@/server/storage";

const KEYS = ["BLOB_READ_WRITE_TOKEN", "BLOB_STORE_ID"] as const;
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

function setEnv(env: Partial<Record<(typeof KEYS)[number], string>>) {
  for (const k of KEYS) delete process.env[k];
  Object.assign(process.env, env);
}

describe("storage mode", () => {
  it("uses local disk with no Blob credentials", () => {
    setEnv({});
    expect(storageMode()).toBe("local");
  });

  it("uses Blob with a read-write token, uploads via client token", () => {
    setEnv({ BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_abc_123" });
    expect(storageMode()).toBe("blob");
    expect(blobUploadFlavor()).toBe("token");
  });

  // Vercel connects new stores with OIDC: BLOB_STORE_ID, no read-write token.
  it("uses Blob with only BLOB_STORE_ID (OIDC), uploads via presigned URL", () => {
    setEnv({ BLOB_STORE_ID: "store_abc" });
    expect(storageMode()).toBe("blob");
    expect(blobUploadFlavor()).toBe("presigned");
  });
});
