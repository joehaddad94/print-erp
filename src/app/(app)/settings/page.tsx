import { ActionForm } from "@/components/form/action-form";
import { NumberField } from "@/components/form/fields";
import { PeoplePanel } from "@/components/people/people-panel";
import { Card, Callout, PageHeader, Panel, buttonClass, formatWhen } from "@/components/ui";
import { Link } from "@/components/ui/link";
import { db } from "@/db";
import { listPeople } from "@/server/auth/service";
import { isOwner, requireUser } from "@/server/auth/session";
import { saveSettingsAction } from "@/server/settings/actions";
import { SETTING_KEYS, currentSettings, settingHistory } from "@/server/settings/service";

export default async function SettingsPage() {
  const me = await requireUser();
  const owner = isOwner(me);
  const people = owner ? await listPeople(db()) : [];
  const current = await currentSettings(db());
  const defaults = Object.fromEntries(
    Object.keys(SETTING_KEYS).map((k) => [k, current[k] == null ? "" : String(current[k])]),
  );
  const histories = await Promise.all(Object.keys(SETTING_KEYS).map((k) => settingHistory(db(), k)));

  return (
    <div className="flex max-w-content flex-col gap-6">
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
      {owner ? (
        <Panel title="People" titleId="settings-people" count={people.length} flush>
          <PeoplePanel
            meId={me.id}
            people={people.map((p) => ({
              id: p.id,
              username: p.username,
              role: p.role,
              mustChangePassword: p.mustChangePassword,
              lastLogin: p.lastLoginAt ? formatWhen(p.lastLoginAt) : null,
            }))}
          />
        </Panel>
      ) : null}
      <Panel title="Your account" titleId="settings-account">
        <div className="flex flex-wrap items-center gap-3">
          <p className="min-w-48 flex-1 text-sm text-ink-muted">
            Signed in as <b className="font-medium text-ink">{me.username}</b> ({owner ? "owner" : "staff"}). No email:
            if you forget your password, an owner resets it.
          </p>
          <Link href="/change-password" className={buttonClass("secondary")}>
            Change password
          </Link>
        </div>
      </Panel>
      {owner ? (
        <section aria-labelledby="settings-backup" className="flex flex-col gap-2">
          <h2 id="settings-backup" className="text-lg font-semibold">
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
      ) : null}
      <section aria-labelledby="settings-history" className="flex flex-col gap-2">
        <h2 id="settings-history" className="text-lg font-semibold">
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
