import { addDays, addMonths, formatDecimal, type LocalDate } from '@randen/core';
import { useSearchParams } from 'react-router';
import { useBusiness, useQuery, useToday } from '../../app/hooks';
import { paths } from '../../app/paths';
import { PrintButton } from '../../ui/PrintButton';
import { Card } from '../../ui/Card';
import { ChoiceChips } from '../../ui/ChoiceChips';
import { DataTable, type DataTableColumn } from '../../ui/DataTable';
import { GroupedList, ListRow } from '../../ui/GroupedList';
import { PageHeader } from '../../ui/PageHeader';
import { Section } from '../../ui/Section';
import { StatusChip } from '../../ui/StatusChip';
import { toneClasses } from '../../ui/tones';
import { haccpMessages as t } from './messages';
import {
  clockText,
  dayText,
  degrees,
  firstOfMonth,
  kindText,
  lastOfMonth,
  longDay,
  mondayOf,
  rangeText,
  resultText,
  weekdayDayText,
} from './shared';
import type { ReportView } from './types';

const PERIODS = ['thisWeek', 'lastWeek', 'thisMonth', 'lastMonth'] as const;
type PeriodKey = (typeof PERIODS)[number];

/** The four periods of the report, counted in Swiss weeks (Monday to Sunday) and calendar months. */
function periodOf(key: PeriodKey, today: LocalDate): { from: LocalDate; to: LocalDate } {
  switch (key) {
    case 'thisWeek': {
      const monday = mondayOf(today);
      return { from: monday, to: addDays(monday, 6) };
    }
    case 'lastWeek': {
      const monday = addDays(mondayOf(today), -7);
      return { from: monday, to: addDays(monday, 6) };
    }
    case 'thisMonth':
      return { from: firstOfMonth(today), to: lastOfMonth(today) };
    case 'lastMonth': {
      const first = addMonths(firstOfMonth(today), -1);
      return { from: first, to: lastOfMonth(first) };
    }
  }
}

/**
 * «Bericht für die Kontrolle» (H5): the answer first, then the tables an inspector reads. The
 * period is in the address; the print view (`PrintButton`, ADR-0019) keeps the tables and drops the rest.
 */
export function ReportPage() {
  const [params, setParams] = useSearchParams();
  const today = useToday();
  const business = useBusiness();
  const key = PERIODS.find((period) => period === params.get('zeitraum')) ?? 'thisWeek';
  const { from, to } = periodOf(key, today);
  const report = useQuery('haccp.report', { from, to });
  return (
    <>
      <PageHeader
        title={t.report.title}
        subtitle={t.report.period(longDay(from), longDay(to))}
        back={{ to: paths.haccp(), label: t.back }}
        actions={
          <span className="print:hidden">
            <PrintButton variant="secondary" label={t.report.print} />
          </span>
        }
      />
      <div className="mb-6 max-w-2xl print:hidden">
        <ChoiceChips<PeriodKey>
          legend={t.report.periodLegend}
          hideLegend
          segmented
          options={PERIODS.map((period) => ({
            value: period,
            label: t.report.periods[period],
          }))}
          value={key}
          onChange={(next) => {
            const updated = new URLSearchParams(params);
            updated.set('zeitraum', next);
            setParams(updated, { replace: true });
          }}
        />
      </div>
      <div className="hidden print:block">
        <p className="text-lg font-semibold">{business.name}</p>
        <p>{t.report.period(longDay(from), longDay(to))}</p>
        <p>{t.report.printedOn(longDay(today))}</p>
      </div>
      {report === undefined ? null : <ReportContent report={report} />}
    </>
  );
}

