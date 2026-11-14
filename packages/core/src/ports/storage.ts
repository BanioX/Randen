/**
 * Storage ports (ADR-0003): how the use cases read and write the data of a business without
 * knowing the database. The browser implements them with Dexie (IndexedDB), tests with
 * `createMemoryStorage`, a later server with PostgreSQL.
 */
import type { z } from 'zod';
import type { DomainEvent } from '../contract/events';
import type { Id } from '../ids';
import { ArticleSchema, SupplierSchema } from '../model/article';
import { StaffMemberSchema, type Business } from '../model/business';
import { HygieneCheckSchema, HygieneTaskSchema, TemperatureLogSchema } from '../model/haccp';
import { MenuCardSchema, PlanEntrySchema } from '../model/menu';
import type { IsoDateTime } from '../model/primitives';
import { ProductionSchema, RecipeSchema } from '../model/recipe';
import { BudgetSchema, SaleSchema } from '../model/sales';
import {
  DeliverySchema,
  InventoryCountSchema,
  PurchaseOrderSchema,
  StockLotSchema,
  StockMovementSchema,
} from '../model/stock';
import { StorageAreaSchema, StorageSpotSchema } from '../model/storage-area';

/**
 * Every table of business data with the schema of its rows. One list drives the memory
 * storage, the IndexedDB adapter, export and import, so a new table cannot be forgotten.
 */
export const TABLE_SCHEMAS = {
  staff: StaffMemberSchema,
  areas: StorageAreaSchema,
  spots: StorageSpotSchema,
  suppliers: SupplierSchema,
  articles: ArticleSchema,
  lots: StockLotSchema,
  movements: StockMovementSchema,
  deliveries: DeliverySchema,
  orders: PurchaseOrderSchema,
  counts: InventoryCountSchema,
  recipes: RecipeSchema,
  productions: ProductionSchema,
  menuCards: MenuCardSchema,
  planEntries: PlanEntrySchema,
  sales: SaleSchema,
  budgets: BudgetSchema,
  temperatureLogs: TemperatureLogSchema,
  hygieneTasks: HygieneTaskSchema,
  hygieneChecks: HygieneCheckSchema,
} as const;

export type TableName = keyof typeof TABLE_SCHEMAS;
export const TABLE_NAMES = Object.keys(TABLE_SCHEMAS) as TableName[];
export type Tables = { [TName in TableName]: z.output<(typeof TABLE_SCHEMAS)[TName]> };

/** One table. Soft-deleted rows are returned; callers filter them (`alive`). */
export interface RecordStore<TRecord extends { id: Id; businessId: Id }> {
  get: (id: Id) => Promise<TRecord | undefined>;
  /** Every row of one business, in no particular order. */
  ofBusiness: (businessId: Id) => Promise<TRecord[]>;
  /** Inserts a new row; fails if the id exists. */
  add: (record: TRecord) => Promise<void>;
  /** Inserts or replaces a row. */
  put: (record: TRecord) => Promise<void>;
}

export interface BusinessStore {
  get: (id: Id) => Promise<Business | undefined>;
  all: () => Promise<Business[]>;
  add: (business: Business) => Promise<void>;
  put: (business: Business) => Promise<void>;
}

/** Results of commands already executed: a repeated commandId returns the stored result. */
export interface CommandLog {
  find: (commandId: Id) => Promise<{ result: unknown } | undefined>;
  record: (entry: {
    commandId: Id;
    operation: string;
    result: unknown;
    at: IsoDateTime;
  }) => Promise<void>;
}

export interface EventLog {
  append: (event: DomainEvent) => Promise<void>;
  ofBusiness: (businessId: Id) => Promise<DomainEvent[]>;
}

export type Storage = { [TName in TableName]: RecordStore<Tables[TName]> } & {
  businesses: BusinessStore;
  events: EventLog;
  commands: CommandLog;
  /**
   * Runs `work` atomically: all its writes happen or none. Only storage calls may be awaited
   * inside (no network, no timers), because IndexedDB ends a transaction at the first foreign
   * await.
   */
  transaction: <T>(work: () => Promise<T>) => Promise<T>;
};

/** Rows that are not soft-deleted. */
export function alive<TRecord extends { deletedAt?: unknown }>(
  rows: readonly TRecord[],
): TRecord[] {
  return rows.filter((row) => row.deletedAt === undefined);
}
