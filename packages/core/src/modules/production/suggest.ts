/**
 * «Reste verwerten» and the auto fill of the menu plan (ADR-0015): pure rules, no storage, no
 * clock, no randomness. Everything a result depends on comes in as data, so the rules can be
 * read and tested on their own. The rules are documented next to each function.
 */
import { daysBetween } from '../../dates';
import { lineValue, roundQuantity } from '../../domain/units';
import type { Course } from '../../model/recipe';
import type { DateKind, LocalDate, Unit } from '../../model/primitives';
import { MAX_PLAN_PORTIONS, type PlanSlot } from '../../model/menu';
import type { MarginStatus } from '../../domain/costing';
import type { Id } from '../../ids';
import type { PlanSuggestion } from './contract';

/** Tolerance for float noise when a quantity is divided by a per-portion amount. */
const EPS = 1e-9;

/** Portions an auto fill plans for a dish that nobody sold yet («Standard: 10»). */
export const DEFAULT_PORTIONS = 10;
/** The window of sales auto fill ranks by: the last 28 days. */
export const SALES_WINDOW_DAYS = 28;

export interface SuggestArticle {
  name: string;
  unit: Unit;
}

/** One lot with stock in it: what a suggestion can save. */
export interface SuggestLot {
  id: Id;
  articleId: Id;
  /** What is left in the lot, in base units. */
  quantity: number;
  /** Rappen per 1000 base units. */
  pricePer1000: number;
  expiresOn: LocalDate;
  dateKind: DateKind;
}

/** A dish with what one portion needs, gross, per article. */
export interface SuggestDish {
  recipeId: Id;
  recipeName: string;
  course: Course;
  perPortion: ReadonlyMap<Id, number>;
  marginStatus: MarginStatus;
}

export interface SuggestInput {
  today: LocalDate;
  /** A lot counts when it falls due within this many days from today (inclusive). */
  days: number;
  lots: readonly SuggestLot[];
  dishes: readonly SuggestDish[];
  articles: ReadonlyMap<Id, SuggestArticle>;
  /** What may be used today, per article (lots past their Verbrauchsdatum left out). */
  usable: ReadonlyMap<Id, number>;
}

/**
 * The meal a dish naturally goes into: breakfast stays breakfast, a snack stays a snack, every
 * other course goes to lunch.
 */
export function proposedSlotFor(course: Course): PlanSlot {
  if (course === 'breakfast') {
    return 'breakfast';
  }
  if (course === 'snack') {
    return 'afternoon_snack';
  }
  return 'lunch';
}

/**
 * A dish fits a meal when it is the same meal, or when both are main meals (lunch or dinner).
 * Breakfast and the snacks only fit their own meal.
 */
export function slotFits(proposed: PlanSlot, slot: PlanSlot): boolean {
  if (proposed === slot) {
    return true;
  }
  return (proposed === 'lunch' || proposed === 'dinner') && (slot === 'lunch' || slot === 'dinner');
}

/** Use-by lots before best-before lots, then the earliest date, then the id: the order lots are looked at. */
function lotOrder(a: SuggestLot, b: SuggestLot): number {
  const kind = (a.dateKind === 'use_by' ? 0 : 1) - (b.dateKind === 'use_by' ? 0 : 1);
  return kind || a.expiresOn.localeCompare(b.expiresOn) || a.id.localeCompare(b.id);
}

/**
 * «Reste verwerten»: for every lot that falls due within `days`, every active dish that uses its
 * article gets a suggestion (`docs` in the module README of the rules):
 *
 * - Portions: as many as the lot allows (floor of lot ÷ portion), capped by what the other
 *   ingredients cover. When they cover none, the lot's count is kept and the short ingredients
 *   are listed in `missing`.
 * - Used quantity: portions × the amount per portion, never more than the lot holds. Saved value:
 *   the used quantity at the lot's own price.
 * - Ranking: dishes that are ready before dishes with missing ingredients, then the most value
 *   saved, then the lot order (use-by first, earliest date), then the name.
 * - Latest day to cook: the day the lot falls due. Proposed: today, in the meal the course suits.
 *
 * Lots past their date and lots without stock are left out. No randomness, no network.
 */
