import { describe, expect, it } from 'vitest';
import { ArticleSchema, RecipeSchema } from '../src';
import { createTestContext, seedKitchen } from '../src/testing';

/** The test kitchen (see `seedKitchen`): ten articles, three recipes, two suppliers, two spots. */
async function setup() {
  const t = await createTestContext();
  const kitchen = await seedKitchen(t);
  const search = (text: string) => t.useCases['cockpit.search']({ businessId: t.businessId, text });
  return { t, kitchen, search };
}

const names = (rows: readonly { name: string }[]) => rows.map((row) => row.name);

describe('cockpit.search', () => {
  it('finds articles and recipes by every word, without regard to case and accents', async () => {
    const { search, kitchen } = await setup();
    const salmon = await search('LACHS');
    expect(salmon).toEqual({
      articles: [
        {
          id: kitchen.articles.salmon.id,
          name: 'Lachsfilet',
          unit: 'g',
          stock: 1500,
          areaName: 'Kühlzelle',
        },
      ],
      recipes: [
        {
          id: kitchen.recipes.salmonDish.id,
          name: 'Lachs mit Rahmsauce',
          kind: 'dish',
          course: 'main',
          priceRappen: 3400,
        },
      ],
      suppliers: [],
      spots: [],
      total: 2,
    });
    // «entrecote» finds «Entrecôte»; with «jus» only the dish is left.
    const entrecote = await search('entrecote');
    expect(names(entrecote.articles)).toEqual(['Rindsentrecôte']);
    expect(entrecote.articles[0]).toMatchObject({
      areaName: 'Kühlzelle',
      spotName: 'Schublade Fleisch',
    });
    const both = await search('  jus   entrecote ');
    expect(names(both.articles)).toEqual([]);
    expect(names(both.recipes)).toEqual(['Entrecôte mit Rotweinjus und Kartoffelstock']);
  });

  it('puts names that begin with the first word before the others', async () => {
    const { search } = await setup();
    const result = await search('rot');
    expect(names(result.articles)).toEqual(['Rotwein zum Kochen', 'Rotweinjus']);
    // A component has no price on the menu.
    expect(result.recipes).toEqual([
      expect.objectContaining({ name: 'Rotweinjus', kind: 'component' }),
      expect.objectContaining({ name: 'Entrecôte mit Rotweinjus und Kartoffelstock' }),
    ]);
    expect(result.recipes[0]).not.toHaveProperty('priceRappen');
  });

  it('finds suppliers and spots with how many articles they carry', async () => {
    const { search, kitchen } = await setup();
    expect((await search('muster')).suppliers).toEqual([
      {
        id: kitchen.suppliers.butcher.id,
        name: 'Metzgerei Muster',
        kind: 'supplier',
        articleCount: 1,
      },
    ]);
    expect((await search('beispiel')).suppliers).toEqual([
      {
        id: kitchen.suppliers.wholesaler.id,
        name: 'Grosshandel Beispiel',
        kind: 'supplier',
        articleCount: 8,
      },
    ]);
    expect((await search('regal')).spots).toEqual([
      {
        id: kitchen.spots.dryShelf.id,
        name: 'Regal 1, oben',
        areaId: kitchen.areas.dry.id,
        areaName: 'Trockenlager',
        articleCount: 1,
      },
    ]);
    const flour = (await search('mehl')).articles[0];
    expect(flour).toEqual({
      id: kitchen.articles.flour.id,
      name: 'Weissmehl',
      unit: 'g',
      stock: 3000,
      areaName: 'Trockenlager',
      spotName: 'Regal 1, oben',
    });
  });

  it('returns six per kind at most and counts every hit', async () => {
    const { t, search, kitchen } = await setup();
    for (let index = 1; index <= 8; index += 1) {
      await t.storage.articles.add(
        ArticleSchema.parse({
          ...kitchen.articles.onions,
          id: t.ids.next(),
          name: `Testartikel ${String(index)}`,
        }),
      );
    }
    const result = await search('testartikel');
    expect(names(result.articles)).toEqual([
      'Testartikel 1',
      'Testartikel 2',
      'Testartikel 3',
      'Testartikel 4',
      'Testartikel 5',
      'Testartikel 6',
    ]);
    expect(result.total).toBe(8);
    // Without stock an article says so with 0.
    expect(result.articles[0]?.stock).toBe(0);
  });

  it('leaves out what is deleted or inactive', async () => {
    const { t, search, kitchen } = await setup();
    const now = t.clock.now();
    await t.storage.recipes.put(
      RecipeSchema.parse({ ...kitchen.recipes.salmonDish, deletedAt: now, updatedAt: now }),
    );
    await t.storage.articles.put(
      ArticleSchema.parse({ ...kitchen.articles.salmon, active: false, updatedAt: now }),
    );
    expect((await search('lachs')).total).toBe(0);
  });

  it('answers an empty text with nothing, and writes nothing', async () => {
    const { t, search } = await setup();
    const before = await t.storage.events.ofBusiness(t.businessId);
    expect(await search('   ')).toEqual({
      articles: [],
      recipes: [],
      suppliers: [],
      spots: [],
      total: 0,
    });
    expect(await search('xyz')).toMatchObject({ total: 0 });
    expect(await t.storage.events.ofBusiness(t.businessId)).toEqual(before);
    await expect(search('x'.repeat(81))).rejects.toThrow();
  });

  it('shows another business nothing of this one', async () => {
    const { t } = await setup();
    const other = await createTestContext({ storage: t.storage, idStart: 10_000 });
    const result = await other.useCases['cockpit.search']({
      businessId: other.businessId,
      text: 'lachs',
    });
    expect(result.total).toBe(0);
  });
});
