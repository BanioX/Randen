import { describe, expect, it } from 'vitest';
import {
  addCard,
  addDish,
  givePhotos,
  PHOTO,
  refusal,
  setup,
  sizes,
  without,
} from './menu-support';

/** Two sections of the test kitchen: the entrecôte and the salmon dish, no photos yet. */
async function dinnerCard(s: Awaited<ReturnType<typeof setup>>, published = true) {
  const { entrecoteDish, salmonDish } = s.kitchen.recipes;
  return addCard(
    s,
    'Abendkarte',
    [
      { title: 'Vorspeisen', recipeIds: [] },
      { title: 'Hauptgänge', recipeIds: [entrecoteDish.id, salmonDish.id] },
    ],
    { published },
  );
}

describe('menu.list', () => {
  it('counts sections, dishes and open points, and sorts the cards by name', async () => {
    const s = await setup();
    await dinnerCard(s);
    await addCard(s, 'Bistro', [{ title: 'Eins', recipeIds: [s.kitchen.recipes.salmonDish.id] }]);
    const { cards } = await s.run['menu.list']({ businessId: s.businessId });
    expect(cards.map((card) => card.name)).toEqual(['Abendkarte', 'Bistro']);
    expect(cards[0]).toEqual({
      id: cards[0]?.id,
      name: 'Abendkarte',
      published: true,
      sectionCount: 2,
      dishCount: 2,
      problems: 2,
    });
    expect(cards[1]?.problems).toBe(1);
  });

  it('counts no open points once every dish has a photo', async () => {
    const s = await setup();
    await dinnerCard(s);
    await givePhotos(s);
    const [card] = (await s.run['menu.list']({ businessId: s.businessId })).cards;
    expect(card?.problems).toBe(0);
  });

  it('does not ask for photos when the card does not show them', async () => {
    const s = await setup();
    await addCard(
      s,
      'Ohne Fotos',
      [{ title: 'Eins', recipeIds: [s.kitchen.recipes.salmonDish.id] }],
      {
        showPhotos: false,
      },
    );
    const [card] = (await s.run['menu.list']({ businessId: s.businessId })).cards;
    expect(card?.problems).toBe(0);
  });

  it('is empty for a business without cards', async () => {
    const s = await setup();
    expect((await s.run['menu.list']({ businessId: s.businessId })).cards).toEqual([]);
  });
});

describe('menu.get', () => {
  it('gives the sections in order with prices and the open points as words', async () => {
    const s = await setup();
    const cardId = await dinnerCard(s, false);
    const view = await s.run['menu.get']({ businessId: s.businessId, cardId });
    expect(view.card).toEqual({
      id: cardId,
      name: 'Abendkarte',
      showPrices: true,
      showPhotos: true,
      published: false,
    });
    expect(view.sections.map((section) => section.title)).toEqual(['Vorspeisen', 'Hauptgänge']);
    expect(view.sections[0]?.dishes).toEqual([]);
    expect(view.sections[1]?.dishes).toEqual([
      {
        id: s.kitchen.recipes.entrecoteDish.id,
        name: 'Entrecôte mit Rotweinjus und Kartoffelstock',
        course: 'main',
        priceRappen: 4200,
        hasPhoto: false,
        active: true,
        problems: ['Foto fehlt'],
      },
      {
        id: s.kitchen.recipes.salmonDish.id,
        name: 'Lachs mit Rahmsauce',
        course: 'main',
        priceRappen: 3400,
        hasPhoto: false,
        active: true,
        problems: ['Foto fehlt'],
      },
    ]);
    expect(view.problemCount).toBe(2);
    expect(view.problems.map((entry) => entry.name)).toEqual([
      'Entrecôte mit Rotweinjus und Kartoffelstock',
      'Lachs mit Rahmsauce',
    ]);
  });

  it('shows no price problem when the card hides prices, and no photo problem without photos', async () => {
    const s = await setup();
    const { salmonDish } = s.kitchen.recipes;
    await s.t.storage.recipes.put(without(salmonDish, 'priceRappen'));
    const cardId = await addCard(s, 'Stumm', [{ title: 'Eins', recipeIds: [salmonDish.id] }], {
      showPrices: false,
      showPhotos: false,
    });
    const view = await s.run['menu.get']({ businessId: s.businessId, cardId });
    expect(view.sections[0]?.dishes[0]?.problems).toEqual([]);
    expect(view.sections[0]?.dishes[0]).not.toHaveProperty('priceRappen');
  });

  it('reports a dish whose price is missing when the card shows prices', async () => {
    const s = await setup();
    const { salmonDish } = s.kitchen.recipes;
    await s.t.storage.recipes.put(without(salmonDish, 'priceRappen'));
    const cardId = await addCard(s, 'Ohne Preis', [{ title: 'Eins', recipeIds: [salmonDish.id] }]);
    const view = await s.run['menu.get']({ businessId: s.businessId, cardId });
    expect(view.sections[0]?.dishes[0]?.problems).toEqual(['Preis fehlt', 'Foto fehlt']);
    expect(view.sections[0]?.dishes[0]).not.toHaveProperty('priceRappen');
  });

  it('names a dish whose origin is missing and a deleted dish, but keeps its name', async () => {
    const s = await setup();
    const cardId = await dinnerCard(s, false);
    const { entrecote } = s.kitchen.articles;
    await s.t.storage.articles.put(without(entrecote, 'originCountry'));
    const dish = s.kitchen.recipes.salmonDish;
    await s.t.storage.recipes.put({ ...dish, deletedAt: s.t.clock.now() });
    const view = await s.run['menu.get']({ businessId: s.businessId, cardId });
    expect(view.sections[1]?.dishes[0]?.problems).toContain('Herkunft fehlt: Rindsentrecôte');
    expect(view.sections[1]?.dishes[1]).toMatchObject({
      name: 'Lachs mit Rahmsauce',
      active: false,
      problems: ['Rezept ist gelöscht'],
    });
  });

  it('gives not_found for a card that does not exist', async () => {
    const s = await setup();
    const error = await refusal(
      s.run['menu.get']({ businessId: s.businessId, cardId: s.t.ids.next() }),
    );
    expect(error.code).toBe('not_found');
  });
});

