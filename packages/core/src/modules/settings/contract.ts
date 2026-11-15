import { z } from 'zod';
import {
  command,
  commandBase,
  query,
  queryBase,
  type ContractFragment,
} from '../../contract/operation';
import { IdSchema } from '../../ids';
import { BusinessSchema, StaffRoleSchema } from '../../model/business';
import { IsoDateTimeSchema, LocalDateSchema, nameSchema } from '../../model/primitives';
import { TABLE_NAMES, TABLE_SCHEMAS, type TableName } from '../../ports/storage';

/** The format name and the version every backup file carries (ADR-0006: the file is ours). */
export const BACKUP_FORMAT = 'randen-backup';
export const BACKUP_VERSION = 1;

/** One table of the business, by its name in the storage. */
export const TableNameSchema = z.enum(Object.keys(TABLE_SCHEMAS) as [TableName, ...TableName[]]);

/** Rows per table, every table of `TABLE_NAMES` (a missing table is a problem, not a zero). */
export const TableCountsSchema = z.object(
  Object.fromEntries(TABLE_NAMES.map((name) => [name, z.int().min(0)])) as Record<
    TableName,
    z.ZodInt
  >,
);

/** The rows of every table, each checked by the schema of its table (`TABLE_SCHEMAS`). */
export const BackupTablesSchema = z.object(
  Object.fromEntries(TABLE_NAMES.map((name) => [name, z.array(TABLE_SCHEMAS[name])])) as {
    [TName in TableName]: z.ZodArray<(typeof TABLE_SCHEMAS)[TName]>;
  },
);

/** The whole business as one document («Sicherung», ADR-0006). */
export const BackupDocumentSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  version: z.literal(BACKUP_VERSION),
  exportedAt: IsoDateTimeSchema,
  app: z.literal('Randen'),
  business: BusinessSchema,
  tables: BackupTablesSchema,
  counts: TableCountsSchema,
});
export type BackupDocument = z.infer<typeof BackupDocumentSchema>;

/** One thing that keeps a backup from coming back: a row, a table, the version, the team. */
export const BackupProblemSchema = z.object({
  kind: z.enum(['format', 'version', 'business', 'table', 'row', 'staff']),
  table: z.string().optional(),
  id: z.string().optional(),
  version: z.string().optional(),
});
export type BackupProblem = z.infer<typeof BackupProblemSchema>;

/** What a file holds, read without changing anything (`settings.importPreview`). */
export const BackupPreviewSchema = z.object({
  /** A Randen backup of a known version. */
  recognised: z.boolean(),
  /** Nothing in it blocks the import: every row fits its schema and belongs to this business. */
  importable: z.boolean(),
  businessName: z.string().optional(),
  exportedAt: IsoDateTimeSchema.optional(),
  /** All rows of the file, soft-deleted ones included. */
  rows: z.int().min(0),
  counts: TableCountsSchema,
  problems: z.array(BackupProblemSchema),
});
export type BackupPreview = z.infer<typeof BackupPreviewSchema>;

/** What the storage holds about the photos and the movements, for «Über Randen». */
export const AboutFiguresSchema = z.object({
  counts: TableCountsSchema,
  movements: z.object({
    oldest: LocalDateSchema.optional(),
    newest: LocalDateSchema.optional(),
  }),
  photos: z.object({
    count: z.int().min(0),
    /** Size of the pictures as stored, in characters of their data URL. */
    characters: z.int().min(0),
  }),
});
export type AboutFigures = z.infer<typeof AboutFiguresSchema>;

/**
 * Operations of the module «settings»: the team, the business as a whole («Betrieb»), its
 * backup and deletion. `business.get`, `business.update` and the list of the team for pickers
 * are the lookup module's (ADR-0005).
 */
export const settingsContract = {
  'staff.list': query({
    name: 'staff.list',
    summary: {
      de: 'Das Team mit Rolle, Aktiv-Status und der Person, die gerade arbeitet.',
      en: 'The team with role, active flag and the person acting now.',
    },
    scopes: ['business:read'],
    input: z.object({ ...queryBase }),
    output: z.object({
      staff: z.array(
        z.object({
          id: IdSchema,
          name: z.string(),
          role: StaffRoleSchema,
          active: z.boolean(),
          acting: z.boolean(),
        }),
      ),
    }),
  }),
  'staff.save': command({
    name: 'staff.save',
    summary: {
      de: 'Eine Person ins Team aufnehmen oder Name, Rolle und Aktiv-Status ändern.',
      en: 'Add a person to the team or change name, role and active flag.',
    },
    scopes: ['business:write'],
    input: z.object({
      ...commandBase,
      staffId: IdSchema.optional(),
      name: nameSchema(60),
      role: StaffRoleSchema,
      active: z.boolean(),
    }),
    output: z.object({ staffId: IdSchema }),
  }),
  'staff.remove': command({
    name: 'staff.remove',
    summary: {
      de: 'Eine Person aus dem Team entfernen; ihre Buchungen bleiben mit dem Namen.',
      en: 'Remove a person from the team; their bookings keep the name.',
    },
    scopes: ['business:write'],
    input: z.object({ ...commandBase, staffId: IdSchema }),
    output: z.object({ staffId: IdSchema }),
  }),
  'settings.export': query({
    name: 'settings.export',
    summary: {
      de: 'Den ganzen Betrieb als eine Sicherung lesen, auch gelöschte Zeilen.',
      en: 'Read the whole business as one backup, soft-deleted rows included.',
    },
    scopes: ['business:read'],
    input: z.object({ ...queryBase }),
    output: BackupDocumentSchema,
  }),
  'settings.importPreview': query({
    name: 'settings.importPreview',
    summary: {
      de: 'Eine Sicherung prüfen, ohne etwas zu ändern: Betrieb, Datum, Zeilen und Probleme.',
      en: 'Check a backup without changing anything: business, date, rows and problems.',
    },
    scopes: ['business:read'],
    input: z.object({ ...queryBase, data: z.unknown() }),
    output: BackupPreviewSchema,
  }),
  'settings.import': command({
    name: 'settings.import',
    summary: {
      de: 'Eine Sicherung zurückholen: ersetzt alles, was auf dem Gerät ist.',
      en: 'Restore a backup: replaces everything on the device.',
    },
    scopes: ['business:write'],
    input: z.object({
      ...commandBase,
      data: z.unknown(),
      confirm: z.literal(true),
    }),
    output: z.object({ businessId: IdSchema, staffId: IdSchema }),
  }),
  'settings.deleteAll': command({
    name: 'settings.deleteAll',
    summary: {
      de: 'Den Betrieb mit allen Daten von diesem Gerät löschen.',
      en: 'Delete the business and all its data from this device.',
    },
    scopes: ['business:write'],
    input: z.object({ ...commandBase, confirm: z.literal(true) }),
    output: z.object({ businessId: IdSchema }),
  }),
  'settings.about': query({
    name: 'settings.about',
    summary: {
      de: 'Zeilen je Tabelle, Zeitraum der Bewegungen und Fotos für «Über Randen».',
      en: 'Rows per table, the span of movements and the photos, for «About».',
    },
    scopes: ['business:read'],
    input: z.object({ ...queryBase }),
    output: AboutFiguresSchema,
  }),
} as const satisfies ContractFragment;
