import {
  TABLE_NAMES,
  type Id,
  type RecordStore,
  type Storage,
  type TableName,
  type Tables,
} from '@randen/core';
import type { RandenDb } from './db';

/**
 * The storage ports (ADR-0003) on IndexedDB. Rows are validated by the use cases before they
 * get here; this adapter only maps calls to Dexie tables and indexes.
 */
export function dexieStorage(db: RandenDb): Storage {
  function recordStore<TName extends TableName>(name: TName): RecordStore<Tables[TName]> {
    const table = db.rows(name);
    return {
      get: (id: Id) => table.get(id),
      ofBusiness: (businessId: Id) => table.where('businessId').equals(businessId).toArray(),
      add: async (record) => {
        await table.add(record);
      },
      put: async (record) => {
        await table.put(record);
      },
    };
  }

  const stores = Object.fromEntries(
    TABLE_NAMES.map((name) => [name, recordStore(name)]),
  ) as unknown as { [TName in TableName]: Storage[TName] };

  return {
    ...stores,
    businesses: {
      get: (id) => db.businesses.get(id),
      all: () => db.businesses.toArray(),
      add: async (business) => {
        await db.businesses.add(business);
      },
      put: async (business) => {
        await db.businesses.put(business);
      },
    },
    events: {
      append: async (event) => {
        await db.events.add(event);
      },
      ofBusiness: (businessId) => db.events.where('businessId').equals(businessId).toArray(),
    },
    commands: {
      find: (commandId) => db.commands.get(commandId),
      record: async (entry) => {
        await db.commands.add(entry);
      },
    },
    purge: async (businessId) => {
      await db.transaction('rw', db.tables, async () => {
        for (const name of TABLE_NAMES) {
          await db.rows(name).where('businessId').equals(businessId).delete();
        }
        await db.events.where('businessId').equals(businessId).delete();
        await db.businesses.delete(businessId);
      });
    },
    // All tables: IndexedDB locks them only for the length of one short local command.
    transaction: (work) => db.transaction('rw', db.tables, work),
  };
}
