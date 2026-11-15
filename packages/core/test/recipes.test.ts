import { describe, expect, it } from 'vitest';
import {
  addDays,
  ArticleSchema,
  CommandError,
  MenuCardSchema,
  PlanEntrySchema,
  type Id,
} from '../src';
import { createTestContext, seedKitchen, type TestContext } from '../src/testing';

async function setup() {
  const t = await createTestContext();
  const kitchen = await seedKitchen(t);
  return { t, kitchen, run: t.useCases, businessId: t.businessId };
}

/** Puts a menu card holding these recipes straight into storage (the menu module owns it). */
async function addMenuCard(t: TestContext, recipeIds: Id[]) {
  const now = t.clock.now();
  await t.storage.menuCards.add(
    MenuCardSchema.parse({
      id: t.cmd(),
      businessId: t.businessId,
      createdAt: now,
      updatedAt: now,
      name: 'Abendkarte',
      sections: [{ id: t.cmd(), title: 'Hauptgänge', recipeIds }],
      showPrices: true,
      showPhotos: true,
      published: true,
    }),
  );
}

async function addPlanEntry(
  t: TestContext,
  recipeId: Id,
  days: number,
  productionId?: Id,
): Promise<void> {
  const now = t.clock.now();
  await t.storage.planEntries.add(
    PlanEntrySchema.parse({
      id: t.cmd(),
      businessId: t.businessId,
      createdAt: now,
      updatedAt: now,
      date: addDays(t.clock.today(), days),
      slot: 'dinner',
      recipeId,
      portions: 20,
      ...(productionId === undefined ? {} : { productionId }),
    }),
  );
}

