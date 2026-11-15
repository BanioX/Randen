import {
  CommandError,
  createCommandKit,
  type AppContext,
  type UseCase,
} from '../../application/command';
import { CONTRACT_V1 } from '../../contract';
import type { Id } from '../../ids';
import type { LocalDate } from '../../model/primitives';
import {
  alive,
  TABLE_NAMES,
  type RecordStore,
  type Storage,
  type TableName,
} from '../../ports/storage';
import type { DemoContents, DemoCounts } from './contract';
import { createScratchStorage } from './scratch-storage';
import { counterIds } from './support';

/**
 * What the demo brings; the same every day. Kept here as numbers so the app does not load the
 * whole demo to show its page; a test holds them to the catalogue.
 */
export const DEMO_CONTENTS: DemoContents = {
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
};

interface Row {
  id: Id;
  businessId: Id;
}

/**
 * Adds rows of one table, all at once: they do not depend on each other. The rows were read
 * from the same table of another storage, so they fit it.
 */
async function addRows(to: Storage, name: TableName, rows: readonly Row[]): Promise<void> {
  const store = to[name] as unknown as RecordStore<Row>;
  await Promise.all(rows.map((row) => store.add(row)));
}

/** Counts what the business holds, for the demo page and the event of a load. */
async function countsOf(storage: Storage, businessId: Id) {
  const [
    areas,
    spots,
    suppliers,
    articles,
    lots,
    movements,
    deliveries,
    productions,
    recipes,
    sales,
    menuCards,
    planEntries,
    menuLines,
    mealCounts,
    wasteWeighings,
    shoppingLines,
    temperatureLogs,
    hygieneChecks,
    staff,
    orders,
    counts,
    budgets,
  ] = await Promise.all([
    storage.areas.ofBusiness(businessId),
    storage.spots.ofBusiness(businessId),
    storage.suppliers.ofBusiness(businessId),
    storage.articles.ofBusiness(businessId),
    storage.lots.ofBusiness(businessId),
    storage.movements.ofBusiness(businessId),
    storage.deliveries.ofBusiness(businessId),
    storage.productions.ofBusiness(businessId),
    storage.recipes.ofBusiness(businessId),
    storage.sales.ofBusiness(businessId),
    storage.menuCards.ofBusiness(businessId),
    storage.planEntries.ofBusiness(businessId),
    storage.menuLines.ofBusiness(businessId),
    storage.mealCounts.ofBusiness(businessId),
    storage.wasteWeighings.ofBusiness(businessId),
    storage.shoppingLines.ofBusiness(businessId),
    storage.temperatureLogs.ofBusiness(businessId),
    storage.hygieneChecks.ofBusiness(businessId),
    storage.staff.ofBusiness(businessId),
    storage.orders.ofBusiness(businessId),
    storage.counts.ofBusiness(businessId),
    storage.budgets.ofBusiness(businessId),
  ]);
  const liveRecipes = alive(recipes);
  const liveLots = alive(lots);
  const liveDeliveries = alive(deliveries);
  const markets = new Set(
    alive(suppliers)
      .filter((supplier) => supplier.kind === 'market')
      .map((supplier) => supplier.id),
  );
  let firstDay: LocalDate | undefined;
  let lastDay: LocalDate | undefined;
  for (const movement of movements) {
    if (firstDay === undefined || movement.on < firstDay) {
      firstDay = movement.on;
    }
    if (lastDay === undefined || movement.on > lastDay) {
      lastDay = movement.on;
    }
  }
  const result: DemoCounts = {
    areas: alive(areas).length,
    spots: alive(spots).length,
    suppliers: alive(suppliers).length,
    articles: alive(articles).length,
    lots: liveLots.filter((lot) => lot.status === 'active').length,
    movements: movements.length,
    deliveries: liveDeliveries.length,
    marketReceipts: liveDeliveries.filter(
      (delivery) => delivery.supplierId !== undefined && markets.has(delivery.supplierId),
    ).length,
    productions: alive(productions).length,
    dishes: liveRecipes.filter((recipe) => recipe.kind === 'dish').length,
    components: liveRecipes.filter((recipe) => recipe.kind === 'component').length,
    sales: alive(sales).length,
    menuCards: alive(menuCards).length,
    planEntries: alive(planEntries).length,
    menuLines: alive(menuLines).length,
    mealCounts: alive(mealCounts).length,
    wasteWeighings: alive(wasteWeighings).length,
    shoppingLines: alive(shoppingLines).length,
    temperatureLogs: alive(temperatureLogs).length,
    hygieneChecks: alive(hygieneChecks).length,
    staff: alive(staff).length,
    orders: alive(orders).length,
    counts: alive(counts).length,
    budgets: alive(budgets).length,
  };
  return {
    counts: result,
    empty: alive(articles).length === 0 && liveRecipes.length === 0 && liveLots.length === 0,
    ...(firstDay === undefined ? {} : { firstDay }),
    ...(lastDay === undefined ? {} : { lastDay }),
  };
}

