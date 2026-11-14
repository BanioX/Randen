import { formatDecimal, formatPercent } from '@randen/core';
import { displayMessages } from '../messages.display';
import { MUTED_COLOR, seriesColor, toneColor, type ChartTone } from './colors';
import { ChartFigure, ChartLegend, ChartTable, type ChartBaseProps } from './frame';
import { px, safe } from './scale';

export interface DonutPart {
  label: string;
  value: number;
  /** A status colour for this part, only where colour means in order, watch or wrong. */
  tone?: ChartTone | undefined;
}

interface DonutProps extends ChartBaseProps {
  /** The parts of one whole. More than six are folded: five stay, the rest becomes «Übrige». */
  parts: readonly DonutPart[];
  /** The figure in the middle: the total, formatted by the page. */
  centerValue?: string | undefined;
  /** What the figure in the middle is: «Total», «Gerichte». */
  centerLabel?: string | undefined;
  /** Adds each part's share in percent to the legend. */
  showShare?: boolean | undefined;
}

const MAX_PARTS = 6;
const SIZE = 144;
const RADIUS = 56;
const STROKE = 16;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
/** The gap between two parts, in the colour of the card. */
const GAP = 2;

interface Part {
  label: string;
  value: number;
  color: string;
}

/** Where each part starts on the ring and how long it is; parts without a value draw nothing. */
function arcsOf(parts: readonly Part[], total: number) {
  const arcs: (Part & { start: number; length: number })[] = [];
  let start = 0;
  for (const part of parts) {
    const length = total > 0 ? (part.value / total) * CIRCUMFERENCE : 0;
    if (part.value > 0) {
      arcs.push({ ...part, start, length });
    }
    start += length;
  }
  return arcs;
}

/**
 * How one whole splits into a few parts, with the total in the middle and every value in the
 * legend beside it. For comparing close values use `HBarChart`: bars on one baseline are read
 * more exactly than slices.
 */
export function Donut({
  summary,
  categoryLabel,
  valueLabel,
  parts,
  centerValue,
  centerLabel,
  formatValue = formatDecimal,
  showShare = false,
  showTable = false,
  className,
}: DonutProps) {
  const cleaned = parts.map((part, index) => ({
    label: part.label,
    value: safe(part.value),
    color: part.tone === undefined ? seriesColor(index) : toneColor(part.tone),
  }));
  const shown =
    cleaned.length <= MAX_PARTS
      ? cleaned
      : [
          ...cleaned.slice(0, MAX_PARTS - 1),
          {
            label: displayMessages.chart.other,
            value: cleaned.slice(MAX_PARTS - 1).reduce((sum, part) => sum + part.value, 0),
            color: MUTED_COLOR,
          },
        ];
  const total = shown.reduce((sum, part) => sum + part.value, 0);
  const share = (value: number) =>
    formatPercent(total > 0 ? Math.round((value / total) * 10_000) : 0, { digits: 0 });

  const arcs = arcsOf(shown, total);
  const gap = arcs.length > 1 ? GAP : 0;

  return (
    <ChartFigure className={className}>
      <div className="@container">
        <div className="flex flex-col items-center gap-4 @sm:flex-row @sm:gap-6">
          <div className="relative size-36 shrink-0">
            <svg
              role="img"
              aria-label={summary}
              viewBox={`0 0 ${SIZE} ${SIZE}`}
              className="block size-full -rotate-90"
            >
              <circle
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={RADIUS}
                fill="none"
                stroke="var(--color-surface-muted)"
                strokeWidth={STROKE}
              />
              {arcs.map((arc, index) => (
                <circle
                  key={`${index}-${arc.label}`}
                  cx={SIZE / 2}
                  cy={SIZE / 2}
                  r={RADIUS}
                  fill="none"
                  stroke={arc.color}
                  strokeWidth={STROKE}
                  strokeDasharray={`${px(Math.max(0.5, arc.length - gap))} ${px(CIRCUMFERENCE)}`}
                  strokeDashoffset={px(-(arc.start + gap / 2))}
                >
                  <title>{`${arc.label}: ${formatValue(arc.value)} (${share(arc.value)})`}</title>
                </circle>
              ))}
            </svg>
            {centerValue === undefined && centerLabel === undefined ? null : (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-6 text-center"
              >
                {centerValue === undefined ? null : (
                  <span className="text-lg leading-tight font-semibold tabular-nums">
                    {centerValue}
                  </span>
                )}
                {centerLabel === undefined ? null : (
                  <span className="text-xs text-ink-muted">{centerLabel}</span>
                )}
              </div>
            )}
          </div>
          <ChartLegend
            layout="column"
            items={shown.map((part) => ({
              label: part.label,
              color: part.color,
              value: formatValue(part.value),
              detail: showShare ? share(part.value) : undefined,
            }))}
          />
        </div>
      </div>
      <ChartTable
        visible={showTable}
        caption={displayMessages.chart.tableCaption(valueLabel, categoryLabel)}
        headers={[categoryLabel, valueLabel, displayMessages.chart.share]}
        rows={shown.map((part) => [part.label, formatValue(part.value), share(part.value)])}
      />
    </ChartFigure>
  );
}
