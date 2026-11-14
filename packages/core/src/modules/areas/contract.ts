import { z } from 'zod';
import {
  command,
  commandBase,
  query,
  queryBase,
  type ContractFragment,
} from '../../contract/operation';
import { AreaKindSchema, ArticleCategoryIdSchema, type AreaKind } from '../../domain/categories';
import { IdSchema } from '../../ids';
import { RappenSchema } from '../../money';
import {
  DateKindSchema,
  DeciCelsiusSchema,
  LocalDateSchema,
  PhotoSchema,
  QuantitySchema,
  UnitSchema,
  type DeciCelsius,
} from '../../model/primitives';
import { StorageAreaSchema, StorageSpotSchema } from '../../model/storage-area';

/**
 * The temperature range Randen proposes for a kind of area, in tenths of a degree. These are
 * guideline values («Richtwert», ADR-0012), not law: leicht verderbliche Lebensmittel at 5 °C at
 * most (GVG Anhang 6.2), deep frozen goods at -18 °C or colder (HyV Art. 25 Abs. 3), see
 * docs/fakten.md section 4.3. The business changes them to fit its own self-control.
 */
export interface AreaRange {
  minDeciC?: DeciCelsius;
  maxDeciC?: DeciCelsius;
}

const RANGE_PROPOSALS: Readonly<Record<AreaKind, AreaRange>> = {
  cold: { minDeciC: 0, maxDeciC: 50 },
  frozen: { maxDeciC: -180 },
  dry: {},
  bar: {},
  station: {},
  other: {},
};

/** The guideline range of a kind of area; empty where Randen proposes none. */
export function areaRangeProposal(kind: AreaKind): AreaRange {
  return { ...RANGE_PROPOSALS[kind] };
}

/** True when the area has a range and it is the guideline of its kind («Richtwert»). */
export function isAreaRangeProposal(
  kind: AreaKind,
  range: { minDeciC?: number | undefined; maxDeciC?: number | undefined },
): boolean {
  const proposal = RANGE_PROPOSALS[kind];
  const hasRange = range.minDeciC !== undefined || range.maxDeciC !== undefined;
  return hasRange && range.minDeciC === proposal.minDeciC && range.maxDeciC === proposal.maxDeciC;
}

/** What an area is, without what lies in it: the same in every view. */
const AreaFacts = {
  id: IdSchema,
  name: z.string(),
  kind: AreaKindSchema,
  minDeciC: DeciCelsiusSchema.optional(),
  maxDeciC: DeciCelsiusSchema.optional(),
  /** The range is the guideline of its kind: the page calls it «Richtwert». */
  rangeIsProposal: z.boolean(),
  photo: PhotoSchema.optional(),
  sortOrder: z.int(),
};

/** One card of the list of areas: what the area is, and how much lies there. */
export const AreaSummarySchema = z.object({
  ...AreaFacts,
  spotCount: z.int(),
  spotsWithPhoto: z.int(),
  /** Live, active articles whose usual area this is. */
  articleCount: z.int(),
  /** Active lots lying in the area right now, and what they are worth. */
  lotCount: z.int(),
  stockValueRappen: RappenSchema,
  /** A lot without a price: the value is lower than what really lies there. */
  priceMissing: z.boolean(),
});
export type AreaSummary = z.infer<typeof AreaSummarySchema>;

/** An article as a spot or an area shows it: its name and what of it lies here. */
export const PlacedArticleSchema = z.object({
  id: IdSchema,
  name: z.string(),
  unit: UnitSchema,
  categoryId: ArticleCategoryIdSchema,
  /** The quantity of its active lots in this area. */
  stockHere: QuantitySchema,
  /** Its whole stock, in every area. */
  stock: QuantitySchema,
});
export type PlacedArticle = z.infer<typeof PlacedArticleSchema>;

/** A spot with its photo and the articles that live there. */
export const SpotViewSchema = z.object({
  id: IdSchema,
  areaId: IdSchema,
  name: z.string(),
  note: z.string().optional(),
  photo: PhotoSchema.optional(),
  /** Position among the spots of the area, 0 first: the order of the tour. */
  sortOrder: z.int(),
  articles: z.array(PlacedArticleSchema),
});
export type SpotView = z.infer<typeof SpotViewSchema>;

const LotStatusSchema = z.enum(['none', 'ok', 'soon', 'today', 'past_best_before', 'expired']);