function ReportContent({ report }: { report: ReportView }) {
  const counts = report.counts;
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <p className="text-lg">
          {t.report.summary(counts.measurements, counts.outOfRange, counts.missingDays)}{' '}
          {t.report.summaryTasks(counts.tasksDone, counts.tasksDue)}{' '}
          {t.report.summaryReceipts(counts.receipts, counts.receiptsNotOk)}
        </p>
        <p className="text-ink-muted">{t.report.disclaimer}</p>
      </div>
      <Section title={t.report.storage.title}>
        {report.areas.length === 0 ? (
          <p className="text-ink-muted">{t.report.storage.empty}</p>
        ) : (
          <>
            <div className="hidden md:block">
              <DataTable
                caption={t.report.storage.title}
                rows={report.days.map((on) => ({ on }))}
                getRowKey={(row) => row.on}
                columns={storageColumns(report)}
              />
            </div>
            <div className="md:hidden">
              <GroupedList label={t.report.storage.title}>
                {report.days.map((on) => (
                  <ListRow
                    key={on}
                    title={dayText(on)}
                    subtitle={report.areas
                      .map((area) => `${area.name}: ${storageText(area, on)}`)
                      .join(' · ')}
                  />
                ))}
              </GroupedList>
            </div>
          </>
        )}
      </Section>
      <Section title={t.report.deviations.title}>
        {report.deviations.length === 0 ? (
          <p className="text-ink-muted">{t.report.deviations.empty}</p>
        ) : (
          <GroupedList label={t.report.deviations.title}>
            {report.deviations.map((log) => (
              <ListRow
                key={log.id}
                title={`${log.areaName ?? log.label ?? kindText(log.kind)}, ${degrees(log.deciC)}`}
                subtitle={`${dayText(log.on)} ${clockText(log.measuredAt)}, ${log.measuredByName}`}
                meta={
                  log.action === undefined
                    ? t.report.deviations.noAction
                    : t.report.deviations.action(log.action)
                }
              />
            ))}
          </GroupedList>
        )}
      </Section>
      <Section title={t.report.food.title}>
        {report.food.length === 0 ? (
          <p className="text-ink-muted">{t.report.food.empty}</p>
        ) : (
          <DataTable
            caption={t.report.food.title}
            rows={report.food}
            getRowKey={(row) => row.id}
            columns={foodColumns()}
          />
        )}
      </Section>
      <Section title={t.report.tasks.title}>
        {report.tasks.length === 0 ? (
          <p className="text-ink-muted">{t.report.tasks.empty}</p>
        ) : (
          <ul className="space-y-3">
            {report.tasks.map((task) => (
              <li
                key={task.taskId}
                className="rounded-2xl bg-surface p-4 shadow-card print:shadow-none"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <h3 className="font-semibold">{task.name}</h3>
                  <p className="text-sm text-ink-muted">
                    {t.report.tasks.due(task.dueCount, task.doneCount)}
                    {task.frequency === 'monthly' ? `, ${t.report.tasks.monthly}` : ''}
                  </p>
                </div>
                <ol className="mt-3 flex flex-wrap gap-1.5">
                  {task.cells.map((cell) => (
                    <li
                      key={cell.on}
                      className={`flex min-w-14 flex-col items-center rounded-lg px-2 py-1 text-xs ${
                        cell.state === 'done'
                          ? toneClasses.ok.chip
                          : cell.state === 'open'
                            ? toneClasses.danger.chip
                            : 'text-ink-muted'
                      }`}
                    >
                      <span>{weekdayDayText(cell.on)}</span>
                      <span className="font-semibold">
                        {cell.initials ?? (cell.state === 'open' ? '–' : '')}
                      </span>
                      <span className="sr-only">
                        {cell.state === 'done'
                          ? t.report.tasks.cell.done(cell.initials ?? '')
                          : cell.state === 'open'
                            ? t.report.tasks.cell.open
                            : t.report.tasks.cell.notDue}
                      </span>
                    </li>
                  ))}
                </ol>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Section title={t.report.receipts.title}>
        {report.receipts.length === 0 ? (
          <p className="text-ink-muted">{t.report.receipts.empty}</p>
        ) : (
          <DataTable
            caption={t.report.receipts.title}
            rows={report.receipts}
            getRowKey={(row) => row.deliveryId}
            columns={receiptColumns()}
          />
        )}
      </Section>
      <Section title={t.report.missing.title}>
        <p className="text-ink-muted">
          {report.missingDays.length === 0
            ? t.report.missing.empty
            : t.report.missing.text(report.missingDays.map(longDay).join(', '))}
        </p>
      </Section>
      <Section title={t.report.people.title}>
        <Card>
          <ul className="grid gap-1 sm:grid-cols-2">
            {report.people.map((person) => (
              <li key={person.initials}>{t.report.people.line(person.initials, person.name)}</li>
            ))}
          </ul>
        </Card>
      </Section>
    </div>
  );
}

interface StorageRow {
  on: LocalDate;
}

function storageColumns(report: ReportView): DataTableColumn<StorageRow>[] {
  return [
    { key: 'day', header: t.report.storage.day, render: (row) => dayText(row.on) },
    ...report.areas.map<DataTableColumn<StorageRow>>((area) => ({
      key: area.areaId,
      header: area.name,
      align: 'right',
      render: (row) => storageText(area, row.on),
    })),
  ];
}

/** One area on one day: the lowest and the highest reading, and how many were out of range. */
function storageText(area: ReportView['areas'][number], on: LocalDate): string {
  const day = area.days.find((entry) => entry.on === on);
  if (
    day === undefined ||
    day.count === 0 ||
    day.minDeciC === undefined ||
    day.maxDeciC === undefined
  ) {
    return t.report.storage.none;
  }
  const span = `${formatDecimal(day.minDeciC / 10, { digits: 1 })} bis ${formatDecimal(day.maxDeciC / 10, { digits: 1 })} °C`;
  return day.outOfRange === 0 ? span : `${span}, ${t.report.storage.out(day.outOfRange)}`;
}

function foodColumns(): DataTableColumn<ReportView['food'][number]>[] {
  return [
    {
      key: 'when',
      header: t.temperatures.table.when,
      render: (row) => `${dayText(row.on)} ${clockText(row.measuredAt)}`,
    },
    {
      key: 'what',
      header: t.temperatures.table.what,
      render: (row) => row.label ?? kindText(row.kind),
    },
    {
      key: 'value',
      header: t.temperatures.table.value,
      align: 'right',
      render: (row) => degrees(row.deciC),
    },
    {
      key: 'limit',
      header: t.report.food.limitTitle,
      hideBelow: 'md',
      render: (row) => {
        const range = rangeText(row.minDeciC, row.maxDeciC);
        return range === undefined ? '–' : t.report.food.limit(range);
      },
    },
    {
      key: 'result',
      header: t.temperatures.table.result,
      render: (row) => (
        <StatusChip tone={row.ok ? 'ok' : 'danger'} size="sm">
          {resultText(row.ok)}
        </StatusChip>
      ),
    },
    {
      key: 'who',
      header: t.temperatures.table.who,
      hideBelow: 'lg',
      render: (row) => row.measuredByName,
    },
  ];
}

function receiptColumns(): DataTableColumn<ReportView['receipts'][number]>[] {
  const f = t.report.receipts;
  return [
    { key: 'day', header: f.title, render: (row) => dayText(row.receivedOn) },
    { key: 'supplier', header: f.supplier, render: (row) => row.supplierName },
    {
      key: 'document',
      header: f.document,
      hideBelow: 'md',
      render: (row) => row.documentNumber ?? '–',
    },
    {
      key: 'temperature',
      header: f.temperature,
      align: 'right',
      render: (row) => (row.tempDeciC === undefined ? '–' : degrees(row.tempDeciC)),
    },
    {
      key: 'check',
      header: f.check,
      render: (row) => (
        <StatusChip tone={row.checkOk ? 'ok' : 'danger'} size="sm">
          {row.checkOk ? f.yes : f.no}
        </StatusChip>
      ),
    },
    { key: 'who', header: f.by, hideBelow: 'lg', render: (row) => row.initials },
  ];
}
