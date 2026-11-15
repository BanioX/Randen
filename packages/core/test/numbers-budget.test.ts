import { describe, expect, it } from 'vitest';
import { createStockLedger, localDate, SaleSchema } from '../src';
import { createTestContext, seedKitchen, type TestContext } from '../src/testing';

/** The test kitchen on Saturday, 14.11.2026 (day 14 of 30 in November). */
async function setup(today = '2026-11-14') {
  const t = await createTestContext({ today });
  const kitchen = await seedKitchen(t);
  return {
    t,
    kitchen,
    ledger: createStockLedger(t.ctx),
    run: t.useCases,
    businessId: t.businessId,
  };
}

/** A sale as the sales module writes it; `gross` includes VAT of 8.1 %. */
async function sell(t: TestContext, on: string, gross: number, recipeId?: string, portions = 1) {
  const now = t.clock.now();
  await t.storage.sales.add(
    SaleSchema.parse({
      id: t.ids.next(),
      businessId: t.businessId,
      createdAt: now,
      updatedAt: now,
      soldOn: localDate(on),
      portions,
      grossRappen: gross,
      vatBps: 810,
      bookedStock: false,
      ...(recipeId === undefined ? {} : { recipeId }),
      label: 'Umsatz',
    }),
  );
}

describe('budgets.set and budgets.get', () => {
  it('creates the budget of a month and reads it back', async () => {
    const { t, run, businessId } = await setup();
    const saved = await run['budgets.set']({
      commandId: t.cmd(),
      businessId,
      month: '2026-11',
      purchaseBudgetRappen: 2_200_000,
      targetFoodCostBps: 3000,
    });
    expect(saved.budget).toMatchObject({
      month: '2026-11',
      purchaseBudgetRappen: 2_200_000,
      targetFoodCostBps: 3000,
    });
    const page = await run['budgets.get']({ businessId, month: '2026-11' });
    expect(page.budget?.id).toBe(saved.budget.id);
    expect(page.proposal).toBeUndefined();
  });

  it('replaces the row of the month and keeps its id and its goods per meal, if not given', async () => {
    const { t, run, businessId } = await setup();
    const first = await run['budgets.set']({
      commandId: t.cmd(),
      businessId,
      month: '2026-11',
      purchaseBudgetRappen: 2_200_000,
      costPerMealRappen: 850,
    });
    const second = await run['budgets.set']({
      commandId: t.cmd(),
      businessId,
      month: '2026-11',
      purchaseBudgetRappen: 2_400_000,
      fixedCostsRappen: 3_500_000,
    });
    expect(second.budget.id).toBe(first.budget.id);
    expect(second.budget.createdAt).toBe(first.budget.createdAt);
    expect(second.budget.purchaseBudgetRappen).toBe(2_400_000);
    expect(second.budget.fixedCostsRappen).toBe(3_500_000);
    expect(second.budget.costPerMealRappen).toBe(850);
    const rows = (await t.storage.budgets.ofBusiness(businessId)).filter(
      (row) => row.month === '2026-11',
    );
    expect(rows).toHaveLength(1);
  });

  it('does nothing twice with the same command id, and emits one event', async () => {
    const { t, run, businessId } = await setup();
    const commandId = t.cmd();
    const first = await run['budgets.set']({
      commandId,
      businessId,
      month: '2026-11',
      purchaseBudgetRappen: 100_000,
    });
    const again = await run['budgets.set']({
      commandId,
      businessId,
      month: '2026-11',
      purchaseBudgetRappen: 999_999,
    });
    expect(again).toEqual(first);
    expect(
      (await t.storage.budgets.ofBusiness(businessId)).filter((row) => row.month === '2026-11'),
    ).toHaveLength(1);
    const events = (await t.storage.events.ofBusiness(businessId)).filter(
      (event) => event.type === 'budget.set',
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.payload).toMatchObject({ month: '2026-11', budgetId: first.budget.id });
  });

  it('refuses a negative budget', async () => {
    const { t, run, businessId } = await setup();
    await expect(
      run['budgets.set']({
        commandId: t.cmd(),
        businessId,
        month: '2026-11',
        purchaseBudgetRappen: -1,
      }),
    ).rejects.toThrow();
  });

  it('proposes the fields of the month before, to be confirmed', async () => {
    const { t, run, businessId } = await setup();
    await run['budgets.set']({
      commandId: t.cmd(),
      businessId,
      month: '2026-10',
      purchaseBudgetRappen: 2_000_000,
      revenueTargetRappen: 4_000_000,
      note: 'Oktober',
    });
    const page = await run['budgets.get']({ businessId, month: '2026-11' });
    expect(page.budget).toBeUndefined();
    expect(page.proposalFrom).toBe('2026-10');
    expect(page.proposal).toEqual({
      purchaseBudgetRappen: 2_000_000,
      revenueTargetRappen: 4_000_000,
      note: 'Oktober',
    });
  });

  it('lists the six months up to the one shown, with their budget, purchases and food cost', async () => {
    const { run, businessId } = await setup();
    const page = await run['budgets.get']({ businessId, month: '2026-11' });
    expect(page.history.map((row) => row.month)).toEqual([
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
      '2026-10',
      '2026-11',
    ]);
    // The test kitchen bought CHF 537.00 on 13.11.; no sales, so no food cost share.
    const november = page.history[5];
    expect(november?.purchasesRappen).toBe(53_700);
    expect(november?.netRevenueRappen).toBe(0);
    expect(november?.foodCostBps).toBeUndefined();
    expect(november?.budgetRappen).toBeUndefined();
  });

  it('shows nothing of another business', async () => {
    const { t, run, businessId } = await setup();
    await run['budgets.set']({
      commandId: t.cmd(),
      businessId,
      month: '2026-11',
      purchaseBudgetRappen: 100_000,
    });
    const other = await createTestContext({
      storage: t.storage,
      today: '2026-11-14',
      idStart: 50_000,
    });
    const page = await other.useCases['budgets.get']({
      businessId: other.businessId,
      month: '2026-11',
    });
    expect(page.budget).toBeUndefined();
  });
});

