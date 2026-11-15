import { describe, expect, it } from 'vitest';
import {
  costOfGoods,
  costPerMeal,
  mealGoods,
  mealTotal,
  rappen,
  type Id,
  type MealCount,
} from '../src';

const id = (n: number) => `00000000-0000-7000-8000-00000000000${String(n)}` as Id;

/** The shared rules of «Wareneinsatz pro Mahlzeit» and the cost of goods (TD-22). */

const row = (fields: Partial<MealCount>): MealCount =>
  ({
    id: id(1),
    businessId: id(2),
    createdAt: '2026-11-14T10:00:00.000Z',
    updatedAt: '2026-11-14T10:00:00.000Z',
    date: '2026-11-14',
    slot: 'lunch',
    ...fields,
  }) as MealCount;

describe('mealTotal, the meals of a day and a meal', () => {
  it('takes the whole count and leaves the lines out of it', () => {
    const whole = row({ served: 90, expected: 100 });
    const line = row({ lineId: id(3), served: 40 });
    expect(mealTotal([whole, line])).toEqual({ expected: 100, served: 90 });
  });

  it('adds up the lines where there is no whole count', () => {
    const a = row({ lineId: id(3), served: 40, expected: 45 });
    const b = row({ lineId: id(4), served: 30 });
    expect(mealTotal([a, b])).toEqual({ expected: 45, served: 70 });
  });

  it('keeps an empty field empty, never zero meals', () => {
    expect(mealTotal([row({ expected: 12 })])).toEqual({ expected: 12 });
    expect(mealTotal([])).toEqual({});
  });
});

describe('costOfGoods and goods per meal', () => {
  it('takes the component production off the consumption, never below zero', () => {
    // 133.16 used, 40.00 of it came back as a component made in house: 93.16.
    expect(costOfGoods({ consumed: 13_316, produced: 4_000 })).toBe(9_316);
    expect(costOfGoods({ consumed: 1_000, produced: 4_000 })).toBe(0);
    expect(rappen(costOfGoods({ consumed: 0, produced: 0 }))).toBe(0);
  });

  it('corrects the goods per meal by the count differences: a count that found less is a cost', () => {
    // 133.16 used, a count that found 2.00 missing (-200), one that found 1.00 extra (+100):
    // the signed difference is -100, so 13316 + 100 = 13416.
    expect(mealGoods({ consumed: 13_316, produced: 0, countDifference: -100 })).toBe(13_416);
    expect(mealGoods({ consumed: 13_316, produced: 0, countDifference: 500 })).toBe(12_816);
    expect(mealGoods({ consumed: 100, produced: 0, countDifference: 500 })).toBe(0);
  });

  it('divides by the meals served and gives nothing without meals', () => {
    expect(costPerMeal(rappen(13_316), 40)).toBe(333);
    expect(costPerMeal(rappen(13_316), 0)).toBeUndefined();
  });
});
