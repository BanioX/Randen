import { z } from 'zod';
import type { Diet } from './allergens';
import type { DateKind } from '../model/primitives';

/** Where a kind of goods is usually kept; an area has exactly one kind. */
/**
 * `station` is a «Posten»: the fridge and shelves of one station of the kitchen (garde-manger,
 * pâtisserie), where the mise en place of the day is kept.
 */
export const AreaKindSchema = z.enum(['cold', 'frozen', 'dry', 'bar', 'station', 'other']);
export type AreaKind = z.infer<typeof AreaKindSchema>;
export const AREA_KINDS = AreaKindSchema.options;

export function areaKindLabel(kind: AreaKind): string {
  return {
    cold: 'Kühlzelle',
    frozen: 'Tiefkühlzelle',
    dry: 'Trockenlager',
    bar: 'Bar und Weinkeller',
    station: 'Posten',
    other: 'Anderes',
  }[kind];
}

interface CategoryInfo {
  id: string;
  label: string;
  /** Where goods of this group usually go at goods receipt. */
  area: AreaKind;
  /**
   * Days until the date, used only as a first proposal at goods receipt; the date on the pack
   * always wins. Fresh goods follow the guideline values of the industry (docs/fakten.md
   * section 7: raw meat, poultry and fish 3 days, raw vegetables and fruit 10 days, precooked
   * components production day plus 2), the rest are plain estimates.
   */
  shelfLifeDays: number;
  dateKind: DateKind;
  diet: Diet;
  /** Meat and fish: the country of origin is shown on the menu card. */
  declaresOrigin: boolean;
}

/**
 * Groups of goods of a professional kitchen. They sort lists, pick a first storage area and a
 * first shelf life, and tell the menu card which ingredients need an origin. All values are
 * proposals a business can overrule per article.
 */
