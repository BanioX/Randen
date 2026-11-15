import { describe, expect, it } from 'vitest';
import { CommandError, createStockLedger, localDate, SaleSchema } from '../src';
import { createTestContext, seedKitchen, type TestContext } from '../src/testing';

/**
 * The test kitchen on Saturday, 14.11.2026 (see `seedKitchen`): every lot was received on
 * 13.11. as a purchase, together CHF 537.00. So the purchases of the day before today are
 * CHF 537.00 and the purchases of today are what is booked today.
 */
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

/** A sale of today (or of the given day), written as the sales module will write it. */
async function sell(
  t: TestContext,
  fields: { on?: string; gross: number; recipeId?: string; portions?: number; vatBps?: number },
) {
  const now = t.clock.now();
  const row = SaleSchema.parse({
    id: t.ids.next(),
    businessId: t.businessId,
    createdAt: now,
    updatedAt: now,
    soldOn: fields.on ?? TODAY,
    portions: fields.portions ?? 1,
    grossRappen: fields.gross,
    vatBps: fields.vatBps ?? 810,
    bookedStock: false,
    ...(fields.recipeId === undefined ? {} : { recipeId: fields.recipeId }),
    label: 'Umsatz',
  });
  await t.storage.sales.add(row);
  return row;
}

/** The acceptance scenario of the day: one delivery, one production, one write-off. */
async function bookTheDay({ t, kitchen, ledger, businessId }: Setup) {
  await t.storage.transaction(async () => {
    // Delivery: 100 l Vollrahm at CHF 6.40 per litre = CHF 640.00.
    await ledger.receive({
      businessId,
      articleId: kitchen.articles.cream.id,
      areaId: kitchen.areas.cold.id,
      quantity: 100_000,
      pricePer1000: 640,
      receivedOn: TODAY,
      origin: 'purchase',
    });
    // Production of a dish, no component back into stock: 2000 g Entrecôte at CHF 62.00/kg
    // = 124.00, 1000 ml Rotwein at CHF 9.00/l = 9.00, 100 g Weissmehl at CHF 1.60/kg = 0.16.
    // Together CHF 133.16.
    const on = TODAY;
    await ledger.consume({
      businessId,
      articleId: kitchen.articles.entrecote.id,
      quantity: 2000,
      on,
      purpose: 'production',
    });
    await ledger.consume({
      businessId,
      articleId: kitchen.articles.redWine.id,
      quantity: 1000,
      on,
      purpose: 'production',
    });
    await ledger.consume({
      businessId,
      articleId: kitchen.articles.flour.id,
      quantity: 100,
      on,
      purpose: 'production',
    });
    // Write-off: 500 g Lachsfilet spoiled, 500 × 3.80 = CHF 19.00 (Lagerverlust).
    await ledger.writeOff({
      businessId,
      lotId: kitchen.lots.salmon.id,
      quantity: 500,
      reason: 'spoiled',
      on,
    });
  });
}

