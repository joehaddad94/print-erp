import type { ReactNode } from "react";
import { Badge, Card, EmptyState, PageHeader, Panel } from "@/components/ui";
import { Link } from "@/components/ui/link";
import { db } from "@/db";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/money";
import { requireOwner } from "@/server/auth/session";
import { costWalkthrough } from "@/server/costs/walkthrough";

const usd = (n: number | null | undefined, digits?: number) =>
  n == null ? "—" : digits ? `$${n.toFixed(digits)}` : formatMoney(n, "USD");
const g = (n: number) => `${Number(n.toFixed(1)).toLocaleString("en-US")} g`;
const pct = (n: number) => `${Number(n.toFixed(1))}%`;
const hrs = (h: number) => `${Number(h.toFixed(2))} h`;

type Kind = "set" | "log" | "calc";
const KIND: Record<Kind, string> = {
  set: "border-transparent bg-action-soft [&_.tl]:text-action",
  log: "border-transparent bg-info-bg [&_.tl]:text-info",
  calc: "border-dashed border-border-strong bg-surface",
};

/** One value in a formula. A link when it can be changed somewhere (the step says where). */
function T({ label, value, kind, href }: { label: string; value: string; kind: Kind; href?: string }) {
  const body = (
    <>
      <span className="tl text-xs whitespace-nowrap text-ink-muted">{label}</span>
      <span className="text-sm font-semibold whitespace-nowrap tabular-nums">{value}</span>
    </>
  );
  const cls = cn("flex min-h-tap flex-col justify-center rounded-md border px-2.5 py-1.5 text-ink", KIND[kind]);
  return href ? (
    <Link href={href} className={cn(cls, "hover:outline-2 hover:outline-action")}>
      {body}
    </Link>
  ) : (
    <span className={cls}>{body}</span>
  );
}
const Op = ({ children }: { children: string }) => (
  <span aria-hidden className="flex items-center px-0.5 text-md text-ink-muted">
    {children}
  </span>
);
function R({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex min-h-tap flex-col justify-center rounded-md bg-ink px-3 py-1.5 text-surface">
      <span className="text-xs whitespace-nowrap">{label}</span>
      <span className="text-md font-semibold whitespace-nowrap tabular-nums">{value}</span>
    </span>
  );
}
const Eq = ({ children, label }: { children: ReactNode; label: string }) => (
  <div role="group" aria-label={label} className="flex flex-wrap items-stretch gap-1.5">
    {children}
  </div>
);
const Note = ({ children }: { children: ReactNode }) => <p className="text-xs text-ink-muted">{children}</p>;

function Step({
  n,
  title,
  why,
  where,
  children,
}: {
  n: number;
  title: string;
  why: string;
  where: ReactNode;
  children: ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <span
        aria-hidden
        className="grid size-8 shrink-0 place-items-center rounded-full bg-rail text-sm font-semibold text-rail-strong"
      >
        {n}
      </span>
      <Card className="flex min-w-0 flex-1 flex-col gap-2.5">
        <div>
          <h2 className="text-md font-semibold">
            <span className="sr-only">Step {n}: </span>
            {title}
          </h2>
          <p className="text-sm text-ink-muted">{why}</p>
        </div>
        {children}
        <p className="border-t border-border pt-2.5 text-xs text-ink-muted">Changed in: {where}</p>
      </Card>
    </li>
  );
}

