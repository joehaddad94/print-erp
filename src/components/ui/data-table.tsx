import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { ColumnsMenu } from "./columns-menu";
import { Link } from "./link";
import { ListRow } from "./list";

export type Column<T> = {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** Numbers and money: right-aligned, tabular figures. */
  numeric?: boolean;
  /** Low priority: hides when the card is narrower than about 760px. */
  lo?: boolean;
  /** Long text: cut with an ellipsis, full text on hover. */
  truncate?: boolean;
};

/**
 * DataTable (docs/DESIGN-SYSTEM.md §6). Server-rendered; only the Columns menu is client code.
 *
 * - Below about 520px of card width (and on phones) it becomes ListRows via `phoneRow`.
 * - `wide` = a list screen showing every field: scrolls sideways with the first column pinned,
 *   and a Columns button lets the person hide columns (remembered per device). Dashboards never use `wide`.
 */
export function DataTable<T>({
  id,
  label,
  columns,
  rows,
  rowKey,
  rowHref,
  phoneRow,
  wide,
  empty,
}: {
  /** Unique on the page; also the key the column choices are saved under. */
  id: string;
  label: string;
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  rowHref?: (row: T) => string;
  phoneRow: (row: T) => { title: ReactNode; subtitle?: ReactNode; trailing?: ReactNode; badge?: ReactNode };
  wide?: boolean;
  empty?: ReactNode;
}) {
  if (!rows.length) return <p className="px-4 py-5 text-sm text-ink-muted">{empty ?? "Nothing here yet."}</p>;
  const first = columns[0]!.key;
  return (
    <div className="@container">
      {wide ? (
        <div className="flex justify-end border-b border-border px-4 py-1.5 @max-lg:hidden">
          <ColumnsMenu tableId={id} columns={columns.map((c) => ({ key: c.key, header: c.header }))} pinned={[first]} />
        </div>
      ) : null}
      <div id={id} className={cn("@max-lg:hidden", wide ? "overflow-x-auto" : "overflow-x-hidden")}>
        <table aria-label={label} className="w-full border-collapse text-md">
          <thead>
            <tr className="border-b border-border">
              {columns.map((c) => (
                <th
                  key={c.key}
                  data-col={c.key}
                  scope="col"
                  className={cn(
                    "h-9 px-3 text-left text-xs font-medium whitespace-nowrap text-ink-muted first:pl-4 last:pr-4",
                    c.numeric && "text-right",
                    c.lo && "@max-3xl:hidden",
                    wide && c.key === first && "sticky left-0 z-10 bg-surface",
                  )}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => {
              const href = rowHref?.(row);
              return (
                <tr key={rowKey(row)} className="group hover:bg-surface-muted">
                  {columns.map((c) => {
                    const content = c.cell(row);
                    return (
                      <td
                        key={c.key}
                        data-col={c.key}
                        className={cn(
                          "h-10.5 px-3 whitespace-nowrap first:pl-4 last:pr-4",
                          c.numeric && "text-right tabular-nums",
                          c.lo && "@max-3xl:hidden",
                          c.key === first && "font-medium",
                          wide && c.key === first && "sticky left-0 z-10 bg-surface group-hover:bg-surface-muted",
                        )}
                      >
                        {c.truncate ? (
                          <span
                            className="block max-w-36 truncate"
                            title={typeof content === "string" ? content : undefined}
                          >
                            {content}
                          </span>
                        ) : href && c.key === first ? (
                          <Link href={href} className="text-action hover:underline">
                            {content}
                          </Link>
                        ) : (
                          content
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ul aria-label={label} className="hidden divide-y divide-border @max-lg:block">
        {rows.map((row) => (
          <ListRow key={rowKey(row)} href={rowHref?.(row)} {...phoneRow(row)} />
        ))}
      </ul>
    </div>
  );
}
