import { Link } from "@/components/ui/link";
import { StartForm } from "@/components/printing/start-form";
import { Card, EmptyState, PageHeader, buttonClass } from "@/components/ui";
import { db } from "@/db";
import { requireUser } from "@/server/auth/session";
import { startOptions } from "@/server/printing/service";
import { importOptions } from "../recipes/options";

export default async function StartPrintPage() {
  await requireUser();
  const [options, fileOpts] = await Promise.all([startOptions(db()), importOptions()]);
  // Start can take a .gcode directly (Nov 26), unless file storage isn't connected on Vercel.
  const fileAvailable = !(process.env.VERCEL && fileOpts.mode === "local");
  return (
    <div className="flex max-w-content flex-col gap-6">
      <PageHeader title="Start print" />
      {options.recipes.length === 0 && !fileAvailable ? (
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
          <StartForm options={options} file={{ ...fileOpts, available: fileAvailable }} />
        </Card>
      )}
    </div>
  );
}
