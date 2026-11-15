import {
  allergenLabel,
  formatSwissDate,
  planSlotLabel,
  type PlanDay,
  type PlanEntryView,
  type PlanLineDay,
  type LocalDate,
  type PlanSlot,
} from '@randen/core';
import { Plus } from 'lucide-react';
import { Button } from '../../ui/Button';
import { DishPhoto } from '../../ui/DishPhoto';
import { MarginBadge } from '../../ui/badges';
import { StatusChip } from '../../ui/StatusChip';
import { productionMessages } from './messages';
import { useDetailed } from '../../app/view';
import { shortDay } from './shared';

const t = productionMessages;

/** The lines of a day: their allergens and the warnings about what they promise. */
function LineSummary({ line }: { line: PlanLineDay }) {
  const allergens = line.allergens.map(allergenLabel).join(', ');
  const traces = line.traces.map(allergenLabel).join(', ');
  return (
    <li className="space-y-0.5 text-[0.8125rem]">
      <p>
        <span className="font-semibold">{t.plan.lineAllergens(line.name)}</span>:{' '}
        {allergens === '' ? t.plan.allergensNone : allergens}
        {traces === '' ? '' : ` · Spuren: ${traces}`}
      </p>
      {line.warnings.map((warning) => (
        <p
          key={`${warning.kind}-${warning.allergen ?? warning.diet ?? ''}-${String(warning.trace)}`}
        >
          <StatusChip tone="soon" size="sm">
            {warning.kind === 'diet' &&
            warning.requiredDiet !== undefined &&
            warning.diet !== undefined
              ? t.plan.warningDiet(t.diets[warning.requiredDiet], t.diets[warning.diet])
              : warning.allergen === undefined
                ? ''
                : t.plan.warningAllergen(allergenLabel(warning.allergen), warning.trace === true)}
          </StatusChip>
        </p>
      ))}
    </li>
  );
}

/**
 * One entry on the plan: photo, name, portions, line and how the margin stands. Without `onOpen`
 * (the planning is off) it is text: nothing opens it.
 */
export function PlanEntryButton({
  entry,
  onOpen,
}: {
  entry: PlanEntryView;
  onOpen?: ((entry: PlanEntryView) => void) | undefined;
}) {
  const detailed = useDetailed();
  const content = (
    <>
      <DishPhoto photo={entry.photo} alt="" className="size-11 shrink-0" radius="md" />
      <span className="min-w-0 flex-1">
        <span className="block leading-snug font-semibold break-words">{entry.recipeName}</span>
        <span className="block text-[0.8125rem] text-ink-muted">
          {t.plan.entryMeta(entry.portions)}
          {entry.lineName === undefined ? '' : ` · ${entry.lineName}`}
        </span>
      </span>
      {entry.produced ? (
        <StatusChip tone="ok" size="sm">
          {t.plan.producedBadge}
        </StatusChip>
      ) : detailed ? (
        <MarginBadge status={entry.marginStatus} foodCostBps={entry.foodCostBps} short size="sm" />
      ) : null}
    </>
  );
  if (onOpen === undefined) {
    return (
      <div className="flex min-h-14 w-full items-center gap-2 rounded-xl bg-surface p-2 text-left shadow-card">
        {content}
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={() => {
        onOpen(entry);
      }}
      className="flex min-h-14 w-full items-center gap-2 rounded-xl bg-surface p-2 text-left shadow-card transition-colors hover:bg-surface-muted"
    >
      {content}
    </button>
  );
}

/**
 * One day of the week: its meals in order, with the entries and the allergens per line. From
 * `lg` the seven days stand side by side; on the phone they follow one another.
 */
export function PlanDayColumn({
  day,
  slots,
  today,
  detailed,
  formatMoney,
  onOpen,
  onAdd,
}: {
  day: PlanDay;
  slots: readonly PlanSlot[];
  today: LocalDate;
  detailed: boolean;
  formatMoney: (amount: number) => string;
  /** Without it the entries are text: the function of the plan is off. */
  onOpen?: ((entry: PlanEntryView) => void) | undefined;
  /** Without it the day has no «+»: the function of the plan is off. */
  onAdd?: ((date: LocalDate) => void) | undefined;
}) {
  const index = (new Date(`${day.date}T00:00:00Z`).getUTCDay() + 6) % 7;
  const name = shortDay(day.date, index);
  return (
    <article
      aria-labelledby={`day-${day.date}`}
      className="flex min-w-0 flex-col gap-3 rounded-2xl bg-surface-muted/60 p-3 print:break-inside-avoid print:border print:border-black print:bg-white"
    >
      <header className="flex items-center justify-between gap-2">
        <h3 id={`day-${day.date}`} className="text-[1.0625rem] font-bold">
          {name}
          {day.date === today ? ` · ${t.plan.today}` : ''}
        </h3>
        {onAdd === undefined ? null : (
          <Button
            variant="ghost"
            size="sm"
            icon={Plus}
            aria-label={t.plan.addOn(formatSwissDate(day.date))}
            onClick={() => {
              onAdd(day.date);
            }}
            className="print:hidden"
          >
            <span className="sr-only">{t.plan.addOn(formatSwissDate(day.date))}</span>
          </Button>
        )}
      </header>
      {day.entries.length === 0 ? (
        <p className="text-sm text-ink-muted">{t.plan.emptyDay}</p>
      ) : null}
      {slots.map((slot) => {
        const entries = day.entries.filter((entry) => entry.slot === slot);
        if (entries.length === 0) {
          return null;
        }
        return (
          <section key={slot} aria-label={planSlotLabel(slot)} className="space-y-2">
            <p className="text-[0.75rem] font-semibold tracking-wide text-ink-muted uppercase">
              {planSlotLabel(slot)}
            </p>
            {entries.map((entry) => (
              <PlanEntryButton key={entry.id} entry={entry} onOpen={onOpen} />
            ))}
          </section>
        );
      })}
      {day.lines.length === 0 ? null : (
        <ul className="space-y-1.5 border-t border-line pt-2">
          {day.lines.map((line, index) => (
            // Lines without a menu line share the id «none»: the index keeps the keys unique.
            <LineSummary key={line.lineId ?? `none-${String(index)}`} line={line} />
          ))}
        </ul>
      )}
      <footer className="space-y-0.5 text-[0.8125rem] text-ink-muted">
        <p className="tabular-nums">{t.plan.dayTotals(day.portions)}</p>
        {detailed ? (
          <p className="tabular-nums">
            {t.plan.dayRevenue(formatMoney(day.netRevenueRappen), formatMoney(day.costRappen))}
          </p>
        ) : null}
        {day.unpricedEntries > 0 ? <p>{t.plan.unpriced(day.unpricedEntries)}</p> : null}
      </footer>
    </article>
  );
}
