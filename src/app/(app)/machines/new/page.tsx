import { ActionForm } from "@/components/form/action-form";
import {
  CurrencyFields,
  DateField,
  NumberField,
  SegmentedField,
  SelectField,
  TextField,
  TextareaField,
} from "@/components/form/fields";
import { PAID_WITH } from "@/components/expenses/paid-with";
import { SupplierPicker } from "@/components/expenses/supplier-picker";
import { Card, PageHeader } from "@/components/ui";
import { requireUser } from "@/server/auth/session";
import { createExpenseAction } from "@/server/expenses/actions";
import { expenseFormOptions } from "../../expenses/options";

/**
 * Add machine (prototype: "Machines are not stock. Add it under Machines with its price"): the
 * machine and its specs, plus what you paid, saved as a machine purchase in one step (D9).
 */
export default async function NewMachinePage() {
  await requireUser();
  const opts = await expenseFormOptions();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Beirut" });
  return (
    <div className="flex max-w-content flex-col gap-5">
      <PageHeader
        back={{ href: "/machines", label: "Machines" }}
        title="Add machine"
        description="What you paid is recorded as a purchase."
      />
      <ActionForm
        action={createExpenseAction}
        submitLabel="Save machine"
        cancelHref="/machines"
        defaults={{
          category: "machine",
          machineType: "printer",
          spentOn: today,
          currency: "USD",
          lbpRate: opts.lbpRate ?? "",
          paymentMethod: "cash",
          machineLifeHours: "3000",
        }}
      >
        <input type="hidden" name="category" value="machine" />
        <Card className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField name="machineName" label="Name" placeholder="Ender 3 V3 SE" />
            <TextField name="machineModel" label="Model" optional placeholder="Creality Ender-3 V3 SE" />
          </div>
          <SegmentedField
            name="machineType"
            label="Type"
            options={[
              { value: "printer", label: "Printer" },
              { value: "equipment", label: "Equipment" },
            ]}
          />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <NumberField name="machineBedXMm" label="Bed X" optional suffix="mm" />
            <NumberField name="machineBedYMm" label="Bed Y" optional suffix="mm" />
            <NumberField name="machineNozzleMm" label="Nozzle" optional suffix="mm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <NumberField name="machineLifeHours" label="Expected life" suffix="h" hint="Default 3,000 h." />
            <NumberField
              name="machinePowerKw"
              label="Average power"
              optional
              suffix="kW"
              hint="Ender-3 V3 SE: 0.12 kW."
            />
          </div>
        </Card>
        <Card className="flex flex-col gap-4">
          <h2 className="text-xs font-semibold tracking-wider text-ink-muted uppercase">Payment</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <NumberField name="amount" label="Purchase cost" />
            <DateField name="spentOn" label="Date" />
          </div>
          <CurrencyFields lbpRateDefault={opts.lbpRate} />
          <div className="grid items-start gap-3 sm:grid-cols-2">
            <SelectField name="paymentMethod" label="Paid with" options={PAID_WITH} />
            <SupplierPicker suppliers={opts.suppliers} />
          </div>
          <TextareaField name="notes" label="Notes" optional />
        </Card>
      </ActionForm>
    </div>
  );
}
