import { z } from 'zod';
import {
  command,
  commandBase,
  query,
  queryBase,
  type ContractFragment,
} from '../../contract/operation';
import { AllergenIdSchema, DietSchema } from '../../domain/allergens';
import { IdSchema } from '../../ids';
import { RappenSchema } from '../../money';
import {
  LocalDateSchema,
  nameSchema,
  PhotoSchema,
  PositiveQuantitySchema,
  QuantitySchema,
  textSchema,
  UnitSchema,
} from '../../model/primitives';
import { CourseSchema, RecipeKindSchema } from '../../model/recipe';
import { MAX_PLAN_PORTIONS, PlanSlotSchema, WasteWeighingKindSchema } from '../../model/menu';
import { DateKindSchema } from '../../model/primitives';

/** How a dish stands against the target of the business (`domain/costing.ts`). */
const MarginSchema = z.enum(['good', 'watch', 'over', 'unknown']);

/** Portions as a kitchen cooks them: a whole number. */
const PortionsSchema = z.int().min(1).max(MAX_PLAN_PORTIONS);

/** One lot a run would take from, in the order of FEFO. */
export const RunTakeSchema = z.object({
  lotId: IdSchema,
  areaId: IdSchema,
  areaName: z.string().optional(),
  expiresOn: LocalDateSchema.optional(),
  dateKind: DateKindSchema,
  receivedOn: LocalDateSchema,
  /** Gross quantity taken from this lot, in base units. */
  quantity: QuantitySchema,
  valueRappen: RappenSchema.min(0),
});
export type RunTake = z.infer<typeof RunTakeSchema>;

/** A lot that is past its Verbrauchsdatum: listed apart, never cooked. */
export const RunUnusableSchema = z.object({
  lotId: IdSchema,
  areaId: IdSchema,
  expiresOn: LocalDateSchema,
  quantity: QuantitySchema,
});

/** One ingredient of a run: need, stock, shortage and the lots it would take. */
export const RunIngredientSchema = z.object({
  articleId: IdSchema,
  name: z.string(),
  unit: UnitSchema,
  /** Gross quantity to leave the stock (net ÷ yield). */
  quantity: QuantitySchema,
  netQuantity: QuantitySchema,
  /** What may be used today (lots past their date left out). */
  usable: QuantitySchema,
  /** What the stock does not cover; 0 when it is all there. */
  missing: QuantitySchema,
  takes: z.array(RunTakeSchema),
  unusable: z.array(RunUnusableSchema),
  valueRappen: RappenSchema.min(0),
});
export type RunIngredient = z.infer<typeof RunIngredientSchema>;

/** A shortage: what the run needed and the stock did not have (ADR-0007). */
export const RunShortageSchema = z.object({
  articleId: IdSchema,
  name: z.string(),
  unit: UnitSchema,
  missing: PositiveQuantitySchema,
});

/** What a component or a dish gives when it is made. */
export const RunOutputSchema = z.object({
  articleId: IdSchema,
  name: z.string(),
  unit: UnitSchema,
  quantity: PositiveQuantitySchema,
  /** The area the article is usually kept in; the default for the output lot. */
  proposedAreaId: IdSchema.optional(),
  /** Today plus the shelf life of the recipe (a Richtwert the business sets). */
  proposedExpiresOn: LocalDateSchema.optional(),
  shelfLifeDays: z.int().min(0).optional(),
});
export type RunOutput = z.infer<typeof RunOutputSchema>;

/** The preview of a run: what it would take, what it would cost and what it makes. */
export const ProductionPreviewSchema = z.object({
  recipeId: IdSchema,
  recipeName: z.string(),
  kind: RecipeKindSchema,
  /** The batch the recipe is written for. */
  batchPortions: z.int(),
  portions: PortionsSchema,
  ingredients: z.array(RunIngredientSchema),
  costRappen: RappenSchema.min(0),
  costPerPortionRappen: RappenSchema.min(0),
  shortages: z.array(RunShortageSchema),
  output: RunOutputSchema.optional(),
  today: LocalDateSchema,
});
export type ProductionPreview = z.infer<typeof ProductionPreviewSchema>;

