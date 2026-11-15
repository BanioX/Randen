import { articleCategoryLabel, type ArticleCategoryId } from '../../domain/categories';
import {
  breakEven,
  breakEvenPortions,
  foodCostBps,
  netOfVat,
  recipeCost,
  type CostBook,
} from '../../domain/costing';
import { costOfGoods, costPerMeal, mealGoods, mealTotal } from '../../domain/meals';
import { addDays, addMonths, daysBetween, localDate } from '../../dates';
import { lineValue, milliToRappen, roundQuantity } from '../../domain/units';
import type { Id } from '../../ids';
import { rappen, type Rappen } from '../../money';
import type { Budget } from '../../model/sales';
import type { MealCount } from '../../model/menu';
import {
  WEEKDAYS,
  YearMonthSchema,
  type LocalDate,
  type Weekday,
  type YearMonth,
} from '../../model/primitives';
import {
  WASTE_KINDS,
  WasteReasonSchema,
  wasteKind,
  wasteKindLabel,
  wasteReasonLabel,
  type StockMovement,
  type WasteKind,
} from '../../model/stock';
import type { NumbersData } from './data';
import type {
  BreakEvenFigures,
  BudgetFields,
  BudgetFigures,
  Incomplete,
  PurchaseShare,
  MealFigures,
  MissingReason,
  MonthReport,
  Overview,
  Totals,
  WasteReport,
} from './contract';

/** A long range is cut here: a year of days is the most a page asks for. */
const MAX_DAYS = 3660;
/** The articles of the write-off ranking and the dishes of the report. */
const TOP_ARTICLES = 10;
const TOP_DISHES = 5;
/** A budget projection up to this share above the budget is «knapp» (tight). */
const TIGHT_BPS = 11_000;

const sum = (values: readonly number[]): number =>
  values.reduce((total, value) => total + value, 0);
const inside = (day: LocalDate, from: LocalDate, to: LocalDate) => day >= from && day <= to;
const share = (part: number, whole: number): number | undefined =>
  whole > 0 ? Math.round((part * 10_000) / whole) : undefined;

export function monthOf(day: LocalDate): YearMonth {
  return YearMonthSchema.parse(day.slice(0, 7));
}
export function monthStartOf(month: YearMonth): LocalDate {
  return localDate(`${month}-01`);
}
export function monthEndOf(month: YearMonth): LocalDate {
  return addDays(addMonths(monthStartOf(month), 1), -1);
}
export function daysInMonth(month: YearMonth): number {
  return daysBetween(monthStartOf(month), addMonths(monthStartOf(month), 1));
}
export function shiftMonth(month: YearMonth, by: number): YearMonth {
  return monthOf(addMonths(monthStartOf(month), by));
}
/** The day of the month, 1 to 31, from the calendar day alone. */
const dayOfMonth = (day: LocalDate) => Number(day.slice(8, 10));

/** Monday to Sunday, from the calendar day alone (no time zone involved). */
export function weekdayOf(day: LocalDate): Weekday {
  const [year = 0, month = 1, date = 1] = day.split('-').map(Number);
  const index = (new Date(Date.UTC(year, month - 1, date)).getUTCDay() + 6) % 7;
  return WEEKDAYS[index] ?? 'mon';
}

/** Every day from `from` to `to`, both included; a range longer than a year is cut. */
export function daysFrom(from: LocalDate, to: LocalDate): LocalDate[] {
  const days: LocalDate[] = [];
  for (let day = from; day <= to && days.length < MAX_DAYS; day = addDays(day, 1)) {
    days.push(day);
  }
  return days;
}

/** The period of equal length right before `from`. */
export function previousPeriod(from: LocalDate, to: LocalDate) {
  const days = daysBetween(from, to) + 1;
  return { from: addDays(from, -days), to: addDays(from, -1) };
}

/* ── The ledger and the sales of a period ─────────────────────────────────────────────── */

