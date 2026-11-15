import { describe, expect, it } from 'vitest';
import {
  BudgetSchema,
  createStockLedger,
  MealCountSchema,
  PlanEntrySchema,
  ShoppingLineSchema,
  type LocalDate,
  type PlanSlot,
} from '../src';
import { createTestContext, seedKitchen, type TestContext } from '../src/testing';

/**
 * What the cockpit reads for the functions of ADR-0015: the meals to count today and the cost
 * per meal served (meals), and the shopping list for the market (market). The test kitchen on
 * Saturday, 14.11.2026 (see `seedKitchen`): the Weissmehl is under its minimum of 5 kg.
 */
async function setup() {
  const t = await createTestContext();
  const kitchen = await seedKitchen(t);
  return { t, kitchen, run: t.useCases, businessId: t.businessId };
}

function base(t: TestContext) {
  const now = t.clock.now();
  return { id: t.ids.next(), businessId: t.businessId, createdAt: now, updatedAt: now };
}

function meals(
  t: TestContext,
  date: string,
  slot: PlanSlot,
  counted: { expected?: number; served?: number; line?: boolean },
) {
  return MealCountSchema.parse({
    ...base(t),
    date,
    slot,
    ...(counted.line === true ? { lineId: t.ids.next() } : {}),
    ...(counted.expected === undefined ? {} : { expected: counted.expected }),
    ...(counted.served === undefined ? {} : { served: counted.served }),
  });
}

describe('cockpit.today, the meals of today', () => {
  it('lists the meals of today with what is expected, and those still to count', async () => {
    const { t, run, businessId, kitchen } = await setup();
    const today = t.clock.today();
    const entry = (slot: PlanSlot, extra: object = {}) =>
      PlanEntrySchema.parse({
        ...base(t),
        date: today,
        slot,
        recipeId: kitchen.recipes.salmonDish.id,
        portions: 40,
        ...extra,
      });
    await t.storage.planEntries.add(entry('lunch'));
    // Produced already: still a meal of today that waits for its count.
    await t.storage.planEntries.add(entry('dinner', { productionId: t.ids.next() }));
    // Lunch: 120 expected for the whole meal, nothing served yet.
    await t.storage.mealCounts.add(meals(t, today, 'lunch', { expected: 120 }));
    // Znüni, counted per line: 20 + 15 expected, 18 served on the first line.
    await t.storage.mealCounts.add(
      meals(t, today, 'morning_snack', { expected: 20, served: 18, line: true }),
    );
    await t.storage.mealCounts.add(meals(t, today, 'morning_snack', { expected: 15, line: true }));
    // Yesterday and a deleted count do not count.
    await t.storage.mealCounts.add(meals(t, '2026-11-13', 'breakfast', { expected: 30 }));
    await t.storage.mealCounts.add({
      ...meals(t, today, 'afternoon_snack', { expected: 10 }),
      deletedAt: t.clock.now(),
    });

    const result = await run['cockpit.today']({ businessId });
    expect(result.meals.slots).toEqual([
      { slot: 'morning_snack', expected: 35, served: 18, planned: false },
      { slot: 'lunch', expected: 120, planned: true },
      { slot: 'dinner', planned: true },
    ]);
    // Lunch and dinner wait for their count; the Znüni is counted.
    expect(result.todo.find((row) => row.kind === 'meals')).toEqual({
      kind: 'meals',
      count: 2,
      names: ['Mittag', 'Abend'],
      target: { page: 'plan' },
    });
  });

  it('takes the count of the whole meal before its lines, value by value', async () => {
    const { t, run, businessId } = await setup();
    const today = t.clock.today();
    // 100 expected for the whole lunch; served only per line: 55 + 45.
    await t.storage.mealCounts.add(meals(t, today, 'lunch', { expected: 100 }));
    await t.storage.mealCounts.add(
      meals(t, today, 'lunch', { expected: 60, served: 55, line: true }),
    );
    await t.storage.mealCounts.add(
      meals(t, today, 'lunch', { expected: 50, served: 45, line: true }),
    );
    const result = await run['cockpit.today']({ businessId });
    expect(result.meals.slots).toEqual([
      { slot: 'lunch', expected: 100, served: 100, planned: false },
    ]);
    expect(result.todo.map((row) => row.kind)).not.toContain('meals');
  });

  it('has no meals and nothing to count in a kitchen without plan and counts', async () => {
    const { run, businessId } = await setup();
    const result = await run['cockpit.today']({ businessId });
    expect(result.meals).toEqual({ slots: [] });
    expect(result.todo.map((row) => row.kind)).toEqual(['temperature', 'below_min']);
  });
});

