import { describe, expect, it } from 'vitest';
import {
  alive,
  CommandError,
  MealCountSchema,
  MenuLineSchema,
  PlanSlotSchema,
  TABLE_NAMES,
  WasteWeighingSchema,
  type Id,
} from '../src';
import { createTestContext, seedKitchen, type Kitchen, type TestContext } from '../src/testing';
import { checkBackup } from '../src/modules/settings/backup';
import { BACKUP_FORMAT } from '../src/modules/settings/contract';

/** A backup as the tests read and alter it: loosely typed, so broken files can be built. */
interface Doc {
  format?: unknown;
  version?: unknown;
  business?: Record<string, unknown>;
  counts: Record<string, number>;
  tables: Record<string, Record<string, unknown>[] | undefined>;
  [key: string]: unknown;
}

async function setup() {
  const t = await createTestContext();
  const kitchen = await seedKitchen(t);
  return { t, kitchen, run: t.useCases, businessId: t.businessId };
}

type Setup = Awaited<ReturnType<typeof setup>>;

async function refusal(promise: Promise<unknown>): Promise<CommandError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof CommandError) {
      return error;
    }
    throw error;
  }
  throw new Error('Expected the command to be refused');
}

async function exported(s: Setup): Promise<Doc> {
  return await s.run['settings.export']({ businessId: s.businessId });
}

/** Every row of every table of a business, sorted by id, as a comparable snapshot. */
async function snapshot(t: TestContext, businessId: Id) {
  const tables: Record<string, unknown[]> = {};
  for (const name of TABLE_NAMES) {
    const rows = await t.storage[name].ofBusiness(businessId);
    tables[name] = [...rows].sort((a, b) => a.id.localeCompare(b.id));
  }
  const business = await t.storage.businesses.get(businessId);
  const events = await t.storage.events.ofBusiness(businessId);
  return { tables, business, events: events.map((event) => event.type) };
}

/** The stock adds up: every lot holds what its movements say (ADR-0007). */
async function stockAddsUp(t: TestContext, businessId: Id): Promise<boolean> {
  const lots = alive(await t.storage.lots.ofBusiness(businessId));
  const movements = await t.storage.movements.ofBusiness(businessId);
  return lots.every((lot) => {
    const sum = movements
      .filter((movement) => movement.lotId === lot.id)
      .reduce((total, movement) => total + movement.quantity, 0);
    return Math.abs(sum - lot.quantity) < 1e-9;
  });
}

describe('settings.export', () => {
  it('writes the whole business as one document with every table and counts', async () => {
    const s = await setup();
    const doc = await exported(s);
    expect(doc).toMatchObject({ format: BACKUP_FORMAT, version: 1, app: 'Randen' });
    expect(doc.business).toEqual(await s.t.storage.businesses.get(s.businessId));
    expect(doc.exportedAt).toBe('2026-11-14T10:00:00.000Z');
    expect(Object.keys(doc.tables).sort()).toEqual([...TABLE_NAMES].sort());
    // Seeded rows: one person, three areas, two spots, two suppliers, ten articles, ten lots,
    // ten receipts, three recipes (see the test kitchen).
    expect(doc.counts).toMatchObject({
      staff: 1,
      areas: 3,
      spots: 2,
      suppliers: 2,
      articles: 10,
      lots: 10,
      movements: 10,
      recipes: 3,
      sales: 0,
    });
    for (const name of TABLE_NAMES) {
      expect(doc.counts[name], name).toBe(doc.tables[name]?.length);
    }
  });

  it('includes soft-deleted rows, so a later sync can tell «deleted» from «never seen»', async () => {
    const s = await setup();
    const { staffId } = await s.run['staff.save']({
      commandId: s.t.cmd(),
      businessId: s.businessId,
      name: 'Anna',
      role: 'cook',
      active: true,
    });
    await s.run['staff.remove']({ commandId: s.t.cmd(), businessId: s.businessId, staffId });
    const doc = await exported(s);
    const removed = doc.tables.staff?.find((row) => row.id === staffId);
    expect(removed?.deletedAt).toBeDefined();
    expect(doc.counts.staff).toBe(2);
  });

  it('keeps the business settings: modules and the setup moment are part of the row', async () => {
    const s = await setup();
    await s.run['business.update']({
      commandId: s.t.cmd(),
      businessId: s.businessId,
      modules: ['menu_card', 'numbers'],
    });
    const doc = await exported(s);
    expect(doc.business).toMatchObject({ modules: ['menu_card', 'numbers'] });
  });

  it('does not write anything', async () => {
    const s = await setup();
    const before = await snapshot(s.t, s.businessId);
    await exported(s);
    expect(await snapshot(s.t, s.businessId)).toEqual(before);
  });

  it('fails for a business that does not exist', async () => {
    const s = await setup();
    const error = await refusal(s.run['settings.export']({ businessId: s.t.ids.next() }));
    expect(error.code).toBe('not_found');
  });
});

