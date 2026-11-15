import { describe, expect, it } from 'vitest';
import { CommandError, type DomainEvent, type Id } from '../src';
import { createTestContext, seedKitchen, type TestContext } from '../src/testing';

async function setup() {
  const t = await createTestContext();
  await seedKitchen(t);
  return { t, run: t.useCases, businessId: t.businessId, actor: t.actor };
}

/** The error a refused command threw, to look at its code. */
async function refusal(promise: Promise<unknown>): Promise<CommandError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof CommandError) {
      return error;
    }
    throw error;
  }
  throw new Error('Expected the command to be refused');
}

async function eventsOf(t: TestContext, type: string): Promise<DomainEvent[]> {
  return (await t.storage.events.ofBusiness(t.businessId)).filter((event) => event.type === type);
}

describe('staff.list', () => {
  it('lists the person of the device as acting, and nobody else', async () => {
    const { run, businessId, actor } = await setup();
    const { staff } = await run['staff.list']({ businessId });
    expect(staff).toEqual([
      { id: actor, name: 'Testperson', role: 'chef', active: true, acting: true },
    ]);
  });

  it('puts the active people first and sorts them by name, removed ones are gone', async () => {
    const { t, run, businessId } = await setup();
    const zoe = await run['staff.save']({
      commandId: t.cmd(),
      businessId,
      name: 'Zoe',
      role: 'cook',
      active: true,
    });
    const anna = await run['staff.save']({
      commandId: t.cmd(),
      businessId,
      name: 'Anna',
      role: 'service',
      active: false,
    });
    await run['staff.remove']({ commandId: t.cmd(), businessId, staffId: zoe.staffId });
    const { staff } = await run['staff.list']({ businessId });
    expect(staff.map((row) => row.name)).toEqual(['Testperson', 'Anna']);
    expect(staff[1]).toMatchObject({ id: anna.staffId, active: false, acting: false });
  });

  it('says nothing about another business', async () => {
    const { t, run } = await setup();
    const other = await createTestContext({ storage: t.storage, idStart: 50_000 });
    await other.useCases['staff.save']({
      commandId: other.cmd(),
      businessId: other.businessId,
      name: 'Fremd',
      role: 'owner',
      active: true,
    });
    const { staff } = await run['staff.list']({ businessId: t.businessId });
    expect(staff.map((row) => row.name)).toEqual(['Testperson']);
  });
});

describe('staff.save', () => {
  it('adds a person and emits staff.added with id and role', async () => {
    const { t, run, businessId } = await setup();
    const { staffId } = await run['staff.save']({
      commandId: t.cmd(),
      businessId,
      name: '  Anna Muster ',
      role: 'cook',
      active: true,
    });
    const row = await t.storage.staff.get(staffId);
    expect(row).toMatchObject({ name: 'Anna Muster', role: 'cook', active: true, businessId });
    const [event] = await eventsOf(t, 'staff.added');
    expect(event?.payload).toEqual({ staffId, role: 'cook' });
  });

  it('changes name, role and active flag of a person and emits staff.changed', async () => {
    const { t, run, businessId, actor } = await setup();
    const other = await run['staff.save']({
      commandId: t.cmd(),
      businessId,
      name: 'Ben',
      role: 'cook',
      active: true,
    });
    const result = await run['staff.save']({
      commandId: t.cmd(),
      businessId,
      staffId: other.staffId,
      name: 'Ben Probe',
      role: 'purchasing',
      active: false,
    });
    expect(result).toEqual({ staffId: other.staffId });
    expect(await t.storage.staff.get(other.staffId)).toMatchObject({
      name: 'Ben Probe',
      role: 'purchasing',
      active: false,
    });
    expect(await eventsOf(t, 'staff.changed')).toHaveLength(1);
    expect(actor).toBeDefined();
  });

  it('keeps the name of the person when it is saved again unchanged', async () => {
    const { t, run, businessId } = await setup();
    const { staffId } = await run['staff.save']({
      commandId: t.cmd(),
      businessId,
      name: 'Carla',
      role: 'service',
      active: true,
    });
    await expect(
      run['staff.save']({
        commandId: t.cmd(),
        businessId,
        staffId,
        name: 'Carla',
        role: 'service',
        active: true,
      }),
    ).resolves.toEqual({ staffId });
  });

  it('refuses a second person with the same name, ignoring case', async () => {
    const { t, run, businessId } = await setup();
    await run['staff.save']({
      commandId: t.cmd(),
      businessId,
      name: 'Anna',
      role: 'cook',
      active: true,
    });
    const error = await refusal(
      run['staff.save']({
        commandId: t.cmd(),
        businessId,
        name: 'ANNA',
        role: 'service',
        active: true,
      }),
    );
    expect(error.code).toBe('duplicate_name');
  });

  it('refuses to deactivate the last active person', async () => {
    const { t, run, businessId, actor } = await setup();
    const error = await refusal(
      run['staff.save']({
        commandId: t.cmd(),
        businessId,
        staffId: actor,
        name: 'Testperson',
        role: 'chef',
        active: false,
      }),
    );
    expect(error.code).toBe('not_allowed');
    expect(await t.storage.staff.get(actor)).toMatchObject({ active: true });
  });

  it('refuses a person that does not exist, or that belongs to another business', async () => {
    const { t, run, businessId } = await setup();
    const unknown = await refusal(
      run['staff.save']({
        commandId: t.cmd(),
        businessId,
        staffId: t.ids.next(),
        name: 'Niemand',
        role: 'other',
        active: true,
      }),
    );
    expect(unknown.code).toBe('not_found');
    const other = await createTestContext({ storage: t.storage, idStart: 60_000 });
    const foreign = await refusal(
      run['staff.save']({
        commandId: t.cmd(),
        businessId,
        staffId: other.actor,
        name: 'Fremd',
        role: 'other',
        active: true,
      }),
    );
    expect(foreign.code).toBe('not_found');
  });

  it('fails for a business that does not exist', async () => {
    const { t, run } = await setup();
    const error = await refusal(
      run['staff.save']({
        commandId: t.cmd(),
        businessId: t.ids.next(),
        name: 'Niemand',
        role: 'other',
        active: true,
      }),
    );
    expect(error.code).toBe('not_found');
  });

  it('writes nothing again for the same command id', async () => {
    const { t, run, businessId } = await setup();
    const commandId = t.cmd();
    const first = await run['staff.save']({
      commandId,
      businessId,
      name: 'Dora',
      role: 'cook',
      active: true,
    });
    const again = await run['staff.save']({
      commandId,
      businessId,
      name: 'Dora',
      role: 'cook',
      active: true,
    });
    expect(again).toEqual(first);
    const dora = (await t.storage.staff.ofBusiness(businessId)).filter(
      (row) => row.name === 'Dora',
    );
    expect(dora).toHaveLength(1);
    expect(await eventsOf(t, 'staff.added')).toHaveLength(1);
  });
});

