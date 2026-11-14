import {
  TABLE_NAMES,
  type Business,
  type DomainEvent,
  type TableName,
  type Tables,
} from '@randen/core';
import Dexie, { type EntityTable, type Table } from 'dexie';

/** Result of a command already executed, so repeating the same commandId is harmless. */
export interface ProcessedCommand {
  commandId: string;
  operation: string;
  result: unknown;
  at: string;
}

/** What this device remembers besides business data, e.g. who is working on it. */
export interface MetaEntry {
  key: 'currentStaffId';
  value: string;
}

/** Indexes per table; every table of business data is found by `businessId`. */
const INDEXES: Record<TableName, string> = {
  staff: 'id, businessId',
  areas: 'id, businessId',
  spots: 'id, businessId, areaId',
  suppliers: 'id, businessId',
  articles: 'id, businessId',
  lots: 'id, businessId, articleId',
  movements: 'id, businessId, articleId, lotId, on',
  deliveries: 'id, businessId, receivedOn',
  orders: 'id, businessId',
  counts: 'id, businessId',
  recipes: 'id, businessId',
  productions: 'id, businessId, producedOn',
  menuCards: 'id, businessId',
  planEntries: 'id, businessId, date',
  sales: 'id, businessId, soldOn',
  budgets: 'id, businessId, month',
  temperatureLogs: 'id, businessId, on',
  hygieneTasks: 'id, businessId',
  hygieneChecks: 'id, businessId, on',
};

/**
 * Local-first storage in IndexedDB (ADR-0003). Every row of business data carries businessId,
 * updatedAt and deletedAt; queries ignore soft-deleted rows. New tables and indexes arrive as
 * new Dexie versions, never by changing an existing one.
 */
export class RandenDb extends Dexie {
  businesses!: EntityTable<Business, 'id'>;
  events!: EntityTable<DomainEvent, 'id'>;
  commands!: EntityTable<ProcessedCommand, 'commandId'>;
  meta!: EntityTable<MetaEntry, 'key'>;

  constructor(name = 'randen') {
    super(name);
    this.version(1).stores({
      businesses: 'id',
      ...INDEXES,
      events: 'id, businessId, type, at',
      commands: 'commandId',
      meta: 'key',
    });
  }

  /** The table of one kind of business data, typed by its name. */
  rows<TName extends TableName>(name: TName): Table<Tables[TName], string> {
    return this.table<Tables[TName], string>(name);
  }
}

export { TABLE_NAMES };
