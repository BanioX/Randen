import { LocalDateSchema, type LocalDate } from '@randen/core';

/** The day of the last backup, remembered on this device for the reminder (SE-12). */
export const LAST_BACKUP_KEY = 'randen:last-backup';

/** The day of the last backup, or null when there was none or the browser keeps nothing. */
export function readLastBackup(): LocalDate | null {
  try {
    const parsed = LocalDateSchema.safeParse(window.localStorage.getItem(LAST_BACKUP_KEY));
    return parsed.success ? parsed.data : null;
  } catch {
    // A private window keeps no storage: the reminder simply does not show.
    return null;
  }
}

export function writeLastBackup(day: LocalDate): void {
  try {
    window.localStorage.setItem(LAST_BACKUP_KEY, day);
  } catch {
    // Without storage the next visit reminds again; the backup itself is saved.
  }
}