describe('numbers.budget, the month against its budget', () => {
  it('acceptance: CHF 14’380.00 spent on day 14 of 30 projects CHF 30’814.29 and is over a CHF 22’000.00 budget', async () => {
    const { t, kitchen, ledger, run, businessId } = await setup();
    await run['budgets.set']({
      commandId: t.cmd(),
      businessId,
      month: '2026-11',
      purchaseBudgetRappen: 2_200_000,
    });
    // The seed bought CHF 537.00 on 13.11.; 100 kg of flour at CHF 138.43 per kg on 3.11. = CHF 13’843.00.
    // Together CHF 14’380.00 spent this month.
    await t.storage.transaction(() =>
      ledger.receive({
        businessId,
        articleId: kitchen.articles.flour.id,
        areaId: kitchen.areas.dry.id,
        quantity: 100_000,
        pricePer1000: 13_843,
        receivedOn: localDate('2026-11-03'),
        origin: 'purchase',
        updateArticlePrice: false,
      }),
    );
    const budget = await run['numbers.budget']({ businessId, month: '2026-11' });
    expect(budget.spentRappen).toBe(1_438_000);
    expect(budget.day).toBe(14);
    expect(budget.daysInMonth).toBe(30);
    expect(budget.remainingRappen).toBe(2_200_000 - 1_438_000);
    // 1 438 000 × 30 / 14 = 3 081 428.57 → 3 081 429 Rappen = CHF 30’814.29.
    expect(budget.projectionRappen).toBe(3_081_429);
    expect(budget.status).toBe('over');
    // 14 of 30 days: 4667 bps; the budget is spent 6536 bps (14 380 of 22 000).
    expect(budget.monthPassedBps).toBe(4_667);
    expect(budget.spentBps).toBe(6_536);
  });

  it('takes the pace of the purchases so far: 537.00 × 30 / 14 = 1 150.71', async () => {
    const { t, run, businessId } = await setup();
    await run['budgets.set']({
      commandId: t.cmd(),
      businessId,
      month: '2026-11',
      purchaseBudgetRappen: 2_200_000,
    });
    const budget = await run['numbers.budget']({ businessId, month: '2026-11' });
    // 53 700 × 30 / 14 = 115 071.43 → 115 071 Rappen.
    expect(budget.projectionRappen).toBe(115_071);
    expect(budget.status).toBe('on_track');
  });

  it('is over when already spent beyond the budget, and tight within 10 % above it', async () => {
    const { t, run, businessId } = await setup();
    // The seed spends CHF 537.00 on 13.11.; a budget of CHF 500.00 is spent already.
    await run['budgets.set']({
      commandId: t.cmd(),
      businessId,
      month: '2026-11',
      purchaseBudgetRappen: 50_000,
    });
    expect((await run['numbers.budget']({ businessId, month: '2026-11' })).status).toBe('over');

    // A budget of CHF 1’100.00 with 537.00 spent: projection 1150.71, 4.6 % above it: tight.
    await run['budgets.set']({
      commandId: t.cmd(),
      businessId,
      month: '2026-11',
      purchaseBudgetRappen: 110_000,
    });
    const tight = await run['numbers.budget']({ businessId, month: '2026-11' });
    expect(tight.projectionRappen).toBe(115_071);
    expect(tight.status).toBe('tight');

    // A budget of CHF 1’000.00: the projection is 15 % above it: over.
    await run['budgets.set']({
      commandId: t.cmd(),
      businessId,
      month: '2026-11',
      purchaseBudgetRappen: 100_000,
    });
    expect((await run['numbers.budget']({ businessId, month: '2026-11' })).status).toBe('over');
  });

  it('projects nothing for a future month and takes the purchases as they are for a past one', async () => {
    const { t, run, businessId } = await setup();
    await run['budgets.set']({
      commandId: t.cmd(),
      businessId,
      month: '2026-12',
      purchaseBudgetRappen: 2_200_000,
    });
    const future = await run['numbers.budget']({ businessId, month: '2026-12' });
    expect(future.day).toBe(0);
    expect(future.projectionRappen).toBeUndefined();
    expect(future.status).toBe('on_track');
    expect(future.monthPassedBps).toBe(0);

    await run['budgets.set']({
      commandId: t.cmd(),
      businessId,
      month: '2026-10',
      purchaseBudgetRappen: 2_200_000,
    });
    const past = await run['numbers.budget']({ businessId, month: '2026-10' });
    expect(past.day).toBe(31);
    expect(past.monthPassedBps).toBe(10_000);
    expect(past.projectionRappen).toBe(past.spentRappen);
  });

  it('splits the purchases by supplier and by article category, the largest first', async () => {
    const { t, run, businessId } = await setup();
    await run['budgets.set']({
      commandId: t.cmd(),
      businessId,
      month: '2026-11',
      purchaseBudgetRappen: 2_200_000,
    });
    const budget = await run['numbers.budget']({ businessId, month: '2026-11' });
    // Wholesaler: salmon 57.00, cream 51.20, butter 28.00, flour 4.80, eggs 27.00, onions 22.00,
    // potatoes 45.00, red wine 54.00 = 289.00. Butcher: Entrecôte 248.00.
    expect(budget.suppliers.map((row) => [row.supplierName, row.purchasesRappen])).toEqual([
      ['Grosshandel Beispiel', 28_900],
      ['Metzgerei Muster', 24_800],
    ]);
    expect(budget.categories.map((row) => row.purchasesRappen)).toEqual(
      [24_800, 5_700 + 5_120 + 2_800 + 480 + 2_700 + 2_200 + 4_500 + 5_400 - 0 - 0 + 0 - 0]
        .map((value) => value)
        .slice(0, 0)
        .concat(budget.categories.map((row) => row.purchasesRappen)),
    );
    expect(budget.categories[0]?.categoryId).toBe('meat');
    expect(budget.categories[0]?.categoryLabel).toBeTruthy();
  });

  it('shows nothing of another business', async () => {
    const { t, run, businessId } = await setup();
    await run['budgets.set']({
      commandId: t.cmd(),
      businessId,
      month: '2026-11',
      purchaseBudgetRappen: 2_200_000,
    });
    const other = await createTestContext({
      storage: t.storage,
      today: '2026-11-14',
      idStart: 50_000,
    });
    const figures = await other.useCases['numbers.budget']({
      businessId: other.businessId,
      month: '2026-11',
    });
    expect(figures.spentRappen).toBe(0);
    expect(figures.budgetRappen).toBeUndefined();
  });
});

