"use client";

import { useState } from "react";
import { useFieldState } from "@/components/form/action-form";
import {
  CurrencyFields,
  DateField,
  NumberField,
  SelectField,
  TextareaField,
  TextField,
} from "@/components/form/fields";
import { CHANNELS } from "./labels";

/** Order header: customer (pick or quick-add, D30), channel, due date, currency, driver and charge (D37). */
export function OrderFields({
  customers,
  lbpRate,
}: {
  customers: { value: string; label: string }[];
  lbpRate?: string;
}) {
  const { defaultValue } = useFieldState("customerId");
  const [customerId, setCustomerId] = useState(defaultValue);
  return (
    <>
      <SelectField
        name="customerId"
        label="Customer"
        placeholder="New customer…"
        options={customers}
        onValueChange={setCustomerId}
      />
      {customerId ? null : (
        <TextField name="newCustomerName" label="New customer name" hint="Leave blank for no customer." />
      )}
      <div className="grid grid-cols-2 gap-3">
        <SelectField name="channel" label="Channel" options={CHANNELS} />
        <DateField name="dueOn" label="Due" />
      </div>
      <CurrencyFields lbpRateDefault={lbpRate} />
      <div className="grid grid-cols-2 gap-3">
        <TextField name="deliveredBy" label="Driver" />
        <NumberField name="deliveryCharge" label="Delivery charge" hint="For the driver. Not in the total." />
      </div>
      <TextareaField name="notes" label="Notes" />
    </>
  );
}
