import { formatDecimal } from '@randen/core';
import { displayMessages } from '../messages.display';
import { AXIS, seriesColor, toneColor, type ChartTone } from './colors';
import {
  CHART_FONT,
  CHART_SVG,
  ChartFigure,
  ChartLegend,
  ChartTable,
  useChartWidth,
  type ChartBaseProps,
  type LegendItem,
} from './frame';
import { columnPath, labelIndices, niceScale, px, safe, textWidth } from './scale';

export interface BarDatum {
  /** The category under the bar: a weekday, a week, a month. Keep it short. */
  label: string;
  value: number;
  /** The value of the second series, if the chart has one. */
  second?: number | undefined;
  /** A status colour for this bar, only where colour means in order, watch or wrong. */
  tone?: ChartTone | undefined;
}

interface BarChartProps extends ChartBaseProps {
  /** Up to about fourteen categories, in their natural order. */
  data: readonly BarDatum[];
  /** Name of the second series; with it `second` of each datum is drawn. */
  secondLabel?: string | undefined;
  /** Two series on top of each other (parts of a whole) or side by side (to compare). */
  mode?: 'stacked' | 'grouped' | undefined;
  /** A dashed line across the chart, named in the legend: «Tagesziel CHF 3’000». */
  target?: { value: number; label: string } | undefined;
  /** Formats the ticks of the axis, if they should be shorter than the labels. */
  formatTick?: ((value: number) => string) | undefined;
  /** Which bars carry their value: all that fit (`auto`), `all`, only the highest (`max`), `none`. */
  valueLabels?: 'auto' | 'all' | 'max' | 'none' | undefined;
  /** What the status colours mean, for the legend: `{ danger: 'über dem Budget' }`. */
  toneLabels?: Partial<Record<ChartTone, string>> | undefined;
  /** Height in pixels. */
  height?: number | undefined;
}

const TOP = 22;
const BOTTOM = 26;
const GAP = 2;

/**
 * Vertical bars for a handful of categories. Thin bars (at most 24 px) with air between them,
 * rounded at the data end, standing on one baseline; values on the caps where they fit.
 */
