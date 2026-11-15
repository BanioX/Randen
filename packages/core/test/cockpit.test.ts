import { describe, expect, it } from 'vitest';
import {
  addDays,
  ArticleSchema,
  BudgetSchema,
  CommandError,
  createStockLedger,
  HygieneCheckSchema,
  HygieneTaskSchema,
  MenuCardSchema,
  PlanEntrySchema,
  PurchaseOrderSchema,
  RecipeSchema,
  SaleSchema,
  StorageSpotSchema,
  TemperatureLogSchema,
  type Id,
  type LocalDate,
  type WasteReason,
} from '../src';
import { createTestContext, seedKitchen, type TestContext } from '../src/testing';

/**
 * The test kitchen on Saturday, 14.11.2026 (see `seedKitchen`), by hand:
 *   Entrecôte 4 kg × 62.00 = 248.00, use by 16.11.   Lachs 1.5 kg × 38.00 = 57.00, use by 15.11.
 *   Rahm 3 l + 5 l × 6.40 = 51.20   Butter 28.00   Mehl 3 kg × 1.60 = 4.80 (minimum 5 kg)
 *   Eier 27.00   Zwiebeln 22.00   Kartoffeln 45.00   Rotwein 54.00
 * Together CHF 537.00 in ten lots of nine articles, in the Kühlzelle and the Trockenlager, all
 * received on 13.11. The Kühlzelle (0 to 5 °C) and the Tiefkühlzelle (up to -18 °C) have a range.
 */
async function setup(today?: string) {
  const t = await createTestContext(today === undefined ? {} : { today });
  const kitchen = await seedKitchen(t);
  return { t, kitchen, run: t.useCases, businessId: t.businessId };
}

/** The fields every new row of a business carries. */
function base(t: TestContext) {
  const now = t.clock.now();
  return { id: t.ids.next(), businessId: t.businessId, createdAt: now, updatedAt: now };
}

const kinds = (todo: readonly { kind: string }[]) => todo.map((row) => row.kind);

