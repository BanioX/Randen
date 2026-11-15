import { addDays, formatSwissDate } from '../../dates';
import {
  foodCostBps,
  netOfVat,
  recipeCost,
  type CostArticle,
  type CostBook,
} from '../../domain/costing';
import { allocateFefo, usableQuantity, type FefoLot } from '../../domain/fefo';
import { recipeRequirements } from '../../domain/requirements';
import { formatQuantity, roundQuantity } from '../../domain/units';
import type { Id } from '../../ids';
import type { Article } from '../../model/article';
import type { PlanEntry } from '../../model/menu';
import type { LocalDate, Unit, Weekday } from '../../model/primitives';
import type { Recipe } from '../../model/recipe';
import type { Delivery, PurchaseOrder, StockLot } from '../../model/stock';
import type { OrderDay, Packs, PriceImpact, PurchaseReason } from './contract';

// ---------------------------------------------------------------------------------------------
// Days of a supplier

const SUNDAY_FIRST: readonly Weekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/** The weekday of a calendar day; pure date arithmetic without time zones. */
export function weekdayOf(date: LocalDate): Weekday {
  const [year = 0, month = 1, day = 1] = date.split('-').map(Number);
  return SUNDAY_FIRST[new Date(Date.UTC(year, month - 1, day)).getUTCDay()] ?? 'mon';
}

/** The first of `days` at least `from` days after `today`; undefined without days. */
function firstDay(days: readonly Weekday[], today: LocalDate, from: number): OrderDay | undefined {
  for (let inDays = from; inDays < from + 7; inDays += 1) {
    const on = addDays(today, inDays);
    const weekday = weekdayOf(on);
    if (days.includes(weekday)) {
      return { on, weekday, inDays };
    }
  }
  return undefined;
}

/**
 * The next day to order on (today counts), and the delivery that order comes with: the first
 * delivery day after it. A supplier without order days delivers on its next delivery day.
 */
export function supplierDays(
  supplier: { orderDays: readonly Weekday[]; deliveryDays: readonly Weekday[] },
  today: LocalDate,
): { nextOrder?: OrderDay; nextDelivery?: OrderDay } {
  const nextOrder = firstDay(supplier.orderDays, today, 0);
  const nextDelivery =
    nextOrder === undefined
      ? firstDay(supplier.deliveryDays, today, 0)
      : firstDay(supplier.deliveryDays, today, nextOrder.inDays + 1);
  return {
    ...(nextOrder === undefined ? {} : { nextOrder }),
    ...(nextDelivery === undefined ? {} : { nextDelivery }),
  };
}

const WEEKDAY_NAMES: Record<Weekday, string> = {
  mon: 'Montag',
  tue: 'Dienstag',
  wed: 'Mittwoch',
  thu: 'Donnerstag',
  fri: 'Freitag',
  sat: 'Samstag',
  sun: 'Sonntag',
};

// ---------------------------------------------------------------------------------------------
// Packs

/** Quantities in thousandths of a base unit: whole numbers, so division by a pack is exact. */
const milli = (quantity: number) => Math.round(quantity * 1000);

/** Rounds a quantity up to whole packs: 17 kg at 10 kg a sack are 2 sacks, 20 kg. */
export function roundUpToPacks(
  quantity: number,
  packSize: number | undefined,
  packLabel?: string,
): { quantity: number; packs?: Packs } {
  if (packSize === undefined || packSize <= 0 || quantity <= 0) {
    return { quantity: roundQuantity(quantity) };
  }
  const count = Math.ceil(milli(quantity) / milli(packSize));
  return {
    quantity: roundQuantity((count * milli(packSize)) / 1000),
    packs: { count, size: packSize, ...(packLabel === undefined ? {} : { label: packLabel }) },
  };
}

/** The packs a quantity is, if it is a whole number of them. */
export function packsOf(
  quantity: number,
  packSize: number | undefined,
  packLabel?: string,
): Packs | undefined {
  if (packSize === undefined || packSize <= 0) {
    return undefined;
  }
  const size = milli(packSize);
  const total = milli(quantity);
  if (total <= 0 || total % size !== 0) {
    return undefined;
  }
  return {
    count: total / size,
    size: packSize,
    ...(packLabel === undefined ? {} : { label: packLabel }),
  };
}

/** «2 × Sack à 10 kg», «2 × 10 kg», or the plain quantity «3.3 kg». */
export function quantityText(quantity: number, unit: Unit, packs: Packs | undefined): string {
  if (packs === undefined) {
    return formatQuantity(quantity, unit);
  }
  const size = formatQuantity(packs.size, unit);
  return packs.label === undefined
    ? `${String(packs.count)} × ${size}`
    : `${String(packs.count)} × ${packs.label} à ${size}`;
}

