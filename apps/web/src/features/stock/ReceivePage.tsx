import {
  addDays,
  IdSchema,
  sumRappen,
  type Id,
  type LocalDate,
  type OperationOutput,
  type Rappen,
  type ReceiveProposal,
} from '@randen/core';
import {
  useCallback,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import {
  errorText,
  isNotFound,
  useCommand,
  useMoney,
  useQueryResult,
  useToday,
} from '../../app/hooks';
import { NotFoundPage } from '../../app/NotFoundPage';
import { paths } from '../../app/paths';
import { Card } from '../../ui/Card';
import { DateField } from '../../ui/DateField';
import { FormActions } from '../../ui/FormActions';
import { Notice } from '../../ui/Notice';
import { PageHeader } from '../../ui/PageHeader';
import { ArticlePicker, SupplierPicker } from '../../ui/pickers';
import { Section } from '../../ui/Section';
import { Switch } from '../../ui/Switch';
import { TemperatureField } from '../../ui/TemperatureField';
import { TextArea, TextField } from '../../ui/TextField';
import { useToast } from '../../ui/Toast';
import { useEnterKeyHint, useFocusOn } from './hooks';
import { stockMessages } from './messages';
import { lineAmount, lineIds, ReceiveLine, type DraftLine } from './ReceiveLine';

const t = stockMessages.receive;

type Draft = OperationOutput<'stock.receiveDraft'>;

/** The field «Artikel» under «Zeile hinzufügen»: where the focus returns for the next line. */
const ADD_ID = 'receive-add-article';

function proposedDate(proposal: ReceiveProposal, receivedOn: LocalDate | null): LocalDate | null {
  return receivedOn === null || proposal.shelfLifeDays === undefined
    ? null
    : addDays(receivedOn, proposal.shelfLifeDays);
}

function newLine(
  key: number,
  proposal: ReceiveProposal,
  receivedOn: LocalDate | null,
  order?: { quantity: number; pricePer1000: Rappen },
): DraftLine {
  // The price of the order if it has one, else the last price; no price leaves the field empty.
  const price =
    order !== undefined && order.pricePer1000 > 0 ? order.pricePer1000 : proposal.pricePer1000;
  const expiresOn = proposedDate(proposal, receivedOn);
  return {
    key,
    articleId: proposal.articleId,
    quantity: order?.quantity ?? null,
    mode: 'unit',
    unitPrice: price > 0 ? price : null,
    total: null,
    expiresOn,
    proposed: expiresOn !== null,
    areaId: proposal.areaId ?? null,
    lotCode: '',
    withLotCode: false,
  };
}

/**
 * «Wareneingang»: the most used page of the house, made for one hand. Supplier and day at the
 * top, then one line per article with everything usual prefilled; the article field under
 * «Zeile hinzufügen» takes the focus again after every line. With `?order=` the lines come from
 * an order, with `?mode=opening` the same form books the opening stock.
 */
export function ReceivePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const orderParam = params.get('order');
  const parsedOrder = IdSchema.safeParse(orderParam);
  const orderId = parsedOrder.success ? parsedOrder.data : null;
  const opening = orderParam === null && params.get('mode') === 'opening';
  const result = useQueryResult('stock.receiveDraft', orderId === null ? {} : { orderId });
  /** Counts the bookings of this visit: every one starts a fresh, empty form. */
  const [round, setRound] = useState(0);
  const [booked, setBooked] = useState<string | null>(null);

  if (
    (orderParam !== null && orderId === null) ||
    (result.status === 'error' && isNotFound(result.error))
  ) {
    return <NotFoundPage text={t.notFound} />;
  }
  const draft = result.data;
  // After a change of address the query still holds the draft of the address before for a
  // moment: the form waits for its own.
  const ready = draft !== undefined && (draft.order?.id ?? null) === orderId;

  return (
    <>
      <PageHeader
        title={opening ? t.openingTitle : t.title}
        subtitle={opening ? t.openingSubtitle : undefined}
        back={{ to: paths.stock(), label: stockMessages.back }}
      />
      {result.status === 'error' ? (
        <p role="alert" className="text-danger">
          {errorText(result.error)}
        </p>
      ) : null}
      {ready ? (
        <ReceiveForm
          key={`${orderId ?? 'free'}-${opening ? 'opening' : 'delivery'}-${round}`}
          draft={draft}
          opening={opening}
          booked={booked}
          onBooked={(text) => {
            setBooked(text);
            setRound((current) => current + 1);
            if (orderId !== null) {
              // The order is received: the next delivery starts without it.
              void navigate(paths.receive(), { replace: true });
            }
          }}
        />
      ) : null}
    </>
  );
}