export function BarChart({
  summary,
  categoryLabel,
  valueLabel,
  data,
  secondLabel,
  mode = 'stacked',
  target,
  formatValue = formatDecimal,
  formatTick = formatValue,
  valueLabels = 'auto',
  toneLabels,
  showTable = false,
  height = 220,
  className,
}: BarChartProps) {
  const [ref, width] = useChartWidth();
  const two = secondLabel !== undefined;
  const grouped = two && mode === 'grouped';
  const bars = data.map((datum) => ({
    label: datum.label,
    tone: datum.tone,
    first: safe(datum.value),
    second: two ? safe(datum.second) : 0,
  }));
  const tops = bars.map((bar) =>
    grouped ? Math.max(bar.first, bar.second) : bar.first + bar.second,
  );
  const scale = niceScale(Math.max(0, ...tops, safe(target?.value)));

  const tickLabels = scale.ticks.map(formatTick);
  const left = Math.min(84, Math.max(20, ...tickLabels.map((label) => textWidth(label))) + 8);
  const right = 4;
  const plotWidth = Math.max(40, width - left - right);
  const plotHeight = Math.max(40, height - TOP - BOTTOM);
  const baseline = TOP + plotHeight;
  const y = (value: number) => baseline - (value / scale.max) * plotHeight;

  const band = plotWidth / Math.max(1, bars.length);
  const barWidth = grouped
    ? Math.max(2, Math.min(24, (band * 0.72 - GAP) / 2))
    : Math.max(2, Math.min(24, band * 0.62));
  const groupWidth = grouped ? barWidth * 2 + GAP : barWidth;

  const xLabels = new Set(
    labelIndices(bars.length, band, Math.max(0, ...bars.map((bar) => textWidth(bar.label)))),
  );

  // A value on every cap only where each one fits its slot; otherwise the highest bar speaks.
  const capTexts = bars.map((bar) => formatValue(grouped ? bar.first : bar.first + bar.second));
  const allFit = capTexts.every((text) => textWidth(text) <= band - 4);
  const highest = tops.indexOf(Math.max(...tops));
  const showCap = (index: number) =>
    !grouped &&
    (tops[index] ?? 0) > 0 &&
    (valueLabels === 'all' ||
      (valueLabels === 'auto' && (allFit || index === highest)) ||
      (valueLabels === 'max' && index === highest));

  const firstColor = seriesColor(0);
  const secondColor = seriesColor(1);
  const usedTones = [...new Set(bars.flatMap((bar) => (bar.tone === undefined ? [] : [bar.tone])))];
  const legend: LegendItem[] = [
    ...(two
      ? [
          { label: valueLabel, color: firstColor },
          { label: secondLabel, color: secondColor },
        ]
      : usedTones.flatMap((tone) => {
          const label = toneLabels?.[tone];
          return label === undefined ? [] : [{ label, color: toneColor(tone) }];
        })),
    ...(target === undefined
      ? []
      : [{ label: target.label, color: AXIS.text, mark: 'dash' as const }]),
  ];

  const targetY = target === undefined ? undefined : y(safe(target.value));

  return (
    <ChartFigure className={className}>
      <div ref={ref}>
        <svg
          role="img"
          aria-label={summary}
          viewBox={`0 0 ${width} ${height}`}
          width="100%"
          height={height}
          className={CHART_SVG}
          style={CHART_FONT}
        >
          {scale.ticks.map((tick, index) => (
            <g key={tick}>
              <line
                x1={px(left)}
                x2={px(left + plotWidth)}
                y1={px(y(tick))}
                y2={px(y(tick))}
                stroke={AXIS.grid}
                strokeWidth={1}
              />
              <text
                x={px(left - 8)}
                y={px(y(tick) + 4)}
                textAnchor="end"
                fill={AXIS.label}
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {tickLabels[index]}
              </text>
            </g>
          ))}

          {targetY === undefined ? null : (
            // Dashed because it is a threshold, not data. Under the bars; the legend names it.
            <line
              x1={px(left)}
              x2={px(left + plotWidth)}
              y1={px(targetY)}
              y2={px(targetY)}
              stroke={AXIS.text}
              strokeWidth={1.5}
              strokeDasharray="5 4"
            />
          )}

          {bars.map((bar, index) => {
            const x = left + band * index + (band - groupWidth) / 2;
            const color = bar.tone === undefined ? firstColor : toneColor(bar.tone);
            const firstTop = y(bar.first);
            const stackTop = y(bar.first + bar.second);
            // Between two stacked parts a gap in the colour of the card, never a border.
            const gap = !grouped && bar.first > 0 && bar.second > 0 ? GAP : 0;
            return (
              <g key={`${index}-${bar.label}`}>
                <title>
                  {two
                    ? `${bar.label}: ${valueLabel} ${formatValue(bar.first)}, ${secondLabel} ${formatValue(bar.second)}`
                    : `${bar.label}: ${formatValue(bar.first)}`}
                </title>
                {/* The hit area is the whole slot, not only the thin bar. */}
                <rect
                  x={px(left + band * index)}
                  y={TOP}
                  width={px(band)}
                  height={px(plotHeight)}
                  fill="transparent"
                />
                {bar.first <= 0 ? null : grouped || bar.second <= 0 ? (
                  <path d={columnPath(x, firstTop, barWidth, baseline - firstTop)} fill={color} />
                ) : (
                  <rect
                    x={px(x)}
                    y={px(firstTop + gap / 2)}
                    width={px(barWidth)}
                    height={px(Math.max(0, baseline - firstTop - gap / 2))}
                    fill={color}
                  />
                )}
                {bar.second <= 0 ? null : grouped ? (
                  <path
                    d={columnPath(
                      x + barWidth + GAP,
                      y(bar.second),
                      barWidth,
                      baseline - y(bar.second),
                    )}
                    fill={secondColor}
                  />
                ) : (
                  <path
                    d={columnPath(
                      x,
                      stackTop,
                      barWidth,
                      Math.max(0, firstTop - stackTop - gap / 2),
                    )}
                    fill={secondColor}
                  />
                )}
                {showCap(index) ? (
                  <text
                    x={px(left + band * index + band / 2)}
                    y={px((grouped ? firstTop : stackTop) - 6)}
                    textAnchor="middle"
                    fill={AXIS.text}
                    fontWeight={600}
                    // A halo in the colour of the card where the label crosses the target line.
                    stroke={AXIS.surface}
                    strokeWidth={4}
                    strokeLinejoin="round"
                    paintOrder="stroke"
                    style={{ fontVariantNumeric: 'tabular-nums' }}
                  >
                    {capTexts[index]}
                  </text>
                ) : null}
                {xLabels.has(index) ? (
                  <text
                    x={px(left + band * index + band / 2)}
                    y={px(baseline + 18)}
                    textAnchor="middle"
                    fill={AXIS.label}
                  >
                    {bar.label}
                  </text>
                ) : null}
              </g>
            );
          })}

          {bars.length === 0 ? (
            <text
              x={px(left + plotWidth / 2)}
              y={px(TOP + plotHeight / 2)}
              textAnchor="middle"
              fill={AXIS.label}
            >
              {displayMessages.chart.empty}
            </text>
          ) : null}
        </svg>
      </div>
      <ChartLegend items={legend} />
      <ChartTable
        visible={showTable}
        caption={displayMessages.chart.tableCaption(valueLabel, categoryLabel)}
        headers={two ? [categoryLabel, valueLabel, secondLabel] : [categoryLabel, valueLabel]}
        rows={bars.map((bar) =>
          two
            ? [bar.label, formatValue(bar.first), formatValue(bar.second)]
            : [bar.label, formatValue(bar.first)],
        )}
        footer={target === undefined ? undefined : [target.label, formatValue(safe(target.value))]}
      />
    </ChartFigure>
  );
}
