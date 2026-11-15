import { useDetailed } from '../../app/view';
import { Card } from '../../ui/Card';
import { LineChart } from '../../ui/charts';
import { DataTable, type DataTableColumn } from '../../ui/DataTable';
import { StatusChip } from '../../ui/StatusChip';
import { haccpMessages as t } from './messages';
import { clockText, dayText, degrees, kindText, rangeText, resultText } from './shared';
import type { LogRow, ListView, SeriesRow } from './types';

interface TemperatureHistoryProps {
  list: ListView;
  /** The address of a reading, to open it. */
  hrefOf: (logId: string) => string;
}

/**
 * «Verlauf» of the period: the chart of each area (only in «Erweitert», the detailed view), then
 * the log, newest first. A row opens the reading; out of range is said in words.
 */
export function TemperatureHistory({ list, hrefOf }: TemperatureHistoryProps) {
  const detailed = useDetailed();
  if (list.logs.length === 0) {
    return <p className="text-ink-muted">{t.temperatures.empty}</p>;
  }
  return (
    <div className="space-y-6">
      {detailed
        ? list.series.map((series) => (
            <Card key={series.areaId}>
              <h3 className="text-lg font-semibold">{t.temperatures.chart.title(series.name)}</h3>
              <div className="mt-3">
                <SeriesChart series={series} />
              </div>
            </Card>
          ))
        : null}
      <DataTable<LogRow>
        caption={t.temperatures.table.caption}
        rows={list.logs}
        getRowKey={(row) => row.id}
        rowLink={(row) => hrefOf(row.id)}
        columns={columnsOf()}
      />
    </div>
  );
}

function columnsOf(): DataTableColumn<LogRow>[] {
  const f = t.temperatures.table;
  return [
    {
      key: 'when',
      header: f.when,
      render: (row) => `${dayText(row.on)} ${clockText(row.measuredAt)}`,
    },
    {
      key: 'what',
      header: f.what,
      render: (row) => row.areaName ?? row.label ?? kindText(row.kind),
    },
    {
      key: 'value',
      header: f.value,
      align: 'right',
      render: (row) => degrees(row.deciC),
    },
    {
      key: 'result',
      header: f.result,
      render: (row) => (
        <StatusChip tone={row.ok ? 'ok' : 'danger'} size="sm">
          {resultText(row.ok)}
        </StatusChip>
      ),
    },
    {
      key: 'range',
      header: f.range,
      hideBelow: 'md',
      render: (row) => rangeText(row.minDeciC, row.maxDeciC) ?? t.results.noLimit,
    },
    {
      key: 'action',
      header: f.action,
      hideBelow: 'lg',
      render: (row) => row.action ?? '',
    },
    {
      key: 'who',
      header: f.who,
      hideBelow: 'md',
      render: (row) => row.measuredByName,
    },
  ];
}

/**
 * One chart per area: the warmest and the coolest reading of each day. The axis starts at zero
 * in the kit, so the values are shifted by a whole ten degrees below zero and shifted back on the
 * ticks and in the table.
 */
function SeriesChart({ series }: { series: SeriesRow }) {
  const lowest = Math.min(...series.points.map((point) => point.lowestDeciC));
  const base = Math.min(0, Math.floor(lowest / 100) * 100);
  const range = rangeText(series.minDeciC, series.maxDeciC) ?? t.temperatures.chart.noRange;
  const shown = (value: number) => degrees(value + base);
  return (
    <LineChart
      summary={t.temperatures.chart.summary(series.name, range)}
      categoryLabel={t.temperatures.chart.day}
      valueLabel={t.temperatures.chart.warmest}
      secondLabel={t.temperatures.chart.coolest}
      data={series.points.map((point) => ({
        label: `${point.on.slice(8, 10)}.${point.on.slice(5, 7)}.`,
        value: point.highestDeciC - base,
        second: point.lowestDeciC - base,
      }))}
      formatValue={shown}
      formatTick={shown}
    />
  );
}
