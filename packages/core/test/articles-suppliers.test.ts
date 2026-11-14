import { describe, expect, it } from 'vitest';
import { localDate, PurchaseOrderSchema, type Id } from '../src';
import { nextDay, weekdayOf } from '../src/modules/articles/use-cases';
import { createTestContext, seedKitchen, type TestContext } from '../src/testing';

async function setup() {
  const t = await createTestContext();
  const kitchen = await seedKitchen(t);
  return { t, kitchen, run: t.useCases };
}

const eventTypes = async (t: TestContext) =>
  (await t.storage.events.ofBusiness(t.businessId)).map((event) => event.type);

describe('weekdays', () => {
  it('knows the weekday of a calendar day', () => {
    // 14.11.2026 is a Saturday, 1.1.2026 a Thursday, 29.2.2028 a Tuesday.
    expect(weekdayOf(localDate('2026-11-14'))).toBe('sat');
    expect(weekdayOf(localDate('2026-11-15'))).toBe('sun');
    expect(weekdayOf(localDate('2026-01-01'))).toBe('thu');
    expect(weekdayOf(localDate('2028-02-29'))).toBe('tue');
  });

  it('finds the next of several weekdays, today included', () => {
    const saturday = localDate('2026-11-14');
    expect(nextDay(['mon', 'thu'], saturday)).toEqual({
      on: '2026-11-16',
      weekday: 'mon',
      inDays: 2,
    });
    expect(nextDay(['sat'], saturday)).toEqual({ on: '2026-11-14', weekday: 'sat', inDays: 0 });
    expect(nextDay(['fri'], saturday)).toEqual({ on: '2026-11-20', weekday: 'fri', inDays: 6 });
    // Over the end of the year.
    expect(nextDay(['fri'], localDate('2026-12-30'))).toEqual({
      on: '2027-01-01',
      weekday: 'fri',
      inDays: 2,
    });
    expect(nextDay([], saturday)).toBeUndefined();
  });
});

describe('suppliers.list', () => {
  it('lists suppliers by name with their articles and the next order and delivery day', async () => {
    const { t, kitchen, run } = await setup();
    const { suppliers, total } = await run['suppliers.list']({ businessId: t.businessId });
    expect(total).toBe(2);
    // Today is Saturday: orders on Monday and Thursday, deliveries on Tuesday and Friday.
    expect(suppliers).toEqual([
      {
        id: kitchen.suppliers.wholesaler.id,
        name: 'Grosshandel Beispiel',
        orderDays: ['mon', 'thu'],
        deliveryDays: ['tue', 'fri'],
        nextOrder: { on: '2026-11-16', weekday: 'mon', inDays: 2 },
        nextDelivery: { on: '2026-11-17', weekday: 'tue', inDays: 3 },
        // Everything but the entrecôte and the jus; the flour is below its minimum.
        articleCount: 8,
        belowMinCount: 1,
      },
      {
        id: kitchen.suppliers.butcher.id,
        name: 'Metzgerei Muster',
        orderDays: ['mon', 'thu'],
        deliveryDays: ['tue', 'fri'],
        nextOrder: { on: '2026-11-16', weekday: 'mon', inDays: 2 },
        nextDelivery: { on: '2026-11-17', weekday: 'tue', inDays: 3 },
        articleCount: 1,
        belowMinCount: 0,
      },
    ]);

    // On Thursday the order day is today, the delivery tomorrow.
    t.clock.setToday('2026-11-19');
    const thursday = await run['suppliers.list']({ businessId: t.businessId, search: 'METZG' });
    expect(thursday.suppliers).toHaveLength(1);
    expect(thursday.suppliers[0]).toMatchObject({
      nextOrder: { on: '2026-11-19', weekday: 'thu', inDays: 0 },
      nextDelivery: { on: '2026-11-20', weekday: 'fri', inDays: 1 },
    });
    expect(thursday.total).toBe(2);
  });

  it('shows another business nothing', async () => {
    const { t } = await setup();
    const other = await createTestContext({ storage: t.storage, idStart: 100_000 });
    expect(await other.useCases['suppliers.list']({ businessId: other.businessId })).toEqual({
      suppliers: [],
      total: 0,
    });
  });
});

