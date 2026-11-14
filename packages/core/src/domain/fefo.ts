import type { Id } from '../ids';
import type { DateKind, LocalDate } from '../model/primitives';
import { mustNotUse } from './expiry';
import { roundQuantity } from './units';

export interface FefoLot {
  id: Id;
  quantity: number;
  expiresOn?: LocalDate | undefined;
  dateKind: DateKind;
  receivedOn: LocalDate;
}

export interface FefoPick {
  lotId: Id;
  quantity: number;
}

/**
 * First expired, first out: the order in which lots of one article leave the house. Earliest
 * date first, lots without a date last; among equals the older delivery, then the id.
 */
export function fefoOrder<TLot extends FefoLot>(lots: readonly TLot[]): TLot[] {
  return [...lots].sort(
    (a, b) =>
      (a.expiresOn ?? '9999-12-31').localeCompare(b.expiresOn ?? '9999-12-31') ||
      a.receivedOn.localeCompare(b.receivedOn) ||
      a.id.localeCompare(b.id),
  );
}

/**
 * Takes `quantity` from the lots of one article by FEFO. Lots past their Verbrauchsdatum are
 * never touched: they have to be written off, not cooked. `missing` is what the stock could not
 * cover.
 */
export function allocateFefo(
  lots: readonly FefoLot[],
  quantity: number,
  today: LocalDate,
): { picks: FefoPick[]; missing: number } {
  let open = roundQuantity(quantity);
  const picks: FefoPick[] = [];
  for (const lot of fefoOrder(lots)) {
    if (open <= 0) {
      break;
    }
    if (lot.quantity <= 0 || mustNotUse(lot.expiresOn, lot.dateKind, today)) {
      continue;
    }
    const take = Math.min(lot.quantity, open);
    picks.push({ lotId: lot.id, quantity: roundQuantity(take) });
    open = roundQuantity(open - take);
  }
  return { picks, missing: open };
}

/** What may be used today: the sum of all lots except those past their Verbrauchsdatum. */
export function usableQuantity(lots: readonly FefoLot[], today: LocalDate): number {
  return roundQuantity(
    lots
      .filter((lot) => !mustNotUse(lot.expiresOn, lot.dateKind, today))
      .reduce((sum, lot) => sum + lot.quantity, 0),
  );
}
