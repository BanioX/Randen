import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  addDays,
  alive,
  CommandError,
  createStockLedger,
  lineValue,
  roundQuantity,
  type Id,
} from '../src';
import { createTestContext, seedKitchen, type TestContext } from '../src/testing';

async function setup() {
  const t = await createTestContext();
  const kitchen = await seedKitchen(t);
  return { t, kitchen, ledger: createStockLedger(t.ctx), today: t.clock.today() };
}

/** For every article: the lots add up to the ledger, in quantity and in value. */
async function expectLedgerBalanced(t: TestContext) {
  const lots = alive(await t.storage.lots.ofBusiness(t.businessId));
  const movements = await t.storage.movements.ofBusiness(t.businessId);
  const articleIds = new Set<Id>([...lots, ...movements].map((row) => row.articleId));
  for (const articleId of articleIds) {
    const ofArticle = lots.filter((lot) => lot.articleId === articleId);
    const moved = movements.filter((movement) => movement.articleId === articleId);
    expect(roundQuantity(ofArticle.reduce((sum, lot) => sum + lot.quantity, 0))).toBe(
      roundQuantity(moved.reduce((sum, movement) => sum + movement.quantity, 0)),
    );
    expect(ofArticle.reduce((sum, lot) => sum + lineValue(lot.quantity, lot.pricePer1000), 0)).toBe(
      moved.reduce((sum, movement) => sum + movement.valueRappen, 0),
    );
  }
}

