import { describe, expect, it } from 'vitest';
import {
  createStockLedger,
  localDate,
  MealCountSchema,
  MenuLineSchema,
  PlanEntrySchema,
  ProductionSchema,
  SaleSchema,
  WasteWeighingSchema,
} from '../src';
import { createTestContext, seedKitchen, type TestContext } from '../src/testing';

/** The test kitchen on Saturday, 14.11.2026, a business with a budget for November. */
async function setup() {
  const t = await createTestContext({ today: '2026-11-14' });
  const kitchen = await seedKitchen(t);
  return {
    t,
    kitchen,
    ledger: createStockLedger(t.ctx),
    run: t.useCases,
    businessId: t.businessId,
  };
}
type Setup = Awaited<ReturnType<typeof setup>>;

const TODAY = localDate('2026-11-14');

/** The fields every new row of the business carries. */
function stamps(t: TestContext) {
  const now = t.clock.now();
  return { id: t.ids.next(), businessId: t.businessId, createdAt: now, updatedAt: now };
}

async function sell(t: TestContext, gross: number, recipeId?: string) {
  await t.storage.sales.add(
    SaleSchema.parse({
      ...stamps(t),
      soldOn: TODAY,
      portions: 1,
      grossRappen: gross,
      vatBps: 810,
      bookedStock: false,
      ...(recipeId === undefined ? { label: 'Getränke' } : { recipeId }),
    }),
  );
}

/** The writes of one day: write-offs, a production for a line, sales, meals and plate returns. */
async function bookTheDay(s: Setup) {
  const { t, kitchen, ledger, businessId } = s;
  await budgetAndDay(s);
  const line = MenuLineSchema.parse({
    ...stamps(t),
    name: 'Menü 1',
    sortOrder: 0,
    costTargetRappen: 300,
    freeOf: [],
    active: true,
  });
  await t.storage.menuLines.add(line);
  const entry = PlanEntrySchema.parse({
    ...stamps(t),
    date: TODAY,
    slot: 'lunch',
    recipeId: kitchen.recipes.entrecoteDish.id,
    portions: 40,
    lineId: line.id,
  });
  await t.storage.planEntries.add(entry);
  const production = ProductionSchema.parse({
    ...stamps(t),
    recipeId: kitchen.recipes.entrecoteDish.id,
    portions: 40,
    producedOn: TODAY,
    costRappen: 12_400,
    shortages: [],
    planEntryId: entry.id,
    producedBy: t.actor,
  });
  await t.storage.productions.add(production);
  await t.storage.transaction(async () => {
    // Production: 2000 g Entrecôte at CHF 62.00/kg = CHF 124.00, booked for the production.
    await ledger.consume({
      businessId,
      articleId: kitchen.articles.entrecote.id,
      quantity: 2000,
      on: TODAY,
      purpose: 'production',
      productionId: production.id,
    });
    // Write-offs of the day: 500 g Lachs spoiled 19.00, 1000 g Zwiebeln overproduction 2.20,
    // 2 eggs damaged 0.90, 500 ml Rotwein other 4.50. Together CHF 26.60.
    await ledger.writeOff({
      businessId,
      lotId: kitchen.lots.salmon.id,
      quantity: 500,
      reason: 'spoiled',
      on: TODAY,
    });
    await ledger.writeOff({
      businessId,
      lotId: kitchen.lots.onions.id,
      quantity: 1000,
      reason: 'overproduction',
      on: TODAY,
    });
    await ledger.writeOff({
      businessId,
      lotId: kitchen.lots.eggs.id,
      quantity: 2,
      reason: 'damaged',
      on: TODAY,
    });
    await ledger.writeOff({
      businessId,
      lotId: kitchen.lots.redWine.id,
      quantity: 500,
      reason: 'other',
      on: TODAY,
    });
  });
  // The line: 40 meals served; the whole meal counted through the line.
  await t.storage.mealCounts.add(
    MealCountSchema.parse({
      ...stamps(t),
      date: TODAY,
      slot: 'lunch',
      lineId: line.id,
      served: 40,
    }),
  );
  // Plate returns: 2500 g weighed on the plates.
  await t.storage.wasteWeighings.add(
    WasteWeighingSchema.parse({
      ...stamps(t),
      date: TODAY,
      slot: 'lunch',
      kind: 'plate',
      grams: 2500,
    }),
  );
  // Sales: Lachs mit Rahmsauce (3400 gross), Entrecôte (4200 gross), a drink-only revenue (10810 gross).
  await sell(t, 3_400, kitchen.recipes.salmonDish.id);
  await sell(t, 4_200, kitchen.recipes.entrecoteDish.id);
  await sell(t, 10_810);
  return line;
}

