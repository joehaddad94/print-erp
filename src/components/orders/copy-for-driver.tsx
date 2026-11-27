"use client";

import { useState } from "react";
import { Icon } from "@/components/shell/icons";
import { Button } from "@/components/ui";

/** Order › Details › "Copy for the driver": name, phone, address, map pin and what to collect, as one message. */
export function CopyForDriver({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-1">
      <Button
        variant="secondary"
        block
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2500);
          } catch {
            setCopied(false);
          }
        }}
      >
        <Icon name="phone" size={15} />
        Copy for the driver
      </Button>
      <p role="status" className="text-xs text-ink-muted">
        {copied ? "Copied. Paste it in WhatsApp." : ""}
      </p>
    </div>
  );
}
