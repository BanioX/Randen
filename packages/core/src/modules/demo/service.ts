import { createStockLedger, type AppContext } from '../../application';
import { createCommandKit } from '../../application/command';
import type { Id } from '../../ids';
import type { LocalDate } from '../../model/primitives';
import {
  MealCountSchema,
  MenuLineSchema,
  PlanEntrySchema,
  WasteWeighingSchema,
  type MealCount,
  type PlanEntry,
  type WasteWeighing,
} from '../../model/menu';
import { SaleSchema, type Sale } from '../../model/sales';
import { MENU_LINES, WEEKDAY_FACTOR } from './catalogue';
import { must, recipeByKey, TAKEAWAY_DAYS, TAKEAWAY_DISH, type DemoPlan } from './plan';
import { createRandom, dayAt, weekdayOf } from './support';

/**
 * The lunch of the bistro (ADR-0015): two menu lines, meals counted per line, the plates weighed
 * after service, and the take-away dish that uses a box from the market. All of it follows the
 * sales of the history, so the numbers never disagree.
 */

/** Meal counts cover the last 14 service days and today (expected only). */
const MEAL_DAYS = 14;
/** The plates are weighed after lunch on the last 10 service days. */
const WASTE_DAYS = 10;
/** VAT of a take-away dish (docs/fakten.md section 3): 2.6 %. */
export const TAKEAWAY_VAT_BPS = 260;

/** The plan's expectation of a dish on a day: the same rule as the sales plan, without noise. */
export function expectedPortions(plan: DemoPlan, dish: string, day: number): number {
  const recipe = must(recipeByKey.get(dish), dish);
  const factor = WEEKDAY_FACTOR[weekdayOf(dayAt(plan.today, day))];
  return Math.max(0, Math.round((recipe.daily ?? 0) * factor));
}

/** What was sold of a dish on a day of the history: the sales of the same day, to the portion. */
export function soldPortions(plan: DemoPlan, dish: string, day: number): number {
  return plan.sales.get(day)?.get(dish) ?? 0;
}

async function addAll<TRow extends { id: Id }>(
  add: (row: TRow) => Promise<void>,
  rows: readonly TRow[],
): Promise<void> {
  await Promise.all(rows.map((row) => add(row)));
}

/** The menu lines of the lunch, one per line of MENU_LINES; returns their ids by key. */
export async function writeMenuLines(ctx: AppContext, businessId: Id): Promise<Map<string, Id>> {
  const { stamps } = createCommandKit(ctx);
  const ids = new Map<string, Id>();
  for (const line of MENU_LINES) {
    const row = MenuLineSchema.parse({
      id: ctx.ids.next(),
      businessId,
      ...stamps(),
      name: line.name,
      slot: 'lunch',
      sortOrder: line.sortOrder,
      costTargetRappen: line.costTargetRappen,
      ...(line.requiredDiet === undefined ? {} : { requiredDiet: line.requiredDiet }),
      freeOf: [],
      active: true,
    });
    await ctx.storage.menuLines.add(row);
    ids.set(line.key, row.id);
  }
  return ids;
}

/** The lunch of the coming two weeks: one dish per line and day, with the portions expected. */
export async function writeLunchPlan(
  ctx: AppContext,
  businessId: Id,
  plan: DemoPlan,
  recipeId: (key: string) => Id,
  lineIds: ReadonlyMap<string, Id>,
): Promise<void> {
  const { stamps } = createCommandKit(ctx);
  const rows: PlanEntry[] = [];
  for (let day = 0; day < 14; day += 1) {
    const on = dayAt(plan.today, day);
    for (const line of MENU_LINES) {
      const dish = line.dishOn(weekdayOf(on));
      rows.push(
        PlanEntrySchema.parse({
          id: ctx.ids.next(),
          businessId,
          ...stamps(),
          date: on,
          slot: 'lunch',
          recipeId: recipeId(dish),
          portions: Math.max(1, expectedPortions(plan, dish, day)),
          lineId: must(lineIds.get(line.key), line.key),
          ...(line.key === 'mittag' ? { note: 'Tagesmenü' } : {}),
        }),
      );
    }
  }
  await addAll((row: PlanEntry) => ctx.storage.planEntries.add(row), rows);
}

