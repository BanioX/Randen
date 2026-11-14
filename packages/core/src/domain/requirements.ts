import type { Id } from '../ids';
import { grossQuantity } from './costing';
import { roundQuantity } from './units';

export interface Requirement {
  articleId: Id;
  /** What has to leave the stock (gross), in base units. */
  quantity: number;
  /** What goes into the pan (net). */
  netQuantity: number;
}

/**
 * What a recipe needs from stock for a number of portions: every ingredient scaled from the
 * batch the recipe is written for, net turned into gross by the yield of the article, lines of
 * the same article added up. Components made in house are articles like any other here: they
 * come from their own lots, not from their ingredients.
 */
export function recipeRequirements(
  recipe: { portions: number; ingredients: readonly { articleId: Id; quantity: number }[] },
  portions: number,
  yields: ReadonlyMap<Id, { yieldBps: number }>,
): Requirement[] {
  const factor = portions / Math.max(1, recipe.portions);
  const byArticle = new Map<Id, Requirement>();
  for (const ingredient of recipe.ingredients) {
    const net = ingredient.quantity * factor;
    const gross = grossQuantity(net, yields.get(ingredient.articleId)?.yieldBps ?? 10_000);
    const known = byArticle.get(ingredient.articleId);
    byArticle.set(ingredient.articleId, {
      articleId: ingredient.articleId,
      quantity: roundQuantity((known?.quantity ?? 0) + gross),
      netQuantity: roundQuantity((known?.netQuantity ?? 0) + net),
    });
  }
  return [...byArticle.values()];
}

/** Adds up requirements of several recipes (a day, a week of the menu plan). */
export function sumRequirements(lists: readonly (readonly Requirement[])[]): Requirement[] {
  const byArticle = new Map<Id, Requirement>();
  for (const requirement of lists.flat()) {
    const known = byArticle.get(requirement.articleId);
    byArticle.set(requirement.articleId, {
      articleId: requirement.articleId,
      quantity: roundQuantity((known?.quantity ?? 0) + requirement.quantity),
      netQuantity: roundQuantity((known?.netQuantity ?? 0) + requirement.netQuantity),
    });
  }
  return [...byArticle.values()];
}
