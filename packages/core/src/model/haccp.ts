import { z } from 'zod';
import { IdSchema } from '../ids';
import {
  DeciCelsiusSchema,
  IsoDateTimeSchema,
  LocalDateSchema,
  nameSchema,
  syncFields,
  textSchema,
  WeekdaySchema,
} from './primitives';

export const TemperatureKindSchema = z.enum([
  'storage',
  'receiving',
  'cooking',
  'hot_holding',
  'cooling',
]);
export type TemperatureKind = z.infer<typeof TemperatureKindSchema>;

export function temperatureKindLabel(kind: TemperatureKind): string {
  return {
    storage: 'Lagerung',
    receiving: 'Wareneingang',
    cooking: 'Kerntemperatur',
    hot_holding: 'Heisshalten',
    cooling: 'Abkühlen',
  }[kind];
}

/**
 * One measured temperature of the self-control («Selbstkontrolle»). The limits valid at the
 * time are stored with it, so a later change of an area does not rewrite history.
 */
export const TemperatureLogSchema = z.object({
  ...syncFields,
  kind: TemperatureKindSchema,
  areaId: IdSchema.optional(),
  /** What was measured when it is not an area: «Poulet, Kern», «Suppe im Bain-Marie». */
  label: nameSchema(80).optional(),
  deciC: DeciCelsiusSchema,
  minDeciC: DeciCelsiusSchema.optional(),
  maxDeciC: DeciCelsiusSchema.optional(),
  ok: z.boolean(),
  /** What was done when the value was out of range. */
  action: textSchema(300).optional(),
  on: LocalDateSchema,
  measuredAt: IsoDateTimeSchema,
  measuredBy: IdSchema,
});
export type TemperatureLog = z.infer<typeof TemperatureLogSchema>;

export const TaskFrequencySchema = z.enum(['daily', 'weekly', 'monthly']);
export type TaskFrequency = z.infer<typeof TaskFrequencySchema>;

/** A recurring hygiene task («Reinigungsplan»): what, where, how often. */
export const HygieneTaskSchema = z.object({
  ...syncFields,
  name: nameSchema(100),
  areaId: IdSchema.optional(),
  frequency: TaskFrequencySchema,
  /** For weekly tasks: the day it is due. */
  weekday: WeekdaySchema.optional(),
  instructions: textSchema(500).optional(),
  active: z.boolean(),
});
export type HygieneTask = z.infer<typeof HygieneTaskSchema>;

/** A task done and signed («erledigt von»). */
export const HygieneCheckSchema = z.object({
  ...syncFields,
  taskId: IdSchema,
  on: LocalDateSchema,
  doneAt: IsoDateTimeSchema,
  doneBy: IdSchema,
  note: textSchema(300).optional(),
});
export type HygieneCheck = z.infer<typeof HygieneCheckSchema>;
