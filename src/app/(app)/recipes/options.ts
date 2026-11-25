import { db } from "@/db";
import { listProducts, productLabel } from "@/server/products/service";
import { gramsTolerance } from "@/server/recipes/service";
import { blobAccess, storageMode } from "@/server/storage";

export async function importOptions() {
  const [products, tolerance] = await Promise.all([listProducts(db()), gramsTolerance(db())]);
  return {
    mode: storageMode(),
    access: blobAccess(),
    tolerance,
    products: products.map((p) => ({
      id: p.id,
      label: `${productLabel(p)}${p.kind === "part" ? " (part)" : ""}`,
    })),
  };
}