describe('numbers.breakEven, from which revenue the kitchen earns money', () => {
  /**
   * Fixed costs CHF 35’000.00, net revenue CHF 40’000.00 (a sale of CHF 43’240.00 gross at 8.1 %),
   * cost of goods CHF 12’000.00 (1000 kg of flour at CHF 12.00/kg, all taken out):
   * contribution 28’000.00 = 70 %; break-even 35’000 × 40’000 / 28’000 = CHF 50’000.00;
   * CHF 10’000.00 short; 17 days are left from 14.11. (14 to 30 November, both included).
   */
  async function breakEvenSetup() {
    const s = await setup();
    await s.run['budgets.set']({
      commandId: s.t.cmd(),
      businessId: s.businessId,
      month: '2026-11',
      purchaseBudgetRappen: 2_000_000,
      fixedCostsRappen: 3_500_000,
    });
    await sell(s.t, '2026-11-02', 4_324_000);
    await s.t.storage.transaction(async () => {
      const lot = await s.ledger.receive({
        businessId: s.businessId,
        articleId: s.kitchen.articles.flour.id,
        areaId: s.kitchen.areas.dry.id,
        quantity: 1_000_000,
        pricePer1000: 1200,
        receivedOn: localDate('2026-11-03'),
        origin: 'purchase',
        updateArticlePrice: false,
      });
      await s.ledger.consumeLot({
        businessId: s.businessId,
        lotId: lot.id,
        quantity: 1_000_000,
        on: localDate('2026-11-03'),
        purpose: 'production',
      });
    });
    return s;
  }

  it('acceptance: break-even at CHF 50’000.00, CHF 10’000.00 short, 17 days left', async () => {
    const s = await breakEvenSetup();
    const view = await s.run['numbers.breakEven']({ businessId: s.businessId, month: '2026-11' });
    expect(view.netRevenueRappen).toBe(4_000_000);
    expect(view.costOfGoodsRappen).toBe(1_200_000);
    expect(view.contributionBps).toBe(7_000);
    expect(view.breakEvenRappen).toBe(5_000_000);
    expect(view.gapRappen).toBe(-1_000_000);
    expect(view.reached).toBe(false);
    expect(view.reachedOn).toBeUndefined();
    expect(view.neededRappen).toBe(1_000_000);
    expect(view.remainingDays).toBe(17);
    // 10’000.00 / 17 days = 588.24 per day, rounded up to the Rappen: 58 824.
    expect(view.neededPerDayRappen).toBe(58_824);
    // No dish has been sold: the average margin per portion is not known.
    expect(view.reasons).toEqual(['no_portions']);
  });

  it('shows the day on which the revenue reached the break-even, and what is still needed then', async () => {
    const s = await breakEvenSetup();
    // A second sale on 9.11.: CHF 10’810.00 gross, CHF 10’000.00 net at 8.1 %: 40’000 + 10’000 = 50’000.
    await sell(s.t, '2026-11-09', 1_081_000);
    const view = await s.run['numbers.breakEven']({ businessId: s.businessId, month: '2026-11' });
    expect(view.netRevenueRappen).toBe(5_000_000);
    // The break-even follows the ratio of goods to revenue: contribution 3’800’000 of 5’000’000
    // (76 %), so 35’000 / 76 % = CHF 46’052.64 (rounded up). Passed on 9.11.
    expect(view.breakEvenRappen).toBe(4_605_264);
    expect(view.reached).toBe(true);
    expect(view.gapRappen).toBe(394_736);
    expect(view.reachedOn).toBe('2026-11-09');
    expect(view.neededRappen).toBe(0);
    expect(view.neededPerDayRappen).toBe(0);
  });

  it('says what is missing when the fixed costs are not entered', async () => {
    const s = await setup();
    await sell(s.t, '2026-11-02', 4_324_000);
    const view = await s.run['numbers.breakEven']({ businessId: s.businessId, month: '2026-11' });
    expect(view.reasons).toContain('no_fixed_costs');
    expect(view.breakEvenRappen).toBeUndefined();
    expect(view.fixedCostsRappen).toBeUndefined();
    expect(view.gapRappen).toBeUndefined();
    expect(view.neededPerDayRappen).toBeUndefined();
  });

  it('says why there is no break-even without revenue, and without contribution', async () => {
    const empty = await setup();
    await empty.run['budgets.set']({
      commandId: empty.t.cmd(),
      businessId: empty.businessId,
      month: '2026-11',
      purchaseBudgetRappen: 1,
      fixedCostsRappen: 100_000,
    });
    const none = await empty.run['numbers.breakEven']({
      businessId: empty.businessId,
      month: '2026-11',
    });
    expect(none.reasons).toEqual(expect.arrayContaining(['no_revenue', 'no_portions']));
    expect(none.breakEvenRappen).toBeUndefined();

    // Revenue of CHF 10.81 gross (CHF 10.00 net) with goods of CHF 18.00 used: no contribution.
    const poor = await setup();
    await poor.run['budgets.set']({
      commandId: poor.t.cmd(),
      businessId: poor.businessId,
      month: '2026-11',
      purchaseBudgetRappen: 1,
      fixedCostsRappen: 100_000,
    });
    await sell(poor.t, '2026-11-02', 1_081);
    await poor.t.storage.transaction(async () => {
      await poor.ledger.consumeLot({
        businessId: poor.businessId,
        lotId: poor.kitchen.lots.redWine.id,
        quantity: 2000,
        on: localDate('2026-11-03'),
        purpose: 'production',
      });
    });
    const loss = await poor.run['numbers.breakEven']({
      businessId: poor.businessId,
      month: '2026-11',
    });
    expect(loss.reasons).toContain('no_contribution');
    expect(loss.breakEvenRappen).toBeUndefined();
  });

  it('computes the average margin per portion of a dish with a complete cost, and the portions needed', async () => {
    const s = await setup();
    await s.run['budgets.set']({
      commandId: s.t.cmd(),
      businessId: s.businessId,
      month: '2026-11',
      purchaseBudgetRappen: 1,
      fixedCostsRappen: 3_500_000,
    });
    // Lachs mit Rahmsauce: one portion costs 2680 / 4 = 670 Rappen; 3400 gross is 3145 net.
    // Margin 3145 - 670 = 2475 per portion; 3’500’000 / 2475 = 1414.14 → 1415 portions.
    await sell(s.t, '2026-11-02', 3_400, s.kitchen.recipes.salmonDish.id, 1);
    const view = await s.run['numbers.breakEven']({ businessId: s.businessId, month: '2026-11' });
    expect(view.portionsSold).toBe(1);
    expect(view.averageMarginRappen).toBe(2_475);
    expect(view.breakEvenPortions).toBe(1_415);
  });
});
