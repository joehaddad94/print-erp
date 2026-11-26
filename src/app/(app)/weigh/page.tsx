import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth/session";

/** R6: Weigh filament became Adjust stock → Weigh the spool. */
export default async function WeighPage() {
  await requireUser();
  redirect("/stock/adjust");
}
