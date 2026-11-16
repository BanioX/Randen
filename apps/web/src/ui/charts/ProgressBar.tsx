import { px, safe } from './scale';

export type ProgressTone = 'wine' | 'ok' | 'soon' | 'danger' | 'neutral';

interface ProgressBarProps {
  /** What is measured: «Einkaufsbudget November». */
  label: string;
  value: number;
  /** The whole: the budget, the target. */
  max: number;
  /** Value and whole in words, formatted by the page: «CHF 6’240 von CHF 9’000». */
  valueText: string;
  /**
   * The takeaway in words: the accessible name of the bar («69 % des Budgets verbraucht, der
   * Monat ist zu 47 % vorbei»).
   */
  summary: string;
  /** `wine` is plain progress; a status tone only where the page judges the value. */
  tone?: ProgressTone | undefined;
  /** A tick on the bar on the same scale as `value`, e.g. where the month stands today. */
  marker?: { value: number; label: string } | undefined;
  /** One quiet line under the bar. */
  hint?: string | undefined;
  className?: string | undefined;
}

/** Fill and track: the track is the light tint of the same colour, so the state reads at once. */
const looks: Record<ProgressTone, { fill: string; track: string }> = {
  wine: { fill: 'var(--color-wine-700)', track: 'var(--color-wine-100)' },
  ok: { fill: 'var(--color-ok)', track: 'var(--color-ok-bg)' },
  soon: { fill: 'var(--color-soon)', track: 'var(--color-soon-bg)' },
  danger: { fill: 'var(--color-danger)', track: 'var(--color-danger-bg)' },
  neutral: { fill: 'var(--color-ink-muted)', track: 'var(--color-surface-muted)' },
};

/**
 * One value against its whole: a thin bar with the name and the figures above it. More than the
 * whole fills the bar and no more; say «über dem Budget» in `valueText` and pick `danger`.
 */
export function ProgressBar({
  label,
  value,
  max,
  valueText,
  summary,
  tone = 'wine',
  marker,
  hint,
  className = '',
}: ProgressBarProps) {
  const whole = safe(max);
  const share = (amount: number) =>
    whole > 0 ? px(Math.min(100, (safe(amount) / whole) * 100)) : 0;
  const filled = share(value);
  const markerAt = marker === undefined ? undefined : share(marker.value);
  const look = looks[tone];
  return (
    <div className={`min-w-0 ${className}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="font-semibold">{label}</span>
        <span className="text-[0.9375rem] text-ink-muted tabular-nums">{valueText}</span>
      </div>
      <svg
        role="img"
        aria-label={summary}
        width="100%"
        height={16}
        className="mt-1.5 block overflow-visible"
      >
        <rect y={4} width="100%" height={8} rx={4} fill={look.track} />
        {filled <= 0 ? null : (
          <rect y={4} width={`${filled}%`} height={8} rx={4} fill={look.fill} />
        )}
        {markerAt === undefined ? null : (
          <>
            {/* A ring in the colour of the card keeps the tick clear on the fill. */}
            <line
              x1={`${markerAt}%`}
              x2={`${markerAt}%`}
              y1={0}
              y2={16}
              stroke="var(--color-surface)"
              strokeWidth={6}
            />
            <line
              x1={`${markerAt}%`}
              x2={`${markerAt}%`}
              y1={0}
              y2={16}
              stroke="var(--color-ink)"
              strokeWidth={2}
              strokeLinecap="round"
            />
          </>
        )}
      </svg>
      {marker === undefined || markerAt === undefined ? null : (
        // The label follows the tick and stays inside the bar at both ends.
        <div className="relative mt-0.5 h-4 text-xs text-ink-muted">
          <span
            className="absolute top-0 whitespace-nowrap"
            style={
              markerAt < 15
                ? { left: 0 }
                : markerAt > 85
                  ? { right: 0 }
                  : { left: `${markerAt}%`, transform: 'translateX(-50%)' }
            }
          >
            {marker.label}
          </span>
        </div>
      )}
      {hint === undefined ? null : <p className="mt-1 text-sm text-ink-muted">{hint}</p>}
    </div>
  );
}
