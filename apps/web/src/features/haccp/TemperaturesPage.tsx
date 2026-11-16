import type { TemperatureKind } from '@randen/core';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { errorText, useCommand, useQuery, useToday } from '../../app/hooks';
import { paths } from '../../app/paths';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { GroupedList, ListRow } from '../../ui/GroupedList';
import { PageHeader } from '../../ui/PageHeader';
import { SegmentedControl } from '../../ui/SegmentedControl';
import { Section } from '../../ui/Section';
import { ConfirmDialog, Sheet } from '../../ui/Sheet';
import { StatusChip } from '../../ui/StatusChip';
import { useToast } from '../../ui/Toast';
import { TemperatureForm } from './TemperatureForm';
import { TemperatureHistory } from './TemperatureHistory';
import { haccpMessages as t } from './messages';
import { clockText, dayText, degrees, kindText, lastDays, rangeText, resultText } from './shared';
import type { LogRow } from './types';

/** The kinds a page can open with (`?kind=`); goods at the door belong to the stock module. */
const OPENABLE: readonly TemperatureKind[] = ['storage', 'cooking', 'hot_holding', 'cooling'];

/**
 * «Verlauf der Temperaturen»: measuring (any kind), then the history of the period. The period
 * and the opened reading live in the address, so «Zurück» shows the list as it was. A reading
 * of today can be removed (a typo); the chart is part of the detailed view.
 */
export function TemperaturesPage() {
  const [params, setParams] = useSearchParams();
  const day = useToday();
  const period = params.get('zeit') === '30' ? 30 : 7;
  const { from, to } = lastDays(day, period);
  const list = useQuery('temperatures.list', { from, to });
  const requested = params.get('kind');
  const initialKind = OPENABLE.find((kind) => kind === requested) ?? 'storage';
  const logId = params.get('messung');

  function hrefOf(id: string) {
    const next = new URLSearchParams(params);
    next.set('messung', id);
    return `${paths.temperatures()}?${next.toString()}`;
  }

  function closeReading() {
    const next = new URLSearchParams(params);
    next.delete('messung');
    setParams(next, { replace: true });
  }

  const reading = list?.logs.find((row) => row.id === logId);

  return (
    <>
      <PageHeader title={t.temperatures.title} back={{ to: paths.haccp(), label: t.back }} />
      <div className="space-y-8">
        <Section title={t.temperatures.record}>
          <Card>
            {list === undefined ? null : (
              <TemperatureForm
                key={initialKind}
                areas={list.areas}
                proposals={list.proposals}
                initialKind={initialKind}
              />
            )}
          </Card>
        </Section>
        <Section title={t.temperatures.history}>
          <div className="mb-4 max-w-xl print:hidden">
            <SegmentedControl
              label={t.temperatures.period}
              options={[
                { value: '7', label: t.temperatures.periods.week },
                { value: '30', label: t.temperatures.periods.month },
              ]}
              value={period === 30 ? '30' : '7'}
              onChange={(value) => {
                const next = new URLSearchParams(params);
                next.set('zeit', value);
                setParams(next, { replace: true });
              }}
            />
          </div>
          {list === undefined ? null : <TemperatureHistory list={list} hrefOf={hrefOf} />}
        </Section>
      </div>
      {reading === undefined || list === undefined ? null : (
        <ReadingSheet key={reading.id} reading={reading} onClose={closeReading} />
      )}
    </>
  );
}

/** One reading, with the same-day removal (ConfirmDialog says what is lost). */
function ReadingSheet({ reading, onClose }: { reading: LogRow; onClose: () => void }) {
  const run = useCommand();
  const toast = useToast();
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const range = rangeText(reading.minDeciC, reading.maxDeciC) ?? t.results.noLimit;
  const what = reading.areaName ?? reading.label ?? kindText(reading.kind);
  const f = t.temperatures.detail.facts;

  async function remove() {
    try {
      await run('temperatures.remove', { logId: reading.id });
      toast({ text: t.temperatures.detail.removed, tone: 'ok' });
      onClose();
    } catch (failure) {
      setError(errorText(failure));
      setAsking(false);
    }
  }

  return (
    <>
      <Sheet open onClose={onClose} title={t.temperatures.detail.title}>
        <GroupedList label={t.temperatures.detail.title}>
          <ListRow title={f.what} trailing={what} />
          <ListRow
            title={f.when}
            trailing={`${dayText(reading.on)} ${clockText(reading.measuredAt)}`}
          />
          <ListRow title={f.value} trailing={degrees(reading.deciC)} />
          <ListRow title={f.range} trailing={range} />
          <ListRow
            title={f.result}
            trailing={
              <StatusChip tone={reading.ok ? 'ok' : 'danger'} size="sm">
                {resultText(reading.ok)}
              </StatusChip>
            }
          />
          <ListRow title={f.action} trailing={reading.action ?? '–'} trailingWords />
          <ListRow title={f.who} trailing={reading.measuredByName} trailingWords />
        </GroupedList>
        <div className="mt-5 space-y-3">
          {reading.removable ? (
            <>
              <Button
                variant="danger"
                fullWidth
                onClick={() => {
                  setAsking(true);
                }}
              >
                {t.temperatures.detail.remove}
              </Button>
              {error === null ? null : (
                <p role="alert" className="text-danger">
                  {error}
                </p>
              )}
            </>
          ) : (
            <p className="text-ink-muted">{t.temperatures.detail.notRemovable}</p>
          )}
        </div>
      </Sheet>
      <ConfirmDialog
        open={asking}
        tone="danger"
        title={t.temperatures.detail.removeTitle}
        text={t.temperatures.detail.removeText(`${what}, ${degrees(reading.deciC)}`)}
        confirmLabel={t.temperatures.detail.remove}
        cancelLabel={t.temperatures.detail.cancel}
        onConfirm={() => void remove()}
        onCancel={() => {
          setAsking(false);
        }}
      />
    </>
  );
}
