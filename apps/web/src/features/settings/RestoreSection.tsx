import { formatSwissDate, toLocalDate, type BackupPreview, type BackupProblem } from '@randen/core';
import { FileUp, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { useBusiness, useCommand, useQuery } from '../../app/hooks';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { ConfirmDialog } from '../../ui/Sheet';
import { Field, controlClass } from '../../ui/Field';
import { Notice } from '../../ui/Notice';
import { Section } from '../../ui/Section';
import {
  decryptBackup,
  readEnvelope,
  WrongPasswordError,
  type EncryptedBackup,
} from './backup-crypto';
import { readTextFile } from './files';
import { PasswordField } from './PasswordField';
import { reloadApp } from './reload';
import { settingsMessages } from './messages';

const t = settingsMessages.data;

/** What the preview shows of the rows, the ones people look for first. */
const SHOWN = [
  'articles',
  'lots',
  'movements',
  'recipes',
  'productions',
  'sales',
  'staff',
] as const;

/** A problem of the file as a sentence for the person. */
function problemText(problem: BackupProblem): string {
  switch (problem.kind) {
    case 'format':
      return t.problem.format;
    case 'version':
      return t.problem.version(problem.version);
    case 'business':
      return t.problem.business;
    case 'table':
      return t.problem.table(problem.table);
    case 'row':
      return t.problem.row(problem.table ?? '', problem.id);
    case 'staff':
      return t.problem.staff;
  }
}

/** Counts of the tables, as the about page names them. */
const TABLE_LABELS: Record<(typeof SHOWN)[number], string> = {
  articles: settingsMessages.about.articles,
  lots: settingsMessages.about.lots,
  movements: settingsMessages.about.movements,
  recipes: settingsMessages.about.recipes,
  productions: settingsMessages.about.productions,
  sales: settingsMessages.about.sales,
  staff: settingsMessages.about.staff,
};

/**
 * «Sicherung zurückholen»: choose a file, open it with its password when it is protected, see
 * what is in it, then confirm. A problem in the file refuses it as a whole (ADR-0006).
 */
export function RestoreSection() {
  const [sealed, setSealed] = useState<EncryptedBackup | null>(null);
  const [loaded, setLoaded] = useState<{ data: unknown } | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function pick(file: File) {
    setError(null);
    setSealed(null);
    setLoaded(null);
    setPassword('');
    let text: string;
    try {
      text = await readTextFile(file);
    } catch {
      setError(t.readFailed);
      return;
    }
    let json: unknown;
    try {
      json = JSON.parse(text) as unknown;
    } catch {
      setError(t.notRandenFile);
      return;
    }
    const envelope = readEnvelope(json);
    if (envelope === 'invalid') {
      setError(t.damaged);
    } else if (envelope === 'plain') {
      setLoaded({ data: json });
    } else {
      setSealed(envelope);
    }
  }

  async function open() {
    if (sealed === null) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const text = await decryptBackup(sealed, password);
      setLoaded({ data: JSON.parse(text) as unknown });
      setSealed(null);
      setPassword('');
    } catch (failure) {
      setError(failure instanceof WrongPasswordError ? t.wrongPassword : t.damaged);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title={t.restoreTitle} titleStyle="group">
      <Card>
        <div className="space-y-5">
          <p className="text-ink-muted">{t.restoreIntro}</p>
          <Field label={t.chooseFile} hint={t.chooseFileHint}>
            {(control) => (
              <input
                {...control}
                type="file"
                accept=".json,application/json"
                className={`${controlClass(false)} file:mr-3 file:rounded-lg file:border-0 file:bg-surface-muted file:px-3 file:py-2`}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file !== undefined) {
                    void pick(file);
                  }
                  event.target.value = '';
                }}
              />
            )}
          </Field>

          {sealed === null ? null : (
            <div className="space-y-5">
              <Notice tone="info">{t.encrypted}</Notice>
              <PasswordField
                label={t.password}
                value={password}
                onChange={setPassword}
                autoComplete="current-password"
                error={error}
              />
              <div>
                <Button
                  variant="secondary"
                  busy={busy}
                  disabled={password === ''}
                  onClick={() => {
                    void open();
                  }}
                >
                  {t.decrypt}
                </Button>
              </div>
            </div>
          )}

          {error === null || sealed !== null ? null : <Notice tone="danger">{error}</Notice>}
          {loaded === null ? null : <RestorePreview data={loaded.data} />}
        </div>
      </Card>
    </Section>
  );
}

/** The file read and checked: what is in it, what stops it, and the one button that replaces. */
function RestorePreview({ data }: { data: unknown }) {
  const business = useBusiness();
  const preview = useQuery('settings.importPreview', { data });
  const run = useCommand();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (preview === undefined) {
    return <p className="text-ink-muted">{t.readFailed}</p>;
  }

  async function restore() {
    setBusy(true);
    setError(null);
    try {
      await run('settings.import', { data, confirm: true });
      reloadApp();
    } catch {
      // Refused as a whole: the import changes nothing unless every row fits.
      setAsking(false);
      setBusy(false);
      setError(t.restoreFailed);
    }
  }

  return (
    <div className="space-y-5">
      <PreviewLines preview={preview} />
      {preview.importable ? (
        <>
          <Notice tone="ok">{t.previewOk}</Notice>
          <div>
            <Button
              variant="secondary"
              icon={RotateCcw}
              busy={busy}
              onClick={() => {
                setAsking(true);
              }}
            >
              {t.restoreAction}
            </Button>
          </div>
          <ConfirmDialog
            open={asking}
            title={t.restoreConfirmTitle}
            text={t.restoreConfirmText(
              preview.businessName ?? business.name,
              preview.exportedAt === undefined
                ? ''
                : formatSwissDate(toLocalDate(preview.exportedAt)),
              preview.rows,
            )}
            confirmLabel={t.restoreConfirm}
            tone="danger"
            onConfirm={() => {
              void restore();
            }}
            onCancel={() => {
              setAsking(false);
            }}
          />
        </>
      ) : (
        <Notice tone="danger" icon={FileUp} title={t.previewProblems}>
          <ul className="list-disc space-y-1 pl-5">
            {preview.problems.map((problem, index) => (
              <li key={`${problem.kind}-${String(index)}`}>{problemText(problem)}</li>
            ))}
          </ul>
        </Notice>
      )}
      {error === null ? null : <Notice tone="danger">{error}</Notice>}
      {busy ? (
        <p role="status" className="text-ink-muted">
          {t.restoring}
        </p>
      ) : null}
    </div>
  );
}

/** Business, date, rows and the main counts of a file. */
function PreviewLines({ preview }: { preview: BackupPreview }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
      <dt className="text-ink-muted">{t.previewBusiness}</dt>
      <dd className="font-medium">{preview.businessName ?? '–'}</dd>
      {preview.exportedAt === undefined ? null : (
        <>
          <dt className="text-ink-muted">{t.previewSaved}</dt>
          <dd>{formatSwissDate(toLocalDate(preview.exportedAt))}</dd>
        </>
      )}
      <dt className="text-ink-muted">{t.previewRows}</dt>
      <dd>{String(preview.rows)}</dd>
      {SHOWN.map((name) => (
        <div key={name} className="contents">
          <dt className="text-ink-muted">{TABLE_LABELS[name]}</dt>
          <dd>{String(preview.counts[name])}</dd>
        </div>
      ))}
    </dl>
  );
}
