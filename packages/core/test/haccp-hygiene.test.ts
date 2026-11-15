import { describe, expect, it } from 'vitest';
import { CommandError, HygieneTaskSchema, type Id } from '../src';
import { createTestContext, seedKitchen } from '../src/testing';

/**
 * The test kitchen on Saturday, 14.11.2026 (see `seedKitchen`); the acting person is «Testperson»
 * (initials «TE»). No cleaning task exists before a test creates one.
 */
async function setup(today?: string) {
  const t = await createTestContext(today === undefined ? {} : { today });
  const kitchen = await seedKitchen(t);
  return { t, kitchen, run: t.useCases, businessId: t.businessId };
}

type Setup = Awaited<ReturnType<typeof setup>>;

async function saveTask(
  s: Setup,
  fields: {
    taskId?: Id;
    name: string;
    frequency: 'daily' | 'weekly' | 'monthly';
    weekday?: 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
    areaId?: Id | null;
    instructions?: string;
    active?: boolean;
  },
) {
  return s.run['hygiene.saveTask']({
    commandId: s.t.cmd(),
    businessId: s.businessId,
    ...fields,
    active: fields.active ?? true,
  });
}

async function check(s: Setup, taskId: Id, note?: string) {
  return s.run['hygiene.check']({
    commandId: s.t.cmd(),
    businessId: s.businessId,
    taskId,
    ...(note === undefined ? {} : { note }),
  });
}

/** Any text, typed: `expect.any` is `any` to the linter. */
const ANY_STRING = expect.any(String) as string;

