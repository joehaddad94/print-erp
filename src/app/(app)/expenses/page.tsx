import { Icon } from "@/components/shell/icons";
import { StatStrip } from "@/components/money/month-stats";
import { Pills } from "@/components/money/pills";
import {
  Badge,
  DataTable,
  EditedMarker,
  EmptyState,
  Money,
  PageHeader,
  Panel,
  buttonClass,
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
const monthKey = (offset = 0) => {
  const d = new Date(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Beirut" }) + "T12:00:00Z");
  d.setUTCMonth(d.getUTCMonth() - offset, 1);
  return d.toISOString().slice(0, 7);
};

/** R7 Expenses: running costs that don't become stock (generator, internet, ads, tools). */
export default async function ExpensesPage({ searchParams }: PageProps<"/expenses">) {
  await requireUser();
  const c = (await searchParams).category;
  const all = (await listExpenses(db())).filter((e) => !e.isPurchase);
  const cat = RUNNING_CATEGORIES.find((x) => x === c);
  const rows = cat ? all.filter((e) => e.category === cat) : all;
  const usdOf = (e: Row) => e.amount * e.rateToUsd;
  const inMonth = (k: string) => all.filter((e) => e.spentOn.startsWith(k));
  const now = inMonth(monthKey());
  const last3 = [1, 2, 3].map((k) => inMonth(monthKey(k)).reduce((s, e) => s + usdOf(e), 0));
  const monthly = now.filter((e) => e.repeatsMonthly);
  const columns: Column<Row>[] = [
    { key: "date", header: "Date", cell: (e) => e.spentOn },
    {
      key: "what",
      header: "What",
      cell: (e) => (
        <span className="flex flex-wrap items-center gap-2">
          <Link
            href={`/expenses/${e.id}`}
            className="inline-flex min-h-6 items-center font-medium text-action hover:underline"
          >
            {e.description ?? CATEGORY_LABELS[e.category]}
          </Link>
          <EditedMarker at={e.editedAt} />
        </span>
      ),
    },
    { key: "category", header: "Category", cell: (e) => <Badge>{CATEGORY_LABELS[e.category]}</Badge> },
    {
      key: "paid",
      header: "Paid",
      numeric: true,
      cell: (e) => <Money amount={e.amount} currency={e.currency} rateToUsd={e.rateToUsd} />,
    },
    { key: "to", header: "Paid to", lo: true, cell: (e) => e.paidTo ?? "—" },
    { key: "repeats", header: "Repeats", lo: true, cell: (e) => (e.repeatsMonthly ? "Monthly" : "—") },
    { key: "notes", header: "Notes", lo: true, truncate: true, cell: (e) => e.notes ?? "—" },
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
        ]}
      />
      <Pills current={cat} base="/expenses" options={RUNNING_CATEGORIES.map((k) => [k, CATEGORY_LABELS[k]])} />
      {rows.length === 0 ? (
        <EmptyState title="No expenses yet">
          Buying filament, packaging or a machine?{" "}
          <Link href="/purchases/new" className="text-action hover:underline">
            Add a purchase
          </Link>{" "}
          instead.
        </EmptyState>
      ) : (
        <Panel title="Expenses" titleId="expenses" count={rows.length} flush>
          <DataTable
            id="expenses"
            label="Expenses"
            wide
            columns={columns}
            rows={rows}
            rowKey={(e) => e.id}
            rowHref={(e) => `/expenses/${e.id}`}
            phoneRow={(e) => ({
              title: e.description ?? CATEGORY_LABELS[e.category],
              subtitle: [e.spentOn, CATEGORY_LABELS[e.category], e.paidTo, e.repeatsMonthly ? "monthly" : null]
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