describe('cockpit.today, the day', () => {
  it('lists what has to be done today: temperatures and what is under its minimum', async () => {
    const { run, businessId, kitchen } = await setup();
    const { todo } = await run['cockpit.today']({ businessId });
    expect(todo).toEqual([
      {
        kind: 'temperature',
        count: 2,
        names: ['Kühlzelle', 'Tiefkühlzelle'],
        target: { page: 'temperatures' },
      },
      { kind: 'below_min', count: 1, names: ['Weissmehl'], target: { page: 'purchasing' } },
    ]);
    // Nothing is due today or over its date yet.
    expect(kitchen.lots.salmon.expiresOn).toBe('2026-11-15');
  });

  it('lists the lots to use up within three days, with value, area and spot', async () => {
    const { run, businessId, kitchen } = await setup();
    const { useUp, figures } = await run['cockpit.today']({ businessId });
    // Lachs tomorrow (57.00), Entrecôte in two days (248.00); the old cream is due in six.
    expect(useUp).toEqual({
      lots: [
        {
          lotId: kitchen.lots.salmon.id,
          articleId: kitchen.articles.salmon.id,
          articleName: 'Lachsfilet',
          unit: 'g',
          quantity: 1500,
          valueRappen: 5700,
          area: { id: kitchen.areas.cold.id, name: 'Kühlzelle', kind: 'cold' },
          expiresOn: '2026-11-15',
          dateKind: 'use_by',
          status: 'soon',
          daysLeft: 1,
        },
        {
          lotId: kitchen.lots.entrecote.id,
          articleId: kitchen.articles.entrecote.id,
          articleName: 'Rindsentrecôte',
          unit: 'g',
          quantity: 4000,
          valueRappen: 24_800,
          area: { id: kitchen.areas.cold.id, name: 'Kühlzelle', kind: 'cold' },
          spotName: 'Schublade Fleisch',
          expiresOn: '2026-11-16',
          dateKind: 'use_by',
          status: 'soon',
          daysLeft: 2,
        },
      ],
      count: 2,
      totalValueRappen: 30_500,
    });
    expect(figures.dueToday).toEqual({ count: 0, valueRappen: 0 });
  });

  it('follows the calendar: the salmon is due today, then must not be used', async () => {
    const { t, run, businessId, kitchen } = await setup();
    t.clock.setToday('2026-11-15');
    const day1 = await run['cockpit.today']({ businessId });
    expect(kinds(day1.todo)).toEqual(['due_today', 'temperature', 'below_min']);
    expect(day1.todo[0]).toEqual({
      kind: 'due_today',
      count: 1,
      valueRappen: 5700,
      names: ['Lachsfilet'],
      target: { page: 'expiring', group: 'today' },
    });
    expect(day1.figures.dueToday).toEqual({ count: 1, valueRappen: 5700 });
    expect(day1.useUp.lots.map((lot) => [lot.articleName, lot.status, lot.daysLeft])).toEqual([
      ['Lachsfilet', 'today', 0],
      ['Rindsentrecôte', 'soon', 1],
    ]);

    t.clock.setToday('2026-11-16');
    const day2 = await run['cockpit.today']({ businessId });
    expect(kinds(day2.todo)).toEqual(['expired', 'due_today', 'temperature', 'below_min']);
    // One lot over its Verbrauchsdatum: the row leads straight to writing it off.
    expect(day2.todo[0]).toEqual({
      kind: 'expired',
      count: 1,
      valueRappen: 5700,
      names: ['Lachsfilet'],
      target: { page: 'waste', lotId: kitchen.lots.salmon.id },
    });
    expect(day2.todo[1]).toMatchObject({ kind: 'due_today', names: ['Rindsentrecôte'] });
    // What must not be used is no longer offered for using up.
    expect(day2.useUp.lots.map((lot) => lot.articleName)).toEqual(['Rindsentrecôte']);

    t.clock.setToday('2026-11-17');
    const day3 = await run['cockpit.today']({ businessId });
    // Two lots: Lachs 57.00 + Entrecôte 248.00, to the list of what has expired.
    expect(day3.todo[0]).toEqual({
      kind: 'expired',
      count: 2,
      valueRappen: 30_500,
      names: ['Lachsfilet', 'Rindsentrecôte'],
      target: { page: 'expiring', group: 'expired' },
    });
  });

  it('counts an area as measured once it has a temperature of today', async () => {
    const { t, run, businessId, kitchen } = await setup();
    const log = (areaId: string, on: LocalDate) =>
      TemperatureLogSchema.parse({
        ...base(t),
        kind: 'storage',
        areaId,
        deciC: 30,
        ok: true,
        on,
        measuredAt: t.clock.now(),
        measuredBy: t.actor,
      });
    await t.storage.temperatureLogs.add(log(kitchen.areas.cold.id, t.clock.today()));
    // Yesterday's value of the freezer does not count for today.
    await t.storage.temperatureLogs.add(log(kitchen.areas.frozen.id, addDays(t.clock.today(), -1)));
    const { todo } = await run['cockpit.today']({ businessId });
    expect(todo.find((row) => row.kind === 'temperature')).toEqual({
      kind: 'temperature',
      count: 1,
      names: ['Tiefkühlzelle'],
      target: { page: 'temperatures' },
    });
  });

  it('lists the hygiene tasks still open today: daily, weekly from their day, monthly', async () => {
    const { t, run, businessId } = await setup();
    // Saturday, 14.11.2026: the week began on Monday, 9.11., the month on 1.11.
    const task = (name: string, fields: object) => {
      const row = HygieneTaskSchema.parse({ ...base(t), name, active: true, ...fields });
      return row;
    };
    const tasks = [
      task('Arbeitsflächen desinfizieren', { frequency: 'daily' }),
      task('Böden reinigen', { frequency: 'daily' }),
      task('Kühlzelle reinigen', { frequency: 'weekly', weekday: 'sat' }),
      task('Abzug reinigen', { frequency: 'weekly', weekday: 'mon' }),
      task('Lager ausräumen', { frequency: 'weekly', weekday: 'sun' }),
      task('Fettabscheider leeren', { frequency: 'monthly' }),
      task('Lüftungsfilter wechseln', { frequency: 'monthly' }),
      task('Glacemaschine reinigen', { frequency: 'daily', active: false }),
    ];
    for (const row of tasks) {
      await t.storage.hygieneTasks.add(row);
    }
    const check = async (name: string, on: string) => {
      const row = tasks.find((candidate) => candidate.name === name);
      await t.storage.hygieneChecks.add(
        HygieneCheckSchema.parse({
          ...base(t),
          taskId: row?.id,
          on,
          doneAt: t.clock.now(),
          doneBy: t.actor,
        }),
      );
    };
    await check('Böden reinigen', '2026-11-14');
    await check('Abzug reinigen', '2026-11-09');
    await check('Fettabscheider leeren', '2026-11-02');
    // Done last month: open again in November.
    await check('Lüftungsfilter wechseln', '2026-10-30');
    // Done yesterday: a daily task is open again today.
    await check('Arbeitsflächen desinfizieren', '2026-11-13');

    const { todo } = await run['cockpit.today']({ businessId });
    expect(todo.find((row) => row.kind === 'hygiene')).toEqual({
      kind: 'hygiene',
      count: 3,
      names: ['Arbeitsflächen desinfizieren', 'Kühlzelle reinigen', 'Lüftungsfilter wechseln'],
      target: { page: 'haccp' },
    });
  });

  it('lists sent orders expected today or overdue, with their value', async () => {
    const { t, run, businessId, kitchen } = await setup();
    const today = t.clock.today();
    const order = (supplierId: string, status: string, expectedOn: LocalDate, lines: object[]) =>
      PurchaseOrderSchema.parse({
        ...base(t),
        supplierId,
        status,
        lines,
        orderedOn: addDays(today, -3),
        expectedOn,
      });
    // Butcher today: 2 kg Entrecôte × 62.00 = 124.00.
    const butcher = order(kitchen.suppliers.butcher.id, 'sent', today, [
      { articleId: kitchen.articles.entrecote.id, quantity: 2000, pricePer1000: 6200 },
    ]);
    await t.storage.orders.add(butcher);
    await t.storage.orders.add(
      order(kitchen.suppliers.wholesaler.id, 'draft', today, [
        { articleId: kitchen.articles.flour.id, quantity: 10_000, pricePer1000: 160 },
      ]),
    );
    await t.storage.orders.add(
      order(kitchen.suppliers.wholesaler.id, 'sent', addDays(today, 1), [
        { articleId: kitchen.articles.cream.id, quantity: 5000, pricePer1000: 640 },
      ]),
    );
    const one = await run['cockpit.today']({ businessId });
    expect(one.todo.find((row) => row.kind === 'orders')).toEqual({
      kind: 'orders',
      count: 1,
      valueRappen: 12_400,
      names: ['Metzgerei Muster'],
      target: { page: 'receive', orderId: butcher.id },
    });

    // Overdue since yesterday: 10 kg Mehl × 1.60 = 16.00; together 140.00, the oldest first.
    await t.storage.orders.add(
      order(kitchen.suppliers.wholesaler.id, 'sent', addDays(today, -1), [
        { articleId: kitchen.articles.flour.id, quantity: 10_000, pricePer1000: 160 },
      ]),
    );
    const two = await run['cockpit.today']({ businessId });
    expect(two.todo.find((row) => row.kind === 'orders')).toEqual({
      kind: 'orders',
      count: 2,
      valueRappen: 14_000,
      names: ['Grosshandel Beispiel', 'Metzgerei Muster'],
      target: { page: 'orders' },
    });
  });

  it('lists the dishes of today that are still to be cooked', async () => {
    const { t, run, businessId, kitchen } = await setup();
    const today = t.clock.today();
    const entry = (recipeId: string, date: LocalDate, slot: string, extra: object = {}) =>
      PlanEntrySchema.parse({ ...base(t), date, slot, recipeId, portions: 20, ...extra });
    await t.storage.planEntries.add(entry(kitchen.recipes.entrecoteDish.id, today, 'dinner'));
    await t.storage.planEntries.add(entry(kitchen.recipes.salmonDish.id, today, 'lunch'));
    await t.storage.planEntries.add(
      entry(kitchen.recipes.salmonDish.id, today, 'dinner', { productionId: t.ids.next() }),
    );
    await t.storage.planEntries.add(
      entry(kitchen.recipes.salmonDish.id, addDays(today, 1), 'lunch'),
    );
    const { todo } = await run['cockpit.today']({ businessId });
    // Lunch before dinner; the one already produced and tomorrow's do not count.
    expect(todo.find((row) => row.kind === 'plan')).toEqual({
      kind: 'plan',
      count: 2,
      names: ['Lachs mit Rahmsauce', 'Entrecôte mit Rotweinjus und Kartoffelstock'],
      target: { page: 'plan' },
    });
  });
});