describe('staff.remove', () => {
  it('removes a person softly, the row stays with its name for the bookings', async () => {
    const { t, run, businessId } = await setup();
    const { staffId } = await run['staff.save']({
      commandId: t.cmd(),
      businessId,
      name: 'Elif',
      role: 'cook',
      active: true,
    });
    await run['staff.remove']({ commandId: t.cmd(), businessId, staffId });
    const row = await t.storage.staff.get(staffId);
    expect(row).toMatchObject({ name: 'Elif' });
    expect(row?.deletedAt).toBeDefined();
    const [event] = await eventsOf(t, 'staff.removed');
    expect(event?.payload).toEqual({ staffId });
  });

  it('refuses to remove the person acting now', async () => {
    const { t, run, businessId, actor } = await setup();
    await run['staff.save']({
      commandId: t.cmd(),
      businessId,
      name: 'Fritz',
      role: 'cook',
      active: true,
    });
    const error = await refusal(
      run['staff.remove']({ commandId: t.cmd(), businessId, staffId: actor }),
    );
    expect(error.code).toBe('not_allowed');
  });

  it('refuses to remove the last active person', async () => {
    const { t, run, businessId, actor } = await setup();
    const { staffId } = await run['staff.save']({
      commandId: t.cmd(),
      businessId,
      name: 'Gina',
      role: 'cook',
      active: true,
    });
    // Gina is the only active person once the acting one is switched off.
    await run['staff.save']({
      commandId: t.cmd(),
      businessId,
      staffId: actor,
      name: 'Testperson',
      role: 'chef',
      active: false,
    });
    const error = await refusal(run['staff.remove']({ commandId: t.cmd(), businessId, staffId }));
    expect(error.code).toBe('not_allowed');
    expect((await t.storage.staff.get(staffId))?.deletedAt).toBeUndefined();
  });

  it('removes an inactive person freely, even when only one is active', async () => {
    const { t, run, businessId } = await setup();
    const { staffId } = await run['staff.save']({
      commandId: t.cmd(),
      businessId,
      name: 'Hana',
      role: 'cook',
      active: false,
    });
    await expect(run['staff.remove']({ commandId: t.cmd(), businessId, staffId })).resolves.toEqual(
      { staffId },
    );
  });

  it('refuses a person that does not exist, and repeats the stored result for the same command', async () => {
    const { t, run, businessId } = await setup();
    const unknown = await refusal(
      run['staff.remove']({ commandId: t.cmd(), businessId, staffId: t.ids.next() }),
    );
    expect(unknown.code).toBe('not_found');
    const { staffId } = await run['staff.save']({
      commandId: t.cmd(),
      businessId,
      name: 'Ivo',
      role: 'cook',
      active: true,
    });
    const commandId: Id = t.cmd();
    await run['staff.remove']({ commandId, businessId, staffId });
    await expect(run['staff.remove']({ commandId, businessId, staffId })).resolves.toEqual({
      staffId,
    });
    expect(await eventsOf(t, 'staff.removed')).toHaveLength(1);
  });
});
