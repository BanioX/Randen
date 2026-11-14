import type { Id } from '../ids';
import { rappen, type Rappen } from '../money';
import type { ArticleKind } from '../model/article';
import type { Unit } from '../model/primitives';
import { milliToRappen, roundQuantity, valueMilli } from './units';

/** What costing needs to know about an article. */
export interface CostArticle {
  id: Id;
  kind: ArticleKind;
  unit: Unit;
  /** Rappen per 1000 base units; 0 = unknown. */
  pricePer1000: number;
  /** 10000 = nothing is lost in trimming. */
  yieldBps: number;
  recipeId?: Id | undefined;
}

/** What costing needs to know about a recipe. */
export interface CostRecipe {
  id: Id;
  portions: number;
  ingredients: readonly { articleId: Id; quantity: number }[];
  output?: { articleId: Id; quantity: number } | undefined;
}

export interface CostBook {
  articles: ReadonlyMap<Id, CostArticle>;
  recipes: ReadonlyMap<Id, CostRecipe>;
}

export interface CostLine {
  articleId: Id;
  /** Net quantity as written in the recipe. */
  quantity: number;
  /** What has to be taken from stock: net ÷ yield. */
  grossQuantity: number;
  pricePer1000: number;
  /** Thousandths of the smallest currency unit. */
  costMilli: number;
  /** The article is unknown or has no price: the line counts as 0 and the total is too low. */
  priceMissing: boolean;
}

export interface RecipeCost {
  lines: CostLine[];
  totalMilli: number;
  perPortionMilli: number;
  totalRappen: Rappen;
  perPortionRappen: Rappen;
  /** Articles without a price; while this is not empty the cost is a lower bound. */
  missingPrices: Id[];
}

/** Net quantity to gross quantity: 850 g of trimmed carrots at 85 % yield need 1000 g. */
export function grossQuantity(netQuantity: number, yieldBps: number): number {
  if (yieldBps <= 0) {
    return roundQuantity(netQuantity);
  }
  return roundQuantity((netQuantity * 10_000) / yieldBps);
}

/**
 * The price of an article for costing. Bought goods: the last purchase price. A component made
 * in house: its last production cost, or, before the first production, the cost of its recipe
 * divided by what a batch gives. Returns undefined when no price can be found.
 */
export function effectiveUnitPrice(
  article: CostArticle,
  book: CostBook,
  seen: ReadonlySet<Id> = new Set(),
): number | undefined {
  if (article.pricePer1000 > 0) {
    return article.pricePer1000;
  }
  if (article.kind !== 'prepared' || article.recipeId === undefined) {
    return undefined;
  }
  const recipe = book.recipes.get(article.recipeId);
  if (recipe?.output === undefined || recipe.output.quantity <= 0 || seen.has(recipe.id)) {
    return undefined;
  }
  const cost = recipeCost(recipe, book, new Set([...seen, recipe.id]));
  if (cost.missingPrices.length > 0 || cost.totalMilli <= 0) {
    return undefined;
  }
  // Thousandths of a Rappen per base unit are Rappen per 1000 base units.
  return Math.round(cost.totalMilli / recipe.output.quantity);
}

/**
 * What one batch of a recipe costs in goods («Wareneinsatz»), line by line. Components are
 * followed into their own recipes; a recipe that contains itself counts that line as unknown.
 */
export function recipeCost(
  recipe: CostRecipe,
  book: CostBook,
  seen: ReadonlySet<Id> = new Set([recipe.id]),
): RecipeCost {
  const missingPrices: Id[] = [];
  const lines = recipe.ingredients.map((ingredient): CostLine => {
    const article = book.articles.get(ingredient.articleId);
    const price = article === undefined ? undefined : effectiveUnitPrice(article, book, seen);
    const gross = grossQuantity(ingredient.quantity, article?.yieldBps ?? 10_000);
    if (price === undefined) {
      missingPrices.push(ingredient.articleId);
    }
    return {
      articleId: ingredient.articleId,
      quantity: ingredient.quantity,
      grossQuantity: gross,
      pricePer1000: price ?? 0,
      costMilli: price === undefined ? 0 : valueMilli(gross, price),
      priceMissing: price === undefined,
    };
  });
  const totalMilli = lines.reduce((sum, line) => sum + line.costMilli, 0);
  const perPortionMilli = Math.round(totalMilli / Math.max(1, recipe.portions));
  return {
    lines,
    totalMilli,
    perPortionMilli,
    totalRappen: milliToRappen(totalMilli),
    perPortionRappen: milliToRappen(perPortionMilli),
    missingPrices: [...new Set(missingPrices)],
  };
}

