import {
  formatQuantity,
  formatSwissDate,
  planSlotLabel,
  type LocalDate,
  type PlanSlot,
  type PlanWeek,
  type WeighingRow,
} from '@randen/core';
import { Trash2, Users } from 'lucide-react';
import { useRef, useState } from 'react';
import { errorText, useCommand, useToday } from '../../app/hooks';
import { Button } from '../../ui/Button';
import { ChoiceChips } from '../../ui/ChoiceChips';
import { DateField } from '../../ui/DateField';
import { EmptyState } from '../../ui/EmptyState';
import { FormActions } from '../../ui/FormActions';
import { GroupedList, GroupedListItem, ListRow } from '../../ui/GroupedList';
import { NumberField } from '../../ui/NumberField';
import { Section } from '../../ui/Section';
import { SelectField } from '../../ui/SelectField';
import { Sheet } from '../../ui/Sheet';
import { useToast } from '../../ui/Toast';
import { productionMessages } from './messages';
import { shortDay } from './shared';

const t = productionMessages;
type Kind = WeighingRow['kind'];
const KINDS: readonly Kind[] = ['plate', 'serving', 'production'];

/** Day and meal of a row, in words: «Mo 09.11., Mittag». */
function dayMeal(date: LocalDate, slot: PlanSlot): string {
  const index = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
  return `${shortDay(date, index)}, ${planSlotLabel(slot)}`;
}

/**
 * «Mahlzeiten» and «Tellerrücklauf» in the plan (ADR-0015, when the function «Mahlzeiten zählen»
 * is on): expected meals come from the plan, served meals are typed after the service; weighings
 * are grams. Neither changes the stock.
 */
