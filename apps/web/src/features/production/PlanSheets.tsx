import {
  formatQuantity,
  formatSwissDate,
  PLAN_SLOTS,
  planSlotLabel,
  type AutoFillEntry,
  type Id,
  type LocalDate,
  type PlanEntryView,
  type PlanLine,
  type PlanSlot,
} from '@randen/core';
import { ChefHat, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { errorText, useCommand, useMoney, useToday } from '../../app/hooks';
import { useModule } from '../../app/modules';
import { paths } from '../../app/paths';
import { useDetailed } from '../../app/view';
import { Button, ButtonLink } from '../../ui/Button';
import { DateField } from '../../ui/DateField';
import { FormActions } from '../../ui/FormActions';
import { Notice } from '../../ui/Notice';
import { RecipePicker } from '../../ui/pickers';
import { SelectField } from '../../ui/SelectField';
import { ConfirmDialog, Sheet } from '../../ui/Sheet';
import { TextField } from '../../ui/TextField';
import { useToast } from '../../ui/Toast';
import { productionMessages } from './messages';
import { Stepper } from './shared';

const t = productionMessages;

/** The line options of a picker: the active lines, and the line of the entry even if it is off. */
function lineOptions(lines: readonly PlanLine[], keep?: Id) {
  return lines
    .filter((line) => line.active || line.id === keep)
    .map((line) => ({
      value: line.id,
      label: line.active ? line.name : `${line.name} (${t.lines.inactive})`,
    }));
}

/**
 * An entry of the plan on a sheet: portions, note, line; «Produzieren» goes to the production
 * with the entry; «Aus dem Plan nehmen» asks first. Keyed by the entry, so it starts fresh.
 */
export function EntrySheet({
  entry,
  lines,
  onClose,
}: {
  entry: PlanEntryView | null;
  lines: readonly PlanLine[];
  onClose: () => void;
}) {
  const run = useCommand();
  const toast = useToast();
  const producing = useModule('production');
  const [portions, setPortions] = useState(entry?.portions ?? 1);
  const [note, setNote] = useState(entry?.note ?? '');
  const [lineId, setLineId] = useState<Id | null>(entry?.lineId ?? null);
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);

  async function save() {
    if (entry === null) {
      return;
    }
    setError(null);
    try {
      await run('plan.update', {
        entryId: entry.id,
        portions,
        note: note.trim() === '' ? null : note.trim(),
        lineId,
      });
      toast({ text: t.entry.saved, tone: 'ok' });
      onClose();
    } catch (caught) {
      setError(errorText(caught));
    }
  }

  async function remove() {
    if (entry === null) {
      return;
    }
    try {
      await run('plan.remove', { entryId: entry.id });
      toast({ text: t.entry.removed });
      setAsking(false);
      onClose();
    } catch (caught) {
      setError(errorText(caught));
      setAsking(false);
    }
  }

  return (
    <>
      <Sheet open={entry !== null} onClose={onClose} title={entry?.recipeName ?? t.entry.title}>
        {entry === null ? null : (
          <div className="space-y-5">
            {entry.produced ? <Notice tone="ok">{t.entry.producedNote}</Notice> : null}
            <div className="space-y-2">
              <p className="text-sm font-semibold text-ink-muted">{t.entry.portions}</p>
              <Stepper label={t.entry.portions} value={portions} onChange={setPortions} />
            </div>
            <SelectField
              label={t.entry.line}
              placeholder={t.entry.noLine}
              options={lineOptions(lines, entry.lineId)}
              value={lineId}
              onChange={setLineId}
            />
            <TextField
              label={t.entry.note}
              value={note}
              onChange={setNote}
              placeholder={t.entry.notePlaceholder}
              maxLength={200}
            />
            {entry.produced || !producing ? null : (
              <ButtonLink
                to={`${paths.productionNew(entry.recipeId)}&portions=${String(entry.portions)}&entry=${entry.id}`}
                variant="secondary"
                icon={ChefHat}
                fullWidth
              >
                {t.entry.produce}
              </ButtonLink>
            )}
            <FormActions
              placement="inline"
              primaryLabel={t.entry.save}
              onPrimary={() => {
                void save();
              }}
              error={error}
            />
            <Button
              variant="ghost"
              icon={Trash2}
              onClick={() => {
                setAsking(true);
              }}
              fullWidth
            >
              {t.entry.remove}
            </Button>
          </div>
        )}
      </Sheet>
      <ConfirmDialog
        open={asking && entry !== null}
        title={t.entry.removeTitle}
        text={t.entry.removeText(entry?.recipeName ?? '')}
        confirmLabel={t.entry.remove}
        tone="danger"
        onConfirm={() => {
          void remove();
        }}
        onCancel={() => {
          setAsking(false);
        }}
      />
    </>
  );
}

