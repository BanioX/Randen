import { describe, expect, it } from 'vitest';
import {
  dishFigures,
  effectiveUnitPrice,
  foodCostBps,
  grossQuantity,
  netOfVat,
  rappen,
  recipeCost,
  roundUpTo,
  suggestedPrice,
  vatIn,
  type CostBook,
} from '../src';
import { createTestContext, seedKitchen } from '../src/testing';

async function kitchenBook() {
  const t = await createTestContext();
  const kitchen = await seedKitchen(t);
  const book: CostBook = {
    articles: new Map(Object.values(kitchen.articles).map((article) => [article.id, article])),
    recipes: new Map(Object.values(kitchen.recipes).map((recipe) => [recipe.id, recipe])),
  };
  return { kitchen, book };
}

describe('recipeCost', () => {
  it('counts the gross quantity: trimmed goods cost more than their net weight', async () => {
    const { kitchen, book } = await kitchenBook();
    const cost = recipeCost(kitchen.recipes.jus, book);
    // 170 g onions net at 85 % yield = 200 g × CHF 2.20/kg = 44 Rp
    expect(cost.lines[0]).toMatchObject({ quantity: 170, grossQuantity: 200, costMilli: 44_000 });
    // + 7.5 dl wine (675 Rp) + 50 g butter (70 Rp)
    expect(cost.totalRappen).toBe(789);
    expect(cost.missingPrices).toEqual([]);
  });

  it('follows components into their own recipe', async () => {
    const { kitchen, book } = await kitchenBook();
    // Jus has no stored price yet: CHF 7.89 for one litre.
    expect(effectiveUnitPrice(kitchen.articles.jus, book)).toBe(789);
    const cost = recipeCost(kitchen.recipes.entrecoteDish, book);
    expect(cost.lines.map((line) => line.costMilli)).toEqual([
      12_400_000, // 1.8 kg net / 0.9 = 2 kg × 62.00
      394_500, // 5 dl jus × 7.89
      450_000, // 2 kg net / 0.8 = 2.5 kg × 1.80
      256_000, // 4 dl cream × 6.40
      210_000, // 150 g butter × 14.00
    ]);
    expect(cost.totalMilli).toBe(13_710_500);
    expect(cost.perPortionRappen).toBe(1371);
  });

  it('prefers the last production cost of a component once there is one', async () => {
    const { kitchen, book } = await kitchenBook();
    const produced = new Map(book.articles).set(kitchen.articles.jus.id, {
      ...kitchen.articles.jus,
      pricePer1000: 900,
    });
    expect(effectiveUnitPrice({ ...kitchen.articles.jus, pricePer1000: 900 }, book)).toBe(900);
    const cost = recipeCost(kitchen.recipes.entrecoteDish, { ...book, articles: produced });
    expect(cost.lines[1]?.costMilli).toBe(450_000);
  });

  it('names what has no price instead of pretending the dish is cheap', async () => {
    const { kitchen, book } = await kitchenBook();
    const articles = new Map(book.articles).set(kitchen.articles.salmon.id, {
      ...kitchen.articles.salmon,
      pricePer1000: 0,
    });
    const cost = recipeCost(kitchen.recipes.salmonDish, { ...book, articles });
    expect(cost.missingPrices).toEqual([kitchen.articles.salmon.id]);
    expect(cost.lines[0]).toMatchObject({ priceMissing: true, costMilli: 0 });
  });

  it('does not loop when a recipe contains itself', async () => {
    const { kitchen, book } = await kitchenBook();
    const loop = {
      ...kitchen.recipes.jus,
      ingredients: [{ articleId: kitchen.articles.jus.id, quantity: 100 }],
    };
    const recipes = new Map(book.recipes).set(loop.id, loop);
    const cost = recipeCost(loop, { ...book, recipes });
    expect(cost.missingPrices).toEqual([kitchen.articles.jus.id]);
    expect(cost.totalMilli).toBe(0);
  });
});

describe('prices and margins', () => {
  it('takes the VAT out of a menu price', () => {
    expect(netOfVat(rappen(4200), 810)).toBe(3885);
    expect(vatIn(rappen(4200), 810)).toBe(315);
    expect(netOfVat(rappen(1000), 260)).toBe(975);
    expect(netOfVat(rappen(1000), 0)).toBe(1000);
  });

  it('computes the share of goods in the net price', () => {
    expect(foodCostBps(rappen(1371), rappen(3885))).toBe(3529);
    expect(foodCostBps(rappen(100), rappen(0))).toBeUndefined();
  });

  it('proposes the price that meets the target, rounded up to 50 Rappen', () => {
    // 13.71 / 30 % = 45.70 net → 49.41 with VAT → 49.50
    expect(suggestedPrice(rappen(1371), 3000, 810)).toBe(4950);
    expect(suggestedPrice(rappen(0), 3000, 810)).toBeUndefined();
    expect(roundUpTo(rappen(2912), 50)).toBe(2950);
    expect(roundUpTo(rappen(2950), 50)).toBe(2950);
  });

  it('judges a dish against the target', () => {
    const over = dishFigures({
      costPerPortion: rappen(1371),
      priceRappen: rappen(4200),
      vatBps: 810,
      targetFoodCostBps: 3000,
    });
    expect(over).toEqual({
      netRappen: 3885,
      marginRappen: 2514,
      foodCostBps: 3529,
      status: 'over',
      suggestedPriceRappen: 4950,
    });
    const good = dishFigures({
      costPerPortion: rappen(670),
      priceRappen: rappen(3400),
      vatBps: 810,
      targetFoodCostBps: 3000,
    });
    expect(good).toMatchObject({
      netRappen: 3145,
      marginRappen: 2475,
      foodCostBps: 2130,
      status: 'good',
    });
    const watch = dishFigures({
      costPerPortion: rappen(1000),
      priceRappen: rappen(3400),
      vatBps: 810,
      targetFoodCostBps: 3000,
    });
    expect(watch.status).toBe('watch');
  });

  it('never calls a dish good while its cost is incomplete or its price is missing', () => {
    expect(
      dishFigures({
        costPerPortion: rappen(100),
        priceRappen: rappen(3400),
        vatBps: 810,
        targetFoodCostBps: 3000,
        costIncomplete: true,
      }).status,
    ).toBe('unknown');
    const noPrice = dishFigures({
      costPerPortion: rappen(670),
      priceRappen: undefined,
      vatBps: 810,
      targetFoodCostBps: 3000,
    });
    expect(noPrice.status).toBe('unknown');
    expect(noPrice.suggestedPriceRappen).toBe(2450);
  });

  it('turns net quantities into gross quantities', () => {
    expect(grossQuantity(850, 8500)).toBe(1000);
    expect(grossQuantity(100, 10_000)).toBe(100);
    expect(grossQuantity(100, 0)).toBe(100);
  });
});