describe('suppliers.get', () => {
  it('reads a supplier with its articles: unit, price, stock and what runs low', async () => {
    const { t, kitchen, run } = await setup();
    const butcher = await run['suppliers.get']({
      businessId: t.businessId,
      supplierId: kitchen.suppliers.butcher.id,
    });
    expect(butcher).toEqual({
      supplier: {
        id: kitchen.suppliers.butcher.id,
        name: 'Metzgerei Muster',
        orderDays: ['mon', 'thu'],
        deliveryDays: ['tue', 'fri'],
        nextOrder: { on: '2026-11-16', weekday: 'mon', inDays: 2 },
        nextDelivery: { on: '2026-11-17', weekday: 'tue', inDays: 3 },
      },
      articles: [
        {
          id: kitchen.articles.entrecote.id,
          name: 'Rindsentrecôte',
          categoryLabel: 'Fleisch',
          unit: 'g',
          pricePer1000: 6200,
          stock: 4000,
          belowMin: false,
          active: true,
        },
      ],
      openOrders: 0,
    });
    const wholesaler = await run['suppliers.get']({
      businessId: t.businessId,
      supplierId: kitchen.suppliers.wholesaler.id,
    });
    expect(wholesaler.articles.map((article) => article.name)).toEqual([
      'Butter',
      'Eier',
      'Kartoffeln',
      'Lachsfilet',
      'Rotwein zum Kochen',
      'Vollrahm',
      'Weissmehl',
      'Zwiebeln',
    ]);
    expect(wholesaler.articles.find((article) => article.name === 'Weissmehl')).toMatchObject({
      stock: 3000,
      minStock: 5000,
      belowMin: true,
    });
  });

  it('does not find an unknown supplier or one of another business', async () => {
    const { t, kitchen, run } = await setup();
    await expect(
      run['suppliers.get']({ businessId: t.businessId, supplierId: t.cmd() }),
    ).rejects.toMatchObject({ code: 'not_found' });
    const other = await createTestContext({ storage: t.storage, idStart: 100_000 });
    await expect(
      other.useCases['suppliers.get']({
        businessId: other.businessId,
        supplierId: kitchen.suppliers.butcher.id,
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('suppliers.create', () => {
  it('creates a supplier with contact, days in the order of the week and a minimum order', async () => {
    const { t, run } = await setup();
    const commandId = t.cmd();
    const input = {
      commandId,
      businessId: t.businessId,
      name: ' Gemüsehof Beispiel ',
      customerNumber: 'K-1042',
      phone: '044 000 00 00',
      email: 'bestellung@gemuesehof.example',
      orderDays: ['fri', 'mon', 'mon'] as const,
      deliveryDays: ['sat', 'tue'] as const,
      minOrderRappen: 15_000,
      note: 'Bestellung bis 14 Uhr.',
    };
    const { supplierId } = await run['suppliers.create']({
      ...input,
      orderDays: [...input.orderDays],
      deliveryDays: [...input.deliveryDays],
    });
    expect(await t.storage.suppliers.get(supplierId)).toEqual({
      id: supplierId,
      businessId: t.businessId,
      createdAt: t.clock.now(),
      updatedAt: t.clock.now(),
      name: 'Gemüsehof Beispiel',
      customerNumber: 'K-1042',
      phone: '044 000 00 00',
      email: 'bestellung@gemuesehof.example',
      orderDays: ['mon', 'fri'],
      deliveryDays: ['tue', 'sat'],
      minOrderRappen: 15_000,
      note: 'Bestellung bis 14 Uhr.',
    });
    const detail = await run['suppliers.get']({ businessId: t.businessId, supplierId });
    expect(detail.supplier).toMatchObject({
      minOrderRappen: 15_000,
      note: 'Bestellung bis 14 Uhr.',
      // Saturday: the delivery day is today, the next order day Monday.
      nextDelivery: { weekday: 'sat', inDays: 0 },
      nextOrder: { weekday: 'mon', inDays: 2 },
    });
    expect(detail.articles).toEqual([]);

    // Idempotent.
    expect(
      await run['suppliers.create']({ commandId, businessId: t.businessId, name: 'Anders' }),
    ).toEqual({ supplierId });
    expect((await run['suppliers.list']({ businessId: t.businessId })).total).toBe(3);
    const events = await t.storage.events.ofBusiness(t.businessId);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'supplier.created', payload: { supplierId } });
  });

  it('needs no more than a name, and shows no next day without days', async () => {
    const { t, run } = await setup();
    const { supplierId } = await run['suppliers.create']({
      commandId: t.cmd(),
      businessId: t.businessId,
      name: 'Wochenmarkt',
    });
    const { supplier } = await run['suppliers.get']({ businessId: t.businessId, supplierId });
    expect(supplier).toEqual({
      id: supplierId,
      name: 'Wochenmarkt',
      orderDays: [],
      deliveryDays: [],
    });
  });

  it('refuses a name that exists and an address that is none', async () => {
    const { t, run } = await setup();
    await expect(
      run['suppliers.create']({
        commandId: t.cmd(),
        businessId: t.businessId,
        name: 'metzgerei muster',
      }),
    ).rejects.toMatchObject({ code: 'duplicate_name' });
    await expect(
      run['suppliers.create']({
        commandId: t.cmd(),
        businessId: t.businessId,
        name: 'Gemüsehof Beispiel',
        email: 'keine adresse',
      }),
    ).rejects.toThrow();
    expect((await run['suppliers.list']({ businessId: t.businessId })).total).toBe(2);
    expect(await eventTypes(t)).toEqual([]);
  });
});

describe('suppliers.update', () => {
  it('changes what is given, clears with null and names the changed fields', async () => {
    const { t, kitchen, run } = await setup();
    const supplierId = kitchen.suppliers.butcher.id;
    const commandId = t.cmd();
    t.clock.setToday('2026-11-15');
    const result = await run['suppliers.update']({
      commandId,
      businessId: t.businessId,
      supplierId,
      phone: '044 000 00 01',
      orderDays: ['wed', 'mon'],
      // Unchanged, in another order: no change.
      deliveryDays: ['fri', 'tue'],
      minOrderRappen: 20_000,
    });
    expect(result).toEqual({ supplierId, changed: ['phone', 'orderDays', 'minOrderRappen'] });
    expect(await t.storage.suppliers.get(supplierId)).toMatchObject({
      phone: '044 000 00 01',
      orderDays: ['mon', 'wed'],
      deliveryDays: ['tue', 'fri'],
      minOrderRappen: 20_000,
      updatedAt: '2026-11-15T10:00:00.000Z',
    });
    expect(
      await run['suppliers.update']({ commandId, businessId: t.businessId, supplierId, name: 'X' }),
    ).toEqual(result);

    const cleared = await run['suppliers.update']({
      commandId: t.cmd(),
      businessId: t.businessId,
      supplierId,
      phone: null,
      minOrderRappen: null,
      note: null,
    });
    expect(cleared.changed).toEqual(['phone', 'minOrderRappen']);
    const row = await t.storage.suppliers.get(supplierId);
    expect(row).not.toHaveProperty('phone');
    expect(row).not.toHaveProperty('minOrderRappen');

    const nothing = await run['suppliers.update']({
      commandId: t.cmd(),
      businessId: t.businessId,
      supplierId,
      name: 'Metzgerei Muster',
    });
    expect(nothing.changed).toEqual([]);
    const events = await t.storage.events.ofBusiness(t.businessId);
    expect(events.map((event) => event.type)).toEqual(['supplier.updated', 'supplier.updated']);
    expect(events[0]?.payload).toEqual({ supplierId, fields: result.changed });
  });

  it('refuses a taken name and an unknown supplier', async () => {
    const { t, kitchen, run } = await setup();
    await expect(
      run['suppliers.update']({
        commandId: t.cmd(),
        businessId: t.businessId,
        supplierId: kitchen.suppliers.butcher.id,
        name: 'GROSSHANDEL BEISPIEL',
      }),
    ).rejects.toMatchObject({ code: 'duplicate_name' });
    expect(
      (
        await run['suppliers.update']({
          commandId: t.cmd(),
          businessId: t.businessId,
          supplierId: kitchen.suppliers.butcher.id,
          name: 'Metzgerei MUSTER',
        })
      ).changed,
    ).toEqual(['name']);
    await expect(
      run['suppliers.update']({
        commandId: t.cmd(),
        businessId: t.businessId,
        supplierId: t.cmd(),
        name: 'Neu',
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
    const other = await createTestContext({ storage: t.storage, idStart: 100_000 });
    await expect(
      other.useCases['suppliers.update']({
        commandId: other.cmd(),
        businessId: other.businessId,
        supplierId: kitchen.suppliers.butcher.id,
        name: 'Neu',
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('suppliers.delete', () => {
  it('refuses while articles or open orders name the supplier', async () => {
    const { t, kitchen, run } = await setup();
    const remove = (supplierId: Id) =>
      run['suppliers.delete']({ commandId: t.cmd(), businessId: t.businessId, supplierId });
    await expect(remove(kitchen.suppliers.butcher.id)).rejects.toMatchObject({
      code: 'in_use',
      message: expect.stringContaining('Articles') as string,
    });
    // An inactive article still names its supplier.
    await run['articles.setActive']({
      commandId: t.cmd(),
      businessId: t.businessId,
      articleId: kitchen.articles.entrecote.id,
      active: false,
    });
    await expect(remove(kitchen.suppliers.butcher.id)).rejects.toMatchObject({ code: 'in_use' });

    // The article moves to the wholesaler; an order in draft still holds the butcher.
    await run['articles.update']({
      commandId: t.cmd(),
      businessId: t.businessId,
      articleId: kitchen.articles.entrecote.id,
      supplierId: kitchen.suppliers.wholesaler.id,
    });
    const order = PurchaseOrderSchema.parse({
      id: t.cmd(),
      businessId: t.businessId,
      createdAt: t.clock.now(),
      updatedAt: t.clock.now(),
      supplierId: kitchen.suppliers.butcher.id,
      status: 'draft',
      lines: [{ articleId: kitchen.articles.entrecote.id, quantity: 2000, pricePer1000: 6200 }],
    });
    await t.storage.orders.add(order);
    await expect(remove(kitchen.suppliers.butcher.id)).rejects.toMatchObject({
      code: 'in_use',
      message: expect.stringContaining('order') as string,
    });
    const blocked = await run['suppliers.get']({
      businessId: t.businessId,
      supplierId: kitchen.suppliers.butcher.id,
    });
    expect(blocked).toMatchObject({ articles: [], openOrders: 1 });

    await t.storage.orders.put({ ...order, status: 'cancelled' });
    await expect(remove(kitchen.suppliers.butcher.id)).resolves.toEqual({
      supplierId: kitchen.suppliers.butcher.id,
    });
  });

  it('deletes softly, once, and frees the name', async () => {
    const { t, run } = await setup();
    const { supplierId } = await run['suppliers.create']({
      commandId: t.cmd(),
      businessId: t.businessId,
      name: 'Wochenmarkt',
    });
    t.clock.setToday('2026-11-15');
    const commandId = t.cmd();
    const result = await run['suppliers.delete']({
      commandId,
      businessId: t.businessId,
      supplierId,
    });
    expect(result).toEqual({ supplierId });
    expect(await t.storage.suppliers.get(supplierId)).toMatchObject({
      name: 'Wochenmarkt',
      deletedAt: '2026-11-15T10:00:00.000Z',
    });
    expect(
      await run['suppliers.delete']({ commandId, businessId: t.businessId, supplierId }),
    ).toEqual(result);
    expect(await eventTypes(t)).toEqual(['supplier.created', 'supplier.deleted']);
    expect((await run['suppliers.list']({ businessId: t.businessId })).total).toBe(2);
    await expect(
      run['suppliers.get']({ businessId: t.businessId, supplierId }),
    ).rejects.toMatchObject({ code: 'not_found' });
    await expect(
      run['suppliers.delete']({ commandId: t.cmd(), businessId: t.businessId, supplierId }),
    ).rejects.toMatchObject({ code: 'not_found' });
    await expect(
      run['suppliers.create']({
        commandId: t.cmd(),
        businessId: t.businessId,
        name: 'Wochenmarkt',
      }),
    ).resolves.toBeDefined();
    const other = await createTestContext({ storage: t.storage, idStart: 100_000 });
    await expect(
      other.useCases['suppliers.delete']({
        commandId: other.cmd(),
        businessId: other.businessId,
        supplierId,
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });
});