/** One run in a list, newest first. */
export const ProductionRowSchema = z.object({
  id: IdSchema,
  recipeId: IdSchema,
  recipeName: z.string(),
  kind: RecipeKindSchema,
  portions: PositiveQuantitySchema,
  producedOn: LocalDateSchema,
  costRappen: RappenSchema.min(0),
  costPerPortionRappen: RappenSchema.min(0),
  shortageCount: z.int().min(0),
  producedBy: IdSchema,
  producedByName: z.string().optional(),
  outputLotId: IdSchema.optional(),
  outputName: z.string().optional(),
  planEntryId: IdSchema.optional(),
  note: z.string().optional(),
});
export type ProductionRow = z.infer<typeof ProductionRowSchema>;

/** A lot that went into a run, with the delivery it came from (traceability). */
export const TraceInSchema = z.object({
  lotId: IdSchema,
  lotCode: z.string(),
  articleId: IdSchema,
  name: z.string(),
  unit: UnitSchema,
  quantity: PositiveQuantitySchema,
  valueRappen: RappenSchema.min(0),
  supplierName: z.string().optional(),
  receivedOn: LocalDateSchema,
  expiresOn: LocalDateSchema.optional(),
  dateKind: DateKindSchema,
  origin: z.enum(['purchase', 'production', 'opening', 'count']),
  areaName: z.string().optional(),
});
export type TraceIn = z.infer<typeof TraceInSchema>;

export const ProductionDetailSchema = z.object({
  production: ProductionRowSchema,
  ins: z.array(TraceInSchema),
  shortages: z.array(RunShortageSchema),
  output: z
    .object({
      lotId: IdSchema,
      lotCode: z.string(),
      articleId: IdSchema,
      name: z.string(),
      unit: UnitSchema,
      quantity: PositiveQuantitySchema,
      remaining: QuantitySchema,
      pricePer1000: RappenSchema.min(0),
      expiresOn: LocalDateSchema.optional(),
      dateKind: DateKindSchema,
      areaName: z.string().optional(),
    })
    .optional(),
});
export type ProductionDetail = z.infer<typeof ProductionDetailSchema>;

/** The label of a run's output: what a label printer or a strip of paper needs. */
export const ProductionLabelSchema = z.object({
  productionId: IdSchema,
  name: z.string(),
  producedOn: LocalDateSchema,
  /** Verbrauchsdatum or Mindesthaltbarkeit, with the day it falls on. */
  useBy: LocalDateSchema.optional(),
  dateKind: DateKindSchema.optional(),
  quantity: PositiveQuantitySchema.optional(),
  unit: UnitSchema.optional(),
  portions: z.int(),
  allergens: z.array(AllergenIdSchema),
  traces: z.array(AllergenIdSchema),
  diet: DietSchema,
  /** Allergens cannot be declared completely: the label says so. */
  incomplete: z.boolean(),
  producedByName: z.string().optional(),
  code: z.string(),
});
export type ProductionLabel = z.infer<typeof ProductionLabelSchema>;

/** One menu line of the plan: «Menü 1», «Vegi», «Leichte Vollkost». */
export const PlanLineSchema = z.object({
  id: IdSchema,
  name: z.string(),
  slot: PlanSlotSchema.optional(),
  sortOrder: z.int().min(0),
  costTargetRappen: RappenSchema.min(0).optional(),
  requiredDiet: DietSchema.optional(),
  freeOf: z.array(AllergenIdSchema),
  active: z.boolean(),
});
export type PlanLine = z.infer<typeof PlanLineSchema>;

/** One dish on one day: names and numbers joined, with cost and margin computed. */
export const PlanEntryViewSchema = z.object({
  id: IdSchema,
  date: LocalDateSchema,
  slot: PlanSlotSchema,
  recipeId: IdSchema,
  recipeName: z.string(),
  course: CourseSchema,
  photo: PhotoSchema.optional(),
  portions: PortionsSchema,
  lineId: IdSchema.optional(),
  lineName: z.string().optional(),
  note: z.string().optional(),
  productionId: IdSchema.optional(),
  produced: z.boolean(),
  /** Goods of one portion at today's prices; 0 while a price is missing. */
  costPerPortionRappen: RappenSchema.min(0),
  costIncomplete: z.boolean(),
  /** Menu price of one portion with VAT; undefined for a dish without one. */
  priceRappen: RappenSchema.min(0).optional(),
  marginStatus: MarginSchema,
  foodCostBps: z.int().optional(),
  recipeActive: z.boolean(),
});
export type PlanEntryView = z.infer<typeof PlanEntryViewSchema>;

