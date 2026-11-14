import { describe, expect, it } from 'vitest';
import { addDays, ArticleSchema, PurchaseOrderSchema, type Id } from '../src';
import { createTestContext, seedKitchen } from '../src/testing';

/**
 * The test kitchen on 14.11.2026 (see `seedKitchen`), by hand:
 *   Entrecôte 4 kg × 62.00 = 248.00   Lachs 1.5 kg × 38.00 = 57.00
 *   Rahm 3 l × 6.40 = 19.20 and 5 l × 6.40 = 32.00   Butter 2 kg × 14.00 = 28.00
 *   Mehl 3 kg × 1.60 = 4.80   Eier 60 × 0.45 = 27.00   Zwiebeln 10 kg × 2.20 = 22.00
 *   Kartoffeln 25 kg × 1.80 = 45.00   Rotwein 6 l × 9.00 = 54.00
 * Together CHF 537.00 in ten lots of nine articles, in the cold room and the dry store.
 */
async function setup() {
  const t = await createTestContext();
  const kitchen = await seedKitchen(t);
  return { t, kitchen, today: t.clock.today(), run: t.useCases, businessId: t.businessId };
}

const names = (rows: readonly { name: string }[]) => rows.map((row) => row.name);

describe('stock.overview', () => {
  it('lists every article in stock with quantity, value, next date and its areas', async () => {
    const { run, businessId, kitchen, today } = await setup();
    const { rows, totals } = await run['stock.overview']({ businessId });
    expect(names(rows)).toEqual([
      'Butter',
      'Eier',
      'Kartoffeln',
      'Lachsfilet',
      'Rindsentrecôte',
      'Rotwein zum Kochen',
      'Vollrahm',
      'Weissmehl',
      'Zwiebeln',
    ]);
    // Two lots of cream: 3 l + 5 l = 8 l, 19.20 + 32.00 = 51.20; the older one is due first.
    expect(rows.find((row) => row.articleId === kitchen.articles.cream.id)).toEqual({
      articleId: kitchen.articles.cream.id,
      name: 'Vollrahm',
      unit: 'ml',
      categoryId: 'dairy',
      quantity: 8000,
      valueRappen: 5120,
      lotCount: 2,
      areas: [{ id: kitchen.areas.cold.id, name: 'Kühlzelle', kind: 'cold' }],
      nextExpiresOn: addDays(today, 6),
      dateKind: 'best_before',
      expiryStatus: 'ok',
      daysLeft: 6,
      belowMin: false,
      priceMissing: false,
    });
    // Flour has no date and lies under its minimum of 5 kg.
    expect(rows.find((row) => row.articleId === kitchen.articles.flour.id)).toMatchObject({
      quantity: 3000,
      valueRappen: 480,
      expiryStatus: 'none',
      minStock: 5000,
      belowMin: true,
    });
    expect(rows.find((row) => row.articleId === kitchen.articles.flour.id)).not.toHaveProperty(
      'nextExpiresOn',
    );
    expect(totals).toEqual({
      valueRappen: 53_700,
      articleCount: 9,
      areaCount: 2,
      lotCount: 10,
      expired: { count: 0, valueRappen: 0 },
      today: { count: 0, valueRappen: 0 },
      // Lachs (tomorrow) and Entrecôte (in two days): 57.00 + 248.00.
      soon: { count: 2, valueRappen: 30_500 },
      pastBestBefore: { count: 0, valueRappen: 0 },
      belowMinCount: 1,
      lotsWithoutPrice: 0,
    });
  });

  it('narrows the list by search, area, group of goods and filter; the totals stay', async () => {
    const { run, businessId, kitchen } = await setup();
    const search = await run['stock.overview']({ businessId, search: '  ENTRECOTE ' });
    expect(names(search.rows)).toEqual(['Rindsentrecôte']);
    expect(search.totals.valueRappen).toBe(53_700);
    expect(names((await run['stock.overview']({ businessId, search: 'wein koch' })).rows)).toEqual([
      'Rotwein zum Kochen',
    ]);
    expect(
      names((await run['stock.overview']({ businessId, areaId: kitchen.areas.dry.id })).rows),
    ).toEqual(['Kartoffeln', 'Rotwein zum Kochen', 'Weissmehl', 'Zwiebeln']);
    expect(names((await run['stock.overview']({ businessId, categoryId: 'dairy' })).rows)).toEqual([
      'Butter',
      'Vollrahm',
    ]);
    expect(names((await run['stock.overview']({ businessId, filter: 'expiring' })).rows)).toEqual([
      'Lachsfilet',
      'Rindsentrecôte',
    ]);
    const belowMin = await run['stock.overview']({ businessId, filter: 'below_min' });
    expect(names(belowMin.rows)).toEqual(['Weissmehl']);
    expect(belowMin.totals.belowMinCount).toBe(1);
    expect((await run['stock.overview']({ businessId, search: 'gibt es nicht' })).rows).toEqual([]);
  });

  it('follows the calendar: due today, expired, past best-before', async () => {
    const { t, run, businessId, kitchen, today } = await setup();
    t.clock.setToday(addDays(today, 2));
    const later = await run['stock.overview']({ businessId });
    expect(later.totals.expired).toEqual({ count: 1, valueRappen: 5700 });
    expect(later.totals.today).toEqual({ count: 1, valueRappen: 24_800 });
    expect(later.totals.soon).toEqual({ count: 0, valueRappen: 0 });
    expect(later.rows.find((row) => row.articleId === kitchen.articles.salmon.id)).toMatchObject({
      expiryStatus: 'expired',
      daysLeft: -1,
      dateKind: 'use_by',
    });
    // A week on, the older cream is one day past its best-before date.
    t.clock.setToday(addDays(today, 7));
    const week = await run['stock.overview']({ businessId });
    expect(week.totals.pastBestBefore).toEqual({ count: 1, valueRappen: 1920 });
    expect(week.totals.expired).toEqual({ count: 2, valueRappen: 30_500 });
    expect(week.rows.find((row) => row.articleId === kitchen.articles.cream.id)).toMatchObject({
      expiryStatus: 'past_best_before',
      daysLeft: -1,
    });
    expect(names((await run['stock.overview']({ businessId, filter: 'expiring' })).rows)).toEqual([
      'Lachsfilet',
      'Rindsentrecôte',
      'Vollrahm',
    ]);
  });

  it('shows an article with a minimum that has no stock, in the area it is usually kept', async () => {
    const { t, run, businessId, kitchen } = await setup();
    await t.storage.articles.put(ArticleSchema.parse({ ...kitchen.articles.jus, minStock: 500 }));
    const all = await run['stock.overview']({ businessId });
    expect(all.rows.find((row) => row.articleId === kitchen.articles.jus.id)).toMatchObject({
      name: 'Rotweinjus',
      quantity: 0,
      valueRappen: 0,
      lotCount: 0,
      areas: [{ id: kitchen.areas.cold.id, name: 'Kühlzelle', kind: 'cold' }],
      expiryStatus: 'none',
      belowMin: true,
    });
    expect(all.totals.belowMinCount).toBe(2);
    expect(all.totals.articleCount).toBe(9);
    const cold = await run['stock.overview']({ businessId, areaId: kitchen.areas.cold.id });
    expect(names(cold.rows)).toContain('Rotweinjus');
    const dry = await run['stock.overview']({ businessId, areaId: kitchen.areas.dry.id });
    expect(names(dry.rows)).not.toContain('Rotweinjus');
  });

  it('shows per area what lies there, and keeps what is in the house in every case', async () => {
    const { t, run, businessId, kitchen } = await setup();
    await run['stock.move']({
      commandId: t.cmd(),
      businessId,
      lotId: kitchen.lots.entrecote.id,
      areaId: kitchen.areas.frozen.id,
      quantity: 1500,
    });
    const all = await run['stock.overview']({ businessId });
    expect(all.rows.find((row) => row.articleId === kitchen.articles.entrecote.id)).toMatchObject({
      quantity: 4000,
      lotCount: 2,
      areas: [
        { id: kitchen.areas.cold.id, name: 'Kühlzelle', kind: 'cold' },
        { id: kitchen.areas.frozen.id, name: 'Tiefkühlzelle', kind: 'frozen' },
      ],
    });
    expect(all.totals.areaCount).toBe(3);
    // 1.5 kg × 62.00 = 93.00 in the freezer.
    const frozen = await run['stock.overview']({ businessId, areaId: kitchen.areas.frozen.id });
    expect(frozen.rows).toHaveLength(1);
    expect(frozen.rows[0]).toMatchObject({
      name: 'Rindsentrecôte',
      quantity: 1500,
      valueRappen: 9300,
    });

    // Set inactive or deleted: what still lies there is still shown and still counts.
    await t.storage.articles.put({ ...kitchen.articles.eggs, active: false });
    await t.storage.articles.put({ ...kitchen.articles.flour, deletedAt: t.clock.now() });
    const after = await run['stock.overview']({ businessId });
    expect(names(after.rows)).toContain('Eier');
    expect(after.rows.find((row) => row.name === 'Weissmehl')).toMatchObject({ belowMin: false });
    expect(after.totals).toMatchObject({ valueRappen: 53_700, belowMinCount: 0 });
  });

  it('says so when a lot has no price instead of showing a pleasant value', async () => {
    const { t, run, businessId, kitchen, today } = await setup();
    // The jus has no price yet: 2 l come in at CHF 0.
    await run['stock.openingStock']({
      commandId: t.cmd(),
      businessId,
      on: today,
      lines: [
        { articleId: kitchen.articles.jus.id, quantity: 2000, areaId: kitchen.areas.cold.id },
      ],
    });
    const { rows, totals } = await run['stock.overview']({ businessId });
    expect(totals).toMatchObject({ lotsWithoutPrice: 1, valueRappen: 53_700, lotCount: 11 });
    expect(rows.find((row) => row.articleId === kitchen.articles.jus.id)).toMatchObject({
      quantity: 2000,
      valueRappen: 0,
      priceMissing: true,
    });
  });

  it('shows nothing of another business', async () => {
    const { t, run } = await setup();
    const other = await createTestContext({ storage: t.storage, idStart: 100_000 });
    const { rows, totals } = await run['stock.overview']({ businessId: other.businessId });
    expect(rows).toEqual([]);
    expect(totals).toMatchObject({ valueRappen: 0, articleCount: 0, lotCount: 0, areaCount: 0 });
  });
});