export function suggestDishes(input: SuggestInput): PlanSuggestion[] {
  const lots = input.lots
    .filter((lot) => lot.quantity > EPS)
    .map((lot) => ({ lot, daysLeft: daysBetween(input.today, lot.expiresOn) }))
    .filter(({ daysLeft }) => daysLeft >= 0 && daysLeft <= input.days)
    .sort((a, b) => lotOrder(a.lot, b.lot));

  const result: (PlanSuggestion & { lotRank: number })[] = [];
  lots.forEach(({ lot, daysLeft }, lotRank) => {
    const article = input.articles.get(lot.articleId);
    if (article === undefined) {
      return;
    }
    for (const dish of input.dishes) {
      const perLot = dish.perPortion.get(lot.articleId) ?? 0;
      if (perLot <= EPS) {
        continue;
      }
      const lotPortions = Math.floor((lot.quantity + EPS) / perLot);
      if (lotPortions < 1) {
        continue;
      }
      // How many portions the other ingredients cover, the smallest of them.
      let coverage = Number.POSITIVE_INFINITY;
      for (const [articleId, need] of dish.perPortion) {
        if (articleId === lot.articleId || need <= EPS) {
          continue;
        }
        const cover = Math.floor(((input.usable.get(articleId) ?? 0) + EPS) / need);
        coverage = Math.min(coverage, cover);
      }
      const ready = coverage >= 1;
      // A plan entry takes at most MAX_PLAN_PORTIONS: the rest of the lot stays in stock.
      const portions = Math.min(
        ready ? Math.min(lotPortions, coverage) : lotPortions,
        MAX_PLAN_PORTIONS,
      );
      const missing = ready
        ? []
        : [...dish.perPortion]
            .filter(([articleId]) => articleId !== lot.articleId)
            .flatMap(([articleId, need]) => {
              const short = roundQuantity(need * portions - (input.usable.get(articleId) ?? 0));
              const other = input.articles.get(articleId);
              return short > EPS && other !== undefined
                ? [{ articleId, name: other.name, unit: other.unit, missing: short }]
                : [];
            });
      const usedQuantity = roundQuantity(Math.min(lot.quantity, portions * perLot));
      result.push({
        lotId: lot.id,
        articleId: lot.articleId,
        articleName: article.name,
        unit: article.unit,
        expiringQuantity: roundQuantity(lot.quantity),
        expiresOn: lot.expiresOn,
        daysLeft,
        dateKind: lot.dateKind,
        recipeId: dish.recipeId,
        recipeName: dish.recipeName,
        course: dish.course,
        portions,
        usedQuantity,
        savedRappen: lineValue(usedQuantity, lot.pricePer1000),
        latestCookOn: lot.expiresOn,
        proposedOn: input.today,
        proposedSlot: proposedSlotFor(dish.course),
        marginStatus: dish.marginStatus,
        missing,
        ready: missing.length === 0,
        lotRank,
      });
    }
  });

  result.sort(
    (a, b) =>
      Number(b.ready) - Number(a.ready) ||
      b.savedRappen - a.savedRappen ||
      a.lotRank - b.lotRank ||
      a.recipeName.localeCompare(b.recipeName, 'de-CH') ||
      a.recipeId.localeCompare(b.recipeId),
  );
  return result.map(({ lotRank: _rank, ...suggestion }) => suggestion);
}

/** A dish of the plan's ranking: how it sells and what it earns. */
export interface RankDish {
  recipeId: Id;
  recipeName: string;
  marginStatus: MarginStatus;
  /** Contribution margin of one portion; undefined without a price. */
  marginRappen: number | undefined;
  /** Portions sold in the last 28 days. */
  soldLast28: number;
}

const STATUS_RANK: Record<MarginStatus, number> = { good: 0, watch: 1, unknown: 2, over: 3 };

/**
 * The order of dishes for an auto fill without expiring stock: the margin first (good, then a
 * little over, then unknown, then clearly over), then how often they sold, then the margin per
 * portion, then the name.
 */
export function rankDishes(dishes: readonly RankDish[]): RankDish[] {
  return [...dishes].sort(
    (a, b) =>
      STATUS_RANK[a.marginStatus] - STATUS_RANK[b.marginStatus] ||
      b.soldLast28 - a.soldLast28 ||
      (b.marginRappen ?? -Infinity) - (a.marginRappen ?? -Infinity) ||
      a.recipeName.localeCompare(b.recipeName, 'de-CH') ||
      a.recipeId.localeCompare(b.recipeId),
  );
}

/**
 * Portions a dish is planned with when nothing else says: the average sold per day over the
 * sales window, at least one; without any sales, `DEFAULT_PORTIONS`.
 */
export function averagePortions(soldLast28: number): number {
  if (soldLast28 <= 0) {
    return DEFAULT_PORTIONS;
  }
  return Math.min(MAX_PLAN_PORTIONS, Math.max(1, Math.round(soldLast28 / SALES_WINDOW_DAYS)));
}

export interface FillInput {
  /** The days of the week that may be planned (today and later), in order. */
  days: readonly LocalDate[];
  /** The meals to fill, in plan order. */
  slots: readonly PlanSlot[];
  /** `date|slot` of every meal that already holds an entry: those stay untouched. */
  occupied: ReadonlySet<string>;
  /** Dishes already on the week: never twice. */
  usedRecipes: ReadonlySet<Id>;
  dishesPerSlot: number;
  /** Suggestions from `suggestDishes`, best first. */
  suggestions: readonly PlanSuggestion[];
  /** Dishes by `rankDishes`, best first, without the ones already on the week. */
  ranking: readonly RankDish[];
  /** What the stock can give the dishes of the fill. A dish not listed here is never suggested. */
  stock: FillStock;
}

