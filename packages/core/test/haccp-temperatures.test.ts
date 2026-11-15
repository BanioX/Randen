import { describe, expect, it } from 'vitest';
import { CommandError, TemperatureLogSchema } from '../src';
import { createTestContext, seedKitchen } from '../src/testing';

/**
 * The test kitchen on Saturday, 14.11.2026 (see `seedKitchen`). The Kühlzelle has the range 0 to
 * 5 °C (0 to 50 in tenths), the Tiefkühlzelle is at most -18 °C (-180). The Trockenlager has no
 * range. No temperature was recorded before the tests start.
 */
async function setup(today?: string) {
  const t = await createTestContext(today === undefined ? {} : { today });
  const kitchen = await seedKitchen(t);
  return { t, kitchen, run: t.useCases, businessId: t.businessId };
}

async function recordStorage(s: Awaited<ReturnType<typeof setup>>, deciC: number, action?: string) {
  return s.run['temperatures.record']({
    commandId: s.t.cmd(),
    businessId: s.businessId,
    kind: 'storage',
    areaId: s.kitchen.areas.cold.id,
    deciC,
    ...(action === undefined ? {} : { action }),
  });
}

/** Any text, typed: `expect.any` is `any` to the linter. */
const ANY_STRING = expect.any(String) as string;

