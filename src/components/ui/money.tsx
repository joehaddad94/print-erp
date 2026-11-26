import { formatMoney, type Currency } from "@/lib/money";

/** Amount with currency; LBP amounts also show their USD value at the stored rate. */
export function Money({
  amount,
  currency = "USD",
  rateToUsd,
}: {
  amount: number;
  currency?: Currency;
  rateToUsd?: number;
}) {
  return (
    <span className="font-medium tabular-nums">
      {formatMoney(amount, currency)}
      {currency !== "USD" && rateToUsd ? (
        <small className="block text-xs font-normal text-ink-muted">≈ {formatMoney(amount * rateToUsd, "USD")}</small>
      ) : null}
    </span>
  );
}
