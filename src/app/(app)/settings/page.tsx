import { ActionForm } from "@/components/form/action-form";
import { NumberField } from "@/components/form/fields";
import { PeoplePanel } from "@/components/people/people-panel";
import { FullBackupButton } from "@/components/settings/full-backup";
import { Badge, Callout, PageHeader, Panel, buttonClass, formatWhen } from "@/components/ui";
import { Link } from "@/components/ui/link";
import { db } from "@/db";
import { listPeople } from "@/server/auth/service";
import { isOwner, requireUser } from "@/server/auth/session";
import { saveSettingsAction } from "@/server/settings/actions";
import { backupStatus, BACKUP_LATE_DAYS } from "@/server/backup/status";
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
  const backup = owner ? await backupStatus(db()) : null;

  return (
    <div className="flex max-w-content flex-col gap-6">
      <PageHeader
        title="Settings"
        description="Cost settings apply to new prints only. Past prints keep the values they used."
      />
      {current.electricity_kwh_price == null ? (
        <Callout tone="warning" title="Electricity price not set">
          Print costs show as incomplete until you enter it.
        </Callout>
      ) : null}
      <Panel title="Costs" titleId="settings-costs">
        <ActionForm action={saveSettingsAction} defaults={defaults} submitLabel="Save settings">
          {Object.entries(SETTING_KEYS).map(([key, meta], i) => {
            const since = histories[i]![0]?.validFrom;
            return (
              <NumberField
                key={key}
                name={key}
                label={meta.label}
                hint={since ? `${meta.hint} Since ${formatWhen(since)}.` : meta.hint}
              />
            );
          })}
        </ActionForm>
      </Panel>
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
      {owner && backup ? (
        <Panel title="Backup" titleId="settings-backup">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium text-ink-muted">Last automatic backup</dt>
              <dd className="flex flex-wrap items-center gap-2 font-medium">
                {backup.lastOkAt ? formatWhen(backup.lastOkAt) : "None yet"}
                {backup.lastFailed ? (
                  <Badge tone="danger">Last run failed</Badge>
                ) : backup.late ? (
                  <Badge tone="danger">Late</Badge>
                ) : (
                  <Badge tone="success">OK</Badge>
                )}
              </dd>
              <dd className="text-xs text-ink-muted">
                {backup.lastFailed?.error ?? `Turns red if older than ${BACKUP_LATE_DAYS} days.`}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-ink-muted">Next</dt>
              <dd className="font-medium">{formatWhen(backup.next)}</dd>
              <dd className="text-xs text-ink-muted">Every Monday, kept in private storage.</dd>
            </div>
          </dl>
          <div className="mt-4 flex flex-wrap items-start gap-3 border-t border-border pt-4">
            <p className="min-w-56 flex-1 text-sm text-ink-muted">
              The full backup is one .zip: every table (JSON to restore, CSV for Excel),{" "}
              <b className="font-medium text-ink">every G-code file</b>, and a list of file checksums. Keep a copy off
              this computer (USB or Google Drive).
            </p>
            <FullBackupButton />
            {/* A plain link: the browser downloads the file, nothing to hydrate. */}
            <a className={buttonClass("quiet")} href="/api/backup" download>
              Data only (.json)
            </a>
          </div>
        </Panel>
      ) : null}
      <Panel title="Recent setting changes" titleId="settings-history" flush>
        <ul className="divide-y divide-border text-sm">
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
      </Panel>
    </div>
  );
}