describe('cockpit.today, goods per meal', () => {
  it('divides what left the stock this month by the meals served, against the budget', async () => {
    const { t, run, businessId, kitchen } = await setup();
    const ledger = createStockLedger(t.ctx);
    const today = t.clock.today();
    await t.storage.transaction(async () => {
      // Served: 2 kg Entrecôte × 62.00 = 124.00 and 1 kg Lachs × 38.00 = 38.00.
      await ledger.consume({
        businessId,
        articleId: kitchen.articles.entrecote.id,
        quantity: 2000,
        on: today,
        purpose: 'sale',
      });
      await ledger.consume({
        businessId,
        articleId: kitchen.articles.salmon.id,
        quantity: 1000,
        on: today,
        purpose: 'sale',
      });
      // The count found 9 kg Zwiebeln instead of 10: 1 kg × 2.20 = 2.20 more cost.
      await ledger.adjust({
        businessId,
        lotId: kitchen.lots.onions.id,
        counted: 9000,
        on: today,
        countId: t.ids.next(),
      });
      // A correction outside a count (an opening stock) is not a cost of the meals.
      await ledger.adjust({ businessId, lotId: kitchen.lots.eggs.id, counted: 70, on: today });
      // October does not count.
      await ledger.consume({
        businessId,
        articleId: kitchen.articles.potatoes.id,
        quantity: 1000,
        on: '2026-10-31' as LocalDate,
        purpose: 'sale',
      });
    });
    // Served this month: 12 on 14.11. (whole meal), 5 + 3 on 13.11. (lines); October stays out.
    await t.storage.mealCounts.add(meals(t, today, 'lunch', { expected: 15, served: 12 }));
    await t.storage.mealCounts.add(meals(t, '2026-11-13', 'lunch', { served: 5, line: true }));
    await t.storage.mealCounts.add(meals(t, '2026-11-13', 'lunch', { served: 3, line: true }));
    await t.storage.mealCounts.add(meals(t, '2026-10-31', 'lunch', { served: 500 }));

    // 124.00 + 38.00 + 2.20 = 164.20 for 20 meals: 8.21 each. No budget: no judgement.
    expect((await run['cockpit.today']({ businessId })).figures.costPerMeal).toEqual({
      month: '2026-11',
      costRappen: 16_420,
      served: 20,
      perMealRappen: 821,
      status: 'unknown',
    });

    const budget = BudgetSchema.parse({
      ...base(t),
      month: '2026-11',
      purchaseBudgetRappen: 100_000,
      costPerMealRappen: 900,
    });
    await t.storage.budgets.add(budget);
    const perMeal = async () => (await run['cockpit.today']({ businessId })).figures.costPerMeal;
    expect(await perMeal()).toMatchObject({ targetRappen: 900, status: 'good' });
    // 8.21 against 8.00 is 2.6 % above: a little over. Against 7.00 it is clearly over.
    await t.storage.budgets.put(BudgetSchema.parse({ ...budget, costPerMealRappen: 800 }));
    expect(await perMeal()).toMatchObject({ targetRappen: 800, status: 'watch' });
    await t.storage.budgets.put(BudgetSchema.parse({ ...budget, costPerMealRappen: 700 }));
    expect(await perMeal()).toMatchObject({ targetRappen: 700, status: 'over' });
  });
});

describe('cockpit.today, the shopping list', () => {
  it('lists the open lines of the shopping list beside the articles under their minimum', async () => {
    const { t, run, businessId, kitchen } = await setup();
    const line = (extra: object) =>
      ShoppingLineSchema.parse({ ...base(t), source: 'manual', checked: false, ...extra });
    await t.storage.shoppingLines.add(line({ text: 'Servietten' }));
    await t.storage.shoppingLines.add(
      line({ articleId: kitchen.articles.eggs.id, source: 'missing' }),
    );
    // Once is enough: the eggs a second time, the flour that is under its minimum anyway.
    await t.storage.shoppingLines.add(line({ articleId: kitchen.articles.eggs.id }));
    await t.storage.shoppingLines.add(line({ articleId: kitchen.articles.flour.id }));
    // Ticked in the market, booked with a purchase, or deleted: nothing to do any more.
    await t.storage.shoppingLines.add(line({ text: 'Alufolie', checked: true }));
    await t.storage.shoppingLines.add(line({ text: 'Becher', deliveryId: t.ids.next() }));
    await t.storage.shoppingLines.add({
      ...line({ text: 'Servietten' }),
      deletedAt: t.clock.now(),
    });

    const { todo } = await run['cockpit.today']({ businessId });
    expect(todo.map((row) => row.kind)).toEqual(['temperature', 'below_min', 'shopping']);
    expect(todo.find((row) => row.kind === 'shopping')).toEqual({
      kind: 'shopping',
      count: 2,
      names: ['Servietten', 'Eier'],
      target: { page: 'purchasing' },
    });

    // Another business on the same device sees none of it.
    const other = await createTestContext({ storage: t.storage, idStart: 10_000 });
    const theirs = await other.useCases['cockpit.today']({ businessId: other.businessId });
    expect(theirs.todo).toEqual([]);
    expect(theirs.meals).toEqual({ slots: [] });
  });
});
