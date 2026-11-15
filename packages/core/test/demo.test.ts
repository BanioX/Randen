import { beforeAll, describe, expect, it } from 'vitest';
import {
  addDays,
  alive,
  ALLERGEN_IDS,
  BusinessSchema,
  createUseCases,
  daysBetween,
  declarationOf,
  dishFigures,
  expiryInfo,
  lineValue,
  PhotoSchema,
  rappen,
  recipeCost,
  roundQuantity,
  TABLE_NAMES,
  TABLE_SCHEMAS,
  uuidV7,
  WASTE_REASONS,
  type Article,
  type CostBook,
  type DeclarationBook,
  type Recipe,
  type Tables,
} from '../src';
import { MODULE_IDS } from '../src/domain/business-profiles';
import {
  AREAS,
  ARTICLES,
  DAILY_SPECIALS,
  MARKET_PURCHASES,
  MENU_CARDS,
  MENU_LINES,
  PLAN_SLOTS,
  RECIPES,
  STAFF,
  SUPPLIERS,
  WEEKDAY_FACTOR,
} from '../src/modules/demo/catalogue';
import { prepareDemo } from '../src/modules/demo/build';
import { mirrorBackend, walkHistory } from '../src/modules/demo/engine';
import { must } from '../src/modules/demo/plan';
import { createRandom } from '../src/modules/demo/support';
import type { LocalDate } from '../src/model/primitives';
import { DEMO_CONTENTS } from '../src/modules/demo/use-cases';
import { createTestContext, seedKitchen, type TestContext } from '../src/testing';

const TODAY = '2026-11-14';

async function loaded(
  options: { today?: string; idStart?: number; storage?: TestContext['storage'] } = {},
) {
  const t = await createTestContext({ today: TODAY, ...options });
  const commandId = t.cmd();
  const result = await t.useCases['demo.load']({
    commandId,
    businessId: t.businessId,
    confirm: true,
  });
  return { t, commandId, result };
}

/** Every row of every table of a business, alive or not, keyed by table. */
async function snapshot(t: TestContext) {
  const tables = {} as { [TName in keyof Tables]: Tables[TName][] };
  for (const name of TABLE_NAMES) {
    (tables as Record<string, unknown[]>)[name] = await t.storage[name].ofBusiness(t.businessId);
  }
  return tables;
}

const wallClock = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Zurich',
  dateStyle: 'short',
  timeStyle: 'short',
});

/** A snapshot as text, without budgets, instants on the Swiss wall clock, dates moved by `days`. */
function normalised(tables: Awaited<ReturnType<typeof snapshot>>, days: number) {
  const rest = Object.fromEntries(Object.entries(tables).filter(([name]) => name !== 'budgets'));
  return JSON.parse(
    JSON.stringify(rest)
      .replace(
        /"(\d{4}-\d{2}-\d{2}T[\d:.]+Z)"/g,
        (_match, instant: string) => `"${wallClock.format(new Date(instant))}"`,
      )
      .replace(/\d{4}-\d{2}-\d{2}/g, (match) => addDays(match as never, days))
      // Lot codes carry the day of the delivery too («MM261113-6»).
      .replace(
        /"([A-Z]{2})(\d{2})(\d{2})(\d{2})-/g,
        (_match, prefix: string, yy: string, mm: string, dd: string) =>
          `"${prefix}${addDays(`20${yy}-${mm}-${dd}` as never, days)
            .slice(2)
            .replaceAll('-', '')}-`,
      ),
  ) as unknown;
}

function books(articles: readonly Article[], recipes: readonly Recipe[]) {
  const cost: CostBook = {
    articles: new Map(articles.map((article) => [article.id, article])),
    recipes: new Map(recipes.map((recipe) => [recipe.id, recipe])),
  };
  const declaration: DeclarationBook = {
    articles: new Map(articles.map((article) => [article.id, article])),
    recipes: new Map(recipes.map((recipe) => [recipe.id, recipe])),
  };
  return { cost, declaration };
}

