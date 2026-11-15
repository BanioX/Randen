import type { AppContext } from '../../application/command';
import { createLinesUseCases } from './lines-use-cases';
import { createPlanUseCases } from './plan-use-cases';
import { createRunUseCases } from './production-runs';

/**
 * Use cases of the module «production»: one function per operation of its contract. The runs
 * («Produktion»), the menu plan with «Reste verwerten» and the auto fill, and the settings and
 * counts of the plan (lines, meals, weighings).
 */
export function createProductionUseCases(ctx: AppContext) {
  return {
    ...createRunUseCases(ctx),
    ...createPlanUseCases(ctx),
    ...createLinesUseCases(ctx),
  };
}
