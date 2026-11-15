import { describe, expect, it } from 'vitest';
import {
  addDays,
  CommandError,
  createStockLedger,
  RecipeSchema,
  SaleSchema,
  type Id,
} from '../src';
import { createTestContext, seedKitchen } from '../src/testing';

/**
 * «Menüplan» on the test kitchen (seedKitchen). Today is Saturday 14.11.2026, so the week of
 * that day starts on Monday 09.11.2026 (KW 46). Lots: salmon 1 500 g use by 15.11. at CHF 38.00/kg;
 * cream 3 000 ml best before 20.11. and 5 000 ml; entrecôte 4 000 g use by 16.11.; no jus in stock.
 */
async function setup() {
  const t = await createTestContext();
  const kitchen = await seedKitchen(t);
  return { t, kitchen, run: t.useCases, businessId: t.businessId };
}

type Setup = Awaited<ReturnType<typeof setup>>;

async function add(
  s: Setup,
  input: {
    date: string;
    slot: 'lunch' | 'dinner' | 'breakfast';
    recipeId: Id;
    portions: number;
    lineId?: Id;
    note?: string;
  },
) {
  return s.run['plan.add']({ commandId: s.t.cmd(), businessId: s.businessId, ...input });
}

describe('plan.week', () => {
  it('shows the week of a day as seven days, with the dishes, cost and margin of each', async () => {
    const s = await setup();
    const { kitchen } = s;
    await add(s, {
      date: '2026-11-14',
      slot: 'lunch',
      recipeId: kitchen.recipes.salmonDish.id,
      portions: 4,
    });
    const week = await s.run['plan.week']({ businessId: s.businessId, weekStart: '2026-11-14' });
    expect(week).toMatchObject({
      weekStart: '2026-11-09',
      weekEnd: '2026-11-15',
      today: '2026-11-14',
    });
    expect(week.days.map((day) => day.date)).toEqual([
      '2026-11-09',
      '2026-11-10',
      '2026-11-11',
      '2026-11-12',
      '2026-11-13',
      '2026-11-14',
      '2026-11-15',
    ]);
    expect(week.slots).toEqual(['lunch']);
    const saturday = week.days[5];
    // Four portions of the salmon: goods CHF 26.80 (CHF 6.70 a portion), menu price CHF 34.00 with
    // 8.1 % VAT, so CHF 31.45 net: 21.3 % food cost, well in the 30 % target.
    expect(saturday?.entries).toEqual([
      expect.objectContaining({
        recipeName: 'Lachs mit Rahmsauce',
        portions: 4,
        slot: 'lunch',
        costPerPortionRappen: 670,
        costIncomplete: false,
        priceRappen: 3400,
        marginStatus: 'good',
        foodCostBps: 2130,
        produced: false,
      }),
    ]);
    expect(saturday).toMatchObject({
      portions: 4,
      netRevenueRappen: 12_580,
      costRappen: 2680,
      unpricedEntries: 0,
    });
    expect(week).toMatchObject({
      entries: 1,
      open: 1,
      portions: 4,
      netRevenueRappen: 12_580,
      costRappen: 2680,
    });
  });

  it('shows the allergens of a day and line, and warns when a promise of the line is not kept', async () => {
    const s = await setup();
    const { kitchen, t } = s;
    const line = await s.run['plan.lineCreate']({
      commandId: t.cmd(),
      businessId: s.businessId,
      name: 'Menü 1',
      slot: 'lunch',
      requiredDiet: 'vegan',
      freeOf: ['milk'],
    });
    await add(s, {
      date: '2026-11-14',
      slot: 'lunch',
      recipeId: kitchen.recipes.salmonDish.id,
      portions: 4,
      lineId: line.lineId,
    });
    const week = await s.run['plan.week']({ businessId: s.businessId, weekStart: '2026-11-09' });
    const menu = week.days[5]?.lines[0];
    // Salmon (fish), cream and butter (milk): the dish is omnivore and contains milk.
    expect(menu).toMatchObject({
      lineId: line.lineId,
      name: 'Menü 1',
      entries: 1,
      portions: 4,
      diet: 'omnivore',
      incomplete: false,
    });
    expect(menu?.allergens).toEqual(expect.arrayContaining(['fish', 'milk']));
    expect(menu?.warnings).toEqual(
      expect.arrayContaining([
        { kind: 'diet', requiredDiet: 'vegan', diet: 'omnivore' },
        { kind: 'allergen', allergen: 'milk', trace: false },
      ]),
    );
    // Lines of a week without dishes on a day have nothing to show there.
    expect(week.days[0]?.lines).toEqual([]);
  });

  it('lists the demand of the open dishes against the stock, and marks the produced ones as done', async () => {
    const s = await setup();
    const { kitchen } = s;
    await add(s, {
      date: '2026-11-14',
      slot: 'lunch',
      recipeId: kitchen.recipes.salmonDish.id,
      portions: 4,
    });
    await add(s, {
      date: '2026-11-15',
      slot: 'dinner',
      recipeId: kitchen.recipes.entrecoteDish.id,
      portions: 10,
    });
    const week = await s.run['plan.week']({ businessId: s.businessId, weekStart: '2026-11-09' });
    // Salmon 640 g (1 500 usable), cream 300 ml and butter 40 g for four portions; the entrecôte
    // for ten portions needs 2 000 g entrecôte (4 000 usable), 500 ml jus (none in stock).
    const demand = Object.fromEntries(week.demand.map((row) => [row.name, row]));
    expect(demand.Lachsfilet).toMatchObject({
      needed: 640,
      usable: 1500,
      missing: 0,
      entries: 1,
    });
    expect(demand.Rotweinjus).toMatchObject({
      needed: 500,
      usable: 0,
      missing: 500,
      entries: 1,
    });
    expect(demand['Rindsentrecôte']).toMatchObject({ needed: 2000, missing: 0 });
    expect(week.demand[0]?.name).toBe('Rotweinjus');
    expect(week.slots).toEqual(['lunch', 'dinner']);
    expect(week.open).toBe(2);
  });

  it('does not show the week of another business', async () => {
    const s = await setup();
    await add(s, {
      date: '2026-11-14',
      slot: 'lunch',
      recipeId: s.kitchen.recipes.salmonDish.id,
      portions: 4,
    });
    const other = await createTestContext({ storage: s.t.storage, idStart: 30_000 });
    const week = await other.useCases['plan.week']({
      businessId: other.businessId,
      weekStart: '2026-11-09',
    });
    expect(week).toMatchObject({ entries: 0, open: 0, portions: 0, slots: ['lunch'] });
  });
});

