import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { displayMessages } from './messages.display';
import { toneClasses } from './tones';

export type StatTone = 'ok' | 'soon' | 'danger' | 'neutral';

interface StatTileProps {
  /** What the figure is: «Lagerwert», «Wareneinsatz». */
  label: string;
  /** The figure, formatted by the page (`useMoney().format`, `formatPercent`). */
  value: string;
  /**
   * Shown small in front of the figure, for the currency: «CHF». Pass the amount without it
   * (`money.format(amount, { currency: false })`), so a large amount still fits a narrow tile.
   */
  unit?: string | undefined;
  /** One quiet line under the figure: the period, the target, what changed. */
  hint?: string | undefined;
  /** How the figure stands: a small dot in front of the hint. Never without words. */
  tone?: StatTone | undefined;
  /** Makes the whole tile a link to the page behind the figure. */
  to?: string | undefined;
  /** `premium` is the one dark tile of a page: Traube with its label in Kork. */
  variant?: 'default' | 'premium' | undefined;
  /** A small picture of the course, e.g. a `Sparkline`. */
  trend?: ReactNode | undefined;
}

/**
 * One key figure: label, figure in tabular numbers, and a line that says how it stands.
 * The figure grows with the tile and breaks after its unit before it would be cut off.
 */
export function StatTile({
  label,
  value,
  unit,
  hint,
  tone,
  to,
  variant = 'default',
  trend,
}: StatTileProps) {
  const dark = variant === 'premium';
  // The tone is said in words: the page's own hint, or a standard word for the tone.
  const line = hint ?? (tone === undefined ? undefined : displayMessages.tone[tone]);
  const dot = tone === undefined ? undefined : dark ? 'bg-cork' : toneClasses[tone].dot;
  const lineColour = dark
    ? 'text-mist'
    : tone === undefined || tone === 'neutral'
      ? 'text-ink-muted'
      : toneClasses[tone].text;
  const content = (
    <>
      <span className="flex items-start justify-between gap-2">
        <span
          className={`block text-[0.8125rem] leading-snug font-semibold break-words hyphens-calm ${dark ? 'text-cork' : 'text-ink-muted'}`}
        >
          {label}
        </span>
        {to === undefined ? null : (
          <ChevronRight
            size={16}
            aria-hidden="true"
            className={`mt-0.5 shrink-0 ${dark ? 'text-mist' : 'text-ink-muted/60'}`}
          />
        )}
      </span>
      <span className="mt-1.5 flex flex-wrap items-baseline gap-x-1.5">
        {unit === undefined ? null : (
          <span
            className={`text-[0.8125rem] font-semibold ${dark ? 'text-mist' : 'text-ink-muted'}`}
          >
            {unit}
          </span>
        )}
        <span
          className={`text-xl leading-tight font-semibold tracking-tight tabular-nums @[12rem]:text-2xl @[14.5rem]:text-[1.75rem] ${dark ? 'text-white' : 'text-ink'}`}
        >
          {value}
        </span>
      </span>
      {line === undefined && trend === undefined ? null : (
        <span className="mt-auto flex flex-wrap items-end justify-between gap-x-2 gap-y-1.5 pt-2">
          {line === undefined ? null : (
            <span
              className={`flex min-w-[min(6.5rem,100%)] flex-1 items-baseline gap-1.5 text-[0.8125rem] ${lineColour}`}
            >
              {dot === undefined ? null : (
                <span
                  aria-hidden="true"
                  className={`size-2 shrink-0 -translate-y-px rounded-full ${dot}`}
                />
              )}
              <span className="min-w-0 hyphens-calm">{line}</span>
            </span>
          )}
          {trend === undefined ? null : <span className="ml-auto shrink-0">{trend}</span>}
        </span>
      )}
    </>
  );
  const frame = `@container flex h-full min-w-0 flex-col rounded-2xl p-4 text-left ${
    dark ? 'bg-grape text-white shadow-float' : 'bg-surface shadow-card'
  }`;
  if (to === undefined) {
    return <div className={frame}>{content}</div>;
  }
  return (
    <Link
      to={to}
      className={`${frame} transition-colors ${dark ? 'hover:bg-wine-800' : 'hover:bg-surface-muted'}`}
    >
      {content}
    </Link>
  );
}

/**
 * The row of key figures of a page: two side by side on the phone, four from tablet width.
 * It follows the room it gets, so it also works inside a column.
 */
export function KpiGrid({ children }: { children: ReactNode }) {
  return (
    <div className="@container min-w-0">
      <div className="grid grid-cols-2 gap-3 @2xl:grid-cols-4 @2xl:gap-4">{children}</div>
    </div>
  );
}
