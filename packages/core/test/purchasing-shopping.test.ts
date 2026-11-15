import { describe, expect, it } from 'vitest';
import {
  addDays,
  alive,
  rappen,
  SupplierSchema,
  type ArticleCategoryId,
  type DomainEvent,
  type Id,
  type LocalDate,
  type ShoppingItem,
} from '../src';
import { createTestContext, seedKitchen } from '../src/testing';

async function setup(options: { ordering?: boolean } = {}) {
  const t = await createTestContext();
  const kitchen = await seedKitchen(t);
  const s = { t, kitchen, today: t.clock.today(), run: t.useCases, businessId: t.businessId };
  if (options.ordering === false) {
    // A kitchen that fetches its goods itself and orders nothing ahead (ADR-0015).
    await t.useCases['business.update']({
      commandId: t.cmd(),
      businessId: t.businessId,
      modules: ['market'],
    });
  }
  return s;
}

type Setup = Awaited<ReturnType<typeof setup>>;

/** A market with the walk through its halls: dry goods first, then the dairy. */
async function addMarket(s: Setup, name = 'Markt Nord', categoryOrder?: ArticleCategoryId[]) {
  const now = s.t.clock.now();
  const id = s.t.cmd();
  await s.t.storage.suppliers.add(
    SupplierSchema.parse({
      id,
      businessId: s.businessId,
      createdAt: now,
      updatedAt: now,
      name,
      kind: 'market',
      customerNumber: '7001 2233',
      orderDays: [],
      deliveryDays: [],
      ...(categoryOrder === undefined ? {} : { categoryOrder }),
    }),
  );
  return id;
}

async function list(s: Setup, marketId?: Id) {
  return s.run['shopping.list']({
    businessId: s.businessId,
    ...(marketId === undefined ? {} : { marketId }),
  });
}

const items = (result: Awaited<ReturnType<typeof list>>): ShoppingItem[] =>
  result.groups.flatMap((group) => group.items);

async function eventsOf(s: Setup, type: string): Promise<DomainEvent[]> {
  return (await s.t.storage.events.ofBusiness(s.businessId)).filter((event) => event.type === type);
}

/** A purchase at a market through the module itself. */
async function purchase(
  s: Setup,
  supplierId: Id,
  receivedOn: LocalDate,
  lines: { articleId: Id; quantity: number; lineTotalRappen: number; promo?: boolean }[],
) {
  return s.run['shopping.record']({
    commandId: s.t.cmd(),
    businessId: s.businessId,
    supplierId,
    receivedOn,
    lines: lines.map((line) => ({
      ...line,
      lineTotalRappen: rappen(line.lineTotalRappen),
      areaId: s.kitchen.areas.cold.id,
    })),
  });
}

