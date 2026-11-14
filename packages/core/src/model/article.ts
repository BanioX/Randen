import { z } from 'zod';
import { AllergenIdSchema, DietSchema } from '../domain/allergens';
import { ArticleCategoryIdSchema } from '../domain/categories';
import { IdSchema } from '../ids';
import { RappenSchema } from '../money';
import {
  BpsSchema,
  CountryCodeSchema,
  DateKindSchema,
  GtinSchema,
  nameSchema,
  PositiveQuantitySchema,
  QuantitySchema,
  syncFields,
  textSchema,
  UnitSchema,
  WeekdaySchema,
} from './primitives';

/** A business that delivers goods («Lieferant»). Contact data is business data, typed by the user. */
export const SupplierSchema = z.object({
  ...syncFields,
  name: nameSchema(80),
  customerNumber: nameSchema(40).optional(),
  phone: nameSchema(40).optional(),
  email: z.email().max(120).optional(),
  /** Days on which an order has to be placed, and days on which goods arrive. */
  orderDays: z.array(WeekdaySchema).max(7),
  deliveryDays: z.array(WeekdaySchema).max(7),
  minOrderRappen: RappenSchema.min(0).optional(),
  note: textSchema(500).optional(),
});
export type Supplier = z.infer<typeof SupplierSchema>;

/**
 * The price of goods: the smallest currency unit per 1000 base units, that is Rappen per
 * kilogram, per litre or per 1000 pieces. One rule for every unit keeps the arithmetic whole:
 * quantity × price = thousandths of a Rappen (see `domain/costing.ts`).
 */
export const UnitPriceSchema = RappenSchema.min(0).max(100_000_000_000);

export const ArticleKindSchema = z.enum(['purchased', 'prepared']);
export type ArticleKind = z.infer<typeof ArticleKindSchema>;

/**
 * Something the kitchen keeps in stock («Artikel»): bought goods, or a component made in house
 * (`prepared`, the output of a recipe such as a stock or a sauce).
 */
export const ArticleSchema = z.object({
  ...syncFields,
  name: nameSchema(120),
  kind: ArticleKindSchema,
  categoryId: ArticleCategoryIdSchema,
  unit: UnitSchema,
  /** The last purchase price (or the last production cost); 0 = not known yet. */
  pricePer1000: UnitPriceSchema,
  /** What is left after trimming, 8500 = 85 %. Recipes count net, stock and cost count gross. */
  yieldBps: BpsSchema.min(100),
  /** Contained allergens (LIV Anhang 6) and those that may be present as traces. */
  allergens: z.array(AllergenIdSchema).max(14),
  traces: z.array(AllergenIdSchema).max(14),
  diet: DietSchema,
  supplierId: IdSchema.optional(),
  supplierArticleNumber: nameSchema(40).optional(),
  /** One order unit in base units («Karton à 10 kg» = 10000) and its name. */
  packSize: PositiveQuantitySchema.optional(),
  packLabel: nameSchema(30).optional(),
  /** Below this the article appears on the order proposal; `targetStock` is what to fill up to. */
  minStock: QuantitySchema.optional(),
  targetStock: QuantitySchema.optional(),
  /** Where it is usually kept: the area for goods receipt, the spot for «Wo ist was?». */
  areaId: IdSchema.optional(),
  spotId: IdSchema.optional(),
  /** First proposal for the date at goods receipt; the date on the pack always wins. */
  shelfLifeDays: z.int().min(0).max(36_500).optional(),
  dateKind: DateKindSchema,
  originCountry: CountryCodeSchema.optional(),
  /** For `prepared`: the recipe that makes it. */
  recipeId: IdSchema.optional(),
  gtin: GtinSchema.optional(),
  note: textSchema(500).optional(),
  active: z.boolean(),
});
export type Article = z.infer<typeof ArticleSchema>;