export function MealsPanel({ week }: { week: PlanWeek }) {
  const run = useCommand();
  const toast = useToast();
  const today = useToday();
  const [editing, setEditing] = useState<{ date: LocalDate; slot: PlanSlot } | null>(null);
  const [expected, setExpected] = useState<number | null>(null);
  const [served, setServed] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [date, setDate] = useState<LocalDate | null>(today);
  const [slot, setSlot] = useState<PlanSlot | null>(null);
  const [kind, setKind] = useState<Kind>('plate');
  const [grams, setGrams] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Set at once, before the state shows the wait: a second tap in between writes nothing.
  const sending = useRef(false);

  const rows = week.days.flatMap((day) => week.slots.map((slot) => ({ date: day.date, slot })));

  /** The count of the day and meal without a line; the plan's portions stand in for it. */
  function countOf(date: LocalDate, slot: PlanSlot) {
    const meal = week.meals.find(
      (row) => row.date === date && row.slot === slot && row.lineId === undefined,
    );
    const planned = week.planned
      .filter((row) => row.date === date && row.slot === slot)
      .reduce((sum, row) => sum + row.portions, 0);
    return { meal, planned };
  }

  async function saveMeals() {
    if (editing === null) {
      return;
    }
    setError(null);
    try {
      await run('plan.mealsSet', {
        date: editing.date,
        slot: editing.slot,
        expected,
        served,
      });
      toast({ text: t.meals.saved, tone: 'ok' });
      setEditing(null);
    } catch (caught) {
      setError(errorText(caught));
    }
  }

  async function addWeighing() {
    if (date === null || grams === null) {
      setError(t.weighings.missing);
      return;
    }
    if (sending.current) {
      return;
    }
    sending.current = true;
    setBusy(true);
    setError(null);
    try {
      await run('plan.weighingAdd', {
        date,
        kind,
        grams,
        ...(slot === null ? {} : { slot }),
      });
      toast({ text: t.weighings.saved, tone: 'ok' });
      setAdding(false);
      setGrams(null);
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  async function remove(weighing: WeighingRow) {
    try {
      await run('plan.weighingRemove', { weighingId: weighing.id });
      toast({ text: t.weighings.removed });
    } catch (caught) {
      setError(errorText(caught));
    }
  }

  return (
    <>
      <Section title={t.meals.title} hint={t.meals.caption}>
        {rows.length === 0 ? (
          <EmptyState icon={Users} title={t.meals.title} text={t.meals.empty} />
        ) : (
          <GroupedList label={t.meals.title}>
            {rows.map(({ date, slot }) => {
              const { meal, planned } = countOf(date, slot);
              const expectedNow = meal?.expected ?? (planned > 0 ? planned : undefined);
              return (
                <ListRow
                  key={`${date}|${slot}`}
                  title={dayMeal(date, slot)}
                  subtitle={`${t.meals.expected}: ${expectedNow === undefined ? '–' : String(expectedNow)} · ${t.meals.served}: ${meal?.served === undefined ? '–' : String(meal.served)}`}
                  onClick={() => {
                    setEditing({ date, slot });
                    setExpected(meal?.expected ?? (planned > 0 ? planned : null));
                    setServed(meal?.served ?? null);
                  }}
                />
              );
            })}
          </GroupedList>
        )}
      </Section>

      <Section
        title={t.weighings.title}
        hint={t.weighings.caption}
        action={{
          label: t.weighings.add,
          onClick: () => {
            setAdding(true);
          },
        }}
      >
        {week.weighings.length === 0 ? (
          <p className="text-ink-muted">{t.weighings.empty}</p>
        ) : (
          <GroupedList label={t.weighings.title}>
            {week.weighings.map((weighing) => (
              <GroupedListItem
                key={weighing.id}
                className="flex items-center justify-between gap-3"
              >
                <span className="min-w-0">
                  <span className="block font-semibold">{t.weighings.kinds[weighing.kind]}</span>
                  <span className="block text-[0.875rem] text-ink-muted">
                    {formatSwissDate(weighing.date)}
                    {weighing.slot === undefined ? '' : ` · ${planSlotLabel(weighing.slot)}`}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="font-semibold tabular-nums">
                    {formatQuantity(weighing.grams, 'g')}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={Trash2}
                    aria-label={t.weighings.removeAction(t.weighings.kinds[weighing.kind])}
                    onClick={() => {
                      void remove(weighing);
                    }}
                  />
                </span>
              </GroupedListItem>
            ))}
          </GroupedList>
        )}
        {error === null ? null : (
          <p role="alert" className="mt-2 text-danger">
            {error}
          </p>
        )}
      </Section>

      <Sheet
        open={editing !== null}
        onClose={() => {
          setEditing(null);
        }}
        title={
          editing === null
            ? t.meals.title
            : t.meals.sheetTitle(formatSwissDate(editing.date), planSlotLabel(editing.slot))
        }
      >
        <div className="space-y-5">
          <NumberField
            label={t.meals.expected}
            value={expected}
            onChange={setExpected}
            max={100_000}
          />
          <NumberField label={t.meals.served} value={served} onChange={setServed} max={100_000} />
          <FormActions
            placement="inline"
            primaryLabel={t.meals.save}
            onPrimary={() => {
              void saveMeals();
            }}
            error={error}
          />
        </div>
      </Sheet>

      <Sheet
        open={adding}
        onClose={() => {
          setAdding(false);
        }}
        title={t.weighings.add}
      >
        <div className="space-y-5">
          <DateField label={t.weighings.date} value={date} onChange={setDate} />
          <SelectField
            label={t.weighings.slot}
            placeholder={t.entry.noLine}
            options={week.slots.map((value) => ({ value, label: planSlotLabel(value) }))}
            value={slot}
            onChange={setSlot}
          />
          <ChoiceChips
            legend={t.weighings.kind}
            options={KINDS.map((value) => ({ value, label: t.weighings.kinds[value] }))}
            value={kind}
            onChange={setKind}
          />
          <NumberField
            label={t.weighings.grams}
            value={grams}
            onChange={setGrams}
            min={1}
            max={10_000_000}
          />
          <FormActions
            placement="inline"
            primaryLabel={t.weighings.action}
            onPrimary={() => {
              void addWeighing();
            }}
            primaryBusy={busy}
            error={error}
          />
        </div>
      </Sheet>
    </>
  );
}
