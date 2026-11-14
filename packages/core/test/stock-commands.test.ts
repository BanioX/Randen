import { describe, expect, it } from 'vitest';
import {
  addDays,
  alive,
  lineValue,
  PurchaseOrderSchema,
  roundQuantity,
  type DomainEvent,
  type Id,
} from '../src';
import { createTestContext, seedKitchen, type TestContext } from '../src/testing';

async function setup() {
  const t = await createTestContext();
  const kitchen = await seedKitchen(t);
  return { t, kitchen, today: t.clock.today(), run: t.useCases, businessId: t.businessId };
}

/** For every article: the lots add up to the ledger, in quantity and in value (ADR-0007). */
async function expectLedgerBalanced(t: TestContext) {
  const lots = alive(await t.storage.lots.ofBusiness(t.businessId));
  const movements = await t.storage.movements.ofBusiness(t.businessId);
  const articleIds = new Set<Id>([...lots, ...movements].map((row) => row.articleId));
  for (const articleId of articleIds) {
    const ofArticle = lots.filter((lot) => lot.articleId === articleId);
    const moved = movements.filter((movement) => movement.articleId === articleId);
    expect(roundQuantity(ofArticle.reduce((sum, lot) => sum + lot.quantity, 0))).toBe(
      roundQuantity(moved.reduce((sum, movement) => sum + movement.quantity, 0)),
    );
    expect(ofArticle.reduce((sum, lot) => sum + lineValue(lot.quantity, lot.pricePer1000), 0)).toBe(
      moved.reduce((sum, movement) => sum + movement.valueRappen, 0),
    );
  }
}

/** How much is written down: a repeated command must leave all of it alone. */
async function sizes(t: TestContext) {
  const [lots, movements, events, deliveries, counts, logs] = await Promise.all([
    t.storage.lots.ofBusiness(t.businessId),
    t.storage.movements.ofBusiness(t.businessId),
    t.storage.events.ofBusiness(t.businessId),
    t.storage.deliveries.ofBusiness(t.businessId),
    t.storage.counts.ofBusiness(t.businessId),
    t.storage.temperatureLogs.ofBusiness(t.businessId),
  ]);
  return {
    lots: lots.length,
    movements: movements.length,
    events: events.length,
    deliveries: deliveries.length,
    counts: counts.length,
    logs: logs.length,
    stock: roundQuantity(lots.reduce((sum, lot) => sum + lot.quantity, 0)),
  };
}

/** The id at a position of a result, or a failed test if it is not there. */
function at(ids: readonly Id[], index: number): Id {
  const id = ids[index];
  if (id === undefined) {
    throw new Error(`No id at position ${String(index)}`);
  }
  return id;
}

async function eventsOf(t: TestContext, type: string): Promise<DomainEvent[]> {
  return (await t.storage.events.ofBusiness(t.businessId)).filter((event) => event.type === type);
}

async function addOrder(
  s: Awaited<ReturnType<typeof setup>>,
  status: 'draft' | 'sent' | 'received' | 'cancelled' = 'sent',
) {
  const id = s.t.cmd();
  await s.t.storage.orders.add(
    PurchaseOrderSchema.parse({
      id,
      businessId: s.businessId,
      createdAt: s.t.clock.now(),
      updatedAt: s.t.clock.now(),
      supplierId: s.kitchen.suppliers.butcher.id,
      status,
      lines: [{ articleId: s.kitchen.articles.entrecote.id, quantity: 10_000, pricePer1000: 6400 }],
    }),
  );
  return id;
}

