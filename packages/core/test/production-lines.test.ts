import { describe, expect, it } from 'vitest';
import { CommandError, type Id } from '../src';
import { createTestContext, seedKitchen } from '../src/testing';

/**
 * Menü-Linien, Mahlzeiten und Wägungen of the plan (ADR-0015) on the test kitchen. None of them
 * touches the stock ledger, which the last test checks against the lots.
 */
async function setup() {
  const t = await createTestContext();
  const kitchen = await seedKitchen(t);
  return { t, kitchen, run: t.useCases, businessId: t.businessId };
}

type Setup = Awaited<ReturnType<typeof setup>>;

async function line(s: Setup, name: string, extra: Record<string, unknown> = {}): Promise<Id> {
  const result = await s.run['plan.lineCreate']({
    commandId: s.t.cmd(),
    businessId: s.businessId,
    name,
    freeOf: [],
    ...extra,
  });
  return result.lineId;
}

describe('plan.lines', () => {
  it('creates lines in order, lists the active ones and shows the inactive on request', async () => {
    const s = await setup();
    const menu = await line(s, 'Menü 1', { slot: 'lunch', costTargetRappen: 800 });
    const vegi = await line(s, 'Vegi', { requiredDiet: 'vegetarian', freeOf: ['gluten'] });
    const list = await s.run['plan.linesList']({ businessId: s.businessId });
    expect(list.lines).toEqual([
      expect.objectContaining({
        id: menu,
        name: 'Menü 1',
        slot: 'lunch',
        sortOrder: 0,
        costTargetRappen: 800,
        active: true,
      }),
      expect.objectContaining({
        id: vegi,
        name: 'Vegi',
        requiredDiet: 'vegetarian',
        freeOf: ['gluten'],
        sortOrder: 1,
      }),
    ]);
    await s.run['plan.lineUpdate']({
      commandId: s.t.cmd(),
      businessId: s.businessId,
      lineId: vegi,
      active: false,
    });
    expect(
      (await s.run['plan.linesList']({ businessId: s.businessId })).lines.map((row) => row.name),
    ).toEqual(['Menü 1']);
    expect(
      (await s.run['plan.linesList']({ businessId: s.businessId, includeInactive: true })).lines,
    ).toHaveLength(2);
  });

  it('refuses a second line with the same name, whatever the case, and allows keeping the own name', async () => {
    const s = await setup();
    const menu = await line(s, 'Menü 1');
    await expect(line(s, ' menü 1 ')).rejects.toMatchObject({ code: 'duplicate_name' });
    await expect(
      s.run['plan.lineUpdate']({
        commandId: s.t.cmd(),
        businessId: s.businessId,
        lineId: menu,
        name: 'Menü 1',
      }),
    ).resolves.toEqual({ lineId: menu });
    const other = await line(s, 'Vegi');
    await expect(
      s.run['plan.lineUpdate']({
        commandId: s.t.cmd(),
        businessId: s.businessId,
        lineId: other,
        name: 'MENÜ 1',
      }),
    ).rejects.toMatchObject({ code: 'duplicate_name' });
  });

  it('renames, changes the promises and clears a meal or a cost target', async () => {
    const s = await setup();
    const menu = await line(s, 'Menü 1', {
      slot: 'lunch',
      costTargetRappen: 800,
      requiredDiet: 'vegan',
      freeOf: ['milk'],
    });
    await s.run['plan.lineUpdate']({
      commandId: s.t.cmd(),
      businessId: s.businessId,
      lineId: menu,
      name: 'Menü 1 Vegan',
      slot: null,
      costTargetRappen: null,
      requiredDiet: null,
      freeOf: ['milk', 'eggs'],
    });
    const row = await s.t.storage.menuLines.get(menu);
    expect(row).toMatchObject({ name: 'Menü 1 Vegan', freeOf: ['milk', 'eggs'], active: true });
    if (row === undefined) {
      throw new Error('line missing');
    }
    expect(row).not.toHaveProperty('slot');
    expect(row).not.toHaveProperty('costTargetRappen');
    expect(row).not.toHaveProperty('requiredDiet');
    const events = await s.t.storage.events.ofBusiness(s.businessId);
    expect(events.find((event) => event.type === 'plan.line_updated')?.payload).toMatchObject({
      lineId: menu,
      fields: ['name', 'slot', 'costTargetRappen', 'requiredDiet', 'freeOf'],
    });
  });

  it('reorders the lines, and refuses an order that does not name every line once', async () => {
    const s = await setup();
    const a = await line(s, 'A');
    const b = await line(s, 'B');
    const c = await line(s, 'C');
    await s.run['plan.lineReorder']({
      commandId: s.t.cmd(),
      businessId: s.businessId,
      lineIds: [c, a, b],
    });
    const names = (await s.run['plan.linesList']({ businessId: s.businessId })).lines.map(
      (row) => row.name,
    );
    expect(names).toEqual(['C', 'A', 'B']);
    await expect(
      s.run['plan.lineReorder']({
        commandId: s.t.cmd(),
        businessId: s.businessId,
        lineIds: [c, a],
      }),
    ).rejects.toMatchObject({ code: 'invalid' });
    await expect(
      s.run['plan.lineReorder']({
        commandId: s.t.cmd(),
        businessId: s.businessId,
        lineIds: [c, c, a],
      }),
    ).rejects.toMatchObject({ code: 'invalid' });
  });

  it('fails to change a line that does not exist', async () => {
    const s = await setup();
    await expect(
      s.run['plan.lineUpdate']({
        commandId: s.t.cmd(),
        businessId: s.businessId,
        lineId: s.t.cmd(),
        name: 'X',
      }),
    ).rejects.toBeInstanceOf(CommandError);
  });

  it('shows the lines of another business to nobody', async () => {
    const s = await setup();
    await line(s, 'Menü 1');
    const other = await createTestContext({ storage: s.t.storage, idStart: 40_000 });
    expect(
      (await other.useCases['plan.linesList']({ businessId: other.businessId })).lines,
    ).toEqual([]);
  });
});

