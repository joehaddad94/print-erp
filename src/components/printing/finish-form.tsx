"use client";

import { useActionState, useId, useState } from "react";
import { Link } from "@/components/ui/link";
import { Icon } from "@/components/shell/icons";
import { Badge, Button, Callout, Card, Field, FormBar, Input, Panel, buttonClass } from "@/components/ui";
import { AffixInput } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { formatDuration } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import type { FormState } from "@/server/form";
import { computeFinish, type JobForFinish } from "@/server/printing/compute";

type Item = { id: number; name: string; qtyPlanned: number; kind?: string; gramsPerPiece?: number };
type Filament = {
  id: number;
  name: string;
  /** Grams the file (or override) planned for this filament. */ fileGrams?: number | null;
};
export type FinishDefaults = {
  hours: string;
  hoursSource: "gcode_estimate" | "confirmed" | "entered";
  stoppedAtPct: string;
  good: Record<number, string>;
  weighed: Record<number, string>;
  powerCut: boolean;
  failureReason: string;
};

const usd = (n: number) => formatMoney(n, "USD");
const grams = (n: number) => String(Number(n.toFixed(1)));
const stopped0 = (v: (k: string, f: string) => string, d: FinishDefaults) => v("stoppedAtPct", d.stoppedAtPct);
const num = (s: string | undefined) => (s == null || s.trim() === "" ? NaN : Number(s.replace(/,/g, "")));
const HOURS_LABEL = {
  gcode_estimate: "G-code estimate, not checked",
  confirmed: "Same as G-code (confirmed)",
  entered: "Entered by you",
} as const;

/**
 * Finish print (D20, D22, D23, D33): duration pre-filled from the G-code with a "Same as G-code"
 * chip (hours_source), good pieces per item, stopped at %, optional weighed grams, live cost.
 */
