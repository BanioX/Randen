import { z } from 'zod';
import {
  command,
  commandBase,
  query,
  queryBase,
  type ContractFragment,
} from '../../contract/operation';
import { AllergenIdSchema, DietSchema } from '../../domain/allergens';
import { AreaKindSchema, ArticleCategoryIdSchema } from '../../domain/categories';
import { IdSchema } from '../../ids';
import { RappenSchema } from '../../money';
import {
  ArticleKindSchema,
  ArticleSchema,
  SupplierSchema,
  UnitPriceSchema,
} from '../../model/article';
import {
  BpsSchema,
  DateKindSchema,
  LocalDateSchema,
  QuantitySchema,
  UnitSchema,
  WeekdaySchema,
} from '../../model/primitives';
import { RecipeKindSchema } from '../../model/recipe';
import { IMPORT_MAX_LINES } from './import-lines';

export { IMPORT_MAX_LINES };

/** What a professional still has to complete on an article. */
export const ArticleMissingSchema = z.enum(['price', 'origin', 'supplier']);
export type ArticleMissing = z.infer<typeof ArticleMissingSchema>;

/** The four views of the article list. `all` are the active articles. */
export const ArticleListFilterSchema = z.enum(['all', 'below_min', 'no_price', 'inactive']);
export type ArticleListFilter = z.infer<typeof ArticleListFilterSchema>;

const ExpiryStatusSchema = z.enum(['none', 'ok', 'soon', 'today', 'past_best_before', 'expired']);

/** One line of the article list: names and numbers already joined. */
export const ArticleListRowSchema = z.object({
  id: IdSchema,
  name: z.string(),
  kind: ArticleKindSchema,
  categoryId: ArticleCategoryIdSchema,
  categoryLabel: z.string(),
  unit: UnitSchema,
  /** The price costing uses: the last purchase, or for a component its recipe; 0 = unknown. */
  pricePer1000: UnitPriceSchema,
  supplierId: IdSchema.optional(),
  supplierName: z.string().optional(),
  areaId: IdSchema.optional(),
  areaName: z.string().optional(),
  areaKind: AreaKindSchema.optional(),
  spotName: z.string().optional(),
  /** Sum of the active lots, in base units, and what they are worth. */
  stock: QuantitySchema,
  stockValueRappen: RappenSchema,
  minStock: QuantitySchema.optional(),
  belowMin: z.boolean(),
  allergens: z.array(AllergenIdSchema),
  traces: z.array(AllergenIdSchema),
  diet: DietSchema,
  active: z.boolean(),
  missing: z.array(ArticleMissingSchema),
});
export type ArticleListRow = z.infer<typeof ArticleListRowSchema>;

/** The article as its detail page and its form need it. */
export const ArticleViewSchema = z.object({
  id: IdSchema,
  name: z.string(),
  kind: ArticleKindSchema,
  categoryId: ArticleCategoryIdSchema,
  categoryLabel: z.string(),
  /** Meat and fish: the country of origin belongs on the menu card. */
  declaresOrigin: z.boolean(),
  unit: UnitSchema,
  /** As stored: the last purchase price or production cost; 0 = none yet. */
  pricePer1000: UnitPriceSchema,
  /** What costing uses: the stored price, or for a component the cost of its recipe; 0 = unknown. */
  effectivePricePer1000: UnitPriceSchema,
  yieldBps: BpsSchema,
  /** For a component: what its recipe declares, through all its ingredients. */
  allergens: z.array(AllergenIdSchema),
  traces: z.array(AllergenIdSchema),
  diet: DietSchema,
  supplierId: IdSchema.optional(),
  supplierName: z.string().optional(),
  supplierArticleNumber: z.string().optional(),
  packSize: QuantitySchema.optional(),
  packLabel: z.string().optional(),
  minStock: QuantitySchema.optional(),
  targetStock: QuantitySchema.optional(),
  areaId: IdSchema.optional(),
  areaName: z.string().optional(),
  areaKind: AreaKindSchema.optional(),
  spotId: IdSchema.optional(),
  spotName: z.string().optional(),
  shelfLifeDays: z.int().optional(),
  dateKind: DateKindSchema,
  originCountry: z.string().optional(),
  originCountryName: z.string().optional(),
  recipeId: IdSchema.optional(),
  gtin: z.string().optional(),
  note: z.string().optional(),
  active: z.boolean(),
});
export type ArticleView = z.infer<typeof ArticleViewSchema>;

