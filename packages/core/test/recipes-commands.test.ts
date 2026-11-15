import { describe, expect, it } from 'vitest';
import {
  addDays,
  alive,
  CommandError,
  createStockLedger,
  MenuCardSchema,
  PlanEntrySchema,
  PurchaseOrderSchema,
  type DomainEvent,
  type Id,
} from '../src';
import { createTestContext, seedKitchen, type TestContext } from '../src/testing';

async function setup() {
  const t = await createTestContext();
  const kitchen = await seedKitchen(t);
  return { t, kitchen, run: t.useCases, businessId: t.businessId };
}

type Setup = Awaited<ReturnType<typeof setup>>;

/** The error a refused command threw, to look at its code and message. */
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

async function eventsOf(t: TestContext, type: string): Promise<DomainEvent[]> {
  return (await t.storage.events.ofBusiness(t.businessId)).filter((event) => event.type === type);
}

/** How much is written down: a repeated command must leave all of it alone. */
async function sizes(t: TestContext) {
  const [recipes, articles, events] = await Promise.all([
    t.storage.recipes.ofBusiness(t.businessId),
    t.storage.articles.ofBusiness(t.businessId),
    t.storage.events.ofBusiness(t.businessId),
  ]);
  return { recipes: recipes.length, articles: articles.length, events: events.length };
}

/** «Kartoffelstock» as a component: one batch gives 2 kg. */
async function createMash(s: Setup, commandId = s.t.cmd()) {
  return s.run['recipes.create']({
    commandId,
    businessId: s.businessId,
    name: 'Kartoffelstock',
    kind: 'component',
    course: 'side',
    portions: 1,
    ingredients: [
      { articleId: s.kitchen.articles.potatoes.id, quantity: 1500 },
      { articleId: s.kitchen.articles.cream.id, quantity: 400, note: 'heiss' },
      { articleId: s.kitchen.articles.butter.id, quantity: 100 },
    ],
    steps: ['Kartoffeln weich kochen.', 'Durchpressen, mit Rahm und Butter verrühren.'],
    shelfLifeDays: 2,
    output: { quantity: 2000, unit: 'g' },
  });
}

async function article(t: TestContext, id: Id | undefined) {
  if (id === undefined) {
    throw new Error('No article id');
  }
  const row = await t.storage.articles.get(id);
  if (row === undefined) {
    throw new Error(`No article ${id}`);
  }
  return row;
}

