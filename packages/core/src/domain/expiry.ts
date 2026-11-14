import { daysBetween } from '../dates';
import type { DateKind, LocalDate } from '../model/primitives';

/** From how many days before the date a lot counts as «bald». */
export const SOON_DAYS = 3;

/**
 * Where a lot stands against its date:
 * `none` no date · `ok` · `soon` within three days · `today` · `past_best_before` MHD over,
 * may still be good and is the business's call · `expired` Verbrauchsdatum over, must go.
 */
export type ExpiryStatus = 'none' | 'ok' | 'soon' | 'today' | 'past_best_before' | 'expired';

export interface ExpiryInfo {
  status: ExpiryStatus;
  /** Days until the date; negative after it; undefined without a date. */
  daysLeft?: number;
}

export function expiryInfo(
  expiresOn: LocalDate | undefined,
  dateKind: DateKind,
  today: LocalDate,
): ExpiryInfo {
  if (expiresOn === undefined) {
    return { status: 'none' };
  }
  const daysLeft = daysBetween(today, expiresOn);
  if (daysLeft < 0) {
    return { status: dateKind === 'use_by' ? 'expired' : 'past_best_before', daysLeft };
  }
  if (daysLeft === 0) {
    return { status: 'today', daysLeft };
  }
  return { status: daysLeft <= SOON_DAYS ? 'soon' : 'ok', daysLeft };
}

/** True if the lot must not be used any more: its Verbrauchsdatum has passed. */
export function mustNotUse(
  expiresOn: LocalDate | undefined,
  dateKind: DateKind,
  today: LocalDate,
): boolean {
  return expiryInfo(expiresOn, dateKind, today).status === 'expired';
}

/** Sort key: the more urgent, the smaller. Lots without a date come last. */
export function urgency(info: ExpiryInfo): number {
  return info.daysLeft ?? Number.MAX_SAFE_INTEGER;
}

/** The date as a kitchen says it: «heute», «morgen», «in 3 Tagen», «seit 2 Tagen». */
export function relativeDays(daysLeft: number): string {
  if (daysLeft === 0) {
    return 'heute';
  }
  if (daysLeft === 1) {
    return 'morgen';
  }
  if (daysLeft === -1) {
    return 'seit gestern';
  }
  return daysLeft > 0 ? `in ${String(daysLeft)} Tagen` : `seit ${String(-daysLeft)} Tagen`;
}
