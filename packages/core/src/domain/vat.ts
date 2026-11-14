/**
 * Swiss VAT rates in basis points (MWSTG Art. 25; docs/fakten.md section 3), valid since
 * 1 January 2024. Food and drink consumed on the premises carry the standard rate, food and
 * non-alcoholic drinks taken away or delivered the reduced rate, alcohol always the standard
 * rate. Rates are data, not constants: every recipe and every sale stores the rate it was made
 * with, and these are only the proposals for new ones. A vote on 29 November 2026 decides
 * whether the standard rate rises to 8.5 % in 2028 at the earliest.
 */
export const VAT_RATES_CH = [
  { id: 'standard', bps: 810, validFrom: '2024-01-01', label: 'Vor Ort konsumiert (8.1 %)' },
  {
    id: 'reduced',
    bps: 260,
    validFrom: '2024-01-01',
    label: 'Zum Mitnehmen oder geliefert (2.6 %)',
  },
  { id: 'accommodation', bps: 380, validFrom: '2024-01-01', label: 'Beherbergung (3.8 %)' },
] as const;

export const DEFAULT_VAT_BPS = 810;
/** A common goal for the cost of goods of a kitchen; every business sets its own. */
export const DEFAULT_TARGET_FOOD_COST_BPS = 3000;
