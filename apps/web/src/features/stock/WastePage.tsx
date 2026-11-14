import { formatQuantity, IdSchema, type Id } from '@randen/core';
import { PackageOpen } from 'lucide-react';
import { useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import {
  errorText,
  isNotFound,
  useCommand,
  useMoney,
  useQuery,
  useQueryResult,
} from '../../app/hooks';
import { NotFoundPage } from '../../app/NotFoundPage';
import { paths } from '../../app/paths';
import { Card } from '../../ui/Card';
import { EmptyState } from '../../ui/EmptyState';
import { FormActions } from '../../ui/FormActions';
import { Notice } from '../../ui/Notice';
import { PageHeader } from '../../ui/PageHeader';
import { ArticlePicker } from '../../ui/pickers';
import { Section } from '../../ui/Section';
import { SelectField } from '../../ui/SelectField';
import { useToast } from '../../ui/Toast';
import { useEnterKeyHint } from './hooks';
import { dateText } from './labels';
import { partValue } from './math';
import { stockMessages } from './messages';
import { WriteOffFields, writeOffReady, type WriteOffDraft } from './WriteOffFields';

const t = stockMessages.waste;

/**
 * «Abschreiber»: pick the article, then the lot (the one that is due first comes chosen),
 * how much and why. Before booking the page says what is written off and what it is worth.
 * With `?lot=` the lot is already chosen, as from the list «Ablauf».
 */
export function WastePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const lotParam = params.get('lot');
  const parsedLot = IdSchema.safeParse(lotParam);
  const lotId = parsedLot.success ? parsedLot.data : null;
  const byLot = useQueryResult('stock.article', lotId === null ? {} : { lotId }, {
    enabled: lotId !== null,
  });
  const [round, setRound] = useState(0);
  const [booked, setBooked] = useState<string | null>(null);

  if (
    (lotParam !== null && lotId === null) ||
    (byLot.status === 'error' && isNotFound(byLot.error))
  ) {
    return <NotFoundPage />;
  }
  const header = (
    <PageHeader
      title={t.title}
      subtitle={t.subtitle}
      back={{ to: paths.stock(), label: stockMessages.back }}
    />
  );
  if (lotId !== null && byLot.data === undefined) {
    return header;
  }
  return (
    <>
      {header}
      <WasteForm
        key={`${lotId ?? 'free'}-${round}`}
        initial={
          lotId === null || byLot.data === undefined
            ? null
            : { articleId: byLot.data.article.id, lotId }
        }
        booked={booked}
        onBooked={(text) => {
          if (lotId === null) {
            // Ready for the next write-off.
            setBooked(text);
            setRound((current) => current + 1);
          } else {
            // The lot came from the list «Ablauf»: back to what is due next.
            void navigate(paths.stockExpiring());
          }
        }}
      />
    </>
  );
}

interface WasteFormProps {
  initial: { articleId: Id; lotId: Id } | null;
  booked: string | null;
  onBooked: (text: string) => void;
}

