import { describe, expect, it } from 'vitest';
import {
  CommandError,
  priceChangeImpact,
  RecipeSchema,
  TABLE_NAMES,
  type CostBook,
  type Id,
  type RecordStore,
} from '../src';
import { createTestContext, seedKitchen, type TestContext } from '../src/testing';

async function setup() {
  const t = await createTestContext();
  const kitchen = await seedKitchen(t);
  return { t, kitchen, run: t.useCases, businessId: t.businessId };
}

/** Every row of every table of the business and every event: equal before and after = nothing written. */
async function snapshot(t: TestContext): Promise<string> {
  const tables = await Promise.all(
    TABLE_NAMES.map(async (name) => {
      const store = t.storage[name] as unknown as RecordStore<{ id: Id; businessId: Id }>;
      return [name, await store.ofBusiness(t.businessId)] as const;
    }),
  );
  const events = await t.storage.events.ofBusiness(t.businessId);
  return JSON.stringify({ tables, events });
}

describe('recipes.priceChange', () => {
  it('shows what butter +15 % does to the dishes of the seeded kitchen', async () => {
    const { kitchen, run, businessId } = await setup();
    const result = await run['recipes.priceChange']({
      businessId,
      articleId: kitchen.articles.butter.id,
      percentBps: 1500,
    });

    // Butter CHF 14.00 per kg; +15 % is CHF 16.10 per kg (1400 × 1.15 = 1610 Rappen).
    expect(result.article).toEqual({
      id: kitchen.articles.butter.id,
      name: 'Butter',
      unit: 'g',
      pricePer1000: 1400,
      newPricePer1000: 1610,
    });
    // Both dishes use butter directly; the entrecôte also through its jus.
    expect(result.summary).toEqual({ using: 2, worse: 0, better: 0 });

    const entrecote = result.dishes.find((row) => row.id === kitchen.recipes.entrecoteDish.id);
    // Cost per portion: 1371 Rappen now. Butter 150 g at 1610 is 241.50 instead of 210.00,
    // the jus (50 g butter) rises from 789 to 800 per litre: 1375 Rappen per portion.
    // Net price 3885 (4200 at 8.1 %): 1371 → 3529 %, 1375 → 1375 × 10000 ÷ 3885 = 3539 %, over the
    // target both times.
    expect(entrecote).toMatchObject({
      name: 'Entrecôte mit Rotweinjus und Kartoffelstock',
      changed: true,
      before: { costPerPortionRappen: 1371, foodCostBps: 3529, status: 'over' },
      after: { costPerPortionRappen: 1375, foodCostBps: 3539, status: 'over' },
    });

    const salmon = result.dishes.find((row) => row.id === kitchen.recipes.salmonDish.id);
    // Butter 40 g: 670 → 672 Rappen per portion; net 3145 (3400 at 8.1 %): 2130 → 2137 %, good.
    expect(salmon).toMatchObject({
      name: 'Lachs mit Rahmsauce',
      changed: true,
      before: { costPerPortionRappen: 670, foodCostBps: 2130, status: 'good' },
      after: { costPerPortionRappen: 672, foodCostBps: 2137, status: 'good' },
    });
  });

  it('gives the same rows as the domain function on the same data', async () => {
    const { kitchen, run, businessId } = await setup();
    const result = await run['recipes.priceChange']({
      businessId,
      articleId: kitchen.articles.butter.id,
      percentBps: 1500,
    });
    const book: CostBook = {
      articles: new Map(Object.values(kitchen.articles).map((article) => [article.id, article])),
      recipes: new Map(Object.values(kitchen.recipes).map((recipe) => [recipe.id, recipe])),
    };
    const impact = priceChangeImpact({
      book,
      dishes: [kitchen.recipes.entrecoteDish, kitchen.recipes.salmonDish],
      articleId: kitchen.articles.butter.id,
      newPricePer1000: 1610,
      targetFoodCostBps: 3000,
    });
    // The operation shows the dishes that use the article, by name.
    expect(result.dishes).toEqual(
      impact.dishes
        .filter((dish) => dish.uses)
        .sort((a, b) => a.name.localeCompare(b.name, 'de-CH'))
        .map(({ id, name, changed, before, after }) => ({ id, name, changed, before, after })),
    );
    expect(result.summary).toEqual(impact.summary);
  });

  it('leaves out inactive dishes: they are not on the menu', async () => {
    const { t, kitchen, run, businessId } = await setup();
    await t.storage.recipes.put(
      RecipeSchema.parse({ ...kitchen.recipes.salmonDish, active: false }),
    );
    const result = await run['recipes.priceChange']({
      businessId,
      articleId: kitchen.articles.butter.id,
      percentBps: 1500,
    });
    expect(result.dishes.map((row) => row.id)).toEqual([kitchen.recipes.entrecoteDish.id]);
    expect(result.summary.using).toBe(1);
  });

  it('shows a percent of 0 as no change', async () => {
    const { kitchen, run, businessId } = await setup();
    const result = await run['recipes.priceChange']({
      businessId,
      articleId: kitchen.articles.butter.id,
      percentBps: 0,
    });
    expect(result.article.newPricePer1000).toBe(1400);
    expect(result.dishes.every((row) => !row.changed)).toBe(true);
    expect(result.summary).toEqual({ using: 2, worse: 0, better: 0 });
  });

  it('refuses an unknown article as not_found', async () => {
    const { run, businessId, t } = await setup();
    await expect(
      run['recipes.priceChange']({ businessId, articleId: t.cmd(), percentBps: 1500 }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('refuses an article without a price, in a sentence for the person', async () => {
    const { kitchen, run, businessId } = await setup();
    // The jus is made in house and has no price of its own yet.
    const error = await run['recipes.priceChange']({
      businessId,
      articleId: kitchen.articles.jus.id,
      percentBps: 1500,
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(CommandError);
    expect(error).toMatchObject({
      code: 'invalid',
      message: 'Der Artikel hat noch keinen Preis, darum lässt sich nichts durchrechnen.',
    });
  });

  it('refuses a percent outside -90 % to +300 % by the schema', async () => {
    const { kitchen, run, businessId } = await setup();
    const articleId = kitchen.articles.butter.id;
    await expect(
      run['recipes.priceChange']({ businessId, articleId, percentBps: 30_001 }),
    ).rejects.toThrow();
    await expect(
      run['recipes.priceChange']({ businessId, articleId, percentBps: -9_001 }),
    ).rejects.toThrow();
    await expect(
      run['recipes.priceChange']({ businessId, articleId, percentBps: 1.5 }),
    ).rejects.toThrow();
  });

  it('writes nothing: no rows, no movements, no events', async () => {
    const { t, kitchen, run, businessId } = await setup();
    const before = await snapshot(t);
    await run['recipes.priceChange']({
      businessId,
      articleId: kitchen.articles.butter.id,
      percentBps: 1500,
    });
    await run['recipes.priceChange']({
      businessId,
      articleId: kitchen.articles.butter.id,
      percentBps: -2000,
    });
    expect(await snapshot(t)).toBe(before);
    expect(before).toContain(kitchen.lots.butter.id);
  });
});
