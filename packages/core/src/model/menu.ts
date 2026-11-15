import { z } from 'zod';
import { AllergenIdSchema, DietSchema } from '../domain/allergens';
import { IdSchema } from '../ids';
import { RappenSchema } from '../money';
import { LocalDateSchema, nameSchema, syncFields, textSchema } from './primitives';

export const MenuSectionSchema = z.object({
  /** Stable within the card, so sections can be renamed and reordered. */
  id: IdSchema,
  title: nameSchema(60),
  recipeIds: z.array(IdSchema).max(60),
});
export type MenuSection = z.infer<typeof MenuSectionSchema>;

/**
 * A menu card for guests («Speisekarte»): sections with dishes. Photo, description, price,
 * allergens, diet and origin of meat and fish come from the recipes and their ingredients.
 */
export const MenuCardSchema = z.object({
  ...syncFields,
  name: nameSchema(80),
  intro: textSchema(400).optional(),
  sections: z.array(MenuSectionSchema).max(20),
  showPrices: z.boolean(),
  showPhotos: z.boolean(),
  footer: textSchema(600).optional(),
  /** Only published cards appear in the guest view. */
  published: z.boolean(),
});
export type MenuCard = z.infer<typeof MenuCardSchema>;

/** The meals of a day in their order; Znüni and Zvieri for homes, Kitas and schools. */
export const PlanSlotSchema = z.enum([
  'breakfast',
  'morning_snack',
  'lunch',
  'afternoon_snack',
  'dinner',
]);
export type PlanSlot = z.infer<typeof PlanSlotSchema>;
export const PLAN_SLOTS = PlanSlotSchema.options;

export function planSlotLabel(slot: PlanSlot): string {
  return {
    breakfast: 'Morgen',
    morning_snack: 'Znüni',
    lunch: 'Mittag',
    afternoon_snack: 'Zvieri',
    dinner: 'Abend',
  }[slot];
}

/**
 * A menu line («Menülinie», ADR-0015): «Menü 1», «Vegi», «Leichte Vollkost», configured once,
 * so plans, meal counts and cost per meal can be compared line by line. A diet is a line too:
 * what it promises is checked against the computed declaration of its dishes (ADR-0008).
 */
export const MenuLineSchema = z.object({
  ...syncFields,
  name: nameSchema(40),
  /** The meal it belongs to; missing for a line served at every meal. */
  slot: PlanSlotSchema.optional(),
  sortOrder: z.int().min(0),
  /** What one meal of this line may cost in goods, e.g. what the client pays for it. */
  costTargetRappen: RappenSchema.min(0).optional(),
  /** The line promises at least this diet, e.g. vegetarian. */
  requiredDiet: DietSchema.optional(),
  /** The line promises to be free of these allergens. */
  freeOf: z.array(AllergenIdSchema).max(14),
  active: z.boolean(),
});
export type MenuLine = z.infer<typeof MenuLineSchema>;

/** One dish on one day of the menu plan («Menüplan»), with the portions the kitchen expects. */
export const PlanEntrySchema = z.object({
  ...syncFields,
  date: LocalDateSchema,
  slot: PlanSlotSchema,
  recipeId: IdSchema,
  portions: z.int().min(1).max(10_000),
  /** The menu line the dish belongs to; missing in a plan without lines. */
  lineId: IdSchema.optional(),
  note: textSchema(200).optional(),
  /** Set once the dish was produced from the plan. */
  productionId: IdSchema.optional(),
});
export type PlanEntry = z.infer<typeof PlanEntrySchema>;

/**
 * How many meals were expected and served on a day, at a meal, per line or in total («Mahlzeiten
 * zählen», ADR-0015). Not a sale: a line is several recipes and often has no price. Cost per meal
 * is the consumption of the ledger divided by the meals served, computed, never stored.
 */
export const MealCountSchema = z.object({
  ...syncFields,
  date: LocalDateSchema,
  slot: PlanSlotSchema,
  /** Missing: the count of the whole meal, all lines together. */
  lineId: IdSchema.optional(),
  expected: z.int().min(0).max(100_000).optional(),
  served: z.int().min(0).max(100_000).optional(),
  note: textSchema(200).optional(),
});
export type MealCount = z.infer<typeof MealCountSchema>;

/**
 * What came back on the plates or stayed at the counter, weighed («Tellerrücklauf»,
 * «Ausgaberest»). Not a write-off of the ledger: production already took the goods out of
 * stock, and a mixed mass has no article. Its value comes from the day's cost per kilogram.
 */
export const WasteWeighingKindSchema = z.enum(['plate', 'serving', 'production']);
export type WasteWeighingKind = z.infer<typeof WasteWeighingKindSchema>;

export const WasteWeighingSchema = z.object({
  ...syncFields,
  date: LocalDateSchema,
  slot: PlanSlotSchema.optional(),
  lineId: IdSchema.optional(),
  kind: WasteWeighingKindSchema,
  grams: z.int().min(1).max(10_000_000),
  note: textSchema(200).optional(),
});
export type WasteWeighing = z.infer<typeof WasteWeighingSchema>;