/** Warnings and the declaration of one line on one day («Allergene je Tag und Linie»). */
export const PlanLineWarningSchema = z.object({
  kind: z.enum(['diet', 'allergen']),
  /** kind `diet`: the line promises this, the dishes do not keep it. */
  requiredDiet: DietSchema.optional(),
  diet: DietSchema.optional(),
  /** kind `allergen`: the line promises to be free of it, a dish contains it or may trace it. */
  allergen: AllergenIdSchema.optional(),
  trace: z.boolean().optional(),
});
export type PlanLineWarning = z.infer<typeof PlanLineWarningSchema>;
export const PlanLineDaySchema = z.object({
  lineId: IdSchema.optional(),
  name: z.string(),
  entries: z.int().min(0),
  portions: z.int().min(0),
  allergens: z.array(AllergenIdSchema),
  traces: z.array(AllergenIdSchema),
  diet: DietSchema,
  incomplete: z.boolean(),
  warnings: z.array(PlanLineWarningSchema),
});
export type PlanLineDay = z.infer<typeof PlanLineDaySchema>;

export const PlanDaySchema = z.object({
  date: LocalDateSchema,
  entries: z.array(PlanEntryViewSchema),
  portions: z.int().min(0),
  /** Expected net revenue of the day: portions times the net price, where a price is known. */
  netRevenueRappen: RappenSchema.min(0),
  costRappen: RappenSchema.min(0),
  /** Entries without a menu price or with incomplete costs: totals are lower bounds. */
  unpricedEntries: z.int().min(0),
  lines: z.array(PlanLineDaySchema),
});
export type PlanDay = z.infer<typeof PlanDaySchema>;

/** What the open entries of a week need against the stock (`sumRequirements`). */
export const PlanDemandSchema = z.object({
  articleId: IdSchema,
  name: z.string(),
  unit: UnitSchema,
  needed: QuantitySchema,
  usable: QuantitySchema,
  missing: QuantitySchema,
  entries: z.int().min(1),
});
export type PlanDemand = z.infer<typeof PlanDemandSchema>;

export const MealRowSchema = z.object({
  id: IdSchema,
  date: LocalDateSchema,
  slot: PlanSlotSchema,
  lineId: IdSchema.optional(),
  expected: z.int().min(0).optional(),
  served: z.int().min(0).optional(),
  note: z.string().optional(),
});
export type MealRow = z.infer<typeof MealRowSchema>;

/** Expected meals the plan says, per day, meal and line: what «expected» starts with. */
export const PlannedMealSchema = z.object({
  date: LocalDateSchema,
  slot: PlanSlotSchema,
  lineId: IdSchema.optional(),
  portions: z.int().min(0),
});
export type PlannedMeal = z.infer<typeof PlannedMealSchema>;

export const WeighingRowSchema = z.object({
  id: IdSchema,
  date: LocalDateSchema,
  slot: PlanSlotSchema.optional(),
  lineId: IdSchema.optional(),
  kind: WasteWeighingKindSchema,
  grams: z.int().min(1),
  note: z.string().optional(),
});
export type WeighingRow = z.infer<typeof WeighingRowSchema>;

export const PlanWeekSchema = z.object({
  weekStart: LocalDateSchema,
  weekEnd: LocalDateSchema,
  today: LocalDateSchema,
  /** The meals this week uses: those with entries or lines, plus lunch. In plan order. */
  slots: z.array(PlanSlotSchema),
  lines: z.array(PlanLineSchema),
  days: z.array(PlanDaySchema),
  entries: z.int().min(0),
  open: z.int().min(0),
  portions: z.int().min(0),
  netRevenueRappen: RappenSchema.min(0),
  costRappen: RappenSchema.min(0),
  unpricedEntries: z.int().min(0),
  demand: z.array(PlanDemandSchema),
  meals: z.array(MealRowSchema),
  planned: z.array(PlannedMealSchema),
  weighings: z.array(WeighingRowSchema),
});
export type PlanWeek = z.infer<typeof PlanWeekSchema>;