/** The dishes of a fill with what one portion needs, and the usable stock per article. */
export interface FillStock {
  dishes: readonly SuggestDish[];
  usable: ReadonlyMap<Id, number>;
}

export type FillReason =
  | {
      kind: 'expiring';
      articleName: string;
      quantity: number;
      unit: Unit;
      expiresOn: LocalDate;
      savedRappen: number;
    }
  | { kind: 'ranking'; soldLast28: number; marginStatus: MarginStatus };

export interface FillPick {
  date: LocalDate;
  slot: PlanSlot;
  recipeId: Id;
  recipeName: string;
  portions: number;
  reason: FillReason;
}

export interface FillResult {
  picks: FillPick[];
  /** Empty meals that no dish fitted. */
  skipped: number;
}

/**
 * The auto fill (ADR-0015): walks the empty meals of the week in order, day by day and meal by
 * meal. A meal first takes a ready suggestion that saves expiring stock, on a day before the
 * stock falls due and in a meal the dish suits; one lot is used once and a dish at most once in
 * the week. When no suggestion fits, the best dish of the ranking takes the meal, with the
 * average portions it sells. Meals that already hold an entry stay as they are.
 *
 * The fill takes the stock away as it plans: a suggestion is taken only when its portions still
 * fit what the earlier picks of this fill left in stock, for every ingredient, so two dishes
 * never count on the same grams.
 */
export function planAutoFill(input: FillInput): FillResult {
  const used = new Set(input.usedRecipes);
  const usedLots = new Set<Id>();
  const picks: FillPick[] = [];
  let skipped = 0;
  const needsOf = new Map<Id, ReadonlyMap<Id, number>>(
    input.stock.dishes.map((dish) => [dish.recipeId, dish.perPortion]),
  );
  const left = new Map(input.stock.usable);

  /** True when the portions of a suggestion need no more than what is left, of every article. */
  const fits = (suggestion: PlanSuggestion): boolean => {
    const needs = needsOf.get(suggestion.recipeId);
    return (
      needs !== undefined &&
      [...needs].every(
        ([articleId, need]) => need * suggestion.portions <= (left.get(articleId) ?? 0) + EPS,
      )
    );
  };
  /** Takes what `portions` of a dish need from what is left. */
  const take = (recipeId: Id, portions: number): void => {
    for (const [articleId, need] of needsOf.get(recipeId) ?? []) {
      left.set(articleId, Math.max(0, roundQuantity((left.get(articleId) ?? 0) - need * portions)));
    }
  };

  for (const date of input.days) {
    for (const slot of input.slots) {
      if (input.occupied.has(`${date}|${slot}`)) {
        continue;
      }
      let filled = 0;
      for (let count = 0; count < input.dishesPerSlot; count += 1) {
        const suggestion = input.suggestions.find(
          (candidate) =>
            candidate.ready &&
            !usedLots.has(candidate.lotId) &&
            !used.has(candidate.recipeId) &&
            date <= candidate.latestCookOn &&
            date >= candidate.proposedOn &&
            slotFits(candidate.proposedSlot, slot) &&
            fits(candidate),
        );
        if (suggestion !== undefined) {
          usedLots.add(suggestion.lotId);
          used.add(suggestion.recipeId);
          take(suggestion.recipeId, suggestion.portions);
          picks.push({
            date,
            slot,
            recipeId: suggestion.recipeId,
            recipeName: suggestion.recipeName,
            portions: suggestion.portions,
            reason: {
              kind: 'expiring',
              articleName: suggestion.articleName,
              quantity: suggestion.usedQuantity,
              unit: suggestion.unit,
              expiresOn: suggestion.expiresOn,
              savedRappen: suggestion.savedRappen,
            },
          });
          filled += 1;
          continue;
        }
        const dish = input.ranking.find((candidate) => !used.has(candidate.recipeId));
        if (dish === undefined) {
          break;
        }
        const portions = averagePortions(dish.soldLast28);
        used.add(dish.recipeId);
        take(dish.recipeId, portions);
        picks.push({
          date,
          slot,
          recipeId: dish.recipeId,
          recipeName: dish.recipeName,
          portions,
          reason: { kind: 'ranking', soldLast28: dish.soldLast28, marginStatus: dish.marginStatus },
        });
        filled += 1;
      }
      if (filled === 0) {
        skipped += 1;
      }
    }
  }
  return { picks, skipped };
}