describe('hygiene.saveTask', () => {
  it('creates a daily task with its area, and lists it', async () => {
    const s = await setup();
    const { taskId } = await saveTask(s, {
      name: 'Böden nass reinigen',
      frequency: 'daily',
      areaId: s.kitchen.areas.dry.id,
      instructions: 'Reinigungsmittel nach Dosierung.',
    });
    const { tasks } = await s.run['hygiene.tasks']({ businessId: s.businessId });
    expect(tasks).toEqual([
      {
        id: taskId,
        name: 'Böden nass reinigen',
        areaId: s.kitchen.areas.dry.id,
        areaName: 'Trockenlager',
        frequency: 'daily',
        instructions: 'Reinigungsmittel nach Dosierung.',
        active: true,
        doneNow: false,
      },
    ]);
    const events = await s.t.storage.events.ofBusiness(s.businessId);
    expect(events.map((event) => event.type)).toContain('hygiene_task.created');
  });

  it('needs a weekday for a weekly task, and ignores one for a daily task', async () => {
    const s = await setup();
    await expect(
      saveTask(s, { name: 'Kühlzelle auswischen', frequency: 'weekly' }),
    ).rejects.toMatchObject({ code: 'invalid' });
    const { taskId } = await saveTask(s, {
      name: 'Abfall leeren',
      frequency: 'daily',
      weekday: 'mon',
    });
    const [row] = (await s.t.storage.hygieneTasks.ofBusiness(s.businessId)).filter(
      (task) => task.id === taskId,
    );
    expect(row?.weekday).toBeUndefined();
  });

  it('refuses a second task with the same name, in any case', async () => {
    const s = await setup();
    await saveTask(s, { name: 'Abfall leeren', frequency: 'daily' });
    await expect(
      saveTask(s, { name: ' abfall LEEREN ', frequency: 'daily' }),
    ).rejects.toMatchObject({
      code: 'duplicate_name',
    });
  });

  it('refuses an area of another business, and an unknown area', async () => {
    const s = await setup();
    await expect(
      saveTask(s, { name: 'Abfall leeren', frequency: 'daily', areaId: s.t.cmd() }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('changes a task, keeps its id, and clears what is left out', async () => {
    const s = await setup();
    const { taskId } = await saveTask(s, {
      name: 'Kühlzelle auswischen',
      frequency: 'weekly',
      weekday: 'mon',
      areaId: s.kitchen.areas.cold.id,
      instructions: 'Alt.',
    });
    s.t.clock.setToday('2026-11-16');
    const again = await saveTask(s, {
      taskId,
      name: 'Kühlzelle gründlich auswischen',
      frequency: 'weekly',
      weekday: 'wed',
      areaId: null,
      active: false,
    });
    expect(again).toEqual({ taskId });
    const [row] = await s.t.storage.hygieneTasks.ofBusiness(s.businessId);
    expect(row).toEqual(
      HygieneTaskSchema.parse({
        id: taskId,
        businessId: s.businessId,
        createdAt: '2026-11-14T10:00:00.000Z',
        updatedAt: s.t.clock.now(),
        name: 'Kühlzelle gründlich auswischen',
        frequency: 'weekly',
        weekday: 'wed',
        active: false,
      }),
    );
    const events = await s.t.storage.events.ofBusiness(s.businessId);
    expect(events.map((event) => event.type)).toContain('hygiene_task.updated');
  });

  it('refuses to change a task to a name another task has, and an unknown task', async () => {
    const s = await setup();
    await saveTask(s, { name: 'Abfall leeren', frequency: 'daily' });
    const { taskId } = await saveTask(s, { name: 'Böden', frequency: 'daily' });
    await expect(
      saveTask(s, { taskId, name: 'Abfall leeren', frequency: 'daily' }),
    ).rejects.toMatchObject({ code: 'duplicate_name' });
    await expect(
      saveTask(s, { taskId: s.t.cmd(), name: 'Anderes', frequency: 'daily' }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('is idempotent with the same command id', async () => {
    const s = await setup();
    const commandId = s.t.cmd();
    const input = {
      commandId,
      businessId: s.businessId,
      name: 'Abfall leeren',
      frequency: 'daily' as const,
      active: true,
    };
    const first = await s.run['hygiene.saveTask'](input);
    const second = await s.run['hygiene.saveTask'](input);
    expect(second).toEqual(first);
    expect(await s.t.storage.hygieneTasks.ofBusiness(s.businessId)).toHaveLength(1);
  });
});

describe('hygiene.removeTask', () => {
  it('removes a task softly and keeps its checks for the report', async () => {
    const s = await setup();
    const { taskId } = await saveTask(s, { name: 'Abfall leeren', frequency: 'daily' });
    await check(s, taskId);
    expect(
      await s.run['hygiene.removeTask']({ commandId: s.t.cmd(), businessId: s.businessId, taskId }),
    ).toEqual({ taskId });
    expect((await s.run['hygiene.tasks']({ businessId: s.businessId })).tasks).toEqual([]);
    expect(await s.t.storage.hygieneChecks.ofBusiness(s.businessId)).toHaveLength(1);
    await expect(
      s.run['hygiene.removeTask']({ commandId: s.t.cmd(), businessId: s.businessId, taskId }),
    ).rejects.toBeInstanceOf(CommandError);
  });
});

describe('hygiene.check and hygiene.uncheck', () => {
  it('ticks a task as done today with the person and the time, and shows it as done', async () => {
    const s = await setup();
    const { taskId } = await saveTask(s, { name: 'Abfall leeren', frequency: 'daily' });
    const result = await check(s, taskId, 'Container Nord war voll.');
    expect(result).toEqual({
      checkId: ANY_STRING,
      taskId,
      on: '2026-11-14',
      doneAt: s.t.clock.now(),
      doneByName: 'Testperson',
      created: true,
    });
    const { tasks } = await s.run['hygiene.tasks']({ businessId: s.businessId });
    expect(tasks[0]).toMatchObject({
      doneNow: true,
      lastDoneOn: '2026-11-14',
      lastDoneByName: 'Testperson',
    });
    const events = await s.t.storage.events.ofBusiness(s.businessId);
    expect(events.map((event) => event.type)).toContain('hygiene_task.checked');
  });

  it('returns the first tick when a second one comes on the same day, and stores nothing new', async () => {
    const s = await setup();
    const { taskId } = await saveTask(s, { name: 'Abfall leeren', frequency: 'daily' });
    const first = await check(s, taskId);
    const second = await check(s, taskId);
    expect(second).toEqual({ ...first, created: false });
    expect(await s.t.storage.hygieneChecks.ofBusiness(s.businessId)).toHaveLength(1);
  });

  it('takes back the tick of today, and a tick of today can be made again', async () => {
    const s = await setup();
    const { taskId } = await saveTask(s, { name: 'Abfall leeren', frequency: 'daily' });
    await check(s, taskId);
    expect(
      await s.run['hygiene.uncheck']({ commandId: s.t.cmd(), businessId: s.businessId, taskId }),
    ).toEqual({ taskId, removed: 1 });
    expect((await s.run['hygiene.tasks']({ businessId: s.businessId })).tasks[0]?.doneNow).toBe(
      false,
    );
    expect(
      await s.run['hygiene.uncheck']({ commandId: s.t.cmd(), businessId: s.businessId, taskId }),
    ).toEqual({ taskId, removed: 0 });
    const again = await check(s, taskId);
    expect(again.created).toBe(true);
    const events = await s.t.storage.events.ofBusiness(s.businessId);
    expect(events.map((event) => event.type)).toContain('hygiene_task.unchecked');
  });

  it('refuses to tick an inactive or an unknown task', async () => {
    const s = await setup();
    const { taskId } = await saveTask(s, {
      name: 'Abfall leeren',
      frequency: 'daily',
      active: false,
    });
    await expect(check(s, taskId)).rejects.toMatchObject({ code: 'not_allowed' });
    await expect(check(s, s.t.cmd())).rejects.toMatchObject({ code: 'not_found' });
    await expect(
      s.run['hygiene.uncheck']({
        commandId: s.t.cmd(),
        businessId: s.businessId,
        taskId: s.t.cmd(),
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('the rhythm of the tasks (acceptance)', () => {
  it('a weekly task on Monday is due on Monday 16.11.2026, not on Saturday 14.11.2026', async () => {
    const s = await setup('2026-11-14');
    await saveTask(s, { name: 'Kühlzelle auswischen', frequency: 'weekly', weekday: 'mon' });
    const saturday = await s.run['haccp.today']({ businessId: s.businessId });
    expect(saturday.tasks).toEqual([]);
    expect(saturday.plannedTaskCount).toBe(1);
    s.t.clock.setToday('2026-11-16');
    const monday = await s.run['haccp.today']({ businessId: s.businessId });
    expect(monday.tasks.map((task) => [task.name, task.done])).toEqual([
      ['Kühlzelle auswischen', false],
    ]);
    // Tuesday: not due again, and not due because Monday was missed.
    s.t.clock.setToday('2026-11-17');
    expect((await s.run['haccp.today']({ businessId: s.businessId })).tasks).toEqual([]);
  });

  it('a monthly task is due until it is done once in the month, and again in the next month', async () => {
    const s = await setup('2026-11-14');
    const { taskId } = await saveTask(s, { name: 'Schädlingskontrolle', frequency: 'monthly' });
    expect((await s.run['haccp.today']({ businessId: s.businessId })).tasks).toHaveLength(1);
    await check(s, taskId);
    // Done today: still listed today, ticked.
    const ticked = await s.run['haccp.today']({ businessId: s.businessId });
    expect(ticked.tasks).toEqual([
      expect.objectContaining({
        name: 'Schädlingskontrolle',
        done: true,
        doneByName: 'Testperson',
      }),
    ]);
    // Done once in November: not due on any other day of November.
    s.t.clock.setToday('2026-11-15');
    expect((await s.run['haccp.today']({ businessId: s.businessId })).tasks).toEqual([]);
    s.t.clock.setToday('2026-11-30');
    expect((await s.run['haccp.today']({ businessId: s.businessId })).tasks).toEqual([]);
    // December: due again.
    s.t.clock.setToday('2026-12-01');
    expect((await s.run['haccp.today']({ businessId: s.businessId })).tasks).toHaveLength(1);
  });

  it('a daily task is due every day until it is ticked that day', async () => {
    const s = await setup('2026-11-14');
    const { taskId } = await saveTask(s, { name: 'Abfall leeren', frequency: 'daily' });
    expect((await s.run['haccp.today']({ businessId: s.businessId })).tasks[0]?.done).toBe(false);
    await check(s, taskId);
    expect((await s.run['haccp.today']({ businessId: s.businessId })).tasks[0]?.done).toBe(true);
    s.t.clock.setToday('2026-11-15');
    expect((await s.run['haccp.today']({ businessId: s.businessId })).tasks[0]?.done).toBe(false);
  });

  it('a task that is not active is not on the plan today', async () => {
    const s = await setup('2026-11-14');
    await saveTask(s, { name: 'Abfall leeren', frequency: 'daily', active: false });
    const today = await s.run['haccp.today']({ businessId: s.businessId });
    expect(today.tasks).toEqual([]);
    expect(today.plannedTaskCount).toBe(1);
  });
});

describe('hygiene.standardPlan', () => {
  it('creates the starter plan with its rhythm, linked to the areas of its kind, and no second time', async () => {
    const s = await setup();
    expect(
      await s.run['hygiene.standardPlan']({ commandId: s.t.cmd(), businessId: s.businessId }),
    ).toEqual({
      created: 10,
    });
    const { tasks } = await s.run['hygiene.tasks']({ businessId: s.businessId });
    expect(tasks.map((task) => task.frequency)).toEqual([
      'daily',
      'daily',
      'daily',
      'daily',
      'weekly',
      'weekly',
      'weekly',
      'weekly',
      'monthly',
      'monthly',
    ]);
    const byName = Object.fromEntries(tasks.map((task) => [task.name, task]));
    expect(byName['Kühlzelle auswischen']).toMatchObject({
      areaName: 'Kühlzelle',
      weekday: 'mon',
    });
    expect(byName['Tiefkühlzelle abtauen und reinigen']).toMatchObject({
      areaName: 'Tiefkühlzelle',
    });
    expect(byName['Trockenlager kontrollieren']).toMatchObject({
      areaName: 'Trockenlager',
      weekday: 'fri',
    });
    expect(byName['Schädlingskontrolle']?.areaName).toBeUndefined();
    expect(byName['Lager nach FEFO einräumen']?.instructions).toContain('Vorschlag, im eigenen');
    expect(byName['Lager nach FEFO einräumen']?.instructions).toContain(
      'frühesten Datum nach vorn',
    );
    await expect(
      s.run['hygiene.standardPlan']({ commandId: s.t.cmd(), businessId: s.businessId }),
    ).rejects.toMatchObject({ code: 'not_allowed' });
  });

  it('leaves out an area the business does not have', async () => {
    const s = await setup();
    await s.run['areas.delete']({
      commandId: s.t.cmd(),
      businessId: s.businessId,
      areaId: s.kitchen.areas.frozen.id,
    });
    await s.run['hygiene.standardPlan']({ commandId: s.t.cmd(), businessId: s.businessId });
    const { tasks } = await s.run['hygiene.tasks']({ businessId: s.businessId });
    expect(
      tasks.find((task) => task.name === 'Tiefkühlzelle abtauen und reinigen')?.areaName,
    ).toBeUndefined();
  });

  it('is allowed again once every task is removed', async () => {
    const s = await setup();
    const { taskId } = await saveTask(s, { name: 'Abfall leeren', frequency: 'daily' });
    await s.run['hygiene.removeTask']({ commandId: s.t.cmd(), businessId: s.businessId, taskId });
    expect(
      await s.run['hygiene.standardPlan']({ commandId: s.t.cmd(), businessId: s.businessId }),
    ).toEqual({ created: 10 });
  });
});

describe('another business sees no task and no check', () => {
  it('lists nothing and refuses the checks of the first business', async () => {
    const s = await setup();
    const { taskId } = await saveTask(s, { name: 'Abfall leeren', frequency: 'daily' });
    await check(s, taskId);
    const other = await createTestContext({ storage: s.t.storage, idStart: 9000 });
    expect((await other.useCases['hygiene.tasks']({ businessId: other.businessId })).tasks).toEqual(
      [],
    );
    await expect(
      other.useCases['hygiene.check']({
        commandId: other.cmd(),
        businessId: other.businessId,
        taskId,
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });
});
