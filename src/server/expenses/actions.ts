"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { requireUser } from "@/server/auth/session";
import { failure, formValues, validate, type FormState } from "@/server/form";
import { expenseSchema, isPurchase } from "./schema";
import { createExpense, deleteExpense, updateExpense } from "./service";

function refresh() {
  for (const p of ["/expenses", "/purchases", "/suppliers", "/machines", "/stock"]) revalidatePath(p);
}

export async function createExpenseAction(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireUser();
  const values = formValues(fd);
  const v = validate(expenseSchema, values);
  if (!v.ok) return v.state;
  try {
    await createExpense(db(), v.data);
  } catch {
    return failure(values, "Couldn't save. Nothing was recorded. Check your connection and try again.");
  }
  refresh();
  redirect(v.data.category === "machine" ? "/machines" : isPurchase(v.data.category) ? "/purchases" : "/expenses");
}

export async function updateExpenseAction(id: number, _prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const values = formValues(fd);
  const v = validate(expenseSchema, values);
  if (!v.ok) return v.state;
  try {
    await updateExpense(db(), id, v.data, user.id);
  } catch {
    return failure(values, "Couldn't save. Nothing was changed. Check your connection and try again.");
  }
  refresh();
  redirect(isPurchase(v.data.category) ? "/purchases" : "/expenses");
}

export async function deleteExpenseAction(id: number) {
  const user = await requireUser();
  const category = await deleteExpense(db(), id, user.id);
  refresh();
  redirect(category && isPurchase(category) ? "/purchases" : "/expenses");
}
