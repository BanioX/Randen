import {
  addDays,
  addMonths,
  formatDecimal,
  formatTemperature,
  localDate,
  type LocalDate,
  type TemperatureKind,
} from '@randen/core';
import { haccpMessages as t } from './messages';

/** The Swiss calendar: readings and times are shown as they are on the clock in Zürich. */
const CLOCK = new Intl.DateTimeFormat('de-CH', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Zurich',
});
const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

/** `10:42`, the time of a reading or a tick, in Zürich. */
export function clockText(instant: string): string {
  return CLOCK.format(new Date(instant));
}

/** `Sa 14.11.`: a short day with its weekday. */
export function dayText(day: LocalDate): string {
  const weekday = WEEKDAY_KEYS[new Date(`${day}T12:00:00Z`).getUTCDay()] ?? 'mon';
  return `${t.weekdayShort[weekday]} ${day.slice(8, 10)}.${day.slice(5, 7)}.`;
}

/** `4.5 °C`, `-18 °C`: a temperature in tenths. */
export function degrees(deciC: number): string {
  return formatTemperature(deciC);
}

/**
 * The range in words: «0 bis 5 °C», «höchstens -18 °C», «mindestens 70 °C». Undefined when the
 * limit is none (an area without range, a food without limit).
 */
export function rangeText(min: number | undefined, max: number | undefined): string | undefined {
  if (min !== undefined && max !== undefined) {
    return `${formatDecimal(min / 10, { digits: 1 })} bis ${degrees(max)}`;
  }
  if (min !== undefined) {
    return `mindestens ${degrees(min)}`;
  }
  if (max !== undefined) {
    return `höchstens ${degrees(max)}`;
  }
  return undefined;
}

/** In or out of range, as words (colour never carries it alone). */
export function resultText(ok: boolean): string {
  return ok ? t.results.ok : t.results.out;
}

export function kindText(kind: TemperatureKind): string {
  return t.kinds[kind];
}

/**
 * Whether a reading is in range against its limits: the same rule as the core, so the page
 * knows before it saves whether a reading needs its action (the core checks again).
 */
export function inRange(
  deciC: number,
  limits: { minDeciC?: number | undefined; maxDeciC?: number | undefined },
): boolean {
  return (
    (limits.minDeciC === undefined || deciC >= limits.minDeciC) &&
    (limits.maxDeciC === undefined || deciC <= limits.maxDeciC)
  );
}

/** A period of days ending on `day`, `count` long. */
export function lastDays(day: LocalDate, count: number): { from: LocalDate; to: LocalDate } {
  return { from: addDays(day, -(count - 1)), to: day };
}

/** The Monday of the week of `day` (Swiss weeks start on Monday). */
export function mondayOf(day: LocalDate): LocalDate {
  const sundayFirst = new Date(`${day}T12:00:00Z`).getUTCDay();
  return addDays(day, -((sundayFirst + 6) % 7));
}

/** The first day of the month of `day`. */
export function firstOfMonth(day: LocalDate): LocalDate {
  return localDate(`${day.slice(0, 7)}-01`);
}

/** The last day of the month of `day`. */
export function lastOfMonth(day: LocalDate): LocalDate {
  return addDays(addMonths(firstOfMonth(day), 1), -1);
}

/** `14.11.2026` for a day, as in every list of Randen. */
export function longDay(day: LocalDate): string {
  return `${day.slice(8, 10)}.${day.slice(5, 7)}.${day.slice(0, 4)}`;
}

/** `Sa 14`: a weekday and the day of the month, for the cells of the cleaning matrix. */
export function weekdayDayText(day: LocalDate): string {
  const weekday = WEEKDAY_KEYS[new Date(`${day}T12:00:00Z`).getUTCDay()] ?? 'mon';
  return `${t.weekdayShort[weekday]} ${day.slice(8, 10)}`;
}
