/**
 * R5 phones: typed any way, saved as E.164 (+96170123456), shown as +961 70 123 456.
 * Lebanon is the default country; a number for another country starts with + (or 00).
 */
export type PhoneResult = { ok: true; e164: string } | { ok: false; error: string };

export const PHONE_HINT =
  "Type it any way: 70123456, 070 123 456 or +961 70 123 456. For another country, start with +.";

export function normalizePhone(input: string): PhoneResult {
  const raw = input.trim();
  const d = raw.replace(/\D/g, "");
  const bad: PhoneResult = {
    ok: false,
    error: "Enter a Lebanese number like 70 123 456, or start with + for another country.",
  };
  if (!d || /[^\d\s+().-]/.test(raw) || raw.indexOf("+") > 0) return bad;
  if (raw.startsWith("+")) return /^\d{8,15}$/.test(d) ? { ok: true, e164: `+${d}` } : bad;
  if (/^00\d{8,15}$/.test(d)) return { ok: true, e164: `+${d.slice(2)}` };
  if (/^961\d{7,8}$/.test(d)) return { ok: true, e164: `+${d}` };
  const national = d.replace(/^0/, "");
  if (/^\d{7,8}$/.test(national)) return { ok: true, e164: `+961${national}` };
  return bad;
}

/** +96170123456 → "+961 70 123 456"; +9613123456 → "+961 3 123 456"; other countries as stored. */
export function formatPhone(e164: string | null | undefined): string {
  if (!e164) return "";
  const m = /^\+961(\d{1,2})(\d{3})(\d{3})$/.exec(e164);
  return m ? `+961 ${m[1]} ${m[2]} ${m[3]}` : e164;
}

/** wa.me link for a stored phone (digits only). */
export function whatsappUrl(e164: string): string {
  return `https://wa.me/${e164.replace(/\D/g, "")}`;
}
