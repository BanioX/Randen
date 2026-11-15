import { describe, expect, it } from 'vitest';
import {
  CommandError,
  DeliverySchema,
  StaffMemberSchema,
  TemperatureLogSchema,
  type Id,
} from '../src';
import { createTestContext, seedKitchen } from '../src/testing';

/**
 * The test kitchen on Saturday, 14.11.2026 (see `seedKitchen`). Acting person: «Testperson»
 * (initials «TE»). Areas with a range: Kühlzelle (0 to 5 °C) and Tiefkühlzelle (up to -18 °C);
 * the Trockenlager has none.
 */
async function setup(today?: string) {
  const t = await createTestContext(today === undefined ? {} : { today });
  const kitchen = await seedKitchen(t);
  return { t, kitchen, run: t.useCases, businessId: t.businessId };
}

type Setup = Awaited<ReturnType<typeof setup>>;

async function recordCold(s: Setup, deciC: number, action?: string) {
  return s.run['temperatures.record']({
    commandId: s.t.cmd(),
    businessId: s.businessId,
    kind: 'storage',
    areaId: s.kitchen.areas.cold.id,
    deciC,
    ...(action === undefined ? {} : { action }),
  });
}

/** A log of an earlier day, written as an older app would have it (no command). */
async function addOldLog(s: Setup, on: string, ok: boolean, deciC: number) {
  const now = s.t.clock.now();
  await s.t.storage.temperatureLogs.add(
    TemperatureLogSchema.parse({
      id: s.t.ids.next(),
      businessId: s.businessId,
      createdAt: now,
      updatedAt: now,
      kind: 'storage',
      areaId: s.kitchen.areas.cold.id,
      deciC,
      minDeciC: 0,
      maxDeciC: 50,
      ok,
      ...(ok ? {} : { action: 'Älterer Eintrag.' }),
      on,
      measuredAt: `${on}T07:30:00.000Z`,
      measuredBy: s.t.actor,
    }),
  );
}

async function addStaff(s: Setup, name: string) {
  const now = s.t.clock.now();
  const id = s.t.ids.next();
  await s.t.storage.staff.add(
    StaffMemberSchema.parse({
      id,
      businessId: s.businessId,
      createdAt: now,
      updatedAt: now,
      name,
      role: 'cook',
      active: true,
    }),
  );
  return id;
}

/** A check written by another person on a given day, as the sync of another device would do. */
async function addCheck(s: Setup, taskId: Id, on: string, doneBy: Id) {
  const now = s.t.clock.now();
  await s.t.storage.hygieneChecks.add({
    id: s.t.ids.next(),
    businessId: s.businessId,
    createdAt: now,
    updatedAt: now,
    taskId,
    on: on as never,
    doneAt: `${on}T16:00:00.000Z` as never,
    doneBy,
  });
}

/** Any text, typed: `expect.any` is `any` to the linter. */
const ANY_STRING = expect.any(String) as string;

