import "server-only";
import { z } from "zod";

const schema = z.object({
  /** Supabase transaction pooler URL (port 6543). Used by the running app. */
  DATABASE_URL: z.url(),
  /** At least 32 random characters; signs session cookies. Rotating it signs everyone out. */
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),
  /** First-run only: creates the user if the users table is empty (D42). Remove after first login. */
  ADMIN_USERNAME: z.string().optional(),
  ADMIN_PASSWORD: z.string().optional(),
  BLOB_READ_WRITE_TOKEN: z.string().optional(),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/** Validated server environment. Throws one readable error listing every missing or bad variable. */
export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`);
    throw new Error(`Invalid environment variables:\n${lines.join("\n")}`);
  }
  cached = parsed.data;
  return cached;
}
