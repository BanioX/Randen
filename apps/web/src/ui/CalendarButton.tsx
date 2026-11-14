import { parseDateInput, type LocalDate } from '@randen/core';
import { CalendarDays } from 'lucide-react';
import { formMessages } from './messages.forms';

/**
 * Desktop browsers open the picker only through `showPicker()`. On the iPhone the tap itself
 * reaches the (invisible) native date field, which opens the date wheel; `showPicker()` is then
 * not needed and may throw.
 */
function openPicker(input: HTMLInputElement) {
  try {
    input.showPicker();
  } catch {
    // Already open, or not supported: the native tap handling takes over.
  }
}

/**
 * The calendar symbol next to a date typed as TT.MM.JJJJ. The device's own date field lies
 * invisibly on top: iOS opens its date wheel only for a tap on the field itself. The text next
 * to it always shows the Swiss format, whatever language the device speaks (lesson L-R20).
 */
export function CalendarButton({
  label = formMessages.date.openCalendar,
  describedBy,
  value,
  onPick,
  today,
  min,
  max = '2126-12-31',
  disabled = false,
}: {
  /** The name for screen readers. Default «Kalender öffnen». */
  label?: string | undefined;
  /** The id of the label of the date this calendar belongs to. */
  describedBy?: string | undefined;
  value: LocalDate | null;
  onPick: (date: LocalDate) => void;
  today: LocalDate;
  min?: string | undefined;
  max?: string | undefined;
  disabled?: boolean | undefined;
}) {
  return (
    <div
      className={`relative flex min-h-12 min-w-12 shrink-0 items-center justify-center rounded-xl border border-line-strong text-wine-700 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-wine-600 ${
        disabled ? 'bg-surface-muted opacity-60' : 'bg-surface hover:bg-surface-muted'
      }`}
    >
      <CalendarDays size={22} aria-hidden="true" />
      <input
        type="date"
        aria-label={label}
        aria-describedby={describedBy}
        value={value ?? ''}
        min={min}
        max={max}
        disabled={disabled}
        onClick={(event) => {
          openPicker(event.currentTarget);
        }}
        onChange={(event) => {
          const date = parseDateInput(event.target.value, today);
          if (date !== null) {
            onPick(date);
          }
        }}
        className="absolute inset-0 h-full w-full cursor-pointer appearance-none text-base opacity-0 disabled:cursor-not-allowed"
      />
    </div>
  );
}
