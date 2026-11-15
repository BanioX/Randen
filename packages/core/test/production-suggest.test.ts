import { describe, expect, it } from 'vitest';
import { localDate, rappen, type Id } from '../src';
import {
  DEFAULT_PORTIONS,
  averagePortions,
  planAutoFill,
  proposedSlotFor,
  rankDishes,
  slotFits,
  suggestDishes,
  type SuggestArticle,
  type SuggestDish,
  type SuggestInput,
  type SuggestLot,
} from '../src/modules/production/suggest';
import { sequentialIds } from '../src/testing';
import type { PlanSuggestion } from '../src/modules/production/contract';

/**
 * The rules of «Reste verwerten» and the auto fill, on small hand-made data. Today is 14.11.2026
 * (a Saturday). Article ids: salmon 1, cream 2, butter 3. Dish ids come from `dish()`.
 */
const TODAY = localDate('2026-11-14');
const ids = sequentialIds(100);
const nextId = (): Id => ids.next();

const SALMON = nextId();
const CREAM = nextId();
const BUTTER = nextId();

const articles = new Map<Id, SuggestArticle>([
  [SALMON, { name: 'Lachsfilet', unit: 'g' }],
  [CREAM, { name: 'Vollrahm', unit: 'ml' }],
  [BUTTER, { name: 'Butter', unit: 'g' }],
]);

function lot(overrides: Partial<SuggestLot> & Pick<SuggestLot, 'articleId'>): SuggestLot {
  return {
    id: nextId(),
    quantity: 1500,
    pricePer1000: 3800,
    expiresOn: localDate('2026-11-15'),
    dateKind: 'use_by',
    ...overrides,
  };
}

function dish(
  name: string,
  perPortion: [Id, number][],
  overrides: Partial<SuggestDish> = {},
): SuggestDish {
  return {
    recipeId: nextId(),
    recipeName: name,
    course: 'main',
    perPortion: new Map(perPortion),
    marginStatus: 'good',
    ...overrides,
  };
}

/** Salmon with cream and butter: 4 portions of 640 g salmon, 300 ml cream, 40 g butter. */
const salmonDish = () =>
  dish('Lachs mit Rahmsauce', [
    [SALMON, 160],
    [CREAM, 75],
    [BUTTER, 10],
  ]);

function input(overrides: Partial<SuggestInput>): SuggestInput {
  return {
    today: TODAY,
    days: 7,
    lots: [],
    dishes: [],
    articles,
    usable: new Map([
      [SALMON, 1500],
      [CREAM, 8000],
      [BUTTER, 2000],
    ]),
    ...overrides,
  };
}

describe('meals of a dish', () => {
  it('puts a course into its natural meal', () => {
    expect(proposedSlotFor('breakfast')).toBe('breakfast');
    expect(proposedSlotFor('snack')).toBe('afternoon_snack');
    expect(proposedSlotFor('main')).toBe('lunch');
    expect(proposedSlotFor('dessert')).toBe('lunch');
  });

  it('lets lunch and dinner take each other, and keeps the rest to itself', () => {
    expect(slotFits('lunch', 'dinner')).toBe(true);
    expect(slotFits('dinner', 'lunch')).toBe(true);
    expect(slotFits('lunch', 'lunch')).toBe(true);
    expect(slotFits('breakfast', 'lunch')).toBe(false);
    expect(slotFits('afternoon_snack', 'dinner')).toBe(false);
  });
});