describe('recipes.list', () => {
  it('lists dishes and components with price, cost, margin and declaration', async () => {
    const { kitchen, run, businessId } = await setup();
    const result = await run['recipes.list']({ businessId });
    expect(result.rows.map((row) => row.name)).toEqual([
      'Entrecôte mit Rotweinjus und Kartoffelstock',
      'Lachs mit Rahmsauce',
      'Rotweinjus',
    ]);
    expect(result.kinds).toEqual({ dish: 2, component: 1 });
    expect(result.targetFoodCostBps).toBe(3000);
    // 1.8 kg / 0.9 × 62.00 + 5 dl jus × 7.89 + 2 kg / 0.8 × 1.80 + 4 dl × 6.40 + 150 g × 14.00
    // = 124.00 + 3.945 + 4.50 + 2.56 + 2.10 = 137.105 for 10 portions = 13.71
    // CHF 42.00 with 8.1 % VAT = 38.85 net; 13.71 / 38.85 = 35.3 %; 38.85 - 13.71 = 25.14
    expect(result.rows[0]).toMatchObject({
      id: kitchen.recipes.entrecoteDish.id,
      kind: 'dish',
      course: 'main',
      priceRappen: 4200,
      costPerPortionRappen: 1371,
      foodCostBps: 3529,
      marginRappen: 2514,
      status: 'over',
      allergens: ['milk', 'sulphites'],
      diet: 'omnivore',
      gaps: [],
      incomplete: false,
      active: true,
    });
    // 640 g × 38.00 + 3 dl × 6.40 + 40 g × 14.00 = 26.80 for 4 portions = 6.70; 34.00 → 31.45 net
    expect(result.rows[1]).toMatchObject({
      costPerPortionRappen: 670,
      foodCostBps: 2130,
      status: 'good',
    });
    // One litre of jus: 200 g onions 0.44 + 7.5 dl wine 6.75 + 50 g butter 0.70 = 7.89 per litre
    expect(result.rows[2]).toMatchObject({
      kind: 'component',
      status: 'unknown',
      output: { articleId: kitchen.articles.jus.id, quantity: 1000, unit: 'ml', costPer1000: 789 },
      allergens: ['milk', 'sulphites'],
      diet: 'vegetarian',
    });
    expect(result.rows[2]?.priceRappen).toBeUndefined();
    expect(result.counts).toEqual({ all: 3, over_target: 1, incomplete: 0, inactive: 0 });
    expect(result.courses).toEqual([
      { course: 'main', count: 2 },
      { course: 'other', count: 1 },
    ]);
  });

  it('narrows by kind, course, search and view', async () => {
    const { kitchen, run, businessId, t } = await setup();
    const dishes = await run['recipes.list']({ businessId, kind: 'dish' });
    expect(dishes.rows).toHaveLength(2);
    expect(dishes.courses).toEqual([{ course: 'main', count: 2 }]);
    const components = await run['recipes.list']({ businessId, kind: 'component' });
    expect(components.rows.map((row) => row.name)).toEqual(['Rotweinjus']);
    // Case and accents do not matter; the description is searched too.
    const searched = await run['recipes.list']({ businessId, search: 'ENTRECOTE grill' });
    expect(searched.rows.map((row) => row.id)).toEqual([kitchen.recipes.entrecoteDish.id]);
    const over = await run['recipes.list']({ businessId, filter: 'over_target' });
    expect(over.rows.map((row) => row.id)).toEqual([kitchen.recipes.entrecoteDish.id]);
    const soups = await run['recipes.list']({ businessId, course: 'soup' });
    expect(soups.rows).toEqual([]);

    await run['recipes.setActive']({
      commandId: t.cmd(),
      businessId,
      recipeId: kitchen.recipes.salmonDish.id,
      active: false,
    });
    const active = await run['recipes.list']({ businessId });
    expect(active.rows).toHaveLength(2);
    expect(active.counts).toMatchObject({ all: 2, inactive: 1 });
    const inactive = await run['recipes.list']({ businessId, filter: 'inactive' });
    expect(inactive.rows.map((row) => row.id)).toEqual([kitchen.recipes.salmonDish.id]);
  });

  it('marks what is incomplete instead of showing a calm number', async () => {
    const { kitchen, run, businessId, t } = await setup();
    // The salmon loses its price, the beef its origin, the salmon dish its menu price.
    await t.storage.articles.put(
      ArticleSchema.parse({ ...kitchen.articles.salmon, pricePer1000: 0 }),
    );
    const beef: Record<string, unknown> = { ...kitchen.articles.entrecote };
    delete beef.originCountry;
    await t.storage.articles.put(ArticleSchema.parse(beef));
    await run['recipes.setPrice']({
      commandId: t.cmd(),
      businessId,
      recipeId: kitchen.recipes.salmonDish.id,
      priceRappen: null,
    });
    const result = await run['recipes.list']({ businessId, filter: 'incomplete' });
    expect(result.rows.map((row) => [row.name, row.gaps])).toEqual([
      ['Entrecôte mit Rotweinjus und Kartoffelstock', ['origin']],
      ['Lachs mit Rahmsauce', ['cost', 'price']],
    ]);
    expect(result.rows[1]).toMatchObject({ status: 'unknown', incomplete: true });
    expect(result.rows[1]?.foodCostBps).toBeUndefined();
    expect(result.counts.incomplete).toBe(2);
  });

  it('shows another business nothing', async () => {
    const { t } = await setup();
    const other = await createTestContext({ storage: t.storage, idStart: 10_000 });
    const result = await other.useCases['recipes.list']({ businessId: other.businessId });
    expect(result.rows).toEqual([]);
    expect(result.kinds).toEqual({ dish: 0, component: 0 });
  });
});