/** A dish that uses up stock about to expire («Reste verwerten»). */
export const PlanSuggestionSchema = z.object({
  lotId: IdSchema,
  articleId: IdSchema,
  articleName: z.string(),
  unit: UnitSchema,
  expiringQuantity: PositiveQuantitySchema,
  expiresOn: LocalDateSchema,
  daysLeft: z.int(),
  dateKind: DateKindSchema,
  recipeId: IdSchema,
  recipeName: z.string(),
  course: CourseSchema,
  /** Portions that use the expiring stock up, capped by what the other ingredients cover and by the plan's maximum. */
  portions: z.int().min(1).max(MAX_PLAN_PORTIONS),
  usedQuantity: PositiveQuantitySchema,
  savedRappen: RappenSchema.min(0),
  /** The latest day to cook it: the day the expiring stock falls due. */
  latestCookOn: LocalDateSchema,
  proposedOn: LocalDateSchema,
  proposedSlot: PlanSlotSchema,
  marginStatus: MarginSchema,
  missing: z.array(
    z.object({
      articleId: IdSchema,
      name: z.string(),
      unit: UnitSchema,
      missing: PositiveQuantitySchema,
    }),
  ),
  ready: z.boolean(),
});
export type PlanSuggestion = z.infer<typeof PlanSuggestionSchema>;

/** Why auto fill chose a dish: stock that expires, or the ranking by margin and sales. */
export const AutoFillReasonSchema = z.object({
  kind: z.enum(['expiring', 'ranking']),
  articleName: z.string().optional(),
  quantity: PositiveQuantitySchema.optional(),
  unit: UnitSchema.optional(),
  expiresOn: LocalDateSchema.optional(),
  savedRappen: RappenSchema.min(0).optional(),
  soldLast28: z.int().min(0).optional(),
  marginStatus: MarginSchema.optional(),
});

export const AutoFillEntrySchema = z.object({
  entryId: IdSchema,
  date: LocalDateSchema,
  slot: PlanSlotSchema,
  recipeId: IdSchema,
  recipeName: z.string(),
  portions: PortionsSchema,
  reason: AutoFillReasonSchema,
});
export type AutoFillEntry = z.infer<typeof AutoFillEntrySchema>;

const lineFields = {
  name: nameSchema(40),
  slot: PlanSlotSchema.optional(),
  costTargetRappen: RappenSchema.min(0).optional(),
  requiredDiet: DietSchema.optional(),
  freeOf: z.array(AllergenIdSchema).max(14),
};

