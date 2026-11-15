import { z } from 'zod';
import {
  command,
  commandBase,
  query,
  queryBase,
  type ContractFragment,
} from '../../contract/operation';
import { LocalDateSchema } from '../../model/primitives';

/**
 * Names a business has before anyone changed them (the app's first name, «Mein Betrieb»): a
 * business with such a name becomes the «Bistro Beispiel» when the demo is loaded.
 */
export const DEFAULT_BUSINESS_NAMES: readonly string[] = ['Mein Betrieb'];
export const DEMO_BUSINESS_NAME = 'Bistro Beispiel';

/** How much the business holds, by kind; the demo page lists it once the demo is loaded. */
export const DemoCountsSchema = z.object({
  areas: z.int().min(0),
  spots: z.int().min(0),
  suppliers: z.int().min(0),
  articles: z.int().min(0),
  /** Lots with something left in them. */
  lots: z.int().min(0),
  movements: z.int().min(0),
  /** Wareneingänge: from suppliers and from the market (the receipts, «Belege», among them). */
  deliveries: z.int().min(0),
  /** The deliveries of the market: receipts («Belege»), not delivery notes. */
  marketReceipts: z.int().min(0),
  productions: z.int().min(0),
  dishes: z.int().min(0),
  components: z.int().min(0),
  /** Lines of sales: one per dish and day. */
  sales: z.int().min(0),
  menuCards: z.int().min(0),
  planEntries: z.int().min(0),
  /** Menu lines of the lunch (ADR-0015). */
  menuLines: z.int().min(0),
  /** Meal counts: one row per line and day. */
  mealCounts: z.int().min(0),
  /** Plates and the counter, weighed. */
  wasteWeighings: z.int().min(0),
  /** Open lines of the shopping list for the next market visit. */
  shoppingLines: z.int().min(0),
  temperatureLogs: z.int().min(0),
  hygieneChecks: z.int().min(0),
  staff: z.int().min(0),
  orders: z.int().min(0),
  counts: z.int().min(0),
  budgets: z.int().min(0),
});
export type DemoCounts = z.infer<typeof DemoCountsSchema>;

/** What the demo brings, the same on every day: shown before it is loaded. */
export const DemoContentsSchema = z.object({
  areas: z.int(),
  spots: z.int(),
  suppliers: z.int(),
  articles: z.int(),
  dishes: z.int(),
  components: z.int(),
  menuCards: z.int(),
  staff: z.int(),
  weeks: z.int(),
  /** Menu lines of the lunch: Mittagsmenü and Vegi. */
  menuLines: z.int(),
  /** Purchases at the market, each a receipt with its deposits and private items. */
  marketReceipts: z.int(),
  /** Days with meal counts: the last two weeks and today. */
  mealDays: z.int(),
});
export type DemoContents = z.infer<typeof DemoContentsSchema>;

export const DemoStatusSchema = z.object({
  businessName: z.string(),
  /** No articles, no recipes and no lots yet: the demo may be loaded. */
  empty: z.boolean(),
  /** The business holds the demo data and can be cleared. */
  demo: z.boolean(),
  counts: DemoCountsSchema,
  contents: DemoContentsSchema,
  /** The first and the last day with a stock movement. */
  firstDay: LocalDateSchema.optional(),
  lastDay: LocalDateSchema.optional(),
});
export type DemoStatus = z.infer<typeof DemoStatusSchema>;

/**
 * The demo business («Demo-Betrieb»): one tap fills an empty business with a believable
 * kitchen (eight weeks of history, stock with dates, recipes with pictures, cards, a plan), so
 * a first look shows what Randen does. Names and prices are invented.
 */
export const demoContract = {
  'demo.status': query({
    name: 'demo.status',
    summary: {
      de: 'Zeigen, ob der Betrieb leer ist oder die Demo-Daten hält, mit den Mengen.',
      en: 'Tell whether the business is empty or holds the demo data, with counts.',
    },
    scopes: ['business:read'],
    input: z.object({ ...queryBase }),
    output: DemoStatusSchema,
  }),
  'demo.load': command({
    name: 'demo.load',
    summary: {
      de: 'Den Demo-Betrieb in einen leeren Betrieb laden: acht Wochen Küche mit erfundenen Namen und Preisen.',
      en: 'Load the demo business into an empty business: eight weeks of kitchen with invented names and prices.',
    },
    scopes: ['business:write'],
    input: z.object({ ...commandBase, confirm: z.literal(true) }),
    output: z.object({
      businessName: z.string(),
      renamed: z.boolean(),
      counts: DemoCountsSchema,
      firstDay: LocalDateSchema,
      lastDay: LocalDateSchema,
    }),
  }),
  'demo.clear': command({
    name: 'demo.clear',
    summary: {
      de: 'Die Demo-Daten mit dem ganzen Betrieb entfernen; beim nächsten Start beginnt ein leerer Betrieb.',
      en: 'Remove the demo data with the whole business; the next start begins with an empty business.',
    },
    scopes: ['business:write'],
    input: z.object({ ...commandBase, confirm: z.literal(true) }),
    output: z.object({ cleared: z.literal(true) }),
  }),
} as const satisfies ContractFragment;
