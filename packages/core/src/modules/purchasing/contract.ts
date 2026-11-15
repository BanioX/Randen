import { z } from 'zod';
import {
  command,
  commandBase,
  query,
  queryBase,
  type ContractFragment,
} from '../../contract/operation';
import { ArticleCategoryIdSchema } from '../../domain/categories';
import { IdSchema } from '../../ids';
import { RappenSchema } from '../../money';
import { SupplierKindSchema, UnitPriceSchema } from '../../model/article';
import {
  BpsSchema,
  DateKindSchema,
  DeciCelsiusSchema,
  LocalDateSchema,
  nameSchema,
  PhotoSchema,
  PositiveQuantitySchema,
  QuantitySchema,
  textSchema,
  UnitSchema,
  WeekdaySchema,
} from '../../model/primitives';
import { OrderStatusSchema, ReceiptAmountSchema } from '../../model/stock';

/** Why an article is on the order proposal: under its minimum, needed by the menu plan, or both. */
export const PurchaseReasonSchema = z.enum(['below_min', 'plan', 'both']);
export type PurchaseReason = z.infer<typeof PurchaseReasonSchema>;

/** A day of a supplier: the next day to order on, or the delivery that order comes with. */
export const OrderDaySchema = z.object({
  on: LocalDateSchema,
  weekday: WeekdaySchema,
  /** 0 = today. */
  inDays: z.int().min(0).max(13),
});
export type OrderDay = z.infer<typeof OrderDaySchema>;

/** Whole packs of an article: «2 Sack à 10 kg». */
export const PacksSchema = z.object({
  count: z.int().min(1),
  /** One pack in base units. */
  size: PositiveQuantitySchema,
  label: z.string().optional(),
});
export type Packs = z.infer<typeof PacksSchema>;

/** One article on the order proposal, with every number that explains the quantity. */
export const SuggestionLineSchema = z.object({
  articleId: IdSchema,
  name: z.string(),
  unit: UnitSchema,
  categoryId: ArticleCategoryIdSchema,
  /** All active lots, and what of it may still be used today. */
  stock: QuantitySchema,
  usable: QuantitySchema,
  minStock: QuantitySchema.optional(),
  targetStock: QuantitySchema.optional(),
  /** In open orders (drafts and sent ones). */
  onOrder: QuantitySchema,
  /** What the open entries of the menu plan need within the horizon (gross, components unfolded). */
  needForPlan: QuantitySchema,
  /** Usable today, but past its use-by date on the day the plan needs it. */
  expiresBeforeUse: QuantitySchema,
  reason: PurchaseReasonSchema,
  /** What to order, rounded up to whole packs when the article has a pack size. */
  quantity: PositiveQuantitySchema,
  packs: PacksSchema.optional(),
  /** The last price; 0 = not known yet. */
  pricePer1000: UnitPriceSchema,
  /** The quantity at the last price; 0 while the price is missing. */
  valueRappen: RappenSchema,
  priceMissing: z.boolean(),
  supplierArticleNumber: z.string().optional(),
});
export type SuggestionLine = z.infer<typeof SuggestionLineSchema>;

/** A supplier as the pages of purchasing show it. */
export const PurchaseSupplierSchema = z.object({
  id: IdSchema,
  name: z.string(),
  kind: SupplierKindSchema,
  customerNumber: z.string().optional(),
  minOrderRappen: RappenSchema.optional(),
  nextOrder: OrderDaySchema.optional(),
  /** The delivery an order placed on the next order day comes with. */
  nextDelivery: OrderDaySchema.optional(),
});
export type PurchaseSupplier = z.infer<typeof PurchaseSupplierSchema>;

/** The proposal for one supplier; without a supplier: the articles that have none. */
export const SuggestionGroupSchema = z.object({
  supplier: PurchaseSupplierSchema.optional(),
  lines: z.array(SuggestionLineSchema),
  totalRappen: RappenSchema,
  /** Missing when the supplier asks for no minimum order value. */
  minOrderReached: z.boolean().optional(),
  /** What is still missing to the minimum order value. */
  missingToMinRappen: RappenSchema.optional(),
  priceMissingCount: z.int(),
});
export type SuggestionGroup = z.infer<typeof SuggestionGroupSchema>;

