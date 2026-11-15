import { createStockLedger, type AppContext, type StockLedger } from '../../application';
import { createCommandKit } from '../../application/command';
import { netOfVat, recipeCost, type CostBook } from '../../domain/costing';
import { roundQuantity } from '../../domain/units';
import type { Id } from '../../ids';
import { rappen } from '../../money';
import { ArticleSchema, SupplierSchema } from '../../model/article';
import { MODULE_IDS } from '../../domain/business-profiles';
import { BusinessSchema, StaffMemberSchema, type Business } from '../../model/business';
import { HygieneCheckSchema, HygieneTaskSchema, TemperatureLogSchema } from '../../model/haccp';
import { MenuCardSchema, PlanEntrySchema, type PlanSlot } from '../../model/menu';
import { LocalDateSchema, YearMonthSchema, type LocalDate } from '../../model/primitives';
import { ProductionSchema, RecipeSchema } from '../../model/recipe';
import { BudgetSchema, SaleSchema } from '../../model/sales';
import { DeliverySchema, InventoryCountSchema, PurchaseOrderSchema } from '../../model/stock';
import { StorageAreaSchema, StorageSpotSchema } from '../../model/storage-area';
import { alive } from '../../ports/storage';
import {
  AREAS,
  ARTICLES,
  HYGIENE_TASKS,
  MENU_CARDS,
  PLAN_SLOTS,
  RECIPES,
  STAFF,
  SUPPLIERS,
  type AreaKey,
  type StaffKey,
  type SupplierKey,
} from './catalogue';
import { DEFAULT_BUSINESS_NAMES, DEMO_BUSINESS_NAME } from './contract';
import {
  mirrorBackend,
  priceOn,
  storyLots,
  walkHistory,
  type Backend,
  type WalkResult,
} from './engine';
import { writeMarket } from './market';
import { dishPhoto, spotPhoto } from './photos';
import {
  articleOf,
  buildPlan,
  demandOn,
  HISTORY_DAYS,
  isComponent,
  isDeliveryDay,
  keepsLong,
  must,
  orderStep,
  recipeByKey,
  supplierByKey,
  TAKEAWAY_DISH,
  type DemoPlan,
} from './plan';
import {
  writeLunchPlan,
  writeMealCounts,
  writeMenuLines,
  writeTakeaway,
  writeWaste,
} from './service';
import { createRandom, dayAt, roundToStep, roundUpTo, weekdayOf, zurichInstant } from './support';

/** The demo's VAT: every dish is served on the premises. */
const VAT_BPS = 810;
const TARGET_FOOD_COST_BPS = 3000;

/**
 * The first walk: on the mirror only, outside any transaction (it reads nothing). It decides
 * what each delivery of fresh goods brought and how much of the story lots is used up until
 * today, so the second walk can book exactly the rests the cockpit should show.
 */
export async function prepareDemo(today: LocalDate) {
  const plan = buildPlan(today);
  const story = storyLots(plan);
  const first = await walkHistory({ plan, backend: mirrorBackend(), story, storyReserve: true });
  const decided = new Map(first.decided);
  for (const lot of story.filter((entry) => entry.forgotten === undefined)) {
    const key = `${String(lot.day)}:${lot.article}`;
    const base = decided.get(key) ?? 0;
    const reserve = 50 * orderStep(articleOf(lot.article));
    const usedUp = base + reserve - (first.storyRests.get(key) ?? 0);
    decided.set(
      key,
      roundQuantity(Math.max(orderStep(articleOf(lot.article)) / 2, usedUp + lot.rest)),
    );
  }
  return { plan, story, decided };
}

export type PreparedDemo = Awaited<ReturnType<typeof prepareDemo>>;

interface Ids {
  staff: Record<StaffKey, Id>;
  areas: Record<AreaKey, Id>;
  spots: Map<string, Id>;
  suppliers: Record<SupplierKey, Id>;
  articles: Map<string, Id>;
  recipes: Map<string, Id>;
}

