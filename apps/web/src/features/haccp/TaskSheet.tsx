import { useState } from 'react';
import type { Weekday } from '@randen/core';
import { errorText, useCommand } from '../../app/hooks';
import { Button } from '../../ui/Button';
import { ChoiceChips } from '../../ui/ChoiceChips';
import { FormActions } from '../../ui/FormActions';
import { Switch } from '../../ui/Switch';
import { ConfirmDialog, Sheet } from '../../ui/Sheet';
import { TextArea, TextField } from '../../ui/TextField';
import { AreaPicker } from '../../ui/pickers';
import { useToast } from '../../ui/Toast';
import { haccpMessages as t } from './messages';
import type { HygieneTaskRow } from './types';

type FrequencyKey = 'daily' | 'weekly' | 'monthly';
const FREQUENCIES: readonly FrequencyKey[] = ['daily', 'weekly', 'monthly'];
const WEEKDAYS: readonly Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

interface TaskSheetProps {
  /** The task to change; none for a new one. */
  task: HygieneTaskRow | undefined;
  onClose: () => void;
}

/**
 * Adds or changes one task of the cleaning plan (H3 in a sheet): name, area, rhythm, weekday for
 * a weekly task, instructions, and whether it is active. Removing asks first.
 */
export function TaskSheet({ task, onClose }: TaskSheetProps) {
  const run = useCommand();
  const toast = useToast();
  const [name, setName] = useState(task?.name ?? '');
  const [areaId, setAreaId] = useState(task?.areaId ?? null);
  const [frequency, setFrequency] = useState<FrequencyKey>(task?.frequency ?? 'daily');
  const [weekday, setWeekday] = useState<Weekday | null>(task?.weekday ?? null);
  const [instructions, setInstructions] = useState(task?.instructions ?? '');
  const [active, setActive] = useState(task?.active ?? true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);

  async function save() {
    if (frequency === 'weekly' && weekday === null) {
      setError(t.plan.sheet.weekdayMissing);
      return;
    }
    setBusy(true);
    setError(null);
    const text = instructions.trim();
    try {
      await run('hygiene.saveTask', {
        ...(task === undefined ? {} : { taskId: task.id }),
        name: name.trim(),
        areaId,
        frequency,
        weekday: frequency === 'weekly' ? weekday : null,
        instructions: text === '' ? null : text,
        active,
      });
      toast({ text: t.plan.sheet.saved(name.trim()), tone: 'ok' });
      onClose();
    } catch (failure) {
      setError(errorText(failure));
      setBusy(false);
    }
  }

  async function remove() {
    if (task === undefined) {
      return;
    }
    try {
      await run('hygiene.removeTask', { taskId: task.id });
      toast({ text: t.plan.sheet.removed(task.name) });
      onClose();
    } catch (failure) {
      setError(errorText(failure));
      setAsking(false);
    }
  }

  return (
    <>
      <Sheet
        open
        onClose={onClose}
        title={task === undefined ? t.plan.sheet.createTitle : t.plan.sheet.editTitle}
      >
        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            if (!busy) {
              void save();
            }
          }}
        >
          <TextField
            label={t.plan.sheet.name}
            value={name}
            onChange={setName}
            maxLength={100}
            required
          />
          <AreaPicker
            label={t.plan.sheet.area}
            value={areaId}
            onChange={setAreaId}
            placeholder={t.plan.sheet.noArea}
          />
          <ChoiceChips<FrequencyKey>
            legend={t.plan.sheet.frequency}
            options={FREQUENCIES.map((value) => ({ value, label: t.frequencies[value] }))}
            value={frequency}
            onChange={setFrequency}
            segmented
          />
          {frequency === 'weekly' ? (
            <ChoiceChips<Weekday>
              legend={t.plan.sheet.weekday}
              options={WEEKDAYS.map((value) => ({ value, label: t.weekdays[value] }))}
              value={weekday}
              onChange={setWeekday}
            />
          ) : null}
          <TextArea
            label={t.plan.sheet.instructions}
            hint={t.plan.sheet.instructionsHint}
            value={instructions}
            onChange={setInstructions}
            maxLength={500}
          />
          <Switch
            label={t.plan.sheet.active}
            description={t.plan.sheet.activeHint}
            checked={active}
            onChange={setActive}
          />
          <FormActions
            primaryLabel={t.plan.sheet.save}
            primaryBusy={busy}
            secondaryLabel={t.plan.sheet.cancel}
            onSecondary={onClose}
            error={error}
            placement="inline"
          />
        </form>
        {task === undefined ? null : (
          <div className="mt-6 border-t border-line pt-5">
            <Button
              variant="danger"
              fullWidth
              onClick={() => {
                setAsking(true);
              }}
            >
              {t.plan.sheet.remove}
            </Button>
          </div>
        )}
      </Sheet>
      <ConfirmDialog
        open={asking}
        tone="danger"
        title={t.plan.sheet.removeTitle}
        text={t.plan.sheet.removeText(task?.name ?? '')}
        confirmLabel={t.plan.sheet.remove}
        cancelLabel={t.plan.sheet.keep}
        onConfirm={() => void remove()}
        onCancel={() => {
          setAsking(false);
        }}
      />
    </>
  );
}