/** One period of the ledger and the sales, summed. Every amount is a positive figure or a sum. */
interface Flow {
  purchases: number;
  consumed: number;
  produced: number;
  cost: Rappen;
  waste: number;
  countLoss: number;
  countGain: number;
  countNet: number;
  gross: number;
  net: number;
  movements: readonly StockMovement[];
  sales: NumbersData['sales'];
}

function flowOf(data: NumbersData, from: LocalDate, to: LocalDate): Flow {
  const movements = data.movements.filter((movement) => inside(movement.on, from, to));
  const valueOf = (type: StockMovement['type']) =>
    sum(movements.filter((movement) => movement.type === type).map((m) => m.valueRappen));
  const counts = movements
    .filter((movement) => movement.type === 'adjustment' && movement.countId !== undefined)
    .map((movement) => movement.valueRappen);
  const consumed = 0 - valueOf('consumption');
  const produced = valueOf('production');
  const sales = data.sales.filter((sale) => inside(sale.soldOn, from, to));
  return {
    purchases: valueOf('receipt'),
    consumed,
    produced,
    cost: costOfGoods({ consumed, produced }),
    waste: 0 - valueOf('waste'),
    countLoss: 0 - sum(counts.filter((value) => value < 0)),
    countGain: sum(counts.filter((value) => value > 0)),
    countNet: sum(counts),
    gross: sum(sales.map((sale) => sale.grossRappen)),
    net: sum(sales.map((sale) => netOfVat(sale.grossRappen, sale.vatBps))),
    movements,
    sales,
  };
}

function totalsOf(flow: Flow): Totals {
  const net = rappen(flow.net);
  const share = foodCostBps(flow.cost, net);
  return {
    purchasesRappen: rappen(flow.purchases),
    costOfGoodsRappen: flow.cost,
    wasteRappen: rappen(flow.waste),
    countLossRappen: rappen(flow.countLoss),
    countGainRappen: rappen(flow.countGain),
    grossRevenueRappen: rappen(flow.gross),
    netRevenueRappen: net,
    contributionRappen: rappen(net - flow.cost),
    ...(share === undefined ? {} : { foodCostBps: share }),
  };
}

/** Stock on hand today, and the value on a day from the ledger (every movement up to it). */
function stockOf(data: NumbersData) {
  const live = data.lots.filter((lot) => lot.status === 'active' && lot.quantity > 0);
  return {
    valueRappen: rappen(sum(live.map((lot) => lineValue(lot.quantity, lot.pricePer1000)))),
    articleCount: new Set(live.map((lot) => lot.articleId)).size,
  };
}

function stockValueAt(data: NumbersData, day: LocalDate): Rappen {
  return rappen(sum(data.movements.filter((m) => m.on <= day).map((m) => m.valueRappen)));
}

/** The days up to today without a sales entry, and the goods taken from stock on them. */
function incompleteOf(data: NumbersData, from: LocalDate, to: LocalDate, flow: Flow): Incomplete {
  const end = to < data.today ? to : data.today;
  const salesDays = new Set(flow.sales.map((sale) => sale.soldOn));
  const withoutSales = new Set(daysFrom(from, end).filter((day) => !salesDays.has(day)));
  const consumptionWithoutSales =
    0 -
    sum(
      flow.movements
        .filter((m) => m.type === 'consumption' && withoutSales.has(m.on))
        .map((m) => m.valueRappen),
    );
  return {
    daysWithoutSales: withoutSales.size,
    consumptionWithoutSalesRappen: rappen(consumptionWithoutSales),
    dishesWithoutCost: dishesOf(data, from, to).withoutCost,
  };
}

function seriesOf(data: NumbersData, from: LocalDate, to: LocalDate) {
  return daysFrom(from, to).map((day) => {
    const flow = flowOf(data, day, day);
    return {
      day,
      purchasesRappen: rappen(flow.purchases),
      costOfGoodsRappen: flow.cost,
      wasteRappen: rappen(flow.waste),
      netRevenueRappen: rappen(flow.net),
    };
  });
}

