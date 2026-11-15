/**
 * What the production and plan use cases read, loaded once per call: the business, its articles,
 * recipes, stock and the plan, with the derived facts (cost, declaration, usable stock) computed
 * by the pure rules of `domain/`. Reads only; writes go through the ledger or the plan's own
 * storage calls inside a command.
 */
import { CommandError } from '../../application/command';
import { addDays, daysBetween } from '../../dates';
import {
  dishFigures,
  recipeCost,
  type CostBook,
  type DishFigures,
  type RecipeCost,
} from '../../domain/costing';
import { declarationOf, type Declaration, type DeclarationBook } from '../../domain/declaration';
import { usableQuantity } from '../../domain/fefo';
import { recipeRequirements, type Requirement } from '../../domain/requirements';
import { roundQuantity } from '../../domain/units';
import type { Id } from '../../ids';
import type { Article, Supplier } from '../../model/article';
import type { Business, StaffMember } from '../../model/business';
import type { MenuLine } from '../../model/menu';
import type { LocalDate, Unit } from '../../model/primitives';
import type { Recipe } from '../../model/recipe';
import type { StockLot } from '../../model/stock';
import type { StorageArea } from '../../model/storage-area';
import { alive } from '../../ports/storage';
import type { AppContext } from '../../application/command';

export interface Book {
  businessId: Id;
  today: LocalDate;
  business: Business;
  /** Live articles and recipes; the `*Rows` maps keep deleted ones for names of past runs. */
  articles: Map<Id, Article>;
  articleRows: Map<Id, Article>;
  recipes: Map<Id, Recipe>;
  recipeRows: Map<Id, Recipe>;
  areas: Map<Id, StorageArea>;
  suppliers: Map<Id, Supplier>;
  staff: Map<Id, StaffMember>;
  lines: Map<Id, MenuLine>;
  /** Every live lot of the business, used up ones included. */
  lots: Map<Id, StockLot>;
  /** Active lots with something in them, per article. */
  lotsByArticle: Map<Id, StockLot[]>;
  cost: CostBook;
  declaration: DeclarationBook;
}

/** Loads the business and everything the rules of this module join. */
export async function loadBook(ctx: AppContext, businessId: Id): Promise<Book> {
  const { storage, clock } = ctx;
  const business = await storage.businesses.get(businessId);
  if (business === undefined) {
    throw new CommandError('not_found', `Business ${businessId} not found`);
  }
  const [articleRows, recipeRows, areaRows, supplierRows, staffRows, lineRows, lotRows] =
    await Promise.all([
      storage.articles.ofBusiness(businessId),
      storage.recipes.ofBusiness(businessId),
      storage.areas.ofBusiness(businessId),
      storage.suppliers.ofBusiness(businessId),
      storage.staff.ofBusiness(businessId),
      storage.menuLines.ofBusiness(businessId),
      storage.lots.ofBusiness(businessId),
    ]);
  const today = clock.today();
  const articles = new Map(alive(articleRows).map((row) => [row.id, row]));
  const recipes = new Map(alive(recipeRows).map((row) => [row.id, row]));
  const lots = new Map(alive(lotRows).map((row) => [row.id, row]));
  const allArticles = new Map(articleRows.map((row) => [row.id, row]));
  const allRecipes = new Map(recipeRows.map((row) => [row.id, row]));
  const lotsByArticle = new Map<Id, StockLot[]>();
  for (const lot of lots.values()) {
    if (lot.status === 'active' && lot.quantity > 0) {
      lotsByArticle.set(lot.articleId, [...(lotsByArticle.get(lot.articleId) ?? []), lot]);
    }
  }
  return {
    businessId,
    today,
    business,
    articles,
    articleRows: allArticles,
    recipes,
    recipeRows: allRecipes,
    areas: new Map(alive(areaRows).map((row) => [row.id, row])),
    suppliers: new Map(alive(supplierRows).map((row) => [row.id, row])),
    staff: new Map(staffRows.map((row) => [row.id, row])),
    lines: new Map(alive(lineRows).map((row) => [row.id, row])),
    lots,
    lotsByArticle,
    cost: { articles, recipes },
    declaration: { articles, recipes },
  };
}

/** The live recipe with this id, or a `not_found` error. */
export function requireRecipe(book: Book, recipeId: Id): Recipe {
  const recipe = book.recipes.get(recipeId);
  if (recipe === undefined) {
    throw new CommandError('not_found', `Recipe ${recipeId} not found`);
  }
  return recipe;
}

