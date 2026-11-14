/**
 * Test support, shared by the tests of the logic (memory storage) and of the app (IndexedDB).
 * Imported as `@randen/core/testing`; the app itself never imports it.
 */
import type { z } from 'zod';
import { createUseCases, type AppContext, type UseCases } from '../application';
import { createStockLedger } from '../application/stock-ledger';
import { DEFAULT_CURRENCY } from '../currency';
import { addDays, localDate } from '../dates';
import { uuidV7, type Id } from '../ids';
import { ArticleSchema, SupplierSchema, type Article, type Supplier } from '../model/article';
import { BusinessSchema, StaffMemberSchema } from '../model/business';
import { IsoDateTimeSchema, type LocalDate } from '../model/primitives';
import { RecipeSchema, type Recipe } from '../model/recipe';
import type { StockLot } from '../model/stock';
import {
  StorageAreaSchema,
  StorageSpotSchema,
  type StorageArea,
  type StorageSpot,
} from '../model/storage-area';
import type { Clock, IdGenerator } from '../ports';
import { createMemoryStorage } from '../ports/memory-storage';
import type { Storage } from '../ports/storage';

/** UUIDv7s that count up: the same test gives the same ids every time. */
export function sequentialIds(start = 1): IdGenerator {
  let counter = start;
  return {
    next: () => {
      const bytes = new Uint8Array(10);
      let rest = counter;
      for (let i = 9; i >= 0 && rest > 0; i -= 1) {
        bytes[i] = rest % 256;
        rest = Math.floor(rest / 256);
      }
      counter += 1;
      return uuidV7(1_800_000_000_000, bytes);
    },
  };
}

/** A clock that stands still until the test moves it. */
export interface TestClock extends Clock {
  setToday: (day: LocalDate | string) => void;
}

export function fixedClock(day = '2026-11-14'): TestClock {
  let today = localDate(day);
  return {
    now: () => IsoDateTimeSchema.parse(`${today}T10:00:00.000Z`),
    today: () => today,
    setToday: (next) => {
      today = localDate(next);
    },
  };
}

export interface TestContext {
  ctx: AppContext;
  storage: Storage;
  clock: TestClock;
  ids: IdGenerator;
  businessId: Id;
  actor: Id;
  useCases: UseCases;
  /** A fresh command id. */
  cmd: () => Id;
}

/**
 * An empty business with one person on the given storage (default: memory), with a fixed clock
 * and counting ids. `today` defaults to 14.11.2026.
 */
export async function createTestContext(
  options: { storage?: Storage; today?: string } = {},
): Promise<TestContext> {
  const storage = options.storage ?? createMemoryStorage();
  const clock = fixedClock(options.today);
  const ids = sequentialIds();
  const now = clock.now();
  const businessId = ids.next();
  const actor = ids.next();
  await storage.businesses.add(
    BusinessSchema.parse({
      id: businessId,
      name: 'Testküche',
      kind: 'restaurant',
      currency: DEFAULT_CURRENCY,
      targetFoodCostBps: 3000,
      defaultVatBps: 810,
      createdAt: now,
      updatedAt: now,
    }),
  );
  await storage.staff.add(
    StaffMemberSchema.parse({
      id: actor,
      businessId,
      name: 'Testperson',
      role: 'chef',
      active: true,
      createdAt: now,
      updatedAt: now,
    }),
  );
  const ctx: AppContext = { storage, clock, ids, actor };
  return {
    ctx,
    storage,
    clock,
    ids,
    businessId,
    actor,
    useCases: createUseCases(ctx),
    cmd: ids.next,
  };
}