/** The ledger as the walk's backend: every quantity becomes a movement, booked by its person. */
function ledgerBackend(ctx: AppContext, businessId: Id, ids: Ids): Backend {
  const ledgers = new Map<StaffKey, StockLedger>();
  const ledger = (by: StaffKey): StockLedger => {
    let found = ledgers.get(by);
    if (found === undefined) {
      found = createStockLedger({ ...ctx, actor: ids.staff[by] });
      ledgers.set(by, found);
    }
    return found;
  };
  const articleId = (key: string) => must(ids.articles.get(key), `article ${key}`);
  return {
    newId: () => ctx.ids.next(),
    receive: async (spec) => {
      const lot = await ledger(spec.by).receive({
        businessId,
        articleId: articleId(spec.article),
        areaId: ids.areas[spec.area],
        quantity: spec.quantity,
        pricePer1000: spec.price,
        receivedOn: spec.receivedOn,
        expiresOn: spec.expiresOn,
        dateKind: spec.dateKind,
        lotCode: spec.lotCode,
        supplierId: spec.supplier === undefined ? undefined : ids.suppliers[spec.supplier],
        deliveryId: spec.deliveryId,
        productionId: spec.productionId,
        origin: spec.origin,
        // The prices of the articles are set once at the end, from the last delivery.
        updateArticlePrice: false,
      });
      return lot.id;
    },
    consumeForProduction: async ({ article, quantity, on, productionId, by }) => {
      const result = await ledger(by).consume({
        businessId,
        articleId: articleId(article),
        quantity,
        on,
        purpose: 'production',
        productionId,
      });
      return {
        picks: result.picks.map((pick) => ({
          lotId: pick.lotId,
          quantity: pick.quantity,
          value: pick.valueRappen,
        })),
        missing: result.missing,
      };
    },
    consumeLot: async ({ lot, quantity, on, purpose, note, by }) =>
      (await ledger(by).consumeLot({ businessId, lotId: lot.id, quantity, on, purpose, note }))
        .valueRappen,
    writeOff: async ({ lot, quantity, on, reason, note, by }) =>
      (await ledger(by).writeOff({ businessId, lotId: lot.id, quantity, reason, on, note }))
        .valueRappen,
    adjust: async ({ lot, counted, on, countId, by }) =>
      (await ledger(by).adjust({ businessId, lotId: lot.id, counted, on, countId }))
        .valueDeltaRappen,
  };
}

/** What a component costs per 1000 base units at today's prices, for its opening stock. */
function componentPrices(): Map<string, number> {
  const book: CostBook = {
    articles: new Map(
      ARTICLES.map((article) => [
        article.key as Id,
        {
          id: article.key as Id,
          kind: isComponent(article) ? 'prepared' : 'purchased',
          unit: article.unit,
          pricePer1000: article.price,
          yieldBps: article.yieldBps ?? 10_000,
          recipeId: article.recipe as Id | undefined,
        },
      ]),
    ),
    recipes: new Map(
      RECIPES.map((recipe) => [
        recipe.key as Id,
        {
          id: recipe.key as Id,
          portions: recipe.portions,
          ingredients: recipe.ingredients.map(([key, quantity]) => ({
            articleId: key as Id,
            quantity,
          })),
          output:
            recipe.output === undefined
              ? undefined
              : { articleId: recipe.output[0] as Id, quantity: recipe.output[1] },
        },
      ]),
    ),
  };
  const prices = new Map<string, number>();
  for (const recipe of RECIPES) {
    if (recipe.output !== undefined) {
      const cost = recipeCost(must(book.recipes.get(recipe.key as Id), recipe.key), book);
      prices.set(recipe.output[0], Math.round(cost.totalMilli / recipe.output[1]));
    }
  }
  return prices;
}

/** Adds rows that do not depend on each other in one go, instead of one after the other. */
async function addAll<TRow>(store: { add: (row: TRow) => Promise<void> }, rows: readonly TRow[]) {
  await Promise.all(rows.map((row) => store.add(row)));
}

const monthOf = (date: LocalDate) => YearMonthSchema.parse(date.slice(0, 7));
const daysInMonth = (date: LocalDate) => {
  const [year = 0, month = 1] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
};

/**
 * Builds the «Bistro Beispiel» into an empty business. Runs inside the command's transaction
 * and does nothing but storage calls; `prepared` comes from `prepareDemo` before it.
 */
