import { daysBetween, type LocalDate } from '@randen/core';
import { Download, Share } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryResult, useToday } from '../../app/hooks';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { Notice } from '../../ui/Notice';
import { Section } from '../../ui/Section';
import {
  downloadFile,
  fileHandedOver,
  isInstalledIos,
  shareOrDownload,
  type ShareOutcome,
} from '../../ui/share-file';
import { Switch } from '../../ui/Switch';
import { useToast } from '../../ui/Toast';
import { MIN_PASSWORD_LENGTH, encryptBackup } from './backup-crypto';
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
 *
 * The file is read and protected only on request: it holds the whole business with its photos.
 * In a browser one tap builds it and downloads it. In the app installed on an iPhone or iPad the
 * download misbehaves and the share sheet needs a tap of its own (ADR-0019): the first tap
 * builds the file, a second «Sicherung teilen» hands it to the share sheet.
 *
 * The day of the backup is remembered only once the file is kept (`fileHandedOver`): in the
 * installed iOS app a download opens just a preview, so there only a share counts. While the
 * file is built, the switch and the password are locked: the file carries the choice of the tap.
 */
export function BackupSection() {
  const today = useToday();
  const toast = useToast();
  const [installedIos] = useState(() => isInstalledIos());
  const [last, setLast] = useState<LocalDate | null>(() => readLastBackup());
  const [protect, setProtect] = useState(false);
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [running, setRunning] = useState<{ password: string | null } | null>(null);
  const [prepared, setPrepared] = useState<File | null>(null);
  const [sharing, setSharing] = useState(false);
  /** In the installed iOS app the file only opened as a preview: it is not saved yet. */
  const [previewOnly, setPreviewOnly] = useState(false);

  const locked = running !== null;
  const problem = protect ? passwordProblem(password, repeat) : null;
  const showProblem = password !== '' && password.length < MIN_PASSWORD_LENGTH;
  const reminder = last !== null && daysBetween(last, today) >= REMINDER_DAYS ? t.reminder : null;

  /** The file is kept: remember the day and forget the password. */
  const finish = useCallback(
    (text: string) => {
      writeLastBackup(today);
      setLast(readLastBackup());
      setPrepared(null);
      setPreviewOnly(false);
      setPassword('');
      setRepeat('');
      toast({ text });
    },
    [today, toast],
  );
  const failed = useCallback(() => {
    setRunning(null);
    setMessage(t.downloadFailed);
  }, []);
  const ready = useCallback(
    (file: File) => {
      setRunning(null);
      if (installedIos) {
        setPrepared(file);
        return;
      }
      if (downloadFile(file, file.name)) {
        finish(t.downloaded);
      } else {
        setMessage(t.downloadFailed);
      }
    },
    [installedIos, finish],
  );

  /** A changed choice makes a prepared file stale: it is built again with the next tap. */
  function forget() {
    setPrepared(null);
    setPreviewOnly(false);
    setMessage(null);
  }

  function share(file: File) {
    setSharing(true);
    setMessage(null);
    setPreviewOnly(false);
    // Called in the tap itself: the share sheet needs the tap (ADR-0019).
    void shareOrDownload(file).then((outcome: ShareOutcome) => {
      setSharing(false);
      if (fileHandedOver(outcome, installedIos)) {
        finish(outcome === 'shared' ? t.shared : t.downloaded);
      } else if (outcome === 'downloaded') {
        // Only a preview: the day is not remembered, and the file stays ready for a share.
        setPreviewOnly(true);
      } else if (outcome === 'failed') {
        setMessage(t.downloadFailed);
      }
      // `cancelled`: the sheet was closed; the file stays ready for another tap.
    });
  }

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
            disabled={locked}
            onChange={(checked) => {
              setProtect(checked);
              forget();
            }}
          />
          {protect ? (
            <div className="space-y-5">
              <PasswordField
                label={t.password}
                value={password}
                disabled={locked}
                onChange={(value) => {
                  setPassword(value);
                  forget();
                }}
                hint={t.passwordHint}
                error={showProblem ? t.passwordShort : null}
              />
              <PasswordField
                label={t.passwordRepeat}
                value={repeat}
                disabled={locked}
                onChange={(value) => {
                  setRepeat(value);
                  forget();
                }}
                error={repeat !== '' && repeat !== password ? t.passwordMismatch : null}
              />
            </div>
          ) : null}
          {message === null ? null : <Notice tone="danger">{message}</Notice>}
          {prepared === null ? null : previewOnly ? (
            <Notice
              tone="soon"
              action={
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    finish(t.markedSaved);
                  }}
                >
                  {t.markSaved}
                </Button>
              }
            >
              {t.previewOnly}
            </Notice>
          ) : (
            <Notice tone="ok">{t.prepared}</Notice>
          )}
          <div className="flex flex-wrap gap-2">
            {prepared === null ? (
              <Button
                icon={Download}
                busy={locked}
                disabled={protect && problem !== null}
                onClick={() => {
                  setMessage(null);
                  setRunning({ password: protect ? password : null });
                }}
              >
                {installedIos ? t.prepare : t.download}
              </Button>
            ) : (
              <Button
                icon={Share}
                busy={sharing}
                onClick={() => {
                  share(prepared);
                }}
              >
                {t.share}
              </Button>
            )}
          </div>
          {running === null ? null : (
            <p role="status" className="text-ink-muted">
              {installedIos ? t.preparing : t.downloading}
            </p>
          )}
        </div>
      </Card>
      {running === null ? null : (
        <BackupRun password={running.password} onReady={ready} onFail={failed} />
      )}
    </Section>
  );
}

/**
 * One backup file: reads the whole business once, protects it when asked, and hands the file
 * back. It mounts only while a backup is built, so the read happens at the tap and nowhere else.
 */
function BackupRun({
  password,
  onReady,
  onFail,
}: {
  password: string | null;
  onReady: (file: File) => void;
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
        onReady(new File([body], `randen-sicherung-${today}.json`, { type: 'application/json' }));
      } catch {
        onFail();
      }
    })();
  }, [result, password, today, onReady, onFail]);

  return null;
}
