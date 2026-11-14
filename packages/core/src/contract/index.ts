import { z } from 'zod';
import { areasContract } from '../modules/areas/contract';
import { articlesContract } from '../modules/articles/contract';
import { cockpitContract } from '../modules/cockpit/contract';
import { haccpContract } from '../modules/haccp/contract';
import { lookupContract } from '../modules/lookup/contract';
import { menuContract } from '../modules/menu/contract';
import { numbersContract } from '../modules/numbers/contract';
import { productionContract } from '../modules/production/contract';
import { purchasingContract } from '../modules/purchasing/contract';
import { recipesContract } from '../modules/recipes/contract';
import { settingsContract } from '../modules/settings/contract';
import { stockContract } from '../modules/stock/contract';

export * from './events';
export * from './operation';

/**
 * Contract v1 (ADR-0005): every action of Randen as a named command or query. Each module owns
 * its part (`modules/<name>/contract.ts`); this is the sum. The app calls exactly these.
 */
export const CONTRACT_V1 = {
  ...lookupContract,
  ...articlesContract,
  ...areasContract,
  ...stockContract,
  ...recipesContract,
  ...productionContract,
  ...menuContract,
  ...purchasingContract,
  ...numbersContract,
  ...cockpitContract,
  ...haccpContract,
  ...settingsContract,
} as const;

/** The parts, to check that no two modules define the same operation. */
export const CONTRACT_FRAGMENTS = {
  lookup: lookupContract,
  articles: articlesContract,
  areas: areasContract,
  stock: stockContract,
  recipes: recipesContract,
  production: productionContract,
  menu: menuContract,
  purchasing: purchasingContract,
  numbers: numbersContract,
  cockpit: cockpitContract,
  haccp: haccpContract,
  settings: settingsContract,
} as const;

export type ContractV1 = typeof CONTRACT_V1;
export type OperationName = keyof ContractV1;
export type OperationInput<TName extends OperationName> = z.input<ContractV1[TName]['input']>;
export type OperationOutput<TName extends OperationName> = z.output<ContractV1[TName]['output']>;
export type CommandName = {
  [TName in OperationName]: ContractV1[TName]['kind'] extends 'command' ? TName : never;
}[OperationName];
export type QueryName = Exclude<OperationName, CommandName>;

export const OPERATION_NAMES = Object.keys(CONTRACT_V1) as OperationName[];

/** JSON Schema of every operation: what an OpenAPI document and tool definitions are built from. */
export function contractJsonSchemas() {
  return OPERATION_NAMES.map((name) => {
    const operation = CONTRACT_V1[name];
    return {
      name,
      kind: operation.kind,
      summary: operation.summary,
      scopes: operation.scopes,
      input: z.toJSONSchema(operation.input, { io: 'input' }),
      output: z.toJSONSchema(operation.output),
    };
  });
}