describe('cockpit.today, the key figures', () => {
  it('shows stock value, food cost without revenue and no budget for a fresh kitchen', async () => {
    const { run, businessId } = await setup();
    const { figures, wasteByKind } = await run['cockpit.today']({ businessId });
    expect(figures).toEqual({
      stock: {
        valueRappen: 53_700,
        articleCount: 9,
        areaCount: 2,
        lotCount: 10,
        lotsWithoutPrice: 0,
      },
      dueToday: { count: 0, valueRappen: 0 },
      belowMinCount: 1,
      // Everything of the test kitchen came in on 13.11.
      purchasedRappen: 53_700,
      // Without sales there is no share: undefined, not a pleasant 0 %.
      foodCost: {
        month: '2026-11',
        costRappen: 0,
        netRevenueRappen: 0,
        targetBps: 3000,
        status: 'unknown',
      },
      writeOffs: { weekRappen: 0, lastWeekRappen: 0, weekCount: 0, monthRappen: 0, monthCount: 0 },
      // No meals counted: no cost per meal, not a pleasant CHF 0.00.
      costPerMeal: { month: '2026-11', costRappen: 0, served: 0, status: 'unknown' },
    });
    expect(wasteByKind).toEqual({ totalRappen: 0, kinds: [] });
  });

  it('computes the food cost of the month from consumption and the net revenue', async () => {
    const { t, run, businessId, kitchen } = await setup();
    const ledger = createStockLedger(t.ctx);
    const today = t.clock.today();
    await t.storage.transaction(async () => {
      // A dish sold: 640 g Lachs × 38.00 = 24.32 leave the stock.
      await ledger.consume({
        businessId,
        articleId: kitchen.articles.salmon.id,
        quantity: 640,
        on: today,
        purpose: 'sale',
      });
      // The jus is made: Zwiebeln 200 g × 2.20 = 0.44, Rotwein 750 ml × 9.00 = 6.75,
      // Butter 50 g × 14.00 = 0.70 go out (7.89), 1 l Jus at 7.89 comes in: nothing used yet.
      for (const [article, quantity] of [
        [kitchen.articles.onions, 200],
        [kitchen.articles.redWine, 750],
        [kitchen.articles.butter, 50],
      ] as const) {
        await ledger.consume({
          businessId,
          articleId: article.id,
          quantity,
          on: today,
          purpose: 'production',
        });
      }
      const jus = await ledger.receive({
        businessId,
        articleId: kitchen.articles.jus.id,
        areaId: kitchen.areas.cold.id,
        quantity: 1000,
        pricePer1000: 789,
        receivedOn: today,
        expiresOn: addDays(today, 3),
        origin: 'production',
      });
      // Half of it is used: the lot goes from 7.89 to 3.95, 3.94 leave the stock.
      await ledger.consume({
        businessId,
        articleId: jus.articleId,
        quantity: 500,
        on: today,
        purpose: 'sale',
      });
      // Last month does not count.
      await ledger.consume({
        businessId,
        articleId: kitchen.articles.potatoes.id,
        quantity: 1000,
        on: '2026-10-31' as LocalDate,
        purpose: 'sale',
      });
    });
    const sale = (soldOn: string, grossRappen: number) =>
      SaleSchema.parse({
        ...base(t),
        soldOn,
        label: 'Tagesumsatz',
        portions: 1,
        grossRappen,
        vatBps: 810,
        bookedStock: false,
      });
    // 4 × 34.00 = 136.00 with 8.1 % VAT: 125.81 net. October stays out.
    await t.storage.sales.add(sale('2026-11-14', 13_600));
    await t.storage.sales.add(sale('2026-10-31', 50_000));

    const { figures } = await run['cockpit.today']({ businessId });
    // Cost 24.32 + 7.89 + 3.94 − 7.89 = 28.26; 28.26 ÷ 125.81 = 22.5 %, within 30 %.
    expect(figures.foodCost).toEqual({
      month: '2026-11',
      costRappen: 2826,
      netRevenueRappen: 12_581,
      shareBps: 2246,
      targetBps: 3000,
      status: 'good',
    });
  });

  it('judges the food cost against the target of the budget, a little over and clearly over', async () => {
    const { t, run, businessId, kitchen } = await setup();
    const ledger = createStockLedger(t.ctx);
    // 1.5 kg Lachs × 38.00 = 57.00 used.
    await t.storage.transaction(async () => {
      await ledger.consume({
        businessId,
        articleId: kitchen.articles.salmon.id,
        quantity: 1500,
        on: t.clock.today(),
        purpose: 'sale',
      });
    });
    const sale = SaleSchema.parse({
      ...base(t),
      soldOn: '2026-11-10',
      label: 'Tagesumsatz',
      portions: 1,
      // 200.00 gross with 0 % VAT: 200.00 net, so 57.00 are 28.5 %.
      grossRappen: 20_000,
      vatBps: 0,
      bookedStock: false,
    });
    await t.storage.sales.add(sale);
    const budget = (targetFoodCostBps: number) =>
      BudgetSchema.parse({
        ...base(t),
        month: '2026-11',
        purchaseBudgetRappen: 100_000,
        targetFoodCostBps,
      });
    expect((await run['cockpit.today']({ businessId })).figures.foodCost).toMatchObject({
      shareBps: 2850,
      targetBps: 3000,
      status: 'good',
    });
    const tight = budget(2500);
    await t.storage.budgets.add(tight);
    expect((await run['cockpit.today']({ businessId })).figures.foodCost).toMatchObject({
      targetBps: 2500,
      status: 'watch',
    });
    await t.storage.budgets.put({ ...tight, targetFoodCostBps: 2000 });
    expect((await run['cockpit.today']({ businessId })).figures.foodCost).toMatchObject({
      targetBps: 2000,
      status: 'over',
    });
  });

  it('shows the budget of the month with what was received and the day of the month', async () => {
    const { t, run, businessId } = await setup();
    await t.storage.budgets.add(
      BudgetSchema.parse({ ...base(t), month: '2026-10', purchaseBudgetRappen: 1 }),
    );
    const november = BudgetSchema.parse({
      ...base(t),
      month: '2026-11',
      purchaseBudgetRappen: 100_000,
    });
    await t.storage.budgets.add(november);
    // A deleted budget is no budget.
    await t.storage.budgets.add(
      BudgetSchema.parse({
        ...base(t),
        month: '2026-11',
        purchaseBudgetRappen: 5,
        deletedAt: t.clock.now(),
      }),
    );
    const { figures } = await run['cockpit.today']({ businessId });
    // Everything of the test kitchen came in on 13.11.: CHF 537.00 of 1000.00, day 14 of 30.
    expect(figures.budget).toEqual({
      month: '2026-11',
      purchaseBudgetRappen: 100_000,
      spentRappen: 53_700,
      day: 14,
      daysInMonth: 30,
    });
  });

  it('adds up write-offs of this week, the week before and the last 30 days by kind', async () => {
    const { t, run, businessId, kitchen } = await setup();
    const ledger = createStockLedger(t.ctx);
    const today = t.clock.today();
    const off = (lotId: Id, quantity: number, reason: WasteReason, days: number) =>
      ledger.writeOff({ businessId, lotId, quantity, reason, on: addDays(today, -days) });
    await t.storage.transaction(async () => {
      // This week (8. to 14.11.): 500 g Lachs spoiled 19.00, 1 l Rahm overproduced 6.40.
      await off(kitchen.lots.salmon.id, 500, 'spoiled', 0);
      await off(kitchen.lots.creamOld.id, 1000, 'overproduction', 2);
      // The week before: 1 kg Zwiebeln trimmed 2.20 (9 kg left: 22.00 → 19.80).
      await off(kitchen.lots.onions.id, 1000, 'prep_waste', 8);
      // 20 days ago: 10 Eier back from the plates 4.50 (60 → 50 Eier: 27.00 → 22.50).
      await off(kitchen.lots.eggs.id, 10, 'plate_waste', 20);
      // 40 days ago, outside the 30 days: 1 kg Kartoffeln.
      await off(kitchen.lots.potatoes.id, 1000, 'damaged', 40);
    });
    const { figures, wasteByKind } = await run['cockpit.today']({ businessId });
    // This month (1. to 14.11.): this week and the Zwiebeln of 6.11., 19.00 + 6.40 + 2.20.
    expect(figures.writeOffs).toEqual({
      weekRappen: 2540,
      lastWeekRappen: 220,
      weekCount: 2,
      monthRappen: 2760,
      monthCount: 3,
    });
    // Lagerverlust 19.00, Produktionsabfall 6.40 + 2.20 = 8.60, Tellerrücklauf 4.50.
    expect(wasteByKind).toEqual({
      totalRappen: 3210,
      kinds: [
        { kind: 'storage', valueRappen: 1900 },
        { kind: 'production', valueRappen: 860 },
        { kind: 'plate', valueRappen: 450 },
      ],
    });
  });
});