describe('haccp.today', () => {
  it('shows one card per area with a range, the last reading of today, and no card for the Trockenlager', async () => {
    const s = await setup();
    const empty = await s.run['haccp.today']({ businessId: s.businessId });
    expect(empty).toMatchObject({ day: '2026-11-14', measuredTodayCount: 0, plannedTaskCount: 0 });
    expect(empty.areas.map((area) => [area.name, area.reading])).toEqual([
      ['Kühlzelle', undefined],
      ['Tiefkühlzelle', undefined],
    ]);
    await recordCold(s, 45);
    const today = await s.run['haccp.today']({ businessId: s.businessId });
    expect(today.areas[0]).toMatchObject({
      areaId: s.kitchen.areas.cold.id,
      minDeciC: 0,
      maxDeciC: 50,
      reading: { deciC: 45, ok: true, measuredByName: 'Testperson' },
    });
    expect(today.measuredTodayCount).toBe(1);
  });

  it('lists the food measurements of today, not the storage ones', async () => {
    const s = await setup();
    await recordCold(s, 45);
    await s.run['temperatures.record']({
      commandId: s.t.cmd(),
      businessId: s.businessId,
      kind: 'cooking',
      label: 'Pouletbrust, Kern',
      deciC: 725,
    });
    const today = await s.run['haccp.today']({ businessId: s.businessId });
    expect(today.food.map((log) => [log.label, log.deciC, log.ok])).toEqual([
      ['Pouletbrust, Kern', 725, true],
    ]);
    expect(today.measuredTodayCount).toBe(2);
  });

  it('lists the readings of the last seven days that were out of range, newest first', async () => {
    const s = await setup();
    await addOldLog(s, '2026-11-07', false, 70); // eight days back: not in the window
    await addOldLog(s, '2026-11-08', false, 62); // seven days, today included: in the window
    await addOldLog(s, '2026-11-10', true, 30); // in order: not listed
    await recordCold(s, 75, 'Tür war offen.');
    const today = await s.run['haccp.today']({ businessId: s.businessId });
    expect(today.outOfRange.map((log) => [log.on, log.deciC, log.action])).toEqual([
      ['2026-11-14', 75, 'Tür war offen.'],
      ['2026-11-08', 62, 'Älterer Eintrag.'],
    ]);
    expect(today.outOfRange[0]).toMatchObject({ removable: true, areaName: 'Kühlzelle' });
    expect(today.outOfRange[1]).toMatchObject({ removable: false });
    // The last reading of the day is the one shown on the card.
    expect(today.areas[0]?.reading).toMatchObject({
      deciC: 75,
      ok: false,
      action: 'Tür war offen.',
    });
  });

  it('lists the tasks due today with who ticked them and when', async () => {
    const s = await setup();
    expect(
      (await s.run['hygiene.standardPlan']({ commandId: s.t.cmd(), businessId: s.businessId }))
        .created,
    ).toBe(10);
    const { tasks } = await s.run['hygiene.tasks']({ businessId: s.businessId });
    const daily = tasks.find((task) => task.frequency === 'daily');
    if (daily === undefined) {
      throw new Error('the starter plan has a daily task');
    }
    await s.run['hygiene.check']({
      commandId: s.t.cmd(),
      businessId: s.businessId,
      taskId: daily.id,
    });
    const today = await s.run['haccp.today']({ businessId: s.businessId });
    // Saturday: four daily tasks and the two monthly ones are due; the weekly ones wait for their day.
    expect(today.tasks.map((task) => task.frequency).sort()).toEqual([
      'daily',
      'daily',
      'daily',
      'daily',
      'monthly',
      'monthly',
    ]);
    const ticked = today.tasks.filter((task) => task.done);
    expect(ticked).toEqual([
      expect.objectContaining({
        taskId: daily.id,
        doneByName: 'Testperson',
        doneAt: s.t.clock.now(),
      }),
    ]);
    expect(
      today.tasks.find((task) => task.name === 'Tiefkühlzelle abtauen und reinigen')?.areaName,
    ).toBe('Tiefkühlzelle');
  });
});

