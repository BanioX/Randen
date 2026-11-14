import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';

/** What every chart of the kit takes. */
export interface ChartBaseProps {
  /**
   * The takeaway in words («Umsatz stieg von Montag bis Samstag auf CHF 4’820»): the accessible
   * name of the picture. Say what the chart shows, not that it is a chart.
   */
  summary: string;
  /** Header of the first column of the data table: «Tag», «Grund». */
  categoryLabel: string;
  /** Name of the values: column header and, with two series, the legend entry. */
  valueLabel: string;
  /** Formats a value for labels and for the data table. Default: the plain number. */
  formatValue?: ((value: number) => string) | undefined;
  /** Shows the data table under the chart instead of keeping it for screen readers only. */
  showTable?: boolean | undefined;
  className?: string | undefined;
}

/**
 * The width a chart has on screen, so one unit of its viewBox is one pixel and text keeps its
 * size on a phone and on a desk. `fallback` until measured (and where nothing can be measured).
 */
export function useChartWidth(fallback = 320): [RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const element = ref.current;
    if (element === null || typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const measured = entries[0]?.contentRect.width;
      if (measured !== undefined && measured > 0) {
        setWidth(Math.max(200, Math.round(measured)));
      }
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);
  return [ref, width];
}

export interface LegendItem {
  label: string;
  color: string;
  /** `line` for a line series, `box` for bars and areas, `dash` for a target line. */
  mark?: 'box' | 'line' | 'dash' | undefined;
  value?: string | undefined;
  detail?: string | undefined;
}

/**
 * The legend of a chart, in HTML: text keeps the size of the page and wraps. `column` lists the
 * values beside the names (donut), `row` only names the series.
 */
export function ChartLegend({
  items,
  layout = 'row',
}: {
  items: readonly LegendItem[];
  layout?: 'row' | 'column' | undefined;
}) {
  if (items.length === 0) {
    return null;
  }
  const mark = (item: LegendItem) =>
    item.mark === 'dash' ? (
      <span
        aria-hidden="true"
        style={{ borderColor: item.color }}
        className="w-4 shrink-0 border-t-2 border-dashed"
      />
    ) : (
      <span
        aria-hidden="true"
        style={{ backgroundColor: item.color }}
        className={`shrink-0 ${item.mark === 'line' ? 'h-0.5 w-4 rounded-full' : 'size-2.5 rounded-[3px]'}`}
      />
    );
  if (layout === 'row') {
    return (
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[0.8125rem] text-ink-muted">
        {items.map((item) => (
          <li key={item.label} className="flex items-center gap-1.5">
            {mark(item)}
            {item.label}
          </li>
        ))}
      </ul>
    );
  }
  return (
    <ul className="w-full min-w-0 flex-1 space-y-1.5 text-[0.9375rem]">
      {items.map((item) => (
        <li key={item.label} className="flex items-baseline gap-2">
          <span className="translate-y-[-1px] self-center">{mark(item)}</span>
          <span className="min-w-0 flex-1 break-words hyphens-calm">{item.label}</span>
          {item.value === undefined ? null : (
            <span className="shrink-0 font-semibold tabular-nums">{item.value}</span>
          )}
          {item.detail === undefined ? null : (
            <span className="w-11 shrink-0 text-right text-[0.8125rem] text-ink-muted tabular-nums">
              {item.detail}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

interface ChartTableProps {
  caption: string;
  headers: readonly string[];
  rows: readonly (readonly string[])[];
  footer?: readonly string[] | undefined;
  visible: boolean;
}

/** The values of a chart as a table: for screen readers always, for the eye on request. */
export function ChartTable({ caption, headers, rows, footer, visible }: ChartTableProps) {
  const cell = (index: number) => (index === 0 ? 'text-left' : 'text-right tabular-nums');
  return (
    <table className={visible ? 'mt-4 w-full border-separate border-spacing-0 text-sm' : 'sr-only'}>
      <caption className={visible ? 'sr-only' : undefined}>{caption}</caption>
      <thead>
        <tr>
          {headers.map((header, index) => (
            <th
              key={header}
              scope="col"
              className={`border-b border-line py-1.5 font-semibold text-ink-muted ${cell(index)}`}
            >
              {header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, rowIndex) => (
          // Rows of a chart have no id of their own; their order is their identity.
          <tr key={rowIndex}>
            {row.map((value, index) =>
              index === 0 ? (
                <th
                  key={index}
                  scope="row"
                  className={`py-1.5 font-normal ${rowIndex === 0 ? '' : 'border-t border-line'} ${cell(index)}`}
                >
                  {value}
                </th>
              ) : (
                <td
                  key={index}
                  className={`py-1.5 ${rowIndex === 0 ? '' : 'border-t border-line'} ${cell(index)}`}
                >
                  {value}
                </td>
              ),
            )}
          </tr>
        ))}
      </tbody>
      {footer === undefined ? null : (
        <tfoot>
          <tr>
            {footer.map((value, index) =>
              index === 0 ? (
                <th
                  key={index}
                  scope="row"
                  className={`border-t border-line-strong py-1.5 font-semibold ${cell(index)}`}
                >
                  {value}
                </th>
              ) : (
                <td
                  key={index}
                  className={`border-t border-line-strong py-1.5 font-semibold ${cell(index)}`}
                >
                  {value}
                </td>
              ),
            )}
          </tr>
        </tfoot>
      )}
    </table>
  );
}

/**
 * The frame of a chart: the picture, its legend and its data table. `relative`, so the hidden
 * table stays inside a scroll container.
 */
export function ChartFigure({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string | undefined;
}) {
  return <figure className={`relative min-w-0 ${className}`}>{children}</figure>;
}

/** Text in a chart: 12 px in the font of the page. */
export const CHART_FONT = { fontSize: 12, fontFamily: 'inherit' } as const;

/**
 * Classes of a measured chart. `transition-none` on everything inside: browsers treat geometry
 * (`d`, `x`, `width`) as CSS properties, and a page-wide transition rule would otherwise animate
 * the marks from the fallback width to the measured one while the labels jump at once.
 */
export const CHART_SVG = 'block overflow-visible [&_*]:transition-none';
