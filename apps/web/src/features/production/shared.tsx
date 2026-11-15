import { addDays, type LocalDate } from '@randen/core';
import { Minus, Plus } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { productionMessages } from './messages';

const t = productionMessages;

/**
 * The result of a live query, kept while the next one loads: a list that is being filtered
 * shows its last state instead of flashing empty.
 */
export function useLast<TData>(data: TData | undefined): TData | undefined {
  const [last, setLast] = useState(data);
  if (data !== undefined && data !== last) {
    setLast(data);
  }
  return data ?? last;
}

/** Whole numbers between `min` and `max`; anything else stays where it was. */
function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(value)));
}

interface StepperProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  className?: string;
}

/** A count with minus and plus: the buttons are 44 px, the number can be typed too. */
export function Stepper({
  label,
  value,
  onChange,
  min = 1,
  max = 10_000,
  className = '',
}: StepperProps) {
  const id = useId();
  const [text, setText] = useState(String(value));
  const [shown, setShown] = useState(value);
  if (shown !== value) {
    setShown(value);
    setText(String(value));
  }
  const button =
    'inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-line-strong bg-surface text-ink transition-colors hover:bg-surface-muted disabled:opacity-40';
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <button
        type="button"
        onClick={() => {
          onChange(clamp(value - 1, min, max));
        }}
        disabled={value <= min}
        aria-label={t.newPage.portionsLess(label)}
        className={button}
      >
        <Minus size={20} aria-hidden="true" />
      </button>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        enterKeyHint="done"
        autoComplete="off"
        value={text}
        onChange={(event) => {
          const next = event.target.value.replace(/\D/g, '');
          setText(next);
          const number = Number.parseInt(next, 10);
          if (Number.isFinite(number) && number >= min && number <= max) {
            onChange(number);
          }
        }}
        onBlur={() => {
          setText(String(value));
        }}
        className="h-11 w-20 min-w-0 rounded-xl border border-line-strong bg-surface text-center text-lg font-semibold tabular-nums"
      />
      <button
        type="button"
        onClick={() => {
          onChange(clamp(value + 1, min, max));
        }}
        disabled={value >= max}
        aria-label={t.newPage.portionsMore(label)}
        className={button}
      >
        <Plus size={20} aria-hidden="true" />
      </button>
    </div>
  );
}

/** One line of a list of facts: the word on the left, the value on the right. */
export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt className="shrink-0 text-[0.9375rem] text-ink-muted">{label}</dt>
      <dd className="min-w-0 text-right font-medium break-words tabular-nums">{children}</dd>
    </div>
  );
}

/** The ISO week number of a day («KW 46»): the week with the Thursday of the same week. */
export function isoWeekNumber(date: LocalDate): number {
  const day = new Date(`${date}T00:00:00Z`);
  const weekday = day.getUTCDay() || 7;
  day.setUTCDate(day.getUTCDate() + 4 - weekday);
  const yearStart = Date.UTC(day.getUTCFullYear(), 0, 1);
  return Math.ceil(((day.getTime() - yearStart) / 86_400_000 + 1) / 7);
}

/** The Monday `weeks` weeks away from the given Monday. */
export function shiftWeek(monday: LocalDate, weeks: number): LocalDate {
  return addDays(monday, weeks * 7);
}

/** The Monday of the week that holds a day (Europe/Zurich calendar day). */
export function mondayOfDay(date: LocalDate): LocalDate {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  return addDays(date, -((weekday + 6) % 7));
}

/** «Mo 09.11.» for the head of a day in the plan. */
export function shortDay(date: LocalDate, weekdayIndex: number): string {
  const [, month = '', day = ''] = date.split('-');
  return `${t.weekdays[weekdayIndex] ?? ''} ${day}.${month}.`;
}
