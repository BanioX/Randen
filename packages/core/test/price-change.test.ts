import { describe, expect, it } from 'vitest';
import {
  priceAfterChange,
  priceChangeImpact,
  uuidV7,
  type CostArticle,
  type CostBook,
  type CostRecipe,
  type Id,
  type PriceChangeDish,
} from '../src';

/** Stable ids for the hand-made book: the last byte counts. */
const idOf = (n: number): Id =>
  uuidV7(
    1_800_000_000_000,
    Uint8Array.from({ length: 10 }, (_, i) => (i === 9 ? n : 0)),
  );

// Butter: CHF 120.00 per kg = 12000 Rappen per 1000 g. Flour: CHF 10.00 per kg = 1000.
const butter: CostArticle = {
  id: idOf(1),
  kind: 'purchased',
  unit: 'g',
  pricePer1000: 12_000,
  yieldBps: 10_000,
};
const flour: CostArticle = {
  id: idOf(2),
  kind: 'purchased',
  unit: 'g',
  pricePer1000: 1_000,
  yieldBps: 10_000,
};

// Dish D «Butterbrot»: 50 g butter, CHF 32.00 incl. 8.1 % VAT.
const butterbrot: PriceChangeDish = {
  id: idOf(10),
  name: 'Butterbrot',
  portions: 1,
  ingredients: [{ articleId: butter.id, quantity: 50 }],
  priceRappen: 3200,
  vatBps: 810,
};
// Dish E «Mehlteig»: 50 g butter and 200 g flour, same price and VAT.
const mehlteig: PriceChangeDish = {
  id: idOf(11),
  name: 'Mehlteig',
  portions: 1,
  ingredients: [
    { articleId: butter.id, quantity: 50 },
    { articleId: flour.id, quantity: 200 },
  ],
  priceRappen: 3200,
  vatBps: 810,
};
// Dish F «Mehlsuppe»: 100 g flour only, does not use butter. CHF 10.00 incl. 8.1 % VAT.
const mehlsuppe: PriceChangeDish = {
  id: idOf(12),
  name: 'Mehlsuppe',
  portions: 1,
  ingredients: [{ articleId: flour.id, quantity: 100 }],
  priceRappen: 1000,
  vatBps: 810,
};

function bookOf(articles: CostArticle[], recipes: CostRecipe[] = []): CostBook {
  return {
    articles: new Map(articles.map((article) => [article.id, article])),
    recipes: new Map(recipes.map((recipe) => [recipe.id, recipe])),
  };
}

const book = bookOf([butter, flour]);
const TARGET = 3000;

describe('priceAfterChange', () => {
  it('moves a price by a percent in basis points, rounded half up to whole Rappen', () => {
    expect(priceAfterChange(12_000, 1_500)).toBe(13_800); // 12000 × 1.15
    expect(priceAfterChange(12_000, -1_500)).toBe(10_200); // 12000 × 0.85
    expect(priceAfterChange(1_400, 1_500)).toBe(1_610); // 1400 × 1.15
    expect(priceAfterChange(1, 5_000)).toBe(2); // 1.5 rounds up
    expect(priceAfterChange(1_000, 1)).toBe(1_000); // +0.01 % of 1000 is 0.1, rounds back
  });

  it('never goes below 1 Rappen: 0 would mean «no price»', () => {
    expect(priceAfterChange(1, -9_000)).toBe(1);
    expect(priceAfterChange(100, -9_000)).toBe(10);
  });
});