describe('shopping.list', () => {
  it('lists what fell under «Nachkaufen ab», in the walk through the market', async () => {
    const s = await setup({ ordering: false });
    const market = await addMarket(s, 'Markt Nord', ['dry', 'dairy']);
    await s.run['shopping.add']({
      commandId: s.t.cmd(),
      businessId: s.businessId,
      articleId: s.kitchen.articles.butter.id,
      quantity: 1000,
    });
    await s.run['shopping.add']({
      commandId: s.t.cmd(),
      businessId: s.businessId,
      text: 'Servietten',
    });
    await s.run['shopping.markMissing']({
      commandId: s.t.cmd(),
      businessId: s.businessId,
      articleId: s.kitchen.articles.eggs.id,
    });
    const result = await list(s);
    // One market: it is the one whose walk orders the list.
    expect(result.marketId).toBe(market);
    expect(result.markets).toEqual([
      { id: market, name: 'Markt Nord', customerNumber: '7001 2233' },
    ]);
    // Dry goods and dairy first (the walk), then the usual order, free text last.
    expect(result.groups.map((group) => group.categoryId)).toEqual([
      'dry',
      'dairy',
      'eggs',
      undefined,
    ]);
    const [flour, butter, eggs, napkins] = items(result);
    // Flour belongs to the wholesaler, but this kitchen orders nothing ahead: it fetches it.
    expect(flour).toMatchObject({
      key: `article:${s.kitchen.articles.flour.id}`,
      name: 'Weissmehl',
      quantity: 20_000,
      packs: { count: 2, size: 10_000, label: 'Sack' },
      reasons: ['below_min'],
      stock: 3000,
      minStock: 5000,
      checked: false,
      removable: false,
    });
    expect(butter).toMatchObject({ name: 'Butter', quantity: 1000, reasons: ['manual'] });
    expect(eggs).toMatchObject({ name: 'Eier', reasons: ['missing'], removable: true });
    expect(eggs?.quantity).toBeUndefined();
    expect(napkins).toMatchObject({ name: 'Servietten', reasons: ['manual'], lastPrices: [] });
    expect(napkins?.categoryId).toBeUndefined();
    expect(result).toMatchObject({ count: 4, checkedCount: 0, otherMarkets: [] });
  });

  it('leaves goods of a delivering supplier to the order proposal while the kitchen orders', async () => {
    const s = await setup();
    await addMarket(s);
    expect(items(await list(s))).toEqual([]);
    // Flour moves to the market: from now on it is fetched there.
    const market = (await list(s)).marketId;
    await s.t.storage.articles.put({ ...s.kitchen.articles.flour, supplierId: market });
    expect(items(await list(s))).toEqual([
      expect.objectContaining({ name: 'Weissmehl', supplierId: market }),
    ]);
  });

  it('keeps one line per article and per text', async () => {
    const s = await setup({ ordering: false });
    const add = (input: { articleId?: Id; text?: string; quantity?: number }) =>
      s.run['shopping.add']({ commandId: s.t.cmd(), businessId: s.businessId, ...input });
    const first = await add({ articleId: s.kitchen.articles.butter.id, quantity: 1000 });
    expect(first.merged).toBe(false);
    expect(await add({ articleId: s.kitchen.articles.butter.id, quantity: 2000 })).toEqual({
      lineId: first.lineId,
      merged: true,
    });
    expect(await add({ articleId: s.kitchen.articles.butter.id })).toMatchObject({ merged: true });
    const missing = await s.run['shopping.markMissing']({
      commandId: s.t.cmd(),
      businessId: s.businessId,
      articleId: s.kitchen.articles.butter.id,
    });
    expect(missing).toEqual({ lineId: first.lineId, merged: true });
    const text = await add({ text: 'Servietten' });
    expect(await add({ text: 'servietten' })).toEqual({ lineId: text.lineId, merged: true });
    const lines = alive(await s.t.storage.shoppingLines.ofBusiness(s.businessId));
    expect(lines).toHaveLength(2);
    expect(lines.find((line) => line.id === first.lineId)).toMatchObject({
      quantity: 2000,
      source: 'manual',
    });
    // Once per command.
    const commandId = s.t.cmd();
    const once = await s.run['shopping.add']({
      commandId,
      businessId: s.businessId,
      text: 'Alufolie',
    });
    expect(
      await s.run['shopping.add']({ commandId, businessId: s.businessId, text: 'Alufolie' }),
    ).toEqual(once);
    expect(alive(await s.t.storage.shoppingLines.ofBusiness(s.businessId))).toHaveLength(3);
    expect((await eventsOf(s, 'shopping_line.added')).length).toBeGreaterThanOrEqual(6);
  });

  it('refuses an unknown article or market, and needs an article or a text', async () => {
    const s = await setup();
    await expect(
      s.run['shopping.add']({
        commandId: s.t.cmd(),
        businessId: s.businessId,
        articleId: s.t.cmd(),
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
    await expect(
      s.run['shopping.add']({
        commandId: s.t.cmd(),
        businessId: s.businessId,
        text: 'Servietten',
        supplierId: s.t.cmd(),
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
    await expect(
      s.run['shopping.add']({ commandId: s.t.cmd(), businessId: s.businessId }),
    ).rejects.toThrow();
    await expect(
      s.run['shopping.markMissing']({
        commandId: s.t.cmd(),
        businessId: s.businessId,
        articleId: s.kitchen.articles.eggs.id,
        supplierId: s.t.cmd(),
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('ticks a line of the proposal and keeps it, and opens it again', async () => {
    const s = await setup({ ordering: false });
    const { flour } = s.kitchen.articles;
    const commandId = s.t.cmd();
    const input = {
      commandId,
      businessId: s.businessId,
      articleId: flour.id,
      quantity: 20_000,
      checked: true,
    };
    const ticked = await s.run['shopping.check'](input);
    expect(ticked.checked).toBe(true);
    expect(await s.run['shopping.check'](input)).toEqual(ticked);
    const result = await list(s);
    expect(result.checkedCount).toBe(1);
    expect(items(result)[0]).toMatchObject({
      key: ticked.lineId,
      lineId: ticked.lineId,
      checked: true,
      reasons: ['below_min'],
      quantity: 20_000,
      removable: true,
    });
    // Ticking it again changes nothing.
    expect(
      await s.run['shopping.check']({ ...input, commandId: s.t.cmd(), lineId: undefined }),
    ).toEqual(ticked);
    // Opened again, the line is the live proposal once more.
    expect(
      await s.run['shopping.check']({
        commandId: s.t.cmd(),
        businessId: s.businessId,
        lineId: ticked.lineId,
        checked: false,
      }),
    ).toEqual({ checked: false });
    expect(items(await list(s))[0]).toMatchObject({
      key: `article:${flour.id}`,
      checked: false,
      removable: false,
    });
    // Opening a line that is not stored is harmless.
    expect(
      await s.run['shopping.check']({
        commandId: s.t.cmd(),
        businessId: s.businessId,
        articleId: flour.id,
        checked: false,
      }),
    ).toEqual({ checked: false });
    expect(
      (await eventsOf(s, 'shopping_line.checked')).map((event) => event.payload.checked),
    ).toEqual([true, false]);
  });

  it('ticks and removes stored lines', async () => {
    const s = await setup();
    const { lineId } = await s.run['shopping.add']({
      commandId: s.t.cmd(),
      businessId: s.businessId,
      text: 'Servietten',
    });
    const check = (checked: boolean) =>
      s.run['shopping.check']({ commandId: s.t.cmd(), businessId: s.businessId, lineId, checked });
    expect(await check(true)).toEqual({ lineId, checked: true });
    expect(await check(false)).toEqual({ lineId, checked: false });
    expect(await check(false)).toEqual({ lineId, checked: false });
    const commandId = s.t.cmd();
    expect(await s.run['shopping.remove']({ commandId, businessId: s.businessId, lineId })).toEqual(
      {
        lineId,
      },
    );
    expect(await s.run['shopping.remove']({ commandId, businessId: s.businessId, lineId })).toEqual(
      {
        lineId,
      },
    );
    expect(items(await list(s))).toEqual([]);
    await expect(check(true)).rejects.toMatchObject({ code: 'not_found' });
    expect(await eventsOf(s, 'shopping_line.removed')).toHaveLength(1);
  });

  it('shows lines for another market apart, and the last regular price per market', async () => {
    const s = await setup({ ordering: false });
    const north = await addMarket(s, 'Markt Nord');
    const south = await addMarket(s, 'Markt Süd');
    const { butter, cream } = s.kitchen.articles;
    // Butter: CHF 29.00 for 2 kg in the north three days ago, CHF 27.00 in the south yesterday,
    // and on offer in the north today, which does not count.
    await purchase(s, north, addDays(s.today, -3), [
      { articleId: butter.id, quantity: 2000, lineTotalRappen: 2900 },
    ]);
    await purchase(s, south, addDays(s.today, -1), [
      { articleId: butter.id, quantity: 2000, lineTotalRappen: 2700 },
    ]);
    await purchase(s, north, s.today, [
      { articleId: butter.id, quantity: 2000, lineTotalRappen: 2000, promo: true },
    ]);
    await s.run['shopping.add']({
      commandId: s.t.cmd(),
      businessId: s.businessId,
      articleId: butter.id,
    });
    await s.run['shopping.add']({
      commandId: s.t.cmd(),
      businessId: s.businessId,
      articleId: cream.id,
      supplierId: south,
    });
    // Two markets and none chosen: everything, in the usual order.
    const both = await list(s);
    expect(both.marketId).toBeUndefined();
    expect(items(both).map((item) => item.name)).toEqual(['Butter', 'Vollrahm', 'Weissmehl']);
    // In the north: the cream is meant for the south.
    const result = await list(s, north);
    expect(result.marketId).toBe(north);
    expect(items(result).map((item) => item.name)).toEqual(['Butter', 'Weissmehl']);
    expect(result.otherMarkets).toEqual([{ id: south, name: 'Markt Süd', count: 1 }]);
    const shown = items(result).find((item) => item.name === 'Butter');
    // The chosen market first, then the newest elsewhere.
    expect(shown?.lastPrices).toEqual([
      { supplierId: north, supplierName: 'Markt Nord', pricePer1000: 1450, on: '2026-11-11' },
      { supplierId: south, supplierName: 'Markt Süd', pricePer1000: 1350, on: '2026-11-13' },
    ]);
    // An address with a market that is none: as if none was chosen.
    expect((await list(s, s.kitchen.suppliers.butcher.id)).marketId).toBeUndefined();
  });
});

describe('shopping.draft and shopping.record', () => {
  it('drafts a purchase from the ticked lines with the last price at the market', async () => {
    const s = await setup({ ordering: false });
    const market = await addMarket(s);
    const { flour, butter } = s.kitchen.articles;
    await purchase(s, market, addDays(s.today, -2), [
      { articleId: butter.id, quantity: 2000, lineTotalRappen: 2900 },
    ]);
    await s.run['shopping.check']({
      commandId: s.t.cmd(),
      businessId: s.businessId,
      articleId: flour.id,
      quantity: 20_000,
      checked: true,
    });
    const napkins = await s.run['shopping.add']({
      commandId: s.t.cmd(),
      businessId: s.businessId,
      text: 'Servietten',
    });
    await s.run['shopping.check']({
      commandId: s.t.cmd(),
      businessId: s.businessId,
      lineId: napkins.lineId,
      checked: true,
    });
    // Not ticked: not in the draft.
    await s.run['shopping.add']({
      commandId: s.t.cmd(),
      businessId: s.businessId,
      text: 'Alufolie',
    });
    const draft = await s.run['shopping.draft']({ businessId: s.businessId });
    expect(draft.market).toMatchObject({ id: market, name: 'Markt Nord' });
    expect(draft.lines).toEqual([
      expect.objectContaining({
        articleId: flour.id,
        quantity: 20_000,
        packs: { count: 2, size: 10_000, label: 'Sack' },
      }),
    ]);
    expect(draft.freeText).toEqual([{ lineId: napkins.lineId, text: 'Servietten' }]);
    const facts = new Map(draft.articles.map((article) => [article.articleId, article]));
    // Butter at the last price in this market; flour at its article price.
    expect(facts.get(butter.id)).toMatchObject({
      pricePer1000: 1450,
      areaId: s.kitchen.areas.cold.id,
      dateKind: 'best_before',
    });
    expect(facts.get(flour.id)).toMatchObject({
      pricePer1000: 160,
      areaId: s.kitchen.areas.dry.id,
      packSize: 10_000,
      packLabel: 'Sack',
    });
    // Salmon has a use-by date: the purchase asks for it.
    expect(facts.get(s.kitchen.articles.salmon.id)).toMatchObject({
      dateKind: 'use_by',
      shelfLifeDays: 3,
    });
    // Made in house: not bought.
    expect(facts.has(s.kitchen.articles.jus.id)).toBe(false);
  });

  it('books a receipt that adds up: packs, offers, deposit and private amounts', async () => {
    const s = await setup({ ordering: false });
    const market = await addMarket(s);
    const { potatoes, butter, salmon } = s.kitchen.articles;
    const { lineId } = await s.run['shopping.add']({
      commandId: s.t.cmd(),
      businessId: s.businessId,
      articleId: butter.id,
    });
    const commandId = s.t.cmd();
    const input = {
      commandId,
      businessId: s.businessId,
      supplierId: market,
      receivedOn: s.today,
      documentNumber: 'B-1234',
      // 77.80 + 20.00 + 42.00 + 3.00 + 12.50 - 1.00 = 154.30
      documentTotalRappen: rappen(15_430),
      otherAmounts: [
        { kind: 'deposit' as const, amountRappen: rappen(300) },
        { kind: 'private' as const, amountRappen: rappen(1250), note: 'Kaffee für zuhause' },
        { kind: 'discount' as const, amountRappen: rappen(-100) },
      ],
      lines: [
        // «2 Kolli à 6 × 2.5 kg, CHF 38.90 pro Kolli»: 30 kg for CHF 77.80, CHF 2.59/kg.
        {
          articleId: potatoes.id,
          quantity: 30_000,
          lineTotalRappen: rappen(7780),
          packs: 2,
          areaId: s.kitchen.areas.dry.id,
        },
        // On offer: CHF 10.00/kg, while costing keeps CHF 14.00/kg.
        {
          articleId: butter.id,
          quantity: 2000,
          lineTotalRappen: rappen(2000),
          promo: true,
          areaId: s.kitchen.areas.cold.id,
        },
        {
          articleId: salmon.id,
          quantity: 1000,
          lineTotalRappen: rappen(4200),
          expiresOn: addDays(s.today, 2),
          areaId: s.kitchen.areas.cold.id,
        },
      ],
      tempDeciC: 40,
      shoppingLineIds: [lineId],
    };
    const result = await s.run['shopping.record'](input);
    // The stock takes 30 kg at CHF 2.59/kg = 77.70 (the price is kept in whole Rappen per kg),
    // 20.00 and 42.00.
    expect(result).toMatchObject({
      totalRappen: 13_970,
      linesRappen: 13_980,
      otherRappen: 1450,
      unassignedRappen: 0,
    });
    expect(result.lotIds).toHaveLength(3);
    expect(await s.run['shopping.record'](input)).toEqual(result);
    const [delivery] = await s.t.storage.deliveries.ofBusiness(s.businessId);
    expect(delivery).toMatchObject({
      supplierId: market,
      documentNumber: 'B-1234',
      documentTotalRappen: 15_430,
      checkOk: true,
      tempDeciC: 40,
      totalRappen: 13_970,
    });
    expect(delivery?.otherAmounts).toHaveLength(3);
    expect(delivery?.lines.map((line) => [line.pricePer1000, line.packs, line.promo])).toEqual([
      [259, 2, undefined],
      [1000, undefined, true],
      [4200, undefined, undefined],
    ]);
    // Only the goods reach the stock and the cost of goods: no deposit, nothing private.
    const receipts = (await s.t.storage.movements.ofBusiness(s.businessId)).filter(
      (movement) => movement.on === s.today && movement.type === 'receipt',
    );
    expect(receipts.reduce((sum, movement) => sum + movement.valueRappen, 0)).toBe(13_970);
    // The offer is not the price for costing; the others are.
    expect((await s.t.storage.articles.get(butter.id))?.pricePer1000).toBe(1400);
    expect((await s.t.storage.articles.get(potatoes.id))?.pricePer1000).toBe(259);
    expect((await s.t.storage.articles.get(salmon.id))?.pricePer1000).toBe(4200);
    // The temperature at pick-up is a record of the self-control.
    const logs = await s.t.storage.temperatureLogs.ofBusiness(s.businessId);
    expect(logs).toEqual([
      expect.objectContaining({ kind: 'receiving', label: 'Markt Nord', deciC: 40 }),
    ]);
    // The ticked line is settled and leaves the list.
    expect(await s.t.storage.shoppingLines.get(lineId)).toMatchObject({
      deliveryId: result.deliveryId,
      checked: true,
    });
    expect(items(await list(s)).map((item) => item.name)).toEqual(['Weissmehl']);
    const events = await eventsOf(s, 'delivery.received');
    expect(events).toHaveLength(1);
    expect(events[0]?.payload).toMatchObject({
      deliveryId: result.deliveryId,
      supplierId: market,
      purchase: true,
      unassignedRappen: 0,
      shoppingLineIds: [lineId],
    });
  });

  it('says what is not assigned yet, and books without a market or a total', async () => {
    const s = await setup({ ordering: false });
    const { eggs } = s.kitchen.articles;
    const base = {
      businessId: s.businessId,
      receivedOn: s.today,
      lines: [
        {
          articleId: eggs.id,
          quantity: 30,
          lineTotalRappen: rappen(1290),
          areaId: s.kitchen.areas.cold.id,
        },
      ],
    };
    const short = await s.run['shopping.record']({
      ...base,
      commandId: s.t.cmd(),
      documentTotalRappen: rappen(1710),
    });
    // CHF 17.10 on the receipt, CHF 12.90 assigned: CHF 4.20 open.
    expect(short.unassignedRappen).toBe(420);
    const plain = await s.run['shopping.record']({ ...base, commandId: s.t.cmd() });
    expect(plain.unassignedRappen).toBeUndefined();
    const delivery = await s.t.storage.deliveries.get(plain.deliveryId);
    expect(delivery?.supplierId).toBeUndefined();
    expect(delivery?.otherAmounts).toBeUndefined();
  });

  it('refuses a day in the future, an unknown area and an impossible price, and writes nothing', async () => {
    const s = await setup();
    const market = await addMarket(s);
    const line = {
      articleId: s.kitchen.articles.eggs.id,
      quantity: 30,
      lineTotalRappen: rappen(1290),
      areaId: s.kitchen.areas.cold.id,
    };
    const record = (patch: object, lines = [line]) =>
      s.run['shopping.record']({
        commandId: s.t.cmd(),
        businessId: s.businessId,
        supplierId: market,
        receivedOn: s.today,
        lines,
        ...patch,
      });
    await expect(record({ receivedOn: addDays(s.today, 1) })).rejects.toMatchObject({
      code: 'invalid',
    });
    await expect(record({ supplierId: s.t.cmd() })).rejects.toMatchObject({ code: 'not_found' });
    await expect(record({}, [{ ...line, areaId: s.t.cmd() }])).rejects.toMatchObject({
      code: 'not_found',
    });
    await expect(
      record({}, [{ ...line, quantity: 0.001, lineTotalRappen: rappen(100_000_000_000) }]),
    ).rejects.toMatchObject({ code: 'invalid' });
    expect(await s.t.storage.deliveries.ofBusiness(s.businessId)).toEqual([]);
  });

  it('shows another business nothing', async () => {
    const s = await setup();
    const { lineId } = await s.run['shopping.add']({
      commandId: s.t.cmd(),
      businessId: s.businessId,
      text: 'Servietten',
    });
    const other = await createTestContext({ storage: s.t.storage, idStart: 10_000 });
    const result = await other.useCases['shopping.list']({ businessId: other.businessId });
    expect(result.groups).toEqual([]);
    await expect(
      other.useCases['shopping.remove']({
        commandId: other.cmd(),
        businessId: other.businessId,
        lineId,
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
    const draft = await other.useCases['shopping.draft']({ businessId: other.businessId });
    expect(draft).toMatchObject({ lines: [], freeText: [], articles: [], markets: [] });
  });
});
