import { CommandError, type AppContext } from '../../application/command';
import type { Id } from '../../ids';
import type { Article, Supplier } from '../../model/article';
import type { Business } from '../../model/business';
import type { MealCount, MenuLine, PlanEntry, WasteWeighing } from '../../model/menu';
import type { LocalDate } from '../../model/primitives';
import type { Production, Recipe } from '../../model/recipe';
import type { Budget, Sale } from '../../model/sales';
import type { StockLot, StockMovement } from '../../model/stock';
import { alive } from '../../ports/storage';

/**
 * Everything «Zahlen» reads, loaded once per query: the ledger, the sales, the budgets and the
 * rows the costs and the meals come from. Deleted rows stay where a name or a price is still
 * needed (an article that was taken off the list still has its cost in last month's numbers).
 */
export interface NumbersData {
  businessId: Id;
  business: Business;
  today: LocalDate;
  /** All articles, deleted ones included: names and prices of past movements. */
  articles: ReadonlyMap<Id, Article>;
  recipes: ReadonlyMap<Id, Recipe>;
  suppliers: ReadonlyMap<Id, Supplier>;
  /** All lots, deleted ones included: a receipt keeps its supplier. */
  lotById: ReadonlyMap<Id, StockLot>;
  /** Lots that are live (not deleted). */
  lots: readonly StockLot[];
  /** The ledger, every movement: append-only, never deleted. */
  movements: readonly StockMovement[];
  sales: readonly Sale[];
  budgets: readonly Budget[];
  productions: ReadonlyMap<Id, Production>;
  planEntries: ReadonlyMap<Id, PlanEntry>;
  menuLines: readonly MenuLine[];
  mealCounts: readonly MealCount[];
  wasteWeighings: readonly WasteWeighing[];
}

/** Loads the numbers of a business; a business that does not exist is `not_found`. */
export async function loadNumbers(ctx: AppContext, businessId: Id): Promise<NumbersData> {
  const { storage, clock } = ctx;
  const [
    business,
    articleRows,
    recipeRows,
    supplierRows,
    lotRows,
    movements,
    saleRows,
    budgetRows,
    productionRows,
    planRows,
    lineRows,
    countRows,
    weighingRows,
  ] = await Promise.all([
    storage.businesses.get(businessId),
    storage.articles.ofBusiness(businessId),
    storage.recipes.ofBusiness(businessId),
    storage.suppliers.ofBusiness(businessId),
    storage.lots.ofBusiness(businessId),
    storage.movements.ofBusiness(businessId),
    storage.sales.ofBusiness(businessId),
    storage.budgets.ofBusiness(businessId),
    storage.productions.ofBusiness(businessId),
    storage.planEntries.ofBusiness(businessId),
    storage.menuLines.ofBusiness(businessId),
    storage.mealCounts.ofBusiness(businessId),
    storage.wasteWeighings.ofBusiness(businessId),
  ]);
  if (business === undefined) {
    throw new CommandError('not_found', `Business ${businessId} not found`);
  }
  return {
    businessId,
    business,
    today: clock.today(),
    articles: new Map(articleRows.map((row) => [row.id, row])),
    recipes: new Map(recipeRows.map((row) => [row.id, row])),
    suppliers: new Map(supplierRows.map((row) => [row.id, row])),
    lotById: new Map(lotRows.map((row) => [row.id, row])),
    lots: alive(lotRows),
    movements,
    sales: alive(saleRows),
    budgets: alive(budgetRows),
    productions: new Map(alive(productionRows).map((row) => [row.id, row])),
    planEntries: new Map(alive(planRows).map((row) => [row.id, row])),
    menuLines: alive(lineRows),
    mealCounts: alive(countRows),
    wasteWeighings: alive(weighingRows),
  };
}
