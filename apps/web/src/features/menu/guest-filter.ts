import {
  AllergenIdSchema,
  type AllergenId,
  type AllergenRef,
  type Diet,
  type GuestDish,
} from '@randen/core';

/** The diet filter of the guest view: everything, what is vegetarian, what is vegan. */
export const DIET_FILTERS = ['all', 'vegetarian', 'vegan'] as const;
export type DietFilter = (typeof DIET_FILTERS)[number];

/** What a guest asked for: a diet and the allergens to leave out («Ohne …»). */
export interface GuestFilter {
  diet: DietFilter;
  without: AllergenId[];
}

/** Reads the filter from the address (`?diet=vegan&ohne=milk,fish`), so «Zurück» keeps it. */
export function readFilter(params: URLSearchParams): GuestFilter {
  const dietParam = params.get('diet');
  const diet = DIET_FILTERS.find((value) => value === dietParam) ?? 'all';
  const without: AllergenId[] = [];
  for (const part of (params.get('ohne') ?? '').split(',')) {
    const parsed = AllergenIdSchema.safeParse(part.trim());
    if (parsed.success && !without.includes(parsed.data)) {
      without.push(parsed.data);
    }
  }
  return { diet, without };
}

/** Writes the filter back into the address; the defaults leave their parameter out. */
export function writeFilter(params: URLSearchParams, filter: GuestFilter): URLSearchParams {
  const next = new URLSearchParams(params);
  if (filter.diet === 'all') {
    next.delete('diet');
  } else {
    next.set('diet', filter.diet);
  }
  if (filter.without.length === 0) {
    next.delete('ohne');
  } else {
    next.set('ohne', filter.without.join(','));
  }
  return next;
}

/** Whether a dish is of the diet asked for: vegetarian includes vegan. */
export function matchesDiet(diet: Diet, filter: DietFilter): boolean {
  if (filter === 'all') {
    return true;
  }
  return filter === 'vegan' ? diet === 'vegan' : diet !== 'omnivore';
}

export interface FilteredDish {
  dish: GuestDish;
  /** Allergens left out that are only possible as traces: the dish stays, with a mark. */
  traceHits: AllergenRef[];
}

/**
 * The dishes a guest may see with this filter. A dish that contains an allergen to leave out
 * disappears; one that may only contain traces of it stays, marked.
 */
export function filterDishes(dishes: readonly GuestDish[], filter: GuestFilter): FilteredDish[] {
  return dishes
    .filter(
      (dish) =>
        matchesDiet(dish.diet, filter.diet) &&
        !dish.allergens.some((allergen) => filter.without.includes(allergen.id)),
    )
    .map((dish) => ({
      dish,
      traceHits: dish.traces.filter((allergen) => filter.without.includes(allergen.id)),
    }));
}
