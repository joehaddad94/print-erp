export const CURRENCIES = ["USD", "LBP"] as const;
export type Currency = (typeof CURRENCIES)[number];

const formatters: Record<Currency, Intl.NumberFormat> = {
  USD: new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }),
  LBP: new Intl.NumberFormat("en-US", { style: "currency", currency: "LBP", maximumFractionDigits: 0 }),
};

export function formatMoney(amount: number, currency: Currency): string {
  return formatters[currency].format(amount);
}

/** rate_to_usd for an LBP entry, from the settings' LBP-per-USD rate (spec: Lebanon-specific fields). */
export function rateToUsdFromLbpRate(lbpPerUsd: number): number {
  if (!(lbpPerUsd > 0)) throw new RangeError("LBP rate must be positive");
  return 1 / lbpPerUsd;
}

export function toUsd(amount: number, rateToUsd: number): number {
  return amount * rateToUsd;
}
