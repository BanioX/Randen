import { describe, expect, it } from 'vitest';
import { columnPath, labelIndices, niceScale, px, safe } from './scale';

describe('safe and px', () => {
  it('turns anything that is not a positive finite number into zero', () => {
    expect(safe(12.5)).toBe(12.5);
    expect(safe(0)).toBe(0);
    expect(safe(-3)).toBe(0);
    expect(safe(Number.NaN)).toBe(0);
    expect(safe(Number.POSITIVE_INFINITY)).toBe(0);
    expect(safe(undefined)).toBe(0);
  });

  it('rounds coordinates to two decimals and never returns NaN', () => {
    expect(px(12.3456)).toBe(12.35);
    expect(px(Number.NaN)).toBe(0);
    expect(px(Number.NEGATIVE_INFINITY)).toBe(0);
  });
});

describe('niceScale', () => {
  it('ends on a round number at or above the highest value, with three or four ticks', () => {
    expect(niceScale(4820)).toEqual({ max: 6000, ticks: [0, 2000, 4000, 6000] });
    expect(niceScale(3000)).toEqual({ max: 3000, ticks: [0, 1000, 2000, 3000] });
    expect(niceScale(187_450)).toEqual({ max: 200_000, ticks: [0, 100_000, 200_000] });
    expect(niceScale(7)).toEqual({ max: 7.5, ticks: [0, 2.5, 5, 7.5] });
  });

  it('keeps small steps free of float noise', () => {
    expect(niceScale(0.3).ticks).toEqual([0, 0.1, 0.2, 0.3]);
  });

  it('gives a usable axis for nothing at all', () => {
    for (const top of [0, -4, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(niceScale(top)).toEqual({ max: 1, ticks: [0] });
    }
  });

  it('always covers the value', () => {
    for (const top of [1, 9, 11, 99, 101, 2499, 2501, 12_345, 999_999]) {
      const scale = niceScale(top);
      expect(scale.max).toBeGreaterThanOrEqual(top);
      expect(scale.ticks.length).toBeGreaterThanOrEqual(3);
      expect(scale.ticks.length).toBeLessThanOrEqual(4);
    }
  });
});

describe('labelIndices', () => {
  it('shows every label when they fit', () => {
    expect(labelIndices(7, 40, 20)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('shows the first, each nth and the last when they do not', () => {
    expect(labelIndices(14, 20, 40)).toEqual([0, 3, 6, 9, 13]);
    expect(labelIndices(10, 20, 30)).toEqual([0, 2, 4, 6, 9]);
  });

  it('handles none, one and a slot of no width', () => {
    expect(labelIndices(0, 40, 20)).toEqual([]);
    expect(labelIndices(1, 40, 20)).toEqual([0]);
    expect(labelIndices(3, 0, 20)).toEqual([0, 2]);
  });
});

describe('columnPath', () => {
  it('is square at the baseline and rounded at the data end', () => {
    expect(columnPath(10, 20, 24, 100)).toBe('M10,120V24Q10,20 14,20H30Q34,20 34,24V120Z');
  });

  it('shrinks the rounding for bars that are lower than it', () => {
    expect(columnPath(0, 98, 24, 2)).toBe('M0,100V100Q0,98 2,98H22Q24,98 24,100V100Z');
  });

  it('never produces a negative size', () => {
    expect(columnPath(0, 0, -5, -5)).not.toMatch(/NaN/);
  });
});
