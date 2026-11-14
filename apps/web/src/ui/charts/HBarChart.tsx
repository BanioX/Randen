import { formatDecimal } from '@randen/core';
import { displayMessages } from '../messages.display';
import { seriesColor, toneColor, type ChartTone } from './colors';
import { ChartFigure, ChartTable, type ChartBaseProps } from './frame';
import { px, safe } from './scale';

export interface HBarDatum {
  label: string;
  value: number;
  /** A status colour for this bar, only where colour means in order, watch or wrong. */
  tone?: ChartTone | undefined;
}

interface HBarChartProps extends ChartBaseProps {
  /** The rows, largest first (the chart keeps the order it gets). */
  data: readonly HBarDatum[];
}

/**
 * Ranked horizontal bars: «Abschreiber nach Grund», «die teuersten Zutaten». Names and values are
 * text of the page, so long names wrap; the bars share one baseline and one colour. On a narrow
 * card the bar runs under its name, on a wide one between name and value.
 */
export function HBarChart({
  summary,
  categoryLabel,
  valueLabel,
  data,
  formatValue = formatDecimal,
  showTable = false,
  className,
}: HBarChartProps) {
  const rows = data.map((datum) => ({ ...datum, value: safe(datum.value) }));
  const longest = Math.max(0, ...rows.map((row) => row.value));

  return (
    <ChartFigure className={className}>
      <div className="@container">
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-muted">{displayMessages.chart.empty}</p>
        ) : (
          <div
            role="img"
            aria-label={summary}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 @md:grid-flow-row-dense @md:grid-cols-[minmax(0,11rem)_minmax(0,1fr)_auto] @md:gap-y-2.5"
          >
            {rows.map((row, index) => {
              const share = longest > 0 ? (row.value / longest) * 100 : 0;
              const color = row.tone === undefined ? seriesColor(0) : toneColor(row.tone);
              return [
                <span
                  key={`${index}-label`}
                  className={`text-[0.9375rem] break-words hyphens-calm @md:col-start-1 ${index === 0 ? '' : 'mt-3 @md:mt-0'}`}
                >
                  {row.label}
                </span>,
                <span
                  key={`${index}-value`}
                  className={`text-right text-[0.9375rem] font-semibold tabular-nums @md:col-start-3 ${index === 0 ? '' : 'mt-3 @md:mt-0'}`}
                >
                  {formatValue(row.value)}
                </span>,
                <svg
                  key={`${index}-bar`}
                  width="100%"
                  height={10}
                  aria-hidden="true"
                  className="col-span-2 mt-1.5 block @md:col-span-1 @md:col-start-2 @md:mt-0"
                >
                  <title>{`${row.label}: ${formatValue(row.value)}`}</title>
                  {row.value <= 0 ? null : (
                    <>
                      <rect width={`${px(share)}%`} height={10} rx={4} fill={color} />
                      {/* Square at the baseline: the rounding belongs to the data end only. */}
                      <rect width={4} height={10} fill={color} />
                    </>
                  )}
                </svg>,
              ];
            })}
          </div>
        )}
      </div>
      <ChartTable
        visible={showTable}
        caption={displayMessages.chart.tableCaption(valueLabel, categoryLabel)}
        headers={[categoryLabel, valueLabel]}
        rows={rows.map((row) => [row.label, formatValue(row.value)])}
      />
    </ChartFigure>
  );
}