describe('temperatures.record: storage areas', () => {
  it('stores 4.5 °C in the Kühlzelle as in order, with the range that applied', async () => {
    const s = await setup();
    const result = await recordStorage(s, 45);
    expect(result).toEqual({ logId: ANY_STRING, ok: true, deciC: 45, minDeciC: 0, maxDeciC: 50 });
    const [log] = await s.t.storage.temperatureLogs.ofBusiness(s.businessId);
    expect(log).toEqual(
      TemperatureLogSchema.parse({
        id: result.logId,
        businessId: s.businessId,
        createdAt: s.t.clock.now(),
        updatedAt: s.t.clock.now(),
        kind: 'storage',
        areaId: s.kitchen.areas.cold.id,
        deciC: 45,
        minDeciC: 0,
        maxDeciC: 50,
        ok: true,
        on: '2026-11-14',
        measuredAt: s.t.clock.now(),
        measuredBy: s.t.actor,
      }),
    );
  });

  it('refuses 7.5 °C without an action, and stores nothing', async () => {
    const s = await setup();
    await expect(recordStorage(s, 75)).rejects.toMatchObject({ code: 'invalid' });
    expect(await s.t.storage.temperatureLogs.ofBusiness(s.businessId)).toHaveLength(0);
  });

  it('stores 7.5 °C with its action as out of range, with the range that applied', async () => {
    const s = await setup();
    const result = await recordStorage(s, 75, 'Tür war offen, Ware umgelagert, Tür geschlossen.');
    expect(result).toMatchObject({ ok: false, deciC: 75, minDeciC: 0, maxDeciC: 50 });
    const [log] = await s.t.storage.temperatureLogs.ofBusiness(s.businessId);
    expect(log).toMatchObject({
      ok: false,
      action: 'Tür war offen, Ware umgelagert, Tür geschlossen.',
      minDeciC: 0,
      maxDeciC: 50,
    });
  });

  it('needs an area for a storage reading and no label', async () => {
    const s = await setup();
    await expect(
      s.run['temperatures.record']({
        commandId: s.t.cmd(),
        businessId: s.businessId,
        kind: 'storage',
        deciC: 40,
      }),
    ).rejects.toMatchObject({ code: 'invalid' });
    await expect(
      s.run['temperatures.record']({
        commandId: s.t.cmd(),
        businessId: s.businessId,
        kind: 'storage',
        areaId: s.kitchen.areas.cold.id,
        label: 'Kühlschrank',
        deciC: 40,
      }),
    ).rejects.toMatchObject({ code: 'invalid' });
  });

  it('refuses an area that does not exist in this business', async () => {
    const s = await setup();
    await expect(
      s.run['temperatures.record']({
        commandId: s.t.cmd(),
        businessId: s.businessId,
        kind: 'storage',
        areaId: s.t.cmd(),
        deciC: 40,
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('counts an area without range as in order, with no limits stored', async () => {
    const s = await setup();
    const result = await s.run['temperatures.record']({
      commandId: s.t.cmd(),
      businessId: s.businessId,
      kind: 'storage',
      areaId: s.kitchen.areas.dry.id,
      deciC: 210,
    });
    expect(result).toEqual({ logId: ANY_STRING, ok: true, deciC: 210 });
  });

  it('keeps the old limits on the old log after the range of the area changes', async () => {
    const s = await setup();
    await recordStorage(s, 45);
    await s.run['areas.update']({
      commandId: s.t.cmd(),
      businessId: s.businessId,
      areaId: s.kitchen.areas.cold.id,
      minDeciC: -20,
      maxDeciC: 80,
    });
    await recordStorage(s, 75);
    const logs = await s.run['temperatures.list']({
      businessId: s.businessId,
      from: '2026-11-14',
      to: '2026-11-14',
    });
    // Newest first: the reading after the change has the new range, the one before the old.
    const [newer, older] = logs.logs;
    expect(newer).toMatchObject({ deciC: 75, ok: true, minDeciC: -20, maxDeciC: 80 });
    expect(older).toMatchObject({ deciC: 45, ok: true, minDeciC: 0, maxDeciC: 50 });
  });

  it('is idempotent: the same command id returns the same reading and stores it once', async () => {
    const s = await setup();
    const commandId = s.t.cmd();
    const input = {
      commandId,
      businessId: s.businessId,
      kind: 'storage' as const,
      areaId: s.kitchen.areas.cold.id,
      deciC: 45,
    };
    const first = await s.run['temperatures.record'](input);
    const second = await s.run['temperatures.record'](input);
    expect(second).toEqual(first);
    expect(await s.t.storage.temperatureLogs.ofBusiness(s.businessId)).toHaveLength(1);
  });

  it('emits a temperature.recorded event with the area and the result', async () => {
    const s = await setup();
    const result = await recordStorage(s, 75, 'Massnahme.');
    const events = await s.t.storage.events.ofBusiness(s.businessId);
    expect(events.filter((event) => event.type === 'temperature.recorded')).toEqual([
      expect.objectContaining({
        actor: s.t.actor,
        payload: {
          logId: result.logId,
          kind: 'storage',
          ok: false,
          areaId: s.kitchen.areas.cold.id,
        },
      }),
    ]);
  });
});

describe('temperatures.record: food', () => {
  async function record(
    s: Awaited<ReturnType<typeof setup>>,
    kind: 'cooking' | 'hot_holding' | 'cooling' | 'receiving',
    deciC: number,
    action?: string,
  ) {
    return s.run['temperatures.record']({
      commandId: s.t.cmd(),
      businessId: s.businessId,
      kind,
      label: 'Pouletbrust, Kern',
      deciC,
      ...(action === undefined ? {} : { action }),
    });
  }

  it('checks the cooking core temperature against the proposal of 70 °C', async () => {
    const s = await setup();
    expect(await record(s, 'cooking', 725)).toMatchObject({ ok: true, minDeciC: 700 });
    await expect(record(s, 'cooking', 650)).rejects.toMatchObject({ code: 'invalid' });
    expect(await record(s, 'cooking', 650, 'Weiter gegart, nochmals gemessen.')).toMatchObject({
      ok: false,
      minDeciC: 700,
    });
  });

  it('checks hot holding at least 65 °C and cooling at most 5 °C', async () => {
    const s = await setup();
    expect(await record(s, 'hot_holding', 660)).toMatchObject({ ok: true, minDeciC: 650 });
    expect(await record(s, 'cooling', 45)).toMatchObject({ ok: true, maxDeciC: 50 });
    await expect(record(s, 'cooling', 80)).rejects.toMatchObject({ code: 'invalid' });
    await expect(record(s, 'hot_holding', 600)).rejects.toMatchObject({ code: 'invalid' });
  });

  it('checks goods at the door against 5 °C', async () => {
    const s = await setup();
    expect(await record(s, 'receiving', 30)).toMatchObject({ ok: true, maxDeciC: 50 });
  });

  it('needs a label for a food reading and no area', async () => {
    const s = await setup();
    await expect(
      s.run['temperatures.record']({
        commandId: s.t.cmd(),
        businessId: s.businessId,
        kind: 'cooking',
        deciC: 720,
      }),
    ).rejects.toMatchObject({ code: 'invalid' });
    await expect(
      s.run['temperatures.record']({
        commandId: s.t.cmd(),
        businessId: s.businessId,
        kind: 'cooking',
        label: 'Gemüse',
        areaId: s.kitchen.areas.cold.id,
        deciC: 720,
      }),
    ).rejects.toMatchObject({ code: 'invalid' });
  });
});

describe('temperatures.remove', () => {
  it('removes a reading of today (a typo) with a soft delete and an event', async () => {
    const s = await setup();
    const { logId } = await recordStorage(s, 45);
    expect(
      await s.run['temperatures.remove']({ commandId: s.t.cmd(), businessId: s.businessId, logId }),
    ).toEqual({ logId });
    const [row] = await s.t.storage.temperatureLogs.ofBusiness(s.businessId);
    expect(row?.deletedAt).toBe(s.t.clock.now());
    const events = await s.t.storage.events.ofBusiness(s.businessId);
    expect(events.map((event) => event.type)).toContain('temperature.removed');
  });

  it('refuses a reading of an earlier day, and an unknown one', async () => {
    const s = await setup();
    const { logId } = await recordStorage(s, 45);
    s.t.clock.setToday('2026-11-15');
    await expect(
      s.run['temperatures.remove']({ commandId: s.t.cmd(), businessId: s.businessId, logId }),
    ).rejects.toMatchObject({ code: 'not_allowed' });
    await expect(
      s.run['temperatures.remove']({
        commandId: s.t.cmd(),
        businessId: s.businessId,
        logId: s.t.cmd(),
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('marks a reading as removable only on the day it was made', async () => {
    const s = await setup();
    await recordStorage(s, 45);
    const today = await s.run['temperatures.list']({
      businessId: s.businessId,
      from: '2026-11-14',
      to: '2026-11-14',
    });
    expect(today.logs[0]?.removable).toBe(true);
    s.t.clock.setToday('2026-11-15');
    const tomorrow = await s.run['temperatures.list']({
      businessId: s.businessId,
      from: '2026-11-14',
      to: '2026-11-15',
    });
    expect(tomorrow.logs[0]?.removable).toBe(false);
  });
});

describe('temperatures.list', () => {
  it('lists the logs newest first, counts the out of range ones and gives a daily series per area', async () => {
    const s = await setup();
    await recordStorage(s, 40);
    s.t.clock.setToday('2026-11-13');
    await recordStorage(s, 30);
    await recordStorage(s, 70, 'Tür offen.');
    s.t.clock.setToday('2026-11-14');
    await recordStorage(s, 48);
    const list = await s.run['temperatures.list']({
      businessId: s.businessId,
      from: '2026-11-09',
      to: '2026-11-15',
    });
    expect(list.logs.map((log) => [log.on, log.deciC])).toEqual([
      ['2026-11-14', 48],
      ['2026-11-14', 40],
      ['2026-11-13', 70],
      ['2026-11-13', 30],
    ]);
    expect(list.counts).toEqual({ total: 4, outOfRange: 1 });
    expect(list.logs[2]).toMatchObject({ areaName: 'Kühlzelle', action: 'Tür offen.', ok: false });
    expect(list.series).toEqual([
      {
        areaId: s.kitchen.areas.cold.id,
        name: 'Kühlzelle',
        minDeciC: 0,
        maxDeciC: 50,
        points: [
          { on: '2026-11-13', lowestDeciC: 30, highestDeciC: 70, count: 2 },
          { on: '2026-11-14', lowestDeciC: 40, highestDeciC: 48, count: 2 },
        ],
      },
    ]);
  });

  it('filters by area and by kind, and gives no series for a food kind', async () => {
    const s = await setup();
    await recordStorage(s, 40);
    await s.run['temperatures.record']({
      commandId: s.t.cmd(),
      businessId: s.businessId,
      kind: 'cooking',
      label: 'Gemüse',
      deciC: 730,
    });
    const onlyFood = await s.run['temperatures.list']({
      businessId: s.businessId,
      from: '2026-11-14',
      to: '2026-11-14',
      kind: 'cooking',
    });
    expect(onlyFood.logs.map((log) => log.label)).toEqual(['Gemüse']);
    expect(onlyFood.series).toEqual([]);
    const frozenOnly = await s.run['temperatures.list']({
      businessId: s.businessId,
      from: '2026-11-14',
      to: '2026-11-14',
      areaId: s.kitchen.areas.frozen.id,
    });
    expect(frozenOnly.logs).toEqual([]);
    expect(frozenOnly.series).toEqual([]);
  });

  it('gives the proposals with their sources, and rejects a period that ends before it starts', async () => {
    const s = await setup();
    const list = await s.run['temperatures.list']({
      businessId: s.businessId,
      from: '2026-11-14',
      to: '2026-11-14',
    });
    expect(list.proposals.map((row) => row.kind)).toEqual([
      'cooking',
      'hot_holding',
      'cooling',
      'receiving',
    ]);
    expect(list.proposals[0]).toEqual({
      kind: 'cooking',
      minDeciC: 700,
      source: 'GVG Kap. 2.4.4: Kerntemperatur mindestens 70 °C',
    });
    expect(list.areas.map((area) => area.name)).toEqual([
      'Kühlzelle',
      'Tiefkühlzelle',
      'Trockenlager',
    ]);
    await expect(
      s.run['temperatures.list']({
        businessId: s.businessId,
        from: '2026-11-15',
        to: '2026-11-14',
      }),
    ).rejects.toBeInstanceOf(CommandError);
  });
});

describe('haccp: another business sees nothing', () => {
  it('keeps the readings of two businesses apart on one storage', async () => {
    const s = await setup();
    await recordStorage(s, 45);
    const other = await createTestContext({ storage: s.t.storage, idStart: 5000 });
    await seedKitchen(other);
    const list = await other.useCases['temperatures.list']({
      businessId: other.businessId,
      from: '2026-11-01',
      to: '2026-11-30',
    });
    expect(list.logs).toEqual([]);
    const today = await other.useCases['haccp.today']({ businessId: other.businessId });
    expect(today.areas.every((area) => area.reading === undefined)).toBe(true);
  });
});
