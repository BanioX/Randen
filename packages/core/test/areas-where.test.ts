import { describe, expect, it } from 'vitest';
import { addDays, ArticleSchema, createStockLedger, type Article, type Id } from '../src';
import { foldText, matchName } from '../src/modules/areas/use-cases';
import { createTestContext, seedKitchen, type TestContext } from '../src/testing';

const PHOTO = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';

async function setup() {
  const t = await createTestContext();
  const kitchen = await seedKitchen(t);
  return { t, kitchen, run: t.useCases, businessId: t.businessId };
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

async function receive(t: TestContext, item: Article, areaId: Id, quantity: number) {
  const ledger = createStockLedger(t.ctx);
  return t.storage.transaction(() =>
    ledger.receive({
      businessId: t.businessId,
      articleId: item.id,
      areaId,
      quantity,
      pricePer1000: item.pricePer1000,
      receivedOn: t.clock.today(),
      expiresOn: addDays(t.clock.today(), 5),
      origin: 'purchase',
    }),
  );
}

describe('reading a search', () => {
  it('ignores case and accents', () => {
    expect(foldText('  Rindsentrecôte ')).toBe('rindsentrecote');
    expect(foldText('KÄSE Crème')).toBe('kase creme');
  });

  it('ranks a name that starts with the text before a word that does, before the rest', () => {
    expect(matchName('Rahmsauce', ['rahm'])).toBe('start');
    expect(matchName('Saucen-Rahm', ['rahm'])).toBe('word');
    expect(matchName('Vollrahm', ['rahm'])).toBe('contains');
    expect(matchName('Rindsentrecôte', ['rinds', 'entre'])).toBe('start');
    expect(matchName('Entrecôte vom Rind', ['rind', 'entre'])).toBe('word');
    expect(matchName('Vollrahm', ['rahm', 'sauer'])).toBeUndefined();
    expect(matchName('Vollrahm', [])).toBeUndefined();
  });
});

describe('where.search', () => {
  it('finds «Vollrahm» by «rahm», with its area', async () => {
    const { kitchen, run, businessId } = await setup();
    const { articles, spots, areas, browse } = await run['where.search']({
      businessId,
      text: 'rahm',
    });
    expect(articles).toEqual([
      {
        articleId: kitchen.articles.cream.id,
        name: 'Vollrahm',
        unit: 'ml',
        categoryId: 'dairy',
        match: 'contains',
        area: { id: kitchen.areas.cold.id, name: 'Kühlzelle', kind: 'cold' },
        // 3 l and 5 l, both in the cold room: where it belongs.
        stock: 8000,
        stockPlaces: [
          {
            areaId: kitchen.areas.cold.id,
            areaName: 'Kühlzelle',
            areaKind: 'cold',
            quantity: 8000,
          },
        ],
        stockElsewhere: false,
      },
    ]);
    expect(spots).toEqual([]);
    expect(areas).toEqual([]);
    expect(browse).toEqual([]);
  });

  it('finds «Rindsentrecôte» by «entrecote», with the photo of its spot', async () => {
    const { t, kitchen, run, businessId } = await setup();
    await run['spots.update']({
      commandId: t.cmd(),
      businessId,
      spotId: kitchen.spots.meatDrawer.id,
      note: 'Unterste Schublade links',
      photo: PHOTO,
    });
    const { articles } = await run['where.search']({ businessId, text: 'ENTRECOTE' });
    expect(articles).toHaveLength(1);
    expect(articles[0]).toMatchObject({
      name: 'Rindsentrecôte',
      area: { name: 'Kühlzelle' },
      spot: {
        id: kitchen.spots.meatDrawer.id,
        name: 'Schublade Fleisch',
        note: 'Unterste Schublade links',
        photo: PHOTO,
      },
      stock: 4000,
      stockElsewhere: false,
    });
  });

  it('puts the best hits first and leaves inactive articles out', async () => {
    const { t, kitchen, run, businessId } = await setup();
    await addArticle(t, { name: 'Saucen-Rahm', areaId: kitchen.areas.cold.id });
    await addArticle(t, { name: 'Rahmsauce', areaId: kitchen.areas.cold.id });
    await addArticle(t, { name: 'Sauerrahm', active: false });
    const { articles } = await run['where.search']({ businessId, text: ' Rahm ' });
    expect(articles.map((hit) => [hit.name, hit.match])).toEqual([
      ['Rahmsauce', 'start'],
      ['Saucen-Rahm', 'word'],
      ['Vollrahm', 'contains'],
    ]);
  });

  it('says where the stock lies right now when that is not where it belongs', async () => {
    const { t, kitchen, run, businessId } = await setup();
    await receive(t, kitchen.articles.entrecote, kitchen.areas.frozen.id, 1500);
    const homeless = await addArticle(t, { name: 'Rinderhack' });
    await receive(t, homeless, kitchen.areas.frozen.id, 2000);
    const { articles } = await run['where.search']({ businessId, text: 'rind' });
    expect(articles.map((hit) => hit.name)).toEqual(['Rinderhack', 'Rindsentrecôte']);
    expect(articles[1]).toMatchObject({
      stock: 5500,
      stockPlaces: [
        { areaName: 'Kühlzelle', quantity: 4000 },
        { areaName: 'Tiefkühlzelle', quantity: 1500 },
      ],
      stockElsewhere: true,
    });
    // No usual place at all: whatever stock there is lies elsewhere.
    expect(articles[0]).not.toHaveProperty('area');
    expect(articles[0]).not.toHaveProperty('spot');
    expect(articles[0]).toMatchObject({ stock: 2000, stockElsewhere: true });
  });

  it('finds spots and areas by name', async () => {
    const { kitchen, run, businessId } = await setup();
    const bySpot = await run['where.search']({ businessId, text: 'schublade' });
    expect(bySpot.articles).toEqual([]);
    expect(bySpot.spots).toEqual([
      {
        spotId: kitchen.spots.meatDrawer.id,
        name: 'Schublade Fleisch',
        area: { id: kitchen.areas.cold.id, name: 'Kühlzelle', kind: 'cold' },
        articleCount: 1,
        match: 'start',
      },
    ]);
    const byArea = await run['where.search']({ businessId, text: 'kühl' });
    expect(byArea.areas.map((hit) => [hit.name, hit.match])).toEqual([
      ['Kühlzelle', 'start'],
      ['Tiefkühlzelle', 'contains'],
    ]);
    expect(byArea.areas[0]).toMatchObject({ spotCount: 1, articleCount: 6 });
  });

  it('shows every area with its spots before anything is typed', async () => {
    const { kitchen, run, businessId } = await setup();
    const { articles, browse } = await run['where.search']({ businessId, text: '  ' });
    expect(articles).toEqual([]);
    expect(browse.map((area) => [area.name, area.articleCount, area.spots.length])).toEqual([
      ['Kühlzelle', 6, 1],
      ['Tiefkühlzelle', 0, 0],
      ['Trockenlager', 4, 1],
    ]);
    expect(browse[2]?.spots).toEqual([
      { spotId: kitchen.spots.dryShelf.id, name: 'Regal 1, oben', articleCount: 1 },
    ]);
    expect(await run['where.search']({ businessId })).toMatchObject({ browse });
  });

  it('shows another business nothing', async () => {
    const { t } = await setup();
    const other = await createTestContext({ storage: t.storage, idStart: 100_000 });
    const found = await other.useCases['where.search']({
      businessId: other.businessId,
      text: 'rahm',
    });
    expect(found).toEqual({ articles: [], spots: [], areas: [], browse: [] });
  });
});

describe('tour.get', () => {
  it('walks every area and spot in order, with what lies there', async () => {
    const { kitchen, run, businessId } = await setup();
    const { areas, counts } = await run['tour.get']({ businessId });
    expect(counts).toEqual({ areas: 3, spots: 2, spotsWithPhoto: 0 });
    expect(areas.map((area) => area.name)).toEqual(['Kühlzelle', 'Tiefkühlzelle', 'Trockenlager']);
    expect(areas[0]).toEqual({
      id: kitchen.areas.cold.id,
      name: 'Kühlzelle',
      kind: 'cold',
      minDeciC: 0,
      maxDeciC: 50,
      rangeIsProposal: true,
      sortOrder: 0,
      spots: [
        {
          spotId: kitchen.spots.meatDrawer.id,
          name: 'Schublade Fleisch',
          articleNames: ['Rindsentrecôte'],
          articleCount: 1,
        },
      ],
      unplacedNames: ['Butter', 'Eier', 'Lachsfilet', 'Rotweinjus', 'Vollrahm'],
      unplacedCount: 5,
    });
    expect(areas[1]).toMatchObject({ spots: [], unplacedNames: [], unplacedCount: 0 });
  });

  it('names eight articles of a spot at most and counts the rest', async () => {
    const { t, kitchen, run, businessId } = await setup();
    for (let index = 1; index <= 10; index += 1) {
      await addArticle(t, {
        name: `Gewürz ${String(index).padStart(2, '0')}`,
        areaId: kitchen.areas.dry.id,
        spotId: kitchen.spots.dryShelf.id,
      });
    }
    const { areas } = await run['tour.get']({ businessId });
    const shelf = areas[2]?.spots[0];
    expect(shelf?.articleCount).toBe(11);
    expect(shelf?.articleNames).toHaveLength(8);
    expect(shelf?.articleNames[0]).toBe('Gewürz 01');
  });

  it('takes a new spot with a photo from the phone along', async () => {
    const { t, kitchen, run, businessId } = await setup();
    const { spotId } = await run['spots.create']({
      commandId: t.cmd(),
      businessId,
      areaId: kitchen.areas.frozen.id,
      name: 'Truhe links',
      note: 'Fisch und Meeresfrüchte',
      photo: PHOTO,
    });
    const { areas, counts } = await run['tour.get']({ businessId });
    expect(counts).toEqual({ areas: 3, spots: 3, spotsWithPhoto: 1 });
    expect(areas[1]?.spots).toEqual([
      {
        spotId,
        name: 'Truhe links',
        note: 'Fisch und Meeresfrüchte',
        photo: PHOTO,
        articleNames: [],
        articleCount: 0,
      },
    ]);
  });
});
