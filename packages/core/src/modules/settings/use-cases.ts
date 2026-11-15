import {
  CommandError,
  createCommandKit,
  requireRow,
  type AppContext,
  type UseCase,
} from '../../application/command';
import { CONTRACT_V1 } from '../../contract';
import type { Id } from '../../ids';
import { StaffMemberSchema, type Business } from '../../model/business';
import { alive, TABLE_NAMES, type RecordStore, type Storage } from '../../ports/storage';
import {
  activeStaff,
  aboutFigures,
  checkBackup,
  countRows,
  readRows,
  type BackupRows,
  type AnyRow,
} from './backup';
import { BACKUP_FORMAT, BACKUP_VERSION, type BackupDocument } from './contract';

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'de-CH');

/** Names of two people that are the same, ignoring case and accents, would confuse «wer». */
const sameName = (a: string, b: string) =>
  a.localeCompare(b, 'de-CH', { sensitivity: 'base' }) === 0;

/** Use cases of the module «settings»: the team, the business as a whole, its backup. */
export function createSettingsUseCases(ctx: AppContext) {
  const { storage, clock } = ctx;
  const { emit, runCommand, stamps } = createCommandKit(ctx);

  async function business(businessId: Id): Promise<Business> {
    const row = await storage.businesses.get(businessId);
    if (row === undefined) {
      throw new CommandError('not_found', `Business ${businessId} not found`);
    }
    return row;
  }

  /** Every person of the business that is not removed. */
  async function liveStaff(businessId: Id) {
    return alive(await storage.staff.ofBusiness(businessId));
  }

  const listStaff: UseCase<'staff.list'> = async (raw) => {
    const input = CONTRACT_V1['staff.list'].input.parse(raw);
    const rows = await liveStaff(input.businessId);
    return {
      staff: rows
        .sort((a, b) => Number(b.active) - Number(a.active) || byName(a, b))
        .map((row) => ({
          id: row.id,
          name: row.name,
          role: row.role,
          active: row.active,
          acting: row.id === ctx.actor,
        })),
    };
  };

  const saveStaff: UseCase<'staff.save'> = async (raw) => {
    const input = CONTRACT_V1['staff.save'].input.parse(raw);
    return runCommand('staff.save', input.commandId, async () => {
      await business(input.businessId);
      const rows = await liveStaff(input.businessId);
      if (rows.some((row) => row.id !== input.staffId && sameName(row.name, input.name))) {
        throw new CommandError('duplicate_name', `Staff name ${input.name} exists`);
      }
      if (input.staffId === undefined) {
        const row = StaffMemberSchema.parse({
          id: ctx.ids.next(),
          businessId: input.businessId,
          name: input.name,
          role: input.role,
          active: input.active,
          ...stamps(),
        });
        await storage.staff.add(row);
        await emit(input.businessId, 'staff.added', { staffId: row.id, role: row.role });
        return { staffId: row.id };
      }
      const current = await requireRow(storage.staff, input.businessId, input.staffId, 'Person');
      // The last active person stays: without one nobody can book (ADR-0015).
      const stillActive = rows.filter((row) => row.active && row.id !== current.id);
      if (current.active && !input.active && stillActive.length === 0) {
        throw new CommandError('not_allowed', 'The last active person cannot be deactivated');
      }
      const next = StaffMemberSchema.parse({
        ...current,
        name: input.name,
        role: input.role,
        active: input.active,
        updatedAt: clock.now(),
      });
      await storage.staff.put(next);
      await emit(input.businessId, 'staff.changed', { staffId: current.id });
      return { staffId: current.id };
    });
  };

  const removeStaff: UseCase<'staff.remove'> = async (raw) => {
    const input = CONTRACT_V1['staff.remove'].input.parse(raw);
    return runCommand('staff.remove', input.commandId, async () => {
      const current = await requireRow(storage.staff, input.businessId, input.staffId, 'Person');
      if (current.id === ctx.actor) {
        throw new CommandError('not_allowed', 'The person acting cannot be removed');
      }
      const rows = await liveStaff(input.businessId);
      if (
        current.active &&
        rows.filter((row) => row.active && row.id !== current.id).length === 0
      ) {
        throw new CommandError('not_allowed', 'The last active person cannot be removed');
      }
      // A soft delete: the bookings of this person keep the name, so one can still ask back.
      const now = clock.now();
      await storage.staff.put(
        StaffMemberSchema.parse({ ...current, deletedAt: now, updatedAt: now }),
      );
      await emit(input.businessId, 'staff.removed', { staffId: current.id });
      return { staffId: current.id };
    });
  };

  const exportBackup: UseCase<'settings.export'> = async (raw) => {
    const input = CONTRACT_V1['settings.export'].input.parse(raw);
    const row = await business(input.businessId);
    const rows = await readRows(storage, input.businessId);
    const document: BackupDocument = {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportedAt: clock.now(),
      app: 'Randen',
      business: row,
      tables: rows,
      counts: countRows(rows),
    };
    return document;
  };

  // Synchronous on purpose: a check reads the file and writes nothing (no command, no storage).
  const previewImport: UseCase<'settings.importPreview'> = (raw) => {
    const input = CONTRACT_V1['settings.importPreview'].input.parse(raw);
    return Promise.resolve(checkBackup(input.data).preview);
  };

  const importBackup: UseCase<'settings.import'> = async (raw) => {
    const input = CONTRACT_V1['settings.import'].input.parse(raw);
    return runCommand('settings.import', input.commandId, async () => {
      // The device may hold no business any more (after «Alles löschen»): then there is nothing
      // to purge, and the file comes back as it is.
      const check = checkBackup(input.data);
      if (check.backup === undefined) {
        // One bad row refuses the whole file; nothing has been written yet.
        throw new CommandError('invalid', 'The backup does not fit');
      }
      const { backup } = check;
      const incoming = backup.business.id;
      // What is on the device goes, and the business the file holds comes back as it was.
      await storage.purge(input.businessId);
      if (incoming !== input.businessId && (await storage.businesses.get(incoming)) !== undefined) {
        await storage.purge(incoming);
      }
      await storage.businesses.put(backup.business);
      await writeRows(storage, backup.rows);
      const staff = activeStaff(backup.rows.staff)[0];
      if (staff === undefined) {
        throw new CommandError('invalid', 'The backup has no active person');
      }
      const total = countRows(backup.rows);
      await emit(incoming, 'business.imported', {
        exportedAt: check.preview.exportedAt ?? clock.now(),
        rows: TABLE_NAMES.reduce((sum, name) => sum + total[name], 0),
      });
      return { businessId: incoming, staffId: staff.id };
    });
  };

  const deleteAll: UseCase<'settings.deleteAll'> = async (raw) => {
    const input = CONTRACT_V1['settings.deleteAll'].input.parse(raw);
    return runCommand('settings.deleteAll', input.commandId, async () => {
      await business(input.businessId);
      await storage.purge(input.businessId);
      // The one event that stays: that the business was deleted, without any of its data.
      await emit(input.businessId, 'business.deleted', {});
      return { businessId: input.businessId };
    });
  };

  const about: UseCase<'settings.about'> = async (raw) => {
    const input = CONTRACT_V1['settings.about'].input.parse(raw);
    await business(input.businessId);
    return aboutFigures(await readRows(storage, input.businessId));
  };

  return {
    'staff.list': listStaff,
    'staff.save': saveStaff,
    'staff.remove': removeStaff,
    'settings.export': exportBackup,
    'settings.importPreview': previewImport,
    'settings.import': importBackup,
    'settings.deleteAll': deleteAll,
    'settings.about': about,
  };
}

/** Writes every row of every table; the caller has checked them and cleared the old rows. */
async function writeRows(storage: Storage, rows: BackupRows): Promise<void> {
  for (const name of TABLE_NAMES) {
    const store = storage[name] as RecordStore<AnyRow>;
    for (const row of rows[name] as AnyRow[]) {
      await store.put(row);
    }
  }
}