/* ── Dishes: cost from the recipes, revenue from the sales ───────────────────────────── */

function costBook(data: NumbersData): CostBook {
  return { articles: data.articles, recipes: data.recipes };
}

/** What one portion of a recipe costs, in thousandths of a Rappen; `complete` only with every price. */
function portionCostOf(data: NumbersData, recipeId: Id) {
  const recipe = data.recipes.get(recipeId);
  if (recipe === undefined) {
    return { perPortionMilli: 0, complete: false };
  }
  const cost = recipeCost(recipe, costBook(data));
  return {
    perPortionMilli: cost.perPortionMilli,
    complete: cost.missingPrices.length === 0 && cost.totalMilli > 0,
  };
}

interface DishLine {
  recipeId: Id;
  name: string;
  portions: number;
  netRevenueRappen: Rappen;
  costRappen: Rappen;
  contributionRappen: Rappen;
  foodCostBps?: number;
}

/** The dishes sold in a period with their margins; dishes whose cost is incomplete are counted apart. */
function dishesOf(data: NumbersData, from: LocalDate, to: LocalDate) {
  const perDish = new Map<Id, { portions: number; net: number; costMilli: number }>();
  const incomplete = new Set<Id>();
  for (const sale of data.sales) {
    if (sale.recipeId === undefined || !inside(sale.soldOn, from, to)) {
      continue;
    }
    const portion = portionCostOf(data, sale.recipeId);
    if (!portion.complete) {
      incomplete.add(sale.recipeId);
      continue;
    }
    const entry = perDish.get(sale.recipeId) ?? { portions: 0, net: 0, costMilli: 0 };
    perDish.set(sale.recipeId, {
      portions: entry.portions + sale.portions,
      net: entry.net + netOfVat(sale.grossRappen, sale.vatBps),
      costMilli: entry.costMilli + Math.round(portion.perPortionMilli * sale.portions),
    });
  }
  const lines: DishLine[] = [...perDish].map(([recipeId, entry]) => {
    const cost = milliToRappen(entry.costMilli);
    const net = rappen(entry.net);
    const foodCost = foodCostBps(cost, net);
    return {
      recipeId,
      name: data.recipes.get(recipeId)?.name ?? '',
      portions: roundQuantity(entry.portions),
      netRevenueRappen: net,
      costRappen: cost,
      contributionRappen: rappen(net - cost),
      ...(foodCost === undefined ? {} : { foodCostBps: foodCost }),
    };
  });
  return { lines, withoutCost: incomplete.size };
}

/** The best and the weakest dishes by their contribution; a dish is in one list only. */
function rankDishes(lines: readonly DishLine[]) {
  const best = [...lines]
    .sort(
      (a, b) =>
        b.contributionRappen - a.contributionRappen || a.name.localeCompare(b.name, 'de-CH'),
    )
    .slice(0, TOP_DISHES);
  const bestIds = new Set(best.map((line) => line.recipeId));
  const weakest = [...lines]
    .filter((line) => !bestIds.has(line.recipeId))
    .sort(
      (a, b) =>
        a.contributionRappen - b.contributionRappen || a.name.localeCompare(b.name, 'de-CH'),
    )
    .slice(0, TOP_DISHES);
  return { best, weakest };
}

/* ── Budget ──────────────────────────────────────────────────────────────────────────── */

export function budgetRowOf(data: NumbersData, month: YearMonth): Budget | undefined {
  return data.budgets
    .filter((row) => row.month === month)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
}

/**
 * The budget of a month against the purchases of it. The projection takes the pace so far to the
 * end of the month. Status: «over» when spent is above the budget or the projection more than 10 %
 * above it; «tight» when the projection is above the budget up to 10 %; otherwise «on_track».
 */
