import { createAreasUseCases } from '../modules/areas/use-cases';
import { createArticlesUseCases } from '../modules/articles/use-cases';
import { createCockpitUseCases } from '../modules/cockpit/use-cases';
import { createDemoUseCases } from '../modules/demo/use-cases';
import { createHaccpUseCases } from '../modules/haccp/use-cases';
import { createLookupUseCases } from '../modules/lookup/use-cases';
import { createMenuUseCases } from '../modules/menu/use-cases';
import { createNumbersUseCases } from '../modules/numbers/use-cases';
import { createProductionUseCases } from '../modules/production/use-cases';
import { createPurchasingUseCases } from '../modules/purchasing/use-cases';
import { createRecipesUseCases } from '../modules/recipes/use-cases';
import { createSalesUseCases } from '../modules/sales/use-cases';
import { createSettingsUseCases } from '../modules/settings/use-cases';
import { createStockUseCases } from '../modules/stock/use-cases';
import type { AppContext, UseCases } from './command';

export * from './command';
export * from './stock-ledger';
export * from './bootstrap';

/**
 * Every operation of the contract, implemented on the given ports. The type makes sure nothing
 * is missing: an operation without a use case does not compile.
 */
export function createUseCases(ctx: AppContext): UseCases {
  return {
    ...createLookupUseCases(ctx),
    ...createArticlesUseCases(ctx),
    ...createAreasUseCases(ctx),
    ...createStockUseCases(ctx),
    ...createRecipesUseCases(ctx),
    ...createProductionUseCases(ctx),
    ...createMenuUseCases(ctx),
    ...createPurchasingUseCases(ctx),
    ...createSalesUseCases(ctx),
    ...createNumbersUseCases(ctx),
    ...createCockpitUseCases(ctx),
    ...createHaccpUseCases(ctx),
    ...createSettingsUseCases(ctx),
    ...createDemoUseCases(ctx),
  };
}
