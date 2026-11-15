import { rappen, type Rappen } from '../money';
import type { MealCount } from '../model/menu';

/**
 * The rules of «Wareneinsatz pro Mahlzeit» and of the cost of goods (ADR-0015, TD-22). The
 * cockpit and «Zahlen» both read them from here, so the two pages cannot disagree.
 */

export interface MealTotal {
  expected?: number;
  served?: number;
}

/**
 * The meals of one day and meal: the count of the whole meal wins, value by value; where it
 * says nothing, the counts of its lines are added up. Nothing counted stays undefined, so an
 * empty field is never read as zero meals.
 */
export function mealTotal(rows: readonly MealCount[]): MealTotal {
  const whole = rows
    .filter((row) => row.lineId === undefined)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  const lines = rows.filter((row) => row.lineId !== undefined);
  const added = (pick: (row: MealCount) => number | undefined) => {
    const values = lines.map(pick).filter((value) => value !== undefined);
    return values.length === 0 ? undefined : values.reduce((total, value) => total + value, 0);
  };
  const expected = whole?.expected ?? added((row) => row.expected);
  const served = whole?.served ?? added((row) => row.served);
  return {
    ...(expected === undefined ? {} : { expected }),
    ...(served === undefined ? {} : { served }),
  };
}

/**
 * The cost of goods of a period («Wareneinsatz»): what left the stock, less what came back into
 * it as a component made in house, whose ingredients count once, when the component is used.
 * Both figures are positive amounts (`consumed` = the value taken out, `produced` = the value
 * put in by production). Never below zero.
 */
export function costOfGoods(input: { consumed: number; produced: number }): Rappen {
  return rappen(Math.max(0, input.consumed - input.produced));
}

/**
 * Goods per meal («Wareneinsatz pro Mahlzeit»). OPEN POINT (TD-27, ADR-0015, Alban decides): the
 * current rule takes the whole consumption of the period, less component production, and
 * corrects it by the differences of the counts (a count that found less is a cost, one that found
 * more lowers it). Open: whether all consumption counts or only the lines of lunch. Until Alban
 * decides, this is the one rule for both pages; change it here only, never in one page alone.
 */
export function mealGoods(input: {
  consumed: number;
  produced: number;
  /** Signed: the value of the count differences, positive where the count found more. */
  countDifference: number;
}): Rappen {
  return rappen(Math.max(0, input.consumed - input.produced - input.countDifference));
}

/** Goods per meal served, in Rappen; undefined without meals served, never a division by zero. */
export function costPerMeal(goods: Rappen, served: number): Rappen | undefined {
  return served > 0 ? rappen(Math.round(goods / served)) : undefined;
}
