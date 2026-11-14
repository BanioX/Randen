import {
  formatUnitPrice,
  relativeDays,
  WEEKDAYS,
  type ArticleMissing,
  type CurrencyCode,
  type SupplierDay,
  type Unit,
  type Weekday,
} from '@randen/core';
import { useState, type ReactNode } from 'react';
import { StatusChip } from '../../ui/StatusChip';
import { toneClasses } from '../../ui/tones';
import { articlesMessages } from './messages';

const t = articlesMessages;

/**
 * The result of a live query, kept while the next one loads: a list that is being filtered
 * shows its last rows instead of flashing empty between two keystrokes.
 */
export function useLast<TData>(data: TData | undefined): TData | undefined {
  const [last, setLast] = useState(data);
  if (data !== undefined && data !== last) {
    setLast(data);
  }
  return data ?? last;
}

/** What a failed query threw, as an error the frame of the app can show. */
export function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error('Query failed', { cause: error });
}

/** A unit price, or «Preis fehlt» where there is none (ADR-0008). */
export function priceText(pricePer1000: number, unit: Unit, currency: CurrencyCode): string {
  return pricePer1000 > 0 ? formatUnitPrice(pricePer1000, unit, currency) : t.missing.price;
}

/** Calm marks for what an article still lacks: «Preis fehlt», «Herkunft fehlt». */
export function MissingMarks({ missing }: { missing: readonly ArticleMissing[] }) {
  if (missing.length === 0) {
    return null;
  }
  return (
    <span className="inline-flex flex-wrap gap-1.5">
      {missing.map((what) => (
        <StatusChip key={what} tone="neutral" size="sm" outline>
          {t.missing[what]}
        </StatusChip>
      ))}
    </span>
  );
}

/** «Mo, in 2 Tagen», «Do, heute»: the next order or delivery day of a supplier. */
export function dayText(day: SupplierDay | undefined): string {
  return day === undefined
    ? t.suppliers.noDay
    : t.suppliers.day(t.suppliers.weekdays[day.weekday], relativeDays(day.inDays));
}

/**
 * The week as seven small marks, the given days filled: read at a glance when a supplier takes
 * orders or delivers. Screen readers hear the days by name instead.
 */
export function WeekdayMarks({ label, days }: { label: string; days: readonly Weekday[] }) {
  const names = days.map((day) => t.suppliers.weekdayNames[day]).join(', ');
  return (
    <div className="relative">
      <span className="sr-only">
        {label}: {days.length === 0 ? t.suppliers.detail.noDays : names}
      </span>
      <span aria-hidden="true" className="flex flex-wrap gap-1.5">
        {WEEKDAYS.map((day) => (
          <span
            key={day}
            className={`flex size-9 items-center justify-center rounded-full text-[0.8125rem] font-semibold ${
              days.includes(day)
                ? toneClasses.neutral.solid
                : 'text-ink-muted ring-1 ring-line ring-inset'
            }`}
          >
            {t.suppliers.weekdays[day]}
          </span>
        ))}
      </span>
    </div>
  );
}

/** One line of a list of facts: the word on the left, the value on the right. */
export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt className="shrink-0 text-[0.9375rem] text-ink-muted">{label}</dt>
      <dd className="min-w-0 text-right font-medium break-words">{children}</dd>
    </div>
  );
}
