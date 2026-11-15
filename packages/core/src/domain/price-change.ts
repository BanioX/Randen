import type { Id } from '../ids';
import { rappen, type Rappen } from '../money';
import { dishFigures, recipeCost, type CostBook, type MarginStatus } from './costing';

/**
 * «Preisänderung durchrechnen» (ADR-0016): what a changed price of one article does to the
 * dishes. Pure; the book is read, never changed. The rules are those of the recipe card:
 * the same cost (`recipeCost`) and the same figures (`dishFigures`).
 */

/** A dish as the what-if reads it: its ingredients, menu price and VAT. */
export interface PriceChangeDish {
  id: Id;
  name: string;
  portions: number;
  ingredients: readonly { articleId: Id; quantity: number }[];
  /** Menu price with VAT in Rappen; undefined or 0 while there is none. */
  priceRappen?: number | undefined;
  vatBps: number;
  output?: { articleId: Id; quantity: number } | undefined;
}

export interface PriceChangeFigures {
  costPerPortionRappen: Rappen;
  foodCostBps: number | undefined;
  status: MarginStatus;
}

export interface DishPriceChange {
  id: Id;
  name: string;
  /** The dish uses the article: directly, or in a component whose cost comes from its recipe. */
  uses: boolean;
  /** The cost of one portion differs after the change. */
  changed: boolean;
  before: PriceChangeFigures;
  after: PriceChangeFigures;
}

export interface PriceChangeImpact {
  /** Every dish given, in the order given. */
  dishes: DishPriceChange[];
  summary: {
    /** Dishes that use the article. */
    using: number;
    /** Dishes whose status got worse: good → watch or over, watch → over. */
    worse: number;
    /** Dishes whose status got better. */
    better: number;
  };
}

export interface PriceChangeInput {
  book: CostBook;
  dishes: readonly PriceChangeDish[];
  articleId: Id;
  /** The new price in Rappen per 1000 base units. */
  newPricePer1000: number;
  targetFoodCostBps: number;
}

/**
 * The price after a change in basis points: 1500 is +15 %, -1000 is -10 %. Rounded half up to
 * whole Rappen per 1000 base units, and never below 1 (a price of 0 means «no price»).
 * CHF 120.00 per kilo (12000) at +15 % is 13800.
 */
export function priceAfterChange(pricePer1000: number, percentBps: number): number {
  return Math.max(1, Math.floor((pricePer1000 * (10_000 + percentBps) + 5_000) / 10_000));
}

/** A copy of the book with the price of one article replaced; the given book is not touched. */
function withArticlePrice(book: CostBook, articleId: Id, pricePer1000: number): CostBook {
  const articles = new Map(book.articles);
  const article = articles.get(articleId);
  if (article !== undefined) {
    articles.set(articleId, { ...article, pricePer1000 });
  }
  return { articles, recipes: book.recipes };
}

/** The cost and the figures of a dish, the way the recipe card counts them. */
function figuresOf(dish: PriceChangeDish, book: CostBook, targetFoodCostBps: number) {
  const cost = recipeCost(dish, book);
  const figures = dishFigures({
    costPerPortion: cost.perPortionRappen,
    priceRappen:
      dish.priceRappen === undefined || dish.priceRappen <= 0
        ? undefined
        : rappen(dish.priceRappen),
    vatBps: dish.vatBps,
    targetFoodCostBps,
    // A missing price makes the cost a lower bound: never «good» (ADR-0008).
    costIncomplete: cost.missingPrices.length > 0 || dish.ingredients.length === 0,
  });
  return {
    costPerPortionRappen: cost.perPortionRappen,
    foodCostBps: figures.foodCostBps,
    status: figures.status,
  } satisfies PriceChangeFigures;
}

/**
 * Follows the ingredients of a dish to the article. A component counts as its recipe only
 * where its cost comes from that recipe, that is without a stored price (`effectiveUnitPrice`).
 */
function usesArticle(
  ingredients: PriceChangeDish['ingredients'],
  articleId: Id,
  book: CostBook,
  seen: ReadonlySet<Id>,
): boolean {
  return ingredients.some((ingredient) => {
    if (ingredient.articleId === articleId) {
      return true;
    }
    const article = book.articles.get(ingredient.articleId);
    if (
      article === undefined ||
      article.pricePer1000 > 0 ||
      article.kind !== 'prepared' ||
      article.recipeId === undefined
    ) {
      return false;
    }
    const inner = book.recipes.get(article.recipeId);
    if (inner === undefined || seen.has(inner.id)) {
      return false;
    }
    return usesArticle(inner.ingredients, articleId, book, new Set([...seen, inner.id]));
  });
}

const RANK: Record<MarginStatus, number> = { good: 0, watch: 1, over: 2, unknown: -1 };

/** Worse or better between two known statuses; undefined when nothing changed or one is unknown. */
function direction(before: MarginStatus, after: MarginStatus): 'worse' | 'better' | undefined {
  if (before === 'unknown' || after === 'unknown' || before === after) {
    return undefined;
  }
  return RANK[after] > RANK[before] ? 'worse' : 'better';
}

/**
 * What a new price for one article does to every dish: cost per portion, food cost share and
 * status before and after, and how many dishes use the article and how many got worse or
 * better. Components are not rows: their cost shows in the dishes that use them.
 */
export function priceChangeImpact(input: PriceChangeInput): PriceChangeImpact {
  const after = withArticlePrice(input.book, input.articleId, input.newPricePer1000);
  const dishes = input.dishes.map((dish): DishPriceChange => {
    const before = figuresOf(dish, input.book, input.targetFoodCostBps);
    const next = figuresOf(dish, after, input.targetFoodCostBps);
    return {
      id: dish.id,
      name: dish.name,
      uses: usesArticle(dish.ingredients, input.articleId, input.book, new Set([dish.id])),
      changed: before.costPerPortionRappen !== next.costPerPortionRappen,
      before,
      after: next,
    };
  });
  const using = dishes.filter((dish) => dish.uses);
  return {
    dishes,
    summary: {
      using: using.length,
      worse: using.filter((dish) => direction(dish.before.status, dish.after.status) === 'worse')
        .length,
      better: using.filter((dish) => direction(dish.before.status, dish.after.status) === 'better')
        .length,
    },
  };
}
