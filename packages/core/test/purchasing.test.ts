import { describe, expect, it } from 'vitest';
import {
  addDays,
  ArticleSchema,
  PlanEntrySchema,
  PurchaseOrderSchema,
  rappen,
  type Article,
  type Id,
  type LocalDate,
} from '../src';
import { createStockLedger } from '../src/application/stock-ledger';
import {
  changeBps,
  orderText,
  packsOf,
  quantityText,
  roundUpToPacks,
  supplierDays,
  weekdayOf,
} from '../src/modules/purchasing/rules';
import { createTestContext, seedKitchen, type TestContext } from '../src/testing';

async function setup() {
  const t = await createTestContext();
  const kitchen = await seedKitchen(t);
  return { t, kitchen, today: t.clock.today(), businessId: t.businessId };
}

type Setup = Awaited<ReturnType<typeof setup>>;

async function suggestions(s: Setup, horizonDays?: number) {
  return s.t.useCases['purchasing.suggestions']({
    businessId: s.businessId,
    ...(horizonDays === undefined ? {} : { horizonDays }),
  });
}

/** The proposal line of an article, or undefined when it is not proposed. */
async function lineOf(s: Setup, articleId: Id, horizonDays?: number) {
  const result = await suggestions(s, horizonDays);
  return result.groups.flatMap((group) => group.lines).find((line) => line.articleId === articleId);
}

async function plan(s: Setup, recipeId: Id, portions: number, date: LocalDate, extra = {}) {
  const now = s.t.clock.now();
  await s.t.storage.planEntries.add(
    PlanEntrySchema.parse({
      id: s.t.cmd(),
      businessId: s.businessId,
      createdAt: now,
      updatedAt: now,
      date,
      slot: 'lunch',
      recipeId,
      portions,
      ...extra,
    }),
  );
}

async function order(
  s: Setup,
  supplierId: Id,
  lines: { articleId: Id; quantity: number }[],
  status: 'draft' | 'sent' | 'received' | 'cancelled' = 'sent',
) {
  const now = s.t.clock.now();
  await s.t.storage.orders.add(
    PurchaseOrderSchema.parse({
      id: s.t.cmd(),
      businessId: s.businessId,
      createdAt: now,
      updatedAt: now,
      supplierId,
      status,
      lines: lines.map((line) => ({ ...line, pricePer1000: 0 })),
    }),
  );
}

/** Changes an article in storage; a field set to undefined is removed. */
async function putArticle(t: TestContext, article: Article, patch: Record<string, unknown>) {
  const merged = { ...article, ...patch };
  const next = Object.fromEntries(
    Object.entries(merged).filter(([, value]) => value !== undefined),
  );
  await t.storage.articles.put(ArticleSchema.parse(next));
}

/** A purchase of an article at a price, booked straight through the ledger. */
async function buy(
  s: Setup,
  article: Article,
  price: number,
  receivedOn: LocalDate,
  quantity = 1000,
) {
  const ledger = createStockLedger(s.t.ctx);
  await s.t.storage.transaction(() =>
    ledger.receive({
      businessId: s.businessId,
      articleId: article.id,
      areaId: s.kitchen.areas.dry.id,
      quantity,
      pricePer1000: price,
      receivedOn,
      supplierId: article.supplierId,
      origin: 'purchase',
    }),
  );
}

