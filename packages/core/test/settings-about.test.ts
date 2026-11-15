import { describe, expect, it } from 'vitest';
import { CommandError, CONTRACT_V1, IsoDateTimeSchema } from '../src';
import { createTestContext, seedKitchen, type TestContext } from '../src/testing';

async function setup() {
  const t = await createTestContext();
  const kitchen = await seedKitchen(t);
  return { t, kitchen, run: t.useCases, businessId: t.businessId };
}

describe('settings.about', () => {
  it('counts the alive rows per table and spans the movements from the first to the last day', async () => {
    const { run, businessId, t } = await setup();
    const about = await run['settings.about']({ businessId });
    // Ten receipts, all booked on 13.11.2026 (the day before the test day).
    expect(about.movements).toEqual({ oldest: '2026-11-13', newest: '2026-11-13' });
    expect(about.counts).toMatchObject({
      staff: 1,
      articles: 10,
      lots: 10,
      movements: 10,
      recipes: 3,
    });

    const { staffId } = await run['staff.save']({
      commandId: t.cmd(),
      businessId,
      name: 'Anna',
      role: 'cook',
      active: true,
    });
    await run['staff.remove']({ commandId: t.cmd(), businessId, staffId });
    // A removed person is no longer counted; the movements have no soft delete and stay.
    expect((await run['settings.about']({ businessId })).counts.staff).toBe(1);
  });

  it('counts the pictures of areas, places, recipes and receipts, and their size in characters', async () => {
    const { run, businessId, t, kitchen } = await setup();
    expect(await run['settings.about']({ businessId })).toMatchObject({
      photos: { count: 0, characters: 0 },
    });
    const photo = 'data:image/jpeg;base64,AAAA';
    const now = IsoDateTimeSchema.parse('2026-11-14T10:00:00.000Z');
    await t.storage.areas.put({ ...kitchen.areas.cold, photo });
    await t.storage.recipes.put({ ...kitchen.recipes.salmonDish, photo: `${photo}BBBB` });
    // A picture of a deleted row is no longer in use and not counted.
    await t.storage.spots.put({ ...kitchen.spots.dryShelf, photo, deletedAt: now });
    const about = await run['settings.about']({ businessId });
    // The recipe's picture is the same picture with four more characters.
    expect(about.photos).toEqual({ count: 2, characters: photo.length + photo.length + 4 });
  });

  it('shows no movement span for a business without movements', async () => {
    const t = await createTestContext();
    const about = await t.useCases['settings.about']({ businessId: t.businessId });
    expect(about).toEqual({
      counts: expect.objectContaining({ staff: 1, movements: 0 }) as unknown,
      movements: {},
      photos: { count: 0, characters: 0 },
    });
  });

  it('is refused for a business that does not exist', async () => {
    const t: TestContext = await createTestContext();
    await expect(t.useCases['settings.about']({ businessId: t.ids.next() })).rejects.toBeInstanceOf(
      CommandError,
    );
  });

  it('is part of the contract as a query: it never writes', () => {
    expect(CONTRACT_V1['settings.about'].kind).toBe('query');
  });
});
