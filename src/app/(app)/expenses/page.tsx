import { Icon } from "@/components/shell/icons";
import { StatStrip } from "@/components/money/month-stats";
import { PAID_WITH } from "@/components/expenses/paid-with";
import {
  Badge,
  ColumnsMenu,
  DataTable,
  EditedMarker,
  EmptyState,
  FilterBar,
  Money,
  PageHeader,
  Panel,
  buttonClass,
  matches,
  type Column,
} from "@/components/ui";
import { Link } from "@/components/ui/link";
import { db } from "@/db";
import { formatMoney } from "@/lib/money";
import { requireUser } from "@/server/auth/session";
import { CATEGORY_LABELS, RUNNING_CATEGORIES } from "@/server/expenses/schema";
import { listExpenses } from "@/server/expenses/service";

type Row = Awaited<ReturnType<typeof listExpenses>>[number];
const usd = (n: number) => formatMoney(n, "USD");
const day = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const paidWith = (m: string | null) => PAID_WITH.find((p) => p.value === m)?.label ?? "—";
const monthKey = (offset = 0) => {
  const d = new Date(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Beirut" }) + "T12:00:00Z");
  d.setUTCMonth(d.getUTCMonth() - offset, 1);
  return d.toISOString().slice(0, 7);
};

/** R7 Expenses: running costs that don't become stock (generator, internet, ads, tools). */
export default async function ExpensesPage({ searchParams }: PageProps<"/expenses">) {
  await requireUser();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : undefined;
  const all = (await listExpenses(db())).filter((e) => !e.isPurchase);
  const cat = RUNNING_CATEGORIES.find((x) => x === sp.category);
  const found = all.filter((e) =>
    matches(q, e.description, CATEGORY_LABELS[e.category], e.paidTo, e.notes, e.supplierName),
  );
  const rows = cat ? found.filter((e) => e.category === cat) : found;
  const usdOf = (e: Row) => e.amount * e.rateToUsd;
  const inMonth = (k: string) => all.filter((e) => e.spentOn.startsWith(k));
  const now = inMonth(monthKey());
  const last3 = [1, 2, 3].map((k) => inMonth(monthKey(k)).reduce((s, e) => s + usdOf(e), 0));
  const monthly = now.filter((e) => e.repeatsMonthly);
  const columns: Column<Row>[] = [
    { key: "date", header: "Date", cell: (e) => day(e.spentOn) },
    {
      key: "what",
      header: "What",
      cell: (e) => (
        <span className="flex flex-wrap items-center gap-2 font-medium">
          {e.description ?? CATEGORY_LABELS[e.category]}
          <EditedMarker at={e.editedAt} />
        </span>
      ),
    },
    { key: "category", header: "Category", cell: (e) => <Badge>{CATEGORY_LABELS[e.category]}</Badge> },
    { key: "usd", header: "USD", numeric: true, cell: (e) => usd(usdOf(e)) },
    {
      key: "paid",
      header: "Paid",
      numeric: true,
      cell: (e) => <Money amount={e.amount} currency={e.currency} rateToUsd={e.rateToUsd} />,
    },
    { key: "with", header: "Paid with", cell: (e) => paidWith(e.paymentMethod) },
    { key: "to", header: "Paid to", cell: (e) => e.paidTo ?? "—" },
    { key: "repeats", header: "Repeats", cell: (e) => (e.repeatsMonthly ? "Monthly" : "—") },
    { key: "notes", header: "Notes", truncate: true, cell: (e) => e.notes ?? "—" },
  ];
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Expenses"
        description="Running costs that don't become stock: generator, internet, ads, tools."
        action={
          <Link href="/expenses/new" className={buttonClass("primary")}>
            <Icon name="plus" size={15} />
            Add expense
          </Link>
        }
      />
      <StatStrip
        items={[
          {
            label: "This month",
            value: usd(now.reduce((s, e) => s + usdOf(e), 0)),
            note: `${now.length} expense${now.length === 1 ? "" : "s"}`,
          },
          {
            label: "Monthly, repeating",
            value: usd(monthly.reduce((s, e) => s + usdOf(e), 0)),
            note: monthly.map((e) => e.description ?? CATEGORY_LABELS[e.category]).join(", ") || "none",
          },
          { label: "Average per month", value: usd(last3.reduce((a, b) => a + b, 0) / 3), note: "last 3 months" },
          {
            label: "Already in print cost",
            value: usd(now.filter((e) => e.category === "electricity").reduce((s, e) => s + usdOf(e), 0)),
            note: "generator and electricity",
          },
        ]}
      />
      {all.length ? (
        <FilterBar
          base="/expenses"
          q={q}
          param="category"
          current={cat}
          placeholder="Search"
          searchLabel="Search expenses"
          right={
            <span className="hidden lg:block">
              <ColumnsMenu
                tableId="expenses"
                bordered
                pinned={["date"]}
                columns={columns.map(({ key, header }) => ({ key, header }))}
              />
            </span>
          }
          options={[
            { key: "", label: "All", count: found.length },
            ...RUNNING_CATEGORIES.filter((k) => found.some((e) => e.category === k)).map((k) => ({
              key: k,
              label: CATEGORY_LABELS[k],
              count: found.filter((e) => e.category === k).length,
            })),
          ]}
        />
      ) : null}
      {all.length === 0 ? (
        <EmptyState title="No expenses yet">
          Running costs like the generator, internet or ads. Buying filament, packaging or a machine? Use Add purchase
          instead, so it goes into stock.
        </EmptyState>
      ) : (
        <Panel title="Expenses" titleId="expenses" count={rows.length} flush>
          <DataTable
            id="expenses"
            label="Expenses"
            wide
            menuOutside
            empty={q ? `Nothing matches “${q}”.` : "None in this category."}
            columns={columns}
            rows={rows}
            rowKey={(e) => e.id}
            rowHref={(e) => `/expenses/${e.id}`}
            phoneRow={(e) => ({
              title: e.description ?? CATEGORY_LABELS[e.category],
              subtitle: [day(e.spentOn), CATEGORY_LABELS[e.category], e.paidTo, e.repeatsMonthly ? "monthly" : null]
                .filter(Boolean)
                .join(" · "),
              trailing: <Money amount={e.amount} currency={e.currency} rateToUsd={e.rateToUsd} />,
              badge: e.editedAt ? <EditedMarker at={e.editedAt} /> : undefined,
            })}
          />
        </Panel>
      )}
    </div>
  );
}