/** A price with VAT to the price without: CHF 32.00 at 8.1 % is CHF 29.60 net. */
export function netOfVat(gross: Rappen, vatBps: number): Rappen {
  return rappen(Math.round((gross * 10_000) / (10_000 + vatBps)));
}

/** The VAT contained in a gross price. */
export function vatIn(gross: Rappen, vatBps: number): Rappen {
  return rappen(gross - netOfVat(gross, vatBps));
}

/** Cost as a share of net revenue in basis points; undefined without revenue. */
export function foodCostBps(cost: Rappen, netRevenue: Rappen): number | undefined {
  if (netRevenue <= 0) {
    return undefined;
  }
  return Math.round((cost * 10_000) / netRevenue);
}

/** Rounds an amount up to the next step, e.g. to 50 Rappen: 2912 → 2950. */
export function roundUpTo(amount: Rappen, step: number): Rappen {
  if (step <= 1) {
    return amount;
  }
  return rappen(Math.ceil(amount / step) * step);
}

/**
 * The menu price (VAT included) at which the goods cost exactly the target share of the net
 * price, rounded up to `step` (default 50 Rappen). Undefined without a cost or a target.
 */
export function suggestedPrice(
  costPerPortion: Rappen,
  targetFoodCostBps: number,
  vatBps: number,
  step = 50,
): Rappen | undefined {
  if (costPerPortion <= 0 || targetFoodCostBps <= 0) {
    return undefined;
  }
  const net = (costPerPortion * 10_000) / targetFoodCostBps;
  const gross = (net * (10_000 + vatBps)) / 10_000;
  return roundUpTo(rappen(Math.ceil(gross)), step);
}

/** How a dish stands against the target: fine, a little over (up to five points), clearly over. */
export type MarginStatus = 'good' | 'watch' | 'over' | 'unknown';

const WATCH_BAND_BPS = 500;

export interface DishFigures {
  /** Menu price without VAT. */
  netRappen: Rappen | undefined;
  /** Contribution margin of one portion («Deckungsbeitrag»): net price minus goods. */
  marginRappen: Rappen | undefined;
  foodCostBps: number | undefined;
  status: MarginStatus;
  suggestedPriceRappen: Rappen | undefined;
}

/** The numbers of one dish: net price, margin, food cost share and what it should cost. */
export function dishFigures(input: {
  costPerPortion: Rappen;
  priceRappen: Rappen | undefined;
  vatBps: number;
  targetFoodCostBps: number;
  /** Cost is a lower bound (prices missing): never call the dish «good». */
  costIncomplete?: boolean;
}): DishFigures {
  const suggested = suggestedPrice(input.costPerPortion, input.targetFoodCostBps, input.vatBps);
  if (input.priceRappen === undefined || input.priceRappen <= 0) {
    return {
      netRappen: undefined,
      marginRappen: undefined,
      foodCostBps: undefined,
      status: 'unknown',
      suggestedPriceRappen: suggested,
    };
  }
  const net = netOfVat(input.priceRappen, input.vatBps);
  const share = foodCostBps(input.costPerPortion, net);
  let status: MarginStatus = 'unknown';
  if (share !== undefined && input.costIncomplete !== true && input.costPerPortion > 0) {
    status =
      share <= input.targetFoodCostBps
        ? 'good'
        : share <= input.targetFoodCostBps + WATCH_BAND_BPS
          ? 'watch'
          : 'over';
  }
  return {
    netRappen: net,
    marginRappen: rappen(net - input.costPerPortion),
    foodCostBps: share,
    status,
    suggestedPriceRappen: suggested,
  };
}
