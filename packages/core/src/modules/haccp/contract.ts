import { z } from 'zod';
import {
  command,
  commandBase,
  query,
  queryBase,
  type ContractFragment,
} from '../../contract/operation';
import { AreaKindSchema } from '../../domain/categories';
import { IdSchema } from '../../ids';
import { TaskFrequencySchema, TemperatureKindSchema } from '../../model/haccp';
import {
  DeciCelsiusSchema,
  IsoDateTimeSchema,
  LocalDateSchema,
  nameSchema,
  textSchema,
  WeekdaySchema,
} from '../../model/primitives';

/** One measured temperature as a page shows it: the limits that applied, the result, who and when. */
export const TemperatureViewSchema = z.object({
  id: IdSchema,
  kind: TemperatureKindSchema,
  areaId: IdSchema.optional(),
  areaName: z.string().optional(),
  label: z.string().optional(),
  deciC: DeciCelsiusSchema,
  minDeciC: DeciCelsiusSchema.optional(),
  maxDeciC: DeciCelsiusSchema.optional(),
  ok: z.boolean(),
  action: z.string().optional(),
  on: LocalDateSchema,
  measuredAt: IsoDateTimeSchema,
  measuredByName: z.string(),
  /** Made today, so a typo can still be removed (`temperatures.remove`). */
  removable: z.boolean(),
});
export type TemperatureView = z.infer<typeof TemperatureViewSchema>;

/** A proposed limit for a food temperature («Richtwert»), with its source in words. */
export const TemperatureProposalSchema = z.object({
  kind: TemperatureKindSchema,
  minDeciC: DeciCelsiusSchema.optional(),
  maxDeciC: DeciCelsiusSchema.optional(),
  source: z.string(),
});

const TodayAreaSchema = z.object({
  areaId: IdSchema,
  name: z.string(),
  kind: AreaKindSchema,
  minDeciC: DeciCelsiusSchema.optional(),
  maxDeciC: DeciCelsiusSchema.optional(),
  /** The last measurement of today, if there is one. */
  reading: z
    .object({
      id: IdSchema,
      deciC: DeciCelsiusSchema,
      ok: z.boolean(),
      action: z.string().optional(),
      measuredAt: IsoDateTimeSchema,
      measuredByName: z.string(),
    })
    .optional(),
});

const TodayTaskSchema = z.object({
  taskId: IdSchema,
  name: z.string(),
  frequency: TaskFrequencySchema,
  weekday: WeekdaySchema.optional(),
  areaName: z.string().optional(),
  instructions: z.string().optional(),
  done: z.boolean(),
  doneAt: IsoDateTimeSchema.optional(),
  doneByName: z.string().optional(),
});

const HygieneTaskViewSchema = z.object({
  id: IdSchema,
  name: z.string(),
  areaId: IdSchema.optional(),
  areaName: z.string().optional(),
  frequency: TaskFrequencySchema,
  weekday: WeekdaySchema.optional(),
  instructions: z.string().optional(),
  active: z.boolean(),
  lastDoneOn: LocalDateSchema.optional(),
  lastDoneAt: IsoDateTimeSchema.optional(),
  lastDoneByName: z.string().optional(),
  /** Done for its period: today, or this month for a monthly task. */
  doneNow: z.boolean(),
});
export type HygieneTaskView = z.infer<typeof HygieneTaskViewSchema>;

/** One day of one area in the report: how many readings, their range, and how many were out. */
const ReportAreaDaySchema = z.object({
  on: LocalDateSchema,
  count: z.int().min(0),
  minDeciC: DeciCelsiusSchema.optional(),
  maxDeciC: DeciCelsiusSchema.optional(),
  outOfRange: z.int().min(0),
});

/** The state of one task on one day: done (with the initials of who), open, or not on the plan. */
const ReportCellSchema = z.object({
  on: LocalDateSchema,
  state: z.enum(['done', 'open', 'not_due']),
  initials: z.string().optional(),
});

/** One goods receipt of the period, as the stock module wrote it. */
const ReportReceiptSchema = z.object({
  deliveryId: IdSchema,
  receivedOn: LocalDateSchema,
  supplierName: z.string(),
  documentNumber: z.string().optional(),
  tempDeciC: DeciCelsiusSchema.optional(),
  checkOk: z.boolean(),
  initials: z.string(),
});

/**
 * «Selbstkontrolle»: the temperatures of the storage areas and of food, the cleaning plan with
 * its checks, and the report a food inspector can read. The goods receipt check is written by the
 * stock module (`receiving` logs and `checkOk` on deliveries); this module only shows it. Limits
 * for food are Richtwerte (ADR-0012); the limits of an area are its range, as the areas module
 * keeps them.
 */