/** An order as the list shows it. */
export const OrderSummarySchema = z.object({
  id: IdSchema,
  supplierId: IdSchema,
  supplierName: z.string(),
  status: OrderStatusSchema,
  lineCount: z.int(),
  valueRappen: RappenSchema,
  /** A line without a price: the value is lower than the order will cost. */
  priceMissing: z.boolean(),
  orderedOn: LocalDateSchema.optional(),
  expectedOn: LocalDateSchema.optional(),
  createdOn: LocalDateSchema,
});
export type OrderSummary = z.infer<typeof OrderSummarySchema>;

export const OrderStatusFilterSchema = z.enum(['open', 'draft', 'sent', 'received', 'cancelled']);
export type OrderStatusFilter = z.infer<typeof OrderStatusFilterSchema>;

/** One line of an order, ready to show and to edit. */
export const OrderLineViewSchema = z.object({
  articleId: IdSchema,
  name: z.string(),
  unit: UnitSchema,
  quantity: PositiveQuantitySchema,
  /** Set when the quantity is a whole number of the article's packs. */
  packs: PacksSchema.optional(),
  /** Pack size of the article, for a stepper while editing. */
  packSize: PositiveQuantitySchema.optional(),
  packLabel: z.string().optional(),
  pricePer1000: UnitPriceSchema,
  valueRappen: RappenSchema,
  priceMissing: z.boolean(),
  supplierArticleNumber: z.string().optional(),
});
export type OrderLineView = z.infer<typeof OrderLineViewSchema>;

/** A line of an order as a command takes it. Without a price: the article's last price. */
const OrderLineInputSchema = z.object({
  articleId: IdSchema,
  quantity: PositiveQuantitySchema,
  pricePer1000: UnitPriceSchema.optional(),
});

const OrderValueSchema = z.object({
  orderId: IdSchema,
  lineCount: z.int(),
  valueRappen: RappenSchema,
});

/** A dish that uses an article whose price changed, with its food cost before and after. */
export const PriceImpactSchema = z.object({
  recipeId: IdSchema,
  name: z.string(),
  priceRappen: RappenSchema.optional(),
  /** Goods of one portion at the old and at the new price. */
  costBeforeRappen: RappenSchema,
  costAfterRappen: RappenSchema,
  /** Share of the net menu price; missing without a price. */
  foodCostBeforeBps: z.int().optional(),
  foodCostAfterBps: z.int().optional(),
  /** The component the article reaches the dish through, if not directly. */
  via: z.string().optional(),
  /** Another ingredient has no price: the costs are lower bounds. */
  incomplete: z.boolean(),
});
export type PriceImpact = z.infer<typeof PriceImpactSchema>;

export const PriceChangeSchema = z.object({
  articleId: IdSchema,
  name: z.string(),
  unit: UnitSchema,
  oldPricePer1000: UnitPriceSchema,
  newPricePer1000: UnitPriceSchema,
  /** Signed: +1250 = 12.5 % dearer. */
  changeBps: z.int(),
  oldOn: LocalDateSchema,
  newOn: LocalDateSchema,
  supplierName: z.string().optional(),
  dishes: z.array(PriceImpactSchema),
});
export type PriceChange = z.infer<typeof PriceChangeSchema>;

/** Why a line is on the shopping list. */
export const ShoppingReasonSchema = z.enum(['below_min', 'plan', 'missing', 'manual']);
export type ShoppingReason = z.infer<typeof ShoppingReasonSchema>;

/** What was last paid for an article at a market (offers left out), computed from deliveries. */
export const MarketPriceSchema = z.object({
  supplierId: IdSchema,
  supplierName: z.string(),
  pricePer1000: UnitPriceSchema,
  on: LocalDateSchema,
});
export type MarketPrice = z.infer<typeof MarketPriceSchema>;

