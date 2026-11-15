import { describe, expect, it } from 'vitest';
import type { AllergenId, AllergenRef, GuestDish } from '@randen/core';
import { filterDishes, matchesDiet, readFilter, writeFilter } from './guest-filter';

const allergen = (id: AllergenId, label: string): AllergenRef => ({
  id,
  label,
  official: `${label} amtlich`,
});

function dish(id: string, fields: Partial<GuestDish> = {}): GuestDish {
  return {
    id,
    name: id,
    allergens: [],
    traces: [],
    diet: 'omnivore',
    labels: [],
    origins: [],
    incomplete: false,
    ...fields,
  } as GuestDish;
}

describe('readFilter and writeFilter', () => {
  it('reads the diet and the excluded allergens, dropping what is unknown and repeated', () => {
    const params = new URLSearchParams('diet=vegan&ohne=milk,fish,milk,pizza');
    expect(readFilter(params)).toEqual({ diet: 'vegan', without: ['milk', 'fish'] });
    expect(readFilter(new URLSearchParams('diet=paleo'))).toEqual({ diet: 'all', without: [] });
    expect(readFilter(new URLSearchParams())).toEqual({ diet: 'all', without: [] });
  });

  it('writes the filter back, and leaves out the defaults', () => {
    const written = writeFilter(new URLSearchParams('q=1'), {
      diet: 'vegetarian',
      without: ['eggs', 'soy'],
    });
    expect(written.toString()).toBe('q=1&diet=vegetarian&ohne=eggs%2Csoy');
    expect(writeFilter(written, { diet: 'all', without: [] }).toString()).toBe('q=1');
  });
});

describe('matchesDiet', () => {
  it('lets everything through for «Alle», vegetarian includes vegan', () => {
    expect(matchesDiet('omnivore', 'all')).toBe(true);
    expect(matchesDiet('omnivore', 'vegetarian')).toBe(false);
    expect(matchesDiet('vegetarian', 'vegetarian')).toBe(true);
    expect(matchesDiet('vegan', 'vegetarian')).toBe(true);
    expect(matchesDiet('vegetarian', 'vegan')).toBe(false);
    expect(matchesDiet('vegan', 'vegan')).toBe(true);
  });

  it('claims no diet for a dish without one: only «Alle» lets it through', () => {
    expect(matchesDiet(undefined, 'all')).toBe(true);
    expect(matchesDiet(undefined, 'vegetarian')).toBe(false);
    expect(matchesDiet(undefined, 'vegan')).toBe(false);
  });
});

describe('filterDishes', () => {
  it('removes a dish with an excluded allergen and keeps one with only its traces, marked', () => {
    const milk = allergen('milk', 'Milch');
    const nuts = allergen('nuts', 'Nüsse');
    const dishes = [
      dish('risotto', { allergens: [milk] }),
      dish('muesli', { traces: [nuts] }),
      dish('salad'),
    ];
    const shown = filterDishes(dishes, { diet: 'all', without: ['milk', 'nuts'] });
    expect(shown.map((entry) => entry.dish.id)).toEqual(['muesli', 'salad']);
    expect(shown[0]?.traceHits.map((item) => item.label)).toEqual(['Nüsse']);
    expect(shown[1]?.traceHits).toEqual([]);
  });

  it('combines the diet with the exclusions', () => {
    const dishes = [
      dish('soup', { diet: 'vegetarian' }),
      dish('stew', { diet: 'omnivore' }),
      dish('bowl', { diet: 'vegan' }),
    ];
    expect(
      filterDishes(dishes, { diet: 'vegan', without: [] }).map((entry) => entry.dish.id),
    ).toEqual(['bowl']);
    expect(
      filterDishes(dishes, { diet: 'vegetarian', without: [] }).map((entry) => entry.dish.id),
    ).toEqual(['soup', 'bowl']);
    expect(filterDishes(dishes, { diet: 'all', without: [] })).toHaveLength(3);
  });
});
