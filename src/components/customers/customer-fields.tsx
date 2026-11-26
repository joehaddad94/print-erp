import { TextareaField, TextField } from "@/components/form/fields";
import { PHONE_HINT } from "@/lib/phone";

/** R5 customer details: phone saved as +961…, the rest optional. */
export function CustomerFields() {
  return (
    <>
      <TextField name="name" label="Name" autoComplete="off" />
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField name="phone" label="Phone" inputMode="tel" placeholder="70 123 456" hint={PHONE_HINT} />
        <TextField name="email" label="Email" inputMode="email" placeholder="name@example.com" hint="Optional." />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField name="handle" label="Instagram or other" placeholder="@handle" hint="Optional." />
        <TextField name="area" label="Area" placeholder="Achrafieh" hint="Optional." />
      </div>
      <TextareaField name="address" label="Delivery address" hint="Optional. Street, building, floor, landmark." />
      <TextField
        name="mapUrl"
        label="Map pin"
        inputMode="url"
        placeholder="https://maps.app.goo.gl/…"
        hint="Optional. Paste the location link they sent on WhatsApp."
      />
      <TextareaField name="notes" label="Notes" hint="Optional." />
    </>
  );
}