export function FinishForm({
  action,
  job,
  estimateHours,
  items,
  filaments,
  defaults,
  submitLabel,
  cancelHref = "/",
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  job: JobForFinish;
  estimateHours: number | null;
  items: Item[];
  filaments: Filament[];
  defaults: FinishDefaults;
  submitLabel: string;
  cancelHref?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const v = (k: string, fallback: string) => state.values?.[k] ?? fallback;
  const [hours, setHours] = useState(() => v("hours", defaults.hours));
  const [source, setSource] = useState(() => v("hoursSource", defaults.hoursSource) as FinishDefaults["hoursSource"]);
  const [stopped, setStopped] = useState(() => v("stoppedAtPct", defaults.stoppedAtPct));
  const [outcome, setOutcome] = useState<"ran" | "stopped">(() =>
    num(stopped0(v, defaults)) >= 100 ? "ran" : "stopped",
  );
  const [good, setGood] = useState(() =>
    Object.fromEntries(items.map((i) => [i.id, v(`good-${i.id}`, defaults.good[i.id] ?? String(i.qtyPlanned))])),
  );
  const [weighed, setWeighed] = useState(() =>
    Object.fromEntries(filaments.map((f) => [f.id, v(`weighed-${f.id}`, defaults.weighed[f.id] ?? "")])),
  );
  const err = (k: string) => state.fieldErrors?.[k];
  /** Unique per instance: hidden, still-mounted routes (React Activity) may hold another finish form. */
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const fid = (k: string) => `${k}-${uid}`;

  const h = num(hours);
  const pct = num(stopped);
  const live =
    h > 0 && pct > 0 && pct <= 100
      ? computeFinish(job, {
          hours: h,
          stoppedAtPct: pct,
          good: Object.fromEntries(items.map((i) => [i.id, num(good[i.id]) || 0])),
          weighed: Object.fromEntries(
            filaments.map((f) => [f.id, Number.isNaN(num(weighed[f.id])) ? null : num(weighed[f.id])]),
          ),
        })
      : null;

  const ran = outcome === "ran";
  const fileTime = estimateHours != null ? `From the file: ${formatDuration(estimateHours * 3600)}` : null;
  const goodTotal = live?.complete ? live.items.reduce((n, it) => n + it.good, 0) : null;
  const lost = live?.complete && !ran && goodTotal === 0;
  const kind = (k?: string) => (k === "part" ? "Part" : "Product");
  const costRows = live?.complete
    ? [
        [
          `Filament · ${grams(live.filaments.reduce((g, f) => g + f.grams, 0))} g${!ran && pct > 0 && pct < 100 ? ` (${pct}%)` : ""}`,
          usd(live.filament),
        ],
        [`Electricity · ${Number(h.toFixed(2))} h`, usd(live.electricity)],
        ["Machine wear", usd(live.wear)],
      ]
    : [];
  const costPanel = (
    <Panel title="Cost of this print" titleId={fid("cost")}>
      <div aria-live="polite" data-testid="live-cost" className="flex flex-col gap-2 text-md">
        {live?.complete ? (
          <>
            <dl className="flex flex-col divide-y divide-border">
              {costRows.map(([k, val]) => (
                <div key={k} className="flex justify-between gap-3 py-2">
                  <dt>{k}</dt>
                  <dd className="tabular-nums">{val}</dd>
                </div>
              ))}
              <div className="flex justify-between gap-3 py-2 font-bold">
                <dt>{lost ? "Lost when it stopped" : "Job cost"}</dt>
                <dd className="tabular-nums">{usd(live.total)}</dd>
              </div>
              {lost ? (
                <div className="flex justify-between gap-3 py-2">
                  <dt>Good pieces</dt>
                  <dd>None, nothing to stock</dd>
                </div>
              ) : (
                live.items.map((it, k) => (
                  <div key={it.id} className="flex justify-between gap-3 py-2">
                    <dt className="min-w-0 truncate">{items[k]!.name}</dt>
                    <dd className="shrink-0 tabular-nums">
                      {it.unitCost != null ? `${usd(it.unitCost)} each` : "nothing good"}
                      {it.wasteCost > 0 ? ` · waste ${usd(it.wasteCost)}` : ""}
                    </dd>
                  </div>
                ))
              )}
            </dl>
            {live.estimated ? (
              <div>
                <Badge tone="estimated">Estimated grams</Badge>
              </div>
            ) : null}
          </>
        ) : live ? (
          <p>Cost incomplete: it will be checked again when you save.</p>
        ) : (
          <p className="text-ink-muted">Enter the print time{ran ? "" : " and how far it got"}.</p>
        )}
      </div>
    </Panel>
  );
  return (
    <form action={formAction} noValidate className="grid items-start gap-5 lg:grid-aside">
      <div className="flex min-w-0 flex-col gap-4">
        {state.error ? <Callout tone="danger">{state.error}</Callout> : null}
        <input type="hidden" name="hoursSource" value={source} />

        <Card className="flex flex-col gap-4">
          <Segmented
            name={fid("outcome")}
            legend="How did it go?"
            defaultValue={outcome}
            options={[
              { value: "ran", label: "Ran to the end" },
              { value: "stopped", label: "Stopped early" },
            ]}
            onChange={(o) => {
              setOutcome(o as "ran" | "stopped");
              if (o === "stopped") {
                if (num(stopped) >= 100) setStopped("");
                setGood(Object.fromEntries(items.map((i) => [i.id, "0"])));
              } else {
                setStopped("100");
                setGood(Object.fromEntries(items.map((i) => [i.id, String(i.qtyPlanned)])));
              }
            }}
          />
          <Field
            id={fid("hours")}
            label="Print time"
            error={err("hours")}
            hint={
              source === "gcode_estimate" && fileTime ? `${fileTime} · ${HOURS_LABEL[source]}` : HOURS_LABEL[source]
            }
          >
            <div className="flex flex-wrap items-center gap-2 sm:max-w-sm">
              <AffixInput
                id={fid("hours")}
                name="hours"
                inputMode="decimal"
                autoComplete="off"
                suffix="hours"
                value={hours}
                invalid={!!err("hours")}
                onChange={(e) => {
                  setHours(e.target.value);
                  setSource("entered");
                }}
                className="tabular-nums"
              />
              {estimateHours != null && source !== "gcode_estimate" ? (
                <Button
                  variant="secondary"
                  aria-pressed={source === "confirmed"}
                  onClick={() => {
                    setHours(String(Number(estimateHours.toFixed(3))));
                    setSource("confirmed");
                  }}
                >
                  Same as G-code
                </Button>
              ) : estimateHours != null ? (
                <Button
                  variant="quiet"
                  onClick={() => {
                    setHours(String(Number(estimateHours.toFixed(3))));
                    setSource("confirmed");
                  }}
                >
                  Same as G-code
                </Button>
              ) : null}
            </div>
          </Field>

          {ran ? (
            <input type="hidden" name="stoppedAtPct" value="100" />
          ) : (
            <div className="flex flex-col gap-4">
              <div className="sm:max-w-xs">
                <Field
                  id={fid("stoppedAtPct")}
                  label="How far it got"
                  hint="The % on the printer screen when it stopped."
                  error={err("stoppedAtPct")}
                >
                  <AffixInput
                    id={fid("stoppedAtPct")}
                    name="stoppedAtPct"
                    inputMode="decimal"
                    suffix="%"
                    value={stopped}
                    invalid={!!err("stoppedAtPct")}
                    onChange={(e) => setStopped(e.target.value)}
                  />
                </Field>
              </div>
              <label className="flex min-h-control items-center gap-3 text-md">
                <input
                  type="checkbox"
                  name="powerCut"
                  defaultChecked={v("powerCut", defaults.powerCut ? "on" : "") === "on"}
                  className="size-control shrink-0 accent-action"
                />
                Power cut during the print
              </label>
              <Field id={fid("failureReason")} label="What went wrong" optional>
                <Input
                  id={fid("failureReason")}
                  name="failureReason"
                  placeholder="Spaghetti after layer 40, bed adhesion…"
                  defaultValue={v("failureReason", defaults.failureReason)}
                />
              </Field>
            </div>
          )}
        </Card>

        <Card className="flex flex-col gap-3">
          <h2 className="text-xs font-semibold tracking-wide text-ink-muted uppercase">Goes to stock</h2>
          <p className="text-sm text-ink-muted">
            One row per item on the plate, taken from the recipe. Lower a number for any piece that came out bad, even
            when the print ran to the end.
          </p>
          <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
            {items.map((i) => (
              <li key={i.id} className="flex flex-col gap-1 px-3 py-2">
                <div className="flex items-center gap-3">
                  <span
                    aria-hidden="true"
                    className="grid size-9 shrink-0 place-items-center rounded-md bg-surface-muted text-ink-muted"
                  >
                    <Icon name="products" size={16} />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <b className="truncate font-medium">{i.name}</b>
                    <span className="text-xs text-ink-muted">
                      {kind(i.kind)} · {i.qtyPlanned} on the plate
                      {i.gramsPerPiece ? ` · ${grams(i.gramsPerPiece)} g each` : ""}
                    </span>
                  </span>
                  <span className="w-28 shrink-0">
                    <AffixInput
                      id={fid(`good-${i.id}`)}
                      name={`good-${i.id}`}
                      aria-label={`${i.name}: good pieces (of ${i.qtyPlanned})`}
                      inputMode="numeric"
                      suffix={`of ${i.qtyPlanned}`}
                      value={good[i.id]}
                      invalid={!!err(`good-${i.id}`)}
                      onChange={(e) => setGood((g) => ({ ...g, [i.id]: e.target.value }))}
                      className="tabular-nums"
                    />
                  </span>
                </div>
                {err(`good-${i.id}`) ? (
                  <p id={`${fid(`good-${i.id}`)}-error`} role="alert" className="text-sm font-medium text-danger">
                    {err(`good-${i.id}`)}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
          {!ran ? (
            <Callout tone="info">
              <b>Pieces can still be good when it stopped early.</b> Starts at 0. If some pieces finished before it
              failed, type them here and they go to stock.
            </Callout>
          ) : null}
        </Card>

        <Card className="flex flex-col gap-3">
          <h2 className="text-xs font-semibold tracking-wide text-ink-muted uppercase">Filament used</h2>
          {filaments.map((f) => {
            const file = f.fileGrams != null ? grams(f.fileGrams * (pct > 0 && pct <= 100 ? pct / 100 : 1)) : null;
            return (
              <div key={f.id} className="sm:max-w-sm">
                <Field
                  id={fid(`weighed-${f.id}`)}
                  label={`${f.name}, weighed after`}
                  optional
                  hint={
                    file != null
                      ? `Leave empty to use ${file} g${pct > 0 && pct < 100 ? `: ${pct}% of the ${grams(f.fileGrams!)} g in the file` : " from the file"}.`
                      : "Leave empty to use the recipe's grams."
                  }
                  error={err(`weighed-${f.id}`)}
                >
                  <AffixInput
                    id={fid(`weighed-${f.id}`)}
                    name={`weighed-${f.id}`}
                    inputMode="decimal"
                    suffix="g"
                    placeholder={file ?? undefined}
                    value={weighed[f.id]}
                    invalid={!!err(`weighed-${f.id}`)}
                    onChange={(e) => setWeighed((w) => ({ ...w, [f.id]: e.target.value }))}
                  />
                </Field>
              </div>
            );
          })}
        </Card>
      </div>

      <aside className="flex min-w-0 flex-col lg:sticky lg:top-4 lg:col-start-2 lg:row-span-2 lg:row-start-1">
        {costPanel}
      </aside>

      <div className="min-w-0 lg:col-start-1">
        <FormBar
          primary={
            <Button type="submit" pending={pending}>
              {pending ? "Saving…" : submitLabel}
            </Button>
          }
          secondary={
            <Link href={cancelHref} className={buttonClass("secondary")}>
              Cancel
            </Link>
          }
        />
      </div>
    </form>
  );
}
