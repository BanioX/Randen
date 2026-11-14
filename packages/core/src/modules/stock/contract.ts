import { z } from 'zod';
import {
  command,
  commandBase,
  query,
  queryBase,
  type ContractFragment,
} from '../../contract/operation';
import { AreaKindSchema, ArticleCategoryIdSchema } from '../../domain/categories';
import { IdSchema } from '../../ids';
import { RappenSchema } from '../../money';
import { ArticleKindSchema, UnitPriceSchema } from '../../model/article';
import {
  BpsSchema,
  DateKindSchema,
  DeciCelsiusSchema,
  IsoDateTimeSchema,
  LocalDateSchema,
  nameSchema,
  PositiveQuantitySchema,
  QuantityDeltaSchema,
  QuantitySchema,
  textSchema,
  UnitSchema,
} from '../../model/primitives';
import {
  ConsumptionPurposeSchema,
  LotOriginSchema,
  MovementTypeSchema,
  OrderStatusSchema,
  WasteReasonSchema,
} from '../../model/stock';

/** Where a lot stands against its date; the words of `expiryInfo` (domain/expiry.ts). */
export const ExpiryStatusSchema = z.enum([
  'none',
  'ok',
  'soon',
  'today',
  'past_best_before',
  'expired',
]);

/** A number of lots and what they are worth. */
export const StockTallySchema = z.object({ count: z.int(), valueRappen: RappenSchema });
export type StockTally = z.infer<typeof StockTallySchema>;

const AreaTagSchema = z.object({ id: IdSchema, name: z.string(), kind: AreaKindSchema });

/** One article on the stock list: what is there, what it is worth, what is due next. */
export const StockOverviewRowSchema = z.object({
  articleId: IdSchema,
  name: z.string(),
  unit: UnitSchema,
  categoryId: ArticleCategoryIdSchema,
  /** Sum and value of the lots the row shows (all lots, or those of the chosen area). */
  quantity: QuantitySchema,
  valueRappen: RappenSchema,
  lotCount: z.int(),
  areas: z.array(AreaTagSchema),
  /** The earliest date among the lots, with where it stands today. */
  nextExpiresOn: LocalDateSchema.optional(),
  dateKind: DateKindSchema,
  expiryStatus: ExpiryStatusSchema,
  daysLeft: z.int().optional(),
  minStock: QuantitySchema.optional(),
  /** The whole stock of the article is under its minimum, whatever the list is narrowed to. */
  belowMin: z.boolean(),
  /** A lot without a price: the value is lower than what is really there. */
  priceMissing: z.boolean(),
});
export type StockOverviewRow = z.infer<typeof StockOverviewRowSchema>;

/** The five groups of the list «Ablauf», most urgent first. */
export const ExpiryGroupSchema = z.enum(['expired', 'today', 'soon', 'week', 'past_best_before']);
export type ExpiryGroup = z.infer<typeof ExpiryGroupSchema>;
export const EXPIRY_GROUPS = ExpiryGroupSchema.options;

export const ExpiringLotSchema = z.object({
  lotId: IdSchema,
  articleId: IdSchema,
  articleName: z.string(),
  unit: UnitSchema,
  quantity: QuantitySchema,
  valueRappen: RappenSchema,
  area: AreaTagSchema,
  /** The usual spot of the article, if it lies in the area of the lot. */
  spotName: z.string().optional(),
  expiresOn: LocalDateSchema,
  dateKind: DateKindSchema,
  status: ExpiryStatusSchema,
  daysLeft: z.int(),
  group: ExpiryGroupSchema,
  /** Past its Verbrauchsdatum: never cooked, it has to be written off. */
  mustWriteOff: z.boolean(),
  lotCode: z.string().optional(),
});
export type ExpiringLot = z.infer<typeof ExpiringLotSchema>;

