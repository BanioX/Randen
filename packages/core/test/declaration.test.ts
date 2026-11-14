import { describe, expect, it } from 'vitest';
import {
  ALLERGENS,
  allergenLabel,
  allergenOfficial,
  articleCategory,
  ARTICLE_CATEGORIES,
  combineDiets,
  countryName,
  declarationOf,
  dietLabel,
  ORIGIN_COUNTRIES,
  sortAllergens,
  type DeclarationBook,
} from '../src';
import { createTestContext, seedKitchen } from '../src/testing';

async function kitchenBook() {
  const t = await createTestContext();
  const kitchen = await seedKitchen(t);
  const book: DeclarationBook = {
    articles: new Map(Object.values(kitchen.articles).map((article) => [article.id, article])),
    recipes: new Map(Object.values(kitchen.recipes).map((recipe) => [recipe.id, recipe])),
  };
  return { kitchen, book };
}

describe('allergens', () => {
  it('knows the fourteen of the Swiss ordinance, each with a badge word', () => {
    expect(ALLERGENS).toHaveLength(14);
    expect(new Set(ALLERGENS.map((allergen) => allergen.id)).size).toBe(14);
    expect(allergenLabel('milk')).toBe('Milch');
    expect(allergenOfficial('sulphites')).toContain('10 mg');
    for (const allergen of ALLERGENS) {
      expect(allergen.official).not.toMatch(/ß/);
    }
  });

  it('sorts and de-duplicates in the order of the ordinance', () => {
    expect(sortAllergens(['milk', 'gluten', 'milk', 'eggs'])).toEqual(['gluten', 'eggs', 'milk']);
  });

  it('makes a dish as strict as its weakest ingredient', () => {
    expect(combineDiets([])).toBe('vegan');
    expect(combineDiets(['vegan', 'vegetarian'])).toBe('vegetarian');
    expect(combineDiets(['vegetarian', 'omnivore', 'vegan'])).toBe('omnivore');
    expect(dietLabel('vegan')).toBe('Vegan');
  });
});

describe('declarationOf', () => {
  it('collects allergens through components made in house', async () => {
    const { kitchen, book } = await kitchenBook();
    const declaration = declarationOf(kitchen.recipes.entrecoteDish, book);
    // Milk from cream and butter, sulphites from the wine in the jus.
    expect(declaration.allergens).toEqual(['milk', 'sulphites']);
    expect(declaration.diet).toBe('omnivore');
    expect(declaration.incomplete).toBe(false);
  });

  it('lists meat and fish with their origin', async () => {
    const { kitchen, book } = await kitchenBook();
    expect(declarationOf(kitchen.recipes.entrecoteDish, book).origins).toEqual([
      {
        articleId: kitchen.articles.entrecote.id,
        name: 'Rindsentrecôte',
        categoryId: 'meat',
        country: 'CH',
      },
    ]);
    expect(declarationOf(kitchen.recipes.salmonDish, book).origins[0]?.country).toBe('NO');
  });

  it('adds what the recipe declares by hand, and keeps traces apart from contents', async () => {
    const { kitchen, book } = await kitchenBook();
    const recipe = {
      ...kitchen.recipes.salmonDish,
      extraAllergens: ['mustard' as const],
      extraTraces: ['nuts' as const, 'milk' as const],
    };
    const declaration = declarationOf(recipe, book);
    expect(declaration.allergens).toEqual(['fish', 'milk', 'mustard']);
    expect(declaration.traces).toEqual(['nuts']);
  });

  it('derives the diet of a component from its ingredients', async () => {
    const { kitchen, book } = await kitchenBook();
    // The article says vegan, but the jus is finished with butter.
    expect(kitchen.articles.jus.diet).toBe('vegan');
    expect(declarationOf(kitchen.recipes.jus, book).diet).toBe('vegetarian');
  });

  it('marks a declaration as incomplete when an ingredient is unknown or loops', async () => {
    const { kitchen, book } = await kitchenBook();
    const articles = new Map(book.articles);
    articles.delete(kitchen.articles.cream.id);
    expect(declarationOf(kitchen.recipes.salmonDish, { ...book, articles }).incomplete).toBe(true);
    const loop = {
      ...kitchen.recipes.jus,
      ingredients: [{ articleId: kitchen.articles.jus.id }],
    };
    const recipes = new Map(book.recipes).set(loop.id, loop);
    expect(declarationOf(loop, { ...book, recipes }).incomplete).toBe(true);
  });
});

describe('categories and countries', () => {
  it('gives every category a label, an area and a shelf life', () => {
    expect(ARTICLE_CATEGORIES.length).toBeGreaterThan(20);
    for (const category of ARTICLE_CATEGORIES) {
      expect(articleCategory(category.id).label).not.toBe('');
      expect(category.shelfLifeDays).toBeGreaterThan(0);
    }
    expect(articleCategory('meat').declaresOrigin).toBe(true);
    expect(articleCategory('vegetables').declaresOrigin).toBe(false);
  });

  it('names countries in German, Switzerland first', () => {
    expect(countryName('CH')).toBe('Schweiz');
    expect(countryName('XX')).toBe('XX');
    expect(ORIGIN_COUNTRIES[0]).toEqual({ code: 'CH', name: 'Schweiz' });
  });
});
