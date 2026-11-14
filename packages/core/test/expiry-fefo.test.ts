import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  addDays,
  allocateFefo,
  expiryInfo,
  fefoOrder,
  localDate,
  mustNotUse,
  relativeDays,
  roundQuantity,
  usableQuantity,
  type FefoLot,
} from '../src';
import { sequentialIds } from '../src/testing';

const today = localDate('2026-11-14');
const ids = sequentialIds();

function lot(
  quantity: number,
  days: number | undefined,
  kind: FefoLot['dateKind'] = 'best_before',
): FefoLot {
  return {
    id: ids.next(),
    quantity,
    expiresOn: days === undefined ? undefined : addDays(today, days),
    dateKind: kind,
    receivedOn: addDays(today, -3),
  };
}

describe('expiryInfo', () => {
  it('places a lot against its date', () => {
    expect(expiryInfo(undefined, 'best_before', today)).toEqual({ status: 'none' });
    expect(expiryInfo(addDays(today, 10), 'best_before', today)).toEqual({
      status: 'ok',
      daysLeft: 10,
    });
    expect(expiryInfo(addDays(today, 3), 'use_by', today)).toEqual({ status: 'soon', daysLeft: 3 });
    expect(expiryInfo(today, 'use_by', today)).toEqual({ status: 'today', daysLeft: 0 });
  });

  it('tells a passed Verbrauchsdatum from a passed MHD', () => {
    expect(expiryInfo(addDays(today, -1), 'use_by', today).status).toBe('expired');
    expect(expiryInfo(addDays(today, -1), 'best_before', today).status).toBe('past_best_before');
    expect(mustNotUse(addDays(today, -1), 'use_by', today)).toBe(true);
    expect(mustNotUse(addDays(today, -1), 'best_before', today)).toBe(false);
    expect(mustNotUse(today, 'use_by', today)).toBe(false);
  });

  it('says the days as people do', () => {
    expect(relativeDays(0)).toBe('heute');
    expect(relativeDays(1)).toBe('morgen');
    expect(relativeDays(3)).toBe('in 3 Tagen');
    expect(relativeDays(-1)).toBe('seit gestern');
    expect(relativeDays(-4)).toBe('seit 4 Tagen');
  });
});

describe('FEFO', () => {
  it('takes the earliest date first and lots without a date last', () => {
    const late = lot(5, 12);
    const early = lot(3, 6);
    const none = lot(4, undefined);
    expect(fefoOrder([none, late, early]).map((item) => item.id)).toEqual([
      early.id,
      late.id,
      none.id,
    ]);
    const { picks, missing } = allocateFefo([none, late, early], 6, today);
    expect(picks).toEqual([
      { lotId: early.id, quantity: 3 },
      { lotId: late.id, quantity: 3 },
    ]);
    expect(missing).toBe(0);
  });

  it('never touches a lot past its Verbrauchsdatum, but may use one past its MHD', () => {
    const expired = lot(10, -1, 'use_by');
    const pastBestBefore = lot(2, -5, 'best_before');
    const fresh = lot(4, 5);
    const result = allocateFefo([expired, pastBestBefore, fresh], 5, today);
    expect(result.picks).toEqual([
      { lotId: pastBestBefore.id, quantity: 2 },
      { lotId: fresh.id, quantity: 3 },
    ]);
    expect(usableQuantity([expired, pastBestBefore, fresh], today)).toBe(6);
  });

  it('reports what the stock cannot cover', () => {
    const only = lot(2.5, 3);
    expect(allocateFefo([only], 4, today)).toEqual({
      picks: [{ lotId: only.id, quantity: 2.5 }],
      missing: 1.5,
    });
    expect(allocateFefo([], 1, today)).toEqual({ picks: [], missing: 1 });
  });

  it('always accounts for the whole quantity, never more than a lot holds', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            quantity: fc.integer({ min: 0, max: 50_000 }).map((n) => n / 1000),
            days: fc.option(fc.integer({ min: -5, max: 30 }), { nil: undefined }),
            kind: fc.constantFrom<FefoLot['dateKind']>('best_before', 'use_by'),
          }),
          { maxLength: 8 },
        ),
        fc.integer({ min: 0, max: 100_000 }).map((n) => n / 1000),
        (specs, wanted) => {
          const lots = specs.map((spec) => lot(spec.quantity, spec.days, spec.kind));
          const { picks, missing } = allocateFefo(lots, wanted, today);
          const taken = roundQuantity(picks.reduce((sum, pick) => sum + pick.quantity, 0));
          expect(roundQuantity(taken + missing)).toBe(roundQuantity(wanted));
          for (const pick of picks) {
            const source = lots.find((item) => item.id === pick.lotId);
            expect(pick.quantity).toBeGreaterThan(0);
            expect(pick.quantity).toBeLessThanOrEqual(source?.quantity ?? 0);
            expect(mustNotUse(source?.expiresOn, source?.dateKind ?? 'use_by', today)).toBe(false);
          }
          if (missing > 0) {
            expect(taken).toBe(usableQuantity(lots, today));
          }
        },
      ),
    );
  });
});