describe('stock ledger', () => {
  it('receives goods as a lot with a receipt, and remembers the price on the article', async () => {
    const { t, kitchen, ledger, today } = await setup();
    const lot = await ledger.receive({
      businessId: t.businessId,
      articleId: kitchen.articles.butter.id,
      areaId: kitchen.areas.cold.id,
      quantity: 5000,
      pricePer1000: 1500,
      receivedOn: today,
      expiresOn: addDays(today, 40),
      origin: 'purchase',
    });
    expect(lot).toMatchObject({
      quantity: 5000,
      initialQuantity: 5000,
      status: 'active',
      dateKind: 'best_before',
    });
    const movement = (await t.storage.movements.ofBusiness(t.businessId)).find(
      (row) => row.lotId === lot.id,
    );
    expect(movement).toMatchObject({
      type: 'receipt',
      quantity: 5000,
      valueRappen: 7500,
      actor: t.actor,
    });
    expect((await t.storage.articles.get(kitchen.articles.butter.id))?.pricePer1000).toBe(1500);
    await expectLedgerBalanced(t);
  });

  it('books only bought goods as a purchase', async () => {
    const { t, kitchen, ledger, today } = await setup();
    const base = {
      businessId: t.businessId,
      areaId: kitchen.areas.cold.id,
      quantity: 1000,
      pricePer1000: 789,
      receivedOn: today,
    };
    const produced = await ledger.receive({
      ...base,
      articleId: kitchen.articles.jus.id,
      origin: 'production',
    });
    const opening = await ledger.receive({
      ...base,
      articleId: kitchen.articles.butter.id,
      origin: 'opening',
    });
    const movements = await t.storage.movements.ofBusiness(t.businessId);
    expect(movements.find((row) => row.lotId === produced.id)?.type).toBe('production');
    expect(movements.find((row) => row.lotId === opening.id)?.type).toBe('adjustment');
    // A production remembers its cost on the component; an opening stock leaves the price alone.
    expect((await t.storage.articles.get(kitchen.articles.jus.id))?.pricePer1000).toBe(789);
    expect((await t.storage.articles.get(kitchen.articles.butter.id))?.pricePer1000).toBe(1400);
    await expectLedgerBalanced(t);
  });

  it('consumes first expired first out and reports the value', async () => {
    const { t, kitchen, ledger, today } = await setup();
    const result = await ledger.consume({
      businessId: t.businessId,
      articleId: kitchen.articles.cream.id,
      quantity: 4000,
      on: today,
      purpose: 'production',
    });
    // 3 l from the older lot, 1 l from the newer one, at CHF 6.40/l.
    expect(result.picks).toEqual([
      { lotId: kitchen.lots.creamOld.id, quantity: 3000, valueRappen: 1920 },
      { lotId: kitchen.lots.creamNew.id, quantity: 1000, valueRappen: 640 },
    ]);
    expect(result).toMatchObject({ consumed: 4000, missing: 0, valueRappen: 2560 });
    expect(await t.storage.lots.get(kitchen.lots.creamOld.id)).toMatchObject({
      quantity: 0,
      status: 'depleted',
    });
    expect((await t.storage.lots.get(kitchen.lots.creamNew.id))?.quantity).toBe(4000);
    await expectLedgerBalanced(t);
  });

  it('books what is there and reports the shortage', async () => {
    const { t, kitchen, ledger, today } = await setup();
    const result = await ledger.consume({
      businessId: t.businessId,
      articleId: kitchen.articles.salmon.id,
      quantity: 2000,
      on: today,
      purpose: 'production',
    });
    expect(result).toMatchObject({ consumed: 1500, missing: 500 });
    await expectLedgerBalanced(t);
  });

  it('does not cook what is past its Verbrauchsdatum', async () => {
    const { t, kitchen, ledger, today } = await setup();
    const later = addDays(today, 2); // the salmon was good until today + 1
    const result = await ledger.consume({
      businessId: t.businessId,
      articleId: kitchen.articles.salmon.id,
      quantity: 500,
      on: later,
      purpose: 'production',
    });
    expect(result).toMatchObject({ consumed: 0, missing: 500, picks: [] });
  });

  it('writes goods off with a reason', async () => {
    const { t, kitchen, ledger, today } = await setup();
    const result = await ledger.writeOff({
      businessId: t.businessId,
      lotId: kitchen.lots.salmon.id,
      quantity: 500,
      reason: 'spoiled',
      on: today,
    });
    expect(result).toEqual({ valueRappen: 1900, articleId: kitchen.articles.salmon.id });
    const waste = (await t.storage.movements.ofBusiness(t.businessId)).find(
      (row) => row.type === 'waste',
    );
    expect(waste).toMatchObject({ quantity: -500, valueRappen: -1900, reason: 'spoiled' });
    await expectLedgerBalanced(t);
  });

  it('refuses to take more than a lot holds', async () => {
    const { t, kitchen, ledger, today } = await setup();
    const tooMuch = ledger.writeOff({
      businessId: t.businessId,
      lotId: kitchen.lots.salmon.id,
      quantity: 1501,
      reason: 'expired',
      on: today,
    });
    await expect(tooMuch).rejects.toMatchObject({ code: 'invalid' });
    await expect(tooMuch).rejects.toBeInstanceOf(CommandError);
    await expect(
      ledger.consumeLot({
        businessId: t.businessId,
        lotId: kitchen.lots.salmon.id,
        quantity: 0,
        on: today,
        purpose: 'kitchen',
      }),
    ).rejects.toMatchObject({ code: 'invalid' });
  });

  it('follows a count in both directions', async () => {
    const { t, kitchen, ledger, today } = await setup();
    const less = await ledger.adjust({
      businessId: t.businessId,
      lotId: kitchen.lots.eggs.id,
      counted: 54,
      on: today,
    });
    expect(less).toMatchObject({ delta: -6, valueDeltaRappen: -270 });
    const more = await ledger.adjust({
      businessId: t.businessId,
      lotId: kitchen.lots.flour.id,
      counted: 3500,
      on: today,
    });
    expect(more).toMatchObject({ delta: 500, valueDeltaRappen: 80 });
    const same = await ledger.adjust({
      businessId: t.businessId,
      lotId: kitchen.lots.butter.id,
      counted: 2000,
      on: today,
    });
    expect(same.delta).toBe(0);
    expect(
      (await t.storage.movements.ofBusiness(t.businessId)).filter(
        (row) => row.type === 'adjustment',
      ),
    ).toHaveLength(2);
    await expectLedgerBalanced(t);
  });

  it('moves a whole lot or a part of it without touching the ledger', async () => {
    const { t, kitchen, ledger } = await setup();
    const before = (await t.storage.movements.ofBusiness(t.businessId)).length;
    const whole = await ledger.move({
      businessId: t.businessId,
      lotId: kitchen.lots.butter.id,
      areaId: kitchen.areas.frozen.id,
    });
    expect(whole.lotId).toBe(kitchen.lots.butter.id);
    expect((await t.storage.lots.get(kitchen.lots.butter.id))?.areaId).toBe(
      kitchen.areas.frozen.id,
    );
    const part = await ledger.move({
      businessId: t.businessId,
      lotId: kitchen.lots.entrecote.id,
      areaId: kitchen.areas.frozen.id,
      quantity: 1500,
    });
    expect(part.lotId).not.toBe(kitchen.lots.entrecote.id);
    expect((await t.storage.lots.get(kitchen.lots.entrecote.id))?.quantity).toBe(2500);
    expect(await t.storage.lots.get(part.lotId)).toMatchObject({
      quantity: 1500,
      areaId: kitchen.areas.frozen.id,
      expiresOn: kitchen.lots.entrecote.expiresOn,
    });
    expect((await t.storage.movements.ofBusiness(t.businessId)).length).toBe(before);
    await expectLedgerBalanced(t);
  });

  it('knows only rows of its own business', async () => {
    const { kitchen, ledger, today } = await setup();
    const other = await createTestContext();
    await expect(
      ledger.writeOff({
        businessId: other.ids.next(),
        lotId: kitchen.lots.salmon.id,
        quantity: 1,
        reason: 'other',
        on: today,
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('stays balanced under any sequence of bookings', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            action: fc.constantFrom('receive', 'consume', 'waste', 'count'),
            article: fc.integer({ min: 0, max: 3 }),
            quantity: fc.integer({ min: 1, max: 9000 }).map((n) => n / 10),
            price: fc.integer({ min: 1, max: 99_999 }),
          }),
          { maxLength: 25 },
        ),
        async (steps) => {
          const { t, kitchen, ledger, today } = await setup();
          const articles = [
            kitchen.articles.cream,
            kitchen.articles.butter,
            kitchen.articles.eggs,
            kitchen.articles.salmon,
          ];
          for (const step of steps) {
            const article = articles[step.article];
            if (article === undefined) {
              continue;
            }
            if (step.action === 'receive') {
              await ledger.receive({
                businessId: t.businessId,
                articleId: article.id,
                areaId: kitchen.areas.cold.id,
                quantity: step.quantity,
                pricePer1000: step.price,
                receivedOn: today,
                expiresOn: addDays(today, 5),
                origin: 'purchase',
              });
              continue;
            }
            if (step.action === 'consume') {
              await ledger.consume({
                businessId: t.businessId,
                articleId: article.id,
                quantity: step.quantity,
                on: today,
                purpose: 'production',
              });
              continue;
            }
            const lot = (await ledger.activeLots(t.businessId, article.id))[0];
            if (lot === undefined) {
              continue;
            }
            if (step.action === 'waste') {
              await ledger.writeOff({
                businessId: t.businessId,
                lotId: lot.id,
                quantity: Math.min(lot.quantity, step.quantity),
                reason: 'expired',
                on: today,
              });
            } else {
              await ledger.adjust({
                businessId: t.businessId,
                lotId: lot.id,
                counted: step.quantity,
                on: today,
              });
            }
          }
          await expectLedgerBalanced(t);
          for (const lot of await t.storage.lots.ofBusiness(t.businessId)) {
            expect(lot.quantity).toBeGreaterThanOrEqual(0);
            expect(lot.status).toBe(lot.quantity > 0 ? 'active' : 'depleted');
          }
        },
      ),
      { numRuns: 40 },
    );
  });
});
