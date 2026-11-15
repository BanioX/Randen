import {
  addDays,
  createStockLedger,
  PlanEntrySchema,
  SupplierSchema,
  type Id,
  type LocalDate,
} from '@randen/core';
import type { Kitchen, TestContext } from '@randen/core/testing';

/** Flour as the acceptance describes it: 3 kg in stock, minimum 5 kg, target 20 kg, sacks of 10 kg. */
export async function flourInSacks(t: TestContext, kitchen: Kitchen) {
  await t.useCases['articles.update']({
    commandId: t.cmd(),
    businessId: t.businessId,
    articleId: kitchen.articles.flour.id,
    minStock: 5000,
    targetStock: 20_000,
    packSize: 10_000,
    packLabel: 'Sack',
  });
}

/** One dish on the menu plan: `portions` of a recipe on a day, at lunch. */
export async function planDish(t: TestContext, recipeId: Id, portions: number, date: LocalDate) {
  const now = t.clock.now();
  await t.storage.planEntries.add(
    PlanEntrySchema.parse({
      id: t.cmd(),
      businessId: t.businessId,
      createdAt: now,
      updatedAt: now,
      date,
      slot: 'lunch',
      recipeId,
      portions,
    }),
  );
}

/** A market with its walk through the halls («Markt Nord»), as the market function uses it. */
export async function addMarket(t: TestContext, name = 'Markt Nord'): Promise<Id> {
  const now = t.clock.now();
  const id = t.cmd();
  await t.storage.suppliers.add(
    SupplierSchema.parse({
      id,
      businessId: t.businessId,
      createdAt: now,
      updatedAt: now,
      name,
      kind: 'market',
      customerNumber: '7001 2233',
      orderDays: [],
      deliveryDays: [],
    }),
  );
  return id;
}

/** A purchase of an article at a price, booked through the ledger (origin: purchase). */
export async function buy(
  t: TestContext,
  kitchen: Kitchen,
  articleId: Id,
  pricePer1000: number,
  receivedOn: LocalDate,
  quantity = 10_000,
) {
  await createStockLedger(t.ctx).receive({
    businessId: t.businessId,
    articleId,
    areaId: kitchen.areas.dry.id,
    quantity,
    pricePer1000,
    receivedOn,
    origin: 'purchase',
  });
}

/** Days from today, as a calendar day of the test kitchen. */
export function daysFrom(t: TestContext, inDays: number): LocalDate {
  return addDays(t.clock.today(), inDays);
}