export async function writeDemo(
  ctx: AppContext,
  business: Business,
  prepared: PreparedDemo,
): Promise<{ business: Business; from: LocalDate; to: LocalDate }> {
  const { storage, clock } = ctx;
  const { stamps } = createCommandKit(ctx);
  const businessId = business.id;
  const { plan } = prepared;
  const today = plan.today;
  const date = (day: number) => dayAt(today, day);
  const base = () => ({ id: ctx.ids.next(), businessId, ...stamps() });
  const random = createRandom(1291);

  // The team: whoever loads the demo stays; four colleagues join.
  const staffIds = {} as Record<StaffKey, Id>;
  for (const member of STAFF) {
    const row = StaffMemberSchema.parse({
      ...base(),
      name: member.name,
      role: member.role,
      active: true,
    });
    await storage.staff.add(row);
    staffIds[member.key] = row.id;
  }

  // Areas: the ones a new business already has are used as they are.
  const existingAreas = alive(await storage.areas.ofBusiness(businessId));
  const existingSpots = alive(await storage.spots.ofBusiness(businessId));
  const areaIds = {} as Record<AreaKey, Id>;
  const spotIds = new Map<string, Id>();
  for (const [index, area] of AREAS.entries()) {
    const known = existingAreas.find((row) => row.kind === area.kind);
    let areaId: Id;
    if (known === undefined) {
      const row = StorageAreaSchema.parse({
        ...base(),
        name: area.name,
        kind: area.kind,
        ...(area.minDeciC === undefined ? {} : { minDeciC: area.minDeciC }),
        ...(area.maxDeciC === undefined ? {} : { maxDeciC: area.maxDeciC }),
        sortOrder: index,
      });
      await storage.areas.add(row);
      areaId = row.id;
    } else {
      areaId = known.id;
    }
    areaIds[area.key] = areaId;
    for (const [spotIndex, spot] of area.spots.entries()) {
      const same = existingSpots.find(
        (row) => row.areaId === areaId && row.name.toLowerCase() === spot.name.toLowerCase(),
      );
      if (same !== undefined) {
        spotIds.set(spot.key, same.id);
        continue;
      }
      const row = StorageSpotSchema.parse({
        ...base(),
        areaId,
        name: spot.name,
        ...(spot.note === undefined ? {} : { note: spot.note }),
        photo: spotPhoto(spot.picture, 97 + index * 13 + spotIndex * 7),
        sortOrder: spotIndex,
      });
      await storage.spots.add(row);
      spotIds.set(spot.key, row.id);
    }
  }

  const supplierIds = {} as Record<SupplierKey, Id>;
  const existingSuppliers = alive(await storage.suppliers.ofBusiness(businessId));
  for (const supplier of SUPPLIERS) {
    const same = existingSuppliers.find(
      (row) => row.name.toLowerCase() === supplier.name.toLowerCase(),
    );
    if (same !== undefined) {
      supplierIds[supplier.key] = same.id;
      continue;
    }
    const row = SupplierSchema.parse({
      ...base(),
      name: supplier.name,
      customerNumber: supplier.customerNumber,
      email: supplier.email,
      orderDays: supplier.orderDays,
      deliveryDays: supplier.deliveryDays,
      ...(supplier.minOrderRappen === undefined ? {} : { minOrderRappen: supplier.minOrderRappen }),
      ...(supplier.kind === undefined ? {} : { kind: supplier.kind }),
      ...(supplier.categoryOrder === undefined
        ? {}
        : { categoryOrder: [...supplier.categoryOrder] }),
      note:
        supplier.kind === 'market'
          ? 'Beispielmarkt des Demo-Betriebs: Name, Kundenkarte und Preise sind erfunden.'
          : 'Beispiellieferant des Demo-Betriebs: Name und Preise sind erfunden.',
    });
    await storage.suppliers.add(row);
    supplierIds[supplier.key] = row.id;
  }

  // Articles and recipes get their ids first: components and recipes point at each other.
  const articleIds = new Map(ARTICLES.map((article) => [article.key, ctx.ids.next()]));
  const recipeIds = new Map(RECIPES.map((recipe) => [recipe.key, ctx.ids.next()]));
  const ids: Ids = {
    staff: staffIds,
    areas: areaIds,
    spots: spotIds,
    suppliers: supplierIds,
    articles: articleIds,
    recipes: recipeIds,
  };
  const articleId = (key: string) => must(articleIds.get(key), `article ${key}`);
  const recipeId = (key: string) => must(recipeIds.get(key), `recipe ${key}`);
  const openingPrices = componentPrices();
  const articleRows = new Map<string, ReturnType<typeof ArticleSchema.parse>>();
  for (const article of ARTICLES) {
    const row = ArticleSchema.parse({
      id: articleId(article.key),
      businessId,
      ...stamps(),
      name: article.name,
      kind: isComponent(article) ? 'prepared' : 'purchased',
      categoryId: article.category,
      unit: article.unit,
      pricePer1000: isComponent(article) ? (openingPrices.get(article.key) ?? 0) : article.price,
      yieldBps: article.yieldBps ?? 10_000,
      allergens: [...(article.allergens ?? [])],
      traces: [...(article.traces ?? [])],
      diet: article.diet,
      ...(article.supplier === undefined ? {} : { supplierId: supplierIds[article.supplier] }),
      ...(article.pack === undefined
        ? {}
        : { packSize: article.pack[0], packLabel: article.pack[1] }),
      ...(article.minStock === undefined ? {} : { minStock: article.minStock }),
      ...(article.targetStock === undefined ? {} : { targetStock: article.targetStock }),
      areaId: areaIds[article.area],
      ...(article.spot === undefined
        ? {}
        : { spotId: must(spotIds.get(article.spot), article.spot) }),
      ...(article.shelfLifeDays === undefined ? {} : { shelfLifeDays: article.shelfLifeDays }),
      dateKind: article.dateKind,
      ...(article.origin === undefined ? {} : { originCountry: article.origin }),
      ...(article.recipe === undefined ? {} : { recipeId: recipeId(article.recipe) }),
      active: true,
    });
    articleRows.set(article.key, row);
  }
  await addAll(storage.articles, [...articleRows.values()]);

  await addAll(
    storage.recipes,
    RECIPES.map((recipe) =>
      RecipeSchema.parse({
        id: recipeId(recipe.key),
        businessId,
        ...stamps(),
        name: recipe.name,
        kind: recipe.kind,
        course: recipe.course,
        ...(recipe.description === undefined ? {} : { description: recipe.description }),
        portions: recipe.portions,
        ingredients: recipe.ingredients.map(([key, quantity, note]) => ({
          articleId: articleId(key),
          quantity,
          ...(note === undefined ? {} : { note }),
        })),
        steps: [...recipe.steps],
        prepMinutes: recipe.prepMinutes,
        ...(recipe.picture === undefined ? {} : { photo: dishPhoto(recipe.picture) }),
        ...(recipe.output === undefined
          ? {}
          : { output: { articleId: articleId(recipe.output[0]), quantity: recipe.output[1] } }),
        ...(recipe.price === undefined ? {} : { priceRappen: recipe.price }),
        vatBps: recipe.vatBps ?? VAT_BPS,
        extraAllergens: [],
        extraTraces: [],
        labels: [...(recipe.labels ?? [])],
        ...(recipe.shelfLifeDays === undefined ? {} : { shelfLifeDays: recipe.shelfLifeDays }),
        active: true,
      }),
    ),
  );

  // The history, through the ledger: every lot and every movement of eight weeks.
  const walk = await walkHistory({
    plan,
    backend: ledgerBackend(ctx, businessId, ids),
    decided: prepared.decided,
    story: prepared.story,
    storyReserve: false,
  });
  await writeHistoryRows(ctx, businessId, plan, walk, ids);

  // Prices of the articles: the last delivery, or for a component the last production.
  const lastPrice = new Map<string, number>();
  for (const delivery of walk.deliveries) {
    for (const line of delivery.lines) {
      lastPrice.set(line.article, line.price);
    }
  }
  for (const production of walk.productions) {
    const output = must(recipeByKey.get(production.recipe)?.output, production.recipe);
    const lot = walk.lots.find((candidate) => candidate.id === production.outputLotId);
    if (lot !== undefined) {
      lastPrice.set(output[0], lot.price);
    }
  }
  for (const [key, price] of lastPrice) {
    const row = must(articleRows.get(key), key);
    if (row.pricePer1000 !== price && price > 0) {
      await storage.articles.put(ArticleSchema.parse({ ...row, pricePer1000: price }));
    }
  }

  await writeSales(ctx, businessId, plan, recipeId);
  await writeTemperatures(ctx, businessId, today, areaIds, staffIds, random);
  await writeHygiene(ctx, businessId, today, areaIds, staffIds);
  for (const card of MENU_CARDS) {
    await storage.menuCards.add(
      MenuCardSchema.parse({
        ...base(),
        name: card.name,
        intro: card.intro,
        sections: card.sections.map((section) => ({
          id: ctx.ids.next(),
          title: section.title,
          recipeIds: section.dishes.map(recipeId),
        })),
        showPrices: true,
        showPhotos: true,
        footer: card.footer,
        published: true,
      }),
    );
  }
  await writePlan(ctx, businessId, plan, recipeId);
  // ADR-0015: the lunch lines, their meals and plates; then the market and the take-away box.
  const lineIds = await writeMenuLines(ctx, businessId);
  await writeLunchPlan(ctx, businessId, plan, recipeId, lineIds);
  await writeMealCounts(ctx, businessId, plan, lineIds);
  await writeWaste(ctx, businessId, plan, lineIds);
  await writeMarket(ctx, businessId, plan.today, {
    market: ids.suppliers.market,
    purchasing: staffIds.noah,
    areas: areaIds,
    articles: articleIds,
  });
  await writeTakeaway(
    ctx,
    businessId,
    plan,
    {
      id: recipeId('caesarToGo'),
      price: must(recipeByKey.get('caesarToGo')?.price, 'price of caesarToGo'),
    },
    articleId('takeawayBox'),
    staffIds.ines,
  );
  await writeOrders(ctx, businessId, plan, walk, ids);
  await writeBudgets(ctx, businessId, plan, walk);

  // A visitor sees every function (ADR-0015), and the setup counts as done.
  const renamed = DEFAULT_BUSINESS_NAMES.includes(business.name);
  const next = BusinessSchema.parse({
    ...business,
    ...(renamed ? { name: DEMO_BUSINESS_NAME } : {}),
    kind: 'bistro',
    targetFoodCostBps: TARGET_FOOD_COST_BPS,
    defaultVatBps: VAT_BPS,
    modules: [...MODULE_IDS],
    setupAt: clock.now(),
    demo: true,
    updatedAt: clock.now(),
  });
  await storage.businesses.put(next);

  return { business: next, from: date(-HISTORY_DAYS), to: date(-1) };
}

