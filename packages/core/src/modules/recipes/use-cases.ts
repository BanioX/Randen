import {
  CommandError,
  createCommandKit,
  requireRow,
  type AppContext,
  type UseCase,
} from '../../application/command';
import { CONTRACT_V1 } from '../../contract';
import { sortAllergens, type AllergenId } from '../../domain/allergens';
import { articleCategory } from '../../domain/categories';
import {
  dishFigures,
  effectiveUnitPrice,
  foodCostBps,
  netOfVat,
  recipeCost,
  vatIn,
  type CostBook,
  type RecipeCost,
} from '../../domain/costing';
import {
  countryName,
  declarationOf,
  type Declaration,
  type DeclarationBook,
} from '../../domain/declaration';
import { usableQuantity } from '../../domain/fefo';
import { recipeRequirements } from '../../domain/requirements';
import { formatQuantity, milliToRappen, roundQuantity } from '../../domain/units';
import type { Id } from '../../ids';
import { rappen, type Rappen } from '../../money';
import { ArticleSchema, type Article } from '../../model/article';
import type { Business } from '../../model/business';
import type { MenuCard, PlanEntry } from '../../model/menu';
import type { Unit } from '../../model/primitives';
import { RecipeSchema, type Recipe } from '../../model/recipe';
import type { StockLot } from '../../model/stock';
import { alive } from '../../ports/storage';
import type {
  BookRecipe,
  KindLock,
  RecipeBlockers,
  RecipeDeclaration,
  RecipeGap,
  RecipeLine,
  RecipeListFilter,
  RecipeListRow,
} from './contract';

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'de-CH');

/** Names compare without regard to case: «Rotweinjus» and «rotweinjus» are the same recipe. */
const nameKey = (name: string) => name.trim().toLocaleLowerCase('de-CH');

/** Case and accents do not matter when searching. */
const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('de-CH');

