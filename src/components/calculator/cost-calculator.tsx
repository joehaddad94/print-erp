"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { handOffFile } from "@/components/recipes/gcode-client";
import { formatDuration } from "@/lib/format";
import { Button, Callout, Card, Field, Input } from "@/components/ui";
import { jobCost, unitCost, type MissingInput } from "@/lib/cost";
import { GcodeFormatError, parseGcodeFile, type ParsedGcode } from "@/lib/gcode";
import { formatMoney } from "@/lib/money";
import type { CostInputs } from "@/server/calculator/service";

const num = (s: string) => (s.trim() === "" ? NaN : Number(s.replace(/,/g, "")));
const usd = (n: number) => formatMoney(n, "USD");

/**
 * D32: read a .gcode in the browser and show its cost. Nothing is saved or uploaded.
 * Same formula and inputs as a print started now.
 */
export function CostCalculator({ inputs }: { inputs: CostInputs }) {
  const router = useRouter();
  const fileId = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedGcode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filamentId, setFilamentId] = useState(String(inputs.filaments[0]?.id ?? ""));
  const [printerId, setPrinterId] = useState(String(inputs.printers[0]?.id ?? ""));
  const [grams, setGrams] = useState("");
  const [hours, setHours] = useState("");
  const [pieces, setPieces] = useState("");
  const [price, setPrice] = useState("");

  async function choose(f: File | null) {
    setError(null);
    setParsed(null);
    setFile(f);
    if (!f) return;
    try {
      const p = await parseGcodeFile(f);
      setParsed(p);
      setGrams(p.totalGrams != null ? String(Number(p.totalGrams.toFixed(2))) : "");
      setHours(p.estimatedSeconds != null ? String(Number((p.estimatedSeconds / 3600).toFixed(3))) : "");
      setPieces(String(p.objects.reduce((s, o) => s + o.count, 0) || 1));
      const material = p.material?.toLowerCase();
      const match = material && inputs.filaments.find((x) => x.name.toLowerCase().startsWith(material));
      if (match) setFilamentId(String(match.id));
    } catch (e) {
      setError(e instanceof GcodeFormatError ? e.message : "This file couldn't be read as G-code.");
    }
  }

  useEffect(() => {
    // A file chosen before the page finished loading (slow phones) is read once it has.
    const early = fileInput.current?.files?.[0];
    if (early) void Promise.resolve(early).then(choose);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filament = inputs.filaments.find((f) => String(f.id) === filamentId);
  const printer = inputs.printers.find((p) => String(p.id) === printerId);
  const g = num(grams);
  const h = num(hours);
  const q = Math.round(num(pieces));
  const valid = g > 0 && h > 0 && q > 0;

  const missingParts: ReactNode[] = [];
  const result = valid
    ? jobCost({
        filaments: [{ grams: g, costPerGramUsd: filament?.costPerGramUsd ?? null }],
        hours: h,
        powerKw: printer?.powerKw ?? null,
        kwhPriceUsd: inputs.kwhPriceUsd,
        machineCostPerHourUsd: printer?.costPerHourUsd ?? null,
      })
    : null;
  if (result && !result.complete) {
    for (const m of result.missing) missingParts.push(<MissingLink key={m} missing={m} printerId={printer?.id} />);
  }
  const perPiece =
    result?.complete === true
      ? unitCost({ share: result.total, planned: q, good: q, method: inputs.method, allowancePct: inputs.allowancePct })
      : null;
  const p = num(price);

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-4">
        <Field id={fileId} label="G-code file" hint="Read on this device only. Nothing is uploaded or saved.">
          <input
            ref={fileInput}
            id={fileId}
            type="file"
            accept=".gcode"
            onChange={(e) => void choose(e.target.files?.[0] ?? null)}
            className="min-h-tap w-full rounded-md border border-border bg-surface px-3 py-2.5 text-sm text-ink"
          />
        </Field>
        {error ? <Callout tone="danger">{error}</Callout> : null}
      </Card>

      {parsed ? (
        <>
          <Card className="flex flex-col gap-4">
            <p className="text-sm text-ink-muted">
              {parsed.material ?? "Unknown material"} · {formatDuration(parsed.estimatedSeconds)} ·{" "}
              {parsed.printerModel ?? "unknown printer"}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Select id="calc-filament" label="Filament" value={filamentId} onChange={setFilamentId}>
                {inputs.filaments.length === 0 ? <option value="">No filament bought yet</option> : null}
                {inputs.filaments.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </Select>
              <Select id="calc-printer" label="Printer" value={printerId} onChange={setPrinterId}>
                {inputs.printers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </Select>
              <NumberInput id="calc-grams" label="Grams" value={grams} onChange={setGrams} />
              <NumberInput id="calc-hours" label="Hours" value={hours} onChange={setHours} />
              <NumberInput id="calc-pieces" label="Pieces" value={pieces} onChange={setPieces} />
              <NumberInput id="calc-price" label="Your price per piece (USD)" value={price} onChange={setPrice} />
            </div>
          </Card>

          {!valid ? (
            <Callout tone="warning">Enter grams, hours and pieces above 0.</Callout>
          ) : result && !result.complete ? (
            <Callout tone="warning" title="Cost incomplete">
              <ul className="list-disc pl-5">{missingParts}</ul>
            </Callout>
          ) : result?.complete ? (
            <Card>
              <dl className="flex flex-col divide-y divide-border text-sm" aria-label="Cost">
                <Line label="Filament">{usd(result.filament)}</Line>
                <Line label="Electricity">{usd(result.electricity)}</Line>
                <Line label="Machine wear">{usd(result.wear)}</Line>
                <Line label="Job cost" strong>
                  {usd(result.total)}
                </Line>
                <Line
                  label={
                    inputs.method === "allowance"
                      ? `Cost per piece (incl. ${inputs.allowancePct}% failure allowance)`
                      : "Cost per piece"
                  }
                  strong
                >
                  {perPiece != null ? usd(perPiece) : "—"}
                </Line>
                {p > 0 && perPiece != null ? (
                  <>
                    <Line label="Profit per piece">{usd(p - perPiece)}</Line>
                    <Line label="Margin">{`${Math.round(((p - perPiece) / p) * 100)}%`}</Line>
                  </>
                ) : null}
              </dl>
              <p className="pt-2 text-xs text-ink-muted">Packaging is added when sold. Labour is not a cost (D24).</p>
            </Card>
          ) : null}

          <Button
            variant="secondary"
            block
            onClick={() => {
              if (!file) return;
              handOffFile(file);
              router.push("/recipes/import");
            }}
          >
            Save as recipe
          </Button>
        </>
      ) : null}
    </div>
  );
}

function MissingLink({ missing, printerId }: { missing: MissingInput; printerId?: number }) {
  const links: Record<MissingInput, [string, string]> = {
    electricity_price: ["Set electricity price", "/settings"],
    machine_power: ["Set the printer's power", printerId ? `/machines/${printerId}` : "/machines"],
    machine_cost: ["Set the printer's purchase cost", printerId ? `/machines/${printerId}` : "/machines"],
    filament_cost: ["Add a purchase of this filament", "/expenses/new"],
  };
  const [text, href] = links[missing];
  return (
    <li>
      <Link className="inline-flex min-h-tap items-center font-semibold underline" href={href}>
        {text}
      </Link>
    </li>
  );
}

function Line({ label, strong, children }: { label: string; strong?: boolean; children: ReactNode }) {
  return (
    <div className={strong ? "flex justify-between gap-3 py-2 font-bold" : "flex justify-between gap-3 py-2"}>
      <dt>{label}</dt>
      <dd className="tabular-nums">{children}</dd>
    </div>
  );
}

function Select({
  id,
  label,
  value,
  onChange,
  children,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: ReactNode;
}) {
  return (
    <Field id={id} label={label}>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-tap w-full rounded-md border border-border bg-surface px-3 text-md text-ink"
      >
        {children}
      </select>
    </Field>
  );
}

function NumberInput({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Field id={id} label={label}>
      <Input
        id={id}
        inputMode="decimal"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="tabular-nums"
      />
    </Field>
  );
}
