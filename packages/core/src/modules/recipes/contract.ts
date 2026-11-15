import { z } from 'zod';
import {
  command,
  commandBase,
  query,
  queryBase,
  type ContractFragment,
} from '../../contract/operation';
import { AllergenIdSchema, DietSchema } from '../../domain/allergens';
import { ArticleCategoryIdSchema } from '../../domain/categories';
import { IdSchema } from '../../ids';
import { RappenSchema } from '../../money';
import { ArticleKindSchema, UnitPriceSchema } from '../../model/article';
import {
  BpsSchema,
  CountryCodeSchema,
  PhotoSchema,
  PositiveQuantitySchema,
  QuantitySchema,
  UnitSchema,
} from '../../model/primitives';
import {
  CourseSchema,
  DishLabelSchema,
  RecipeIngredientSchema,
  RecipeKindSchema,
  RecipeSchema,
} from '../../model/recipe';

/** How a dish stands against the target of the business (`domain/costing.ts`). */
export const MarginStatusSchema = z.enum(['good', 'watch', 'over', 'unknown']);

/** The four views of the recipe book. `all` are the active recipes. */
export const RecipeListFilterSchema = z.enum(['all', 'over_target', 'incomplete', 'inactive']);
export type RecipeListFilter = z.infer<typeof RecipeListFilterSchema>;

/**
 * What keeps the numbers or the declaration of a recipe from being complete (ADR-0008):
 * `ingredients` none yet · `cost` an ingredient without a price · `declaration` an ingredient
 * that is gone, or a loop · `origin` meat or fish without its country · `price` a dish without
 * a menu price.
 */
export const RecipeGapSchema = z.enum(['ingredients', 'cost', 'declaration', 'origin', 'price']);
export type RecipeGap = z.infer<typeof RecipeGapSchema>;

/** Portions to scale to: a whole number, as a kitchen cooks. */
const PortionsSchema = z.int().min(1).max(10_000);

/** One card of the recipe book: names and numbers already joined. */
export const RecipeListRowSchema = z.object({
  id: IdSchema,
  name: z.string(),
  kind: RecipeKindSchema,
  course: CourseSchema,
  photo: PhotoSchema.optional(),
  portions: z.int(),
  /** Menu price with VAT; only dishes have one. */
  priceRappen: RappenSchema.optional(),
  /** Goods of one portion (a component: of one batch), at today's prices. */
  costPerPortionRappen: RappenSchema,
  foodCostBps: z.int().optional(),
  marginRappen: RappenSchema.optional(),
  status: MarginStatusSchema,
  /** A component: what one batch gives and what a kilo, litre or 1000 pieces of it cost. */
  output: z
    .object({
      articleId: IdSchema,
      quantity: QuantitySchema,
      unit: UnitSchema,
      /** 0 while a price of an ingredient is missing. */
      costPer1000: UnitPriceSchema,
    })
    .optional(),
  allergens: z.array(AllergenIdSchema),
  traces: z.array(AllergenIdSchema),
  diet: DietSchema,
  gaps: z.array(RecipeGapSchema),
  /** Cost or declaration not complete: never show these numbers as if they were. */
  incomplete: z.boolean(),
  active: z.boolean(),
});
export type RecipeListRow = z.infer<typeof RecipeListRowSchema>;