/** Every word of the search must occur in the name or the description. */
function matcher(search: string | undefined): (...texts: (string | undefined)[]) => boolean {
  const words = fold(search ?? '')
    .split(/\s+/)
    .filter(Boolean);
  return (...texts) => {
    const haystack = fold(texts.filter(Boolean).join(' '));
    return words.every((word) => haystack.includes(word));
  };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

type Defined<TObject> = { [TKey in keyof TObject]?: Exclude<TObject[TKey], undefined> };

/** An object without its undefined entries, so optional fields are left out, never undefined. */
function defined<TObject extends Record<string, unknown>>(object: TObject): Defined<TObject> {
  return Object.fromEntries(
    Object.entries(object).filter(([, value]) => value !== undefined),
  ) as Defined<TObject>;
}

/** Fields of a recipe the person decides; `output` is compared on its own (its article). */
const RECIPE_FIELDS = (Object.keys(RecipeSchema.shape) as (keyof Recipe)[]).filter(
  (field) => !['id', 'businessId', 'createdAt', 'updatedAt', 'deletedAt', 'output'].includes(field),
);

/** The most portions a read reports, so a tiny ingredient never makes an absurd number. */
const MAX_COVERED = 999_999;

/** The longest a recipe name may be (the model) and the word a copy carries. */
const NAME_MAX = 120;
const COPY_WORD = 'Kopie';

/** Everything the reads and the checks of this module join, loaded once. */
interface Book {
  business: Business;
  articles: Article[];
  articleById: Map<Id, Article>;
  recipes: Recipe[];
  recipeById: Map<Id, Recipe>;
  /** Active lots with something in them, per article. */
  lots: Map<Id, StockLot[]>;
  /** Every lot ever booked, per article (also used up): the unit of such an article is fixed. */
  everBooked: Set<Id>;
  menuCards: MenuCard[];
  planEntries: PlanEntry[];
  cost: CostBook;
  declaration: DeclarationBook;
}

/** What a recipe is in numbers today: cost, declaration, figures and gaps. */
interface Analysis {
  cost: RecipeCost;
  declaration: Declaration;
  figures: ReturnType<typeof dishFigures> | undefined;
  /** A component: cost per 1000 base units of its output; 0 while a price is missing. */
  costPer1000: Rappen;
  gaps: RecipeGap[];
}

/** What a command writes: the fields of a recipe the person decides. */
interface Draft {
  name: string;
  kind: Recipe['kind'];
  course: Recipe['course'];
  portions: number;
  ingredients: Recipe['ingredients'];
  steps: string[];
  vatBps: number;
  extraAllergens: AllergenId[];
  extraTraces: AllergenId[];
  labels: Recipe['labels'];
  active: boolean;
  description?: string | undefined;
  prepMinutes?: number | undefined;
  photo?: string | undefined;
  priceRappen?: Rappen | undefined;
  shelfLifeDays?: number | undefined;
  output?: { quantity: number; unit: Unit } | undefined;
}

/** Use cases of the recipe book: dishes, components, costing and declaration. */
export function createRecipesUseCases(ctx: AppContext) {
  const { storage, clock, ids } = ctx;
  const { emit, runCommand, stamps } = createCommandKit(ctx);

  async function businessOf(businessId: Id): Promise<Business> {
    const row = await storage.businesses.get(businessId);
    if (row === undefined) {
      throw new CommandError('not_found', `Business ${businessId} not found`);
    }
    return row;
  }

  async function loadBook(businessId: Id): Promise<Book> {
    const business = await businessOf(businessId);
    const [articleRows, recipeRows, lotRows, cardRows, planRows] = await Promise.all([
      storage.articles.ofBusiness(businessId),
      storage.recipes.ofBusiness(businessId),
      storage.lots.ofBusiness(businessId),
      storage.menuCards.ofBusiness(businessId),
      storage.planEntries.ofBusiness(businessId),
    ]);
    const articles = alive(articleRows);
    const recipes = alive(recipeRows);
    const articleById = new Map(articles.map((row) => [row.id, row]));
    const recipeById = new Map(recipes.map((row) => [row.id, row]));
    const lots = new Map<Id, StockLot[]>();
    const everBooked = new Set<Id>();
    for (const lot of alive(lotRows)) {
      everBooked.add(lot.articleId);
      if (lot.status === 'active' && lot.quantity > 0) {
        lots.set(lot.articleId, [...(lots.get(lot.articleId) ?? []), lot]);
      }
    }
    return {
      business,
      articles,
      articleById,
      recipes,
      recipeById,
      lots,
      everBooked,
      menuCards: alive(cardRows),
      planEntries: alive(planRows),
      cost: { articles: articleById, recipes: recipeById },
      declaration: { articles: articleById, recipes: recipeById },
    };
  }

  const stockOf = (articleId: Id, book: Book) =>
    roundQuantity((book.lots.get(articleId) ?? []).reduce((sum, lot) => sum + lot.quantity, 0));

  const usableOf = (articleId: Id, book: Book) =>
    usableQuantity(book.lots.get(articleId) ?? [], clock.today());

  /** The article a component fills, if it is still there. */
  const outputArticle = (recipe: Recipe, book: Book) =>
    recipe.output === undefined ? undefined : book.articleById.get(recipe.output.articleId);

  function analyse(recipe: Recipe, book: Book): Analysis {
    const cost = recipeCost(recipe, book.cost);
    const declaration = declarationOf(recipe, book.declaration);
    const costIncomplete = cost.missingPrices.length > 0 || recipe.ingredients.length === 0;
    const figures =
      recipe.kind === 'dish'
        ? dishFigures({
            costPerPortion: cost.perPortionRappen,
            priceRappen: recipe.priceRappen,
            vatBps: recipe.vatBps,
            targetFoodCostBps: book.business.targetFoodCostBps,
            costIncomplete,
          })
        : undefined;
    const article = outputArticle(recipe, book);
    // The cost of the recipe itself, not the last production: what a batch costs today.
    const costPer1000 =
      article === undefined
        ? undefined
        : effectiveUnitPrice({ ...article, pricePer1000: 0 }, book.cost);
    const gaps: RecipeGap[] = [];
    if (recipe.ingredients.length === 0) {
      gaps.push('ingredients');
    }
    if (cost.missingPrices.length > 0) {
      gaps.push('cost');
    }
    if (declaration.incomplete) {
      gaps.push('declaration');
    }
    if (declaration.origins.some((origin) => origin.country === undefined)) {
      gaps.push('origin');
    }
    if (recipe.kind === 'dish' && (recipe.priceRappen ?? 0) <= 0) {
      gaps.push('price');
    }
    return { cost, declaration, figures, costPer1000: rappen(costPer1000 ?? 0), gaps };
  }

  // ── Reads ────────────────────────────────────────────────────────────────────────────────

  function listRow(recipe: Recipe, book: Book): RecipeListRow {
    const { cost, declaration, figures, costPer1000, gaps } = analyse(recipe, book);
    const article = outputArticle(recipe, book);
    return {
      id: recipe.id,
      name: recipe.name,
      kind: recipe.kind,
      course: recipe.course,
      portions: recipe.portions,
      costPerPortionRappen: cost.perPortionRappen,
      status: figures?.status ?? 'unknown',
      ...defined({
        photo: recipe.photo,
        priceRappen: recipe.kind === 'dish' ? recipe.priceRappen : undefined,
        foodCostBps: figures?.foodCostBps,
        marginRappen: figures?.marginRappen,
      }),
      ...(recipe.output === undefined || article === undefined
        ? {}
        : {
            output: {
              articleId: article.id,
              quantity: recipe.output.quantity,
              unit: article.unit,
              costPer1000,
            },
          }),
      allergens: declaration.allergens,
      traces: declaration.traces,
      diet: declaration.diet,
      gaps,
      incomplete: gaps.length > 0,
      active: recipe.active,
    };
  }

  const inView = (row: RecipeListRow, filter: RecipeListFilter): boolean => {
    switch (filter) {
      case 'all':
        return row.active;
      case 'over_target':
        return row.active && (row.status === 'over' || row.status === 'watch');
      case 'incomplete':
        return row.active && row.incomplete;
      case 'inactive':
        return !row.active;
    }
  };

  const list: UseCase<'recipes.list'> = async (raw) => {
    const input = CONTRACT_V1['recipes.list'].input.parse(raw);
    const book = await loadBook(input.businessId);
    const matches = matcher(input.search);
    const ofKind = book.recipes.filter(
      (recipe) => input.kind === undefined || recipe.kind === input.kind,
    );
    const searched = ofKind
      .filter((recipe) => matches(recipe.name, recipe.description))
      .sort(byName)
      .map((recipe) => listRow(recipe, book));
    const inCourse = searched.filter(
      (row) => input.course === undefined || row.course === input.course,
    );
    const courseCounts = new Map<Recipe['course'], number>();
    for (const row of searched) {
      if (row.active || input.filter === 'inactive') {
        courseCounts.set(row.course, (courseCounts.get(row.course) ?? 0) + 1);
      }
    }
    return {
      rows: inCourse.filter((row) => inView(row, input.filter)),
      counts: {
        all: inCourse.filter((row) => inView(row, 'all')).length,
        over_target: inCourse.filter((row) => inView(row, 'over_target')).length,
        incomplete: inCourse.filter((row) => inView(row, 'incomplete')).length,
        inactive: inCourse.filter((row) => inView(row, 'inactive')).length,
      },
      courses: RecipeSchema.shape.course.options
        .filter((course) => courseCounts.has(course))
        .map((course) => ({ course, count: courseCounts.get(course) ?? 0 })),
      kinds: {
        dish: book.recipes.filter((recipe) => recipe.kind === 'dish').length,
        component: book.recipes.filter((recipe) => recipe.kind === 'component').length,
      },
      targetFoodCostBps: book.business.targetFoodCostBps,
    };
  };

  /** The fields of a recipe as the form and the detail page read them. */
  function fieldsOf(recipe: Recipe, book: Book) {
    const article = outputArticle(recipe, book);
    return {
      id: recipe.id,
      name: recipe.name,
      kind: recipe.kind,
      course: recipe.course,
      portions: recipe.portions,
      ingredients: recipe.ingredients,
      steps: recipe.steps,
      vatBps: recipe.vatBps,
      extraAllergens: recipe.extraAllergens,
      extraTraces: recipe.extraTraces,
      labels: recipe.labels,
      active: recipe.active,
      ...defined({
        description: recipe.description,
        prepMinutes: recipe.prepMinutes,
        photo: recipe.photo,
        priceRappen: recipe.priceRappen,
        shelfLifeDays: recipe.shelfLifeDays,
      }),
      ...(recipe.output === undefined || article === undefined
        ? {}
        : {
            output: {
              articleId: article.id,
              name: article.name,
              unit: article.unit,
              quantity: recipe.output.quantity,
            },
          }),
    };
  }

  /** Live recipes other than `except` that use an article, with the net quantity of one batch. */
  function usesOf(articleId: Id, book: Book, except?: Id) {
    return book.recipes
      .filter((recipe) => recipe.id !== except)
      .map((recipe) => ({
        recipe,
        quantity: roundQuantity(
          recipe.ingredients
            .filter((ingredient) => ingredient.articleId === articleId)
            .reduce((sum, ingredient) => sum + ingredient.quantity, 0),
        ),
      }))
      .filter((use) => use.quantity > 0)
      .sort((a, b) => byName(a.recipe, b.recipe));
  }

  function blockersOf(recipe: Recipe, book: Book): RecipeBlockers {
    const today = clock.today();
    const article = outputArticle(recipe, book);
    return {
      menuCards: book.menuCards
        .filter((card) => card.sections.some((section) => section.recipeIds.includes(recipe.id)))
        .map((card) => card.name)
        .sort((a, b) => a.localeCompare(b, 'de-CH')),
      planEntries: book.planEntries.filter(
        (entry) =>
          entry.recipeId === recipe.id && entry.productionId === undefined && entry.date >= today,
      ).length,
      recipes:
        article === undefined
          ? []
          : usesOf(article.id, book, recipe.id).map((use) => ({
              recipeId: use.recipe.id,
              name: use.recipe.name,
            })),
      stock: article === undefined ? 0 : stockOf(article.id, book),
    };
  }

  /** Why the kind can no longer change: the component is in stock or used, the dish on a card. */
  function kindLockOf(recipe: Recipe, book: Book): KindLock | undefined {
    const blockers = blockersOf(recipe, book);
    if (recipe.kind === 'component') {
      return blockers.stock > 0 ? 'stock' : blockers.recipes.length > 0 ? 'used' : undefined;
    }
    return blockers.menuCards.length > 0 ? 'menu' : undefined;
  }

  /** The unit of a component's article is fixed once it was in stock or a recipe uses it. */
  function unitLocked(recipe: Recipe, book: Book): boolean {
    const article = outputArticle(recipe, book);
    return (
      article !== undefined &&
      (book.everBooked.has(article.id) || usesOf(article.id, book, recipe.id).length > 0)
    );
  }

  /**
   * Where each allergen comes from: the names of the ingredients that bring it (a component
   * with everything inside it), and whether the recipe adds it itself.
   */
  function sourcesOf(recipe: Recipe, declaration: Declaration, book: Book) {
    const brings = recipe.ingredients.map((ingredient) => {
      const article = book.articleById.get(ingredient.articleId);
      if (article === undefined) {
        return { name: '', allergens: [] as AllergenId[], traces: [] as AllergenId[] };
      }
      const sub =
        article.kind === 'prepared' && article.recipeId !== undefined
          ? book.recipeById.get(article.recipeId)
          : undefined;
      const inner =
        sub === undefined || sub.id === recipe.id
          ? undefined
          : declarationOf(sub, book.declaration);
      return {
        name: article.name,
        allergens: [...article.allergens, ...(inner?.allergens ?? [])],
        traces: [...article.traces, ...(inner?.traces ?? [])],
      };
    });
    const namesWith = (allergen: AllergenId, trace: boolean) => [
      ...new Set(
        brings
          .filter((line) => (trace ? line.traces : line.allergens).includes(allergen))
          .map((line) => line.name)
          .filter((name) => name !== ''),
      ),
    ];
    return [
      ...declaration.allergens.map((allergen) => ({
        allergen,
        trace: false,
        from: namesWith(allergen, false),
        extra: recipe.extraAllergens.includes(allergen),
      })),
      ...declaration.traces.map((allergen) => ({
        allergen,
        trace: true,
        from: namesWith(allergen, true),
        extra: recipe.extraTraces.includes(allergen),
      })),
    ];
  }

  function declarationView(recipe: Recipe, declaration: Declaration, book: Book) {
    const unknownIngredients = recipe.ingredients.filter(
      (ingredient) => !book.articleById.has(ingredient.articleId),
    ).length;
    const originMissing = declaration.origins.some((origin) => origin.country === undefined);
    return {
      allergens: declaration.allergens,
      traces: declaration.traces,
      diet: declaration.diet,
      origins: declaration.origins.map((origin) => ({
        articleId: origin.articleId,
        name: origin.name,
        ...(origin.country === undefined
          ? {}
          : { country: origin.country, countryName: countryName(origin.country) }),
      })),
      sources: sourcesOf(recipe, declaration, book),
      incomplete: declaration.incomplete || originMissing,
      unknownIngredients,
      // An ingredient that is gone explains «incomplete»; whatever is left is a loop.
      loop: declaration.incomplete && unknownIngredients === 0,
    } satisfies RecipeDeclaration;
  }

  /** How far the usable stock reaches, and what is short for the portions asked for. */
  function availabilityOf(recipe: Recipe, portions: number, book: Book) {
    const nameOf = (articleId: Id) => book.articleById.get(articleId)?.name ?? '';
    const perBatch = recipeRequirements(recipe, recipe.portions, book.articleById);
    const covered = perBatch.map((requirement) => {
      const usable = usableOf(requirement.articleId, book);
      return {
        articleId: requirement.articleId,
        covers:
          requirement.quantity <= 0
            ? MAX_COVERED
            : Math.min(
                MAX_COVERED,
                Math.floor((usable * recipe.portions) / requirement.quantity + 1e-9),
              ),
      };
    });
    const least = covered.length === 0 ? undefined : Math.min(...covered.map((c) => c.covers));
    const asked = recipeRequirements(recipe, portions, book.articleById);
    return {
      ...(least === undefined ? {} : { portionsCovered: least }),
      limiting:
        least === undefined
          ? []
          : covered
              .filter((c) => c.covers === least)
              .map((c) => ({ articleId: c.articleId, name: nameOf(c.articleId) })),
      short: asked
        .map((requirement) => {
          const usable = usableOf(requirement.articleId, book);
          return {
            articleId: requirement.articleId,
            name: nameOf(requirement.articleId),
            unit: book.articleById.get(requirement.articleId)?.unit ?? ('g' as const),
            needed: requirement.quantity,
            usable,
            missing: roundQuantity(requirement.quantity - usable),
          };
        })
        .filter((line) => line.missing > 0),
    };
  }

  const get: UseCase<'recipes.get'> = async (raw) => {
    const input = CONTRACT_V1['recipes.get'].input.parse(raw);
    const book = await loadBook(input.businessId);
    const recipe = book.recipeById.get(input.recipeId);
    if (recipe === undefined) {
      throw new CommandError('not_found', `Recipe ${input.recipeId} not found`);
    }
    const portions = input.portions ?? recipe.portions;
    const factor = portions / recipe.portions;
    const { cost, declaration, figures, costPer1000, gaps } = analyse(recipe, book);

    const lines: RecipeLine[] = recipe.ingredients.map((ingredient, index) => {
      const article = book.articleById.get(ingredient.articleId);
      const line = cost.lines[index];
      const scaled = roundQuantity(ingredient.quantity * factor);
      const scaledGross = roundQuantity((line?.grossQuantity ?? ingredient.quantity) * factor);
      return {
        index,
        articleId: ingredient.articleId,
        known: article !== undefined,
        name: article?.name ?? '',
        articleKind: article?.kind ?? 'purchased',
        unit: article?.unit ?? 'g',
        quantity: ingredient.quantity,
        grossQuantity: line?.grossQuantity ?? ingredient.quantity,
        yieldBps: article?.yieldBps ?? 10_000,
        scaledQuantity: scaled,
        scaledGrossQuantity: scaledGross,
        pricePer1000: rappen(line?.pricePer1000 ?? 0),
        costRappen: milliToRappen(line?.costMilli ?? 0),
        scaledCostRappen: milliToRappen(Math.round((line?.costMilli ?? 0) * factor)),
        priceMissing: line?.priceMissing ?? true,
        allergens: article?.allergens ?? [],
        traces: article?.traces ?? [],
        usableStock: usableOf(ingredient.articleId, book),
        ...defined({
          note: ingredient.note,
          componentRecipeId:
            article?.kind === 'prepared' &&
            article.recipeId !== undefined &&
            book.recipeById.has(article.recipeId)
              ? article.recipeId
              : undefined,
        }),
      };
    });

    const article = outputArticle(recipe, book);
    const target = book.business.targetFoodCostBps;
    const suggestedNet =
      figures?.suggestedPriceRappen === undefined
        ? undefined
        : netOfVat(figures.suggestedPriceRappen, recipe.vatBps);
    const blockers = blockersOf(recipe, book);
    const kindLock = kindLockOf(recipe, book);

    return {
      recipe: fieldsOf(recipe, book),
      portions,
      lines,
      cost: {
        totalRappen: cost.totalRappen,
        perPortionRappen: cost.perPortionRappen,
        scaledRappen: milliToRappen(Math.round(cost.totalMilli * factor)),
        missingPrices: cost.missingPrices.map((articleId) => ({
          articleId,
          name: book.articleById.get(articleId)?.name ?? '',
        })),
      },
      ...(figures === undefined
        ? {}
        : {
            figures: {
              vatBps: recipe.vatBps,
              status: figures.status,
              targetFoodCostBps: target,
              ...defined({
                priceRappen: recipe.priceRappen,
                netRappen: figures.netRappen,
                vatRappen:
                  recipe.priceRappen === undefined || recipe.priceRappen <= 0
                    ? undefined
                    : vatIn(recipe.priceRappen, recipe.vatBps),
                marginRappen: figures.marginRappen,
                foodCostBps: figures.foodCostBps,
                suggestedPriceRappen: figures.suggestedPriceRappen,
                suggestedFoodCostBps:
                  suggestedNet === undefined
                    ? undefined
                    : foodCostBps(cost.perPortionRappen, suggestedNet),
              }),
            },
          }),
      declaration: declarationView(recipe, declaration, book),
      availability: availabilityOf(recipe, portions, book),
      ...(recipe.output === undefined || article === undefined
        ? {}
        : {
            component: {
              articleId: article.id,
              articleName: article.name,
              unit: article.unit,
              outputQuantity: recipe.output.quantity,
              costPer1000,
              lastPricePer1000: article.pricePer1000,
              stock: stockOf(article.id, book),
              usedIn: usesOf(article.id, book, recipe.id).map((use) => ({
                recipeId: use.recipe.id,
                name: use.recipe.name,
                kind: use.recipe.kind,
                quantity: use.quantity,
                portions: use.recipe.portions,
                active: use.recipe.active,
              })),
            },
          }),
      gaps,
      blockers,
      ...(kindLock === undefined ? {} : { kindLock }),
      businessName: book.business.name,
    };
  };

  const card: UseCase<'recipes.card'> = async (raw) => {
    const input = CONTRACT_V1['recipes.card'].input.parse(raw);
    const book = await loadBook(input.businessId);
    const recipe = book.recipeById.get(input.recipeId);
    if (recipe === undefined) {
      throw new CommandError('not_found', `Recipe ${input.recipeId} not found`);
    }
    const portions = input.portions ?? recipe.portions;
    const factor = portions / recipe.portions;
    const declaration = declarationOf(recipe, book.declaration);
    const article = outputArticle(recipe, book);
    return {
      id: recipe.id,
      name: recipe.name,
      kind: recipe.kind,
      course: recipe.course,
      basePortions: recipe.portions,
      portions,
      ...defined({
        photo: recipe.photo,
        prepMinutes: recipe.prepMinutes,
        yieldText:
          recipe.output === undefined || article === undefined
            ? undefined
            : formatQuantity(recipe.output.quantity * factor, article.unit, { style: 'kitchen' }),
      }),
      ingredients: recipe.ingredients.map((ingredient) => {
        const known = book.articleById.get(ingredient.articleId);
        const unit = known?.unit ?? 'g';
        const quantity = roundQuantity(ingredient.quantity * factor);
        return {
          articleId: ingredient.articleId,
          name: known?.name ?? '',
          unit,
          quantity,
          quantityText: formatQuantity(quantity, unit, { style: 'kitchen' }),
          ...defined({ note: ingredient.note }),
        };
      }),
      steps: recipe.steps,
      allergens: declaration.allergens,
      traces: declaration.traces,
      diet: declaration.diet,
      declarationIncomplete:
        declaration.incomplete ||
        declaration.origins.some((origin) => origin.country === undefined),
      businessName: book.business.name,
    };
  };

  /**
   * The chain of names by which `from` (a recipe) reaches the recipe `target` through the
   * components among its ingredients, or undefined when it does not.
   */
  function pathTo(
    from: Pick<Recipe, 'id' | 'ingredients'>,
    target: Id,
    book: Pick<Book, 'articleById' | 'recipeById'>,
    seen: ReadonlySet<Id> = new Set([from.id]),
  ): string[] | undefined {
    for (const ingredient of from.ingredients) {
      const article = book.articleById.get(ingredient.articleId);
      if (article?.kind !== 'prepared' || article.recipeId === undefined) {
        continue;
      }
      if (article.recipeId === target) {
        return [article.name];
      }
      const sub = book.recipeById.get(article.recipeId);
      if (sub === undefined || seen.has(sub.id)) {
        continue;
      }
      const rest = pathTo(sub, target, book, new Set([...seen, sub.id]));
      if (rest !== undefined) {
        return [article.name, ...rest];
      }
    }
    return undefined;
  }

  const editor: UseCase<'recipes.editor'> = async (raw) => {
    const input = CONTRACT_V1['recipes.editor'].input.parse(raw);
    const book = await loadBook(input.businessId);
    const recipe = input.recipeId === undefined ? undefined : book.recipeById.get(input.recipeId);
    if (input.recipeId !== undefined && recipe === undefined) {
      throw new CommandError('not_found', `Recipe ${input.recipeId} not found`);
    }
    const components: BookRecipe[] = book.recipes
      .filter((row) => row.kind === 'component' && row.output !== undefined)
      .map((row) => ({
        id: row.id,
        name: row.name,
        portions: row.portions,
        ingredients: row.ingredients.map(({ articleId, quantity }) => ({ articleId, quantity })),
        ...(row.output === undefined ? {} : { output: row.output }),
        extraAllergens: row.extraAllergens,
        extraTraces: row.extraTraces,
      }));
    const loops: { articleId: Id; path: string[] }[] = [];
    if (recipe !== undefined) {
      for (const article of book.articles) {
        if (article.kind !== 'prepared' || article.recipeId === undefined) {
          continue;
        }
        if (article.recipeId === recipe.id) {
          loops.push({ articleId: article.id, path: [recipe.name, recipe.name] });
          continue;
        }
        const sub = book.recipeById.get(article.recipeId);
        const rest = sub === undefined ? undefined : pathTo(sub, recipe.id, book);
        if (rest !== undefined) {
          loops.push({
            articleId: article.id,
            path: [recipe.name, article.name, ...rest.slice(0, -1), recipe.name],
          });
        }
      }
    }
    const kindLock = recipe === undefined ? undefined : kindLockOf(recipe, book);
    return {
      ...(recipe === undefined ? {} : { recipe: fieldsOf(recipe, book) }),
      ...(kindLock === undefined ? {} : { kindLock }),
      unitLocked: recipe === undefined ? false : unitLocked(recipe, book),
      targetFoodCostBps: book.business.targetFoodCostBps,
      defaultVatBps: book.business.defaultVatBps,
      components,
      origins: book.articles
        .filter((article) => articleCategory(article.categoryId).declaresOrigin)
        .map((article) => ({
          articleId: article.id,
          categoryId: article.categoryId,
          ...(article.originCountry === undefined ? {} : { country: article.originCountry }),
        })),
      loops,
    };
  };

  // ── Writes ───────────────────────────────────────────────────────────────────────────────

  function assertFreeRecipeName(book: Book, name: string, except?: Id) {
    const key = nameKey(name);
    if (book.recipes.some((row) => row.id !== except && nameKey(row.name) === key)) {
      throw new CommandError('duplicate_name', `The name «${name}» is taken`);
    }
  }

  function assertFreeArticleName(book: Book, name: string, except?: Id) {
    const key = nameKey(name);
    if (book.articles.some((row) => row.id !== except && nameKey(row.name) === key)) {
      throw new CommandError('duplicate_name', `Article name «${name}» is taken`);
    }
  }

  /** Every ingredient is a live article of this business. */
  function assertIngredients(book: Book, ingredients: Recipe['ingredients']) {
    for (const ingredient of ingredients) {
      if (!book.articleById.has(ingredient.articleId)) {
        throw new CommandError('not_found', `Article ${ingredient.articleId} not found`);
      }
    }
  }

  /** The first cold area, where a component made in house is kept. */
  function coldArea(businessId: Id) {
    return storage.areas.ofBusiness(businessId).then(
      (rows) =>
        alive(rows)
          .filter((area) => area.kind === articleCategory('prepared').area)
          .sort((a, b) => a.sortOrder - b.sortOrder || byName(a, b))[0],
    );
  }

  /**
   * Allergens, traces and diet of every component's article, from its recipe (ADR-0008): the
   * article is what dishes and the menu card see. Repeated until nothing changes, so a
   * component inside a component follows too. Returns the articles that changed.
   */
  async function refreshDeclarations(book: Book): Promise<Id[]> {
    const changed = new Set<Id>();
    for (let pass = 0; pass <= book.recipes.length; pass += 1) {
      let moved = false;
      for (const recipe of book.recipes) {
        const article = outputArticle(recipe, book);
        if (recipe.kind !== 'component' || article === undefined) {
          continue;
        }
        const declaration = declarationOf(recipe, book.declaration);
        const next = {
          allergens: declaration.allergens,
          traces: declaration.traces,
          diet: declaration.diet,
        };
        if (
          same(next.allergens, article.allergens) &&
          same(next.traces, article.traces) &&
          next.diet === article.diet
        ) {
          continue;
        }
        const row = ArticleSchema.parse({ ...article, ...next, updatedAt: clock.now() });
        book.articleById.set(row.id, row);
        changed.add(row.id);
        moved = true;
      }
      if (!moved) {
        break;
      }
    }
    for (const articleId of changed) {
      const row = book.articleById.get(articleId);
      if (row !== undefined) {
        await storage.articles.put(row);
      }
    }
    return [...changed];
  }

  /** The row a draft becomes; `outputArticleId` is the article a component fills. */
  function recipeRow(
    base: Pick<Recipe, 'id' | 'businessId' | 'createdAt' | 'updatedAt'>,
    draft: Draft,
    outputArticleId: Id | undefined,
  ): Recipe {
    return RecipeSchema.parse({
      id: base.id,
      businessId: base.businessId,
      createdAt: base.createdAt,
      updatedAt: base.updatedAt,
      name: draft.name,
      kind: draft.kind,
      course: draft.course,
      portions: draft.portions,
      ingredients: draft.ingredients,
      steps: draft.steps,
      vatBps: draft.vatBps,
      extraAllergens: sortAllergens(draft.extraAllergens),
      extraTraces: sortAllergens(draft.extraTraces).filter(
        (id) => !draft.extraAllergens.includes(id),
      ),
      labels: [...new Set(draft.labels)],
      active: draft.active,
      ...defined({
        description: draft.description,
        prepMinutes: draft.prepMinutes,
        photo: draft.photo,
        // Only dishes are sold.
        priceRappen: draft.kind === 'dish' ? draft.priceRappen : undefined,
        shelfLifeDays: draft.shelfLifeDays,
        output:
          draft.kind !== 'component' || outputArticleId === undefined || draft.output === undefined
            ? undefined
            : { articleId: outputArticleId, quantity: draft.output.quantity },
      }),
    });
  }

  /** Puts a row into the book, so the checks after it see the state the command writes. */
  function rememberRecipe(book: Book, recipe: Recipe) {
    book.recipeById.set(recipe.id, recipe);
    book.recipes = [...book.recipes.filter((row) => row.id !== recipe.id), recipe];
  }

  function rememberArticle(book: Book, article: Article) {
    book.articleById.set(article.id, article);
    book.articles = [...book.articles.filter((row) => row.id !== article.id), article];
  }

  /**
   * Writes a recipe as the person decided it, with the article a component fills: created,
   * renamed, given its unit and shelf life, or let go when a component becomes a dish. Refuses
   * a recipe that would contain itself, naming the loop.
   */
  async function save(
    businessId: Id,
    book: Book,
    recipeId: Id,
    before: Recipe | undefined,
    draft: Draft,
  ): Promise<{ recipe: Recipe; articleId?: Id; articles: Id[] }> {
    assertFreeRecipeName(book, draft.name, recipeId);
    assertIngredients(book, draft.ingredients);
    const now = clock.now();
    const previous = before === undefined ? undefined : outputArticle(before, book);

    if (before !== undefined && before.kind !== draft.kind) {
      const lock = kindLockOf(before, book);
      if (lock !== undefined) {
        throw new CommandError('not_allowed', `The kind cannot change (${lock})`);
      }
    }

    let article: Article | undefined;
    if (draft.kind === 'component') {
      if (draft.output === undefined) {
        throw new CommandError('invalid', 'A component needs what one batch gives');
      }
      assertFreeArticleName(book, draft.name, previous?.id);
      if (previous === undefined) {
        const area = await coldArea(businessId);
        article = ArticleSchema.parse({
          id: ids.next(),
          businessId,
          ...stamps(),
          name: draft.name,
          kind: 'prepared',
          categoryId: 'prepared',
          unit: draft.output.unit,
          pricePer1000: 0,
          yieldBps: 10_000,
          allergens: [],
          traces: [],
          diet: 'vegan',
          dateKind: 'use_by',
          recipeId,
          active: true,
          ...defined({ areaId: area?.id, shelfLifeDays: draft.shelfLifeDays }),
        });
      } else {
        if (previous.unit !== draft.output.unit && before !== undefined) {
          if (unitLocked(before, book)) {
            throw new CommandError('not_allowed', 'The unit cannot change any more');
          }
        }
        const next: Record<string, unknown> = {
          ...previous,
          name: draft.name,
          unit: draft.output.unit,
          recipeId,
          updatedAt: now,
        };
        if (draft.shelfLifeDays === undefined) {
          Reflect.deleteProperty(next, 'shelfLifeDays');
        } else {
          next.shelfLifeDays = draft.shelfLifeDays;
        }
        article = ArticleSchema.parse(next);
      }
    }

    const recipe = recipeRow(
      { id: recipeId, businessId, createdAt: before?.createdAt ?? now, updatedAt: now },
      draft,
      article?.id,
    );

    rememberRecipe(book, recipe);
    if (article !== undefined) {
      rememberArticle(book, article);
    }
    const loop = pathTo(recipe, recipe.id, book);
    if (loop !== undefined) {
      throw new CommandError(
        'invalid',
        `The recipe would contain itself: ${[draft.name, ...loop.slice(0, -1), draft.name].join(' → ')}`,
      );
    }

    if (before === undefined) {
      await storage.recipes.add(recipe);
    } else {
      await storage.recipes.put(recipe);
    }
    if (article !== undefined) {
      if (previous === undefined) {
        await storage.articles.add(article);
      } else if (!same(previous, article)) {
        await storage.articles.put(article);
      }
    }
    // A component that became a dish lets its article go: nothing holds it any more.
    if (draft.kind === 'dish' && previous !== undefined) {
      const gone = ArticleSchema.parse({ ...previous, deletedAt: now, updatedAt: now });
      await storage.articles.put(gone);
      book.articleById.delete(gone.id);
      book.articles = book.articles.filter((row) => row.id !== gone.id);
    }
    const articles = await refreshDeclarations(book);
    return {
      recipe,
      ...(article === undefined ? {} : { articleId: article.id }),
      articles: [...new Set([...(article === undefined ? [] : [article.id]), ...articles])],
    };
  }

  const create: UseCase<'recipes.create'> = async (raw) => {
    const input = CONTRACT_V1['recipes.create'].input.parse(raw);
    return runCommand('recipes.create', input.commandId, async () => {
      const { businessId } = input;
      const book = await loadBook(businessId);
      const saved = await save(businessId, book, ids.next(), undefined, {
        name: input.name,
        kind: input.kind,
        course: input.course,
        portions: input.portions,
        ingredients: input.ingredients,
        steps: input.steps,
        vatBps: input.vatBps ?? book.business.defaultVatBps,
        extraAllergens: input.extraAllergens,
        extraTraces: input.extraTraces,
        labels: input.labels,
        active: input.active,
        description: input.description,
        prepMinutes: input.prepMinutes,
        photo: input.photo,
        priceRappen: input.priceRappen,
        shelfLifeDays: input.shelfLifeDays,
        output: input.output,
      });
      await emit(businessId, 'recipe.created', {
        recipeId: saved.recipe.id,
        kind: saved.recipe.kind,
        ...defined({ articleId: saved.articleId }),
      });
      return { recipeId: saved.recipe.id, ...defined({ articleId: saved.articleId }) };
    });
  };

  /** A value replaces, null clears, undefined keeps what was there. */
  const pick = <TValue>(value: TValue | null | undefined, current: TValue | undefined) =>
    value === null ? undefined : (value ?? current);

  const update: UseCase<'recipes.update'> = async (raw) => {
    const input = CONTRACT_V1['recipes.update'].input.parse(raw);
    return runCommand('recipes.update', input.commandId, async () => {
      const { businessId } = input;
      const book = await loadBook(businessId);
      const row = book.recipeById.get(input.recipeId);
      if (row === undefined) {
        throw new CommandError('not_found', `Recipe ${input.recipeId} not found`);
      }
      const previous = outputArticle(row, book);
      const kind = input.kind ?? row.kind;
      const output =
        kind === 'component'
          ? (input.output ??
            (row.output === undefined || previous === undefined
              ? undefined
              : { quantity: row.output.quantity, unit: previous.unit }))
          : undefined;
      const draft: Draft = {
        name: input.name ?? row.name,
        kind,
        course: input.course ?? row.course,
        portions: input.portions ?? row.portions,
        ingredients: input.ingredients ?? row.ingredients,
        steps: input.steps ?? row.steps,
        vatBps: input.vatBps ?? row.vatBps,
        extraAllergens: input.extraAllergens ?? row.extraAllergens,
        extraTraces: input.extraTraces ?? row.extraTraces,
        labels: input.labels ?? row.labels,
        active: input.active ?? row.active,
        description: pick(input.description, row.description),
        prepMinutes: pick(input.prepMinutes, row.prepMinutes),
        photo: pick(input.photo, row.photo),
        priceRappen: pick(input.priceRappen, row.priceRappen),
        shelfLifeDays: pick(input.shelfLifeDays, row.shelfLifeDays),
        output,
      };
      const candidate = recipeRow(row, draft, previous?.id);
      const changed = RECIPE_FIELDS.filter((field) => !same(row[field], candidate[field]));
      if (
        kind === 'component' &&
        (output?.quantity !== row.output?.quantity || output?.unit !== previous?.unit)
      ) {
        changed.push('output');
      }
      if (changed.length === 0) {
        return { recipeId: row.id, changed: [], ...defined({ articleId: previous?.id }) };
      }
      const saved = await save(businessId, book, row.id, row, draft);
      await emit(businessId, 'recipe.updated', {
        recipeId: row.id,
        fields: changed,
        ...defined({ articleId: saved.articleId }),
        ...(saved.articles.length === 0 ? {} : { articlesRefreshed: saved.articles }),
      });
      return { recipeId: row.id, changed, ...defined({ articleId: saved.articleId }) };
    });
  };

  const setPrice: UseCase<'recipes.setPrice'> = async (raw) => {
    const input = CONTRACT_V1['recipes.setPrice'].input.parse(raw);
    return runCommand('recipes.setPrice', input.commandId, async () => {
      const row = await requireRow(storage.recipes, input.businessId, input.recipeId, 'Recipe');
      if (row.kind !== 'dish') {
        throw new CommandError('not_allowed', 'Only dishes have a menu price');
      }
      const price = input.priceRappen ?? undefined;
      if (row.priceRappen !== price) {
        const next: Record<string, unknown> = { ...row, updatedAt: clock.now() };
        if (price === undefined) {
          Reflect.deleteProperty(next, 'priceRappen');
        } else {
          next.priceRappen = price;
        }
        await storage.recipes.put(RecipeSchema.parse(next));
        await emit(input.businessId, 'recipe.price_set', {
          recipeId: row.id,
          priceRappen: price ?? null,
          ...(row.priceRappen === undefined ? {} : { previousRappen: row.priceRappen }),
        });
      }
      return { recipeId: row.id, ...defined({ priceRappen: price }) };
    });
  };

  /** «Rotweinjus (Kopie)», then «Rotweinjus (Kopie 2)» …, free as a recipe and as an article. */
  function copyName(book: Book, name: string, needsArticle: boolean): string {
    const taken = (candidate: string) => {
      const key = nameKey(candidate);
      return (
        book.recipes.some((row) => nameKey(row.name) === key) ||
        (needsArticle && book.articles.some((row) => nameKey(row.name) === key))
      );
    };
    for (let number = 1; ; number += 1) {
      const suffix = number === 1 ? ` (${COPY_WORD})` : ` (${COPY_WORD} ${String(number)})`;
      const base = name.slice(0, NAME_MAX - suffix.length).trimEnd();
      const candidate = `${base}${suffix}`;
      if (!taken(candidate)) {
        return candidate;
      }
    }
  }

  const duplicate: UseCase<'recipes.duplicate'> = async (raw) => {
    const input = CONTRACT_V1['recipes.duplicate'].input.parse(raw);
    return runCommand('recipes.duplicate', input.commandId, async () => {
      const { businessId } = input;
      const book = await loadBook(businessId);
      const row = book.recipeById.get(input.recipeId);
      if (row === undefined) {
        throw new CommandError('not_found', `Recipe ${input.recipeId} not found`);
      }
      const article = outputArticle(row, book);
      const name = copyName(book, row.name, row.kind === 'component');
      const saved = await save(businessId, book, ids.next(), undefined, {
        name,
        kind: row.kind,
        course: row.course,
        portions: row.portions,
        ingredients: row.ingredients,
        steps: row.steps,
        vatBps: row.vatBps,
        extraAllergens: row.extraAllergens,
        extraTraces: row.extraTraces,
        labels: row.labels,
        active: row.active,
        description: row.description,
        prepMinutes: row.prepMinutes,
        photo: row.photo,
        priceRappen: row.priceRappen,
        shelfLifeDays: row.shelfLifeDays,
        output:
          row.output === undefined || article === undefined
            ? undefined
            : { quantity: row.output.quantity, unit: article.unit },
      });
      await emit(businessId, 'recipe.duplicated', {
        recipeId: saved.recipe.id,
        fromRecipeId: row.id,
        ...defined({ articleId: saved.articleId }),
      });
      return { recipeId: saved.recipe.id, name, ...defined({ articleId: saved.articleId }) };
    });
  };

  const setActive: UseCase<'recipes.setActive'> = async (raw) => {
    const input = CONTRACT_V1['recipes.setActive'].input.parse(raw);
    return runCommand('recipes.setActive', input.commandId, async () => {
      const row = await requireRow(storage.recipes, input.businessId, input.recipeId, 'Recipe');
      if (row.active !== input.active) {
        await storage.recipes.put(
          RecipeSchema.parse({ ...row, active: input.active, updatedAt: clock.now() }),
        );
        await emit(input.businessId, input.active ? 'recipe.activated' : 'recipe.deactivated', {
          recipeId: row.id,
        });
      }
      return { recipeId: row.id, active: input.active };
    });
  };

  const remove: UseCase<'recipes.delete'> = async (raw) => {
    const input = CONTRACT_V1['recipes.delete'].input.parse(raw);
    return runCommand('recipes.delete', input.commandId, async () => {
      const { businessId } = input;
      const book = await loadBook(businessId);
      const row = book.recipeById.get(input.recipeId);
      if (row === undefined) {
        throw new CommandError('not_found', `Recipe ${input.recipeId} not found`);
      }
      const blockers = blockersOf(row, book);
      if (blockers.menuCards.length > 0) {
        throw new CommandError('in_use', 'The recipe is on a menu card');
      }
      if (blockers.planEntries > 0) {
        throw new CommandError('in_use', 'The recipe is in the menu plan');
      }
      if (blockers.recipes.length > 0) {
        throw new CommandError('in_use', 'A recipe uses the component');
      }
      if (blockers.stock > 0) {
        throw new CommandError('in_use', 'The component is in stock');
      }
      const now = clock.now();
      await storage.recipes.put(RecipeSchema.parse({ ...row, deletedAt: now, updatedAt: now }));
      const article = outputArticle(row, book);
      let released: Id | undefined;
      if (article !== undefined) {
        const orders = alive(await storage.orders.ofBusiness(businessId));
        const ordered = orders.some(
          (order) =>
            (order.status === 'draft' || order.status === 'sent') &&
            order.lines.some((line) => line.articleId === article.id),
        );
        if (!ordered) {
          await storage.articles.put(
            ArticleSchema.parse({ ...article, deletedAt: now, updatedAt: now }),
          );
          released = article.id;
        }
      }
      await emit(businessId, 'recipe.deleted', {
        recipeId: row.id,
        ...defined({ articleId: released }),
      });
      return { recipeId: row.id, ...defined({ articleId: released }) };
    });
  };

  return {
    'recipes.list': list,
    'recipes.get': get,
    'recipes.card': card,
    'recipes.editor': editor,
    'recipes.create': create,
    'recipes.update': update,
    'recipes.setPrice': setPrice,
    'recipes.duplicate': duplicate,
    'recipes.setActive': setActive,
    'recipes.delete': remove,
  };
}
