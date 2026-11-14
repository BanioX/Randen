/**
 * Swiss VAT rates in basis points, valid since 1 January 2024. A dish eaten in the restaurant
 * carries the standard rate, food taken away or delivered the reduced rate. A business in
 * another country sets its own default; the rate is stored on every recipe and sale.
 */
export const VAT_RATES_CH = [
  { id: 'standard', bps: 810, label: 'Im Haus konsumiert (8.1 %)' },
  { id: 'reduced', bps: 260, label: 'Zum Mitnehmen oder geliefert (2.6 %)' },
  { id: 'lodging', bps: 380, label: 'Beherbergung (3.8 %)' },
] as const;

export const DEFAULT_VAT_BPS = 810;
/** A common goal for the cost of goods of a kitchen; every business sets its own. */
export const DEFAULT_TARGET_FOOD_COST_BPS = 3000;
