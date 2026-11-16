import { useRef, useState } from 'react';
import { errorText, useCommand } from '../../app/hooks';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { TemperatureBadge } from '../../ui/badges';
import { TemperatureField } from '../../ui/TemperatureField';
import { useToast } from '../../ui/Toast';
import { OutOfRangeSheet } from './OutOfRangeSheet';
import { useEnterKeyHint } from './hooks';
import { haccpMessages as t } from './messages';
import { clockText, degrees, inRange, rangeText } from './shared';
import type { TodayArea } from './types';

/**
 * «Temperaturen heute» (H4): one card per storage area with a range. The last reading of today
 * is shown with its result and who took it; a new reading is one field and one button. Out of
 * range, the sheet asks what was done before it saves.
 */
export function TodayAreas({ areas }: { areas: TodayArea[] }) {
  return (
    <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-1">
      {areas.map((area) => (
        <li key={area.areaId} className="min-w-0">
          <AreaCard area={area} />
        </li>
      ))}
    </ul>
  );
}

function AreaCard({ area }: { area: TodayArea }) {
  const run = useCommand();
  const toast = useToast();
  const form = useRef<HTMLFormElement>(null);
  const [value, setValue] = useState<number | null>(null);
  const [outOfRange, setOutOfRange] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEnterKeyHint(form, 'done');

  const range = rangeText(area.minDeciC, area.maxDeciC);
  const limits = { minDeciC: area.minDeciC, maxDeciC: area.maxDeciC };

  async function save(deciC: number, action?: string) {
    setBusy(true);
    setError(null);
    try {
      const result = await run('temperatures.record', {
        kind: 'storage',
        areaId: area.areaId,
        deciC,
        ...(action === undefined ? {} : { action }),
      });
      toast({
        text: result.ok
          ? t.today.recorded(area.name, degrees(deciC))
          : t.today.recordedOut(area.name, degrees(deciC)),
        tone: result.ok ? 'ok' : 'danger',
      });
      setValue(null);
      setOutOfRange(null);
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="text-lg font-semibold">{area.name}</h3>
        {range === undefined ? null : <p className="text-sm text-ink-muted">{range}</p>}
      </div>
      <p className="mt-2 min-h-6 text-sm">
        {area.reading === undefined ? (
          <span className="text-ink-muted">{t.today.notYet}</span>
        ) : (
          <>
            <TemperatureBadge deciC={area.reading.deciC} ok={area.reading.ok} />
            <span className="ml-2 text-ink-muted">
              {t.today.lastReading(clockText(area.reading.measuredAt), area.reading.measuredByName)}
            </span>
          </>
        )}
      </p>
      <form
        ref={form}
        className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          if (value === null || busy) {
            return;
          }
          if (inRange(value, limits)) {
            void save(value);
          } else {
            setOutOfRange(value);
          }
        }}
      >
        <div className="min-w-0 sm:flex-1">
          <TemperatureField
            label={t.today.field(area.name)}
            hint={range === undefined ? undefined : t.today.fieldHint(range)}
            value={value}
            onChange={setValue}
            required
            className="w-full"
          />
        </div>
        <Button type="submit" busy={busy} disabled={value === null} className="w-full sm:w-auto">
          {t.today.record} <span className="sr-only">für {area.name}</span>
        </Button>
      </form>
      {outOfRange === null ? null : (
        <OutOfRangeSheet
          key={outOfRange}
          deciC={outOfRange}
          range={range}
          busy={busy}
          error={error}
          onClose={() => {
            setOutOfRange(null);
            setError(null);
          }}
          onSave={(action) => void save(outOfRange, action)}
        />
      )}
    </Card>
  );
}
