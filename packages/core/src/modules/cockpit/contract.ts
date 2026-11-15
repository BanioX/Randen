import { z } from 'zod';
import { query, queryBase, type ContractFragment } from '../../contract/operation';
import { AreaKindSchema } from '../../domain/categories';
import { IdSchema } from '../../ids';
import { RappenSchema } from '../../money';
import {
  BpsSchema,
  DateKindSchema,
  LocalDateSchema,
  QuantitySchema,
  UnitSchema,
  YearMonthSchema,
} from '../../model/primitives';
import { SupplierKindSchema } from '../../model/article';
import { PlanSlotSchema } from '../../model/menu';
import { CourseSchema, RecipeKindSchema } from '../../model/recipe';

/**
 * Where a row of the cockpit leads. The core names the page and the row it concerns; the app
 * turns that into an address (`app/paths.ts`), so no address lives in the logic.
 */
export const CockpitTargetSchema = z.discriminatedUnion('page', [
  /** The expiry list of «Lager», narrowed to one group. */
  z.object({ page: z.literal('expiring'), group: z.enum(['expired', 'today']) }),
  /** Write off this one lot. */
  z.object({ page: z.literal('waste'), lotId: IdSchema }),
  z.object({ page: z.literal('temperatures') }),
  /** The self-control with the tasks of the day. */
  z.object({ page: z.literal('haccp') }),
  /** Goods receipt prefilled with this order. */
  z.object({ page: z.literal('receive'), orderId: IdSchema }),
  z.object({ page: z.literal('orders') }),
  z.object({ page: z.literal('plan') }),
  /** «Einkauf» with the order proposal. */
  z.object({ page: z.literal('purchasing') }),
]);
export type CockpitTarget = z.infer<typeof CockpitTargetSchema>;

/**
 * The things of the day, in the order the page shows them: what must go, what is due, the
 * self-control, what arrives, what is planned and the meals to count, what to buy. The page
 * shows a kind only while the business uses its function (ADR-0015): `orders` with ordering,
 * `plan` with planning, `meals` with meals, `shopping` with the market.
 */
export const CockpitTodoKindSchema = z.enum([
  'expired',
  'due_today',
  'temperature',
  'hygiene',
  'orders',
  'plan',
  'meals',
  'below_min',
  'shopping',
]);
export type CockpitTodoKind = z.infer<typeof CockpitTodoKindSchema>;
export const COCKPIT_TODO_KINDS = CockpitTodoKindSchema.options;

/** One thing to do today. Only kinds with something to do appear. */
export const CockpitTodoSchema = z.object({
  kind: CockpitTodoKindSchema,
  /** Lots, areas, tasks, orders, dishes, meals, articles or lines of the shopping list. */
  count: z.int().min(1),
  /** What it is worth, where that helps: lots, orders. */
  valueRappen: RappenSchema.optional(),
  /** The first three names of what it concerns, most urgent first. */
  names: z.array(z.string()).max(3),
  target: CockpitTargetSchema,
});
export type CockpitTodo = z.infer<typeof CockpitTodoSchema>;

const CockpitAreaSchema = z.object({ id: IdSchema, name: z.string(), kind: AreaKindSchema });

/** A lot to use up before its date: due today or within three days. */
export const CockpitUseUpLotSchema = z.object({
  lotId: IdSchema,
  articleId: IdSchema,
  articleName: z.string(),
  unit: UnitSchema,
  quantity: QuantitySchema,
  valueRappen: RappenSchema,
  area: CockpitAreaSchema,
  /** The usual spot of the article, if it lies in the area of the lot. */
  spotName: z.string().optional(),
  expiresOn: LocalDateSchema,
  dateKind: DateKindSchema,
  status: z.enum(['today', 'soon']),
  daysLeft: z.int().min(0),
});
export type CockpitUseUpLot = z.infer<typeof CockpitUseUpLotSchema>;

/** How a share stands against its target; `unknown` without the figures to judge. */
export const CockpitStatusSchema = z.enum(['good', 'watch', 'over', 'unknown']);