/** One purchase in the price history, newest first. */
export const PricePointSchema = z.object({
  lotId: IdSchema,
  receivedOn: LocalDateSchema,
  pricePer1000: UnitPriceSchema,
  quantity: QuantitySchema,
  supplierName: z.string().optional(),
  /** Change against the purchase before, in basis points: 500 = 5 % dearer, -250 = 2.5 % cheaper. */
  changeBps: z.int().optional(),
});
export type PricePoint = z.infer<typeof PricePointSchema>;

/** The next day a supplier takes orders or delivers, counted from today. */
export const SupplierDaySchema = z.object({
  on: LocalDateSchema,
  weekday: WeekdaySchema,
  /** 0 = today. */
  inDays: z.int().min(0).max(6),
});
export type SupplierDay = z.infer<typeof SupplierDaySchema>;

const SupplierFacts = {
  id: IdSchema,
  name: z.string(),
  customerNumber: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  orderDays: z.array(WeekdaySchema),
  deliveryDays: z.array(WeekdaySchema),
  minOrderRappen: RappenSchema.optional(),
  nextOrder: SupplierDaySchema.optional(),
  nextDelivery: SupplierDaySchema.optional(),
};

export const SupplierListRowSchema = z.object({
  ...SupplierFacts,
  /** Live articles that name this supplier, and how many of them are below their minimum. */
  articleCount: z.int(),
  belowMinCount: z.int(),
});
export type SupplierListRow = z.infer<typeof SupplierListRowSchema>;

export const SupplierArticleRowSchema = z.object({
  id: IdSchema,
  name: z.string(),
  categoryLabel: z.string(),
  unit: UnitSchema,
  pricePer1000: UnitPriceSchema,
  stock: QuantitySchema,
  minStock: QuantitySchema.optional(),
  belowMin: z.boolean(),
  active: z.boolean(),
});
export type SupplierArticleRow = z.infer<typeof SupplierArticleRowSchema>;

/** Why a pasted line cannot become an article (see `import-lines.ts`). */
export const ImportProblemSchema = z.enum([
  'name',
  'unit',
  'price',
  'supplier',
  'duplicate',
  'repeated',
]);

export const ImportLineSchema = z.object({
  /** Number of the line in the pasted text, starting at 1. */
  line: z.int().min(1),
  raw: z.string(),
  name: z.string().optional(),
  unit: UnitSchema.optional(),
  pricePer1000: UnitPriceSchema.optional(),
  supplierName: z.string().optional(),
  /** True when the import would create this supplier. */
  supplierIsNew: z.boolean(),
  /** A first guess from the name; the person can correct it before the import. */
  categoryId: ArticleCategoryIdSchema,
  categoryLabel: z.string(),
  problems: z.array(ImportProblemSchema),
  ok: z.boolean(),
});
export type ImportLine = z.infer<typeof ImportLineSchema>;

/** Text pasted for «Mehrere auf einmal». */
const ImportTextSchema = z.string().max(100_000);

const articleFields = {
  name: ArticleSchema.shape.name,
  categoryId: ArticleCategoryIdSchema,
  unit: UnitSchema,
  pricePer1000: UnitPriceSchema,
  yieldBps: ArticleSchema.shape.yieldBps,
  allergens: ArticleSchema.shape.allergens,
  traces: ArticleSchema.shape.traces,
  diet: DietSchema,
  dateKind: DateKindSchema,
};

