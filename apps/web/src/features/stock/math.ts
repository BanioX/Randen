import { lineValue, rappen, roundQuantity, unitPriceFromTotal, type Rappen } from '@randen/core';

/**
 * What a part of a lot is worth: the value of the lot before minus its value after, exactly as
 * the ledger books it (ADR-0004). So the amount a page shows before booking is the amount that
 * ends up in the journal.
 */
export function partValue(lotQuantity: number, part: number, pricePer1000: number): Rappen {
  const rest = Math.max(0, roundQuantity(lotQuantity - part));
  return rappen(lineValue(lotQuantity, pricePer1000) - lineValue(rest, pricePer1000));
}

/** What a counted quantity changes: the value at the counted quantity minus the value expected. */
export function countDelta(expected: number, counted: number, pricePer1000: number): Rappen {
  return rappen(lineValue(counted, pricePer1000) - lineValue(expected, pricePer1000));
}

/** The unit price a line total stands for, or null while quantity or total are missing. */
export function priceFromTotal(total: Rappen | null, quantity: number | null): Rappen | null {
  return total === null || quantity === null || quantity <= 0
    ? null
    : unitPriceFromTotal(total, quantity);
}

/** How far a price lies from the last one, in basis points (320 = 3.2 % higher). */
export function priceChangeBps(price: number, last: number): number {
  return Math.round(((price - last) / last) * 10_000);
}