interface ReceiveFormProps {
  draft: Draft;
  opening: boolean;
  /** What the booking before this form was, to say so calmly on the page. */
  booked: string | null;
  onBooked: (text: string) => void;
}

function ReceiveForm({ draft, opening, booked, onBooked }: ReceiveFormProps) {
  const today = useToday();
  const money = useMoney();
  const run = useCommand();
  const toast = useToast();
  const form = useRef<HTMLFormElement>(null);
  const nextKey = useRef(draft.lines.length);
  const proposals = new Map(draft.proposals.map((proposal) => [proposal.articleId, proposal]));

  const [supplierId, setSupplierId] = useState<Id | null>(draft.order?.supplierId ?? null);
  const [receivedOn, setReceivedOn] = useState<LocalDate | null>(today);
  const [documentNumber, setDocumentNumber] = useState('');
  const [lines, setLines] = useState<DraftLine[]>(() =>
    draft.lines.flatMap((line, index) => {
      const proposal = draft.proposals.find((each) => each.articleId === line.articleId);
      return proposal === undefined ? [] : [newLine(index, proposal, today, line)];
    }),
  );
  const [temperature, setTemperature] = useState<number | null>(null);
  const [checkOk, setCheckOk] = useState(true);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);

  useEnterKeyHint(form, 'next');
  useFocusOn(
    focusId,
    useCallback(() => {
      setFocusId(null);
    }, []),
  );

  const shown = lines.flatMap((line) => {
    const proposal = proposals.get(line.articleId);
    return proposal === undefined ? [] : [{ line, proposal }];
  });
  const total = sumRappen(
    shown.map(({ line, proposal }) => lineAmount(line, proposal.pricePer1000)),
  );

  function patchLine(key: number, patch: Partial<DraftLine>) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function addLine(articleId: Id) {
    const proposal = proposals.get(articleId);
    if (proposal === undefined) {
      return;
    }
    const key = nextKey.current;
    nextKey.current += 1;
    setLines((current) => [...current, newLine(key, proposal, receivedOn)]);
    setError(null);
    setFocusId(lineIds(key).quantity);
  }

  function changeDay(day: LocalDate | null) {
    setReceivedOn(day);
    // Dates that are still the proposal follow the day of the delivery.
    setLines((current) =>
      current.map((line) => {
        const proposal = proposals.get(line.articleId);
        return line.proposed && proposal !== undefined
          ? { ...line, expiresOn: proposedDate(proposal, day) }
          : line;
      }),
    );
  }

  /** Enter never books by accident: in a field it leads to the article of the next line. */
  function onKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (
      event.key !== 'Enter' ||
      event.defaultPrevented ||
      event.nativeEvent.isComposing ||
      !(event.target instanceof HTMLInputElement)
    ) {
      return;
    }
    event.preventDefault();
    // From a field one types in; a switch or a calendar keeps the focus where it is.
    if (event.target.id !== ADD_ID && event.target.type === 'text') {
      setFocusId(ADD_ID);
    }
  }

  async function submit() {
    if (shown.length === 0) {
      setError(t.needLine);
      setFocusId(ADD_ID);
      return;
    }
    if (receivedOn === null) {
      return;
    }
    const commandLines = shown.flatMap(({ line }) =>
      line.quantity === null || line.areaId === null
        ? []
        : [
            {
              articleId: line.articleId,
              quantity: line.quantity,
              ...(line.mode === 'unit' && line.unitPrice !== null
                ? { pricePer1000: line.unitPrice }
                : {}),
              ...(line.mode === 'total' && line.total !== null
                ? { lineTotalRappen: line.total }
                : {}),
              ...(line.expiresOn === null ? {} : { expiresOn: line.expiresOn }),
              ...(line.withLotCode && line.lotCode.trim() !== ''
                ? { lotCode: line.lotCode.trim() }
                : {}),
              areaId: line.areaId,
            },
          ],
    );
    if (commandLines.length !== shown.length) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = opening
        ? await run('stock.openingStock', { on: receivedOn, lines: commandLines })
        : await run('stock.receive', {
            ...(supplierId === null ? {} : { supplierId }),
            ...(draft.order === undefined ? {} : { orderId: draft.order.id }),
            receivedOn,
            ...(documentNumber.trim() === '' ? {} : { documentNumber: documentNumber.trim() }),
            ...(temperature === null ? {} : { tempDeciC: temperature }),
            checkOk,
            ...(note.trim() === '' ? {} : { note: note.trim() }),
            lines: commandLines,
          });
      const amount = money.format(result.totalRappen);
      toast({ text: t.done(result.lotIds.length, amount), tone: 'ok' });
      onBooked(t.booked(result.lotIds.length, amount));
    } catch (failure) {
      setError(errorText(failure));
      setBusy(false);
    }
  }

  return (
    <form
      ref={form}
      onKeyDown={onKeyDown}
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      className="space-y-6"
    >
      {booked !== null && lines.length === 0 ? (
        <Notice variant="row" tone="ok">
          {booked}
        </Notice>
      ) : null}
      {draft.order === undefined ? null : (
        <Notice title={t.order.title(draft.order.supplierName)}>
          {draft.order.status === 'received' ? t.order.received : t.order.text}
        </Notice>
      )}

      <Section title={t.head.title}>
        <Card>
          <div className={`grid gap-4 ${opening ? 'md:max-w-sm' : 'md:grid-cols-3'}`}>
            {opening ? null : (
              <SupplierPicker
                label={t.head.supplier}
                optional
                value={supplierId}
                onChange={setSupplierId}
              />
            )}
            <DateField
              label={opening ? t.head.openingDate : t.head.date}
              value={receivedOn}
              onChange={changeDay}
              max={today}
              required
            />
            {opening ? null : (
              <TextField
                label={t.head.document}
                optional
                maxLength={40}
                value={documentNumber}
                onChange={setDocumentNumber}
              />
            )}
          </div>
        </Card>
      </Section>

      <Section title={t.lines.title}>
        <div className="space-y-3">
          {shown.length === 0 ? (
            <p className="rounded-2xl bg-surface px-4 py-6 text-center text-ink-muted shadow-card">
              {t.lines.none}
            </p>
          ) : (
            shown.map(({ line, proposal }, index) => (
              <ReceiveLine
                key={line.key}
                index={index}
                line={line}
                proposal={proposal}
                onChange={(patch) => {
                  patchLine(line.key, patch);
                }}
                onRemove={() => {
                  setLines((current) => current.filter((each) => each.key !== line.key));
                  setFocusId(ADD_ID);
                }}
                onFocus={setFocusId}
              />
            ))
          )}
          <Card padding="compact" className="py-4">
            <ArticleAdder onAdd={addLine} />
          </Card>
        </div>
      </Section>

      {opening ? null : (
        <Section title={t.check.title}>
          <Card>
            <div className="grid gap-4 md:grid-cols-2">
              <TemperatureField
                label={t.check.temperature}
                optional
                hint={t.check.temperatureHint}
                value={temperature}
                onChange={setTemperature}
              />
              <Switch
                label={t.check.ok}
                description={t.check.okText}
                checked={checkOk}
                onChange={setCheckOk}
                className="md:self-start md:pt-6"
              />
              <TextArea
                label={t.check.note}
                optional
                rows={2}
                maxLength={500}
                hint={checkOk ? undefined : t.check.refusedHint}
                value={note}
                onChange={setNote}
                className="md:col-span-2"
              />
            </div>
          </Card>
        </Section>
      )}

      <FormActions
        primaryLabel={opening ? t.submitOpening : t.submit}
        primaryDisabled={busy}
        summary={shown.length === 0 ? undefined : t.summary(shown.length, money.format(total))}
        error={error}
      />
    </form>
  );
}