export const ArticleLotSchema = z.object({
  lotId: IdSchema,
  area: AreaTagSchema,
  expiresOn: LocalDateSchema.optional(),
  dateKind: DateKindSchema,
  status: ExpiryStatusSchema,
  daysLeft: z.int().optional(),
  mustNotUse: z.boolean(),
  quantity: QuantitySchema,
  initialQuantity: QuantitySchema,
  pricePer1000: UnitPriceSchema,
  valueRappen: RappenSchema,
  supplierName: z.string().optional(),
  lotCode: z.string().optional(),
  receivedOn: LocalDateSchema,
  origin: LotOriginSchema,
});
export type ArticleLot = z.infer<typeof ArticleLotSchema>;

/** One line of the journal, ready to show: names instead of ids. */
export const MovementViewSchema = z.object({
  id: IdSchema,
  type: MovementTypeSchema,
  articleId: IdSchema,
  articleName: z.string(),
  unit: UnitSchema,
  lotId: IdSchema,
  /** How the lot came into the house: tells an opening stock from a count. */
  lotOrigin: LotOriginSchema.optional(),
  quantity: QuantityDeltaSchema,
  valueRappen: RappenSchema,
  on: LocalDateSchema,
  at: IsoDateTimeSchema,
  /** Who booked it, so that somebody can ask (never a ranking of people). */
  who: z.string(),
  reason: WasteReasonSchema.optional(),
  purpose: ConsumptionPurposeSchema.optional(),
  countId: IdSchema.optional(),
  note: z.string().optional(),
});
export type MovementView = z.infer<typeof MovementViewSchema>;

export const MovementSumSchema = z.object({
  type: MovementTypeSchema,
  count: z.int(),
  valueRappen: RappenSchema,
});

/**
 * One line of a goods receipt. The price is either per unit (`pricePer1000`) or the amount of
 * the line as it stands on the delivery note (`lineTotalRappen`); without either the article's
 * last price is taken.
 */
export const ReceiveLineSchema = z
  .object({
    articleId: IdSchema,
    quantity: PositiveQuantitySchema,
    pricePer1000: UnitPriceSchema.optional(),
    lineTotalRappen: RappenSchema.min(0).max(100_000_000_000).optional(),
    expiresOn: LocalDateSchema.optional(),
    lotCode: nameSchema(40).optional(),
    areaId: IdSchema,
  })
  .refine((line) => line.pricePer1000 === undefined || line.lineTotalRappen === undefined, {
    message: 'Give a unit price or a line total, not both',
  });
export type ReceiveLine = z.infer<typeof ReceiveLineSchema>;

/** What goods receipt proposes for an article: last price, usual area, usual shelf life. */
export const ReceiveProposalSchema = z.object({
  articleId: IdSchema,
  name: z.string(),
  unit: UnitSchema,
  /** The last price; 0 = not known yet. */
  pricePer1000: UnitPriceSchema,
  /** The article's own area, else the first area of the kind its group of goods is kept in. */
  areaId: IdSchema.optional(),
  /** Days from receipt to the proposed date: the article's own, else the Richtwert of its group. */
  shelfLifeDays: z.int().optional(),
  dateKind: DateKindSchema,
  supplierId: IdSchema.optional(),
});
export type ReceiveProposal = z.infer<typeof ReceiveProposalSchema>;

const CountSheetLotSchema = z.object({
  lotId: IdSchema,
  articleId: IdSchema,
  articleName: z.string(),
  unit: UnitSchema,
  expected: QuantitySchema,
  pricePer1000: UnitPriceSchema,
  expiresOn: LocalDateSchema.optional(),
  dateKind: DateKindSchema,
  lotCode: z.string().optional(),
  spotName: z.string().optional(),
});
export type CountSheetLot = z.infer<typeof CountSheetLotSchema>;

/**
 * Operations of the module «Lager»: what is in the house, what expires, goods receipt,
 * write-offs, withdrawals, moving, the stock take and the journal. Every change of a quantity
 * goes through the stock ledger (ADR-0007).
 */