/** The budget of November: CHF 22’000.00 for goods, CHF 35’000.00 fixed, CHF 3.00 goods per meal. */
async function budgetAndDay(s: Setup) {
  await s.run['budgets.set']({
    commandId: s.t.cmd(),
    businessId: s.businessId,
    month: '2026-11',
    purchaseBudgetRappen: 2_200_000,
    fixedCostsRappen: 3_500_000,
    costPerMealRappen: 300,
  });
}

describe('numbers.waste, the write-offs of a period', () => {
  it('sorts the write-offs by kind and reason, in francs and in the units of each article', async () => {
    const s = await setup();
    await bookTheDay(s);
    const report = await s.run['numbers.waste']({
      businessId: s.businessId,
      from: TODAY,
      to: TODAY,
    });
    // 19.00 + 2.20 + 0.90 + 4.50 = 26.60.
    expect(report.totalRappen).toBe(2_660);
    expect(report.byKind.map((row) => [row.kind, row.valueRappen])).toEqual([
      ['storage', 1_990],
      ['production', 220],
      ['plate', 0],
      ['other', 450],
    ]);
    // Grams only of gram-articles; eggs are counted in pieces, Rotwein in millilitres, apart.
    expect(report.byKind[0]).toMatchObject({
      label: 'Lagerverlust',
      grams: 500,
      pieces: 2,
      millilitres: 0,
      count: 2,
    });
    expect(report.byKind[3]).toMatchObject({ label: 'Anderes', millilitres: 500, grams: 0 });
    expect(report.byReason.map((row) => row.reason)).toEqual([
      'spoiled',
      'overproduction',
      'damaged',
      'other',
    ]);
    expect(report.byReason[0]).toMatchObject({
      label: 'Verdorben',
      kind: 'storage',
      valueRappen: 1_900,
      grams: 500,
    });
    // Ranked by value: Lachs first.
    expect(report.topArticles.map((row) => [row.name, row.valueRappen])).toEqual([
      ['Lachsfilet', 1_900],
      ['Rotwein zum Kochen', 450],
      ['Zwiebeln', 220],
      ['Eier', 90],
    ]);
    expect(report.topArticles[0]).toMatchObject({ unit: 'g', quantity: 500, count: 1 });
    // 14.11.2026 is a Saturday.
    expect(report.byWeekday.find((row) => row.weekday === 'sat')?.valueRappen).toBe(2_660);
    expect(report.byWeekday.find((row) => row.weekday === 'mon')?.valueRappen).toBe(0);
    // No purchases today, so no share; nothing written off yesterday, so no change.
    expect(report.shareOfPurchasesBps).toBeUndefined();
    expect(report.changeBps).toBeUndefined();
    expect(report.previousRappen).toBe(0);
  });

  it('acceptance: 500 g of salmon written off as spoiled are Lagerverlust of CHF 19.00 and 0.5 kg', async () => {
    const s = await setup();
    await s.t.storage.transaction(() =>
      s.ledger.writeOff({
        businessId: s.businessId,
        lotId: s.kitchen.lots.salmon.id,
        quantity: 500,
        reason: 'spoiled',
        on: TODAY,
      }),
    );
    const report = await s.run['numbers.waste']({
      businessId: s.businessId,
      from: TODAY,
      to: TODAY,
    });
    const storage = report.byKind.find((row) => row.kind === 'storage');
    expect(storage?.label).toBe('Lagerverlust');
    expect(storage?.valueRappen).toBe(1_900);
    expect(storage?.grams).toBe(500);
  });

  it('compares with the period before and gives the share of the purchases', async () => {
    const s = await setup();
    // Yesterday: 6000 ml of Rotwein written off as expired, 6 × 9.00 = CHF 54.00.
    await s.t.storage.transaction(() =>
      s.ledger.writeOff({
        businessId: s.businessId,
        lotId: s.kitchen.lots.redWine.id,
        quantity: 6000,
        reason: 'expired',
        on: localDate('2026-11-13'),
      }),
    );
    // Today: 1000 g of Lachs spoiled at CHF 38.00/kg = CHF 38.00. Change: 3800 against 5400 = −29.63 %.
    await s.t.storage.transaction(() =>
      s.ledger.writeOff({
        businessId: s.businessId,
        lotId: s.kitchen.lots.salmon.id,
        quantity: 1000,
        reason: 'spoiled',
        on: TODAY,
      }),
    );
    const report = await s.run['numbers.waste']({
      businessId: s.businessId,
      from: TODAY,
      to: TODAY,
    });
    expect(report.totalRappen).toBe(3_800);
    expect(report.previousRappen).toBe(5_400);
    expect(report.changeBps).toBe(-2_963);
    // Purchases today are none: no share of purchases.
    expect(report.shareOfPurchasesBps).toBeUndefined();
  });
});

