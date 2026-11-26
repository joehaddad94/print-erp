import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

const tones = {
  info: "border-info bg-info-bg text-ink",
  warning: "border-warning bg-warning-bg text-ink",
  danger: "border-danger bg-danger-bg text-ink",
  success: "border-success bg-success-bg text-ink",
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
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn("rounded-md border-l-3 px-4 py-3 text-sm", tones[tone])}
    >
      {title ? <p className="font-semibold">{title}</p> : null}
      <div>{children}</div>
    </div>
  );
}