describe('suggestDishes', () => {
  it('suggests the salmon dish for the salmon lot: 9 portions, CHF 54.72 saved', () => {
    // Salmon 1500 g, 160 g per portion: floor(1500 ÷ 160) = 9 portions. Cream covers 8000 ÷ 75 =
    // 106, butter 2000 ÷ 10 = 200: nothing caps the 9. Used: 9 × 160 = 1440 g; saved 1440 g at
    // CHF 38.00 per kg = CHF 54.72.
    const salmon = lot({ articleId: SALMON });
    const [suggestion] = suggestDishes(input({ lots: [salmon], dishes: [salmonDish()] }));
    expect(suggestion).toMatchObject({
      lotId: salmon.id,
      articleName: 'Lachsfilet',
      unit: 'g',
      expiringQuantity: 1500,
      daysLeft: 1,
      dateKind: 'use_by',
      recipeName: 'Lachs mit Rahmsauce',
      portions: 9,
      usedQuantity: 1440,
      savedRappen: 5472,
      latestCookOn: '2026-11-15',
      proposedOn: '2026-11-14',
      proposedSlot: 'lunch',
      marginStatus: 'good',
      missing: [],
      ready: true,
    });
  });

  it('caps the portions at what the other ingredients cover', () => {
    // Cream 150 ml usable at 75 ml per portion covers 2 portions; the salmon would make 9.
    const salmon = lot({ articleId: SALMON });
    const [suggestion] = suggestDishes(
      input({
        lots: [salmon],
        dishes: [salmonDish()],
        usable: new Map([
          [SALMON, 1500],
          [CREAM, 150],
          [BUTTER, 2000],
        ]),
      }),
    );
    expect(suggestion).toMatchObject({ portions: 2, usedQuantity: 320, ready: true, missing: [] });
  });

  it('keeps a dish with missing ingredients, ranks it lower and names what is short', () => {
    // No cream at all: 9 portions of salmon, but 75 ml of cream each is short: 675 ml.
    const salmon = lot({ articleId: SALMON });
    const [suggestion] = suggestDishes(
      input({
        lots: [salmon],
        dishes: [salmonDish()],
        usable: new Map([
          [SALMON, 1500],
          [CREAM, 0],
          [BUTTER, 2000],
        ]),
      }),
    );
    expect(suggestion?.ready).toBe(false);
    expect(suggestion?.portions).toBe(9);
    expect(suggestion?.missing).toEqual([
      { articleId: CREAM, name: 'Vollrahm', unit: 'ml', missing: 675 },
    ]);
  });

  it('ranks ready dishes before those with missing ingredients, then by value saved', () => {
    const NUT = nextId();
    articles.set(NUT, { name: 'Haselnüsse', unit: 'g' });
    const salmon = lot({ articleId: SALMON });
    const cream = lot({
      articleId: CREAM,
      quantity: 3000,
      pricePer1000: 640,
      expiresOn: localDate('2026-11-20'),
      dateKind: 'best_before',
    });
    const soupDish = dish(
      'Rahmsuppe',
      [
        [CREAM, 50],
        [BUTTER, 20],
      ],
      { course: 'soup' },
    );
    const nutCake = dish('Nusskuchen', [
      [CREAM, 20],
      [NUT, 10],
    ]);
    const result = suggestDishes(
      input({
        lots: [cream, salmon],
        dishes: [salmonDish(), soupDish, nutCake],
        usable: new Map([
          [SALMON, 1500],
          [CREAM, 3000],
          [BUTTER, 2000],
          [NUT, 0],
        ]),
      }),
    );
    // The salmon dish saves the most of the ready ones: 1440 g at CHF 38.00 per kg.
    expect(result[0]).toMatchObject({
      recipeName: 'Lachs mit Rahmsauce',
      savedRappen: 5472,
      ready: true,
    });
    // The nut cake lacks nuts: it is listed, after every ready dish, with what is short.
    const firstNotReady = result.findIndex((suggestion) => !suggestion.ready);
    expect(firstNotReady).toBeGreaterThan(0);
    expect(result.slice(firstNotReady).every((suggestion) => !suggestion.ready)).toBe(true);
    expect(result.find((suggestion) => suggestion.recipeName === 'Nusskuchen')).toMatchObject({
      ready: false,
      missing: [{ articleId: NUT, name: 'Haselnüsse', unit: 'g', missing: 1500 }],
    });
  });

  it('leaves out lots that are past their date, not expiring in time, empty or unknown', () => {
    const outside = lot({ articleId: SALMON, expiresOn: localDate('2026-11-30') });
    const past = lot({ articleId: SALMON, expiresOn: localDate('2026-11-13') });
    const empty = lot({ articleId: SALMON, quantity: 0 });
    const unknownArticle = lot({ articleId: nextId() });
    const result = suggestDishes(
      input({ lots: [outside, past, empty, unknownArticle], dishes: [salmonDish()] }),
    );
    expect(result).toEqual([]);
  });

  it('counts a best-before lot as expiring too, and ranks by the value saved', () => {
    const useBy = lot({ articleId: SALMON, expiresOn: localDate('2026-11-16') });
    const bestBefore = lot({
      articleId: CREAM,
      quantity: 3000,
      pricePer1000: 640,
      expiresOn: localDate('2026-11-16'),
      dateKind: 'best_before',
    });
    const cheese = dish('Käsesauce', [[CREAM, 40]]);
    const result = suggestDishes(
      input({ lots: [bestBefore, useBy], dishes: [cheese, salmonDish()] }),
    );
    // Salmon 9 portions = CHF 54.72; cheese sauce 75 portions of the cream = CHF 19.20; the salmon
    // dish with the cream lot 9 portions of 75 ml = CHF 4.32. Highest value first.
    expect(result.map((suggestion) => [suggestion.recipeName, suggestion.savedRappen])).toEqual([
      ['Lachs mit Rahmsauce', 5472],
      ['Käsesauce', 1920],
      ['Lachs mit Rahmsauce', 432],
    ]);
    expect(result[1]).toMatchObject({ dateKind: 'best_before', portions: 75 });
  });

  it('gives an empty list without lots or dishes', () => {
    expect(suggestDishes(input({}))).toEqual([]);
  });

  it('skips a dish that does not use the lot article, and one that would use less than a portion', () => {
    const tiny = lot({ articleId: SALMON, quantity: 100 });
    expect(suggestDishes(input({ lots: [tiny], dishes: [salmonDish()] }))).toEqual([]);
    const unrelated = dish('Butterbrot', [[BUTTER, 20]]);
    expect(
      suggestDishes(input({ lots: [lot({ articleId: SALMON })], dishes: [unrelated] })),
    ).toEqual([]);
  });

  it('gives a dish whose only ingredient is the lot article full portions', () => {
    const salmonOnly = dish('Lachs pur', [[SALMON, 150]]);
    const [suggestion] = suggestDishes(
      input({ lots: [lot({ articleId: SALMON })], dishes: [salmonOnly] }),
    );
    // Nothing else caps: floor(1500 ÷ 150) = 10 portions, all of them ready.
    expect(suggestion).toMatchObject({
      portions: 10,
      usedQuantity: 1500,
      savedRappen: 5700,
      ready: true,
    });
  });
});

