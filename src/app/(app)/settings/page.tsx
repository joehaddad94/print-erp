import { PeoplePanel } from "@/components/people/people-panel";
import { FullBackupButton } from "@/components/settings/full-backup";
import { Badge, Callout, InlineDetails, PageHeader, Panel, buttonClass, formatWhen } from "@/components/ui";
import { Link } from "@/components/ui/link";
import { db } from "@/db";
import { listPeople } from "@/server/auth/service";
import { isOwner, requireUser } from "@/server/auth/session";
import { updateSettingAction } from "@/server/settings/actions";
import { backupStatus, BACKUP_LATE_DAYS } from "@/server/backup/status";
import { SETTING_KEYS, appDefaults, currentSettings, settingHistory, type SettingKey } from "@/server/settings/service";

const COSTS: Record<SettingKey, { label: string; note: string; prefix?: string; suffix?: string }> = {
  electricity_kwh_price: { label: "Electricity per kWh", note: "EDL and generator averaged", prefix: "$" },
  usd_lbp_rate: { label: "LBP per USD", note: "Pre-fills the rate on LBP entries" },
  failure_allowance_pct: { label: "Failure allowance", note: "Used until enough prints are logged", suffix: "%" },
  failure_actual_after_prints: { label: "Use real failures after", note: "Prints logged", suffix: " prints" },
};
const day = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Beirut" });

/** Settings (prototype /settings): click-to-edit costs and defaults, people, account, backup. */
export default async function SettingsPage() {
  const me = await requireUser();
  const owner = isOwner(me);
  const people = owner ? await listPeople(db()) : [];
  const current = await currentSettings(db());
  const histories = await Promise.all(Object.keys(SETTING_KEYS).map((k) => settingHistory(db(), k)));
  const backup = owner ? await backupStatus(db()) : null;
  const defs = await appDefaults(db());

  return (
    <div className="flex max-w-content flex-col gap-6">
      <PageHeader
        title="Settings"
        description="Click any value to change it. Cost settings apply to new prints only; past prints keep the values they used."
      />
      {current.electricity_kwh_price == null ? (
        <Callout tone="warning" title="Electricity price not set">
          Print costs show as incomplete until you enter it.
        </Callout>
      ) : null}
      <Panel title="Costs" titleId="settings-costs">
        <InlineDetails
          save={updateSettingAction}
          rows={(Object.keys(SETTING_KEYS) as SettingKey[]).map((key, i) => {
            const meta = COSTS[key];
            const [latest, ...earlier] = histories[i]!;
            return {
              field: key,
              label: meta.label,
              note: meta.note,
              value: current[key] == null ? "" : String(current[key]),
              prefix: meta.prefix,
              display:
                key === "usd_lbp_rate" && typeof current[key] === "number"
                  ? current[key].toLocaleString("en-US")
                  : undefined,
              suffix: meta.suffix,
              inputMode: "decimal" as const,
              placeholder: "Set it",
              after: latest ? (
                <>
                  since {day(latest.validFrom)}
                  {earlier.length && owner ? (
                    <>
                      {" · "}
                      <Link
                        href="/history?area=settings"
                        className="inline-flex min-h-tap items-center text-action hover:underline lg:min-h-6"
                      >
                        {earlier.length} earlier
                      </Link>
                    </>
                  ) : null}
                </>
              ) : undefined,
            };
          })}
        />
      </Panel>
      <Panel title="Defaults" titleId="settings-defaults">
        <InlineDetails
          save={updateSettingAction}
          rows={[
            {
              field: "default_currency",
              label: "Currency for new entries",
              value: defs.currency,
              options: [
                { value: "USD", label: "USD" },
                { value: "LBP", label: "LBP" },
              ],
            },
            {
              field: "phone_country",
              label: "Phone country",
              note: "Numbers typed without + use this",
              value: defs.phoneCountry,
              options: [{ value: "LB", label: "Lebanon +961" }],
            },
            {
              field: "low_filament_g",
              label: "Warn when filament is below",
              note: "Each stock item can override it",
              value: String(defs.lowFilamentG),
              suffix: " g",
              inputMode: "decimal",
            },
            {
              field: "shop_name",
              label: "Shop name",
              note: "Shown in the sidebar and on the sign-in page",
              value: defs.shopName,
              wide: true,
            },
          ]}
        />
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
    </div>
  );
}
