"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { PrinterChoice } from "@/components/printing/printer-choice";
import { handOffFile } from "@/components/recipes/gcode-client";
import { Button, Callout, Card, CostLine, CostTotal, Field, FileDrop, Panel, Segmented } from "@/components/ui";
import { AffixInput } from "@/components/ui/field";
import { Link } from "@/components/ui/link";
import { SearchPicker } from "@/components/ui/search-picker";
import { jobCost, unitCost, type MissingInput } from "@/lib/cost";
import { formatDuration } from "@/lib/format";
import { GcodeFormatError, parseGcodeFile, type ParsedGcode } from "@/lib/gcode";
import { formatMoney } from "@/lib/money";
import type { CostInputs } from "@/server/calculator/service";

const num = (s: string) => (s.trim() === "" ? NaN : Number(s.replace(/,/g, "")));
const usd = (n: number) => formatMoney(n, "USD");
const trim = (n: number, dp: number) => String(Number(n.toFixed(dp)));

export type PackagingOption = { id: number; name: string; costPerUnitUsd: number | null };

/**
 * Cost calculator (prototype /calculator, D32): price a job before printing it. A .gcode is read in
 * the browser, or the numbers are typed. Same formula and inputs as a print started now. Nothing is saved.
 */
export function CostCalculator({ inputs, packaging }: { inputs: CostInputs; packaging: PackagingOption[] }) {
  const router = useRouter();
  const fileId = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"file" | "numbers">("file");
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedGcode | null>(null);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filamentId, setFilamentId] = useState<string | null>(null);
  const [printerId, setPrinterId] = useState(String(inputs.printers[0]?.id ?? ""));
  const [grams, setGrams] = useState("");
  const [hours, setHours] = useState("");
  const [pieces, setPieces] = useState("");
  const [price, setPrice] = useState("");
  const [margin, setMargin] = useState("");
  const [packagingId, setPackagingId] = useState("");

  async function choose(f: File | null) {
    setError(null);
    setParsed(null);
    setFile(f);
    if (!f) return;
    setReading(true);
    try {
      const p = await parseGcodeFile(f);
      setParsed(p);
      setGrams(p.totalGrams != null ? trim(p.totalGrams, 2) : "");
      setHours(p.estimatedSeconds != null ? trim(p.estimatedSeconds / 3600, 3) : "");
      setPieces(String(p.objects.reduce((s, o) => s + o.count, 0) || 1));
      const material = p.material?.toLowerCase();
      const same = inputs.filaments.filter((x) => material && x.material?.toLowerCase() === material);
      // Pre-pick the filament of the file's material you have most of ("Matches the file").
      const best = same.sort((a, b) => b.onHand - a.onHand)[0];
      if (best) setFilamentId((cur) => cur ?? String(best.id));
    } catch (e) {
      setError(e instanceof GcodeFormatError ? e.message : "This file couldn't be read as G-code.");
    } finally {
      setReading(false);
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
  const box = packaging.find((p) => String(p.id) === packagingId);
  const g = num(grams);
  const h = num(hours);
  const q = Math.round(num(pieces));
  const haveNumbers = g > 0 && h > 0 && q > 0;
  const result =
    haveNumbers && filament
      ? jobCost({
          filaments: [{ grams: g, costPerGramUsd: filament.costPerGramUsd ?? null }],
          hours: h,
          powerKw: printer?.powerKw ?? null,
          kwhPriceUsd: inputs.kwhPriceUsd,
          machineCostPerHourUsd: printer?.costPerHourUsd ?? null,
        })
      : null;
  const printEach =
    result?.complete === true
      ? unitCost({ share: result.total, planned: q, good: q, method: inputs.method, allowancePct: inputs.allowancePct })
      : null;
  const each = printEach != null ? printEach + (box?.costPerUnitUsd ?? 0) : null;
  const p = num(price);
  const m = num(margin);
  const material = parsed?.material?.toLowerCase();

  return (
    <div className="grid items-start gap-5 lg:grid-aside">
      <div className="flex min-w-0 flex-col gap-5">
        <Card className="flex flex-col gap-4">
          <Segmented
            name="calc-mode"
            legend="Start from"
            defaultValue="file"
            options={[
              { value: "file", label: "A G-code file" },
              { value: "numbers", label: "Type the numbers" },
            ]}
            onChange={(v) => setMode(v as "file" | "numbers")}
          />
          <div hidden={mode !== "file"} className="flex flex-col gap-3">
            <FileDrop
              ref={fileInput}
              id={fileId}
              label="G-code file"
              accept=".gcode"
              file={file}
              status={reading ? "reading…" : parsed ? `${parsed.material ?? "unknown material"} · read OK` : undefined}
              hint="Read in your browser. Grams, hours and pieces fill in by themselves."
              onFile={(f) => void choose(f)}
            />
            {error ? <Callout tone="danger">{error}</Callout> : null}
            {parsed ? (
              <p className="text-sm text-ink-muted">
                {trim(g || 0, 1)} g · {formatDuration(h * 3600)} · {q || 0} piece{q === 1 ? "" : "s"}
                {parsed.estimated.totalGrams || parsed.estimated.estimatedSeconds
                  ? " · Estimated values: the file doesn't state them, check under Type the numbers"
                  : null}
              </p>
            ) : null}
          </div>
          <div hidden={mode !== "numbers"} className="grid grid-cols-3 gap-3">
            <NumberInput id={`${fileId}-grams`} label="Grams" suffix="g" value={grams} onChange={setGrams} />
            <NumberInput id={`${fileId}-hours`} label="Hours" suffix="h" value={hours} onChange={setHours} />
            <NumberInput id={`${fileId}-pieces`} label="Pieces" value={pieces} onChange={setPieces} />
          </div>
          <SearchPicker
            name="filamentId"
            label="Filament"
            placeholder="Search material or colour"
            value={filamentId ?? ""}
            onChange={setFilamentId}
            recentLabel="Matches the file"
            recentIds={inputs.filaments
              .filter((x) => material && x.material?.toLowerCase() === material)
              .map((x) => String(x.id))}
            items={inputs.filaments.map((x) => ({
              id: String(x.id),
              label: x.name,
              sub: [
                `${Math.round(x.onHand).toLocaleString("en-US")} g left`,
                x.costPerGramUsd != null ? `${usd(x.costPerGramUsd * 1000)}/kg` : "no price yet",
              ].join(" · "),
              keywords: x.material ?? undefined,
            }))}
            empty="No filament matches. Buy some under Purchases first."
          />
          <p className="-mt-2 text-xs text-ink-muted">Uses its average price per gram.</p>
          {inputs.printers.length ? (
            <PrinterChoice
              name="printerId"
              printers={inputs.printers.map((x) => ({ ...x, busy: false }))}
              value={printerId}
              onChange={setPrinterId}
            />
          ) : (
            <Callout tone="warning">
              No active printer. <Link href="/purchases/new?category=machine">Add machine</Link>
            </Callout>
          )}
          {file && parsed ? (
            <Button
              variant="ghost"
              className="self-start"
              onClick={() => {
                handOffFile(file);
                router.push("/recipes/import");
              }}
            >
              Save this file as a recipe
            </Button>
          ) : null}
        </Card>

        <Card className="flex flex-col gap-4">
          <h2 className="text-xs font-semibold tracking-wider text-ink-muted uppercase">Price</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <NumberInput
              id={`${fileId}-price`}
              label="Your price per piece"
              optional
              prefix="$"
              value={price}
              onChange={setPrice}
            />
            <NumberInput
              id={`${fileId}-margin`}
              label="Or aim for a margin"
              optional
              suffix="%"
              value={margin}
              onChange={setMargin}
            />
          </div>
          <Field id={`${fileId}-packaging`} label="Packaging" optional hint="Added per piece, as when it sells.">
            <select
              id={`${fileId}-packaging`}
              value={packagingId}
              onChange={(e) => setPackagingId(e.target.value)}
              className="control px-3 text-ink"
            >
              <option value="">None</option>
              {packaging.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                  {x.costPerUnitUsd != null ? ` (${usd(x.costPerUnitUsd)})` : ""}
                </option>
              ))}
            </select>
          </Field>
        </Card>
      </div>

      <div className="lg:sticky lg:top-4">
        <Panel title="Result" titleId="calc-result">
          {!haveNumbers ? (
            <p className="text-sm text-ink-muted">
              {mode === "file" ? "Pick a .gcode file, or type the numbers." : "Type grams, hours and pieces above 0."}
            </p>
          ) : !filament ? (
            inputs.kwhPriceUsd == null ? (
              <Callout tone="warning" title="Cost incomplete">
                <ul className="list-disc pl-5">
                  <li>Pick a filament</li>
                  <MissingLink missing="electricity_price" />
                </ul>
              </Callout>
            ) : (
              <p className="text-sm text-ink-muted">Pick a filament to see the cost.</p>
            )
          ) : result && !result.complete ? (
            <Callout tone="warning" title="Cost incomplete">
              <ul className="list-disc pl-5">
                {result.missing.map((x) => (
                  <MissingLink key={x} missing={x} printerId={printer?.id} />
                ))}
              </ul>
            </Callout>
          ) : result?.complete ? (
            <dl className="flex flex-col" aria-label="Cost">
              <CostLine label={`Filament · ${trim(g, 1)} g`} value={usd(result.filament)} />
              <CostLine label={`Electricity · ${trim(h, 2)} h`} value={usd(result.electricity)} />
              <CostLine label="Machine wear" value={usd(result.wear)} />
              <CostTotal label="Job cost" value={usd(result.total)} />
              <CostLine
                strong
                label={
                  <>
                    Cost per piece{box ? ", with box" : ""}
                    {inputs.method === "allowance" ? (
                      <span className="block text-xs font-normal text-ink-muted">
                        incl. {inputs.allowancePct}% failure allowance
                      </span>
                    ) : null}
                  </>
                }
                value={each != null ? usd(each) : "—"}
              />
              {each != null && m > 0 && m < 100 ? (
                <CostLine
                  divided
                  strong
                  label={`Price for a ${trim(m, 1)}% margin`}
                  value={usd(each / (1 - m / 100))}
                />
              ) : null}
              {each != null && p > 0 ? (
                <>
                  <CostLine
                    divided={!(m > 0 && m < 100)}
                    label={`At your ${usd(p)}: profit per piece`}
                    value={
                      <span className={p - each >= 0 ? "font-semibold text-success" : "font-semibold text-danger"}>
                        {usd(p - each)}
                      </span>
                    }
                  />
                  <CostLine label="Margin" value={`${Math.round(((p - each) / p) * 100)}%`} />
                </>
              ) : null}
            </dl>
          ) : null}
          {result?.complete ? (
            <p className="pt-2 text-xs text-ink-muted">Your time is not a cost. Nothing here is saved.</p>
          ) : null}
        </Panel>
      </div>
    </div>
  );
}

function MissingLink({ missing, printerId }: { missing: MissingInput; printerId?: number }) {
  const links: Record<MissingInput, [string, string]> = {
    electricity_price: ["Set electricity price", "/settings"],
    machine_power: ["Set the printer's power", printerId ? `/machines/${printerId}` : "/machines"],
    machine_cost: ["Set the printer's purchase cost", printerId ? `/machines/${printerId}` : "/machines"],
    filament_cost: ["Add a purchase of this filament", "/purchases/new?category=filament"],
  };
  const [text, href] = links[missing];
  return (
    <li>
      <Link className="inline-flex min-h-control items-center font-semibold underline" href={href}>
        {text}
      </Link>
    </li>
  );
}

function NumberInput({
  id,
  label,
  value,
  onChange,
  prefix,
  suffix,
  optional,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  prefix?: string;
  suffix?: string;
  optional?: boolean;
}): ReactNode {
  return (
    <Field id={id} label={label} optional={optional}>
      <AffixInput
        id={id}
        inputMode="decimal"
        autoComplete="off"
        value={value}
        prefix={prefix}
        suffix={suffix}
        onChange={(e) => onChange(e.target.value)}
        className="tabular-nums"
      />
    </Field>
  );
}
