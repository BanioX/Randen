import { formatDecimal } from '@randen/core';
import { displayMessages } from '../messages.display';
import { AXIS, seriesColor } from './colors';
import {
  CHART_FONT,
  CHART_SVG,
  ChartFigure,
  ChartLegend,
  ChartTable,
  useChartWidth,
  type ChartBaseProps,
} from './frame';
import { labelIndices, niceScale, px, safe, textWidth } from './scale';

export interface LineDatum {
  /** The point on the x axis: a day («Mo», «14.11.»). Keep it short. */
  label: string;
  value: number;
  /** The value of the second series, if the chart has one. */
  second?: number | undefined;
}

interface LineChartProps extends ChartBaseProps {
  /** The points in the order of time. */
  data: readonly LineDatum[];
  /** Name of the second series; with it `second` of each datum is drawn. */
  secondLabel?: string | undefined;
  /** Formats the ticks of the axis, if they should be shorter than the labels. */
  formatTick?: ((value: number) => string) | undefined;
  /** Height in pixels. */
  height?: number | undefined;
}

const TOP = 22;
const BOTTOM = 26;
const RIGHT = 10;

/**
 * One or two series over days: a 2 px line, a light wash under the first series, the last value
 * named at the end of the line. Both series share one axis that starts at zero.
 */
export function LineChart({
  summary,
  categoryLabel,
  valueLabel,
  data,
  secondLabel,
  formatValue = formatDecimal,
  formatTick = formatValue,
  showTable = false,
  height = 220,
  className,
}: LineChartProps) {
  const [ref, width] = useChartWidth();
  const two = secondLabel !== undefined;
  const points = data.map((datum) => ({
    label: datum.label,
    first: safe(datum.value),
    second: two ? safe(datum.second) : 0,
  }));
  const scale = niceScale(Math.max(0, ...points.flatMap((point) => [point.first, point.second])));

  const tickLabels = scale.ticks.map(formatTick);
  const left = Math.min(84, Math.max(20, ...tickLabels.map((label) => textWidth(label))) + 8);
  const plotWidth = Math.max(40, width - left - RIGHT);
  const plotHeight = Math.max(40, height - TOP - BOTTOM);
  const baseline = TOP + plotHeight;
  const step = points.length > 1 ? plotWidth / (points.length - 1) : 0;
  const x = (index: number) => (points.length > 1 ? left + step * index : left + plotWidth / 2);
  const y = (value: number) => baseline - (value / scale.max) * plotHeight;

  const line = (pick: (point: (typeof points)[number]) => number) =>
    points
      .map((point, index) => `${index === 0 ? 'M' : 'L'}${px(x(index))},${px(y(pick(point)))}`)
      .join('');
  const firstLine = line((point) => point.first);
  const lastIndex = points.length - 1;
  const last = points[lastIndex];

  const xLabels = new Set(
    labelIndices(
      points.length,
      step === 0 ? plotWidth : step,
      Math.max(0, ...points.map((point) => textWidth(point.label))),
    ),
  );

  /** The value at the end of a line, above its dot; below it when there is no room above. */
  function endLabel(value: number, text: string) {
    const dotY = y(value);
    return (
      <text
        x={px(x(lastIndex) + 6)}
        y={px(dotY - 10 < 12 ? dotY + 20 : dotY - 10)}
        textAnchor="end"
        fill={AXIS.text}
        fontWeight={600}
        stroke={AXIS.surface}
        strokeWidth={4}
        strokeLinejoin="round"
        paintOrder="stroke"
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {text}
      </text>
    );
  }

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

          {points.map((point, index) =>
            xLabels.has(index) ? (
              <text
                key={`${index}-${point.label}`}
                x={px(x(index))}
                y={px(baseline + 18)}
                // The outer labels stay inside the chart.
                textAnchor={
                  points.length === 1
                    ? 'middle'
                    : index === 0
                      ? 'start'
                      : index === lastIndex
                        ? 'end'
                        : 'middle'
                }
                fill={AXIS.label}
              >
                {point.label}
              </text>
            ) : null,
          )}

          {points.length > 1 ? (
            <>
              <path
                d={`${firstLine}L${px(x(lastIndex))},${px(baseline)}L${px(x(0))},${px(baseline)}Z`}
                fill={seriesColor(0)}
                fillOpacity={0.1}
              />
              {two ? (
                <path
                  d={line((point) => point.second)}
                  fill="none"
                  stroke={seriesColor(1)}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              ) : null}
              <path
                d={firstLine}
                fill="none"
                stroke={seriesColor(0)}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </>
          ) : null}

          {last === undefined ? (
            <text
              x={px(left + plotWidth / 2)}
              y={px(TOP + plotHeight / 2)}
              textAnchor="middle"
              fill={AXIS.label}
            >
              {displayMessages.chart.empty}
            </text>
          ) : (
            <>
              {/* End dots carry a ring in the colour of the card, so they stay clear on the line. */}
              {two ? (
                <circle
                  cx={px(x(lastIndex))}
                  cy={px(y(last.second))}
                  r={4}
                  fill={seriesColor(1)}
                  stroke={AXIS.surface}
                  strokeWidth={2}
                />
              ) : null}
              <circle
                cx={px(x(lastIndex))}
                cy={px(y(last.first))}
                r={4}
                fill={seriesColor(0)}
                stroke={AXIS.surface}
                strokeWidth={2}
              />
              {/* Two end labels only where the lines end apart; the legend names both anyway. */}
              {two && Math.abs(y(last.second) - y(last.first)) >= 18
                ? endLabel(last.second, formatValue(last.second))
                : null}
              {endLabel(last.first, formatValue(last.first))}
            </>
          )}

          {/* One hit area per point: the pointer finds the day, not the 2 px line. */}
          {points.map((point, index) => (
            <rect
              key={`${index}-${point.label}`}
              x={px(points.length > 1 ? x(index) - step / 2 : left)}
              y={TOP}
              width={px(points.length > 1 ? step : plotWidth)}
              height={px(plotHeight)}
              fill="transparent"
            >
              <title>
                {two
                  ? `${point.label}: ${valueLabel} ${formatValue(point.first)}, ${secondLabel} ${formatValue(point.second)}`
                  : `${point.label}: ${formatValue(point.first)}`}
              </title>
            </rect>
          ))}
        </svg>
      </div>
      <ChartLegend
        items={
          two
            ? [
                { label: valueLabel, color: seriesColor(0), mark: 'line' },
                { label: secondLabel, color: seriesColor(1), mark: 'line' },
              ]
            : []
        }
      />
      <ChartTable
        visible={showTable}
        caption={displayMessages.chart.tableCaption(valueLabel, categoryLabel)}
        headers={two ? [categoryLabel, valueLabel, secondLabel] : [categoryLabel, valueLabel]}
        rows={points.map((point) =>
          two
            ? [point.label, formatValue(point.first), formatValue(point.second)]
            : [point.label, formatValue(point.first)],
        )}
      />
    </ChartFigure>
  );
}