/** The live article with this id, or a `not_found` error. */
export function requireArticle(book: Book, articleId: Id): Article {
  const article = book.articles.get(articleId);
  if (article === undefined) {
    throw new CommandError('not_found', `Article ${articleId} not found`);
  }
  return article;
}

export function activeLots(book: Book, articleId: Id): StockLot[] {
  return book.lotsByArticle.get(articleId) ?? [];
}

/** Everything in stock of an article, in base units; lots past their date included. */
export function stockOf(book: Book, articleId: Id): number {
  return roundQuantity(activeLots(book, articleId).reduce((sum, lot) => sum + lot.quantity, 0));
}

/** What may be used today: the stock without lots past their Verbrauchsdatum. */
export function usableOf(book: Book, articleId: Id): number {
  return usableQuantity(activeLots(book, articleId), book.today);
}

/** Usable quantity of every article that has lots, for the suggestion rules. */
export function usableMap(book: Book): Map<Id, number> {
  return new Map(
    [...book.lotsByArticle.keys()].map((articleId) => [articleId, usableOf(book, articleId)]),
  );
}

export function nameOf(book: Book, articleId: Id): string {
  return book.articleRows.get(articleId)?.name ?? '';
}

export function unitOf(book: Book, articleId: Id): Unit {
  return book.articleRows.get(articleId)?.unit ?? 'g';
}

/** The recipe of a run, deleted or not: its name and kind stay on the record. */
export function recipeRowOf(book: Book, recipeId: Id): Recipe | undefined {
  return book.recipeRows.get(recipeId);
}

export function areaNameOf(book: Book, areaId: Id | undefined): string | undefined {
  return areaId === undefined ? undefined : book.areas.get(areaId)?.name;
}

export function staffNameOf(book: Book, staffId: Id | undefined): string | undefined {
  return staffId === undefined ? undefined : book.staff.get(staffId)?.name;
}

/** What a recipe needs from stock for `portions`, gross, one line per article. */
export function requirementsOf(book: Book, recipe: Recipe, portions: number): Requirement[] {
  return recipeRequirements(recipe, portions, book.articles);
}

/** Gross quantity per portion of every article the recipe uses. */
export function perPortionOf(book: Book, recipe: Recipe): Map<Id, number> {
  const batch = requirementsOf(book, recipe, recipe.portions);
  return new Map(
    batch.map((requirement) => [requirement.articleId, requirement.quantity / recipe.portions]),
  );
}

/** What one batch of a recipe costs, at today's prices. */
export function costOf(book: Book, recipe: Recipe): RecipeCost {
  return recipeCost(recipe, book.cost);
}

/** What a recipe declares: allergens, traces, diet, origins, from its ingredients. */
export function declarationFor(book: Book, recipe: Recipe): Declaration {
  return declarationOf(recipe, book.declaration);
}

/** Cost, margin and food cost share of a dish; components have no price, so no figures. */
export function figuresOf(book: Book, recipe: Recipe, cost: RecipeCost): DishFigures | undefined {
  if (recipe.kind !== 'dish') {
    return undefined;
  }
  const incomplete = cost.missingPrices.length > 0 || recipe.ingredients.length === 0;
  return dishFigures({
    costPerPortion: cost.perPortionRappen,
    priceRappen: recipe.priceRappen,
    vatBps: recipe.vatBps,
    targetFoodCostBps: book.business.targetFoodCostBps,
    costIncomplete: incomplete,
  });
}

/** Monday of the week that holds `date` (ISO week, Europe/Zurich calendar day). */
export function mondayOf(date: LocalDate): LocalDate {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  return addDays(date, -((weekday + 6) % 7));
}

/** The seven days of a week, from its Monday. */
export function weekDays(monday: LocalDate): LocalDate[] {
  return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
}

/** Days from `from` to `to` (negative when `to` is earlier). */
export function dayDistance(from: LocalDate, to: LocalDate): number {
  return daysBetween(from, to);
}

/**
 * The short code of a label and of a trace: the last eight characters of an id. The first
 * characters of a UUIDv7 are its time, and eight of them change only every 65 seconds, so runs
 * made in one minute would share a code. The end of the id is random, so the codes of one
 * business differ within a day, and the same function gives the label and the trace the same code.
 */
export function shortCode(id: Id): string {
  return id.slice(-8);
}
