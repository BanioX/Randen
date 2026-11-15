/**
 * The settings and daily counts of the plan (ADR-0015): menu lines («Menü 1», «Vegi»), meal
 * counts per day, meal and line, and weighed leftovers. None of them touches the stock ledger.
 */
import {
  CommandError,
  createCommandKit,
  requireRow,
  type AppContext,
  type UseCase,
} from '../../application/command';
import { CONTRACT_V1 } from '../../contract';
import type { Id } from '../../ids';
import {
  MealCountSchema,
  MenuLineSchema,
  PLAN_SLOTS,
  WasteWeighingSchema,
  type MenuLine,
  type PlanEntry,
  type PlanSlot,
} from '../../model/menu';
import type { LocalDate } from '../../model/primitives';
import { alive } from '../../ports/storage';
import type { PlannedMeal } from './contract';
import { lineViewOf, mealViewOf, weighingViewOf } from './views';

/** Names are compared as a person reads them: no case, no spaces at the ends. */
const nameKey = (name: string) => name.trim().toLocaleLowerCase('de-CH');

function assertFreeName(lines: readonly MenuLine[], name: string, except?: Id): void {
  if (lines.some((line) => line.id !== except && nameKey(line.name) === nameKey(name))) {
    throw new CommandError('duplicate_name', `MenuLine ${name} exists already`);
  }
}

/** Dishes of the plan in a range, summed per day, meal and line: what the plan expects. */
export function plannedMeals(entries: readonly PlanEntry[]): PlannedMeal[] {
  const groups = new Map<string, PlannedMeal>();
  for (const entry of entries) {
    const key = `${entry.date}|${entry.slot}|${entry.lineId ?? ''}`;
    const known = groups.get(key);
    groups.set(key, {
      date: entry.date,
      slot: entry.slot,
      ...(entry.lineId === undefined ? {} : { lineId: entry.lineId }),
      portions: (known?.portions ?? 0) + entry.portions,
    });
  }
  return [...groups.values()];
}

