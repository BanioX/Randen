import { useState } from 'react';
import { errorText, useBusiness, useCommand } from '../../app/hooks';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { Notice } from '../../ui/Notice';
import { Section } from '../../ui/Section';
import { Sheet } from '../../ui/Sheet';
import { TextField } from '../../ui/TextField';
import { reloadApp } from './reload';
import { settingsMessages } from './messages';

const t = settingsMessages.data;

/**
 * «Alles löschen», the danger zone at the end of the page. The sheet asks for the name of the
 * business before the delete button wakes up; the red button lives only in there.
 */
export function DeleteSection() {
  const business = useBusiness();
  const run = useCommand();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirmed = typed.trim() === business.name;

  function close() {
    setOpen(false);
    setTyped('');
    setError(null);
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await run('settings.deleteAll', { confirm: true });
      reloadApp();
    } catch (failure) {
      setBusy(false);
      setError(errorText(failure));
    }
  }

  return (
    <Section title={t.deleteTitle} titleStyle="group">
      <Card>
        <div className="space-y-5">
          <p className="text-ink-muted">{t.deleteIntro}</p>
          <div>
            <Button
              variant="secondary"
              onClick={() => {
                setOpen(true);
              }}
            >
              {t.deleteAction}
            </Button>
          </div>
        </div>
      </Card>
      <Sheet open={open} onClose={close} title={t.deleteDialogTitle} role="alertdialog">
        <div className="space-y-5">
          <p>{t.deleteDialogText}</p>
          <TextField
            label={t.deleteField}
            hint={t.deleteHint(business.name)}
            value={typed}
            onChange={setTyped}
            autoComplete="off"
          />
          {error === null ? null : <Notice tone="danger">{error}</Notice>}
          <div className="flex flex-col-reverse gap-2 md:flex-row md:justify-end">
            <Button variant="secondary" onClick={close}>
              {t.deleteCancel}
            </Button>
            <Button variant="danger" disabled={!confirmed || busy} onClick={() => void remove()}>
              {busy ? t.deleting : t.deleteConfirm}
            </Button>
          </div>
        </div>
      </Sheet>
    </Section>
  );
}
