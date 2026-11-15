import type { DomainEvent } from '../../contract/events';
import type { Id } from '../../ids';
import type { Business } from '../../model/business';
import { TABLE_NAMES, type RecordStore, type Storage, type TableName } from '../../ports/storage';

/**
 * A storage for building the demo before it is written: plain maps, one business, no copies.
 * The reference memory storage copies every row in and out so that tests cannot change stored
 * data by accident; the demo reads all lots thousands of times while it walks eight weeks, and
 * there the copies cost seconds on a phone. Safe here because the stock ledger and the demo
 * never change a row they read: they build a new one and put it. Nothing in it outlives the
 * command; a failure simply drops it.
 */
export function createScratchStorage(): Storage {
  function store<TRecord extends { id: Id; businessId: Id }>(): RecordStore<TRecord> {
    const rows = new Map<string, TRecord>();
    return {
      get: (id) => Promise.resolve(rows.get(id)),
      ofBusiness: (businessId) =>
        Promise.resolve([...rows.values()].filter((row) => row.businessId === businessId)),
      add: (record) => {
        if (rows.has(record.id)) {
          return Promise.reject(new Error(`Row ${record.id} exists`));
        }
        rows.set(record.id, record);
        return Promise.resolve();
      },
      put: (record) => {
        rows.set(record.id, record);
        return Promise.resolve();
      },
    };
  }
  const stores = Object.fromEntries(TABLE_NAMES.map((name) => [name, store()])) as unknown as {
    [TName in TableName]: Storage[TName];
  };
  const businesses = new Map<string, Business>();
  const events: DomainEvent[] = [];
  const commands = new Map<string, { result: unknown }>();
  return {
    ...stores,
    businesses: {
      get: (id) => Promise.resolve(businesses.get(id)),
      all: () => Promise.resolve([...businesses.values()]),
      add: (business) => {
        businesses.set(business.id, business);
        return Promise.resolve();
      },
      put: (business) => {
        businesses.set(business.id, business);
        return Promise.resolve();
      },
    },
    events: {
      append: (event) => {
        events.push(event);
        return Promise.resolve();
      },
      ofBusiness: (businessId) =>
        Promise.resolve(events.filter((event) => event.businessId === businessId)),
    },
    commands: {
      find: (commandId) => Promise.resolve(commands.get(commandId)),
      record: ({ commandId, result }) => {
        commands.set(commandId, { result });
        return Promise.resolve();
      },
    },
    purge: () => Promise.reject(new Error('A scratch storage is never purged')),
    transaction: (work) => work(),
  };
}