export function budgetFiguresOf(
  data: NumbersData,
  month: YearMonth,
  row: Budget | undefined,
): BudgetFigures {
  const start = monthStartOf(month);
  const end = monthEndOf(month);
  const days = daysInMonth(month);
  const current = monthOf(data.today);
  const receipts = data.movements.filter(
    (movement) => movement.type === 'receipt' && inside(movement.on, start, end),
  );
  const spent = sum(receipts.map((movement) => movement.valueRappen));
  const day = month === current ? dayOfMonth(data.today) : month < current ? days : 0;
  const passed = share(day, days) ?? 0;
  const projection = day > 0 ? Math.round((spent * days) / day) : undefined;
  const budget = row?.purchaseBudgetRappen;
  const spentBps = budget === undefined ? undefined : share(spent, budget);
  const status =
    budget === undefined
      ? undefined
      : spent > budget
        ? ('over' as const)
        : projection === undefined || projection <= budget
          ? ('on_track' as const)
          : projection * 10_000 <= budget * TIGHT_BPS
            ? ('tight' as const)
            : ('over' as const);
  return {
    month,
    ...(budget === undefined ? {} : { budgetRappen: budget }),
    ...(row?.revenueTargetRappen === undefined
      ? {}
      : { revenueTargetRappen: row.revenueTargetRappen }),
    ...(row?.fixedCostsRappen === undefined ? {} : { fixedCostsRappen: row.fixedCostsRappen }),
    ...(row?.targetFoodCostBps === undefined ? {} : { targetFoodCostBps: row.targetFoodCostBps }),
    spentRappen: rappen(spent),
    ...(budget === undefined ? {} : { remainingRappen: rappen(budget - spent) }),
    ...(spentBps === undefined ? {} : { spentBps }),
    monthPassedBps: passed,
    day,
    daysInMonth: days,
    ...(projection === undefined ? {} : { projectionRappen: rappen(projection) }),
    ...(status === undefined ? {} : { status }),
    suppliers: supplierSharesOf(data, receipts),
    categories: categorySharesOf(data, receipts),
  };
}

/** Purchases of a month by supplier, the largest first; goods without a supplier stand apart. */
function supplierSharesOf(data: NumbersData, receipts: readonly StockMovement[]): PurchaseShare[] {
  const totals = new Map<Id | undefined, number>();
  for (const receipt of receipts) {
    const supplierId = data.lotById.get(receipt.lotId)?.supplierId;
    totals.set(supplierId, (totals.get(supplierId) ?? 0) + receipt.valueRappen);
  }
  return [...totals]
    .map(([supplierId, value]): PurchaseShare => {
      const name = supplierId === undefined ? undefined : data.suppliers.get(supplierId)?.name;
      return {
        ...(supplierId === undefined ? {} : { supplierId }),
        ...(name === undefined ? {} : { supplierName: name }),
        purchasesRappen: rappen(value),
      };
    })
    .sort((a, b) => b.purchasesRappen - a.purchasesRappen);
}

/** Purchases of a month by article category, the largest first. */
function categorySharesOf(data: NumbersData, receipts: readonly StockMovement[]): PurchaseShare[] {
  const totals = new Map<ArticleCategoryId | undefined, number>();
  for (const receipt of receipts) {
    const categoryId = data.articles.get(receipt.articleId)?.categoryId;
    totals.set(categoryId, (totals.get(categoryId) ?? 0) + receipt.valueRappen);
  }
  return [...totals]
    .map(([categoryId, value]): PurchaseShare => ({
      ...(categoryId === undefined
        ? {}
        : { categoryId, categoryLabel: articleCategoryLabel(categoryId) }),
      purchasesRappen: rappen(value),
    }))
    .sort((a, b) => b.purchasesRappen - a.purchasesRappen);
}

/* ── Break-even ──────────────────────────────────────────────────────────────────────── */

