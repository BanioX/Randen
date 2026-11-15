import { grossQuantity } from '../../domain/costing';
import { roundQuantity } from '../../domain/units';
import type { LocalDate } from '../../model/primitives';
import type { WasteReason } from '../../model/stock';
import {
  ARTICLES,
  RECIPES,
  STAFF_MEAL,
  SUPPLIERS,
  WEEKDAY_FACTOR,
  type ArticleDef,
  type Ingredient,
  type RecipeDef,
  type StaffKey,
  type SupplierDef,
} from './catalogue';
import { createRandom, dayAt, roundUpTo, weekdayOf } from './support';

/**
 * The plan of the demo history, before anything is booked: what was sold on each of the last
 * 56 days, which components were made when, and when the goods that keep for months came in.
 * Everything here is pure and depends on nothing but today, so the same day gives the same
 * plan on every device. Days are offsets from today: -1 is yesterday, -56 the first day.
 */

export const HISTORY_DAYS = 56;
/** Orders and productions cover a few days ahead; their demand is the forecast. */
const FORECAST_DAYS = 8;
/** The stock take («Inventur»), three weeks ago. */
export const COUNT_DAY = -21;
/** Fixed seed: the demo is the same kitchen everywhere. */
const SEED = 20_261_114;
/** The take-away dish sells on the days since the first box came from the market (ADR-0015). */
export const TAKEAWAY_DISH = 'caesarToGo';
export const TAKEAWAY_DAYS = 13;
/** Its own seed: the take-away portions do not move the history of the other dishes. */
const TAKEAWAY_SEED = 7177;

export const articleByKey = new Map(ARTICLES.map((article) => [article.key, article]));
export const recipeByKey = new Map(RECIPES.map((recipe) => [recipe.key, recipe]));
export const supplierByKey = new Map(SUPPLIERS.map((supplier) => [supplier.key, supplier]));
export const DISHES = RECIPES.filter((recipe) => recipe.kind === 'dish');
/** Components in the order they are made on a day: the jus needs the stock of the same week. */
export const COMPONENTS = ['vealStock', 'jus', 'tomatoSauce', 'vinaigrette', 'mash'].map((key) =>
  must(recipeByKey.get(key), key),
);

export function must<T>(value: T | undefined, what: string): T {
  if (value === undefined) {
    throw new Error(`Demo catalogue: ${what} is missing`);
  }
  return value;
}

export function articleOf(key: string): ArticleDef {
  return must(articleByKey.get(key), `article ${key}`);
}

/** Goods made in house. */
export const isComponent = (article: ArticleDef) => article.recipe !== undefined;

/** Goods that keep for months (or have no date): their deliveries are planned back from today. */
export function keepsLong(article: ArticleDef): boolean {
  return !isComponent(article) && (article.noDate === true || (article.shelfLifeDays ?? 0) >= 60);
}

/** The step goods are ordered in: the pack, or what the catalogue says, or a sensible default. */
export function orderStep(article: ArticleDef): number {
  return (
    article.pack?.[0] ??
    article.step ??
    (article.unit === 'pcs' ? 1 : article.unit === 'ml' ? 1000 : 500)
  );
}

/** What `portions` of a recipe take from stock, gross, per article (as `recipeRequirements`). */
export function requirementsOf(
  ingredients: readonly Ingredient[],
  factor: number,
): Map<string, number> {
  const result = new Map<string, number>();
  for (const [key, quantity] of ingredients) {
    const gross = grossQuantity(quantity * factor, articleOf(key).yieldBps ?? 10_000);
    result.set(key, roundQuantity((result.get(key) ?? 0) + gross));
  }
  return result;
}

export interface PlannedProduction {
  day: number;
  recipe: RecipeDef;
  /** Batches; a batch gives `recipe.output`. */
  portions: number;
  by: StaffKey;
}

export interface ScriptedWaste {
  day: number;
  article: string;
  quantity: number;
  reason: WasteReason;
  note: string;
  by: StaffKey;
}

/**
 * Write-offs with every reason, spread over the weeks. Quantities are taken from the lot that
 * would be used first; «Abgelaufen» also comes on its own when a lot passes its date.
 */
