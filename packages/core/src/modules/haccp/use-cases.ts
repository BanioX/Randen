import {
  CommandError,
  createCommandKit,
  requireRow,
  type AppContext,
  type UseCase,
} from '../../application/command';
import { CONTRACT_V1 } from '../../contract';
import { addDays } from '../../dates';
import type { AreaKind } from '../../domain/categories';
import type { Id } from '../../ids';
import {
  HygieneCheckSchema,
  HygieneTaskSchema,
  TemperatureLogSchema,
  type HygieneCheck,
  type HygieneTask,
  type TemperatureLog,
} from '../../model/haccp';
import type { LocalDate } from '../../model/primitives';
import type { Delivery } from '../../model/stock';
import type { StorageArea } from '../../model/storage-area';
import { alive } from '../../ports/storage';
import type { TemperatureView, HygieneTaskView } from './contract';
import { FOOD_KINDS, TEMPERATURE_PROPOSALS, withinLimits } from './limits';
import {
  daysFromTo,
  doneFor,
  monthOf,
  newestFirst,
  oldestFirst,
  scheduledOn,
  staffIndex,
  weekdayOf,
} from './rules';
import { STANDARD_TASKS } from './standard-plan';

/** Days a report may cover; a year is the longest look back a self-control needs. */
const MAX_REPORT_DAYS = 366;
/** The out-of-range list of «Heute» looks this many days back, today included. */
const TODAY_WINDOW_DAYS = 7;
const FREQUENCY_ORDER = { daily: 0, weekly: 1, monthly: 2 } as const;

/** Whether a task is due on a day by its rhythm alone (monthly tasks have no fixed day). */
const dueOn = (task: HygieneTask, day: LocalDate): boolean =>
  task.frequency === 'daily' || (task.frequency === 'weekly' && task.weekday === weekdayOf(day));

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'de-CH');
const byOrder = (a: StorageArea, b: StorageArea) => a.sortOrder - b.sortOrder || byName(a, b);
/** Two names a person would take for the same: case and outer blanks do not count. */
const nameKey = (name: string) => name.trim().toLocaleLowerCase('de-CH');

/** A row with optional fields left out where they are undefined (exactOptionalPropertyTypes). */
function defined<TObject extends Record<string, unknown>>(
  object: TObject,
): { [TKey in keyof TObject]?: Exclude<TObject[TKey], undefined> } {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined)) as {
    [TKey in keyof TObject]?: Exclude<TObject[TKey], undefined>;
  };
}

/** Everything the reads of this module join, loaded once. Deleted areas stay for their names. */
interface Book {
  /** Live areas in their order. */
  areas: StorageArea[];
  /** Every area ever made: old readings keep the name of their area. */
  areaById: Map<Id, StorageArea>;
  logs: TemperatureLog[];
  /** Live tasks. */
  tasks: HygieneTask[];
  /** Every task ever made: a removed task keeps its past checks in the report. */
  allTasks: HygieneTask[];
  /** Live checks. */
  checks: HygieneCheck[];
  staff: ReturnType<typeof staffIndex>;
  deliveries: Delivery[];
  supplierName: (id: Id | undefined) => string | undefined;
}

