import { MUTED_COLOR, seriesColor } from './colors';
import { px, safe } from './scale';

interface SparklineProps {
  /** The values in the order of time; the last one is today. */
  values: readonly number[];
  /** The course in words: the accessible name («Lagerwert seit Montag leicht gestiegen»). */
  summary: string;
  /** On the dark card (Traube): the line in the quiet tone of that card, the point in Kork. */
  onDark?: boolean | undefined;
  /** The size on screen; the picture keeps its proportions. Default `h-7 w-24`. */
  className?: string | undefined;
}

const WIDTH = 96;
const HEIGHT = 28;
const PAD = 5;

/**
 * The course of one figure in the size of a word: a quiet line, with the latest point in Rotwein.
 * It shows the shape, not the values; those stand beside it.
 */
export function Sparkline({
  values,
  summary,
  onDark = false,
  className = 'h-7 w-24',
}: SparklineProps) {
  const points = values.map(safe);
  const highest = Math.max(0, ...points);
  const lowest = points.length === 0 ? 0 : Math.min(...points);
  const range = highest - lowest;
  const step = points.length > 1 ? (WIDTH - 2 * PAD) / (points.length - 1) : 0;
  const x = (index: number) => (points.length > 1 ? PAD + step * index : WIDTH / 2);
  // A flat course runs through the middle.
  const y = (value: number) =>
    range > 0 ? HEIGHT - PAD - ((value - lowest) / range) * (HEIGHT - 2 * PAD) : HEIGHT / 2;
  const last = points[points.length - 1];
  return (
    <svg
      role="img"
      aria-label={summary}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className={`block ${className}`}
    >
      {points.length > 1 ? (
        <path
          d={points
            .map((value, index) => `${index === 0 ? 'M' : 'L'}${px(x(index))},${px(y(value))}`)
            .join('')}
          fill="none"
          stroke={onDark ? 'var(--color-mist)' : MUTED_COLOR}
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ) : null}
      {last === undefined ? null : (
        <circle
          cx={px(x(points.length - 1))}
          cy={px(y(last))}
          r={3.5}
          fill={onDark ? 'var(--color-cork)' : seriesColor(0)}
          stroke={onDark ? 'var(--color-grape)' : 'var(--color-surface)'}
          strokeWidth={1.5}
        />
      )}
    </svg>
  );
}