/** Use cases of the demo business: what it holds, loading it, clearing it. */
export function createDemoUseCases(ctx: AppContext) {
  const { storage, clock } = ctx;
  const { emit, runCommand } = createCommandKit(ctx);

  async function business(businessId: Id) {
    const row = await storage.businesses.get(businessId);
    if (row === undefined) {
      throw new CommandError('not_found', `Business ${businessId} not found`);
    }
    return row;
  }

  const status: UseCase<'demo.status'> = async (raw) => {
    const input = CONTRACT_V1['demo.status'].input.parse(raw);
    const row = await business(input.businessId);
    const found = await countsOf(storage, input.businessId);
    return { businessName: row.name, demo: row.demo === true, contents: DEMO_CONTENTS, ...found };
  };

  /** True when the business has no articles, recipes or lots: the demo may go in. */
  async function isEmpty(businessId: Id) {
    const [articles, recipes, lots] = await Promise.all([
      storage.articles.ofBusiness(businessId),
      storage.recipes.ofBusiness(businessId),
      storage.lots.ofBusiness(businessId),
    ]);
    return alive(articles).length === 0 && alive(recipes).length === 0 && alive(lots).length === 0;
  }

  const load: UseCase<'demo.load'> = async (raw) => {
    const input = CONTRACT_V1['demo.load'].input.parse(raw);
    const done = await storage.commands.find(input.commandId);
    // The kitchen is built before the transaction, through the stock ledger on a scratch copy
    // of the business in memory: eight weeks are thousands of bookings, and a phone's database
    // answers each one with a delay. The transaction then only writes the finished rows, like
    // restoring a backup (ADR-0007 holds: every lot and movement comes from the ledger).
    const staged = done === undefined ? await stage(input.businessId) : undefined;
    return runCommand('demo.load', input.commandId, async () => {
      const row = await business(input.businessId);
      if (row.demo === true || !(await isEmpty(input.businessId))) {
        throw new CommandError('not_allowed', 'The demo loads only into an empty business');
      }
      if (staged === undefined || !(await unchanged(staged.before))) {
        throw new CommandError('invalid', 'The business changed while the demo was prepared');
      }
      await Promise.all(
        TABLE_NAMES.map((name) =>
          copyNew(staged.storage, name, input.businessId, staged.before.ids),
        ),
      );
      await storage.businesses.put(staged.business);
      const after = await countsOf(staged.storage, input.businessId);
      await emit(input.businessId, 'demo.loaded', { ...after.counts });
      return {
        businessName: staged.business.name,
        renamed: staged.business.name !== row.name,
        counts: after.counts,
        firstDay: staged.from,
        lastDay: staged.to,
      };
    });
  };

  /** What the business holds before the demo: every row, to copy and to compare. */
  async function existing(businessId: Id) {
    const tables = await Promise.all(
      TABLE_NAMES.map(async (name) => ({ name, rows: await storage[name].ofBusiness(businessId) })),
    );
    return {
      businessId,
      tables,
      ids: new Set<string>(tables.flatMap(({ rows }) => rows.map((row) => row.id))),
      text: JSON.stringify(tables),
    };
  }

  /** The business has not changed since the demo was staged for it. */
  async function unchanged(before: Awaited<ReturnType<typeof existing>>) {
    return (await existing(before.businessId)).text === before.text;
  }

  /**
   * Builds the demo on a copy of the business in memory, with the same clock. Its ids count up
   * instead of coming from the device: FEFO breaks ties of the same day by id, so the kitchen
   * must not depend on the random ids of the app (the walk on the mirror counts up too).
   */
  async function stage(businessId: Id) {
    const row = await business(businessId);
    if (row.demo === true || !(await isEmpty(businessId))) {
      throw new CommandError('not_allowed', 'The demo loads only into an empty business');
    }
    const { prepareDemo, writeDemo } = await import('./build');
    const before = await existing(businessId);
    const scratch = createScratchStorage();
    await scratch.businesses.add(row);
    for (const { name, rows } of before.tables) {
      await addRows(scratch, name, rows);
    }
    const prepared = await prepareDemo(clock.today());
    const ids = { next: counterIds(businessId) };
    const written = await writeDemo({ ...ctx, storage: scratch, ids }, row, prepared);
    return { storage: scratch, before, ...written };
  }

  /** Copies the new rows of one table from the scratch copy into the business. */
  async function copyNew(
    from: Storage,
    name: TableName,
    businessId: Id,
    known: ReadonlySet<string>,
  ) {
    const rows = await from[name].ofBusiness(businessId);
    await addRows(
      storage,
      name,
      rows.filter((row) => !known.has(row.id)),
    );
  }

  const clear: UseCase<'demo.clear'> = async (raw) => {
    const input = CONTRACT_V1['demo.clear'].input.parse(raw);
    return runCommand('demo.clear', input.commandId, async () => {
      const row = await business(input.businessId);
      if (row.demo !== true) {
        throw new CommandError('not_allowed', 'Only a demo business can be cleared here');
      }
      await storage.purge(input.businessId);
      // After the purge, so the log keeps that the demo was removed.
      await emit(input.businessId, 'demo.cleared', { businessName: row.name });
      return { cleared: true as const };
    });
  };

  return { 'demo.status': status, 'demo.load': load, 'demo.clear': clear };
}
