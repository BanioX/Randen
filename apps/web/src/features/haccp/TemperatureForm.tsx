import type { Id, TemperatureKind } from '@randen/core';
import { useRef, useState } from 'react';
import { errorText, useCommand } from '../../app/hooks';
import { FormActions } from '../../ui/FormActions';
import { ChoiceChips } from '../../ui/ChoiceChips';
import { TemperatureField } from '../../ui/TemperatureField';
import { TextArea, TextField } from '../../ui/TextField';
import { AreaPicker } from '../../ui/pickers';
import { useToast } from '../../ui/Toast';
import { useEnterKeyHint } from './hooks';
import { haccpMessages as t } from './messages';
import { degrees, inRange, kindText, rangeText, resultText } from './shared';
import type { AreaOption, ProposalRow } from './types';

/** The kinds a person measures by hand; goods at the door are checked by the stock module. */
const KINDS: readonly TemperatureKind[] = ['storage', 'cooking', 'hot_holding', 'cooling'];

interface TemperatureFormProps {
  areas: readonly AreaOption[];
  proposals: readonly ProposalRow[];
  /** The kind the page opened with, from its address (`?kind=cooking`). */
  initialKind: TemperatureKind;
}

/**
 * «Messen» (H4): any kind of reading. A storage reading names its area, a food reading names what
 * was measured. The proposal limit of a food shows as «Richtwert»; out of range, the action field
 * opens and is required. After saving, the page is ready for the next reading.
 */
export function TemperatureForm({ areas, proposals, initialKind }: TemperatureFormProps) {
  const run = useCommand();
  const toast = useToast();
  const form = useRef<HTMLFormElement>(null);
  const [kind, setKind] = useState<TemperatureKind>(initialKind);
  const [areaId, setAreaId] = useState<Id | null>(null);
  const [label, setLabel] = useState('');
  const [value, setValue] = useState<number | null>(null);
  const [action, setAction] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEnterKeyHint(form, 'done');

  const area = areas.find((row) => row.areaId === areaId);
  const proposal = proposals.find((row) => row.kind === kind);
  const limits =
    kind === 'storage'
      ? { minDeciC: area?.minDeciC, maxDeciC: area?.maxDeciC }
      : { minDeciC: proposal?.minDeciC, maxDeciC: proposal?.maxDeciC };
  const range = rangeText(limits.minDeciC, limits.maxDeciC);
  const needsAction = value !== null && !inRange(value, limits);

  async function save() {
    if (value === null || busy) {
      return;
    }
    if (kind === 'storage' && areaId === null) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await run('temperatures.record', {
        kind,
        deciC: value,
        ...(kind === 'storage' && areaId !== null ? { areaId } : { label: label.trim() }),
        ...(needsAction ? { action: action.trim() } : {}),
      });
      toast({
        text: t.temperatures.recordDone(degrees(value), resultText(result.ok)),
        tone: result.ok ? 'ok' : 'danger',
      });
      setValue(null);
      setAction('');
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setBusy(false);
    }
  }

  const hint =
    range === undefined
      ? undefined
      : kind === 'storage'
        ? t.today.fieldHint(range)
        : t.temperatures.proposal(range);

  return (
    <form
      ref={form}
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <ChoiceChips<TemperatureKind>
        legend={t.temperatures.kind}
        options={KINDS.map((option) => ({ value: option, label: kindText(option) }))}
        value={kind}
        onChange={(next) => {
          setKind(next);
          setValue(null);
          setAction('');
          setError(null);
        }}
      />
      {kind === 'storage' ? (
        <AreaPicker label={t.temperatures.area} value={areaId} onChange={setAreaId} required />
      ) : (
        <TextField
          label={t.temperatures.label}
          hint={t.temperatures.labelHint}
          value={label}
          onChange={setLabel}
          maxLength={80}
          required
        />
      )}
      <TemperatureField
        label={t.temperatures.temperature}
        hint={hint}
        value={value}
        onChange={setValue}
        required
      />
      {kind === 'storage' || proposal === undefined ? null : (
        <p className="text-sm text-ink-muted">{t.temperatures.proposalSource(proposal.source)}</p>
      )}
      {needsAction ? (
        <TextArea
          label={t.action.label}
          hint={t.action.hint}
          value={action}
          onChange={setAction}
          maxLength={300}
          required
        />
      ) : null}
      <FormActions
        primaryLabel={t.temperatures.recordSave}
        primaryBusy={busy}
        primaryDisabled={value === null}
        error={error}
        placement="inline"
      />
    </form>
  );
}