function WasteForm({ initial, booked, onBooked }: WasteFormProps) {
  const run = useCommand();
  const money = useMoney();
  const toast = useToast();
  const form = useRef<HTMLFormElement>(null);
  const [articleId, setArticleId] = useState<Id | null>(initial?.articleId ?? null);
  const [lotId, setLotId] = useState<Id | null>(initial?.lotId ?? null);
  const [draft, setDraft] = useState<WriteOffDraft>({ quantity: null, reason: null, note: '' });
  const [draftLot, setDraftLot] = useState<Id | null>(null);
  const [reasonMissing, setReasonMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEnterKeyHint(form, 'done');
  const inStock = useQuery('lookup.articles', {})?.articles.filter((row) => row.stock > 0);
  const data = useQuery('stock.article', articleId === null ? {} : { articleId }, {
    enabled: articleId !== null,
  });
  // The query may still hold the article chosen before: only its own answer counts.
  const own = data?.article.id === articleId ? data : undefined;
  const article = own?.article;
  const lots = own?.lots ?? [];
  /** The chosen lot, or the one that is due first. */
  const lot = lots.find((each) => each.lotId === lotId) ?? lots[0];

  // Another lot: the whole rest is the usual amount, and past its date the reason is known.
  if ((lot?.lotId ?? null) !== draftLot) {
    setDraftLot(lot?.lotId ?? null);
    setDraft((current) => ({
      quantity: lot?.quantity ?? null,
      reason: lot?.mustNotUse === true ? 'expired' : null,
      note: current.note,
    }));
    setReasonMissing(false);
  }

  const fits =
    lot !== undefined &&
    draft.quantity !== null &&
    draft.quantity > 0 &&
    draft.quantity <= lot.quantity;

  async function submit() {
    if (article === undefined || lot === undefined) {
      return;
    }
    if (!writeOffReady(draft, lot.quantity)) {
      setReasonMissing(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await run('stock.writeOff', {
        lotId: lot.lotId,
        quantity: draft.quantity,
        reason: draft.reason,
        ...(draft.note.trim() === '' ? {} : { note: draft.note.trim() }),
      });
      const text = t.done(
        formatQuantity(draft.quantity, article.unit),
        article.name,
        money.format(result.valueRappen),
      );
      toast({ text, tone: 'ok' });
      onBooked(text);
    } catch (failure) {
      setError(errorText(failure));
      setBusy(false);
    }
  }

  if (inStock?.length === 0 && initial === null) {
    return (
      <div className="space-y-4">
        {booked === null ? null : (
          <Notice variant="row" tone="ok">
            {booked}
          </Notice>
        )}
        <EmptyState icon={PackageOpen} title={t.emptyTitle} text={t.emptyText} />
      </div>
    );
  }

  return (
    <form
      ref={form}
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      className="max-w-2xl space-y-6"
    >
      {booked !== null && articleId === null ? (
        <Notice variant="row" tone="ok">
          {booked}
        </Notice>
      ) : null}
      <Section title={t.what}>
        <Card>
          <div className="space-y-4">
            <ArticlePicker
              label={t.article}
              required
              value={articleId}
              filter={(row) => row.stock > 0 || row.id === articleId}
              onChange={(next) => {
                setArticleId(next);
                setLotId(null);
              }}
            />
            {article === undefined ? null : lot === undefined ? (
              <Notice variant="row">{t.noStock}</Notice>
            ) : (
              <>
                {initial !== null && lotId === initial.lotId && lot.lotId !== lotId ? (
                  <Notice variant="row" tone="soon">
                    {t.lotGone}
                  </Notice>
                ) : null}
                <SelectField
                  label={t.lot}
                  required
                  options={lots.map((each) => ({
                    value: each.lotId,
                    label: t.lotOption(
                      dateText(each.expiresOn, each.dateKind),
                      formatQuantity(each.quantity, article.unit),
                      each.area.name,
                    ),
                  }))}
                  value={lot.lotId}
                  onChange={setLotId}
                />
              </>
            )}
          </div>
        </Card>
      </Section>

      {article === undefined || lot === undefined ? null : (
        <Section title={t.howMuch}>
          <Card>
            <WriteOffFields
              unit={article.unit}
              lotQuantity={lot.quantity}
              draft={draft}
              onChange={setDraft}
              reasonMissing={reasonMissing}
            />
          </Card>
        </Section>
      )}

      <FormActions
        primaryLabel={t.action}
        primaryDisabled={busy}
        summary={
          article !== undefined && lot !== undefined && fits && draft.quantity !== null
            ? t.summary(
                formatQuantity(draft.quantity, article.unit),
                article.name,
                money.format(partValue(lot.quantity, draft.quantity, lot.pricePer1000)),
              )
            : undefined
        }
        error={error}
      />
    </form>
  );
}
