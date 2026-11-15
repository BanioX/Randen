import { describe, expect, it } from 'vitest';
import {
  addDays,
  ArticleSchema,
  PlanEntrySchema,
  SupplierSchema,
  type DomainEvent,
  type Id,
} from '../src';
import { createTestContext, seedKitchen } from '../src/testing';

async function setup() {
  const t = await createTestContext();
  const kitchen = await seedKitchen(t);
  return { t, kitchen, today: t.clock.today(), run: t.useCases, businessId: t.businessId };
}

type Setup = Awaited<ReturnType<typeof setup>>;

async function eventsOf(s: Setup, type: string): Promise<DomainEvent[]> {
  return (await s.t.storage.events.ofBusiness(s.businessId)).filter((event) => event.type === type);
}

/** A draft for the wholesaler: 2 kg salmon at its last price and one sack of flour at CHF 1.50. */
async function draft(s: Setup) {
  return s.run['orders.create']({
    commandId: s.t.cmd(),
    businessId: s.businessId,
    supplierId: s.kitchen.suppliers.wholesaler.id,
    lines: [
      { articleId: s.kitchen.articles.salmon.id, quantity: 2000 },
      { articleId: s.kitchen.articles.flour.id, quantity: 10_000, pricePer1000: 150 },
    ],
  });
}

async function addMarket(s: Setup): Promise<Id> {
  const now = s.t.clock.now();
  const id = s.t.cmd();
  await s.t.storage.suppliers.add(
    SupplierSchema.parse({
      id,
      businessId: s.businessId,
      createdAt: now,
      updatedAt: now,
      name: 'Markt Nord',
      kind: 'market',
      orderDays: [],
      deliveryDays: [],
    }),
  );
  return id;
}

describe('orders.create', () => {
  it('writes a draft with the last prices, once per command', async () => {
    const s = await setup();
    const commandId = s.t.cmd();
    const input = {
      commandId,
      businessId: s.businessId,
      supplierId: s.kitchen.suppliers.wholesaler.id,
      lines: [
        { articleId: s.kitchen.articles.salmon.id, quantity: 1500 },
        { articleId: s.kitchen.articles.flour.id, quantity: 10_000, pricePer1000: 150 },
        // The same article twice is one line.
        { articleId: s.kitchen.articles.salmon.id, quantity: 500 },
      ],
      expectedOn: addDays(s.today, 3),
      note: 'Bitte vor 10 Uhr.',
    };
    const result = await s.run['orders.create'](input);
    // 2 kg salmon at CHF 38.00 = 76.00, 10 kg flour at CHF 1.50 = 15.00.
    expect(result).toMatchObject({ lineCount: 2, valueRappen: 9100 });
    expect(await s.run['orders.create'](input)).toEqual(result);
    const rows = await s.t.storage.orders.ofBusiness(s.businessId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      status: 'draft',
      expectedOn: '2026-11-17',
      note: 'Bitte vor 10 Uhr.',
      lines: [
        { articleId: s.kitchen.articles.salmon.id, quantity: 2000, pricePer1000: 3800 },
        { articleId: s.kitchen.articles.flour.id, quantity: 10_000, pricePer1000: 150 },
      ],
    });
    expect(rows[0]?.orderedOn).toBeUndefined();
    const events = await eventsOf(s, 'order.created');
    expect(events).toHaveLength(1);
    expect(events[0]?.payload).toMatchObject({ orderId: result.orderId, source: 'hand' });
  });

  it('refuses a market, an unknown supplier and an unknown article', async () => {
    const s = await setup();
    const market = await addMarket(s);
    const line = { articleId: s.kitchen.articles.salmon.id, quantity: 1000 };
    const create = (supplierId: Id, lines = [line]) =>
      s.run['orders.create']({ commandId: s.t.cmd(), businessId: s.businessId, supplierId, lines });
    await expect(create(market)).rejects.toMatchObject({ code: 'invalid' });
    await expect(create(s.t.cmd())).rejects.toMatchObject({ code: 'not_found' });
    await expect(
      create(s.kitchen.suppliers.wholesaler.id, [{ articleId: s.t.cmd(), quantity: 1 }]),
    ).rejects.toMatchObject({ code: 'not_found' });
    expect(await s.t.storage.orders.ofBusiness(s.businessId)).toEqual([]);
  });
});