describe('stock.expiring', () => {
  it('lists what is due within a week, the most urgent first', async () => {
    const { run, businessId, kitchen, today } = await setup();
    const { lots, groups } = await run['stock.expiring']({ businessId });
    expect(lots.map((lot) => [lot.articleName, lot.group, lot.daysLeft])).toEqual([
      ['Lachsfilet', 'soon', 1],
      ['Rindsentrecôte', 'soon', 2],
      ['Vollrahm', 'week', 6],
    ]);
    expect(lots[1]).toEqual({
      lotId: kitchen.lots.entrecote.id,
      articleId: kitchen.articles.entrecote.id,
      articleName: 'Rindsentrecôte',
      unit: 'g',
      quantity: 4000,
      valueRappen: 24_800,
      area: { id: kitchen.areas.cold.id, name: 'Kühlzelle', kind: 'cold' },
      spotName: 'Schublade Fleisch',
      expiresOn: addDays(today, 2),
      dateKind: 'use_by',
      status: 'soon',
      daysLeft: 2,
      group: 'soon',
      mustWriteOff: false,
    });
    expect(lots[0]).not.toHaveProperty('spotName');
    expect(groups).toEqual({
      expired: { count: 0, valueRappen: 0 },
      today: { count: 0, valueRappen: 0 },
      soon: { count: 2, valueRappen: 30_500 },
      week: { count: 1, valueRappen: 1920 },
      past_best_before: { count: 0, valueRappen: 0 },
    });
  });

  it('puts lots past their Verbrauchsdatum first and says they must be written off', async () => {
    const { t, run, businessId, kitchen, today } = await setup();
    t.clock.setToday(addDays(today, 7));
    const { lots, groups } = await run['stock.expiring']({ businessId });
    expect(lots.map((lot) => [lot.articleName, lot.group, lot.daysLeft, lot.mustWriteOff])).toEqual(
      [
        ['Lachsfilet', 'expired', -6, true],
        ['Rindsentrecôte', 'expired', -5, true],
        // Still to come within seven days: the newer cream (in 5 days), the eggs (in 7 days).
        ['Vollrahm', 'week', 5, false],
        ['Eier', 'week', 7, false],
        // Past best-before is the business's call and comes last.
        ['Vollrahm', 'past_best_before', -1, false],
      ],
    );
    expect(lots[0]?.lotId).toBe(kitchen.lots.salmon.id);
    expect(lots[4]?.lotId).toBe(kitchen.lots.creamOld.id);
    expect(groups.expired).toEqual({ count: 2, valueRappen: 30_500 });
    expect(groups.past_best_before).toEqual({ count: 1, valueRappen: 1920 });
    // 5 l cream 32.00 + 60 eggs 27.00.
    expect(groups.week).toEqual({ count: 2, valueRappen: 5900 });
  });

  it('looks as far ahead as asked', async () => {
    const { t, run, businessId, today } = await setup();
    const none = await run['stock.expiring']({ businessId, withinDays: 0 });
    expect(none.lots).toEqual([]);
    const tomorrow = await run['stock.expiring']({ businessId, withinDays: 1 });
    expect(tomorrow.lots.map((lot) => lot.articleName)).toEqual(['Lachsfilet']);
    const month = await run['stock.expiring']({ businessId, withinDays: 30 });
    expect(month.lots.map((lot) => [lot.articleName, lot.daysLeft])).toEqual([
      ['Lachsfilet', 1],
      ['Rindsentrecôte', 2],
      ['Vollrahm', 6],
      ['Vollrahm', 12],
      ['Eier', 14],
      ['Zwiebeln', 20],
      ['Kartoffeln', 25],
      ['Butter', 30],
    ]);
    t.clock.setToday(addDays(today, 2));
    const due = await run['stock.expiring']({ businessId, withinDays: 0 });
    expect(due.lots.map((lot) => [lot.articleName, lot.group])).toEqual([
      ['Lachsfilet', 'expired'],
      ['Rindsentrecôte', 'today'],
    ]);
    await expect(run['stock.expiring']({ businessId, withinDays: -1 })).rejects.toThrow();
  });

  it('shows nothing of another business', async () => {
    const { t, run } = await setup();
    const other = await createTestContext({ storage: t.storage, idStart: 100_000 });
    const { lots, groups } = await run['stock.expiring']({ businessId: other.businessId });
    expect(lots).toEqual([]);
    expect(groups.soon.count).toBe(0);
  });
});