/** One active lot lying in an area: what is really there, whatever the articles say. */
export const AreaLotSchema = z.object({
  lotId: IdSchema,
  articleId: IdSchema,
  articleName: z.string(),
  unit: UnitSchema,
  quantity: QuantitySchema,
  valueRappen: RappenSchema,
  expiresOn: LocalDateSchema.optional(),
  dateKind: DateKindSchema,
  status: LotStatusSchema,
  daysLeft: z.int().optional(),
  /** Past its Verbrauchsdatum: never cooked, it has to be written off. */
  mustNotUse: z.boolean(),
  /** The usual spot of the article, when the article lives in this area. */
  spotName: z.string().optional(),
  /** The article usually lives in another area (or in none): the lot lies here for now. */
  awayFromHome: z.boolean(),
  /** For a lot away from home: the area the article belongs to, if it has one. */
  homeAreaName: z.string().optional(),
});
export type AreaLot = z.infer<typeof AreaLotSchema>;

const AreaTagSchema = z.object({ id: IdSchema, name: z.string(), kind: AreaKindSchema });

/** Where stock of an article lies right now: one area and the quantity there. */
export const StockPlaceSchema = z.object({
  areaId: IdSchema,
  areaName: z.string(),
  areaKind: AreaKindSchema,
  quantity: QuantitySchema,
});
export type StockPlace = z.infer<typeof StockPlaceSchema>;

/** How a hit matched the search: the name starts with it, a word starts with it, or it is in it. */
export const WhereMatchSchema = z.enum(['start', 'word', 'contains']);
export type WhereMatch = z.infer<typeof WhereMatchSchema>;

/** An article found by «Wo ist was?»: where it belongs and where it really lies. */
export const WhereArticleHitSchema = z.object({
  articleId: IdSchema,
  name: z.string(),
  unit: UnitSchema,
  categoryId: ArticleCategoryIdSchema,
  match: WhereMatchSchema,
  /** Its usual area and spot, as the article names them. */
  area: AreaTagSchema.optional(),
  spot: z
    .object({
      id: IdSchema,
      name: z.string(),
      note: z.string().optional(),
      photo: PhotoSchema.optional(),
    })
    .optional(),
  /** Its whole stock right now. */
  stock: QuantitySchema,
  /** Every area that holds stock of it, in the order of the areas. */
  stockPlaces: z.array(StockPlaceSchema),
  /** Some of the stock lies outside the usual area (or there is no usual area). */
  stockElsewhere: z.boolean(),
});
export type WhereArticleHit = z.infer<typeof WhereArticleHitSchema>;

export const WhereSpotHitSchema = z.object({
  spotId: IdSchema,
  name: z.string(),
  note: z.string().optional(),
  photo: PhotoSchema.optional(),
  area: AreaTagSchema,
  articleCount: z.int(),
  match: WhereMatchSchema,
});
export type WhereSpotHit = z.infer<typeof WhereSpotHitSchema>;

export const WhereAreaHitSchema = z.object({
  areaId: IdSchema,
  name: z.string(),
  kind: AreaKindSchema,
  photo: PhotoSchema.optional(),
  spotCount: z.int(),
  articleCount: z.int(),
  match: WhereMatchSchema,
});
export type WhereAreaHit = z.infer<typeof WhereAreaHitSchema>;

/** The start of «Wo ist was?» before anything is typed: every area with its spots. */
export const WhereBrowseAreaSchema = z.object({
  areaId: IdSchema,
  name: z.string(),
  kind: AreaKindSchema,
  photo: PhotoSchema.optional(),
  articleCount: z.int(),
  spots: z.array(
    z.object({
      spotId: IdSchema,
      name: z.string(),
      note: z.string().optional(),
      photo: PhotoSchema.optional(),
      articleCount: z.int(),
    }),
  ),
});
export type WhereBrowseArea = z.infer<typeof WhereBrowseAreaSchema>;

/** How many article names a stop of the tour shows; the rest is a number. */
export const TOUR_ARTICLE_NAMES = 8;

/** One spot of the tour: the photo, the note and what lies there. */
export const TourSpotSchema = z.object({
  spotId: IdSchema,
  name: z.string(),
  note: z.string().optional(),
  photo: PhotoSchema.optional(),
  /** Up to eight names, in the order of the alphabet. */
  articleNames: z.array(z.string()).max(TOUR_ARTICLE_NAMES),
  articleCount: z.int(),
});
export type TourSpot = z.infer<typeof TourSpotSchema>;

/** One area of the tour with its spots in order. */
export const TourAreaSchema = z.object({
  ...AreaFacts,
  spots: z.array(TourSpotSchema),
  /** Articles of the area without a spot: up to eight names and how many there are. */
  unplacedNames: z.array(z.string()).max(TOUR_ARTICLE_NAMES),
  unplacedCount: z.int(),
});
export type TourArea = z.infer<typeof TourAreaSchema>;

/** Area fields a person types; in `areas.update`, null clears an optional one. */
const areaRange = {
  minDeciC: DeciCelsiusSchema,
  maxDeciC: DeciCelsiusSchema,
};