// ---------------------------------------------------------------------------------------------
// The order proposal

export interface ProposalInput {
  today: LocalDate;
  horizonDays: number;
  /** Alive articles of the business. */
  articles: readonly Article[];
  /** Alive recipes by id. */
  recipes: ReadonlyMap<Id, Recipe>;
  /** Alive, active lots. */
  lots: readonly StockLot[];
  /** Alive orders; only drafts and sent ones count as on order. */
  orders: readonly PurchaseOrder[];
  /** Alive entries of the menu plan. */
  planEntries: readonly PlanEntry[];
}

export interface ProposalLine {
  article: Article;
  stock: number;
  usable: number;
  onOrder: number;
  needForPlan: number;
  expiresBeforeUse: number;
  reason: PurchaseReason;
  quantity: number;
  packs?: Packs;
}

interface Need {
  on: LocalDate;
  quantity: number;
}

function addNeed(needs: Map<Id, Need[]>, articleId: Id, need: Need) {
  if (need.quantity > 0) {
    needs.set(articleId, [...(needs.get(articleId) ?? []), need]);
  }
}

/**
 * Takes the needs from the lots day by day, first expired first out, with only what is still
 * usable on each day. Returns what was taken and what the lots could not cover in time.
 */
function simulate(lots: readonly FefoLot[], needs: readonly Need[]) {
  const left = lots.map((lot) => ({ ...lot }));
  let consumed = 0;
  let missing = 0;
  const missingByDay: Need[] = [];
  for (const need of [...needs].sort((a, b) => a.on.localeCompare(b.on))) {
    const result = allocateFefo(left, need.quantity, need.on);
    for (const pick of result.picks) {
      const lot = left.find((each) => each.id === pick.lotId);
      if (lot !== undefined) {
        lot.quantity = roundQuantity(lot.quantity - pick.quantity);
      }
      consumed = roundQuantity(consumed + pick.quantity);
    }
    missing = roundQuantity(missing + result.missing);
    if (result.missing > 0) {
      missingByDay.push({ on: need.on, quantity: result.missing });
    }
  }
  return { consumed, missing, missingByDay };
}

/**
 * Components made in house in the order to unfold them: a component before the components it
 * contains, so that the need of a jus is known before the fond it is made of is looked at.
 */
function componentOrder(articles: readonly Article[], recipes: ReadonlyMap<Id, Recipe>): Article[] {
  const prepared = new Map(
    articles.filter((article) => article.kind === 'prepared').map((row) => [row.id, row]),
  );
  const order: Article[] = [];
  const visited = new Set<Id>();
  const visit = (article: Article) => {
    if (visited.has(article.id)) {
      return;
    }
    visited.add(article.id);
    const recipe = article.recipeId === undefined ? undefined : recipes.get(article.recipeId);
    for (const ingredient of recipe?.ingredients ?? []) {
      const inner = prepared.get(ingredient.articleId);
      if (inner !== undefined) {
        visit(inner);
      }
    }
    order.push(article);
  };
  for (const article of prepared.values()) {
    visit(article);
  }
  return order.reverse();
}

/**
 * The order proposal (ADR-0007: stock comes from the lots, which the ledger keeps). For every
 * bought article:
 *
 * - the menu plan: the open entries from today to the horizon need their recipes; components
 *   made in house come from their own lots first, what they lack is unfolded into their
 *   ingredients. Needs are taken from the lots day by day, with only what is still usable on
 *   that day; what the lots cannot cover and the open orders do not bring is ordered;
 * - the minimum: if what is left after the plan, with what is on order, lies under the minimum,
 *   the article is filled up to its target stock (twice the minimum without a target).
 *
 * Without a plan this is «usable stock + on order < minimum, fill up to the target». The
 * quantity is rounded up to whole packs.
 */
