import { useId, type MouseEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { displayMessages } from './messages.display';

export interface DataTableColumn<TRow> {
  /** Stable key of the column; the footer refers to it. */
  key: string;
  header: string;
  /** Numbers and money go `right` and get tabular figures. */
  align?: 'left' | 'right' | undefined;
  render: (row: TRow) => ReactNode;
  /** Hides the column below tablet (`md`) or desktop (`lg`) width. */
  hideBelow?: 'md' | 'lg' | undefined;
  /** A CSS width for the column, e.g. `8rem` or `30%`. */
  width?: string | undefined;
}

interface DataTableProps<TRow> {
  columns: readonly DataTableColumn<TRow>[];
  rows: readonly TRow[];
  getRowKey: (row: TRow) => string;
  /** What the table holds. Always read out; shown as its title unless `hideCaption`. */
  caption: string;
  hideCaption?: boolean | undefined;
  /** Where a row leads: the first cell becomes the link, the whole row reacts to the pointer. */
  rowLink?: ((row: TRow) => string | undefined) | undefined;
  /** The totals row: one cell per column key; columns without an entry stay empty. */
  footer?: Readonly<Record<string, ReactNode>> | undefined;
  /** What stands in the table while it has no rows. */
  empty?: ReactNode | undefined;
  /** A CSS height, e.g. `24rem`: beyond it the rows scroll under the sticky header. */
  maxHeight?: string | undefined;
}

const hidden = { md: 'hidden md:table-cell', lg: 'hidden lg:table-cell' } as const;
const hiddenCol = { md: 'hidden md:table-column', lg: 'hidden lg:table-column' } as const;

function cellClasses<TRow>(column: DataTableColumn<TRow>): string {
  // Figures never break: «CHF 12.50» stays on one line.
  const align =
    column.align === 'right' ? 'text-right whitespace-nowrap tabular-nums' : 'text-left';
  return `${align} ${column.hideBelow === undefined ? '' : hidden[column.hideBelow]}`;
}

/**
 * A real table for numbers: hairlines, no zebra, money right-aligned in tabular figures. It sits in
 * its own scroll container, so a wide table scrolls inside its card and never moves the page.
 */
export function DataTable<TRow>({
  columns,
  rows,
  getRowKey,
  caption,
  hideCaption = false,
  rowLink,
  footer,
  empty,
  maxHeight,
}: DataTableProps<TRow>) {
  const captionId = useId();
  const navigate = useNavigate();

  /** A click anywhere in the row follows its link; the link itself serves keyboard and readers. */
  function onRowClick(event: MouseEvent<HTMLTableRowElement>, href: string) {
    const target = event.target instanceof Element ? event.target : null;
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      target?.closest('a, button, input, select, textarea, label') ||
      window.getSelection()?.toString()
    ) {
      return;
    }
    void navigate(href);
  }

  return (
    <div
      role="region"
      aria-labelledby={captionId}
      // Focusable, so a keyboard can scroll a table that is wider than its card.
      tabIndex={0}
      style={maxHeight === undefined ? undefined : { maxHeight }}
      className="relative min-w-0 overflow-auto overscroll-x-contain rounded-2xl bg-surface shadow-card focus-visible:outline-2 focus-visible:-outline-offset-2"
    >
      <table className="w-full border-separate border-spacing-0 text-[0.9375rem]">
        <caption
          id={captionId}
          className={hideCaption ? 'sr-only' : 'px-4 pt-4 pb-1 text-left text-xl font-semibold'}
        >
          {caption}
        </caption>
        <colgroup>
          {columns.map((column) => (
            <col
              key={column.key}
              style={column.width === undefined ? undefined : { width: column.width }}
              className={column.hideBelow === undefined ? undefined : hiddenCol[column.hideBelow]}
            />
          ))}
        </colgroup>
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={`sticky top-0 whitespace-nowrap z-1 border-b border-line bg-surface px-2.5 py-2.5 align-bottom first:pl-4 last:pr-4 md:px-4 text-[0.8125rem] font-semibold text-ink-muted ${cellClasses(column)}`}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-8 text-center text-ink-muted">
                {empty ?? displayMessages.table.empty}
              </td>
            </tr>
          ) : (
            rows.map((row, rowIndex) => {
              const href = rowLink?.(row);
              const line = rowIndex === 0 ? '' : 'border-t border-line';
              return (
                <tr
                  key={getRowKey(row)}
                  onClick={
                    href === undefined
                      ? undefined
                      : (event) => {
                          onRowClick(event, href);
                        }
                  }
                  className={
                    href === undefined
                      ? undefined
                      : 'cursor-pointer hover:bg-surface-muted has-[a:focus-visible]:bg-surface-muted'
                  }
                >
                  {columns.map((column, columnIndex) => {
                    const classes = `px-2.5 py-3 align-middle first:pl-4 last:pr-4 md:px-4 ${line} ${cellClasses(column)}`;
                    if (columnIndex > 0) {
                      return (
                        <td key={column.key} className={classes}>
                          {column.render(row)}
                        </td>
                      );
                    }
                    // The first column names the row.
                    return (
                      <th
                        key={column.key}
                        scope="row"
                        // The name gives way first: it wraps, a long word even inside the word.
                        className={`font-semibold wrap-anywhere hyphens-calm ${classes}`}
                      >
                        {href === undefined ? (
                          column.render(row)
                        ) : (
                          <Link
                            to={href}
                            className="-my-3 flex min-h-11 items-center rounded-lg py-1 text-wine-800"
                          >
                            {column.render(row)}
                          </Link>
                        )}
                      </th>
                    );
                  })}
                </tr>
              );
            })
          )}
        </tbody>
        {footer === undefined || rows.length === 0 ? null : (
          <tfoot>
            <tr>
              {columns.map((column, columnIndex) => {
                const classes = `border-t border-line-strong px-2.5 py-3 font-semibold first:pl-4 last:pr-4 md:px-4 ${cellClasses(column)}`;
                return columnIndex === 0 ? (
                  <th key={column.key} scope="row" className={classes}>
                    {footer[column.key]}
                  </th>
                ) : (
                  <td key={column.key} className={classes}>
                    {footer[column.key]}
                  </td>
                );
              })}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