export const SCRIPTED_WASTES: readonly ScriptedWaste[] = [
  {
    day: -52,
    article: 'lambsLettuce',
    quantity: 300,
    reason: 'prep_waste',
    note: 'Welke Blätter aussortiert.',
    by: 'luca',
  },
  {
    day: -47,
    article: 'eggs',
    quantity: 6,
    reason: 'damaged',
    note: 'Karton beim Einräumen fallen gelassen.',
    by: 'noah',
  },
  {
    day: -44,
    article: 'mash',
    quantity: 900,
    reason: 'plate_waste',
    note: 'Tellerrücklauf nach dem Abendservice.',
    by: 'luca',
  },
  {
    day: -36,
    article: 'mushrooms',
    quantity: 400,
    reason: 'spoiled',
    note: 'Schimmel, aussortiert.',
    by: 'mara',
  },
  {
    day: -33,
    article: 'tomatoSauce',
    quantity: 1500,
    reason: 'overproduction',
    note: 'Zu viel für das Personalessen gekocht.',
    by: 'mara',
  },
  {
    day: -29,
    article: 'romaine',
    quantity: 500,
    reason: 'prep_waste',
    note: 'Äussere Blätter welk.',
    by: 'luca',
  },
  {
    day: -26,
    article: 'ciabatta',
    quantity: 4,
    reason: 'plate_waste',
    note: 'Brotkörbe zurück.',
    by: 'ines',
  },
  {
    day: -23,
    article: 'salmon',
    quantity: 200,
    reason: 'other',
    note: 'Probe für die Lebensmittelkontrolle.',
    by: 'mara',
  },
  {
    day: -19,
    article: 'spinach',
    quantity: 400,
    reason: 'spoiled',
    note: 'Matschig, zu spät bemerkt.',
    by: 'luca',
  },
  {
    day: -16,
    article: 'mash',
    quantity: 1500,
    reason: 'overproduction',
    note: 'Zu viel für Samstagabend vorbereitet.',
    by: 'mara',
  },
  {
    day: -11,
    article: 'milk',
    quantity: 1000,
    reason: 'damaged',
    note: 'Packung undicht.',
    by: 'noah',
  },
  {
    day: -7,
    article: 'mash',
    quantity: 700,
    reason: 'plate_waste',
    note: 'Tellerrücklauf nach dem Abendservice.',
    by: 'luca',
  },
  {
    day: -5,
    article: 'squash',
    quantity: 600,
    reason: 'prep_waste',
    note: 'Faulstelle grosszügig ausgeschnitten.',
    by: 'luca',
  },
  {
    day: -3,
    article: 'ciabatta',
    quantity: 3,
    reason: 'plate_waste',
    note: 'Brotkörbe zurück.',
    by: 'ines',
  },
  {
    day: -2,
    article: 'lambsLettuce',
    quantity: 200,
    reason: 'spoiled',
    note: 'Welk, nicht mehr schön.',
    by: 'luca',
  },
];

/** Small differences found at the stock take: counted minus expected, on the first lot. */
export const COUNT_DIFFERENCES: readonly [article: string, delta: number][] = [
  ['butter', -150],
  ['eggs', -4],
  ['potatoes', -1100],
  ['onions', -400],
  ['cream', 1000],
  ['mushrooms', -250],
  ['carrots', 300],
];

/**
 * Cream from another supplier that ended up behind the other packs and was found after its
 * date: «Abgelaufen» with a story. These lots are skipped when goods are taken for service.
 */
export const FORGOTTEN_LOTS: readonly {
  fromDay: number;
  article: string;
  supplier: SupplierDef['key'];
  quantity: number;
  keepsDays: number;
  note: string;
}[] = [
  {
    fromDay: -46,
    article: 'cream',
    supplier: 'fishmonger',
    quantity: 2000,
    keepsDays: 5,
    note: 'Hinten in der Kühlzelle vergessen, Datum überschritten.',
  },
  {
    fromDay: -17,
    article: 'cream',
    supplier: 'fishmonger',
    quantity: 1000,
    keepsDays: 5,
    note: 'Hinter den neuen Packungen gefunden, Datum überschritten.',
  },
];

export interface DemoPlan {
  today: LocalDate;
  /** Portions per dish and day: sold (history) or expected (today and later). */
  sales: Map<number, Map<string, number>>;
  /** Components made in the history, in the order of the days and of `COMPONENTS`. */
  productions: PlannedProduction[];
  /** Goods that keep long: what was there 56 days ago and what came when. */
  longKeeping: Map<string, { opening: number; deliveries: Map<number, number> }>;
  /** What every article is used for per day (gross), including productions and losses. */
  demand: Map<string, Map<number, number>>;
}