describe('cockpit.today, dishes by margin', () => {
  it('ranks the dishes of the test kitchen by margin and by food cost', async () => {
    const { run, businessId, kitchen } = await setup();
    const { dishes } = await run['cockpit.today']({ businessId });
    // Entrecôte, 10 portions: 2 kg × 62.00 = 124.00, Jus 500 ml × 7.89 = 3.945, Kartoffeln
    // 2.5 kg × 1.80 = 4.50, Rahm 400 ml × 6.40 = 2.56, Butter 150 g × 14.00 = 2.10:
    // 137.105 ÷ 10 = 13.71 a portion. 42.00 with 8.1 % VAT is 38.85 net: margin 25.14, 35.3 %.
    // Lachs, 4 portions: 24.32 + 1.92 + 0.56 = 26.80 ÷ 4 = 6.70. 34.00 is 31.45 net: 24.75, 21.3 %.
    const entrecote = {
      recipeId: kitchen.recipes.entrecoteDish.id,
      name: 'Entrecôte mit Rotweinjus und Kartoffelstock',
      priceRappen: 4200,
      costPerPortionRappen: 1371,
      marginRappen: 2514,
      foodCostBps: 3529,
      status: 'over',
    };
    const salmon = {
      recipeId: kitchen.recipes.salmonDish.id,
      name: 'Lachs mit Rahmsauce',
      priceRappen: 3400,
      costPerPortionRappen: 670,
      marginRappen: 2475,
      foodCostBps: 2130,
      status: 'good',
    };
    expect(dishes).toEqual({
      best: [entrecote, salmon],
      worst: [entrecote, salmon],
      dishCount: 2,
      withoutPrice: 0,
      withoutCost: 0,
      targetBps: 3000,
    });
  });

  it('keeps three of each and names the dishes it cannot rank', async () => {
    const { t, run, businessId, kitchen } = await setup();
    const now = t.clock.now();
    const dish = (name: string, fields: object) =>
      RecipeSchema.parse({
        id: t.ids.next(),
        businessId,
        createdAt: now,
        updatedAt: now,
        name,
        kind: 'dish',
        course: 'main',
        portions: 1,
        ingredients: [],
        steps: [],
        vatBps: 810,
        extraAllergens: [],
        extraTraces: [],
        labels: [],
        active: true,
        ...fields,
      });
    // An article without a price yet.
    const veal = ArticleSchema.parse({
      ...kitchen.articles.entrecote,
      id: t.ids.next(),
      name: 'Kalbsschnitzel',
      pricePer1000: 0,
    });
    await t.storage.articles.add(veal);
    const vealId = veal.id;
    for (const row of [
      // 18.50 is 17.11 net; Butter 50 g × 14.00 = 0.70: margin 16.41, 4.1 %.
      dish('Randen-Carpaccio', {
        priceRappen: 1850,
        ingredients: [{ articleId: kitchen.articles.butter.id, quantity: 50 }],
      }),
      // 12.00 is 11.10 net; 1 kg Kartoffeln net is 1.25 kg gross × 1.80 = 2.25 ÷ 4 = 0.56:
      // margin 10.54, 5 %.
      dish('Kartoffelgratin', {
        priceRappen: 1200,
        portions: 4,
        ingredients: [{ articleId: kitchen.articles.potatoes.id, quantity: 1000 }],
      }),
      dish('Tagessuppe', {
        ingredients: [{ articleId: kitchen.articles.onions.id, quantity: 100 }],
      }),
      dish('Rahmschnitzel', {
        priceRappen: 3900,
        ingredients: [{ articleId: vealId, quantity: 180 }],
      }),
      dish('Ohne Zutaten', { priceRappen: 900 }),
      dish('Alter Teller', { priceRappen: 2000, active: false }),
    ]) {
      await t.storage.recipes.add(row);
    }
    const { dishes } = await run['cockpit.today']({ businessId });
    expect(dishes.best.map((row) => [row.name, row.marginRappen])).toEqual([
      ['Entrecôte mit Rotweinjus und Kartoffelstock', 2514],
      ['Lachs mit Rahmsauce', 2475],
      ['Randen-Carpaccio', 1641],
    ]);
    expect(dishes.worst.map((row) => [row.name, row.foodCostBps])).toEqual([
      ['Entrecôte mit Rotweinjus und Kartoffelstock', 3529],
      ['Lachs mit Rahmsauce', 2130],
      ['Kartoffelgratin', 505],
    ]);
    // Seven active dishes: one without a price, two whose cost is not known in full.
    expect(dishes).toMatchObject({ dishCount: 7, withoutPrice: 1, withoutCost: 2 });
  });
});