describe('numbers.monthReport, the month in one view', () => {
  it('gives the month: costs, revenue, budget, write-offs, meals and the dishes', async () => {
    const s = await setup();
    await bookTheDay(s);
    const report = await s.run['numbers.monthReport']({
      businessId: s.businessId,
      month: '2026-11',
    });
    expect(report.businessName).toBe('Testküche');
    expect(report.from).toBe('2026-11-01');
    expect(report.to).toBe('2026-11-30');
    // Purchases of November: the seed’s CHF 537.00. Cost of goods: the 2000 g Entrecôte, CHF 124.00.
    expect(report.totals.purchasesRappen).toBe(53_700);
    expect(report.totals.costOfGoodsRappen).toBe(12_400);
    expect(report.totals.wasteRappen).toBe(2_660);
    // Net revenue: 34.00 gross Lachs = 31.45 net; 42.00 gross Entrecôte = 38.85 net; 108.10 gross = 100.00 net.
    expect(report.totals.grossRevenueRappen).toBe(18_410);
    expect(report.totals.netRevenueRappen).toBe(17_030);
    // Food cost 12 400 / 17 030 = 72.81 %.
    expect(report.totals.foodCostBps).toBe(7_281);
    // Stock at the end of the month: 537.00 + 0 − 124.00 − 26.60 = 386.40 (all movements).
    expect(report.stockValueEndRappen).toBe(38_640);
    // Budget: 53’700 spent of 22’000.00, projected 115’071 at the pace of the 14th: on track.
    expect(report.budget.budgetRappen).toBe(2_200_000);
    expect(report.budget.spentRappen).toBe(53_700);
    expect(report.budget.status).toBe('on_track');
    // Waste: CHF 26.60 of CHF 537.00 purchases: 4.95 %.
    expect(report.waste.totalRappen).toBe(2_660);
    expect(report.waste.shareOfPurchasesBps).toBe(495);
    expect(report.waste.byKind.map((row) => row.label)).toEqual([
      'Lagerverlust',
      'Produktionsabfall',
      'Tellerrücklauf',
      'Anderes',
    ]);
    // Break-even: fixed costs CHF 35’000.00 are far above the revenue so far: not reached.
    expect(report.breakEven.fixedCostsRappen).toBe(3_500_000);
    expect(report.breakEven.reached).toBe(false);
    expect(report.breakEven.reasons).toEqual([]);
    // Dishes: Entrecôte contributes 3885 − 1371 = 2514, Lachs 3145 − 670 = 2475. Both are in the best list.
    expect(report.dishes.best.map((row) => [row.name, row.contributionRappen])).toEqual([
      ['Entrecôte mit Rotweinjus und Kartoffelstock', 2_514],
      ['Lachs mit Rahmsauce', 2_475],
    ]);
    expect(report.dishes.weakest).toEqual([]);
    expect(report.dishes.withoutCost).toBe(0);
    // Incomplete: 13 days of November up to today have no sales entry (only today has one).
    expect(report.incomplete.daysWithoutSales).toBe(13);
    expect(report.incomplete.consumptionWithoutSalesRappen).toBe(0);
  });

  it('shows the goods per meal against the target of the budget, and the plate returns in grams', async () => {
    const s = await setup();
    await bookTheDay(s);
    const report = await s.run['numbers.monthReport']({
      businessId: s.businessId,
      month: '2026-11',
    });
    // Goods 12 400 over 40 meals served: 310 Rappen per meal; target 300 from the budget.
    expect(report.meals.servedMeals).toBe(40);
    expect(report.meals.goodsRappen).toBe(12_400);
    expect(report.meals.perMealRappen).toBe(310);
    expect(report.meals.targetPerMealRappen).toBe(300);
    // Plate returns 2500 g: 62.5 g per meal; the goods of the gram articles cost CHF 62.00 per kg:
    // 2500 g × 6200 / 1000 = 15’500 Rappen.
    expect(report.meals.plateReturnGrams).toBe(2_500);
    expect(report.meals.plateReturnPerMealGrams).toBe(62.5);
    expect(report.meals.costPerKgRappen).toBe(6_200);
    expect(report.meals.plateReturnValueRappen).toBe(15_500);
    // The line: 40 meals, goods of its production 12 400, target from the line 300.
    expect(report.meals.lines).toHaveLength(1);
    expect(report.meals.lines[0]).toMatchObject({
      name: 'Menü 1',
      servedMeals: 40,
      goodsRappen: 12_400,
      perMealRappen: 310,
      targetPerMealRappen: 300,
    });
  });

  it('shows no target per meal while the budget has none, and no meal figure without meals', async () => {
    const s = await setup();
    await s.run['budgets.set']({
      commandId: s.t.cmd(),
      businessId: s.businessId,
      month: '2026-11',
      purchaseBudgetRappen: 2_200_000,
    });
    const report = await s.run['numbers.monthReport']({
      businessId: s.businessId,
      month: '2026-11',
    });
    expect(report.meals.servedMeals).toBe(0);
    expect(report.meals.perMealRappen).toBeUndefined();
    expect(report.meals.targetPerMealRappen).toBeUndefined();
    expect(report.meals.plateReturnPerMealGrams).toBeUndefined();
    expect(report.breakEven.reasons).toEqual(
      expect.arrayContaining(['no_fixed_costs', 'no_revenue']),
    );
  });

  it('shows the goods per meal of the overview too', async () => {
    const s = await setup();
    await bookTheDay(s);
    const overview = await s.run['numbers.overview']({
      businessId: s.businessId,
      from: TODAY,
      to: TODAY,
    });
    expect(overview.meals.perMealRappen).toBe(310);
    expect(overview.meals.targetPerMealRappen).toBe(300);
    expect(overview.budget.status).toBe('on_track');
  });

  it('shows nothing of another business', async () => {
    const s = await setup();
    await bookTheDay(s);
    const other = await createTestContext({
      storage: s.t.storage,
      today: '2026-11-14',
      idStart: 50_000,
    });
    const report = await other.useCases['numbers.monthReport']({
      businessId: other.businessId,
      month: '2026-11',
    });
    expect(report.totals.purchasesRappen).toBe(0);
    expect(report.totals.netRevenueRappen).toBe(0);
    expect(report.waste.totalRappen).toBe(0);
    expect(report.dishes.best).toEqual([]);
  });
});