describe('the cap of a plan entry (10 000 portions)', () => {
  it('caps a suggestion at 10 000 portions, and the stock it uses with them', () => {
    // One piece of salmon a portion from 12 000 pieces: 12 000 portions, but a plan entry takes 10 000.
    const big = lot({ articleId: SALMON, quantity: 12_000 });
    const [suggestion] = suggestDishes(
      input({
        lots: [big],
        dishes: [dish('Lachssalat', [[SALMON, 1]])],
        usable: new Map([[SALMON, 12_000]]),
      }),
    );
    expect(suggestion).toMatchObject({
      portions: 10_000,
      usedQuantity: 10_000,
      expiringQuantity: 12_000,
      ready: true,
    });
  });

  it('plans at most 10 000 portions as the average of the sales', () => {
    expect(averagePortions(300_000)).toBe(10_000);
  });
});

describe('rankDishes', () => {
  it('ranks by margin status first, then by how often a dish sold, then by margin', () => {
    const ranked = rankDishes([
      {
        recipeId: nextId(),
        recipeName: 'Zander',
        marginStatus: 'over',
        marginRappen: 900,
        soldLast28: 50,
      },
      {
        recipeId: nextId(),
        recipeName: 'Suppe',
        marginStatus: 'good',
        marginRappen: 600,
        soldLast28: 10,
      },
      {
        recipeId: nextId(),
        recipeName: 'Burger',
        marginStatus: 'good',
        marginRappen: 800,
        soldLast28: 10,
      },
      {
        recipeId: nextId(),
        recipeName: 'Pommes',
        marginStatus: 'good',
        marginRappen: 300,
        soldLast28: 30,
      },
      {
        recipeId: nextId(),
        recipeName: 'Tatar',
        marginStatus: 'unknown',
        marginRappen: undefined,
        soldLast28: 99,
      },
    ]);
    expect(ranked.map((dish) => dish.recipeName)).toEqual([
      'Pommes',
      'Burger',
      'Suppe',
      'Tatar',
      'Zander',
    ]);
  });

  it('breaks the last ties by name, then id', () => {
    const a = nextId();
    const b = nextId();
    const ranked = rankDishes([
      { recipeId: b, recipeName: 'Gleich', marginStatus: 'good', marginRappen: 100, soldLast28: 1 },
      { recipeId: a, recipeName: 'Gleich', marginStatus: 'good', marginRappen: 100, soldLast28: 1 },
    ]);
    expect(ranked.map((dish) => dish.recipeId)).toEqual([a, b].sort((x, y) => x.localeCompare(y)));
  });
});