describe('purchasing.suggestions', () => {
  it('fills flour below its minimum up to the target, in whole sacks', async () => {
    const s = await setup();
    const result = await suggestions(s);
    expect(result).toMatchObject({ horizonDays: 7, from: '2026-11-14', to: '2026-11-20' });
    // Only flour lies under its minimum in the test kitchen.
    expect(result.lineCount).toBe(1);
    const [group] = result.groups;
    expect(group?.supplier).toMatchObject({
      id: s.kitchen.suppliers.wholesaler.id,
      name: 'Grosshandel Beispiel',
      kind: 'supplier',
      // 14.11.2026 is a Saturday: order on Monday, delivered on Tuesday.
      nextOrder: { on: '2026-11-16', weekday: 'mon', inDays: 2 },
      nextDelivery: { on: '2026-11-17', weekday: 'tue', inDays: 3 },
    });
    // 3 kg in stock, minimum 5 kg, target 20 kg: 17 kg are missing, rounded up to 2 sacks of
    // 10 kg = 20 kg, at CHF 1.60/kg = CHF 32.00.
    expect(group?.lines).toEqual([
      expect.objectContaining({
        articleId: s.kitchen.articles.flour.id,
        name: 'Weissmehl',
        stock: 3000,
        usable: 3000,
        minStock: 5000,
        targetStock: 20_000,
        onOrder: 0,
        needForPlan: 0,
        reason: 'below_min',
        quantity: 20_000,
        packs: { count: 2, size: 10_000, label: 'Sack' },
        pricePer1000: 160,
        valueRappen: 3200,
        priceMissing: false,
      }),
    ]);
    expect(group?.totalRappen).toBe(3200);
    expect(group?.minOrderReached).toBeUndefined();
    expect(result.totalRappen).toBe(3200);
  });

  it('subtracts open orders and ignores received or cancelled ones', async () => {
    const s = await setup();
    const { flour } = s.kitchen.articles;
    const { wholesaler } = s.kitchen.suppliers;
    await order(s, wholesaler.id, [{ articleId: flour.id, quantity: 10_000 }], 'received');
    await order(s, wholesaler.id, [{ articleId: flour.id, quantity: 10_000 }], 'cancelled');
    expect((await lineOf(s, flour.id))?.quantity).toBe(20_000);
    // 3 kg + 1 kg on order is still under 5 kg: 16 kg to the target, rounded to 2 sacks.
    await order(s, wholesaler.id, [{ articleId: flour.id, quantity: 1000 }], 'draft');
    expect(await lineOf(s, flour.id)).toMatchObject({ onOrder: 1000, quantity: 20_000 });
    // 3 kg + 1 kg + 2 kg = 6 kg: enough.
    await order(s, wholesaler.id, [{ articleId: flour.id, quantity: 2000 }]);
    expect(await lineOf(s, flour.id)).toBeUndefined();
  });

  it('fills to twice the minimum without a target, and exactly without a pack', async () => {
    const s = await setup();
    const { flour } = s.kitchen.articles;
    await putArticle(s.t, flour, { minStock: 4000, targetStock: undefined, packSize: undefined });
    // 3 kg under 4 kg: up to 8 kg, that is 5 kg.
    expect(await lineOf(s, flour.id)).toMatchObject({ quantity: 5000, reason: 'below_min' });
    expect((await lineOf(s, flour.id))?.packs).toBeUndefined();
  });

  it('adds what the menu plan needs, with the reason «plan», less what is on order', async () => {
    const s = await setup();
    const { salmon } = s.kitchen.articles;
    // 30 portions of «Lachs mit Rahmsauce» (640 g salmon for 4) in three days: 4.8 kg salmon.
    await plan(s, s.kitchen.recipes.salmonDish.id, 30, addDays(s.today, 3));
    const line = await lineOf(s, salmon.id);
    // The 1.5 kg in stock are to be used by tomorrow: on the day of the plan they are gone.
    expect(line).toMatchObject({
      stock: 1500,
      usable: 1500,
      needForPlan: 4800,
      expiresBeforeUse: 1500,
      reason: 'plan',
      quantity: 4800,
      // 4.8 kg at CHF 38.00/kg.
      valueRappen: 18_240,
    });
    const groups = (await suggestions(s)).groups;
    expect(
      groups.find((group) => group.lines.some((each) => each.articleId === salmon.id))?.supplier
        ?.id,
    ).toBe(s.kitchen.suppliers.wholesaler.id);
    // Cream (2.25 l) and butter (300 g) are in stock and keep long enough.
    expect(await lineOf(s, s.kitchen.articles.cream.id)).toBeUndefined();
    // 2 kg already ordered: 2.8 kg remain to order.
    await order(s, s.kitchen.suppliers.wholesaler.id, [{ articleId: salmon.id, quantity: 2000 }]);
    expect(await lineOf(s, salmon.id)).toMatchObject({ onOrder: 2000, quantity: 2800 });
  });

  it('uses stock that keeps until the plan, and looks only within the horizon', async () => {
    const s = await setup();
    const { salmon } = s.kitchen.articles;
    // Tomorrow the 1.5 kg salmon are still good. 12 portions need 640 g × 3 = 1.92 kg: 0.42 kg
    // are missing.
    await plan(s, s.kitchen.recipes.salmonDish.id, 12, addDays(s.today, 1));
    expect(await lineOf(s, salmon.id)).toMatchObject({
      needForPlan: 1920,
      expiresBeforeUse: 0,
      quantity: 420,
    });
    // An entry outside the horizon, one in the past and one already produced change nothing.
    await plan(s, s.kitchen.recipes.salmonDish.id, 50, addDays(s.today, 9));
    await plan(s, s.kitchen.recipes.salmonDish.id, 50, addDays(s.today, -1));
    await plan(s, s.kitchen.recipes.salmonDish.id, 50, addDays(s.today, 2), {
      productionId: s.t.cmd(),
    });
    expect((await lineOf(s, salmon.id))?.quantity).toBe(420);
    // With a horizon of ten days, the entry in nine days counts: 1.92 + 8 = 9.92 kg.
    expect(await lineOf(s, salmon.id, 10)).toMatchObject({ needForPlan: 9920 });
  });

  it('unfolds a component without stock into its ingredients', async () => {
    const s = await setup();
    // 200 portions Entrecôte tomorrow need 10 l Rotweinjus; there is none, so 10 batches of the
    // jus are made: 7.5 l red wine (6 l in stock) and 500 g butter on top of 3 kg for the dish.
    await plan(s, s.kitchen.recipes.entrecoteDish.id, 200, addDays(s.today, 1));
    const wine = await lineOf(s, s.kitchen.articles.redWine.id);
    expect(wine).toMatchObject({ needForPlan: 7500, quantity: 1500, reason: 'plan' });
    // Butter: 150 g × 20 for the dish and 50 g × 10 for the jus = 3.5 kg; 2 kg in stock.
    expect(await lineOf(s, s.kitchen.articles.butter.id)).toMatchObject({
      needForPlan: 3500,
      quantity: 1500,
    });
    // Entrecôte: 36 kg net at 90 % yield = 40 kg gross; 4 kg in stock. From the butcher.
    const result = await suggestions(s);
    const butcher = result.groups.find(
      (group) => group.supplier?.id === s.kitchen.suppliers.butcher.id,
    );
    expect(butcher?.lines).toEqual([
      expect.objectContaining({ articleId: s.kitchen.articles.entrecote.id, quantity: 36_000 }),
    ]);
    // Both suppliers take orders on Monday: then by name.
    expect(result.groups.map((group) => group.supplier?.name)).toEqual([
      'Grosshandel Beispiel',
      'Metzgerei Muster',
    ]);
    // The component itself is made, not bought.
    expect(await lineOf(s, s.kitchen.articles.jus.id)).toBeUndefined();
  });

  it('says «both» when an article is under its minimum and the plan needs it', async () => {
    const s = await setup();
    const { butter } = s.kitchen.articles;
    await putArticle(s.t, butter, { minStock: 3000, targetStock: 5000 });
    await plan(s, s.kitchen.recipes.salmonDish.id, 10, addDays(s.today, 2));
    // 10 portions need 100 g butter. After the plan 1.9 kg are left, under 3 kg: up to 5 kg.
    expect(await lineOf(s, butter.id)).toMatchObject({
      reason: 'both',
      needForPlan: 100,
      quantity: 3100,
    });
  });

  it('groups articles without a supplier last and checks the minimum order value', async () => {
    const s = await setup();
    const { flour, eggs } = s.kitchen.articles;
    const { wholesaler } = s.kitchen.suppliers;
    await s.t.storage.suppliers.put({ ...wholesaler, minOrderRappen: rappen(15_000) });
    await putArticle(s.t, eggs, { minStock: 100, supplierId: undefined, pricePer1000: 0 });
    const result = await suggestions(s);
    expect(result.groups.map((group) => group.supplier?.id)).toEqual([wholesaler.id, undefined]);
    expect(result.groups[0]).toMatchObject({
      minOrderReached: false,
      // CHF 150.00 minimum, CHF 32.00 proposed.
      missingToMinRappen: 11_800,
    });
    // 60 eggs under 100: up to 200, that is 140 eggs, without a price.
    expect(result.groups[1]).toMatchObject({ priceMissingCount: 1, totalRappen: 0 });
    expect(result.groups[1]?.lines[0]).toMatchObject({
      articleId: eggs.id,
      quantity: 140,
      priceMissing: true,
      valueRappen: 0,
    });
    // Inactive articles and those made in house are left out.
    await putArticle(s.t, flour, { active: false });
    expect(await lineOf(s, flour.id)).toBeUndefined();
  });

  it('shows another business nothing', async () => {
    const s = await setup();
    const other = await createTestContext({ storage: s.t.storage, idStart: 10_000 });
    const result = await other.useCases['purchasing.suggestions']({ businessId: other.businessId });
    expect(result.groups).toEqual([]);
    await expect(
      s.t.useCases['purchasing.suggestions']({ businessId: s.t.cmd() }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('purchasing.priceWatch', () => {
  it('lists a price change of 5 % or more with the dishes before and after', async () => {
    const s = await setup();
    const { salmon, butter } = s.kitchen.articles;
    // The seed bought salmon yesterday at CHF 38.00/kg; today it costs CHF 42.75/kg (+12.5 %).
    await buy(s, salmon, 4275, s.today);
    // Butter: CHF 14.00 to CHF 14.50 is +3.6 %, under the threshold.
    await buy(s, butter, 1450, s.today);
    const { changes, total } = await s.t.useCases['purchasing.priceWatch']({
      businessId: s.businessId,
    });
    expect(total).toBe(1);
    expect(changes[0]).toMatchObject({
      articleId: salmon.id,
      name: 'Lachsfilet',
      oldPricePer1000: 3800,
      newPricePer1000: 4275,
      changeBps: 1250,
      oldOn: addDays(s.today, -1),
      newOn: s.today,
      supplierName: 'Grosshandel Beispiel',
    });
    // «Lachs mit Rahmsauce», 4 portions: 640 g salmon, 300 ml cream, 40 g butter, the butter at
    // its new CHF 14.50/kg. For 4 portions CHF 26.82 before (24.32 + 1.92 + 0.58) and CHF 29.86
    // after (27.36 + 1.92 + 0.58): per portion 6.705 and 7.465, rounded 6.71 and 7.47. Net price
    // CHF 34.00 / 1.081 = 31.45: 21.3 % before, 23.8 % after.
    expect(changes[0]?.dishes).toEqual([
      {
        recipeId: s.kitchen.recipes.salmonDish.id,
        name: 'Lachs mit Rahmsauce',
        priceRappen: 3400,
        costBeforeRappen: 671,
        costAfterRappen: 747,
        foodCostBeforeBps: 2134,
        foodCostAfterBps: 2375,
        incomplete: false,
      },
    ]);
    // A lower threshold shows the butter too, the larger change first.
    const all = await s.t.useCases['purchasing.priceWatch']({
      businessId: s.businessId,
      thresholdBps: 100,
    });
    expect(all.changes.map((change) => change.name)).toEqual(['Lachsfilet', 'Butter']);
    expect(all.changes[1]?.changeBps).toBe(357);
    const limited = await s.t.useCases['purchasing.priceWatch']({
      businessId: s.businessId,
      thresholdBps: 100,
      limit: 1,
    });
    expect(limited).toMatchObject({ total: 2, changes: [{ name: 'Lachsfilet' }] });
  });

  it('follows a price through a component into the dish', async () => {
    const s = await setup();
    const { redWine } = s.kitchen.articles;
    // Red wine CHF 9.00/l to CHF 10.80/l: +20 %.
    await buy(s, redWine, 1080, s.today);
    const { changes } = await s.t.useCases['purchasing.priceWatch']({ businessId: s.businessId });
    expect(changes[0]).toMatchObject({ name: 'Rotwein zum Kochen', changeBps: 2000 });
    // 1 l jus takes 750 ml wine: CHF 7.89/l before, CHF 9.24/l after. The Entrecôte (10
    // portions) takes 500 ml jus: CHF 137.105 before, CHF 137.78 after for the batch; per
    // portion CHF 13.71 and CHF 13.78, of CHF 38.85 net: 35.3 % and 35.5 %.
    expect(changes[0]?.dishes).toEqual([
      expect.objectContaining({
        name: 'Entrecôte mit Rotweinjus und Kartoffelstock',
        costBeforeRappen: 1371,
        costAfterRappen: 1378,
        foodCostBeforeBps: 3529,
        foodCostAfterBps: 3547,
        via: 'Rotweinjus',
      }),
    ]);
  });

  it('leaves out offers, single purchases and dishes without a price', async () => {
    const s = await setup();
    const { eggs, salmon } = s.kitchen.articles;
    // Eggs were bought once only.
    const first = await s.t.useCases['purchasing.priceWatch']({ businessId: s.businessId });
    expect(first.changes).toEqual([]);
    // A dish without a price shows its cost, but no share.
    const dish = s.kitchen.recipes.salmonDish;
    const withoutPrice: Record<string, unknown> = { ...dish };
    delete withoutPrice.priceRappen;
    await s.t.storage.recipes.put(withoutPrice as typeof dish);
    await buy(s, salmon, 4560, s.today);
    const { changes } = await s.t.useCases['purchasing.priceWatch']({ businessId: s.businessId });
    expect(changes[0]?.dishes[0]).toMatchObject({ costBeforeRappen: 670 });
    expect(changes[0]?.dishes[0]?.foodCostAfterBps).toBeUndefined();
    expect(changes[0]?.dishes[0]?.priceRappen).toBeUndefined();
    expect(eggs.pricePer1000).toBe(45_000);
  });
});

describe('rules of purchasing', () => {
  it('knows the weekday and the days of a supplier', () => {
    expect(weekdayOf('2026-11-14' as LocalDate)).toBe('sat');
    expect(weekdayOf('2026-11-16' as LocalDate)).toBe('mon');
    const today = '2026-11-16' as LocalDate;
    // Monday is an order day: today, delivered on Tuesday.
    expect(
      supplierDays({ orderDays: ['mon', 'thu'], deliveryDays: ['tue', 'fri'] }, today),
    ).toEqual({
      nextOrder: { on: '2026-11-16', weekday: 'mon', inDays: 0 },
      nextDelivery: { on: '2026-11-17', weekday: 'tue', inDays: 1 },
    });
    // Delivered the same weekday a week later.
    expect(supplierDays({ orderDays: ['mon'], deliveryDays: ['mon'] }, today).nextDelivery).toEqual(
      {
        on: '2026-11-23',
        weekday: 'mon',
        inDays: 7,
      },
    );
    expect(supplierDays({ orderDays: [], deliveryDays: ['fri'] }, today)).toEqual({
      nextDelivery: { on: '2026-11-20', weekday: 'fri', inDays: 4 },
    });
    expect(supplierDays({ orderDays: [], deliveryDays: [] }, today)).toEqual({});
  });

  it('rounds up to packs and writes them as people do', () => {
    expect(roundUpToPacks(17_000, 10_000, 'Sack')).toEqual({
      quantity: 20_000,
      packs: { count: 2, size: 10_000, label: 'Sack' },
    });
    expect(roundUpToPacks(20_000, 10_000)).toEqual({
      quantity: 20_000,
      packs: { count: 2, size: 10_000 },
    });
    expect(roundUpToPacks(0.333, undefined)).toEqual({ quantity: 0.333 });
    expect(packsOf(30_000, 2500, 'Kolli')).toEqual({ count: 12, size: 2500, label: 'Kolli' });
    expect(packsOf(17_000, 10_000)).toBeUndefined();
    expect(packsOf(17_000, undefined)).toBeUndefined();
    expect(quantityText(20_000, 'g', { count: 2, size: 10_000, label: 'Sack' })).toBe(
      '2 × Sack à 10 kg',
    );
    expect(quantityText(60, 'pcs', { count: 2, size: 30 })).toBe('2 × 30 Stk.');
    expect(quantityText(3300, 'g', undefined)).toBe('3.3 kg');
    expect(changeBps(3800, 4275)).toBe(1250);
    expect(changeBps(1000, 900)).toBe(-1000);
  });

  it('writes the text of an order without prices and without «ß»', () => {
    const text = orderText({
      businessName: 'Testküche',
      customerNumber: '88-120',
      expectedOn: '2026-11-17' as LocalDate,
      lines: [
        {
          name: 'Weissmehl',
          quantity: 20_000,
          unit: 'g',
          packs: { count: 2, size: 10_000, label: 'Sack' },
          supplierArticleNumber: '4711',
        },
        { name: 'Lachsfilet', quantity: 3300, unit: 'g' },
      ],
      note: 'Bitte vor 10 Uhr.',
    });
    expect(text).toBe(
      [
        'Guten Tag',
        '',
        'Bestellung von Testküche, Kundennummer 88-120',
        'Gewünschte Lieferung: Dienstag, 17.11.2026',
        '',
        '2 × Sack à 10 kg Weissmehl, Art.-Nr. 4711',
        '3.3 kg Lachsfilet',
        '',
        'Bemerkung: Bitte vor 10 Uhr.',
        '',
        'Besten Dank und freundliche Grüsse',
        'Testküche',
      ].join('\n'),
    );
    expect(text).not.toContain('ß');
    expect(text).not.toMatch(/CHF|Fr\./);
  });
});
