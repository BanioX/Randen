import { addDays, localDate } from '../../dates';
import type { HygieneCheck, HygieneTask } from '../../model/haccp';
import { WEEKDAYS, type LocalDate, type Weekday } from '../../model/primitives';
import type { StaffMember } from '../../model/business';
import type { Id } from '../../ids';

/** Monday first, as the Swiss calendar and the cleaning plan count (Mo = 0). */
export function weekdayOf(day: LocalDate): Weekday {
  const [year = 0, month = 1, date = 1] = day.split('-').map(Number);
  const sundayFirst = new Date(Date.UTC(year, month - 1, date)).getUTCDay();
  return WEEKDAYS[(sundayFirst + 6) % 7] ?? 'mon';
}

/** The first day of the calendar month of `day`. */
export const monthStart = (day: LocalDate): LocalDate => localDate(`${day.slice(0, 7)}-01`);

/** The calendar month of `day` as `YYYY-MM`. */
export const monthOf = (day: LocalDate): string => day.slice(0, 7);

/** Every day from `from` to `to`, both included. */
export function daysFromTo(from: LocalDate, to: LocalDate): LocalDate[] {
  const days: LocalDate[] = [];
  for (let day = from; day <= to; day = addDays(day, 1)) {
    days.push(day);
  }
  return days;
}

/** The checks of a task that count for `day`: on the day, or in its month for a monthly task. */
export function checksCounting(
  task: HygieneTask,
  checks: readonly HygieneCheck[],
  day: LocalDate,
): HygieneCheck[] {
  const own = checks.filter((check) => check.taskId === task.id);
  const pool =
    task.frequency === 'monthly'
      ? own.filter((check) => monthOf(check.on) === monthOf(day))
      : own.filter((check) => check.on === day);
  return [...pool].sort((a, b) => a.doneAt.localeCompare(b.doneAt));
}

/**
 * Whether a task is on the plan for `day`. Daily: every day.
 * Weekly: only on its weekday, not on the days after it. Monthly: until it is done once in the
 * calendar month; a monthly task done today stays listed today, so it can be ticked.
 */
export function scheduledOn(
  task: HygieneTask,
  checks: readonly HygieneCheck[],
  day: LocalDate,
): boolean {
  if (!task.active) {
    return false;
  }
  switch (task.frequency) {
    case 'daily':
      return true;
    case 'weekly':
      return task.weekday === weekdayOf(day);
    case 'monthly': {
      const inMonth = checksCounting(task, checks, day);
      return inMonth.length === 0 || inMonth.some((check) => check.on === day);
    }
  }
}

/** Whether the task counts as done for its period (today, or this month for monthly tasks). */
export function doneFor(
  task: HygieneTask,
  checks: readonly HygieneCheck[],
  day: LocalDate,
): HygieneCheck | undefined {
  const pool = checksCounting(task, checks, day);
  // Today's own check first, so the person who ticked it today is the one shown.
  return pool.find((check) => check.on === day) ?? pool[0];
}

/** Two letters per person: «Anna Muster» → «AM». Clashes get a number: «AM2». */
export function initialsOf(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter((word) => word !== '');
  const letters = (text: string) => Array.from(text);
  if (words.length >= 2) {
    const first = letters(words[0] ?? '')[0] ?? '';
    const last = letters(words[words.length - 1] ?? '')[0] ?? '';
    return `${first}${last}`.toLocaleUpperCase('de-CH');
  }
  return letters(words[0] ?? '')
    .slice(0, 2)
    .join('')
    .toLocaleUpperCase('de-CH');
}

/**
 * The initials of every person of the business, unique within it. Deleted and inactive staff
 * keep their initials, because old checks still carry them.
 */
export function staffIndex(rows: readonly StaffMember[]) {
  const sorted = [...rows].sort(
    (a, b) => a.createdAt.localeCompare(b.createdAt) || a.name.localeCompare(b.name, 'de-CH'),
  );
  const initials = new Map<Id, string>();
  const taken = new Set<string>();
  for (const member of sorted) {
    const base = initialsOf(member.name) || '?';
    let candidate = base;
    for (let n = 2; taken.has(candidate); n += 1) {
      candidate = `${base}${String(n)}`;
    }
    taken.add(candidate);
    initials.set(member.id, candidate);
  }
  const names = new Map(rows.map((member) => [member.id, member.name] as const));
  return {
    initialsOf: (id: Id): string => initials.get(id) ?? '–',
    nameOf: (id: Id): string => names.get(id) ?? 'Unbekannt',
    /** Everyone of the business, for the list of names behind the initials. */
    everyone: sorted.map((member) => ({
      id: member.id,
      initials: initials.get(member.id) ?? '–',
      name: member.name,
    })),
  };
}

/** Within a closed period. */
export const within = (day: LocalDate, from: LocalDate, to: LocalDate) => day >= from && day <= to;

/**
 * Newest first: by day, then by the moment of measuring, then by id. Ids are UUIDv7 and count up
 * with time, so two readings with the same moment keep their order.
 */
export function newestFirst(
  a: { on: LocalDate; measuredAt: string; id: string },
  b: { on: LocalDate; measuredAt: string; id: string },
): number {
  return (
    b.on.localeCompare(a.on) || b.measuredAt.localeCompare(a.measuredAt) || b.id.localeCompare(a.id)
  );
}

/** Oldest first by the moment of measuring, ties by id (see `newestFirst`). */
export function oldestFirst(
  a: { measuredAt: string; id: string },
  b: { measuredAt: string; id: string },
): number {
  return a.measuredAt.localeCompare(b.measuredAt) || a.id.localeCompare(b.id);
}
