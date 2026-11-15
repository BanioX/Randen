import { addDays, HOME_TIME_ZONE } from '../../dates';
import { uuidV7, type Id } from '../../ids';
import {
  IsoDateTimeSchema,
  type IsoDateTime,
  type LocalDate,
  type Weekday,
} from '../../model/primitives';

/**
 * A small linear congruential generator (the constants of Numerical Recipes). The demo never
 * uses Math.random: the same seed gives the same kitchen on every device and in every test.
 */
export function createRandom(seed: number) {
  let state = seed >>> 0;
  /** A number in [0, 1). */
  function next(): number {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 4_294_967_296;
  }
  return {
    next,
    /** A whole number in [min, max]. */
    int(min: number, max: number): number {
      return min + Math.floor(next() * (max - min + 1));
    },
    /** A factor around 1, e.g. `spread(0.15)` gives 0.85 to 1.15. */
    spread(width: number): number {
      return 1 - width + next() * 2 * width;
    },
  };
}
export type Random = ReturnType<typeof createRandom>;

const WEEKDAY_BY_INDEX: readonly Weekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/** The weekday of a calendar day (pure date arithmetic, no time zone). */
export function weekdayOf(date: LocalDate): Weekday {
  const [year = 0, month = 1, day = 1] = date.split('-').map(Number);
  return WEEKDAY_BY_INDEX[new Date(Date.UTC(year, month - 1, day)).getUTCDay()] ?? 'mon';
}

/** The calendar day `offset` days from `today`. */
export function dayAt(today: LocalDate, offset: number): LocalDate {
  return addDays(today, offset);
}

const hourFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: HOME_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/**
 * The instant of a Swiss wall-clock time on a calendar day, e.g. 07:30 in Zurich. Tries the
 * two offsets Switzerland uses (winter +1, summer +2) and keeps the one that reads back right.
 */
export function zurichInstant(date: LocalDate, hour: number, minute: number): IsoDateTime {
  const [year = 0, month = 1, day = 1] = date.split('-').map(Number);
  const wall = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  for (const offset of [1, 2]) {
    const instant = new Date(Date.UTC(year, month - 1, day, hour - offset, minute));
    if (hourFormat.format(instant) === wall) {
      return IsoDateTimeSchema.parse(instant.toISOString());
    }
  }
  return IsoDateTimeSchema.parse(
    new Date(Date.UTC(year, month - 1, day, hour - 1, minute)).toISOString(),
  );
}

/** Rounds a quantity up to a whole number of steps (packs, half kilos). */
export function roundUpTo(quantity: number, step: number): number {
  if (quantity <= 0) {
    return 0;
  }
  return Math.ceil(quantity / step - 1e-9) * step;
}

/** Rounds an amount of money to a step, e.g. budgets to CHF 500. */
export function roundToStep(amount: number, step: number): number {
  return Math.round(amount / step) * step;
}

/**
 * Ids that count up: they sort in the order they were made, so FEFO breaks ties of the same day
 * in the same order on every device (fefo.ts). The scope (a business id) puts its last four
 * bytes in front, so two demo loads on one storage do not share an id.
 */
export function counterIds(scope?: Id): () => Id {
  const tag = scope === undefined ? '00000000' : scope.replaceAll('-', '').slice(-8);
  let counter = 0;
  return () => {
    counter += 1;
    if (counter > 0xff_ff_ff) {
      throw new RangeError('The demo makes more ids than its counter holds');
    }
    // uuidV7 keeps the random bytes from index 3 on: scope in 3 to 6, counter in 7 to 9.
    const bytes = new Uint8Array(10);
    for (let index = 0; index < 4; index += 1) {
      bytes[3 + index] = Number.parseInt(tag.slice(index * 2, index * 2 + 2), 16);
    }
    bytes[7] = (counter >>> 16) & 0xff;
    bytes[8] = (counter >>> 8) & 0xff;
    bytes[9] = counter & 0xff;
    return uuidV7(1_700_000_000_000, bytes);
  };
}