export function breakEvenOf(
  data: NumbersData,
  month: YearMonth,
  row: Budget | undefined,
): BreakEvenFigures {
  const start = monthStartOf(month);
  const end = monthEndOf(month);
  const flow = flowOf(data, start, end);
  const net = rappen(flow.net);
  const cost = flow.cost;
  const contribution = rappen(net - cost);
  const fixed = row?.fixedCostsRappen;
  const hasFixed = fixed !== undefined && fixed > 0;

  // Portions with a complete cost: their margin per portion gives the average.
  let portions = 0;
  let margin = 0;
  for (const sale of flow.sales) {
    if (sale.recipeId === undefined) {
      continue;
    }
    const portion = portionCostOf(data, sale.recipeId);
    if (!portion.complete) {
      continue;
    }
    portions += sale.portions;
    margin +=
      netOfVat(sale.grossRappen, sale.vatBps) -
      milliToRappen(Math.round(portion.perPortionMilli * sale.portions));
  }
  const averageMargin = portions > 0 ? rappen(Math.round(margin / portions)) : undefined;

  const reasons: MissingReason[] = [];
  if (!hasFixed) {
    reasons.push('no_fixed_costs');
  }
  if (net <= 0) {
    reasons.push('no_revenue');
  } else if (contribution <= 0) {
    reasons.push('no_contribution');
  }
  if (portions === 0) {
    reasons.push('no_portions');
  }

  const point =
    hasFixed && net > 0 && contribution > 0
      ? breakEven({
          fixedCostsRappen: rappen(fixed),
          netRevenueRappen: net,
          costOfGoodsRappen: cost,
        })
      : undefined;
  const current = monthOf(data.today);
  const days = daysInMonth(month);
  const remainingDays =
    month === current ? days - dayOfMonth(data.today) + 1 : month > current ? days : 0;
  const needed = point === undefined ? undefined : rappen(Math.max(0, point.revenueRappen - net));
  const neededPerDay =
    needed === undefined
      ? undefined
      : needed === 0
        ? rappen(0)
        : remainingDays > 0
          ? rappen(Math.ceil(needed / remainingDays))
          : undefined;

  // The first day on which the revenue so far reached the break-even.
  let reachedOn: LocalDate | undefined;
  if (point !== undefined) {
    const daily = new Map<LocalDate, number>();
    for (const sale of flow.sales) {
      daily.set(
        sale.soldOn,
        (daily.get(sale.soldOn) ?? 0) + netOfVat(sale.grossRappen, sale.vatBps),
      );
    }
    let cumulative = 0;
    for (const day of [...daily.keys()].sort()) {
      cumulative += daily.get(day) ?? 0;
      if (cumulative >= point.revenueRappen) {
        reachedOn = day;
        break;
      }
    }
  }

  const breakEvenPoint = point?.revenueRappen;
  const portionsNeeded =
    hasFixed && averageMargin !== undefined ? breakEvenPortions(fixed, averageMargin) : undefined;
  const contributionBps = net > 0 && contribution >= 0 ? share(contribution, net) : undefined;
  return {
    month,
    today: data.today,
    netRevenueRappen: net,
    costOfGoodsRappen: cost,
    contributionRappen: contribution,
    ...(contributionBps === undefined ? {} : { contributionBps }),
    ...(hasFixed ? { fixedCostsRappen: rappen(fixed) } : {}),
    ...(breakEvenPoint === undefined ? {} : { breakEvenRappen: breakEvenPoint }),
    ...(breakEvenPoint === undefined ? {} : { gapRappen: rappen(net - breakEvenPoint) }),
    ...(point === undefined ? {} : { reached: net >= point.revenueRappen }),
    ...(reachedOn === undefined ? {} : { reachedOn }),
    ...(needed === undefined ? {} : { neededRappen: needed }),
    remainingDays,
    ...(neededPerDay === undefined ? {} : { neededPerDayRappen: neededPerDay }),
    portionsSold: portions,
    ...(averageMargin === undefined ? {} : { averageMarginRappen: averageMargin }),
    ...(portionsNeeded === undefined ? {} : { breakEvenPortions: portionsNeeded }),
    reasons,
  };
}

/* ── Meals ───────────────────────────────────────────────────────────────────────────── */

/**
 * Goods per meal and plate returns of a period. Goods: the cost-of-goods rule of the domain with
 * the count differences (TD-27: open). Per line: the consumption of the productions whose plan
 * entry belongs to the line, against the meals served in that line. Plate returns per meal in
 * grams, and their value at the goods cost per kilogram of the period.
 */
