/**
 * Colours of the charts (docs/design.md): CSS variables, so dark mode follows by itself.
 * Six series in a fixed order; a single series is always Rotwein. A colour belongs to the series,
 * never to its rank: filtering must not repaint what stays.
 */
export const SERIES_COLORS = [
  'var(--color-chart-1)',
  'var(--color-chart-2)',
  'var(--color-chart-3)',
  'var(--color-chart-4)',
  'var(--color-chart-5)',
  'var(--color-chart-6)',
] as const;

/** What is folded into «Übrige» and everything beyond the sixth series. */
export const MUTED_COLOR = 'var(--color-ink-muted)';

export function seriesColor(index: number): string {
  return SERIES_COLORS[index] ?? MUTED_COLOR;
}

/** Status in a chart: only where the colour means in order, watch or wrong. */
export type ChartTone = 'ok' | 'soon' | 'danger' | 'neutral';

const TONE_COLORS: Record<ChartTone, string> = {
  ok: 'var(--color-ok)',
  soon: 'var(--color-soon)',
  danger: 'var(--color-danger)',
  neutral: MUTED_COLOR,
};

export function toneColor(tone: ChartTone): string {
  return TONE_COLORS[tone];
}

/** Furniture of a chart: recessive, so the data is the only thing that speaks. */
export const AXIS = {
  grid: 'var(--color-line)',
  label: 'var(--color-ink-muted)',
  text: 'var(--color-ink)',
  surface: 'var(--color-surface)',
} as const;