/** Optional fields of an article; in `articles.update`, null clears them. */
const articleOptionalFields = {
  supplierId: IdSchema,
  supplierArticleNumber: ArticleSchema.shape.supplierArticleNumber.unwrap(),
  packSize: ArticleSchema.shape.packSize.unwrap(),
  packLabel: ArticleSchema.shape.packLabel.unwrap(),
  minStock: QuantitySchema,
  targetStock: QuantitySchema,
  areaId: IdSchema,
  spotId: IdSchema,
  shelfLifeDays: ArticleSchema.shape.shelfLifeDays.unwrap(),
  originCountry: ArticleSchema.shape.originCountry.unwrap(),
  gtin: ArticleSchema.shape.gtin.unwrap(),
  note: ArticleSchema.shape.note.unwrap(),
};

const supplierOptionalFields = {
  customerNumber: SupplierSchema.shape.customerNumber.unwrap(),
  phone: SupplierSchema.shape.phone.unwrap(),
  email: SupplierSchema.shape.email.unwrap(),
  minOrderRappen: SupplierSchema.shape.minOrderRappen.unwrap(),
  note: SupplierSchema.shape.note.unwrap(),
};

/** `{ a: S }` → `{ a: S.optional() }`: the field may be left out. */
function optional<TShape extends Record<string, z.ZodType>>(shape: TShape) {
  return Object.fromEntries(
    Object.entries(shape).map(([key, schema]) => [key, schema.optional()]),
  ) as { [TKey in keyof TShape]: z.ZodOptional<TShape[TKey]> };
}

/** `{ a: S }` → `{ a: S.nullable().optional() }`: left out = unchanged, null = cleared. */
function clearable<TShape extends Record<string, z.ZodType>>(shape: TShape) {
  return Object.fromEntries(
    Object.entries(shape).map(([key, schema]) => [key, schema.nullable().optional()]),
  ) as { [TKey in keyof TShape]: z.ZodOptional<z.ZodNullable<TShape[TKey]>> };
}

/**
 * The master data of the kitchen: «Artikel» (what is kept in stock) and «Lieferanten» (who
 * delivers it). Stock itself belongs to the ledger; these operations only read it.
 */