describe('orders.createFromSuggestions', () => {
  it('turns the proposal of a supplier into a draft for its next delivery', async () => {
    const s = await setup();
    const { flour, salmon } = s.kitchen.articles;
    const now = s.t.clock.now();
    await s.t.storage.planEntries.add(
      PlanEntrySchema.parse({
        id: s.t.cmd(),
        businessId: s.businessId,
        createdAt: now,
        updatedAt: now,
        date: addDays(s.today, 3),
        slot: 'dinner',
        recipeId: s.kitchen.recipes.salmonDish.id,
        portions: 30,
      }),
    );
    const commandId = s.t.cmd();
    const input = {
      commandId,
      businessId: s.businessId,
      supplierId: s.kitchen.suppliers.wholesaler.id,
      // One sack of flour instead of two.
      quantities: [{ articleId: flour.id, quantity: 10_000 }],
    };
    const result = await s.run['orders.createFromSuggestions'](input);
    // 10 kg flour at CHF 1.60 = 16.00, 4.8 kg salmon at CHF 38.00 = 182.40.
    expect(result).toMatchObject({ lineCount: 2, valueRappen: 19_840 });
    expect(await s.run['orders.createFromSuggestions'](input)).toEqual(result);
    const got = await s.run['orders.get']({ businessId: s.businessId, orderId: result.orderId });
    expect(got.order).toMatchObject({ status: 'draft', expectedOn: '2026-11-17' });
    // In the order of the proposal: by name.
    expect(got.lines.map((line) => [line.name, line.quantity])).toEqual([
      ['Lachsfilet', 4800],
      ['Weissmehl', 10_000],
    ]);
    // What is ordered now counts as on order: the proposal is empty for these two.
    const after = await s.run['purchasing.suggestions']({ businessId: s.businessId });
    const proposed = after.groups.flatMap((group) => group.lines.map((line) => line.articleId));
    expect(proposed).not.toContain(salmon.id);
    expect(proposed).not.toContain(flour.id);
    expect((await eventsOf(s, 'order.created'))[0]?.payload).toMatchObject({
      source: 'suggestions',
    });
  });

  it('leaves out what is set to 0 and refuses an empty draft', async () => {
    const s = await setup();
    const create = (supplierId: Id, quantities: { articleId: Id; quantity: number }[] = []) =>
      s.run['orders.createFromSuggestions']({
        commandId: s.t.cmd(),
        businessId: s.businessId,
        supplierId,
        quantities,
      });
    await expect(create(s.kitchen.suppliers.butcher.id)).rejects.toMatchObject({ code: 'invalid' });
    await expect(
      create(s.kitchen.suppliers.wholesaler.id, [
        { articleId: s.kitchen.articles.flour.id, quantity: 0 },
      ]),
    ).rejects.toMatchObject({ code: 'invalid' });
    await expect(create(await addMarket(s))).rejects.toMatchObject({ code: 'invalid' });
  });
});