/** Use cases of the plan's settings and counts: lines, meal counts and weighings. */
export function createLinesUseCases(ctx: AppContext) {
  const { storage, clock, ids } = ctx;
  const { emit, runCommand, stamps } = createCommandKit(ctx);

  const sortedLines = async (businessId: Id): Promise<MenuLine[]> =>
    alive(await storage.menuLines.ofBusiness(businessId)).sort((a, b) => a.sortOrder - b.sortOrder);

  const linesList: UseCase<'plan.linesList'> = async (raw) => {
    const input = CONTRACT_V1['plan.linesList'].input.parse(raw);
    const lines = await sortedLines(input.businessId);
    return {
      lines: lines.filter((line) => input.includeInactive || line.active).map(lineViewOf),
    };
  };

  const linesCreate: UseCase<'plan.lineCreate'> = async (raw) => {
    const input = CONTRACT_V1['plan.lineCreate'].input.parse(raw);
    return runCommand('plan.lineCreate', input.commandId, async () => {
      const { businessId } = input;
      const lines = await sortedLines(businessId);
      assertFreeName(lines, input.name);
      const lineId = ids.next();
      const sortOrder =
        lines.length === 0 ? 0 : Math.max(...lines.map((line) => line.sortOrder)) + 1;
      await storage.menuLines.add(
        MenuLineSchema.parse({
          id: lineId,
          businessId,
          name: input.name,
          ...(input.slot === undefined ? {} : { slot: input.slot }),
          sortOrder,
          ...(input.costTargetRappen === undefined
            ? {}
            : { costTargetRappen: input.costTargetRappen }),
          ...(input.requiredDiet === undefined ? {} : { requiredDiet: input.requiredDiet }),
          freeOf: input.freeOf,
          active: true,
          ...stamps(),
        }),
      );
      await emit(businessId, 'plan.line_created', { lineId, name: input.name });
      return { lineId };
    });
  };

  const linesUpdate: UseCase<'plan.lineUpdate'> = async (raw) => {
    const input = CONTRACT_V1['plan.lineUpdate'].input.parse(raw);
    return runCommand('plan.lineUpdate', input.commandId, async () => {
      const { businessId, lineId } = input;
      const line = await requireRow(storage.menuLines, businessId, lineId, 'MenuLine');
      if (input.name !== undefined) {
        assertFreeName(await sortedLines(businessId), input.name, lineId);
      }
      const next: Record<string, unknown> = {
        ...line,
        name: input.name ?? line.name,
        freeOf: input.freeOf ?? line.freeOf,
        active: input.active ?? line.active,
        updatedAt: clock.now(),
      };
      const slot = input.slot === undefined ? line.slot : (input.slot ?? undefined);
      const cost =
        input.costTargetRappen === undefined
          ? line.costTargetRappen
          : (input.costTargetRappen ?? undefined);
      const diet =
        input.requiredDiet === undefined ? line.requiredDiet : (input.requiredDiet ?? undefined);
      if (slot === undefined) {
        delete next.slot;
      } else {
        next.slot = slot;
      }
      if (cost === undefined) {
        delete next.costTargetRappen;
      } else {
        next.costTargetRappen = cost;
      }
      if (diet === undefined) {
        delete next.requiredDiet;
      } else {
        next.requiredDiet = diet;
      }
      await storage.menuLines.put(MenuLineSchema.parse(next));
      const changed = [
        input.name === undefined ? null : 'name',
        input.slot === undefined ? null : 'slot',
        input.costTargetRappen === undefined ? null : 'costTargetRappen',
        input.requiredDiet === undefined ? null : 'requiredDiet',
        input.freeOf === undefined ? null : 'freeOf',
        input.active === undefined ? null : 'active',
      ].filter((field): field is string => field !== null);
      await emit(businessId, 'plan.line_updated', { lineId, fields: changed });
      return { lineId };
    });
  };

  const linesReorder: UseCase<'plan.lineReorder'> = async (raw) => {
    const input = CONTRACT_V1['plan.lineReorder'].input.parse(raw);
    return runCommand('plan.lineReorder', input.commandId, async () => {
      const { businessId } = input;
      const lines = await sortedLines(businessId);
      const wanted = new Set(input.lineIds);
      const complete =
        wanted.size === input.lineIds.length &&
        wanted.size === lines.length &&
        lines.every((line) => wanted.has(line.id));
      if (!complete) {
        throw new CommandError('invalid', 'The order must name every menu line once');
      }
      const now = clock.now();
      for (const [index, lineId] of input.lineIds.entries()) {
        const line = lines.find((candidate) => candidate.id === lineId);
        if (line !== undefined && line.sortOrder !== index) {
          await storage.menuLines.put({ ...line, sortOrder: index, updatedAt: now });
        }
      }
      await emit(businessId, 'plan.lines_reordered', { count: input.lineIds.length });
      return { count: input.lineIds.length };
    });
  };

  const mealsList: UseCase<'plan.mealsList'> = async (raw) => {
    const input = CONTRACT_V1['plan.mealsList'].input.parse(raw);
    const { businessId, from, to } = input;
    const inRange = (date: LocalDate) => date >= from && date <= to;
    const meals = alive(await storage.mealCounts.ofBusiness(businessId))
      .filter((meal) => inRange(meal.date))
      .sort((a, b) => a.date.localeCompare(b.date) || slotOrder(a.slot) - slotOrder(b.slot));
    const entries = alive(await storage.planEntries.ofBusiness(businessId)).filter((entry) =>
      inRange(entry.date),
    );
    return { meals: meals.map(mealViewOf), planned: plannedMeals(entries) };
  };

  const mealsSet: UseCase<'plan.mealsSet'> = async (raw) => {
    const input = CONTRACT_V1['plan.mealsSet'].input.parse(raw);
    return runCommand('plan.mealsSet', input.commandId, async () => {
      const { businessId, date, slot, lineId } = input;
      if (lineId !== undefined) {
        await requireRow(storage.menuLines, businessId, lineId, 'MenuLine');
      }
      const existing = alive(await storage.mealCounts.ofBusiness(businessId)).find(
        (meal) => meal.date === date && meal.slot === slot && meal.lineId === lineId,
      );
      const expected =
        input.expected === undefined ? existing?.expected : (input.expected ?? undefined);
      const served = input.served === undefined ? existing?.served : (input.served ?? undefined);
      const note = input.note === undefined ? existing?.note : (input.note ?? undefined);
      const now = clock.now();
      const empty = expected === undefined && served === undefined && note === undefined;
      if (existing !== undefined && empty) {
        await storage.mealCounts.put({ ...existing, deletedAt: now, updatedAt: now });
        await emit(businessId, 'plan.meals_set', { date, slot, removed: true });
        return {};
      }
      if (empty) {
        return {};
      }
      const mealId = existing?.id ?? ids.next();
      await storage.mealCounts.put(
        MealCountSchema.parse({
          id: mealId,
          businessId,
          date,
          slot,
          ...(lineId === undefined ? {} : { lineId }),
          ...(expected === undefined ? {} : { expected }),
          ...(served === undefined ? {} : { served }),
          ...(note === undefined ? {} : { note }),
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
        }),
      );
      await emit(businessId, 'plan.meals_set', {
        date,
        slot,
        mealId,
        expected: expected ?? null,
        served: served ?? null,
      });
      return { mealId };
    });
  };

  const weighingsList: UseCase<'plan.weighingsList'> = async (raw) => {
    const input = CONTRACT_V1['plan.weighingsList'].input.parse(raw);
    const rows = alive(await storage.wasteWeighings.ofBusiness(input.businessId))
      .filter((row) => row.date >= input.from && row.date <= input.to)
      .sort((a, b) => a.date.localeCompare(b.date) || slotOrder(a.slot) - slotOrder(b.slot));
    return { weighings: rows.map(weighingViewOf) };
  };

  const weighingsAdd: UseCase<'plan.weighingAdd'> = async (raw) => {
    const input = CONTRACT_V1['plan.weighingAdd'].input.parse(raw);
    return runCommand('plan.weighingAdd', input.commandId, async () => {
      const { businessId } = input;
      if (input.lineId !== undefined) {
        await requireRow(storage.menuLines, businessId, input.lineId, 'MenuLine');
      }
      const weighingId = ids.next();
      await storage.wasteWeighings.add(
        WasteWeighingSchema.parse({
          id: weighingId,
          businessId,
          date: input.date,
          ...(input.slot === undefined ? {} : { slot: input.slot }),
          ...(input.lineId === undefined ? {} : { lineId: input.lineId }),
          kind: input.kind,
          grams: input.grams,
          ...(input.note === undefined ? {} : { note: input.note }),
          ...stamps(),
        }),
      );
      await emit(businessId, 'plan.weighing_added', {
        weighingId,
        kind: input.kind,
        grams: input.grams,
      });
      return { weighingId };
    });
  };

  const weighingsRemove: UseCase<'plan.weighingRemove'> = async (raw) => {
    const input = CONTRACT_V1['plan.weighingRemove'].input.parse(raw);
    return runCommand('plan.weighingRemove', input.commandId, async () => {
      const row = await requireRow(
        storage.wasteWeighings,
        input.businessId,
        input.weighingId,
        'Weighing',
      );
      const now = clock.now();
      await storage.wasteWeighings.put({ ...row, deletedAt: now, updatedAt: now });
      await emit(input.businessId, 'plan.weighing_removed', { weighingId: row.id });
      return { weighingId: row.id };
    });
  };

  return {
    'plan.linesList': linesList,
    'plan.lineCreate': linesCreate,
    'plan.lineUpdate': linesUpdate,
    'plan.lineReorder': linesReorder,
    'plan.mealsList': mealsList,
    'plan.mealsSet': mealsSet,
    'plan.weighingsList': weighingsList,
    'plan.weighingAdd': weighingsAdd,
    'plan.weighingRemove': weighingsRemove,
  };
}

/** The meals of a day in their order, as the plan lists them; no meal sorts last. */
function slotOrder(slot: PlanSlot | undefined): number {
  return slot === undefined ? PLAN_SLOTS.length : PLAN_SLOTS.indexOf(slot);
}