export const CockpitDishSchema = z.object({
  recipeId: IdSchema,
  name: z.string(),
  /** Menu price, VAT included. */
  priceRappen: RappenSchema,
  costPerPortionRappen: RappenSchema,
  /** Net price minus goods of one portion («Deckungsbeitrag»); negative if the goods cost more. */
  marginRappen: RappenSchema,
  foodCostBps: z.int().min(0),
  status: z.enum(['good', 'watch', 'over']),
});
export type CockpitDish = z.infer<typeof CockpitDishSchema>;

/** How many meals one meal of today expects and served, as far as they are counted. */
export const CockpitMealSlotSchema = z.object({
  slot: PlanSlotSchema,
  /** The whole meal, or the lines added up when only lines are counted. */
  expected: z.int().min(0).optional(),
  served: z.int().min(0).optional(),
  /** The menu plan has dishes for this meal today. */
  planned: z.boolean(),
});
export type CockpitMealSlot = z.infer<typeof CockpitMealSlotSchema>;

export const CockpitSetupStepSchema = z.enum([
  'spots',
  'articles',
  'receipt',
  'recipe',
  'menu',
  'temperature',
]);
export type CockpitSetupStep = z.infer<typeof CockpitSetupStepSchema>;
export const COCKPIT_SETUP_STEPS = CockpitSetupStepSchema.options;

/** The articles a young business should have before the numbers mean something. */
export const COCKPIT_SETUP_ARTICLES = 5;

export const CockpitWasteKindSchema = z.enum(['storage', 'production', 'plate', 'other']);

const CockpitTodayOutputSchema = z.object({
  todo: z.array(CockpitTodoSchema),
  useUp: z.object({
    /** At most eight, the most urgent first. */
    lots: z.array(CockpitUseUpLotSchema).max(8),
    /** All lots due within three days, also those beyond the eight. */
    count: z.int(),
    totalValueRappen: RappenSchema,
  }),
  figures: z.object({
    stock: z.object({
      valueRappen: RappenSchema,
      /** Articles with stock, the areas it lies in and its lots. */
      articleCount: z.int(),
      areaCount: z.int(),
      lotCount: z.int(),
      /** Lots without a price: the value is lower than what is really there. */
      lotsWithoutPrice: z.int(),
    }),
    /** «Läuft heute ab»: lots whose date is today. */
    dueToday: z.object({ count: z.int(), valueRappen: RappenSchema }),
    /** Articles under their minimum stock. */
    belowMinCount: z.int(),
    /** Goods received in the running month («Einkauf»), whether a budget is set or not. */
    purchasedRappen: RappenSchema,
    /** The running month: cost of goods used against net revenue of the sales. */
    foodCost: z.object({
      month: YearMonthSchema,
      costRappen: RappenSchema,
      netRevenueRappen: RappenSchema,
      /** Undefined without revenue. May pass 100 % when the goods cost more than they bring. */
      shareBps: z.int().min(0).optional(),
      targetBps: BpsSchema,
      status: CockpitStatusSchema,
    }),
    /**
     * Written off in the last seven days (today included) and in the seven before, and in the
     * running month («Weggeworfen diesen Monat», the core figure of a small kitchen).
     */
    writeOffs: z.object({
      weekRappen: RappenSchema,
      lastWeekRappen: RappenSchema,
      weekCount: z.int(),
      monthRappen: RappenSchema,
      monthCount: z.int(),
    }),
    /**
     * Goods per meal served in the running month (ADR-0015): what left the stock for the guests
     * (consumption, less components made in house, with the differences of the counts) divided
     * by the meals served. Undefined without meals served.
     */
    costPerMeal: z.object({
      month: YearMonthSchema,
      costRappen: RappenSchema,
      served: z.int().min(0),
      perMealRappen: RappenSchema.optional(),
      /** What a meal may cost this month (`Budget.costPerMealRappen`). */
      targetRappen: RappenSchema.optional(),
      status: CockpitStatusSchema,
    }),
    /** The purchase budget of the running month, if one is set. */
    budget: z
      .object({
        month: YearMonthSchema,
        purchaseBudgetRappen: RappenSchema,
        /** Goods received this month. */
        spentRappen: RappenSchema,
        /** Today is day `day` of `daysInMonth`. */
        day: z.int().min(1).max(31),
        daysInMonth: z.int().min(28).max(31),
      })
      .optional(),
  }),
  /** The meals of today with dishes in the plan or a count, in the order of the day. */
  meals: z.object({ slots: z.array(CockpitMealSlotSchema) }),
  /** Written off in the last 30 days by where the loss happened, largest first. */
  wasteByKind: z.object({
    totalRappen: RappenSchema,
    kinds: z.array(z.object({ kind: CockpitWasteKindSchema, valueRappen: RappenSchema })),
  }),
  dishes: z.object({
    /** The three with the highest contribution margin. */
    best: z.array(CockpitDishSchema).max(3),
    /** The three with the highest food cost share. */
    worst: z.array(CockpitDishSchema).max(3),
    /** Active dishes, and those that cannot be ranked: no price, or an ingredient without one. */
    dishCount: z.int(),
    withoutPrice: z.int(),
    withoutCost: z.int(),
    targetBps: BpsSchema,
  }),
  setup: z.object({
    /** No article and no recipe yet: the page offers the demo business. */
    empty: z.boolean(),
    /** Created within the last 30 days: the page shows the first steps while one is open. */
    young: z.boolean(),
    steps: z.array(
      z.object({
        step: CockpitSetupStepSchema,
        done: z.boolean(),
        /** For `articles`: how many there are. */
        count: z.int().optional(),
      }),
    ),
  }),
});
export type CockpitToday = z.infer<typeof CockpitTodayOutputSchema>;

