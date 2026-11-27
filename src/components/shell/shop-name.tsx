import { connection } from "next/server";
import { db } from "@/db";
import { appDefaults } from "@/server/settings/service";

/** Settings › Defaults › Shop name, in the sidebar and on the sign-in page (inside a Suspense). */
export async function ShopName() {
  await connection();
  return (await appDefaults(db())).shopName;
}