/** One line of the shopping list: stored (by hand, «Fehlt», ticked) or from the proposal. */
export const ShoppingItemSchema = z.object({
  /** Stable for the page: the stored line, else the article of the proposal. */
  key: z.string(),
  lineId: IdSchema.optional(),
  articleId: IdSchema.optional(),
  name: z.string(),
  unit: UnitSchema.optional(),
  categoryId: ArticleCategoryIdSchema.optional(),
  quantity: PositiveQuantitySchema.optional(),
  packs: PacksSchema.optional(),
  reasons: z.array(ShoppingReasonSchema),
  checked: z.boolean(),
  stock: QuantitySchema.optional(),
  minStock: QuantitySchema.optional(),
  /** The market the line is meant for; missing: any. */
  supplierId: IdSchema.optional(),
  /** Newest first, the chosen market first; at most three. */
  lastPrices: z.array(MarketPriceSchema),
  /** A line from the proposal that is not stored yet: removing it is not possible. */
  removable: z.boolean(),
});
export type ShoppingItem = z.infer<typeof ShoppingItemSchema>;

export const ShoppingGroupSchema = z.object({
  /** Missing: free text without a group of goods. */
  categoryId: ArticleCategoryIdSchema.optional(),
  items: z.array(ShoppingItemSchema),
});
export type ShoppingGroup = z.infer<typeof ShoppingGroupSchema>;

const MarketRefSchema = z.object({
  id: IdSchema,
  name: z.string(),
  customerNumber: z.string().optional(),
});

/** An article as the purchase form needs it: last price at the market, area, date. */
export const PurchaseArticleSchema = z.object({
  articleId: IdSchema,
  name: z.string(),
  unit: UnitSchema,
  categoryId: ArticleCategoryIdSchema,
  /** The last regular price at this market, else the article's last price; 0 = unknown. */
  pricePer1000: UnitPriceSchema,
  areaId: IdSchema.optional(),
  dateKind: DateKindSchema,
  shelfLifeDays: z.int().optional(),
  packSize: PositiveQuantitySchema.optional(),
  packLabel: z.string().optional(),
});
export type PurchaseArticle = z.infer<typeof PurchaseArticleSchema>;

/**
 * One line of a purchase at a market. The quantity is the whole line in base units («2 Kolli à
 * 6 × 2.5 kg» = 30 kg); the amount of the line as printed on the receipt counts, the price per
 * kilogram is derived from it.
 */
export const PurchaseLineSchema = z.object({
  articleId: IdSchema,
  quantity: PositiveQuantitySchema,
  lineTotalRappen: RappenSchema.min(0).max(100_000_000_000),
  packs: z.int().min(1).max(10_000).optional(),
  /** On offer: booked at its price, but not taken as the article's price for costing. */
  promo: z.boolean().optional(),
  expiresOn: LocalDateSchema.optional(),
  lotCode: nameSchema(40).optional(),
  areaId: IdSchema,
});
export type PurchaseLine = z.infer<typeof PurchaseLineSchema>;

/**
 * Operations of the module «Einkauf»: the order proposal per supplier from minimum stock and the
 * menu plan, orders the person sends herself (ADR-0011), the watch on prices, and for a kitchen
 * that fetches its goods itself the shopping list and the purchase with its receipt (ADR-0015).
 * Receiving an order is goods receipt and belongs to «Lager».
 */