/** A position in a list, 0 first; a number past the end means «at the end». */
const PositionSchema = z.int().min(0).max(999);

/**
 * «Wo ist was?»: the storage areas of the house («Lagerbereiche»), the named spots inside them
 * with photos («Plätze»), the search that shows a new person where something is, and the tour
 * for the first day. On articles this module writes only `areaId` and `spotId`; stock belongs
 * to the ledger and is only read here.
 */
export const areasContract = {
  'areas.list': query({
    name: 'areas.list',
    summary: {
      de: 'Lagerbereiche in ihrer Reihenfolge mit Temperaturbereich, Foto, Plätzen, Artikeln und dem Wert der Chargen darin.',
      en: 'Storage areas in order with temperature range, photo, spots, articles and the value of the lots in them.',
    },
    scopes: ['stock:read'],
    input: z.object({ ...queryBase }),
    output: z.object({
      areas: z.array(AreaSummarySchema),
      totals: z.object({
        spots: z.int(),
        spotsWithPhoto: z.int(),
        /** Live, active articles with a usual area, and those without one. */
        placedArticles: z.int(),
        unplacedArticles: z.int(),
      }),
    }),
  }),
  'areas.get': query({
    name: 'areas.get',
    summary: {
      de: 'Einen Lagerbereich mit seinen Plätzen, deren Artikeln, den Artikeln ohne Platz und den Chargen, die darin liegen.',
      en: 'Read one storage area with its spots and their articles, the articles without a spot and the lots lying in it.',
    },
    scopes: ['stock:read'],
    input: z.object({ ...queryBase, areaId: IdSchema }),
    output: z.object({
      area: z.object(AreaFacts),
      spots: z.array(SpotViewSchema),
      /** Articles whose usual area this is, but which have no spot in it. */
      unplaced: z.array(PlacedArticleSchema),
      /** Active lots in the area, the earliest date first. */
      lots: z.array(AreaLotSchema),
      totals: z.object({
        lotCount: z.int(),
        stockValueRappen: RappenSchema,
        priceMissing: z.boolean(),
        articleCount: z.int(),
        spotsWithPhoto: z.int(),
      }),
    }),
  }),
  'areas.create': command({
    name: 'areas.create',
    summary: {
      de: 'Einen Lagerbereich erfassen; ohne Angabe schlägt die Art den Temperaturbereich vor (Richtwert).',
      en: 'Create a storage area; without a range its kind proposes one (a guideline value).',
    },
    scopes: ['stock:write'],
    input: z.object({
      ...commandBase,
      name: StorageAreaSchema.shape.name,
      kind: AreaKindSchema,
      /** Left out: the guideline of the kind. Null: the area has no limit there. */
      minDeciC: areaRange.minDeciC.nullable().optional(),
      maxDeciC: areaRange.maxDeciC.nullable().optional(),
      photo: PhotoSchema.optional(),
      /** Position among the areas; left out: at the end. */
      sortOrder: PositionSchema.optional(),
    }),
    output: z.object({ areaId: IdSchema }),
  }),
  'areas.update': command({
    name: 'areas.update',
    summary: {
      de: 'Name, Art, Temperaturbereich, Foto oder Stelle eines Lagerbereichs ändern; null leert ein freiwilliges Feld.',
      en: 'Change name, kind, temperature range, photo or position of a storage area; null clears an optional field.',
    },
    scopes: ['stock:write'],
    input: z.object({
      ...commandBase,
      areaId: IdSchema,
      name: StorageAreaSchema.shape.name.optional(),
      kind: AreaKindSchema.optional(),
      minDeciC: areaRange.minDeciC.nullable().optional(),
      maxDeciC: areaRange.maxDeciC.nullable().optional(),
      photo: PhotoSchema.nullable().optional(),
      sortOrder: PositionSchema.optional(),
    }),
    output: z.object({ areaId: IdSchema, changed: z.array(z.string()) }),
  }),
  'areas.delete': command({
    name: 'areas.delete',
    summary: {
      de: 'Einen Lagerbereich löschen, solange keine Charge darin liegt; seine Plätze gehen mit, seine Artikel verlieren ihren Lagerort.',
      en: 'Delete a storage area that holds no lot; its spots go with it and its articles lose their place.',
    },
    scopes: ['stock:write'],
    input: z.object({ ...commandBase, areaId: IdSchema }),
    output: z.object({
      areaId: IdSchema,
      spotsRemoved: z.int(),
      articlesCleared: z.int(),
    }),
  }),
  'areas.reorder': command({
    name: 'areas.reorder',
    summary: {
      de: 'Die Reihenfolge der Lagerbereiche festlegen; nicht genannte folgen in ihrer bisherigen Reihenfolge.',
      en: 'Set the order of the storage areas; areas not named follow in their previous order.',
    },
    scopes: ['stock:write'],
    input: z.object({ ...commandBase, areaIds: z.array(IdSchema).min(1).max(1000) }),
    output: z.object({ areaIds: z.array(IdSchema) }),
  }),
  'spots.create': command({
    name: 'spots.create',
    summary: {
      de: 'Einen Platz in einem Lagerbereich erfassen, mit Notiz und Foto.',
      en: 'Create a spot in a storage area, with a note and a photo.',
    },
    scopes: ['stock:write'],
    input: z.object({
      ...commandBase,
      areaId: IdSchema,
      name: StorageSpotSchema.shape.name,
      note: StorageSpotSchema.shape.note,
      photo: PhotoSchema.optional(),
      /** Position among the spots of the area; left out: at the end. */
      sortOrder: PositionSchema.optional(),
    }),
    output: z.object({ spotId: IdSchema }),
  }),
  'spots.update': command({
    name: 'spots.update',
    summary: {
      de: 'Name, Notiz, Foto oder Stelle eines Platzes ändern; null leert Notiz oder Foto.',
      en: 'Change name, note, photo or position of a spot; null clears the note or the photo.',
    },
    scopes: ['stock:write'],
    input: z.object({
      ...commandBase,
      spotId: IdSchema,
      name: StorageSpotSchema.shape.name.optional(),
      note: StorageSpotSchema.shape.note.unwrap().nullable().optional(),
      photo: PhotoSchema.nullable().optional(),
      sortOrder: PositionSchema.optional(),
    }),
    output: z.object({ spotId: IdSchema, changed: z.array(z.string()) }),
  }),
  'spots.delete': command({
    name: 'spots.delete',
    summary: {
      de: 'Einen Platz löschen; seine Artikel bleiben im Lagerbereich, ohne Platz.',
      en: 'Delete a spot; its articles stay in the storage area, without a spot.',
    },
    scopes: ['stock:write'],
    input: z.object({ ...commandBase, spotId: IdSchema }),
    output: z.object({ spotId: IdSchema, articlesCleared: z.int() }),
  }),
  'spots.assign': command({
    name: 'spots.assign',
    summary: {
      de: 'Artikel an einen Platz legen oder in den Lagerbereich ohne Platz; mit «replace» ist die Liste der ganze Inhalt.',
      en: 'Put articles on a spot or into the area without a spot; with «replace» the list is the whole content.',
    },
    scopes: ['stock:write'],
    input: z.object({
      ...commandBase,
      areaId: IdSchema,
      /** Null: into the area, without a spot. */
      spotId: IdSchema.nullable(),
      articleIds: z.array(IdSchema).max(2000),
      /**
       * True: the list is all that belongs there. Articles on the spot that are not listed stay
       * in the area without a spot; articles in the area without a spot that are not listed
       * leave the area. Inactive articles, which no list shows, stay where they are.
       */
      replace: z.boolean().default(false),
    }),
    output: z.object({
      /** Articles whose place changed to the target. */
      placed: z.int(),
      /** Articles that left the target because the list did not name them. */
      released: z.int(),
    }),
  }),
  'where.search': query({
    name: 'where.search',
    summary: {
      de: 'Wo ist was? Artikel, Plätze und Lagerbereiche nach Namen finden, mit Platz, Foto und wo der Bestand gerade liegt.',
      en: 'Where is what? Find articles, spots and areas by name, with spot, photo and where the stock lies right now.',
    },
    scopes: ['stock:read'],
    input: z.object({ ...queryBase, text: z.string().max(120).default('') }),
    output: z.object({
      /** Best hits first: the name starts with the first word, then a word does, then it contains it. */
      articles: z.array(WhereArticleHitSchema),
      spots: z.array(WhereSpotHitSchema),
      areas: z.array(WhereAreaHitSchema),
      /** Only for an empty text: every area with its spots, to look around. */
      browse: z.array(WhereBrowseAreaSchema),
    }),
  }),
  'tour.get': query({
    name: 'tour.get',
    summary: {
      de: 'Der Rundgang für neue Mitarbeitende: jeder Lagerbereich und jeder Platz der Reihe nach, mit Foto, Notiz und was dort liegt.',
      en: 'The tour for new staff: every area and every spot in order, with photo, note and what lies there.',
    },
    scopes: ['stock:read'],
    input: z.object({ ...queryBase }),
    output: z.object({
      areas: z.array(TourAreaSchema),
      counts: z.object({ areas: z.int(), spots: z.int(), spotsWithPhoto: z.int() }),
    }),
  }),
} as const satisfies ContractFragment;
