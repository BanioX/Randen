import { z } from 'zod';
import {
  command,
  commandBase,
  query,
  queryBase,
  type ContractFragment,
} from '../../contract/operation';
import { ArticleCategoryIdSchema } from '../../domain/categories';
import { IdSchema } from '../../ids';
import { RappenSchema } from '../../money';
import { BudgetSchema } from '../../model/sales';
import {
  BpsSchema,
  LocalDateSchema,
  nameSchema,
  textSchema,
  UnitSchema,
  WeekdaySchema,
  YearMonthSchema,
} from '../../model/primitives';
import { WasteReasonSchema } from '../../model/stock';

/** The four kinds of loss a kitchen measures (`wasteKind`, «Abschreiber» by kind). */
export const WasteKindSchema = z.enum(['storage', 'production', 'plate', 'other']);
export type WasteKindId = z.infer<typeof WasteKindSchema>;

/** Why a budget is not compared: the parts that stay empty and the reason in data. */
export const MissingReasonSchema = z.enum([
  'no_fixed_costs',
  'no_revenue',
  'no_contribution',
  'no_portions',
]);
export type MissingReason = z.infer<typeof MissingReasonSchema>;

/** The status of a budget: on track, up to 10 % over the projection, or over. */
export const BudgetStatusSchema = z.enum(['on_track', 'tight', 'over']);
export type BudgetStatus = z.infer<typeof BudgetStatusSchema>;

/** A share in basis points, not capped at 100 % (a cost can exceed the revenue). */
const ShareSchema = z.int().min(0);

/** The money of a period: purchases, cost of goods, write-offs, count differences, sales. */
export const TotalsSchema = z.object({
  purchasesRappen: RappenSchema,
  costOfGoodsRappen: RappenSchema,
  wasteRappen: RappenSchema,
  /** Count differences as positive amounts: what the counts found missing, and what they found extra. */
  countLossRappen: RappenSchema,
  countGainRappen: RappenSchema,
  grossRevenueRappen: RappenSchema,
  netRevenueRappen: RappenSchema,
  /** Net revenue less cost of goods («Deckungsbeitrag»). */
  contributionRappen: RappenSchema,
  /** Cost of goods as a share of net revenue; missing without revenue. */
  foodCostBps: ShareSchema.optional(),
});
export type Totals = z.infer<typeof TotalsSchema>;

export const SeriesDaySchema = z.object({
  day: LocalDateSchema,
  purchasesRappen: RappenSchema,
  costOfGoodsRappen: RappenSchema,
  wasteRappen: RappenSchema,
  netRevenueRappen: RappenSchema,
});

/** What makes the numbers of a period incomplete (ADR-0008): shown, never hidden. */
export const IncompleteSchema = z.object({
  /** Days up to today without any sales entry. */
  daysWithoutSales: z.int().min(0),
  /** Goods taken from stock on those days. */
  consumptionWithoutSalesRappen: RappenSchema,
  /** Dishes sold in the period whose cost is not complete (a price is missing). */
  dishesWithoutCost: z.int().min(0),
});
export type Incomplete = z.infer<typeof IncompleteSchema>;

/** The share of one supplier or article category in the purchases of a month. */
export const PurchaseShareSchema = z.object({
  /** Missing: goods without a supplier on their lot. */
  supplierId: IdSchema.optional(),
  supplierName: nameSchema(80).optional(),
  categoryId: ArticleCategoryIdSchema.optional(),
  categoryLabel: nameSchema(80).optional(),
  purchasesRappen: RappenSchema,
});
export type PurchaseShare = z.infer<typeof PurchaseShareSchema>;

export const BudgetFiguresSchema = z.object({
  month: YearMonthSchema,
  budgetRappen: RappenSchema.optional(),
  revenueTargetRappen: RappenSchema.optional(),
  fixedCostsRappen: RappenSchema.optional(),
  targetFoodCostBps: BpsSchema.optional(),
  /** Purchases of the month so far. */
  spentRappen: RappenSchema,
  remainingRappen: RappenSchema.optional(),
  spentBps: ShareSchema.optional(),
  /** The share of the month that has passed: today for the running month, 100 % for past months. */
  monthPassedBps: BpsSchema,
  day: z.int().min(0),
  daysInMonth: z.int().min(1),
  /** Purchases at the pace so far, projected to the end of the month. */
  projectionRappen: RappenSchema.optional(),
  status: BudgetStatusSchema.optional(),
  suppliers: z.array(PurchaseShareSchema),
  categories: z.array(PurchaseShareSchema),
});
export type BudgetFigures = z.infer<typeof BudgetFiguresSchema>;

/** Goods per meal («Wareneinsatz pro Mahlzeit») of one menu line, computed, never stored. */
export const MealLineSchema = z.object({
  lineId: IdSchema,
  name: nameSchema(40),
  servedMeals: z.int().min(0),
  /** Consumption of the productions of this line's plan entries. */
  goodsRappen: RappenSchema,
  perMealRappen: RappenSchema.optional(),
  targetPerMealRappen: RappenSchema.optional(),
});

