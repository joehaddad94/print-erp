import type { z } from "zod";
import { validate } from "@/server/form";

export type InlineResult = { ok: true; value?: string } | { ok: false; error: string };

const str = (v: unknown) => (v == null ? "" : String(v));

/**
 * One click-to-edit value on a detail page (InlineEdit, docs/DESIGN-SYSTEM.md §6): the whole record is
 * validated with the same schema as its form, with only `field` changed, then `write` saves it (logged).
 * Returns the stored value as text so the page shows exactly what was saved.
 */
export async function saveInlineField<S extends z.ZodType>(
  schema: S,
  current: Record<string, unknown>,
  field: string,
  raw: string,
  write: (data: z.infer<S>) => Promise<unknown>,
): Promise<InlineResult> {
  if (!(field in current)) return { ok: false, error: "This value can't be changed here." };
  const values = Object.fromEntries(Object.entries(current).map(([k, v]) => [k, str(v)]));
  values[field] = raw;
  const v = validate(schema, values);
  if (!v.ok)
    return {
      ok: false,
      error: v.state.fieldErrors?.[field] ?? Object.values(v.state.fieldErrors ?? {})[0] ?? "Check this value.",
    };
  try {
    await write(v.data);
  } catch {
    return { ok: false, error: "Couldn't save. Nothing was changed. Try again." };
  }
  return { ok: true, value: str((v.data as Record<string, unknown>)[field]) };
}