describe('stock.receive', () => {
  it('stores CHF 64.00 / kg for 10 kg Entrecôte received at CHF 640.00 for the line', async () => {
    const { t, run, businessId, kitchen, today } = await setup();
    const result = await run['stock.receive']({
      commandId: t.cmd(),
      businessId,
      supplierId: kitchen.suppliers.butcher.id,
      receivedOn: today,
      checkOk: true,
      lines: [
        {
          articleId: kitchen.articles.entrecote.id,
          quantity: 10_000,
          lineTotalRappen: 64_000,
          expiresOn: addDays(today, 5),
          areaId: kitchen.areas.cold.id,
        },
      ],
    });
    // 64 000 Rappen for 10 000 g: 64 000 × 1000 ÷ 10 000 = 6400 Rappen per kg.
    expect(result.totalRappen).toBe(64_000);
    expect(result.lotIds).toHaveLength(1);
    const lot = await t.storage.lots.get(at(result.lotIds, 0));
    expect(lot).toMatchObject({
      articleId: kitchen.articles.entrecote.id,
      areaId: kitchen.areas.cold.id,
      quantity: 10_000,
      initialQuantity: 10_000,
      pricePer1000: 6400,
      receivedOn: today,
      expiresOn: addDays(today, 5),
      dateKind: 'use_by',
      supplierId: kitchen.suppliers.butcher.id,
      deliveryId: result.deliveryId,
      origin: 'purchase',
      status: 'active',
    });
    // The last price moves from CHF 62.00 to CHF 64.00 / kg on the article.
    expect((await t.storage.articles.get(kitchen.articles.entrecote.id))?.pricePer1000).toBe(6400);
    const receipt = (await t.storage.movements.ofBusiness(businessId)).find(
      (movement) => movement.lotId === lot?.id,
    );
    expect(receipt).toMatchObject({
      type: 'receipt',
      quantity: 10_000,
      valueRappen: 64_000,
      on: today,
      actor: t.actor,
      deliveryId: result.deliveryId,
    });
    await expectLedgerBalanced(t);
  });

  it('books one delivery with a lot per line, each priced its own way', async () => {
    const { t, run, businessId, kitchen, today } = await setup();
    const yesterday = addDays(today, -1);
    const result = await run['stock.receive']({
      commandId: t.cmd(),
      businessId,
      supplierId: kitchen.suppliers.wholesaler.id,
      receivedOn: yesterday,
      documentNumber: ' LS-1042 ',
      tempDeciC: 35,
      checkOk: true,
      note: 'Kartons trocken und sauber.',
      lines: [
        // A price per unit: 5 l × 6.50 = 32.50.
        {
          articleId: kitchen.articles.cream.id,
          quantity: 5000,
          pricePer1000: 650,
          expiresOn: addDays(today, 9),
          lotCode: 'L-77',
          areaId: kitchen.areas.cold.id,
        },
        // No price: the last one, 1 kg × 14.00 = 14.00.
        { articleId: kitchen.articles.butter.id, quantity: 1000, areaId: kitchen.areas.cold.id },
        // The amount of the line: 30 eggs for 15.00 are 0.50 a piece.
        {
          articleId: kitchen.articles.eggs.id,
          quantity: 30,
          lineTotalRappen: 1500,
          areaId: kitchen.areas.frozen.id,
        },
      ],
    });
    // 32.50 + 14.00 + 15.00 = 61.50
    expect(result.totalRappen).toBe(6150);
    expect(result.lotIds).toHaveLength(3);
    const delivery = await t.storage.deliveries.get(result.deliveryId);
    expect(delivery).toMatchObject({
      businessId,
      supplierId: kitchen.suppliers.wholesaler.id,
      receivedOn: yesterday,
      documentNumber: 'LS-1042',
      totalRappen: 6150,
      tempDeciC: 35,
      checkOk: true,
      note: 'Kartons trocken und sauber.',
      receivedBy: t.actor,
    });
    expect(delivery).not.toHaveProperty('orderId');
    expect(delivery?.lines).toEqual([
      {
        articleId: kitchen.articles.cream.id,
        lotId: result.lotIds[0],
        areaId: kitchen.areas.cold.id,
        quantity: 5000,
        pricePer1000: 650,
        valueRappen: 3250,
        expiresOn: addDays(today, 9),
        lotCode: 'L-77',
      },
      {
        articleId: kitchen.articles.butter.id,
        lotId: result.lotIds[1],
        areaId: kitchen.areas.cold.id,
        quantity: 1000,
        pricePer1000: 1400,
        valueRappen: 1400,
      },
      {
        articleId: kitchen.articles.eggs.id,
        lotId: result.lotIds[2],
        areaId: kitchen.areas.frozen.id,
        quantity: 30,
        pricePer1000: 50_000,
        valueRappen: 1500,
      },
    ]);
    const eggs = await t.storage.lots.get(at(result.lotIds, 2));
    expect(eggs).toMatchObject({ dateKind: 'best_before', areaId: kitchen.areas.frozen.id });
    expect(eggs).not.toHaveProperty('expiresOn');
    expect((await t.storage.articles.get(kitchen.articles.cream.id))?.pricePer1000).toBe(650);
    expect((await t.storage.articles.get(kitchen.articles.eggs.id))?.pricePer1000).toBe(50_000);
    // The check at the door becomes a record of the self-control.
    const logs = await t.storage.temperatureLogs.ofBusiness(businessId);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      kind: 'receiving',
      label: 'Grosshandel Beispiel',
      deciC: 35,
      ok: true,
      on: yesterday,
      measuredBy: t.actor,
    });
    expect(logs[0]).not.toHaveProperty('action');
    const events = await eventsOf(t, 'delivery.received');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      actor: t.actor,
      payload: {
        deliveryId: result.deliveryId,
        supplierId: kitchen.suppliers.wholesaler.id,
        lotIds: result.lotIds,
        totalRappen: 6150,
        checkOk: true,
      },
    });
    await expectLedgerBalanced(t);
  });

  it('keeps the value of the ledger when a line total does not divide evenly', async () => {
    const { t, run, businessId, kitchen, today } = await setup();
    const result = await run['stock.receive']({
      commandId: t.cmd(),
      businessId,
      receivedOn: today,
      checkOk: true,
      lines: [
        {
          articleId: kitchen.articles.onions.id,
          quantity: 3000,
          lineTotalRappen: 1000,
          areaId: kitchen.areas.dry.id,
        },
      ],
    });
    // 1000 Rappen ÷ 3 kg = 333.33 → 333 Rappen per kg; 3 kg × 3.33 = 9.99. The lot, its
    // movement and the delivery all say 9.99, so the ledger adds up.
    expect((await t.storage.lots.get(at(result.lotIds, 0)))?.pricePer1000).toBe(333);
    expect(result.totalRappen).toBe(999);
    expect((await t.storage.deliveries.get(result.deliveryId))?.totalRappen).toBe(999);
    await expectLedgerBalanced(t);
  });

  it('records a refused check with what was done, and no temperature without a measurement', async () => {
    const { t, run, businessId, kitchen, today } = await setup();
    const line = {
      articleId: kitchen.articles.salmon.id,
      quantity: 2000,
      areaId: kitchen.areas.cold.id,
    };
    await run['stock.receive']({
      commandId: t.cmd(),
      businessId,
      receivedOn: today,
      checkOk: true,
      lines: [line],
    });
    expect(await t.storage.temperatureLogs.ofBusiness(businessId)).toHaveLength(0);
    const refused = await run['stock.receive']({
      commandId: t.cmd(),
      businessId,
      receivedOn: today,
      tempDeciC: 75,
      checkOk: false,
      note: 'Zu warm geliefert, Lieferant informiert.',
      lines: [line],
    });
    const logs = await t.storage.temperatureLogs.ofBusiness(businessId);
    expect(logs).toHaveLength(1);
    // Without a supplier the record is named after what it is.
    expect(logs[0]).toMatchObject({
      label: 'Wareneingang',
      deciC: 75,
      ok: false,
      action: 'Zu warm geliefert, Lieferant informiert.',
    });
    expect(await t.storage.deliveries.get(refused.deliveryId)).toMatchObject({ checkOk: false });
    expect(await t.storage.deliveries.get(refused.deliveryId)).not.toHaveProperty('supplierId');
  });

  it('marks the order as received and takes its supplier', async () => {
    const s = await setup();
    const { t, run, businessId, kitchen, today } = s;
    const orderId = await addOrder(s);
    const line = {
      articleId: kitchen.articles.entrecote.id,
      quantity: 10_000,
      pricePer1000: 6400,
      areaId: kitchen.areas.cold.id,
    };
    const first = await run['stock.receive']({
      commandId: t.cmd(),
      businessId,
      orderId,
      receivedOn: today,
      checkOk: true,
      lines: [line],
    });
    expect(await t.storage.orders.get(orderId)).toMatchObject({
      status: 'received',
      deliveryId: first.deliveryId,
    });
    expect(await t.storage.deliveries.get(first.deliveryId)).toMatchObject({
      orderId,
      supplierId: kitchen.suppliers.butcher.id,
    });
    expect((await t.storage.lots.get(at(first.lotIds, 0)))?.supplierId).toBe(
      kitchen.suppliers.butcher.id,
    );
    expect((await eventsOf(t, 'order.received'))[0]?.payload).toEqual({
      orderId,
      deliveryId: first.deliveryId,
    });
    // The rest arrives later: a second delivery for the same order leaves the order alone.
    const second = await run['stock.receive']({
      commandId: t.cmd(),
      businessId,
      orderId,
      receivedOn: today,
      checkOk: true,
      lines: [{ ...line, quantity: 2000 }],
    });
    expect((await t.storage.orders.get(orderId))?.deliveryId).toBe(first.deliveryId);
    expect(await eventsOf(t, 'order.received')).toHaveLength(1);
    expect((await eventsOf(t, 'delivery.received'))[1]?.payload).toMatchObject({
      orderId,
      deliveryId: second.deliveryId,
    });
    // A draft that was never sent but arrived is received all the same.
    const draftId = await addOrder(s, 'draft');
    await run['stock.receive']({
      commandId: t.cmd(),
      businessId,
      orderId: draftId,
      supplierId: kitchen.suppliers.wholesaler.id,
      receivedOn: today,
      checkOk: true,
      lines: [line],
    });
    expect((await t.storage.orders.get(draftId))?.status).toBe('received');
    // The supplier the person chose wins over the one of the order.
    const deliveries = await t.storage.deliveries.ofBusiness(businessId);
    expect(deliveries.find((row) => row.orderId === draftId)?.supplierId).toBe(
      kitchen.suppliers.wholesaler.id,
    );
    await expectLedgerBalanced(t);
  });

  it('returns the same result for the same command and books nothing twice', async () => {
    const { t, run, businessId, kitchen, today } = await setup();
    const input = {
      commandId: t.cmd(),
      businessId,
      receivedOn: today,
      tempDeciC: 30,
      checkOk: true,
      lines: [
        { articleId: kitchen.articles.butter.id, quantity: 1000, areaId: kitchen.areas.cold.id },
      ],
    };
    const first = await run['stock.receive'](input);
    const after = await sizes(t);
    expect(await run['stock.receive'](input)).toEqual(first);
    expect(await sizes(t)).toEqual(after);
    expect(after).toMatchObject({ lots: 11, movements: 11, deliveries: 1, logs: 1, events: 1 });
  });

  it('refuses what cannot be, and then books nothing at all', async () => {
    const { t, run, businessId, kitchen, today } = await setup();
    const before = await sizes(t);
    const good = {
      articleId: kitchen.articles.butter.id,
      quantity: 1000,
      areaId: kitchen.areas.cold.id,
    };
    const base = { businessId, receivedOn: today, checkOk: true };
    // The second line fails: the first one is not booked either.
    await expect(
      run['stock.receive']({
        ...base,
        commandId: t.cmd(),
        lines: [good, { ...good, articleId: t.cmd() }],
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
    await expect(
      run['stock.receive']({ ...base, commandId: t.cmd(), lines: [{ ...good, areaId: t.cmd() }] }),
    ).rejects.toMatchObject({ code: 'not_found' });
    await expect(
      run['stock.receive']({ ...base, commandId: t.cmd(), supplierId: t.cmd(), lines: [good] }),
    ).rejects.toMatchObject({ code: 'not_found' });
    await expect(
      run['stock.receive']({ ...base, commandId: t.cmd(), orderId: t.cmd(), lines: [good] }),
    ).rejects.toMatchObject({ code: 'not_found' });
    await expect(
      run['stock.receive']({
        ...base,
        commandId: t.cmd(),
        receivedOn: addDays(today, 1),
        lines: [good],
      }),
    ).rejects.toMatchObject({ code: 'invalid' });
    // CHF 1 000 000 000 for a thousandth of a gram is no price the model can hold.
    await expect(
      run['stock.receive']({
        ...base,
        commandId: t.cmd(),
        lines: [{ ...good, quantity: 0.001, lineTotalRappen: 100_000_000_000 }],
      }),
    ).rejects.toMatchObject({ code: 'invalid' });
    // The shape of the input: no lines, no quantity, two prices at once.
    await expect(
      run['stock.receive']({ ...base, commandId: t.cmd(), lines: [] }),
    ).rejects.toThrow();
    await expect(
      run['stock.receive']({ ...base, commandId: t.cmd(), lines: [{ ...good, quantity: 0 }] }),
    ).rejects.toThrow();
    await expect(
      run['stock.receive']({
        ...base,
        commandId: t.cmd(),
        lines: [{ ...good, pricePer1000: 1400, lineTotalRappen: 1400 }],
      }),
    ).rejects.toThrow(/not both/);
    expect(await sizes(t)).toEqual(before);
  });

  it('knows only rows of its own business', async () => {
    const { t, run, kitchen, today } = await setup();
    const other = await createTestContext({ storage: t.storage, idStart: 100_000 });
    await expect(
      run['stock.receive']({
        commandId: t.cmd(),
        businessId: other.businessId,
        receivedOn: today,
        checkOk: true,
        lines: [
          { articleId: kitchen.articles.butter.id, quantity: 1000, areaId: kitchen.areas.cold.id },
        ],
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
    expect(await t.storage.deliveries.ofBusiness(other.businessId)).toEqual([]);
    expect(await t.storage.lots.ofBusiness(other.businessId)).toEqual([]);
  });
});

describe('stock.openingStock', () => {
  it('brings the first stock into the house without calling it a purchase', async () => {
    const { t, run, businessId, kitchen, today } = await setup();
    const input = {
      commandId: t.cmd(),
      businessId,
      on: today,
      lines: [
        // 5 kg butter at 15.00 = 75.00; the last purchase price of 14.00 stays.
        {
          articleId: kitchen.articles.butter.id,
          quantity: 5000,
          pricePer1000: 1500,
          expiresOn: addDays(today, 40),
          areaId: kitchen.areas.cold.id,
        },
        // 2 l jus worth 16.00 are 8.00 a litre: the first price the jus ever had.
        {
          articleId: kitchen.articles.jus.id,
          quantity: 2000,
          lineTotalRappen: 1600,
          areaId: kitchen.areas.cold.id,
        },
      ],
    };
    const result = await run['stock.openingStock'](input);
    expect(result.totalRappen).toBe(9100);
    expect(result.lotIds).toHaveLength(2);
    const butter = await t.storage.lots.get(at(result.lotIds, 0));
    expect(butter).toMatchObject({ origin: 'opening', pricePer1000: 1500, quantity: 5000 });
    expect(butter).not.toHaveProperty('supplierId');
    expect(butter).not.toHaveProperty('deliveryId');
    const movements = await t.storage.movements.ofBusiness(businessId);
    expect(movements.filter((movement) => movement.type === 'receipt')).toHaveLength(10);
    expect(
      movements
        .filter((movement) => movement.type === 'adjustment')
        .map((movement) => [movement.quantity, movement.valueRappen]),
    ).toEqual([
      [5000, 7500],
      [2000, 1600],
    ]);
    expect((await t.storage.articles.get(kitchen.articles.butter.id))?.pricePer1000).toBe(1400);
    expect((await t.storage.articles.get(kitchen.articles.jus.id))?.pricePer1000).toBe(800);
    expect(await t.storage.deliveries.ofBusiness(businessId)).toEqual([]);
    expect((await eventsOf(t, 'stock.opened'))[0]?.payload).toEqual({
      lotIds: result.lotIds,
      totalRappen: 9100,
    });
    const after = await sizes(t);
    expect(await run['stock.openingStock'](input)).toEqual(result);
    expect(await sizes(t)).toEqual(after);
    await expectLedgerBalanced(t);
  });

  it('refuses a day in the future, an unknown article and another business', async () => {
    const { t, run, businessId, kitchen, today } = await setup();
    const line = {
      articleId: kitchen.articles.butter.id,
      quantity: 5000,
      areaId: kitchen.areas.cold.id,
    };
    const before = await sizes(t);
    await expect(
      run['stock.openingStock']({
        commandId: t.cmd(),
        businessId,
        on: addDays(today, 1),
        lines: [line],
      }),
    ).rejects.toMatchObject({ code: 'invalid' });
    await expect(
      run['stock.openingStock']({
        commandId: t.cmd(),
        businessId,
        on: today,
        lines: [{ ...line, articleId: t.cmd() }],
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
    const other = await createTestContext({ storage: t.storage, idStart: 100_000 });
    await expect(
      run['stock.openingStock']({
        commandId: t.cmd(),
        businessId: other.businessId,
        on: today,
        lines: [line],
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
    expect(await sizes(t)).toEqual(before);
  });
});

describe('stock.writeOff', () => {
  it('writes a part of a lot off with reason and note', async () => {
    const { t, run, businessId, kitchen, today } = await setup();
    const input = {
      commandId: t.cmd(),
      businessId,
      lotId: kitchen.lots.salmon.id,
      quantity: 500,
      reason: 'spoiled' as const,
      note: 'Riecht nicht mehr frisch.',
    };
    const result = await run['stock.writeOff'](input);
    // 500 g × 38.00 / kg = 19.00
    expect(result).toEqual({ articleId: kitchen.articles.salmon.id, valueRappen: 1900 });
    expect(await t.storage.lots.get(kitchen.lots.salmon.id)).toMatchObject({
      quantity: 1000,
      status: 'active',
    });
    const waste = (await t.storage.movements.ofBusiness(businessId)).filter(
      (movement) => movement.type === 'waste',
    );
    expect(waste).toHaveLength(1);
    expect(waste[0]).toMatchObject({
      lotId: kitchen.lots.salmon.id,
      quantity: -500,
      valueRappen: -1900,
      reason: 'spoiled',
      note: 'Riecht nicht mehr frisch.',
      on: today,
      actor: t.actor,
    });
    expect((await eventsOf(t, 'stock.written_off'))[0]?.payload).toEqual({
      lotId: kitchen.lots.salmon.id,
      articleId: kitchen.articles.salmon.id,
      quantity: 500,
      reason: 'spoiled',
      valueRappen: 1900,
    });
    const after = await sizes(t);
    expect(await run['stock.writeOff'](input)).toEqual(result);
    expect(await sizes(t)).toEqual(after);
    await expectLedgerBalanced(t);
  });

  it('moves the value of a lot past its Verbrauchsdatum into the journal as an Abschreiber', async () => {
    const { t, run, businessId, kitchen, today } = await setup();
    t.clock.setToday(addDays(today, 2));
    await run['stock.writeOff']({
      commandId: t.cmd(),
      businessId,
      lotId: kitchen.lots.salmon.id,
      quantity: 1500,
      reason: 'expired',
    });
    expect(await t.storage.lots.get(kitchen.lots.salmon.id)).toMatchObject({
      quantity: 0,
      status: 'depleted',
    });
    const journal = await run['stock.journal']({ businessId, type: 'waste' });
    // The whole lot: 1.5 kg × 38.00 = 57.00.
    expect(journal.movements).toEqual([
      expect.objectContaining({
        type: 'waste',
        articleName: 'Lachsfilet',
        quantity: -1500,
        valueRappen: -5700,
        reason: 'expired',
        on: addDays(today, 2),
      }),
    ]);
    expect(journal.sums.find((sum) => sum.type === 'waste')).toEqual({
      type: 'waste',
      count: 1,
      valueRappen: -5700,
    });
    const overview = await run['stock.overview']({ businessId });
    expect(overview.totals.expired.count).toBe(0);
    expect(overview.totals.valueRappen).toBe(53_700 - 5700);
    await expectLedgerBalanced(t);
  });

  it('refuses more than the lot holds, nothing at all, and lots it does not know', async () => {
    const { t, run, businessId, kitchen } = await setup();
    const before = await sizes(t);
    const base = { businessId, lotId: kitchen.lots.salmon.id, reason: 'other' as const };
    await expect(
      run['stock.writeOff']({ ...base, commandId: t.cmd(), quantity: 1500.001 }),
    ).rejects.toMatchObject({ code: 'invalid' });
    await expect(
      run['stock.writeOff']({ ...base, commandId: t.cmd(), quantity: 0 }),
    ).rejects.toThrow();
    await expect(
      run['stock.writeOff']({ ...base, commandId: t.cmd(), lotId: t.cmd(), quantity: 1 }),
    ).rejects.toMatchObject({ code: 'not_found' });
    const other = await createTestContext({ storage: t.storage, idStart: 100_000 });
    await expect(
      run['stock.writeOff']({
        ...base,
        commandId: t.cmd(),
        businessId: other.businessId,
        quantity: 1,
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
    expect(await sizes(t)).toEqual(before);
  });
});

describe('stock.writeOffExpired', () => {
  it('writes off every lot past its Verbrauchsdatum in full, and only those', async () => {
    const { t, run, businessId, kitchen, today } = await setup();
    // Nothing is past its date yet.
    expect(await run['stock.writeOffExpired']({ commandId: t.cmd(), businessId })).toEqual({
      count: 0,
      valueRappen: 0,
      lotIds: [],
    });
    // A week on: salmon and entrecôte are past their Verbrauchsdatum, the older cream is past
    // its best-before date only and stays.
    t.clock.setToday(addDays(today, 7));
    const commandId = t.cmd();
    const result = await run['stock.writeOffExpired']({ commandId, businessId });
    // 57.00 + 248.00 = 305.00
    expect(result).toEqual({
      count: 2,
      valueRappen: 30_500,
      lotIds: [kitchen.lots.salmon.id, kitchen.lots.entrecote.id],
    });
    expect((await t.storage.lots.get(kitchen.lots.salmon.id))?.status).toBe('depleted');
    expect((await t.storage.lots.get(kitchen.lots.entrecote.id))?.status).toBe('depleted');
    expect((await t.storage.lots.get(kitchen.lots.creamOld.id))?.quantity).toBe(3000);
    const waste = (await t.storage.movements.ofBusiness(businessId)).filter(
      (movement) => movement.type === 'waste',
    );
    expect(
      waste.map((movement) => [movement.quantity, movement.valueRappen, movement.reason]),
    ).toEqual([
      [-1500, -5700, 'expired'],
      [-4000, -24_800, 'expired'],
    ]);
    const events = await eventsOf(t, 'stock.expired_written_off');
    expect(events).toHaveLength(2);
    expect(events[1]?.payload).toEqual(result);
    const after = await sizes(t);
    expect(await run['stock.writeOffExpired']({ commandId, businessId })).toEqual(result);
    expect(await sizes(t)).toEqual(after);
    // Asked again, there is nothing left to write off.
    expect((await run['stock.writeOffExpired']({ commandId: t.cmd(), businessId })).count).toBe(0);
    expect((await run['stock.expiring']({ businessId })).groups.expired.count).toBe(0);
    await expectLedgerBalanced(t);
  });

  it('touches nothing of another business', async () => {
    const { t, run, businessId, today } = await setup();
    t.clock.setToday(addDays(today, 7));
    const other = await createTestContext({ storage: t.storage, idStart: 100_000 });
    const before = await sizes(t);
    expect(
      await run['stock.writeOffExpired']({ commandId: t.cmd(), businessId: other.businessId }),
    ).toMatchObject({ count: 0 });
    expect(await sizes(t)).toEqual(before);
    expect((await run['stock.expiring']({ businessId })).groups.expired.count).toBe(2);
  });
});

describe('stock.withdraw', () => {
  it('takes goods first expired first out and says what they were worth', async () => {
    const { t, run, businessId, kitchen, today } = await setup();
    const input = {
      commandId: t.cmd(),
      businessId,
      articleId: kitchen.articles.cream.id,
      quantity: 4000,
      purpose: 'kitchen' as const,
      note: 'Für die Suppe des Tages',
    };
    const result = await run['stock.withdraw'](input);
    // 3 l from the older lot (19.20), 1 l from the newer one (6.40).
    expect(result).toEqual({
      consumed: 4000,
      valueRappen: 2560,
      picks: [
        { lotId: kitchen.lots.creamOld.id, quantity: 3000, valueRappen: 1920 },
        { lotId: kitchen.lots.creamNew.id, quantity: 1000, valueRappen: 640 },
      ],
    });
    const used = (await t.storage.movements.ofBusiness(businessId)).filter(
      (movement) => movement.type === 'consumption',
    );
    expect(used).toHaveLength(2);
    expect(used[0]).toMatchObject({
      quantity: -3000,
      valueRappen: -1920,
      purpose: 'kitchen',
      note: 'Für die Suppe des Tages',
      on: today,
    });
    expect((await eventsOf(t, 'stock.withdrawn'))[0]?.payload).toEqual({
      articleId: kitchen.articles.cream.id,
      quantity: 4000,
      purpose: 'kitchen',
      valueRappen: 2560,
      lotIds: [kitchen.lots.creamOld.id, kitchen.lots.creamNew.id],
    });
    const after = await sizes(t);
    expect(await run['stock.withdraw'](input)).toEqual(result);
    expect(await sizes(t)).toEqual(after);
    await expectLedgerBalanced(t);
  });

  it('takes from the lot the person points at', async () => {
    const { t, run, businessId, kitchen } = await setup();
    const result = await run['stock.withdraw']({
      commandId: t.cmd(),
      businessId,
      articleId: kitchen.articles.cream.id,
      lotId: kitchen.lots.creamNew.id,
      quantity: 1000,
      purpose: 'staff',
    });
    expect(result).toEqual({
      consumed: 1000,
      valueRappen: 640,
      picks: [{ lotId: kitchen.lots.creamNew.id, quantity: 1000, valueRappen: 640 }],
    });
    expect((await t.storage.lots.get(kitchen.lots.creamOld.id))?.quantity).toBe(3000);
    expect((await t.storage.lots.get(kitchen.lots.creamNew.id))?.quantity).toBe(4000);
    const used = (await t.storage.movements.ofBusiness(businessId)).filter(
      (movement) => movement.type === 'consumption',
    );
    expect(used).toEqual([expect.objectContaining({ purpose: 'staff', quantity: -1000 })]);
    await expectLedgerBalanced(t);
  });

  it('books nothing when the stock does not cover it', async () => {
    const { t, run, businessId, kitchen } = await setup();
    const before = await sizes(t);
    await expect(
      run['stock.withdraw']({
        commandId: t.cmd(),
        businessId,
        articleId: kitchen.articles.salmon.id,
        quantity: 2000,
        purpose: 'kitchen',
      }),
    ).rejects.toMatchObject({ code: 'insufficient_stock' });
    await expect(
      run['stock.withdraw']({
        commandId: t.cmd(),
        businessId,
        articleId: kitchen.articles.salmon.id,
        lotId: kitchen.lots.salmon.id,
        quantity: 1501,
        purpose: 'kitchen',
      }),
    ).rejects.toMatchObject({ code: 'insufficient_stock' });
    await expect(
      run['stock.withdraw']({
        commandId: t.cmd(),
        businessId,
        articleId: kitchen.articles.jus.id,
        quantity: 1,
        purpose: 'kitchen',
      }),
    ).rejects.toMatchObject({ code: 'insufficient_stock' });
    expect(await sizes(t)).toEqual(before);
  });

  it('never hands out what is past its Verbrauchsdatum', async () => {
    const { t, run, businessId, kitchen, today } = await setup();
    t.clock.setToday(addDays(today, 2));
    const before = await sizes(t);
    // The salmon is still there, but it is not usable any more.
    await expect(
      run['stock.withdraw']({
        commandId: t.cmd(),
        businessId,
        articleId: kitchen.articles.salmon.id,
        quantity: 100,
        purpose: 'kitchen',
      }),
    ).rejects.toMatchObject({ code: 'insufficient_stock' });
    await expect(
      run['stock.withdraw']({
        commandId: t.cmd(),
        businessId,
        articleId: kitchen.articles.salmon.id,
        lotId: kitchen.lots.salmon.id,
        quantity: 100,
        purpose: 'kitchen',
      }),
    ).rejects.toMatchObject({ code: 'not_allowed' });
    expect(await sizes(t)).toEqual(before);
    // The entrecôte is due today and may still be used.
    await expect(
      run['stock.withdraw']({
        commandId: t.cmd(),
        businessId,
        articleId: kitchen.articles.entrecote.id,
        quantity: 500,
        purpose: 'kitchen',
      }),
    ).resolves.toMatchObject({ consumed: 500, valueRappen: 3100 });
  });

  it('refuses a lot of another article and rows it does not know', async () => {
    const { t, run, businessId, kitchen } = await setup();
    const base = { businessId, quantity: 100, purpose: 'kitchen' as const };
    await expect(
      run['stock.withdraw']({
        ...base,
        commandId: t.cmd(),
        articleId: kitchen.articles.cream.id,
        lotId: kitchen.lots.butter.id,
      }),
    ).rejects.toMatchObject({ code: 'invalid' });
    await expect(
      run['stock.withdraw']({
        ...base,
        commandId: t.cmd(),
        articleId: kitchen.articles.cream.id,
        lotId: t.cmd(),
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
    await expect(
      run['stock.withdraw']({ ...base, commandId: t.cmd(), articleId: t.cmd() }),
    ).rejects.toMatchObject({ code: 'not_found' });
    const other = await createTestContext({ storage: t.storage, idStart: 100_000 });
    await expect(
      run['stock.withdraw']({
        ...base,
        commandId: t.cmd(),
        businessId: other.businessId,
        articleId: kitchen.articles.cream.id,
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
    // Only the kitchen and the staff withdraw by hand; production and sale book themselves.
    await expect(
      run['stock.withdraw']({
        businessId,
        commandId: t.cmd(),
        articleId: kitchen.articles.cream.id,
        quantity: 100,
        purpose: 'sale' as 'kitchen',
      }),
    ).rejects.toThrow();
  });
});

describe('stock.move', () => {
  it('moves a whole lot, or a part as a lot of its own, without a movement', async () => {
    const { t, run, businessId, kitchen } = await setup();
    const before = await sizes(t);
    const whole = await run['stock.move']({
      commandId: t.cmd(),
      businessId,
      lotId: kitchen.lots.butter.id,
      areaId: kitchen.areas.frozen.id,
    });
    expect(whole).toEqual({ lotId: kitchen.lots.butter.id });
    expect((await t.storage.lots.get(kitchen.lots.butter.id))?.areaId).toBe(
      kitchen.areas.frozen.id,
    );
    const input = {
      commandId: t.cmd(),
      businessId,
      lotId: kitchen.lots.entrecote.id,
      areaId: kitchen.areas.frozen.id,
      quantity: 1500,
    };
    const part = await run['stock.move'](input);
    expect(part.lotId).not.toBe(kitchen.lots.entrecote.id);
    expect((await t.storage.lots.get(kitchen.lots.entrecote.id))?.quantity).toBe(2500);
    expect(await t.storage.lots.get(part.lotId)).toMatchObject({
      quantity: 1500,
      areaId: kitchen.areas.frozen.id,
      expiresOn: kitchen.lots.entrecote.expiresOn,
      pricePer1000: 6200,
    });
    const events = await eventsOf(t, 'stock.moved');
    expect(events.map((event) => event.payload)).toEqual([
      {
        lotId: kitchen.lots.butter.id,
        movedLotId: kitchen.lots.butter.id,
        fromAreaId: kitchen.areas.cold.id,
        toAreaId: kitchen.areas.frozen.id,
        quantity: 2000,
      },
      {
        lotId: kitchen.lots.entrecote.id,
        movedLotId: part.lotId,
        fromAreaId: kitchen.areas.cold.id,
        toAreaId: kitchen.areas.frozen.id,
        quantity: 1500,
      },
    ]);
    const after = await sizes(t);
    expect(after).toMatchObject({
      lots: before.lots + 1,
      movements: before.movements,
      stock: before.stock,
    });
    expect(await run['stock.move'](input)).toEqual(part);
    expect(await sizes(t)).toEqual(after);
    await expectLedgerBalanced(t);
  });

  it('refuses the area the lot already lies in, too much, and rows it does not know', async () => {
    const { t, run, businessId, kitchen } = await setup();
    const before = await sizes(t);
    const base = { businessId, lotId: kitchen.lots.butter.id };
    await expect(
      run['stock.move']({ ...base, commandId: t.cmd(), areaId: kitchen.areas.cold.id }),
    ).rejects.toMatchObject({ code: 'invalid' });
    await expect(
      run['stock.move']({
        ...base,
        commandId: t.cmd(),
        areaId: kitchen.areas.dry.id,
        quantity: 2001,
      }),
    ).rejects.toMatchObject({ code: 'invalid' });
    await expect(
      run['stock.move']({ ...base, commandId: t.cmd(), areaId: t.cmd() }),
    ).rejects.toMatchObject({ code: 'not_found' });
    await expect(
      run['stock.move']({
        businessId,
        commandId: t.cmd(),
        lotId: t.cmd(),
        areaId: kitchen.areas.dry.id,
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
    const other = await createTestContext({ storage: t.storage, idStart: 100_000 });
    await expect(
      run['stock.move']({
        ...base,
        commandId: t.cmd(),
        businessId: other.businessId,
        areaId: kitchen.areas.dry.id,
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
    expect(await sizes(t)).toEqual(before);
  });
});

describe('stock.count', () => {
  it('finds 54 instead of 60 eggs: the stock is 54 and the journal holds −6 Stk. worth −2.70', async () => {
    const { t, run, businessId, kitchen, today } = await setup();
    const result = await run['stock.count']({
      commandId: t.cmd(),
      businessId,
      countedOn: today,
      lines: [{ lotId: kitchen.lots.eggs.id, counted: 54 }],
    });
    // 6 eggs × 0.45 = 2.70
    expect(result).toMatchObject({ lineCount: 1, adjusted: 1, valueDeltaRappen: -270 });
    const eggs = await run['stock.article']({ businessId, articleId: kitchen.articles.eggs.id });
    expect(eggs.quantity).toBe(54);
    const journal = await run['stock.journal']({ businessId, type: 'adjustment' });
    expect(journal.movements).toEqual([
      expect.objectContaining({
        type: 'adjustment',
        articleName: 'Eier',
        unit: 'pcs',
        quantity: -6,
        valueRappen: -270,
        on: today,
        countId: result.countId,
      }),
    ]);
    await expectLedgerBalanced(t);
  });

  it('records every line, books only the differences and takes in what was found', async () => {
    const { t, run, businessId, kitchen, today } = await setup();
    const yesterday = addDays(today, -1);
    const input = {
      commandId: t.cmd(),
      businessId,
      countedOn: yesterday,
      areaId: kitchen.areas.cold.id,
      note: 'Monatsinventur',
      lines: [
        { lotId: kitchen.lots.eggs.id, counted: 54 },
        // Matches: part of the record, but no movement.
        { lotId: kitchen.lots.butter.id, counted: 2000 },
        // More than expected: 4.2 kg instead of 4 kg, 200 g × 62.00 = 12.40.
        { lotId: kitchen.lots.entrecote.id, counted: 4200 },
      ],
      found: [
        // 2 kg onions nobody had on a lot, at the last price: 2 × 2.20 = 4.40.
        {
          articleId: kitchen.articles.onions.id,
          areaId: kitchen.areas.cold.id,
          quantity: 2000,
          expiresOn: addDays(today, 10),
        },
      ],
    };
    const result = await run['stock.count'](input);
    // −2.70 + 0 + 12.40 + 4.40 = 14.10
    expect(result).toMatchObject({ lineCount: 4, adjusted: 3, valueDeltaRappen: 1410 });
    expect(result.foundLotIds).toHaveLength(1);
    const record = await t.storage.counts.get(result.countId);
    expect(record).toMatchObject({
      businessId,
      countedOn: yesterday,
      areaId: kitchen.areas.cold.id,
      note: 'Monatsinventur',
      countedBy: t.actor,
      valueDeltaRappen: 1410,
    });
    expect(record?.lines).toEqual([
      {
        lotId: kitchen.lots.eggs.id,
        articleId: kitchen.articles.eggs.id,
        expected: 60,
        counted: 54,
        valueDeltaRappen: -270,
      },
      {
        lotId: kitchen.lots.butter.id,
        articleId: kitchen.articles.butter.id,
        expected: 2000,
        counted: 2000,
        valueDeltaRappen: 0,
      },
      {
        lotId: kitchen.lots.entrecote.id,
        articleId: kitchen.articles.entrecote.id,
        expected: 4000,
        counted: 4200,
        valueDeltaRappen: 1240,
      },
      {
        lotId: result.foundLotIds[0],
        articleId: kitchen.articles.onions.id,
        expected: 0,
        counted: 2000,
        valueDeltaRappen: 440,
      },
    ]);
    expect(await t.storage.lots.get(at(result.foundLotIds, 0))).toMatchObject({
      origin: 'count',
      areaId: kitchen.areas.cold.id,
      quantity: 2000,
      pricePer1000: 220,
      receivedOn: yesterday,
      expiresOn: addDays(today, 10),
    });
    const booked = (await t.storage.movements.ofBusiness(businessId)).filter(
      (movement) => movement.type === 'adjustment',
    );
    expect(
      booked.map((movement) => [movement.quantity, movement.valueRappen, movement.on]),
    ).toEqual([
      [-6, -270, yesterday],
      [200, 1240, yesterday],
      [2000, 440, yesterday],
    ]);
    // Found goods are no purchase and leave the last price alone.
    expect(
      (await t.storage.movements.ofBusiness(businessId)).filter(
        (movement) => movement.type === 'receipt',
      ),
    ).toHaveLength(10);
    expect((await t.storage.lots.get(kitchen.lots.butter.id))?.quantity).toBe(2000);
    expect((await eventsOf(t, 'inventory.counted'))[0]?.payload).toEqual({
      countId: result.countId,
      areaId: kitchen.areas.cold.id,
      lineCount: 4,
      adjusted: 3,
      found: 1,
      valueDeltaRappen: 1410,
    });
    const after = await sizes(t);
    expect(await run['stock.count'](input)).toEqual(result);
    expect(await sizes(t)).toEqual(after);
    await expectLedgerBalanced(t);
  });

  it('counts a lot down to nothing, and records a count that only found something', async () => {
    const { t, run, businessId, kitchen, today } = await setup();
    const empty = await run['stock.count']({
      commandId: t.cmd(),
      businessId,
      countedOn: today,
      lines: [{ lotId: kitchen.lots.salmon.id, counted: 0 }],
    });
    expect(empty).toMatchObject({ adjusted: 1, valueDeltaRappen: -5700 });
    expect(await t.storage.lots.get(kitchen.lots.salmon.id)).toMatchObject({
      quantity: 0,
      status: 'depleted',
    });
    const found = await run['stock.count']({
      commandId: t.cmd(),
      businessId,
      countedOn: today,
      lines: [],
      found: [
        { articleId: kitchen.articles.flour.id, areaId: kitchen.areas.dry.id, quantity: 2500 },
      ],
    });
    // 2.5 kg × 1.60 = 4.00
    expect(found).toMatchObject({ lineCount: 1, adjusted: 1, valueDeltaRappen: 400 });
    expect((await t.storage.counts.get(found.countId))?.lines).toHaveLength(1);
    expect(await t.storage.counts.get(found.countId)).not.toHaveProperty('areaId');
    await expectLedgerBalanced(t);
  });

  it('refuses what cannot be, and then books nothing at all', async () => {
    const { t, run, businessId, kitchen, today } = await setup();
    const before = await sizes(t);
    const base = { businessId, countedOn: today };
    // The second line fails: the first one is not booked either.
    await expect(
      run['stock.count']({
        ...base,
        commandId: t.cmd(),
        lines: [
          { lotId: kitchen.lots.eggs.id, counted: 54 },
          { lotId: t.cmd(), counted: 1 },
        ],
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
    expect((await t.storage.lots.get(kitchen.lots.eggs.id))?.quantity).toBe(60);
    await expect(
      run['stock.count']({
        ...base,
        commandId: t.cmd(),
        lines: [
          { lotId: kitchen.lots.eggs.id, counted: 54 },
          { lotId: kitchen.lots.eggs.id, counted: 55 },
        ],
      }),
    ).rejects.toMatchObject({ code: 'invalid' });
    await expect(
      run['stock.count']({
        ...base,
        commandId: t.cmd(),
        countedOn: addDays(today, 1),
        lines: [{ lotId: kitchen.lots.eggs.id, counted: 54 }],
      }),
    ).rejects.toMatchObject({ code: 'invalid' });
    await expect(
      run['stock.count']({
        ...base,
        commandId: t.cmd(),
        areaId: t.cmd(),
        lines: [{ lotId: kitchen.lots.eggs.id, counted: 54 }],
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
    await expect(
      run['stock.count']({
        ...base,
        commandId: t.cmd(),
        lines: [{ lotId: kitchen.lots.eggs.id, counted: 54 }],
        found: [{ articleId: t.cmd(), areaId: kitchen.areas.cold.id, quantity: 1 }],
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
    // The shape of the input: nothing counted at all, a negative quantity.
    await expect(run['stock.count']({ ...base, commandId: t.cmd(), lines: [] })).rejects.toThrow(
      /at least one line/,
    );
    await expect(
      run['stock.count']({
        ...base,
        commandId: t.cmd(),
        lines: [{ lotId: kitchen.lots.eggs.id, counted: -1 }],
      }),
    ).rejects.toThrow();
    const other = await createTestContext({ storage: t.storage, idStart: 100_000 });
    await expect(
      run['stock.count']({
        ...base,
        commandId: t.cmd(),
        businessId: other.businessId,
        lines: [{ lotId: kitchen.lots.eggs.id, counted: 54 }],
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
    expect(await sizes(t)).toEqual(before);
  });
});

describe('the ledger under the commands of the module', () => {
  it('stays balanced through a day of receiving, using, moving, counting and writing off', async () => {
    const { t, run, businessId, kitchen, today } = await setup();
    await run['stock.receive']({
      commandId: t.cmd(),
      businessId,
      supplierId: kitchen.suppliers.wholesaler.id,
      receivedOn: today,
      checkOk: true,
      lines: [
        {
          articleId: kitchen.articles.salmon.id,
          quantity: 2350.5,
          lineTotalRappen: 9120,
          expiresOn: addDays(today, 3),
          areaId: kitchen.areas.cold.id,
        },
        {
          articleId: kitchen.articles.eggs.id,
          quantity: 90,
          pricePer1000: 47_500,
          areaId: kitchen.areas.cold.id,
        },
      ],
    });
    await run['stock.withdraw']({
      commandId: t.cmd(),
      businessId,
      articleId: kitchen.articles.salmon.id,
      quantity: 1733.333,
      purpose: 'kitchen',
    });
    await run['stock.move']({
      commandId: t.cmd(),
      businessId,
      lotId: kitchen.lots.eggs.id,
      areaId: kitchen.areas.dry.id,
      quantity: 12,
    });
    await run['stock.count']({
      commandId: t.cmd(),
      businessId,
      countedOn: today,
      lines: [
        { lotId: kitchen.lots.eggs.id, counted: 41 },
        { lotId: kitchen.lots.potatoes.id, counted: 24_333.333 },
      ],
      found: [
        { articleId: kitchen.articles.cream.id, areaId: kitchen.areas.cold.id, quantity: 333.3 },
      ],
    });
    await run['stock.writeOff']({
      commandId: t.cmd(),
      businessId,
      lotId: kitchen.lots.creamOld.id,
      quantity: 1234.567,
      reason: 'overproduction',
    });
    t.clock.setToday(addDays(today, 5));
    await run['stock.writeOffExpired']({ commandId: t.cmd(), businessId });
    await expectLedgerBalanced(t);
    // What the overview shows is what the lots hold.
    const { totals, rows } = await run['stock.overview']({ businessId });
    const lots = alive(await t.storage.lots.ofBusiness(businessId)).filter(
      (lot) => lot.status === 'active',
    );
    expect(totals.valueRappen).toBe(
      lots.reduce((sum, lot) => sum + lineValue(lot.quantity, lot.pricePer1000), 0),
    );
    expect(rows.reduce((sum, row) => sum + row.valueRappen, 0)).toBe(totals.valueRappen);
    expect(totals.expired.count).toBe(0);
  });
});