describe('numbers.overview, the day of the acceptance scenario', () => {
  it('shows exactly CHF 640.00 bought, CHF 133.16 used and CHF 19.00 written off', async () => {
    const s = await setup();
    await bookTheDay(s);
    const overview = await s.run['numbers.overview']({
      businessId: s.businessId,
      from: TODAY,
      to: TODAY,
    });
    expect(overview.current.purchasesRappen).toBe(64_000);
    expect(overview.current.costOfGoodsRappen).toBe(13_316);
    expect(overview.current.wasteRappen).toBe(1_900);
    // The seeded lots count as purchases of the day before: CHF 537.00 (the period before).
    expect(overview.previous.purchasesRappen).toBe(53_700);
    expect(overview.previousFrom).toBe('2026-11-13');
    expect(overview.previousTo).toBe('2026-11-13');
    // No sales yet: no revenue, so no food cost share and no contribution.
    expect(overview.current.netRevenueRappen).toBe(0);
    expect(overview.current.foodCostBps).toBeUndefined();
    expect(overview.current.contributionRappen).toBe(-13_316);
  });

  it('counts the write-off as a loss of the storage and the count differences apart', async () => {
    const s = await setup();
    await bookTheDay(s);
    const overview = await s.run['numbers.overview']({
      businessId: s.businessId,
      from: TODAY,
      to: TODAY,
    });
    expect(overview.current.countLossRappen).toBe(0);
    expect(overview.current.countGainRappen).toBe(0);
    // Stock today: 537.00 + 640.00 - 133.16 - 19.00 = 1024.84.
    expect(overview.stock.valueRappen).toBe(102_484);
    expect(overview.stock.articleCount).toBe(9);
  });

  it('computes food cost and contribution from the sales, net of VAT', async () => {
    const s = await setup();
    await bookTheDay(s);
    // 400.00 gross at 8.1 % = 370.02 net (400.00 / 1.081 = 370.0277…); cost 133.16.
    // Food cost 13316 / 37003 = 35.99 % (3599 bps, rounded); contribution 37003 - 13316 = 23687.
    await sell(s.t, { gross: 40_000 });
    const overview = await s.run['numbers.overview']({
      businessId: s.businessId,
      from: TODAY,
      to: TODAY,
    });
    expect(overview.current.grossRevenueRappen).toBe(40_000);
    expect(overview.current.netRevenueRappen).toBe(37_003);
    expect(overview.current.foodCostBps).toBe(3_599);
    expect(overview.current.contributionRappen).toBe(23_687);
    expect(overview.incomplete.daysWithoutSales).toBe(0);
  });

  it('shows the incomplete parts: days without sales and goods used on them', async () => {
    const s = await setup();
    await bookTheDay(s);
    const overview = await s.run['numbers.overview']({
      businessId: s.businessId,
      from: localDate('2026-11-12'),
      to: TODAY,
    });
    // Three days, none with a sales entry. The goods used today (CHF 133.16) are without sales.
    expect(overview.days).toBe(3);
    expect(overview.incomplete.daysWithoutSales).toBe(3);
    expect(overview.incomplete.consumptionWithoutSalesRappen).toBe(13_316);
  });

  it('keeps the series per day and sums it to the period', async () => {
    const s = await setup();
    await bookTheDay(s);
    const overview = await s.run['numbers.overview']({
      businessId: s.businessId,
      from: localDate('2026-11-13'),
      to: TODAY,
    });
    expect(overview.series.map((row) => row.day)).toEqual(['2026-11-13', '2026-11-14']);
    expect(overview.series.map((row) => row.purchasesRappen)).toEqual([53_700, 64_000]);
    expect(overview.series.map((row) => row.costOfGoodsRappen)).toEqual([0, 13_316]);
    expect(overview.series.map((row) => row.wasteRappen)).toEqual([0, 1_900]);
  });

  it('keeps a period that ends before it starts out of the numbers', async () => {
    const s = await setup();
    await expect(
      s.run['numbers.overview']({
        businessId: s.businessId,
        from: TODAY,
        to: localDate('2026-11-01'),
      }),
    ).rejects.toMatchObject({ code: 'invalid' });
  });

  it('shows nothing of another business', async () => {
    const s = await setup();
    await bookTheDay(s);
    const other = await createTestContext({
      storage: s.t.storage,
      today: '2026-11-14',
      idStart: 50_000,
    });
    await seedKitchen(other);
    const overview = await other.useCases['numbers.overview']({
      businessId: other.businessId,
      from: TODAY,
      to: TODAY,
    });
    expect(overview.current.purchasesRappen).toBe(0);
    expect(overview.current.costOfGoodsRappen).toBe(0);
    expect(overview.current.wasteRappen).toBe(0);
  });

  it('fails with not_found for a business that does not exist', async () => {
    const s = await setup();
    await expect(
      s.run['numbers.overview']({ businessId: s.t.ids.next(), from: TODAY, to: TODAY }),
    ).rejects.toBeInstanceOf(CommandError);
  });
});

describe('numbers.overview, what is missing shows as a notice', () => {
  it('counts a dish sold without a known cost, and keeps its revenue', async () => {
    const s = await setup();
    // A dish whose recipe is not in the kitchen: its cost is unknown, its sale still counts.
    await sell(s.t, { gross: 10_810, recipeId: s.t.ids.next() });
    const overview = await s.run['numbers.overview']({
      businessId: s.businessId,
      from: TODAY,
      to: TODAY,
    });
    expect(overview.incomplete.dishesWithoutCost).toBe(1);
    expect(overview.current.netRevenueRappen).toBe(10_000);
    expect(overview.current.costOfGoodsRappen).toBe(0);
    expect(overview.current.foodCostBps).toBe(0);
  });

  it('gives the meal figures as absent without meals counted', async () => {
    const s = await setup();
    const overview = await s.run['numbers.overview']({
      businessId: s.businessId,
      from: TODAY,
      to: TODAY,
    });
    expect(overview.meals.servedMeals).toBe(0);
    expect(overview.meals.perMealRappen).toBeUndefined();
    expect(overview.meals.lines).toEqual([]);
    expect(overview.budget.budgetRappen).toBeUndefined();
    expect(overview.budget.status).toBeUndefined();
  });
});
