import {
  declarationOf,
  dishFigures,
  effectiveUnitPrice,
  IdSchema,
  netOfVat,
  foodCostBps,
  recipeCost,
  sortAllergens,
  type AllergenId,
  type ArticleRef,
  type BookRecipe,
  type CostBook,
  type Declaration,
  type DeclarationBook,
  type DeclaredArticle,
  type DishFigures,
  type Id,
  type Rappen,
  type RecipeCost,
  type Unit,
} from '@randen/core';

/** The ids the form costs a recipe and its article under before they are saved. */
export const NEW_RECIPE_ID: Id = IdSchema.parse('01900000-0000-7000-8000-000000000000');
export const NEW_ARTICLE_ID: Id = IdSchema.parse('01900000-0000-7000-8000-000000000001');

/** The recipe on the form, as far as it can be costed and declared. */
export interface LiveRecipe {
  id: Id;
  portions: number;
  ingredients: readonly { articleId: Id; quantity: number }[];
  extraAllergens: readonly AllergenId[];
  extraTraces: readonly AllergenId[];
  output?: { articleId: Id; quantity: number } | undefined;
}

export interface LiveBooks {
  cost: CostBook;
  declaration: DeclarationBook;
}

/**
 * The books of the domain functions from what the form has read: the articles of the lookup
 * (with their origins) and the component recipes, so costs and allergens follow components
 * while the person types.
 */
export function liveBooks(
  articles: readonly ArticleRef[],
  components: readonly BookRecipe[],
  origins: readonly { articleId: Id; country?: string | undefined }[],
): LiveBooks {
  const countries = new Map(origins.map((origin) => [origin.articleId, origin.country]));
  const declared = new Map<Id, DeclaredArticle>(
    articles.map((article) => [
      article.id,
      { ...article, originCountry: countries.get(article.id) },
    ]),
  );
  const recipes = new Map(components.map((recipe) => [recipe.id, recipe]));
  return {
    cost: { articles: new Map(articles.map((article) => [article.id, article])), recipes },
    declaration: { articles: declared, recipes },
  };
}

export interface LiveFigures {
  cost: RecipeCost;
  declaration: Declaration;
  /** Only for a dish. */
  figures: DishFigures | undefined;
  /** The share of goods at the suggested price. */
  suggestedShareBps: number | undefined;
  /** A component: what 1000 base units of its output cost; undefined while a price is missing. */
  costPer1000: number | undefined;
  /** What each ingredient line brings, for «Aus den Zutaten». */
  sources: { allergen: AllergenId; trace: boolean; from: string[] }[];
}

/** Cost, declaration and the figures of a dish for the recipe as it stands on the form. */
export function liveFigures(
  recipe: LiveRecipe,
  books: LiveBooks,
  options: {
    dish?: { priceRappen: Rappen | null; vatBps: number; targetFoodCostBps: number } | undefined;
    outputUnit?: Unit | undefined;
  },
): LiveFigures {
  const { dish, outputUnit } = options;
  // The recipe on the form replaces its stored version, so a component costs as typed.
  const recipes = new Map(books.cost.recipes);
  if (recipe.output !== undefined) {
    recipes.set(recipe.id, {
      id: recipe.id,
      portions: recipe.portions,
      ingredients: recipe.ingredients,
      output: recipe.output,
    });
  }
  const cost = recipeCost(recipe, { ...books.cost, recipes });
  const costPer1000 =
    recipe.output === undefined || outputUnit === undefined
      ? undefined
      : effectiveUnitPrice(
          {
            id: recipe.output.articleId,
            kind: 'prepared',
            unit: outputUnit,
            pricePer1000: 0,
            yieldBps: 10_000,
            recipeId: recipe.id,
          },
          { ...books.cost, recipes },
        );
  const declaration = declarationOf(recipe, books.declaration);
  const figures =
    dish === undefined
      ? undefined
      : dishFigures({
          costPerPortion: cost.perPortionRappen,
          priceRappen: dish.priceRappen ?? undefined,
          vatBps: dish.vatBps,
          targetFoodCostBps: dish.targetFoodCostBps,
          costIncomplete: cost.missingPrices.length > 0 || recipe.ingredients.length === 0,
        });
  const suggestedShareBps =
    figures?.suggestedPriceRappen === undefined || dish === undefined
      ? undefined
      : foodCostBps(cost.perPortionRappen, netOfVat(figures.suggestedPriceRappen, dish.vatBps));
  return {
    cost,
    declaration,
    figures,
    suggestedShareBps,
    costPer1000,
    sources: sourcesOf(recipe, books.declaration),
  };
}

/** Which ingredient brings which allergen: a component with everything inside it. */
function sourcesOf(recipe: LiveRecipe, book: DeclarationBook) {
  const lines = recipe.ingredients.map((ingredient) => {
    const article = book.articles.get(ingredient.articleId);
    if (article === undefined) {
      return { name: '', allergens: [] as AllergenId[], traces: [] as AllergenId[] };
    }
    const sub =
      article.kind === 'prepared' && article.recipeId !== undefined
        ? book.recipes.get(article.recipeId)
        : undefined;
    const inner = sub === undefined || sub.id === recipe.id ? undefined : declarationOf(sub, book);
    return {
      name: article.name,
      allergens: [...article.allergens, ...(inner?.allergens ?? [])],
      traces: [...article.traces, ...(inner?.traces ?? [])],
    };
  });
  const contained = sortAllergens(lines.flatMap((line) => line.allergens));
  const traces = sortAllergens(lines.flatMap((line) => line.traces)).filter(
    (id) => !contained.includes(id),
  );
  const from = (allergen: AllergenId, trace: boolean) => [
    ...new Set(
      lines
        .filter((line) => (trace ? line.traces : line.allergens).includes(allergen))
        .map((line) => line.name),
    ),
  ];
  return [
    ...contained.map((allergen) => ({ allergen, trace: false, from: from(allergen, false) })),
    ...traces.map((allergen) => ({ allergen, trace: true, from: from(allergen, true) })),
  ];
}
