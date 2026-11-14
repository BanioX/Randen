import type { DomainEvent } from '../contract/events';
import type { Id } from '../ids';
import type { Business } from '../model/business';
import {
  TABLE_NAMES,
  type BusinessStore,
  type CommandLog,
  type EventLog,
  type RecordStore,
  type Storage,
  type TableName,
} from './storage';

interface Row {
  id: Id;
  businessId: Id;
}

/**
 * Storage in plain memory, for tests of the use cases and as the reference behaviour of the
 * storage ports. Rows are copied in and out, so callers cannot change stored data by accident;
 * a failing transaction restores every table.
 */
export function createMemoryStorage(): Storage {
  const tables: Map<string, unknown>[] = [];
  const table = <TValue>() => {
    const map = new Map<string, TValue>();
    tables.push(map);
    return map;
  };

  function recordStore<TRecord extends Row>(): RecordStore<TRecord> {
    const rows = table<TRecord>();
    return {
      get: (id) => Promise.resolve(copy(rows.get(id))),
      ofBusiness: (businessId) =>
        Promise.resolve(
          [...rows.values()]
            .filter((row) => row.businessId === businessId)
            .map((row) => structuredCopy(row)),
        ),
      add: (record) => {
        if (rows.has(record.id)) {
          return Promise.reject(new Error(`Row ${record.id} exists`));
        }
        rows.set(record.id, structuredCopy(record));
        return Promise.resolve();
      },
      put: (record) => {
        rows.set(record.id, structuredCopy(record));
        return Promise.resolve();
      },
    };
  }

  const businessRows = table<Business>();
  const businesses: BusinessStore = {
    get: (id) => Promise.resolve(copy(businessRows.get(id))),
    all: () => Promise.resolve([...businessRows.values()].map((row) => ({ ...row }))),
    add: (business) => {
      if (businessRows.has(business.id)) {
        return Promise.reject(new Error(`Business ${business.id} exists`));
      }
      businessRows.set(business.id, { ...business });
      return Promise.resolve();
    },
    put: (business) => {
      businessRows.set(business.id, { ...business });
      return Promise.resolve();
    },
  };

  const eventRows = table<DomainEvent>();
  const events: EventLog = {
    append: (event) => {
      eventRows.set(event.id, event);
      return Promise.resolve();
    },
    ofBusiness: (businessId) =>
      Promise.resolve([...eventRows.values()].filter((event) => event.businessId === businessId)),
  };

  const commandRows = table<{ result: unknown }>();
  const commands: CommandLog = {
    find: (commandId) => Promise.resolve(commandRows.get(commandId)),
    record: ({ commandId, result }) => {
      commandRows.set(commandId, { result });
      return Promise.resolve();
    },
  };

  let depth = 0;
  async function transaction<T>(work: () => Promise<T>): Promise<T> {
    if (depth > 0) {
      return work();
    }
    const snapshot = tables.map((rows) => new Map(rows));
    depth += 1;
    try {
      return await work();
    } catch (error) {
      tables.forEach((rows, index) => {
        rows.clear();
        snapshot[index]?.forEach((value, key) => rows.set(key, value));
      });
      throw error;
    } finally {
      depth -= 1;
    }
  }

  const stores = Object.fromEntries(
    TABLE_NAMES.map((name) => [name, recordStore()]),
  ) as unknown as { [TName in TableName]: Storage[TName] };

  return { ...stores, businesses, events, commands, transaction };
}

function copy<TValue extends object>(value: TValue | undefined): TValue | undefined {
  return value === undefined ? undefined : structuredCopy(value);
}

/** Rows hold plain data only (JSON-like), so a JSON round trip is a faithful deep copy. */
function structuredCopy<TValue>(value: TValue): TValue {
  return JSON.parse(JSON.stringify(value)) as TValue;
}