/** Use cases of «Selbstkontrolle»: temperatures, the cleaning plan and the report. */
export function createHaccpUseCases(ctx: AppContext) {
  const { storage, clock, ids, actor } = ctx;
  const { emit, runCommand, stamps } = createCommandKit(ctx);

  async function loadBook(businessId: Id): Promise<Book> {
    const [areaRows, logRows, taskRows, checkRows, staffRows, deliveryRows, supplierRows] =
      await Promise.all([
        storage.areas.ofBusiness(businessId),
        storage.temperatureLogs.ofBusiness(businessId),
        storage.hygieneTasks.ofBusiness(businessId),
        storage.hygieneChecks.ofBusiness(businessId),
        storage.staff.ofBusiness(businessId),
        storage.deliveries.ofBusiness(businessId),
        storage.suppliers.ofBusiness(businessId),
      ]);
    const suppliers = new Map(alive(supplierRows).map((row) => [row.id, row.name] as const));
    return {
      areas: alive(areaRows).sort(byOrder),
      areaById: new Map(areaRows.map((area) => [area.id, area])),
      logs: alive(logRows),
      tasks: alive(taskRows),
      allTasks: taskRows,
      checks: alive(checkRows),
      staff: staffIndex(staffRows),
      deliveries: alive(deliveryRows),
      supplierName: (id) => (id === undefined ? undefined : suppliers.get(id)),
    };
  }

  /** The reading as a page shows it: its limits, its result, the area, who and when. */
  function viewOf(log: TemperatureLog, book: Book, today: LocalDate): TemperatureView {
    const area = log.areaId === undefined ? undefined : book.areaById.get(log.areaId);
    return {
      id: log.id,
      kind: log.kind,
      ...defined({
        areaId: log.areaId,
        areaName: area?.name,
        label: log.label,
        minDeciC: log.minDeciC,
        maxDeciC: log.maxDeciC,
        action: log.action,
      }),
      deciC: log.deciC,
      ok: log.ok,
      on: log.on,
      measuredAt: log.measuredAt,
      measuredByName: book.staff.nameOf(log.measuredBy),
      removable: log.on === today,
    };
  }

  /** The last check of a task, by day and time. */
  function lastCheck(task: HygieneTask, book: Book): HygieneCheck | undefined {
    return book.checks
      .filter((check) => check.taskId === task.id)
      .sort((a, b) => b.on.localeCompare(a.on) || b.doneAt.localeCompare(a.doneAt))[0];
  }

  // ---------------------------------------------------------------- reads

  const todayRead: UseCase<'haccp.today'> = async (raw) => {
    const input = CONTRACT_V1['haccp.today'].input.parse(raw);
    const book = await loadBook(input.businessId);
    const day = clock.today();
    const weekAgo = addDays(day, -(TODAY_WINDOW_DAYS - 1));
    const todays = book.logs.filter((log) => log.on === day);

    const areas = book.areas
      .filter((area) => area.minDeciC !== undefined || area.maxDeciC !== undefined)
      .map((area) => {
        const last = todays
          .filter((log) => log.kind === 'storage' && log.areaId === area.id)
          .sort(oldestFirst)
          .at(-1);
        return {
          areaId: area.id,
          name: area.name,
          kind: area.kind,
          ...defined({ minDeciC: area.minDeciC, maxDeciC: area.maxDeciC }),
          ...(last === undefined
            ? {}
            : {
                reading: {
                  id: last.id,
                  deciC: last.deciC,
                  ok: last.ok,
                  ...defined({ action: last.action }),
                  measuredAt: last.measuredAt,
                  measuredByName: book.staff.nameOf(last.measuredBy),
                },
              }),
        };
      });

    const food = todays
      .filter((log) => log.kind !== 'storage')
      .sort(oldestFirst)
      .map((log) => viewOf(log, book, day));

    const tasks = book.tasks
      .filter((task) => scheduledOn(task, book.checks, day))
      .sort((a, b) => FREQUENCY_ORDER[a.frequency] - FREQUENCY_ORDER[b.frequency] || byName(a, b))
      .map((task) => {
        const check = doneFor(task, book.checks, day);
        const area = task.areaId === undefined ? undefined : book.areaById.get(task.areaId);
        return {
          taskId: task.id,
          name: task.name,
          frequency: task.frequency,
          ...defined({
            weekday: task.weekday,
            areaName: area?.name,
            instructions: task.instructions,
            doneAt: check?.doneAt,
            doneByName: check === undefined ? undefined : book.staff.nameOf(check.doneBy),
          }),
          done: check !== undefined,
        };
      });

    const outOfRange = book.logs
      .filter((log) => !log.ok && log.on >= weekAgo && log.on <= day)
      .sort(newestFirst)
      .map((log) => viewOf(log, book, day));

    return {
      day,
      areas,
      food,
      tasks,
      plannedTaskCount: book.tasks.length,
      outOfRange,
      measuredTodayCount: todays.length,
    };
  };

  const report: UseCase<'haccp.report'> = async (raw) => {
    const input = CONTRACT_V1['haccp.report'].input.parse(raw);
    const { from, to, businessId } = input;
    if (to < from) {
      throw new CommandError('invalid', 'The period ends before it starts');
    }
    const days = daysFromTo(from, to);
    if (days.length > MAX_REPORT_DAYS) {
      throw new CommandError('invalid', 'The period is too long');
    }
    const book = await loadBook(businessId);
    const day = clock.today();
    const inPeriod = (on: LocalDate) => on >= from && on <= to;
    // Days that have come: a future day is neither due («offen») nor missing a measurement.
    const past = days.filter((on) => on <= day);
    const logs = book.logs
      .filter((log) => inPeriod(log.on))
      .sort((a, b) => a.on.localeCompare(b.on) || oldestFirst(a, b));
    const readings = logs.filter((log) => log.kind === 'storage');
    // Goods receipts come from the deliveries below; their `receiving` logs are not listed twice.
    const food = logs.filter((log) => log.kind !== 'storage' && log.kind !== 'receiving');
    const checksInPeriod = book.checks.filter((check) => inPeriod(check.on));

    const areas = book.areas
      .filter(
        (area) =>
          area.minDeciC !== undefined ||
          area.maxDeciC !== undefined ||
          readings.some((log) => log.areaId === area.id),
      )
      .map((area) => ({
        areaId: area.id,
        name: area.name,
        kind: area.kind,
        ...defined({ minDeciC: area.minDeciC, maxDeciC: area.maxDeciC }),
        days: days.map((on) => {
          const own = readings.filter((log) => log.areaId === area.id && log.on === on);
          const values = own.map((log) => log.deciC);
          return {
            on,
            count: own.length,
            ...(values.length === 0
              ? {}
              : { minDeciC: Math.min(...values), maxDeciC: Math.max(...values) }),
            outOfRange: own.filter((log) => !log.ok).length,
          };
        }),
      }));

    // Every live task, and removed ones that were ticked in the period.
    const taskRows = book.allTasks
      .filter(
        (task) =>
          task.deletedAt === undefined || checksInPeriod.some((check) => check.taskId === task.id),
      )
      .sort((a, b) => FREQUENCY_ORDER[a.frequency] - FREQUENCY_ORDER[b.frequency] || byName(a, b))
      .map((task) => {
        const area = task.areaId === undefined ? undefined : book.areaById.get(task.areaId);
        const live = task.deletedAt === undefined && task.active;
        const own = checksInPeriod.filter((check) => check.taskId === task.id);
        const dueDays = new Set(live ? past.filter((on) => dueOn(task, on)) : []);
        const cells = days.map((on) => {
          const check = own.find((entry) => entry.on === on);
          const state = check !== undefined ? 'done' : dueDays.has(on) ? 'open' : 'not_due';
          return {
            on,
            state,
            ...(check === undefined ? {} : { initials: book.staff.initialsOf(check.doneBy) }),
          } as const;
        });
        const months = [...new Set(past.map(monthOf))];
        const dueCount = !live ? 0 : task.frequency === 'monthly' ? months.length : dueDays.size;
        const doneCount =
          task.frequency === 'monthly'
            ? months.filter((month) => own.some((check) => monthOf(check.on) === month)).length
            : cells.filter((cell) => cell.state === 'done' && dueDays.has(cell.on)).length;
        return {
          taskId: task.id,
          name: task.name,
          frequency: task.frequency,
          ...defined({ weekday: task.weekday, areaName: area?.name }),
          dueCount,
          doneCount: Math.min(doneCount, dueCount),
          cells,
        };
      });

    const receipts = book.deliveries
      .filter((delivery) => inPeriod(delivery.receivedOn))
      .sort((a, b) => a.receivedOn.localeCompare(b.receivedOn))
      .map((delivery) => ({
        deliveryId: delivery.id,
        receivedOn: delivery.receivedOn,
        supplierName: book.supplierName(delivery.supplierId) ?? 'Unbekannter Lieferant',
        ...defined({
          documentNumber: delivery.documentNumber,
          tempDeciC: delivery.tempDeciC,
        }),
        checkOk: delivery.checkOk,
        initials: book.staff.initialsOf(delivery.receivedBy),
      }));

    const usedBy = new Set<Id>([
      ...logs.map((log) => log.measuredBy),
      ...checksInPeriod.map((check) => check.doneBy),
      ...book.deliveries
        .filter((delivery) => inPeriod(delivery.receivedOn))
        .map((delivery) => delivery.receivedBy),
    ]);
    const tasksDue = taskRows.reduce((sum, row) => sum + row.dueCount, 0);

    // A day that has not come is not missing a measurement yet.
    const missing = past.filter((on) => !logs.some((log) => log.on === on));
    return {
      from,
      to,
      days,
      counts: {
        measurements: logs.length,
        outOfRange: logs.filter((log) => !log.ok).length,
        missingDays: missing.length,
        tasksDue,
        tasksDone: taskRows.reduce((sum, row) => sum + row.doneCount, 0),
        receipts: receipts.length,
        receiptsNotOk: receipts.filter((receipt) => !receipt.checkOk).length,
      },
      areas,
      deviations: logs.filter((log) => !log.ok).map((log) => viewOf(log, book, day)),
      food: food.map((log) => viewOf(log, book, day)),
      tasks: taskRows,
      receipts,
      missingDays: missing,
      people: book.staff.everyone
        .filter((person) => usedBy.has(person.id))
        .map(({ initials, name }) => ({ initials, name })),
    };
  };

  const listTemperatures: UseCase<'temperatures.list'> = async (raw) => {
    const input = CONTRACT_V1['temperatures.list'].input.parse(raw);
    const { from, to, businessId, areaId, kind } = input;
    if (to < from) {
      throw new CommandError('invalid', 'The period ends before it starts');
    }
    const book = await loadBook(businessId);
    const day = clock.today();
    const logs = book.logs
      .filter(
        (log) =>
          log.on >= from &&
          log.on <= to &&
          (areaId === undefined || log.areaId === areaId) &&
          (kind === undefined || log.kind === kind),
      )
      .sort(newestFirst);

    const storage_ = logs.filter((log) => log.kind === 'storage');
    const series =
      kind === undefined || kind === 'storage'
        ? book.areas
            .filter((area) => areaId === undefined || area.id === areaId)
            .map((area) => {
              const own = storage_.filter((log) => log.areaId === area.id);
              const days = [...new Set(own.map((log) => log.on))].sort();
              return {
                areaId: area.id,
                name: area.name,
                ...defined({ minDeciC: area.minDeciC, maxDeciC: area.maxDeciC }),
                points: days.map((on) => {
                  const values = own.filter((log) => log.on === on).map((log) => log.deciC);
                  return {
                    on,
                    lowestDeciC: Math.min(...values),
                    highestDeciC: Math.max(...values),
                    count: values.length,
                  };
                }),
              };
            })
            .filter((row) => row.points.length > 0)
        : [];

    return {
      from,
      to,
      areas: book.areas.map((area) => ({
        areaId: area.id,
        name: area.name,
        kind: area.kind,
        ...defined({ minDeciC: area.minDeciC, maxDeciC: area.maxDeciC }),
      })),
      logs: logs.map((log) => viewOf(log, book, day)),
      counts: {
        total: logs.length,
        outOfRange: logs.filter((log) => !log.ok).length,
      },
      series,
      proposals: FOOD_KINDS.map((proposalKind) => ({
        kind: proposalKind,
        ...defined({
          minDeciC: TEMPERATURE_PROPOSALS[proposalKind].minDeciC,
          maxDeciC: TEMPERATURE_PROPOSALS[proposalKind].maxDeciC,
        }),
        source: TEMPERATURE_PROPOSALS[proposalKind].source,
      })),
    };
  };

  const listTasks: UseCase<'hygiene.tasks'> = async (raw) => {
    const input = CONTRACT_V1['hygiene.tasks'].input.parse(raw);
    const book = await loadBook(input.businessId);
    const day = clock.today();
    const tasks = [...book.tasks]
      .sort((a, b) => FREQUENCY_ORDER[a.frequency] - FREQUENCY_ORDER[b.frequency] || byName(a, b))
      .map((task): HygieneTaskView => {
        const area = task.areaId === undefined ? undefined : book.areaById.get(task.areaId);
        const last = lastCheck(task, book);
        return {
          id: task.id,
          name: task.name,
          frequency: task.frequency,
          active: task.active,
          ...defined({
            areaId: task.areaId,
            areaName: area?.name,
            weekday: task.weekday,
            instructions: task.instructions,
            lastDoneOn: last?.on,
            lastDoneAt: last?.doneAt,
            lastDoneByName: last === undefined ? undefined : book.staff.nameOf(last.doneBy),
          }),
          doneNow: doneFor(task, book.checks, day) !== undefined,
        };
      });
    return { tasks };
  };

  // ---------------------------------------------------------------- commands

  const record: UseCase<'temperatures.record'> = async (raw) => {
    const input = CONTRACT_V1['temperatures.record'].input.parse(raw);
    return runCommand('temperatures.record', input.commandId, async () => {
      const { businessId, kind } = input;
      let limits: { minDeciC?: number; maxDeciC?: number };
      let area: StorageArea | undefined;
      if (kind === 'storage') {
        if (input.areaId === undefined || input.label !== undefined) {
          throw new CommandError('invalid', 'A storage reading needs an area and no label');
        }
        area = await requireRow(storage.areas, businessId, input.areaId, 'Area');
        limits = {
          ...defined({ minDeciC: area.minDeciC, maxDeciC: area.maxDeciC }),
        };
      } else {
        if (input.label === undefined || input.areaId !== undefined) {
          throw new CommandError('invalid', 'A food reading needs a label and no area');
        }
        const proposal = TEMPERATURE_PROPOSALS[kind];
        limits = defined({ minDeciC: proposal.minDeciC, maxDeciC: proposal.maxDeciC });
      }
      const ok = withinLimits(input.deciC, limits);
      if (!ok && input.action === undefined) {
        throw new CommandError('invalid', 'Out of range without an action');
      }
      const log = TemperatureLogSchema.parse({
        id: ids.next(),
        businessId,
        ...stamps(),
        kind,
        ...defined({
          areaId: area?.id,
          label: input.label,
          action: input.action,
        }),
        deciC: input.deciC,
        ...limits,
        ok,
        on: clock.today(),
        measuredAt: clock.now(),
        measuredBy: actor,
      });
      await storage.temperatureLogs.add(log);
      await emit(businessId, 'temperature.recorded', {
        logId: log.id,
        kind,
        ok,
        ...defined({ areaId: area?.id }),
      });
      return { logId: log.id, ok, deciC: input.deciC, ...limits };
    });
  };

  const removeTemperature: UseCase<'temperatures.remove'> = async (raw) => {
    const input = CONTRACT_V1['temperatures.remove'].input.parse(raw);
    return runCommand('temperatures.remove', input.commandId, async () => {
      const { businessId, logId } = input;
      const row = await requireRow(storage.temperatureLogs, businessId, logId, 'Temperature');
      if (row.on !== clock.today()) {
        throw new CommandError('not_allowed', 'Only a reading of today can be removed');
      }
      const now = clock.now();
      await storage.temperatureLogs.put(
        TemperatureLogSchema.parse({ ...row, deletedAt: now, updatedAt: now }),
      );
      await emit(businessId, 'temperature.removed', { logId });
      return { logId };
    });
  };

  const saveTask: UseCase<'hygiene.saveTask'> = async (raw) => {
    const input = CONTRACT_V1['hygiene.saveTask'].input.parse(raw);
    return runCommand('hygiene.saveTask', input.commandId, async () => {
      const { businessId } = input;
      const weekday = input.weekday ?? undefined;
      const areaId = input.areaId ?? undefined;
      if (input.frequency === 'weekly' && weekday === undefined) {
        throw new CommandError('invalid', 'A weekly task needs its weekday');
      }
      if (areaId !== undefined) {
        await requireRow(storage.areas, businessId, areaId, 'Area');
      }
      const siblings = alive(await storage.hygieneTasks.ofBusiness(businessId)).filter(
        (task) => task.id !== input.taskId,
      );
      if (siblings.some((task) => nameKey(task.name) === nameKey(input.name))) {
        throw new CommandError('duplicate_name', `Task ${input.name} exists`);
      }
      const fields = {
        name: input.name,
        frequency: input.frequency,
        active: input.active,
        ...defined({
          areaId,
          weekday: input.frequency === 'weekly' ? weekday : undefined,
          instructions: input.instructions ?? undefined,
        }),
      };
      if (input.taskId === undefined) {
        const row = HygieneTaskSchema.parse({
          id: ids.next(),
          businessId,
          ...stamps(),
          ...fields,
        });
        await storage.hygieneTasks.add(row);
        await emit(businessId, 'hygiene_task.created', { taskId: row.id });
        return { taskId: row.id };
      }
      const existing = await requireRow(storage.hygieneTasks, businessId, input.taskId, 'Task');
      const row = HygieneTaskSchema.parse({
        id: existing.id,
        businessId,
        createdAt: existing.createdAt,
        updatedAt: clock.now(),
        ...fields,
      });
      await storage.hygieneTasks.put(row);
      await emit(businessId, 'hygiene_task.updated', { taskId: row.id });
      return { taskId: row.id };
    });
  };

  const removeTask: UseCase<'hygiene.removeTask'> = async (raw) => {
    const input = CONTRACT_V1['hygiene.removeTask'].input.parse(raw);
    return runCommand('hygiene.removeTask', input.commandId, async () => {
      const { businessId, taskId } = input;
      const row = await requireRow(storage.hygieneTasks, businessId, taskId, 'Task');
      const now = clock.now();
      await storage.hygieneTasks.put(
        HygieneTaskSchema.parse({ ...row, deletedAt: now, updatedAt: now }),
      );
      await emit(businessId, 'hygiene_task.removed', { taskId });
      return { taskId };
    });
  };

  const check: UseCase<'hygiene.check'> = async (raw) => {
    const input = CONTRACT_V1['hygiene.check'].input.parse(raw);
    return runCommand('hygiene.check', input.commandId, async () => {
      const { businessId, taskId } = input;
      const task = await requireRow(storage.hygieneTasks, businessId, taskId, 'Task');
      if (!task.active) {
        throw new CommandError('not_allowed', 'An inactive task cannot be ticked');
      }
      const day = clock.today();
      const book = await loadBook(businessId);
      const first = book.checks
        .filter((row) => row.taskId === taskId && row.on === day)
        .sort((a, b) => a.doneAt.localeCompare(b.doneAt))[0];
      if (first !== undefined) {
        return {
          checkId: first.id,
          taskId,
          on: first.on,
          doneAt: first.doneAt,
          doneByName: book.staff.nameOf(first.doneBy),
          created: false,
        };
      }
      const row = HygieneCheckSchema.parse({
        id: ids.next(),
        businessId,
        ...stamps(),
        taskId,
        on: day,
        doneAt: clock.now(),
        doneBy: actor,
        ...defined({ note: input.note }),
      });
      await storage.hygieneChecks.add(row);
      await emit(businessId, 'hygiene_task.checked', { taskId, checkId: row.id, on: day });
      return {
        checkId: row.id,
        taskId,
        on: day,
        doneAt: row.doneAt,
        doneByName: book.staff.nameOf(actor),
        created: true,
      };
    });
  };

  const uncheck: UseCase<'hygiene.uncheck'> = async (raw) => {
    const input = CONTRACT_V1['hygiene.uncheck'].input.parse(raw);
    return runCommand('hygiene.uncheck', input.commandId, async () => {
      const { businessId, taskId } = input;
      await requireRow(storage.hygieneTasks, businessId, taskId, 'Task');
      const day = clock.today();
      const todays = alive(await storage.hygieneChecks.ofBusiness(businessId)).filter(
        (row) => row.taskId === taskId && row.on === day,
      );
      const now = clock.now();
      for (const row of todays) {
        await storage.hygieneChecks.put(
          HygieneCheckSchema.parse({ ...row, deletedAt: now, updatedAt: now }),
        );
      }
      if (todays.length > 0) {
        await emit(businessId, 'hygiene_task.unchecked', { taskId, removed: todays.length });
      }
      return { taskId, removed: todays.length };
    });
  };

  const standardPlan: UseCase<'hygiene.standardPlan'> = async (raw) => {
    const input = CONTRACT_V1['hygiene.standardPlan'].input.parse(raw);
    return runCommand('hygiene.standardPlan', input.commandId, async () => {
      const { businessId } = input;
      const existing = alive(await storage.hygieneTasks.ofBusiness(businessId));
      if (existing.length > 0) {
        throw new CommandError('not_allowed', 'There is a cleaning plan already');
      }
      const areas = alive(await storage.areas.ofBusiness(businessId)).sort(byOrder);
      const areaOfKind = (kind: AreaKind) => areas.find((area) => area.kind === kind)?.id;
      for (const task of STANDARD_TASKS) {
        const areaId = task.areaKind === undefined ? undefined : areaOfKind(task.areaKind);
        const row = HygieneTaskSchema.parse({
          id: ids.next(),
          businessId,
          ...stamps(),
          name: task.name,
          frequency: task.frequency,
          active: true,
          instructions: task.instructions,
          ...defined({
            areaId,
            weekday: task.frequency === 'weekly' ? task.weekday : undefined,
          }),
        });
        await storage.hygieneTasks.add(row);
      }
      await emit(businessId, 'hygiene_plan.created', { count: STANDARD_TASKS.length });
      return { created: STANDARD_TASKS.length };
    });
  };

  return {
    'haccp.today': todayRead,
    'haccp.report': report,
    'temperatures.record': record,
    'temperatures.list': listTemperatures,
    'temperatures.remove': removeTemperature,
    'hygiene.tasks': listTasks,
    'hygiene.saveTask': saveTask,
    'hygiene.removeTask': removeTask,
    'hygiene.check': check,
    'hygiene.uncheck': uncheck,
    'hygiene.standardPlan': standardPlan,
  };
}