/** One ingredient line, joined with its article and scaled to the portions asked for. */
export const RecipeLineSchema = z.object({
  /** Position in the recipe, from 0. */
  index: z.int(),
  articleId: IdSchema,
  /** False when the article was deleted: the line then counts as unknown. */
  known: z.boolean(),
  name: z.string(),
  articleKind: ArticleKindSchema,
  unit: UnitSchema,
  note: z.string().optional(),
  /** Net quantity as written for one batch, and what leaves the stock for it. */
  quantity: QuantitySchema,
  grossQuantity: QuantitySchema,
  yieldBps: BpsSchema,
  /** Net and gross for the portions asked for. */
  scaledQuantity: QuantitySchema,
  scaledGrossQuantity: QuantitySchema,
  /** The price costing uses (the last purchase, or for a component its recipe); 0 = missing. */
  pricePer1000: UnitPriceSchema,
  /** Cost of the line for one batch, and for the portions asked for. */
  costRappen: RappenSchema,
  scaledCostRappen: RappenSchema,
  priceMissing: z.boolean(),
  allergens: z.array(AllergenIdSchema),
  traces: z.array(AllergenIdSchema),
  /** A component made in house: the recipe behind it. */
  componentRecipeId: IdSchema.optional(),
  /** What may be used today (lots past their Verbrauchsdatum left out). */
  usableStock: QuantitySchema,
});
export type RecipeLine = z.infer<typeof RecipeLineSchema>;

export const OriginRowSchema = z.object({
  articleId: IdSchema,
  name: z.string(),
  country: CountryCodeSchema.optional(),
  countryName: z.string().optional(),
});

/** What a recipe declares, derived from its ingredients through every component. */
export const RecipeDeclarationSchema = z.object({
  allergens: z.array(AllergenIdSchema),
  traces: z.array(AllergenIdSchema),
  diet: DietSchema,
  origins: z.array(OriginRowSchema),
  /** Where each allergen comes from: ingredient names, or `extra` for what the recipe adds. */
  sources: z.array(
    z.object({
      allergen: AllergenIdSchema,
      trace: z.boolean(),
      from: z.array(z.string()),
      extra: z.boolean(),
    }),
  ),
  /** True when an ingredient is unknown, a loop hides something or an origin is missing. */
  incomplete: z.boolean(),
  /** Ingredients that are gone; meat and fish without a country are in `origins`. */
  unknownIngredients: z.int(),
  loop: z.boolean(),
});
export type RecipeDeclaration = z.infer<typeof RecipeDeclarationSchema>;

/** One dish in a price what-if: its food cost share and status now and after the change. */
export const PriceChangeFiguresSchema = z.object({
  costPerPortionRappen: RappenSchema,
  foodCostBps: z.int().optional(),
  status: MarginStatusSchema,
});

export const PriceChangeDishSchema = z.object({
  id: IdSchema,
  name: z.string(),
  /** The cost of one portion differs after the change. */
  changed: z.boolean(),
  before: PriceChangeFiguresSchema,
  after: PriceChangeFiguresSchema,
});
export type PriceChangeDishRow = z.infer<typeof PriceChangeDishSchema>;

/** The numbers of a dish at its menu price, and the price that meets the target. */
export const DishFiguresSchema = z.object({
  priceRappen: RappenSchema.optional(),
  vatBps: BpsSchema,
  netRappen: RappenSchema.optional(),
  vatRappen: RappenSchema.optional(),
  marginRappen: RappenSchema.optional(),
  foodCostBps: z.int().optional(),
  status: MarginStatusSchema,
  targetFoodCostBps: BpsSchema,
  suggestedPriceRappen: RappenSchema.optional(),
  /** The share of goods at the suggested price. */
  suggestedFoodCostBps: z.int().optional(),
});
export type DishFiguresView = z.infer<typeof DishFiguresSchema>;

/** How far the usable stock reaches. */
export const AvailabilitySchema = z.object({
  /** Whole portions (a component: batches) the usable stock covers; undefined without ingredients. */
  portionsCovered: z.int().optional(),
  /** The ingredients that run short first. */
  limiting: z.array(z.object({ articleId: IdSchema, name: z.string() })),
  /** What is short for the portions asked for, gross. */
  short: z.array(
    z.object({
      articleId: IdSchema,
      name: z.string(),
      unit: UnitSchema,
      needed: QuantitySchema,
      usable: QuantitySchema,
      missing: QuantitySchema,
    }),
  ),
});

