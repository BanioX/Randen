import { describe, expect, it } from 'vitest';
import { localDate } from '@randen/core';
import { isoWeekNumber, mondayOfDay, shiftWeek, shortDay } from './shared';

describe('week helpers of the plan', () => {
  it('numbers the weeks as ISO does: the week of 14.11.2026 is KW 46', () => {
    expect(isoWeekNumber(localDate('2026-11-14'))).toBe(46);
    expect(isoWeekNumber(localDate('2026-11-09'))).toBe(46);
    expect(isoWeekNumber(localDate('2026-11-15'))).toBe(46);
    expect(isoWeekNumber(localDate('2026-11-16'))).toBe(47);
    // Week 1 of 2027 starts on Monday 04.01.2027; 31.12.2026 is still week 53 of 2026.
    expect(isoWeekNumber(localDate('2026-12-31'))).toBe(53);
    expect(isoWeekNumber(localDate('2027-01-04'))).toBe(1);
  });

  it('finds the Monday of a day and moves whole weeks', () => {
    expect(mondayOfDay(localDate('2026-11-14'))).toBe('2026-11-09');
    expect(mondayOfDay(localDate('2026-11-09'))).toBe('2026-11-09');
    expect(mondayOfDay(localDate('2026-11-15'))).toBe('2026-11-09');
    expect(shiftWeek(localDate('2026-11-09'), 1)).toBe('2026-11-16');
    expect(shiftWeek(localDate('2026-11-09'), -1)).toBe('2026-11-02');
  });

  it('writes a day as the plan shows it', () => {
    expect(shortDay(localDate('2026-11-14'), 5)).toBe('Sa 14.11.');
    expect(shortDay(localDate('2026-11-09'), 0)).toBe('Mo 09.11.');
  });
});
