import { useSyncExternalStore } from 'react';

/**
 * The view of this device (ADR-0014, ADR-0015): «Erweitert» shows the detailed evaluations,
 * history and journal of the functions the business uses; off shows the essentials. Which
 * functions exist is the business's choice (`modules.ts`); this is only how deep a device shows
 * them, like the office computer next to the tablet at the pass. A view, no business data: it
 * stays on the device and outside the backup (SE-13).
 */
const KEY = 'randen:extras';
const CHANGE = 'randen-view-change';

function storage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

/**
 * Reads the stored choice. Nothing or something unreadable counts as «Erweitert», so nobody
 * loses a function by accident. The value keeps the shape of ADR-0014 (`{ on }`); the groups it
 * once held are ignored since ADR-0015.
 */
export function parseDetailed(raw: string | null): boolean {
  if (raw === null) {
    return true;
  }
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) {
      return true;
    }
    return (value as { on?: unknown }).on !== false;
  } catch {
    return true;
  }
}

/** Only when the browser refuses storage (private mode): the choice holds until the page closes. */
let fallback: string | null = null;

function rawValue(): string | null {
  try {
    return storage()?.getItem(KEY) ?? fallback;
  } catch {
    return fallback;
  }
}

export function readDetailed(): boolean {
  return parseDetailed(rawValue());
}

export function writeDetailed(detailed: boolean): void {
  const raw = JSON.stringify({ on: detailed });
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
      writeDetailed(false);
    }
  } catch {
    // Without storage Randen shows everything.
  }
}

function subscribe(listener: () => void): () => void {
  window.addEventListener(CHANGE, listener);
  window.addEventListener('storage', listener);
  return () => {
    window.removeEventListener(CHANGE, listener);
    window.removeEventListener('storage', listener);
  };
}

/** Whether this device shows the detailed view, live: every surface follows a switch at once. */
export function useDetailed(): boolean {
  return useSyncExternalStore(subscribe, readDetailed, readDetailed);
}