export const MealFiguresSchema = z.object({
  servedMeals: z.int().min(0),
  goodsRappen: RappenSchema,
  perMealRappen: RappenSchema.optional(),
  /** From the budget of the month: `Budget.costPerMealRappen`; missing as long as it is not set. */
  targetPerMealRappen: RappenSchema.optional(),
  /** Plate returns («Tellerrücklauf») in grams, and per meal served. */
  plateReturnGrams: z.number().min(0),
  plateReturnPerMealGrams: z.number().min(0).optional(),
  /** Cost per kilogram of gram-articles consumed in the period. */
  costPerKgRappen: RappenSchema.optional(),
  plateReturnValueRappen: RappenSchema.optional(),
  lines: z.array(MealLineSchema),
});
export type MealFigures = z.infer<typeof MealFiguresSchema>;

export const OverviewSchema = z.object({
  from: LocalDateSchema,
  to: LocalDateSchema,
  previousFrom: LocalDateSchema,
  previousTo: LocalDateSchema,
  days: z.int().min(1),
  current: TotalsSchema,
  /** The period of equal length before. */
  previous: TotalsSchema,
  targetFoodCostBps: BpsSchema,
  stock: z.object({
    valueRappen: RappenSchema,
    articleCount: z.int().min(0),
  }),
  series: z.array(SeriesDaySchema),
  incomplete: IncompleteSchema,
  budget: BudgetFiguresSchema,
  meals: MealFiguresSchema,
});
export type Overview = z.infer<typeof OverviewSchema>;

export const BudgetFieldsSchema = z.object({
  purchaseBudgetRappen: RappenSchema.min(0),
  revenueTargetRappen: RappenSchema.min(0).optional(),
  targetFoodCostBps: BpsSchema.optional(),
  fixedCostsRappen: RappenSchema.min(0).optional(),
  /** Left out: the stored value stays. Only a budget page for meals sets it. */
  costPerMealRappen: RappenSchema.min(0).optional(),
  note: textSchema(300).optional(),
});
export type BudgetFields = z.infer<typeof BudgetFieldsSchema>;

export const BudgetHistorySchema = z.object({
  month: YearMonthSchema,
  budgetRappen: RappenSchema.optional(),
  purchasesRappen: RappenSchema,
  costOfGoodsRappen: RappenSchema,
  netRevenueRappen: RappenSchema,
  foodCostBps: ShareSchema.optional(),
});

export const BudgetPageSchema = z.object({
  month: YearMonthSchema,
  budget: BudgetSchema.optional(),
  /** Without a row for this month: the fields of the month before, to be confirmed. */
  proposal: BudgetFieldsSchema.optional(),
  proposalFrom: YearMonthSchema.optional(),
  /** The six months up to this one, the one of the page last. */
  history: z.array(BudgetHistorySchema),
});

export const BreakEvenSchema = z.object({
  month: YearMonthSchema,
  today: LocalDateSchema,
  netRevenueRappen: RappenSchema,
  costOfGoodsRappen: RappenSchema,
  contributionRappen: RappenSchema,
  contributionBps: ShareSchema.optional(),
  fixedCostsRappen: RappenSchema.optional(),
  /** Net revenue at which the kitchen earns money. */
  breakEvenRappen: RappenSchema.optional(),
  /** Net revenue so far minus the break-even: negative = short of it. */
  gapRappen: RappenSchema.optional(),
  reached: z.boolean().optional(),
  /** The first day of the month on which the net revenue reached the break-even. */
  reachedOn: LocalDateSchema.optional(),
  neededRappen: RappenSchema.optional(),
  /** Days from today to the end of the month, today included; of a past month none. */
  remainingDays: z.int().min(0),
  neededPerDayRappen: RappenSchema.optional(),
  portionsSold: z.number().min(0),
  averageMarginRappen: RappenSchema.optional(),
  breakEvenPortions: z.int().min(0).optional(),
  reasons: z.array(MissingReasonSchema),
});
export type BreakEvenFigures = z.infer<typeof BreakEvenSchema>;

export const WasteAmountSchema = z.object({
  valueRappen: RappenSchema,
  grams: z.number().min(0),
  millilitres: z.number().min(0),
  pieces: z.number().min(0),
  count: z.int().min(0),
});

export const WasteByKindSchema = WasteAmountSchema.extend({
  kind: WasteKindSchema,
  label: nameSchema(40),
});
export const WasteByReasonSchema = WasteAmountSchema.extend({
  reason: WasteReasonSchema,
  label: nameSchema(40),
  kind: WasteKindSchema,
});
export const WasteArticleSchema = z.object({
  articleId: IdSchema,
  name: nameSchema(120),
  unit: UnitSchema,
  valueRappen: RappenSchema,
  quantity: z.number().min(0),
  count: z.int().min(0),
});

export const WasteBlockSchema = z.object({
  totalRappen: RappenSchema,
  byKind: z.array(WasteByKindSchema),
  byReason: z.array(WasteByReasonSchema),
  topArticles: z.array(WasteArticleSchema),
  byWeekday: z.array(z.object({ weekday: WeekdaySchema, valueRappen: RappenSchema })),
});