describe('settings.importPreview', () => {
  it('reads a backup of this version and says what it holds', async () => {
    const s = await setup();
    const doc = await exported(s);
    const preview = await s.run['settings.importPreview']({ businessId: s.businessId, data: doc });
    expect(preview).toMatchObject({
      recognised: true,
      importable: true,
      businessName: 'Testküche',
      exportedAt: '2026-11-14T10:00:00.000Z',
      counts: { articles: 10 },
      problems: [],
    });
    // Rows: the sum of all tables (1 + 3 + 2 + 2 + 10 + 10 + 10 + 3 = 41).
    expect(preview.rows).toBe(41);
  });

  it('refuses a file that is not a Randen backup, without a version to show', async () => {
    const s = await setup();
    const preview = await s.run['settings.importPreview']({
      businessId: s.businessId,
      data: { format: 'rettich-export', items: [] },
    });
    expect(preview).toMatchObject({
      recognised: false,
      importable: false,
      rows: 0,
      problems: [{ kind: 'format' }],
    });
    expect(
      (await s.run['settings.importPreview']({ businessId: s.businessId, data: null })).problems,
    ).toEqual([{ kind: 'format' }]);
  });

  it('names an unknown version', async () => {
    const s = await setup();
    const doc = { ...(await exported(s)), version: 2 };
    const preview = await s.run['settings.importPreview']({ businessId: s.businessId, data: doc });
    expect(preview).toMatchObject({
      recognised: false,
      importable: false,
      problems: [{ kind: 'version', version: '2' }],
    });
    const odd = { ...doc, version: { major: 2 } };
    const oddPreview = await s.run['settings.importPreview']({
      businessId: s.businessId,
      data: odd,
    });
    expect(oddPreview.problems).toEqual([{ kind: 'version' }]);
  });

  it('lists every row that does not fit its schema, with table and id', async () => {
    const s = await setup();
    const doc = await exported(s);
    const broken = doc.tables.articles?.[0] ?? {};
    // A price in fractions of a Rappen is no price (ADR-0004).
    doc.tables.articles = [
      { ...broken, pricePer1000: 6200.5 },
      ...(doc.tables.articles ?? []).slice(1),
    ];
    const preview = await s.run['settings.importPreview']({ businessId: s.businessId, data: doc });
    expect(preview.importable).toBe(false);
    expect(preview.problems).toEqual([{ kind: 'row', table: 'articles', id: broken.id }]);
  });

  it('refuses a row without an id, and a row of another business', async () => {
    const s = await setup();
    const doc = await exported(s);
    const first = doc.tables.areas?.[0] ?? {};
    doc.tables.areas = [{ name: 'ohne Id' }, { ...first, businessId: s.t.ids.next() }];
    const preview = await s.run['settings.importPreview']({ businessId: s.businessId, data: doc });
    expect(preview.problems).toEqual([
      { kind: 'row', table: 'areas' },
      { kind: 'row', table: 'areas', id: first.id },
    ]);
  });

  it('names a missing and an unknown table, and a broken business row', async () => {
    const s = await setup();
    const doc = await exported(s);
    delete doc.tables.sales;
    doc.tables.rettich = [];
    doc.business = { name: 'kaputt' };
    const preview = await s.run['settings.importPreview']({ businessId: s.businessId, data: doc });
    expect(preview.problems).toEqual(
      expect.arrayContaining([
        { kind: 'table', table: 'sales' },
        { kind: 'table', table: 'rettich' },
        { kind: 'business' },
      ]),
    );
    expect(preview.businessName).toBeUndefined();
  });

  it('refuses a file without tables', async () => {
    const s = await setup();
    const doc = await exported(s);
    const preview = await s.run['settings.importPreview']({
      businessId: s.businessId,
      data: { ...doc, tables: undefined },
    });
    expect(preview.problems).toEqual([{ kind: 'table' }]);
  });

  it('refuses a backup without an active person', async () => {
    const s = await setup();
    const doc = await exported(s);
    doc.tables.staff = (doc.tables.staff ?? []).map((row) => ({ ...row, active: false }));
    const preview = await s.run['settings.importPreview']({ businessId: s.businessId, data: doc });
    expect(preview.problems).toEqual([{ kind: 'staff' }]);
  });

  it('writes nothing', async () => {
    const s = await setup();
    const before = await snapshot(s.t, s.businessId);
    await s.run['settings.importPreview']({ businessId: s.businessId, data: await exported(s) });
    expect(await snapshot(s.t, s.businessId)).toEqual(before);
  });

  it('is the same check the import uses', () => {
    expect(
      checkBackup({ format: BACKUP_FORMAT, version: 1 }).preview.problems.length,
    ).toBeGreaterThan(0);
  });
});