describe('priceChangeImpact', () => {
  it('computes butter +15 % for Butterbrot, Mehlteig and Mehlsuppe with hand-made numbers', () => {
    const impact = priceChangeImpact({
      book,
      dishes: [butterbrot, mehlteig, mehlsuppe],
      articleId: butter.id,
      newPricePer1000: priceAfterChange(butter.pricePer1000, 1_500),
      targetFoodCostBps: TARGET,
    });
    const [d, e, f] = impact.dishes;

    // New price: 12000 × 1.15 = 13800 Rappen per kg.
    // Net of VAT: 3200 × 10000 ÷ 10810 = 2960.2 → 2960 for D and E.
    // Butterbrot before: 50 g × 12000 = 600 Rappen; share 600 × 10000 ÷ 2960 = 2027 (20.27 %), good.
    expect(d).toMatchObject({
      id: butterbrot.id,
      name: 'Butterbrot',
      uses: true,
      changed: true,
      before: { costPerPortionRappen: 600, foodCostBps: 2027, status: 'good' },
    });
    // Butterbrot after: 50 g × 13800 = 690 Rappen; share 690 × 10000 ÷ 2960 = 2331 (23.31 %), good.
    expect(d?.after).toEqual({ costPerPortionRappen: 690, foodCostBps: 2331, status: 'good' });

    // Mehlteig before: 600 + 200 g flour × 1000 = 800 Rappen; share 800 × 10000 ÷ 2960 = 2703 (27.03 %), good.
    expect(e).toMatchObject({
      id: mehlteig.id,
      uses: true,
      changed: true,
      before: { costPerPortionRappen: 800, foodCostBps: 2703, status: 'good' },
    });
    // Mehlteig after: 690 + 200 = 890 Rappen; share 890 × 10000 ÷ 2960 = 3007 (30.07 %), watch
    // (over 3000, up to 3500).
    expect(e?.after).toEqual({ costPerPortionRappen: 890, foodCostBps: 3007, status: 'watch' });

    // Mehlsuppe: no butter. Net 1000 × 10000 ÷ 10810 = 925; 100 × 1000 = 100 Rappen;
    // share 100 × 10000 ÷ 925 = 1081 (10.81 %), good, before and after.
    expect(f).toMatchObject({
      id: mehlsuppe.id,
      uses: false,
      changed: false,
      before: { costPerPortionRappen: 100, foodCostBps: 1081, status: 'good' },
      after: { costPerPortionRappen: 100, foodCostBps: 1081, status: 'good' },
    });

    // Two dishes use butter; Mehlteig went from good to watch: one worse, none better.
    expect(impact.summary).toEqual({ using: 2, worse: 1, better: 0 });
  });

  it('counts a dish as better when its status improves', () => {
    // Mehlteig at CHF 28.00 incl. VAT: net 2800 × 10000 ÷ 10810 = 2590.
    // Before: 800 × 10000 ÷ 2590 = 3089 (30.89 %), watch. Butter −15 % → 10200 Rappen per kg:
    // 50 g × 10200 = 510 + 200 = 710 Rappen; share 710 × 10000 ÷ 2590 = 2741 (27.41 %), good.
    const cheaper: PriceChangeDish = { ...mehlteig, id: idOf(13), priceRappen: 2800 };
    const impact = priceChangeImpact({
      book,
      dishes: [cheaper],
      articleId: butter.id,
      newPricePer1000: priceAfterChange(butter.pricePer1000, -1_500),
      targetFoodCostBps: TARGET,
    });
    expect(impact.dishes[0]).toMatchObject({
      before: { costPerPortionRappen: 800, foodCostBps: 3089, status: 'watch' },
      after: { costPerPortionRappen: 710, foodCostBps: 2741, status: 'good' },
    });
    expect(impact.summary).toEqual({ using: 1, worse: 0, better: 1 });
  });

  it('follows a component into its dishes while its cost comes from its recipe', () => {
    // Component «Jus»: 50 g butter for 1000 ml, no stored price, so its cost is its recipe's.
    const jusArticle: CostArticle = {
      id: idOf(20),
      kind: 'prepared',
      unit: 'ml',
      pricePer1000: 0,
      yieldBps: 10_000,
      recipeId: idOf(21),
    };
    const jus: CostRecipe = {
      id: idOf(21),
      portions: 1,
      ingredients: [{ articleId: butter.id, quantity: 50 }],
      output: { articleId: jusArticle.id, quantity: 1_000 },
    };
    // Dish «Jus mit Brot»: 500 ml jus, CHF 32.00 incl. VAT.
    // Before: jus 50 × 12000 ÷ 1000 = 600 Rappen per 1000 ml; 500 ml = 300 Rappen; share 1014.
    // After: jus 50 × 13800 ÷ 1000 = 690 per 1000 ml; 500 ml = 345 Rappen; share 1166.
    const dish: PriceChangeDish = {
      id: idOf(22),
      name: 'Jus mit Brot',
      portions: 1,
      ingredients: [{ articleId: jusArticle.id, quantity: 500 }],
      priceRappen: 3200,
      vatBps: 810,
    };
    const impact = priceChangeImpact({
      book: bookOf([butter, jusArticle], [jus]),
      dishes: [dish],
      articleId: butter.id,
      newPricePer1000: priceAfterChange(butter.pricePer1000, 1_500),
      targetFoodCostBps: TARGET,
    });
    expect(impact.dishes[0]).toMatchObject({
      uses: true,
      changed: true,
      before: { costPerPortionRappen: 300, foodCostBps: 1014, status: 'good' },
      after: { costPerPortionRappen: 345, foodCostBps: 1166, status: 'good' },
    });
  });

  it('does not follow a component with a stored production cost, as the recipe card does not', () => {
    const jusArticle: CostArticle = {
      id: idOf(30),
      kind: 'prepared',
      unit: 'ml',
      pricePer1000: 500,
      yieldBps: 10_000,
      recipeId: idOf(31),
    };
    const jus: CostRecipe = {
      id: idOf(31),
      portions: 1,
      ingredients: [{ articleId: butter.id, quantity: 50 }],
      output: { articleId: jusArticle.id, quantity: 1_000 },
    };
    const dish: PriceChangeDish = {
      id: idOf(32),
      name: 'Jus mit Brot',
      portions: 1,
      ingredients: [{ articleId: jusArticle.id, quantity: 500 }],
      priceRappen: 3200,
      vatBps: 810,
    };
    const impact = priceChangeImpact({
      book: bookOf([butter, jusArticle], [jus]),
      dishes: [dish],
      articleId: butter.id,
      newPricePer1000: priceAfterChange(butter.pricePer1000, 1_500),
      targetFoodCostBps: TARGET,
    });
    // The stored 500 per litre counts: 500 × 500 ÷ 1000 = 250 Rappen, whatever butter costs.
    expect(impact.dishes[0]).toMatchObject({
      uses: false,
      changed: false,
      before: { costPerPortionRappen: 250 },
      after: { costPerPortionRappen: 250 },
    });
    expect(impact.summary).toEqual({ using: 0, worse: 0, better: 0 });
  });

  it('does not mutate the book or the dishes it is given', () => {
    const bookBefore = structuredClone(book);
    const dishesBefore = structuredClone([butterbrot, mehlteig, mehlsuppe]);
    priceChangeImpact({
      book,
      dishes: [butterbrot, mehlteig, mehlsuppe],
      articleId: butter.id,
      newPricePer1000: 13_800,
      targetFoodCostBps: TARGET,
    });
    expect(book).toEqual(bookBefore);
    expect(book.articles.get(butter.id)?.pricePer1000).toBe(12_000);
    expect([butterbrot, mehlteig, mehlsuppe]).toEqual(dishesBefore);
  });

  it('reports a dish without a price as unknown and never as good or worse', () => {
    const noPrice: PriceChangeDish = { ...mehlteig, id: idOf(40), priceRappen: undefined };
    const impact = priceChangeImpact({
      book,
      dishes: [noPrice],
      articleId: butter.id,
      newPricePer1000: 13_800,
      targetFoodCostBps: TARGET,
    });
    expect(impact.dishes[0]?.before.status).toBe('unknown');
    expect(impact.dishes[0]?.after.status).toBe('unknown');
    expect(impact.summary).toEqual({ using: 1, worse: 0, better: 0 });
  });
});
