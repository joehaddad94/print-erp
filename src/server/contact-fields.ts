import { z } from "zod";
import { normalizePhone } from "@/lib/phone";
import { f } from "@/server/form";

/** Shared contact fields for customers (R5) and suppliers (R7). */
export const contact = {
  phone: () =>
    f.optionalText(40).transform((v, ctx) => {
      if (v == null) return null;
      const r = normalizePhone(v);
      if (r.ok) return r.e164;
      ctx.addIssue({ code: "custom", message: r.error });
      return z.NEVER;
    }),
  email: () =>
    f
      .optionalText(120)
      .refine((v) => v == null || z.email().safeParse(v).success, "Enter an email like name@example.com"),
  url: (max = 500) =>
    f
      .optionalText(max)
      .refine((v) => v == null || /^https?:\/\/\S+$/.test(v), "Paste the whole link, starting with https://"),
};