/** Delivery notes, production runs and the stock take of the history. */
async function writeHistoryRows(
  ctx: AppContext,
  businessId: Id,
  plan: DemoPlan,
  walk: WalkResult,
  ids: Ids,
) {
  const { storage } = ctx;
  const { stamps } = createCommandKit(ctx);
  const date = (day: number) => dayAt(plan.today, day);
  const articleId = (key: string) => must(ids.articles.get(key), `article ${key}`);
  await addAll(
    storage.deliveries,
    walk.deliveries.map((delivery) =>
      DeliverySchema.parse({
        id: delivery.id,
        businessId,
        ...stamps(),
        supplierId: ids.suppliers[delivery.supplier],
        receivedOn: date(delivery.day),
        documentNumber: delivery.documentNumber,
        lines: delivery.lines.map((line) => ({
          articleId: articleId(line.article),
          lotId: line.lotId,
          areaId: ids.areas[line.area],
          quantity: line.quantity,
          pricePer1000: line.price,
          valueRappen: line.value,
          ...(line.expiresOn === undefined ? {} : { expiresOn: line.expiresOn }),
          ...(line.lotCode === undefined ? {} : { lotCode: line.lotCode }),
        })),
        totalRappen: delivery.lines.reduce((sum, line) => sum + line.value, 0),
        ...(delivery.tempDeciC === undefined ? {} : { tempDeciC: delivery.tempDeciC }),
        checkOk: true,
        receivedBy: ids.staff[delivery.by],
      }),
    ),
  );
  await addAll(
    storage.productions,
    walk.productions.map((production) =>
      ProductionSchema.parse({
        id: production.id,
        businessId,
        ...stamps(),
        recipeId: must(ids.recipes.get(production.recipe), production.recipe),
        portions: production.portions,
        producedOn: date(production.day),
        costRappen: production.cost,
        outputLotId: production.outputLotId,
        shortages: production.shortages.map((shortage) => ({
          articleId: articleId(shortage.article),
          missing: shortage.missing,
        })),
        producedBy: ids.staff[production.by],
      }),
    ),
  );
  for (const count of walk.counts) {
    await storage.counts.add(
      InventoryCountSchema.parse({
        id: count.id,
        businessId,
        ...stamps(),
        countedOn: date(count.day),
        lines: count.lines.map((line) => ({
          lotId: line.lotId,
          articleId: articleId(line.article),
          expected: line.expected,
          counted: line.counted,
          valueDeltaRappen: line.valueDelta,
        })),
        valueDeltaRappen: count.valueDelta,
        countedBy: ids.staff[count.by],
        note: 'Inventur aller Lagerbereiche.',
      }),
    );
  }
}

