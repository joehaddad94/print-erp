import { z } from "zod";

/** What every Server Action form returns. `values` keeps what was typed so a failed save loses nothing (D41). */
export type FormState = {
  ok?: boolean;
  message?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
  /** Bumped on every response so the form remounts its inputs with the returned values. */
  version?: number;
};

export function formValues(fd: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (typeof v === "string" && !k.startsWith("$ACTION")) out[k] = v;
  return out;
}

export function validate<T extends z.ZodType>(
  schema: T,
  values: Record<string, string>,
): { ok: true; data: z.infer<T> } | { ok: false; state: FormState } {
  const parsed = schema.safeParse(values);
  if (parsed.success) return { ok: true, data: parsed.data };
  const fieldErrors: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const key = String(issue.path[0] ?? "form");
    fieldErrors[key] ??= issue.message;
  }
  return { ok: false, state: { fieldErrors, values, version: Date.now() } };
}

export function failure(values: Record<string, string>, error: string): FormState {
  return { error, values, version: Date.now() };
}

/** Field helpers: HTML forms send strings; empty means "not set". */
const emptyToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

export const f = {
  text: (label: string, max = 200) => z.string().trim().min(1, `Enter ${label}`).max(max),
  optionalText: (max = 2000) =>
    z.preprocess(emptyToUndefined, z.string().trim().max(max).optional()).transform((v) => v ?? null),
  number: (label: string, opts: { min?: number; max?: number; positive?: boolean } = {}) => {
    let n = z.coerce
      .number({ error: `Enter ${label} as a number` })
      .refine(Number.isFinite, `Enter ${label} as a number`);
    if (opts.positive) n = n.refine((x) => x > 0, `${cap(label)} must be more than 0`);
    if (opts.min != null) n = n.refine((x) => x >= opts.min!, `${cap(label)} must be at least ${opts.min}`);
    if (opts.max != null) n = n.refine((x) => x <= opts.max!, `${cap(label)} must be at most ${opts.max}`);
    return z.preprocess((v) => (typeof v === "string" ? v.replace(/,/g, "") : v), z.preprocess(emptyToUndefined, n));
  },
  optionalNumber: (label: string, opts: { min?: number; positive?: boolean } = {}) =>
    z
      .preprocess(
        (v) => emptyToUndefined(typeof v === "string" ? v.replace(/,/g, "") : v),
        z.coerce
          .number({ error: `Enter ${label} as a number` })
          .refine(Number.isFinite, `Enter ${label} as a number`)
          .refine((x) => !opts.positive || x > 0, `${cap(label)} must be more than 0`)
          .refine((x) => opts.min == null || x >= opts.min, `${cap(label)} must be at least ${opts.min}`)
          .optional(),
      )
      .transform((v) => v ?? null),
  id: (label: string) =>
    z.coerce
      .number({ error: `Choose ${label}` })
      .int()
      .positive(`Choose ${label}`),
  optionalId: () =>
    z.preprocess(emptyToUndefined, z.coerce.number().int().positive().optional()).transform((v) => v ?? null),
  date: (label: string) => z.iso.date({ error: `Enter ${label} as a date` }),
  currency: () => z.enum(["USD", "LBP"], { error: "Choose USD or LBP" }),
};

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
