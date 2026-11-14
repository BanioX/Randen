import { z } from 'zod';
import { IdSchema } from '../ids';
import { RappenSchema } from '../money';
import {
  BpsSchema,
  LocalDateSchema,
  nameSchema,
  PositiveQuantitySchema,
  syncFields,
  textSchema,
  YearMonthSchema,
} from './primitives';

/**
 * What was sold on a day («Verkauf»): portions of a dish, or revenue without a recipe (drinks,
 * a banquet). Typed in by hand or taken from the till's daily report; no till is connected.
 */
export const SaleSchema = z.object({
  ...syncFields,
  soldOn: LocalDateSchema,
  recipeId: IdSchema.optional(),
  /** For revenue without a recipe: «Getränke», «Bankett Müller». */
  label: nameSchema(80).optional(),
  portions: PositiveQuantitySchema,
  /** The whole line, VAT included. */
  grossRappen: RappenSchema.min(0),
  vatBps: BpsSchema,
  /** True if the ingredients left the stock with this sale (dishes cooked to order). */
  bookedStock: z.boolean(),
});
export type Sale = z.infer<typeof SaleSchema>;

/** What the kitchen may spend on goods in a month, and the revenue it plans with («Budget»). */
export const BudgetSchema = z.object({
  ...syncFields,
  month: YearMonthSchema,
  purchaseBudgetRappen: RappenSchema.min(0),
  revenueTargetRappen: RappenSchema.min(0).optional(),
  targetFoodCostBps: BpsSchema.optional(),
  note: textSchema(300).optional(),
});
export type Budget = z.infer<typeof BudgetSchema>;
