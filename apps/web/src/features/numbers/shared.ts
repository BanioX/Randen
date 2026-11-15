import {
  addDays,
  addMonths,
  localDate,
  YearMonthSchema,
  type LocalDate,
  type YearMonth,
} from '@randen/core';

/** The months of the year, as the Swiss calendar writes them. */
const MONTHS = [
  'Januar',
  'Februar',
  'März',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'November',
  'Dezember',
] as const;

/** «November 2026» for a month. */
export function monthName(month: YearMonth): string {
  return `${MONTHS[Number(month.slice(5, 7)) - 1] ?? ''} ${month.slice(0, 4)}`;
}

/** «21. November» for a day: the words of «Erreicht am …». */
export function dayAndMonth(day: LocalDate): string {
  return `${Number(day.slice(8, 10))}. ${MONTHS[Number(day.slice(5, 7)) - 1] ?? ''}`;
}

/** «14.11.» for a day on a chart axis. */
export function shortDay(day: LocalDate): string {
  return `${Number(day.slice(8, 10))}.${day.slice(5, 7)}.`;
}

/** The month of a day, `YYYY-MM`. */
export function monthOf(day: LocalDate): YearMonth {
  return YearMonthSchema.parse(day.slice(0, 7));
}

/** The month before or after, `delta` months from `month`. */
export function shiftMonth(month: YearMonth, delta: number): YearMonth {
  return monthOf(addMonths(localDate(`${month}-01`), delta));
}

/** The first and the last day of a month, both included. */
export function monthRange(month: YearMonth): { from: LocalDate; to: LocalDate } {
  const from = localDate(`${month}-01`);
  return { from, to: addDays(addMonths(from, 1), -1) };
}

/** Whether a month string is a real month; anything else falls back to the given one. */
export function parseMonth(raw: string | null, fallback: YearMonth): YearMonth {
  const parsed = YearMonthSchema.safeParse(raw ?? '');
  return parsed.success ? parsed.data : fallback;
}

/** The period of the overview and of the waste report, kept in the address. */
export const PERIODS = ['7', '30', 'month'] as const;
export type Period = (typeof PERIODS)[number];

export function parsePeriod(raw: string | null): Period {
  return PERIODS.find((period) => period === raw) ?? 'month';
}

/** From and to of a period, ending today; «Monat» runs from the first day to today. */
export function periodRange(period: Period, today: LocalDate): { from: LocalDate; to: LocalDate } {
  if (period === 'month') {
    return { from: localDate(`${today.slice(0, 7)}-01`), to: today };
  }
  return { from: addDays(today, period === '7' ? -6 : -29), to: today };
}
