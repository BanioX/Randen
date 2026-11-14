import { describe, expect, it } from 'vitest';
import {
  alive,
  CONTRACT_FRAGMENTS,
  CONTRACT_V1,
  contractJsonSchemas,
  createMemoryStorage,
  createUseCases,
  ensureLocalBusiness,
  OPERATION_NAMES,
  SCOPES,
  TABLE_NAMES,
  TABLE_SCHEMAS,
} from '../src';
import { createTestContext, fixedClock, seedKitchen, sequentialIds } from '../src/testing';

describe('contract v1', () => {
  it('names every operation by its key and describes it in two languages', () => {
    for (const name of OPERATION_NAMES) {
      const operation = CONTRACT_V1[name];
      expect(operation.name).toBe(name);
      expect(name).toMatch(/^[a-z][a-zA-Z]*\.[a-z][a-zA-Z]*$/);
      expect(operation.summary.de.length).toBeGreaterThan(10);
      expect(operation.summary.en.length).toBeGreaterThan(10);
      expect(operation.summary.de).not.toMatch(/ß/);
      expect(operation.scopes.length).toBeGreaterThan(0);
      for (const scope of operation.scopes) {
        expect(SCOPES).toContain(scope);
      }
    }
  });

  it('gives no operation to two modules', () => {
    const names = Object.values(CONTRACT_FRAGMENTS).flatMap((fragment) => Object.keys(fragment));
    expect(new Set(names).size).toBe(names.length);
    expect(names.length).toBe(OPERATION_NAMES.length);
  });

  it('asks every command for a commandId and every operation for a business', () => {
    for (const { name, kind, input } of contractJsonSchemas()) {
      const required = (input as { required?: string[] }).required ?? [];
      expect(required, name).toContain('businessId');
      if (kind === 'command') {
        expect(required, name).toContain('commandId');
        expect(
          CONTRACT_V1[name].scopes.some((scope) => scope.endsWith(':write')),
          name,
        ).toBe(true);
      }
    }
  });

  it('turns every schema into JSON Schema, for an API and for tools', () => {
    const schemas = contractJsonSchemas();
    expect(schemas).toHaveLength(OPERATION_NAMES.length);
    expect(JSON.stringify(schemas).length).toBeGreaterThan(1000);
  });

  it('implements every operation', async () => {
    const t = await createTestContext();
    expect(Object.keys(createUseCases(t.ctx)).sort()).toEqual([...OPERATION_NAMES].sort());
  });
});

describe('shared reads', () => {
  it('reads and changes the business', async () => {
    const t = await createTestContext();
    const { business } = await t.useCases['business.get']({ businessId: t.businessId });
    expect(business).toMatchObject({ name: 'Testküche', currency: 'CHF', targetFoodCostBps: 3000 });
    const commandId = t.cmd();
    const changed = await t.useCases['business.update']({
      commandId,
      businessId: t.businessId,
      name: 'Zum Goldenen Randen',
      targetFoodCostBps: 2800,
    });
    expect(changed.business).toMatchObject({
      name: 'Zum Goldenen Randen',
      targetFoodCostBps: 2800,
    });
    // Repeating the same command is harmless and returns the same result.
    expect(
      await t.useCases['business.update']({ commandId, businessId: t.businessId, name: 'Anders' }),
    ).toEqual(changed);
    const events = await t.storage.events.ofBusiness(t.businessId);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'business.updated',
      actor: t.actor,
      payload: { fields: ['name', 'targetFoodCostBps'] },
    });
  });

  it('lists areas with their spots in order', async () => {
    const t = await createTestContext();
    const kitchen = await seedKitchen(t);
    const { areas } = await t.useCases['lookup.areas']({ businessId: t.businessId });
    expect(areas.map((area) => area.name)).toEqual(['Kühlraum', 'Tiefkühler', 'Trockenlager']);
    expect(areas[0]).toMatchObject({ kind: 'cold', minDeciC: 0, maxDeciC: 50 });
    expect(areas[0]?.spots).toEqual([
      { id: kitchen.spots.meatDrawer.id, name: 'Schublade Fleisch' },
    ]);
  });

  it('lists articles with their stock, suppliers, recipes and staff by name', async () => {
    const t = await createTestContext();
    const kitchen = await seedKitchen(t);
    const { articles } = await t.useCases['lookup.articles']({ businessId: t.businessId });
    expect(articles).toHaveLength(10);
    expect(articles.find((row) => row.id === kitchen.articles.cream.id)).toMatchObject({
      name: 'Vollrahm',
      unit: 'ml',
      stock: 8000,
      allergens: ['milk'],
    });
    expect(articles.find((row) => row.id === kitchen.articles.jus.id)).toMatchObject({
      kind: 'prepared',
      stock: 0,
      recipeId: kitchen.recipes.jus.id,
    });
    const { suppliers } = await t.useCases['lookup.suppliers']({ businessId: t.businessId });
    expect(suppliers.map((row) => row.name)).toEqual(['Grosshandel Beispiel', 'Metzgerei Muster']);
    const { recipes } = await t.useCases['lookup.recipes']({ businessId: t.businessId });
    expect(recipes.map((row) => row.name)).toEqual([
      'Entrecôte mit Rotweinjus und Kartoffelstock',
      'Lachs mit Rahmsauce',
      'Rotweinjus',
    ]);
    expect(recipes[2]).toMatchObject({
      kind: 'component',
      outputArticleId: kitchen.articles.jus.id,
    });
    const { staff } = await t.useCases['lookup.staff']({ businessId: t.businessId });
    expect(staff).toEqual([{ id: t.actor, name: 'Testperson', role: 'chef', active: true }]);
  });

  it('leaves out what was deleted or set inactive', async () => {
    const t = await createTestContext();
    const kitchen = await seedKitchen(t);
    await t.storage.articles.put({ ...kitchen.articles.eggs, active: false });
    await t.storage.articles.put({ ...kitchen.articles.flour, deletedAt: t.clock.now() });
    const { articles } = await t.useCases['lookup.articles']({ businessId: t.businessId });
    expect(articles).toHaveLength(8);
    const all = await t.useCases['lookup.articles']({
      businessId: t.businessId,
      includeInactive: true,
    });
    expect(all.articles).toHaveLength(9);
  });

  it('fails for a business that does not exist', async () => {
    const t = await createTestContext();
    await expect(t.useCases['business.get']({ businessId: t.cmd() })).rejects.toMatchObject({
      code: 'not_found',
    });
  });
});

