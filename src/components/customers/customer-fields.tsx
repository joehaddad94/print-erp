import { TextareaField, TextField } from "@/components/form/fields";

/**
 * Add customer (prototype /customers/new): name and phone, the rest optional. The phone is saved
 * as +961 70 123 456 however it is typed (R5). `create` shows the +961 inside the box.
 */
export function CustomerFields({ create = false }: { create?: boolean }) {
  return (
    <>
      <TextField name="name" label="Name" autoComplete="off" placeholder="Karim Haddad" />
      <TextField
        name="phone"
        label="Phone"
        inputMode="tel"
        prefix={create ? "+961" : undefined}
        placeholder="70 123 456"
        hint="Type it any way: 70123456, 070 123 456 or +961 70 123 456. It is saved as +961 70 123 456. For another country, start with +."
      />
      <TextField name="email" label="Email" optional inputMode="email" placeholder="name@example.com" />
      <TextField name="handle" label="Instagram" optional placeholder="@handle" />
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField name="area" label="Area" optional placeholder="Achrafieh" />
      </div>
      <TextareaField name="address" label="Delivery address" optional placeholder="Street, building, floor, landmark" />
      <TextField
        name="mapUrl"
        label="Map pin"
        optional
        inputMode="url"
        placeholder="Paste the location link they sent on WhatsApp"
        hint="A Google Maps link. The driver opens it straight from the message you send."
      />
      <TextareaField name="notes" label="Notes" optional placeholder="Prefers black, pays cash…" />
    </>
  );
}
