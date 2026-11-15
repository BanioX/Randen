import { describe, expect, it } from 'vitest';
import { CommandError, createStockLedger } from '../src';
import { createTestContext, seedKitchen } from '../src/testing';
import { ArticleSchema, type Id } from '../src';

/**
 * «Produktion» on the test kitchen (seedKitchen): every number here is worked out by hand in the
 * comments. Today is 14.11.2026. Lots: onions 10 000 g at CHF 2.20/kg, wine 6 000 ml at CHF 9.00/l,
 * butter 2 000 g at CHF 14.00/kg, entrecôte 4 000 g at CHF 62.00/kg (use by 16.11.), salmon 1 500 g
 * at CHF 38.00/kg (use by 15.11.), cream 3 000 ml at CHF 6.40/l (best before 20.11.) and 5 000 ml.
 */
async function setup() {
  const t = await createTestContext();
  const kitchen = await seedKitchen(t);
  return { t, kitchen, run: t.useCases, businessId: t.businessId };
}

type Setup = Awaited<ReturnType<typeof setup>>;

/** Records a production, with the command id of the test. */
async function record(
  s: Setup,
  input: Record<string, unknown> & { recipeId: Id; portions: number },
) {
  return s.run['production.record']({ commandId: s.t.cmd(), businessId: s.businessId, ...input });
}

/** The id of the output lot of a run that made one; fails the test otherwise. */
function outputIdOf(lotId: Id | undefined): Id {
  if (lotId === undefined) {
    throw new Error('expected an output lot');
  }
  return lotId;
}

/** The lot a run produced, read back from the storage. */
async function outputLotOf(s: Setup, lotId: Id | undefined) {
  if (lotId === undefined) {
    throw new Error('expected an output lot');
  }
  const lot = await s.t.storage.lots.get(lotId);
  if (lot === undefined) {
    throw new Error('output lot missing');
  }
  return lot;
}