export function isDeliveryDay(supplier: SupplierDef, today: LocalDate, day: number): boolean {
  return supplier.deliveryDays.includes(weekdayOf(dayAt(today, day)));
}

/** Days -56 to -1 on which a supplier delivers. */
export function deliveryDays(supplier: SupplierDef, today: LocalDate): number[] {
  const days: number[] = [];
  for (let day = -HISTORY_DAYS; day < 0; day += 1) {
    if (isDeliveryDay(supplier, today, day)) {
      days.push(day);
    }
  }
  return days;
}

function add(
  demand: Map<string, Map<number, number>>,
  article: string,
  day: number,
  quantity: number,
) {
  let byDay = demand.get(article);
  if (byDay === undefined) {
    byDay = new Map();
    demand.set(article, byDay);
  }
  byDay.set(day, roundQuantity((byDay.get(day) ?? 0) + quantity));
}

export function demandOn(
  demand: DemoPlan['demand'],
  article: string,
  from: number,
  to: number,
): number {
  let sum = 0;
  const byDay = demand.get(article);
  for (let day = from; day < to; day += 1) {
    sum += byDay?.get(day) ?? 0;
  }
  return roundQuantity(sum);
}

/**
 * What the dishes sold on a day take from stock, per article (gross). Pieces are whole: the
 * kitchen opens whole eggs and cuts whole loaves for the croûtons of the day.
 */
export function dayNeeds(byDish: ReadonlyMap<string, number>): Map<string, number> {
  const needs = new Map<string, number>();
  for (const dish of DISHES) {
    const portions = byDish.get(dish.key) ?? 0;
    if (portions <= 0) {
      continue;
    }
    for (const [article, quantity] of requirementsOf(dish.ingredients, portions / dish.portions)) {
      needs.set(article, roundQuantity((needs.get(article) ?? 0) + quantity));
    }
  }
  for (const [article, quantity] of needs) {
    if (articleOf(article).unit === 'pcs') {
      needs.set(article, Math.ceil(quantity - 1e-9));
    }
  }
  return needs;
}

/** Portions sold per dish and day, with the rhythm of the week and a little noise. */
function salesPlan(today: LocalDate): Map<number, Map<string, number>> {
  const random = createRandom(SEED);
  const takeaway = createRandom(TAKEAWAY_SEED);
  const sales = new Map<number, Map<string, number>>();
  for (let day = -HISTORY_DAYS; day < FORECAST_DAYS; day += 1) {
    const factor = WEEKDAY_FACTOR[weekdayOf(dayAt(today, day))];
    const byDish = new Map<string, number>();
    for (const dish of DISHES) {
      // A dish without a daily figure is not on the sales plan (the take-away dish): it draws
      // no random number either, so the history of the other dishes stays as it is.
      if (dish.daily === undefined) {
        byDish.set(dish.key, 0);
        continue;
      }
      // The history varies from day to day; the days ahead are the plain expectation.
      const noise = day < 0 ? random.spread(0.2) : 1;
      byDish.set(dish.key, Math.max(0, Math.round((dish.daily ?? 0) * factor * noise)));
    }
    // Take-away portions, one to four a day, in the plan so that its ingredients leave the stock
    // on the day like those of the other dishes (the walk books them).
    byDish.set(TAKEAWAY_DISH, day >= -TAKEAWAY_DAYS && day < 0 ? takeaway.int(1, 4) : 0);
    sales.set(day, byDish);
  }
  return sales;
}

/** Days a component is made: every `every` days, the last time `lastDaysAgo` days ago. */
function productionDays(recipe: RecipeDef): number[] {
  const days: number[] = [];
  const every = recipe.every ?? 3;
  for (let day = -(recipe.lastDaysAgo ?? 1); day >= -HISTORY_DAYS; day -= every) {
    days.push(day);
  }
  return days.reverse();
}

const COOKS: readonly StaffKey[] = ['luca', 'mara'];

/**
 * Builds the plan for `today`. Components are made to cover what is needed until the next
 * batch plus a little reserve; the stock made three days ago keeps a visible rest for today.
 */