export interface Kitchen {
  areas: { cold: StorageArea; frozen: StorageArea; dry: StorageArea };
  spots: { meatDrawer: StorageSpot; dryShelf: StorageSpot };
  suppliers: { butcher: Supplier; wholesaler: Supplier };
  articles: {
    /** Rindsentrecôte, g, CHF 62.00/kg, yield 90 %, origin CH. */
    entrecote: Article;
    /** Lachsfilet, g, CHF 38.00/kg, allergen fish, origin NO. */
    salmon: Article;
    /** Vollrahm, ml, CHF 6.40/l, allergen milk. */
    cream: Article;
    /** Butter, g, CHF 14.00/kg, allergen milk. */
    butter: Article;
    /** Weissmehl, g, CHF 1.60/kg, allergen gluten, min stock 5 kg. */
    flour: Article;
    /** Eier, pcs, CHF 0.45/Stk., allergen eggs. */
    eggs: Article;
    /** Zwiebeln, g, CHF 2.20/kg, yield 85 %, vegan. */
    onions: Article;
    /** Kartoffeln, g, CHF 1.80/kg, yield 80 %, vegan. */
    potatoes: Article;
    /** Rotwein zum Kochen, ml, CHF 9.00/l, allergen sulphites. */
    redWine: Article;
    /** Rotweinjus, prepared, ml, made by `recipes.jus`. */
    jus: Article;
  };
  lots: {
    /** 4 kg Entrecôte, use by today + 2. */
    entrecote: StockLot;
    /** 1.5 kg Lachs, use by today + 1. */
    salmon: StockLot;
    /** 3 l Rahm, best before today + 6. */
    creamOld: StockLot;
    /** 5 l Rahm, best before today + 12. */
    creamNew: StockLot;
    /** 2 kg Butter, best before today + 30. */
    butter: StockLot;
    /** 3 kg Mehl (below min stock of 5 kg), no date. */
    flour: StockLot;
    /** 60 Eier, best before today + 14. */
    eggs: StockLot;
    /** 10 kg Zwiebeln, best before today + 20. */
    onions: StockLot;
    /** 25 kg Kartoffeln, best before today + 25. */
    potatoes: StockLot;
    /** 6 l Rotwein, no date. */
    redWine: StockLot;
  };
  recipes: {
    /** Component: 1 batch gives 1 l Rotweinjus (onions, red wine, butter). */
    jus: Recipe;
    /** Dish, 10 portions: Entrecôte mit Rotweinjus und Kartoffelstock, CHF 42.00. */
    entrecoteDish: Recipe;
    /** Dish, 4 portions: Lachs mit Rahmsauce, CHF 34.00. */
    salmonDish: Recipe;
  };
}

/**
 * A small, realistic kitchen for tests: three areas, two suppliers, ten articles with stock and
 * three recipes. Written straight to storage (the lots through the ledger, so the movements
 * exist), independent of any module's commands. Every value is in the doc comments above.
 */