describe('stock.article', () => {
  it('shows the article, its lots first expired first and its movements', async () => {
    const { run, businessId, kitchen, today } = await setup();
    const view = await run['stock.article']({ businessId, articleId: kitchen.articles.cream.id });
    expect(view.article).toEqual({
      id: kitchen.articles.cream.id,
      name: 'Vollrahm',
      kind: 'purchased',
      categoryId: 'dairy',
      unit: 'ml',
      pricePer1000: 640,
      yieldBps: 10_000,
      dateKind: 'best_before',
      areaId: kitchen.areas.cold.id,
      supplierName: 'Grosshandel Beispiel',
      active: true,
    });
    expect(view).toMatchObject({
      quantity: 8000,
      valueRappen: 5120,
      usableQuantity: 8000,
      belowMin: false,
    });
    expect(view.lots).toEqual([
      {
        lotId: kitchen.lots.creamOld.id,
        area: { id: kitchen.areas.cold.id, name: 'Kühlzelle', kind: 'cold' },
        expiresOn: addDays(today, 6),
        dateKind: 'best_before',
        status: 'ok',
        daysLeft: 6,
        mustNotUse: false,
        quantity: 3000,
        initialQuantity: 3000,
        pricePer1000: 640,
        valueRappen: 1920,
        supplierName: 'Grosshandel Beispiel',
        receivedOn: addDays(today, -1),
        origin: 'purchase',
      },
      expect.objectContaining({ lotId: kitchen.lots.creamNew.id, quantity: 5000, daysLeft: 12 }),
    ]);
    // Newest first: the second lot was booked after the first.
    expect(view.movements.map((movement) => [movement.lotId, movement.quantity])).toEqual([
      [kitchen.lots.creamNew.id, 5000],
      [kitchen.lots.creamOld.id, 3000],
    ]);
    expect(view.movements[0]).toMatchObject({
      type: 'receipt',
      articleName: 'Vollrahm',
      unit: 'ml',
      lotOrigin: 'purchase',
      valueRappen: 3200,
      on: addDays(today, -1),
      who: 'Testperson',
    });
  });

  it('counts only what may still be used, and knows the minimum', async () => {
    const { t, run, businessId, kitchen, today } = await setup();
    t.clock.setToday(addDays(today, 2));
    const salmon = await run['stock.article']({
      businessId,
      articleId: kitchen.articles.salmon.id,
    });
    expect(salmon).toMatchObject({ quantity: 1500, valueRappen: 5700, usableQuantity: 0 });
    expect(salmon.lots[0]).toMatchObject({ status: 'expired', daysLeft: -1, mustNotUse: true });
    const flour = await run['stock.article']({ businessId, articleId: kitchen.articles.flour.id });
    expect(flour.article).toMatchObject({ minStock: 5000, targetStock: 20_000 });
    expect(flour.belowMin).toBe(true);
    expect(flour.lots[0]).not.toHaveProperty('expiresOn');
    expect(flour.lots[0]).toMatchObject({ status: 'none', mustNotUse: false });
    // An article without stock: nothing there, nothing usable.
    const jus = await run['stock.article']({ businessId, articleId: kitchen.articles.jus.id });
    expect(jus).toMatchObject({ quantity: 0, valueRappen: 0, usableQuantity: 0, lots: [] });
    expect(jus.article).not.toHaveProperty('supplierName');
  });

  it('shows the last 30 movements with purpose, reason and note', async () => {
    const { t, run, businessId, kitchen } = await setup();
    for (let i = 0; i < 31; i += 1) {
      await run['stock.withdraw']({
        commandId: t.cmd(),
        businessId,
        articleId: kitchen.articles.eggs.id,
        quantity: 1,
        purpose: 'staff',
        note: 'Personalessen',
      });
    }
    await run['stock.writeOff']({
      commandId: t.cmd(),
      businessId,
      lotId: kitchen.lots.eggs.id,
      quantity: 2,
      reason: 'damaged',
    });
    const view = await run['stock.article']({ businessId, articleId: kitchen.articles.eggs.id });
    // 60 − 31 − 2 = 27 eggs.
    expect(view.quantity).toBe(27);
    expect(view.movements).toHaveLength(30);
    expect(view.movements[0]).toMatchObject({ type: 'waste', quantity: -2, reason: 'damaged' });
    expect(view.movements[1]).toMatchObject({
      type: 'consumption',
      quantity: -1,
      valueRappen: -45,
      purpose: 'staff',
      note: 'Personalessen',
    });
  });

  it('finds the article of a lot, also of one that is used up', async () => {
    const { t, run, businessId, kitchen } = await setup();
    const byLot = await run['stock.article']({ businessId, lotId: kitchen.lots.creamNew.id });
    expect(byLot.article.name).toBe('Vollrahm');
    expect(byLot.lots).toHaveLength(2);
    await run['stock.writeOff']({
      commandId: t.cmd(),
      businessId,
      lotId: kitchen.lots.salmon.id,
      quantity: 1500,
      reason: 'expired',
    });
    const gone = await run['stock.article']({ businessId, lotId: kitchen.lots.salmon.id });
    expect(gone.article.name).toBe('Lachsfilet');
    expect(gone.lots).toEqual([]);
    await expect(run['stock.article']({ businessId, lotId: t.cmd() })).rejects.toMatchObject({
      code: 'not_found',
    });
    await expect(run['stock.article']({ businessId })).rejects.toThrow(/article or a lot/);
  });

  it('knows only articles of its own business', async () => {
    const { t, run, businessId, kitchen } = await setup();
    await expect(run['stock.article']({ businessId, articleId: t.cmd() })).rejects.toMatchObject({
      code: 'not_found',
    });
    const other = await createTestContext({ storage: t.storage, idStart: 100_000 });
    await expect(
      run['stock.article']({
        businessId: other.businessId,
        articleId: kitchen.articles.cream.id,
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('stock.receiveDraft', () => {
  it('proposes price, area and shelf life for every article', async () => {
    const { run, businessId, kitchen } = await setup();
    const draft = await run['stock.receiveDraft']({ businessId });
    expect(draft).not.toHaveProperty('order');
    expect(draft.lines).toEqual([]);
    expect(draft.proposals).toHaveLength(10);
    expect(draft.proposals.find((row) => row.articleId === kitchen.articles.entrecote.id)).toEqual({
      articleId: kitchen.articles.entrecote.id,
      name: 'Rindsentrecôte',
      unit: 'g',
      pricePer1000: 6200,
      areaId: kitchen.areas.cold.id,
      shelfLifeDays: 5,
      dateKind: 'use_by',
      supplierId: kitchen.suppliers.butcher.id,
    });
    // No shelf life of its own: the Richtwert of the group of goods (dry goods, 365 days).
    expect(
      draft.proposals.find((row) => row.articleId === kitchen.articles.flour.id),
    ).toMatchObject({ shelfLifeDays: 365, areaId: kitchen.areas.dry.id });
  });

  it('falls back to the area of the group of goods, and leaves out what is not there', async () => {
    const { t, run, businessId, kitchen } = await setup();
    const butter = ArticleSchema.parse({ ...kitchen.articles.butter, areaId: undefined });
    const wine = ArticleSchema.parse({ ...kitchen.articles.redWine, areaId: undefined });
    await t.storage.articles.put(butter);
    await t.storage.articles.put(wine);
    await t.storage.articles.put({ ...kitchen.articles.eggs, active: false });
    await t.storage.articles.put({ ...kitchen.articles.onions, deletedAt: t.clock.now() });
    const { proposals } = await run['stock.receiveDraft']({ businessId });
    expect(proposals).toHaveLength(8);
    // Dairy goes to a cold room; wine to a bar, and this kitchen has none.
    expect(proposals.find((row) => row.articleId === butter.id)?.areaId).toBe(
      kitchen.areas.cold.id,
    );
    expect(proposals.find((row) => row.articleId === wine.id)?.areaId).toBeUndefined();
  });

  it('prefills the lines of an order', async () => {
    const { t, run, businessId, kitchen, today } = await setup();
    const orderId = t.cmd();
    await t.storage.articles.put({ ...kitchen.articles.salmon, active: false });
    await t.storage.articles.put({ ...kitchen.articles.onions, deletedAt: t.clock.now() });
    await t.storage.orders.add(
      PurchaseOrderSchema.parse({
        id: orderId,
        businessId,
        createdAt: t.clock.now(),
        updatedAt: t.clock.now(),
        supplierId: kitchen.suppliers.butcher.id,
        status: 'sent',
        orderedOn: addDays(today, -2),
        expectedOn: today,
        lines: [
          { articleId: kitchen.articles.entrecote.id, quantity: 10_000, pricePer1000: 6400 },
          { articleId: kitchen.articles.salmon.id, quantity: 2000, pricePer1000: 3800 },
          { articleId: kitchen.articles.onions.id, quantity: 5000, pricePer1000: 220 },
        ],
      }),
    );
    const draft = await run['stock.receiveDraft']({ businessId, orderId });
    expect(draft.order).toEqual({
      id: orderId,
      status: 'sent',
      supplierId: kitchen.suppliers.butcher.id,
      supplierName: 'Metzgerei Muster',
      orderedOn: addDays(today, -2),
      expectedOn: today,
    });
    // The deleted article cannot be received; the inactive one on the order still can.
    expect(draft.lines).toEqual([
      { articleId: kitchen.articles.entrecote.id, quantity: 10_000, pricePer1000: 6400 },
      { articleId: kitchen.articles.salmon.id, quantity: 2000, pricePer1000: 3800 },
    ]);
    expect(draft.proposals.map((row) => row.articleId)).toContain(kitchen.articles.salmon.id);
    expect(draft.proposals.map((row) => row.articleId)).not.toContain(kitchen.articles.onions.id);
  });

  it('knows only orders of its own business', async () => {
    const { t, run, businessId } = await setup();
    await expect(run['stock.receiveDraft']({ businessId, orderId: t.cmd() })).rejects.toMatchObject(
      { code: 'not_found' },
    );
    const other = await createTestContext({ storage: t.storage, idStart: 100_000 });
    const draft = await run['stock.receiveDraft']({ businessId: other.businessId });
    expect(draft.proposals).toEqual([]);
  });
});

describe('stock.countSheet', () => {
  it('lists the lots per area, by article, with what is expected', async () => {
    const { run, businessId, kitchen, today } = await setup();
    const sheet = await run['stock.countSheet']({ businessId });
    expect(sheet.lotCount).toBe(10);
    expect(
      sheet.areas.map((group) => [group.area.name, group.lots.map((lot) => lot.articleName)]),
    ).toEqual([
      ['Kühlzelle', ['Butter', 'Eier', 'Lachsfilet', 'Rindsentrecôte', 'Vollrahm', 'Vollrahm']],
      ['Trockenlager', ['Kartoffeln', 'Rotwein zum Kochen', 'Weissmehl', 'Zwiebeln']],
    ]);
    const cold = sheet.areas[0]?.lots ?? [];
    expect(cold[3]).toEqual({
      lotId: kitchen.lots.entrecote.id,
      articleId: kitchen.articles.entrecote.id,
      articleName: 'Rindsentrecôte',
      unit: 'g',
      expected: 4000,
      pricePer1000: 6200,
      expiresOn: addDays(today, 2),
      dateKind: 'use_by',
      spotName: 'Schublade Fleisch',
    });
    // The two lots of cream: the one that is due first comes first.
    expect(cold.slice(4).map((lot) => lot.lotId)).toEqual([
      kitchen.lots.creamOld.id,
      kitchen.lots.creamNew.id,
    ]);
    const flour = sheet.areas[1]?.lots[2];
    expect(flour).toMatchObject({ spotName: 'Regal 1, oben', expected: 3000 });
    expect(flour).not.toHaveProperty('expiresOn');
  });

  it('counts one area alone, and knows only areas of its own business', async () => {
    const { t, run, businessId, kitchen } = await setup();
    const dry = await run['stock.countSheet']({ businessId, areaId: kitchen.areas.dry.id });
    expect(dry.areas.map((group) => group.area.name)).toEqual(['Trockenlager']);
    expect(dry.lotCount).toBe(4);
    const frozen = await run['stock.countSheet']({ businessId, areaId: kitchen.areas.frozen.id });
    expect(frozen).toEqual({ areas: [], lotCount: 0 });
    await expect(run['stock.countSheet']({ businessId, areaId: t.cmd() })).rejects.toMatchObject({
      code: 'not_found',
    });
    const other = await createTestContext({ storage: t.storage, idStart: 100_000 });
    expect(await run['stock.countSheet']({ businessId: other.businessId })).toEqual({
      areas: [],
      lotCount: 0,
    });
  });
});

describe('stock.journal', () => {
  /** The seeded receipts, then three bookings of today: a withdrawal, a write-off, a count. */
  async function withBookings() {
    const s = await setup();
    const { t, run, businessId, kitchen, today } = s;
    await run['stock.withdraw']({
      commandId: t.cmd(),
      businessId,
      articleId: kitchen.articles.butter.id,
      quantity: 250,
      purpose: 'kitchen',
      note: 'Für den Apéro',
    });
    await run['stock.writeOff']({
      commandId: t.cmd(),
      businessId,
      lotId: kitchen.lots.salmon.id,
      quantity: 500,
      reason: 'spoiled',
    });
    const counted = await run['stock.count']({
      commandId: t.cmd(),
      businessId,
      countedOn: today,
      lines: [{ lotId: kitchen.lots.eggs.id, counted: 54 }],
    });
    return { ...s, countId: counted.countId };
  }

  it('lists the movements newest first with names, and sums them per type', async () => {
    const { run, businessId, kitchen, today, countId } = await withBookings();
    const { movements, total, sums } = await run['stock.journal']({ businessId });
    expect(total).toBe(13);
    expect(movements).toHaveLength(13);
    expect(movements.slice(0, 3)).toEqual([
      expect.objectContaining({
        type: 'adjustment',
        articleName: 'Eier',
        unit: 'pcs',
        quantity: -6,
        valueRappen: -270,
        on: today,
        who: 'Testperson',
        countId,
        lotOrigin: 'purchase',
      }),
      expect.objectContaining({
        type: 'waste',
        articleName: 'Lachsfilet',
        quantity: -500,
        valueRappen: -1900,
        reason: 'spoiled',
      }),
      expect.objectContaining({
        type: 'consumption',
        articleName: 'Butter',
        quantity: -250,
        // 250 g × 14.00 / kg = 3.50
        valueRappen: -350,
        purpose: 'kitchen',
        note: 'Für den Apéro',
      }),
    ]);
    // The receipts of the day before follow, the one booked last first.
    expect(movements[3]).toMatchObject({
      type: 'receipt',
      articleId: kitchen.articles.redWine.id,
      on: addDays(today, -1),
    });
    expect(sums).toEqual([
      { type: 'receipt', count: 10, valueRappen: 53_700 },
      { type: 'production', count: 0, valueRappen: 0 },
      { type: 'consumption', count: 1, valueRappen: -350 },
      { type: 'waste', count: 1, valueRappen: -1900 },
      { type: 'adjustment', count: 1, valueRappen: -270 },
    ]);
  });

  it('narrows by period, type and article; the sums of the period stay', async () => {
    const { run, businessId, kitchen, today } = await withBookings();
    const todayOnly = await run['stock.journal']({ businessId, from: today, to: today });
    expect(todayOnly.movements.map((movement) => movement.type)).toEqual([
      'adjustment',
      'waste',
      'consumption',
    ]);
    expect(todayOnly.sums.find((sum) => sum.type === 'receipt')).toEqual({
      type: 'receipt',
      count: 0,
      valueRappen: 0,
    });
    const before = await run['stock.journal']({ businessId, to: addDays(today, -1) });
    expect(before.total).toBe(10);
    const waste = await run['stock.journal']({ businessId, type: 'waste' });
    expect(waste.movements.map((movement) => movement.articleName)).toEqual(['Lachsfilet']);
    expect(waste.total).toBe(1);
    expect(waste.sums.find((sum) => sum.type === 'receipt')?.count).toBe(10);
    const salmon = await run['stock.journal']({
      businessId,
      articleId: kitchen.articles.salmon.id,
    });
    expect(salmon.movements.map((movement) => movement.type)).toEqual(['waste', 'receipt']);
    // 57.00 received, 19.00 written off.
    expect(salmon.sums.filter((sum) => sum.count > 0)).toEqual([
      { type: 'receipt', count: 1, valueRappen: 5700 },
      { type: 'waste', count: 1, valueRappen: -1900 },
    ]);
    const nothing = await run['stock.journal']({
      businessId,
      from: addDays(today, 1),
      to: addDays(today, -1),
    });
    expect(nothing.movements).toEqual([]);
  });

  it('cuts a long list at the limit and says how many there are', async () => {
    const { run, businessId } = await withBookings();
    const { movements, total } = await run['stock.journal']({ businessId, limit: 2 });
    expect(movements.map((movement) => movement.type)).toEqual(['adjustment', 'waste']);
    expect(total).toBe(13);
    await expect(run['stock.journal']({ businessId, limit: 0 })).rejects.toThrow();
  });

  it('keeps the name of an article that was deleted since, and shows nothing of others', async () => {
    const { t, run, businessId, kitchen } = await withBookings();
    await t.storage.articles.put({ ...kitchen.articles.salmon, deletedAt: t.clock.now() });
    const waste = await run['stock.journal']({ businessId, type: 'waste' });
    expect(waste.movements[0]?.articleName).toBe('Lachsfilet');
    const other = await createTestContext({ storage: t.storage, idStart: 100_000 });
    const empty = await run['stock.journal']({ businessId: other.businessId });
    expect(empty.movements).toEqual([]);
    expect(empty.total).toBe(0);
    expect(empty.sums.every((sum) => sum.count === 0 && sum.valueRappen === 0)).toBe(true);
    const unknownArticle: Id = t.cmd();
    expect((await run['stock.journal']({ businessId, articleId: unknownArticle })).total).toBe(0);
  });
});