/** One line per dish and day, as typed from the daily report of the till. */
async function writeSales(
  ctx: AppContext,
  businessId: Id,
  plan: DemoPlan,
  recipeId: (key: string) => Id,
): Promise<void> {
  const { stamps } = createCommandKit(ctx);
  const rows: ReturnType<typeof SaleSchema.parse>[] = [];
  for (let day = -HISTORY_DAYS; day < 0; day += 1) {
    for (const [dish, portions] of must(plan.sales.get(day), 'sales')) {
      // The take-away dish has its own sales and boxes in writeTakeaway.
      if (portions <= 0 || dish === TAKEAWAY_DISH) {
        continue;
      }
      const price = must(recipeByKey.get(dish)?.price, `price of ${dish}`);
      rows.push(
        SaleSchema.parse({
          id: ctx.ids.next(),
          businessId,
          ...stamps(),
          soldOn: dayAt(plan.today, day),
          recipeId: recipeId(dish),
          portions,
          grossRappen: portions * price,
          vatBps: VAT_BPS,
          bookedStock: true,
        }),
      );
    }
  }
  await addAll(ctx.storage.sales, rows);
}

/** Three measurements out of range, each with what was done; a second check follows. */
const INCIDENTS: readonly {
  day: number;
  area: AreaKey;
  evening: boolean;
  deciC: number;
  action: string;
  after: number;
}[] = [
  {
    day: -38,
    area: 'cold',
    evening: true,
    deciC: 68,
    action: 'Tür beim Wareneingang offen gelassen. Nach 30 Minuten nachgemessen, Ware in Ordnung.',
    after: 39,
  },
  {
    day: -17,
    area: 'frozen',
    evening: false,
    deciC: -145,
    action: 'Abtauvorgang lief noch. Nach einer Stunde nachgemessen.',
    after: -195,
  },
  {
    day: -6,
    area: 'station',
    evening: true,
    deciC: 74,
    action:
      'Kühlschublade überladen: Ware umgelagert, Dichtung gereinigt, nach 45 Minuten nachgemessen.',
    after: 42,
  },
];

