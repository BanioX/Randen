import {
  addDays,
  formatSwissDate,
  formatUnitPrice,
  IdSchema,
  lineValue,
  rappen,
  sumRappen,
  type ArticleRef,
  type Id,
  type LocalDate,
  type OperationOutput,
  type Unit,
} from '@randen/core';
import { Ban, Copy, PackageCheck, Printer, Send, Share2, Trash2, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
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
import { Button, ButtonLink } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { DateField } from '../../ui/DateField';
import { Notice } from '../../ui/Notice';
import { PageHeader } from '../../ui/PageHeader';
import { QuantityField } from '../../ui/QuantityField';
import { Section } from '../../ui/Section';
import { ConfirmDialog } from '../../ui/Sheet';
import { KpiGrid, StatTile } from '../../ui/StatTile';
import { TextArea } from '../../ui/TextField';
import { useToast } from '../../ui/Toast';
import { ArticleAdder } from './ArticleAdder';
import { purchasingMessages } from './messages';
import { dayLabel, PackStepper, quantityLabel } from './shared';

const t = purchasingMessages.order;

type Detail = OperationOutput<'orders.get'>;
type SavedLine = Detail['lines'][number];

/** A line while it is edited: nothing is stored until «Änderungen sichern». */
interface DraftLine {
  articleId: Id;
  name: string;
  unit: Unit;
  /** null while the field is empty; a line at 0 is left out when saved. */
  quantity: number | null;
  packSize: number | undefined;
  packLabel: string | undefined;
  pricePer1000: number;
  priceMissing: boolean;
  /** Added on this page: it takes the article's price when saved, as the order does. */
  added: boolean;
  supplierArticleNumber: string | undefined;
}

/** The failure of a query that is not «not found»: the frame of the app shows it. */
function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error('Query failed', { cause: error });
}

function toDraft(lines: readonly SavedLine[]): DraftLine[] {
  return lines.map((line) => ({
    articleId: line.articleId,
    name: line.name,
    unit: line.unit,
    quantity: line.quantity,
    packSize: line.packSize,
    packLabel: line.packLabel,
    pricePer1000: line.pricePer1000,
    priceMissing: line.priceMissing,
    added: false,
    supplierArticleNumber: line.supplierArticleNumber,
  }));
}

/** The lines that are ordered, as the text and the command read them: article and quantity. */
function signature(lines: readonly { articleId: Id; quantity: number | null }[]): string {
  return lines
    .filter((line) => (line.quantity ?? 0) > 0)
    .map((line) => `${line.articleId}:${String(line.quantity)}`)
    .join('|');
}

/** Not in every context (an insecure page has none): the fallback then selects the text. */
function clipboardOrNothing(): Clipboard | undefined {
  return navigator.clipboard;
}

/** What the status means for the person, in a sentence. */
function statusNotice(status: Detail['order']['status'], date: LocalDate): string {
  switch (status) {
    case 'draft':
      return t.notice.draft;
    case 'sent':
      return t.notice.sent(formatSwissDate(date));
    case 'received':
      return t.notice.received;
    case 'cancelled':
      return t.notice.cancelled;
  }
}