describe('recipes.get', () => {
  it('costs the entrecôte line by line and judges it against the target', async () => {
    const { kitchen, run, businessId } = await setup();
    const detail = await run['recipes.get']({
      businessId,
      recipeId: kitchen.recipes.entrecoteDish.id,
    });
    expect(detail.portions).toBe(10);
    expect(detail.lines.map((line) => [line.name, line.grossQuantity, line.costRappen])).toEqual([
      ['Rindsentrecôte', 2000, 12_400], // 1.8 kg net at 90 % = 2 kg × 62.00
      ['Rotweinjus', 500, 395], // 5 dl × 7.89 = 3.945
      ['Kartoffeln', 2500, 450], // 2 kg net at 80 % = 2.5 kg × 1.80
      ['Vollrahm', 400, 256],
      ['Butter', 150, 210],
    ]);
    expect(detail.lines[1]).toMatchObject({
      articleKind: 'prepared',
      componentRecipeId: kitchen.recipes.jus.id,
      pricePer1000: 789,
      priceMissing: false,
      usableStock: 0,
    });
    expect(detail.lines[0]).toMatchObject({ yieldBps: 9000, usableStock: 4000, known: true });
    expect(detail.cost).toEqual({
      totalRappen: 13_711, // 137.105 rounds to 137.11
      perPortionRappen: 1371,
      scaledRappen: 13_711,
      missingPrices: [],
    });
    expect(detail.figures).toEqual({
      priceRappen: 4200,
      vatBps: 810,
      netRappen: 3885,
      vatRappen: 315,
      marginRappen: 2514,
      foodCostBps: 3529,
      status: 'over',
      targetFoodCostBps: 3000,
      // 13.71 / 30 % = 45.70 net, 49.41 with VAT, rounded up to 49.50
      suggestedPriceRappen: 4950,
      // 49.50 → 45.79 net; 13.71 / 45.79 = 29.9 %
      suggestedFoodCostBps: 2994,
    });
    expect(detail.component).toBeUndefined();
    expect(detail.gaps).toEqual([]);
    expect(detail.businessName).toBe('Testküche');
  });

  it('declares milk and the sulphites of the wine inside the jus, and the origin of the beef', async () => {
    const { kitchen, run, businessId } = await setup();
    const { declaration } = await run['recipes.get']({
      businessId,
      recipeId: kitchen.recipes.entrecoteDish.id,
    });
    expect(declaration).toMatchObject({
      allergens: ['milk', 'sulphites'],
      traces: [],
      diet: 'omnivore',
      origins: [
        {
          articleId: kitchen.articles.entrecote.id,
          name: 'Rindsentrecôte',
          country: 'CH',
          countryName: 'Schweiz',
        },
      ],
      incomplete: false,
      unknownIngredients: 0,
      loop: false,
    });
    expect(declaration.sources).toEqual([
      { allergen: 'milk', trace: false, from: ['Rotweinjus', 'Vollrahm', 'Butter'], extra: false },
      { allergen: 'sulphites', trace: false, from: ['Rotweinjus'], extra: false },
    ]);
  });

  it('says how far the stock reaches and what runs short first', async () => {
    const { kitchen, run, businessId } = await setup();
    const dish = await run['recipes.get']({
      businessId,
      recipeId: kitchen.recipes.entrecoteDish.id,
      portions: 20,
    });
    // No jus in the house yet: no portion can be cooked.
    expect(dish.availability.portionsCovered).toBe(0);
    expect(dish.availability.limiting).toEqual([
      { articleId: kitchen.articles.jus.id, name: 'Rotweinjus' },
    ]);
    // 20 portions: 1 l jus, 4 kg beef gross (the 4 kg in stock cover it).
    expect(dish.availability.short).toEqual([
      {
        articleId: kitchen.articles.jus.id,
        name: 'Rotweinjus',
        unit: 'ml',
        needed: 1000,
        usable: 0,
        missing: 1000,
      },
    ]);
    expect(dish.lines[0]).toMatchObject({ scaledQuantity: 3600, scaledGrossQuantity: 4000 });
    expect(dish.cost.scaledRappen).toBe(27_421); // 274.21 for twice the batch
    // The jus: 6 l wine at 7.5 dl a batch = 8 batches; onions and butter last longer.
    const jus = await run['recipes.get']({ businessId, recipeId: kitchen.recipes.jus.id });
    expect(jus.availability.portionsCovered).toBe(8);
    expect(jus.availability.limiting.map((line) => line.name)).toEqual(['Rotwein zum Kochen']);
    expect(jus.availability.short).toEqual([]);
  });

  it('does not count beef past its Verbrauchsdatum as usable', async () => {
    const { kitchen, run, businessId, t } = await setup();
    t.clock.setToday(addDays(t.clock.today(), 3)); // the beef was to be used by today + 2
    const dish = await run['recipes.get']({
      businessId,
      recipeId: kitchen.recipes.entrecoteDish.id,
    });
    expect(dish.lines[0]?.usableStock).toBe(0);
  });

  it('shows a component with the article it fills and the dishes that use it', async () => {
    const { kitchen, run, businessId } = await setup();
    const detail = await run['recipes.get']({ businessId, recipeId: kitchen.recipes.jus.id });
    expect(detail.figures).toBeUndefined();
    expect(detail.recipe.output).toEqual({
      articleId: kitchen.articles.jus.id,
      name: 'Rotweinjus',
      unit: 'ml',
      quantity: 1000,
    });
    expect(detail.component).toEqual({
      articleId: kitchen.articles.jus.id,
      articleName: 'Rotweinjus',
      unit: 'ml',
      outputQuantity: 1000,
      costPer1000: 789,
      lastPricePer1000: 0,
      stock: 0,
      usedIn: [
        {
          recipeId: kitchen.recipes.entrecoteDish.id,
          name: 'Entrecôte mit Rotweinjus und Kartoffelstock',
          kind: 'dish',
          quantity: 500,
          portions: 10,
          active: true,
        },
      ],
    });
    expect(detail.blockers).toEqual({
      menuCards: [],
      planEntries: 0,
      recipes: [
        { recipeId: kitchen.recipes.entrecoteDish.id, name: kitchen.recipes.entrecoteDish.name },
      ],
      stock: 0,
    });
    expect(detail.kindLock).toBe('used');
  });

  it('follows a dearer butter into the jus and the dish without touching either recipe', async () => {
    const { kitchen, run, businessId, t } = await setup();
    await t.storage.articles.put(
      ArticleSchema.parse({ ...kitchen.articles.butter, pricePer1000: 2000 }),
    );
    const jus = await run['recipes.get']({ businessId, recipeId: kitchen.recipes.jus.id });
    // 0.44 + 6.75 + 50 g × 20.00 = 1.00 → 8.19 per litre
    expect(jus.component?.costPer1000).toBe(819);
    const dish = await run['recipes.get']({
      businessId,
      recipeId: kitchen.recipes.entrecoteDish.id,
    });
    // 124.00 + 5 dl × 8.19 = 4.095 + 4.50 + 2.56 + 150 g × 20.00 = 3.00 → 138.155 → 13.82
    expect(dish.cost.perPortionRappen).toBe(1382);
    const stored = await t.storage.recipes.get(kitchen.recipes.entrecoteDish.id);
    expect(stored).toEqual(kitchen.recipes.entrecoteDish);
  });

  it('names what is missing: prices, origin, ingredients that are gone', async () => {
    const { kitchen, run, businessId, t } = await setup();
    const now = t.clock.now();
    await t.storage.articles.put(
      ArticleSchema.parse({ ...kitchen.articles.cream, pricePer1000: 0 }),
    );
    await t.storage.articles.put(
      ArticleSchema.parse({ ...kitchen.articles.butter, deletedAt: now }),
    );
    const detail = await run['recipes.get']({
      businessId,
      recipeId: kitchen.recipes.salmonDish.id,
    });
    expect(detail.cost.missingPrices).toEqual([
      { articleId: kitchen.articles.cream.id, name: 'Vollrahm' },
      { articleId: kitchen.articles.butter.id, name: '' },
    ]);
    expect(detail.lines[2]).toMatchObject({ known: false, name: '', priceMissing: true });
    expect(detail.declaration).toMatchObject({
      incomplete: true,
      unknownIngredients: 1,
      loop: false,
    });
    expect(detail.figures?.status).toBe('unknown');
    expect(detail.gaps).toEqual(['cost', 'declaration']);
  });

  it('refuses an unknown recipe and another business', async () => {
    const { kitchen, run, businessId, t } = await setup();
    await expect(run['recipes.get']({ businessId, recipeId: t.cmd() })).rejects.toMatchObject({
      code: 'not_found',
    });
    const other = await createTestContext({ storage: t.storage, idStart: 10_000 });
    await expect(
      other.useCases['recipes.get']({
        businessId: other.businessId,
        recipeId: kitchen.recipes.entrecoteDish.id,
      }),
    ).rejects.toBeInstanceOf(CommandError);
    await expect(
      other.useCases['recipes.card']({
        businessId: other.businessId,
        recipeId: kitchen.recipes.entrecoteDish.id,
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
    await expect(
      other.useCases['recipes.editor']({
        businessId: other.businessId,
        recipeId: kitchen.recipes.entrecoteDish.id,
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('names where a recipe is held: menu cards and the open menu plan', async () => {
    const { kitchen, run, businessId, t } = await setup();
    const dishId = kitchen.recipes.salmonDish.id;
    await addMenuCard(t, [dishId]);
    await addPlanEntry(t, dishId, 2);
    await addPlanEntry(t, dishId, -1); // yesterday: history
    await addPlanEntry(t, dishId, 3, t.cmd()); // produced already
    const detail = await run['recipes.get']({ businessId, recipeId: dishId });
    expect(detail.blockers).toEqual({
      menuCards: ['Abendkarte'],
      planEntries: 1,
      recipes: [],
      stock: 0,
    });
    expect(detail.kindLock).toBe('menu');
  });
});

describe('recipes.card', () => {
  it('scales the ingredients for the pass and writes them as a kitchen does', async () => {
    const { kitchen, run, businessId } = await setup();
    const card = await run['recipes.card']({
      businessId,
      recipeId: kitchen.recipes.entrecoteDish.id,
      portions: 4,
    });
    expect(card).toMatchObject({
      name: 'Entrecôte mit Rotweinjus und Kartoffelstock',
      basePortions: 10,
      portions: 4,
      allergens: ['milk', 'sulphites'],
      diet: 'omnivore',
      declarationIncomplete: false,
      businessName: 'Testküche',
    });
    expect(card.ingredients.map((line) => [line.name, line.quantity, line.quantityText])).toEqual([
      ['Rindsentrecôte', 720, '720 g'],
      ['Rotweinjus', 200, '2 dl'],
      ['Kartoffeln', 800, '800 g'],
      ['Vollrahm', 160, '160 ml'],
      ['Butter', 60, '60 g'],
    ]);
    expect(card.steps).toEqual(kitchen.recipes.entrecoteDish.steps);
    expect(card.yieldText).toBeUndefined();
  });

  it('tells for a component what the scaled batch gives', async () => {
    const { kitchen, run, businessId } = await setup();
    const card = await run['recipes.card']({ businessId, recipeId: kitchen.recipes.jus.id });
    expect(card).toMatchObject({ portions: 1, basePortions: 1, yieldText: '1 l' });
    const double = await run['recipes.card']({
      businessId,
      recipeId: kitchen.recipes.jus.id,
      portions: 3,
    });
    expect(double.yieldText).toBe('3 l');
    expect(double.ingredients[1]).toMatchObject({ quantity: 2250, quantityText: '2.25 l' });
  });
});

describe('recipes.editor', () => {
  it('gives a new form the targets of the business and the components', async () => {
    const { kitchen, run, businessId } = await setup();
    const editor = await run['recipes.editor']({ businessId });
    expect(editor.recipe).toBeUndefined();
    expect(editor).toMatchObject({
      targetFoodCostBps: 3000,
      defaultVatBps: 810,
      unitLocked: false,
      loops: [],
    });
    expect(editor.components).toEqual([
      {
        id: kitchen.recipes.jus.id,
        name: 'Rotweinjus',
        portions: 1,
        ingredients: kitchen.recipes.jus.ingredients,
        output: { articleId: kitchen.articles.jus.id, quantity: 1000 },
        extraAllergens: [],
        extraTraces: [],
      },
    ]);
    expect(editor.origins).toEqual(
      expect.arrayContaining([
        { articleId: kitchen.articles.entrecote.id, categoryId: 'meat', country: 'CH' },
        { articleId: kitchen.articles.salmon.id, categoryId: 'fish', country: 'NO' },
      ]),
    );
  });

  it('names the components that would make a loop', async () => {
    const { kitchen, run, businessId, t } = await setup();
    // A sauce that contains the jus; for the jus, picking the sauce would be a loop.
    const sauce = await run['recipes.create']({
      commandId: t.cmd(),
      businessId,
      name: 'Pfeffersauce',
      kind: 'component',
      course: 'other',
      portions: 1,
      ingredients: [{ articleId: kitchen.articles.jus.id, quantity: 500 }],
      output: { quantity: 600, unit: 'ml' },
    });
    const editor = await run['recipes.editor']({ businessId, recipeId: kitchen.recipes.jus.id });
    expect(editor.recipe?.name).toBe('Rotweinjus');
    expect(editor.loops).toEqual([
      { articleId: kitchen.articles.jus.id, path: ['Rotweinjus', 'Rotweinjus'] },
      { articleId: sauce.articleId, path: ['Rotweinjus', 'Pfeffersauce', 'Rotweinjus'] },
    ]);
    expect(editor.kindLock).toBe('used');
    expect(editor.unitLocked).toBe(true);
  });
});