describe('plan.add, plan.update, plan.remove', () => {
  it('plans a dish, and refuses a component, an inactive dish and a line of another meal', async () => {
    const s = await setup();
    const { kitchen, t } = s;
    const planned = await add(s, {
      date: '2026-11-14',
      slot: 'lunch',
      recipeId: kitchen.recipes.salmonDish.id,
      portions: 4,
    });
    expect(await t.storage.planEntries.get(planned.entryId)).toMatchObject({
      slot: 'lunch',
      portions: 4,
      date: '2026-11-14',
    });
    const events = await t.storage.events.ofBusiness(s.businessId);
    expect(events.map((event) => event.type)).toContain('plan.entry_added');
    await expect(
      add(s, { date: '2026-11-14', slot: 'lunch', recipeId: kitchen.recipes.jus.id, portions: 1 }),
    ).rejects.toMatchObject({ code: 'invalid' });
    await t.storage.recipes.put({
      ...kitchen.recipes.salmonDish,
      active: false,
      updatedAt: t.clock.now(),
    });
    await expect(
      add(s, {
        date: '2026-11-14',
        slot: 'lunch',
        recipeId: kitchen.recipes.salmonDish.id,
        portions: 4,
      }),
    ).rejects.toMatchObject({ code: 'not_allowed' });
    await expect(
      add(s, { date: '2026-11-14', slot: 'lunch', recipeId: s.t.cmd(), portions: 4 }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('refuses a line that is inactive, or that belongs to another meal', async () => {
    const s = await setup();
    const { kitchen, t } = s;
    const breakfast = await s.run['plan.lineCreate']({
      commandId: t.cmd(),
      businessId: s.businessId,
      name: 'Frühstück',
      slot: 'breakfast',
      freeOf: [],
    });
    await expect(
      add(s, {
        date: '2026-11-14',
        slot: 'lunch',
        recipeId: kitchen.recipes.salmonDish.id,
        portions: 4,
        lineId: breakfast.lineId,
      }),
    ).rejects.toMatchObject({ code: 'invalid' });
    await s.run['plan.lineUpdate']({
      commandId: t.cmd(),
      businessId: s.businessId,
      lineId: breakfast.lineId,
      active: false,
    });
    await expect(
      add(s, {
        date: '2026-11-14',
        slot: 'breakfast',
        recipeId: kitchen.recipes.salmonDish.id,
        portions: 4,
        lineId: breakfast.lineId,
      }),
    ).rejects.toMatchObject({ code: 'not_allowed' });
  });

  it('changes an entry, clears its line and note, and takes it off the plan', async () => {
    const s = await setup();
    const { kitchen, t } = s;
    const line = await s.run['plan.lineCreate']({
      commandId: t.cmd(),
      businessId: s.businessId,
      name: 'Menü 2',
      freeOf: [],
    });
    const entry = await add(s, {
      date: '2026-11-14',
      slot: 'lunch',
      recipeId: kitchen.recipes.salmonDish.id,
      portions: 4,
      lineId: line.lineId,
      note: 'Probe',
    });
    await s.run['plan.update']({
      commandId: t.cmd(),
      businessId: s.businessId,
      entryId: entry.entryId,
      portions: 6,
      date: '2026-11-15',
      slot: 'dinner',
      lineId: null,
      note: null,
    });
    const moved = await s.t.storage.planEntries.get(entry.entryId);
    expect(moved).toMatchObject({ portions: 6, date: '2026-11-15', slot: 'dinner' });
    expect(moved).not.toHaveProperty('lineId');
    expect(moved).not.toHaveProperty('note');
    await s.run['plan.remove']({
      commandId: t.cmd(),
      businessId: s.businessId,
      entryId: entry.entryId,
    });
    const week = await s.run['plan.week']({ businessId: s.businessId, weekStart: '2026-11-09' });
    expect(week.entries).toBe(0);
    await expect(
      s.run['plan.update']({
        commandId: t.cmd(),
        businessId: s.businessId,
        entryId: s.t.cmd(),
        portions: 2,
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
    await expect(
      s.run['plan.remove']({ commandId: t.cmd(), businessId: s.businessId, entryId: s.t.cmd() }),
    ).rejects.toBeInstanceOf(CommandError);
  });

  it('checks the dish again when an entry moves to a meal the line does not suit', async () => {
    const s = await setup();
    const { kitchen, t } = s;
    const line = await s.run['plan.lineCreate']({
      commandId: t.cmd(),
      businessId: s.businessId,
      name: 'Mittag',
      slot: 'lunch',
      freeOf: [],
    });
    const entry = await add(s, {
      date: '2026-11-14',
      slot: 'lunch',
      recipeId: kitchen.recipes.salmonDish.id,
      portions: 4,
      lineId: line.lineId,
    });
    await expect(
      s.run['plan.update']({
        commandId: t.cmd(),
        businessId: s.businessId,
        entryId: entry.entryId,
        slot: 'dinner',
      }),
    ).rejects.toMatchObject({ code: 'invalid' });
  });
});

describe('plan.copyWeek', () => {
  it('copies a week into an empty week, shifted by the days between them, without productions', async () => {
    const s = await setup();
    const { kitchen, t } = s;
    await add(s, {
      date: '2026-11-14',
      slot: 'lunch',
      recipeId: kitchen.recipes.salmonDish.id,
      portions: 4,
    });
    await add(s, {
      date: '2026-11-15',
      slot: 'dinner',
      recipeId: kitchen.recipes.entrecoteDish.id,
      portions: 10,
    });
    const copied = await s.run['plan.copyWeek']({
      commandId: t.cmd(),
      businessId: s.businessId,
      fromWeekStart: '2026-11-09',
      toWeekStart: '2026-11-16',
    });
    expect(copied).toEqual({ copied: 2, skipped: 0 });
    const next = await s.run['plan.week']({ businessId: s.businessId, weekStart: '2026-11-16' });
    expect(
      next.days.flatMap((day) =>
        day.entries.map((entry) => [entry.date, entry.slot, entry.recipeName, entry.portions]),
      ),
    ).toEqual([
      ['2026-11-21', 'lunch', 'Lachs mit Rahmsauce', 4],
      ['2026-11-22', 'dinner', 'Entrecôte mit Rotweinjus und Kartoffelstock', 10],
    ]);
  });

  it('skips the entries whose dish or line is no longer allowed, and says how many', async () => {
    const s = await setup();
    const { kitchen, t } = s;
    const line = await s.run['plan.lineCreate']({
      commandId: t.cmd(),
      businessId: s.businessId,
      name: 'Menü 1',
      freeOf: [],
    });
    await add(s, {
      date: '2026-11-14',
      slot: 'lunch',
      recipeId: kitchen.recipes.salmonDish.id,
      portions: 4,
    });
    await add(s, {
      date: '2026-11-15',
      slot: 'dinner',
      recipeId: kitchen.recipes.entrecoteDish.id,
      portions: 10,
      lineId: line.lineId,
    });
    await add(s, {
      date: '2026-11-13',
      slot: 'lunch',
      recipeId: kitchen.recipes.entrecoteDish.id,
      portions: 10,
    });
    // The salmon dish is taken off the menu and the line is deactivated after the entries came in.
    await t.storage.recipes.put({ ...kitchen.recipes.salmonDish, active: false });
    await s.run['plan.lineUpdate']({
      commandId: t.cmd(),
      businessId: s.businessId,
      lineId: line.lineId,
      active: false,
    });
    const copied = await s.run['plan.copyWeek']({
      commandId: t.cmd(),
      businessId: s.businessId,
      fromWeekStart: '2026-11-09',
      toWeekStart: '2026-11-16',
    });
    expect(copied).toEqual({ copied: 1, skipped: 2 });
    const next = await s.run['plan.week']({ businessId: s.businessId, weekStart: '2026-11-16' });
    expect(
      next.days.flatMap((day) =>
        day.entries.map((entry) => [entry.date, entry.slot, entry.recipeName]),
      ),
    ).toEqual([['2026-11-20', 'lunch', 'Entrecôte mit Rotweinjus und Kartoffelstock']]);
    expect(await t.storage.planEntries.ofBusiness(s.businessId)).toHaveLength(4);
  });

  it('refuses a week that is not empty and copying a week onto itself', async () => {
    const s = await setup();
    const { kitchen, t } = s;
    await add(s, {
      date: '2026-11-14',
      slot: 'lunch',
      recipeId: kitchen.recipes.salmonDish.id,
      portions: 4,
    });
    await add(s, {
      date: '2026-11-16',
      slot: 'lunch',
      recipeId: kitchen.recipes.salmonDish.id,
      portions: 2,
    });
    await expect(
      s.run['plan.copyWeek']({
        commandId: t.cmd(),
        businessId: s.businessId,
        fromWeekStart: '2026-11-09',
        toWeekStart: '2026-11-09',
      }),
    ).rejects.toMatchObject({ code: 'invalid' });
    await expect(
      s.run['plan.copyWeek']({
        commandId: t.cmd(),
        businessId: s.businessId,
        fromWeekStart: '2026-11-16',
        toWeekStart: '2026-11-09',
      }),
    ).rejects.toMatchObject({ code: 'not_allowed' });
  });
});

describe('plan.suggest («Reste verwerten»)', () => {
  it('ranks the salmon dish first: it saves 1 440 g of the 1 500 g that are due tomorrow, CHF 54.72', async () => {
    const s = await setup();
    const result = await s.run['plan.suggest']({
      businessId: s.businessId,
      from: '2026-11-14',
      days: 7,
    });
    const [first] = result.suggestions;
    // The salmon is due on 15.11.: 9 portions of 160 g use 1 440 g; the cream and butter cover that.
    expect(first).toMatchObject({
      articleName: 'Lachsfilet',
      recipeName: 'Lachs mit Rahmsauce',
      expiringQuantity: 1500,
      daysLeft: 1,
      portions: 9,
      usedQuantity: 1440,
      savedRappen: 5472,
      latestCookOn: '2026-11-15',
      proposedOn: '2026-11-14',
      proposedSlot: 'lunch',
      ready: true,
      missing: [],
    });
    // The entrecôte dish needs jus, which is not in stock: listed, and what is short is named.
    expect(
      result.suggestions.find(
        (row) => row.recipeName === 'Entrecôte mit Rotweinjus und Kartoffelstock',
      ),
    ).toMatchObject({
      ready: false,
      missing: [expect.objectContaining({ name: 'Rotweinjus', missing: 1000 })],
    });
  });

  it('leaves out lots outside the days asked for', async () => {
    const s = await setup();
    const result = await s.run['plan.suggest']({
      businessId: s.businessId,
      from: '2026-11-14',
      days: 1,
    });
    expect(result.suggestions.map((row) => row.articleName)).toEqual(['Lachsfilet']);
  });
});

describe('plan.autoFill', () => {
  it('fills the empty meals of a week: the salmon today at lunch, then the best dish by margin and sales', async () => {
    const s = await setup();
    const { t } = s;
    const result = await s.run['plan.autoFill']({
      commandId: t.cmd(),
      businessId: s.businessId,
      weekStart: '2026-11-09',
      slots: ['lunch', 'dinner'],
    });
    expect(result.skipped).toBe(2);
    expect(
      result.planned.map((entry) => [
        entry.date,
        entry.slot,
        entry.recipeName,
        entry.portions,
        entry.reason.kind,
      ]),
    ).toEqual([
      ['2026-11-14', 'lunch', 'Lachs mit Rahmsauce', 9, 'expiring'],
      ['2026-11-14', 'dinner', 'Entrecôte mit Rotweinjus und Kartoffelstock', 10, 'ranking'],
    ]);
    // The salmon is planned today, before the day its stock falls due.
    const [first] = result.planned;
    expect(first?.date).toBe('2026-11-14');
    expect(first?.reason).toMatchObject({
      articleName: 'Lachsfilet',
      expiresOn: '2026-11-15',
      savedRappen: 5472,
    });
    const rows = await t.storage.planEntries.ofBusiness(s.businessId);
    expect(rows).toHaveLength(2);
  });

  it('keeps the entries of the week that are there, and never plans a dish twice in the week', async () => {
    const s = await setup();
    const { kitchen, t } = s;
    const existing = await add(s, {
      date: '2026-11-14',
      slot: 'lunch',
      recipeId: kitchen.recipes.entrecoteDish.id,
      portions: 6,
    });
    const result = await s.run['plan.autoFill']({
      commandId: t.cmd(),
      businessId: s.businessId,
      weekStart: '2026-11-09',
      slots: ['lunch', 'dinner'],
    });
    // The lunch of today stays with the dish that is there. The salmon fits dinner today.
    expect(result.planned.map((entry) => [entry.date, entry.slot, entry.recipeName])).toEqual([
      ['2026-11-14', 'dinner', 'Lachs mit Rahmsauce'],
    ]);
    expect(result.skipped).toBe(2);
    expect(await t.storage.planEntries.get(existing.entryId)).toMatchObject({
      portions: 6,
      slot: 'lunch',
    });
  });

  it('plans the average sold per day of a dish, from the sales of the last 28 days', async () => {
    const s = await setup();
    const { kitchen, t } = s;
    await t.storage.sales.add(
      SaleSchema.parse({
        id: t.cmd(),
        businessId: s.businessId,
        soldOn: '2026-11-01',
        recipeId: kitchen.recipes.entrecoteDish.id,
        portions: 56,
        grossRappen: 0,
        vatBps: 810,
        bookedStock: false,
        createdAt: t.clock.now(),
        updatedAt: t.clock.now(),
      }),
    );
    const result = await s.run['plan.autoFill']({
      commandId: t.cmd(),
      businessId: s.businessId,
      weekStart: '2026-11-16',
      slots: ['lunch'],
    });
    // The cream is best before 20.11.: the salmon dish takes 9 × 75 ml of it on the 16th, which saves
    // CHF 4.32, a day before the stock falls due. The entrecôte then comes from the sales: 56 portions in 28
    // days is 2 a day, so the 17th gets 2 portions.
    expect(
      result.planned.map((entry) => [
        entry.date,
        entry.slot,
        entry.recipeName,
        entry.portions,
        entry.reason,
      ]),
    ).toEqual([
      [
        '2026-11-16',
        'lunch',
        'Lachs mit Rahmsauce',
        9,
        expect.objectContaining({
          kind: 'expiring',
          articleName: 'Vollrahm',
          quantity: 675,
          savedRappen: 432,
        }),
      ],
      [
        '2026-11-17',
        'lunch',
        'Entrecôte mit Rotweinjus und Kartoffelstock',
        2,
        expect.objectContaining({ kind: 'ranking', soldLast28: 56 }),
      ],
    ]);
    expect(result.skipped).toBe(5);
  });

  it('plans nothing for days that have already passed', async () => {
    const s = await setup();
    const result = await s.run['plan.autoFill']({
      commandId: s.t.cmd(),
      businessId: s.businessId,
      weekStart: '2026-11-02',
      slots: ['lunch'],
    });
    expect(result).toEqual({ planned: [], skipped: 0 });
  });

  it('fills several dishes per meal when asked', async () => {
    const s = await setup();
    const result = await s.run['plan.autoFill']({
      commandId: s.t.cmd(),
      businessId: s.businessId,
      weekStart: '2026-11-09',
      slots: ['dinner'],
      dishesPerSlot: 2,
    });
    expect(result.planned.map((entry) => [entry.date, entry.recipeName])).toEqual([
      ['2026-11-14', 'Lachs mit Rahmsauce'],
      ['2026-11-14', 'Entrecôte mit Rotweinjus und Kartoffelstock'],
    ]);
  });
});

describe('plan.autoFill and plan.suggest with more portions than a plan entry takes', () => {
  it('caps the portions at 10 000 and leaves the rest of the lot in stock', async () => {
    const s = await setup();
    const { kitchen, t } = s;
    const today = t.clock.today();
    // An egg dish of one egg a portion: the lot of 12 000 eggs would make 12 000 portions.
    const eggDish = RecipeSchema.parse({
      id: t.cmd(),
      businessId: s.businessId,
      name: 'Eierspeise',
      kind: 'dish',
      course: 'main',
      portions: 1,
      ingredients: [{ articleId: kitchen.articles.eggs.id, quantity: 1 }],
      steps: [],
      vatBps: 810,
      extraAllergens: [],
      extraTraces: [],
      labels: [],
      active: true,
      createdAt: t.clock.now(),
      updatedAt: t.clock.now(),
    });
    await t.storage.recipes.add(eggDish);
    const bigLot = await t.storage.transaction(() =>
      createStockLedger(t.ctx).receive({
        businessId: s.businessId,
        articleId: kitchen.articles.eggs.id,
        areaId: kitchen.areas.cold.id,
        quantity: 12_000,
        pricePer1000: 1000,
        receivedOn: today,
        expiresOn: addDays(today, 3),
        origin: 'opening',
      }),
    );
    const suggestions = await s.run['plan.suggest']({
      businessId: s.businessId,
      from: today,
      days: 7,
    });
    expect(suggestions.suggestions.find((row) => row.lotId === bigLot.id)).toMatchObject({
      portions: 10_000,
      usedQuantity: 10_000,
    });
    const result = await s.run['plan.autoFill']({
      commandId: t.cmd(),
      businessId: s.businessId,
      weekStart: '2026-11-16',
      slots: ['lunch'],
    });
    // The eggs fall due on the 17th: the week of the 16th is the one that uses them.
    expect(result.planned[0]).toMatchObject({
      date: '2026-11-16',
      recipeName: 'Eierspeise',
      portions: 10_000,
      reason: { kind: 'expiring', quantity: 10_000, unit: 'pcs' },
    });
    expect((await t.storage.lots.get(bigLot.id))?.quantity).toBe(12_000);
  });
});
