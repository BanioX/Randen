import {
  formatSwissDate,
  LocalDateSchema,
  rappen,
  type AutoFillEntry,
  type Id,
  type LocalDate,
  type PlanEntryView,
  type PlanSlot,
} from '@randen/core';
import { ChevronLeft, ChevronRight, Copy, Plus, Printer, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { errorText, useCommand, useMoney, useQuery, useToday } from '../../app/hooks';
import { useDetailed } from '../../app/view';
import { useModule } from '../../app/modules';
import { Button } from '../../ui/Button';
import { ConfirmDialog } from '../../ui/Sheet';
import { PageHeader } from '../../ui/PageHeader';
import { useToast } from '../../ui/Toast';
import { MealsPanel } from './MealsPanel';
import { PlanDayColumn } from './PlanDayColumn';
import { AddEntrySheet, EntrySheet, FillResultSheet } from './PlanSheets';
import { DemandCard, SuggestionsCard } from './PlanCards';
import { LinesSheet } from './LinesSheet';
import { productionMessages } from './messages';
import { isoWeekNumber, mondayOfDay, shiftWeek } from './shared';

const t = productionMessages;

/**
 * «Menüplan» (pattern H1 for the week): seven days, the meals in order, the dishes as cards with
 * their margin, the allergens and warnings per line. On the phone the days follow one another;
 * from `lg` they stand side by side. Next to it: «Reste verwerten», «Bedarf dieser Woche», the
 * meals and the weighings when the functions are on. The week lives in the address.
 */
export function PlanPage() {
  const [params, setParams] = useSearchParams();
  const today = useToday();
  const money = useMoney();
  const detailed = useDetailed();
  const planning = useModule('planning');
  const meals = useModule('meals');
  const run = useCommand();
  const toast = useToast();

  const requested = LocalDateSchema.safeParse(params.get('week'));
  const monday = mondayOfDay(requested.success ? requested.data : today);
  const week = useQuery('plan.week', { weekStart: monday });
  const lines = useQuery('plan.linesList', { includeInactive: true });
  const suggestions = useQuery('plan.suggest', { from: today, days: 7 }, { enabled: planning });

  const [entry, setEntry] = useState<PlanEntryView | null>(null);
  const [addDate, setAddDate] = useState<LocalDate | null>(null);
  const [linesOpen, setLinesOpen] = useState(false);
  const [asking, setAsking] = useState<'fill' | 'copy' | null>(null);
  const [filled, setFilled] = useState<{ planned: AutoFillEntry[]; skipped: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /** Moves the page to another week; the address keeps it. */
  function goTo(next: LocalDate | null) {
    const address = new URLSearchParams(params);
    if (next === null) {
      address.delete('week');
    } else {
      address.set('week', next);
    }
    setParams(address, { replace: true });
  }

  const plannedDishes = new Set<Id>(
    week?.days.flatMap((day) => day.entries.map((row) => row.recipeId)) ?? [],
  );
  const sunday = week?.weekEnd ?? monday;
  const plannedLines = lines?.lines ?? [];

  async function fill() {
    if (week === undefined) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await run('plan.autoFill', {
        weekStart: monday,
        slots: week.slots,
        dishesPerSlot: 1,
      });
      setFilled(result);
      toast({ text: t.fill.done(result.planned.length), tone: 'ok' });
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy(false);
      setAsking(null);
    }
  }

  async function copy() {
    setBusy(true);
    setError(null);
    try {
      const result = await run('plan.copyWeek', {
        fromWeekStart: monday,
        toWeekStart: shiftWeek(monday, 1),
      });
      toast({
        text:
          result.skipped === 0
            ? t.copy.done(result.copied)
            : `${t.copy.done(result.copied)}. ${t.copy.skipped(result.skipped)}`,
        tone: 'ok',
      });
      goTo(shiftWeek(monday, 1));
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy(false);
      setAsking(null);
    }
  }

  const slots: readonly PlanSlot[] = week?.slots ?? ['lunch'];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t.plan.title}
        actions={
          planning ? (
            <Button
              variant="primary"
              icon={Plus}
              onClick={() => {
                setAddDate(today);
              }}
            >
              {t.plan.add}
            </Button>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Button
          variant="ghost"
          icon={ChevronLeft}
          aria-label={t.plan.previous}
          onClick={() => {
            goTo(shiftWeek(monday, -1));
          }}
        />
        <p className="min-w-0 flex-1 text-center text-[1.0625rem] font-semibold tabular-nums sm:flex-none">
          {t.plan.week(isoWeekNumber(monday))} ·{' '}
          {t.plan.weekRange(formatSwissDate(monday), formatSwissDate(sunday))}
        </p>
        <Button
          variant="ghost"
          icon={ChevronRight}
          aria-label={t.plan.next}
          onClick={() => {
            goTo(shiftWeek(monday, 1));
          }}
        />
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            goTo(null);
          }}
        >
          {t.plan.today}
        </Button>
      </div>

      <h2 className="sr-only print:not-sr-only print:text-2xl print:font-bold">
        {t.print.weekTitle} {t.plan.week(isoWeekNumber(monday))}
      </h2>

      {week === undefined ? null : (
        <div className="grid gap-3 xl:grid-cols-7 print:grid print:grid-cols-7 print:gap-2">
          {week.days.map((day) => (
            <PlanDayColumn
              key={day.date}
              day={day}
              slots={slots}
              today={today}
              detailed={detailed}
              formatMoney={(amount) => money.format(rappen(amount))}
              onOpen={planning ? setEntry : undefined}
              onAdd={planning ? setAddDate : undefined}
            />
          ))}
        </div>
      )}
      {week?.entries === 0 ? (
        <p className="text-ink-muted print:hidden">{t.plan.noWeekEntries}</p>
      ) : null}
      {week !== undefined && detailed ? (
        <p className="text-[0.875rem] text-ink-muted tabular-nums print:hidden">
          {t.plan.weekSummary(week.entries, week.portions)} ·{' '}
          {t.plan.dayRevenue(money.format(week.netRevenueRappen), money.format(week.costRappen))}
        </p>
      ) : null}

      {error === null ? null : (
        <p role="alert" className="text-danger print:hidden">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2 print:hidden">
        {planning ? (
          <>
            <Button
              variant="secondary"
              icon={Sparkles}
              busy={busy}
              disabled={week === undefined}
              onClick={() => {
                setAsking('fill');
              }}
            >
              {t.plan.fill}
            </Button>
            <Button
              variant="secondary"
              icon={Copy}
              busy={busy}
              disabled={week === undefined || week.entries === 0}
              onClick={() => {
                setAsking('copy');
              }}
            >
              {t.plan.copy}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setLinesOpen(true);
              }}
            >
              {t.plan.lines}
            </Button>
          </>
        ) : null}
        <Button
          variant="ghost"
          icon={Printer}
          onClick={() => {
            window.print();
          }}
        >
          {t.plan.print}
        </Button>
      </div>

      {planning && week?.entries === 0 ? (
        <p className="text-ink-muted print:hidden">{t.copy.empty}</p>
      ) : null}

      {planning && week !== undefined ? (
        <div className="grid gap-6 md:grid-cols-2 print:hidden">
          <SuggestionsCard
            suggestions={suggestions?.suggestions ?? []}
            plannedDishes={plannedDishes}
          />
          <DemandCard demand={week.demand} />
        </div>
      ) : null}

      {meals && week !== undefined ? (
        <div className="grid gap-6 md:grid-cols-2 print:hidden">
          <MealsPanel week={week} />
        </div>
      ) : null}

      {planning ? (
        <EntrySheet
          key={entry === null ? 'new-entry' : `entry-${entry.id}`}
          entry={entry}
          lines={plannedLines}
          onClose={() => {
            setEntry(null);
          }}
        />
      ) : null}
      {planning ? (
        <AddEntrySheet
          key={addDate === null ? 'new-date' : `date-${addDate}`}
          date={addDate}
          lines={plannedLines}
          onClose={() => {
            setAddDate(null);
          }}
          onDone={(next) => {
            goTo(mondayOfDay(next));
          }}
        />
      ) : null}
      {planning ? (
        <LinesSheet
          open={linesOpen}
          lines={plannedLines}
          onClose={() => {
            setLinesOpen(false);
          }}
        />
      ) : null}
      <FillResultSheet
        open={filled !== null}
        planned={filled?.planned ?? []}
        skipped={filled?.skipped ?? 0}
        onClose={() => {
          setFilled(null);
        }}
      />
      <ConfirmDialog
        open={asking === 'fill'}
        title={t.fill.title}
        text={t.fill.text}
        confirmLabel={t.fill.action}
        cancelLabel={t.cancel}
        onConfirm={() => {
          void fill();
        }}
        onCancel={() => {
          setAsking(null);
        }}
      />
      <ConfirmDialog
        open={asking === 'copy'}
        title={t.copy.title}
        text={t.copy.text(isoWeekNumber(shiftWeek(monday, 1)))}
        confirmLabel={t.copy.action}
        cancelLabel={t.cancel}
        onConfirm={() => {
          void copy();
        }}
        onCancel={() => {
          setAsking(null);
        }}
      />
    </div>
  );
}
