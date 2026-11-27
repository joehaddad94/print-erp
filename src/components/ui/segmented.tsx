import { cn } from "@/lib/cn";

/**
 * Segmented choice for 2 to 4 options (USD/LBP, Ran to the end/Stopped early).
 * Real radio inputs (invisible, covering each option so the tap target is the whole option), so it works in a plain <form> and with the keyboard (arrows) without JS.
 */
export function Segmented({
  name,
  legend,
  options,
  defaultValue,
  onChange,
}: {
  name: string;
  legend: string;
  options: readonly { value: string; label: string }[];
  defaultValue?: string;
  onChange?: (value: string) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="pb-1.5 text-sm font-medium text-ink-soft">{legend}</legend>
      <div className="grid w-full auto-cols-fr grid-flow-col rounded-md bg-surface-muted p-0.5">
        {options.map((o) => (
          <label key={o.value} className="relative">
            <input
              type="radio"
              name={name}
              value={o.value}
              defaultChecked={o.value === (defaultValue ?? options[0]?.value)}
              onChange={onChange ? () => onChange(o.value) : undefined}
              className="peer absolute inset-0 size-full cursor-pointer opacity-0"
            />
            <span
              className={cn(
                "flex min-h-control cursor-pointer items-center justify-center rounded-sm px-3 text-md font-medium text-ink-muted",
                "peer-checked:bg-surface peer-checked:text-ink peer-checked:shadow-raised",
                "peer-focus-visible:outline-2 peer-focus-visible:outline-action",
              )}
            >
              {o.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
