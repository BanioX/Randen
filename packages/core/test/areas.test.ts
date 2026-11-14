import { describe, expect, it } from 'vitest';
import {
  addDays,
  alive,
  areaRangeProposal,
  ArticleSchema,
  createStockLedger,
  isAreaRangeProposal,
  StorageSpotSchema,
  type Article,
  type Id,
} from '../src';
import { createTestContext, seedKitchen, type Kitchen, type TestContext } from '../src/testing';

/** A tiny picture as the app keeps it: a data URL. */
const PHOTO = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
const OTHER_PHOTO = 'data:image/jpeg;base64,/9j/4AAQSkZJRh==';

async function setup() {
  const t = await createTestContext();
  const kitchen = await seedKitchen(t);
  return { t, kitchen, run: t.useCases, businessId: t.businessId };
}

const eventsOf = async (t: TestContext) => await t.storage.events.ofBusiness(t.businessId);
const eventTypes = async (t: TestContext) => (await eventsOf(t)).map((event) => event.type);

/** How much is written down: a repeated command must leave all of it alone. */
async function sizes(t: TestContext) {
  const [areas, spots, articles, events] = await Promise.all([
    t.storage.areas.ofBusiness(t.businessId),
    t.storage.spots.ofBusiness(t.businessId),
    t.storage.articles.ofBusiness(t.businessId),
    t.storage.events.ofBusiness(t.businessId),
  ]);
  return {
    areas: alive(areas).length,
    spots: alive(spots).length,
    placed: alive(articles).filter((article) => article.areaId !== undefined).length,
    onSpots: alive(articles).filter((article) => article.spotId !== undefined).length,
    events: events.length,
  };
}

/** The stored article, to see where it lies now. */
async function article(t: TestContext, id: Id): Promise<Article> {
  const row = await t.storage.articles.get(id);
  if (row === undefined) {
    throw new Error(`No article ${id}`);
  }
  return row;
}

/** An article written straight to storage, independent of the module «Artikel». */
async function addArticle(
  t: TestContext,
  fields: { name: string; areaId?: Id; spotId?: Id; active?: boolean },
): Promise<Article> {
  const now = t.clock.now();
  const row = ArticleSchema.parse({
    id: t.ids.next(),
    businessId: t.businessId,
    createdAt: now,
    updatedAt: now,
    kind: 'purchased',
    categoryId: 'dairy',
    unit: 'ml',
    pricePer1000: 500,
    yieldBps: 10_000,
    allergens: [],
    traces: [],
    diet: 'vegetarian',
    dateKind: 'best_before',
    active: true,
    ...fields,
  });
  await t.storage.articles.add(row);
  return row;
}

/** A lot through the ledger, as a goods receipt books it. */
async function receive(
  t: TestContext,
  item: Article,
  areaId: Id,
  quantity: number,
  pricePer1000: number = item.pricePer1000,
) {
  const ledger = createStockLedger(t.ctx);
  return t.storage.transaction(() =>
    ledger.receive({
      businessId: t.businessId,
      articleId: item.id,
      areaId,
      quantity,
      pricePer1000,
      receivedOn: t.clock.today(),
      expiresOn: addDays(t.clock.today(), 5),
      origin: 'purchase',
    }),
  );
}

/** A second business on the same storage: it must see nothing of the first. */
async function stranger(t: TestContext) {
  return createTestContext({ storage: t.storage, idStart: 100_000 });
}

describe('guideline ranges («Richtwert»)', () => {
  it('proposes 0 to 5 °C for a cold room and -18 °C at most for a freezer, nothing else', () => {
    expect(areaRangeProposal('cold')).toEqual({ minDeciC: 0, maxDeciC: 50 });
    expect(areaRangeProposal('frozen')).toEqual({ maxDeciC: -180 });
    expect(areaRangeProposal('dry')).toEqual({});
    expect(areaRangeProposal('station')).toEqual({});
  });

  it('calls a range a guideline only when it is the proposal of its kind', () => {
    expect(isAreaRangeProposal('cold', { minDeciC: 0, maxDeciC: 50 })).toBe(true);
    expect(isAreaRangeProposal('cold', { minDeciC: 0, maxDeciC: 40 })).toBe(false);
    expect(isAreaRangeProposal('frozen', { maxDeciC: -180 })).toBe(true);
    expect(isAreaRangeProposal('frozen', { minDeciC: -250, maxDeciC: -180 })).toBe(false);
    // No range at all is no guideline, even where none is proposed.
    expect(isAreaRangeProposal('dry', {})).toBe(false);
  });
});