/** Twice a day for every cooled area, plus the core temperature of the chicken now and then. */
async function writeTemperatures(
  ctx: AppContext,
  businessId: Id,
  today: LocalDate,
  areaIds: Record<AreaKey, Id>,
  staff: Record<StaffKey, Id>,
  random: ReturnType<typeof createRandom>,
): Promise<void> {
  const { storage, clock } = ctx;
  const { stamps } = createCommandKit(ctx);
  const now = clock.now();
  const rows: ReturnType<typeof TemperatureLogSchema.parse>[] = [];
  const log = (fields: Record<string, unknown>) => {
    rows.push(
      TemperatureLogSchema.parse({ id: ctx.ids.next(), businessId, ...stamps(), ...fields }),
    );
  };
  for (let day = -HISTORY_DAYS; day <= 0; day += 1) {
    const on = dayAt(today, day);
    for (const evening of [false, true]) {
      const measuredAt = zurichInstant(on, evening ? 17 : 7, evening ? 30 : 30);
      if (measuredAt > now) {
        continue;
      }
      for (const area of AREAS.filter((entry) => entry.measured)) {
        const incident = INCIDENTS.find(
          (entry) => entry.day === day && entry.area === area.key && entry.evening === evening,
        );
        const normal =
          area.kind === 'frozen'
            ? random.int(-212, -188)
            : random.int(area.kind === 'cold' ? 24 : 30, 44);
        const deciC = incident?.deciC ?? normal;
        const limits = {
          ...(area.minDeciC === undefined ? {} : { minDeciC: area.minDeciC }),
          ...(area.maxDeciC === undefined ? {} : { maxDeciC: area.maxDeciC }),
        };
        const fits = (value: number) =>
          (area.minDeciC === undefined || value >= area.minDeciC) &&
          (area.maxDeciC === undefined || value <= area.maxDeciC);
        log({
          kind: 'storage',
          areaId: areaIds[area.key],
          deciC,
          ...limits,
          ok: fits(deciC),
          ...(incident === undefined ? {} : { action: incident.action }),
          on,
          measuredAt,
          measuredBy: staff[evening ? 'luca' : 'noah'],
        });
        if (incident !== undefined) {
          log({
            kind: 'storage',
            areaId: areaIds[area.key],
            deciC: incident.after,
            ...limits,
            ok: fits(incident.after),
            on,
            measuredAt: zurichInstant(on, evening ? 18 : 8, evening ? 15 : 45),
            measuredBy: staff.mara,
          });
        }
      }
    }
    if (day < 0 && (day + HISTORY_DAYS) % 3 === 1) {
      log({
        kind: 'cooking',
        label: 'Pouletbrust, Kern',
        deciC: random.int(722, 788),
        minDeciC: 700,
        ok: true,
        on,
        measuredAt: zurichInstant(on, 11, 50),
        measuredBy: staff.luca,
      });
    }
  }
  await addAll(storage.temperatureLogs, rows);
}

/** The cleaning plan and who signed it; a few checks are missing, as in every kitchen. */
async function writeHygiene(
  ctx: AppContext,
  businessId: Id,
  today: LocalDate,
  areaIds: Record<AreaKey, Id>,
  staff: Record<StaffKey, Id>,
): Promise<void> {
  const { storage } = ctx;
  const { stamps } = createCommandKit(ctx);
  const cleaners: readonly StaffKey[] = ['luca', 'mara', 'noah'];
  const checks: ReturnType<typeof HygieneCheckSchema.parse>[] = [];
  for (const [taskIndex, task] of HYGIENE_TASKS.entries()) {
    const row = HygieneTaskSchema.parse({
      id: ctx.ids.next(),
      businessId,
      ...stamps(),
      name: task.name,
      ...(task.area === undefined ? {} : { areaId: areaIds[task.area] }),
      frequency: task.frequency,
      ...(task.weekday === undefined ? {} : { weekday: task.weekday }),
      instructions: task.instructions,
      active: true,
    });
    await storage.hygieneTasks.add(row);
    for (let day = -HISTORY_DAYS; day < 0; day += 1) {
      const on = dayAt(today, day);
      const due =
        task.frequency === 'daily' ||
        (task.frequency === 'weekly' && weekdayOf(on) === task.weekday) ||
        // Every four weeks; the last time the freezer was defrosted 17 days ago.
        (task.frequency === 'monthly' && (day + HISTORY_DAYS) % 28 === 11);
      if (!due || task.missed.includes(day)) {
        continue;
      }
      checks.push(
        HygieneCheckSchema.parse({
          id: ctx.ids.next(),
          businessId,
          ...stamps(),
          taskId: row.id,
          on,
          doneAt: zurichInstant(on, task.frequency === 'daily' ? 22 : 15, 10 + taskIndex * 5),
          doneBy: staff[cleaners[(day + HISTORY_DAYS + taskIndex) % cleaners.length] ?? 'luca'],
        }),
      );
    }
  }
  await addAll(storage.hygieneChecks, checks);
}

