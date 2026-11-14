import {
  CommandError,
  createCommandKit,
  requireRow,
  type AppContext,
  type UseCase,
} from '../../application/command';
import { CONTRACT_V1 } from '../../contract';
import { addDays } from '../../dates';
import { combineDiets, sortAllergens, type AllergenId, type Diet } from '../../domain/allergens';
import {
  ARTICLE_CATEGORIES,
  articleCategory,
  type AreaKind,
  type ArticleCategoryId,
} from '../../domain/categories';
import { effectiveUnitPrice, type CostBook } from '../../domain/costing';
import { countryName, declarationOf, type DeclarationBook } from '../../domain/declaration';
import { expiryInfo } from '../../domain/expiry';
import { lineValue, roundQuantity } from '../../domain/units';
import type { Id } from '../../ids';
import { rappen, sumRappen, type Rappen } from '../../money';
import { ArticleSchema, SupplierSchema, type Article, type Supplier } from '../../model/article';
import { WEEKDAYS, type LocalDate, type Weekday } from '../../model/primitives';
import type { Recipe } from '../../model/recipe';
import type { PurchaseOrder, StockLot } from '../../model/stock';
import type { StorageArea, StorageSpot } from '../../model/storage-area';
import { alive } from '../../ports/storage';
import { foldName } from './category-guess';
import type {
  ArticleListFilter,
  ArticleListRow,
  ArticleMissing,
  ArticleView,
  ImportLine,
  PricePoint,
  SupplierDay,
} from './contract';
import { nameKey, parseImportLines } from './import-lines';

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'de-CH');

/** Fields of a prepared article that its recipe owns: they change there, not here. */
const RECIPE_OWNED = ['name', 'allergens', 'traces', 'diet', 'pricePer1000'] as const;

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

type Defined<TObject> = { [TKey in keyof TObject]?: Exclude<TObject[TKey], undefined> };

/** An object without its undefined entries, so optional fields are left out, never undefined. */
function defined<TObject extends Record<string, unknown>>(object: TObject): Defined<TObject> {
  return Object.fromEntries(
    Object.entries(object).filter(([, value]) => value !== undefined),
  ) as Defined<TObject>;
}

/**
 * A row with a patch applied: a value replaces the field, null clears it, undefined leaves it.
 * The result still has to pass the schema of the row.
 */
function patched(row: object, patch: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = { ...row };
  for (const [field, value] of Object.entries(patch)) {
    if (value === null) {
      Reflect.deleteProperty(next, field);
    } else if (value !== undefined) {
      next[field] = value;
    }
  }
  return next;
}

/** The fields of `shape` in which two rows differ, in the order of the schema. */
function changedFields<TRow extends object>(
  shape: Record<string, unknown>,
  before: TRow,
  after: TRow,
): string[] {
  return Object.keys(shape).filter(
    (field) => !same(before[field as keyof TRow], after[field as keyof TRow]),
  );
}

/** Every word of the search must occur; case and accents do not matter. */
function matcher(search: string | undefined): (...texts: (string | undefined)[]) => boolean {
  const words = foldName(search ?? '')
    .split(/\s+/)
    .filter(Boolean);
  return (...texts) => {
    if (words.length === 0) {
      return true;
    }
    const haystack = foldName(texts.filter(Boolean).join(' '));
    return words.every((word) => haystack.includes(word));
  };
}

const SUNDAY_FIRST: readonly Weekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/** The weekday of a calendar day; pure date arithmetic without time zones. */
export function weekdayOf(date: LocalDate): Weekday {
  const [year = 0, month = 1, day = 1] = date.split('-').map(Number);
  return SUNDAY_FIRST[new Date(Date.UTC(year, month - 1, day)).getUTCDay()] ?? 'mon';
}

/** The first of `days` on or after `today`; undefined when the supplier names no days. */
export function nextDay(days: readonly Weekday[], today: LocalDate): SupplierDay | undefined {
  for (let inDays = 0; inDays < 7; inDays += 1) {
    const on = addDays(today, inDays);
    const weekday = weekdayOf(on);
    if (days.includes(weekday)) {
      return { on, weekday, inDays };
    }
  }
  return undefined;
}

/** Unique weekdays in the order of the week. */
const sortWeekdays = (days: readonly Weekday[]) => WEEKDAYS.filter((day) => days.includes(day));

const isOpenOrder = (order: PurchaseOrder) => order.status === 'draft' || order.status === 'sent';

/** Everything the reads of this module join, loaded once. */
interface Book {
  articles: Article[];
  articleById: Map<Id, Article>;
  suppliers: Map<Id, Supplier>;
  areas: Map<Id, StorageArea>;
  spots: Map<Id, StorageSpot>;
  recipes: Recipe[];
  recipeById: Map<Id, Recipe>;
  /** Active lots with something in them, per article. */
  lots: Map<Id, StockLot[]>;
  /** Every lot that was ever booked, also the used-up ones: the price history. */
  allLots: StockLot[];
  cost: CostBook;
  declaration: DeclarationBook;
}