describe('areas.list', () => {
  it('lists the areas in order with range, spots, articles and the value of their lots', async () => {
    const { t, kitchen, run, businessId } = await setup();
    const { areas, totals } = await run['areas.list']({ businessId });
    expect(areas.map((area) => area.name)).toEqual(['Kühlzelle', 'Tiefkühlzelle', 'Trockenlager']);

    // Kühlzelle: Entrecôte CHF 248.00, Lachs CHF 57.00, Rahm 3 l CHF 19.20 and 5 l CHF 32.00,
    // Butter CHF 28.00, Eier 60 × CHF 0.45 = CHF 27.00: six lots, CHF 411.20.
    expect(areas[0]).toEqual({
      id: kitchen.areas.cold.id,
      name: 'Kühlzelle',
      kind: 'cold',
      minDeciC: 0,
      maxDeciC: 50,
      rangeIsProposal: true,
      sortOrder: 0,
      spotCount: 1,
      spotsWithPhoto: 0,
      // Entrecôte, Lachs, Rahm, Butter, Eier, Rotweinjus.
      articleCount: 6,
      lotCount: 6,
      stockValueRappen: 41_120,
      priceMissing: false,
    });
    expect(areas[1]).toMatchObject({
      kind: 'frozen',
      maxDeciC: -180,
      rangeIsProposal: true,
      spotCount: 0,
      articleCount: 0,
      lotCount: 0,
      stockValueRappen: 0,
    });
    expect(areas[1]).not.toHaveProperty('minDeciC');
    // Trockenlager: Mehl CHF 4.80, Zwiebeln CHF 22.00, Kartoffeln CHF 45.00, Wein CHF 54.00.
    expect(areas[2]).toMatchObject({
      kind: 'dry',
      rangeIsProposal: false,
      spotCount: 1,
      articleCount: 4,
      lotCount: 4,
      stockValueRappen: 12_580,
    });
    expect(totals).toEqual({
      spots: 2,
      spotsWithPhoto: 0,
      placedArticles: 10,
      unplacedArticles: 0,
    });
    await expect(stranger(t).then((other) => other.useCases['areas.list'](other))).resolves.toEqual(
      {
        areas: [],
        totals: { spots: 0, spotsWithPhoto: 0, placedArticles: 0, unplacedArticles: 0 },
      },
    );
  });

  it('says when a lot has no price, and leaves inactive articles out of the count', async () => {
    const { t, kitchen, run, businessId } = await setup();
    await receive(t, kitchen.articles.salmon, kitchen.areas.frozen.id, 500, 0);
    await t.storage.articles.put({ ...kitchen.articles.eggs, active: false });
    const { areas, totals } = await run['areas.list']({ businessId });
    expect(areas[1]).toMatchObject({ lotCount: 1, stockValueRappen: 0, priceMissing: true });
    expect(areas[0]?.articleCount).toBe(5);
    expect(totals.placedArticles).toBe(9);
  });
});

