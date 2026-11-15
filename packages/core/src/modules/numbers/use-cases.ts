import {
  CommandError,
  createCommandKit,
  type AppContext,
  type UseCase,
} from '../../application/command';
import { CONTRACT_V1 } from '../../contract';
import { daysBetween } from '../../dates';
import type { LocalDate } from '../../model/primitives';
import { BudgetSchema } from '../../model/sales';
import { alive } from '../../ports/storage';
import { loadNumbers } from './data';
import {
  breakEvenView,
  budgetHistoryOf,
  budgetOf,
  budgetRowOf,
  monthReportOf,
  overviewOf,
  proposalOf,
  wasteReportOf,
} from './figures';

/** A period runs from its first day to its last, both counted; the end may not come first. */
function assertPeriod(from: LocalDate, to: LocalDate): void {
  if (daysBetween(from, to) < 0) {
    throw new CommandError('invalid', 'Das Ende des Zeitraums liegt vor seinem Anfang.');
  }
}

/** Use cases of «Zahlen»: the figures of the ledger and the sales, and the budget of a month. */
export function createNumbersUseCases(ctx: AppContext) {
  const { storage, clock, ids } = ctx;
  const { emit, runCommand } = createCommandKit(ctx);

  const overview: UseCase<'numbers.overview'> = async (raw) => {
    const input = CONTRACT_V1['numbers.overview'].input.parse(raw);
    assertPeriod(input.from, input.to);
    const data = await loadNumbers(ctx, input.businessId);
    return overviewOf(data, input.from, input.to);
  };

  const getBudgets: UseCase<'budgets.get'> = async (raw) => {
    const input = CONTRACT_V1['budgets.get'].input.parse(raw);
    const data = await loadNumbers(ctx, input.businessId);
    const row = budgetRowOf(data, input.month);
    const proposal = row === undefined ? proposalOf(data, input.month) : undefined;
    return {
      month: input.month,
      ...(row === undefined ? {} : { budget: row }),
      ...(proposal === undefined ? {} : { proposal: proposal.fields, proposalFrom: proposal.from }),
      history: budgetHistoryOf(data, input.month),
    };
  };

  const setBudget: UseCase<'budgets.set'> = async (raw) => {
    const input = CONTRACT_V1['budgets.set'].input.parse(raw);
    return runCommand('budgets.set', input.commandId, async () => {
      const { businessId, month } = input;
      const existing = alive(await storage.budgets.ofBusiness(businessId))
        .filter((row) => row.month === month)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
      const now = clock.now();
      const costPerMeal = input.costPerMealRappen ?? existing?.costPerMealRappen;
      const saved = BudgetSchema.parse({
        id: existing?.id ?? ids.next(),
        businessId,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        month,
        purchaseBudgetRappen: input.purchaseBudgetRappen,
        ...(input.revenueTargetRappen === undefined
          ? {}
          : { revenueTargetRappen: input.revenueTargetRappen }),
        ...(input.targetFoodCostBps === undefined
          ? {}
          : { targetFoodCostBps: input.targetFoodCostBps }),
        ...(input.fixedCostsRappen === undefined
          ? {}
          : { fixedCostsRappen: input.fixedCostsRappen }),
        // Left out: the goods per meal the month already has stays.
        ...(costPerMeal === undefined ? {} : { costPerMealRappen: costPerMeal }),
        ...(input.note === undefined ? {} : { note: input.note }),
      });
      await storage.budgets.put(saved);
      await emit(businessId, 'budget.set', { budgetId: saved.id, month });
      return { budget: saved };
    });
  };

  const budgetFigures: UseCase<'numbers.budget'> = async (raw) => {
    const input = CONTRACT_V1['numbers.budget'].input.parse(raw);
    return budgetOf(await loadNumbers(ctx, input.businessId), input.month);
  };

  const breakEven: UseCase<'numbers.breakEven'> = async (raw) => {
    const input = CONTRACT_V1['numbers.breakEven'].input.parse(raw);
    return breakEvenView(await loadNumbers(ctx, input.businessId), input.month);
  };

  const waste: UseCase<'numbers.waste'> = async (raw) => {
    const input = CONTRACT_V1['numbers.waste'].input.parse(raw);
    assertPeriod(input.from, input.to);
    return wasteReportOf(await loadNumbers(ctx, input.businessId), input.from, input.to);
  };

  const monthReport: UseCase<'numbers.monthReport'> = async (raw) => {
    const input = CONTRACT_V1['numbers.monthReport'].input.parse(raw);
    return monthReportOf(await loadNumbers(ctx, input.businessId), input.month);
  };

  return {
    'numbers.overview': overview,
    'budgets.get': getBudgets,
    'budgets.set': setBudget,
    'numbers.budget': budgetFigures,
    'numbers.breakEven': breakEven,
    'numbers.waste': waste,
    'numbers.monthReport': monthReport,
  };
}
