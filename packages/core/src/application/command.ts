import { DomainEventSchema, type DomainEvent } from '../contract/events';
import {
  CONTRACT_V1,
  type OperationInput,
  type OperationName,
  type OperationOutput,
} from '../contract';
import type { Id } from '../ids';
import type { Clock, IdGenerator } from '../ports';
import type { RecordStore, Storage } from '../ports/storage';

/**
 * What every use case gets (ADR-0003): storage and the outside world only through ports, so the
 * same code runs in the browser (Dexie), in tests (memory) and later on a server.
 */
export interface AppContext {
  storage: Storage;
  clock: Clock;
  ids: IdGenerator;
  /** The staff member acting (author of events, movements and records). */
  actor: Id;
}

/** One contract operation, implemented. */
export type UseCase<TName extends OperationName> = (
  input: OperationInput<TName>,
) => Promise<OperationOutput<TName>>;

/** Every operation of the contract, implemented. */
export type UseCases = { [TName in OperationName]: UseCase<TName> };

export type CommandErrorCode =
  /** The row does not exist, belongs to another business or was deleted. */
  | 'not_found'
  /** The input is well-formed but makes no sense here (a quantity above what the lot holds). */
  | 'invalid'
  /** Another row already has this name. */
  | 'duplicate_name'
  /** The row is still used elsewhere and cannot be removed. */
  | 'in_use'
  /** The stock does not cover what the command needs. */
  | 'insufficient_stock'
  /** The row is in a state that does not allow the command (an order already received). */
  | 'not_allowed';

/** An error a person can do something about; the UI turns the code into a sentence. */
export class CommandError extends Error {
  readonly code: CommandErrorCode;

  constructor(code: CommandErrorCode, message: string) {
    super(message);
    this.name = 'CommandError';
    this.code = code;
  }
}

/** The live row with this id in this business, or a `not_found` error naming `what`. */
export async function requireRow<TRecord extends { id: Id; businessId: Id; deletedAt?: unknown }>(
  store: RecordStore<TRecord>,
  businessId: Id,
  id: Id,
  what: string,
): Promise<TRecord> {
  const row = await store.get(id);
  if (row?.businessId !== businessId || row.deletedAt !== undefined) {
    throw new CommandError('not_found', `${what} ${id} not found`);
  }
  return row;
}

/**
 * What every command needs (ADR-0005): one transaction, idempotency by commandId (a repeated
 * command returns the stored result) and domain events with actor and time.
 */
export function createCommandKit({ storage, clock, ids, actor }: AppContext) {
  function event(businessId: Id, type: string, payload: Record<string, unknown>): DomainEvent {
    return DomainEventSchema.parse({
      id: ids.next(),
      type,
      version: 1,
      businessId,
      actor,
      at: clock.now(),
      payload,
    });
  }

  /** Appends one event; a command calls this at least once. */
  async function emit(
    businessId: Id,
    type: string,
    payload: Record<string, unknown> = {},
  ): Promise<void> {
    await storage.events.append(event(businessId, type, payload));
  }

  async function runCommand<TName extends OperationName>(
    name: TName,
    commandId: Id,
    execute: () => Promise<OperationOutput<TName>>,
  ): Promise<OperationOutput<TName>> {
    return storage.transaction(async () => {
      const done = await storage.commands.find(commandId);
      if (done !== undefined) {
        return CONTRACT_V1[name].output.parse(done.result) as OperationOutput<TName>;
      }
      const result = await execute();
      await storage.commands.record({ commandId, operation: name, result, at: clock.now() });
      return result;
    });
  }

  /** `createdAt` and `updatedAt` of a new row. */
  function stamps() {
    const now = clock.now();
    return { createdAt: now, updatedAt: now };
  }

  return { event, emit, runCommand, stamps };
}

export type CommandKit = ReturnType<typeof createCommandKit>;
