"use client";

import { useActionState, useId, useState } from "react";
import { Badge, Button, Callout, Field, Input } from "@/components/ui";
import { Segmented } from "@/components/ui/segmented";
import { formatDuration } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import type { FormState } from "@/server/form";
import { computeFinish, type JobForFinish } from "@/server/printing/compute";

type Item = { id: number; name: string; qtyPlanned: number };
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
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  job: JobForFinish;
  estimateHours: number | null;
  items: Item[];
  filaments: Filament[];
  defaults: FinishDefaults;
  submitLabel: string;
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
  return (
    <form action={formAction} noValidate className="grid items-start gap-5 lg:grid-aside">
      <div className="flex min-w-0 flex-col gap-4">
        {state.error ? <Callout tone="danger">{state.error}</Callout> : null}
        <input type="hidden" name="hoursSource" value={source} />

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
          label="Print time (hours)"
          error={err("hours")}
          hint={`${HOURS_LABEL[source]} · ${formatDuration(h * 3600)}`}
        >
          <div className="flex flex-wrap items-center gap-2">
            <Input
              id={fid("hours")}
              name="hours"
              inputMode="decimal"
              autoComplete="off"
              value={hours}
              invalid={!!err("hours")}
              onChange={(e) => {
                setHours(e.target.value);
                setSource("entered");
              }}
              className="flex-1 tabular-nums"
            />
            {estimateHours != null ? (
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
            ) : null}
          </div>
        </Field>

        {ran ? (
          <input type="hidden" name="stoppedAtPct" value="100" />
        ) : (
          <div className="flex flex-col gap-3 rounded-md border border-warning/40 bg-warning-bg/40 p-3">
            <Field id={fid("stoppedAtPct")} label="How far it got (%)" error={err("stoppedAtPct")}>
              <Input
                id={fid("stoppedAtPct")}
                name="stoppedAtPct"
                inputMode="decimal"
                value={stopped}
                invalid={!!err("stoppedAtPct")}
                onChange={(e) => setStopped(e.target.value)}
              />
            </Field>
            <label className="flex min-h-control items-center gap-3 text-md">
              <input
                type="checkbox"
                name="powerCut"
                defaultChecked={v("powerCut", defaults.powerCut ? "on" : "") === "on"}
                className="size-control shrink-0 accent-action"
              />
              Power cut during the print
            </label>
            <Field id={fid("failureReason")} label="What went wrong" hint="Optional.">
              <Input
                id={fid("failureReason")}
                name="failureReason"
                defaultValue={v("failureReason", defaults.failureReason)}
              />
            </Field>
          </div>
        )}

        <fieldset className="flex flex-col gap-3 rounded-md border border-border p-3">
          <legend className="px-1 text-sm font-semibold">Goes to stock</legend>
          <p className="-mt-1 text-sm text-ink-muted">Good pieces only. The rest counts as waste.</p>
          {items.map((i) => (
            <Field
              key={i.id}
              id={fid(`good-${i.id}`)}
              label={`${i.name} (of ${i.qtyPlanned})`}
              error={err(`good-${i.id}`)}
            >
              <Input
                id={fid(`good-${i.id}`)}
                name={`good-${i.id}`}
                inputMode="numeric"
                value={good[i.id]}
                invalid={!!err(`good-${i.id}`)}
                onChange={(e) => setGood((g) => ({ ...g, [i.id]: e.target.value }))}
              />
            </Field>
          ))}
        </fieldset>

        <fieldset className="flex flex-col gap-3 rounded-md border border-border p-3">
          <legend className="px-1 text-sm font-semibold">Filament used</legend>
          {filaments.map((f) => (
            <Field
              key={f.id}
              id={fid(`weighed-${f.id}`)}
              label={`${f.name} used, weighed (g)`}
              hint={
                f.fileGrams != null
                  ? `Optional. Leave empty to use ${grams(f.fileGrams * (pct > 0 && pct <= 100 ? pct / 100 : 1))} g from the file${pct > 0 && pct < 100 ? ` (${pct}% of it)` : ""}.`
                  : "Optional. Leave empty to use the recipe's grams."
              }
              error={err(`weighed-${f.id}`)}
            >
              <Input
                id={fid(`weighed-${f.id}`)}
                name={`weighed-${f.id}`}
                inputMode="decimal"
                value={weighed[f.id]}
                invalid={!!err(`weighed-${f.id}`)}
                onChange={(e) => setWeighed((w) => ({ ...w, [f.id]: e.target.value }))}
              />
            </Field>
          ))}
        </fieldset>

        <Button type="submit" block pending={pending}>
          {pending ? "Saving…" : submitLabel}
        </Button>
      </div>

      <aside
        aria-label="Cost"
        className="flex flex-col gap-1.5 self-start rounded-lg border border-border bg-bg p-4 text-sm lg:sticky lg:top-4"
        aria-live="polite"
        data-testid="live-cost"
      >
        <h2 className="text-md font-semibold">Cost</h2>
        {live?.complete ? (
          <>
            <p className="flex flex-wrap items-center gap-2 font-bold">
              Job cost {usd(live.total)} {live.estimated ? <Badge tone="estimated">Estimated grams</Badge> : null}
            </p>
            {live.items.map((it, k) => (
              <p key={it.id}>
                {items[k]!.name}: {it.unitCost != null ? `${usd(it.unitCost)} each` : "nothing good"}
                {it.wasteCost > 0 ? ` · waste ${usd(it.wasteCost)}` : ""}
              </p>
            ))}
          </>
        ) : live ? (
          <p>Cost incomplete: it will be checked again when you save.</p>
        ) : (
          <p className="text-ink-muted">Enter the print time{ran ? "" : " and how far it got"}.</p>
        )}
      </aside>
    </form>
  );
}
