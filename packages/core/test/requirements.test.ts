import { describe, expect, it } from 'vitest';
import { createStockLedger, recipeRequirements, sumRequirements } from '../src';
import { createTestContext, seedKitchen } from '../src/testing';

async function setup() {
  const t = await createTestContext();
  const kitchen = await seedKitchen(t);
  const yields = new Map(Object.values(kitchen.articles).map((article) => [article.id, article]));
  return { t, kitchen, yields, ledger: createStockLedger(t.ctx) };
}

describe('recipeRequirements', () => {
  it('scales the batch to the portions and turns net into gross', async () => {
    const { kitchen, yields } = await setup();
    // Written for 10 portions; 25 portions need 2.5 times as much.
    const needs = recipeRequirements(kitchen.recipes.entrecoteDish, 25, yields);
    expect(needs).toEqual([
      { articleId: kitchen.articles.entrecote.id, quantity: 5000, netQuantity: 4500 },
      { articleId: kitchen.articles.jus.id, quantity: 1250, netQuantity: 1250 },
      { articleId: kitchen.articles.potatoes.id, quantity: 6250, netQuantity: 5000 },
      { articleId: kitchen.articles.cream.id, quantity: 1000, netQuantity: 1000 },
      { articleId: kitchen.articles.butter.id, quantity: 375, netQuantity: 375 },
    ]);
  });

  it('adds up lines of the same article and whole lists', async () => {
    const { kitchen, yields } = await setup();
    const twice = {
      portions: 2,
      ingredients: [
        { articleId: kitchen.articles.butter.id, quantity: 20 },
        { articleId: kitchen.articles.butter.id, quantity: 30 },
      ],
    };
    expect(recipeRequirements(twice, 4, yields)).toEqual([
      { articleId: kitchen.articles.butter.id, quantity: 100, netQuantity: 100 },
    ]);
    const week = sumRequirements([
      recipeRequirements(kitchen.recipes.entrecoteDish, 10, yields),
      recipeRequirements(kitchen.recipes.salmonDish, 4, yields),
    ]);
    expect(week.find((need) => need.articleId === kitchen.articles.cream.id)?.quantity).toBe(700);
    expect(week.find((need) => need.articleId === kitchen.articles.butter.id)?.quantity).toBe(190);
    expect(week).toHaveLength(6);
  });
});

describe('consumeMany', () => {
  it('takes what a recipe needs and lists what was not there', async () => {
    const { t, kitchen, yields, ledger } = await setup();
    const needs = recipeRequirements(kitchen.recipes.entrecoteDish, 10, yields);
    const result = await ledger.consumeMany(needs, {
      businessId: t.businessId,
      on: t.clock.today(),
      purpose: 'production',
    });
    // No jus in stock yet: 5 dl are missing; everything else is booked.
    expect(result.shortages).toEqual([{ articleId: kitchen.articles.jus.id, missing: 500 }]);
    // 2 kg entrecôte 124.00 + 2.5 kg potatoes 4.50 + 4 dl cream 2.56 + 150 g butter 2.10
    expect(result.valueRappen).toBe(13_316);
    expect((await t.storage.lots.get(kitchen.lots.entrecote.id))?.quantity).toBe(2000);
  });
});
