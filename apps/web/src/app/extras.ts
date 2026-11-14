import { useSyncExternalStore } from 'react';

/**
 * Randen starts with the essentials a kitchen needs every day; everything else is an extra a
 * person switches on under «Betrieb › Funktionen», as a whole («Erweitert») or group by group
 * (ADR-0014, after Rettich ADR-0095). Hiding an extra hides its entry points only: its data stays,
 * in the database and in the backup, and a saved address still opens its page.
 */
export const EXTRA_GROUPS = ['places', 'production', 'numbers', 'team'] as const;

export type ExtraGroup = (typeof EXTRA_GROUPS)[number];

export interface ExtrasState {
  /** «Erweitert»: off shows the essentials only, whatever the groups say. */
  on: boolean;
  groups: Record<ExtraGroup, boolean>;
}

const KEY = 'randen:extras';
const CHANGE = 'randen-extras-change';

const allGroups = (value: boolean) =>
  Object.fromEntries(EXTRA_GROUPS.map((group) => [group, value])) as Record<ExtraGroup, boolean>;

/** Everything shown: for businesses that existed before the switch, and when nothing is stored. */
export const ALL_EXTRAS: ExtrasState = { on: true, groups: allGroups(true) };

/** A new business: the essentials. Switching «Erweitert» on then shows every group. */
export const ESSENTIALS: ExtrasState = { on: false, groups: allGroups(true) };

function storage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

/** Unknown or broken values count as «shown», so nobody loses a function by accident. */
export function parseExtras(raw: string | null): ExtrasState {
  if (raw === null) {
    return ALL_EXTRAS;
  }
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) {
      return ALL_EXTRAS;
    }
    const { on, groups } = value as { on?: unknown; groups?: unknown };
    const stored = typeof groups === 'object' && groups !== null ? groups : {};
    return {
      on: on !== false,
      groups: Object.fromEntries(
        EXTRA_GROUPS.map((group) => [group, (stored as Record<string, unknown>)[group] !== false]),
      ) as Record<ExtraGroup, boolean>,
    };
  } catch {
    return ALL_EXTRAS;
  }
}

let cache: { raw: string | null; state: ExtrasState } | undefined;
/** Only when the browser refuses storage (private mode): the choice holds until the page closes. */
let fallback: string | null = null;

function rawValue(): string | null {
  try {
    return storage()?.getItem(KEY) ?? fallback;
  } catch {
    return fallback;
  }
}

/** The current choice on this device; the same object while nothing changed (for React). */
export function readExtras(): ExtrasState {
  const raw = rawValue();
  if (cache?.raw !== raw) {
    cache = { raw, state: parseExtras(raw) };
  }
  return cache.state;
}

export function writeExtras(state: ExtrasState): void {
  const raw = JSON.stringify(state);
  try {
    storage()?.setItem(KEY, raw);
    fallback = null;
  } catch {
    fallback = raw;
  }
  window.dispatchEvent(new Event(CHANGE));
}

/** A business was just created on this device: start with the essentials, once. */
export function startWithEssentials(): void {
  try {
    if (storage()?.getItem(KEY) === null) {
      writeExtras(ESSENTIALS);
    }
  } catch {
    // Without storage Randen shows everything.
  }
}

export function isShown(state: ExtrasState, group: ExtraGroup): boolean {
  return state.on && state.groups[group];
}

function subscribe(listener: () => void): () => void {
  window.addEventListener(CHANGE, listener);
  window.addEventListener('storage', listener);
  return () => {
    window.removeEventListener(CHANGE, listener);
    window.removeEventListener('storage', listener);
  };
}

/** The choice, live: every surface follows a switch at once, also in other tabs. */
export function useExtras(): ExtrasState {
  return useSyncExternalStore(subscribe, readExtras, readExtras);
}

/** Whether one group's entry points are shown. */
export function useExtra(group: ExtraGroup): boolean {
  return isShown(useExtras(), group);
}
