import type { Id } from '../ids';

/**
 * Menu engineering after Kasavana and Smith: every dish is placed by how often it sells and by
 * what one portion contributes. The German names are the ones used in Swiss kitchens.
 */
export type MenuClass = 'star' | 'plowhorse' | 'puzzle' | 'dog';

export function menuClassLabel(menuClass: MenuClass): string {
  return { star: 'Gewinner', plowhorse: 'Renner', puzzle: 'Schläfer', dog: 'Verlierer' }[menuClass];
}

/** What to do with a dish of each class, in one sentence. */
export function menuClassAdvice(menuClass: MenuClass): string {
  return {
    star: 'Beliebt und rentabel: gut sichtbar halten, Qualität und Preis nicht anfassen.',
    plowhorse: 'Beliebt, aber wenig Marge: Rezeptur und Portion prüfen, Preis vorsichtig anheben.',
    puzzle: 'Rentabel, aber selten bestellt: besser platzieren, empfehlen, anders benennen.',
    dog: 'Weder beliebt noch rentabel: ersetzen oder von der Karte nehmen.',
  }[menuClass];
}

export interface MenuItemInput {
  id: Id;
  /** Portions sold in the period. */
  sold: number;
  /** Contribution margin of one portion, in the smallest currency unit. */
  marginRappen: number;
}

export interface MenuItemResult extends MenuItemInput {
  /** Share of all portions sold, in basis points. */
  shareBps: number;
  popular: boolean;
  profitable: boolean;
  menuClass: MenuClass;
  /** Margin of all portions of this dish. */
  totalMarginRappen: number;
}

export interface MenuAnalysis {
  items: MenuItemResult[];
  totalSold: number;
  /** A dish is popular from 70 % of an even share: with ten dishes from 7 % of all portions. */
  popularityThresholdBps: number;
  /** A dish is profitable from the average margin per portion sold. */
  averageMarginRappen: number;
}

const POPULARITY_FACTOR_BPS = 7000;

/**
 * Classifies the dishes of a menu. Popularity: at least 70 % of the share each dish would have
 * if all sold equally. Profitability: at least the average contribution margin, weighted by
 * portions sold. With nothing sold there is nothing to classify.
 */
export function analyseMenu(inputs: readonly MenuItemInput[]): MenuAnalysis {
  const totalSold = inputs.reduce((sum, item) => sum + item.sold, 0);
  if (inputs.length === 0 || totalSold <= 0) {
    return { items: [], totalSold: 0, popularityThresholdBps: 0, averageMarginRappen: 0 };
  }
  const popularityThresholdBps = Math.round(POPULARITY_FACTOR_BPS / inputs.length);
  const totalMargin = inputs.reduce((sum, item) => sum + item.sold * item.marginRappen, 0);
  const averageMarginRappen = Math.round(totalMargin / totalSold);
  const items = inputs.map((item): MenuItemResult => {
    const shareBps = Math.round((item.sold * 10_000) / totalSold);
    const popular = item.sold * 10_000 * inputs.length >= POPULARITY_FACTOR_BPS * totalSold;
    const profitable = item.marginRappen * totalSold >= totalMargin;
    return {
      ...item,
      shareBps,
      popular,
      profitable,
      menuClass: popular ? (profitable ? 'star' : 'plowhorse') : profitable ? 'puzzle' : 'dog',
      totalMarginRappen: Math.round(item.sold * item.marginRappen),
    };
  });
  return { items, totalSold, popularityThresholdBps, averageMarginRappen };
}
