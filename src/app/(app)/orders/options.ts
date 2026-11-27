import { db } from "@/db";
import { listCustomers } from "@/server/orders/service";
import { appDefaults, currentSettings } from "@/server/settings/service";

export async function orderFormOptions() {
  const [customers, settings, defs] = await Promise.all([
    listCustomers(db()),
    currentSettings(db()),
    appDefaults(db()),
  ]);
  const rate = settings.usd_lbp_rate;
  return {
    customers: customers.map((c) => ({ value: String(c.id), label: c.name })),
    lbpRate: typeof rate === "number" ? String(rate) : undefined,
    currency: defs.currency,
  };
}