describe('settings.import', () => {
  it('brings the business back as it was: every table equal, the stock still adds up', async () => {
    const s = await setup();
    const doc = await exported(s);
    const before = await snapshot(s.t, s.businessId);
    expect(await stockAddsUp(s.t, s.businessId)).toBe(true);

    await s.run['settings.deleteAll']({
      commandId: s.t.cmd(),
      businessId: s.businessId,
      confirm: true,
    });
    expect(await s.t.storage.businesses.get(s.businessId)).toBeUndefined();

    const result = await s.run['settings.import']({
      commandId: s.t.cmd(),
      businessId: s.businessId,
      data: doc,
      confirm: true,
    });
    expect(result.businessId).toBe(s.businessId);
    const after = await snapshot(s.t, s.businessId);
    for (const name of TABLE_NAMES) {
      expect(after.tables[name], name).toEqual(before.tables[name]);
    }
    expect(after.business).toEqual(before.business);
    expect(await stockAddsUp(s.t, s.businessId)).toBe(true);
    // The acting person of the file is active; the device may not have the old one any more.
    const staff = await s.t.storage.staff.get(result.staffId);
    expect(staff).toMatchObject({ active: true, businessId: s.businessId });
  });

  it('replaces what is on the device and appends one business.imported event', async () => {
    const s = await setup();
    const doc = await exported(s);
    await s.run['staff.save']({
      commandId: s.t.cmd(),
      businessId: s.businessId,
      name: 'Nur hier',
      role: 'cook',
      active: true,
    });
    await s.run['settings.import']({
      commandId: s.t.cmd(),
      businessId: s.businessId,
      data: doc,
      confirm: true,
    });
    const staff = await s.t.storage.staff.ofBusiness(s.businessId);
    expect(staff.map((row) => row.name)).toEqual(['Testperson']);
    const events = await s.t.storage.events.ofBusiness(s.businessId);
    expect(events.map((event) => event.type)).toEqual(['business.imported']);
    expect(events[0]?.payload).toMatchObject({ exportedAt: '2026-11-14T10:00:00.000Z', rows: 41 });
  });

  it('refuses a file with one broken row as a whole and changes nothing', async () => {
    const s = await setup();
    const doc = await exported(s);
    doc.tables.lots = [...(doc.tables.lots ?? [])];
    const lot = doc.tables.lots[3] ?? {};
    doc.tables.lots[3] = { ...lot, quantity: -5 };
    const before = await snapshot(s.t, s.businessId);
    const error = await refusal(
      s.run['settings.import']({
        commandId: s.t.cmd(),
        businessId: s.businessId,
        data: doc,
        confirm: true,
      }),
    );
    expect(error.code).toBe('invalid');
    expect(await snapshot(s.t, s.businessId)).toEqual(before);
  });

  it('refuses an unknown version and a file that is not a backup', async () => {
    const s = await setup();
    const doc = await exported(s);
    const before = await snapshot(s.t, s.businessId);
    for (const data of [{ ...doc, version: 9 }, { format: 'other' }, 'Text']) {
      const error = await refusal(
        s.run['settings.import']({
          commandId: s.t.cmd(),
          businessId: s.businessId,
          data,
          confirm: true,
        }),
      );
      expect(error.code).toBe('invalid');
    }
    expect(await snapshot(s.t, s.businessId)).toEqual(before);
  });

  it('replaces the business of the file when it is on the device too, and leaves others alone', async () => {
    const s = await setup();
    const other = await createTestContext({ storage: s.t.storage, idStart: 90_000 });
    await seedKitchen(other);
    const foreignDoc = (await other.useCases['settings.export']({
      businessId: other.businessId,
    })) as unknown as Doc;
    const ownDoc = await exported(s);
    // A file of the other business replaces the one on the device, the other business stays.
    await s.run['settings.import']({
      commandId: s.t.cmd(),
      businessId: s.businessId,
      data: foreignDoc,
      confirm: true,
    });
    expect(await s.t.storage.businesses.get(s.businessId)).toBeUndefined();
    expect(await s.t.storage.businesses.get(other.businessId)).toBeDefined();
    expect((await s.t.storage.articles.ofBusiness(other.businessId)).length).toBe(10);
    // Back again: the file of this business comes in over the other one.
    await s.run['settings.import']({
      commandId: s.t.cmd(),
      businessId: other.businessId,
      data: ownDoc,
      confirm: true,
    });
    expect(await s.t.storage.businesses.get(s.businessId)).toBeDefined();
    expect(await s.t.storage.businesses.get(other.businessId)).toBeUndefined();
  });

  it('repeats the stored result for the same command id and writes nothing again', async () => {
    const s = await setup();
    const doc = await exported(s);
    const commandId = s.t.cmd();
    const first = await s.run['settings.import']({
      commandId,
      businessId: s.businessId,
      data: doc,
      confirm: true,
    });
    const again = await s.run['settings.import']({
      commandId,
      businessId: s.businessId,
      data: doc,
      confirm: true,
    });
    expect(again).toEqual(first);
    expect(await s.t.storage.events.ofBusiness(s.businessId)).toHaveLength(1);
  });

  it('refuses a file whose only person is no longer active', async () => {
    const s = await setup();
    const doc = await exported(s);
    doc.tables.staff = (doc.tables.staff ?? []).map((row) => ({ ...row, active: false }));
    const error = await refusal(
      s.run['settings.import']({
        commandId: s.t.cmd(),
        businessId: s.businessId,
        data: doc,
        confirm: true,
      }),
    );
    expect(error.code).toBe('invalid');
  });
});

