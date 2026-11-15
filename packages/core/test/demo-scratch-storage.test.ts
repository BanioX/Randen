import { describe, expect, it } from 'vitest';
import { createScratchStorage } from '../src/modules/demo/scratch-storage';
import { createTestContext } from '../src/testing';

describe('the scratch storage of the demo', () => {
  it('keeps rows of one business without copying them, and refuses a second row with an id', async () => {
    const t = await createTestContext();
    const scratch = createScratchStorage();
    const business = await t.storage.businesses.get(t.businessId);
    if (business === undefined) {
      throw new Error('no business');
    }
    await scratch.businesses.add(business);
    expect(await scratch.businesses.all()).toEqual([business]);
    await scratch.businesses.put({ ...business, name: 'Anders' });
    expect((await scratch.businesses.get(t.businessId))?.name).toBe('Anders');

    const [member] = await t.storage.staff.ofBusiness(t.businessId);
    if (member === undefined) {
      throw new Error('no staff');
    }
    await scratch.staff.add(member);
    // The same object comes back: nothing is copied.
    expect(await scratch.staff.get(member.id)).toBe(member);
    expect(await scratch.staff.ofBusiness(t.businessId)).toEqual([member]);
    expect(await scratch.staff.ofBusiness(t.cmd())).toEqual([]);
    await expect(scratch.staff.add(member)).rejects.toThrow(/exists/);
    await scratch.staff.put({ ...member, name: 'Mara' });
    expect((await scratch.staff.get(member.id))?.name).toBe('Mara');

    const event = {
      id: t.cmd(),
      type: 'demo.loaded',
      version: 1 as const,
      businessId: t.businessId,
      actor: t.actor,
      at: t.clock.now(),
      payload: {},
    };
    await scratch.events.append(event);
    expect(await scratch.events.ofBusiness(t.businessId)).toEqual([event]);
    const commandId = t.cmd();
    expect(await scratch.commands.find(commandId)).toBeUndefined();
    await scratch.commands.record({
      commandId,
      operation: 'demo.load',
      result: 1,
      at: t.clock.now(),
    });
    expect(await scratch.commands.find(commandId)).toEqual({ result: 1 });
    expect(await scratch.transaction(() => Promise.resolve(7))).toBe(7);
    await expect(scratch.purge(t.businessId)).rejects.toThrow(/never purged/);
  });
});