describe('production.preview', () => {
  it('shows what the Rotweinjus takes, costs and makes: CHF 7.89 for 1 l', async () => {
    const s = await setup();
    const { kitchen } = s;
    const preview = await s.run['production.preview']({
      businessId: s.businessId,
      recipeId: kitchen.recipes.jus.id,
      portions: 1,
    });
    // Onions 170 g net at 85 % yield = 200 g gross: 200 × CHF 2.20/kg = CHF 0.44.
    // Wine 750 ml at CHF 9.00/l = CHF 6.75. Butter 50 g at CHF 14.00/kg = CHF 0.70. Total CHF 7.89.
    expect(preview.costRappen).toBe(789);
    expect(preview.costPerPortionRappen).toBe(789);
    expect(preview.shortages).toEqual([]);
    const onions = preview.ingredients.find((row) => row.articleId === kitchen.articles.onions.id);
    expect(onions).toMatchObject({
      quantity: 200,
      netQuantity: 170,
      missing: 0,
      usable: 10_000,
      valueRappen: 44,
    });
    expect(onions?.takes).toEqual([
      expect.objectContaining({ lotId: kitchen.lots.onions.id, quantity: 200, valueRappen: 44 }),
    ]);
    // The jus makes 1 l: the usual area of the article and today plus the Richtwert of 3 days.
    expect(preview.output).toMatchObject({
      articleId: kitchen.articles.jus.id,
      name: 'Rotweinjus',
      unit: 'ml',
      quantity: 1000,
      proposedAreaId: kitchen.areas.cold.id,
      proposedExpiresOn: '2026-11-17',
      shelfLifeDays: 3,
    });
  });

  it('shows the shortage of the entrecôte dish without jus, and books the rest', async () => {
    const s = await setup();
    const { kitchen } = s;
    const preview = await s.run['production.preview']({
      businessId: s.businessId,
      recipeId: kitchen.recipes.entrecoteDish.id,
      portions: 10,
    });
    // The jus is not in stock: 500 ml short. Everything else is there.
    expect(preview.shortages).toEqual([
      { articleId: kitchen.articles.jus.id, name: 'Rotweinjus', unit: 'ml', missing: 500 },
    ]);
    // Entrecôte 2 000 g gross at CHF 62.00/kg = 124.00; potatoes 2 500 g at CHF 1.80/kg = 4.50;
    // cream 400 ml at CHF 6.40/l = 2.56; butter 150 g at CHF 14.00/kg = 2.10. Total CHF 133.16.
    expect(preview.costRappen).toBe(13_316);
    expect(preview.costPerPortionRappen).toBe(1332);
    expect(preview.output).toBeUndefined();
  });

  it('lists the lots past their Verbrauchsdatum apart, and does not count them as usable', async () => {
    const s = await setup();
    const { kitchen } = s;
    s.t.clock.setToday('2026-11-16');
    const preview = await s.run['production.preview']({
      businessId: s.businessId,
      recipeId: kitchen.recipes.salmonDish.id,
      portions: 4,
    });
    const salmon = preview.ingredients.find((row) => row.articleId === kitchen.articles.salmon.id);
    // The salmon was due on 15.11.: nothing usable, the whole 640 g are short.
    expect(salmon).toMatchObject({ usable: 0, missing: 640, takes: [] });
    expect(salmon?.unusable).toEqual([
      {
        lotId: kitchen.lots.salmon.id,
        areaId: kitchen.areas.cold.id,
        expiresOn: '2026-11-15',
        quantity: 1500,
      },
    ]);
  });

  it('values what a dish takes at the lot prices: CHF 26.80 for four portions of the salmon', async () => {
    const s = await setup();
    const preview = await s.run['production.preview']({
      businessId: s.businessId,
      recipeId: s.kitchen.recipes.salmonDish.id,
      portions: 4,
    });
    // Salmon 640 g: 1 500 g lot, 640 taken: CHF 57.00 − CHF 32.68 = CHF 24.32.
    // Cream 300 ml from the older lot: CHF 1.92. Butter 40 g: CHF 0.56. Total CHF 26.80, CHF 6.70 a portion.
    expect(preview.costRappen).toBe(2680);
    expect(preview.costPerPortionRappen).toBe(670);
    expect(preview.output).toBeUndefined();
  });

  it('does not show a recipe of another business', async () => {
    const s = await setup();
    const other = await createTestContext({ storage: s.t.storage, idStart: 10_000 });
    await expect(
      other.useCases['production.preview']({
        businessId: other.businessId,
        recipeId: s.kitchen.recipes.jus.id,
        portions: 1,
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('fails for a recipe that does not exist', async () => {
    const s = await setup();
    await expect(
      s.run['production.preview']({
        businessId: s.businessId,
        recipeId: s.t.cmd(),
        portions: 1,
      }),
    ).rejects.toBeInstanceOf(CommandError);
  });
});

describe('production.record', () => {
  it('books one batch of Rotweinjus: CHF 7.89 for 1 l, into the cold area for three days', async () => {
    const s = await setup();
    const { kitchen, t } = s;
    const result = await record(s, { recipeId: kitchen.recipes.jus.id, portions: 1 });
    expect(result).toMatchObject({ costRappen: 789, costPerPortionRappen: 789, shortages: [] });
    const lot = await outputLotOf(s, result.outputLotId);
    // A new lot of 1 000 ml at CHF 7.89 per litre (789 Rappen per 1 000 ml), received today, due in
    // three days, kept in the cold area, booked as produced.
    expect(lot).toMatchObject({
      articleId: kitchen.articles.jus.id,
      areaId: kitchen.areas.cold.id,
      quantity: 1000,
      initialQuantity: 1000,
      pricePer1000: 789,
      receivedOn: '2026-11-14',
      expiresOn: '2026-11-17',
      origin: 'production',
      productionId: result.productionId,
      status: 'active',
    });
    // The article remembers the new price: CHF 7.89 per litre.
    expect((await t.storage.articles.get(kitchen.articles.jus.id))?.pricePer1000).toBe(789);
    // The onions and the wine left the stock, first in first out.
    expect((await t.storage.lots.get(kitchen.lots.onions.id))?.quantity).toBe(9800);
    expect((await t.storage.lots.get(kitchen.lots.redWine.id))?.quantity).toBe(5250);
    // The run is kept, and the event says so.
    const production = await t.storage.productions.get(result.productionId);
    expect(production).toMatchObject({
      recipeId: kitchen.recipes.jus.id,
      portions: 1,
      producedOn: '2026-11-14',
      costRappen: 789,
      outputLotId: result.outputLotId,
      shortages: [],
      producedBy: t.actor,
    });
    const events = await t.storage.events.ofBusiness(s.businessId);
    expect(events.find((event) => event.type === 'production.recorded')?.payload).toMatchObject({
      productionId: result.productionId,
      recipeId: kitchen.recipes.jus.id,
      shortages: 0,
    });
  });

  it('books everything the entrecôte dish needs and records the jus as a shortage', async () => {
    const s = await setup();
    const { kitchen, t } = s;
    const result = await record(s, { recipeId: kitchen.recipes.entrecoteDish.id, portions: 10 });
    // 5 dl jus missing; the dish is made anyway.
    expect(result).toMatchObject({ costRappen: 13_316, costPerPortionRappen: 1332 });
    expect(result.shortages).toEqual([
      { articleId: kitchen.articles.jus.id, name: 'Rotweinjus', unit: 'ml', missing: 500 },
    ]);
    expect(result).not.toHaveProperty('outputLotId');
    // The rest is booked: 2 000 g entrecôte left of 4 000 g.
    expect((await t.storage.lots.get(kitchen.lots.entrecote.id))?.quantity).toBe(2000);
    expect((await t.storage.lots.get(kitchen.lots.creamOld.id))?.quantity).toBe(2600);
    expect((await t.storage.lots.get(kitchen.lots.butter.id))?.quantity).toBe(1850);
    // A dish has no output lot of its own here: the lot count does not grow.
    expect(
      (await t.storage.lots.ofBusiness(s.businessId)).filter((lot) => lot.origin === 'production'),
    ).toEqual([]);
  });

  it('does not remember the price of a run with shortages', async () => {
    const s = await setup();
    const { kitchen, t } = s;
    // The wine is used up before the jus is made: 750 ml missing.
    await t.storage.transaction(async () => {
      await createStockLedger(t.ctx).consumeLot({
        businessId: s.businessId,
        lotId: kitchen.lots.redWine.id,
        quantity: 6000,
        on: t.clock.today(),
        purpose: 'kitchen',
      });
    });
    const result = await record(s, { recipeId: kitchen.recipes.jus.id, portions: 1 });
    expect(result.shortages).toEqual([
      {
        articleId: kitchen.articles.redWine.id,
        name: 'Rotwein zum Kochen',
        unit: 'ml',
        missing: 750,
      },
    ]);
    // The lot is priced at what was paid for the onions and the butter: CHF 1.14 per litre …
    const lot = await outputLotOf(s, result.outputLotId);
    expect(lot.pricePer1000).toBe(114);
    // … but the article keeps its price, because the cost is incomplete.
    expect((await t.storage.articles.get(kitchen.articles.jus.id))?.pricePer1000).toBe(0);
  });

  it('puts the output where the business asks, and keeps the date it gives', async () => {
    const s = await setup();
    const { kitchen, t } = s;
    const result = await record(s, {
      recipeId: kitchen.recipes.jus.id,
      portions: 2,
      outputAreaId: kitchen.areas.dry.id,
      outputExpiresOn: '2026-11-20',
      producedOn: '2026-11-13',
      note: 'Probe',
    });
    // Two batches: 2 000 ml, CHF 15.78 for the batch.
    const lot = await outputLotOf(s, result.outputLotId);
    expect(lot).toMatchObject({
      areaId: kitchen.areas.dry.id,
      quantity: 2000,
      expiresOn: '2026-11-20',
      receivedOn: '2026-11-13',
    });
    expect(result.costRappen).toBe(1578);
    expect((await t.storage.productions.get(result.productionId))?.note).toBe('Probe');
  });

  it('gives the output the shelf life of the recipe, from the day it was made', async () => {
    const s = await setup();
    const { kitchen, t } = s;
    const result = await record(s, {
      recipeId: kitchen.recipes.jus.id,
      portions: 1,
      producedOn: '2026-11-12',
    });
    const lot = await outputLotOf(s, result.outputLotId);
    expect(lot.expiresOn).toBe('2026-11-15');
    expect(lot.receivedOn).toBe('2026-11-12');
    expect(lot.expiresOn).toBe((await t.storage.lots.get(lot.id))?.expiresOn);
  });

  it('refuses a component whose article has no usual area and none is given', async () => {
    const s = await setup();
    const { kitchen, t } = s;
    await t.storage.articles.put(
      ArticleSchema.parse({ ...kitchen.articles.jus, areaId: undefined }),
    );
    await expect(
      record(s, { recipeId: kitchen.recipes.jus.id, portions: 1 }),
    ).rejects.toMatchObject({
      code: 'invalid',
    });
    // Nothing was booked.
    expect((await t.storage.lots.get(kitchen.lots.onions.id))?.quantity).toBe(10_000);
  });

  it('refuses an output area that does not exist, and a recipe that does not exist', async () => {
    const s = await setup();
    await expect(
      record(s, { recipeId: s.kitchen.recipes.jus.id, portions: 1, outputAreaId: s.t.cmd() }),
    ).rejects.toMatchObject({ code: 'not_found' });
    await expect(record(s, { recipeId: s.t.cmd(), portions: 1 })).rejects.toMatchObject({
      code: 'not_found',
    });
  });

  it('marks the plan entry it came from as produced, and refuses another dish for it', async () => {
    const s = await setup();
    const { kitchen, t } = s;
    const planned = await s.run['plan.add']({
      commandId: t.cmd(),
      businessId: s.businessId,
      date: '2026-11-14',
      slot: 'lunch',
      recipeId: kitchen.recipes.entrecoteDish.id,
      portions: 10,
    });
    await expect(
      record(s, {
        recipeId: kitchen.recipes.salmonDish.id,
        portions: 4,
        planEntryId: planned.entryId,
      }),
    ).rejects.toMatchObject({ code: 'invalid' });
    const result = await record(s, {
      recipeId: kitchen.recipes.entrecoteDish.id,
      portions: 10,
      planEntryId: planned.entryId,
    });
    expect((await t.storage.planEntries.get(planned.entryId))?.productionId).toBe(
      result.productionId,
    );
  });

  it('answers the same command id with the same result and books nothing twice', async () => {
    const s = await setup();
    const { kitchen, t } = s;
    const commandId = t.cmd();
    const input = {
      commandId,
      businessId: s.businessId,
      recipeId: kitchen.recipes.jus.id,
      portions: 1,
    };
    const first = await s.run['production.record'](input);
    const second = await s.run['production.record'](input);
    expect(second).toEqual(first);
    expect(await t.storage.productions.ofBusiness(s.businessId)).toHaveLength(1);
    expect((await t.storage.lots.get(kitchen.lots.onions.id))?.quantity).toBe(9800);
  });

  it('does not book into another business', async () => {
    const s = await setup();
    const other = await createTestContext({ storage: s.t.storage, idStart: 20_000 });
    await expect(
      other.useCases['production.record']({
        commandId: other.cmd(),
        businessId: other.businessId,
        recipeId: s.kitchen.recipes.jus.id,
        portions: 1,
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
    expect((await s.t.storage.lots.get(s.kitchen.lots.onions.id))?.quantity).toBe(10_000);
  });
});

describe('production.list, production.get and production.label', () => {
  it('lists the runs newest first, and filters by day', async () => {
    const s = await setup();
    const { kitchen } = s;
    await record(s, { recipeId: kitchen.recipes.jus.id, portions: 1, producedOn: '2026-11-12' });
    const latest = await record(s, { recipeId: kitchen.recipes.entrecoteDish.id, portions: 10 });
    const all = await s.run['production.list']({ businessId: s.businessId });
    expect(all.productions.map((row) => row.producedOn)).toEqual(['2026-11-14', '2026-11-12']);
    // The jus of the 12th is in stock now: the dish takes 500 ml of it, no shortage. Its cost is
    // the 133.16 of the goods plus half a litre of jus at CHF 7.89 (394 Rappen): 137.10.
    expect(all.productions[0]).toMatchObject({
      id: latest.productionId,
      recipeName: 'Entrecôte mit Rotweinjus und Kartoffelstock',
      kind: 'dish',
      portions: 10,
      costRappen: 13_710,
      costPerPortionRappen: 1371,
      shortageCount: 0,
      producedByName: 'Testperson',
    });
    const onlyNew = await s.run['production.list']({
      businessId: s.businessId,
      from: '2026-11-13',
      to: '2026-11-14',
    });
    expect(onlyNew.productions).toHaveLength(1);
  });

  it('traces every lot that went into a run back to its delivery', async () => {
    const s = await setup();
    const { kitchen } = s;
    const result = await record(s, { recipeId: kitchen.recipes.jus.id, portions: 1 });
    const detail = await s.run['production.get']({
      businessId: s.businessId,
      productionId: result.productionId,
    });
    // Onions 200 g (44 Rappen), wine 750 ml (675 Rappen), butter 50 g (70 Rappen): 789 in total.
    expect(detail.ins.map((row) => [row.name, row.quantity, row.valueRappen])).toEqual([
      ['Butter', 50, 70],
      ['Rotwein zum Kochen', 750, 675],
      ['Zwiebeln', 200, 44],
    ]);
    expect(detail.ins.reduce((sum, row) => sum + row.valueRappen, 0)).toBe(789);
    expect(detail.ins[0]).toMatchObject({
      supplierName: 'Grosshandel Beispiel',
      receivedOn: '2026-11-13',
    });
    expect(detail.output).toMatchObject({
      lotId: result.outputLotId,
      name: 'Rotweinjus',
      quantity: 1000,
      remaining: 1000,
      pricePer1000: 789,
      expiresOn: '2026-11-17',
      areaName: 'Kühlzelle',
    });
    expect(detail.shortages).toEqual([]);
  });

  it('shows shortages of a run in its trace, and fails for an unknown run', async () => {
    const s = await setup();
    const result = await record(s, { recipeId: s.kitchen.recipes.entrecoteDish.id, portions: 10 });
    const detail = await s.run['production.get']({
      businessId: s.businessId,
      productionId: result.productionId,
    });
    expect(detail.shortages).toHaveLength(1);
    expect(detail.output).toBeUndefined();
    await expect(
      s.run['production.get']({ businessId: s.businessId, productionId: s.t.cmd() }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('gives the label of the output: name, dates, quantity, allergens and a short code', async () => {
    const s = await setup();
    const { kitchen } = s;
    const result = await record(s, { recipeId: kitchen.recipes.jus.id, portions: 1 });
    const label = await s.run['production.label']({
      businessId: s.businessId,
      productionId: result.productionId,
    });
    // Onions (no allergen), wine with sulphites, butter with milk. Vegetarian as a whole.
    expect(label).toMatchObject({
      name: 'Rotweinjus',
      producedOn: '2026-11-14',
      useBy: '2026-11-17',
      dateKind: 'use_by',
      quantity: 1000,
      unit: 'ml',
      portions: 1,
      diet: 'vegetarian',
      incomplete: false,
      producedByName: 'Testperson',
    });
    expect(label.allergens).toEqual(expect.arrayContaining(['milk', 'sulphites']));
    expect(label.code).toBe(result.outputLotId?.slice(-8));
  });

  it('gives the label of a dish without output: its name and portions', async () => {
    const s = await setup();
    const result = await record(s, { recipeId: s.kitchen.recipes.entrecoteDish.id, portions: 10 });
    const label = await s.run['production.label']({
      businessId: s.businessId,
      productionId: result.productionId,
    });
    expect(label).toMatchObject({
      name: 'Entrecôte mit Rotweinjus und Kartoffelstock',
      portions: 10,
      diet: 'omnivore',
    });
    expect(label).not.toHaveProperty('useBy');
    expect(label.code).toHaveLength(8);
  });

  it('keeps the trace per lot when two runs use the same lot', async () => {
    const s = await setup();
    const { kitchen } = s;
    const first = await record(s, { recipeId: kitchen.recipes.jus.id, portions: 1 });
    const second = await record(s, { recipeId: kitchen.recipes.jus.id, portions: 1 });
    const again = await s.run['production.get']({
      businessId: s.businessId,
      productionId: second.productionId,
    });
    const onions = again.ins.find((row) => row.articleId === kitchen.articles.onions.id);
    expect(onions).toMatchObject({ quantity: 200, valueRappen: 44 });
    expect(first.productionId).not.toBe(second.productionId);
  });
});

describe('production.record: expiry is judged on the day it is booked', () => {
  it('does not cook a lot that passed its use-by date on the day of booking, even if the run is dated earlier', async () => {
    const s = await setup();
    const { kitchen, t } = s;
    // Today is 16.11.: the salmon was due on 15.11. A run dated 15.11. is booked today and must
    // not take it. The preview says the same: 640 g of salmon are missing.
    t.clock.setToday('2026-11-16');
    const preview = await s.run['production.preview']({
      businessId: s.businessId,
      recipeId: kitchen.recipes.salmonDish.id,
      portions: 4,
    });
    const previewed = preview.shortages.find((row) => row.articleId === kitchen.articles.salmon.id);
    expect(previewed?.missing).toBe(640);
    const result = await record(s, {
      recipeId: kitchen.recipes.salmonDish.id,
      portions: 4,
      producedOn: '2026-11-15',
    });
    expect(result.shortages).toContainEqual(
      expect.objectContaining({ articleId: kitchen.articles.salmon.id, missing: 640 }),
    );
    expect((await t.storage.lots.get(kitchen.lots.salmon.id))?.quantity).toBe(1500);
  });

  it('still cooks a lot on the day its use-by date falls', async () => {
    const s = await setup();
    const { kitchen, t } = s;
    // Today is the use-by day of the salmon (15.11.): the lot is usable today.
    t.clock.setToday('2026-11-15');
    const result = await record(s, {
      recipeId: kitchen.recipes.salmonDish.id,
      portions: 4,
      producedOn: '2026-11-15',
    });
    expect(result.shortages).toEqual([]);
    expect((await t.storage.lots.get(kitchen.lots.salmon.id))?.quantity).toBe(860);
  });

  it('refuses a run dated in the future, and books nothing', async () => {
    const s = await setup();
    const { kitchen, t } = s;
    await expect(
      record(s, { recipeId: kitchen.recipes.jus.id, portions: 1, producedOn: '2026-11-15' }),
    ).rejects.toMatchObject({ code: 'invalid' });
    expect((await t.storage.lots.get(kitchen.lots.onions.id))?.quantity).toBe(10_000);
    expect(await t.storage.productions.ofBusiness(s.businessId)).toHaveLength(0);
  });
});

describe('the code of a run: different within one minute', () => {
  it('gives two runs made in the same minute different codes, the same on the label and in the trace', async () => {
    const s = await setup();
    const { kitchen } = s;
    const first = await record(s, { recipeId: kitchen.recipes.jus.id, portions: 1 });
    const second = await record(s, { recipeId: kitchen.recipes.jus.id, portions: 1 });
    const labelOf = (productionId: Id) =>
      s.run['production.label']({ businessId: s.businessId, productionId });
    const traceOf = (productionId: Id) =>
      s.run['production.get']({ businessId: s.businessId, productionId });
    const labelFirst = await labelOf(first.productionId);
    const labelSecond = await labelOf(second.productionId);
    expect(labelFirst.code).not.toBe(labelSecond.code);
    expect((await traceOf(first.productionId)).output?.lotCode).toBe(labelFirst.code);
    expect((await traceOf(second.productionId)).output?.lotCode).toBe(labelSecond.code);
  });

  it('gives two dish runs made in the same minute different codes too', async () => {
    const s = await setup();
    const { kitchen } = s;
    const first = await record(s, { recipeId: kitchen.recipes.salmonDish.id, portions: 4 });
    const second = await record(s, { recipeId: kitchen.recipes.salmonDish.id, portions: 4 });
    const labelFirst = await s.run['production.label']({
      businessId: s.businessId,
      productionId: first.productionId,
    });
    const labelSecond = await s.run['production.label']({
      businessId: s.businessId,
      productionId: second.productionId,
    });
    expect(labelFirst.code).toHaveLength(8);
    expect(labelFirst.code).not.toBe(labelSecond.code);
  });
});

describe('production.record: a plan entry is produced once', () => {
  it('refuses a second run for an entry that already holds one, and keeps the link of the first', async () => {
    const s = await setup();
    const { kitchen, t } = s;
    const planned = await s.run['plan.add']({
      commandId: t.cmd(),
      businessId: s.businessId,
      date: '2026-11-14',
      slot: 'lunch',
      recipeId: kitchen.recipes.entrecoteDish.id,
      portions: 10,
    });
    const first = await record(s, {
      recipeId: kitchen.recipes.entrecoteDish.id,
      portions: 10,
      planEntryId: planned.entryId,
    });
    const onionsBefore = (await t.storage.lots.get(kitchen.lots.onions.id))?.quantity;
    await expect(
      record(s, {
        recipeId: kitchen.recipes.entrecoteDish.id,
        portions: 10,
        planEntryId: planned.entryId,
      }),
    ).rejects.toMatchObject({ code: 'invalid' });
    // The link stays with the first run, and the second books nothing.
    expect((await t.storage.planEntries.get(planned.entryId))?.productionId).toBe(
      first.productionId,
    );
    expect(await t.storage.productions.ofBusiness(s.businessId)).toHaveLength(1);
    expect((await t.storage.lots.get(kitchen.lots.onions.id))?.quantity).toBe(onionsBefore);
  });
});

describe('production.get and label after a part of the output was moved', () => {
  it('reports the full output and what remains, and the area of the lot that holds most', async () => {
    const s = await setup();
    const { kitchen, t } = s;
    const result = await record(s, { recipeId: kitchen.recipes.jus.id, portions: 1 });
    // 700 of the 1 000 ml go to the dry store: the part holds most, so its area is shown.
    await t.storage.transaction(async () => {
      await createStockLedger(t.ctx).move({
        businessId: s.businessId,
        lotId: outputIdOf(result.outputLotId),
        areaId: kitchen.areas.dry.id,
        quantity: 700,
      });
    });
    const detail = await s.run['production.get']({
      businessId: s.businessId,
      productionId: result.productionId,
    });
    expect(detail.output).toMatchObject({
      quantity: 1000,
      remaining: 1000,
      areaName: 'Trockenlager',
      pricePer1000: 789,
    });
    const label = await s.run['production.label']({
      businessId: s.businessId,
      productionId: result.productionId,
    });
    expect(label).toMatchObject({ quantity: 1000, unit: 'ml' });
  });

  it('shows what is left after a part is used up, and keeps the output at what was made', async () => {
    const s = await setup();
    const { kitchen, t } = s;
    const result = await record(s, { recipeId: kitchen.recipes.jus.id, portions: 1 });
    await t.storage.transaction(async () => {
      const ledger = createStockLedger(t.ctx);
      await ledger.move({
        businessId: s.businessId,
        lotId: outputIdOf(result.outputLotId),
        areaId: kitchen.areas.dry.id,
        quantity: 400,
      });
      await ledger.consumeLot({
        businessId: s.businessId,
        lotId: outputIdOf(result.outputLotId),
        quantity: 100,
        on: t.clock.today(),
        purpose: 'kitchen',
      });
    });
    const detail = await s.run['production.get']({
      businessId: s.businessId,
      productionId: result.productionId,
    });
    expect(detail.output).toMatchObject({ quantity: 1000, remaining: 900 });
  });
});
