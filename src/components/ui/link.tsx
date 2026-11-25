import NextLink from "next/link";
import type { ComponentProps } from "react";
import { PendingBar } from "./pending-bar";

/**
 * The app's only link component: next/link plus the top progress bar, so every
 * click gives feedback even before the next screen's skeleton appears.
 * Lint (no-restricted-imports) keeps screens from importing next/link directly.
 */
export function Link({ children, ...rest }: ComponentProps<typeof NextLink>) {
  return (
    <NextLink {...rest}>
      {children}
      <PendingBar />
    </NextLink>
  );
}