/** Selects the text, so the person can copy it with the menu of the device. */
function selectText(element: HTMLElement | null) {
  if (element === null) {
    return;
  }
  const range = document.createRange();
  range.selectNodeContents(element);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

interface DraftRowProps {
  line: DraftLine;
  onQuantity: (quantity: number | null) => void;
  onRemove: () => void;
}

/** One line of a draft: what, how much (a pack stepper where the article has packs), the value. */
function DraftRow({ line, onQuantity, onRemove }: DraftRowProps) {
  const money = useMoney();
  const value = lineValue(line.quantity ?? 0, line.pricePer1000);
  return (
    <li className="py-3 first:pt-0 last:pb-0 md:flex md:items-center md:gap-4">
      <div className="min-w-0 flex-1">
        <p className="font-semibold break-words hyphens-calm">{line.name}</p>
        <p className="text-sm text-ink-muted tabular-nums">
          {line.priceMissing
            ? purchasingMessages.priceMissing
            : formatUnitPrice(line.pricePer1000, line.unit, money.currency)}
          {line.supplierArticleNumber === undefined
            ? ''
            : ` · ${t.lines.articleNumber(line.supplierArticleNumber)}`}
        </p>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 md:mt-0 md:shrink-0">
        {line.packSize === undefined ? (
          <QuantityField
            label={purchasingMessages.proposal.quantityOf(line.name)}
            hideLabel
            unit={line.unit}
            value={line.quantity}
            onChange={onQuantity}
            positive
            className="w-44"
          />
        ) : (
          <PackStepper
            name={line.name}
            count={Math.round((line.quantity ?? 0) / line.packSize)}
            label={line.packLabel}
            size={line.packSize}
            unit={line.unit}
            onChange={(count) => {
              onQuantity(count * (line.packSize ?? 0));
            }}
          />
        )}
        <span className="w-24 shrink-0 text-right font-semibold tabular-nums">
          {line.priceMissing ? '' : money.format(value)}
        </span>
        <Button
          variant="ghost"
          size="sm"
          icon={X}
          aria-label={t.lines.removeOf(line.name)}
          onClick={onRemove}
        >
          {t.lines.remove}
        </Button>
      </div>
    </li>
  );
}

/** A line of a sent or received order: read only. */
function SavedRow({ line }: { line: SavedLine }) {
  const money = useMoney();
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <p className="font-semibold break-words hyphens-calm">{line.name}</p>
        {line.supplierArticleNumber === undefined ? null : (
          <p className="text-sm text-ink-muted">
            {t.lines.articleNumber(line.supplierArticleNumber)}
          </p>
        )}
      </div>
      <p className="tabular-nums">
        <span>{quantityLabel(line.quantity, line.unit, line.packs)}</span>
        <span className="ml-3 font-semibold">
          {line.priceMissing ? purchasingMessages.priceMissing : money.format(line.valueRappen)}
        </span>
      </p>
    </li>
  );
}

interface OrderDetailProps {
  detail: Detail;
  /** Told before the order is deleted, so the page does not call it «nicht gefunden» meanwhile. */
  onLeaving: (leaving: boolean) => void;
}

/**
 * One order (pattern H2): its figures, the lines (editable while it is a draft), the supplier, the
 * text to send, and the actions. Nothing is sent from here: the person sends the text herself.
 */