describe('memory storage', () => {
  it('has a store for every table, and every seeded row fits its schema', async () => {
    const t = await createTestContext();
    await seedKitchen(t);
    for (const name of TABLE_NAMES) {
      const rows = await t.storage[name].ofBusiness(t.businessId);
      for (const row of rows) {
        expect(() => TABLE_SCHEMAS[name].parse(row), name).not.toThrow();
      }
    }
    expect((await t.storage.lots.ofBusiness(t.businessId)).length).toBe(10);
    expect((await t.storage.movements.ofBusiness(t.businessId)).length).toBe(10);
  });

  it('hands out copies and rolls a failed transaction back', async () => {
    const t = await createTestContext();
    const kitchen = await seedKitchen(t);
    const row = await t.storage.articles.get(kitchen.articles.eggs.id);
    if (row !== undefined) {
      row.allergens.push('milk');
    }
    expect((await t.storage.articles.get(kitchen.articles.eggs.id))?.allergens).toEqual(['eggs']);
    await expect(
      t.storage.transaction(async () => {
        await t.storage.articles.put({ ...kitchen.articles.eggs, name: 'Wachteleier' });
        throw new Error('stop');
      }),
    ).rejects.toThrow('stop');
    expect((await t.storage.articles.get(kitchen.articles.eggs.id))?.name).toBe('Eier');
    await expect(t.storage.articles.add(kitchen.articles.eggs)).rejects.toThrow(/exists/);
  });

  it('keeps businesses apart', async () => {
    const t = await createTestContext();
    await seedKitchen(t);
    expect(alive(await t.storage.articles.ofBusiness(t.cmd()))).toEqual([]);
  });
});

describe('ensureLocalBusiness', () => {
  const names = {
    business: 'Mein Betrieb',
    member: 'Ich',
    areas: { cold: 'Kühlraum', frozen: 'Tiefkühler', dry: 'Trockenlager' },
  };

  it('creates a business with one person and three areas on the first start, once', async () => {
    const storage = createMemoryStorage();
    const clock = fixedClock();
    const ids = sequentialIds();
    const first = await ensureLocalBusiness(storage, clock, ids, names);
    expect(first.business).toMatchObject({
      name: 'Mein Betrieb',
      currency: 'CHF',
      defaultVatBps: 810,
    });
    expect(first.member).toMatchObject({ name: 'Ich', role: 'owner' });
    const areas = await storage.areas.ofBusiness(first.business.id);
    expect(areas.map((area) => area.kind).sort()).toEqual(['cold', 'dry', 'frozen']);
    const second = await ensureLocalBusiness(storage, clock, ids, names);
    expect(second).toEqual(first);
    expect(await storage.businesses.all()).toHaveLength(1);
    expect(await storage.areas.ofBusiness(first.business.id)).toHaveLength(3);
  });
});