/** R9 How costs work: every cost the app works out, in order, using the latest real print. View only. */
export default async function CostsPage() {
  await requireOwner();
  const w = await costWalkthrough(db());
  const j = w.job;
  return (
    <div className="flex max-w-content flex-col gap-5">
      <PageHeader
        title="How costs work"
        badges={<Badge>Owner only</Badge>}
        description="Every cost the app works out, in the order it happens, using your latest finished print as the example. View only: each step says where its numbers are changed."
      />
      <Card>
        <ul aria-label="Legend" className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-ink-muted">
          <li className="flex items-center gap-1.5">
            <i className="size-3 rounded-sm bg-action-soft outline outline-action" />
            You set it (click to open where)
          </li>
          <li className="flex items-center gap-1.5">
            <i className="size-3 rounded-sm bg-info-bg outline outline-info" />
            Typed when you log
          </li>
          <li className="flex items-center gap-1.5">
            <i className="size-3 rounded-sm border border-dashed border-border-strong" />
            From an earlier step
          </li>
          <li className="flex items-center gap-1.5">
            <i className="size-3 rounded-sm bg-ink" />
            Result
          </li>
        </ul>
      </Card>
      {!j ? (
        <EmptyState title="No finished print with a full cost yet">
          Finish a print (with the electricity price, the printer&apos;s power and life, and a filament price set) and
          this page walks through its numbers.
        </EmptyState>
      ) : (
        <ol aria-label="Steps" className="flex flex-col gap-3">
          <Step
            n={1}
            title="Filament price per gram"
            why="Every purchase is averaged with what you already had, per material and colour."
            where={<b className="font-medium text-ink-soft">Purchases</b>}
          >
            {j.filaments.map((f) =>
              f.purchase ? (
                <Eq key={f.name} label={`${f.name} per gram`}>
                  <T
                    label="Had"
                    value={
                      f.purchase.hadGrams > 0 ? `${g(f.purchase.hadGrams)} at ${usd(f.purchase.hadAvg, 4)}` : "nothing"
                    }
                    kind="calc"
                  />
                  <Op>+</Op>
                  <T
                    label="Bought"
                    value={`${g(f.purchase.boughtGrams)} for ${usd(f.purchase.boughtUsd)}`}
                    kind="set"
                    href={f.purchase.expenseId ? `/expenses/${f.purchase.expenseId}` : "/purchases"}
                  />
                  <Op>÷</Op>
                  <T label="New total" value={g(f.purchase.hadGrams + f.purchase.boughtGrams)} kind="calc" />
                  <Op>=</Op>
                  <R label={`${f.name}, per gram`} value={usd(f.purchase.avgAfter, 4)} />
                </Eq>
              ) : (
                <Eq key={f.name} label={`${f.name} per gram`}>
                  <R label={`${f.name}, per gram at Start`} value={usd(f.perGram, 4)} />
                </Eq>
              ),
            )}
            <Note>Print #{j.id} used the price per gram on the day it started, even if you bought more since.</Note>
          </Step>

          <Step
            n={2}
            title="Printer cost per hour"
            why="Wear and tear: what the printer cost, spread over the hours you expect it to last."
            where={<b className="font-medium text-ink-soft">Machines</b>}
          >
            <Eq label="Printer cost per hour">
              <T label="Printer price" value={usd(j.machine.priceUsd)} kind="set" href={`/machines/${j.machine.id}`} />
              <Op>÷</Op>
              <T
                label="Expected life"
                value={j.machine.lifeHours == null ? "—" : `${j.machine.lifeHours.toLocaleString("en-US")} h`}
                kind="set"
                href={`/machines/${j.machine.id}`}
              />
              <Op>=</Op>
              <R label={`${j.machine.name}, per hour`} value={usd(j.perHour, 3)} />
            </Eq>
          </Step>

          <Step
            n={3}
            title="Cost of one print"
            why={`Print #${j.id}, ${hrs(j.hours)}. Filament, plus electricity, plus printer wear.`}
            where={
              <>
                <b className="font-medium text-ink-soft">Settings</b> (electricity),{" "}
                <b className="font-medium text-ink-soft">Machines</b> (power), the print itself (time, grams)
              </>
            }
          >
            {j.filaments.map((f) => (
              <Eq key={f.name} label={`Filament cost, ${f.name}`}>
                <T label="Filament used" value={g(f.grams)} kind="log" href={`/print/${j.id}`} />
                <Op>×</Op>
                <T label="Per gram (1)" value={usd(f.perGram, 4)} kind="calc" />
                <Op>=</Op>
                <R label="Filament" value={usd(f.grams * f.perGram)} />
              </Eq>
            ))}
            <Eq label="Electricity cost">
              <T label="Printer power" value={`${j.powerKw ?? "—"} kW`} kind="set" href={`/machines/${j.machine.id}`} />
              <Op>×</Op>
              <T label="Print time" value={hrs(j.hours)} kind="log" href={`/print/${j.id}`} />
              <Op>×</Op>
              <T label="Electricity" value={`${usd(j.kwh)} / kWh`} kind="set" href="/settings" />
              <Op>=</Op>
              <R label="Electricity" value={usd(j.electricityUsd)} />
            </Eq>
            <Eq label="Printer wear">
              <T label="Print time" value={hrs(j.hours)} kind="log" href={`/print/${j.id}`} />
              <Op>×</Op>
              <T label="Per hour (2)" value={usd(j.perHour, 3)} kind="calc" />
              <Op>=</Op>
              <R label="Printer wear" value={usd(j.wearUsd)} />
            </Eq>
            <CostSplit filament={j.filamentUsd} electricity={j.electricityUsd} wear={j.wearUsd} total={j.total} />
            <Note>
              Stopped early? Filament = file grams × how far it got (e.g. 46 g × 60% = 27.6 g), unless you weighed it.
              If any value is missing, the print shows &quot;Cost incomplete&quot; instead of a guess.
            </Note>
          </Step>

          <Step
            n={4}
            title="Split between the items on the plate"
            why="The print cost is shared by weight, so heavier pieces carry more of it."
            where={
              <>
                <b className="font-medium text-ink-soft">Recipe</b> (grams per piece, typed at import)
              </>
            }
          >
            <Eq label="Split by weight">
              {j.items.map((i, k) => (
                <span key={i.lineId} className="contents">
                  {k > 0 ? <Op>+</Op> : null}
                  <T
                    label={i.name}
                    value={`${i.planned} × ${g(i.gramsPerPiece)} = ${g(i.planned * i.gramsPerPiece)}`}
                    kind="set"
                    href={`/recipes/${j.recipeId}`}
                  />
                </span>
              ))}
              <Op>→</Op>
              {j.items.map((i) => (
                <R key={i.lineId} label={`${i.name} gets ${pct(i.gramsShare * 100)}`} value={usd(i.share)} />
              ))}
            </Eq>
          </Step>

          <Step
            n={5}
            title="Cost per good piece"
            why="Failed pieces are paid for by the good ones. How depends on how many prints you have logged."
            where={
              <>
                <b className="font-medium text-ink-soft">Settings</b> (allowance %, and after how many prints to switch)
              </>
            }
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Mode
                on={j.method === "allowance"}
                title="Allowance"
                badge={
                  j.method === "allowance"
                    ? `In use · ${Math.min(w.finishedPrints, w.settings.actualAfter)} of ${w.settings.actualAfter} prints`
                    : `Until print ${w.settings.actualAfter}`
                }
              >
                <Eq label="Allowance method">
                  <T label={`${j.first.name} (${j.first.planned})`} value={usd(j.first.share)} kind="calc" />
                  <Op>÷</Op>
                  <T
                    label={`Planned × (1 − ${pct(j.allowancePct)})`}
                    value={String(Number((j.first.planned * (1 - j.allowancePct / 100)).toFixed(2)))}
                    kind="set"
                    href="/settings"
                  />
                  <Op>=</Op>
                  <R label="Per piece" value={usd(j.first.share / (j.first.planned * (1 - j.allowancePct / 100)))} />
                </Eq>
                <Note>
                  Too few prints to know your real failure rate, so every piece carries a {pct(j.allowancePct)} cushion,
                  even on a perfect print.
                </Note>
              </Mode>
              <Mode
                on={j.method === "actual"}
                title="Actual"
                badge={j.method === "actual" ? "In use" : `From print ${w.settings.actualAfter + 1}`}
              >
                <Eq label="Actual method">
                  <T label={`${j.first.name} (${j.first.planned})`} value={usd(j.first.share)} kind="calc" />
                  <Op>÷</Op>
                  <T
                    label="Good pieces"
                    value={`${j.first.good} of ${j.first.planned}`}
                    kind="log"
                    href={`/print/${j.id}`}
                  />
                  <Op>=</Op>
                  <R label="Per piece" value={j.first.good ? usd(j.first.share / j.first.good) : "all waste"} />
                </Eq>
                <Note>Real failures only. A bad piece&apos;s share moves onto the good pieces of the same item.</Note>
              </Mode>
            </div>
            <Note>
              Waste is shown separately (here {usd(j.waste)} on this print) so you can see what failures cost. It is not
              charged twice.
            </Note>
          </Step>

          <Step
            n={6}
            title="Average cost in stock"
            why="Each batch that goes to stock is averaged with what is already there. Assembled products add up their parts."
            where={
              <>
                nothing directly; it follows steps 1 to 5 and <b className="font-medium text-ink-soft">Product parts</b>
              </>
            }
          >
            {j.stock ? (
              <Eq label="Average cost in stock">
                <T label="In stock" value={`${j.stock.had} at ${usd(j.stock.hadAvg)}`} kind="calc" />
                <Op>+</Op>
                <T label={`From print #${j.id}`} value={`${j.stock.added} at ${usd(j.stock.addedCost)}`} kind="calc" />
                <Op>=</Op>
                <R label={`${j.stock.name}, each`} value={usd(j.stock.avgAfter)} />
              </Eq>
            ) : (
              <Note>This print put nothing into stock, so the average did not move.</Note>
            )}
            <Note>Adjust stock writes off removed pieces or grams at this average.</Note>
          </Step>

          <Step
            n={7}
            title="Profit on a sale"
            why="When an order is delivered, each line keeps the cost it had that day, so later price changes never rewrite old profit."
            where={
              <>
                <b className="font-medium text-ink-soft">Order</b> (price, rate),{" "}
                <b className="font-medium text-ink-soft">Product</b> (box),{" "}
                <b className="font-medium text-ink-soft">Recipe</b> (hands-on minutes)
              </>
            }
          >
            {w.sale ? (
              <>
                <Eq label="Profit">
                  <Op>(</Op>
                  <T label="Price each" value={usd(w.sale.priceUsd)} kind="log" href={`/orders/${w.sale.orderId}`} />
                  <Op>−</Op>
                  <T label="Stock cost (6)" value={usd(w.sale.unitCost)} kind="calc" />
                  <Op>−</Op>
                  <T label="Box" value={usd(w.sale.packaging)} kind="set" />
                  <Op>)</Op>
                  <Op>×</Op>
                  <T label="Qty" value={String(w.sale.qty)} kind="log" href={`/orders/${w.sale.orderId}`} />
                  <Op>=</Op>
                  <R label={`Profit, ${w.sale.name}`} value={usd(w.sale.profit)} />
                </Eq>
                {w.sale.minutes ? (
                  <Eq label="Profit per hour">
                    <T label="Profit" value={usd(w.sale.profit)} kind="calc" />
                    <Op>÷</Op>
                    <T label="Your time" value={`${Number(w.sale.minutes.toFixed(1))} min`} kind="set" />
                    <Op>=</Op>
                    <R label="Profit per hour of your time" value={usd(w.sale.perHour)} />
                  </Eq>
                ) : null}
                <Note>
                  From order #{w.sale.orderId}.{" "}
                  {w.sale.currency === "LBP" ? "LBP prices are turned into USD at the rate typed on that order. " : ""}
                  Delivery charges are not part of it.
                </Note>
              </>
            ) : (
              <Note>No delivered order yet. Once one is delivered, its profit is worked through here.</Note>
            )}
          </Step>
        </ol>
      )}
      <Panel title="Left out of the cost on purpose" titleId="costs-left-out">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          {[
            ["Your time", "Shown as profit per hour instead of a wage in the cost."],
            ["Delivery", "The driver keeps the delivery charge. Not in totals or profit."],
            ["Monthly expenses", "Rent, internet, subscriptions. Shown in Expenses, not spread over pieces."],
            [
              "Generator bill",
              w.settings.kwh == null
                ? "Already inside the electricity price per kWh, so it is not counted again."
                : `Already inside the ${usd(w.settings.kwh)} per kWh, so it is not counted again.`,
            ],
          ].map(([t, d]) => (
            <div key={t}>
              <dt className="font-medium">{t}</dt>
              <dd className="text-ink-muted">{d}</dd>
            </div>
          ))}
        </dl>
      </Panel>
      <Panel title="Rules every calculation follows" titleId="costs-rules">
        <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm">
          <li>
            Full precision inside, rounded only on screen. Totals can differ by a cent from adding up rounded lines.
          </li>
          <li>
            A missing input never becomes a guess: the print says &quot;Cost incomplete&quot; and names what is missing.
          </li>
          <li>A print keeps the prices it started with. Changing Settings only affects new prints.</li>
          <li>
            Every change to an input is in{" "}
            <Link
              href="/history"
              className="inline-flex min-h-tap items-center font-medium text-action underline lg:min-h-6"
            >
              Change history
            </Link>
            .
          </li>
        </ul>
      </Panel>
    </div>
  );
}