export function proposal(input: ProposalInput): ProposalLine[] {
  const { today } = input;
  const last = addDays(today, input.horizonDays - 1);
  const yields = new Map(input.articles.map((article) => [article.id, article]));
  const lots = new Map<Id, StockLot[]>();
  for (const lot of input.lots) {
    if (lot.quantity > 0) {
      lots.set(lot.articleId, [...(lots.get(lot.articleId) ?? []), lot]);
    }
  }
  const onOrder = new Map<Id, number>();
  for (const order of input.orders) {
    if (order.status === 'draft' || order.status === 'sent') {
      for (const line of order.lines) {
        onOrder.set(
          line.articleId,
          roundQuantity((onOrder.get(line.articleId) ?? 0) + line.quantity),
        );
      }
    }
  }

  const needs = new Map<Id, Need[]>();
  for (const entry of input.planEntries) {
    if (entry.productionId !== undefined || entry.date < today || entry.date > last) {
      continue;
    }
    const recipe = input.recipes.get(entry.recipeId);
    if (recipe === undefined) {
      continue;
    }
    for (const requirement of recipeRequirements(recipe, entry.portions, yields)) {
      addNeed(needs, requirement.articleId, { on: entry.date, quantity: requirement.quantity });
    }
  }
  for (const component of componentOrder(input.articles, input.recipes)) {
    const own = needs.get(component.id);
    const recipe =
      component.recipeId === undefined ? undefined : input.recipes.get(component.recipeId);
    const output = recipe?.output;
    if (
      recipe === undefined ||
      own === undefined ||
      output?.articleId !== component.id ||
      output.quantity <= 0
    ) {
      continue;
    }
    for (const gap of simulate(lots.get(component.id) ?? [], own).missingByDay) {
      const portions = (gap.quantity / output.quantity) * recipe.portions;
      for (const requirement of recipeRequirements(recipe, portions, yields)) {
        addNeed(needs, requirement.articleId, { on: gap.on, quantity: requirement.quantity });
      }
    }
  }

  const lines: ProposalLine[] = [];
  for (const article of input.articles) {
    const own = needs.get(article.id) ?? [];
    if (article.kind !== 'purchased' || (!article.active && own.length === 0)) {
      continue;
    }
    const articleLots = lots.get(article.id) ?? [];
    const stock = roundQuantity(articleLots.reduce((sum, lot) => sum + lot.quantity, 0));
    const usable = usableQuantity(articleLots, today);
    const ordered = onOrder.get(article.id) ?? 0;
    const needForPlan = roundQuantity(own.reduce((sum, need) => sum + need.quantity, 0));
    const { consumed, missing } = simulate(articleLots, own);
    const expiresBeforeUse = roundQuantity(
      Math.max(0, missing - Math.max(0, needForPlan - usable)),
    );
    // What stays after the plan; open orders first fill what the plan lacks.
    const level = roundQuantity(usable - consumed + Math.max(0, ordered - missing));
    const forPlan = Math.max(0, roundQuantity(missing - ordered));
    const min = article.minStock ?? 0;
    const fillTo = Math.max(article.targetStock ?? min * 2, min);
    const forMin = min > 0 && level < min ? roundQuantity(fillTo - level) : 0;
    const wanted = roundQuantity(forPlan + forMin);
    if (wanted <= 0) {
      continue;
    }
    const belowMin = min > 0 && usable + ordered < min;
    const rounded = roundUpToPacks(wanted, article.packSize, article.packLabel);
    lines.push({
      article,
      stock,
      usable,
      onOrder: ordered,
      needForPlan,
      expiresBeforeUse,
      reason: belowMin ? (needForPlan > 0 ? 'both' : 'below_min') : 'plan',
      quantity: rounded.quantity,
      ...(rounded.packs === undefined ? {} : { packs: rounded.packs }),
    });
  }
  return lines;
}

// ---------------------------------------------------------------------------------------------
// Prices

export interface PurchasePoint {
  /** The delivery, or the lot when it came without one. */
  key: string;
  on: LocalDate;
  at: string;
  quantity: number;
  /** Rappen per 1000 base units, weighted over the lines of one purchase. */
  pricePer1000: number;
  supplierId?: Id;
}

/** Lots of deliveries whose line was bought on offer («Aktion»). */
export function promoLots(deliveries: readonly Delivery[]): Set<Id> {
  return new Set(
    deliveries.flatMap((delivery) =>
      delivery.lines.filter((line) => line.promo === true).map((line) => line.lotId),
    ),
  );
}

/**
 * The purchases of every article, oldest first, from the lots bought (`origin 'purchase'`),
 * without lots bought on offer. Two lines of one delivery are one purchase at their average.
 */
