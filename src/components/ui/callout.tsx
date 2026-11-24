import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

const tones = {
  info: "bg-info-bg text-ink",
  warning: "bg-warning-bg text-ink",
  danger: "bg-danger-bg text-ink",
  success: "bg-success-bg text-ink",
} as const;

export function Callout({
  tone = "info",
  title,
  children,
}: {
  tone?: keyof typeof tones;
  title?: string;
  children: ReactNode;
}) {
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("rounded-md px-3 py-2.5 text-sm", tones[tone])}>
      {title ? <p className="font-bold">{title}</p> : null}
      <div>{children}</div>
    </div>
  );
}