export const articlesContract = {
  'articles.list': query({
    name: 'articles.list',
    summary: {
      de: 'Artikel mit Bestand, Preis, Lieferant, Platz und offenen Angaben auflisten.',
      en: 'List articles with stock, price, supplier, place and what is still missing.',
    },
    scopes: ['stock:read'],
    input: z.object({
      ...queryBase,
      /** Words of the name, the group of goods, the supplier or an article number. */
      search: z.string().max(120).optional(),
      categoryId: ArticleCategoryIdSchema.optional(),
      supplierId: IdSchema.optional(),
      kind: ArticleKindSchema.optional(),
      filter: ArticleListFilterSchema.default('all'),
    }),
    output: z.object({
      rows: z.array(ArticleListRowSchema),
      /** How many articles each view holds, for the search and the group of goods chosen. */
      counts: z.object({
        all: z.int(),
        below_min: z.int(),
        no_price: z.int(),
        inactive: z.int(),
      }),
      /** Groups of goods that occur in this view, with their number of articles. */
      categories: z.array(
        z.object({ id: ArticleCategoryIdSchema, label: z.string(), count: z.int() }),
      ),
      /** Every live article of the business: 0 means there is nothing to list yet. */
      total: z.int(),
    }),
  }),
  'articles.get': query({
    name: 'articles.get',
    summary: {
      de: 'Einen Artikel mit Bestand, Preisverlauf, Verwendung in Rezepten und offenen Angaben lesen.',
      en: 'Read one article with stock, price history, use in recipes and what is still missing.',
    },
    scopes: ['stock:read'],
    input: z.object({ ...queryBase, articleId: IdSchema }),
    output: z.object({
      article: ArticleViewSchema,
      stock: z.object({
        quantity: QuantitySchema,
        valueRappen: RappenSchema,
        /** Number of active lots. */
        lots: z.int(),
        belowMin: z.boolean(),
        /** The lot that expires first, if any lot carries a date. */
        next: z
          .object({
            expiresOn: LocalDateSchema,
            dateKind: DateKindSchema,
            status: ExpiryStatusSchema,
            daysLeft: z.int(),
          })
          .optional(),
      }),
      /** Recipes that use the article, with the net quantity one batch takes. */
      usedIn: z.array(
        z.object({
          recipeId: IdSchema,
          name: z.string(),
          kind: RecipeKindSchema,
          quantity: QuantitySchema,
          portions: z.int(),
          active: z.boolean(),
        }),
      ),
      /** For a component: the recipe that makes it. */
      madeBy: z
        .object({ recipeId: IdSchema, name: z.string(), quantity: QuantitySchema.optional() })
        .optional(),
      /** The last twelve purchases (for a component: productions), newest first. */
      priceHistory: z.array(PricePointSchema),
      missing: z.array(ArticleMissingSchema),
      /** Set when the unit can no longer change: there are lots, or recipes use the article. */
      unitLock: z.enum(['stock', 'recipes']).optional(),
      /** What keeps the article from being deleted; all zero means it can go. */
      blockers: z.object({
        stock: QuantitySchema,
        recipes: z.int(),
        orders: z.int(),
      }),
    }),
  }),
  'articles.create': command({
    name: 'articles.create',
    summary: {
      de: 'Einen eingekauften Artikel erfassen; Diät, Datumsart, Haltbarkeit und Lagerbereich schlägt die Warengruppe vor.',
      en: 'Create a purchased article; diet, date kind, shelf life and storage area default from its category.',
    },
    scopes: ['stock:write'],
    input: z.object({
      ...commandBase,
      name: articleFields.name,
      categoryId: articleFields.categoryId,
      unit: articleFields.unit,
      ...optional({
        pricePer1000: articleFields.pricePer1000,
        yieldBps: articleFields.yieldBps,
        allergens: articleFields.allergens,
        traces: articleFields.traces,
        diet: articleFields.diet,
        dateKind: articleFields.dateKind,
        active: z.boolean(),
      }),
      ...optional(articleOptionalFields),
      /**
       * Left out: what the group of goods proposes. Null: the person decided there is none
       * («Kein fester Lagerbereich», no shelf life).
       */
      areaId: articleOptionalFields.areaId.nullable().optional(),
      shelfLifeDays: articleOptionalFields.shelfLifeDays.nullable().optional(),
    }),
    output: z.object({ articleId: IdSchema }),
  }),
  'articles.update': command({
    name: 'articles.update',
    summary: {
      de: 'Angaben eines Artikels ändern; null leert ein freiwilliges Feld.',
      en: 'Change fields of an article; null clears an optional field.',
    },
    scopes: ['stock:write'],
    input: z.object({
      ...commandBase,
      articleId: IdSchema,
      ...optional(articleFields),
      ...clearable(articleOptionalFields),
    }),
    output: z.object({ articleId: IdSchema, changed: z.array(z.string()) }),
  }),
  'articles.setActive': command({
    name: 'articles.setActive',
    summary: {
      de: 'Einen Artikel inaktiv oder wieder aktiv setzen; seine Geschichte bleibt.',
      en: 'Hide an article from pickers or bring it back; its history stays.',
    },
    scopes: ['stock:write'],
    input: z.object({ ...commandBase, articleId: IdSchema, active: z.boolean() }),
    output: z.object({ articleId: IdSchema, active: z.boolean() }),
  }),
  'articles.delete': command({
    name: 'articles.delete',
    summary: {
      de: 'Einen Artikel löschen, solange er weder Bestand hat noch in Rezepten oder offenen Bestellungen steht.',
      en: 'Delete an article that has no stock and is in no recipe or open order.',
    },
    scopes: ['stock:write'],
    input: z.object({ ...commandBase, articleId: IdSchema }),
    output: z.object({ articleId: IdSchema }),
  }),
  'articles.importPreview': query({
    name: 'articles.importPreview',
    summary: {
      de: 'Eingefügte Zeilen lesen und zeigen, welche Artikel daraus entstehen und welche Zeilen nicht aufgehen.',
      en: 'Read pasted lines and show which articles they become and which lines do not work.',
    },
    scopes: ['stock:read'],
    input: z.object({ ...queryBase, text: ImportTextSchema }),
    output: z.object({
      lines: z.array(ImportLineSchema),
      valid: z.int(),
      invalid: z.int(),
      /** Suppliers the import would create, by name. */
      newSuppliers: z.array(z.string()),
      /** True when the text has more lines than one import takes; the rest was not read. */
      truncated: z.boolean(),
    }),
  }),
  'articles.import': command({
    name: 'articles.import',
    summary: {
      de: 'Aus eingefügten Zeilen alle lesbaren Artikel anlegen, fehlende Lieferanten dazu.',
      en: 'Create every readable article from pasted lines, and the suppliers that are missing.',
    },
    scopes: ['stock:write'],
    input: z.object({
      ...commandBase,
      text: ImportTextSchema,
      /** Corrections of the guessed group of goods, by line number of the text. */
      categories: z
        .array(z.object({ line: z.int().min(1), categoryId: ArticleCategoryIdSchema }))
        .max(IMPORT_MAX_LINES)
        .default([]),
    }),
    output: z.object({
      created: z.int(),
      skipped: z.int(),
      suppliersCreated: z.int(),
      articleIds: z.array(IdSchema),
      /** The lines that were not imported, as pasted, to correct and try again. */
      remaining: z.string(),
    }),
  }),
  'suppliers.list': query({
    name: 'suppliers.list',
    summary: {
      de: 'Lieferanten mit Anzahl Artikel und dem nächsten Bestell- und Liefertag auflisten.',
      en: 'List suppliers with their number of articles and the next order and delivery day.',
    },
    scopes: ['stock:read'],
    input: z.object({ ...queryBase, search: z.string().max(120).optional() }),
    output: z.object({
      suppliers: z.array(SupplierListRowSchema),
      /** Every live supplier of the business: 0 means there is nothing to list yet. */
      total: z.int(),
    }),
  }),
  'suppliers.get': query({
    name: 'suppliers.get',
    summary: {
      de: 'Einen Lieferanten mit Kontakt, Bestell- und Liefertagen und seinen Artikeln lesen.',
      en: 'Read one supplier with contact, order and delivery days and its articles.',
    },
    scopes: ['stock:read'],
    input: z.object({ ...queryBase, supplierId: IdSchema }),
    output: z.object({
      supplier: z.object({ ...SupplierFacts, note: z.string().optional() }),
      articles: z.array(SupplierArticleRowSchema),
      /** Orders in draft or sent: they keep the supplier from being deleted. */
      openOrders: z.int(),
    }),
  }),
  'suppliers.create': command({
    name: 'suppliers.create',
    summary: {
      de: 'Einen Lieferanten mit Kontakt, Bestell- und Liefertagen erfassen.',
      en: 'Create a supplier with contact, order days and delivery days.',
    },
    scopes: ['stock:write'],
    input: z.object({
      ...commandBase,
      name: SupplierSchema.shape.name,
      orderDays: SupplierSchema.shape.orderDays.default([]),
      deliveryDays: SupplierSchema.shape.deliveryDays.default([]),
      ...optional(supplierOptionalFields),
    }),
    output: z.object({ supplierId: IdSchema }),
  }),
  'suppliers.update': command({
    name: 'suppliers.update',
    summary: {
      de: 'Angaben eines Lieferanten ändern; null leert ein freiwilliges Feld.',
      en: 'Change fields of a supplier; null clears an optional field.',
    },
    scopes: ['stock:write'],
    input: z.object({
      ...commandBase,
      supplierId: IdSchema,
      name: SupplierSchema.shape.name.optional(),
      orderDays: SupplierSchema.shape.orderDays.optional(),
      deliveryDays: SupplierSchema.shape.deliveryDays.optional(),
      ...clearable(supplierOptionalFields),
    }),
    output: z.object({ supplierId: IdSchema, changed: z.array(z.string()) }),
  }),
  'suppliers.delete': command({
    name: 'suppliers.delete',
    summary: {
      de: 'Einen Lieferanten löschen, solange kein Artikel und keine offene Bestellung ihn nennt.',
      en: 'Delete a supplier that no article and no open order names.',
    },
    scopes: ['stock:write'],
    input: z.object({ ...commandBase, supplierId: IdSchema }),
    output: z.object({ supplierId: IdSchema }),
  }),
} as const satisfies ContractFragment;