/** Meals per line and day: expected from the plan, served as the sales of the line's dish. */
export async function writeMealCounts(
  ctx: AppContext,
  businessId: Id,
  plan: DemoPlan,
  lineIds: ReadonlyMap<string, Id>,
): Promise<void> {
  const { stamps } = createCommandKit(ctx);
  const rows: MealCount[] = [];
  for (let day = -MEAL_DAYS; day <= 0; day += 1) {
    const on = dayAt(plan.today, day);
    for (const line of MENU_LINES) {
      const dish = line.dishOn(weekdayOf(on));
      rows.push(
        MealCountSchema.parse({
          id: ctx.ids.next(),
          businessId,
          ...stamps(),
          date: on,
          slot: 'lunch',
          lineId: must(lineIds.get(line.key), line.key),
          expected: expectedPortions(plan, dish, day),
          // Today is still open: only what is expected.
          ...(day < 0 ? { served: soldPortions(plan, dish, day) } : {}),
        }),
      );
    }
  }
  await addAll((row: MealCount) => ctx.storage.mealCounts.add(row), rows);
}

/**
 * Plates weighed after lunch, per line and day: 22 to 46 grams for every meal served (20 to 50
 * is the range of a kitchen that serves well). Two weighings of the counter's leftovers.
 */
export async function writeWaste(
  ctx: AppContext,
  businessId: Id,
  plan: DemoPlan,
  lineIds: ReadonlyMap<string, Id>,
): Promise<void> {
  const { stamps } = createCommandKit(ctx);
  const random = createRandom(6061);
  const rows: WasteWeighing[] = [];
  for (let day = -WASTE_DAYS; day < 0; day += 1) {
    const on = dayAt(plan.today, day);
    for (const line of MENU_LINES) {
      const served = soldPortions(plan, line.dishOn(weekdayOf(on)), day);
      const perMeal = random.int(22, 46);
      if (served <= 0) {
        continue;
      }
      rows.push(
        WasteWeighingSchema.parse({
          id: ctx.ids.next(),
          businessId,
          ...stamps(),
          date: on,
          slot: 'lunch',
          lineId: must(lineIds.get(line.key), line.key),
          kind: 'plate',
          grams: served * perMeal,
        }),
      );
    }
  }
  // The counter's leftovers, weighed by hand twice in the week.
  const counter: [number, number, string][] = [
    [-5, 1_340, 'Ausgaberest an der Theke: Salat und Beilagen'],
    [-2, 860, 'Ausgaberest an der Theke: Brot und Dessert'],
  ];
  for (const [day, grams, note] of counter) {
    rows.push(
      WasteWeighingSchema.parse({
        id: ctx.ids.next(),
        businessId,
        ...stamps(),
        date: dayAt(plan.today, day),
        slot: 'lunch',
        kind: 'serving',
        grams,
        note,
      }),
    );
  }
  await addAll((row: WasteWeighing) => ctx.storage.wasteWeighings.add(row), rows);
}

/**
 * The take-away dish («Caesar Salad zum Mitnehmen») sells on the days since the first box came from
 * the market. Its portions are in the plan, so the walk books its ingredients on the day like those
 * of the other dishes. The boxes come from the market, which the walk does not know (they are
 * received after it): each day is one sale (`bookedStock`), and each portion takes its box from the
 * stock through the ledger, with the sale as its source.
 */
export async function writeTakeaway(
  ctx: AppContext,
  businessId: Id,
  plan: DemoPlan,
  dish: { id: Id; price: number },
  box: Id,
  actor: Id,
): Promise<void> {
  const { storage } = ctx;
  const { stamps } = createCommandKit(ctx);
  const ledger = createStockLedger({ ...ctx, actor });
  for (let day = -TAKEAWAY_DAYS; day < 0; day += 1) {
    const portions = plan.sales.get(day)?.get(TAKEAWAY_DISH) ?? 0;
    if (portions <= 0) {
      continue;
    }
    const soldOn: LocalDate = dayAt(plan.today, day);
    const sale: Sale = SaleSchema.parse({
      id: ctx.ids.next(),
      businessId,
      ...stamps(),
      soldOn,
      recipeId: dish.id,
      portions,
      grossRappen: portions * dish.price,
      vatBps: TAKEAWAY_VAT_BPS,
      bookedStock: true,
    });
    await storage.sales.add(sale);
    await ledger.consume({
      businessId,
      articleId: box,
      quantity: portions,
      on: soldOn,
      purpose: 'sale',
      saleId: sale.id,
    });
  }
}