/**
 * The article of the next line. A line is added only when the person takes an entry (a tap,
 * Enter, or leaving the field with a name typed in full), never while they are still typing:
 * «Rahm» must not become a line on the way to «Rahmquark».
 */
function ArticleAdder({ onAdd }: { onAdd: (articleId: Id) => void }) {
  const [round, setRound] = useState(0);
  const [chosen, setChosen] = useState<Id | null>(null);
  /** The same as `chosen`, readable in the event that follows the choice at once. */
  const pending = useRef<Id | null>(null);

  function take() {
    const articleId = pending.current;
    if (articleId === null) {
      return;
    }
    pending.current = null;
    setChosen(null);
    // A fresh field: empty, and ready for the article after this one.
    setRound((current) => current + 1);
    onAdd(articleId);
  }

  return (
    <div
      onClick={(event: MouseEvent<HTMLDivElement>) => {
        if (event.target instanceof Element && event.target.closest('[role="option"]') !== null) {
          take();
        }
      }}
      onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key === 'Enter' && pending.current !== null) {
          event.preventDefault();
          take();
        }
      }}
      onBlur={(event: FocusEvent<HTMLDivElement>) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          take();
        }
      }}
    >
      <ArticlePicker
        key={round}
        id={ADD_ID}
        label={t.add.title}
        placeholder={t.add.article}
        hint={t.add.hint}
        value={chosen}
        onChange={(articleId) => {
          pending.current = articleId;
          setChosen(articleId);
        }}
      />
    </div>
  );
}
