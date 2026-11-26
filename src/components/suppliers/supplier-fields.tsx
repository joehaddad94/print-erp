import { TextareaField, TextField } from "@/components/form/fields";
import { PHONE_HINT } from "@/lib/phone";

/** R7 supplier details: phone saved as +961…, the rest optional. */
export function SupplierFields() {
  return (
    <>
      <TextField name="name" label="Name" autoComplete="off" />
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField name="phone" label="Phone" inputMode="tel" placeholder="70 123 456" hint={PHONE_HINT} />
        <TextField name="sells" label="Sells" placeholder="PLA, PETG, boxes" hint="Optional." />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField name="email" label="Email" inputMode="email" placeholder="shop@example.com" hint="Optional." />
        <TextField name="website" label="Website or page" inputMode="url" placeholder="https://…" hint="Optional." />
      </div>
      <TextField name="area" label="Area" placeholder="Dora" hint="Optional." />
      <TextareaField name="address" label="Address" hint="Optional." />
      <TextField
        name="mapUrl"
        label="Map pin"
        inputMode="url"
        placeholder="https://maps.app.goo.gl/…"
        hint="Optional. Paste the shop's location link."
      />
      <TextareaField name="notes" label="Notes" hint="Optional." />
    </>
  );
}
