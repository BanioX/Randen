import {
  areaKindLabel,
  areaRangeProposal,
  CommandError,
  type AreaKind,
  type Id,
  type Photo,
} from '@randen/core';
import { useRef, useState } from 'react';
import { errorText, useCommand } from '../../app/hooks';
import { FieldGroup } from '../../ui/Field';
import { FormActions } from '../../ui/FormActions';
import { PhotoField } from '../../ui/PhotoField';
import { SelectField } from '../../ui/SelectField';
import { Sheet } from '../../ui/Sheet';
import { TemperatureField } from '../../ui/TemperatureField';
import { TextField } from '../../ui/TextField';
import { useToast } from '../../ui/Toast';
import { areasMessages } from './messages';
import { KIND_ORDER, rangeText, useEnterKeyHint } from './shared';

const t = areasMessages.form;

/** What the form shows of an area that exists. */
export interface AreaDraft {
  id: Id;
  name: string;
  kind: AreaKind;
  minDeciC?: number | undefined;
  maxDeciC?: number | undefined;
  photo?: Photo | undefined;
}

interface AreaFormProps {
  /** The area to edit; without it the form creates one. */
  area?: AreaDraft | undefined;
  onClose: () => void;
  /** After a new area is saved: its id. */
  onCreated?: ((areaId: Id) => void) | undefined;
}

const KIND_OPTIONS = KIND_ORDER.map((kind) => ({ value: kind, label: areaKindLabel(kind) }));

const orNull = (value: number | undefined) => value ?? null;

/**
 * «Bereich erfassen» and «Bereich bearbeiten» in a sheet: name, kind, the temperature range and
 * a photo. A new area starts as a cold room with the guideline range of 0 to 5 °C; choosing
 * another kind brings its guideline along as long as the range was not changed by hand.
 */
export function AreaFormSheet({ open, ...props }: AreaFormProps & { open: boolean }) {
  return (
    <Sheet
      open={open}
      onClose={props.onClose}
      title={props.area === undefined ? t.titleCreate : t.titleEdit}
    >
      <AreaForm {...props} />
    </Sheet>
  );
}

function AreaForm({ area, onClose, onCreated }: AreaFormProps) {
  const run = useCommand();
  const toast = useToast();
  const form = useRef<HTMLFormElement>(null);
  useEnterKeyHint(form, 'done');
  const start = area ?? { kind: 'cold' as const, ...areaRangeProposal('cold') };
  const [name, setName] = useState(area?.name ?? '');
  const [kind, setKind] = useState<AreaKind>(start.kind);
  const [min, setMin] = useState<number | null>(orNull(start.minDeciC));
  const [max, setMax] = useState<number | null>(orNull(start.maxDeciC));
  const [photo, setPhoto] = useState<Photo | null>(area?.photo ?? null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const proposal = areaRangeProposal(kind);
  const proposalText = rangeText(proposal);
  const upsideDown = min !== null && max !== null && min > max;

  function changeKind(next: AreaKind | null) {
    if (next === null) {
      return;
    }
    // A range that still is the guideline of the old kind follows the new kind.
    const untouched = orNull(proposal.minDeciC) === min && orNull(proposal.maxDeciC) === max;
    setKind(next);
    if (untouched) {
      const guideline = areaRangeProposal(next);
      setMin(orNull(guideline.minDeciC));
      setMax(orNull(guideline.maxDeciC));
    }
  }

  async function submit() {
    if (upsideDown) {
      return;
    }
    setBusy(true);
    setError(null);
    setNameError(null);
    try {
      if (area === undefined) {
        const { areaId } = await run('areas.create', {
          name: name.trim(),
          kind,
          minDeciC: min,
          maxDeciC: max,
          ...(photo === null ? {} : { photo }),
        });
        toast({ text: t.created(name.trim()) });
        onClose();
        onCreated?.(areaId);
      } else {
        await run('areas.update', {
          areaId: area.id,
          name: name.trim(),
          kind,
          minDeciC: min,
          maxDeciC: max,
          photo,
        });
        toast({ text: t.saved });
        onClose();
      }
    } catch (failure) {
      setBusy(false);
      if (failure instanceof CommandError && failure.code === 'duplicate_name') {
        setNameError(t.duplicate);
      } else {
        setError(errorText(failure));
      }
    }
  }

  return (
    <form
      ref={form}
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      className="space-y-5"
    >
      <TextField
        label={t.name}
        value={name}
        onChange={(value) => {
          setName(value);
          setNameError(null);
        }}
        placeholder={t.namePlaceholder}
        maxLength={60}
        required
        error={nameError}
      />
      <SelectField
        label={t.kind}
        options={KIND_OPTIONS}
        value={kind}
        onChange={changeKind}
        required
      />
      <FieldGroup
        legend={t.range}
        hint={
          proposalText === undefined
            ? t.noProposalHint
            : t.proposalHint(areaKindLabel(kind), proposalText)
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <TemperatureField label={t.min} value={min} onChange={setMin} optional />
          <TemperatureField
            label={t.max}
            value={max}
            onChange={setMax}
            optional
            error={upsideDown ? t.upsideDown : null}
          />
        </div>
      </FieldGroup>
      <PhotoField label={t.photo} hint={t.photoHint} value={photo} onChange={setPhoto} />
      <FormActions
        placement="inline"
        primaryLabel={t.save}
        primaryBusy={busy}
        secondaryLabel={t.cancel}
        onSecondary={onClose}
        error={error}
      />
    </form>
  );
}
