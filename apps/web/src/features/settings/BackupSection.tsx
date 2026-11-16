import { daysBetween, type LocalDate } from '@randen/core';
import { Download } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryResult, useToday } from '../../app/hooks';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { Notice } from '../../ui/Notice';
import { Section } from '../../ui/Section';
import { Switch } from '../../ui/Switch';
import { useToast } from '../../ui/Toast';
import { MIN_PASSWORD_LENGTH, encryptBackup } from './backup-crypto';
import { saveTextFile } from './files';
import { readLastBackup, writeLastBackup } from './last-backup';
import { PasswordField } from './PasswordField';
import { settingsMessages } from './messages';

const t = settingsMessages.data;

/** After this many days without a backup the app reminds, calmly (SE-12). */
const REMINDER_DAYS = 14;

/** What a new backup is protected with, or why it is not yet (empty means: no protection). */
function passwordProblem(password: string, repeat: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return t.passwordShort;
  }
  return repeat === password ? null : t.passwordMismatch;
}

/** «Letzte Sicherung vor 12 Tagen»: the day of the last backup as a sentence. */
function lastBackupText(last: LocalDate | null, today: LocalDate): string {
  if (last === null) {
    return t.lastNever;
  }
  const days = daysBetween(last, today);
  if (days <= 0) {
    return t.lastToday;
  }
  return days === 1 ? t.lastYesterday : t.lastDays(days);
}

/**
 * «Sicherung» (H4-like): the whole business to one file, optionally protected with a password
 * (AES-GCM, see `backup-crypto.ts`). The file is saved where the person chooses (SE-10).
 */
export function BackupSection() {
  const today = useToday();
  const toast = useToast();
  const [last, setLast] = useState<LocalDate | null>(() => readLastBackup());
  const [protect, setProtect] = useState(false);
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [running, setRunning] = useState<{ password: string | null } | null>(null);

  const problem = protect ? passwordProblem(password, repeat) : null;
  const showProblem = password !== '' && password.length < MIN_PASSWORD_LENGTH;
  const reminder = last !== null && daysBetween(last, today) >= REMINDER_DAYS ? t.reminder : null;

  const done = useCallback(() => {
    setRunning(null);
    setLast(readLastBackup());
    setPassword('');
    setRepeat('');
    toast({ text: t.downloaded });
  }, [toast]);
  const failed = useCallback(() => {
    setRunning(null);
    setMessage(t.downloadFailed);
  }, []);

  return (
    <Section title={t.backupTitle} titleStyle="group">
      <Card>
        <div className="space-y-5">
          <p className="text-ink">{lastBackupText(last, today)}</p>
          {reminder === null ? null : <Notice tone="soon">{reminder}</Notice>}
          <Switch
            label={t.protect}
            description={t.protectHint}
            checked={protect}
            onChange={(checked) => {
              setProtect(checked);
              setMessage(null);
            }}
          />
          {protect ? (
            <div className="space-y-5">
              <PasswordField
                label={t.password}
                value={password}
                onChange={setPassword}
                hint={t.passwordHint}
                error={showProblem ? t.passwordShort : null}
              />
              <PasswordField
                label={t.passwordRepeat}
                value={repeat}
                onChange={setRepeat}
                error={repeat !== '' && repeat !== password ? t.passwordMismatch : null}
              />
            </div>
          ) : null}
          {message === null ? null : <Notice tone="danger">{message}</Notice>}
          <div>
            <Button
              icon={Download}
              busy={running !== null}
              disabled={protect && problem !== null}
              onClick={() => {
                setMessage(null);
                setRunning({ password: protect ? password : null });
              }}
            >
              {t.download}
            </Button>
          </div>
          {running === null ? null : (
            <p role="status" className="text-ink-muted">
              {t.downloading}
            </p>
          )}
        </div>
      </Card>
      {running === null ? null : (
        <BackupRun password={running.password} onDone={done} onFail={failed} />
      )}
    </Section>
  );
}

/**
 * One download: reads the whole business once, protects it when asked, and offers the file. It
 * mounts only while a download runs, so the read happens at the tap and nowhere else.
 */
function BackupRun({
  password,
  onDone,
  onFail,
}: {
  password: string | null;
  onDone: () => void;
  onFail: () => void;
}) {
  const today = useToday();
  const result = useQueryResult('settings.export', {});
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) {
      return;
    }
    if (result.status === 'error') {
      handled.current = true;
      onFail();
      return;
    }
    if (result.status !== 'ready') {
      return;
    }
    handled.current = true;
    void (async () => {
      try {
        const text = JSON.stringify(result.data, null, 2);
        const body = password === null ? text : await encryptBackup(text, password);
        saveTextFile(`randen-sicherung-${today}.json`, body);
        writeLastBackup(today);
        onDone();
      } catch {
        onFail();
      }
    })();
  }, [result, password, today, onDone, onFail]);

  return null;
}