describe('orders.update, markSent, cancel, delete', () => {
  it('changes lines, day and note of a draft', async () => {
    const s = await setup();
    const { orderId } = await draft(s);
    const commandId = s.t.cmd();
    const input = {
      commandId,
      businessId: s.businessId,
      orderId,
      lines: [{ articleId: s.kitchen.articles.butter.id, quantity: 5000 }],
      expectedOn: addDays(s.today, 6),
      note: 'Hintereingang',
    };
    // 5 kg butter at CHF 14.00.
    const result = await s.run['orders.update'](input);
    expect(result).toEqual({ orderId, lineCount: 1, valueRappen: 7000 });
    expect(await s.run['orders.update'](input)).toEqual(result);
    expect(await s.t.storage.orders.get(orderId)).toMatchObject({
      expectedOn: '2026-11-20',
      note: 'Hintereingang',
      lines: [{ quantity: 5000, pricePer1000: 1400 }],
    });
    // null clears day and note; the lines stay.
    await s.run['orders.update']({
      commandId: s.t.cmd(),
      businessId: s.businessId,
      orderId,
      expectedOn: null,
      note: null,
    });
    const row = await s.t.storage.orders.get(orderId);
    expect(row?.expectedOn).toBeUndefined();
    expect(row?.note).toBeUndefined();
    expect(row?.lines).toHaveLength(1);
    const events = await eventsOf(s, 'order.updated');
    expect(events.map((event) => event.payload.fields)).toEqual([
      ['lines', 'expectedOn', 'note'],
      ['expectedOn', 'note'],
    ]);
  });

  it('marks an order as sent once; twice is harmless', async () => {
    const s = await setup();
    const { orderId } = await draft(s);
    const commandId = s.t.cmd();
    const sent = await s.run['orders.markSent']({ commandId, businessId: s.businessId, orderId });
    expect(sent).toEqual({ orderId, status: 'sent', orderedOn: s.today });
    expect(
      await s.run['orders.markSent']({ commandId, businessId: s.businessId, orderId }),
    ).toEqual(sent);
    // A second tap with a new command changes nothing either.
    expect(
      await s.run['orders.markSent']({ commandId: s.t.cmd(), businessId: s.businessId, orderId }),
    ).toEqual(sent);
    expect(await eventsOf(s, 'order.sent')).toHaveLength(1);
    // A sent order is no longer a draft: no changes, no deleting.
    await expect(
      s.run['orders.update']({
        commandId: s.t.cmd(),
        businessId: s.businessId,
        orderId,
        note: 'x',
      }),
    ).rejects.toMatchObject({ code: 'not_allowed' });
    await expect(
      s.run['orders.delete']({ commandId: s.t.cmd(), businessId: s.businessId, orderId }),
    ).rejects.toMatchObject({ code: 'not_allowed' });
  });

  it('cancels an open order, but not a received one', async () => {
    const s = await setup();
    const { orderId } = await draft(s);
    await s.run['orders.markSent']({ commandId: s.t.cmd(), businessId: s.businessId, orderId });
    const cancel = () =>
      s.run['orders.cancel']({ commandId: s.t.cmd(), businessId: s.businessId, orderId });
    expect(await cancel()).toEqual({ orderId, status: 'cancelled' });
    expect(await cancel()).toEqual({ orderId, status: 'cancelled' });
    expect((await eventsOf(s, 'order.cancelled')).map((event) => event.payload)).toEqual([
      { orderId, was: 'sent' },
    ]);
    await expect(
      s.run['orders.markSent']({ commandId: s.t.cmd(), businessId: s.businessId, orderId }),
    ).rejects.toMatchObject({ code: 'not_allowed' });

    // Receiving belongs to the stock module; afterwards the order cannot be cancelled.
    const second = await draft(s);
    await s.run['stock.receive']({
      commandId: s.t.cmd(),
      businessId: s.businessId,
      orderId: second.orderId,
      receivedOn: s.today,
      checkOk: true,
      lines: [
        {
          articleId: s.kitchen.articles.salmon.id,
          quantity: 2000,
          areaId: s.kitchen.areas.cold.id,
        },
      ],
    });
    await expect(
      s.run['orders.cancel']({
        commandId: s.t.cmd(),
        businessId: s.businessId,
        orderId: second.orderId,
      }),
    ).rejects.toMatchObject({ code: 'not_allowed' });
  });

  it('deletes a draft softly', async () => {
    const s = await setup();
    const { orderId } = await draft(s);
    const commandId = s.t.cmd();
    expect(await s.run['orders.delete']({ commandId, businessId: s.businessId, orderId })).toEqual({
      orderId,
    });
    expect(await s.run['orders.delete']({ commandId, businessId: s.businessId, orderId })).toEqual({
      orderId,
    });
    expect((await s.t.storage.orders.get(orderId))?.deletedAt).toBe(s.t.clock.now());
    expect((await s.run['orders.list']({ businessId: s.businessId })).orders).toEqual([]);
    await expect(s.run['orders.get']({ businessId: s.businessId, orderId })).rejects.toMatchObject({
      code: 'not_found',
    });
    expect(await eventsOf(s, 'order.deleted')).toHaveLength(1);
  });
});