interface StockFacts {
  quantity: number;
  valueRappen: Rappen;
  lots: StockLot[];
}

/** Use cases of the master data: articles and suppliers. */
export function createArticlesUseCases(ctx: AppContext) {
  const { storage, clock, ids } = ctx;
  const { emit, runCommand, stamps } = createCommandKit(ctx);

  async function loadBook(businessId: Id): Promise<Book> {
    const [articleRows, supplierRows, areaRows, spotRows, recipeRows, lotRows] = await Promise.all([
      storage.articles.ofBusiness(businessId),
      storage.suppliers.ofBusiness(businessId),
      storage.areas.ofBusiness(businessId),
      storage.spots.ofBusiness(businessId),
      storage.recipes.ofBusiness(businessId),
      storage.lots.ofBusiness(businessId),
    ]);
    const articles = alive(articleRows);
    const recipes = alive(recipeRows);
    const articleById = new Map(articles.map((row) => [row.id, row]));
    const recipeById = new Map(recipes.map((row) => [row.id, row]));
    const lots = new Map<Id, StockLot[]>();
    const allLots = alive(lotRows);
    for (const lot of allLots) {
      if (lot.status === 'active' && lot.quantity > 0) {
        lots.set(lot.articleId, [...(lots.get(lot.articleId) ?? []), lot]);
      }
    }
    return {
      articles,
      articleById,
      suppliers: new Map(alive(supplierRows).map((row) => [row.id, row])),
      areas: new Map(alive(areaRows).map((row) => [row.id, row])),
      spots: new Map(alive(spotRows).map((row) => [row.id, row])),
      recipes,
      recipeById,
      lots,
      allLots,
      cost: { articles: articleById, recipes: recipeById },
      declaration: { articles: articleById, recipes: recipeById },
    };
  }

  function stockOf(article: Article, book: Book): StockFacts {
    const lots = book.lots.get(article.id) ?? [];
    return {
      quantity: roundQuantity(lots.reduce((sum, lot) => sum + lot.quantity, 0)),
      valueRappen: sumRappen(lots.map((lot) => lineValue(lot.quantity, lot.pricePer1000))),
      lots,
    };
  }

  const belowMin = (article: Article, quantity: number) =>
    article.minStock !== undefined && quantity < article.minStock;

  /** The price costing uses; 0 when there is none (ADR-0008: the app then says so). */
  const priceOf = (article: Article, book: Book) =>
    rappen(effectiveUnitPrice(article, book.cost) ?? 0);

  /**
   * Allergens, traces and diet of an article. Bought goods: as typed. A component: what its
   * recipe declares through all its ingredients, so nothing is kept twice (ADR-0008).
   */
  function declared(
    article: Article,
    book: Book,
  ): { allergens: AllergenId[]; traces: AllergenId[]; diet: Diet } {
    const recipe =
      article.kind === 'prepared' && article.recipeId !== undefined
        ? book.recipeById.get(article.recipeId)
        : undefined;
    const fromRecipe = recipe === undefined ? undefined : declarationOf(recipe, book.declaration);
    const allergens = sortAllergens([...article.allergens, ...(fromRecipe?.allergens ?? [])]);
    return {
      allergens,
      traces: sortAllergens([...article.traces, ...(fromRecipe?.traces ?? [])]).filter(
        (id) => !allergens.includes(id),
      ),
      diet: combineDiets([article.diet, ...(fromRecipe === undefined ? [] : [fromRecipe.diet])]),
    };
  }

  /** What a professional still has to complete: no price, meat or fish without a country, no supplier. */
  function missingOf(article: Article, book: Book): ArticleMissing[] {
    const missing: ArticleMissing[] = [];
    if (priceOf(article, book) === 0) {
      missing.push('price');
    }
    if (articleCategory(article.categoryId).declaresOrigin && article.originCountry === undefined) {
      missing.push('origin');
    }
    if (
      article.kind === 'purchased' &&
      (article.supplierId === undefined || !book.suppliers.has(article.supplierId))
    ) {
      missing.push('supplier');
    }
    return missing;
  }

  /** Names of supplier, area and spot; a deleted one simply has no name any more. */
  function placeOf(article: Article, book: Book) {
    const supplier =
      article.supplierId === undefined ? undefined : book.suppliers.get(article.supplierId);
    const area = article.areaId === undefined ? undefined : book.areas.get(article.areaId);
    const spot = article.spotId === undefined ? undefined : book.spots.get(article.spotId);
    return defined({
      supplierId: supplier?.id,
      supplierName: supplier?.name,
      areaId: area?.id,
      areaName: area?.name,
      areaKind: area?.kind,
      spotId: spot?.id,
      spotName: spot?.name,
    });
  }

  function listRow(article: Article, book: Book): ArticleListRow {
    const stock = stockOf(article, book);
    const place = placeOf(article, book);
    return {
      id: article.id,
      name: article.name,
      kind: article.kind,
      categoryId: article.categoryId,
      categoryLabel: articleCategory(article.categoryId).label,
      unit: article.unit,
      pricePer1000: priceOf(article, book),
      ...defined({
        supplierId: place.supplierId,
        supplierName: place.supplierName,
        areaId: place.areaId,
        areaName: place.areaName,
        areaKind: place.areaKind,
        spotName: place.spotName,
      }),
      stock: stock.quantity,
      stockValueRappen: stock.valueRappen,
      ...(article.minStock === undefined ? {} : { minStock: article.minStock }),
      belowMin: belowMin(article, stock.quantity),
      ...declared(article, book),
      active: article.active,
      missing: missingOf(article, book),
    };
  }

  const inView = (row: ArticleListRow, filter: ArticleListFilter): boolean => {
    switch (filter) {
      case 'all':
        return row.active;
      case 'below_min':
        return row.active && row.belowMin;
      case 'no_price':
        return row.active && row.missing.includes('price');
      case 'inactive':
        return !row.active;
    }
  };

  const list: UseCase<'articles.list'> = async (raw) => {
    const input = CONTRACT_V1['articles.list'].input.parse(raw);
    const book = await loadBook(input.businessId);
    const matches = matcher(input.search);
    const narrowed = book.articles
      .filter(
        (article) =>
          (input.kind === undefined || article.kind === input.kind) &&
          (input.supplierId === undefined || article.supplierId === input.supplierId),
      )
      .map((article) => ({ article, row: listRow(article, book) }))
      .filter(({ article, row }) =>
        matches(
          row.name,
          row.categoryLabel,
          row.supplierName,
          article.supplierArticleNumber,
          article.gtin,
        ),
      )
      .map(({ row }) => row)
      .sort(byName);
    const ofCategory = narrowed.filter(
      (row) => input.categoryId === undefined || row.categoryId === input.categoryId,
    );
    const count = (filter: ArticleListFilter) =>
      ofCategory.filter((row) => inView(row, filter)).length;
    const view = narrowed.filter((row) => inView(row, input.filter));
    return {
      rows: ofCategory.filter((row) => inView(row, input.filter)),
      counts: {
        all: count('all'),
        below_min: count('below_min'),
        no_price: count('no_price'),
        inactive: count('inactive'),
      },
      categories: ARTICLE_CATEGORIES.map((category) => ({
        id: category.id,
        label: category.label,
        count: view.filter((row) => row.categoryId === category.id).length,
      })).filter((category) => category.count > 0),
      total: book.articles.length,
    };
  };

  /** True if a recipe takes the article as an ingredient or fills it as its output. */
  const usedInRecipes = (articleId: Id, recipes: readonly Recipe[]) =>
    recipes.some(
      (recipe) =>
        recipe.output?.articleId === articleId ||
        recipe.ingredients.some((ingredient) => ingredient.articleId === articleId),
    );

  /** Recipes that hold the article as an ingredient, with the net quantity of one batch. */
  function usesOf(articleId: Id, recipes: readonly Recipe[]) {
    return recipes
      .map((recipe) => ({
        recipe,
        quantity: roundQuantity(
          recipe.ingredients
            .filter((ingredient) => ingredient.articleId === articleId)
            .reduce((sum, ingredient) => sum + ingredient.quantity, 0),
        ),
      }))
      .filter(({ quantity }) => quantity > 0);
  }

  /** The recipe that fills the article, if it is a component. */
  function makerOf(article: Article, recipes: readonly Recipe[]): Recipe | undefined {
    return (
      recipes.find((recipe) => recipe.id === article.recipeId) ??
      recipes.find((recipe) => recipe.output?.articleId === article.id)
    );
  }

  /** The last twelve purchases (or productions), newest first, each against the one before. */
  function priceHistory(lots: readonly StockLot[], book: Book): PricePoint[] {
    const purchases = lots
      .filter((lot) => lot.origin === 'purchase' || lot.origin === 'production')
      .sort(
        (a, b) =>
          a.receivedOn.localeCompare(b.receivedOn) ||
          a.createdAt.localeCompare(b.createdAt) ||
          a.id.localeCompare(b.id),
      );
    return purchases
      .map((lot, index): PricePoint => {
        const before = purchases[index - 1]?.pricePer1000 ?? 0;
        const supplier =
          lot.supplierId === undefined ? undefined : book.suppliers.get(lot.supplierId);
        return {
          lotId: lot.id,
          receivedOn: lot.receivedOn,
          pricePer1000: lot.pricePer1000,
          quantity: lot.initialQuantity,
          ...(supplier === undefined ? {} : { supplierName: supplier.name }),
          ...(before > 0 && lot.pricePer1000 > 0
            ? { changeBps: Math.round(((lot.pricePer1000 - before) * 10_000) / before) }
            : {}),
        };
      })
      .reverse()
      .slice(0, 12);
  }

  const get: UseCase<'articles.get'> = async (raw) => {
    const input = CONTRACT_V1['articles.get'].input.parse(raw);
    const [book, orderRows] = await Promise.all([
      loadBook(input.businessId),
      storage.orders.ofBusiness(input.businessId),
    ]);
    const article = book.articleById.get(input.articleId);
    if (article === undefined) {
      throw new CommandError('not_found', `Article ${input.articleId} not found`);
    }
    const allLots = book.allLots.filter((lot) => lot.articleId === article.id);
    const stock = stockOf(article, book);
    const today = clock.today();
    const next = stock.lots
      .filter((lot) => lot.expiresOn !== undefined)
      .sort((a, b) => (a.expiresOn ?? '').localeCompare(b.expiresOn ?? ''))[0];
    const nextInfo =
      next === undefined ? undefined : expiryInfo(next.expiresOn, next.dateKind, today);
    const uses = usesOf(article.id, book.recipes);
    const maker = makerOf(article, book.recipes);
    const category = articleCategory(article.categoryId);
    const view: ArticleView = {
      id: article.id,
      name: article.name,
      kind: article.kind,
      categoryId: article.categoryId,
      categoryLabel: category.label,
      declaresOrigin: category.declaresOrigin,
      unit: article.unit,
      pricePer1000: article.pricePer1000,
      effectivePricePer1000: priceOf(article, book),
      yieldBps: article.yieldBps,
      ...declared(article, book),
      ...placeOf(article, book),
      ...defined({
        supplierArticleNumber: article.supplierArticleNumber,
        packSize: article.packSize,
        packLabel: article.packLabel,
        minStock: article.minStock,
        targetStock: article.targetStock,
        shelfLifeDays: article.shelfLifeDays,
        originCountry: article.originCountry,
        originCountryName:
          article.originCountry === undefined ? undefined : countryName(article.originCountry),
        recipeId: maker?.id,
        gtin: article.gtin,
        note: article.note,
      }),
      dateKind: article.dateKind,
      active: article.active,
    };
    const usedAsOutput = book.recipes.some((recipe) => recipe.output?.articleId === article.id);
    return {
      article: view,
      stock: {
        quantity: stock.quantity,
        valueRappen: stock.valueRappen,
        lots: stock.lots.length,
        belowMin: belowMin(article, stock.quantity),
        ...(next?.expiresOn === undefined || nextInfo?.daysLeft === undefined
          ? {}
          : {
              next: {
                expiresOn: next.expiresOn,
                dateKind: next.dateKind,
                status: nextInfo.status,
                daysLeft: nextInfo.daysLeft,
              },
            }),
      },
      usedIn: uses
        .map(({ recipe, quantity }) => ({
          recipeId: recipe.id,
          name: recipe.name,
          kind: recipe.kind,
          quantity,
          portions: recipe.portions,
          active: recipe.active,
        }))
        .sort(byName),
      ...(maker === undefined
        ? {}
        : {
            madeBy: {
              recipeId: maker.id,
              name: maker.name,
              ...(maker.output === undefined ? {} : { quantity: maker.output.quantity }),
            },
          }),
      priceHistory: priceHistory(allLots, book),
      missing: missingOf(article, book),
      ...(allLots.length > 0
        ? { unitLock: 'stock' as const }
        : uses.length > 0 || usedAsOutput
          ? { unitLock: 'recipes' as const }
          : {}),
      blockers: {
        stock: stock.quantity,
        recipes: uses.length + (usedAsOutput ? 1 : 0),
        orders: alive(orderRows).filter(
          (order) =>
            isOpenOrder(order) && order.lines.some((line) => line.articleId === article.id),
        ).length,
      },
    };
  };

  function assertFreeName(rows: readonly { id: Id; name: string }[], name: string, except?: Id) {
    const key = nameKey(name);
    if (rows.some((row) => row.id !== except && nameKey(row.name) === key)) {
      throw new CommandError('duplicate_name', `The name «${name}» is taken`);
    }
  }

  /** The first area of a kind, in the order the business gave its areas. */
  function firstArea(areas: readonly StorageArea[], kind: AreaKind): StorageArea | undefined {
    return [...areas]
      .sort((a, b) => a.sortOrder - b.sortOrder || byName(a, b))
      .find((area) => area.kind === kind);
  }

  /**
   * Area and spot that belong together: a spot brings its area, an area that does not hold the
   * spot is refused.
   */
  async function resolvePlace(
    businessId: Id,
    areaId: Id | undefined,
    spotId: Id | undefined,
  ): Promise<{ areaId?: Id; spotId?: Id }> {
    if (areaId !== undefined) {
      await requireRow(storage.areas, businessId, areaId, 'Area');
    }
    if (spotId === undefined) {
      return defined({ areaId });
    }
    const spot = await requireRow(storage.spots, businessId, spotId, 'Spot');
    if (areaId !== undefined && spot.areaId !== areaId) {
      throw new CommandError('invalid', 'The spot is not in this storage area');
    }
    return { areaId: spot.areaId, spotId: spot.id };
  }

  function assertStockLevels(minStock: number | undefined, targetStock: number | undefined) {
    if (minStock !== undefined && targetStock !== undefined && targetStock < minStock) {
      throw new CommandError('invalid', 'The target stock is below the minimum stock');
    }
  }

  /** What the group of goods proposes for a new article, with the areas of the business. */
  function proposals(categoryId: ArticleCategoryId, areas: readonly StorageArea[]) {
    const category = articleCategory(categoryId);
    return {
      diet: category.diet,
      dateKind: category.dateKind,
      shelfLifeDays: category.shelfLifeDays,
      areaId: firstArea(areas, category.area)?.id,
    };
  }

  const create: UseCase<'articles.create'> = async (raw) => {
    const input = CONTRACT_V1['articles.create'].input.parse(raw);
    return runCommand('articles.create', input.commandId, async () => {
      const { businessId } = input;
      assertFreeName(alive(await storage.articles.ofBusiness(businessId)), input.name);
      if (input.supplierId !== undefined) {
        await requireRow(storage.suppliers, businessId, input.supplierId, 'Supplier');
      }
      assertStockLevels(input.minStock, input.targetStock);
      const proposed = proposals(
        input.categoryId,
        alive(await storage.areas.ofBusiness(businessId)),
      );
      // No area given: the first one of the kind the group of goods goes to. Null: none.
      const place =
        input.areaId === undefined && input.spotId === undefined
          ? defined({ areaId: proposed.areaId })
          : await resolvePlace(businessId, input.areaId ?? undefined, input.spotId);
      const allergens = sortAllergens(input.allergens ?? []);
      const article = ArticleSchema.parse({
        id: ids.next(),
        businessId,
        ...stamps(),
        name: input.name,
        kind: 'purchased',
        categoryId: input.categoryId,
        unit: input.unit,
        pricePer1000: input.pricePer1000 ?? 0,
        yieldBps: input.yieldBps ?? 10_000,
        allergens,
        traces: sortAllergens(input.traces ?? []).filter((id) => !allergens.includes(id)),
        diet: input.diet ?? proposed.diet,
        dateKind: input.dateKind ?? proposed.dateKind,
        active: input.active ?? true,
        ...place,
        ...defined({
          shelfLifeDays:
            input.shelfLifeDays === undefined
              ? proposed.shelfLifeDays
              : (input.shelfLifeDays ?? undefined),
        }),
        ...defined({
          supplierId: input.supplierId,
          supplierArticleNumber: input.supplierArticleNumber,
          packSize: input.packSize,
          packLabel: input.packLabel,
          minStock: input.minStock,
          targetStock: input.targetStock,
          originCountry: input.originCountry,
          gtin: input.gtin,
          note: input.note,
        }),
      });
      await storage.articles.add(article);
      await emit(businessId, 'article.created', { articleId: article.id });
      return { articleId: article.id };
    });
  };

  const update: UseCase<'articles.update'> = async (raw) => {
    const input = CONTRACT_V1['articles.update'].input.parse(raw);
    return runCommand('articles.update', input.commandId, async () => {
      const { businessId, articleId } = input;
      const row = await requireRow(storage.articles, businessId, articleId, 'Article');
      const patch: Record<string, unknown> = { ...input };
      for (const field of ['businessId', 'commandId', 'articleId']) {
        Reflect.deleteProperty(patch, field);
      }
      const next = patched(row, patch);
      if (input.allergens !== undefined || input.traces !== undefined) {
        const allergens = sortAllergens(input.allergens ?? row.allergens);
        next.allergens = allergens;
        next.traces = sortAllergens(input.traces ?? row.traces).filter(
          (id) => !allergens.includes(id),
        );
      }

      // A spot brings its area; an area that does not hold the old spot lets it go.
      if (input.spotId !== undefined && input.spotId !== null) {
        const place = await resolvePlace(businessId, input.areaId ?? undefined, input.spotId);
        next.areaId = place.areaId;
      } else if (input.areaId !== undefined) {
        if (input.areaId !== null) {
          await requireRow(storage.areas, businessId, input.areaId, 'Area');
        }
        const spot = row.spotId === undefined ? undefined : await storage.spots.get(row.spotId);
        if (input.areaId === null || spot?.areaId !== input.areaId) {
          Reflect.deleteProperty(next, 'spotId');
        }
      }

      const candidate = ArticleSchema.parse(next);
      const fields = changedFields(ArticleSchema.shape, row, candidate);
      if (fields.length === 0) {
        return { articleId, changed: [] };
      }

      if (row.kind === 'prepared') {
        const owned = RECIPE_OWNED.filter((field) => fields.includes(field));
        if (owned.length > 0) {
          throw new CommandError(
            'not_allowed',
            `${owned.join(', ')} of a prepared article belong to its recipe`,
          );
        }
      }
      if (fields.includes('name')) {
        assertFreeName(
          alive(await storage.articles.ofBusiness(businessId)),
          candidate.name,
          row.id,
        );
      }
      if (fields.includes('unit')) {
        const lots = alive(await storage.lots.ofBusiness(businessId));
        if (lots.some((lot) => lot.articleId === row.id)) {
          throw new CommandError('not_allowed', 'The unit cannot change once there is stock');
        }
        if (usedInRecipes(row.id, alive(await storage.recipes.ofBusiness(businessId)))) {
          throw new CommandError('not_allowed', 'The unit cannot change once recipes use it');
        }
      }
      if (fields.includes('supplierId') && candidate.supplierId !== undefined) {
        await requireRow(storage.suppliers, businessId, candidate.supplierId, 'Supplier');
      }
      if (fields.includes('minStock') || fields.includes('targetStock')) {
        assertStockLevels(candidate.minStock, candidate.targetStock);
      }

      await storage.articles.put(ArticleSchema.parse({ ...candidate, updatedAt: clock.now() }));
      await emit(businessId, 'article.updated', { articleId, fields });
      return { articleId, changed: fields };
    });
  };

  const setActive: UseCase<'articles.setActive'> = async (raw) => {
    const input = CONTRACT_V1['articles.setActive'].input.parse(raw);
    return runCommand('articles.setActive', input.commandId, async () => {
      const row = await requireRow(storage.articles, input.businessId, input.articleId, 'Article');
      if (row.active !== input.active) {
        await storage.articles.put(
          ArticleSchema.parse({ ...row, active: input.active, updatedAt: clock.now() }),
        );
        await emit(input.businessId, input.active ? 'article.activated' : 'article.deactivated', {
          articleId: row.id,
        });
      }
      return { articleId: row.id, active: input.active };
    });
  };

  const remove: UseCase<'articles.delete'> = async (raw) => {
    const input = CONTRACT_V1['articles.delete'].input.parse(raw);
    return runCommand('articles.delete', input.commandId, async () => {
      const { businessId } = input;
      const row = await requireRow(storage.articles, businessId, input.articleId, 'Article');
      const lots = alive(await storage.lots.ofBusiness(businessId));
      if (
        lots.some((lot) => lot.articleId === row.id && lot.status === 'active' && lot.quantity > 0)
      ) {
        throw new CommandError('in_use', 'The article still has stock');
      }
      if (usedInRecipes(row.id, alive(await storage.recipes.ofBusiness(businessId)))) {
        throw new CommandError('in_use', 'A recipe still uses the article');
      }
      const orders = alive(await storage.orders.ofBusiness(businessId));
      if (
        orders.some(
          (order) => isOpenOrder(order) && order.lines.some((line) => line.articleId === row.id),
        )
      ) {
        throw new CommandError('in_use', 'An open order still names the article');
      }
      const now = clock.now();
      await storage.articles.put(ArticleSchema.parse({ ...row, deletedAt: now, updatedAt: now }));
      await emit(businessId, 'article.deleted', { articleId: row.id });
      return { articleId: row.id };
    });
  };

  /** The pasted text read against what exists: the same reading for preview and import. */
  async function readImport(businessId: Id, text: string) {
    const business = await storage.businesses.get(businessId);
    if (business === undefined) {
      throw new CommandError('not_found', `Business ${businessId} not found`);
    }
    const articles = alive(await storage.articles.ofBusiness(businessId));
    const suppliers = alive(await storage.suppliers.ofBusiness(businessId));
    const parsed = parseImportLines(
      text,
      business.currency,
      new Set(articles.map((article) => nameKey(article.name))),
    );
    return {
      ...parsed,
      supplierByName: new Map(suppliers.map((supplier) => [nameKey(supplier.name), supplier])),
    };
  }

  const importPreview: UseCase<'articles.importPreview'> = async (raw) => {
    const input = CONTRACT_V1['articles.importPreview'].input.parse(raw);
    const { lines, truncated, supplierByName } = await readImport(input.businessId, input.text);
    const newSuppliers = new Map<string, string>();
    const rows = lines.map((line): ImportLine => {
      const ok = line.problems.length === 0;
      const supplierIsNew =
        line.supplierName !== undefined && !supplierByName.has(nameKey(line.supplierName));
      if (ok && supplierIsNew && line.supplierName !== undefined) {
        const key = nameKey(line.supplierName);
        newSuppliers.set(key, newSuppliers.get(key) ?? line.supplierName);
      }
      return {
        line: line.line,
        raw: line.raw,
        ...defined({
          name: line.name,
          unit: line.unit,
          pricePer1000: line.pricePer1000 === undefined ? undefined : rappen(line.pricePer1000),
          supplierName: line.supplierName,
        }),
        supplierIsNew,
        categoryId: line.categoryId,
        categoryLabel: articleCategory(line.categoryId).label,
        problems: line.problems,
        ok,
      };
    });
    const valid = rows.filter((row) => row.ok).length;
    return {
      lines: rows,
      valid,
      invalid: rows.length - valid,
      newSuppliers: [...newSuppliers.values()].sort((a, b) => a.localeCompare(b, 'de-CH')),
      truncated,
    };
  };

  const importArticles: UseCase<'articles.import'> = async (raw) => {
    const input = CONTRACT_V1['articles.import'].input.parse(raw);
    return runCommand('articles.import', input.commandId, async () => {
      const { businessId } = input;
      const { lines, supplierByName } = await readImport(businessId, input.text);
      const areas = alive(await storage.areas.ofBusiness(businessId));
      const corrected = new Map(input.categories.map((entry) => [entry.line, entry.categoryId]));
      const articleIds: Id[] = [];
      const supplierIds: Id[] = [];
      const remaining: string[] = [];
      for (const line of lines) {
        if (line.problems.length > 0 || line.name === undefined || line.unit === undefined) {
          remaining.push(line.raw);
          continue;
        }
        let supplier =
          line.supplierName === undefined
            ? undefined
            : supplierByName.get(nameKey(line.supplierName));
        if (supplier === undefined && line.supplierName !== undefined) {
          supplier = SupplierSchema.parse({
            id: ids.next(),
            businessId,
            ...stamps(),
            name: line.supplierName,
            orderDays: [],
            deliveryDays: [],
          });
          await storage.suppliers.add(supplier);
          supplierByName.set(nameKey(supplier.name), supplier);
          supplierIds.push(supplier.id);
          await emit(businessId, 'supplier.created', { supplierId: supplier.id });
        }
        const categoryId = corrected.get(line.line) ?? line.categoryId;
        const proposed = proposals(categoryId, areas);
        const article = ArticleSchema.parse({
          id: ids.next(),
          businessId,
          ...stamps(),
          name: line.name,
          kind: 'purchased',
          categoryId,
          unit: line.unit,
          pricePer1000: line.pricePer1000 ?? 0,
          yieldBps: 10_000,
          allergens: [],
          traces: [],
          diet: proposed.diet,
          dateKind: proposed.dateKind,
          shelfLifeDays: proposed.shelfLifeDays,
          active: true,
          ...defined({ areaId: proposed.areaId, supplierId: supplier?.id }),
        });
        await storage.articles.add(article);
        articleIds.push(article.id);
      }
      if (articleIds.length === 0) {
        throw new CommandError('invalid', 'No line can become an article');
      }
      await emit(businessId, 'articles.imported', {
        articleIds,
        supplierIds,
        skipped: remaining.length,
      });
      return {
        created: articleIds.length,
        skipped: remaining.length,
        suppliersCreated: supplierIds.length,
        articleIds,
        remaining: remaining.join('\n'),
      };
    });
  };

  function supplierFacts(supplier: Supplier, today: LocalDate) {
    return {
      id: supplier.id,
      name: supplier.name,
      ...defined({
        customerNumber: supplier.customerNumber,
        phone: supplier.phone,
        email: supplier.email,
        minOrderRappen: supplier.minOrderRappen,
        nextOrder: nextDay(supplier.orderDays, today),
        nextDelivery: nextDay(supplier.deliveryDays, today),
      }),
      orderDays: sortWeekdays(supplier.orderDays),
      deliveryDays: sortWeekdays(supplier.deliveryDays),
    };
  }

  const listSuppliers: UseCase<'suppliers.list'> = async (raw) => {
    const input = CONTRACT_V1['suppliers.list'].input.parse(raw);
    const book = await loadBook(input.businessId);
    const today = clock.today();
    const matches = matcher(input.search);
    const suppliers = [...book.suppliers.values()];
    return {
      suppliers: suppliers
        .filter((supplier) => matches(supplier.name, supplier.customerNumber))
        .sort(byName)
        .map((supplier) => {
          const articles = book.articles.filter((article) => article.supplierId === supplier.id);
          return {
            ...supplierFacts(supplier, today),
            articleCount: articles.length,
            belowMinCount: articles.filter(
              (article) => article.active && belowMin(article, stockOf(article, book).quantity),
            ).length,
          };
        }),
      total: suppliers.length,
    };
  };

  const getSupplier: UseCase<'suppliers.get'> = async (raw) => {
    const input = CONTRACT_V1['suppliers.get'].input.parse(raw);
    const [book, orderRows] = await Promise.all([
      loadBook(input.businessId),
      storage.orders.ofBusiness(input.businessId),
    ]);
    const supplier = book.suppliers.get(input.supplierId);
    if (supplier === undefined) {
      throw new CommandError('not_found', `Supplier ${input.supplierId} not found`);
    }
    return {
      supplier: {
        ...supplierFacts(supplier, clock.today()),
        ...(supplier.note === undefined ? {} : { note: supplier.note }),
      },
      articles: book.articles
        .filter((article) => article.supplierId === supplier.id)
        .sort(byName)
        .map((article) => {
          const stock = stockOf(article, book).quantity;
          return {
            id: article.id,
            name: article.name,
            categoryLabel: articleCategory(article.categoryId).label,
            unit: article.unit,
            pricePer1000: priceOf(article, book),
            stock,
            ...(article.minStock === undefined ? {} : { minStock: article.minStock }),
            belowMin: belowMin(article, stock),
            active: article.active,
          };
        }),
      openOrders: alive(orderRows).filter(
        (order) => order.supplierId === supplier.id && isOpenOrder(order),
      ).length,
    };
  };

  const createSupplier: UseCase<'suppliers.create'> = async (raw) => {
    const input = CONTRACT_V1['suppliers.create'].input.parse(raw);
    return runCommand('suppliers.create', input.commandId, async () => {
      const { businessId } = input;
      assertFreeName(alive(await storage.suppliers.ofBusiness(businessId)), input.name);
      const supplier = SupplierSchema.parse({
        id: ids.next(),
        businessId,
        ...stamps(),
        name: input.name,
        orderDays: sortWeekdays(input.orderDays),
        deliveryDays: sortWeekdays(input.deliveryDays),
        ...defined({
          customerNumber: input.customerNumber,
          phone: input.phone,
          email: input.email,
          minOrderRappen: input.minOrderRappen,
          note: input.note,
        }),
      });
      await storage.suppliers.add(supplier);
      await emit(businessId, 'supplier.created', { supplierId: supplier.id });
      return { supplierId: supplier.id };
    });
  };

  const updateSupplier: UseCase<'suppliers.update'> = async (raw) => {
    const input = CONTRACT_V1['suppliers.update'].input.parse(raw);
    return runCommand('suppliers.update', input.commandId, async () => {
      const { businessId, supplierId } = input;
      const row = await requireRow(storage.suppliers, businessId, supplierId, 'Supplier');
      const patch: Record<string, unknown> = {
        ...input,
        ...defined({
          orderDays: input.orderDays === undefined ? undefined : sortWeekdays(input.orderDays),
          deliveryDays:
            input.deliveryDays === undefined ? undefined : sortWeekdays(input.deliveryDays),
        }),
      };
      for (const field of ['businessId', 'commandId', 'supplierId']) {
        Reflect.deleteProperty(patch, field);
      }
      const candidate = SupplierSchema.parse(patched(row, patch));
      const fields = changedFields(SupplierSchema.shape, row, candidate);
      if (fields.length === 0) {
        return { supplierId, changed: [] };
      }
      if (fields.includes('name')) {
        assertFreeName(
          alive(await storage.suppliers.ofBusiness(businessId)),
          candidate.name,
          row.id,
        );
      }
      await storage.suppliers.put(SupplierSchema.parse({ ...candidate, updatedAt: clock.now() }));
      await emit(businessId, 'supplier.updated', { supplierId, fields });
      return { supplierId, changed: fields };
    });
  };

  const removeSupplier: UseCase<'suppliers.delete'> = async (raw) => {
    const input = CONTRACT_V1['suppliers.delete'].input.parse(raw);
    return runCommand('suppliers.delete', input.commandId, async () => {
      const { businessId } = input;
      const row = await requireRow(storage.suppliers, businessId, input.supplierId, 'Supplier');
      const articles = alive(await storage.articles.ofBusiness(businessId));
      if (articles.some((article) => article.supplierId === row.id)) {
        throw new CommandError('in_use', 'Articles still name the supplier');
      }
      const orders = alive(await storage.orders.ofBusiness(businessId));
      if (orders.some((order) => order.supplierId === row.id && isOpenOrder(order))) {
        throw new CommandError('in_use', 'An open order still names the supplier');
      }
      const now = clock.now();
      await storage.suppliers.put(SupplierSchema.parse({ ...row, deletedAt: now, updatedAt: now }));
      await emit(businessId, 'supplier.deleted', { supplierId: row.id });
      return { supplierId: row.id };
    });
  };

  return {
    'articles.list': list,
    'articles.get': get,
    'articles.create': create,
    'articles.update': update,
    'articles.setActive': setActive,
    'articles.delete': remove,
    'articles.importPreview': importPreview,
    'articles.import': importArticles,
    'suppliers.list': listSuppliers,
    'suppliers.get': getSupplier,
    'suppliers.create': createSupplier,
    'suppliers.update': updateSupplier,
    'suppliers.delete': removeSupplier,
  };
}
