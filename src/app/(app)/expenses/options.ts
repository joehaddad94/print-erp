import { db } from "@/db";
import { filamentsAndPackaging, listFilamentBrands } from "@/server/expenses/service";
import { appDefaults, numberSetting } from "@/server/settings/service";
import { listSuppliers } from "@/server/suppliers/service";

/** Picker options shared by the add and edit expense screens. */
export async function expenseFormOptions() {
  const [items, suppliers, lbp, brands, defs] = await Promise.all([
    filamentsAndPackaging(db()),
    listSuppliers(db()),
    numberSetting(db(), "usd_lbp_rate"),
    listFilamentBrands(db()),
    appDefaults(db()),
  ]);
  return {
    filaments: items.filter((i) => i.type === "filament").map((i) => ({ value: String(i.id), label: i.name })),
    packaging: items.filter((i) => i.type === "consumable").map((i) => ({ value: String(i.id), label: i.name })),
    suppliers: suppliers.map((s) => ({ value: String(s.id), label: s.name })),
    brands,
    lbpRate: lbp == null ? undefined : String(lbp),
    currency: defs.currency,
  };
}
