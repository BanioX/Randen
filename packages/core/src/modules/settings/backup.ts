/**
 * The backup of a business (ADR-0006): reading it, checking a file before it replaces anything,
 * and the figures «Über Randen» shows. Pure rules over the storage; no command runs here.
 */
import {
  alive,
  TABLE_NAMES,
  TABLE_SCHEMAS,
  type Storage,
  type TableName,
  type Tables,
} from '../../ports/storage';
import { BusinessSchema, type Business } from '../../model/business';
import { IsoDateTimeSchema } from '../../model/primitives';
import type { Id } from '../../ids';
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  type AboutFigures,
  type BackupPreview,
  type BackupProblem,
} from './contract';

/** Every row of one kind, whatever its table. */
export type AnyRow = Tables[TableName];

/** The rows of every table, as the schemas accept them. */
export type BackupRows = { [TName in TableName]: Tables[TName][] };

export function emptyCounts(): Record<TableName, number> {
  return Object.fromEntries(TABLE_NAMES.map((name) => [name, 0])) as Record<TableName, number>;
}

/** Every row of every table of one business, soft-deleted ones included. */
export async function readRows(storage: Storage, businessId: Id): Promise<BackupRows> {
  const entries = await Promise.all(
    TABLE_NAMES.map(async (name) => [name, await storage[name].ofBusiness(businessId)] as const),
  );
  return Object.fromEntries(entries) as unknown as BackupRows;
}

export function countRows(rows: BackupRows): Record<TableName, number> {
  return Object.fromEntries(TABLE_NAMES.map((name) => [name, rows[name].length])) as Record<
    TableName,
    number
  >;
}

/** Rows that are not soft-deleted. Movements have no soft delete: every one counts. */
function liveCount(rows: readonly object[]): number {
  return rows.filter((row) => !('deletedAt' in row) || row.deletedAt === undefined).length;
}

/** Whether a table name is one of the business tables. */
export function isTableName(name: string): name is TableName {
  return (TABLE_NAMES as string[]).includes(name);
}

export function activeStaff(rows: readonly Tables['staff'][]): Tables['staff'][] {
  return alive(rows)
    .filter((row) => row.active)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** The result of checking a file: what the preview shows, and the rows when they may come back. */
export interface BackupCheck {
  preview: BackupPreview;
  /** Present only when the file is importable: the business and every row, parsed. */
  backup?: { business: Business; rows: BackupRows };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function refused(problems: BackupProblem[], counts = emptyCounts()): BackupCheck {
  return {
    preview: { recognised: false, importable: false, rows: 0, counts, problems },
  };
}

/**
 * Reads a file as a backup (ADR-0006). Every row is checked with the schema of its table and must
 * belong to the business in the file; a missing or unknown table, a missing active person and an
 * unknown version each keep the file from coming back. Nothing is written here.
 */
export function checkBackup(data: unknown): BackupCheck {
  if (!isRecord(data) || data.format !== BACKUP_FORMAT) {
    return refused([{ kind: 'format' }]);
  }
  if (data.version !== BACKUP_VERSION) {
    const version =
      typeof data.version === 'number' || typeof data.version === 'string'
        ? String(data.version)
        : undefined;
    return refused([{ kind: 'version', ...(version === undefined ? {} : { version }) }]);
  }

  const problems: BackupProblem[] = [];
  const businessRead = BusinessSchema.safeParse(data.business);
  if (!businessRead.success) {
    problems.push({ kind: 'business' });
  }
  const business = businessRead.success ? businessRead.data : undefined;
  const exported = IsoDateTimeSchema.safeParse(data.exportedAt);

  const tables = isRecord(data.tables) ? data.tables : undefined;
  if (tables === undefined) {
    // Without a table list there is nothing to check row by row: one problem says so.
    problems.push({ kind: 'table' });
    return { preview: previewOf(problems, emptyCounts(), businessRead, exported) };
  }

  const counts = emptyCounts();
  const rows = Object.fromEntries(TABLE_NAMES.map((name) => [name, []])) as unknown as BackupRows;
  for (const name of TABLE_NAMES) {
    const raw = tables[name];
    if (!Array.isArray(raw)) {
      problems.push({ kind: 'table', table: name });
      continue;
    }
    counts[name] = raw.length;
    for (const row of raw as unknown[]) {
      const id = isRecord(row) && typeof row.id === 'string' ? row.id : undefined;
      const parsed = TABLE_SCHEMAS[name].safeParse(row);
      const foreign =
        parsed.success && business !== undefined && parsed.data.businessId !== business.id;
      if (!parsed.success || foreign) {
        problems.push({ kind: 'row', table: name, ...(id === undefined ? {} : { id }) });
      } else {
        (rows[name] as AnyRow[]).push(parsed.data);
      }
    }
  }
  for (const key of Object.keys(tables)) {
    if (!isTableName(key)) {
      problems.push({ kind: 'table', table: key });
    }
  }
  if (activeStaff(rows.staff).length === 0) {
    problems.push({ kind: 'staff' });
  }

  const preview = previewOf(problems, counts, businessRead, exported);
  if (problems.length > 0 || business === undefined) {
    return { preview };
  }
  return { preview, backup: { business, rows } };
}

/** The preview of a file of this version: what it holds and what keeps it from coming back. */
function previewOf(
  problems: BackupProblem[],
  counts: Record<TableName, number>,
  businessRead: ReturnType<typeof BusinessSchema.safeParse>,
  exported: ReturnType<typeof IsoDateTimeSchema.safeParse>,
): BackupPreview {
  return {
    recognised: true,
    importable: problems.length === 0,
    rows: TABLE_NAMES.reduce((sum, name) => sum + counts[name], 0),
    counts,
    problems,
    ...(businessRead.success ? { businessName: businessRead.data.name } : {}),
    ...(exported.success ? { exportedAt: exported.data } : {}),
  };
}

/** The figures of «Über Randen»: alive rows per table, the span of movements, the photos. */
export function aboutFigures(rows: BackupRows): AboutFigures {
  const counts = Object.fromEntries(
    TABLE_NAMES.map((name) => [name, liveCount(rows[name])]),
  ) as Record<TableName, number>;
  const days = rows.movements.map((movement) => movement.on).sort((a, b) => a.localeCompare(b));
  const pictures = [
    ...alive(rows.areas),
    ...alive(rows.spots),
    ...alive(rows.recipes),
    ...alive(rows.deliveries),
  ].flatMap((row) => (row.photo === undefined ? [] : [row.photo]));
  const first = days[0];
  const last = days.at(-1);
  return {
    counts,
    movements: {
      ...(first === undefined ? {} : { oldest: first }),
      ...(last === undefined ? {} : { newest: last }),
    },
    photos: {
      count: pictures.length,
      characters: pictures.reduce((sum, photo) => sum + photo.length, 0),
    },
  };
}
