import { CommandError, type AppContext, type UseCase } from '../../application/command';
import { CONTRACT_V1 } from '../../contract';
import { addDays, addMonths, daysBetween, localDate, toLocalDate } from '../../dates';
import { dishFigures, foodCostBps, netOfVat, recipeCost } from '../../domain/costing';
import { costOfGoods, costPerMeal, mealGoods, mealTotal } from '../../domain/meals';
import { expiryInfo } from '../../domain/expiry';
import { lineValue, roundQuantity } from '../../domain/units';
import type { Id } from '../../ids';
import { rappen, type Rappen } from '../../money';
import type { Business } from '../../model/business';
import type { HygieneCheck, HygieneTask } from '../../model/haccp';
import { PLAN_SLOTS, planSlotLabel, type MealCount, type PlanSlot } from '../../model/menu';
import { WEEKDAYS, YearMonthSchema, type LocalDate, type YearMonth } from '../../model/primitives';
import type { Recipe } from '../../model/recipe';
import { wasteKind, type StockLot, type StockMovement, type WasteKind } from '../../model/stock';
import type { StorageArea } from '../../model/storage-area';
import { alive } from '../../ports/storage';
import {
  COCKPIT_SEARCH_LIMIT,
  COCKPIT_SETUP_ARTICLES,
  COCKPIT_USE_UP_LIMIT,
  type CockpitDish,
  type CockpitMealSlot,
  type CockpitSearch,
  type CockpitTarget,
  type CockpitToday,
  type CockpitTodo,
  type CockpitUseUpLot,
} from './contract';

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'de-CH');
const byOrder = (a: StorageArea, b: StorageArea) => a.sortOrder - b.sortOrder || byName(a, b);

/** «Entrecôte» is found by «entrecote», «Käse» by «KASE». */
function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('de-CH').trim();
}

const lotValue = (lot: StockLot): Rappen => lineValue(lot.quantity, lot.pricePer1000);
const sum = (values: readonly number[]): Rappen =>
  rappen(values.reduce((total, value) => total + value, 0));

/** The band above the target that is «knapp darüber», as for single dishes (`dishFigures`). */
const WATCH_BAND_BPS = 500;
/** How long a business counts as young: it sees its first steps while one is open. */
const YOUNG_DAYS = 30;
/** Write-offs by kind look back this many days, today included. */
const WASTE_DAYS = 30;
/** «Heute verwerten» looks this many days ahead (the «bald» of the expiry rules). */
const USE_UP_DAYS = 3;
/** The most names a row of the day carries. */
const NAMES = 3;
/** Write-offs by kind, in the order of the kitchen when two are worth the same. */
const KIND_ORDER: readonly WasteKind[] = ['storage', 'production', 'plate', 'other'];

/** Monday = 0 … Sunday = 6, from the calendar day alone. */
function weekdayIndex(day: LocalDate): number {
  const [year = 0, month = 1, date = 1] = day.split('-').map(Number);
  return (new Date(Date.UTC(year, month - 1, date)).getUTCDay() + 6) % 7;
}

function monthOf(day: LocalDate): YearMonth {
  return YearMonthSchema.parse(day.slice(0, 7));
}

const firstOfMonth = (day: LocalDate): LocalDate => localDate(`${day.slice(0, 7)}-01`);

function shareStatus(shareBps: number | undefined, targetBps: number) {
  if (shareBps === undefined) {
    return 'unknown' as const;
  }
  return shareBps <= targetBps
    ? ('good' as const)
    : shareBps <= targetBps + WATCH_BAND_BPS
      ? ('watch' as const)
      : ('over' as const);
}

/** A cost per meal against its target: up to 5 % above it is «knapp darüber». */
function perMealStatus(perMeal: number | undefined, target: number | undefined) {
  if (perMeal === undefined || target === undefined) {
    return 'unknown' as const;
  }
  return perMeal <= target
    ? ('good' as const)
    : perMeal * 10_000 <= target * (10_000 + WATCH_BAND_BPS)
      ? ('watch' as const)
      : ('over' as const);
}

