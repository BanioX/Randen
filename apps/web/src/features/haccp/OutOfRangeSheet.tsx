import { useState } from 'react';
import { FormActions } from '../../ui/FormActions';
import { Sheet } from '../../ui/Sheet';
import { TextArea } from '../../ui/TextField';
import { haccpMessages as t } from './messages';
import { degrees } from './shared';

interface OutOfRangeSheetProps {
  /** The reading in tenths, out of its range. */
  deciC: number;
  /** The range in words («0 bis 5 °C»), if the area or food has one. */
  range: string | undefined;
  busy: boolean;
  error: string | null;
  onSave: (action: string) => void;
  onClose: () => void;
}

/**
 * Asked before an out-of-range reading is saved: what was done about it. The reading is kept
 * either way, with its action (the self-control needs both). Mounted only while it is open, so
 * every opening starts empty.
 */
export function OutOfRangeSheet({
  deciC,
  range,
  busy,
  error,
  onSave,
  onClose,
}: OutOfRangeSheetProps) {
  const [action, setAction] = useState('');
  const text = action.trim();
  return (
    <Sheet open onClose={onClose} title={t.action.title} role="alertdialog">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (text !== '' && !busy) {
            onSave(text);
          }
        }}
        className="space-y-4"
      >
        <p>{t.action.text(degrees(deciC), range ?? t.results.noLimit)}</p>
        <TextArea
          label={t.action.label}
          hint={t.action.hint}
          value={action}
          onChange={setAction}
          required
          maxLength={300}
        />
        <FormActions
          primaryLabel={t.action.save}
          primaryBusy={busy}
          primaryDisabled={text === ''}
          secondaryLabel={t.action.cancel}
          onSecondary={onClose}
          error={error}
          placement="inline"
        />
      </form>
    </Sheet>
  );
}
