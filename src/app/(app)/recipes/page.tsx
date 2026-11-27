import { Icon } from "@/components/shell/icons";
import {
  DataTable,
  EmptyState,
  FilterBar,
  PageHeader,
  Panel,
  buttonClass,
  matches,
  type Column,
} from "@/components/ui";
import { Link } from "@/components/ui/link";
import { db } from "@/db";
import { formatDuration, shortDate } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { requireUser } from "@/server/auth/session";
import { recipeTable, type RecipeRow } from "@/server/recipes/catalogue";

const usd = (n: number) => formatMoney(n, "USD");
const muted = (s: string) => <span className="text-ink-muted">{s}</span>;
const grams = (g: number | null) => (g == null ? "—" : `${Math.round(g)} g`);

const columns: Column<RecipeRow>[] = [
  {
    key: "recipe",
    header: "Recipe",
    cell: (r) => (
      <>
        {r.name} <span className="text-sm font-normal text-ink-muted">v{r.version}</span>
      </>
    ),
  },
  { key: "makes", header: "Makes", lo: true, cell: (r) => r.makes || "—" },
  { key: "material", header: "Material", lo: true, cell: (r) => r.material ?? muted("—") },
  { key: "grams", header: "Filament", numeric: true, cell: (r) => grams(r.grams) },
  { key: "time", header: "Time", cell: (r) => formatDuration(r.estimatedSeconds) },
  {
    key: "cost",
    header: "Job cost",
    numeric: true,
    cell: (r) => (r.jobCostUsd == null ? muted("—") : usd(r.jobCostUsd)),
  },
  { key: "used", header: "Last used", lo: true, cell: (r) => (r.lastUsed ? shortDate(r.lastUsed) : muted("Never")) },
];

/** Recipes (prototype /recipes): one recipe per G-code file; a new file makes a new version. */
export default async function RecipesPage({ searchParams }: PageProps<"/recipes">) {
  await requireUser();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : undefined;
  const all = await recipeTable(db());
  const materials = [...new Set(all.map((r) => r.material).filter((m): m is string => !!m))].sort();
  const material = typeof sp.material === "string" && materials.includes(sp.material) ? sp.material : undefined;
  const found = all.filter((r) => matches(q, r.name, r.makes, r.material, r.fileName));
  const rows = found.filter((r) => !material || r.material === material);
  const add = (
    <Link href="/recipes/import" className={buttonClass("primary")}>
      <Icon name="upload" size={16} />
      Import G-code
    </Link>
  );
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Recipes"
        description="One recipe per G-code file. A new file makes a new version."
        action={add}
      />
      {all.length === 0 ? (
        <EmptyState title="No recipes yet">Import a .gcode file from your slicer.</EmptyState>
      ) : (
        <>
          <FilterBar
            base="/recipes"
            q={q}
            param="material"
            current={material}
            placeholder="Search recipes"
            options={[
              { key: "", label: "All", count: found.length },
              ...materials.map((m) => ({ key: m, label: m, count: found.filter((r) => r.material === m).length })),
            ]}
          />
          <Panel
            title={material ? `${material} recipes` : "All recipes"}
            titleId="recipes-table"
            count={rows.length}
            flush
          >
            <DataTable
              id="recipes"
              label="Recipes"
              columns={columns}
              rows={rows}
              rowKey={(r) => r.id}
              rowHref={(r) => `/recipes/${r.id}`}
              empty={q ? `Nothing matches “${q}”.` : "No recipes of this material."}
              phoneRow={(r) => ({
                title: `${r.name} · v${r.version}`,
                subtitle: [r.makes, grams(r.grams), formatDuration(r.estimatedSeconds)].filter(Boolean).join(" · "),
                trailing: r.jobCostUsd == null ? undefined : usd(r.jobCostUsd),
              })}
            />
          </Panel>
        </>
      )}
    </div>
  );
}
