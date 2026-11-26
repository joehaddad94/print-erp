"use client";

import { useActionState } from "react";
import { Button, Callout, Field, Input } from "@/components/ui";
import { changePasswordAction, type ChangePasswordState } from "@/server/people/actions";

export function ChangePasswordForm({ username }: { username: string }) {
  const [state, action, pending] = useActionState<ChangePasswordState, FormData>(changePasswordAction, {});
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.error ? <Callout tone="danger">{state.error}</Callout> : null}
      {/* Lets password managers file the new password under the right account. */}
      <input type="hidden" name="username" autoComplete="username" value={username} readOnly />
      <Field id="current" label="Current password" hint="The one-time password you were given, or your old one.">
        <Input id="current" name="current" type="password" autoComplete="current-password" required />
      </Field>
      <Field id="next" label="New password" hint="At least 10 characters.">
        <Input id="next" name="next" type="password" autoComplete="new-password" minLength={10} required />
      </Field>
      <Field id="confirm" label="New password again">
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
      </Field>
      <Button type="submit" pending={pending}>
        {pending ? "Saving…" : "Save password"}
      </Button>
    </form>
  );
}
