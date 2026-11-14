import { describe, expect, it } from 'vitest';
import {
  addDays,
  ArticleSchema,
  createStockLedger,
  DEFAULT_CURRENCY,
  formatUnitPrice,
  PurchaseOrderSchema,
  type Id,
} from '../src';
import { createTestContext, seedKitchen, type Kitchen, type TestContext } from '../src/testing';

async function setup() {
  const t = await createTestContext();
  const kitchen = await seedKitchen(t);
  return { t, kitchen, run: t.useCases };
}

const eventTypes = async (t: TestContext) =>
  (await t.storage.events.ofBusiness(t.businessId)).map((event) => event.type);

/** A purchase through the ledger, as a goods receipt books it. */
async function purchase(
  t: TestContext,
  kitchen: Kitchen,
  articleId: Id,
  quantity: number,
  pricePer1000: number,
  daysFromToday: number,
) {
  const ledger = createStockLedger(t.ctx);
  return t.storage.transaction(() =>
    ledger.receive({
      businessId: t.businessId,
      articleId,
      areaId: kitchen.areas.cold.id,
      quantity,
      pricePer1000,
      receivedOn: addDays(t.clock.today(), daysFromToday),
      supplierId: kitchen.suppliers.butcher.id,
      origin: 'purchase',
    }),
  );
}

describe('articles.list', () => {
  it('lists every active article by name with stock, value, price and place', async () => {
    const { t, kitchen, run } = await setup();
    const { rows, counts, categories, total } = await run['articles.list']({
      businessId: t.businessId,
    });
    expect(rows.map((row) => row.name)).toEqual([
      'Butter',
      'Eier',
      'Kartoffeln',
      'Lachsfilet',
      'Rindsentrecôte',
      'Rotwein zum Kochen',
      'Rotweinjus',
      'Vollrahm',
      'Weissmehl',
      'Zwiebeln',
    ]);
    expect(total).toBe(10);
    expect(counts).toEqual({ all: 10, below_min: 1, no_price: 0, inactive: 0 });
    expect(categories).toEqual([
      { id: 'meat', label: 'Fleisch', count: 1 },
      { id: 'fish', label: 'Fisch und Meeresfrüchte', count: 1 },
      { id: 'dairy', label: 'Milchprodukte', count: 2 },
      { id: 'eggs', label: 'Eier', count: 1 },
      { id: 'vegetables', label: 'Gemüse', count: 2 },
      { id: 'dry', label: 'Trockenwaren', count: 1 },
      { id: 'wine', label: 'Wein', count: 1 },
      { id: 'prepared', label: 'Eigenproduktion', count: 1 },
    ]);

    // 4 kg × CHF 62.00/kg = CHF 248.00
    expect(rows.find((row) => row.id === kitchen.articles.entrecote.id)).toEqual({
      id: kitchen.articles.entrecote.id,
      name: 'Rindsentrecôte',
      kind: 'purchased',
      categoryId: 'meat',
      categoryLabel: 'Fleisch',
      unit: 'g',
      pricePer1000: 6200,
      supplierId: kitchen.suppliers.butcher.id,
      supplierName: 'Metzgerei Muster',
      areaId: kitchen.areas.cold.id,
      areaName: 'Kühlzelle',
      areaKind: 'cold',
      spotName: 'Schublade Fleisch',
      stock: 4000,
      stockValueRappen: 24_800,
      belowMin: false,
      allergens: [],
      traces: [],
      diet: 'omnivore',
      active: true,
      missing: [],
    });
    // Two lots of cream: 3 l + 5 l = 8 l, 1920 + 3200 Rp.
    expect(rows.find((row) => row.id === kitchen.articles.cream.id)).toMatchObject({
      stock: 8000,
      stockValueRappen: 5120,
    });
    // 60 eggs × 45 Rp
    expect(rows.find((row) => row.id === kitchen.articles.eggs.id)).toMatchObject({
      stock: 60,
      stockValueRappen: 2700,
      pricePer1000: 45_000,
    });
    // 3 kg of flour against a minimum of 5 kg.
    expect(rows.find((row) => row.id === kitchen.articles.flour.id)).toMatchObject({
      stock: 3000,
      minStock: 5000,
      belowMin: true,
    });
  });

  it('computes price, allergens and diet of a component from its recipe', async () => {
    const { t, kitchen, run } = await setup();
    const { rows } = await run['articles.list']({ businessId: t.businessId, kind: 'prepared' });
    expect(rows).toHaveLength(1);
    // Jus: 200 g onions (44 Rp) + 7.5 dl wine (675 Rp) + 50 g butter (70 Rp) = CHF 7.89 per litre.
    // Butter brings milk and makes it vegetarian, the wine brings sulphites.
    expect(rows[0]).toMatchObject({
      id: kitchen.articles.jus.id,
      pricePer1000: 789,
      allergens: ['milk', 'sulphites'],
      diet: 'vegetarian',
      stock: 0,
      stockValueRappen: 0,
      missing: [],
    });
  });

  it('narrows by view, group of goods, supplier and words, and counts each view', async () => {
    const { t, kitchen, run } = await setup();
    const base = { businessId: t.businessId };
    const belowMin = await run['articles.list']({ ...base, filter: 'below_min' });
    expect(belowMin.rows.map((row) => row.name)).toEqual(['Weissmehl']);
    expect(belowMin.categories).toEqual([{ id: 'dry', label: 'Trockenwaren', count: 1 }]);

    const dairy = await run['articles.list']({ ...base, categoryId: 'dairy' });
    expect(dairy.rows.map((row) => row.name)).toEqual(['Butter', 'Vollrahm']);
    // The views are counted inside the group of goods, the groups inside the view.
    expect(dairy.counts).toEqual({ all: 2, below_min: 0, no_price: 0, inactive: 0 });
    expect(dairy.categories).toHaveLength(8);

    const butcher = await run['articles.list']({
      ...base,
      supplierId: kitchen.suppliers.butcher.id,
    });
    expect(butcher.rows.map((row) => row.name)).toEqual(['Rindsentrecôte']);

    // Case and accents do not matter; every word must occur; supplier and group count too.
    const search = async (text: string) =>
      (await run['articles.list']({ ...base, search: text })).rows.map((row) => row.name);
    expect(await search('entrecote')).toEqual(['Rindsentrecôte']);
    expect(await search('ROT')).toEqual(['Rotwein zum Kochen', 'Rotweinjus']);
    expect(await search('rot kochen')).toEqual(['Rotwein zum Kochen']);
    expect(await search('metzgerei')).toEqual(['Rindsentrecôte']);
    expect(await search('milchprodukte')).toEqual(['Butter', 'Vollrahm']);
    expect(await search('gibt es nicht')).toEqual([]);
    expect((await run['articles.list']({ ...base, search: 'gibt es nicht' })).total).toBe(10);
  });

  it('says what is missing: no price, meat without a country, no supplier', async () => {
    const { t, kitchen, run } = await setup();
    await t.storage.articles.put(
      ArticleSchema.parse({
        ...kitchen.articles.salmon,
        pricePer1000: 0,
        originCountry: undefined,
      }),
    );
    await t.storage.suppliers.put({ ...kitchen.suppliers.butcher, deletedAt: t.clock.now() });
    const { rows, counts } = await run['articles.list']({ businessId: t.businessId });
    expect(rows.find((row) => row.id === kitchen.articles.salmon.id)?.missing).toEqual([
      'price',
      'origin',
    ]);
    // The supplier was deleted: the article has none any more, and says so.
    const entrecote = rows.find((row) => row.id === kitchen.articles.entrecote.id);
    expect(entrecote?.missing).toEqual(['supplier']);
    expect(entrecote).not.toHaveProperty('supplierName');
    expect(counts.no_price).toBe(1);
    const noPrice = await run['articles.list']({ businessId: t.businessId, filter: 'no_price' });
    expect(noPrice.rows.map((row) => row.name)).toEqual(['Lachsfilet']);
  });

  it('shows another business nothing', async () => {
    const { t } = await setup();
    const other = await createTestContext({ storage: t.storage, idStart: 100_000 });
    expect(await other.useCases['articles.list']({ businessId: other.businessId })).toEqual({
      rows: [],
      counts: { all: 0, below_min: 0, no_price: 0, inactive: 0 },
      categories: [],
      total: 0,
    });
  });
});