export function purchaseHistory(
  lots: readonly StockLot[],
  promo: ReadonlySet<Id>,
): Map<Id, PurchasePoint[]> {
  const groups = new Map<string, { articleId: Id; lots: StockLot[] }>();
  for (const lot of lots) {
    if (lot.origin !== 'purchase' || lot.pricePer1000 <= 0 || promo.has(lot.id)) {
      continue;
    }
    const key = `${lot.articleId}:${lot.deliveryId ?? lot.id}`;
    const group = groups.get(key) ?? { articleId: lot.articleId, lots: [] };
    group.lots.push(lot);
    groups.set(key, group);
  }
  const history = new Map<Id, PurchasePoint[]>();
  for (const [key, group] of groups) {
    const quantity = group.lots.reduce((sum, lot) => sum + lot.initialQuantity, 0);
    const weighted = group.lots.reduce(
      (sum, lot) => sum + lot.initialQuantity * lot.pricePer1000,
      0,
    );
    const first = group.lots[0];
    if (first === undefined || quantity <= 0) {
      continue;
    }
    const point: PurchasePoint = {
      key,
      on: first.receivedOn,
      at: group.lots.reduce((latest, lot) => (lot.createdAt > latest ? lot.createdAt : latest), ''),
      quantity: roundQuantity(quantity),
      pricePer1000: Math.round(weighted / quantity),
      ...(first.supplierId === undefined ? {} : { supplierId: first.supplierId }),
    };
    history.set(group.articleId, [...(history.get(group.articleId) ?? []), point]);
  }
  for (const points of history.values()) {
    points.sort(
      (a, b) => a.on.localeCompare(b.on) || a.at.localeCompare(b.at) || a.key.localeCompare(b.key),
    );
  }
  return history;
}

export interface MarketPricePoint {
  supplierId: Id;
  pricePer1000: number;
  on: LocalDate;
  at: string;
}

/**
 * The last regular price of every article at every market, from the deliveries of the markets
 * (lines on offer left out). Computed, never stored (ADR-0008). Newest first per article.
 */
export function marketPrices(
  deliveries: readonly Delivery[],
  markets: ReadonlySet<Id>,
): Map<Id, MarketPricePoint[]> {
  const latest = new Map<string, MarketPricePoint & { articleId: Id }>();
  for (const delivery of deliveries) {
    if (delivery.supplierId === undefined || !markets.has(delivery.supplierId)) {
      continue;
    }
    for (const line of delivery.lines) {
      if (line.promo === true || line.pricePer1000 <= 0) {
        continue;
      }
      const key = `${line.articleId}:${delivery.supplierId}`;
      const known = latest.get(key);
      const newer =
        known === undefined ||
        delivery.receivedOn > known.on ||
        (delivery.receivedOn === known.on && delivery.createdAt > known.at);
      if (newer) {
        latest.set(key, {
          articleId: line.articleId,
          supplierId: delivery.supplierId,
          pricePer1000: line.pricePer1000,
          on: delivery.receivedOn,
          at: delivery.createdAt,
        });
      }
    }
  }
  const byArticle = new Map<Id, MarketPricePoint[]>();
  for (const { articleId, ...point } of latest.values()) {
    byArticle.set(articleId, [...(byArticle.get(articleId) ?? []), point]);
  }
  for (const points of byArticle.values()) {
    points.sort((a, b) => b.on.localeCompare(a.on) || b.at.localeCompare(a.at));
  }
  return byArticle;
}

/** A change of a price in basis points, signed: from 38.00 to 42.75 is +1250. */
export function changeBps(oldPrice: number, newPrice: number): number {
  return Math.round(((newPrice - oldPrice) * 10_000) / oldPrice);
}

/**
 * The dishes a price change reaches, directly or through components made in house, with the
 * goods of one portion and the food cost share at the old and at the new price. Both sides are
 * computed the same way: the components on the way are costed from their recipes, so the
 * difference is the price change alone.
 */
