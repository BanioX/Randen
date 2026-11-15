import { IdSchema, type Id } from '@randen/core';
import { ClipboardList, Copy, Eye, FileDown, Printer, Trash2, TriangleAlert } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { errorText, isNotFound, useCommand, useQuery, useQueryResult } from '../../app/hooks';
import { NotFoundPage } from '../../app/NotFoundPage';
import { paths } from '../../app/paths';
import { Button, ButtonLink } from '../../ui/Button';
import { Notice } from '../../ui/Notice';
import { PageHeader } from '../../ui/PageHeader';
import { ConfirmDialog } from '../../ui/Sheet';
import { useToast } from '../../ui/Toast';
import { CardSettings } from './CardSettings';
import { menuMessages } from './messages';
import { saveTextFile } from './shared';
import { SectionsEditor } from './SectionsEditor';

const t = menuMessages;
const NO_CARD = IdSchema.parse('00000000-0000-7000-8000-000000000000');

/** Asks for the card as a file, saves it once the data is there, and steps aside. */
function FileExport({ cardId, onDone }: { cardId: Id; onDone: () => void }) {
  const exported = useQuery('menu.export', { cardId });
  const toast = useToast();
  const saved = useRef(false);
  useEffect(() => {
    if (exported === undefined || saved.current) {
      return;
    }
    saved.current = true;
    saveTextFile(exported.fileName, exported.html, 'text/html;charset=utf-8');
    toast({ text: t.actions.fileSaved, tone: 'ok' });
    onDone();
  }, [exported, onDone, toast]);
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
  const [exporting, setExporting] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const result = useQueryResult('menu.get', { cardId }, { enabled: parsed.success });
  const run = useCommand();
  const navigate = useNavigate();
  const toast = useToast();
  const finishExport = useCallback(() => {
    setExporting(false);
  }, []);

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

  const guestAddress = card.published ? paths.guest(card.id) : `${paths.guest(card.id)}?preview=1`;

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

        <SectionsEditor cardId={card.id} sections={data.sections} />

        <section aria-label={t.actions.staffList} className="flex flex-wrap gap-2">
          <ButtonLink to={paths.menuAllergens(card.id)} variant="secondary" icon={ClipboardList}>
            {t.actions.staffList}
          </ButtonLink>
          <ButtonLink to={`${paths.guest(card.id)}?drucken=1`} variant="secondary" icon={Printer}>
            {t.actions.print}
          </ButtonLink>
          <Button
            variant="secondary"
            icon={FileDown}
            onClick={() => {
              setExporting(true);
            }}
          >
            {t.actions.file}
          </Button>
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
        {error === null ? null : (
          <p role="alert" className="text-sm font-semibold text-danger">
            {error}
          </p>
        )}
      </div>

      {exporting ? <FileExport cardId={card.id} onDone={finishExport} /> : null}

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