export const WasteReportSchema = WasteBlockSchema.extend({
  from: LocalDateSchema,
  to: LocalDateSchema,
  previousFrom: LocalDateSchema,
  previousTo: LocalDateSchema,
  previousRappen: RappenSchema,
  /** Signed change against the period before, in basis points; missing without a basis. */
  changeBps: z.int().optional(),
  purchasesRappen: RappenSchema,
  /** Write-offs as a share of purchases; missing without purchases. */
  shareOfPurchasesBps: ShareSchema.optional(),
});
export type WasteReport = z.infer<typeof WasteReportSchema>;

export const DishFigureSchema = z.object({
  recipeId: IdSchema,
  name: nameSchema(120),
  portions: z.number().min(0),
  netRevenueRappen: RappenSchema,
  costRappen: RappenSchema,
  contributionRappen: RappenSchema,
  foodCostBps: ShareSchema.optional(),
});

export const MonthReportSchema = z.object({
  month: YearMonthSchema,
  businessName: nameSchema(80),
  from: LocalDateSchema,
  to: LocalDateSchema,
  targetFoodCostBps: BpsSchema,
  totals: TotalsSchema,
  stockValueEndRappen: RappenSchema,
  budget: BudgetFiguresSchema,
  breakEven: BreakEvenSchema,
  waste: WasteBlockSchema.extend({
    shareOfPurchasesBps: ShareSchema.optional(),
  }),
  dishes: z.object({
    best: z.array(DishFigureSchema),
    weakest: z.array(DishFigureSchema),
    withoutCost: z.int().min(0),
  }),
  incomplete: IncompleteSchema,
  meals: MealFiguresSchema,
});
export type MonthReport = z.infer<typeof MonthReportSchema>;

const periodFields = { from: LocalDateSchema, to: LocalDateSchema };

/** «Zahlen»: the money side of the kitchen, read from the stock ledger and the sales (ADR-0015). */
export const numbersContract = {
  'numbers.overview': query({
    name: 'numbers.overview',
    summary: {
      de: 'Einkauf, Wareneinsatz, Abschreiber, Umsatz und Lagerwert eines Zeitraums, mit Vergleich.',
      en: 'Purchases, cost of goods, write-offs, revenue and stock value of a period, with comparison.',
    },
    scopes: ['numbers:read'],
    input: z.object({ ...queryBase, ...periodFields }),
    output: OverviewSchema,
  }),
  'budgets.get': query({
    name: 'budgets.get',
    summary: {
      de: 'Das Budget eines Monats, sein Vorschlag aus dem Vormonat und die letzten sechs Monate.',
      en: 'The budget of a month, its proposal from the month before and the last six months.',
    },
    scopes: ['numbers:read'],
    input: z.object({ ...queryBase, month: YearMonthSchema }),
    output: BudgetPageSchema,
  }),
  'budgets.set': command({
    name: 'budgets.set',
    summary: {
      de: 'Das Budget eines Monats anlegen oder ersetzen.',
      en: 'Create or replace the budget of a month.',
    },
    scopes: ['numbers:write'],
    input: z.object({ ...commandBase, month: YearMonthSchema, ...BudgetFieldsSchema.shape }),
    output: z.object({ budget: BudgetSchema }),
  }),
  'numbers.budget': query({
    name: 'numbers.budget',
    summary: {
      de: 'Einkauf gegen Budget eines Monats, mit Prognose und Aufteilung nach Lieferant und Warengruppe.',
      en: 'Purchases against the budget of a month, with projection and split by supplier and category.',
    },
    scopes: ['numbers:read'],
    input: z.object({ ...queryBase, month: YearMonthSchema }),
    output: BudgetFiguresSchema,
  }),
  'numbers.breakEven': query({
    name: 'numbers.breakEven',
    summary: {
      de: 'Break-even eines Monats: ab wann die Küche Geld verdient, und was noch fehlt.',
      en: 'Break-even of a month: from which revenue the kitchen earns money, and what is still missing.',
    },
    scopes: ['numbers:read'],
    input: z.object({ ...queryBase, month: YearMonthSchema }),
    output: BreakEvenSchema,
  }),
  'numbers.waste': query({
    name: 'numbers.waste',
    summary: {
      de: 'Abschreiber eines Zeitraums nach Art und Grund, in Franken und Kilogramm.',
      en: 'Write-offs of a period by kind and reason, in francs and kilograms.',
    },
    scopes: ['numbers:read'],
    input: z.object({ ...queryBase, ...periodFields }),
    output: WasteReportSchema,
  }),
  'numbers.monthReport': query({
    name: 'numbers.monthReport',
    summary: {
      de: 'Der Monatsbericht: Wareneinsatz, Umsatz, Budget, Abschreiber, Break-even und die besten und schwächsten Gerichte.',
      en: 'The month report: cost of goods, revenue, budget, write-offs, break-even and the best and weakest dishes.',
    },
    scopes: ['numbers:read'],
    input: z.object({ ...queryBase, month: YearMonthSchema }),
    output: MonthReportSchema,
  }),
} as const satisfies ContractFragment;