function mealsOf(
  data: NumbersData,
  from: LocalDate,
  to: LocalDate,
  row: Budget | undefined,
  flow: Flow,
): MealFigures {
  const counts = data.mealCounts.filter((count) => inside(count.date, from, to));
  const perMeal = new Map<string, MealCount[]>();
  for (const count of counts) {
    const key = `${count.date} ${count.slot}`;
    perMeal.set(key, [...(perMeal.get(key) ?? []), count]);
  }
  const served = sum([...perMeal.values()].map((rows) => mealTotal(rows).served ?? 0));
  const goods = mealGoods({
    consumed: flow.consumed,
    produced: flow.produced,
    countDifference: flow.countNet,
  });
  const target = row?.costPerMealRappen;

  const plateGrams = sum(
    data.wasteWeighings
      .filter((weighing) => weighing.kind === 'plate' && inside(weighing.date, from, to))
      .map((weighing) => weighing.grams),
  );
  const consumedGrams = flow.movements
    .filter((m) => m.type === 'consumption' && data.articles.get(m.articleId)?.unit === 'g')
    .reduce(
      (total, m) => ({ grams: total.grams - m.quantity, value: total.value - m.valueRappen }),
      { grams: 0, value: 0 },
    );
  const costPerKg =
    consumedGrams.grams > 0
      ? Math.round((consumedGrams.value * 1000) / consumedGrams.grams)
      : undefined;

  const lines = data.menuLines
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((line) => {
      const servedLine = sum(
        counts.filter((count) => count.lineId === line.id).map((count) => count.served ?? 0),
      );
      const goodsLine = sum(
        flow.movements
          .filter((m) => {
            if (m.type !== 'consumption' || m.productionId === undefined) {
              return false;
            }
            const production = data.productions.get(m.productionId);
            const entry =
              production?.planEntryId === undefined
                ? undefined
                : data.planEntries.get(production.planEntryId);
            return entry?.lineId === line.id;
          })
          .map((m) => 0 - m.valueRappen),
      );
      return { line, servedLine, goodsLine };
    })
    .filter(({ servedLine, goodsLine }) => servedLine > 0 || goodsLine > 0)
    .map(({ line, servedLine, goodsLine }) => {
      const lineGoods = rappen(goodsLine);
      const lineMeal = costPerMeal(lineGoods, servedLine);
      return {
        lineId: line.id,
        name: line.name,
        servedMeals: servedLine,
        goodsRappen: lineGoods,
        ...(lineMeal === undefined ? {} : { perMealRappen: lineMeal }),
        ...(line.costTargetRappen === undefined
          ? {}
          : { targetPerMealRappen: line.costTargetRappen }),
      };
    });

  const meal = costPerMeal(goods, served);
  const valueOfPlate =
    costPerKg === undefined ? undefined : Math.round((plateGrams * costPerKg) / 1000);
  return {
    servedMeals: served,
    goodsRappen: goods,
    ...(meal === undefined ? {} : { perMealRappen: meal }),
    ...(target === undefined ? {} : { targetPerMealRappen: target }),
    plateReturnGrams: plateGrams,
    ...(served > 0 ? { plateReturnPerMealGrams: plateGrams / served } : {}),
    ...(costPerKg === undefined ? {} : { costPerKgRappen: rappen(costPerKg) }),
    ...(valueOfPlate === undefined ? {} : { plateReturnValueRappen: rappen(valueOfPlate) }),
    lines,
  };
}

/* ── Budget page: history ────────────────────────────────────────────────────────────── */