/** Where a recipe is held: what keeps it from being deleted. */
export const RecipeBlockersSchema = z.object({
  menuCards: z.array(z.string()),
  /** Entries of the menu plan from today on that are not produced yet. */
  planEntries: z.int(),
  /** Live recipes that use the article of a component. */
  recipes: z.array(z.object({ recipeId: IdSchema, name: z.string() })),
  /** Stock of the article of a component. */
  stock: QuantitySchema,
});
export type RecipeBlockers = z.infer<typeof RecipeBlockersSchema>;

/** Fields of a recipe the form edits, as stored (without the sync fields). */
const RecipeFieldsSchema = z.object({
  id: IdSchema,
  name: z.string(),
  kind: RecipeKindSchema,
  course: CourseSchema,
  description: z.string().optional(),
  portions: z.int(),
  ingredients: z.array(RecipeIngredientSchema),
  steps: z.array(z.string()),
  prepMinutes: z.int().optional(),
  photo: PhotoSchema.optional(),
  priceRappen: RappenSchema.optional(),
  vatBps: BpsSchema,
  extraAllergens: z.array(AllergenIdSchema),
  extraTraces: z.array(AllergenIdSchema),
  labels: z.array(DishLabelSchema),
  shelfLifeDays: z.int().optional(),
  active: z.boolean(),
  /** A component: the article it fills, its unit and what one batch gives. */
  output: z
    .object({
      articleId: IdSchema,
      name: z.string(),
      unit: UnitSchema,
      quantity: QuantitySchema,
    })
    .optional(),
});

/** A component recipe as the domain functions need it, for live numbers on the form. */
export const BookRecipeSchema = z.object({
  id: IdSchema,
  name: z.string(),
  portions: z.int(),
  ingredients: z.array(z.object({ articleId: IdSchema, quantity: QuantitySchema })),
  output: z.object({ articleId: IdSchema, quantity: QuantitySchema }).optional(),
  extraAllergens: z.array(AllergenIdSchema),
  extraTraces: z.array(AllergenIdSchema),
});
export type BookRecipe = z.infer<typeof BookRecipeSchema>;

/** Why the kind of a recipe can no longer change. */
export const KindLockSchema = z.enum(['stock', 'used', 'menu']);
export type KindLock = z.infer<typeof KindLockSchema>;

/** The output of a component as a command takes it: the article is made by the command. */
const OutputInputSchema = z.object({ quantity: PositiveQuantitySchema, unit: UnitSchema });

const recipeInputFields = {
  name: RecipeSchema.shape.name,
  kind: RecipeKindSchema,
  course: CourseSchema,
  portions: RecipeSchema.shape.portions,
  ingredients: RecipeSchema.shape.ingredients,
  steps: RecipeSchema.shape.steps,
  vatBps: BpsSchema.max(3000),
  extraAllergens: RecipeSchema.shape.extraAllergens,
  extraTraces: RecipeSchema.shape.extraTraces,
  labels: RecipeSchema.shape.labels,
  active: z.boolean(),
};

/** Optional fields; in `recipes.update`, null clears them. */
const recipeOptionalFields = {
  description: RecipeSchema.shape.description.unwrap(),
  prepMinutes: RecipeSchema.shape.prepMinutes.unwrap(),
  photo: PhotoSchema,
  priceRappen: RappenSchema.min(0),
  shelfLifeDays: RecipeSchema.shape.shelfLifeDays.unwrap(),
  output: OutputInputSchema,
};

const RecipeCommandResultSchema = z.object({
  recipeId: IdSchema,
  /** A component: the article it fills. */
  articleId: IdSchema.optional(),
});

/**
 * The recipe book of the kitchen («Rezepte»): dishes sold by the portion and components made
 * in house. Cost, margin, allergens, diet and origin are computed from the ingredients at
 * every read (ADR-0008); only what the person says is stored.
 */