/** A dish on a day and a meal: the day is given, the dish and portions are picked. */
export function AddEntrySheet({
  date,
  lines,
  onClose,
  onDone,
}: {
  date: LocalDate | null;
  lines: readonly PlanLine[];
  onClose: () => void;
  onDone: (date: LocalDate) => void;
}) {
  const run = useCommand();
  const today = useToday();
  const toast = useToast();
  const [day, setDay] = useState<LocalDate | null>(date ?? today);
  const [slot, setSlot] = useState<PlanSlot | null>('lunch');
  const [recipeId, setRecipeId] = useState<Id | null>(null);
  const [recipeName, setRecipeName] = useState('');
  const [portions, setPortions] = useState(1);
  const [lineId, setLineId] = useState<Id | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Set at once, before the state shows the wait: a second tap in between plans nothing.
  const sending = useRef(false);

  async function add() {
    if (day === null || slot === null || recipeId === null) {
      setError(t.add.missing);
      return;
    }
    if (sending.current) {
      return;
    }
    sending.current = true;
    setBusy(true);
    setError(null);
    try {
      await run('plan.add', {
        date: day,
        slot,
        recipeId,
        portions,
        ...(lineId === null ? {} : { lineId }),
      });
      toast({ text: t.add.done(recipeName), tone: 'ok' });
      onDone(day);
      onClose();
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  return (
    <Sheet open={date !== null} onClose={onClose} title={t.add.title}>
      <div className="space-y-5">
        <RecipePicker
          label={t.add.recipe}
          kind="dish"
          value={recipeId}
          onChange={(id, recipe) => {
            setRecipeId(id);
            setRecipeName(recipe?.name ?? '');
            if (recipe !== null) {
              setPortions(recipe.portions);
            }
          }}
        />
        <DateField
          label={t.add.date}
          value={day}
          onChange={setDay}
          presets={[{ label: t.plan.today, days: 0 }]}
        />
        <SelectField
          label={t.add.slot}
          options={PLAN_SLOTS.map((value) => ({ value, label: planSlotLabel(value) }))}
          value={slot}
          onChange={setSlot}
        />
        <SelectField
          label={t.add.line}
          placeholder={t.entry.noLine}
          options={lineOptions(lines)}
          value={lineId}
          onChange={setLineId}
        />
        <div className="space-y-2">
          <p className="text-sm font-semibold text-ink-muted">{t.add.portions}</p>
          <Stepper label={t.add.portions} value={portions} onChange={setPortions} />
        </div>
        <FormActions
          placement="inline"
          primaryLabel={t.add.action}
          onPrimary={() => {
            void add();
          }}
          primaryBusy={busy}
          error={error}
        />
      </div>
    </Sheet>
  );
}

/** The result of the auto fill: what it planned, and why, entry by entry. */
export function FillResultSheet({
  open,
  planned,
  skipped,
  onClose,
}: {
  open: boolean;
  planned: readonly AutoFillEntry[];
  skipped: number;
  onClose: () => void;
}) {
  const money = useMoney();
  // The margin and the saving are evaluations: only under «Erweitert» (ADR-0015).
  const detailed = useDetailed();
  return (
    <Sheet open={open} onClose={onClose} title={t.fill.resultTitle}>
      <div className="space-y-4">
        <p className="font-semibold">{t.fill.resultCount(planned.length, skipped)}</p>
        {planned.length === 0 ? <p className="text-ink-muted">{t.fill.nothingLeft}</p> : null}
        <ul className="space-y-3">
          {planned.map((entry) => (
            <li key={entry.entryId} className="space-y-0.5">
              <p className="font-semibold">
                {formatSwissDate(entry.date)} · {planSlotLabel(entry.slot)} · {entry.recipeName}
              </p>
              <p className="text-[0.9375rem] text-ink-muted">
                {t.plan.entryMeta(entry.portions)} ·{' '}
                {entry.reason.kind === 'expiring' && entry.reason.expiresOn !== undefined
                  ? t.fill.reasonExpiring(
                      entry.reason.articleName ?? '',
                      formatQuantity(entry.reason.quantity ?? 0, entry.reason.unit ?? 'g'),
                      formatSwissDate(entry.reason.expiresOn),
                    )
                  : detailed
                    ? t.fill.reasonRanking(
                        entry.reason.soldLast28 ?? 0,
                        t.margin[entry.reason.marginStatus ?? 'unknown'],
                      )
                    : t.fill.reasonSales(entry.reason.soldLast28 ?? 0)}
                {!detailed || entry.reason.savedRappen === undefined
                  ? ''
                  : ` · ${money.format(entry.reason.savedRappen)}`}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </Sheet>
  );
}
