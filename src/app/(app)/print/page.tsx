import Link from "next/link";
import { StartForm } from "@/components/printing/start-form";
import { Card, EmptyState, PageHeader, buttonClass } from "@/components/ui";
import { db } from "@/db";
import { requireUser } from "@/server/auth/session";
import { startOptions } from "@/server/printing/service";

export default async function StartPrintPage() {
  await requireUser();
  const options = await startOptions(db());
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Start print" />
      {options.recipes.length === 0 ? (
        <EmptyState title="No recipes yet">
          <Link href="/recipes/import" className={buttonClass("primary")}>
            Import G-code
          </Link>
        </EmptyState>
      ) : options.printers.length === 0 ? (
        <EmptyState title="No active printer">Add one under Machines.</EmptyState>
      ) : options.filaments.length === 0 ? (
        <EmptyState title="No filament yet">
          <Link href="/expenses/new" className={buttonClass("primary")}>
            Add a filament purchase
          </Link>
        </EmptyState>
      ) : (
        <Card>
          <StartForm options={options} />
        </Card>
      )}
    </div>
  );
}