describe('settings.deleteAll', () => {
  it('deletes the business and every row, and leaves a single business.deleted event', async () => {
    const s = await setup();
    const kitchen: Kitchen = s.kitchen;
    expect(kitchen.articles.entrecote).toBeDefined();
    await s.run['settings.deleteAll']({
      commandId: s.t.cmd(),
      businessId: s.businessId,
      confirm: true,
    });
    expect(await s.t.storage.businesses.get(s.businessId)).toBeUndefined();
    for (const name of TABLE_NAMES) {
      expect(await s.t.storage[name].ofBusiness(s.businessId), name).toEqual([]);
    }
    const events = await s.t.storage.events.ofBusiness(s.businessId);
    expect(events.map((event) => event.type)).toEqual(['business.deleted']);
  });

  it('leaves another business untouched', async () => {
    const s = await setup();
    const other = await createTestContext({ storage: s.t.storage, idStart: 120_000 });
    await seedKitchen(other);
    const before = await snapshot(other, other.businessId);
    await s.run['settings.deleteAll']({
      commandId: s.t.cmd(),
      businessId: s.businessId,
      confirm: true,
    });
    expect(await snapshot(other, other.businessId)).toEqual(before);
  });

  it('refuses a business that is already gone, and repeats the stored result for the same command', async () => {
    const s = await setup();
    const commandId = s.t.cmd();
    const first = await s.run['settings.deleteAll']({
      commandId,
      businessId: s.businessId,
      confirm: true,
    });
    expect(first).toEqual({ businessId: s.businessId });
    expect(
      await s.run['settings.deleteAll']({ commandId, businessId: s.businessId, confirm: true }),
    ).toEqual(first);
    const error = await refusal(
      s.run['settings.deleteAll']({
        commandId: s.t.cmd(),
        businessId: s.businessId,
        confirm: true,
      }),
    );
    expect(error.code).toBe('not_found');
  });
});

describe('the tables of the menu, meals and waste', () => {
  it('carries menu lines, meal counts and tellerrücklauf along, and brings them back', async () => {
    const s = await setup();
    const now = '2026-11-13T11:00:00.000Z';
    const base = { businessId: s.businessId, createdAt: now, updatedAt: now };
    const slot = PlanSlotSchema.options[0];
    if (slot === undefined) {
      throw new Error('No plan slot');
    }
    const line = MenuLineSchema.parse({
      ...base,
      id: s.t.ids.next(),
      name: 'Menü 1',
      sortOrder: 0,
      freeOf: [],
      active: true,
    });
    const meals = MealCountSchema.parse({
      ...base,
      id: s.t.ids.next(),
      date: '2026-11-13',
      slot,
      served: 40,
    });
    const waste = WasteWeighingSchema.parse({
      ...base,
      id: s.t.ids.next(),
      date: '2026-11-13',
      slot,
      kind: 'plate',
      grams: 1800,
    });
    await s.t.storage.menuLines.put(line);
    await s.t.storage.mealCounts.put(meals);
    await s.t.storage.wasteWeighings.put(waste);
    const doc = await exported(s);
    expect(doc.counts).toMatchObject({ menuLines: 1, mealCounts: 1, wasteWeighings: 1 });
    const before = await snapshot(s.t, s.businessId);
    await s.run['settings.deleteAll']({
      commandId: s.t.cmd(),
      businessId: s.businessId,
      confirm: true,
    });
    await s.run['settings.import']({
      commandId: s.t.cmd(),
      businessId: s.businessId,
      data: doc,
      confirm: true,
    });
    const after = await snapshot(s.t, s.businessId);
    expect(after.tables.menuLines).toEqual([line]);
    expect(after.tables.mealCounts).toEqual([meals]);
    expect(after.tables.wasteWeighings).toEqual([waste]);
    expect(after.tables).toEqual(before.tables);
  });
});