function Mode({ on, title, badge, children }: { on: boolean; title: string; badge: string; children: ReactNode }) {
  return (
    <div className={cn("flex flex-col gap-2 rounded-md p-3", on ? "border-2 border-action" : "border border-border")}>
      <h3 className="flex flex-wrap items-center gap-2 text-sm font-semibold">
        {title}
        <Badge tone={on ? "success" : "neutral"}>{badge}</Badge>
      </h3>
      {children}
    </div>
  );
}

function CostSplit({
  filament,
  electricity,
  wear,
  total,
}: {
  filament: number;
  electricity: number;
  wear: number;
  total: number;
}) {
  const parts = [
    { label: "Filament", v: filament, cls: "bg-action" },
    { label: "Electricity", v: electricity, cls: "bg-warning" },
    { label: "Wear", v: wear, cls: "bg-ink-soft" },
  ];
  const sum = filament + electricity + wear || 1;
  const p = (v: number) => Math.round((v / sum) * 100);
  return (
    <div className="flex flex-col gap-1.5">
      <div
        role="img"
        aria-label={`Print cost ${usd(total)}: ${parts.map((x) => `${x.label.toLowerCase()} ${p(x.v)}%`).join(", ")}`}
        className="flex h-3 overflow-hidden rounded-sm"
      >
        {parts.map((x) => (
          <div key={x.label} className={x.cls} style={{ flexGrow: x.v }} />
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="flex flex-wrap gap-x-3 text-ink-muted">
          {parts.map((x) => (
            <span key={x.label} className="inline-flex items-center gap-1.5">
              <i className={cn("size-2.5 rounded-sm", x.cls)} />
              {x.label} {usd(x.v)}
            </span>
          ))}
        </span>
        <b className="font-semibold">Print cost {usd(total)}</b>
      </div>
    </div>
  );
}