describe('cockpit.today, the first steps', () => {
  it('offers the first steps and the demo business to an empty business', async () => {
    const t = await createTestContext();
    const result = await t.useCases['cockpit.today']({ businessId: t.businessId });
    expect(result.setup).toEqual({
      empty: true,
      young: true,
      steps: [
        { step: 'spots', done: false },
        { step: 'articles', done: false, count: 0 },
        { step: 'receipt', done: false },
        { step: 'recipe', done: false },
        { step: 'menu', done: false },
        { step: 'temperature', done: false },
      ],
    });
    expect(result.todo).toEqual([]);
    expect(result.useUp).toEqual({ lots: [], count: 0, totalValueRappen: 0 });
    expect(result.figures.stock).toEqual({
      valueRappen: 0,
      articleCount: 0,
      areaCount: 0,
      lotCount: 0,
      lotsWithoutPrice: 0,
    });
    expect(result.dishes).toEqual({
      best: [],
      worst: [],
      dishCount: 0,
      withoutPrice: 0,
      withoutCost: 0,
      targetBps: 3000,
    });
  });

  it('ticks off what the test kitchen has done, and stops being young after 30 days', async () => {
    const { t, run, businessId, kitchen } = await setup();
    const { setup: steps } = await run['cockpit.today']({ businessId });
    expect(steps).toEqual({
      empty: false,
      young: true,
      steps: [
        { step: 'spots', done: true },
        { step: 'articles', done: true, count: 10 },
        { step: 'receipt', done: true },
        { step: 'recipe', done: true },
        { step: 'menu', done: false },
        { step: 'temperature', done: false },
      ],
    });
    await t.storage.menuCards.add(
      MenuCardSchema.parse({
        ...base(t),
        name: 'Abendkarte',
        sections: [],
        showPrices: true,
        showPhotos: true,
        published: false,
      }),
    );
    await t.storage.temperatureLogs.add(
      TemperatureLogSchema.parse({
        ...base(t),
        kind: 'storage',
        areaId: kitchen.areas.cold.id,
        deciC: 40,
        ok: true,
        on: t.clock.today(),
        measuredAt: t.clock.now(),
        measuredBy: t.actor,
      }),
    );
    const done = await run['cockpit.today']({ businessId });
    expect(done.setup.steps.every((step) => step.done)).toBe(true);
    t.clock.setToday('2026-12-14');
    expect((await run['cockpit.today']({ businessId })).setup.young).toBe(false);
  });

  it('counts a spot only if it is not deleted', async () => {
    const t = await createTestContext();
    const now = t.clock.now();
    await t.storage.spots.add(
      StorageSpotSchema.parse({
        id: t.ids.next(),
        businessId: t.businessId,
        areaId: t.ids.next(),
        name: 'Regal 3',
        sortOrder: 0,
        createdAt: now,
        updatedAt: now,
        deletedAt: now,
      }),
    );
    const { setup: steps } = await t.useCases['cockpit.today']({ businessId: t.businessId });
    expect(steps.steps[0]).toEqual({ step: 'spots', done: false });
  });
});

describe('cockpit.today, boundaries', () => {
  it('reads and writes nothing else: no event, no command, the same answer twice', async () => {
    const { t, run, businessId } = await setup();
    const before = await t.storage.events.ofBusiness(businessId);
    const first = await run['cockpit.today']({ businessId });
    const second = await run['cockpit.today']({ businessId });
    expect(second).toEqual(first);
    expect(await t.storage.events.ofBusiness(businessId)).toEqual(before);
  });

  it('shows another business nothing of this one', async () => {
    const { t } = await setup();
    const other = await createTestContext({ storage: t.storage, idStart: 10_000 });
    const result = await other.useCases['cockpit.today']({ businessId: other.businessId });
    expect(result.todo).toEqual([]);
    expect(result.figures.stock.valueRappen).toBe(0);
    expect(result.dishes.dishCount).toBe(0);
    expect(result.setup.empty).toBe(true);
  });

  it('refuses a business that does not exist', async () => {
    const { t } = await setup();
    await expect(t.useCases['cockpit.today']({ businessId: t.ids.next() })).rejects.toThrow(
      CommandError,
    );
    await expect(t.useCases['cockpit.today']({ businessId: 'not-an-id' })).rejects.toThrow();
  });
});
