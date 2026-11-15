import { describe, expect, it } from 'vitest';
import { createTestContext } from '../src/testing';

describe('a reset of a business empties the command log too', () => {
  it('forgets the results of earlier commands, so no name of the business stays on the device', async () => {
    const t = await createTestContext();
    const commandId = t.cmd();
    await t.useCases['business.update']({
      commandId,
      businessId: t.businessId,
      name: 'Zum Goldenen Randen',
    });
    // The result of the command is in the log: it carries the new name.
    expect(await t.storage.commands.find(commandId)).toBeDefined();

    await t.storage.purge(t.businessId);

    expect(await t.storage.commands.find(commandId)).toBeUndefined();
    expect(await t.storage.businesses.get(t.businessId)).toBeUndefined();
  });
});