const searchHit = { id: IdSchema, name: z.string() };

export const CockpitSearchOutputSchema = z.object({
  articles: z.array(
    z.object({
      ...searchHit,
      unit: UnitSchema,
      /** Sum of the active lots, in base units. */
      stock: QuantitySchema,
      areaName: z.string().optional(),
      spotName: z.string().optional(),
    }),
  ),
  recipes: z.array(
    z.object({
      ...searchHit,
      kind: RecipeKindSchema,
      course: CourseSchema,
      priceRappen: RappenSchema.optional(),
    }),
  ),
  suppliers: z.array(z.object({ ...searchHit, kind: SupplierKindSchema, articleCount: z.int() })),
  spots: z.array(
    z.object({ ...searchHit, areaId: IdSchema, areaName: z.string(), articleCount: z.int() }),
  ),
  /** Every hit, also those beyond the six per kind. */
  total: z.int(),
});
export type CockpitSearch = z.infer<typeof CockpitSearchOutputSchema>;

/** The most hits per kind the search returns. */
export const COCKPIT_SEARCH_LIMIT = 6;
/** The most lots «Heute verwerten» lists. */
export const COCKPIT_USE_UP_LIMIT = 8;

/**
 * Operations of the module «Cockpit»: the first page. It reads everything and writes nothing:
 * what has to be done today, then how the kitchen stands.
 */
export const cockpitContract = {
  'cockpit.today': query({
    name: 'cockpit.today',
    summary: {
      de: 'Der Tag der Küche: was heute zu tun ist, was zu verwerten ist, die Kennzahlen, Abschreiber nach Art, Gerichte nach Marge und die ersten Schritte.',
      en: "The kitchen's day: what to do today, what to use up, key figures, write-offs by kind, dishes by margin and the first steps.",
    },
    scopes: ['stock:read', 'recipes:read', 'numbers:read', 'haccp:read'],
    input: z.object({ ...queryBase }),
    output: CockpitTodayOutputSchema,
  }),
  'cockpit.search': query({
    name: 'cockpit.search',
    summary: {
      de: 'Artikel, Rezepte, Lieferanten und Plätze finden, deren Name jedes getippte Wort enthält.',
      en: 'Find articles, recipes, suppliers and spots whose name contains every typed word.',
    },
    scopes: ['stock:read', 'recipes:read'],
    input: z.object({ ...queryBase, text: z.string().trim().max(80) }),
    output: CockpitSearchOutputSchema,
  }),
} as const satisfies ContractFragment;