export const ARTICLE_CATEGORIES = [
  {
    id: 'meat',
    label: 'Fleisch',
    area: 'cold',
    shelfLifeDays: 5,
    dateKind: 'use_by',
    diet: 'omnivore',
    declaresOrigin: true,
  },
  {
    id: 'poultry',
    label: 'Geflügel',
    area: 'cold',
    shelfLifeDays: 4,
    dateKind: 'use_by',
    diet: 'omnivore',
    declaresOrigin: true,
  },
  {
    id: 'charcuterie',
    label: 'Wurst und Charcuterie',
    area: 'cold',
    shelfLifeDays: 14,
    dateKind: 'use_by',
    diet: 'omnivore',
    declaresOrigin: true,
  },
  {
    id: 'fish',
    label: 'Fisch und Meeresfrüchte',
    area: 'cold',
    shelfLifeDays: 3,
    dateKind: 'use_by',
    diet: 'omnivore',
    declaresOrigin: true,
  },
  {
    id: 'dairy',
    label: 'Milchprodukte',
    area: 'cold',
    shelfLifeDays: 10,
    dateKind: 'best_before',
    diet: 'vegetarian',
    declaresOrigin: false,
  },
  {
    id: 'cheese',
    label: 'Käse',
    area: 'cold',
    shelfLifeDays: 21,
    dateKind: 'best_before',
    diet: 'vegetarian',
    declaresOrigin: false,
  },
  {
    id: 'eggs',
    label: 'Eier',
    area: 'cold',
    shelfLifeDays: 21,
    dateKind: 'best_before',
    diet: 'vegetarian',
    declaresOrigin: false,
  },
  {
    id: 'vegetables',
    label: 'Gemüse',
    area: 'cold',
    shelfLifeDays: 6,
    dateKind: 'best_before',
    diet: 'vegan',
    declaresOrigin: false,
  },
  {
    id: 'fruit',
    label: 'Früchte',
    area: 'cold',
    shelfLifeDays: 6,
    dateKind: 'best_before',
    diet: 'vegan',
    declaresOrigin: false,
  },
  {
    id: 'herbs',
    label: 'Kräuter und Salate',
    area: 'cold',
    shelfLifeDays: 4,
    dateKind: 'best_before',
    diet: 'vegan',
    declaresOrigin: false,
  },
  {
    id: 'bakery',
    label: 'Brot und Backwaren',
    area: 'dry',
    shelfLifeDays: 2,
    dateKind: 'best_before',
    diet: 'vegetarian',
    declaresOrigin: false,
  },
  {
    id: 'dry',
    label: 'Trockenwaren',
    area: 'dry',
    shelfLifeDays: 365,
    dateKind: 'best_before',
    diet: 'vegan',
    declaresOrigin: false,
  },
  {
    id: 'canned',
    label: 'Konserven',
    area: 'dry',
    shelfLifeDays: 730,
    dateKind: 'best_before',
    diet: 'vegan',
    declaresOrigin: false,
  },
  {
    id: 'spices',
    label: 'Gewürze',
    area: 'dry',
    shelfLifeDays: 540,
    dateKind: 'best_before',
    diet: 'vegan',
    declaresOrigin: false,
  },
  {
    id: 'oils',
    label: 'Öle und Fette',
    area: 'dry',
    shelfLifeDays: 365,
    dateKind: 'best_before',
    diet: 'vegan',
    declaresOrigin: false,
  },
  {
    id: 'sauces',
    label: 'Saucen und Fonds',
    area: 'dry',
    shelfLifeDays: 365,
    dateKind: 'best_before',
    diet: 'vegan',
    declaresOrigin: false,
  },
  {
    id: 'frozen',
    label: 'Tiefkühlprodukte',
    area: 'frozen',
    shelfLifeDays: 270,
    dateKind: 'best_before',
    diet: 'vegan',
    declaresOrigin: false,
  },
  {
    id: 'convenience',
    label: 'Convenience',
    area: 'cold',
    shelfLifeDays: 14,
    dateKind: 'use_by',
    diet: 'vegetarian',
    declaresOrigin: false,
  },
  {
    id: 'sweets',
    label: 'Dessert und Süsses',
    area: 'dry',
    shelfLifeDays: 180,
    dateKind: 'best_before',
    diet: 'vegetarian',
    declaresOrigin: false,
  },
  {
    id: 'softdrinks',
    label: 'Getränke ohne Alkohol',
    area: 'bar',
    shelfLifeDays: 365,
    dateKind: 'best_before',
    diet: 'vegan',
    declaresOrigin: false,
  },
  {
    id: 'wine',
    label: 'Wein',
    area: 'bar',
    shelfLifeDays: 1825,
    dateKind: 'best_before',
    diet: 'vegan',
    declaresOrigin: false,
  },
  {
    id: 'beer',
    label: 'Bier',
    area: 'bar',
    shelfLifeDays: 270,
    dateKind: 'best_before',
    diet: 'vegan',
    declaresOrigin: false,
  },
  {
    id: 'spirits',
    label: 'Spirituosen',
    area: 'bar',
    shelfLifeDays: 3650,
    dateKind: 'best_before',
    diet: 'vegan',
    declaresOrigin: false,
  },
  {
    id: 'coffee_tea',
    label: 'Kaffee und Tee',
    area: 'dry',
    shelfLifeDays: 365,
    dateKind: 'best_before',
    diet: 'vegan',
    declaresOrigin: false,
  },
  {
    id: 'prepared',
    label: 'Eigenproduktion',
    area: 'cold',
    shelfLifeDays: 3,
    dateKind: 'use_by',
    diet: 'vegan',
    declaresOrigin: false,
  },
  {
    id: 'nonfood',
    label: 'Non-Food',
    area: 'other',
    shelfLifeDays: 3650,
    dateKind: 'best_before',
    diet: 'vegan',
    declaresOrigin: false,
  },
  {
    id: 'other',
    label: 'Sonstiges',
    area: 'dry',
    shelfLifeDays: 30,
    dateKind: 'best_before',
    diet: 'vegan',
    declaresOrigin: false,
  },
] as const satisfies readonly CategoryInfo[];

export const ArticleCategoryIdSchema = z.enum(ARTICLE_CATEGORIES.map((category) => category.id));
export type ArticleCategoryId = z.infer<typeof ArticleCategoryIdSchema>;
export const ARTICLE_CATEGORY_IDS = ArticleCategoryIdSchema.options;

const BY_ID = new Map<string, CategoryInfo>(
  ARTICLE_CATEGORIES.map((category) => [category.id, category]),
);

export function articleCategory(id: ArticleCategoryId): CategoryInfo {
  const info = BY_ID.get(id);
  if (info === undefined) {
    throw new RangeError(`Unknown article category ${id}`);
  }
  return info;
}

export function articleCategoryLabel(id: ArticleCategoryId): string {
  return articleCategory(id).label;
}
