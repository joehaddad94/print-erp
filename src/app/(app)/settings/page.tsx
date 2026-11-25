import { ActionForm } from "@/components/form/action-form";
import { NumberField } from "@/components/form/fields";
import { Card, Callout, PageHeader, buttonClass, formatWhen } from "@/components/ui";
import { db } from "@/db";
import { requireUser } from "@/server/auth/session";
import { saveSettingsAction } from "@/server/settings/actions";
import { SETTING_KEYS, currentSettings, settingHistory } from "@/server/settings/service";

export default async function SettingsPage() {
  await requireUser();
  const current = await currentSettings(db());
  const defaults = Object.fromEntries(
    Object.keys(SETTING_KEYS).map((k) => [k, current[k] == null ? "" : String(current[k])]),
  );
  const histories = await Promise.all(Object.keys(SETTING_KEYS).map((k) => settingHistory(db(), k)));

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Settings" />
      {current.electricity_kwh_price == null ? (
        <Callout tone="warning" title="Electricity price not set">
          Print costs show as incomplete until you enter it.
        </Callout>
      ) : null}
      <Card>
        <ActionForm action={saveSettingsAction} defaults={defaults} submitLabel="Save settings">
          {Object.entries(SETTING_KEYS).map(([key, meta]) => (
            <NumberField key={key} name={key} label={meta.label} hint={meta.hint} />
          ))}
          <p className="text-xs text-ink-muted">
            A change applies from now on. Past prints keep the values they were saved with.
          </p>
        </ActionForm>
      </Card>
      <section aria-labelledby="settings-backup" className="flex flex-col gap-2">
        <h2 id="settings-backup" className="text-lg font-bold">
          Backup
        </h2>
        <Card className="flex flex-col gap-3">
          <p className="text-sm text-ink-muted">
            A backup is saved automatically every Monday. Download one now to keep a copy on your own computer.
          </p>
          {/* A plain link: the browser downloads the file, nothing to hydrate. */}
          <a className={buttonClass("secondary", true)} href="/api/backup" download>
            Download backup
          </a>
        </Card>
      </section>
      <section aria-labelledby="settings-history" className="flex flex-col gap-2">
        <h2 id="settings-history" className="text-lg font-bold">
          History
        </h2>
        <ul className="divide-y divide-border rounded-md border border-border bg-surface text-sm">
          {Object.entries(SETTING_KEYS).flatMap(([, meta], i) =>
            histories[i]!.slice(0, 5).map((row) => (
              <li key={row.id} className="flex justify-between gap-3 px-3 py-2">
                <span>{meta.label}</span>
                <span className="text-right tabular-nums">
                  <span className="font-semibold">{String(row.value)}</span>
                  <span className="block text-xs text-ink-muted">from {formatWhen(row.validFrom)}</span>
                </span>
              </li>
            )),
          )}
        </ul>
      </section>
    </div>
  );
}