export function priceImpacts(input: {
  articleId: Id;
  oldPricePer1000: number;
  newPricePer1000: number;
  articles: ReadonlyMap<Id, Article>;
  recipes: ReadonlyMap<Id, Recipe>;
}): PriceImpact[] {
  const { articleId, articles, recipes } = input;
  const reaches = new Map<Id, boolean>();
  const contains = (recipe: Recipe, seen: ReadonlySet<Id>): boolean => {
    const known = reaches.get(recipe.id);
    if (known !== undefined) {
      return known;
    }
    const result = recipe.ingredients.some((ingredient) => {
      if (ingredient.articleId === articleId) {
        return true;
      }
      const inner = articles.get(ingredient.articleId);
      const innerRecipe =
        inner?.kind === 'prepared' && inner.recipeId !== undefined
          ? recipes.get(inner.recipeId)
          : undefined;
      return (
        innerRecipe !== undefined &&
        !seen.has(innerRecipe.id) &&
        contains(innerRecipe, new Set([...seen, innerRecipe.id]))
      );
    });
    reaches.set(recipe.id, result);
    return result;
  };
  /** Components whose recipe reaches the article: costed from the recipe on both sides. */
  const onTheWay = new Set(
    [...articles.values()]
      .filter((article) => {
        const recipe =
          article.kind === 'prepared' && article.recipeId !== undefined
            ? recipes.get(article.recipeId)
            : undefined;
        return recipe !== undefined && contains(recipe, new Set([recipe.id]));
      })
      .map((article) => article.id),
  );
  const book = (price: number): CostBook => {
    const costArticles = new Map<Id, CostArticle>();
    for (const article of articles.values()) {
      const pricePer1000 =
        article.id === articleId ? price : onTheWay.has(article.id) ? 0 : article.pricePer1000;
      costArticles.set(article.id, { ...article, pricePer1000 });
    }
    return { articles: costArticles, recipes };
  };
  const before = book(input.oldPricePer1000);
  const after = book(input.newPricePer1000);
  const impacts: PriceImpact[] = [];
  for (const recipe of recipes.values()) {
    if (recipe.kind !== 'dish' || !recipe.active || !contains(recipe, new Set([recipe.id]))) {
      continue;
    }
    const costBefore = recipeCost(recipe, before);
    const costAfter = recipeCost(recipe, after);
    const direct = recipe.ingredients.some((ingredient) => ingredient.articleId === articleId);
    const via = direct
      ? undefined
      : recipe.ingredients
          .map((ingredient) => articles.get(ingredient.articleId))
          .find((article) => article !== undefined && onTheWay.has(article.id));
    const net =
      recipe.priceRappen === undefined || recipe.priceRappen <= 0
        ? undefined
        : netOfVat(recipe.priceRappen, recipe.vatBps);
    const shareBefore =
      net === undefined ? undefined : foodCostBps(costBefore.perPortionRappen, net);
    const shareAfter = net === undefined ? undefined : foodCostBps(costAfter.perPortionRappen, net);
    impacts.push({
      recipeId: recipe.id,
      name: recipe.name,
      ...(recipe.priceRappen === undefined ? {} : { priceRappen: recipe.priceRappen }),
      costBeforeRappen: costBefore.perPortionRappen,
      costAfterRappen: costAfter.perPortionRappen,
      ...(shareBefore === undefined ? {} : { foodCostBeforeBps: shareBefore }),
      ...(shareAfter === undefined ? {} : { foodCostAfterBps: shareAfter }),
      ...(via === undefined ? {} : { via: via.name }),
      incomplete: costAfter.missingPrices.length > 0,
    });
  }
  return impacts.sort(
    (a, b) =>
      b.costAfterRappen - b.costBeforeRappen - (a.costAfterRappen - a.costBeforeRappen) ||
      a.name.localeCompare(b.name, 'de-CH'),
  );
}

// ---------------------------------------------------------------------------------------------
// The text of an order

export interface OrderTextInput {
  businessName: string;
  customerNumber?: string | undefined;
  expectedOn?: LocalDate | undefined;
  lines: readonly {
    name: string;
    quantity: number;
    unit: Unit;
    packs?: Packs | undefined;
    supplierArticleNumber?: string | undefined;
  }[];
  note?: string | undefined;
}

/** «Dienstag, 17.11.2026». */
export function dayText(date: LocalDate): string {
  return `${WEEKDAY_NAMES[weekdayOf(date)]}, ${formatSwissDate(date)}`;
}

/** The subject of an e-mail with the order. */
export function orderSubject(businessName: string, expectedOn: LocalDate | undefined): string {
  return expectedOn === undefined
    ? `Bestellung ${businessName}`
    : `Bestellung ${businessName}, Lieferung ${formatSwissDate(expectedOn)}`;
}

/**
 * The order as plain text, ready to paste into an e-mail or a message: a greeting, who orders,
 * the wished day, one line per article with its number at the supplier, a closing line. No
 * prices: they are the supplier's to confirm. Written for the supplier, so without «du».
 */
export function orderText(input: OrderTextInput): string {
  const head = [
    'Guten Tag',
    '',
    input.customerNumber === undefined
      ? `Bestellung von ${input.businessName}`
      : `Bestellung von ${input.businessName}, Kundennummer ${input.customerNumber}`,
    ...(input.expectedOn === undefined
      ? []
      : [`Gewünschte Lieferung: ${dayText(input.expectedOn)}`]),
  ];
  const lines = input.lines.map((line) => {
    const what = `${quantityText(line.quantity, line.unit, line.packs)} ${line.name}`;
    return line.supplierArticleNumber === undefined
      ? what
      : `${what}, Art.-Nr. ${line.supplierArticleNumber}`;
  });
  return [
    ...head,
    '',
    ...lines,
    ...(input.note === undefined ? [] : ['', `Bemerkung: ${input.note}`]),
    '',
    'Besten Dank und freundliche Grüsse',
    input.businessName,
  ].join('\n');
}