describe('demo.load into an empty business', () => {
  let t: TestContext;
  let result: Awaited<ReturnType<typeof loaded>>['result'];
  let data: Awaited<ReturnType<typeof snapshot>>;
  const byName = <TRow extends { name: string }>(rows: readonly TRow[], name: string) => {
    const row = rows.find((candidate) => candidate.name === name);
    if (row === undefined) {
      throw new Error(`No row «${name}»`);
    }
    return row;
  };

  beforeAll(async () => {
    ({ t, result } = await loaded());
    data = await snapshot(t);
  }, 60_000);

  it('builds the whole kitchen and says how much it holds', async () => {
    expect(result).toMatchObject({
      // The test business has its own name; only the default name is replaced.
      businessName: 'Testküche',
      renamed: false,
      firstDay: '2026-09-19',
      lastDay: '2026-11-13',
    });
    expect(result.counts).toMatchObject({
      areas: 5,
      spots: 14,
      suppliers: 7,
      articles: 50,
      dishes: 11,
      components: 5,
      menuCards: 2,
      staff: 5,
      orders: 2,
      counts: 1,
      budgets: 2,
      marketReceipts: 3,
      menuLines: 2,
      mealCounts: 30,
      wasteWeighings: 22,
      shoppingLines: 5,
    });
    // Eight weeks of a bistro: well over a thousand movements, still a few seconds on a phone.
    expect(result.counts.movements).toBeGreaterThan(2000);
    expect(result.counts.movements).toBeLessThan(6000);
    expect(result.counts.sales).toBe(573);
    const status = await t.useCases['demo.status']({ businessId: t.businessId });
    expect(status).toMatchObject({ demo: true, empty: false, counts: result.counts });
    // What the page promises before loading is what the load brings.
    expect(status.contents).toEqual({
      areas: 5,
      spots: 14,
      suppliers: 7,
      articles: 50,
      dishes: 11,
      components: 5,
      menuCards: 2,
      staff: 4,
      weeks: 8,
      menuLines: 2,
      marketReceipts: 3,
      mealDays: 15,
    });
    const { business } = await t.useCases['business.get']({ businessId: t.businessId });
    expect(business.demo).toBe(true);
    const events = await t.storage.events.ofBusiness(t.businessId);
    expect(events.map((event) => event.type)).toEqual(['demo.loaded']);
    expect(events[0]).toMatchObject({ actor: t.actor, payload: { articles: 50, dishes: 11 } });
  });

  it('writes every row of every table through its schema', () => {
    for (const name of TABLE_NAMES) {
      expect(data[name].length, name).toBeGreaterThan(0);
      for (const row of data[name]) {
        expect(() => TABLE_SCHEMAS[name].parse(row), name).not.toThrow();
        expect(row.businessId).toBe(t.businessId);
      }
    }
  });

  it('keeps the ledger: for every article the lots add up to the movements, in quantity and value', () => {
    const pieces = new Set(
      data.articles.filter((article) => article.unit === 'pcs').map((article) => article.id),
    );
    for (const movement of data.movements.filter((entry) => pieces.has(entry.articleId))) {
      expect(Number.isInteger(movement.quantity), String(movement.quantity)).toBe(true);
    }
    for (const article of data.articles) {
      const lots = data.lots.filter((lot) => lot.articleId === article.id);
      const movements = data.movements.filter((movement) => movement.articleId === article.id);
      const lotQuantity = roundQuantity(lots.reduce((sum, lot) => sum + lot.quantity, 0));
      const movedQuantity = roundQuantity(
        movements.reduce((sum, movement) => sum + movement.quantity, 0),
      );
      expect(movedQuantity, article.name).toBe(lotQuantity);
      const lotValue = lots.reduce(
        (sum, lot) => sum + lineValue(lot.quantity, lot.pricePer1000),
        0,
      );
      const movedValue = movements.reduce((sum, movement) => sum + movement.valueRappen, 0);
      expect(movedValue, article.name).toBe(lotValue);
      expect(movements.length, article.name).toBeGreaterThan(0);
    }
    for (const lot of data.lots) {
      expect(lot.quantity).toBeGreaterThanOrEqual(0);
      // Eggs and loaves are counted whole, in every lot and every movement.
      if (pieces.has(lot.articleId)) {
        expect(Number.isInteger(lot.quantity), String(lot.quantity)).toBe(true);
      }
      expect(lot.status).toBe(lot.quantity > 0 ? 'active' : 'depleted');
      // Each lot's own movements explain it exactly.
      const own = data.movements.filter((movement) => movement.lotId === lot.id);
      expect(roundQuantity(own.reduce((sum, movement) => sum + movement.quantity, 0))).toBe(
        lot.quantity,
      );
    }
  });

  it('books eight weeks in date order, with every kind of movement and every reason', () => {
    const first = addDays(t.clock.today(), -56);
    const yesterday = addDays(t.clock.today(), -1);
    for (const movement of data.movements) {
      expect(movement.on >= first && movement.on <= yesterday, movement.on).toBe(true);
    }
    expect(new Set(data.movements.map((movement) => movement.type))).toEqual(
      new Set(['receipt', 'production', 'consumption', 'waste', 'adjustment']),
    );
    const reasons = new Set(data.movements.map((movement) => movement.reason).filter(Boolean));
    for (const reason of WASTE_REASONS) {
      expect(reasons.has(reason), reason).toBe(true);
    }
    expect(new Set(data.movements.map((movement) => movement.purpose).filter(Boolean))).toEqual(
      new Set(['production', 'sale', 'staff']),
    );
    // People book their own work: the team, not the person who loaded the demo.
    const team = new Set(
      data.staff.filter((member) => member.id !== t.actor).map((member) => member.id),
    );
    expect(data.movements.every((movement) => team.has(movement.actor))).toBe(true);
    // Every consumption of a production carries it, for the traceability of the batch.
    const productions = new Set(data.productions.map((production) => production.id));
    for (const movement of data.movements.filter((entry) => entry.purpose === 'production')) {
      expect(movement.productionId !== undefined && productions.has(movement.productionId)).toBe(
        true,
      );
    }
    // The stock never ran short: service and productions always found what they needed.
    expect(data.productions.every((production) => production.shortages.length === 0)).toBe(true);
  });

  it('delivers on the days of each supplier, with the price change of the butter', () => {
    const suppliers = new Map(data.suppliers.map((supplier) => [supplier.id, supplier]));
    const weekdays = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    for (const delivery of data.deliveries) {
      const supplier =
        delivery.supplierId === undefined ? undefined : suppliers.get(delivery.supplierId);
      const weekday = weekdays[new Date(`${delivery.receivedOn}T12:00:00Z`).getUTCDay()];
      if (supplier?.kind === 'market') {
        // A market has no delivery days: the kitchen goes there itself (ADR-0015).
        expect(delivery.documentNumber, supplier.name).toMatch(/^B-\d+$/);
      } else {
        expect(supplier?.deliveryDays, supplier?.name).toContain(weekday);
      }
      expect(delivery.totalRappen).toBe(
        delivery.lines.reduce((sum, line) => sum + line.valueRappen, 0),
      );
    }
    // Butter: CHF 14.50 per kg until three weeks ago, CHF 15.66 since (8 % dearer).
    const butter = byName(data.articles, 'Butter');
    const prices = data.lots
      .filter((lot) => lot.articleId === butter.id && lot.origin === 'purchase')
      .sort((a, b) => a.receivedOn.localeCompare(b.receivedOn))
      .map((lot) => [
        daysBetween(t.clock.today(), lot.receivedOn) < -21 ? 'before' : 'after',
        lot.pricePer1000,
      ]);
    expect(new Set(prices.filter(([when]) => when === 'before').map(([, price]) => price))).toEqual(
      new Set([1450]),
    );
    expect(new Set(prices.filter(([when]) => when === 'after').map(([, price]) => price))).toEqual(
      new Set([1566]),
    );
    expect(butter.pricePer1000).toBe(1566);
  });

  it('gives every dish a complete declaration with true allergens and origins', () => {
    const { declaration } = books(data.articles, data.recipes);
    const dishes = data.recipes.filter((recipe) => recipe.kind === 'dish');
    expect(dishes).toHaveLength(11);
    for (const dish of dishes) {
      const declared = declarationOf(dish, declaration);
      expect(declared.incomplete, dish.name).toBe(false);
      for (const origin of declared.origins) {
        expect(origin.country, `${dish.name}: ${origin.name}`).toBeDefined();
      }
      expect(dish.photo, dish.name).toBeDefined();
      expect(dish.description, dish.name).toBeDefined();
      expect(dish.steps.length, dish.name).toBeGreaterThanOrEqual(3);
      expect(dish.steps.length, dish.name).toBeLessThanOrEqual(6);
    }
    const declared = (name: string) => declarationOf(byName(dishes, name), declaration);
    expect(declared('Caesar Salad mit Poulet')).toMatchObject({
      // Croûtons, egg yolk, anchovies, cheese, mustard, vinegar.
      allergens: ['gluten', 'eggs', 'fish', 'milk', 'mustard', 'sulphites'],
      diet: 'omnivore',
      origins: [
        { name: 'Pouletbrust', country: 'CH' },
        { name: 'Sardellenfilets in Öl', country: 'ES' },
      ],
    });
    expect(declared('Randen-Carpaccio mit Ziegenkäse')).toMatchObject({
      // The vinaigrette brings mustard and the sulphites of the wine vinegar.
      allergens: ['milk', 'nuts', 'mustard', 'sulphites'],
      diet: 'vegetarian',
      origins: [],
    });
    expect(declared('Entrecôte mit Rotweinjus und Kartoffelstock')).toMatchObject({
      // Through the jus into the veal stock: celery; red wine: sulphites; butter: milk.
      allergens: ['milk', 'celery', 'sulphites'],
      origins: [
        { name: 'Kalbsknochen', country: 'CH' },
        { name: 'Rindsentrecôte', country: 'CH' },
      ],
    });
    expect(declared('Lachs mit Rahmsauce').origins).toEqual([
      expect.objectContaining({ name: 'Lachsfilet', country: 'NO' }),
    ]);
    expect(declared('Risotto mit Steinpilzen')).toMatchObject({
      allergens: ['milk', 'celery', 'sulphites'],
      diet: 'vegetarian',
    });
    expect(declared('Schokoladenmousse')).toMatchObject({
      allergens: ['eggs', 'soy', 'milk'],
      traces: ['nuts'],
      diet: 'vegetarian',
    });
    expect(declared('Älplermagronen mit Apfelmus').diet).toBe('omnivore');
    for (const article of data.articles) {
      for (const id of [...article.allergens, ...article.traces]) {
        expect(ALLERGEN_IDS).toContain(id);
      }
    }
  });

  it('prices every dish completely and spreads the food cost as designed', () => {
    const { cost } = books(data.articles, data.recipes);
    const figures = data.recipes
      .filter((recipe) => recipe.kind === 'dish')
      .map((dish) => {
        const dishCost = recipeCost(dish, cost);
        expect(dishCost.missingPrices, dish.name).toEqual([]);
        return {
          name: dish.name,
          cost: dishCost.perPortionRappen,
          ...dishFigures({
            costPerPortion: dishCost.perPortionRappen,
            priceRappen: dish.priceRappen === undefined ? undefined : rappen(dish.priceRappen),
            vatBps: dish.vatBps,
            targetFoodCostBps: 3000,
          }),
        };
      });
    // Caesar Salad, 10 portions (Romanasalat 1.5 kg net / 94 % yield at CHF 4.80/kg = 765'958
    // thousandths; Pouletbrust 1.5 kg at 34.80 = 5'220'000; 4 Ciabatta at 1.20 = 480'000;
    // Reibkäse 200 g at 24.50 = 490'000; 3 eggs at 0.48 = 144'000; Sardellen 60 g at 68.00 =
    // 408'000; Senf 30 g at 6.80 = 20'400; Rapsöl 3 dl at 3.90 = 117'000; Essig 5 dl at 3.40 =
    // 17'000): 7'662'358 thousandths, CHF 7.66 a portion. CHF 26.00 is CHF 24.05 without
    // 8.1 % VAT: 766 / 2405 = 31.85 %, a little over the 30 % target.
    expect(figures.find((entry) => entry.name === 'Caesar Salad mit Poulet')).toMatchObject({
      cost: 766,
      netRappen: 2405,
      foodCostBps: 3185,
      status: 'watch',
    });
    const statuses = figures.map((entry) => entry.status);
    expect(statuses.filter((status) => status === 'good')).toHaveLength(7);
    // Two of watch: the Caesar of the house and its take-away version with the box in it.
    expect(statuses.filter((status) => status === 'watch')).toHaveLength(2);
    expect(
      figures
        .filter((entry) => entry.status === 'over')
        .map((entry) => entry.name)
        .sort(),
    ).toEqual(['Entrecôte mit Rotweinjus und Kartoffelstock', 'Zürcher Geschnetzeltes mit Rösti']);
    // One dish stands out: the beetroot carpaccio keeps the most of every franc.
    const ranked = [...figures].sort((a, b) => (a.foodCostBps ?? 0) - (b.foodCostBps ?? 0));
    expect(ranked[0]?.name).toBe('Randen-Carpaccio mit Ziegenkäse');
    expect((ranked[1]?.foodCostBps ?? 0) - (ranked[0]?.foodCostBps ?? 0)).toBeGreaterThan(250);
  });

  it('opens on a cockpit with something to do today', () => {
    const today = t.clock.today();
    const statuses = alive(data.lots)
      .filter((lot) => lot.status === 'active')
      .map((lot) => ({ lot, ...expiryInfo(lot.expiresOn, lot.dateKind, today) }));
    expect(statuses.filter((entry) => entry.status === 'today').length).toBeGreaterThanOrEqual(2);
    expect(statuses.filter((entry) => entry.status === 'soon').length).toBeGreaterThanOrEqual(3);
    const expired = statuses.filter((entry) => entry.status === 'expired');
    expect(expired).toHaveLength(1);
    expect(data.articles.find((article) => article.id === expired[0]?.lot.articleId)?.name).toBe(
      'Pouletbrust',
    );
    // Salmon of the last delivery: 1.5 kg to be used today.
    const salmon = byName(data.articles, 'Lachsfilet');
    expect(
      statuses.find((entry) => entry.lot.articleId === salmon.id && entry.status === 'today')?.lot
        .quantity,
    ).toBe(1500);

    const stock = (name: string) => {
      const article = byName(data.articles, name);
      return roundQuantity(
        data.lots
          .filter((lot) => lot.articleId === article.id && lot.status === 'active')
          .reduce((sum, lot) => sum + lot.quantity, 0),
      );
    };
    const below = data.articles
      .filter((article) => article.minStock !== undefined && stock(article.name) < article.minStock)
      .map((article) => article.name)
      .sort();
    expect(below).toEqual(['Rapsöl', 'Weissmehl']);
    expect(stock('Weissmehl')).toBe(3200);
    expect(stock('Risottoreis Carnaroli')).toBe(24_100);

    const todays = data.planEntries.filter((entry) => entry.date === today);
    expect(todays.length).toBeGreaterThanOrEqual(4);
    expect(new Set(todays.map((entry) => entry.slot))).toEqual(new Set(['lunch', 'dinner']));
    expect(todays.every((entry) => entry.productionId === undefined)).toBe(true);
    expect(new Set(data.planEntries.map((entry) => entry.date)).size).toBe(14);

    const sent = data.orders.find((order) => order.status === 'sent');
    expect(sent).toMatchObject({ expectedOn: today });
    const supplier = data.suppliers.find((row) => row.id === sent?.supplierId);
    // 14.11.2026 is a Saturday: the fishmonger delivers.
    expect(supplier?.name).toBe('Comestibles Beispiel');
    const draft = data.orders.find((order) => order.status === 'draft');
    expect(
      draft?.lines
        .map((line) => data.articles.find((article) => article.id === line.articleId)?.name)
        .sort(),
    ).toEqual(['Rapsöl', 'Weissmehl']);
  });

  it('sells with the rhythm of the week: quiet Monday, full Friday and Saturday', () => {
    const portions = new Map<string, number>();
    for (const sale of data.sales) {
      const weekday = new Date(`${sale.soldOn}T12:00:00Z`).getUTCDay();
      portions.set(String(weekday), (portions.get(String(weekday)) ?? 0) + sale.portions);
    }
    const monday = portions.get('1') ?? 0;
    expect(portions.get('5') ?? 0).toBeGreaterThan(monday * 1.5);
    expect(portions.get('6') ?? 0).toBeGreaterThan(monday * 1.5);
    expect(data.sales.every((sale) => sale.recipeId !== undefined)).toBe(true);
    // Every dish is cooked to order: its ingredients leave the stock with the sales.
    expect(data.sales.every((sale) => sale.bookedStock)).toBe(true);
    // One line per dish and day, and one take-away line on each of its 13 days.
    const takeaway = byName(data.recipes, 'Caesar Salad zum Mitnehmen');
    expect(data.sales.filter((sale) => sale.recipeId !== takeaway.id)).toHaveLength(560);
    expect(data.sales.filter((sale) => sale.recipeId === takeaway.id)).toHaveLength(13);
    for (const sale of data.sales) {
      const dish = data.recipes.find((recipe) => recipe.id === sale.recipeId);
      expect(sale.grossRappen).toBe(sale.portions * (dish?.priceRappen ?? 0));
    }
  });

  it('keeps the self-control: two measurements a day, three out of range with an action', () => {
    const storage = data.temperatureLogs.filter((log) => log.kind === 'storage');
    const outside = storage.filter((log) => !log.ok);
    expect(outside).toHaveLength(3);
    for (const log of outside) {
      expect(log.action).toBeDefined();
      expect(log.minDeciC !== undefined || log.maxDeciC !== undefined).toBe(true);
    }
    for (const log of storage) {
      const fits =
        (log.minDeciC === undefined || log.deciC >= log.minDeciC) &&
        (log.maxDeciC === undefined || log.deciC <= log.maxDeciC);
      expect(log.ok).toBe(fits);
      expect(log.on).toBe(log.measuredAt.slice(0, 10));
      expect(log.measuredAt <= t.clock.now()).toBe(true);
    }
    // Three cooled areas, morning and evening for 56 days, the morning of today, three rechecks.
    expect(storage).toHaveLength(3 * 2 * 56 + 3 + 3);
    expect(
      data.temperatureLogs.some(
        (log) => log.kind === 'cooking' && log.label === 'Pouletbrust, Kern',
      ),
    ).toBe(true);

    const daily = data.hygieneTasks.filter((task) => task.frequency === 'daily');
    expect(daily).toHaveLength(3);
    for (const task of daily) {
      const checks = data.hygieneChecks.filter((check) => check.taskId === task.id);
      // Every day of the history, a few missed.
      expect(checks.length).toBeLessThan(56);
      expect(checks.length).toBeGreaterThanOrEqual(53);
    }
    expect(data.hygieneChecks.some((check) => check.on === t.clock.today())).toBe(false);
  });

  it('sets budgets: last month kept, this month a little over pace, the break-even in reach', () => {
    const [last, running] = [...data.budgets].sort((a, b) => a.month.localeCompare(b.month));
    expect(last?.month).toBe('2026-10');
    expect(running?.month).toBe('2026-11');
    const purchases = (month: string) =>
      data.deliveries
        .filter((delivery) => delivery.receivedOn.startsWith(month))
        .reduce((sum, delivery) => sum + delivery.totalRappen, 0);
    expect(purchases('2026-10')).toBeLessThan(last?.purchaseBudgetRappen ?? 0);
    // 13 of 30 days are booked: spent a little more than 13/30 of the budget.
    const pace = ((running?.purchaseBudgetRappen ?? 0) * 13) / 30;
    expect(purchases('2026-11')).toBeGreaterThan(pace);
    expect(purchases('2026-11')).toBeLessThan(pace * 1.12);
    expect(last?.fixedCostsRappen).toBe(running?.fixedCostsRappen);
    // The running month has its goods per meal; the month before had none.
    // Until the definition is decided, no goods-per-meal target is shown (ADR-0015).
    expect(running?.costPerMealRappen).toBeUndefined();
    expect(last?.costPerMealRappen).toBeUndefined();
    // Food cost of last month near the target, so the contribution covers the fixed costs.
    const revenue = data.sales
      .filter((sale) => sale.soldOn.startsWith('2026-10'))
      .reduce((sum, sale) => sum + sale.grossRappen, 0);
    const net = Math.round((revenue * 10_000) / 10_810);
    const share = purchases('2026-10') / net;
    expect(share).toBeGreaterThan(0.26);
    expect(share).toBeLessThan(0.34);
    const breakEven = (last?.fixedCostsRappen ?? 0) / (1 - share);
    expect(net).toBeGreaterThan(breakEven);
    expect(net).toBeLessThan(breakEven * 1.1);
  });

  it('draws every picture as a small, safe SVG and writes no «ß»', () => {
    const photos = [
      ...data.spots.map((spot) => spot.photo),
      ...data.recipes.map((recipe) => recipe.photo),
    ].filter((photo): photo is string => photo !== undefined);
    expect(photos.length).toBe(14 + 11);
    for (const photo of photos) {
      expect(() => PhotoSchema.parse(photo)).not.toThrow();
      expect(photo.startsWith('data:image/svg+xml,')).toBe(true);
      const svg = decodeURIComponent(photo.slice('data:image/svg+xml,'.length));
      expect(svg).not.toMatch(/<script|on[a-z]+=|href|url\(|<image|<foreignObject/i);
      expect(svg.replace('http://www.w3.org/2000/svg', '')).not.toMatch(/https?:|\/\//);
    }
    for (const photo of data.recipes.map((recipe) => recipe.photo ?? '')) {
      expect(photo.length).toBeLessThan(5000);
    }
    for (const photo of data.spots.map((spot) => spot.photo ?? '')) {
      expect(photo.length).toBeLessThan(4000);
    }
    expect(new Set(photos).size).toBe(photos.length);
    const text = JSON.stringify(data);
    expect(text).not.toMatch(/ß/);
    expect(text).not.toMatch(/!/);
    // Names are invented: no real brand of a supermarket, cash & carry or food company.
    for (const brand of [
      'Migros',
      'Coop',
      'Aldi',
      'Lidl',
      'Denner',
      'Metro',
      'Transgourmet',
      'Selgros',
      'Sysco',
      'Nestlé',
      'Emmi',
      'Lindt',
    ]) {
      expect(text.toLowerCase(), brand).not.toContain(brand.toLowerCase());
    }
  });

  it('is a bistro with every function on, set up and marked as the demo', async () => {
    const { business } = await t.useCases['business.get']({ businessId: t.businessId });
    expect(business).toMatchObject({ kind: 'bistro', demo: true, setupAt: t.clock.now() });
    expect(business.modules).toEqual(MODULE_IDS);
  });

  it('buys at Markt Nord: three receipts through the ledger, each adding up to the cent', () => {
    const market = byName(data.suppliers, 'Markt Nord');
    expect(market).toMatchObject({
      kind: 'market',
      customerNumber: 'KK 4471 082',
      orderDays: [],
      deliveryDays: [],
    });
    expect(market.categoryOrder?.slice(0, 3)).toEqual(['vegetables', 'fruit', 'herbs']);
    const today = t.clock.today();
    const receipts = data.deliveries.filter((delivery) => delivery.supplierId === market.id);
    expect(receipts).toHaveLength(MARKET_PURCHASES.length);
    for (const receipt of receipts) {
      const goods = receipt.lines.reduce((sum, line) => sum + line.valueRappen, 0);
      const others = (receipt.otherAmounts ?? []).reduce(
        (sum, amount) => sum + amount.amountRappen,
        0,
      );
      expect(receipt.totalRappen, receipt.documentNumber).toBe(goods);
      expect(receipt.documentTotalRappen, receipt.documentNumber).toBe(goods + others);
      expect(receipt.documentNumber, receipt.documentNumber).toMatch(/^B-\d+$/);
      expect(receipt.receivedOn >= addDays(today, -14) && receipt.receivedOn < today).toBe(true);
      for (const line of receipt.lines) {
        expect(
          data.lots.find((lot) => lot.id === line.lotId),
          receipt.documentNumber,
        ).toMatchObject({ origin: 'purchase', supplierId: market.id, deliveryId: receipt.id });
      }
    }
    const amountKinds = receipts
      .flatMap((receipt) => receipt.otherAmounts ?? [])
      .map((amount) => amount.kind);
    expect(amountKinds).toEqual(expect.arrayContaining(['deposit', 'private', 'deposit_return']));
    const lines = receipts.flatMap((receipt) => receipt.lines);
    expect(lines.some((line) => line.packs === 2)).toBe(true);
    expect(lines.filter((line) => line.promo === true)).toHaveLength(1);
  });

  it('keeps the regular price of an article on a promo', () => {
    const oil = byName(data.articles, 'Olivenöl extra vergine');
    const market = byName(data.suppliers, 'Markt Nord');
    const promo = data.deliveries
      .filter((delivery) => delivery.supplierId === market.id)
      .flatMap((delivery) => delivery.lines)
      .find((line) => line.promo === true);
    expect(promo?.articleId).toBe(oil.id);
    const promoLot = data.lots.find((lot) => lot.id === promo?.lotId);
    expect(promoLot?.pricePer1000).toBeLessThan(oil.pricePer1000);
    // The article still costs what its last regular purchase cost.
    const regular = data.lots
      .filter((lot) => lot.articleId === oil.id && lot.supplierId !== market.id)
      .sort((a, b) => b.receivedOn.localeCompare(a.receivedOn))[0];
    expect(regular?.pricePer1000).toBe(oil.pricePer1000);
  });

  it('sells the take-away salad with 2.6 % VAT and books one box per portion', () => {
    const dish = byName(data.recipes, 'Caesar Salad zum Mitnehmen');
    // 2.6 % only with the separation from dining in (docs/fakten.md, section 3.2): the recipe says so.
    expect(dish.description).toContain('Abgrenzung zum Verzehr vor Ort');
    expect(dish.description).toContain('Normalsatz von 8.1 %');
    const box = byName(data.articles, 'Take-away-Box');
    expect(box).toMatchObject({ categoryId: 'packaging', unit: 'pcs' });
    expect(dish.ingredients.some((ingredient) => ingredient.articleId === box.id)).toBe(true);
    const sales = data.sales.filter((sale) => sale.recipeId === dish.id);
    expect(sales.length).toBeGreaterThan(0);
    for (const sale of sales) {
      expect(sale).toMatchObject({
        vatBps: 260,
        bookedStock: true,
        grossRappen: sale.portions * (dish.priceRappen ?? 0),
      });
      // The box of each portion leaves the stock with its sale: the boxes come from the market.
      const taken = data.movements
        .filter((movement) => movement.saleId === sale.id && movement.articleId === box.id)
        .reduce((sum, movement) => sum - movement.quantity, 0);
      expect(taken, `boxes of ${sale.soldOn}`).toBe(sale.portions);
    }
    const boxes = data.movements.filter(
      (movement) => movement.articleId === box.id && movement.purpose === 'sale',
    );
    expect(-boxes.reduce((sum, movement) => sum + movement.quantity, 0)).toBe(
      sales.reduce((sum, sale) => sum + sale.portions, 0),
    );
  });

  it('gives the lunch two menu lines, and the Vegi dishes are vegetarian by their declaration', () => {
    expect(data.menuLines.map((line) => line.name).sort()).toEqual(['Mittagsmenü', 'Vegi']);
    const vegi = byName(data.menuLines, 'Vegi');
    expect(vegi).toMatchObject({ slot: 'lunch', requiredDiet: 'vegetarian' });
    expect(byName(data.menuLines, 'Mittagsmenü')).toMatchObject({ slot: 'lunch' });
    expect(data.menuLines.every((line) => line.costTargetRappen !== undefined)).toBe(true);
    const { declaration } = books(data.articles, data.recipes);
    const vegiDishes = data.planEntries
      .filter((entry) => entry.lineId === vegi.id)
      .map((entry) => entry.recipeId);
    expect(new Set(vegiDishes).size).toBe(1);
    for (const id of new Set(vegiDishes)) {
      const dish = data.recipes.find((recipe) => recipe.id === id);
      expect(dish?.name).toBe('Risotto mit Steinpilzen');
      expect(declarationOf(must(dish, 'Vegi dish'), declaration).diet).toBe('vegetarian');
    }
    // A bistro has lunch and dinner, no Znüni and no Zvieri; this week and next, lunch has its line.
    expect(new Set(data.planEntries.map((entry) => entry.slot))).toEqual(
      new Set(['lunch', 'dinner']),
    );
    const lunch = data.planEntries.filter((entry) => entry.slot === 'lunch');
    expect(lunch.every((entry) => entry.lineId !== undefined)).toBe(true);
    expect(new Set(lunch.map((entry) => entry.date)).size).toBe(14);
    expect(
      data.planEntries
        .filter((entry) => entry.slot === 'dinner')
        .every((entry) => entry.lineId === undefined),
    ).toBe(true);
  });

  it('counts the lunch meals: served as the sales of the line dish, expected as the plan', () => {
    const today = t.clock.today();
    expect(data.mealCounts).toHaveLength(MENU_LINES.length * 15);
    const dishKeyOf = (line: { name: string }, date: string) =>
      line.name === 'Vegi'
        ? 'risotto'
        : (DAILY_SPECIALS[(new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7] ?? 'alpine');
    for (const count of data.mealCounts) {
      const line = must(
        data.menuLines.find((entry) => entry.id === count.lineId),
        'menu line of a meal count',
      );
      const key = dishKeyOf(line, count.date);
      const dish = byName(
        data.recipes,
        must(
          RECIPES.find((recipe) => recipe.key === key),
          key,
        ).name,
      );
      expect(count.expected, `${line.name} ${count.date}`).toBeGreaterThan(0);
      if (count.served === undefined) {
        // Today is still open: only the expectation, the one of the plan.
        expect(count.date).toBe(today);
        expect(
          data.planEntries.find((entry) => entry.date === today && entry.lineId === line.id)
            ?.portions,
        ).toBe(count.expected);
      } else {
        const sold = data.sales
          .filter((sale) => sale.soldOn === count.date && sale.recipeId === dish.id)
          .reduce((sum, sale) => sum + sale.portions, 0);
        expect(count.served, `${line.name} ${count.date}`).toBe(sold);
      }
    }
  });

  it('keeps the dishes of the lunch lines off the evening card and the dinner plan', () => {
    // A sale has no slot: a lunch dish that is also on the evening card would count its evening
    // portions as lunch meals. So the dishes of the lines are not served in the evening.
    const weekdays = Object.keys(WEEKDAY_FACTOR) as (keyof typeof WEEKDAY_FACTOR)[];
    const lunch = new Set(MENU_LINES.flatMap((line) => weekdays.map((day) => line.dishOn(day))));
    expect([...lunch].sort()).toEqual(['alpine', 'geschnetzeltes', 'risotto', 'salmon']);
    const evening = must(
      MENU_CARDS.find((card) => card.name === 'Abendkarte'),
      'evening card',
    );
    const onEvening = evening.sections.flatMap((section) => section.dishes);
    const dinner = PLAN_SLOTS.filter((slot) => slot.slot === 'dinner').flatMap((slot) =>
      slot.dishes.map(([dish]) => dish),
    );
    const dinnerRecipes = new Set(
      data.planEntries.filter((entry) => entry.slot === 'dinner').map((entry) => entry.recipeId),
    );
    for (const dish of lunch) {
      expect(onEvening, dish).not.toContain(dish);
      expect(dinner, dish).not.toContain(dish);
      const recipe = byName(
        data.recipes,
        must(
          RECIPES.find((row) => row.key === dish),
          dish,
        ).name,
      );
      expect(dinnerRecipes.has(recipe.id), dish).toBe(false);
    }
  });

  it('weighs the plates: 20 to 50 grams for every meal served, and the counter twice', () => {
    const plates = data.wasteWeighings.filter((weighing) => weighing.kind === 'plate');
    expect(plates).toHaveLength(MENU_LINES.length * 10);
    expect(new Set(plates.map((plate) => plate.date)).size).toBe(10);
    for (const plate of plates) {
      expect(plate).toMatchObject({ slot: 'lunch' });
      const count = data.mealCounts.find(
        (entry) => entry.date === plate.date && entry.lineId === plate.lineId,
      );
      const served = count?.served ?? 0;
      expect(served, plate.date).toBeGreaterThan(0);
      expect(plate.grams / served, plate.date).toBeGreaterThanOrEqual(20);
      expect(plate.grams / served, plate.date).toBeLessThanOrEqual(50);
    }
    expect(data.wasteWeighings.filter((weighing) => weighing.kind === 'serving')).toHaveLength(2);
  });

  it('opens the shopping list for the next visit with a free text, a missing and two proposals', () => {
    const market = byName(data.suppliers, 'Markt Nord');
    const lines = data.shoppingLines;
    expect(lines.length).toBeGreaterThanOrEqual(4);
    expect(lines.length).toBeLessThanOrEqual(6);
    expect(
      lines.every((line) => line.supplierId === market.id && line.deliveryId === undefined),
    ).toBe(true);
    expect(lines.filter((line) => line.text === 'Servietten')).toHaveLength(1);
    const missing = lines.filter((line) => line.source === 'missing');
    expect(missing).toHaveLength(1);
    const article = data.articles.find((entry) => entry.id === missing[0]?.articleId);
    const stock = roundQuantity(
      data.lots
        .filter((lot) => lot.articleId === article?.id && lot.status === 'active')
        .reduce((sum, lot) => sum + lot.quantity, 0),
    );
    expect(article?.minStock).toBeGreaterThan(stock);
    expect(lines.filter((line) => line.source === 'proposal')).toHaveLength(2);
    expect(lines.filter((line) => line.source === 'proposal' && line.checked)).toHaveLength(1);
  });

  it('is the only business that sees it', async () => {
    const other = await createTestContext({ storage: t.storage, idStart: 900_000 });
    const status = await other.useCases['demo.status']({ businessId: other.businessId });
    expect(status).toMatchObject({ empty: true, demo: false });
    expect(status.counts).toMatchObject({ articles: 0, lots: 0, movements: 0, staff: 1 });
    expect(await other.storage.movements.ofBusiness(other.businessId)).toEqual([]);
  });
});

describe('the first walk of the history', () => {
  it('buys for every dish, the take-away salad included: only the market boxes are not in the walk', async () => {
    // The walk decides what the kitchen buys. A dish whose ingredients it does not cover is short
    // on the day; only the boxes come from the market after the walk, and they are booked per sale.
    const prepared = await prepareDemo(TODAY as LocalDate);
    const walk = await walkHistory({
      plan: prepared.plan,
      backend: mirrorBackend(),
      decided: prepared.decided,
      story: prepared.story,
      storyReserve: false,
    });
    expect(walk.shortages.filter((shortage) => shortage.article !== 'takeawayBox')).toEqual([]);
  });
});

describe('demo.status', () => {
  it('promises what the catalogue holds', () => {
    expect(DEMO_CONTENTS).toEqual({
      areas: AREAS.length,
      spots: AREAS.reduce((sum, area) => sum + area.spots.length, 0),
      suppliers: SUPPLIERS.length,
      articles: ARTICLES.length,
      dishes: RECIPES.filter((recipe) => recipe.kind === 'dish').length,
      components: RECIPES.filter((recipe) => recipe.kind === 'component').length,
      menuCards: MENU_CARDS.length,
      staff: STAFF.length,
      weeks: 8,
      menuLines: MENU_LINES.length,
      marketReceipts: MARKET_PURCHASES.length,
      mealDays: 15,
    });
  });
});

describe('demo.load, more cases', () => {
  it('repeats harmlessly with the same commandId', async () => {
    const { t, commandId, result } = await loaded();
    const movements = (await t.storage.movements.ofBusiness(t.businessId)).length;
    expect(
      await t.useCases['demo.load']({ commandId, businessId: t.businessId, confirm: true }),
    ).toEqual(result);
    expect(await t.storage.movements.ofBusiness(t.businessId)).toHaveLength(movements);
    expect(await t.storage.events.ofBusiness(t.businessId)).toHaveLength(1);
    // A new command is refused: the business is not empty any more.
    await expect(
      t.useCases['demo.load']({ commandId: t.cmd(), businessId: t.businessId, confirm: true }),
    ).rejects.toMatchObject({ code: 'not_allowed' });
  }, 30_000);

  it('clears every table of the demo business, the new ones included', async () => {
    const { t } = await loaded();
    expect((await snapshot(t)).shoppingLines.length).toBeGreaterThan(0);
    await t.useCases['demo.clear']({ commandId: t.cmd(), businessId: t.businessId, confirm: true });
    const after = await snapshot(t);
    for (const name of TABLE_NAMES) {
      expect(after[name], name).toEqual([]);
    }
    expect(await t.storage.businesses.get(t.businessId)).toBeUndefined();
  }, 30_000);

  it('builds the same kitchen for the same day', async () => {
    const one = await loaded();
    const two = await loaded();
    expect(await snapshot(two.t)).toEqual(await snapshot(one.t));
  }, 30_000);

  it('builds the same kitchen whatever ids the device hands out', async () => {
    // Ids of the device are random UUIDv7s, not counting up: FEFO breaks ties of the same day by
    // id, so the kitchen must not depend on them (the lots of one delivery day keep their order).
    const one = await loaded();
    const two = await createTestContext({ today: TODAY });
    const random = createRandom(5);
    const ids = {
      next: () =>
        uuidV7(
          1_800_000_000_000,
          Uint8Array.from({ length: 10 }, () => random.int(0, 255)),
        ),
    };
    await createUseCases({ ...two.ctx, ids })['demo.load']({
      commandId: two.cmd(),
      businessId: two.businessId,
      confirm: true,
    });
    expect(await snapshot(two)).toEqual(await snapshot(one.t));
  }, 60_000);

  it('loads into two businesses of one storage without a shared id', async () => {
    const first = await loaded();
    const second = await createTestContext({
      storage: first.t.storage,
      today: TODAY,
      idStart: 1_000_000,
    });
    await second.useCases['demo.load']({
      commandId: second.cmd(),
      businessId: second.businessId,
      confirm: true,
    });
    const one = await snapshot(first.t);
    const two = await snapshot(second);
    expect(two.articles.length).toBe(one.articles.length);
    const ids = [...Object.values(one), ...Object.values(two)].flat().map((row) => row.id);
    expect(new Set(ids).size).toBe(ids.length);
  }, 60_000);

  it('moves every date with the day it is loaded on', async () => {
    const one = await loaded();
    // A week later the weekdays are the same: everything is the same, a week later. Instants
    // are compared on the Swiss wall clock (the end of summer time moves them in UTC), budgets
    // follow the calendar months and are checked on their own.
    const later = await loaded({ today: '2026-11-21' });
    expect(normalised(await snapshot(later.t), -7)).toEqual(normalised(await snapshot(one.t), 0));
    expect(
      (await later.t.storage.budgets.ofBusiness(later.t.businessId)).map((row) => row.month).sort(),
    ).toEqual(['2026-10', '2026-11']);
    // Three days later the weekdays differ, and the story of today holds all the same.
    const tuesday = await loaded({ today: '2026-11-17' });
    expect(tuesday.result).toMatchObject({ firstDay: '2026-09-22', lastDay: '2026-11-16' });
    const lots = alive(await tuesday.t.storage.lots.ofBusiness(tuesday.t.businessId)).filter(
      (lot) => lot.status === 'active',
    );
    const states = lots.map(
      (lot) => expiryInfo(lot.expiresOn, lot.dateKind, tuesday.t.clock.today()).status,
    );
    expect(states.filter((state) => state === 'today').length).toBeGreaterThanOrEqual(2);
    expect(states.filter((state) => state === 'expired')).toHaveLength(1);
    const orders = await tuesday.t.storage.orders.ofBusiness(tuesday.t.businessId);
    const suppliers = await tuesday.t.storage.suppliers.ofBusiness(tuesday.t.businessId);
    const sent = orders.find((order) => order.status === 'sent');
    // On a Tuesday the butcher delivers.
    expect(suppliers.find((row) => row.id === sent?.supplierId)?.name).toBe('Metzgerei Muster');
  }, 60_000);

  it('renames a business that still has its first name, and uses the areas it has', async () => {
    const t = await createTestContext({ today: TODAY });
    const business = await t.storage.businesses.get(t.businessId);
    await t.storage.businesses.put(
      BusinessSchema.parse({ ...business, name: 'Mein Betrieb', targetFoodCostBps: 2500 }),
    );
    // A new business comes with its three areas (see ensureLocalBusiness).
    const now = t.clock.now();
    const cold = {
      id: t.cmd(),
      businessId: t.businessId,
      name: 'Kühlraum',
      kind: 'cold' as const,
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    };
    await t.storage.areas.add(TABLE_SCHEMAS.areas.parse({ ...cold, minDeciC: 0, maxDeciC: 50 }));
    const result = await t.useCases['demo.load']({
      commandId: t.cmd(),
      businessId: t.businessId,
      confirm: true,
    });
    expect(result).toMatchObject({ businessName: 'Bistro Beispiel', renamed: true });
    const { business: renamed } = await t.useCases['business.get']({ businessId: t.businessId });
    expect(renamed).toMatchObject({ name: 'Bistro Beispiel', targetFoodCostBps: 3000, demo: true });
    const areas = alive(await t.storage.areas.ofBusiness(t.businessId));
    expect(areas).toHaveLength(5);
    // The cold room the business had is the demo's Kühlzelle, under its own name.
    expect(areas.filter((area) => area.kind === 'cold')).toEqual([
      expect.objectContaining({ id: cold.id, name: 'Kühlraum' }),
    ]);
    const lots = await t.storage.lots.ofBusiness(t.businessId);
    expect(lots.some((lot) => lot.areaId === cold.id)).toBe(true);
  }, 30_000);

  it('loads only into an empty business', async () => {
    const t = await createTestContext({ today: TODAY });
    await seedKitchen(t);
    const status = await t.useCases['demo.status']({ businessId: t.businessId });
    expect(status).toMatchObject({ empty: false, demo: false, businessName: 'Testküche' });
    expect(status.counts).toMatchObject({ articles: 10, dishes: 2, components: 1, lots: 10 });
    await expect(
      t.useCases['demo.load']({ commandId: t.cmd(), businessId: t.businessId, confirm: true }),
    ).rejects.toMatchObject({ code: 'not_allowed' });
    expect(await t.storage.events.ofBusiness(t.businessId)).toEqual([]);
    expect(alive(await t.storage.articles.ofBusiness(t.businessId))).toHaveLength(10);
  });

  it('writes nothing when the business changes while the demo is being built', async () => {
    const t = await createTestContext({ today: TODAY });
    const commands = t.storage.commands;
    let asked = 0;
    // The command log is asked once before the build and once inside the transaction: between
    // the two, somebody adds a supplier on the same device.
    t.storage.commands = {
      ...commands,
      find: async (commandId) => {
        asked += 1;
        if (asked === 2) {
          const now = t.clock.now();
          await t.storage.suppliers.add(
            TABLE_SCHEMAS.suppliers.parse({
              id: t.cmd(),
              businessId: t.businessId,
              name: 'Neuer Lieferant',
              orderDays: [],
              deliveryDays: [],
              createdAt: now,
              updatedAt: now,
            }),
          );
        }
        return commands.find(commandId);
      },
    };
    const useCases = createUseCases({ ...t.ctx, storage: t.storage });
    await expect(
      useCases['demo.load']({ commandId: t.cmd(), businessId: t.businessId, confirm: true }),
    ).rejects.toMatchObject({ code: 'invalid' });
    expect(await t.storage.articles.ofBusiness(t.businessId)).toEqual([]);
    expect(await t.storage.movements.ofBusiness(t.businessId)).toEqual([]);
  });

  it('asks for a confirmation and a business that exists', async () => {
    const t = await createTestContext({ today: TODAY });
    await expect(
      t.useCases['demo.load']({
        commandId: t.cmd(),
        businessId: t.businessId,
        confirm: false as never,
      }),
    ).rejects.toThrow();
    await expect(t.useCases['demo.status']({ businessId: t.cmd() })).rejects.toMatchObject({
      code: 'not_found',
    });
    await expect(
      t.useCases['demo.load']({ commandId: t.cmd(), businessId: t.cmd(), confirm: true }),
    ).rejects.toMatchObject({ code: 'not_found' });
    await expect(
      t.useCases['demo.clear']({ commandId: t.cmd(), businessId: t.cmd(), confirm: true }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('demo.clear', () => {
  it('removes a demo business for good and leaves the others alone', async () => {
    const { t } = await loaded();
    const other = await createTestContext({ storage: t.storage, idStart: 900_000 });
    const commandId = t.cmd();
    expect(
      await t.useCases['demo.clear']({ commandId, businessId: t.businessId, confirm: true }),
    ).toEqual({
      cleared: true,
    });
    expect(await t.storage.businesses.get(t.businessId)).toBeUndefined();
    for (const name of TABLE_NAMES) {
      expect(await t.storage[name].ofBusiness(t.businessId), name).toEqual([]);
    }
    // The log keeps that the demo was removed.
    expect((await t.storage.events.ofBusiness(t.businessId)).map((event) => event.type)).toEqual([
      'demo.cleared',
    ]);
    // Repeating the command is harmless.
    expect(
      await t.useCases['demo.clear']({ commandId, businessId: t.businessId, confirm: true }),
    ).toEqual({
      cleared: true,
    });
    expect(await other.storage.staff.ofBusiness(other.businessId)).toHaveLength(1);
  }, 30_000);

  it('refuses a business with its own data', async () => {
    const t = await createTestContext({ today: TODAY });
    await seedKitchen(t);
    await expect(
      t.useCases['demo.clear']({ commandId: t.cmd(), businessId: t.businessId, confirm: true }),
    ).rejects.toMatchObject({ code: 'not_allowed' });
    expect(alive(await t.storage.articles.ofBusiness(t.businessId))).toHaveLength(10);
    expect(await t.storage.events.ofBusiness(t.businessId)).toEqual([]);
  });
});
