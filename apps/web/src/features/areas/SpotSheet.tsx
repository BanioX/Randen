import { CommandError, type Id, type Photo, type SpotView } from '@randen/core';
import { Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { errorText, useCommand } from '../../app/hooks';
import { Button } from '../../ui/Button';
import { FormActions } from '../../ui/FormActions';
import { PhotoField } from '../../ui/PhotoField';
import { SelectField } from '../../ui/SelectField';
import { Sheet } from '../../ui/Sheet';
import { TextArea, TextField } from '../../ui/TextField';
import { useToast } from '../../ui/Toast';
import { areasMessages } from './messages';
import { useEnterKeyHint } from './shared';

const t = areasMessages.spot;

interface SpotFormProps {
  areaId: Id;
  /** The spot to edit; without it the form creates one. */
  spot?: SpotView | undefined;
  /** How many spots the area has: the choices for «Stelle im Rundgang». */
  total: number;
  onClose: () => void;
  /** «Platz löschen»: the page asks first. */
  onRemove: (spot: SpotView) => void;
}

/**
 * «Platz erfassen» and «Platz bearbeiten» in a sheet: name, a note and the photo that shows a
 * new person where it is. The camera opens only on a tap, «Aus Dateien wählen» is the second
 * way, and the photo is made small on the device (`PhotoField`).
 */
export function SpotSheet({ open, ...props }: SpotFormProps & { open: boolean }) {
  return (
    <Sheet
      open={open}
      onClose={props.onClose}
      title={props.spot === undefined ? t.titleCreate : t.titleEdit}
    >
      <SpotForm {...props} />
    </Sheet>
  );
}

function SpotForm({ areaId, spot, total, onClose, onRemove }: SpotFormProps) {
  const run = useCommand();
  const toast = useToast();
  const form = useRef<HTMLFormElement>(null);
  useEnterKeyHint(form, 'done');
  const [name, setName] = useState(spot?.name ?? '');
  const [note, setNote] = useState(spot?.note ?? '');
  const [photo, setPhoto] = useState<Photo | null>(spot?.photo ?? null);
  const [position, setPosition] = useState(String(spot?.sortOrder ?? total));
  const [nameError, setNameError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const positions = Array.from({ length: total }, (_, index) => ({
    value: String(index),
    label: t.positionOption(index + 1, total),
  }));

  async function submit() {
    setBusy(true);
    setError(null);
    setNameError(null);
    const typedNote = note.trim();
    try {
      if (spot === undefined) {
        await run('spots.create', {
          areaId,
          name: name.trim(),
          ...(typedNote === '' ? {} : { note: typedNote }),
          ...(photo === null ? {} : { photo }),
        });
        toast({ text: t.created(name.trim()) });
      } else {
        await run('spots.update', {
          spotId: spot.id,
          name: name.trim(),
          note: typedNote === '' ? null : typedNote,
          photo,
          sortOrder: Number(position),
        });
        toast({ text: t.saved });
      }
      onClose();
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
      <TextArea
        label={t.note}
        value={note}
        onChange={setNote}
        placeholder={t.notePlaceholder}
        maxLength={300}
        rows={2}
        optional
      />
      <PhotoField label={t.photo} hint={t.photoHint} value={photo} onChange={setPhoto} />
      {spot === undefined || total < 2 ? null : (
        <SelectField
          label={t.position}
          options={positions}
          value={position}
          onChange={(value) => {
            setPosition(value ?? position);
          }}
          required
        />
      )}
      <FormActions
        placement="inline"
        primaryLabel={t.save}
        primaryBusy={busy}
        secondaryLabel={t.cancel}
        onSecondary={onClose}
        error={error}
      />
      {spot === undefined ? null : (
        <div className="border-t border-line pt-4">
          <Button
            variant="ghost"
            size="sm"
            icon={Trash2}
            onClick={() => {
              onRemove(spot);
            }}
          >
            {t.remove}
          </Button>
        </div>
      )}
    </form>
  );
}