export function budgetHistoryOf(data: NumbersData, month: YearMonth) {
  return [5, 4, 3, 2, 1, 0].map((back) => {
    const current = shiftMonth(month, -back);
    const flow = flowOf(data, monthStartOf(current), monthEndOf(current));
    const row = budgetRowOf(data, current);
    const foodCost = foodCostBps(flow.cost, rappen(flow.net));
    return {
      month: current,
      ...(row === undefined ? {} : { budgetRappen: row.purchaseBudgetRappen }),
      purchasesRappen: rappen(flow.purchases),
      costOfGoodsRappen: flow.cost,
      netRevenueRappen: rappen(flow.net),
      ...(foodCost === undefined ? {} : { foodCostBps: foodCost }),
    };
  });
}

/** The fields of the latest budget before `month`, as a proposal for it. */
export function proposalOf(
  data: NumbersData,
  month: YearMonth,
): { fields: BudgetFields; from: YearMonth } | undefined {
  const row = data.budgets
    .filter((budget) => budget.month < month)
    .sort((a, b) => b.month.localeCompare(a.month))[0];
  if (row === undefined) {
    return undefined;
  }
  return {
    from: row.month,
    fields: {
      purchaseBudgetRappen: row.purchaseBudgetRappen,
      ...(row.revenueTargetRappen === undefined
        ? {}
        : { revenueTargetRappen: row.revenueTargetRappen }),
      ...(row.targetFoodCostBps === undefined ? {} : { targetFoodCostBps: row.targetFoodCostBps }),
      ...(row.fixedCostsRappen === undefined ? {} : { fixedCostsRappen: row.fixedCostsRappen }),
      ...(row.costPerMealRappen === undefined ? {} : { costPerMealRappen: row.costPerMealRappen }),
      ...(row.note === undefined ? {} : { note: row.note }),
    },
  };
}

/* ── Waste ───────────────────────────────────────────────────────────────────────────── */

function wasteBlockOf(data: NumbersData, from: LocalDate, to: LocalDate) {
  const moves = data.movements.filter(
    (movement) => movement.type === 'waste' && inside(movement.on, from, to),
  );
  const amount = (rows: readonly StockMovement[]) => {
    let grams = 0;
    let millilitres = 0;
    let pieces = 0;
    for (const row of rows) {
      const unit = data.articles.get(row.articleId)?.unit;
      const quantity = -row.quantity;
      if (unit === 'g') {
        grams += quantity;
      } else if (unit === 'ml') {
        millilitres += quantity;
      } else if (unit === 'pcs') {
        pieces += quantity;
      }
    }
    return {
      valueRappen: rappen(0 - sum(rows.map((row) => row.valueRappen))),
      grams: roundQuantity(grams),
      millilitres: roundQuantity(millilitres),
      pieces: roundQuantity(pieces),
      count: rows.length,
    };
  };
  const reasonOf = (movement: StockMovement) => movement.reason ?? 'other';
  const byKind = WASTE_KINDS.map((kind) => ({
    kind,
    label: wasteKindLabel(kind),
    ...amount(moves.filter((movement) => kindOf(movement) === kind)),
  }));
  const byReason = WasteReasonSchema.options
    .map((reason) => ({
      reason,
      label: wasteReasonLabel(reason),
      kind: wasteKind(reason),
      ...amount(moves.filter((movement) => reasonOf(movement) === reason)),
    }))
    .filter((row) => row.count > 0);
  const articleIds = new Set(moves.map((movement) => movement.articleId));
  const topArticles = [...articleIds]
    .map((articleId) => {
      const rows = moves.filter((movement) => movement.articleId === articleId);
      const article = data.articles.get(articleId);
      return {
        articleId,
        name: article?.name ?? '',
        unit: article?.unit ?? 'pcs',
        valueRappen: rappen(0 - sum(rows.map((row) => row.valueRappen))),
        quantity: roundQuantity(0 - sum(rows.map((row) => row.quantity))),
        count: rows.length,
      };
    })
    .sort((a, b) => b.valueRappen - a.valueRappen || a.name.localeCompare(b.name, 'de-CH'))
    .slice(0, TOP_ARTICLES);
  const byWeekday = WEEKDAYS.map((weekday) => ({
    weekday,
    valueRappen: rappen(
      0 -
        sum(
          moves.filter((movement) => weekdayOf(movement.on) === weekday).map((m) => m.valueRappen),
        ),
    ),
  }));
  return {
    totalRappen: rappen(0 - sum(moves.map((movement) => movement.valueRappen))),
    byKind,
    byReason,
    topArticles,
    byWeekday,
  };
}