describe('menu.published', () => {
  it('lists only the published cards', async () => {
    const s = await setup();
    await dinnerCard(s, true);
    await addCard(s, 'Entwurf');
    const { cards } = await s.run['menu.published']({ businessId: s.businessId });
    expect(cards.map((card) => card.name)).toEqual(['Abendkarte']);
  });
});

describe('menu.guest', () => {
  it('refuses an unpublished card, unless it is previewed by the editor', async () => {
    const s = await setup();
    const cardId = await dinnerCard(s, false);
    const error = await refusal(s.run['menu.guest']({ businessId: s.businessId, cardId }));
    expect(error.code).toBe('not_found');
    const preview = await s.run['menu.guest']({ businessId: s.businessId, cardId, preview: true });
    expect(preview.preview).toBe(true);
    expect(preview.card.published).toBe(false);
    // The empty Vorspeisen section is not shown to the guest.
    expect(preview.sections.map((section) => section.title)).toEqual(['Hauptgänge']);
  });

  it('shows a published card with the business name, prices and no photos until they are on', async () => {
    const s = await setup();
    const cardId = await dinnerCard(s);
    const view = await s.run['menu.guest']({ businessId: s.businessId, cardId });
    expect(view.businessName).toBe('Testküche');
    expect(view.preview).toBe(false);
    const [mains] = view.sections;
    expect(mains?.dishes.map((dish) => dish.priceRappen)).toEqual([4200, 3400]);
    expect(mains?.dishes[0]).not.toHaveProperty('photo');

    await givePhotos(s);
    const withPhotos = await s.run['menu.guest']({ businessId: s.businessId, cardId });
    expect(withPhotos.sections[0]?.dishes[0]?.photo).toBe(PHOTO);
  });

  it('hides prices and photos the card does not show', async () => {
    const s = await setup();
    await givePhotos(s);
    const cardId = await addCard(
      s,
      'Ohne Preise',
      [{ title: 'Hauptgänge', recipeIds: [s.kitchen.recipes.salmonDish.id] }],
      {
        published: true,
        showPrices: false,
        showPhotos: false,
      },
    );
    const view = await s.run['menu.guest']({ businessId: s.businessId, cardId });
    const dish = view.sections[0]?.dishes[0];
    expect(dish).not.toHaveProperty('priceRappen');
    expect(dish).not.toHaveProperty('photo');
  });

  it('declares allergens, origin and diet from the recipes, and a dish with sulphites through its component', async () => {
    const s = await setup();
    const cardId = await dinnerCard(s);
    const view = await s.run['menu.guest']({ businessId: s.businessId, cardId });
    const [entrecote, salmon] = view.sections[0]?.dishes ?? [];
    expect(entrecote?.allergens.map((item) => item.id)).toEqual(['milk', 'sulphites']);
    expect(entrecote?.allergens.map((item) => item.label)).toEqual(['Milch', 'Sulfite']);
    expect(entrecote?.allergens[0]?.official).toContain('Milch und daraus');
    expect(entrecote?.diet).toBe('omnivore');
    expect(entrecote?.origins).toEqual([
      { name: 'Rindsentrecôte', country: 'CH', countryName: 'Schweiz' },
    ]);
    expect(entrecote?.incomplete).toBe(false);
    expect(salmon?.allergens.map((item) => item.id)).toEqual(['fish', 'milk']);
    expect(salmon?.origins).toEqual([
      { name: 'Lachsfilet', country: 'NO', countryName: 'Norwegen' },
    ]);
    expect(view.allergens).toEqual(['fish', 'milk', 'sulphites']);
    expect(view.traces).toEqual([]);
    expect(view.diets).toEqual(['omnivore']);
    expect(view.incomplete).toBe(false);
  });

  it('changes the card when the wine article loses its sulphites, and touches neither card nor recipe', async () => {
    const s = await setup();
    const cardId = await dinnerCard(s);
    const cardBefore = await s.t.storage.menuCards.get(cardId);
    const recipeBefore = await s.t.storage.recipes.get(s.kitchen.recipes.entrecoteDish.id);
    await s.t.storage.articles.put({ ...s.kitchen.articles.redWine, allergens: [] });
    const view = await s.run['menu.guest']({ businessId: s.businessId, cardId });
    expect(view.sections[0]?.dishes[0]?.allergens.map((item) => item.id)).toEqual(['milk']);
    expect(view.allergens).toEqual(['fish', 'milk']);
    expect(await s.t.storage.menuCards.get(cardId)).toEqual(cardBefore);
    expect(await s.t.storage.recipes.get(s.kitchen.recipes.entrecoteDish.id)).toEqual(recipeBefore);
  });

  it('shows traces apart from the contained allergens, the labels and the diets on the card', async () => {
    const s = await setup();
    const { entrecoteDish } = s.kitchen.recipes;
    await s.t.storage.recipes.put({
      ...entrecoteDish,
      extraTraces: ['nuts'],
      labels: ['house_special'],
    });
    const vegan = await addDish(s, {
      name: 'Gemüsestock mit Kartoffeln',
      ingredients: [
        { articleId: s.kitchen.articles.onions.id, quantity: 200 },
        { articleId: s.kitchen.articles.potatoes.id, quantity: 300 },
      ],
    });
    const vegetarian = await addDish(s, {
      name: 'Rahmsuppe',
      ingredients: [{ articleId: s.kitchen.articles.cream.id, quantity: 300 }],
    });
    const cardId = await addCard(
      s,
      'Vielfalt',
      [{ title: 'Alles', recipeIds: [entrecoteDish.id, vegan, vegetarian] }],
      { published: true },
    );
    const view = await s.run['menu.guest']({ businessId: s.businessId, cardId });
    const dishes = view.sections[0]?.dishes ?? [];
    expect(dishes[0]?.traces.map((item) => item.label)).toEqual(['Nüsse']);
    expect(dishes[0]?.labels).toEqual([{ id: 'house_special', text: 'Spezialität des Hauses' }]);
    expect(dishes[1]?.diet).toBe('vegan');
    expect(dishes[2]?.diet).toBe('vegetarian');
    expect(view.traces).toEqual(['nuts']);
    expect(view.diets).toEqual(['vegan', 'vegetarian', 'omnivore']);
  });

  it('leaves out inactive and deleted dishes, and a section with nothing left', async () => {
    const s = await setup();
    const { entrecoteDish, salmonDish } = s.kitchen.recipes;
    await s.t.storage.recipes.put({ ...salmonDish, active: false });
    const cardId = await dinnerCard(s);
    const view = await s.run['menu.guest']({ businessId: s.businessId, cardId });
    expect(view.sections.map((section) => section.title)).toEqual(['Hauptgänge']);
    expect(view.sections[0]?.dishes.map((dish) => dish.id)).toEqual([entrecoteDish.id]);

    await s.t.storage.recipes.put({ ...entrecoteDish, deletedAt: s.t.clock.now() });
    const empty = await s.run['menu.guest']({ businessId: s.businessId, cardId, preview: true });
    expect(empty.sections).toEqual([]);
    expect(empty.allergens).toEqual([]);
    expect(empty.diets).toEqual([]);
  });

  it('says a dish is incomplete when an ingredient is gone, and the card with it', async () => {
    const s = await setup();
    const { cream } = s.kitchen.articles;
    await s.t.storage.articles.put({ ...cream, deletedAt: s.t.clock.now() });
    const cardId = await dinnerCard(s);
    const view = await s.run['menu.guest']({ businessId: s.businessId, cardId });
    expect(view.incomplete).toBe(true);
    expect(view.sections[0]?.dishes.every((dish) => dish.incomplete)).toBe(true);
    const editor = await s.run['menu.get']({ businessId: s.businessId, cardId });
    expect(editor.sections[1]?.dishes[0]?.problems).toContain('Deklaration unvollständig');
  });

  it('counts a missing origin as incomplete for the guest, too', async () => {
    const s = await setup();
    await s.t.storage.articles.put(without(s.kitchen.articles.entrecote, 'originCountry'));
    const cardId = await dinnerCard(s);
    const view = await s.run['menu.guest']({ businessId: s.businessId, cardId });
    expect(view.sections[0]?.dishes[0]?.incomplete).toBe(true);
    expect(view.sections[0]?.dishes[0]?.origins).toEqual([{ name: 'Rindsentrecôte' }]);
    expect(view.sections[0]?.dishes[1]?.incomplete).toBe(false);
  });

  it('does not write anything when it is read', async () => {
    const s = await setup();
    const cardId = await dinnerCard(s);
    const before = await sizes(s.t);
    await s.run['menu.guest']({ businessId: s.businessId, cardId });
    await s.run['menu.get']({ businessId: s.businessId, cardId });
    await s.run['menu.list']({ businessId: s.businessId });
    expect(await sizes(s.t)).toEqual(before);
  });
});
