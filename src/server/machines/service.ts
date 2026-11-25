import { and, asc, eq, isNull, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "@/db/schema";
import { machines } from "@/db/schema";
import { machineCostPerHour } from "@/lib/cost";

type Db = PostgresJsDatabase<typeof schema>;

/** Machines with hours used = sum of hours of non-deleted print jobs (D27), and cost per hour. */
export async function listMachines(db: Db) {
  const rows = await db
    .select({
      machine: machines,
      hoursUsed: sql<string>`coalesce((select sum(pj.hours) from print_jobs pj where pj.machine_id = "machines"."id" and pj.deleted_at is null), 0)`,
    })
    .from(machines)
    .where(isNull(machines.deletedAt))
    .orderBy(asc(machines.status), asc(machines.name));
  return rows.map(({ machine, hoursUsed }) => ({
    ...machine,
    hoursUsed: Number(hoursUsed),
    costPerHourUsd:
      machine.purchaseAmount == null
        ? null
        : machineCostPerHour(machine.purchaseAmount * machine.purchaseRateToUsd, machine.expectedLifeHours),
  }));
}

export async function getMachine(db: Db, id: number) {
  return (await listMachines(db)).find((m) => m.id === id) ?? null;
}

export function activePrinters(db: Db) {
  return db
    .select()
    .from(machines)
    .where(and(eq(machines.type, "printer"), eq(machines.status, "active"), isNull(machines.deletedAt)))
    .orderBy(asc(machines.name));
}
