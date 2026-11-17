import { IdSchema, type Id } from '@randen/core';
import {
  ClipboardList,
  Copy,
  Eye,
  FileDown,
  Printer,
  Share,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { errorText, isNotFound, useCommand, useQueryResult } from '../../app/hooks';
import { NotFoundPage } from '../../app/NotFoundPage';
import { paths } from '../../app/paths';
import { Button, ButtonLink } from '../../ui/Button';
import { Notice } from '../../ui/Notice';
import { PageHeader } from '../../ui/PageHeader';
import { ConfirmDialog } from '../../ui/Sheet';
import { downloadFile, fileHandedOver, isInstalledIos, shareOrDownload } from '../../ui/share-file';
import { useToast } from '../../ui/Toast';
import { CardSettings } from './CardSettings';
import { menuMessages } from './messages';
import { SectionsEditor } from './SectionsEditor';

const t = menuMessages;
const NO_CARD = IdSchema.parse('00000000-0000-7000-8000-000000000000');

/** The export of the card as one HTML file (ADR-0018), as a `File` the device can hand out. */
function exportFile(exported: { fileName: string; html: string }): File {
  return new File([exported.html], exported.fileName, { type: 'text/html;charset=utf-8' });
}

/**
 * Reads the card as a file once, hands it back, and steps aside. It mounts only while a file is
 * prepared: the HTML with its photos is built at the tap, not after every edit. An error is
 * reported, so the button never turns for good.
 */
function FileExport({
  cardId,
  onReady,
  onFail,
}: {
  cardId: Id;
  onReady: (file: File) => void;
  onFail: () => void;
}) {
  const result = useQueryResult('menu.export', { cardId });
  const handled = useRef(false);
  useEffect(() => {
    if (handled.current || result.status === 'loading') {
      return;
    }
    handled.current = true;
    if (result.status === 'error') {
      onFail();
    } else {
      onReady(exportFile(result.data));
    }
  }, [result, onReady, onFail]);
  return null;
}

/** What the page says about the file: ready to share, only a preview, or what went wrong. */
type FileNote = 'exportFailed' | 'failed' | 'previewOnly';

interface FileAction {
  installedIos: boolean;
  /** The card is being read as a file. */
  exporting: boolean;
  /** In the installed iOS app: the file, ready for «Datei teilen». */
  prepared: File | null;
  sharing: boolean;
  note: FileNote | null;
  /** Reads the card as a file (again). */
  start: () => void;
  /** Hands the prepared file to the share sheet; call it in the tap itself. */
  share: (file: File) => void;
  ready: (file: File) => void;
  failed: () => void;
  /** The card changed: a prepared file shows the old card and is dropped. */
  discard: () => void;
}

/**
 * «Als Datei sichern» (ADR-0018, ADR-0019). In a browser one tap reads the card and downloads
 * it. In the app installed on an iPhone or iPad the share sheet needs a tap of its own, as for
 * the backup: the first tap «Datei vorbereiten» reads the card, a second «Datei teilen» hands
 * the file out. There a download only opens a preview, so only a share counts as saved.
 */
function useFileAction(): FileAction {
  const [installedIos] = useState(() => isInstalledIos());
  const [exporting, setExporting] = useState(false);
  const [prepared, setPrepared] = useState<File | null>(null);
  const [sharing, setSharing] = useState(false);
  const [note, setNote] = useState<FileNote | null>(null);
  const toast = useToast();

  const start = useCallback(() => {
    setNote(null);
    setPrepared(null);
    setExporting(true);
  }, []);
  const ready = useCallback(
    (file: File) => {
      setExporting(false);
      if (installedIos) {
        setPrepared(file);
      } else if (downloadFile(file, file.name)) {
        toast({ text: t.actions.fileSaved, tone: 'ok' });
      } else {
        setNote('failed');
      }
    },
    [installedIos, toast],
  );
  const failed = useCallback(() => {
    setExporting(false);
    setNote('exportFailed');
  }, []);
  const discard = useCallback(() => {
    setPrepared(null);
    setNote((current) => (current === 'previewOnly' ? null : current));
  }, []);
  const share = useCallback(
    (file: File) => {
      setSharing(true);
      setNote(null);
      void shareOrDownload(file).then((outcome) => {
        setSharing(false);
        if (fileHandedOver(outcome, installedIos)) {
          setPrepared(null);
          toast({
            text: outcome === 'shared' ? t.actions.fileShared : t.actions.fileSaved,
            tone: 'ok',
          });
        } else if (outcome === 'downloaded') {
          // Only a preview: the file stays ready for a share.
          setNote('previewOnly');
        } else if (outcome === 'failed') {
          setNote('failed');
        }
        // `cancelled`: the sheet was closed; the file stays ready for another tap.
      });
    },
    [installedIos, toast],
  );
  return { installedIos, exporting, prepared, sharing, note, start, share, ready, failed, discard };
}

/** The button of the file: prepare (or download), then share in the installed iOS app. */
function FileButton({ action }: { action: FileAction }) {
  const { prepared } = action;
  if (prepared !== null) {
    return (
      <Button
        variant="secondary"
        icon={Share}
        busy={action.sharing}
        onClick={() => {
          action.share(prepared);
        }}
      >
        {t.actions.fileShare}
      </Button>
    );
  }
  return (
    <Button variant="secondary" icon={FileDown} busy={action.exporting} onClick={action.start}>
      {action.installedIos ? t.actions.filePrepare : t.actions.file}
    </Button>
  );
}

/** The calm line under the actions: what happened to the file, and what to do. */
function FileNotice({ action }: { action: FileAction }) {
  if (action.note === 'exportFailed') {
    return (
      <Notice
        tone="danger"
        variant="row"
        action={
          <Button size="sm" variant="secondary" onClick={action.start}>
            {t.actions.fileRetry}
          </Button>
        }
      >
        {t.actions.fileExportFailed}
      </Notice>
    );
  }
  if (action.note === 'failed') {
    return (
      <Notice tone="danger" variant="row">
        {t.actions.fileFailed}
      </Notice>
    );
  }
  if (action.note === 'previewOnly') {
    return (
      <Notice tone="soon" variant="row">
        {t.actions.filePreviewOnly}
      </Notice>
    );
  }
  if (action.prepared !== null) {
    return (
      <Notice tone="ok" variant="row">
        {t.actions.filePrepared}
      </Notice>
    );
  }
  return null;
}

/**
 * The editor of one card: its texts and switches, its sections with their dishes, what is still
 * missing, and the quiet actions at the end (staff list, print, file, duplicate, delete).
 */
export function MenuCardPage() {
  const { cardId: cardParam = '' } = useParams();
  const parsed = IdSchema.safeParse(cardParam);
  /** An address that is not an id asks for a card that cannot exist: the queries wait for it. */
  const cardId: Id = parsed.success ? parsed.data : NO_CARD;
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const result = useQueryResult('menu.get', { cardId }, { enabled: parsed.success });
  const run = useCommand();
  const navigate = useNavigate();
  const toast = useToast();
  const fileAction = useFileAction();
  const { discard } = fileAction;
  const shown = result.data;
  // Every change of the card reaches this page as new data: an edit here, a dish whose recipe
  // changed, or the copy after «Duplizieren» on the same page. A file prepared before it shows
  // the old card and must never be shared (ADR-0019).
  useEffect(() => {
    discard();
  }, [shown, discard]);

  if (!parsed.success || (result.status === 'error' && isNotFound(result.error))) {
    return <NotFoundPage />;
  }
  if (result.status === 'error') {
    throw result.error instanceof Error ? result.error : new Error('Query failed');
  }
  const data = result.data;
  if (data === undefined) {
    return <PageHeader title={t.title} back={{ to: paths.menu(), label: t.editor.back }} />;
  }
  const { card, problems, problemCount } = data;

  function duplicate() {
    setError(null);
    run('menu.duplicate', { cardId })
      .then(({ cardId: copy, name }) => {
        toast({ text: t.actions.duplicated(name), tone: 'ok' });
        void navigate(paths.menuCard(copy));
      })
      .catch((caught: unknown) => {
        setError(errorText(caught));
      });
  }

  function remove() {
    setRemoving(false);
    run('menu.delete', { cardId })
      .then(() => {
        toast({ text: t.removeCard.deleted(card.name) });
        void navigate(paths.menu(), { replace: true });
      })
      .catch((caught: unknown) => {
        setError(errorText(caught));
      });
  }

  const guestPath = paths.guest(card.id);
  const guestAddress = card.published ? guestPath : `${guestPath}?preview=1`;
  // A draft prints from its preview: the guest address alone is not found for it.
  const printAddress = card.published
    ? `${guestPath}?drucken=1`
    : `${guestPath}?preview=1&drucken=1`;

  return (
    <>
      <PageHeader
        title={card.name}
        subtitle={card.published ? t.status.published : t.status.draft}
        back={{ to: paths.menu(), label: t.editor.back }}
        actions={
          <ButtonLink to={guestAddress} variant="secondary" size="sm" icon={Eye}>
            {t.actions.guest}
          </ButtonLink>
        }
      />

      <div className="space-y-8">
        {problemCount === 0 ? null : (
          <Notice
            tone="soon"
            icon={TriangleAlert}
            title={card.published ? t.editor.noticeOpen : t.editor.noticeBefore}
          >
            <ul className="mt-1 space-y-1">
              {problems.map((entry) => (
                <li key={entry.dishId}>
                  {t.editor.noticeLine(entry.name, entry.problems.join(' · '))}
                </li>
              ))}
            </ul>
          </Notice>
        )}

        <CardSettings key={card.id} card={card} />

        <SectionsEditor cardId={card.id} sections={data.sections} showPrices={card.showPrices} />

        <section aria-label={t.actions.staffList} className="flex flex-wrap gap-2">
          <ButtonLink to={paths.menuAllergens(card.id)} variant="secondary" icon={ClipboardList}>
            {t.actions.staffList}
          </ButtonLink>
          <ButtonLink to={printAddress} variant="secondary" icon={Printer}>
            {t.actions.print}
          </ButtonLink>
          <FileButton action={fileAction} />
          <Button variant="secondary" icon={Copy} onClick={duplicate}>
            {t.actions.duplicate}
          </Button>
          <Button
            variant="ghost"
            icon={Trash2}
            onClick={() => {
              setRemoving(true);
            }}
          >
            {t.removeCard.confirm}
          </Button>
        </section>
        <FileNotice action={fileAction} />
        {error === null ? null : (
          <p role="alert" className="text-sm font-semibold text-danger">
            {error}
          </p>
        )}
      </div>

      {fileAction.exporting ? (
        <FileExport cardId={card.id} onReady={fileAction.ready} onFail={fileAction.failed} />
      ) : null}

      <ConfirmDialog
        open={removing}
        title={t.removeCard.title}
        text={t.removeCard.text(card.name)}
        confirmLabel={t.removeCard.confirm}
        cancelLabel={t.removeCard.cancel}
        tone="danger"
        onConfirm={remove}
        onCancel={() => {
          setRemoving(false);
        }}
      />
    </>
  );
}
