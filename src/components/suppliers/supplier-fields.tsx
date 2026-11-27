import { TextareaField, TextField } from "@/components/form/fields";

/** Add supplier (prototype /suppliers/new): phone saved as +961…, the same format as customers. */
export function SupplierFields({ create = false }: { create?: boolean }) {
  return (
    <>
      <TextField name="name" label="Name" autoComplete="off" placeholder="Spool corner" />
      <TextField
        name="phone"
        label="Phone"
        inputMode="tel"
        prefix={create ? "+961" : undefined}
        placeholder="76 400 400"
        hint="Saved as +961 76 400 400, the same format as customers."
      />
      <TextField
        name="sells"
        label="What they sell"
        optional
        placeholder="Filament, boxes"
        hint="Helps search: typing “boxes” finds them."
      />
      <TextField name="email" label="Email" optional inputMode="email" placeholder="orders@example.com" />
      <TextField name="website" label="Website or Instagram" optional placeholder="spoolcorner.com or @handle" />
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField name="area" label="Area" optional placeholder="Dekwaneh" />
      </div>
      <TextareaField name="address" label="Address" optional placeholder="Street, building, landmark" />
      <TextField name="mapUrl" label="Map pin" optional inputMode="url" placeholder="Paste a Google Maps link" />
      <TextareaField name="notes" label="Notes" optional placeholder="Delivery days, minimum order…" />
    </>
  );
}