describe('plan.meals', () => {
  it('expects the portions of the plan, and keeps what was served as entered', async () => {
    const s = await setup();
    const { kitchen, t } = s;
    await s.run['plan.add']({
      commandId: t.cmd(),
      businessId: s.businessId,
      date: '2026-11-14',
      slot: 'lunch',
      recipeId: kitchen.recipes.salmonDish.id,
      portions: 4,
    });
    const before = await s.run['plan.mealsList']({
      businessId: s.businessId,
      from: '2026-11-09',
      to: '2026-11-15',
    });
    expect(before.meals).toEqual([]);
    expect(before.planned).toEqual([{ date: '2026-11-14', slot: 'lunch', portions: 4 }]);

    const set = await s.run['plan.mealsSet']({
      commandId: t.cmd(),
      businessId: s.businessId,
      date: '2026-11-14',
      slot: 'lunch',
      expected: 80,
    });
    await s.run['plan.mealsSet']({
      commandId: t.cmd(),
      businessId: s.businessId,
      date: '2026-11-14',
      slot: 'lunch',
      served: 75,
      note: 'Regen',
    });
    const after = await s.run['plan.mealsList']({
      businessId: s.businessId,
      from: '2026-11-09',
      to: '2026-11-15',
    });
    expect(after.meals).toEqual([
      expect.objectContaining({
        id: set.mealId,
        date: '2026-11-14',
        slot: 'lunch',
        expected: 80,
        served: 75,
        note: 'Regen',
      }),
    ]);
  });

  it('clears a value with null, and removes a count that holds nothing any more', async () => {
    const s = await setup();
    const { t } = s;
    const first = await s.run['plan.mealsSet']({
      commandId: t.cmd(),
      businessId: s.businessId,
      date: '2026-11-14',
      slot: 'dinner',
      expected: 30,
    });
    const cleared = await s.run['plan.mealsSet']({
      commandId: t.cmd(),
      businessId: s.businessId,
      date: '2026-11-14',
      slot: 'dinner',
      expected: null,
    });
    // Nothing is left in the count: it is taken off, so the command returns no id.
    expect(first.mealId).toBeDefined();
    expect(cleared).toEqual({});
    expect(
      await s.run['plan.mealsSet']({
        commandId: t.cmd(),
        businessId: s.businessId,
        date: '2026-11-14',
        slot: 'dinner',
        expected: null,
      }),
    ).toEqual({});
    const list = await s.run['plan.mealsList']({
      businessId: s.businessId,
      from: '2026-11-14',
      to: '2026-11-14',
    });
    expect(list.meals).toEqual([]);
    expect(
      await s.run['plan.mealsSet']({
        commandId: t.cmd(),
        businessId: s.businessId,
        date: '2026-11-14',
        slot: 'dinner',
      }),
    ).toEqual({});
  });

  it('counts per line, and refuses a line that does not exist', async () => {
    const s = await setup();
    const { t } = s;
    const menu = await s.run['plan.lineCreate']({
      commandId: t.cmd(),
      businessId: s.businessId,
      name: 'Menü 1',
      freeOf: [],
    });
    const counted = await s.run['plan.mealsSet']({
      commandId: t.cmd(),
      businessId: s.businessId,
      date: '2026-11-14',
      slot: 'lunch',
      lineId: menu.lineId,
      expected: 12,
    });
    expect(counted.mealId).toBeDefined();
    const list = await s.run['plan.mealsList']({
      businessId: s.businessId,
      from: '2026-11-14',
      to: '2026-11-14',
    });
    expect(list.meals[0]?.lineId).toBe(menu.lineId);
    await expect(
      s.run['plan.mealsSet']({
        commandId: t.cmd(),
        businessId: s.businessId,
        date: '2026-11-14',
        slot: 'lunch',
        lineId: t.cmd(),
        expected: 1,
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('plan.weighings', () => {
  it('weighs a plate return and a serving leftover, lists them and removes one', async () => {
    const s = await setup();
    const { t } = s;
    const plate = await s.run['plan.weighingAdd']({
      commandId: t.cmd(),
      businessId: s.businessId,
      date: '2026-11-14',
      slot: 'lunch',
      kind: 'plate',
      grams: 4200,
      note: 'Kartoffeln',
    });
    await s.run['plan.weighingAdd']({
      commandId: t.cmd(),
      businessId: s.businessId,
      date: '2026-11-13',
      kind: 'production',
      grams: 900,
    });
    const listed = await s.run['plan.weighingsList']({
      businessId: s.businessId,
      from: '2026-11-09',
      to: '2026-11-15',
    });
    expect(listed.weighings.map((row) => [row.date, row.kind, row.grams])).toEqual([
      ['2026-11-13', 'production', 900],
      ['2026-11-14', 'plate', 4200],
    ]);
    await s.run['plan.weighingRemove']({
      commandId: t.cmd(),
      businessId: s.businessId,
      weighingId: plate.weighingId,
    });
    const after = await s.run['plan.weighingsList']({
      businessId: s.businessId,
      from: '2026-11-09',
      to: '2026-11-15',
    });
    expect(after.weighings).toHaveLength(1);
    await expect(
      s.run['plan.weighingRemove']({
        commandId: t.cmd(),
        businessId: s.businessId,
        weighingId: plate.weighingId,
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('refuses a line that does not exist for a weighing', async () => {
    const s = await setup();
    await expect(
      s.run['plan.weighingAdd']({
        commandId: s.t.cmd(),
        businessId: s.businessId,
        date: '2026-11-14',
        kind: 'serving',
        grams: 10,
        lineId: s.t.cmd(),
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('plan writes stay out of the stock ledger', () => {
  it('leaves every lot equal to the movements of its article after runs, plans and counts', async () => {
    const s = await setup();
    const { kitchen, t } = s;
    await s.run['production.record']({
      commandId: t.cmd(),
      businessId: s.businessId,
      recipeId: kitchen.recipes.jus.id,
      portions: 1,
    });
    await s.run['production.record']({
      commandId: t.cmd(),
      businessId: s.businessId,
      recipeId: kitchen.recipes.entrecoteDish.id,
      portions: 10,
    });
    await s.run['plan.add']({
      commandId: t.cmd(),
      businessId: s.businessId,
      date: '2026-11-14',
      slot: 'lunch',
      recipeId: kitchen.recipes.salmonDish.id,
      portions: 4,
    });
    await s.run['plan.mealsSet']({
      commandId: t.cmd(),
      businessId: s.businessId,
      date: '2026-11-14',
      slot: 'lunch',
      expected: 4,
      served: 4,
    });
    await s.run['plan.weighingAdd']({
      commandId: t.cmd(),
      businessId: s.businessId,
      date: '2026-11-14',
      kind: 'plate',
      grams: 300,
    });
    const lots = (await t.storage.lots.ofBusiness(s.businessId)).filter(
      (lot) => lot.deletedAt === undefined,
    );
    const movements = await t.storage.movements.ofBusiness(s.businessId);
    for (const articleId of new Set(lots.map((lot) => lot.articleId))) {
      const onLots = lots
        .filter((lot) => lot.articleId === articleId)
        .reduce((sum, lot) => sum + lot.quantity, 0);
      const onMovements = movements
        .filter((move) => move.articleId === articleId)
        .reduce((sum, move) => sum + move.quantity, 0);
      expect(Math.round(onLots * 1000)).toBe(Math.round(onMovements * 1000));
    }
    expect(movements.length).toBeGreaterThan(0);
  });
});