export const recipesContract = {
  'recipes.list': query({
    name: 'recipes.list',
    summary: {
      de: 'Rezepte mit Foto, Preis, Wareneinsatz, Marge, Allergenen und offenen Angaben auflisten.',
      en: 'List recipes with photo, price, food cost, margin, allergens and what is still missing.',
    },
    scopes: ['recipes:read'],
    input: z.object({
      ...queryBase,
      search: z.string().max(120).optional(),
      kind: RecipeKindSchema.optional(),
      course: CourseSchema.optional(),
      filter: RecipeListFilterSchema.default('all'),
    }),
    output: z.object({
      rows: z.array(RecipeListRowSchema),
      /** How many recipes each view holds, for the search, kind and course chosen. */
      counts: z.object({
        all: z.int(),
        over_target: z.int(),
        incomplete: z.int(),
        inactive: z.int(),
      }),
      /** Courses that occur among the recipes of the kind chosen, with their number. */
      courses: z.array(z.object({ course: CourseSchema, count: z.int() })),
      /** Live recipes per kind: 0 of both means the book is empty. */
      kinds: z.object({ dish: z.int(), component: z.int() }),
      targetFoodCostBps: BpsSchema,
    }),
  }),
  'recipes.get': query({
    name: 'recipes.get',
    summary: {
      de: 'Ein Rezept mit Zutaten, Kalkulation, Deklaration, Verfügbarkeit und Verwendung lesen.',
      en: 'Read one recipe with ingredients, costing, declaration, availability and use.',
    },
    scopes: ['recipes:read'],
    input: z.object({ ...queryBase, recipeId: IdSchema, portions: PortionsSchema.optional() }),
    output: z.object({
      recipe: RecipeFieldsSchema,
      /** The portions asked for (default: the batch of the recipe). */
      portions: z.int(),
      lines: z.array(RecipeLineSchema),
      cost: z.object({
        totalRappen: RappenSchema,
        perPortionRappen: RappenSchema,
        /** For the portions asked for. */
        scaledRappen: RappenSchema,
        missingPrices: z.array(z.object({ articleId: IdSchema, name: z.string() })),
      }),
      /** Only for a dish. */
      figures: DishFiguresSchema.optional(),
      declaration: RecipeDeclarationSchema,
      availability: AvailabilitySchema,
      /** Only for a component: the article it fills and where it is used. */
      component: z
        .object({
          articleId: IdSchema,
          articleName: z.string(),
          unit: UnitSchema,
          outputQuantity: QuantitySchema,
          /** Cost per kilo, litre or 1000 pieces of output; 0 while a price is missing. */
          costPer1000: UnitPriceSchema,
          /** The last production cost stored on the article; 0 = not produced yet. */
          lastPricePer1000: UnitPriceSchema,
          stock: QuantitySchema,
          usedIn: z.array(
            z.object({
              recipeId: IdSchema,
              name: z.string(),
              kind: RecipeKindSchema,
              quantity: QuantitySchema,
              portions: z.int(),
              active: z.boolean(),
            }),
          ),
        })
        .optional(),
      gaps: z.array(RecipeGapSchema),
      blockers: RecipeBlockersSchema,
      /** Set when the kind can no longer change. */
      kindLock: KindLockSchema.optional(),
      businessName: z.string(),
    }),
  }),
  'recipes.card': query({
    name: 'recipes.card',
    summary: {
      de: 'Die Kochansicht: Zutaten auf die Portionen umgerechnet, Schritte, Allergene, Foto.',
      en: 'The cook view: ingredients scaled to the portions, steps, allergens, photo.',
    },
    scopes: ['recipes:read'],
    input: z.object({ ...queryBase, recipeId: IdSchema, portions: PortionsSchema.optional() }),
    output: z.object({
      id: IdSchema,
      name: z.string(),
      kind: RecipeKindSchema,
      course: CourseSchema,
      photo: PhotoSchema.optional(),
      /** The batch the recipe is written for, and the portions shown. */
      basePortions: z.int(),
      portions: z.int(),
      prepMinutes: z.int().optional(),
      /** A component: what the scaled batch gives, as the kitchen writes it. */
      yieldText: z.string().optional(),
      ingredients: z.array(
        z.object({
          articleId: IdSchema,
          name: z.string(),
          unit: UnitSchema,
          /** Net quantity for the portions shown. */
          quantity: QuantitySchema,
          /** «2.5 dl», «1.8 kg», «4 Stk.» */
          quantityText: z.string(),
          note: z.string().optional(),
        }),
      ),
      steps: z.array(z.string()),
      allergens: z.array(AllergenIdSchema),
      traces: z.array(AllergenIdSchema),
      diet: DietSchema,
      declarationIncomplete: z.boolean(),
      businessName: z.string(),
    }),
  }),
  'recipes.editor': query({
    name: 'recipes.editor',
    summary: {
      de: 'Was das Rezeptformular braucht: das Rezept, Zielwerte des Betriebs und die Komponenten für die laufende Kalkulation.',
      en: 'What the recipe form needs: the recipe, the targets of the business and the components for live costing.',
    },
    scopes: ['recipes:read'],
    input: z.object({ ...queryBase, recipeId: IdSchema.optional() }),
    output: z.object({
      recipe: RecipeFieldsSchema.optional(),
      kindLock: KindLockSchema.optional(),
      /** The unit of the component's article can no longer change (stock or recipes use it). */
      unitLocked: z.boolean(),
      targetFoodCostBps: BpsSchema,
      defaultVatBps: BpsSchema,
      /** Live component recipes, so cost and declaration can follow components on the form. */
      components: z.array(BookRecipeSchema),
      /** Meat and fish with their country, for the declaration on the form. */
      origins: z.array(
        z.object({
          articleId: IdSchema,
          categoryId: ArticleCategoryIdSchema,
          country: CountryCodeSchema.optional(),
        }),
      ),
      /** Components that already contain this recipe: picking one would make a loop. */
      loops: z.array(z.object({ articleId: IdSchema, path: z.array(z.string()) })),
    }),
  }),
  'recipes.priceChange': query({
    name: 'recipes.priceChange',
    summary: {
      de: 'Durchrechnen, was eine Preisänderung eines Artikels mit den Gerichten macht: Wareneinsatz und Ampel vorher und nachher. Nichts wird gespeichert.',
      en: 'What a price change of an article does to the dishes: food cost and status before and after. Nothing is stored.',
    },
    scopes: ['recipes:read'],
    input: z.object({
      ...queryBase,
      articleId: IdSchema,
      /** Basis points: 1500 is +15 %, -1000 is -10 %. */
      percentBps: z.int().min(-9000).max(30000),
    }),
    output: z.object({
      article: z.object({
        id: IdSchema,
        name: z.string(),
        unit: UnitSchema,
        pricePer1000: UnitPriceSchema,
        newPricePer1000: UnitPriceSchema,
      }),
      /** The active dishes that use the article, directly or through a component. */
      dishes: z.array(PriceChangeDishSchema),
      summary: z.object({
        using: z.int(),
        /** Good → watch or over, watch → over. */
        worse: z.int(),
        better: z.int(),
      }),
    }),
  }),
  'recipes.create': command({
    name: 'recipes.create',
    summary: {
      de: 'Ein Rezept erfassen; eine Komponente legt den Artikel an, den sie füllt.',
      en: 'Create a recipe; a component creates the article it fills.',
    },
    scopes: ['recipes:write'],
    input: z.object({
      ...commandBase,
      ...recipeInputFields,
      extraAllergens: recipeInputFields.extraAllergens.default([]),
      extraTraces: recipeInputFields.extraTraces.default([]),
      labels: recipeInputFields.labels.default([]),
      steps: recipeInputFields.steps.default([]),
      active: recipeInputFields.active.default(true),
      /** Default: the VAT of the business. */
      vatBps: recipeInputFields.vatBps.optional(),
      description: recipeOptionalFields.description.optional(),
      prepMinutes: recipeOptionalFields.prepMinutes.optional(),
      photo: recipeOptionalFields.photo.optional(),
      priceRappen: recipeOptionalFields.priceRappen.optional(),
      shelfLifeDays: recipeOptionalFields.shelfLifeDays.optional(),
      output: recipeOptionalFields.output.optional(),
    }),
    output: RecipeCommandResultSchema,
  }),
  'recipes.update': command({
    name: 'recipes.update',
    summary: {
      de: 'Ein Rezept ändern; der Artikel einer Komponente folgt mit Name, Einheit, Haltbarkeit und Allergenen. Null leert ein freiwilliges Feld.',
      en: 'Change a recipe; the article of a component follows with name, unit, shelf life and allergens. Null clears an optional field.',
    },
    scopes: ['recipes:write'],
    input: z.object({
      ...commandBase,
      recipeId: IdSchema,
      name: recipeInputFields.name.optional(),
      kind: recipeInputFields.kind.optional(),
      course: recipeInputFields.course.optional(),
      portions: recipeInputFields.portions.optional(),
      ingredients: recipeInputFields.ingredients.optional(),
      steps: recipeInputFields.steps.optional(),
      vatBps: recipeInputFields.vatBps.optional(),
      extraAllergens: recipeInputFields.extraAllergens.optional(),
      extraTraces: recipeInputFields.extraTraces.optional(),
      labels: recipeInputFields.labels.optional(),
      active: recipeInputFields.active.optional(),
      description: recipeOptionalFields.description.nullable().optional(),
      prepMinutes: recipeOptionalFields.prepMinutes.nullable().optional(),
      photo: recipeOptionalFields.photo.nullable().optional(),
      priceRappen: recipeOptionalFields.priceRappen.nullable().optional(),
      shelfLifeDays: recipeOptionalFields.shelfLifeDays.nullable().optional(),
      output: recipeOptionalFields.output.optional(),
    }),
    output: RecipeCommandResultSchema.extend({ changed: z.array(z.string()) }),
  }),
  'recipes.setPrice': command({
    name: 'recipes.setPrice',
    summary: {
      de: 'Den Preis eines Gerichts setzen, etwa den Preisvorschlag übernehmen; null entfernt ihn.',
      en: 'Set the menu price of a dish, for instance the suggested price; null removes it.',
    },
    scopes: ['recipes:write'],
    input: z.object({
      ...commandBase,
      recipeId: IdSchema,
      priceRappen: RappenSchema.min(0).nullable(),
    }),
    output: z.object({ recipeId: IdSchema, priceRappen: RappenSchema.optional() }),
  }),
  'recipes.duplicate': command({
    name: 'recipes.duplicate',
    summary: {
      de: 'Ein Rezept kopieren, als «… (Kopie)»; eine Komponente bekommt ihren eigenen Artikel.',
      en: 'Copy a recipe as «… (Kopie)»; a component gets its own article.',
    },
    scopes: ['recipes:write'],
    input: z.object({ ...commandBase, recipeId: IdSchema }),
    output: RecipeCommandResultSchema.extend({ name: z.string() }),
  }),
  'recipes.setActive': command({
    name: 'recipes.setActive',
    summary: {
      de: 'Ein Rezept inaktiv oder wieder aktiv setzen; Zahlen und Geschichte bleiben.',
      en: 'Hide a recipe from the book and pickers or bring it back; numbers and history stay.',
    },
    scopes: ['recipes:write'],
    input: z.object({ ...commandBase, recipeId: IdSchema, active: z.boolean() }),
    output: z.object({ recipeId: IdSchema, active: z.boolean() }),
  }),
  'recipes.delete': command({
    name: 'recipes.delete',
    summary: {
      de: 'Ein Rezept löschen, solange es auf keiner Speisekarte, in keinem offenen Menüplan und als Komponente in keinem Rezept steht.',
      en: 'Delete a recipe that is on no menu card, in no open plan entry and, as a component, in no recipe and not in stock.',
    },
    scopes: ['recipes:write'],
    input: z.object({ ...commandBase, recipeId: IdSchema }),
    output: z.object({ recipeId: IdSchema, articleId: IdSchema.optional() }),
  }),
} as const satisfies ContractFragment;