export const stockContract = {
  'stock.overview': query({
    name: 'stock.overview',
    summary: {
      de: 'Der Bestand je Artikel mit Wert, nächstem Datum und Mindestbestand, dazu die Summen des Lagers.',
      en: 'Stock per article with value, next date and minimum, plus the totals of the store.',
    },
    scopes: ['stock:read'],
    input: z.object({
      ...queryBase,
      search: z.string().trim().max(80).optional(),
      areaId: IdSchema.optional(),
      categoryId: ArticleCategoryIdSchema.optional(),
      filter: z.enum(['all', 'expiring', 'below_min']).default('all'),
    }),
    output: z.object({
      rows: z.array(StockOverviewRowSchema),
      /** The whole store, whatever the list is narrowed to. */
      totals: z.object({
        valueRappen: RappenSchema,
        /** Articles with stock, and the areas they lie in. */
        articleCount: z.int(),
        areaCount: z.int(),
        lotCount: z.int(),
        expired: StockTallySchema,
        today: StockTallySchema,
        soon: StockTallySchema,
        pastBestBefore: StockTallySchema,
        belowMinCount: z.int(),
        lotsWithoutPrice: z.int(),
      }),
    }),
  }),
  'stock.expiring': query({
    name: 'stock.expiring',
    summary: {
      de: 'Chargen nach Dringlichkeit: nicht mehr verwenden, heute, in drei Tagen, bald, MHD überschritten.',
      en: 'Lots by urgency: must not be used, due today, within three days, soon, past best-before.',
    },
    scopes: ['stock:read'],
    input: z.object({ ...queryBase, withinDays: z.int().min(0).max(365).default(7) }),
    output: z.object({
      lots: z.array(ExpiringLotSchema),
      groups: z.object({
        expired: StockTallySchema,
        today: StockTallySchema,
        soon: StockTallySchema,
        week: StockTallySchema,
        past_best_before: StockTallySchema,
      }),
    }),
  }),
  'stock.article': query({
    name: 'stock.article',
    summary: {
      de: 'Ein Artikel im Lager: Bestand, Chargen in der Reihenfolge des Verbrauchs und die letzten Bewegungen.',
      en: 'One article in stock: quantity, lots in the order they leave, and the last movements.',
    },
    scopes: ['stock:read'],
    input: z
      .object({
        ...queryBase,
        articleId: IdSchema.optional(),
        /** Instead of the article: the article this lot belongs to (a link to one lot). */
        lotId: IdSchema.optional(),
      })
      .refine((input) => input.articleId !== undefined || input.lotId !== undefined, {
        message: 'Give an article or a lot',
      }),
    output: z.object({
      article: z.object({
        id: IdSchema,
        name: z.string(),
        kind: ArticleKindSchema,
        categoryId: ArticleCategoryIdSchema,
        unit: UnitSchema,
        pricePer1000: UnitPriceSchema,
        yieldBps: BpsSchema,
        minStock: QuantitySchema.optional(),
        targetStock: QuantitySchema.optional(),
        dateKind: DateKindSchema,
        areaId: IdSchema.optional(),
        supplierName: z.string().optional(),
        active: z.boolean(),
      }),
      quantity: QuantitySchema,
      valueRappen: RappenSchema,
      /** What may be used today: everything except lots past their Verbrauchsdatum. */
      usableQuantity: QuantitySchema,
      belowMin: z.boolean(),
      /** Active lots, first expired first. */
      lots: z.array(ArticleLotSchema),
      /** The last 30 movements, newest first. */
      movements: z.array(MovementViewSchema),
    }),
  }),
  'stock.receiveDraft': query({
    name: 'stock.receiveDraft',
    summary: {
      de: 'Vorschläge für den Wareneingang: je Artikel Preis, Lagerbereich und Haltbarkeit, und die Zeilen einer Bestellung.',
      en: 'Proposals for goods receipt: price, area and shelf life per article, and the lines of an order.',
    },
    scopes: ['stock:read'],
    input: z.object({ ...queryBase, orderId: IdSchema.optional() }),
    output: z.object({
      order: z
        .object({
          id: IdSchema,
          status: OrderStatusSchema,
          supplierId: IdSchema,
          supplierName: z.string(),
          orderedOn: LocalDateSchema.optional(),
          expectedOn: LocalDateSchema.optional(),
        })
        .optional(),
      /** The lines of the order, to prefill the receipt; empty without an order. */
      lines: z.array(
        z.object({
          articleId: IdSchema,
          quantity: PositiveQuantitySchema,
          pricePer1000: UnitPriceSchema,
        }),
      ),
      proposals: z.array(ReceiveProposalSchema),
    }),
  }),
  'stock.receive': command({
    name: 'stock.receive',
    summary: {
      de: 'Wareneingang buchen: ein Lieferschein, je Zeile eine Charge, mit der Kontrolle an der Tür.',
      en: 'Book a goods receipt: one delivery note, one lot per line, with the check at the door.',
    },
    scopes: ['stock:write'],
    input: z.object({
      ...commandBase,
      supplierId: IdSchema.optional(),
      orderId: IdSchema.optional(),
      receivedOn: LocalDateSchema,
      documentNumber: nameSchema(40).optional(),
      /** Temperature measured at the door; it becomes a record of the self-control. */
      tempDeciC: DeciCelsiusSchema.optional(),
      checkOk: z.boolean(),
      note: textSchema(500).optional(),
      lines: z.array(ReceiveLineSchema).min(1).max(200),
    }),
    output: z.object({
      deliveryId: IdSchema,
      lotIds: z.array(IdSchema),
      totalRappen: RappenSchema,
    }),
  }),
  'stock.openingStock': command({
    name: 'stock.openingStock',
    summary: {
      de: 'Anfangsbestand erfassen: was beim Start im Haus liegt, ohne dass es als Einkauf zählt.',
      en: 'Enter the opening stock: what is in the house at the start, not counted as a purchase.',
    },
    scopes: ['stock:write'],
    input: z.object({
      ...commandBase,
      on: LocalDateSchema,
      lines: z.array(ReceiveLineSchema).min(1).max(200),
    }),
    output: z.object({ lotIds: z.array(IdSchema), totalRappen: RappenSchema }),
  }),
  'stock.writeOff': command({
    name: 'stock.writeOff',
    summary: {
      de: 'Eine Charge ganz oder teilweise abschreiben, mit Grund.',
      en: 'Write off a lot or a part of it, with a reason.',
    },
    scopes: ['stock:write'],
    input: z.object({
      ...commandBase,
      lotId: IdSchema,
      quantity: PositiveQuantitySchema,
      reason: WasteReasonSchema,
      note: textSchema(300).optional(),
    }),
    output: z.object({
      articleId: IdSchema,
      /** What was written off, as a positive amount. */
      valueRappen: RappenSchema,
    }),
  }),
  'stock.writeOffExpired': command({
    name: 'stock.writeOffExpired',
    summary: {
      de: 'Alle Chargen abschreiben, deren Verbrauchsdatum vorbei ist.',
      en: 'Write off every lot that is past its use-by date.',
    },
    scopes: ['stock:write'],
    input: z.object({ ...commandBase }),
    output: z.object({
      count: z.int(),
      valueRappen: RappenSchema,
      lotIds: z.array(IdSchema),
    }),
  }),
  'stock.withdraw': command({
    name: 'stock.withdraw',
    summary: {
      de: 'Ware von Hand entnehmen, für die Küche oder für das Personal; das früheste Datum geht zuerst.',
      en: 'Withdraw goods by hand, for the kitchen or the staff; the earliest date leaves first.',
    },
    scopes: ['stock:write'],
    input: z.object({
      ...commandBase,
      articleId: IdSchema,
      quantity: PositiveQuantitySchema,
      purpose: z.enum(['kitchen', 'staff']),
      /** Take from this lot instead of first expired, first out. */
      lotId: IdSchema.optional(),
      note: textSchema(300).optional(),
    }),
    output: z.object({
      consumed: QuantitySchema,
      valueRappen: RappenSchema,
      picks: z.array(
        z.object({ lotId: IdSchema, quantity: QuantitySchema, valueRappen: RappenSchema }),
      ),
    }),
  }),
  'stock.move': command({
    name: 'stock.move',
    summary: {
      de: 'Eine Charge oder einen Teil davon in einen anderen Lagerbereich verschieben.',
      en: 'Move a lot or a part of it to another storage area.',
    },
    scopes: ['stock:write'],
    input: z.object({
      ...commandBase,
      lotId: IdSchema,
      areaId: IdSchema,
      quantity: PositiveQuantitySchema.optional(),
    }),
    /** The lot that now lies in the area: the same one, or a new one for a part. */
    output: z.object({ lotId: IdSchema }),
  }),
  'stock.countSheet': query({
    name: 'stock.countSheet',
    summary: {
      de: 'Das Zählblatt der Inventur: die Chargen je Lagerbereich mit der erwarteten Menge.',
      en: 'The count sheet of the stock take: the lots per area with the expected quantity.',
    },
    scopes: ['stock:read'],
    input: z.object({ ...queryBase, areaId: IdSchema.optional() }),
    output: z.object({
      areas: z.array(z.object({ area: AreaTagSchema, lots: z.array(CountSheetLotSchema) })),
      lotCount: z.int(),
    }),
  }),
  'stock.count': command({
    name: 'stock.count',
    summary: {
      de: 'Inventur abschliessen: gezählte Mengen werden zu Korrekturen, Gefundenes zu neuen Chargen.',
      en: 'Finish a stock take: counted quantities become adjustments, found goods become new lots.',
    },
    scopes: ['stock:write'],
    input: z
      .object({
        ...commandBase,
        countedOn: LocalDateSchema,
        areaId: IdSchema.optional(),
        note: textSchema(500).optional(),
        /** At most 1800, so that the record with what was found stays within its 2000 lines. */
        lines: z.array(z.object({ lotId: IdSchema, counted: QuantitySchema })).max(1800),
        /** Goods that lie there but stand on no lot («Nicht aufgeführt»). */
        found: z
          .array(
            z.object({
              articleId: IdSchema,
              areaId: IdSchema,
              quantity: PositiveQuantitySchema,
              expiresOn: LocalDateSchema.optional(),
            }),
          )
          .max(200)
          .default([]),
      })
      .refine((input) => input.lines.length + input.found.length > 0, {
        message: 'A count needs at least one line',
      }),
    output: z.object({
      countId: IdSchema,
      /** Lines in the record, and how many of them changed the stock. */
      lineCount: z.int(),
      adjusted: z.int(),
      valueDeltaRappen: RappenSchema,
      foundLotIds: z.array(IdSchema),
    }),
  }),
  'stock.journal': query({
    name: 'stock.journal',
    summary: {
      de: 'Das Journal der Lagerbewegungen, die neuste zuerst, mit den Summen je Art.',
      en: 'The journal of stock movements, newest first, with the sums per type.',
    },
    scopes: ['stock:read'],
    input: z.object({
      ...queryBase,
      from: LocalDateSchema.optional(),
      to: LocalDateSchema.optional(),
      type: MovementTypeSchema.optional(),
      articleId: IdSchema.optional(),
      limit: z.int().min(1).max(1000).default(200),
    }),
    output: z.object({
      movements: z.array(MovementViewSchema),
      /** How many movements match; more than `movements` when the limit cut the list. */
      total: z.int(),
      /** Per type for the period and the article, whatever `type` narrows the list to. */
      sums: z.array(MovementSumSchema),
    }),
  }),
} as const satisfies ContractFragment;
