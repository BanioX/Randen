/**
 * Ports: the only way the pure logic talks to the outside world (ADR-0003). The app provides
 * adapters (IndexedDB, the browser clock); tests use the memory storage and a fixed clock.
 */
import type { Id } from '../ids';
import type { IsoDateTime, LocalDate } from '../model/primitives';

export interface Clock {
  /** Current instant, ISO 8601 UTC. */
  now: () => IsoDateTime;
  /** Current calendar day in Europe/Zurich. */
  today: () => LocalDate;
}

export interface IdGenerator {
  next: () => Id;
}

export * from './storage';
export { createMemoryStorage } from './memory-storage';
