import { Icon } from "@/components/shell/icons";

/**
 * Checkbox row (prototype `.check`): an 18px box and its label. The real input covers the whole
 * row, so the tap target is the row (44px on phones), not the small box.
 */
export function CheckboxField({
  name,
  label,
  defaultChecked,
}: {
  name: string;
  label: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="relative flex min-h-control cursor-pointer items-center gap-2.5 self-start pr-2 text-md">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="peer absolute inset-0 size-full cursor-pointer opacity-0"
      />
      <span
        aria-hidden
        className="grid size-4.5 shrink-0 place-items-center rounded-sm border border-border-strong bg-surface text-action-ink peer-checked:border-action peer-checked:bg-action peer-focus-visible:outline-2 peer-focus-visible:outline-action [&>svg]:invisible peer-checked:[&>svg]:visible"
      >
        <Icon name="check" size={12} />
      </span>
      {label}
    </label>
  );
}
