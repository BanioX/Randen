import type { z } from 'zod';
import { IdSchema } from '../ids';

/** Rights an external client would need for an operation (ADR-0005). */
export const SCOPES = [
  'business:read',
  'business:write',
  'stock:read',
  'stock:write',
  'recipes:read',
  'recipes:write',
  'menu:read',
  'menu:write',
  'numbers:read',
  'numbers:write',
  'haccp:read',
  'haccp:write',
] as const;
export type Scope = (typeof SCOPES)[number];

/**
 * One operation of the contract (ADR-0005): a named command or query with Zod schemas for input
 * and output. The app calls exactly these; the same schemas can later generate a REST API and
 * tools for AI assistants.
 */
export interface Operation<
  TInput extends z.ZodType = z.ZodType,
  TOutput extends z.ZodType = z.ZodType,
> {
  name: string;
  kind: 'command' | 'query';
  /** Short description; `en` doubles as a tool description. */
  summary: { de: string; en: string };
  scopes: readonly Scope[];
  input: TInput;
  output: TOutput;
}

/** Every command: an id that makes repeating it harmless, and the business it changes. */
export const commandBase = { commandId: IdSchema, businessId: IdSchema };
/** Every query: the business it reads. */
export const queryBase = { businessId: IdSchema };

export function command<TInput extends z.ZodType, TOutput extends z.ZodType>(
  operation: Omit<Operation<TInput, TOutput>, 'kind'>,
): Operation<TInput, TOutput> & { kind: 'command' } {
  return { ...operation, kind: 'command' };
}

export function query<TInput extends z.ZodType, TOutput extends z.ZodType>(
  operation: Omit<Operation<TInput, TOutput>, 'kind'>,
): Operation<TInput, TOutput> & { kind: 'query' } {
  return { ...operation, kind: 'query' };
}

/** A part of the contract owned by one module. */
export type ContractFragment = Readonly<Record<string, Operation>>;
