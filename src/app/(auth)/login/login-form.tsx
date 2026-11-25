"use client";

import { useActionState } from "react";
import { Button, Callout, Field, Input } from "@/components/ui";
import { loginAction, type LoginState } from "@/server/auth/actions";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, {});
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.error ? <Callout tone="danger">{state.error}</Callout> : null}
      <Field id="username" label="Username" error={state.fieldErrors?.username}>
        <Input
          id="username"
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          defaultValue={state.username}
          invalid={!!state.fieldErrors?.username}
          required
        />
      </Field>
      <Field id="password" label="Password" error={state.fieldErrors?.password}>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          invalid={!!state.fieldErrors?.password}
          required
        />
      </Field>
      <Button type="submit" block pending={pending} className="sm:w-full sm:self-stretch">
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