describe('haccp.report', () => {
  /**
   * The period 9.11. to 15.11.2026 (Monday to Sunday), written by hand:
   *   Kühlzelle 14.11.: 4.5 °C in order and 7.5 °C out of range (with action).  Days with a range
   *   only; Tiefkühlzelle (no reading) is listed with its range and no readings.
   *   Gemüse garen 13.11.: 73 °C in order (cooking, food).  Goods receipt 12.11.: 8.5 °C, not ok.
   *   Abfall leeren (daily): ticked on 14.11. by «TE», due on 9. to 14.11. (six days), done once.
   *   Kühlzelle auswischen (Monday 9.11.): ticked by «AM» (Anna Meier), done once of one due.
   *   Missing days up to today: 9., 10., 11. and 12.11. (15.11. has not come yet).
   */
  async function prepare() {
    const s = await setup();
    await recordCold(s, 45);
    await recordCold(s, 75, 'Tür war offen.');
    s.t.clock.setToday('2026-11-13');
    await s.run['temperatures.record']({
      commandId: s.t.cmd(),
      businessId: s.businessId,
      kind: 'cooking',
      label: 'Gemüse',
      deciC: 730,
    });
    s.t.clock.setToday('2026-11-14');
    const anna = await addStaff(s, 'Anna Muster');
    const meier = await addStaff(s, 'Anna Meier');
    const now = s.t.clock.now();
    await s.t.storage.deliveries.add(
      DeliverySchema.parse({
        id: s.t.ids.next(),
        businessId: s.businessId,
        createdAt: now,
        updatedAt: now,
        supplierId: s.kitchen.suppliers.butcher.id,
        receivedOn: '2026-11-12',
        documentNumber: 'L-99',
        lines: [
          {
            articleId: s.kitchen.articles.salmon.id,
            lotId: s.kitchen.lots.salmon.id,
            areaId: s.kitchen.areas.cold.id,
            quantity: 1500,
            pricePer1000: 3800,
            valueRappen: 5700,
          },
        ],
        totalRappen: 5700,
        tempDeciC: 85,
        checkOk: false,
        receivedBy: s.t.actor,
      }),
    );
    const daily = await s.run['hygiene.saveTask']({
      commandId: s.t.cmd(),
      businessId: s.businessId,
      name: 'Abfall leeren',
      frequency: 'daily',
      active: true,
    });
    await s.run['hygiene.check']({
      commandId: s.t.cmd(),
      businessId: s.businessId,
      taskId: daily.taskId,
    });
    const weekly = await s.run['hygiene.saveTask']({
      commandId: s.t.cmd(),
      businessId: s.businessId,
      name: 'Kühlzelle auswischen',
      frequency: 'weekly',
      weekday: 'mon',
      active: true,
    });
    await addCheck(s, weekly.taskId, '2026-11-09', anna);
    const removed = await s.run['hygiene.saveTask']({
      commandId: s.t.cmd(),
      businessId: s.businessId,
      name: 'Alter Auftrag',
      frequency: 'daily',
      active: true,
    });
    await addCheck(s, removed.taskId, '2026-11-11', meier);
    await s.run['hygiene.removeTask']({
      commandId: s.t.cmd(),
      businessId: s.businessId,
      taskId: removed.taskId,
    });
    return { s, daily, weekly, removed, anna, meier };
  }

  it('lists every day of the period, also those without a measurement', async () => {
    const { s } = await prepare();
    const report = await s.run['haccp.report']({
      businessId: s.businessId,
      from: '2026-11-09',
      to: '2026-11-15',
    });
    expect(report.days).toEqual([
      '2026-11-09',
      '2026-11-10',
      '2026-11-11',
      '2026-11-12',
      '2026-11-13',
      '2026-11-14',
      '2026-11-15',
    ]);
    expect(report.missingDays).toEqual(['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12']);
    expect(report.counts).toMatchObject({
      measurements: 3,
      outOfRange: 1,
      missingDays: 4,
      receipts: 1,
      receiptsNotOk: 1,
    });
  });

  it('does not count the days still to come as missing a measurement', async () => {
    const { s } = await prepare();
    // Today is Saturday 14.11.: Sunday 15.11. has not come, so only 9.–13. without measurement count.
    const report = await s.run['haccp.report']({
      businessId: s.businessId,
      from: '2026-11-09',
      to: '2026-11-15',
    });
    expect(report.days).toHaveLength(7);
    expect(report.missingDays).toEqual(['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12']);
    expect(report.counts.missingDays).toBe(4);
    expect(report.tasks.find((task) => task.name === 'Abfall leeren')?.cells[6]?.state).toBe(
      'not_due',
    );
  });

  it('gives the readings per area and day, with the range, the extremes and the deviations', async () => {
    const { s } = await prepare();
    const report = await s.run['haccp.report']({
      businessId: s.businessId,
      from: '2026-11-09',
      to: '2026-11-15',
    });
    // The Trockenlager has no range and no reading: not in the report. Two areas remain.
    expect(report.areas.map((area) => area.name)).toEqual(['Kühlzelle', 'Tiefkühlzelle']);
    const cold = report.areas[0];
    expect(cold).toMatchObject({ minDeciC: 0, maxDeciC: 50 });
    expect(cold?.days[5]).toEqual({
      on: '2026-11-14',
      count: 2,
      minDeciC: 45,
      maxDeciC: 75,
      outOfRange: 1,
    });
    expect(cold?.days[0]).toEqual({ on: '2026-11-09', count: 0, outOfRange: 0 });
    expect(report.areas[1]?.days.every((day) => day.count === 0)).toBe(true);
    expect(report.deviations.map((log) => [log.on, log.deciC, log.action, log.areaName])).toEqual([
      ['2026-11-14', 75, 'Tür war offen.', 'Kühlzelle'],
    ]);
  });

  it('lists the food measurements in time order, without the goods receipts (they come from the deliveries)', async () => {
    const { s } = await prepare();
    const report = await s.run['haccp.report']({
      businessId: s.businessId,
      from: '2026-11-09',
      to: '2026-11-15',
    });
    expect(report.food.map((log) => [log.on, log.label, log.deciC, log.ok])).toEqual([
      ['2026-11-13', 'Gemüse', 730, true],
    ]);
  });

  it('gives the goods receipts with supplier, temperature and whether they were in order', async () => {
    const { s } = await prepare();
    const report = await s.run['haccp.report']({
      businessId: s.businessId,
      from: '2026-11-09',
      to: '2026-11-15',
    });
    expect(report.receipts).toEqual([
      {
        deliveryId: ANY_STRING,
        receivedOn: '2026-11-12',
        supplierName: 'Metzgerei Muster',
        documentNumber: 'L-99',
        tempDeciC: 85,
        checkOk: false,
        initials: 'TE',
      },
    ]);
  });

  it('gives the tasks as a matrix of days with the initials of who ticked them; future days are not open', async () => {
    const { s, daily, weekly } = await prepare();
    const report = await s.run['haccp.report']({
      businessId: s.businessId,
      from: '2026-11-09',
      to: '2026-11-15',
    });
    const byId = new Map(report.tasks.map((task) => [task.taskId, task]));
    const abfall = byId.get(daily.taskId);
    expect(abfall).toMatchObject({
      name: 'Abfall leeren',
      frequency: 'daily',
      dueCount: 6,
      doneCount: 1,
    });
    expect(abfall?.cells.map((cell) => cell.state)).toEqual([
      'open',
      'open',
      'open',
      'open',
      'open',
      'done',
      'not_due',
    ]);
    expect(abfall?.cells[5]).toEqual({ on: '2026-11-14', state: 'done', initials: 'TE' });
    const kuehl = byId.get(weekly.taskId);
    expect(kuehl).toMatchObject({
      name: 'Kühlzelle auswischen',
      weekday: 'mon',
      dueCount: 1,
      doneCount: 1,
    });
    expect(kuehl?.cells[0]).toEqual({ on: '2026-11-09', state: 'done', initials: 'AM2' });
    expect(kuehl?.cells[1]?.state).toBe('not_due');
  });

  it('counts a removed task only where it was ticked, and lists the names behind the initials', async () => {
    const { s, removed } = await prepare();
    const report = await s.run['haccp.report']({
      businessId: s.businessId,
      from: '2026-11-09',
      to: '2026-11-15',
    });
    const old = report.tasks.find((task) => task.taskId === removed.taskId);
    expect(old).toMatchObject({ name: 'Alter Auftrag', dueCount: 0, doneCount: 0 });
    expect(old?.cells[2]).toEqual({ on: '2026-11-11', state: 'done', initials: 'AM' });
    // Initials are unique: «Anna Meier» comes first in the list and gets «AM», «Anna Muster» «AM2».
    expect(report.people).toEqual([
      { initials: 'AM', name: 'Anna Meier' },
      { initials: 'AM2', name: 'Anna Muster' },
      { initials: 'TE', name: 'Testperson' },
    ]);
    expect(report.counts.tasksDue).toBe(7);
    expect(report.counts.tasksDone).toBe(2);
  });

  it('refuses a period that ends before it starts, and one longer than a year', async () => {
    const { s } = await prepare();
    await expect(
      s.run['haccp.report']({ businessId: s.businessId, from: '2026-11-15', to: '2026-11-09' }),
    ).rejects.toBeInstanceOf(CommandError);
    await expect(
      s.run['haccp.report']({ businessId: s.businessId, from: '2025-01-01', to: '2026-11-09' }),
    ).rejects.toMatchObject({ code: 'invalid' });
  });

  it('gives a monthly task one due month, done when it was ticked in that month', async () => {
    const { s } = await prepare();
    const monthlyTask = await s.run['hygiene.saveTask']({
      commandId: s.t.cmd(),
      businessId: s.businessId,
      name: 'Schädlingskontrolle',
      frequency: 'monthly',
      active: true,
    });
    await s.run['hygiene.check']({
      commandId: s.t.cmd(),
      businessId: s.businessId,
      taskId: monthlyTask.taskId,
    });
    const report = await s.run['haccp.report']({
      businessId: s.businessId,
      from: '2026-11-09',
      to: '2026-11-15',
    });
    const row = report.tasks.find((task) => task.taskId === monthlyTask.taskId);
    expect(row).toMatchObject({ dueCount: 1, doneCount: 1 });
    expect(row?.cells[5]).toEqual({ on: '2026-11-14', state: 'done', initials: 'TE' });
    expect(row?.cells[0]?.state).toBe('not_due');
  });

  it('shows nothing of another business', async () => {
    const { s } = await prepare();
    const other = await createTestContext({ storage: s.t.storage, idStart: 7000 });
    const report = await other.useCases['haccp.report']({
      businessId: other.businessId,
      from: '2026-11-09',
      to: '2026-11-15',
    });
    expect(report.counts).toMatchObject({
      measurements: 0,
      missingDays: 6,
      tasksDue: 0,
      receipts: 0,
    });
    expect(report.people).toEqual([]);
  });
});