function OrderDetail({ detail, onLeaving }: OrderDetailProps) {
  const { order, supplier, lines, text, subject, businessName } = detail;
  const money = useMoney();
  const today = useToday();
  const run = useCommand();
  const toast = useToast();
  const navigate = useNavigate();
  const textRef = useRef<HTMLPreElement>(null);
  const editable = order.status === 'draft';
  const canShare = typeof navigator.share === 'function';

  const [draft, setDraft] = useState<DraftLine[]>(() => toDraft(lines));
  const [expectedOn, setExpectedOn] = useState<LocalDate | null>(order.expectedOn ?? null);
  const [note, setNote] = useState(order.note ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<'cancel' | 'remove' | null>(null);

  // The text, the figures and the buttons that send describe what is saved, not the draft.
  const savedNote = order.note ?? '';
  const dirty =
    editable &&
    (signature(draft) !== signature(lines) ||
      expectedOn !== (order.expectedOn ?? null) ||
      note.trim() !== savedNote.trim());
  const draftValue = sumRappen(
    draft.map((line) => lineValue(line.quantity ?? 0, line.pricePer1000)),
  );
  const dateOf = order.orderedOn ?? order.createdOn;

  function setQuantity(articleId: Id, quantity: number | null) {
    setDraft((current) =>
      current.map((line) => (line.articleId === articleId ? { ...line, quantity } : line)),
    );
    setError(null);
  }

  function addArticle(articleId: Id, article: ArticleRef | null) {
    if (article === null) {
      return;
    }
    setDraft((current) =>
      current.some((line) => line.articleId === articleId)
        ? current
        : [
            ...current,
            {
              articleId,
              name: article.name,
              unit: article.unit,
              quantity: article.unit === 'pcs' ? 1 : 1000,
              packSize: undefined,
              packLabel: undefined,
              pricePer1000: article.pricePer1000,
              priceMissing: article.pricePer1000 === 0,
              added: true,
              supplierArticleNumber: undefined,
            },
          ],
    );
    setError(null);
  }

  function discard() {
    setDraft(toDraft(lines));
    setExpectedOn(order.expectedOn ?? null);
    setNote(savedNote);
    setError(null);
  }

  async function save() {
    const kept = draft.filter((line) => (line.quantity ?? 0) > 0);
    if (kept.length === 0) {
      setError(t.needLine);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await run('orders.update', {
        orderId: order.id,
        lines: kept.map((line) => ({
          articleId: line.articleId,
          quantity: line.quantity ?? 0,
          // A line that was priced in the order keeps its price; a new one takes the article's.
          ...(line.added || line.priceMissing ? {} : { pricePer1000: rappen(line.pricePer1000) }),
        })),
        expectedOn,
        note: note.trim() === '' ? null : note.trim(),
      });
      toast({ text: t.saved, tone: 'ok' });
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      const clipboard = clipboardOrNothing();
      if (clipboard === undefined) {
        throw new Error('no clipboard');
      }
      await clipboard.writeText(text);
      toast({ text: t.text.copied, tone: 'ok' });
    } catch {
      selectText(textRef.current);
      toast({ text: t.text.selected });
    }
  }

  async function share() {
    try {
      await navigator.share({ title: subject, text });
    } catch (failure) {
      // Cancelling the share sheet is no failure.
      if (!(failure instanceof DOMException && failure.name === 'AbortError')) {
        selectText(textRef.current);
        toast({ text: t.text.selected });
      }
    }
  }

  async function markSent() {
    setBusy(true);
    setError(null);
    try {
      await run('orders.markSent', { orderId: order.id });
      toast({ text: t.sentDone(supplier.name), tone: 'ok' });
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    setDialog(null);
    setError(null);
    try {
      await run('orders.cancel', { orderId: order.id });
      toast({ text: t.cancelled });
    } catch (failure) {
      setError(errorText(failure));
    }
  }

  function remove() {
    setDialog(null);
    setError(null);
    onLeaving(true);
    run('orders.delete', { orderId: order.id })
      .then(() => {
        toast({ text: t.removed });
        void navigate(paths.purchasing(), { replace: true });
      })
      .catch((failure: unknown) => {
        onLeaving(false);
        setError(errorText(failure));
      });
  }

  const nextDelivery = supplier.nextDelivery;
  const primary =
    order.status === 'draft' ? (
      <Button
        size="sm"
        icon={Send}
        disabled={busy || dirty}
        onClick={() => {
          void markSent();
        }}
      >
        {t.markSent}
      </Button>
    ) : order.status === 'sent' ? (
      <ButtonLink to={paths.receive(order.id)} size="sm" icon={PackageCheck}>
        {t.receive}
      </ButtonLink>
    ) : null;

  return (
    <>
      <div className="print:hidden">
        <PageHeader
          title={supplier.name}
          subtitle={t.subtitle(purchasingMessages.status[order.status], formatSwissDate(dateOf))}
          back={{ to: paths.orders(), label: t.back }}
          actions={primary}
        />
        <div className="space-y-6">
          <Notice variant="row" tone={order.status === 'received' ? 'ok' : 'info'}>
            {statusNotice(order.status, order.orderedOn ?? order.createdOn)}
          </Notice>
          <KpiGrid>
            <StatTile
              variant="premium"
              label={t.kpi.value}
              unit={money.symbol}
              value={money.format(order.valueRappen, { currency: false })}
              hint={order.priceMissing ? purchasingMessages.priceMissing : undefined}
            />
            <StatTile label={t.kpi.lines} value={String(lines.length)} />
            <StatTile
              label={t.kpi.expected}
              value={
                order.expectedOn === undefined ? t.kpi.noDay : dayLabel(order.expectedOn, today)
              }
            />
            <StatTile
              label={t.kpi.ordered}
              value={
                order.orderedOn === undefined ? t.kpi.notYet : formatSwissDate(order.orderedOn)
              }
            />
          </KpiGrid>

          <div className="space-y-6 md:grid md:grid-cols-2 md:items-start md:gap-4 md:space-y-0">
            <Section title={t.lines.title}>
              <Card>
                {editable ? (
                  <>
                    {draft.length === 0 ? (
                      <p className="text-ink-muted">{t.needLine}</p>
                    ) : (
                      <ul aria-label={t.lines.caption} className="divide-y divide-line">
                        {draft.map((line) => (
                          <DraftRow
                            key={line.articleId}
                            line={line}
                            onQuantity={(quantity) => {
                              setQuantity(line.articleId, quantity);
                            }}
                            onRemove={() => {
                              setDraft((current) =>
                                current.filter((each) => each.articleId !== line.articleId),
                              );
                            }}
                          />
                        ))}
                      </ul>
                    )}
                    <div className="mt-4 space-y-4 border-t border-line pt-4">
                      <ArticleAdder label={t.lines.add} hint={t.lines.addHint} onAdd={addArticle} />
                      <p className="flex items-baseline justify-between gap-3 font-semibold tabular-nums">
                        <span>{t.lines.sum}</span>
                        <span>{money.format(draftValue)}</span>
                      </p>
                    </div>
                  </>
                ) : (
                  <ul aria-label={t.lines.caption} className="divide-y divide-line">
                    {lines.map((line) => (
                      <SavedRow key={line.articleId} line={line} />
                    ))}
                  </ul>
                )}
              </Card>
            </Section>

            <div className="space-y-6">
              <Section title={t.supplier.title}>
                <Card>
                  <p className="font-semibold break-words hyphens-calm">{supplier.name}</p>
                  <div className="mt-1 space-y-1 text-[0.9375rem] text-ink-muted">
                    {supplier.customerNumber === undefined ? null : (
                      <p>{t.supplier.customerNumber(supplier.customerNumber)}</p>
                    )}
                    {supplier.phone === undefined ? null : (
                      <p>
                        <a
                          href={`tel:${supplier.phone.replace(/\s/g, '')}`}
                          className="underline underline-offset-2"
                        >
                          {t.supplier.phone(supplier.phone)}
                        </a>
                      </p>
                    )}
                    {supplier.email === undefined ? null : (
                      <p>
                        <a
                          href={`mailto:${supplier.email}`}
                          className="break-all underline underline-offset-2"
                        >
                          {t.supplier.email(supplier.email)}
                        </a>
                      </p>
                    )}
                  </div>
                  <div className="mt-4">
                    <ButtonLink to={paths.supplier(supplier.id)} variant="secondary" size="sm">
                      {t.supplier.open}
                    </ButtonLink>
                  </div>
                </Card>
              </Section>

              <Section title={t.details.title}>
                <Card>
                  {editable ? (
                    <div className="space-y-4">
                      <DateField
                        label={t.details.expectedOn}
                        value={expectedOn}
                        onChange={(next) => {
                          setExpectedOn(next);
                          setError(null);
                        }}
                        presets={
                          nextDelivery === undefined
                            ? undefined
                            : [
                                {
                                  label: dayLabel(addDays(today, nextDelivery.inDays), today),
                                  days: nextDelivery.inDays,
                                },
                              ]
                        }
                      />
                      <TextArea
                        label={t.details.note}
                        hint={t.details.noteHint}
                        value={note}
                        rows={2}
                        maxLength={500}
                        onChange={(next) => {
                          setNote(next);
                          setError(null);
                        }}
                      />
                    </div>
                  ) : (
                    <dl className="space-y-2 text-[0.9375rem]">
                      <div className="flex justify-between gap-3">
                        <dt className="text-ink-muted">{t.details.expectedOn}</dt>
                        <dd className="text-right tabular-nums">
                          {order.expectedOn === undefined
                            ? t.kpi.noDay
                            : dayLabel(order.expectedOn, today)}
                        </dd>
                      </div>
                      {order.note === undefined ? null : (
                        <div>
                          <dt className="text-ink-muted">{t.details.note}</dt>
                          <dd className="whitespace-pre-line">{order.note}</dd>
                        </div>
                      )}
                    </dl>
                  )}
                  {editable && nextDelivery !== undefined ? (
                    <p className="mt-3 text-sm text-ink-muted">
                      {t.details.nextDelivery(dayLabel(addDays(today, nextDelivery.inDays), today))}
                    </p>
                  ) : null}
                </Card>
              </Section>
            </div>
          </div>

          {editable && dirty ? (
            <Notice variant="row" tone="soon">
              {t.dirty}
            </Notice>
          ) : null}
          {editable ? (
            <div className="flex flex-wrap gap-2">
              <Button
                icon={PackageCheck}
                disabled={busy || !dirty}
                onClick={() => {
                  void save();
                }}
              >
                {t.save}
              </Button>
              <Button variant="secondary" disabled={busy || !dirty} onClick={discard}>
                {t.discard}
              </Button>
            </div>
          ) : null}
          {error === null ? null : (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}

          <Section title={t.text.title} hint={t.text.hint}>
            <Card>
              <pre
                ref={textRef}
                tabIndex={0}
                aria-label={t.text.title}
                className="rounded-xl bg-surface-muted p-4 font-sans text-[0.9375rem] leading-relaxed whitespace-pre-wrap break-words"
              >
                {text}
              </pre>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  icon={Copy}
                  disabled={dirty}
                  onClick={() => {
                    void copy();
                  }}
                >
                  {t.text.copy}
                </Button>
                {canShare ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={Share2}
                    disabled={dirty}
                    onClick={() => {
                      void share();
                    }}
                  >
                    {t.text.share}
                  </Button>
                ) : null}
                <Button
                  variant="secondary"
                  size="sm"
                  icon={Printer}
                  disabled={dirty}
                  onClick={() => {
                    window.print();
                  }}
                >
                  {t.text.print}
                </Button>
              </div>
            </Card>
          </Section>

          {order.status === 'draft' || order.status === 'sent' ? (
            <div className="flex flex-wrap gap-2 border-t border-line pt-6">
              <Button
                variant="secondary"
                icon={Ban}
                disabled={busy}
                onClick={() => {
                  setDialog('cancel');
                }}
              >
                {t.cancel}
              </Button>
              {editable ? (
                <Button
                  variant="ghost"
                  icon={Trash2}
                  disabled={busy}
                  onClick={() => {
                    setDialog('remove');
                  }}
                >
                  {t.remove}
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>

        <ConfirmDialog
          open={dialog === 'cancel'}
          title={t.cancelTitle}
          text={t.cancelText(supplier.name)}
          confirmLabel={t.cancel}
          tone="danger"
          onConfirm={() => {
            void cancel();
          }}
          onCancel={() => {
            setDialog(null);
          }}
        />
        <ConfirmDialog
          open={dialog === 'remove'}
          title={t.removeTitle}
          text={t.removeText(supplier.name)}
          confirmLabel={t.remove}
          tone="danger"
          onConfirm={remove}
          onCancel={() => {
            setDialog(null);
          }}
        />
      </div>

      {/* The sheet for the printer: no navigation, black on white, the day and the business. */}
      <div className="hidden text-sm text-black print:block">
        <p className="text-lg font-bold">{t.print.title(supplier.name)}</p>
        <p>{t.print.meta(businessName, formatSwissDate(today))}</p>
        {order.expectedOn === undefined ? null : (
          <p>
            {t.details.expectedOn}: {dayLabel(order.expectedOn, today)}
          </p>
        )}
        <table className="mt-4 w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-black">
              <th className="py-1 pr-3 font-bold">{t.print.columns.quantity}</th>
              <th className="py-1 pr-3 font-bold">{t.print.columns.article}</th>
              <th className="py-1 font-bold">{t.print.columns.number}</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.articleId} className="border-b border-black/30">
                <td className="py-1 pr-3 align-top tabular-nums">
                  {quantityLabel(line.quantity, line.unit, line.packs)}
                </td>
                <td className="py-1 pr-3 align-top">{line.name}</td>
                <td className="py-1 align-top">
                  {line.supplierArticleNumber ?? purchasingMessages.none}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {order.note === undefined ? null : <p className="mt-4 whitespace-pre-line">{order.note}</p>}
        <p className="mt-4">{subject}</p>
      </div>
    </>
  );
}

/**
 * «Bestellung» (pattern H2): the order with its lines, the supplier, and the text to send. A
 * draft can be changed; a sent order is received on the stock page (ADR-0011: sent by the person).
 */
export function OrderPage() {
  const { orderId = '' } = useParams();
  const known = IdSchema.safeParse(orderId).success;
  const result = useQueryResult('orders.get', { orderId }, { enabled: known });
  const [leaving, setLeaving] = useState(false);
  if (!known) {
    return <NotFoundPage />;
  }
  if (result.status === 'ready') {
    return <OrderDetail key={result.data.order.id} detail={result.data} onLeaving={setLeaving} />;
  }
  if (result.status === 'loading' || leaving) {
    return <PageHeader title={t.back} back={{ to: paths.orders(), label: t.back }} />;
  }
  if (isNotFound(result.error)) {
    return <NotFoundPage />;
  }
  // Not a missing row: let the frame of the app say that something went wrong.
  throw asError(result.error);
}
