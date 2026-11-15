import type { CockpitTarget, LocalDate, YearMonth } from '@randen/core';
import { paths } from '../../app/paths';
import { cockpitMessages } from './messages';

const t = cockpitMessages;

/**
 * Where a row of the cockpit leads. The core names the page; the address comes from `paths`.
 * Only the query part for the expiry list is ours (as `stockLinks` of «Lager» builds it).
 */
export function targetPath(target: CockpitTarget): string {
  switch (target.page) {
    case 'expiring':
      return expiringPath(target.group);
    case 'waste':
      return paths.waste(target.lotId);
    case 'temperatures':
      return paths.temperatures();
    case 'haccp':
      return paths.haccp();
    case 'receive':
      return paths.receive(target.orderId);
    case 'orders':
      return paths.orders();
    case 'plan':
      return paths.plan();
    case 'purchasing':
      return paths.purchasing();
  }
}

/** The expiry list of «Lager», narrowed to one group. */
export function expiringPath(group: 'expired' | 'today'): string {
  return `${paths.stockExpiring()}?group=${group}`;
}

/** The stock list of «Lager», narrowed to the articles under their minimum. */
export function belowMinPath(): string {
  return `${paths.stock()}?filter=below_min`;
}

function parts(date: LocalDate): [number, number, number] {
  const [year = 0, month = 1, day = 1] = date.split('-').map(Number);
  return [year, month, day];
}

/** «Samstag, 14. November 2026»: from the catalog, the same on every device. */
export function dateInWords(date: LocalDate): string {
  const [year, month, day] = parts(date);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return `${t.date.weekdays[weekday] ?? ''}, ${String(day)}. ${t.date.months[month - 1] ?? ''} ${String(year)}`;
}

/** «November» for `2026-11`. */
export function monthName(month: YearMonth): string {
  return t.date.months[Number(month.slice(5, 7)) - 1] ?? '';
}