describe('areas.get', () => {
  it('shows the spots with their articles, the articles without a spot and the lots', async () => {
    const { kitchen, run, businessId } = await setup();
    const detail = await run['areas.get']({ businessId, areaId: kitchen.areas.cold.id });
    expect(detail.area).toEqual({
      id: kitchen.areas.cold.id,
      name: 'Kühlzelle',
      kind: 'cold',
      minDeciC: 0,
      maxDeciC: 50,
      rangeIsProposal: true,
      sortOrder: 0,
    });
    expect(detail.spots).toEqual([
      {
        id: kitchen.spots.meatDrawer.id,
        areaId: kitchen.areas.cold.id,
        name: 'Schublade Fleisch',
        sortOrder: 0,
        articles: [
          {
            id: kitchen.articles.entrecote.id,
            name: 'Rindsentrecôte',
            unit: 'g',
            categoryId: 'meat',
            stockHere: 4000,
            stock: 4000,
          },
        ],
      },
    ]);
    expect(detail.unplaced.map((row) => row.name)).toEqual([
      'Butter',
      'Eier',
      'Lachsfilet',
      'Rotweinjus',
      'Vollrahm',
    ]);
    // Rahm: 3 l and 5 l in two lots; the jus has none.
    expect(detail.unplaced.find((row) => row.name === 'Vollrahm')).toMatchObject({
      stockHere: 8000,
      stock: 8000,
    });
    expect(detail.unplaced.find((row) => row.name === 'Rotweinjus')).toMatchObject({
      stockHere: 0,
      stock: 0,
    });
    // The earliest date first: Lachs tomorrow, Entrecôte in two days, then the rest.
    expect(detail.lots.map((lot) => [lot.articleName, lot.expiresOn])).toEqual([
      ['Lachsfilet', '2026-11-15'],
      ['Rindsentrecôte', '2026-11-16'],
      ['Vollrahm', '2026-11-20'],
      ['Vollrahm', '2026-11-26'],
      ['Eier', '2026-11-28'],
      ['Butter', '2026-12-14'],
    ]);
    expect(detail.lots[1]).toEqual({
      lotId: kitchen.lots.entrecote.id,
      articleId: kitchen.articles.entrecote.id,
      articleName: 'Rindsentrecôte',
      unit: 'g',
      quantity: 4000,
      valueRappen: 24_800,
      expiresOn: '2026-11-16',
      dateKind: 'use_by',
      status: 'soon',
      daysLeft: 2,
      mustNotUse: false,
      spotName: 'Schublade Fleisch',
      awayFromHome: false,
    });
    expect(detail.totals).toEqual({
      lotCount: 6,
      stockValueRappen: 41_120,
      priceMissing: false,
      articleCount: 6,
      spotsWithPhoto: 0,
    });
  });

  it('shows what really lies there: a lot away from home, and one that must not be used', async () => {
    const { t, kitchen, run, businessId } = await setup();
    // 2 kg Mehl at CHF 1.60/kg = CHF 3.20 lie in the cold room for now; their home is the store.
    await receive(t, kitchen.articles.flour, kitchen.areas.cold.id, 2000);
    t.clock.setToday(addDays(t.clock.today(), 3));
    const detail = await run['areas.get']({ businessId, areaId: kitchen.areas.cold.id });
    const flour = detail.lots.find((lot) => lot.articleName === 'Weissmehl');
    expect(flour).toMatchObject({
      awayFromHome: true,
      homeAreaName: 'Trockenlager',
      valueRappen: 320,
      quantity: 2000,
    });
    expect(flour).not.toHaveProperty('spotName');
    // Weissmehl is no article of the cold room: it is not listed as one.
    expect(detail.unplaced.map((row) => row.name)).not.toContain('Weissmehl');
    // Three days on, the Entrecôte is past its Verbrauchsdatum.
    expect(detail.lots.find((lot) => lot.articleName === 'Rindsentrecôte')).toMatchObject({
      status: 'expired',
      daysLeft: -1,
      mustNotUse: true,
    });
    expect(detail.totals.lotCount).toBe(7);
    expect(detail.totals.stockValueRappen).toBe(41_440);
  });

  it('knows no area that is deleted, unknown or of another business', async () => {
    const { t, kitchen, run, businessId } = await setup();
    const other = await stranger(t);
    await expect(
      other.useCases['areas.get']({ businessId: other.businessId, areaId: kitchen.areas.cold.id }),
    ).rejects.toMatchObject({ code: 'not_found' });
    await run['areas.delete']({ commandId: t.cmd(), businessId, areaId: kitchen.areas.frozen.id });
    await expect(
      run['areas.get']({ businessId, areaId: kitchen.areas.frozen.id }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('areas.create', () => {
  it('proposes the range of its kind, at the end of the list', async () => {
    const { t, run, businessId } = await setup();
    const { areaId } = await run['areas.create']({
      commandId: t.cmd(),
      businessId,
      name: 'Kühlschrank Bar',
      kind: 'cold',
      photo: PHOTO,
    });
    const row = await t.storage.areas.get(areaId);
    expect(row).toMatchObject({
      name: 'Kühlschrank Bar',
      kind: 'cold',
      minDeciC: 0,
      maxDeciC: 50,
      photo: PHOTO,
      sortOrder: 3,
    });
    const events = await eventsOf(t);
    expect(events.at(-1)).toMatchObject({
      type: 'area.created',
      payload: { areaId, kind: 'cold' },
      actor: t.actor,
    });
  });

  it('takes a range the business chose, or none at all', async () => {
    const { t, run, businessId } = await setup();
    const own = await run['areas.create']({
      commandId: t.cmd(),
      businessId,
      name: 'Fischkühler',
      kind: 'cold',
      minDeciC: -10,
      maxDeciC: 20,
    });
    expect(await t.storage.areas.get(own.areaId)).toMatchObject({ minDeciC: -10, maxDeciC: 20 });
    const none = await run['areas.create']({
      commandId: t.cmd(),
      businessId,
      name: 'Getränkekühler',
      kind: 'cold',
      minDeciC: null,
      maxDeciC: null,
    });
    const row = await t.storage.areas.get(none.areaId);
    expect(row).not.toHaveProperty('minDeciC');
    expect(row).not.toHaveProperty('maxDeciC');
    const { areas } = await run['areas.list']({ businessId });
    expect(areas.find((area) => area.name === 'Fischkühler')?.rangeIsProposal).toBe(false);
  });

  it('puts the area at the place asked for and moves the others down', async () => {
    const { t, run, businessId } = await setup();
    await run['areas.create']({
      commandId: t.cmd(),
      businessId,
      name: 'Posten Garde-manger',
      kind: 'station',
      sortOrder: 1,
    });
    const { areas } = await run['areas.list']({ businessId });
    expect(areas.map((area) => [area.name, area.sortOrder])).toEqual([
      ['Kühlzelle', 0],
      ['Posten Garde-manger', 1],
      ['Tiefkühlzelle', 2],
      ['Trockenlager', 3],
    ]);
  });

  it('refuses a name that exists, and a range upside down', async () => {
    const { t, run, businessId } = await setup();
    await expect(
      run['areas.create']({ commandId: t.cmd(), businessId, name: ' kühlzelle ', kind: 'cold' }),
    ).rejects.toMatchObject({ code: 'duplicate_name' });
    await expect(
      run['areas.create']({
        commandId: t.cmd(),
        businessId,
        name: 'Weinkeller',
        kind: 'bar',
        minDeciC: 140,
        maxDeciC: 100,
      }),
    ).rejects.toMatchObject({ code: 'invalid' });
    expect((await sizes(t)).areas).toBe(3);
  });

  it('gives the same answer for the same command and creates the area once', async () => {
    const { t, run, businessId } = await setup();
    const commandId = t.cmd();
    const first = await run['areas.create']({ commandId, businessId, name: 'Bar', kind: 'bar' });
    const before = await sizes(t);
    const again = await run['areas.create']({ commandId, businessId, name: 'Bar', kind: 'bar' });
    expect(again).toEqual(first);
    expect(await sizes(t)).toEqual(before);
    expect(before.areas).toBe(4);
  });

  it('takes a thousand areas at most', async () => {
    const { t, run, businessId } = await setup();
    const now = t.clock.now();
    await t.storage.transaction(async () => {
      for (let index = 3; index < 1000; index += 1) {
        await t.storage.areas.add({
          id: t.ids.next(),
          businessId,
          name: `Regal ${String(index)}`,
          kind: 'dry',
          sortOrder: index,
          createdAt: now,
          updatedAt: now,
        });
      }
    });
    await expect(
      run['areas.create']({ commandId: t.cmd(), businessId, name: 'Noch eins', kind: 'dry' }),
    ).rejects.toMatchObject({ code: 'invalid' });
  });
});

describe('areas.update', () => {
  it('changes name, kind, range and photo and names what changed', async () => {
    const { t, kitchen, run, businessId } = await setup();
    const result = await run['areas.update']({
      commandId: t.cmd(),
      businessId,
      areaId: kitchen.areas.dry.id,
      name: 'Economat',
      minDeciC: 100,
      maxDeciC: 200,
      photo: PHOTO,
    });
    expect(result).toEqual({
      areaId: kitchen.areas.dry.id,
      changed: ['name', 'minDeciC', 'maxDeciC', 'photo'],
    });
    expect(await t.storage.areas.get(kitchen.areas.dry.id)).toMatchObject({
      name: 'Economat',
      kind: 'dry',
      minDeciC: 100,
      maxDeciC: 200,
      photo: PHOTO,
      sortOrder: 2,
    });
    expect((await eventsOf(t)).at(-1)).toMatchObject({
      type: 'area.updated',
      payload: {
        areaId: kitchen.areas.dry.id,
        fields: ['name', 'minDeciC', 'maxDeciC', 'photo'],
      },
    });
  });

  it('clears range and photo with null, and writes nothing when nothing changes', async () => {
    const { t, kitchen, run, businessId } = await setup();
    const areaId = kitchen.areas.cold.id;
    await run['areas.update']({ commandId: t.cmd(), businessId, areaId, photo: PHOTO });
    const cleared = await run['areas.update']({
      commandId: t.cmd(),
      businessId,
      areaId,
      minDeciC: null,
      maxDeciC: null,
      photo: null,
    });
    expect(cleared.changed).toEqual(['minDeciC', 'maxDeciC', 'photo']);
    const row = await t.storage.areas.get(areaId);
    expect(row).not.toHaveProperty('photo');
    expect(row).not.toHaveProperty('minDeciC');

    const before = await sizes(t);
    const same = await run['areas.update']({
      commandId: t.cmd(),
      businessId,
      areaId,
      name: 'Kühlzelle',
      kind: 'cold',
      sortOrder: 0,
    });
    expect(same).toEqual({ areaId, changed: [] });
    expect(await sizes(t)).toEqual(before);
  });

  it('moves an area to another place in the order', async () => {
    const { t, kitchen, run, businessId } = await setup();
    const result = await run['areas.update']({
      commandId: t.cmd(),
      businessId,
      areaId: kitchen.areas.dry.id,
      sortOrder: 0,
    });
    expect(result.changed).toEqual(['sortOrder']);
    const { areas } = await run['areas.list']({ businessId });
    expect(areas.map((area) => [area.name, area.sortOrder])).toEqual([
      ['Trockenlager', 0],
      ['Kühlzelle', 1],
      ['Tiefkühlzelle', 2],
    ]);
  });

  it('refuses a taken name, a range upside down and an area it does not know', async () => {
    const { t, kitchen, run, businessId } = await setup();
    const areaId = kitchen.areas.cold.id;
    await expect(
      run['areas.update']({ commandId: t.cmd(), businessId, areaId, name: 'TROCKENLAGER' }),
    ).rejects.toMatchObject({ code: 'duplicate_name' });
    // The cold room starts at 0 °C: a highest value of -2 °C is below it.
    await expect(
      run['areas.update']({ commandId: t.cmd(), businessId, areaId, maxDeciC: -20 }),
    ).rejects.toMatchObject({ code: 'invalid' });
    const other = await stranger(t);
    await expect(
      other.useCases['areas.update']({
        commandId: other.cmd(),
        businessId: other.businessId,
        areaId,
        name: 'Fremd',
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
    expect((await t.storage.areas.get(areaId))?.name).toBe('Kühlzelle');
  });

  it('gives the same answer for the same command', async () => {
    const { t, kitchen, run, businessId } = await setup();
    const input = {
      commandId: t.cmd(),
      businessId,
      areaId: kitchen.areas.frozen.id,
      name: 'Tiefkühler',
    };
    const first = await run['areas.update'](input);
    const before = await sizes(t);
    expect(await run['areas.update'](input)).toEqual(first);
    expect(await sizes(t)).toEqual(before);
  });
});

describe('areas.delete', () => {
  it('refuses while lots lie in the area, and changes nothing', async () => {
    const { t, kitchen, run, businessId } = await setup();
    const before = await sizes(t);
    await expect(
      run['areas.delete']({ commandId: t.cmd(), businessId, areaId: kitchen.areas.cold.id }),
    ).rejects.toMatchObject({ code: 'in_use', message: '6 lots still lie in the area' });
    expect(await sizes(t)).toEqual(before);
  });

  it('takes its spots along and leaves its articles without a place', async () => {
    const { t, kitchen, run, businessId } = await setup();
    const areaId = kitchen.areas.frozen.id;
    const { spotId } = await run['spots.create']({
      commandId: t.cmd(),
      businessId,
      areaId,
      name: 'Truhe links',
    });
    await run['spots.assign']({
      commandId: t.cmd(),
      businessId,
      areaId,
      spotId,
      articleIds: [kitchen.articles.salmon.id],
    });
    const peas = await addArticle(t, { name: 'Erbsen', areaId });
    const result = await run['areas.delete']({ commandId: t.cmd(), businessId, areaId });
    expect(result).toEqual({ areaId, spotsRemoved: 1, articlesCleared: 2 });

    expect((await t.storage.areas.get(areaId))?.deletedAt).toBe(t.clock.now());
    expect((await t.storage.spots.get(spotId))?.deletedAt).toBe(t.clock.now());
    for (const id of [kitchen.articles.salmon.id, peas.id]) {
      const row = await article(t, id);
      expect(row).not.toHaveProperty('areaId');
      expect(row).not.toHaveProperty('spotId');
    }
    // The lots of the salmon stay where they are: in the cold room.
    expect((await t.storage.lots.get(kitchen.lots.salmon.id))?.areaId).toBe(kitchen.areas.cold.id);
    const { areas, totals } = await run['areas.list']({ businessId });
    expect(areas.map((area) => [area.name, area.sortOrder])).toEqual([
      ['Kühlzelle', 0],
      ['Trockenlager', 1],
    ]);
    expect(totals.unplacedArticles).toBe(2);
    expect((await eventsOf(t)).at(-1)).toMatchObject({
      type: 'area.deleted',
      payload: { areaId, spotsRemoved: 1, articlesCleared: 2 },
    });
  });

  it('can go once its lots are gone, and the same command answers the same', async () => {
    const { t, kitchen, run, businessId } = await setup();
    const ledger = createStockLedger(t.ctx);
    await t.storage.transaction(async () => {
      for (const lot of [
        kitchen.lots.flour,
        kitchen.lots.onions,
        kitchen.lots.potatoes,
        kitchen.lots.redWine,
      ]) {
        await ledger.consumeLot({
          businessId,
          lotId: lot.id,
          quantity: lot.quantity,
          on: t.clock.today(),
          purpose: 'kitchen',
        });
      }
    });
    const commandId = t.cmd();
    const areaId = kitchen.areas.dry.id;
    const first = await run['areas.delete']({ commandId, businessId, areaId });
    expect(first).toEqual({ areaId, spotsRemoved: 1, articlesCleared: 4 });
    const before = await sizes(t);
    expect(await run['areas.delete']({ commandId, businessId, areaId })).toEqual(first);
    expect(await sizes(t)).toEqual(before);
    await expect(
      run['areas.delete']({ commandId: t.cmd(), businessId, areaId }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('areas.reorder', () => {
  it('puts the named areas first and the others after them, in their order', async () => {
    const { t, kitchen, run, businessId } = await setup();
    const result = await run['areas.reorder']({
      commandId: t.cmd(),
      businessId,
      areaIds: [kitchen.areas.dry.id, kitchen.areas.cold.id],
    });
    expect(result.areaIds).toEqual([
      kitchen.areas.dry.id,
      kitchen.areas.cold.id,
      kitchen.areas.frozen.id,
    ]);
    const { areas } = await run['areas.list']({ businessId });
    expect(areas.map((area) => area.sortOrder)).toEqual([0, 1, 2]);
    expect((await eventsOf(t)).at(-1)).toMatchObject({
      type: 'area.reordered',
      payload: { areaIds: result.areaIds },
    });
  });

  it('writes nothing for the order there is, and repeats a command without effect', async () => {
    const { t, kitchen, run, businessId } = await setup();
    const before = await sizes(t);
    const same = await run['areas.reorder']({
      commandId: t.cmd(),
      businessId,
      areaIds: [kitchen.areas.cold.id],
    });
    expect(same.areaIds[0]).toBe(kitchen.areas.cold.id);
    expect(await sizes(t)).toEqual(before);

    const input = { commandId: t.cmd(), businessId, areaIds: [kitchen.areas.frozen.id] };
    const first = await run['areas.reorder'](input);
    const after = await sizes(t);
    expect(after.events).toBe(before.events + 1);
    expect(await run['areas.reorder'](input)).toEqual(first);
    expect(await sizes(t)).toEqual(after);
  });

  it('refuses an area named twice and one it does not know', async () => {
    const { t, kitchen, run, businessId } = await setup();
    await expect(
      run['areas.reorder']({
        commandId: t.cmd(),
        businessId,
        areaIds: [kitchen.areas.dry.id, kitchen.areas.dry.id],
      }),
    ).rejects.toMatchObject({ code: 'invalid' });
    const other = await stranger(t);
    await expect(
      other.useCases['areas.reorder']({
        commandId: other.cmd(),
        businessId: other.businessId,
        areaIds: [kitchen.areas.dry.id],
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('spots.create', () => {
  it('adds a spot with note and photo at the end of its area', async () => {
    const { t, kitchen, run, businessId } = await setup();
    const { spotId } = await run['spots.create']({
      commandId: t.cmd(),
      businessId,
      areaId: kitchen.areas.cold.id,
      name: 'Regal Milchprodukte',
      note: 'Rechts neben der Tür, zweites Brett',
      photo: PHOTO,
    });
    expect(await t.storage.spots.get(spotId)).toMatchObject({
      areaId: kitchen.areas.cold.id,
      name: 'Regal Milchprodukte',
      note: 'Rechts neben der Tür, zweites Brett',
      photo: PHOTO,
      sortOrder: 1,
    });
    expect((await eventsOf(t)).at(-1)).toMatchObject({
      type: 'spot.created',
      payload: { spotId, areaId: kitchen.areas.cold.id, withPhoto: true },
    });
  });

  it('puts a spot first when asked, and allows the same name in another area', async () => {
    const { t, kitchen, run, businessId } = await setup();
    const { spotId } = await run['spots.create']({
      commandId: t.cmd(),
      businessId,
      areaId: kitchen.areas.dry.id,
      name: 'Schublade Fleisch',
      sortOrder: 0,
    });
    const detail = await run['areas.get']({ businessId, areaId: kitchen.areas.dry.id });
    expect(detail.spots.map((spot) => [spot.id, spot.sortOrder])).toEqual([
      [spotId, 0],
      [kitchen.spots.dryShelf.id, 1],
    ]);
  });

  it('refuses a name its area has, an unknown area, and repeats without effect', async () => {
    const { t, kitchen, run, businessId } = await setup();
    await expect(
      run['spots.create']({
        commandId: t.cmd(),
        businessId,
        areaId: kitchen.areas.cold.id,
        name: 'schublade fleisch',
      }),
    ).rejects.toMatchObject({ code: 'duplicate_name' });
    const other = await stranger(t);
    await expect(
      other.useCases['spots.create']({
        commandId: other.cmd(),
        businessId: other.businessId,
        areaId: kitchen.areas.cold.id,
        name: 'Fremd',
      }),
    ).rejects.toMatchObject({ code: 'not_found' });

    const input = {
      commandId: t.cmd(),
      businessId,
      areaId: kitchen.areas.cold.id,
      name: 'Regal 2',
    };
    const first = await run['spots.create'](input);
    const before = await sizes(t);
    expect(await run['spots.create'](input)).toEqual(first);
    expect(await sizes(t)).toEqual(before);
  });

  it('takes a thousand spots per area at most', async () => {
    const { t, kitchen, run, businessId } = await setup();
    const now = t.clock.now();
    await t.storage.transaction(async () => {
      for (let index = 1; index < 1000; index += 1) {
        await t.storage.spots.add(
          StorageSpotSchema.parse({
            id: t.ids.next(),
            businessId,
            areaId: kitchen.areas.cold.id,
            name: `Fach ${String(index)}`,
            sortOrder: index,
            createdAt: now,
            updatedAt: now,
          }),
        );
      }
    });
    await expect(
      run['spots.create']({
        commandId: t.cmd(),
        businessId,
        areaId: kitchen.areas.cold.id,
        name: 'Fach 1000',
      }),
    ).rejects.toMatchObject({ code: 'invalid' });
  });
});

describe('spots.update', () => {
  it('changes name, note and photo, and clears note and photo with null', async () => {
    const { t, kitchen, run, businessId } = await setup();
    const spotId = kitchen.spots.meatDrawer.id;
    const changed = await run['spots.update']({
      commandId: t.cmd(),
      businessId,
      spotId,
      name: 'Schublade Fleisch, unten',
      note: 'Rohes Fleisch immer zuunterst',
      photo: PHOTO,
    });
    expect(changed).toEqual({ spotId, changed: ['name', 'note', 'photo'] });
    expect(await t.storage.spots.get(spotId)).toMatchObject({
      name: 'Schublade Fleisch, unten',
      note: 'Rohes Fleisch immer zuunterst',
      photo: PHOTO,
    });
    const replaced = await run['spots.update']({
      commandId: t.cmd(),
      businessId,
      spotId,
      photo: OTHER_PHOTO,
    });
    expect(replaced.changed).toEqual(['photo']);
    const cleared = await run['spots.update']({
      commandId: t.cmd(),
      businessId,
      spotId,
      note: null,
      photo: null,
    });
    expect(cleared.changed).toEqual(['note', 'photo']);
    const row = await t.storage.spots.get(spotId);
    expect(row).not.toHaveProperty('note');
    expect(row).not.toHaveProperty('photo');
    expect((await eventsOf(t)).at(-1)).toMatchObject({
      type: 'spot.updated',
      payload: { spotId, areaId: kitchen.areas.cold.id, fields: ['note', 'photo'] },
    });
  });

  it('moves a spot within its area, and writes nothing when nothing changes', async () => {
    const { t, kitchen, run, businessId } = await setup();
    const areaId = kitchen.areas.cold.id;
    const second = await run['spots.create']({
      commandId: t.cmd(),
      businessId,
      areaId,
      name: 'Regal 2',
    });
    const third = await run['spots.create']({
      commandId: t.cmd(),
      businessId,
      areaId,
      name: 'Regal 3',
    });
    const moved = await run['spots.update']({
      commandId: t.cmd(),
      businessId,
      spotId: third.spotId,
      sortOrder: 0,
    });
    expect(moved.changed).toEqual(['sortOrder']);
    const detail = await run['areas.get']({ businessId, areaId });
    expect(detail.spots.map((spot) => [spot.name, spot.sortOrder])).toEqual([
      ['Regal 3', 0],
      ['Schublade Fleisch', 1],
      ['Regal 2', 2],
    ]);
    const before = await sizes(t);
    const same = await run['spots.update']({
      commandId: t.cmd(),
      businessId,
      spotId: second.spotId,
      name: 'Regal 2',
      sortOrder: 2,
    });
    expect(same.changed).toEqual([]);
    expect(await sizes(t)).toEqual(before);
  });

  it('refuses a name its area has and a spot it does not know; repeats without effect', async () => {
    const { t, kitchen, run, businessId } = await setup();
    const { spotId } = await run['spots.create']({
      commandId: t.cmd(),
      businessId,
      areaId: kitchen.areas.cold.id,
      name: 'Regal 2',
    });
    await expect(
      run['spots.update']({ commandId: t.cmd(), businessId, spotId, name: 'Schublade FLEISCH' }),
    ).rejects.toMatchObject({ code: 'duplicate_name' });
    const other = await stranger(t);
    await expect(
      other.useCases['spots.update']({
        commandId: other.cmd(),
        businessId: other.businessId,
        spotId,
        name: 'Fremd',
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
    const input = { commandId: t.cmd(), businessId, spotId, note: 'Oben links' };
    const first = await run['spots.update'](input);
    const before = await sizes(t);
    expect(await run['spots.update'](input)).toEqual(first);
    expect(await sizes(t)).toEqual(before);
  });
});

describe('spots.delete', () => {
  it('leaves the articles of the spot in its area, without a spot', async () => {
    const { t, kitchen, run, businessId } = await setup();
    const areaId = kitchen.areas.cold.id;
    const { spotId } = await run['spots.create']({
      commandId: t.cmd(),
      businessId,
      areaId,
      name: 'Regal 2',
    });
    const commandId = t.cmd();
    const result = await run['spots.delete']({
      commandId,
      businessId,
      spotId: kitchen.spots.meatDrawer.id,
    });
    expect(result).toEqual({ spotId: kitchen.spots.meatDrawer.id, articlesCleared: 1 });
    const entrecote = await article(t, kitchen.articles.entrecote.id);
    expect(entrecote.areaId).toBe(areaId);
    expect(entrecote).not.toHaveProperty('spotId');
    // Everything else of the article stays as it was.
    expect({ ...entrecote, updatedAt: undefined }).toEqual({
      ...kitchen.articles.entrecote,
      spotId: undefined,
      updatedAt: undefined,
    });
    expect((await t.storage.spots.get(spotId))?.sortOrder).toBe(0);
    expect((await eventsOf(t)).at(-1)).toMatchObject({
      type: 'spot.deleted',
      payload: { spotId: kitchen.spots.meatDrawer.id, areaId, articlesCleared: 1 },
    });
    const before = await sizes(t);
    expect(
      await run['spots.delete']({ commandId, businessId, spotId: kitchen.spots.meatDrawer.id }),
    ).toEqual(result);
    expect(await sizes(t)).toEqual(before);
    await expect(
      run['spots.delete']({ commandId: t.cmd(), businessId, spotId: kitchen.spots.meatDrawer.id }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('spots.assign', () => {
  async function newSpot(t: TestContext, kitchen: Kitchen, name: string) {
    return t.useCases['spots.create']({
      commandId: t.cmd(),
      businessId: t.businessId,
      areaId: kitchen.areas.cold.id,
      name,
    });
  }

  it('puts articles on a spot, also from another area, and changes nothing else', async () => {
    const { t, kitchen, run, businessId } = await setup();
    const { spotId } = await newSpot(t, kitchen, 'Regal Milchprodukte');
    const result = await run['spots.assign']({
      commandId: t.cmd(),
      businessId,
      areaId: kitchen.areas.cold.id,
      spotId,
      articleIds: [
        kitchen.articles.cream.id,
        kitchen.articles.butter.id,
        kitchen.articles.flour.id,
      ],
    });
    expect(result).toEqual({ placed: 3, released: 0 });
    for (const id of [kitchen.articles.cream.id, kitchen.articles.butter.id]) {
      expect(await article(t, id)).toMatchObject({ areaId: kitchen.areas.cold.id, spotId });
    }
    const flour = await article(t, kitchen.articles.flour.id);
    expect({ ...flour, updatedAt: undefined }).toEqual({
      ...kitchen.articles.flour,
      areaId: kitchen.areas.cold.id,
      spotId,
      updatedAt: undefined,
    });
    expect((await eventsOf(t)).at(-1)).toMatchObject({
      type: 'spot.articles_assigned',
      payload: { areaId: kitchen.areas.cold.id, spotId, placed: 3, released: 0 },
    });
  });

  it('puts articles into the area without a spot', async () => {
    const { t, kitchen, run, businessId } = await setup();
    const result = await run['spots.assign']({
      commandId: t.cmd(),
      businessId,
      areaId: kitchen.areas.frozen.id,
      spotId: null,
      articleIds: [kitchen.articles.entrecote.id],
    });
    expect(result).toEqual({ placed: 1, released: 0 });
    const entrecote = await article(t, kitchen.articles.entrecote.id);
    expect(entrecote.areaId).toBe(kitchen.areas.frozen.id);
    expect(entrecote).not.toHaveProperty('spotId');
  });

  it('with «replace», sends what is not listed off the spot or out of the area', async () => {
    const { t, kitchen, run, businessId } = await setup();
    const areaId = kitchen.areas.cold.id;
    const offSpot = await run['spots.assign']({
      commandId: t.cmd(),
      businessId,
      areaId,
      spotId: kitchen.spots.meatDrawer.id,
      articleIds: [kitchen.articles.salmon.id],
      replace: true,
    });
    expect(offSpot).toEqual({ placed: 1, released: 1 });
    const entrecote = await article(t, kitchen.articles.entrecote.id);
    expect(entrecote.areaId).toBe(areaId);
    expect(entrecote).not.toHaveProperty('spotId');

    // Without a spot in the cold room now: Butter, Eier, Entrecôte, Rahm, Jus; the eggs are
    // inactive and stay. Keep the butter: Entrecôte, Rahm and Jus leave the area.
    await t.storage.articles.put({ ...kitchen.articles.eggs, active: false });
    const outOfArea = await run['spots.assign']({
      commandId: t.cmd(),
      businessId,
      areaId,
      spotId: null,
      articleIds: [kitchen.articles.butter.id],
      replace: true,
    });
    expect(outOfArea).toEqual({ placed: 0, released: 3 });
    expect((await article(t, kitchen.articles.eggs.id)).areaId).toBe(areaId);
    expect((await article(t, kitchen.articles.butter.id)).areaId).toBe(areaId);
    expect(await article(t, kitchen.articles.cream.id)).not.toHaveProperty('areaId');
    expect((await article(t, kitchen.articles.salmon.id)).spotId).toBe(kitchen.spots.meatDrawer.id);
  });

  it('writes nothing when every article is there already, and repeats without effect', async () => {
    const { t, kitchen, run, businessId } = await setup();
    const before = await sizes(t);
    const same = await run['spots.assign']({
      commandId: t.cmd(),
      businessId,
      areaId: kitchen.areas.cold.id,
      spotId: kitchen.spots.meatDrawer.id,
      articleIds: [kitchen.articles.entrecote.id, kitchen.articles.entrecote.id],
    });
    expect(same).toEqual({ placed: 0, released: 0 });
    expect(await sizes(t)).toEqual(before);

    const input = {
      commandId: t.cmd(),
      businessId,
      areaId: kitchen.areas.dry.id,
      spotId: kitchen.spots.dryShelf.id,
      articleIds: [kitchen.articles.onions.id],
    };
    const first = await run['spots.assign'](input);
    const after = await sizes(t);
    expect(after.onSpots).toBe(before.onSpots + 1);
    expect(await run['spots.assign'](input)).toEqual(first);
    expect(await sizes(t)).toEqual(after);
  });

  it('refuses a spot of another area, and articles or areas it does not know', async () => {
    const { t, kitchen, run, businessId } = await setup();
    await expect(
      run['spots.assign']({
        commandId: t.cmd(),
        businessId,
        areaId: kitchen.areas.cold.id,
        spotId: kitchen.spots.dryShelf.id,
        articleIds: [kitchen.articles.cream.id],
      }),
    ).rejects.toMatchObject({ code: 'invalid' });
    const other = await stranger(t);
    const foreign = await addArticle(other, { name: 'Fremder Rahm' });
    await expect(
      run['spots.assign']({
        commandId: t.cmd(),
        businessId,
        areaId: kitchen.areas.cold.id,
        spotId: null,
        articleIds: [foreign.id],
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
    await expect(
      other.useCases['spots.assign']({
        commandId: other.cmd(),
        businessId: other.businessId,
        areaId: kitchen.areas.cold.id,
        spotId: null,
        articleIds: [foreign.id],
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
    expect(await article(other, foreign.id)).not.toHaveProperty('areaId');
  });
});

describe('events', () => {
  it('names every change of this module in the words of the domain', async () => {
    const { t, kitchen, run, businessId } = await setup();
    const { areaId } = await run['areas.create']({
      commandId: t.cmd(),
      businessId,
      name: 'Bar',
      kind: 'bar',
    });
    await run['areas.update']({ commandId: t.cmd(), businessId, areaId, name: 'Bar vorne' });
    const { spotId } = await run['spots.create']({
      commandId: t.cmd(),
      businessId,
      areaId,
      name: 'Kühlschublade',
    });
    await run['spots.update']({ commandId: t.cmd(), businessId, spotId, photo: PHOTO });
    await run['spots.assign']({
      commandId: t.cmd(),
      businessId,
      areaId,
      spotId,
      articleIds: [kitchen.articles.redWine.id],
    });
    await run['spots.delete']({ commandId: t.cmd(), businessId, spotId });
    await run['areas.reorder']({ commandId: t.cmd(), businessId, areaIds: [areaId] });
    await run['areas.delete']({ commandId: t.cmd(), businessId, areaId });
    expect(await eventTypes(t)).toEqual([
      'area.created',
      'area.updated',
      'spot.created',
      'spot.updated',
      'spot.articles_assigned',
      'spot.deleted',
      'area.reordered',
      'area.deleted',
    ]);
  });
});