describe('articles.get', () => {
  it('joins names, stock, the next date, recipes and what blocks a deletion', async () => {
    const { t, kitchen, run } = await setup();
    const result = await run['articles.get']({
      businessId: t.businessId,
      articleId: kitchen.articles.entrecote.id,
    });
    expect(result.article).toEqual({
      id: kitchen.articles.entrecote.id,
      name: 'Rindsentrecôte',
      kind: 'purchased',
      categoryId: 'meat',
      categoryLabel: 'Fleisch',
      declaresOrigin: true,
      unit: 'g',
      pricePer1000: 6200,
      effectivePricePer1000: 6200,
      yieldBps: 9000,
      allergens: [],
      traces: [],
      diet: 'omnivore',
      supplierId: kitchen.suppliers.butcher.id,
      supplierName: 'Metzgerei Muster',
      areaId: kitchen.areas.cold.id,
      areaName: 'Kühlzelle',
      areaKind: 'cold',
      spotId: kitchen.spots.meatDrawer.id,
      spotName: 'Schublade Fleisch',
      shelfLifeDays: 5,
      dateKind: 'use_by',
      originCountry: 'CH',
      originCountryName: 'Schweiz',
      active: true,
    });
    // 4 kg at CHF 62.00, to be used by the day after tomorrow.
    expect(result.stock).toEqual({
      quantity: 4000,
      valueRappen: 24_800,
      lots: 1,
      belowMin: false,
      next: { expiresOn: '2026-11-16', dateKind: 'use_by', status: 'soon', daysLeft: 2 },
    });
    expect(result.usedIn).toEqual([
      {
        recipeId: kitchen.recipes.entrecoteDish.id,
        name: 'Entrecôte mit Rotweinjus und Kartoffelstock',
        kind: 'dish',
        quantity: 1800,
        portions: 10,
        active: true,
      },
    ]);
    expect(result).not.toHaveProperty('madeBy');
    expect(result.priceHistory).toEqual([
      {
        lotId: kitchen.lots.entrecote.id,
        receivedOn: '2026-11-13',
        pricePer1000: 6200,
        quantity: 4000,
        supplierName: 'Metzgerei Muster',
      },
    ]);
    expect(result.missing).toEqual([]);
    expect(result.unitLock).toBe('stock');
    expect(result.blockers).toEqual({ stock: 4000, recipes: 1, orders: 0 });
  });

  it('takes the earliest date of several lots and tells when stock is below the minimum', async () => {
    const { t, kitchen, run } = await setup();
    const cream = await run['articles.get']({
      businessId: t.businessId,
      articleId: kitchen.articles.cream.id,
    });
    expect(cream.stock).toMatchObject({
      quantity: 8000,
      valueRappen: 5120,
      lots: 2,
      next: { expiresOn: '2026-11-20', dateKind: 'best_before', status: 'ok', daysLeft: 6 },
    });
    // Cream goes into both dishes and, through the butter-free jus, into nothing else.
    expect(cream.usedIn.map((use) => [use.name, use.quantity])).toEqual([
      ['Entrecôte mit Rotweinjus und Kartoffelstock', 400],
      ['Lachs mit Rahmsauce', 300],
    ]);
    const flour = await run['articles.get']({
      businessId: t.businessId,
      articleId: kitchen.articles.flour.id,
    });
    // Flour carries no date: there is no next one.
    expect(flour.stock).toEqual({ quantity: 3000, valueRappen: 480, lots: 1, belowMin: true });
    expect(flour.article).toMatchObject({
      minStock: 5000,
      targetStock: 20_000,
      packSize: 10_000,
      packLabel: 'Sack',
    });
    expect(flour.blockers).toEqual({ stock: 3000, recipes: 0, orders: 0 });
  });

  it('names the recipe that makes a component and computes what it declares', async () => {
    const { t, kitchen, run } = await setup();
    const jus = await run['articles.get']({
      businessId: t.businessId,
      articleId: kitchen.articles.jus.id,
    });
    expect(jus.article).toMatchObject({
      kind: 'prepared',
      pricePer1000: 0,
      // No production yet: the cost of the recipe, CHF 7.89 for the litre it gives.
      effectivePricePer1000: 789,
      allergens: ['milk', 'sulphites'],
      diet: 'vegetarian',
      recipeId: kitchen.recipes.jus.id,
    });
    expect(jus.madeBy).toEqual({
      recipeId: kitchen.recipes.jus.id,
      name: 'Rotweinjus',
      quantity: 1000,
    });
    expect(jus.usedIn.map((use) => [use.name, use.quantity])).toEqual([
      ['Entrecôte mit Rotweinjus und Kartoffelstock', 500],
    ]);
    expect(jus.stock).toEqual({ quantity: 0, valueRappen: 0, lots: 0, belowMin: false });
    expect(jus.priceHistory).toEqual([]);
    // No lots, but two recipes know it: as ingredient and as output.
    expect(jus.unitLock).toBe('recipes');
    expect(jus.blockers).toEqual({ stock: 0, recipes: 2, orders: 0 });
    expect(jus.missing).toEqual([]);
  });

  it('keeps the last twelve purchases, newest first, each against the one before', async () => {
    const { t, kitchen, run } = await setup();
    const id = kitchen.articles.entrecote.id;
    // CHF 62.00 (seed, yesterday) → 65.10 today → 62.00 tomorrow.
    await purchase(t, kitchen, id, 2000, 6510, 0);
    await purchase(t, kitchen, id, 1000, 6200, 1);
    const first = await run['articles.get']({ businessId: t.businessId, articleId: id });
    expect(
      first.priceHistory.map((point) => [point.receivedOn, point.pricePer1000, point.changeBps]),
    ).toEqual([
      // (6200 − 6510) ÷ 6510 = −4.76 %
      ['2026-11-15', 6200, -476],
      // (6510 − 6200) ÷ 6200 = +5 %
      ['2026-11-14', 6510, 500],
      ['2026-11-13', 6200, undefined],
    ]);
    // The ledger remembers the last purchase price on the article.
    expect(first.article.pricePer1000).toBe(6200);
    expect(first.stock).toMatchObject({ quantity: 7000, lots: 3 });

    // Ten more: thirteen purchases in all, the seed of yesterday falls out of the list.
    for (let day = 2; day <= 11; day += 1) {
      await purchase(t, kitchen, id, 1000, 6200 + day * 10, day);
    }
    const later = await run['articles.get']({ businessId: t.businessId, articleId: id });
    expect(later.priceHistory).toHaveLength(12);
    expect(later.priceHistory[0]).toMatchObject({ receivedOn: '2026-11-25', pricePer1000: 6310 });
    // The oldest of the twelve still knows the purchase before it: 65.10 after 62.00.
    expect(later.priceHistory[11]).toMatchObject({ receivedOn: '2026-11-14', changeBps: 500 });
  });

  it('counts open orders among what blocks a deletion', async () => {
    const { t, kitchen, run } = await setup();
    await t.storage.orders.add(
      PurchaseOrderSchema.parse({
        id: t.cmd(),
        businessId: t.businessId,
        createdAt: t.clock.now(),
        updatedAt: t.clock.now(),
        supplierId: kitchen.suppliers.wholesaler.id,
        status: 'sent',
        lines: [{ articleId: kitchen.articles.flour.id, quantity: 10_000, pricePer1000: 160 }],
      }),
    );
    const flour = await run['articles.get']({
      businessId: t.businessId,
      articleId: kitchen.articles.flour.id,
    });
    expect(flour.blockers.orders).toBe(1);
  });

  it('does not find a deleted article, an unknown one or one of another business', async () => {
    const { t, kitchen, run } = await setup();
    await expect(
      run['articles.get']({ businessId: t.businessId, articleId: t.cmd() }),
    ).rejects.toMatchObject({ code: 'not_found' });
    const other = await createTestContext({ storage: t.storage, idStart: 100_000 });
    await expect(
      other.useCases['articles.get']({
        businessId: other.businessId,
        articleId: kitchen.articles.eggs.id,
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
    await t.storage.articles.put({ ...kitchen.articles.eggs, deletedAt: t.clock.now() });
    await expect(
      run['articles.get']({ businessId: t.businessId, articleId: kitchen.articles.eggs.id }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('articles.create', () => {
  it('proposes diet, date kind, shelf life and area from the group of goods', async () => {
    const { t, kitchen, run } = await setup();
    const { articleId } = await run['articles.create']({
      commandId: t.cmd(),
      businessId: t.businessId,
      name: '  Kalbsfilet ',
      categoryId: 'meat',
      unit: 'g',
    });
    // Fleisch: Kühlzelle, «zu verbrauchen bis», 3 days, with meat or fish.
    expect(await t.storage.articles.get(articleId)).toEqual({
      id: articleId,
      businessId: t.businessId,
      createdAt: t.clock.now(),
      updatedAt: t.clock.now(),
      name: 'Kalbsfilet',
      kind: 'purchased',
      categoryId: 'meat',
      unit: 'g',
      pricePer1000: 0,
      yieldBps: 10_000,
      allergens: [],
      traces: [],
      diet: 'omnivore',
      dateKind: 'use_by',
      shelfLifeDays: 3,
      areaId: kitchen.areas.cold.id,
      active: true,
    });
    const detail = await run['articles.get']({ businessId: t.businessId, articleId });
    // Meat without a country: the origin is missing until it is chosen.
    expect(detail.missing).toEqual(['price', 'origin', 'supplier']);
    expect(detail.article.declaresOrigin).toBe(true);
    expect(detail).not.toHaveProperty('unitLock');
    expect(detail.blockers).toEqual({ stock: 0, recipes: 0, orders: 0 });

    await run['articles.update']({
      commandId: t.cmd(),
      businessId: t.businessId,
      articleId,
      originCountry: 'CH',
      pricePer1000: 8900,
      supplierId: kitchen.suppliers.butcher.id,
    });
    const complete = await run['articles.get']({ businessId: t.businessId, articleId });
    expect(complete.missing).toEqual([]);
    expect(complete.article).toMatchObject({ originCountry: 'CH', originCountryName: 'Schweiz' });
    expect(await eventTypes(t)).toEqual(['article.created', 'article.updated']);
  });

  it('stores an egg at CHF 0.45 as 45000 and shows it per piece', async () => {
    const { t, run } = await setup();
    const { articleId } = await run['articles.create']({
      commandId: t.cmd(),
      businessId: t.businessId,
      name: 'Wachteleier',
      categoryId: 'eggs',
      unit: 'pcs',
      pricePer1000: 45_000,
    });
    const row = await t.storage.articles.get(articleId);
    expect(row).toMatchObject({ unit: 'pcs', pricePer1000: 45_000, diet: 'vegetarian' });
    expect(formatUnitPrice(row?.pricePer1000 ?? 0, 'pcs', DEFAULT_CURRENCY)).toBe(
      'CHF 0.45 / Stk.',
    );
  });

  it('takes every field as given, sorts allergens and keeps traces apart from them', async () => {
    const { t, kitchen, run } = await setup();
    const { articleId } = await run['articles.create']({
      commandId: t.cmd(),
      businessId: t.businessId,
      name: 'Haselnussglace',
      categoryId: 'frozen',
      unit: 'ml',
      pricePer1000: 1250,
      yieldBps: 9500,
      allergens: ['nuts', 'milk', 'eggs'],
      traces: ['peanuts', 'milk', 'gluten'],
      diet: 'vegetarian',
      dateKind: 'use_by',
      shelfLifeDays: 90,
      supplierId: kitchen.suppliers.wholesaler.id,
      supplierArticleNumber: 'GL-204',
      packSize: 5000,
      packLabel: 'Wanne',
      minStock: 5000,
      targetStock: 15_000,
      spotId: kitchen.spots.dryShelf.id,
      originCountry: 'IT',
      gtin: '7612345678900',
      note: 'Nur für die Dessertkarte.',
      active: false,
    });
    expect(await t.storage.articles.get(articleId)).toMatchObject({
      pricePer1000: 1250,
      yieldBps: 9500,
      // The order of the ordinance; what is contained is not listed again as a trace.
      allergens: ['eggs', 'milk', 'nuts'],
      traces: ['gluten', 'peanuts'],
      diet: 'vegetarian',
      dateKind: 'use_by',
      shelfLifeDays: 90,
      supplierId: kitchen.suppliers.wholesaler.id,
      supplierArticleNumber: 'GL-204',
      packSize: 5000,
      packLabel: 'Wanne',
      minStock: 5000,
      targetStock: 15_000,
      // A spot brings its area.
      areaId: kitchen.areas.dry.id,
      spotId: kitchen.spots.dryShelf.id,
      originCountry: 'IT',
      gtin: '7612345678900',
      note: 'Nur für die Dessertkarte.',
      active: false,
    });
  });

  it('leaves the area open when the business has none of the kind', async () => {
    const { t, run } = await setup();
    // Wine goes to «Bar und Weinkeller», which this kitchen does not have.
    const { articleId } = await run['articles.create']({
      commandId: t.cmd(),
      businessId: t.businessId,
      name: 'Pinot noir',
      categoryId: 'wine',
      unit: 'ml',
    });
    const row = await t.storage.articles.get(articleId);
    expect(row).not.toHaveProperty('areaId');
    expect(row).toMatchObject({ shelfLifeDays: 1825, dateKind: 'best_before', diet: 'vegan' });
  });

  it('takes null for «none»: no area and no shelf life although the group proposes them', async () => {
    const { t, run } = await setup();
    const { articleId } = await run['articles.create']({
      commandId: t.cmd(),
      businessId: t.businessId,
      name: 'Fleur de Sel',
      categoryId: 'spices',
      unit: 'g',
      areaId: null,
      shelfLifeDays: null,
    });
    const row = await t.storage.articles.get(articleId);
    expect(row).not.toHaveProperty('areaId');
    expect(row).not.toHaveProperty('shelfLifeDays');
    expect(row).toMatchObject({ dateKind: 'best_before', diet: 'vegan' });
  });

  it('is idempotent: the same command twice creates one article and one event', async () => {
    const { t, run } = await setup();
    const input = {
      commandId: t.cmd(),
      businessId: t.businessId,
      name: 'Kalbsfilet',
      categoryId: 'meat' as const,
      unit: 'g' as const,
    };
    const first = await run['articles.create'](input);
    expect(await run['articles.create'](input)).toEqual(first);
    expect((await run['articles.list']({ businessId: t.businessId })).total).toBe(11);
    expect(await eventTypes(t)).toEqual(['article.created']);
    const [event] = await t.storage.events.ofBusiness(t.businessId);
    expect(event).toMatchObject({ actor: t.actor, payload: { articleId: first.articleId } });
  });

  it('refuses a name that exists, whatever its case, until that article is deleted', async () => {
    const { t, kitchen, run } = await setup();
    const input = { businessId: t.businessId, categoryId: 'dairy' as const, unit: 'g' as const };
    await expect(
      run['articles.create']({ ...input, commandId: t.cmd(), name: 'BUTTER' }),
    ).rejects.toMatchObject({ code: 'duplicate_name' });
    // A component counts too: names are unique across both kinds.
    await expect(
      run['articles.create']({ ...input, commandId: t.cmd(), name: 'rotweinjus' }),
    ).rejects.toMatchObject({ code: 'duplicate_name' });
    await t.storage.articles.put({ ...kitchen.articles.butter, deletedAt: t.clock.now() });
    await expect(
      run['articles.create']({ ...input, commandId: t.cmd(), name: 'Butter' }),
    ).resolves.toBeDefined();
    // Another business may have its own «Eier».
    const other = await createTestContext({ storage: t.storage, idStart: 100_000 });
    await expect(
      other.useCases['articles.create']({
        commandId: other.cmd(),
        businessId: other.businessId,
        name: 'Eier',
        categoryId: 'eggs',
        unit: 'pcs',
      }),
    ).resolves.toBeDefined();
  });

  it('refuses what does not fit: unknown supplier, a spot of another area, target below minimum', async () => {
    const { t, kitchen, run } = await setup();
    const input = {
      businessId: t.businessId,
      name: 'Kalbsfilet',
      categoryId: 'meat' as const,
      unit: 'g' as const,
    };
    await expect(
      run['articles.create']({ ...input, commandId: t.cmd(), supplierId: t.cmd() }),
    ).rejects.toMatchObject({ code: 'not_found' });
    await expect(
      run['articles.create']({ ...input, commandId: t.cmd(), areaId: t.cmd() }),
    ).rejects.toMatchObject({ code: 'not_found' });
    await expect(
      run['articles.create']({
        ...input,
        commandId: t.cmd(),
        areaId: kitchen.areas.cold.id,
        spotId: kitchen.spots.dryShelf.id,
      }),
    ).rejects.toMatchObject({ code: 'invalid' });
    await expect(
      run['articles.create']({ ...input, commandId: t.cmd(), minStock: 5000, targetStock: 2000 }),
    ).rejects.toMatchObject({ code: 'invalid' });
    // A wrong check digit never reaches the data.
    await expect(
      run['articles.create']({ ...input, commandId: t.cmd(), gtin: '7612345678901' }),
    ).rejects.toThrow();
    expect((await run['articles.list']({ businessId: t.businessId })).total).toBe(10);
    expect(await eventTypes(t)).toEqual([]);
  });
});

describe('articles.update', () => {
  it('changes what is given, clears with null and names the changed fields', async () => {
    const { t, kitchen, run } = await setup();
    const articleId = kitchen.articles.flour.id;
    const commandId = t.cmd();
    t.clock.setToday('2026-11-15');
    const result = await run['articles.update']({
      commandId,
      businessId: t.businessId,
      articleId,
      name: 'Weissmehl Typ 550',
      pricePer1000: 175,
      allergens: ['gluten'],
      traces: ['soy', 'gluten'],
      minStock: 8000,
      packLabel: null,
      note: 'Im Sack lagern.',
      // Unchanged values are not reported.
      unit: 'g',
      targetStock: 20_000,
    });
    expect(result).toEqual({
      articleId,
      changed: ['name', 'pricePer1000', 'traces', 'packLabel', 'minStock', 'note'],
    });
    const row = await t.storage.articles.get(articleId);
    expect(row).toMatchObject({
      name: 'Weissmehl Typ 550',
      pricePer1000: 175,
      allergens: ['gluten'],
      traces: ['soy'],
      minStock: 8000,
      note: 'Im Sack lagern.',
      updatedAt: '2026-11-15T10:00:00.000Z',
      createdAt: '2026-11-14T10:00:00.000Z',
    });
    expect(row).not.toHaveProperty('packLabel');
    const events = await t.storage.events.ofBusiness(t.businessId);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'article.updated',
      payload: { articleId, fields: result.changed },
    });
    // Idempotent: the same command again returns the stored result and writes nothing.
    expect(
      await run['articles.update']({ commandId, businessId: t.businessId, articleId, name: 'X' }),
    ).toEqual(result);
    expect((await t.storage.articles.get(articleId))?.name).toBe('Weissmehl Typ 550');
    expect(await t.storage.events.ofBusiness(t.businessId)).toHaveLength(1);
  });

  it('writes nothing and emits nothing when nothing changes', async () => {
    const { t, kitchen, run } = await setup();
    const result = await run['articles.update']({
      commandId: t.cmd(),
      businessId: t.businessId,
      articleId: kitchen.articles.eggs.id,
      name: 'Eier',
      allergens: ['eggs'],
      packSize: null,
    });
    expect(result.changed).toEqual([]);
    expect(await t.storage.articles.get(kitchen.articles.eggs.id)).toEqual(kitchen.articles.eggs);
    expect(await eventTypes(t)).toEqual([]);
  });

  it('keeps area and spot together', async () => {
    const { t, kitchen, run } = await setup();
    const articleId = kitchen.articles.entrecote.id;
    const update = (fields: { areaId?: Id | null; spotId?: Id | null }) =>
      run['articles.update']({
        commandId: t.cmd(),
        businessId: t.businessId,
        articleId,
        ...fields,
      });
    const row = () => t.storage.articles.get(articleId);

    // Another area: the drawer in the cold room does not come along.
    expect((await update({ areaId: kitchen.areas.dry.id })).changed).toEqual(['areaId', 'spotId']);
    expect(await row()).not.toHaveProperty('spotId');
    // A spot alone brings its area.
    expect((await update({ spotId: kitchen.spots.meatDrawer.id })).changed).toEqual([
      'areaId',
      'spotId',
    ]);
    expect(await row()).toMatchObject({
      areaId: kitchen.areas.cold.id,
      spotId: kitchen.spots.meatDrawer.id,
    });
    // The same area again keeps the spot.
    expect((await update({ areaId: kitchen.areas.cold.id })).changed).toEqual([]);
    // Only the spot goes.
    expect((await update({ spotId: null })).changed).toEqual(['spotId']);
    expect(await row()).toMatchObject({ areaId: kitchen.areas.cold.id });
    // No area: no spot either.
    await update({ spotId: kitchen.spots.meatDrawer.id });
    expect((await update({ areaId: null })).changed).toEqual(['areaId', 'spotId']);
    expect(await row()).not.toHaveProperty('areaId');

    await expect(
      update({ areaId: kitchen.areas.cold.id, spotId: kitchen.spots.dryShelf.id }),
    ).rejects.toMatchObject({ code: 'invalid' });
    await expect(update({ areaId: t.cmd() })).rejects.toMatchObject({ code: 'not_found' });
    await expect(update({ spotId: t.cmd() })).rejects.toMatchObject({ code: 'not_found' });
  });

  it('does not change the unit once there is stock or a recipe', async () => {
    const { t, kitchen, run } = await setup();
    const update = (articleId: Id, unit: 'g' | 'ml' | 'pcs') =>
      run['articles.update']({ commandId: t.cmd(), businessId: t.businessId, articleId, unit });
    await expect(update(kitchen.articles.entrecote.id, 'pcs')).rejects.toMatchObject({
      code: 'not_allowed',
      message: expect.stringContaining('stock') as string,
    });
    // The jus has no lot yet, but recipes count it in millilitres.
    await expect(update(kitchen.articles.jus.id, 'g')).rejects.toMatchObject({
      code: 'not_allowed',
      message: expect.stringContaining('recipes') as string,
    });
    // A used-up lot still locks the unit: its movements are in grams.
    const { articleId } = await run['articles.create']({
      commandId: t.cmd(),
      businessId: t.businessId,
      name: 'Trüffel',
      categoryId: 'vegetables',
      unit: 'g',
    });
    expect((await update(articleId, 'pcs')).changed).toEqual(['unit']);
    expect((await t.storage.articles.get(articleId))?.unit).toBe('pcs');
    const lot = await purchase(t, kitchen, articleId, 3, 90_000, 0);
    await t.storage.lots.put({ ...lot, quantity: 0, status: 'depleted' });
    await expect(update(articleId, 'g')).rejects.toMatchObject({ code: 'not_allowed' });
  });

  it('leaves to the recipe what the recipe owns on a component', async () => {
    const { t, kitchen, run } = await setup();
    const articleId = kitchen.articles.jus.id;
    const base = { businessId: t.businessId, articleId };
    for (const owned of [
      { name: 'Jus de vin rouge' },
      { allergens: ['milk' as const] },
      { traces: ['nuts' as const] },
      { diet: 'omnivore' as const },
      { pricePer1000: 900 },
    ]) {
      await expect(
        run['articles.update']({ ...base, commandId: t.cmd(), ...owned }),
      ).rejects.toMatchObject({ code: 'not_allowed' });
    }
    // Where it is kept and how long is the kitchen's call; unchanged owned fields may come along.
    const result = await run['articles.update']({
      ...base,
      commandId: t.cmd(),
      name: 'Rotweinjus',
      diet: 'vegan',
      minStock: 2000,
      shelfLifeDays: 4,
    });
    expect(result.changed).toEqual(['minStock', 'shelfLifeDays']);
    expect(await t.storage.articles.get(articleId)).toMatchObject({
      name: 'Rotweinjus',
      minStock: 2000,
      shelfLifeDays: 4,
      recipeId: kitchen.recipes.jus.id,
    });
  });

  it('refuses a taken name, an unknown supplier and a target below the minimum', async () => {
    const { t, kitchen, run } = await setup();
    const base = { businessId: t.businessId, articleId: kitchen.articles.flour.id };
    await expect(
      run['articles.update']({ ...base, commandId: t.cmd(), name: 'butter' }),
    ).rejects.toMatchObject({ code: 'duplicate_name' });
    // Its own name in another case is no duplicate.
    expect(
      (await run['articles.update']({ ...base, commandId: t.cmd(), name: 'WEISSMEHL' })).changed,
    ).toEqual(['name']);
    await expect(
      run['articles.update']({ ...base, commandId: t.cmd(), supplierId: t.cmd() }),
    ).rejects.toMatchObject({ code: 'not_found' });
    await expect(
      run['articles.update']({ ...base, commandId: t.cmd(), targetStock: 1000 }),
    ).rejects.toMatchObject({ code: 'invalid' });
    expect(
      (await run['articles.update']({ ...base, commandId: t.cmd(), supplierId: null })).changed,
    ).toEqual(['supplierId']);
    await expect(
      run['articles.update']({ ...base, commandId: t.cmd(), articleId: t.cmd(), name: 'Mehl' }),
    ).rejects.toMatchObject({ code: 'not_found' });
    const other = await createTestContext({ storage: t.storage, idStart: 100_000 });
    await expect(
      other.useCases['articles.update']({
        commandId: other.cmd(),
        businessId: other.businessId,
        articleId: kitchen.articles.flour.id,
        name: 'Mehl',
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('articles.setActive', () => {
  it('hides an article from the list and brings it back, with its history', async () => {
    const { t, kitchen, run } = await setup();
    const articleId = kitchen.articles.eggs.id;
    const commandId = t.cmd();
    const off = await run['articles.setActive']({
      commandId,
      businessId: t.businessId,
      articleId,
      active: false,
    });
    expect(off).toEqual({ articleId, active: false });
    const list = await run['articles.list']({ businessId: t.businessId });
    expect(list.rows.map((row) => row.name)).not.toContain('Eier');
    expect(list.counts).toMatchObject({ all: 9, inactive: 1 });
    const inactive = await run['articles.list']({ businessId: t.businessId, filter: 'inactive' });
    // The stock is still there and still counted.
    expect(inactive.rows).toMatchObject([{ name: 'Eier', active: false, stock: 60 }]);
    // Repeating the command, or saying the same again, changes nothing.
    expect(
      await run['articles.setActive']({
        commandId,
        businessId: t.businessId,
        articleId,
        active: true,
      }),
    ).toEqual(off);
    await run['articles.setActive']({
      commandId: t.cmd(),
      businessId: t.businessId,
      articleId,
      active: false,
    });
    expect(await eventTypes(t)).toEqual(['article.deactivated']);

    await run['articles.setActive']({
      commandId: t.cmd(),
      businessId: t.businessId,
      articleId,
      active: true,
    });
    expect((await t.storage.articles.get(articleId))?.active).toBe(true);
    expect(await eventTypes(t)).toEqual(['article.deactivated', 'article.activated']);
    await expect(
      run['articles.setActive']({
        commandId: t.cmd(),
        businessId: t.businessId,
        articleId: t.cmd(),
        active: false,
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('articles.delete', () => {
  it('refuses while there is stock, a recipe or an open order', async () => {
    const { t, kitchen, run } = await setup();
    const remove = (articleId: Id) =>
      run['articles.delete']({ commandId: t.cmd(), businessId: t.businessId, articleId });
    // 4 kg in the cold room.
    await expect(remove(kitchen.articles.entrecote.id)).rejects.toMatchObject({
      code: 'in_use',
      message: expect.stringContaining('stock') as string,
    });
    // No stock, but an ingredient of the entrecôte dish and the output of its own recipe.
    await expect(remove(kitchen.articles.jus.id)).rejects.toMatchObject({
      code: 'in_use',
      message: expect.stringContaining('recipe') as string,
    });
    const { articleId } = await run['articles.create']({
      commandId: t.cmd(),
      businessId: t.businessId,
      name: 'Trüffel',
      categoryId: 'vegetables',
      unit: 'g',
    });
    const order = PurchaseOrderSchema.parse({
      id: t.cmd(),
      businessId: t.businessId,
      createdAt: t.clock.now(),
      updatedAt: t.clock.now(),
      supplierId: kitchen.suppliers.wholesaler.id,
      status: 'draft',
      lines: [{ articleId, quantity: 100, pricePer1000: 90_000 }],
    });
    await t.storage.orders.add(order);
    await expect(remove(articleId)).rejects.toMatchObject({
      code: 'in_use',
      message: expect.stringContaining('order') as string,
    });
    expect((await run['articles.list']({ businessId: t.businessId })).total).toBe(11);
    expect(await eventTypes(t)).toEqual(['article.created']);

    // The order arrived and the goods were used up: nothing holds the article any more.
    await t.storage.orders.put({ ...order, status: 'received' });
    const lot = await purchase(t, kitchen, articleId, 100, 90_000, 0);
    await expect(remove(articleId)).rejects.toMatchObject({ code: 'in_use' });
    await t.storage.lots.put({ ...lot, quantity: 0, status: 'depleted' });
    await expect(remove(articleId)).resolves.toEqual({ articleId });
  });

  it('deletes softly, once, and frees the name', async () => {
    const { t, run } = await setup();
    const { articleId } = await run['articles.create']({
      commandId: t.cmd(),
      businessId: t.businessId,
      name: 'Trüffel',
      categoryId: 'vegetables',
      unit: 'g',
    });
    t.clock.setToday('2026-11-15');
    const commandId = t.cmd();
    const result = await run['articles.delete']({ commandId, businessId: t.businessId, articleId });
    expect(result).toEqual({ articleId });
    // The row stays, marked as deleted.
    expect(await t.storage.articles.get(articleId)).toMatchObject({
      name: 'Trüffel',
      deletedAt: '2026-11-15T10:00:00.000Z',
      updatedAt: '2026-11-15T10:00:00.000Z',
    });
    expect((await run['articles.list']({ businessId: t.businessId })).total).toBe(10);
    await expect(
      run['articles.get']({ businessId: t.businessId, articleId }),
    ).rejects.toMatchObject({ code: 'not_found' });
    expect(
      await run['articles.delete']({ commandId, businessId: t.businessId, articleId }),
    ).toEqual(result);
    expect(await eventTypes(t)).toEqual(['article.created', 'article.deleted']);
    // A second deletion finds nothing; the name is free again.
    await expect(
      run['articles.delete']({ commandId: t.cmd(), businessId: t.businessId, articleId }),
    ).rejects.toMatchObject({ code: 'not_found' });
    await expect(
      run['articles.create']({
        commandId: t.cmd(),
        businessId: t.businessId,
        name: 'Trüffel',
        categoryId: 'vegetables',
        unit: 'g',
      }),
    ).resolves.toBeDefined();
  });

  it('does not delete for another business', async () => {
    const { t, run } = await setup();
    const { articleId } = await run['articles.create']({
      commandId: t.cmd(),
      businessId: t.businessId,
      name: 'Trüffel',
      categoryId: 'vegetables',
      unit: 'g',
    });
    const other = await createTestContext({ storage: t.storage, idStart: 100_000 });
    await expect(
      other.useCases['articles.delete']({
        commandId: other.cmd(),
        businessId: other.businessId,
        articleId,
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
    expect(await t.storage.articles.get(articleId)).not.toHaveProperty('deletedAt');
  });
});
