import { z } from 'zod';
import {
  command,
  query,
  queryBase,
  commandBase,
  type ContractFragment,
} from '../../contract/operation';
import { AllergenIdSchema, DietSchema } from '../../domain/allergens';
import { AreaKindSchema, ArticleCategoryIdSchema } from '../../domain/categories';
import { IdSchema } from '../../ids';
import { RappenSchema } from '../../money';
import { ArticleKindSchema, UnitPriceSchema } from '../../model/article';
import { BusinessSchema, StaffRoleSchema } from '../../model/business';
import {
  BpsSchema,
  DateKindSchema,
  DeciCelsiusSchema,
  QuantitySchema,
  UnitSchema,
} from '../../model/primitives';
import { CourseSchema, RecipeKindSchema } from '../../model/recipe';

/** An article as pickers and lists across the app need it: light, without notes. */
export const ArticleRefSchema = z.object({
  id: IdSchema,
  name: z.string(),
  kind: ArticleKindSchema,
  categoryId: ArticleCategoryIdSchema,
  unit: UnitSchema,
  pricePer1000: UnitPriceSchema,
  yieldBps: BpsSchema,
  allergens: z.array(AllergenIdSchema),
  traces: z.array(AllergenIdSchema),
  diet: DietSchema,
  dateKind: DateKindSchema,
  shelfLifeDays: z.int().optional(),
  supplierId: IdSchema.optional(),
  areaId: IdSchema.optional(),
  spotId: IdSchema.optional(),
  packSize: z.number().optional(),
  packLabel: z.string().optional(),
  recipeId: IdSchema.optional(),
  active: z.boolean(),
  /** Sum of all active lots, in base units. */
  stock: QuantitySchema,
});
export type ArticleRef = z.infer<typeof ArticleRefSchema>;

export const AreaRefSchema = z.object({
  id: IdSchema,
  name: z.string(),
  kind: AreaKindSchema,
  minDeciC: DeciCelsiusSchema.optional(),
  maxDeciC: DeciCelsiusSchema.optional(),
  spots: z.array(z.object({ id: IdSchema, name: z.string() })),
});
export type AreaRef = z.infer<typeof AreaRefSchema>;

export const RecipeRefSchema = z.object({
  id: IdSchema,
  name: z.string(),
  kind: RecipeKindSchema,
  course: CourseSchema,
  portions: z.int(),
  priceRappen: RappenSchema.optional(),
  vatBps: BpsSchema,
  outputArticleId: IdSchema.optional(),
  hasPhoto: z.boolean(),
  active: z.boolean(),
});
export type RecipeRef = z.infer<typeof RecipeRefSchema>;

/**
 * Shared reads every module may use: the business itself and light lists for pickers. They
 * exist so that modules do not depend on each other's operations.
 */
export const lookupContract = {
  'business.get': query({
    name: 'business.get',
    summary: {
      de: 'Den Betrieb mit Währung und Zielwerten lesen.',
      en: 'Read the business with its currency and targets.',
    },
    scopes: ['business:read'],
    input: z.object({ ...queryBase }),
    output: z.object({ business: BusinessSchema }),
  }),
  'business.update': command({
    name: 'business.update',
    summary: {
      de: 'Name, Art und Zielwerte des Betriebs ändern.',
      en: 'Change name, kind and targets of the business.',
    },
    scopes: ['business:write'],
    input: z.object({
      ...commandBase,
      name: BusinessSchema.shape.name.optional(),
      kind: BusinessSchema.shape.kind.optional(),
      targetFoodCostBps: BpsSchema.min(500).max(9000).optional(),
      defaultVatBps: BpsSchema.max(3000).optional(),
    }),
    output: z.object({ business: BusinessSchema }),
  }),
  'lookup.staff': query({
    name: 'lookup.staff',
    summary: { de: 'Das Team für Auswahlfelder.', en: 'The team, for pickers.' },
    scopes: ['business:read'],
    input: z.object({ ...queryBase, includeInactive: z.boolean().default(false) }),
    output: z.object({
      staff: z.array(
        z.object({ id: IdSchema, name: z.string(), role: StaffRoleSchema, active: z.boolean() }),
      ),
    }),
  }),
  'lookup.areas': query({
    name: 'lookup.areas',
    summary: {
      de: 'Lagerbereiche mit ihren Plätzen für Auswahlfelder.',
      en: 'Storage areas with their spots, for pickers.',
    },
    scopes: ['stock:read'],
    input: z.object({ ...queryBase }),
    output: z.object({ areas: z.array(AreaRefSchema) }),
  }),
  'lookup.suppliers': query({
    name: 'lookup.suppliers',
    summary: { de: 'Lieferanten für Auswahlfelder.', en: 'Suppliers, for pickers.' },
    scopes: ['stock:read'],
    input: z.object({ ...queryBase }),
    output: z.object({ suppliers: z.array(z.object({ id: IdSchema, name: z.string() })) }),
  }),
  'lookup.articles': query({
    name: 'lookup.articles',
    summary: {
      de: 'Artikel mit Einheit, Preis, Allergenen und Bestand für Auswahlfelder.',
      en: 'Articles with unit, price, allergens and stock, for pickers.',
    },
    scopes: ['stock:read'],
    input: z.object({ ...queryBase, includeInactive: z.boolean().default(false) }),
    output: z.object({ articles: z.array(ArticleRefSchema) }),
  }),
  'lookup.recipes': query({
    name: 'lookup.recipes',
    summary: { de: 'Rezepte für Auswahlfelder.', en: 'Recipes, for pickers.' },
    scopes: ['recipes:read'],
    input: z.object({ ...queryBase, includeInactive: z.boolean().default(false) }),
    output: z.object({ recipes: z.array(RecipeRefSchema) }),
  }),
} as const satisfies ContractFragment;
