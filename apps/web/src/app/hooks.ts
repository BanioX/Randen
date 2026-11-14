import {
  CommandError,
  type Business,
  type CommandName,
  type OperationInput,
  type OperationOutput,
  type QueryName,
} from '@randen/core';
import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useMemo } from 'react';
import { useAppData } from './AppData';
import { messages } from './messages';
import { moneyIn, type Money } from './money-format';

/** What a page passes to a query: everything but the business, which the app knows. */
export type QueryInput<TName extends QueryName> = Omit<OperationInput<TName>, 'businessId'>;
/** What a page passes to a command: the app adds the business and a fresh command id. */
export type CommandInput<TName extends CommandName> = Omit<
  OperationInput<TName>,
  'businessId' | 'commandId'
>;

export type QueryResult<TData> =
  | { status: 'loading'; data: undefined; error: undefined }
  | { status: 'ready'; data: TData; error: undefined }
  | { status: 'error'; data: undefined; error: unknown };

const LOADING = { status: 'loading', data: undefined, error: undefined } as const;

/**
 * Runs a query of the contract and keeps it fresh: whenever a command changes data the query
 * read, the page gets the new result (ADR-0003). `status` tells loading from an error such as
 * `not_found`, so a page can say «gibt es nicht mehr» instead of loading forever.
 *
 * `enabled: false` waits (for an id that is not known yet). The input must be plain data.
 */
export function useQueryResult<TName extends QueryName>(
  name: TName,
  input: QueryInput<TName>,
  options: { enabled?: boolean } = {},
): QueryResult<OperationOutput<TName>> {
  const { useCases, businessId, today } = useAppData();
  const enabled = options.enabled ?? true;
  const key = JSON.stringify(input);
  const result = useLiveQuery(
    async (): Promise<QueryResult<OperationOutput<TName>>> => {
      if (!enabled) {
        return LOADING;
      }
      const run = useCases[name] as unknown as (input: unknown) => Promise<OperationOutput<TName>>;
      try {
        const data = await run({ ...(JSON.parse(key) as object), businessId });
        return { status: 'ready', data, error: undefined };
      } catch (error) {
        return { status: 'error', data: undefined, error };
      }
    },
    // `today`: a new day changes what «läuft heute ab» means.
    [useCases, businessId, name, key, enabled, today],
  );
  return result ?? LOADING;
}

/** Like `useQueryResult`, for pages that only need the data: undefined while loading or on error. */
export function useQuery<TName extends QueryName>(
  name: TName,
  input: QueryInput<TName>,
  options: { enabled?: boolean } = {},
): OperationOutput<TName> | undefined {
  return useQueryResult(name, input, options).data;
}

/**
 * Returns `run(name, input)` for commands of the contract. It adds the business and a new
 * command id; it rejects with a `CommandError` a page can show with `errorText`.
 */
export function useCommand() {
  const { useCases, businessId, ids } = useAppData();
  return useCallback(
    <TName extends CommandName>(
      name: TName,
      input: CommandInput<TName>,
    ): Promise<OperationOutput<TName>> => {
      const run = useCases[name] as unknown as (input: unknown) => Promise<OperationOutput<TName>>;
      return run({ ...input, businessId, commandId: ids.next() });
    },
    [useCases, businessId, ids],
  );
}

/** A sentence for a failed command, in the words of the app. */
export function errorText(error: unknown): string {
  if (error instanceof CommandError) {
    return messages.errors.codes[error.code];
  }
  return messages.errors.unknown;
}

/** True if the error says the row is gone (deleted, or an old link). */
export function isNotFound(error: unknown): boolean {
  return error instanceof CommandError && error.code === 'not_found';
}

/** The business, live: name, kind, target food cost, default VAT. */
export function useBusiness(): Business {
  const { business } = useAppData();
  return useQuery('business.get', {})?.business ?? business;
}

/** Amounts in the business currency (ADR-0004): format, read typed input, show the symbol. */
export function useMoney(): Money {
  const { currency } = useAppData();
  return useMemo(() => moneyIn(currency), [currency]);
}

/** The Swiss calendar day, refreshed when the app comes back to the front. */
export function useToday() {
  return useAppData().today;
}