export const haccpContract = {
  'haccp.today': query({
    name: 'haccp.today',
    scopes: ['haccp:read'],
    summary: {
      de: 'Selbstkontrolle heute: Temperaturen je Lagerbereich, Lebensmittel, Aufgaben und Abweichungen.',
      en: 'Self-control for today: area temperatures, food measurements, tasks and deviations.',
    },
    input: z.object({ ...queryBase }),
    output: z.object({
      day: LocalDateSchema,
      /** Every area with a range, in the order of the areas. */
      areas: z.array(TodayAreaSchema),
      /** The food measurements of today (every kind but storage). */
      food: z.array(TemperatureViewSchema),
      /** The tasks on the plan today, open ones and done ones. */
      tasks: z.array(TodayTaskSchema),
      /** Live tasks altogether: zero offers the starter plan. */
      plannedTaskCount: z.int().min(0),
      /** Readings of the last seven days that were out of range, newest first. */
      outOfRange: z.array(TemperatureViewSchema),
      measuredTodayCount: z.int().min(0),
    }),
  }),

  'haccp.report': query({
    name: 'haccp.report',
    scopes: ['haccp:read'],
    summary: {
      de: 'Bericht für eine Periode: Messungen je Tag und Bereich, Abweichungen, Aufgaben, Wareneingang.',
      en: 'Report for a period: readings per day and area, deviations, tasks, goods receipts.',
    },
    input: z.object({ ...queryBase, from: LocalDateSchema, to: LocalDateSchema }),
    output: z.object({
      from: LocalDateSchema,
      to: LocalDateSchema,
      /** Every day of the period, also those without a measurement. */
      days: z.array(LocalDateSchema),
      counts: z.object({
        measurements: z.int().min(0),
        outOfRange: z.int().min(0),
        missingDays: z.int().min(0),
        tasksDue: z.int().min(0),
        tasksDone: z.int().min(0),
        receipts: z.int().min(0),
        receiptsNotOk: z.int().min(0),
      }),
      areas: z.array(
        z.object({
          areaId: IdSchema,
          name: z.string(),
          kind: AreaKindSchema,
          minDeciC: DeciCelsiusSchema.optional(),
          maxDeciC: DeciCelsiusSchema.optional(),
          days: z.array(ReportAreaDaySchema),
        }),
      ),
      /** Every reading out of range, of every kind, in time order. */
      deviations: z.array(TemperatureViewSchema),
      /** Food measurements (not storage, not goods receipts), in time order. */
      food: z.array(TemperatureViewSchema),
      tasks: z.array(
        z.object({
          taskId: IdSchema,
          name: z.string(),
          frequency: TaskFrequencySchema,
          weekday: WeekdaySchema.optional(),
          areaName: z.string().optional(),
          dueCount: z.int().min(0),
          doneCount: z.int().min(0),
          cells: z.array(ReportCellSchema),
        }),
      ),
      receipts: z.array(ReportReceiptSchema),
      /** Days with no measurement of any kind. */
      missingDays: z.array(LocalDateSchema),
      /** Everyone whose initials appear in the report. */
      people: z.array(z.object({ initials: z.string(), name: z.string() })),
    }),
  }),

  'temperatures.record': command({
    name: 'temperatures.record',
    scopes: ['haccp:write'],
    summary: {
      de: 'Eine Temperatur erfassen: Lagerbereich oder Lebensmittel, mit Grenze und Massnahme bei Abweichung.',
      en: 'Record one temperature: a storage area or a food, with its limit and the action when out of range.',
    },
    input: z.object({
      ...commandBase,
      kind: TemperatureKindSchema,
      areaId: IdSchema.optional(),
      label: nameSchema(80).optional(),
      deciC: DeciCelsiusSchema,
      action: textSchema(300).optional(),
    }),
    output: z.object({
      logId: IdSchema,
      ok: z.boolean(),
      deciC: DeciCelsiusSchema,
      minDeciC: DeciCelsiusSchema.optional(),
      maxDeciC: DeciCelsiusSchema.optional(),
    }),
  }),

  'temperatures.list': query({
    name: 'temperatures.list',
    scopes: ['haccp:read'],
    summary: {
      de: 'Verlauf der Temperaturen in einer Periode: Messungen, Tagesreihen je Lagerbereich, Richtwerte.',
      en: 'History of temperatures over a period: readings, daily series per area, proposed limits.',
    },
    input: z.object({
      ...queryBase,
      from: LocalDateSchema,
      to: LocalDateSchema,
      areaId: IdSchema.optional(),
      kind: TemperatureKindSchema.optional(),
    }),
    output: z.object({
      from: LocalDateSchema,
      to: LocalDateSchema,
      areas: z.array(
        z.object({
          areaId: IdSchema,
          name: z.string(),
          kind: AreaKindSchema,
          minDeciC: DeciCelsiusSchema.optional(),
          maxDeciC: DeciCelsiusSchema.optional(),
        }),
      ),
      /** Newest first. */
      logs: z.array(TemperatureViewSchema),
      counts: z.object({ total: z.int().min(0), outOfRange: z.int().min(0) }),
      /** Per area: the warmest and the coolest reading of each day that has readings. */
      series: z.array(
        z.object({
          areaId: IdSchema,
          name: z.string(),
          minDeciC: DeciCelsiusSchema.optional(),
          maxDeciC: DeciCelsiusSchema.optional(),
          points: z.array(
            z.object({
              on: LocalDateSchema,
              lowestDeciC: DeciCelsiusSchema,
              highestDeciC: DeciCelsiusSchema,
              count: z.int().min(1),
            }),
          ),
        }),
      ),
      proposals: z.array(TemperatureProposalSchema),
    }),
  }),

  'temperatures.remove': command({
    name: 'temperatures.remove',
    scopes: ['haccp:write'],
    summary: {
      de: 'Eine Messung löschen, die heute erfasst wurde (ein Tippfehler); später nicht mehr.',
      en: 'Remove a reading made today (a typo); later it can no longer be removed.',
    },
    input: z.object({ ...commandBase, logId: IdSchema }),
    output: z.object({ logId: IdSchema }),
  }),

  'hygiene.tasks': query({
    name: 'hygiene.tasks',
    scopes: ['haccp:read'],
    summary: {
      de: 'Der Reinigungsplan: jede Aufgabe mit Bereich, Rhythmus, Anleitung und letzter Erledigung.',
      en: 'The cleaning plan: every task with area, frequency, instructions and last time done.',
    },
    input: z.object({ ...queryBase }),
    output: z.object({ tasks: z.array(HygieneTaskViewSchema) }),
  }),

  'hygiene.saveTask': command({
    name: 'hygiene.saveTask',
    scopes: ['haccp:write'],
    summary: {
      de: 'Eine Aufgabe des Reinigungsplans anlegen oder ändern: Name, Bereich, Rhythmus, Anleitung.',
      en: 'Create or change a cleaning task: name, area, frequency, instructions.',
    },
    input: z.object({
      ...commandBase,
      taskId: IdSchema.optional(),
      name: nameSchema(100),
      areaId: IdSchema.nullish(),
      frequency: TaskFrequencySchema,
      /** Required for a weekly task, left out otherwise. */
      weekday: WeekdaySchema.nullish(),
      instructions: textSchema(500).nullish(),
      active: z.boolean(),
    }),
    output: z.object({ taskId: IdSchema }),
  }),

  'hygiene.removeTask': command({
    name: 'hygiene.removeTask',
    scopes: ['haccp:write'],
    summary: {
      de: 'Eine Aufgabe aus dem Reinigungsplan entfernen; ihre Erledigungen bleiben im Bericht.',
      en: 'Remove a task from the cleaning plan; its past checks stay in the report.',
    },
    input: z.object({ ...commandBase, taskId: IdSchema }),
    output: z.object({ taskId: IdSchema }),
  }),

  'hygiene.check': command({
    name: 'hygiene.check',
    scopes: ['haccp:write'],
    summary: {
      de: 'Eine Aufgabe als heute erledigt abhaken, mit Namen und Zeit; ein zweites Mal ändert nichts.',
      en: 'Tick a task as done today, with the person and the time; a second tick changes nothing.',
    },
    input: z.object({
      ...commandBase,
      taskId: IdSchema,
      note: textSchema(300).optional(),
    }),
    output: z.object({
      checkId: IdSchema,
      taskId: IdSchema,
      on: LocalDateSchema,
      doneAt: IsoDateTimeSchema,
      doneByName: z.string(),
      /** False when the task was already ticked today: the first tick is returned. */
      created: z.boolean(),
    }),
  }),

  'hygiene.uncheck': command({
    name: 'hygiene.uncheck',
    scopes: ['haccp:write'],
    summary: {
      de: 'Das Abhaken von heute zurücknehmen, falls es der falsche Haken war.',
      en: 'Take back today’s tick of a task, if it was the wrong one.',
    },
    input: z.object({ ...commandBase, taskId: IdSchema }),
    output: z.object({ taskId: IdSchema, removed: z.int().min(0) }),
  }),

  'hygiene.standardPlan': command({
    name: 'hygiene.standardPlan',
    scopes: ['haccp:write'],
    summary: {
      de: 'Einen Reinigungsplan mit üblichen Aufgaben anlegen, wenn es noch keine gibt; als Vorschlag zum Anpassen.',
      en: 'Create a starter cleaning plan with usual tasks, when there are none yet; a proposal to adapt.',
    },
    input: z.object({ ...commandBase }),
    output: z.object({ created: z.int().min(0) }),
  }),
} as const satisfies ContractFragment;