describe('averagePortions', () => {
  it('plans the average sold per day, at least one, and ten without any sales', () => {
    expect(averagePortions(0)).toBe(DEFAULT_PORTIONS);
    expect(averagePortions(28)).toBe(1);
    expect(averagePortions(56)).toBe(2);
    expect(averagePortions(10)).toBe(1);
    expect(averagePortions(280)).toBe(10);
  });
});

describe('planAutoFill', () => {
  const MONDAY_TUESDAY = [localDate('2026-11-14'), localDate('2026-11-15')];
  const noSuggestions: PlanSuggestion[] = [];
  /** No dish and no stock: for the fills that do not look at stock. */
  const NO_STOCK = { dishes: [], usable: new Map<Id, number>() };

  function suggestion(overrides: Partial<PlanSuggestion>): PlanSuggestion {
    return {
      lotId: nextId(),
      articleId: SALMON,
      articleName: 'Lachsfilet',
      unit: 'g',
      expiringQuantity: 1500,
      expiresOn: localDate('2026-11-15'),
      daysLeft: 1,
      dateKind: 'use_by',
      recipeId: nextId(),
      recipeName: 'Lachs mit Rahmsauce',
      course: 'main',
      portions: 9,
      usedQuantity: 1440,
      savedRappen: rappen(5472),
      latestCookOn: localDate('2026-11-15'),
      proposedOn: localDate('2026-11-14'),
      proposedSlot: 'lunch',
      marginStatus: 'good',
      missing: [],
      ready: true,
      ...overrides,
    };
  }

  it('plans the expiring dish first, on the first day it is still fine, and the rest by ranking', () => {
    const salmon = suggestion({});
    const ranking = [
      {
        recipeId: nextId(),
        recipeName: 'Entrecôte',
        marginStatus: 'good' as const,
        marginRappen: 2000,
        soldLast28: 56,
      },
    ];
    const result = planAutoFill({
      days: MONDAY_TUESDAY,
      slots: ['lunch', 'dinner'],
      occupied: new Set(),
      usedRecipes: new Set(),
      dishesPerSlot: 1,
      suggestions: [salmon],
      ranking,
      stock: {
        dishes: [dish('Lachs mit Rahmsauce', [[SALMON, 160]], { recipeId: salmon.recipeId })],
        usable: new Map([[SALMON, 1500]]),
      },
    });
    // Day one is full after two picks; day two has nothing left in the ranking.
    expect(result.skipped).toBe(2);
    expect(result.picks).toEqual([
      {
        date: '2026-11-14',
        slot: 'lunch',
        recipeId: salmon.recipeId,
        recipeName: 'Lachs mit Rahmsauce',
        portions: 9,
        reason: {
          kind: 'expiring',
          articleName: 'Lachsfilet',
          quantity: 1440,
          unit: 'g',
          expiresOn: '2026-11-15',
          savedRappen: 5472,
        },
      },
      {
        date: '2026-11-14',
        slot: 'dinner',
        recipeId: ranking[0]?.recipeId,
        recipeName: 'Entrecôte',
        portions: 2,
        reason: { kind: 'ranking', soldLast28: 56, marginStatus: 'good' },
      },
    ]);
  });

  it('never plans a suggestion after the day its stock falls due', () => {
    const salmon = suggestion({ latestCookOn: localDate('2026-11-14') });
    const result = planAutoFill({
      days: MONDAY_TUESDAY,
      slots: ['lunch'],
      occupied: new Set(),
      usedRecipes: new Set(),
      dishesPerSlot: 1,
      suggestions: [salmon],
      ranking: [],
      stock: {
        dishes: [dish('Lachs mit Rahmsauce', [[SALMON, 160]], { recipeId: salmon.recipeId })],
        usable: new Map([[SALMON, 1500]]),
      },
    });
    expect(result.picks.map((pick) => [pick.date, pick.reason.kind])).toEqual([
      ['2026-11-14', 'expiring'],
    ]);
    expect(result.skipped).toBe(1);
  });

  it('leaves occupied meals alone, uses a lot once and a dish at most once in the week', () => {
    const salmon = suggestion({});
    const cheap = suggestion({
      lotId: nextId(),
      recipeId: nextId(),
      recipeName: 'Lachs Gratin',
      savedRappen: rappen(100),
      latestCookOn: localDate('2026-11-15'),
    });
    const result = planAutoFill({
      days: MONDAY_TUESDAY,
      slots: ['lunch', 'dinner'],
      occupied: new Set([`${MONDAY_TUESDAY[0]}|lunch`]),
      usedRecipes: new Set(),
      dishesPerSlot: 1,
      suggestions: [salmon, cheap],
      ranking: [],
      stock: {
        dishes: [
          dish('Lachs mit Rahmsauce', [[SALMON, 160]], { recipeId: salmon.recipeId }),
          dish('Lachs Gratin', [[SALMON, 160]], { recipeId: cheap.recipeId }),
        ],
        // Two lots of salmon, 1 500 g each: both dishes fit.
        usable: new Map([[SALMON, 3000]]),
      },
    });
    // Lunch of day one is taken and stays. The salmon takes the dinner of day one (it suits
    // lunch and dinner alike), the gratin the lunch of day two; dinner of day two is left.
    expect(result.picks.map((pick) => `${pick.date} ${pick.slot} ${pick.recipeName}`)).toEqual([
      '2026-11-14 dinner Lachs mit Rahmsauce',
      '2026-11-15 lunch Lachs Gratin',
    ]);
    expect(result.skipped).toBe(1);
  });

  it('plans several dishes per meal, and never the same dish twice', () => {
    const ranking = [
      {
        recipeId: nextId(),
        recipeName: 'Suppe',
        marginStatus: 'good' as const,
        marginRappen: 500,
        soldLast28: 28,
      },
      {
        recipeId: nextId(),
        recipeName: 'Dessert',
        marginStatus: 'good' as const,
        marginRappen: 400,
        soldLast28: 0,
      },
    ];
    const result = planAutoFill({
      days: [localDate('2026-11-14')],
      slots: ['lunch'],
      occupied: new Set(),
      usedRecipes: new Set([ranking[1]?.recipeId ?? nextId()]),
      dishesPerSlot: 2,
      suggestions: [],
      ranking,
      stock: NO_STOCK,
    });
    expect(result.picks.map((pick) => [pick.recipeName, pick.portions])).toEqual([['Suppe', 1]]);
    expect(result.skipped).toBe(0);
  });

  it('skips a meal when no dish is left', () => {
    const result = planAutoFill({
      days: [localDate('2026-11-14')],
      slots: ['lunch', 'dinner'],
      occupied: new Set(),
      usedRecipes: new Set(),
      dishesPerSlot: 1,
      suggestions: noSuggestions,
      ranking: [],
      stock: NO_STOCK,
    });
    expect(result).toEqual({ picks: [], skipped: 2 });
  });

  it('does not put a suggestion of another meal into a meal it does not suit', () => {
    const breakfastDish = suggestion({ proposedSlot: 'breakfast', recipeName: 'Rührei' });
    const result = planAutoFill({
      days: [localDate('2026-11-14')],
      slots: ['lunch'],
      occupied: new Set(),
      usedRecipes: new Set(),
      dishesPerSlot: 1,
      suggestions: [breakfastDish],
      ranking: [],
      stock: NO_STOCK,
    });
    expect(result.picks).toEqual([]);
    expect(result.skipped).toBe(1);
  });
});