describe('orders.list and orders.get', () => {
  it('lists orders newest first, filtered by status, with counts', async () => {
    const s = await setup();
    const first = await draft(s);
    s.t.clock.setToday(addDays(s.today, 1));
    const second = await draft(s);
    await s.run['orders.markSent']({
      commandId: s.t.cmd(),
      businessId: s.businessId,
      orderId: second.orderId,
    });
    const all = await s.run['orders.list']({ businessId: s.businessId });
    expect(all.orders.map((row) => row.id)).toEqual([second.orderId, first.orderId]);
    expect(all.counts).toEqual({ draft: 1, sent: 1, received: 0, cancelled: 0 });
    expect(all.orders[0]).toMatchObject({
      supplierName: 'Grosshandel Beispiel',
      status: 'sent',
      lineCount: 2,
      valueRappen: 9100,
      priceMissing: false,
      orderedOn: '2026-11-15',
      createdOn: '2026-11-15',
    });
    const open = await s.run['orders.list']({ businessId: s.businessId, status: 'open' });
    expect(open.orders).toHaveLength(2);
    const drafts = await s.run['orders.list']({ businessId: s.businessId, status: 'draft' });
    expect(drafts.orders.map((row) => row.id)).toEqual([first.orderId]);
  });

  it('gives an order with its lines, the supplier and the text to send', async () => {
    const s = await setup();
    const { flour, salmon } = s.kitchen.articles;
    await s.t.storage.articles.put(
      ArticleSchema.parse({ ...flour, supplierArticleNumber: '4711' }),
    );
    const { wholesaler } = s.kitchen.suppliers;
    await s.t.storage.suppliers.put(
      SupplierSchema.parse({ ...wholesaler, customerNumber: '88-120', phone: '044 000 00 00' }),
    );
    const { orderId } = await s.run['orders.create']({
      commandId: s.t.cmd(),
      businessId: s.businessId,
      supplierId: wholesaler.id,
      lines: [
        { articleId: flour.id, quantity: 20_000 },
        { articleId: salmon.id, quantity: 3300, pricePer1000: 0 },
      ],
      expectedOn: addDays(s.today, 3),
    });
    const got = await s.run['orders.get']({ businessId: s.businessId, orderId });
    expect(got.order).toMatchObject({
      status: 'draft',
      expectedOn: '2026-11-17',
      createdOn: '2026-11-14',
      // 20 kg flour at CHF 1.60; the salmon has no price.
      valueRappen: 3200,
      priceMissing: true,
    });
    expect(got.lines[0]).toMatchObject({
      name: 'Weissmehl',
      unit: 'g',
      quantity: 20_000,
      packs: { count: 2, size: 10_000, label: 'Sack' },
      packSize: 10_000,
      packLabel: 'Sack',
      supplierArticleNumber: '4711',
      valueRappen: 3200,
    });
    expect(got.lines[1]).toMatchObject({ name: 'Lachsfilet', priceMissing: true });
    expect(got.lines[1]?.packs).toBeUndefined();
    expect(got.supplier).toMatchObject({
      name: 'Grosshandel Beispiel',
      customerNumber: '88-120',
      phone: '044 000 00 00',
      nextDelivery: { on: '2026-11-17' },
    });
    expect(got.subject).toBe('Bestellung Testküche, Lieferung 17.11.2026');
    expect(got.text).toContain('Bestellung von Testküche, Kundennummer 88-120');
    expect(got.text).toContain('Gewünschte Lieferung: Dienstag, 17.11.2026');
    expect(got.text).toContain('2 × Sack à 10 kg Weissmehl, Art.-Nr. 4711');
    expect(got.text).toContain('3.3 kg Lachsfilet');
    // No prices and no «ß» in what goes to the supplier.
    expect(got.text).not.toMatch(/CHF|32\.00|1\.60|38\.00/);
    expect(got.text).not.toContain('ß');
    expect(got.businessName).toBe('Testküche');
  });

  it('shows another business nothing', async () => {
    const s = await setup();
    const { orderId } = await draft(s);
    const other = await createTestContext({ storage: s.t.storage, idStart: 10_000 });
    expect((await other.useCases['orders.list']({ businessId: other.businessId })).orders).toEqual(
      [],
    );
    await expect(
      other.useCases['orders.get']({ businessId: other.businessId, orderId }),
    ).rejects.toMatchObject({ code: 'not_found' });
    await expect(
      other.useCases['orders.markSent']({
        commandId: other.cmd(),
        businessId: other.businessId,
        orderId,
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });
});