export async function seedKitchen(t: TestContext): Promise<Kitchen> {
  const { storage, clock, ids, businessId } = t;
  const now = clock.now();
  const today = clock.today();
  const base = { businessId, createdAt: now, updatedAt: now };

  const area = (name: string, kind: StorageArea['kind'], sortOrder: number, range: object) =>
    StorageAreaSchema.parse({ id: ids.next(), ...base, name, kind, sortOrder, ...range });
  const areas = {
    cold: area('Kühlzelle', 'cold', 0, { minDeciC: 0, maxDeciC: 50 }),
    frozen: area('Tiefkühlzelle', 'frozen', 1, { maxDeciC: -180 }),
    dry: area('Trockenlager', 'dry', 2, {}),
  };
  const spot = (name: string, areaId: Id, sortOrder: number) =>
    StorageSpotSchema.parse({ id: ids.next(), ...base, areaId, name, sortOrder });
  const spots = {
    meatDrawer: spot('Schublade Fleisch', areas.cold.id, 0),
    dryShelf: spot('Regal 1, oben', areas.dry.id, 0),
  };
  const supplier = (name: string) =>
    SupplierSchema.parse({
      id: ids.next(),
      ...base,
      name,
      orderDays: ['mon', 'thu'],
      deliveryDays: ['tue', 'fri'],
    });
  const suppliers = {
    butcher: supplier('Metzgerei Muster'),
    wholesaler: supplier('Grosshandel Beispiel'),
  };

  type ArticleInput = z.input<typeof ArticleSchema>;
  const article = (
    fields: Partial<ArticleInput> & Pick<ArticleInput, 'name' | 'categoryId' | 'unit'>,
  ) =>
    ArticleSchema.parse({
      id: ids.next(),
      ...base,
      kind: 'purchased',
      pricePer1000: 0,
      yieldBps: 10_000,
      allergens: [],
      traces: [],
      diet: 'vegan',
      dateKind: 'best_before',
      active: true,
      ...fields,
    });
  const articles = {
    entrecote: article({
      name: 'Rindsentrecôte',
      categoryId: 'meat',
      unit: 'g',
      pricePer1000: 6200,
      yieldBps: 9000,
      diet: 'omnivore',
      dateKind: 'use_by',
      originCountry: 'CH',
      supplierId: suppliers.butcher.id,
      areaId: areas.cold.id,
      spotId: spots.meatDrawer.id,
      shelfLifeDays: 5,
    }),
    salmon: article({
      name: 'Lachsfilet',
      categoryId: 'fish',
      unit: 'g',
      pricePer1000: 3800,
      allergens: ['fish'],
      diet: 'omnivore',
      dateKind: 'use_by',
      originCountry: 'NO',
      supplierId: suppliers.wholesaler.id,
      areaId: areas.cold.id,
      shelfLifeDays: 3,
    }),
    cream: article({
      name: 'Vollrahm',
      categoryId: 'dairy',
      unit: 'ml',
      pricePer1000: 640,
      allergens: ['milk'],
      diet: 'vegetarian',
      supplierId: suppliers.wholesaler.id,
      areaId: areas.cold.id,
      shelfLifeDays: 10,
    }),
    butter: article({
      name: 'Butter',
      categoryId: 'dairy',
      unit: 'g',
      pricePer1000: 1400,
      allergens: ['milk'],
      diet: 'vegetarian',
      supplierId: suppliers.wholesaler.id,
      areaId: areas.cold.id,
    }),
    flour: article({
      name: 'Weissmehl',
      categoryId: 'dry',
      unit: 'g',
      pricePer1000: 160,
      allergens: ['gluten'],
      supplierId: suppliers.wholesaler.id,
      areaId: areas.dry.id,
      spotId: spots.dryShelf.id,
      minStock: 5000,
      targetStock: 20_000,
      packSize: 10_000,
      packLabel: 'Sack',
    }),
    eggs: article({
      name: 'Eier',
      categoryId: 'eggs',
      unit: 'pcs',
      pricePer1000: 45_000,
      allergens: ['eggs'],
      diet: 'vegetarian',
      supplierId: suppliers.wholesaler.id,
      areaId: areas.cold.id,
    }),
    onions: article({
      name: 'Zwiebeln',
      categoryId: 'vegetables',
      unit: 'g',
      pricePer1000: 220,
      yieldBps: 8500,
      supplierId: suppliers.wholesaler.id,
      areaId: areas.dry.id,
    }),
    potatoes: article({
      name: 'Kartoffeln',
      categoryId: 'vegetables',
      unit: 'g',
      pricePer1000: 180,
      yieldBps: 8000,
      supplierId: suppliers.wholesaler.id,
      areaId: areas.dry.id,
    }),
    redWine: article({
      name: 'Rotwein zum Kochen',
      categoryId: 'wine',
      unit: 'ml',
      pricePer1000: 900,
      allergens: ['sulphites'],
      supplierId: suppliers.wholesaler.id,
      areaId: areas.dry.id,
    }),
    jus: article({
      name: 'Rotweinjus',
      kind: 'prepared',
      categoryId: 'prepared',
      unit: 'ml',
      dateKind: 'use_by',
      areaId: areas.cold.id,
      shelfLifeDays: 3,
    }),
  };

  type RecipeInput = z.input<typeof RecipeSchema>;
  const recipe = (
    fields: Partial<RecipeInput> & Pick<RecipeInput, 'name' | 'kind' | 'course' | 'portions'>,
  ) =>
    RecipeSchema.parse({
      id: ids.next(),
      ...base,
      ingredients: [],
      steps: [],
      vatBps: 810,
      extraAllergens: [],
      extraTraces: [],
      labels: [],
      active: true,
      ...fields,
    });
  const jus = recipe({
    name: 'Rotweinjus',
    kind: 'component',
    course: 'other',
    portions: 1,
    output: { articleId: articles.jus.id, quantity: 1000 },
    shelfLifeDays: 3,
    ingredients: [
      { articleId: articles.onions.id, quantity: 170 },
      { articleId: articles.redWine.id, quantity: 750 },
      { articleId: articles.butter.id, quantity: 50 },
    ],
    steps: [
      'Zwiebeln anschwitzen.',
      'Mit Rotwein ablöschen und einkochen.',
      'Mit Butter montieren.',
    ],
  });
  articles.jus = ArticleSchema.parse({ ...articles.jus, recipeId: jus.id });
  const recipes = {
    jus,
    entrecoteDish: recipe({
      name: 'Entrecôte mit Rotweinjus und Kartoffelstock',
      kind: 'dish',
      course: 'main',
      portions: 10,
      priceRappen: 4200,
      description: 'Rindsentrecôte vom Grill, Rotweinjus, hausgemachter Kartoffelstock.',
      ingredients: [
        { articleId: articles.entrecote.id, quantity: 1800 },
        { articleId: articles.jus.id, quantity: 500 },
        { articleId: articles.potatoes.id, quantity: 2000 },
        { articleId: articles.cream.id, quantity: 400 },
        { articleId: articles.butter.id, quantity: 150 },
      ],
      steps: ['Kartoffeln kochen und stampfen.', 'Entrecôte grillieren.', 'Mit Jus anrichten.'],
    }),
    salmonDish: recipe({
      name: 'Lachs mit Rahmsauce',
      kind: 'dish',
      course: 'main',
      portions: 4,
      priceRappen: 3400,
      ingredients: [
        { articleId: articles.salmon.id, quantity: 640 },
        { articleId: articles.cream.id, quantity: 300 },
        { articleId: articles.butter.id, quantity: 40 },
      ],
      steps: ['Lachs braten.', 'Rahm einkochen und abschmecken.'],
    }),
  };

  const ledger = createStockLedger(t.ctx);
  const lots = await storage.transaction(async () => {
    for (const row of Object.values(areas)) {
      await storage.areas.add(row);
    }
    for (const row of Object.values(spots)) {
      await storage.spots.add(row);
    }
    for (const row of Object.values(suppliers)) {
      await storage.suppliers.add(row);
    }
    for (const row of Object.values(articles)) {
      await storage.articles.add(row);
    }
    for (const row of Object.values(recipes)) {
      await storage.recipes.add(row);
    }
    const lot = (item: Article, quantity: number, days?: number, areaId = item.areaId) =>
      ledger.receive({
        businessId,
        articleId: item.id,
        areaId: areaId ?? areas.dry.id,
        quantity,
        pricePer1000: item.pricePer1000,
        receivedOn: addDays(today, -1),
        ...(days === undefined ? {} : { expiresOn: addDays(today, days) }),
        supplierId: item.supplierId,
        origin: 'purchase',
      });
    return {
      entrecote: await lot(articles.entrecote, 4000, 2),
      salmon: await lot(articles.salmon, 1500, 1),
      creamOld: await lot(articles.cream, 3000, 6),
      creamNew: await lot(articles.cream, 5000, 12),
      butter: await lot(articles.butter, 2000, 30),
      flour: await lot(articles.flour, 3000),
      eggs: await lot(articles.eggs, 60, 14),
      onions: await lot(articles.onions, 10_000, 20),
      potatoes: await lot(articles.potatoes, 25_000, 25),
      redWine: await lot(articles.redWine, 6000),
    };
  });

  return { areas, spots, suppliers, articles, lots, recipes };
}