describe('planAutoFill and the stock that dishes of one fill share', () => {
  const DAYS = [localDate('2026-11-14'), localDate('2026-11-15')];
  const POTATOES = nextId();
  const withPotatoes = new Map<Id, SuggestArticle>([
    ...articles,
    [POTATOES, { name: 'Kartoffeln', unit: 'g' }],
  ]);

  /**
   * Two dishes on the same 2 000 g of potatoes: «Kartoffelgratin» (100 g salmon and 200 g potatoes a
   * portion) on a salmon lot of 1 000 g makes 10 portions, «Kartoffelrösti» (100 g butter and 200 g
   * potatoes) on a butter lot of 500 g makes 5. Together they need 3 000 g of potatoes.
   */
  function gratinAndRosti(potatoesInStock: number) {
    const gratin = dish('Kartoffelgratin', [
      [SALMON, 100],
      [POTATOES, 200],
    ]);
    const rosti = dish('Kartoffelrösti', [
      [BUTTER, 100],
      [POTATOES, 200],
    ]);
    const usable = new Map<Id, number>([
      [SALMON, 1000],
      [BUTTER, 500],
      [POTATOES, potatoesInStock],
    ]);
    const suggestions = suggestDishes({
      today: TODAY,
      days: 7,
      lots: [
        lot({ articleId: SALMON, quantity: 1000, pricePer1000: 3800 }),
        lot({ articleId: BUTTER, quantity: 500, pricePer1000: 1400 }),
      ],
      dishes: [gratin, rosti],
      articles: withPotatoes,
      usable,
    });
    return { gratin, rosti, suggestions, usable };
  }

  it('does not plan a second dish on potatoes the first one already needs', () => {
    const { gratin, rosti, suggestions, usable } = gratinAndRosti(2000);
    // Both are ready on the full stock, but the gratin takes 2 000 g of potatoes: the rösti no longer fits.
    expect(suggestions.map((row) => row.recipeName)).toEqual(['Kartoffelgratin', 'Kartoffelrösti']);
    const result = planAutoFill({
      days: DAYS,
      slots: ['lunch', 'dinner'],
      occupied: new Set(),
      usedRecipes: new Set(),
      dishesPerSlot: 1,
      suggestions,
      ranking: [],
      stock: { dishes: [gratin, rosti], usable },
    });
    expect(result.picks.map((pick) => [pick.recipeName, pick.portions])).toEqual([
      ['Kartoffelgratin', 10],
    ]);
    expect(result.skipped).toBe(3);
  });

  it('plans both dishes when the potatoes cover both', () => {
    const { gratin, rosti, suggestions, usable } = gratinAndRosti(3000);
    const result = planAutoFill({
      days: DAYS,
      slots: ['lunch', 'dinner'],
      occupied: new Set(),
      usedRecipes: new Set(),
      dishesPerSlot: 1,
      suggestions,
      ranking: [],
      stock: { dishes: [gratin, rosti], usable },
    });
    expect(result.picks.map((pick) => [pick.recipeName, pick.portions])).toEqual([
      ['Kartoffelgratin', 10],
      ['Kartoffelrösti', 5],
    ]);
    expect(result.skipped).toBe(2);
  });

  it('counts the stock a dish from the ranking takes before a later suggestion looks at it', () => {
    // «Morgenbrei» is a breakfast dish on 500 g of butter, with 200 g of potatoes a portion. The
    // ranking dish «Pommes frites» sells 280 portions in 28 days, so it takes 10 portions of 200 g
    // potatoes at lunch on the 14th, which leaves no potatoes for the breakfast on the 14th.
    const morgenbrei = dish(
      'Morgenbrei',
      [
        [BUTTER, 100],
        [POTATOES, 200],
      ],
      { course: 'breakfast' },
    );
    const pommes = dish('Pommes frites', [[POTATOES, 200]], { course: 'side' });
    const usable = new Map<Id, number>([
      [BUTTER, 500],
      [POTATOES, 2000],
    ]);
    const suggestions = suggestDishes({
      today: TODAY,
      days: 7,
      lots: [lot({ articleId: BUTTER, quantity: 500, pricePer1000: 1400 })],
      dishes: [morgenbrei, pommes],
      articles: withPotatoes,
      usable,
    });
    expect(suggestions.map((row) => [row.recipeName, row.ready])).toEqual([['Morgenbrei', true]]);
    const result = planAutoFill({
      days: DAYS,
      slots: ['lunch', 'breakfast'],
      occupied: new Set(),
      usedRecipes: new Set(),
      dishesPerSlot: 1,
      suggestions,
      ranking: [
        {
          recipeId: pommes.recipeId,
          recipeName: 'Pommes frites',
          marginStatus: 'good',
          marginRappen: 900,
          soldLast28: 280,
        },
      ],
      stock: { dishes: [morgenbrei, pommes], usable },
    });
    expect(
      result.picks.map((pick) => [pick.date, pick.slot, pick.recipeName, pick.portions]),
    ).toEqual([['2026-11-14', 'lunch', 'Pommes frites', 10]]);
    expect(result.skipped).toBe(3);
  });
});