export const purchasingContract = {
  'purchasing.suggestions': query({
    name: 'purchasing.suggestions',
    summary: {
      de: 'Der Bestellvorschlag je Lieferant: was unter dem Mindestbestand liegt und was der Menüplan braucht, abzüglich offener Bestellungen.',
      en: 'The order proposal per supplier: what is below its minimum and what the menu plan needs, less open orders.',
    },
    scopes: ['stock:read'],
    input: z.object({ ...queryBase, horizonDays: z.int().min(1).max(60).default(7) }),
    output: z.object({
      horizonDays: z.int(),
      /** The days of the menu plan the proposal looks at. */
      from: LocalDateSchema,
      to: LocalDateSchema,
      groups: z.array(SuggestionGroupSchema),
      lineCount: z.int(),
      totalRappen: RappenSchema,
    }),
  }),
  'orders.list': query({
    name: 'orders.list',
    summary: {
      de: 'Bestellungen, die neuste zuerst, mit Lieferant, Positionen, Wert und Stand.',
      en: 'Orders, newest first, with supplier, lines, value and status.',
    },
    scopes: ['stock:read'],
    input: z.object({ ...queryBase, status: OrderStatusFilterSchema.optional() }),
    output: z.object({
      orders: z.array(OrderSummarySchema),
      counts: z.object({
        draft: z.int(),
        sent: z.int(),
        received: z.int(),
        cancelled: z.int(),
      }),
    }),
  }),
  'orders.get': query({
    name: 'orders.get',
    summary: {
      de: 'Eine Bestellung mit ihren Positionen, dem Lieferanten und dem Text zum Verschicken.',
      en: 'One order with its lines, the supplier and the text to send.',
    },
    scopes: ['stock:read'],
    input: z.object({ ...queryBase, orderId: IdSchema }),
    output: z.object({
      order: z.object({
        id: IdSchema,
        status: OrderStatusSchema,
        orderedOn: LocalDateSchema.optional(),
        expectedOn: LocalDateSchema.optional(),
        note: z.string().optional(),
        deliveryId: IdSchema.optional(),
        createdOn: LocalDateSchema,
        valueRappen: RappenSchema,
        priceMissing: z.boolean(),
      }),
      lines: z.array(OrderLineViewSchema),
      supplier: PurchaseSupplierSchema.extend({
        phone: z.string().optional(),
        email: z.string().optional(),
      }),
      businessName: z.string(),
      /** A subject line for an e-mail: «Bestellung Bistro Beispiel, 17.11.2026». */
      subject: z.string(),
      /** The order as plain German text, ready to send; without prices. */
      text: z.string(),
    }),
  }),
  'orders.create': command({
    name: 'orders.create',
    summary: {
      de: 'Eine Bestellung als Entwurf anlegen.',
      en: 'Create an order as a draft.',
    },
    scopes: ['stock:write'],
    input: z.object({
      ...commandBase,
      supplierId: IdSchema,
      lines: z.array(OrderLineInputSchema).min(1).max(200),
      expectedOn: LocalDateSchema.optional(),
      note: textSchema(500).optional(),
    }),
    output: OrderValueSchema,
  }),
  'orders.createFromSuggestions': command({
    name: 'orders.createFromSuggestions',
    summary: {
      de: 'Aus dem Bestellvorschlag eines Lieferanten einen Entwurf anlegen, mit den Mengen, die du geändert hast.',
      en: 'Create a draft from the proposal of one supplier, with the quantities you changed.',
    },
    scopes: ['stock:write'],
    input: z.object({
      ...commandBase,
      supplierId: IdSchema,
      horizonDays: z.int().min(1).max(60).default(7),
      /** Quantities that replace those of the proposal; 0 leaves the article out. */
      quantities: z
        .array(z.object({ articleId: IdSchema, quantity: QuantitySchema }))
        .max(200)
        .default([]),
    }),
    output: OrderValueSchema,
  }),
  'orders.update': command({
    name: 'orders.update',
    summary: {
      de: 'Positionen, Liefertag und Bemerkung eines Entwurfs ändern.',
      en: 'Change the lines, delivery day and note of a draft.',
    },
    scopes: ['stock:write'],
    input: z.object({
      ...commandBase,
      orderId: IdSchema,
      lines: z.array(OrderLineInputSchema).min(1).max(200).optional(),
      /** null clears the day. */
      expectedOn: LocalDateSchema.nullable().optional(),
      /** null clears the note. */
      note: textSchema(500).nullable().optional(),
    }),
    output: OrderValueSchema,
  }),
  'orders.markSent': command({
    name: 'orders.markSent',
    summary: {
      de: 'Eine Bestellung als bestellt markieren, nachdem du sie verschickt hast.',
      en: 'Mark an order as sent, after you sent it yourself.',
    },
    scopes: ['stock:write'],
    input: z.object({ ...commandBase, orderId: IdSchema }),
    output: z.object({ orderId: IdSchema, status: OrderStatusSchema, orderedOn: LocalDateSchema }),
  }),
  'orders.cancel': command({
    name: 'orders.cancel',
    summary: {
      de: 'Eine Bestellung stornieren; sie bleibt in der Liste.',
      en: 'Cancel an order; it stays in the list.',
    },
    scopes: ['stock:write'],
    input: z.object({ ...commandBase, orderId: IdSchema }),
    output: z.object({ orderId: IdSchema, status: OrderStatusSchema }),
  }),
  'orders.delete': command({
    name: 'orders.delete',
    summary: {
      de: 'Einen Entwurf löschen.',
      en: 'Delete a draft.',
    },
    scopes: ['stock:write'],
    input: z.object({ ...commandBase, orderId: IdSchema }),
    output: z.object({ orderId: IdSchema }),
  }),
  'purchasing.priceWatch': query({
    name: 'purchasing.priceWatch',
    summary: {
      de: 'Artikel, deren letzter Einkaufspreis vom Einkauf davor abweicht, mit den Gerichten und ihrem Wareneinsatz vorher und nachher.',
      en: 'Articles whose last purchase price differs from the one before, with the dishes and their food cost before and after.',
    },
    scopes: ['stock:read'],
    input: z.object({
      ...queryBase,
      /** From which change on an article is listed; 500 = 5 %. */
      thresholdBps: BpsSchema.min(1).default(500),
      limit: z.int().min(1).max(200).default(20),
    }),
    output: z.object({ changes: z.array(PriceChangeSchema), total: z.int() }),
  }),
  'shopping.list': query({
    name: 'shopping.list',
    summary: {
      de: 'Die Einkaufsliste für den Markt: Nachkaufen, Menüplan, «Fehlt» und Zeilen von Hand, nach Warengruppe im Gang durch den Markt.',
      en: 'The shopping list for the market: reorder, menu plan, «missing» and lines by hand, by group of goods in the walk through the market.',
    },
    scopes: ['stock:read'],
    input: z.object({
      ...queryBase,
      /** The market whose walk orders the list; with one market, that one. */
      marketId: IdSchema.optional(),
      horizonDays: z.int().min(1).max(60).default(7),
    }),
    output: z.object({
      markets: z.array(MarketRefSchema),
      marketId: IdSchema.optional(),
      groups: z.array(ShoppingGroupSchema),
      count: z.int(),
      checkedCount: z.int(),
      /** Lines meant for another market than the chosen one. */
      otherMarkets: z.array(z.object({ id: IdSchema, name: z.string(), count: z.int() })),
    }),
  }),
  'shopping.add': command({
    name: 'shopping.add',
    summary: {
      de: 'Eine Zeile von Hand auf die Einkaufsliste setzen: einen Artikel oder einen freien Text.',
      en: 'Put a line on the shopping list by hand: an article or free text.',
    },
    scopes: ['stock:write'],
    input: z
      .object({
        ...commandBase,
        articleId: IdSchema.optional(),
        text: nameSchema(80).optional(),
        quantity: PositiveQuantitySchema.optional(),
        supplierId: IdSchema.optional(),
      })
      .refine((input) => (input.articleId === undefined) !== (input.text === undefined), {
        message: 'Give an article or a text',
      }),
    output: z.object({ lineId: IdSchema, merged: z.boolean() }),
  }),
  'shopping.markMissing': command({
    name: 'shopping.markMissing',
    summary: {
      de: 'Einen Artikel als «Fehlt» auf die Einkaufsliste setzen, zum Beispiel aus dem Lager.',
      en: 'Put an article on the shopping list as missing, for example from the stock pages.',
    },
    scopes: ['stock:write'],
    input: z.object({ ...commandBase, articleId: IdSchema, supplierId: IdSchema.optional() }),
    output: z.object({ lineId: IdSchema, merged: z.boolean() }),
  }),
  'shopping.check': command({
    name: 'shopping.check',
    summary: {
      de: 'Eine Zeile der Einkaufsliste abhaken oder wieder öffnen.',
      en: 'Tick a line of the shopping list, or open it again.',
    },
    scopes: ['stock:write'],
    input: z
      .object({
        ...commandBase,
        lineId: IdSchema.optional(),
        /** A line of the proposal that is not stored yet. */
        articleId: IdSchema.optional(),
        /** The quantity of the proposal, kept with the ticked line. */
        quantity: PositiveQuantitySchema.optional(),
        supplierId: IdSchema.optional(),
        checked: z.boolean(),
      })
      .refine((input) => (input.lineId === undefined) !== (input.articleId === undefined), {
        message: 'Give a line or an article',
      }),
    output: z.object({ lineId: IdSchema.optional(), checked: z.boolean() }),
  }),
  'shopping.remove': command({
    name: 'shopping.remove',
    summary: {
      de: 'Eine Zeile von der Einkaufsliste nehmen.',
      en: 'Take a line off the shopping list.',
    },
    scopes: ['stock:write'],
    input: z.object({ ...commandBase, lineId: IdSchema }),
    output: z.object({ lineId: IdSchema }),
  }),
  'shopping.draft': query({
    name: 'shopping.draft',
    summary: {
      de: 'Der Entwurf eines Einkaufs aus den abgehakten Zeilen, mit dem letzten Preis im Markt.',
      en: 'The draft of a purchase from the ticked lines, with the last price at the market.',
    },
    scopes: ['stock:read'],
    input: z.object({ ...queryBase, marketId: IdSchema.optional() }),
    output: z.object({
      market: MarketRefSchema.optional(),
      markets: z.array(MarketRefSchema),
      lines: z.array(
        z.object({
          lineId: IdSchema.optional(),
          articleId: IdSchema,
          quantity: PositiveQuantitySchema.optional(),
          packs: PacksSchema.optional(),
        }),
      ),
      /** Ticked lines of free text: on the receipt, but not goods in stock. */
      freeText: z.array(z.object({ lineId: IdSchema, text: z.string() })),
      /** Every article that can be bought, for the lines and for adding one. */
      articles: z.array(PurchaseArticleSchema),
    }),
  }),
  'shopping.record': command({
    name: 'shopping.record',
    summary: {
      de: 'Einen Einkauf im Markt erfassen: die Ware als Wareneingang, dazu Beleg, Belegtotal, Depot und Privates.',
      en: 'Record a purchase at a market: the goods as a receipt, with the receipt total, deposit and private amounts.',
    },
    scopes: ['stock:write'],
    input: z.object({
      ...commandBase,
      supplierId: IdSchema.optional(),
      receivedOn: LocalDateSchema,
      documentNumber: nameSchema(40).optional(),
      documentTotalRappen: RappenSchema.min(0).max(100_000_000_000).optional(),
      otherAmounts: z.array(ReceiptAmountSchema).max(30).default([]),
      lines: z.array(PurchaseLineSchema).min(1).max(200),
      /** Optional at pick-up; it becomes a record of the self-control. */
      tempDeciC: DeciCelsiusSchema.optional(),
      photo: PhotoSchema.optional(),
      note: textSchema(500).optional(),
      /** Lines of the shopping list this purchase settles. */
      shoppingLineIds: z.array(IdSchema).max(400).default([]),
    }),
    output: z.object({
      deliveryId: IdSchema,
      lotIds: z.array(IdSchema),
      /** The value of the goods as booked in stock. */
      totalRappen: RappenSchema,
      /** The amounts of the lines as typed, and of everything else on the receipt. */
      linesRappen: RappenSchema,
      otherRappen: RappenSchema,
      /** Receipt total minus lines and other amounts; 0 when the receipt adds up. */
      unassignedRappen: RappenSchema.optional(),
    }),
  }),
} as const satisfies ContractFragment;
