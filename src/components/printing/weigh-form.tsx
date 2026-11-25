"use client";

import { useState } from "react";
import { ActionForm } from "@/components/form/action-form";
import { NumberField, SelectField, TextField } from "@/components/form/fields";
import { Button } from "@/components/ui";
import { weighAction } from "@/server/printing/actions";

type Filament = { id: number; name: string; onHand: number; emptySpoolWeightG: number | null };

/** Weigh filament (D23): one scale reading per open spool; the app does the subtraction. */
export function WeighForm({ filaments }: { filaments: Filament[] }) {
  const [spools, setSpools] = useState(1);
  const [filamentId, setFilamentId] = useState(String(filaments[0]?.id ?? ""));
  const f = filaments.find((x) => String(x.id) === filamentId);
  return (
    <ActionForm
      action={weighAction}
      submitLabel="Save weigh-in"
      defaults={{ filamentId, emptySpoolG: f?.emptySpoolWeightG == null ? "" : String(f.emptySpoolWeightG) }}
    >
      <SelectField
        name="filamentId"
        label="Filament"
        options={filaments.map((x) => ({ value: String(x.id), label: x.name }))}
        onValueChange={setFilamentId}
      />
      {f ? <p className="text-sm text-ink-muted">The app expects {Number(f.onHand.toFixed(1))} g on hand.</p> : null}
      <NumberField
        name="emptySpoolG"
        label="Empty spool weight"
        suffix="g"
        hint="Same for each spool of this filament."
      />
      {Array.from({ length: spools }, (_, i) => (
        <NumberField key={i} name={`reading-${i}`} label={`Spool ${i + 1} on the scale`} suffix="g" />
      ))}
      <Button variant="secondary" onClick={() => setSpools((n) => n + 1)}>
        Add another spool
      </Button>
      <TextField name="reason" label="Note" hint="Optional." />
    </ActionForm>
  );
}