/** Every operation of «Produktion» and «Menüplan» (ADR-0015 for the plan). */
export const productionContract = {
  'production.preview': query({
    name: 'production.preview',
    summary: {
      de: 'Was eine Produktion verbraucht, kostet und ergibt, bevor sie gebucht wird.',
      en: 'What a production run would take, cost and make, before it is booked.',
    },
    scopes: ['recipes:read', 'stock:read'],
    input: z.object({ ...queryBase, recipeId: IdSchema, portions: PortionsSchema }),
    output: ProductionPreviewSchema,
  }),
  'production.record': command({
    name: 'production.record',
    summary: {
      de: 'Eine Produktion buchen: Zutaten verlassen das Lager, Komponenten kommen als Charge hinein.',
      en: 'Book a production run: ingredients leave the stock, components enter it as a lot.',
    },
    scopes: ['stock:write', 'recipes:read'],
    input: z.object({
      ...commandBase,
      recipeId: IdSchema,
      portions: PortionsSchema,
      producedOn: LocalDateSchema.optional(),
      planEntryId: IdSchema.optional(),
      outputAreaId: IdSchema.optional(),
      outputExpiresOn: LocalDateSchema.optional(),
      note: textSchema(300).optional(),
    }),
    output: z.object({
      productionId: IdSchema,
      costRappen: RappenSchema.min(0),
      costPerPortionRappen: RappenSchema.min(0),
      shortages: z.array(RunShortageSchema),
      outputLotId: IdSchema.optional(),
    }),
  }),
  'production.list': query({
    name: 'production.list',
    summary: {
      de: 'Die Produktionen, neueste zuerst, mit Kosten und Fehlmengen.',
      en: 'The production runs, newest first, with cost and shortages.',
    },
    scopes: ['stock:read'],
    input: z.object({
      ...queryBase,
      from: LocalDateSchema.optional(),
      to: LocalDateSchema.optional(),
    }),
    output: z.object({ productions: z.array(ProductionRowSchema) }),
  }),
  'production.get': query({
    name: 'production.get',
    summary: {
      de: 'Eine Produktion mit allen Chargen, die hineingingen, und dem, was herauskam.',
      en: 'One production run with every lot that went in and what came out.',
    },
    scopes: ['stock:read'],
    input: z.object({ ...queryBase, productionId: IdSchema }),
    output: ProductionDetailSchema,
  }),
  'production.label': query({
    name: 'production.label',
    summary: {
      de: 'Das Etikett einer Produktion: Name, Datum, Verbrauchsdatum, Allergene, Kürzel.',
      en: 'The label of a run: name, dates, allergens and a short code.',
    },
    scopes: ['stock:read', 'recipes:read'],
    input: z.object({ ...queryBase, productionId: IdSchema }),
    output: ProductionLabelSchema,
  }),

  'plan.week': query({
    name: 'plan.week',
    summary: {
      de: 'Eine Woche des Menüplans mit Tagen, Linien, Allergenen, Kosten und Bedarf.',
      en: 'One week of the menu plan with days, lines, allergens, cost and demand.',
    },
    scopes: ['menu:read'],
    input: z.object({ ...queryBase, weekStart: LocalDateSchema }),
    output: PlanWeekSchema,
  }),
  'plan.add': command({
    name: 'plan.add',
    summary: {
      de: 'Ein Gericht auf einen Tag und eine Mahlzeit planen.',
      en: 'Plan a dish on a day and meal.',
    },
    scopes: ['menu:write'],
    input: z.object({
      ...commandBase,
      date: LocalDateSchema,
      slot: PlanSlotSchema,
      recipeId: IdSchema,
      portions: PortionsSchema,
      lineId: IdSchema.optional(),
      note: textSchema(200).optional(),
    }),
    output: z.object({ entryId: IdSchema }),
  }),
  'plan.update': command({
    name: 'plan.update',
    summary: { de: 'Einen Eintrag des Menüplans ändern.', en: 'Change an entry of the plan.' },
    scopes: ['menu:write'],
    input: z.object({
      ...commandBase,
      entryId: IdSchema,
      date: LocalDateSchema.optional(),
      slot: PlanSlotSchema.optional(),
      portions: PortionsSchema.optional(),
      lineId: IdSchema.nullable().optional(),
      note: textSchema(200).nullable().optional(),
    }),
    output: z.object({ entryId: IdSchema }),
  }),
  'plan.remove': command({
    name: 'plan.remove',
    summary: { de: 'Einen Eintrag aus dem Menüplan nehmen.', en: 'Take an entry off the plan.' },
    scopes: ['menu:write'],
    input: z.object({ ...commandBase, entryId: IdSchema }),
    output: z.object({ entryId: IdSchema }),
  }),
  'plan.copyWeek': command({
    name: 'plan.copyWeek',
    summary: {
      de: 'Die Einträge einer Woche in eine leere Woche kopieren.',
      en: 'Copy the entries of one week into an empty week.',
    },
    scopes: ['menu:write'],
    input: z.object({
      ...commandBase,
      fromWeekStart: LocalDateSchema,
      toWeekStart: LocalDateSchema,
    }),
    output: z.object({
      copied: z.int().min(0),
      /** Entries not copied, because their dish or line is no longer allowed. */
      skipped: z.int().min(0),
    }),
  }),
  'plan.suggest': query({
    name: 'plan.suggest',
    summary: {
      de: '«Reste verwerten»: Gerichte, die Ware mit nahem Datum aufbrauchen, nach Wert.',
      en: 'Use up what expires soon: dishes ranked by the value of the stock they save.',
    },
    scopes: ['menu:read'],
    input: z.object({
      ...queryBase,
      from: LocalDateSchema,
      days: z.int().min(1).max(60).default(7),
    }),
    output: z.object({ suggestions: z.array(PlanSuggestionSchema) }),
  }),
  'plan.autoFill': command({
    name: 'plan.autoFill',
    summary: {
      de: 'Die leeren Mahlzeiten einer Woche füllen: zuerst Reste, dann nach Marge und Verkauf.',
      en: 'Fill the empty meals of a week: leftovers first, then by margin and sales.',
    },
    scopes: ['menu:write'],
    input: z.object({
      ...commandBase,
      weekStart: LocalDateSchema,
      slots: z.array(PlanSlotSchema).min(1).max(5),
      dishesPerSlot: z.int().min(1).max(5).default(1),
    }),
    output: z.object({
      planned: z.array(AutoFillEntrySchema),
      /** Empty meals no dish fits: the count, the page says why. */
      skipped: z.int().min(0),
    }),
  }),

  'plan.linesList': query({
    name: 'plan.linesList',
    summary: { de: 'Die Menülinien des Betriebs.', en: 'The menu lines of the business.' },
    scopes: ['menu:read'],
    input: z.object({ ...queryBase, includeInactive: z.boolean().default(false) }),
    output: z.object({ lines: z.array(PlanLineSchema) }),
  }),
  'plan.lineCreate': command({
    name: 'plan.lineCreate',
    summary: { de: 'Eine Menülinie anlegen.', en: 'Create a menu line.' },
    scopes: ['menu:write'],
    input: z.object({ ...commandBase, ...lineFields }),
    output: z.object({ lineId: IdSchema }),
  }),
  'plan.lineUpdate': command({
    name: 'plan.lineUpdate',
    summary: {
      de: 'Eine Menülinie umbenennen, ändern oder deaktivieren.',
      en: 'Rename, change or deactivate a menu line.',
    },
    scopes: ['menu:write'],
    input: z.object({
      ...commandBase,
      lineId: IdSchema,
      name: nameSchema(40).optional(),
      slot: PlanSlotSchema.nullable().optional(),
      costTargetRappen: RappenSchema.min(0).nullable().optional(),
      requiredDiet: DietSchema.nullable().optional(),
      freeOf: z.array(AllergenIdSchema).max(14).optional(),
      active: z.boolean().optional(),
    }),
    output: z.object({ lineId: IdSchema }),
  }),
  'plan.lineReorder': command({
    name: 'plan.lineReorder',
    summary: {
      de: 'Die Reihenfolge der Menülinien festlegen.',
      en: 'Set the order of the menu lines.',
    },
    scopes: ['menu:write'],
    input: z.object({ ...commandBase, lineIds: z.array(IdSchema).min(1).max(40) }),
    output: z.object({ count: z.int().min(0) }),
  }),

  'plan.mealsList': query({
    name: 'plan.mealsList',
    summary: {
      de: 'Mahlzeiten je Tag, Mahlzeit und Linie, mit dem, was der Plan erwartet.',
      en: 'Meal counts per day, meal and line, with what the plan expects.',
    },
    scopes: ['menu:read'],
    input: z.object({ ...queryBase, from: LocalDateSchema, to: LocalDateSchema }),
    output: z.object({ meals: z.array(MealRowSchema), planned: z.array(PlannedMealSchema) }),
  }),
  'plan.mealsSet': command({
    name: 'plan.mealsSet',
    summary: {
      de: 'Erwartete und ausgegebene Mahlzeiten eines Tages, einer Mahlzeit und Linie festhalten.',
      en: 'Record the expected and served meals of a day, meal and line.',
    },
    scopes: ['menu:write'],
    input: z.object({
      ...commandBase,
      date: LocalDateSchema,
      slot: PlanSlotSchema,
      lineId: IdSchema.optional(),
      expected: z.int().min(0).max(100_000).nullable().optional(),
      served: z.int().min(0).max(100_000).nullable().optional(),
      note: textSchema(200).nullable().optional(),
    }),
    output: z.object({ mealId: IdSchema.optional() }),
  }),

  'plan.weighingsList': query({
    name: 'plan.weighingsList',
    summary: {
      de: 'Gewogene Tellerrücklaufe und Ausgabereste.',
      en: 'Weighed plate returns and serving leftovers.',
    },
    scopes: ['menu:read'],
    input: z.object({ ...queryBase, from: LocalDateSchema, to: LocalDateSchema }),
    output: z.object({ weighings: z.array(WeighingRowSchema) }),
  }),
  'plan.weighingAdd': command({
    name: 'plan.weighingAdd',
    summary: {
      de: 'Einen Tellerrücklauf oder Ausgaberest in Gramm festhalten.',
      en: 'Record a weighed plate return or serving leftover in grams.',
    },
    scopes: ['menu:write'],
    input: z.object({
      ...commandBase,
      date: LocalDateSchema,
      slot: PlanSlotSchema.optional(),
      lineId: IdSchema.optional(),
      kind: WasteWeighingKindSchema,
      grams: z.int().min(1).max(10_000_000),
      note: textSchema(200).optional(),
    }),
    output: z.object({ weighingId: IdSchema }),
  }),
  'plan.weighingRemove': command({
    name: 'plan.weighingRemove',
    summary: { de: 'Eine Wägung entfernen.', en: 'Remove a weighing.' },
    scopes: ['menu:write'],
    input: z.object({ ...commandBase, weighingId: IdSchema }),
    output: z.object({ weighingId: IdSchema }),
  }),
} as const satisfies ContractFragment;
