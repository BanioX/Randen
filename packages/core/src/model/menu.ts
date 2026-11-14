import { z } from 'zod';
import { IdSchema } from '../ids';
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

export const PlanSlotSchema = z.enum(['breakfast', 'lunch', 'dinner']);
export type PlanSlot = z.infer<typeof PlanSlotSchema>;
export const PLAN_SLOTS = PlanSlotSchema.options;

export function planSlotLabel(slot: PlanSlot): string {
  return { breakfast: 'Morgen', lunch: 'Mittag', dinner: 'Abend' }[slot];
}

/** One dish on one day of the menu plan («Menüplan»), with the portions the kitchen expects. */
export const PlanEntrySchema = z.object({
  ...syncFields,
  date: LocalDateSchema,
  slot: PlanSlotSchema,
  recipeId: IdSchema,
  portions: z.int().min(1).max(10_000),
  note: textSchema(200).optional(),
  /** Set once the dish was produced from the plan. */
  productionId: IdSchema.optional(),
});
export type PlanEntry = z.infer<typeof PlanEntrySchema>;