/** The dinner of the coming week, today included; the lunch lines are in writeLunchPlan. */
async function writePlan(
  ctx: AppContext,
  businessId: Id,
  plan: DemoPlan,
  recipeId: (key: string) => Id,
): Promise<void> {
  const { stamps } = createCommandKit(ctx);
  const rows: ReturnType<typeof PlanEntrySchema.parse>[] = [];
  for (let day = 0; day < 7; day += 1) {
    const on = dayAt(plan.today, day);
    const expected = must(plan.sales.get(day), 'forecast');
    // The lunch lines follow in writeLunchPlan (ADR-0015); here the dinner.
    const entries: [PlanSlot, string, number, string?][] = [
      ...PLAN_SLOTS.flatMap((slot) =>
        slot.dishes.map(([dish, share]): [PlanSlot, string, number] => [slot.slot, dish, share]),
      ),
    ];
    for (const [slot, dish, share, note] of entries) {
      rows.push(
        PlanEntrySchema.parse({
          id: ctx.ids.next(),
          businessId,
          ...stamps(),
          date: on,
          slot,
          recipeId: recipeId(dish),
          portions: Math.max(1, Math.round((expected.get(dish) ?? 1) * share)),
          ...(note === undefined ? {} : { note }),
        }),
      );
    }
  }
  await addAll(ctx.storage.planEntries, rows);
}

/** One order sent and expected today, one draft for what fell below its minimum. */
async function writeOrders(
  ctx: AppContext,
  businessId: Id,
  plan: DemoPlan,
  walk: WalkResult,
  ids: Ids,
): Promise<void> {
  const { stamps } = createCommandKit(ctx);
  const today = plan.today;
  const stock = new Map<string, number>();
  for (const lot of walk.lots) {
    if (
      lot.quantity > 0 &&
      !(lot.dateKind === 'use_by' && lot.expiresOn !== undefined && lot.expiresOn < today)
    ) {
      stock.set(lot.article, roundQuantity((stock.get(lot.article) ?? 0) + lot.quantity));
    }
  }
  const line = (key: string, quantity: number) => ({
    articleId: must(ids.articles.get(key), key),
    quantity,
    pricePer1000: priceOn(articleOf(key), 0),
  });

  const expectedFrom = (['butcher', 'farm', 'fishmonger', 'wholesale', 'bakery'] as const)
    .map((key) => must(supplierByKey.get(key), key))
    .find((supplier) => isDeliveryDay(supplier, today, 0));
  if (expectedFrom !== undefined) {
    let next = 1;
    while (!isDeliveryDay(expectedFrom, today, next) && next < 7) {
      next += 1;
    }
    const fresh = ARTICLES.filter(
      (article) => article.supplier === expectedFrom.key && !keepsLong(article),
    );
    const needed = fresh
      .map((article) => ({
        article,
        need: demandOn(plan.demand, article.key, 0, next) * 1.1 - (stock.get(article.key) ?? 0),
      }))
      .filter((entry) => entry.need > 0);
    const lines = (
      needed.length > 0 ? needed : fresh.slice(0, 1).map((article) => ({ article, need: 0 }))
    )
      .slice(0, 8)
      .map(({ article, need }) =>
        line(article.key, roundUpTo(Math.max(need, orderStep(article)), orderStep(article))),
      );
    let ordered = -1;
    while (!expectedFrom.orderDays.includes(weekdayOf(dayAt(today, ordered))) && ordered > -7) {
      ordered -= 1;
    }
    await ctx.storage.orders.add(
      PurchaseOrderSchema.parse({
        id: ctx.ids.next(),
        businessId,
        ...stamps(),
        supplierId: ids.suppliers[expectedFrom.key],
        status: 'sent',
        lines,
        orderedOn: dayAt(today, ordered),
        expectedOn: today,
      }),
    );
  }

  const low = ARTICLES.filter(
    (article) =>
      article.supplier === 'wholesale' &&
      article.minStock !== undefined &&
      (stock.get(article.key) ?? 0) < article.minStock,
  ).map((article) =>
    line(
      article.key,
      roundUpTo(
        (article.targetStock ?? article.minStock ?? 0) - (stock.get(article.key) ?? 0),
        orderStep(article),
      ),
    ),
  );
  if (low.length > 0) {
    await ctx.storage.orders.add(
      PurchaseOrderSchema.parse({
        id: ctx.ids.next(),
        businessId,
        ...stamps(),
        supplierId: ids.suppliers.wholesale,
        status: 'draft',
        lines: low,
        note: 'Was unter dem Mindestbestand ist, aufgefüllt bis zum Sollbestand.',
      }),
    );
  }
}