const slotOrder = (slot: PlanSlot) => PLAN_SLOTS.indexOf(slot);

/** Between two days, both included. */
const within = (day: LocalDate, from: LocalDate, to: LocalDate) => day >= from && day <= to;

/**
 * Whether a hygiene task still waits today, by the same plan as the haccp page: daily ones until
 * done today, weekly ones only on their weekday until done that day, monthly ones until done this
 * month.
 */
function hygieneDue(task: HygieneTask, checks: readonly HygieneCheck[], today: LocalDate) {
  const done = (from: LocalDate) => checks.some((check) => within(check.on, from, today));
  switch (task.frequency) {
    case 'daily':
      return !done(today);
    case 'weekly':
      return task.weekday === WEEKDAYS[weekdayIndex(today)] && !done(today);
    case 'monthly':
      return !done(firstOfMonth(today));
  }
}

/**
 * Use cases of the cockpit. Both are queries: they read the tables of the business and compute
 * with the rules of the domain (expiry, costing), never with other modules' operations.
 */
export function createCockpitUseCases(ctx: AppContext) {
  const { storage, clock } = ctx;

  async function businessOf(businessId: Id): Promise<Business> {
    const row = await storage.businesses.get(businessId);
    if (row === undefined) {
      throw new CommandError('not_found', `Business ${businessId} not found`);
    }
    return row;
  }

  const today: UseCase<'cockpit.today'> = async (raw) => {
    const input = CONTRACT_V1['cockpit.today'].input.parse(raw);
    const business = await businessOf(input.businessId);
    const day = clock.today();
    const id = input.businessId;
    const [
      articleRows,
      lotRows,
      movementRows,
      areaRows,
      spotRows,
      supplierRows,
      recipeRows,
      orderRows,
      planRows,
      saleRows,
      budgetRows,
      cardRows,
      temperatureRows,
      taskRows,
      checkRows,
      shoppingRows,
      mealCountRows,
    ] = await Promise.all([
      storage.articles.ofBusiness(id),
      storage.lots.ofBusiness(id),
      storage.movements.ofBusiness(id),
      storage.areas.ofBusiness(id),
      storage.spots.ofBusiness(id),
      storage.suppliers.ofBusiness(id),
      storage.recipes.ofBusiness(id),
      storage.orders.ofBusiness(id),
      storage.planEntries.ofBusiness(id),
      storage.sales.ofBusiness(id),
      storage.budgets.ofBusiness(id),
      storage.menuCards.ofBusiness(id),
      storage.temperatureLogs.ofBusiness(id),
      storage.hygieneTasks.ofBusiness(id),
      storage.hygieneChecks.ofBusiness(id),
      storage.shoppingLines.ofBusiness(id),
      storage.mealCounts.ofBusiness(id),
    ]);
    // Deleted articles and areas keep their names: a lot that is still there stays true.
    const articleById = new Map(articleRows.map((row) => [row.id, row]));
    const areaById = new Map(areaRows.map((row) => [row.id, row]));
    const spotById = new Map(alive(spotRows).map((row) => [row.id, row]));
    const articles = alive(articleRows);
    const recipes = alive(recipeRows);
    const lots = alive(lotRows).filter((lot) => lot.status === 'active' && lot.quantity > 0);
    const areas = alive(areaRows).sort(byOrder);

    // ── Stock: value, what is due, what is under its minimum ────────────────────────────
    const stockOf = new Map<Id, number>();
    for (const lot of lots) {
      stockOf.set(lot.articleId, roundQuantity((stockOf.get(lot.articleId) ?? 0) + lot.quantity));
    }
    const articleName = (lot: StockLot): string => articleById.get(lot.articleId)?.name ?? '';
    // The most urgent first: the earliest date, then the name, so the page reads calmly.
    const rated = lots
      .map((lot) => ({ lot, info: expiryInfo(lot.expiresOn, lot.dateKind, day) }))
      .sort(
        (a, b) =>
          (a.lot.expiresOn ?? '9999-12-31').localeCompare(b.lot.expiresOn ?? '9999-12-31') ||
          articleName(a.lot).localeCompare(articleName(b.lot), 'de-CH') ||
          a.lot.id.localeCompare(b.lot.id),
      );
    const expired = rated.filter(({ info }) => info.status === 'expired').map(({ lot }) => lot);
    const dueToday = rated.filter(({ info }) => info.status === 'today').map(({ lot }) => lot);
    const useUp = rated.filter(
      ({ info }) =>
        (info.status === 'today' || info.status === 'soon') &&
        (info.daysLeft ?? Number.MAX_SAFE_INTEGER) <= USE_UP_DAYS,
    );
    const belowMin = articles
      .filter(
        (article) =>
          article.active &&
          article.minStock !== undefined &&
          article.minStock > 0 &&
          (stockOf.get(article.id) ?? 0) < article.minStock,
      )
      .sort(byName);

    // ── The things of the day ────────────────────────────────────────────────────────────
    const todo: CockpitTodo[] = [];
    const names = (list: readonly string[]) => [...new Set(list)].slice(0, NAMES);
    function push(
      kind: CockpitTodo['kind'],
      rows: readonly unknown[],
      rowNames: readonly string[],
      target: CockpitTarget,
      value?: Rappen,
    ) {
      if (rows.length === 0) {
        return;
      }
      todo.push({
        kind,
        count: rows.length,
        ...(value === undefined ? {} : { valueRappen: value }),
        names: names(rowNames),
        target,
      });
    }
    const [onlyExpired] = expired;
    push(
      'expired',
      expired,
      expired.map(articleName),
      expired.length === 1 && onlyExpired !== undefined
        ? { page: 'waste', lotId: onlyExpired.id }
        : { page: 'expiring', group: 'expired' },
      sum(expired.map(lotValue)),
    );
    push(
      'due_today',
      dueToday,
      dueToday.map(articleName),
      { page: 'expiring', group: 'today' },
      sum(dueToday.map(lotValue)),
    );
    const measured = new Set(
      alive(temperatureRows)
        .filter((log) => log.on === day && log.areaId !== undefined)
        .map((log) => log.areaId),
    );
    const unmeasured = areas.filter(
      (area) =>
        (area.minDeciC !== undefined || area.maxDeciC !== undefined) && !measured.has(area.id),
    );
    push(
      'temperature',
      unmeasured,
      unmeasured.map((area) => area.name),
      { page: 'temperatures' },
    );
    const checks = alive(checkRows);
    const openTasks = alive(taskRows)
      .filter((task) => task.active)
      .filter((task) =>
        hygieneDue(
          task,
          checks.filter((check) => check.taskId === task.id),
          day,
        ),
      )
      .sort(byName);
    push(
      'hygiene',
      openTasks,
      openTasks.map((task) => task.name),
      { page: 'haccp' },
    );
    const supplierById = new Map(supplierRows.map((row) => [row.id, row]));
    const expected = alive(orderRows)
      .filter((order) => order.status === 'sent' && order.expectedOn !== undefined)
      .filter((order) => (order.expectedOn ?? day) <= day)
      .sort(
        (a, b) =>
          (a.expectedOn ?? '').localeCompare(b.expectedOn ?? '') || a.id.localeCompare(b.id),
      );
    const [onlyOrder] = expected;
    push(
      'orders',
      expected,
      expected.map((order) => supplierById.get(order.supplierId)?.name ?? ''),
      expected.length === 1 && onlyOrder !== undefined
        ? { page: 'receive', orderId: onlyOrder.id }
        : { page: 'orders' },
      sum(
        expected.flatMap((order) =>
          order.lines.map((line) => lineValue(line.quantity, line.pricePer1000)),
        ),
      ),
    );
    const recipeById = new Map(recipeRows.map((row) => [row.id, row]));
    const plannedToday = alive(planRows).filter((entry) => entry.date === day);
    const planned = plannedToday
      .filter((entry) => entry.productionId === undefined)
      .sort((a, b) => slotOrder(a.slot) - slotOrder(b.slot) || a.id.localeCompare(b.id));
    push(
      'plan',
      planned,
      planned.map((entry) => recipeById.get(entry.recipeId)?.name ?? ''),
      { page: 'plan' },
    );

    // The meals of today: those with dishes in the plan or a count. Served is counted after
    // the service; until then the meal waits in the day.
    const counts = alive(mealCountRows);
    const countsOf = (date: LocalDate, slot: PlanSlot) =>
      counts.filter((row) => row.date === date && row.slot === slot);
    const todaySlots = new Set<PlanSlot>([
      ...plannedToday.map((entry) => entry.slot),
      ...counts.filter((row) => row.date === day).map((row) => row.slot),
    ]);
    const mealSlots: CockpitMealSlot[] = [...todaySlots]
      .sort((a, b) => slotOrder(a) - slotOrder(b))
      .map((slot) => ({
        slot,
        ...mealTotal(countsOf(day, slot)),
        planned: plannedToday.some((entry) => entry.slot === slot),
      }));
    const toCount = mealSlots.filter((meal) => meal.served === undefined);
    push(
      'meals',
      toCount,
      toCount.map((meal) => planSlotLabel(meal.slot)),
      { page: 'plan' },
    );

    push(
      'below_min',
      belowMin,
      belowMin.map((article) => article.name),
      { page: 'purchasing' },
    );
    // The shopping list for the market: lines added by hand or by «Fehlt», not yet ticked or
    // booked, and not already among the articles under their minimum.
    const belowMinIds = new Set(belowMin.map((article) => article.id));
    const listed = new Set<string>();
    const shopping = alive(shoppingRows)
      .filter((line) => !line.checked && line.deliveryId === undefined)
      .filter((line) => line.articleId === undefined || !belowMinIds.has(line.articleId))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
      .filter((line) => {
        const key = line.articleId ?? `text:${fold(line.text ?? '')}`;
        if (listed.has(key)) {
          return false;
        }
        listed.add(key);
        return true;
      });
    push(
      'shopping',
      shopping,
      shopping.map((line) =>
        line.articleId === undefined
          ? (line.text ?? '')
          : (articleById.get(line.articleId)?.name ?? ''),
      ),
      { page: 'purchasing' },
    );

    // ── Heute verwerten ──────────────────────────────────────────────────────────────────
    const useUpLots = useUp.flatMap(({ lot, info }): CockpitUseUpLot[] => {
      const article = articleById.get(lot.articleId);
      const area = areaById.get(lot.areaId);
      if (
        article === undefined ||
        area === undefined ||
        lot.expiresOn === undefined ||
        info.daysLeft === undefined ||
        (info.status !== 'today' && info.status !== 'soon')
      ) {
        return [];
      }
      const spot = article.spotId === undefined ? undefined : spotById.get(article.spotId);
      return [
        {
          lotId: lot.id,
          articleId: article.id,
          articleName: article.name,
          unit: article.unit,
          quantity: lot.quantity,
          valueRappen: lotValue(lot),
          area: { id: area.id, name: area.name, kind: area.kind },
          ...(spot?.areaId === lot.areaId ? { spotName: spot.name } : {}),
          expiresOn: lot.expiresOn,
          dateKind: lot.dateKind,
          status: info.status,
          daysLeft: info.daysLeft,
        },
      ];
    });

    // ── Key figures ──────────────────────────────────────────────────────────────────────
    const movements = movementRows;
    const valueOf = (type: StockMovement['type'], from: LocalDate, to: LocalDate) =>
      movements
        .filter((movement) => movement.type === type && within(movement.on, from, to))
        .reduce((total, movement) => total + movement.valueRappen, 0);
    const month = monthOf(day);
    const monthStart = firstOfMonth(day);
    // Cost of goods: what was used, less what came back into stock as a component made in
    // house. Its ingredients count once, when the component is used, not when it is made.
    const costRappen = costOfGoods({
      consumed: -valueOf('consumption', monthStart, day),
      produced: valueOf('production', monthStart, day),
    });
    const netRevenueRappen = sum(
      alive(saleRows)
        .filter((sale) => within(sale.soldOn, monthStart, day))
        .map((sale) => netOfVat(sale.grossRappen, sale.vatBps)),
    );
    const purchasedRappen = rappen(valueOf('receipt', monthStart, day));
    const budget = alive(budgetRows)
      .filter((row) => row.month === month)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    const targetBps = budget?.targetFoodCostBps ?? business.targetFoodCostBps;
    const shareBps = foodCostBps(costRappen, netRevenueRappen);
    const weekFrom = addDays(day, -6);
    const wasteOf = (from: LocalDate, to: LocalDate) =>
      movements.filter((movement) => movement.type === 'waste' && within(movement.on, from, to));
    // Waste moves value out of the stock: its movements are negative, the loss is positive.
    const lossOf = (rows: readonly StockMovement[]) =>
      rappen(0 - rows.reduce((total, movement) => total + movement.valueRappen, 0));
    const week = wasteOf(weekFrom, day);
    const lastWeek = wasteOf(addDays(day, -13), addDays(day, -7));
    const thisMonth = wasteOf(monthStart, day);

    // Goods per meal: what left the stock for the guests, with the differences of the counts
    // (a count that found less is a cost, one that found more lowers it), per meal served.
    const countDifference = movements
      .filter(
        (movement) =>
          movement.type === 'adjustment' &&
          movement.countId !== undefined &&
          within(movement.on, monthStart, day),
      )
      .reduce((total, movement) => total + movement.valueRappen, 0);
    const mealCostRappen = mealGoods({
      consumed: -valueOf('consumption', monthStart, day),
      produced: valueOf('production', monthStart, day),
      countDifference,
    });
    const mealsOfMonth = new Map<string, MealCount[]>();
    for (const row of counts.filter((count) => within(count.date, monthStart, day))) {
      const key = `${row.date} ${row.slot}`;
      mealsOfMonth.set(key, [...(mealsOfMonth.get(key) ?? []), row]);
    }
    const served = [...mealsOfMonth.values()].reduce(
      (total, rows) => total + (mealTotal(rows).served ?? 0),
      0,
    );
    const perMealRappen = costPerMeal(mealCostRappen, served);
    const mealTarget = budget?.costPerMealRappen;
    const daysInMonth = daysBetween(monthStart, firstOfMonth(addMonths(monthStart, 1)));

    // ── Write-offs by kind ───────────────────────────────────────────────────────────────
    const byKind = new Map<WasteKind, number>();
    for (const movement of wasteOf(addDays(day, -(WASTE_DAYS - 1)), day)) {
      const kind = movement.reason === undefined ? 'other' : wasteKind(movement.reason);
      byKind.set(kind, (byKind.get(kind) ?? 0) - movement.valueRappen);
    }
    const kinds = KIND_ORDER.map((kind) => ({ kind, valueRappen: rappen(byKind.get(kind) ?? 0) }))
      .filter((row) => row.valueRappen > 0)
      .sort((a, b) => b.valueRappen - a.valueRappen);

    // ── Dishes by margin ─────────────────────────────────────────────────────────────────
    const book = {
      articles: new Map(articles.map((row) => [row.id, row])),
      recipes: new Map(recipes.map((row) => [row.id, row])),
    };
    const dishes = recipes.filter((recipe) => recipe.kind === 'dish' && recipe.active);
    let withoutPrice = 0;
    let withoutCost = 0;
    const ranked: CockpitDish[] = [];
    for (const recipe of dishes) {
      const cost = recipeCost(recipe, book);
      const costIncomplete =
        cost.missingPrices.length > 0 ||
        recipe.ingredients.length === 0 ||
        cost.perPortionRappen <= 0;
      if (recipe.priceRappen === undefined || recipe.priceRappen <= 0) {
        withoutPrice += 1;
        continue;
      }
      if (costIncomplete) {
        // The margin would only be an upper bound: such a dish is named, not ranked (ADR-0008).
        withoutCost += 1;
        continue;
      }
      const figures = dishFigures({
        costPerPortion: cost.perPortionRappen,
        priceRappen: recipe.priceRappen,
        vatBps: recipe.vatBps,
        targetFoodCostBps: business.targetFoodCostBps,
      });
      const { marginRappen, foodCostBps: share, status } = figures;
      if (marginRappen === undefined || share === undefined || status === 'unknown') {
        withoutCost += 1;
        continue;
      }
      ranked.push({
        recipeId: recipe.id,
        name: recipe.name,
        priceRappen: recipe.priceRappen,
        costPerPortionRappen: cost.perPortionRappen,
        marginRappen,
        foodCostBps: share,
        status,
      });
    }
    const best = [...ranked]
      .sort((a, b) => b.marginRappen - a.marginRappen || byName(a, b))
      .slice(0, 3);
    const worst = [...ranked]
      .sort((a, b) => b.foodCostBps - a.foodCostBps || byName(a, b))
      .slice(0, 3);

    // ── First steps ──────────────────────────────────────────────────────────────────────
    const empty = articles.length === 0 && recipes.length === 0;
    const steps: CockpitToday['setup']['steps'] = [
      { step: 'spots', done: spotById.size > 0 },
      {
        step: 'articles',
        done: articles.length >= COCKPIT_SETUP_ARTICLES,
        count: articles.length,
      },
      { step: 'receipt', done: movements.some((movement) => movement.type === 'receipt') },
      {
        step: 'recipe',
        done: recipes.some((recipe) => recipe.kind === 'dish' && (recipe.priceRappen ?? 0) > 0),
      },
      { step: 'menu', done: alive(cardRows).length > 0 },
      { step: 'temperature', done: alive(temperatureRows).length > 0 },
    ];

    return {
      todo,
      useUp: {
        lots: useUpLots.slice(0, COCKPIT_USE_UP_LIMIT),
        count: useUpLots.length,
        totalValueRappen: sum(useUpLots.map((lot) => lot.valueRappen)),
      },
      figures: {
        stock: {
          valueRappen: sum(lots.map(lotValue)),
          articleCount: stockOf.size,
          areaCount: new Set(lots.map((lot) => lot.areaId)).size,
          lotCount: lots.length,
          lotsWithoutPrice: lots.filter((lot) => lot.pricePer1000 === 0).length,
        },
        dueToday: { count: dueToday.length, valueRappen: sum(dueToday.map(lotValue)) },
        belowMinCount: belowMin.length,
        purchasedRappen,
        foodCost: {
          month,
          costRappen,
          netRevenueRappen,
          ...(shareBps === undefined ? {} : { shareBps }),
          targetBps,
          status: shareStatus(shareBps, targetBps),
        },
        writeOffs: {
          weekRappen: lossOf(week),
          lastWeekRappen: lossOf(lastWeek),
          weekCount: week.length,
          monthRappen: lossOf(thisMonth),
          monthCount: thisMonth.length,
        },
        costPerMeal: {
          month,
          costRappen: mealCostRappen,
          served,
          ...(perMealRappen === undefined ? {} : { perMealRappen }),
          ...(mealTarget === undefined ? {} : { targetRappen: mealTarget }),
          status: perMealStatus(perMealRappen, mealTarget),
        },
        ...(budget === undefined
          ? {}
          : {
              budget: {
                month,
                purchaseBudgetRappen: budget.purchaseBudgetRappen,
                spentRappen: purchasedRappen,
                day: daysBetween(monthStart, day) + 1,
                daysInMonth,
              },
            }),
      },
      meals: { slots: mealSlots },
      wasteByKind: { totalRappen: sum(kinds.map((row) => row.valueRappen)), kinds },
      dishes: {
        best,
        worst,
        dishCount: dishes.length,
        withoutPrice,
        withoutCost,
        targetBps: business.targetFoodCostBps,
      },
      setup: {
        empty,
        young: daysBetween(toLocalDate(business.createdAt), day) < YOUNG_DAYS,
        steps,
      },
    };
  };

  const search: UseCase<'cockpit.search'> = async (raw) => {
    const input = CONTRACT_V1['cockpit.search'].input.parse(raw);
    const words = fold(input.text)
      .split(/\s+/)
      .filter((word) => word !== '');
    const empty: CockpitSearch = { articles: [], recipes: [], suppliers: [], spots: [], total: 0 };
    if (words.length === 0) {
      return empty;
    }
    const id = input.businessId;
    const [articleRows, lotRows, recipeRows, supplierRows, areaRows, spotRows] = await Promise.all([
      storage.articles.ofBusiness(id),
      storage.lots.ofBusiness(id),
      storage.recipes.ofBusiness(id),
      storage.suppliers.ofBusiness(id),
      storage.areas.ofBusiness(id),
      storage.spots.ofBusiness(id),
    ]);
    const first = words[0] ?? '';
    const matches = (name: string) => {
      const folded = fold(name);
      return words.every((word) => folded.includes(word));
    };
    /** Names that begin with what was typed first, then the rest in alphabetical order. */
    const rank = <TRow extends { name: string }>(rows: readonly TRow[]): TRow[] =>
      rows
        .filter((row) => matches(row.name))
        .sort(
          (a, b) =>
            Number(!fold(a.name).startsWith(first)) - Number(!fold(b.name).startsWith(first)) ||
            byName(a, b),
        );

    const articles = alive(articleRows).filter((row) => row.active);
    const areas = new Map(alive(areaRows).map((row) => [row.id, row]));
    const spots = alive(spotRows).filter((spot) => areas.has(spot.areaId));
    const spotById = new Map(spots.map((row) => [row.id, row]));
    const stock = new Map<Id, number>();
    for (const lot of alive(lotRows)) {
      if (lot.status === 'active') {
        stock.set(lot.articleId, roundQuantity((stock.get(lot.articleId) ?? 0) + lot.quantity));
      }
    }
    const count = (key: (article: (typeof articles)[number]) => Id | undefined, value: Id) =>
      articles.filter((article) => key(article) === value).length;

    const articleHits = rank(articles);
    const recipeHits = rank(alive(recipeRows).filter((row) => row.active));
    const supplierHits = rank(alive(supplierRows));
    const spotHits = rank(spots);
    return {
      articles: articleHits.slice(0, COCKPIT_SEARCH_LIMIT).map((article) => {
        const area = article.areaId === undefined ? undefined : areas.get(article.areaId);
        const spot = article.spotId === undefined ? undefined : spotById.get(article.spotId);
        return {
          id: article.id,
          name: article.name,
          unit: article.unit,
          stock: stock.get(article.id) ?? 0,
          ...(area === undefined ? {} : { areaName: area.name }),
          ...(spot === undefined || spot.areaId !== area?.id ? {} : { spotName: spot.name }),
        };
      }),
      recipes: recipeHits.slice(0, COCKPIT_SEARCH_LIMIT).map((recipe: Recipe) => ({
        id: recipe.id,
        name: recipe.name,
        kind: recipe.kind,
        course: recipe.course,
        ...(recipe.kind === 'dish' && recipe.priceRappen !== undefined
          ? { priceRappen: recipe.priceRappen }
          : {}),
      })),
      suppliers: supplierHits.slice(0, COCKPIT_SEARCH_LIMIT).map((supplier) => ({
        id: supplier.id,
        name: supplier.name,
        kind: supplier.kind ?? 'supplier',
        articleCount: count((article) => article.supplierId, supplier.id),
      })),
      spots: spotHits.slice(0, COCKPIT_SEARCH_LIMIT).map((spot) => ({
        id: spot.id,
        name: spot.name,
        areaId: spot.areaId,
        areaName: areas.get(spot.areaId)?.name ?? '',
        articleCount: count((article) => article.spotId, spot.id),
      })),
      total: articleHits.length + recipeHits.length + supplierHits.length + spotHits.length,
    };
  };

  return { 'cockpit.today': today, 'cockpit.search': search };
}
