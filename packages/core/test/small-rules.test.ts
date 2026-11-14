import { describe, expect, it } from 'vitest';
import { addMonths, addYears, localDate } from '../src/dates';
import { expiryInfo, urgency } from '../src/domain/expiry';
import { priceUnitLabel, unitLabel } from '../src/domain/units';

/**
 * Small rules no other test reached. They came to light when the helpers for tests and the
 * placeholder modules left the coverage (vitest.config.ts): the numbers of the real logic count.
 */
describe('addMonths', () => {
  it('keeps the day when the target month has it', () => {
    expect(addMonths(localDate('2026-11-14'), 1)).toBe('2026-12-14');
    expect(addMonths(localDate('2026-11-14'), 0)).toBe('2026-11-14');
  });

  it('crosses the turn of the year in both directions', () => {
    expect(addMonths(localDate('2026-11-14'), 2)).toBe('2027-01-14');
    expect(addMonths(localDate('2026-01-14'), -1)).toBe('2025-12-14');
    expect(addMonths(localDate('2026-11-14'), 14)).toBe('2028-01-14');
    expect(addMonths(localDate('2026-03-14'), -15)).toBe('2024-12-14');
  });

  it('clamps the day to the end of a shorter month', () => {
    expect(addMonths(localDate('2026-01-31'), 1)).toBe('2026-02-28');
    expect(addMonths(localDate('2028-01-31'), 1)).toBe('2028-02-29');
    expect(addMonths(localDate('2026-08-31'), 1)).toBe('2026-09-30');
    expect(addMonths(localDate('2026-03-31'), -1)).toBe('2026-02-28');
  });

  it('refuses parts of a month', () => {
    expect(() => addMonths(localDate('2026-11-14'), 1.5)).toThrow(RangeError);
    expect(() => addMonths(localDate('2026-11-14'), Number.NaN)).toThrow(RangeError);
  });
});

describe('addYears', () => {
  it('moves by whole years and lands on 28.2. after a leap day', () => {
    expect(addYears(localDate('2026-11-14'), 1)).toBe('2027-11-14');
    expect(addYears(localDate('2026-11-14'), -2)).toBe('2024-11-14');
    expect(addYears(localDate('2028-02-29'), 1)).toBe('2029-02-28');
    expect(addYears(localDate('2028-02-29'), 4)).toBe('2032-02-29');
  });
});

describe('urgency', () => {
  const today = localDate('2026-11-14');
  const of = (expiresOn: string | undefined) =>
    urgency(
      expiryInfo(expiresOn === undefined ? undefined : localDate(expiresOn), 'use_by', today),
    );

  it('sorts what is over first, then what is due soon; lots without a date come last', () => {
    const dates = [undefined, '2026-11-20', '2026-11-12', '2026-11-14', '2026-11-15'];
    const sorted = [...dates].sort((a, b) => of(a) - of(b));
    expect(sorted).toEqual(['2026-11-12', '2026-11-14', '2026-11-15', '2026-11-20', undefined]);
  });

  it('is the number of days left', () => {
    expect(of('2026-11-17')).toBe(3);
    expect(of('2026-11-12')).toBe(-2);
  });
});

describe('unit labels', () => {
  it('writes the base unit as a kitchen does', () => {
    expect(unitLabel('g')).toBe('g');
    expect(unitLabel('ml')).toBe('ml');
    expect(unitLabel('pcs')).toBe('Stk.');
  });

  it('quotes prices per kilogram, litre or piece', () => {
    expect(priceUnitLabel('g')).toBe('kg');
    expect(priceUnitLabel('ml')).toBe('l');
    expect(priceUnitLabel('pcs')).toBe('Stk.');
  });
});