/**
 * Budgets of last month and of the running one, set from what the history spent and sold:
 * last month a little under the purchase budget and over the revenue target; this month
 * slightly over the pace of its purchase budget, with the break-even in reach.
 */
async function writeBudgets(
  ctx: AppContext,
  businessId: Id,
  plan: DemoPlan,
  walk: WalkResult,
): Promise<void> {
  const { stamps } = createCommandKit(ctx);
  const today = plan.today;
  const thisMonth = monthOf(today);
  const firstOfMonth = LocalDateSchema.parse(`${thisMonth}-01`);
  const previous = dayAt(firstOfMonth, -1);
  const purchases = new Map<string, number>();
  const covered = new Map<string, number>();
  for (const delivery of walk.deliveries) {
    const month = monthOf(dayAt(today, delivery.day));
    purchases.set(
      month,
      (purchases.get(month) ?? 0) + delivery.lines.reduce((sum, line) => sum + line.value, 0),
    );
  }
  // Revenue net of VAT, each dish at its own rate (the take-away dish has the reduced one).
  const revenue = new Map<string, number>();
  for (let day = -HISTORY_DAYS; day < 0; day += 1) {
    const month = monthOf(dayAt(today, day));
    covered.set(month, (covered.get(month) ?? 0) + 1);
    for (const [dish, portions] of must(plan.sales.get(day), 'sales')) {
      const recipe = must(recipeByKey.get(dish), dish);
      const gross = rappen(portions * must(recipe.price, dish));
      revenue.set(month, (revenue.get(month) ?? 0) + netOfVat(gross, recipe.vatBps ?? VAT_BPS));
    }
  }
  const monthly = (month: string, values: Map<string, number>, length: number) =>
    ((values.get(month) ?? 0) / Math.max(1, covered.get(month) ?? 1)) * length;

  const lastMonth = monthOf(previous);
  const lastLength = daysInMonth(previous);
  const lastPurchases = monthly(lastMonth, purchases, lastLength);
  const lastRevenue = rappen(Math.round(monthly(lastMonth, revenue, lastLength)));
  const share = lastRevenue > 0 ? lastPurchases / lastRevenue : 0.3;
  const fixedCosts = roundToStep(lastRevenue * (1 - share) * 0.95, 50_000);
  const last = {
    month: lastMonth,
    purchaseBudgetRappen: roundToStep(lastPurchases * 1.03, 50_000),
    revenueTargetRappen: roundToStep(lastRevenue * 0.98, 100_000),
  };
  const elapsed = covered.get(thisMonth) ?? 0;
  const length = daysInMonth(today);
  const running =
    elapsed > 0
      ? {
          month: thisMonth,
          purchaseBudgetRappen: roundToStep(monthly(thisMonth, purchases, length) / 1.06, 50_000),
          revenueTargetRappen: roundToStep(
            rappen(Math.round(monthly(thisMonth, revenue, length))) * 1.03,
            100_000,
          ),
        }
      : { ...last, month: thisMonth };
  const rows = [last, running];
  for (const row of rows) {
    await ctx.storage.budgets.add(
      BudgetSchema.parse({
        id: ctx.ids.next(),
        businessId,
        ...stamps(),
        month: row.month,
        purchaseBudgetRappen: row.purchaseBudgetRappen,
        revenueTargetRappen: row.revenueTargetRappen,
        fixedCostsRappen: fixedCosts,
        targetFoodCostBps: TARGET_FOOD_COST_BPS,
        // No goods-per-meal target in the demo until the definition of «Wareneinsatz pro Mahlzeit»
        // is decided (ADR-0015): the cockpit would compare against a number that does not hold.
        note: 'Beispielwerte des Demo-Betriebs.',
      }),
    );
  }
}