/** The kind of a write-off; a write-off without reason counts as «Anderes». */
function kindOf(movement: StockMovement): WasteKind {
  return movement.reason === undefined ? 'other' : wasteKind(movement.reason);
}

/* ── Use-case level views ────────────────────────────────────────────────────────────── */

export function overviewOf(data: NumbersData, from: LocalDate, to: LocalDate): Overview {
  const previous = previousPeriod(from, to);
  const flow = flowOf(data, from, to);
  const before = flowOf(data, previous.from, previous.to);
  const month = monthOf(to);
  const row = budgetRowOf(data, month);
  return {
    from,
    to,
    previousFrom: previous.from,
    previousTo: previous.to,
    days: daysBetween(from, to) + 1,
    current: totalsOf(flow),
    previous: totalsOf(before),
    targetFoodCostBps: row?.targetFoodCostBps ?? data.business.targetFoodCostBps,
    stock: stockOf(data),
    series: seriesOf(data, from, to),
    incomplete: incompleteOf(data, from, to, flow),
    budget: budgetFiguresOf(data, monthOf(data.today), budgetRowOf(data, monthOf(data.today))),
    meals: mealsOf(data, from, to, row, flow),
  };
}

export function wasteReportOf(data: NumbersData, from: LocalDate, to: LocalDate): WasteReport {
  const previous = previousPeriod(from, to);
  const block = wasteBlockOf(data, from, to);
  const before = wasteBlockOf(data, previous.from, previous.to);
  const purchases = flowOf(data, from, to).purchases;
  const change =
    before.totalRappen > 0
      ? Math.round(((block.totalRappen - before.totalRappen) * 10_000) / before.totalRappen)
      : undefined;
  const shareOfPurchases = share(block.totalRappen, purchases);
  return {
    ...block,
    from,
    to,
    previousFrom: previous.from,
    previousTo: previous.to,
    previousRappen: before.totalRappen,
    ...(change === undefined ? {} : { changeBps: change }),
    purchasesRappen: rappen(purchases),
    ...(shareOfPurchases === undefined ? {} : { shareOfPurchasesBps: shareOfPurchases }),
  };
}

export function budgetOf(data: NumbersData, month: YearMonth): BudgetFigures {
  return budgetFiguresOf(data, month, budgetRowOf(data, month));
}

export function breakEvenView(data: NumbersData, month: YearMonth): BreakEvenFigures {
  return breakEvenOf(data, month, budgetRowOf(data, month));
}

export function monthReportOf(data: NumbersData, month: YearMonth): MonthReport {
  const from = monthStartOf(month);
  const to = monthEndOf(month);
  const flow = flowOf(data, from, to);
  const row = budgetRowOf(data, month);
  const block = wasteBlockOf(data, from, to);
  const purchases = flow.purchases;
  const shareOfPurchases = share(block.totalRappen, purchases);
  const dishes = dishesOf(data, from, to);
  const ranked = rankDishes(dishes.lines);
  return {
    month,
    businessName: data.business.name,
    from,
    to,
    targetFoodCostBps: row?.targetFoodCostBps ?? data.business.targetFoodCostBps,
    totals: totalsOf(flow),
    stockValueEndRappen: stockValueAt(data, to),
    budget: budgetFiguresOf(data, month, row),
    breakEven: breakEvenOf(data, month, row),
    waste: {
      ...block,
      ...(shareOfPurchases === undefined ? {} : { shareOfPurchasesBps: shareOfPurchases }),
    },
    dishes: { ...ranked, withoutCost: dishes.withoutCost },
    incomplete: incompleteOf(data, from, to, flow),
    meals: mealsOf(data, from, to, row, flow),
  };
}