export function buildPlan(today: LocalDate): DemoPlan {
  const sales = salesPlan(today);
  const demand: DemoPlan['demand'] = new Map();

  for (const [day, byDish] of sales) {
    for (const [article, quantity] of dayNeeds(byDish)) {
      add(demand, article, day, quantity);
    }
    for (const [article, quantity] of requirementsOf(STAFF_MEAL, 1)) {
      add(demand, article, day, quantity);
    }
  }
  for (const waste of SCRIPTED_WASTES) {
    add(demand, waste.article, waste.day, waste.quantity);
  }

  // Components from the last to the first in the chain, so the stock knows what the jus needs.
  // Each batch covers the days until the next one; what is left of the batch before and still
  // good on the day is used first, so the kitchen makes only what is missing.
  const productions: PlannedProduction[] = [];
  for (const recipe of [...COMPONENTS].reverse()) {
    const [outputKey, outputQuantity] = must(recipe.output, `output of ${recipe.key}`);
    const days = productionDays(recipe);
    const every = recipe.every ?? 3;
    const shelf = recipe.shelfLifeDays ?? every;
    let rest = 0;
    let restUntil = -HISTORY_DAYS;
    for (const [index, day] of days.entries()) {
      const until = days[index + 1] ?? day + every;
      const carried = Math.min(
        rest,
        demandOn(demand, outputKey, day, Math.min(until, restUntil + 1)),
      );
      let need = demandOn(demand, outputKey, day, until) * 1.04 - carried;
      if (day === -(recipe.lastDaysAgo ?? 1) && recipe.key === 'vealStock') {
        // A visible rest that is due today: the kitchen sees it in «Heute verwerten».
        need += 1500;
      }
      const portions = Math.max(0.5, roundUpTo(need / outputQuantity, 0.5));
      productions.push({ day, recipe, portions, by: COOKS[index % COOKS.length] ?? 'luca' });
      for (const [article, quantity] of requirementsOf(
        recipe.ingredients,
        portions / recipe.portions,
      )) {
        add(demand, article, day, quantity);
      }
      rest = Math.max(
        0,
        portions * outputQuantity + carried - demandOn(demand, outputKey, day, until),
      );
      restUntil = day + shelf;
    }
  }
  const order = new Map(COMPONENTS.map((recipe, index) => [recipe.key, index]));
  productions.sort(
    (a, b) => a.day - b.day || (order.get(a.recipe.key) ?? 0) - (order.get(b.recipe.key) ?? 0),
  );

  const longKeeping: DemoPlan['longKeeping'] = new Map();
  for (const article of ARTICLES.filter(keepsLong)) {
    longKeeping.set(article.key, planBackwards(article, today, demand));
  }
  return { today, sales, productions, longKeeping, demand };
}

/**
 * Goods that keep for months, planned back from the stock they have today: walking back day
 * by day the stock grows by what was used; on a delivery day, as many packs as keep the stock
 * before the delivery at or above the minimum came in. Forward this reads like a kitchen that
 * orders whole packs when it gets close to its minimum, and it ends exactly at `finalStock`.
 */
function planBackwards(
  article: ArticleDef,
  today: LocalDate,
  demand: DemoPlan['demand'],
): { opening: number; deliveries: Map<number, number> } {
  const supplier = must(
    supplierByKey.get(must(article.supplier, `supplier of ${article.key}`)),
    'supplier',
  );
  const pack = orderStep(article);
  const minimum = article.minStock ?? pack;
  const target = article.targetStock ?? minimum + 3 * pack;
  const quiet = article.quietDays ?? 0;
  const deliveries = new Map<number, number>();
  let stock = article.finalStock ?? roundUpTo((minimum + target) / 2, pack);
  for (let day = -1; day >= -HISTORY_DAYS; day -= 1) {
    stock = roundQuantity(stock + (demand.get(article.key)?.get(day) ?? 0));
    if (day < -quiet && isDeliveryDay(supplier, today, day)) {
      const packs = Math.floor((stock - minimum) / pack);
      if (packs >= 1 && stock >= (minimum + target) / 2) {
        deliveries.set(day, packs * pack);
        stock = roundQuantity(stock - packs * pack);
      }
    }
  }
  return { opening: stock, deliveries };
}