describe('recipes.create', () => {
  it('creates a dish with the VAT of the business and says so in an event', async () => {
    const s = await setup();
    const { run, businessId, kitchen, t } = s;
    const created = await run['recipes.create']({
      commandId: t.cmd(),
      businessId,
      name: '  Rahmschnitzel  ',
      kind: 'dish',
      course: 'main',
      portions: 2,
      ingredients: [
        { articleId: kitchen.articles.entrecote.id, quantity: 360 },
        { articleId: kitchen.articles.cream.id, quantity: 100 },
      ],
      steps: ['Fleisch braten.', 'Mit Rahm ablöschen.'],
      priceRappen: 3600,
      extraAllergens: ['mustard'],
      extraTraces: ['mustard', 'celery'],
      labels: ['house_special', 'house_special'],
      description: 'Mit Rahmsauce.',
    });
    expect(created.articleId).toBeUndefined();
    const stored = await t.storage.recipes.get(created.recipeId);
    expect(stored).toMatchObject({
      name: 'Rahmschnitzel',
      kind: 'dish',
      vatBps: 810,
      priceRappen: 3600,
      extraAllergens: ['mustard'],
      // A trace that is contained anyway is not a trace.
      extraTraces: ['celery'],
      labels: ['house_special'],
      active: true,
    });
    expect(stored?.output).toBeUndefined();
    const events = await eventsOf(t, 'recipe.created');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      actor: t.actor,
      payload: { recipeId: created.recipeId, kind: 'dish' },
    });
    const detail = await run['recipes.get']({ businessId, recipeId: created.recipeId });
    expect(detail.declaration.allergens).toEqual(['milk', 'mustard']);
    expect(detail.declaration.traces).toEqual(['celery']);
    expect(detail.declaration.sources).toContainEqual({
      allergen: 'mustard',
      trace: false,
      from: [],
      extra: true,
    });
  });

  it('creates a component with the article it fills, declared from its ingredients', async () => {
    const s = await setup();
    const created = await createMash(s);
    expect(created.articleId).toBeDefined();
    const recipe = await s.t.storage.recipes.get(created.recipeId);
    expect(recipe).toMatchObject({
      kind: 'component',
      output: { articleId: created.articleId, quantity: 2000 },
      shelfLifeDays: 2,
    });
    expect(recipe?.priceRappen).toBeUndefined();
    expect(await article(s.t, created.articleId)).toMatchObject({
      name: 'Kartoffelstock',
      kind: 'prepared',
      categoryId: 'prepared',
      unit: 'g',
      dateKind: 'use_by',
      pricePer1000: 0,
      recipeId: created.recipeId,
      shelfLifeDays: 2,
      areaId: s.kitchen.areas.cold.id,
      allergens: ['milk'],
      traces: [],
      diet: 'vegetarian',
      active: true,
    });
    const events = await eventsOf(s.t, 'recipe.created');
    expect(events[0]?.payload).toEqual({
      recipeId: created.recipeId,
      kind: 'component',
      articleId: created.articleId,
    });
  });

  it('lets a dish use the new component, and costs it through the component', async () => {
    const s = await setup();
    const mash = await createMash(s);
    if (mash.articleId === undefined) {
      throw new Error('No article');
    }
    const dish = await s.run['recipes.create']({
      commandId: s.t.cmd(),
      businessId: s.businessId,
      name: 'Bratwurst mit Kartoffelstock',
      kind: 'dish',
      course: 'main',
      portions: 1,
      ingredients: [{ articleId: mash.articleId, quantity: 250 }],
      priceRappen: 1800,
    });
    const detail = await s.run['recipes.get']({
      businessId: s.businessId,
      recipeId: dish.recipeId,
    });
    // Mash: 1.5 kg / 0.8 = 1.875 kg × 1.80 = 3.375 + 4 dl × 6.40 = 2.56 + 100 g × 14.00 = 1.40
    // = 7.335 for 2 kg = 3.6675 per kg → 3.67 (rounded per 1000 g); 250 g = 0.9175 → 0.92
    expect(detail.lines[0]).toMatchObject({
      name: 'Kartoffelstock',
      componentRecipeId: mash.recipeId,
      pricePer1000: 367,
    });
    expect(detail.cost.perPortionRappen).toBe(92);
    expect(detail.declaration.allergens).toEqual(['milk']);
    const component = await s.run['recipes.get']({
      businessId: s.businessId,
      recipeId: mash.recipeId,
    });
    expect(component.component?.usedIn.map((use) => use.name)).toEqual([
      'Bratwurst mit Kartoffelstock',
    ]);
  });

  it('is harmless to repeat', async () => {
    const s = await setup();
    const commandId = s.t.cmd();
    const first = await createMash(s, commandId);
    const before = await sizes(s.t);
    expect(await createMash(s, commandId)).toEqual(first);
    expect(await sizes(s.t)).toEqual(before);
  });

  it('refuses a name that is taken, also by an article, without regard to case', async () => {
    const s = await setup();
    const base = {
      businessId: s.businessId,
      kind: 'dish' as const,
      course: 'main' as const,
      portions: 1,
      ingredients: [],
    };
    await expect(
      s.run['recipes.create']({ ...base, commandId: s.t.cmd(), name: 'lachs MIT rahmsauce' }),
    ).rejects.toMatchObject({ code: 'duplicate_name' });
    // A component takes the name of its article: «Butter» is an article already.
    const refused = await refusal(
      s.run['recipes.create']({
        ...base,
        commandId: s.t.cmd(),
        name: 'butter',
        kind: 'component',
        output: { quantity: 500, unit: 'g' },
      }),
    );
    expect(refused.code).toBe('duplicate_name');
    expect(refused.message).toMatch(/^Article/);
    // A dish may share the name of an article: it fills none.
    await expect(
      s.run['recipes.create']({ ...base, commandId: s.t.cmd(), name: 'Butter' }),
    ).resolves.toBeDefined();
  });

  it('refuses an ingredient that is no live article of the business', async () => {
    const s = await setup();
    const other = await createTestContext({ storage: s.t.storage, idStart: 10_000 });
    const base = {
      commandId: s.t.cmd(),
      businessId: other.businessId,
      name: 'Fremdes Gericht',
      kind: 'dish' as const,
      course: 'main' as const,
      portions: 1,
    };
    await expect(
      other.useCases['recipes.create']({
        ...base,
        ingredients: [{ articleId: s.kitchen.articles.butter.id, quantity: 10 }],
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
    expect(alive(await s.t.storage.recipes.ofBusiness(other.businessId))).toEqual([]);
  });

  it('asks a component for what one batch gives', async () => {
    const s = await setup();
    await expect(
      s.run['recipes.create']({
        commandId: s.t.cmd(),
        businessId: s.businessId,
        name: 'Fond',
        kind: 'component',
        course: 'other',
        portions: 1,
        ingredients: [],
      }),
    ).rejects.toMatchObject({ code: 'invalid' });
  });
});

describe('recipes.update', () => {
  it('renames a component and its article, and keeps shelf life and unit in step', async () => {
    const s = await setup();
    const mash = await createMash(s);
    const commandId = s.t.cmd();
    const result = await s.run['recipes.update']({
      commandId,
      businessId: s.businessId,
      recipeId: mash.recipeId,
      name: 'Kartoffelpüree',
      shelfLifeDays: null,
      output: { quantity: 2200, unit: 'g' },
    });
    expect(result).toEqual({
      recipeId: mash.recipeId,
      articleId: mash.articleId,
      changed: ['name', 'shelfLifeDays', 'output'],
    });
    const row = await article(s.t, mash.articleId);
    expect(row.name).toBe('Kartoffelpüree');
    expect(row.shelfLifeDays).toBeUndefined();
    expect((await s.t.storage.recipes.get(mash.recipeId))?.output?.quantity).toBe(2200);
    // The unit may change as long as nothing holds the article.
    await s.run['recipes.update']({
      commandId: s.t.cmd(),
      businessId: s.businessId,
      recipeId: mash.recipeId,
      output: { quantity: 20, unit: 'pcs' },
    });
    expect((await article(s.t, mash.articleId)).unit).toBe('pcs');
    const events = await eventsOf(s.t, 'recipe.updated');
    expect(events[0]?.payload).toMatchObject({
      recipeId: mash.recipeId,
      fields: ['name', 'shelfLifeDays', 'output'],
    });
    // Repeated: the same answer, nothing new written.
    const before = await sizes(s.t);
    expect(
      await s.run['recipes.update']({
        commandId,
        businessId: s.businessId,
        recipeId: mash.recipeId,
        name: 'Noch anders',
      }),
    ).toEqual(result);
    expect(await sizes(s.t)).toEqual(before);
  });

  it('changes nothing and says nothing when nothing changes', async () => {
    const s = await setup();
    const recipe = s.kitchen.recipes.salmonDish;
    const result = await s.run['recipes.update']({
      commandId: s.t.cmd(),
      businessId: s.businessId,
      recipeId: recipe.id,
      name: recipe.name,
      ingredients: recipe.ingredients,
      priceRappen: recipe.priceRappen,
    });
    expect(result.changed).toEqual([]);
    expect(await eventsOf(s.t, 'recipe.updated')).toEqual([]);
  });

  it('refreshes the allergens of a component article from its recipe', async () => {
    const s = await setup();
    // The seeded jus article says nothing yet; its recipe has wine and butter.
    await s.run['recipes.update']({
      commandId: s.t.cmd(),
      businessId: s.businessId,
      recipeId: s.kitchen.recipes.jus.id,
      steps: ['Zwiebeln anschwitzen.', 'Ablöschen.', 'Montieren.'],
    });
    expect(await article(s.t, s.kitchen.articles.jus.id)).toMatchObject({
      allergens: ['milk', 'sulphites'],
      traces: [],
      diet: 'vegetarian',
    });
    const [event] = await eventsOf(s.t, 'recipe.updated');
    expect(event?.payload).toMatchObject({ articlesRefreshed: [s.kitchen.articles.jus.id] });
    // Without the butter, the milk goes, and a component made of the jus follows.
    const sauce = await s.run['recipes.create']({
      commandId: s.t.cmd(),
      businessId: s.businessId,
      name: 'Pfeffersauce',
      kind: 'component',
      course: 'other',
      portions: 1,
      ingredients: [{ articleId: s.kitchen.articles.jus.id, quantity: 500 }],
      output: { quantity: 600, unit: 'ml' },
    });
    expect((await article(s.t, sauce.articleId)).allergens).toEqual(['milk', 'sulphites']);
    await s.run['recipes.update']({
      commandId: s.t.cmd(),
      businessId: s.businessId,
      recipeId: s.kitchen.recipes.jus.id,
      ingredients: s.kitchen.recipes.jus.ingredients.slice(0, 2),
    });
    expect((await article(s.t, s.kitchen.articles.jus.id)).allergens).toEqual(['sulphites']);
    expect(await article(s.t, sauce.articleId)).toMatchObject({
      allergens: ['sulphites'],
      diet: 'vegan',
    });
  });

  it('refuses a recipe that would contain itself, naming the loop', async () => {
    const s = await setup();
    const jus = s.kitchen.recipes.jus;
    // Directly: the jus as an ingredient of the jus.
    await expect(
      s.run['recipes.update']({
        commandId: s.t.cmd(),
        businessId: s.businessId,
        recipeId: jus.id,
        ingredients: [...jus.ingredients, { articleId: s.kitchen.articles.jus.id, quantity: 50 }],
      }),
    ).rejects.toMatchObject({
      code: 'invalid',
      message: 'The recipe would contain itself: Rotweinjus → Rotweinjus',
    });
    // Through another component: the jus in the sauce, the sauce in the jus.
    const sauce = await s.run['recipes.create']({
      commandId: s.t.cmd(),
      businessId: s.businessId,
      name: 'Pfeffersauce',
      kind: 'component',
      course: 'other',
      portions: 1,
      ingredients: [{ articleId: s.kitchen.articles.jus.id, quantity: 500 }],
      output: { quantity: 600, unit: 'ml' },
    });
    if (sauce.articleId === undefined) {
      throw new Error('No article');
    }
    await expect(
      s.run['recipes.update']({
        commandId: s.t.cmd(),
        businessId: s.businessId,
        recipeId: jus.id,
        ingredients: [...jus.ingredients, { articleId: sauce.articleId, quantity: 50 }],
      }),
    ).rejects.toMatchObject({
      code: 'invalid',
      message: 'The recipe would contain itself: Rotweinjus → Pfeffersauce → Rotweinjus',
    });
    expect(await s.t.storage.recipes.get(jus.id)).toEqual(jus);
  });

  it('keeps the kind of a component that a dish uses or that is in stock', async () => {
    const s = await setup();
    await expect(
      s.run['recipes.update']({
        commandId: s.t.cmd(),
        businessId: s.businessId,
        recipeId: s.kitchen.recipes.jus.id,
        kind: 'dish',
      }),
    ).rejects.toMatchObject({ code: 'not_allowed' });
    // In stock: a production put 2 kg of mash into the cold room.
    const mash = await createMash(s);
    if (mash.articleId === undefined) {
      throw new Error('No article');
    }
    await createStockLedger(s.t.ctx).receive({
      businessId: s.businessId,
      articleId: mash.articleId,
      areaId: s.kitchen.areas.cold.id,
      quantity: 2000,
      pricePer1000: 367,
      receivedOn: s.t.clock.today(),
      origin: 'production',
    });
    await expect(
      s.run['recipes.update']({
        commandId: s.t.cmd(),
        businessId: s.businessId,
        recipeId: mash.recipeId,
        kind: 'dish',
      }),
    ).rejects.toMatchObject({ code: 'not_allowed' });
    // Once booked, the unit is fixed as well.
    await expect(
      s.run['recipes.update']({
        commandId: s.t.cmd(),
        businessId: s.businessId,
        recipeId: mash.recipeId,
        output: { quantity: 20, unit: 'pcs' },
      }),
    ).rejects.toMatchObject({ code: 'not_allowed' });
  });

  it('turns a free component into a dish and lets its article go, and back', async () => {
    const s = await setup();
    const mash = await createMash(s);
    const asDish = await s.run['recipes.update']({
      commandId: s.t.cmd(),
      businessId: s.businessId,
      recipeId: mash.recipeId,
      kind: 'dish',
      priceRappen: 900,
    });
    expect(asDish.changed).toEqual(['kind', 'priceRappen']);
    expect(asDish.articleId).toBeUndefined();
    expect((await article(s.t, mash.articleId)).deletedAt).toBeDefined();
    const dish = await s.t.storage.recipes.get(mash.recipeId);
    expect(dish).toMatchObject({ kind: 'dish', priceRappen: 900 });
    expect(dish?.output).toBeUndefined();
    // Back to a component: it needs its output and gets a new article.
    await expect(
      s.run['recipes.update']({
        commandId: s.t.cmd(),
        businessId: s.businessId,
        recipeId: mash.recipeId,
        kind: 'component',
      }),
    ).rejects.toMatchObject({ code: 'invalid' });
    const back = await s.run['recipes.update']({
      commandId: s.t.cmd(),
      businessId: s.businessId,
      recipeId: mash.recipeId,
      kind: 'component',
      output: { quantity: 2000, unit: 'g' },
    });
    expect(back.articleId).toBeDefined();
    expect(back.articleId).not.toBe(mash.articleId);
    const component = await s.t.storage.recipes.get(mash.recipeId);
    expect(component?.priceRappen).toBeUndefined();
    expect(component?.output?.articleId).toBe(back.articleId);
  });

  it('keeps a dish on a menu card a dish', async () => {
    const s = await setup();
    const now = s.t.clock.now();
    await s.t.storage.menuCards.add(
      MenuCardSchema.parse({
        id: s.t.cmd(),
        businessId: s.businessId,
        createdAt: now,
        updatedAt: now,
        name: 'Mittagskarte',
        sections: [{ id: s.t.cmd(), title: 'Fisch', recipeIds: [s.kitchen.recipes.salmonDish.id] }],
        showPrices: true,
        showPhotos: false,
        published: false,
      }),
    );
    await expect(
      s.run['recipes.update']({
        commandId: s.t.cmd(),
        businessId: s.businessId,
        recipeId: s.kitchen.recipes.salmonDish.id,
        kind: 'component',
        output: { quantity: 1000, unit: 'g' },
      }),
    ).rejects.toMatchObject({ code: 'not_allowed' });
  });

  it('refuses the recipe of another business', async () => {
    const s = await setup();
    const other = await createTestContext({ storage: s.t.storage, idStart: 10_000 });
    await expect(
      other.useCases['recipes.update']({
        commandId: other.cmd(),
        businessId: other.businessId,
        recipeId: s.kitchen.recipes.salmonDish.id,
        name: 'Gestohlen',
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
    expect((await s.t.storage.recipes.get(s.kitchen.recipes.salmonDish.id))?.name).toBe(
      'Lachs mit Rahmsauce',
    );
  });
});

describe('recipes.setPrice', () => {
  it('takes the proposal, which brings the entrecôte into the target', async () => {
    const s = await setup();
    const recipeId = s.kitchen.recipes.entrecoteDish.id;
    const commandId = s.t.cmd();
    const result = await s.run['recipes.setPrice']({
      commandId,
      businessId: s.businessId,
      recipeId,
      priceRappen: 4950,
    });
    expect(result).toEqual({ recipeId, priceRappen: 4950 });
    const detail = await s.run['recipes.get']({ businessId: s.businessId, recipeId });
    // 49.50 → 45.79 net; 13.71 / 45.79 = 29.9 %, within 30 %
    expect(detail.figures).toMatchObject({
      netRappen: 4579,
      foodCostBps: 2994,
      marginRappen: 3208,
      status: 'good',
    });
    const events = await eventsOf(s.t, 'recipe.price_set');
    expect(events[0]?.payload).toEqual({ recipeId, priceRappen: 4950, previousRappen: 4200 });
    const before = await sizes(s.t);
    expect(
      await s.run['recipes.setPrice']({
        commandId,
        businessId: s.businessId,
        recipeId,
        priceRappen: 100,
      }),
    ).toEqual(result);
    expect(await sizes(s.t)).toEqual(before);
  });

  it('removes a price, and refuses one for a component', async () => {
    const s = await setup();
    const recipeId = s.kitchen.recipes.salmonDish.id;
    expect(
      await s.run['recipes.setPrice']({
        commandId: s.t.cmd(),
        businessId: s.businessId,
        recipeId,
        priceRappen: null,
      }),
    ).toEqual({ recipeId });
    expect((await s.t.storage.recipes.get(recipeId))?.priceRappen).toBeUndefined();
    await expect(
      s.run['recipes.setPrice']({
        commandId: s.t.cmd(),
        businessId: s.businessId,
        recipeId: s.kitchen.recipes.jus.id,
        priceRappen: 500,
      }),
    ).rejects.toMatchObject({ code: 'not_allowed' });
  });
});

describe('recipes.duplicate', () => {
  it('copies a dish as «… (Kopie)», then «… (Kopie 2)»', async () => {
    const s = await setup();
    const source = s.kitchen.recipes.salmonDish;
    const first = await s.run['recipes.duplicate']({
      commandId: s.t.cmd(),
      businessId: s.businessId,
      recipeId: source.id,
    });
    expect(first.name).toBe('Lachs mit Rahmsauce (Kopie)');
    const copy = await s.t.storage.recipes.get(first.recipeId);
    expect(copy).toMatchObject({
      name: 'Lachs mit Rahmsauce (Kopie)',
      ingredients: source.ingredients,
      steps: source.steps,
      priceRappen: 3400,
    });
    const second = await s.run['recipes.duplicate']({
      commandId: s.t.cmd(),
      businessId: s.businessId,
      recipeId: source.id,
    });
    expect(second.name).toBe('Lachs mit Rahmsauce (Kopie 2)');
    const events = await eventsOf(s.t, 'recipe.duplicated');
    expect(events[0]?.payload).toEqual({ recipeId: first.recipeId, fromRecipeId: source.id });
  });

  it('gives a copied component its own article', async () => {
    const s = await setup();
    const commandId = s.t.cmd();
    const copy = await s.run['recipes.duplicate']({
      commandId,
      businessId: s.businessId,
      recipeId: s.kitchen.recipes.jus.id,
    });
    expect(copy.name).toBe('Rotweinjus (Kopie)');
    expect(copy.articleId).not.toBe(s.kitchen.articles.jus.id);
    expect(await article(s.t, copy.articleId)).toMatchObject({
      name: 'Rotweinjus (Kopie)',
      kind: 'prepared',
      unit: 'ml',
      recipeId: copy.recipeId,
      allergens: ['milk', 'sulphites'],
    });
    const before = await sizes(s.t);
    expect(
      await s.run['recipes.duplicate']({
        commandId,
        businessId: s.businessId,
        recipeId: s.kitchen.recipes.jus.id,
      }),
    ).toEqual(copy);
    expect(await sizes(s.t)).toEqual(before);
  });

  it('shortens a long name so the copy still fits', async () => {
    const s = await setup();
    const long = 'Sehr langes Gericht '.repeat(6).trim().slice(0, 120);
    const created = await s.run['recipes.create']({
      commandId: s.t.cmd(),
      businessId: s.businessId,
      name: long,
      kind: 'dish',
      course: 'main',
      portions: 1,
      ingredients: [],
    });
    const copy = await s.run['recipes.duplicate']({
      commandId: s.t.cmd(),
      businessId: s.businessId,
      recipeId: created.recipeId,
    });
    expect(copy.name.length).toBeLessThanOrEqual(120);
    expect(copy.name.endsWith(' (Kopie)')).toBe(true);
  });

  it('refuses an unknown recipe', async () => {
    const s = await setup();
    await expect(
      s.run['recipes.duplicate']({
        commandId: s.t.cmd(),
        businessId: s.businessId,
        recipeId: s.t.cmd(),
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('recipes.setActive', () => {
  it('sets a recipe inactive and back, once each', async () => {
    const s = await setup();
    const recipeId = s.kitchen.recipes.salmonDish.id;
    const commandId = s.t.cmd();
    expect(
      await s.run['recipes.setActive']({
        commandId,
        businessId: s.businessId,
        recipeId,
        active: false,
      }),
    ).toEqual({ recipeId, active: false });
    expect((await s.t.storage.recipes.get(recipeId))?.active).toBe(false);
    await s.run['recipes.setActive']({
      commandId,
      businessId: s.businessId,
      recipeId,
      active: false,
    });
    expect(await eventsOf(s.t, 'recipe.deactivated')).toHaveLength(1);
    await s.run['recipes.setActive']({
      commandId: s.t.cmd(),
      businessId: s.businessId,
      recipeId,
      active: true,
    });
    expect(await eventsOf(s.t, 'recipe.activated')).toHaveLength(1);
    // Already active: nothing to say.
    await s.run['recipes.setActive']({
      commandId: s.t.cmd(),
      businessId: s.businessId,
      recipeId,
      active: true,
    });
    expect(await eventsOf(s.t, 'recipe.activated')).toHaveLength(1);
  });
});

describe('recipes.delete', () => {
  it('refuses to delete a component while a dish uses it', async () => {
    const s = await setup();
    const mash = await createMash(s);
    if (mash.articleId === undefined) {
      throw new Error('No article');
    }
    await s.run['recipes.create']({
      commandId: s.t.cmd(),
      businessId: s.businessId,
      name: 'Bratwurst mit Kartoffelstock',
      kind: 'dish',
      course: 'main',
      portions: 1,
      ingredients: [{ articleId: mash.articleId, quantity: 250 }],
    });
    await expect(
      s.run['recipes.delete']({
        commandId: s.t.cmd(),
        businessId: s.businessId,
        recipeId: mash.recipeId,
      }),
    ).rejects.toMatchObject({ code: 'in_use' });
    expect((await s.t.storage.recipes.get(mash.recipeId))?.deletedAt).toBeUndefined();
  });

  it('refuses while the recipe is on a menu card or in the open menu plan', async () => {
    const s = await setup();
    const now = s.t.clock.now();
    const dishId = s.kitchen.recipes.salmonDish.id;
    const card = MenuCardSchema.parse({
      id: s.t.cmd(),
      businessId: s.businessId,
      createdAt: now,
      updatedAt: now,
      name: 'Abendkarte',
      sections: [{ id: s.t.cmd(), title: 'Fisch', recipeIds: [dishId] }],
      showPrices: true,
      showPhotos: true,
      published: true,
    });
    await s.t.storage.menuCards.add(card);
    const onCard = await refusal(
      s.run['recipes.delete']({ commandId: s.t.cmd(), businessId: s.businessId, recipeId: dishId }),
    );
    expect(onCard.code).toBe('in_use');
    expect(onCard.message).toMatch(/menu card/);
    await s.t.storage.menuCards.put({ ...card, deletedAt: now });
    await s.t.storage.planEntries.add(
      PlanEntrySchema.parse({
        id: s.t.cmd(),
        businessId: s.businessId,
        createdAt: now,
        updatedAt: now,
        date: addDays(s.t.clock.today(), 1),
        slot: 'lunch',
        recipeId: dishId,
        portions: 12,
      }),
    );
    const planned = await refusal(
      s.run['recipes.delete']({ commandId: s.t.cmd(), businessId: s.businessId, recipeId: dishId }),
    );
    expect(planned.code).toBe('in_use');
    expect(planned.message).toMatch(/menu plan/);
  });

  it('refuses a component in stock', async () => {
    const s = await setup();
    const mash = await createMash(s);
    if (mash.articleId === undefined) {
      throw new Error('No article');
    }
    await createStockLedger(s.t.ctx).receive({
      businessId: s.businessId,
      articleId: mash.articleId,
      areaId: s.kitchen.areas.cold.id,
      quantity: 1000,
      pricePer1000: 367,
      receivedOn: s.t.clock.today(),
      origin: 'production',
    });
    const inStock = await refusal(
      s.run['recipes.delete']({
        commandId: s.t.cmd(),
        businessId: s.businessId,
        recipeId: mash.recipeId,
      }),
    );
    expect(inStock.code).toBe('in_use');
    expect(inStock.message).toMatch(/stock/);
  });

  it('deletes softly, with the article of a component nothing holds', async () => {
    const s = await setup();
    // The dish first; then nothing holds the jus any more.
    const commandId = s.t.cmd();
    const dish = await s.run['recipes.delete']({
      commandId,
      businessId: s.businessId,
      recipeId: s.kitchen.recipes.entrecoteDish.id,
    });
    expect(dish).toEqual({ recipeId: s.kitchen.recipes.entrecoteDish.id });
    expect(
      (await s.t.storage.recipes.get(s.kitchen.recipes.entrecoteDish.id))?.deletedAt,
    ).toBeDefined();
    const before = await sizes(s.t);
    expect(
      await s.run['recipes.delete']({
        commandId,
        businessId: s.businessId,
        recipeId: s.kitchen.recipes.entrecoteDish.id,
      }),
    ).toEqual(dish);
    expect(await sizes(s.t)).toEqual(before);

    const jus = await s.run['recipes.delete']({
      commandId: s.t.cmd(),
      businessId: s.businessId,
      recipeId: s.kitchen.recipes.jus.id,
    });
    expect(jus).toEqual({
      recipeId: s.kitchen.recipes.jus.id,
      articleId: s.kitchen.articles.jus.id,
    });
    expect((await article(s.t, s.kitchen.articles.jus.id)).deletedAt).toBeDefined();
    const events = await eventsOf(s.t, 'recipe.deleted');
    expect(events.map((event) => event.payload)).toEqual([
      { recipeId: s.kitchen.recipes.entrecoteDish.id },
      { recipeId: s.kitchen.recipes.jus.id, articleId: s.kitchen.articles.jus.id },
    ]);
    const list = await s.run['recipes.list']({ businessId: s.businessId });
    expect(list.rows.map((row) => row.name)).toEqual(['Lachs mit Rahmsauce']);
    await expect(
      s.run['recipes.get']({ businessId: s.businessId, recipeId: s.kitchen.recipes.jus.id }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('keeps the article of a component while an open order names it', async () => {
    const s = await setup();
    const mash = await createMash(s);
    if (mash.articleId === undefined) {
      throw new Error('No article');
    }
    const now = s.t.clock.now();
    await s.t.storage.orders.add(
      PurchaseOrderSchema.parse({
        id: s.t.cmd(),
        businessId: s.businessId,
        createdAt: now,
        updatedAt: now,
        supplierId: s.kitchen.suppliers.wholesaler.id,
        status: 'draft',
        lines: [{ articleId: mash.articleId, quantity: 1000, pricePer1000: 400 }],
      }),
    );
    const result = await s.run['recipes.delete']({
      commandId: s.t.cmd(),
      businessId: s.businessId,
      recipeId: mash.recipeId,
    });
    expect(result).toEqual({ recipeId: mash.recipeId });
    expect((await article(s.t, mash.articleId)).deletedAt).toBeUndefined();
  });
});
