/** Plain view models of the plan's rows: the stored fields only, without sync metadata. */
import type { MealCount, MenuLine, WasteWeighing } from '../../model/menu';
import type { MealRow, PlanLine, WeighingRow } from './contract';

export function lineViewOf(line: MenuLine): PlanLine {
  return {
    id: line.id,
    name: line.name,
    ...(line.slot === undefined ? {} : { slot: line.slot }),
    sortOrder: line.sortOrder,
    ...(line.costTargetRappen === undefined ? {} : { costTargetRappen: line.costTargetRappen }),
    ...(line.requiredDiet === undefined ? {} : { requiredDiet: line.requiredDiet }),
    freeOf: line.freeOf,
    active: line.active,
  };
}

export function mealViewOf(meal: MealCount): MealRow {
  return {
    id: meal.id,
    date: meal.date,
    slot: meal.slot,
    ...(meal.lineId === undefined ? {} : { lineId: meal.lineId }),
    ...(meal.expected === undefined ? {} : { expected: meal.expected }),
    ...(meal.served === undefined ? {} : { served: meal.served }),
    ...(meal.note === undefined ? {} : { note: meal.note }),
  };
}

export function weighingViewOf(row: WasteWeighing): WeighingRow {
  return {
    id: row.id,
    date: row.date,
    ...(row.slot === undefined ? {} : { slot: row.slot }),
    ...(row.lineId === undefined ? {} : { lineId: row.lineId }),
    kind: row.kind,
    grams: row.grams,
    ...(row.note === undefined ? {} : { note: row.note }),
  };
}
