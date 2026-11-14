import { z } from 'zod';
import { AllergenIdSchema } from '../domain/allergens';
import { IdSchema } from '../ids';
import { RappenSchema } from '../money';
import {
  BpsSchema,
  LocalDateSchema,
  nameSchema,
  PhotoSchema,
  PositiveQuantitySchema,
  syncFields,
  textSchema,
} from './primitives';

/** `dish`: sold to guests by the portion. `component`: made for the kitchen (mise en place). */
export const RecipeKindSchema = z.enum(['dish', 'component']);
export type RecipeKind = z.infer<typeof RecipeKindSchema>;

export const CourseSchema = z.enum([
  'starter',
  'soup',
  'salad',
  'main',
  'side',
  'dessert',
  'snack',
  'breakfast',
  'drink',
  'other',
]);
export type Course = z.infer<typeof CourseSchema>;
export const COURSES = CourseSchema.options;

export function courseLabel(course: Course): string {
  return {
    starter: 'Vorspeise',
    soup: 'Suppe',
    salad: 'Salat',
    main: 'Hauptgang',
    side: 'Beilage',
    dessert: 'Dessert',
    snack: 'Snack',
    breakfast: 'Frühstück',
    drink: 'Getränk',
    other: 'Anderes',
  }[course];
}

/** What a guest may want to know at a glance on the menu card. */
export const DishLabelSchema = z.enum(['house_special', 'regional', 'seasonal', 'spicy', 'new']);
export type DishLabel = z.infer<typeof DishLabelSchema>;

export function dishLabelText(label: DishLabel): string {
  return {
    house_special: 'Spezialität des Hauses',
    regional: 'Regional',
    seasonal: 'Saisonal',
    spicy: 'Scharf',
    new: 'Neu',
  }[label];
}

/**
 * One ingredient of a recipe. `quantity` is the net amount that goes into the pan, in the base
 * unit of the article; stock and cost use the gross amount (net ÷ yield of the article).
 */
export const RecipeIngredientSchema = z.object({
  articleId: IdSchema,
  quantity: PositiveQuantitySchema,
  note: nameSchema(80).optional(),
});
export type RecipeIngredient = z.infer<typeof RecipeIngredientSchema>;

/**
 * A recipe («Rezept»): what goes in for `portions` portions, how it is made and, for a dish,
 * what it costs the guest. Allergens, diet, cost and margin are computed, never stored.
 */
export const RecipeSchema = z.object({
  ...syncFields,
  name: nameSchema(120),
  kind: RecipeKindSchema,
  course: CourseSchema,
  /** For the guest, on the menu card. */
  description: textSchema(400).optional(),
  /** The batch the ingredients are written for. */
  portions: z.int().min(1).max(10_000),
  ingredients: z.array(RecipeIngredientSchema).max(100),
  steps: z.array(textSchema(1000)).max(40),
  prepMinutes: z.int().min(0).max(10_000).optional(),
  photo: PhotoSchema.optional(),
  /** A component fills this article: one batch gives `quantity` of it. */
  output: z.object({ articleId: IdSchema, quantity: PositiveQuantitySchema }).optional(),
  /** Menu price of one portion, VAT included; only dishes are sold. */
  priceRappen: RappenSchema.min(0).optional(),
  vatBps: BpsSchema,
  /** Allergens the ingredients do not show (a garnish, the frying oil of the fryer). */
  extraAllergens: z.array(AllergenIdSchema).max(14),
  extraTraces: z.array(AllergenIdSchema).max(14),
  labels: z.array(DishLabelSchema).max(5),
  /** How long the produced food keeps when stored cold; the business sets it (HACCP). */
  shelfLifeDays: z.int().min(0).max(3650).optional(),
  active: z.boolean(),
});
export type Recipe = z.infer<typeof RecipeSchema>;

/**
 * A production run («Produktion»): a recipe was made on a day. It consumed stock (ledger
 * movements carry the `productionId`) and, for a component, filled a new lot.
 */
export const ProductionSchema = z.object({
  ...syncFields,
  recipeId: IdSchema,
  portions: PositiveQuantitySchema,
  producedOn: LocalDateSchema,
  /** Value of the stock consumed. */
  costRappen: RappenSchema.min(0),
  outputLotId: IdSchema.optional(),
  /** Ingredients that were not in stock in full: produced anyway, booked as far as possible. */
  shortages: z.array(z.object({ articleId: IdSchema, missing: PositiveQuantitySchema })).max(100),
  planEntryId: IdSchema.optional(),
  producedBy: IdSchema,
  note: textSchema(300).optional(),
});
export type Production = z.infer<typeof ProductionSchema>;
