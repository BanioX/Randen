import {
  addDays,
  formatQuantity,
  formatUnitPrice,
  IdSchema,
  rappen,
  roundQuantity,
  sumRappen,
  unitPriceFromTotal,
  type Id,
  type LocalDate,
  type OperationOutput,
  type Photo,
  type PurchaseArticle,
  type Rappen,
  type ReceiptAmountKind,
} from '@randen/core';
import { Plus, X } from 'lucide-react';
import { useRef, useState } from 'react';
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
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { Checkbox } from '../../ui/Checkbox';
import { ChoiceChips } from '../../ui/ChoiceChips';
import { DateField } from '../../ui/DateField';
import { FormActions } from '../../ui/FormActions';
import { MoneyField } from '../../ui/MoneyField';
import { Notice } from '../../ui/Notice';
import { NumberField } from '../../ui/NumberField';
import { PageHeader } from '../../ui/PageHeader';
import { PhotoField } from '../../ui/PhotoField';
import { AreaPicker } from '../../ui/pickers';
import { QuantityField } from '../../ui/QuantityField';
import { Section } from '../../ui/Section';
import { SelectField } from '../../ui/SelectField';
import { TemperatureField } from '../../ui/TemperatureField';
import { TextArea, TextField } from '../../ui/TextField';
import { useToast } from '../../ui/Toast';
import { ArticleAdder } from './ArticleAdder';
import { purchasingLinks } from './links';
import { purchasingMessages } from './messages';

const t = purchasingMessages.record;

type Draft = OperationOutput<'shopping.draft'>;

/** One line of the purchase while it is typed. */
export interface PurchaseDraftLine {
  key: number;
  /** The line of the shopping list it settles. */
  lineId?: Id | undefined;
  articleId: Id;
  /** Typed as a quantity with its amount, or as packs with a price per pack. */
  mode: 'quantity' | 'packs';
  quantity: number | null;
  amount: Rappen | null;
  packs: number | null;
  perPack: number | null;
  unitSize: number | null;
  packPrice: Rappen | null;
  promo: boolean;
  expiresOn: LocalDate | null;
  areaId: Id | null;
}

interface AmountRow {
  key: number;
  lineId?: Id | undefined;
  kind: ReceiptAmountKind;
  /** Typed without a sign; the kind says whether it adds to the receipt or takes off. */
  amount: Rappen | null;
  note: string;
}

/** Deposit returned and a discount take off the receipt; the rest adds to it. */
const SIGN: Record<ReceiptAmountKind, 1 | -1> = {
  deposit: 1,
  deposit_return: -1,
  discount: -1,
  private: 1,
  not_stocked: 1,
};

const KINDS: readonly ReceiptAmountKind[] = [
  'deposit',
  'deposit_return',
  'discount',
  'private',
  'not_stocked',
];

/** The quantity of a line in base units: as typed, or packs × units × content. */
export function lineQuantity(line: PurchaseDraftLine): number | null {
  if (line.mode === 'quantity') {
    return line.quantity;
  }
  if (line.packs === null || line.unitSize === null) {
    return null;
  }
  return roundQuantity(line.packs * (line.perPack ?? 1) * line.unitSize);
}

/** The amount of a line as on the receipt: as typed, or packs × price per pack. */
export function lineAmount(line: PurchaseDraftLine): Rappen | null {
  if (line.mode === 'quantity') {
    return line.amount;
  }
  if (line.packs === null || line.packPrice === null) {
    return null;
  }
  return rappen(line.packs * line.packPrice);
}

function newLine(
  key: number,
  article: PurchaseArticle,
  receivedOn: LocalDate | null,
  from?: { lineId: Id | undefined; quantity: number | undefined; packs: number | undefined },
): PurchaseDraftLine {
  const packs = from?.packs !== undefined && article.packSize !== undefined;
  return {
    key,
    lineId: from?.lineId,
    articleId: article.articleId,
    mode: packs ? 'packs' : 'quantity',
    quantity: packs ? null : (from?.quantity ?? null),
    amount: null,
    packs: packs ? (from.packs ?? null) : null,
    perPack: 1,
    unitSize: article.packSize ?? null,
    packPrice: null,
    promo: false,
    // The date is asked only for goods with a use-by date (ADR-0015).
    expiresOn:
      article.dateKind === 'use_by' && receivedOn !== null && article.shelfLifeDays !== undefined
        ? addDays(receivedOn, article.shelfLifeDays)
        : null,
    areaId: article.areaId ?? null,
  };
}

interface LineProps {
  index: number;
  line: PurchaseDraftLine;
  article: PurchaseArticle;
  onChange: (patch: Partial<PurchaseDraftLine>) => void;
  onRemove: () => void;
}

/** One article of the purchase: how much, what it cost on the receipt, offer, date, area. */
function RecordLine({ index, line, article, onChange, onRemove }: LineProps) {
  const money = useMoney();
  const l = t.lines;
  const quantity = lineQuantity(line);
  const amount = lineAmount(line);
  const price = (per1000: number) => formatUnitPrice(per1000, article.unit, money.currency);
  const derived =
    quantity === null || quantity <= 0 || amount === null
      ? undefined
      : price(unitPriceFromTotal(amount, quantity));
  const last = article.pricePer1000 > 0 ? l.last(price(article.pricePer1000)) : undefined;

  return (
    <Card padding="compact" className="py-4">
      <fieldset className="relative min-w-0">
        <legend className="sr-only">{l.line(index + 1, article.name)}</legend>
        <div className="mb-3 flex items-start justify-between gap-3">
          <p aria-hidden="true" className="min-w-0 text-lg font-semibold break-words hyphens-calm">
            {article.name}
          </p>
          <Button
            variant="ghost"
            size="sm"
            icon={X}
            aria-label={l.removeOf(article.name)}
            onClick={onRemove}
            className="-mr-2 shrink-0"
          >
            {l.remove}
          </Button>
        </div>
        <ChoiceChips
          legend={l.mode}
          hideLegend
          segmented
          options={[
            { value: 'quantity', label: l.modes.quantity },
            { value: 'packs', label: l.modes.packs },
          ]}
          value={line.mode}
          onChange={(mode) => {
            onChange({ mode });
          }}
          className="mb-4"
        />
        {line.mode === 'quantity' ? (
          <div className="grid gap-4 md:grid-cols-2">
            <QuantityField
              label={l.quantity}
              unit={article.unit}
              value={line.quantity}
              onChange={(next) => {
                onChange({ quantity: next });
              }}
              positive
              required
            />
            <MoneyField
              label={l.amount}
              value={line.amount}
              onChange={(next) => {
                onChange({ amount: next });
              }}
              hint={derived === undefined ? (last ?? l.amountHint) : l.perUnit(derived)}
              required
            />
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <NumberField
              label={l.packs}
              min={1}
              max={10_000}
              value={line.packs}
              onChange={(next) => {
                onChange({ packs: next });
              }}
              required
            />
            <NumberField
              label={l.perPack}
              min={1}
              max={10_000}
              value={line.perPack}
              onChange={(next) => {
                onChange({ perPack: next });
              }}
              required
            />
            <QuantityField
              label={l.unitSize}
              unit={article.unit}
              value={line.unitSize}
              onChange={(next) => {
                onChange({ unitSize: next });
              }}
              positive
              required
            />
            <MoneyField
              label={l.packPrice}
              value={line.packPrice}
              onChange={(next) => {
                onChange({ packPrice: next });
              }}
              hint={last}
              required
            />
            {quantity === null || line.packs === null || line.unitSize === null ? null : (
              <p className="text-sm text-ink-muted tabular-nums md:col-span-2 lg:col-span-4">
                {l.packsText(
                  line.packs,
                  line.perPack ?? 1,
                  formatQuantity(line.unitSize, article.unit),
                  formatQuantity(quantity, article.unit),
                )}
                {amount === null || derived === undefined
                  ? null
                  : ` · ${l.derived(money.format(amount), derived)}`}
              </p>
            )}
          </div>
        )}
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {article.dateKind === 'use_by' ? (
            <DateField
              label={l.expires}
              value={line.expiresOn}
              onChange={(expiresOn) => {
                onChange({ expiresOn });
              }}
              hint={
                article.shelfLifeDays === undefined
                  ? undefined
                  : l.expiresHint(article.shelfLifeDays)
              }
            />
          ) : null}
          <AreaPicker
            label={l.area}
            value={line.areaId}
            onChange={(areaId) => {
              onChange({ areaId });
            }}
            required
          />
          <Checkbox
            label={l.promo}
            description={l.promoText}
            checked={line.promo}
            onChange={(promo) => {
              onChange({ promo });
            }}
          />
        </div>
      </fieldset>
    </Card>
  );
}

function RecordForm({ draft, onBooked }: { draft: Draft; onBooked: (marketId?: Id) => void }) {
  const today = useToday();
  const money = useMoney();
  const run = useCommand();
  const toast = useToast();
  const articles = new Map(draft.articles.map((article) => [article.articleId, article]));
  const nextKey = useRef(draft.lines.length + draft.freeText.length);

  const [marketId, setMarketId] = useState<Id | null>(draft.market?.id ?? null);
  const [receivedOn, setReceivedOn] = useState<LocalDate | null>(today);
  const [documentNumber, setDocumentNumber] = useState('');
  const [documentTotal, setDocumentTotal] = useState<Rappen | null>(null);
  const [lines, setLines] = useState<PurchaseDraftLine[]>(() =>
    draft.lines.flatMap((line, index) => {
      const article = articles.get(line.articleId);
      return article === undefined
        ? []
        : [
            newLine(index, article, today, {
              lineId: line.lineId,
              quantity: line.quantity,
              packs: line.packs?.count,
            }),
          ];
    }),
  );
  const [amounts, setAmounts] = useState<AmountRow[]>(() =>
    draft.freeText.map((line, index) => ({
      key: draft.lines.length + index,
      lineId: line.lineId,
      kind: 'not_stocked',
      amount: null,
      note: line.text,
    })),
  );
  const [temperature, setTemperature] = useState<number | null>(null);
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const shown = lines.flatMap((line) => {
    const article = articles.get(line.articleId);
    return article === undefined ? [] : [{ line, article }];
  });
  const linesTotal = sumRappen(shown.map(({ line }) => lineAmount(line) ?? rappen(0)));
  const othersTotal = sumRappen(amounts.map((row) => rappen((row.amount ?? 0) * SIGN[row.kind])));
  const unassigned =
    documentTotal === null ? null : rappen(documentTotal - linesTotal - othersTotal);
  const market = draft.markets.find((each) => each.id === marketId);

  const key = () => {
    nextKey.current += 1;
    return nextKey.current;
  };

  function patchLine(lineKey: number, patch: Partial<PurchaseDraftLine>) {
    setLines((current) =>
      current.map((line) => (line.key === lineKey ? { ...line, ...patch } : line)),
    );
  }

  function patchAmount(rowKey: number, patch: Partial<AmountRow>) {
    setAmounts((current) =>
      current.map((row) => (row.key === rowKey ? { ...row, ...patch } : row)),
    );
  }

  async function submit() {
    if (shown.length === 0) {
      setError(t.needLine);
      return;
    }
    if (receivedOn === null) {
      return;
    }
    const commandLines = shown.flatMap(({ line }) => {
      const quantity = lineQuantity(line);
      const amount = lineAmount(line);
      return quantity === null || quantity <= 0 || amount === null || line.areaId === null
        ? []
        : [
            {
              articleId: line.articleId,
              quantity,
              lineTotalRappen: amount,
              ...(line.mode === 'packs' && line.packs !== null ? { packs: line.packs } : {}),
              ...(line.promo ? { promo: true } : {}),
              ...(line.expiresOn === null ? {} : { expiresOn: line.expiresOn }),
              areaId: line.areaId,
            },
          ];
    });
    if (commandLines.length !== shown.length) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await run('shopping.record', {
        ...(marketId === null ? {} : { supplierId: marketId }),
        receivedOn,
        ...(documentNumber.trim() === '' ? {} : { documentNumber: documentNumber.trim() }),
        ...(documentTotal === null ? {} : { documentTotalRappen: documentTotal }),
        otherAmounts: amounts.flatMap((row) =>
          row.amount === null || row.amount <= 0
            ? []
            : [
                {
                  kind: row.kind,
                  amountRappen: rappen(row.amount * SIGN[row.kind]),
                  ...(row.note.trim() === '' ? {} : { note: row.note.trim().slice(0, 120) }),
                },
              ],
        ),
        lines: commandLines,
        ...(temperature === null ? {} : { tempDeciC: temperature }),
        ...(photo === null ? {} : { photo }),
        ...(note.trim() === '' ? {} : { note: note.trim() }),
        shoppingLineIds: [
          ...shown.flatMap(({ line }) => (line.lineId === undefined ? [] : [line.lineId])),
          ...amounts.flatMap((row) => (row.lineId === undefined ? [] : [row.lineId])),
        ],
      });
      toast({
        text: t.done(result.lotIds.length, money.format(result.totalRappen)),
        tone: 'ok',
      });
      onBooked(marketId ?? undefined);
    } catch (failure) {
      setError(errorText(failure));
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      className="space-y-6"
    >
      <Section title={t.head.title}>
        <Card>
          <div className="grid gap-4 md:grid-cols-2">
            {draft.markets.length === 0 ? null : (
              <SelectField
                label={t.head.market}
                optional
                placeholder={t.head.noMarket}
                options={draft.markets.map((each) => ({ value: each.id, label: each.name }))}
                value={marketId}
                onChange={(next) => {
                  setMarketId(draft.markets.find((each) => each.id === next)?.id ?? null);
                }}
                hint={
                  market?.customerNumber === undefined
                    ? undefined
                    : t.head.customerCard(market.customerNumber)
                }
              />
            )}
            <DateField
              label={t.head.date}
              value={receivedOn}
              onChange={setReceivedOn}
              max={today}
              required
            />
            <TextField
              label={t.head.document}
              optional
              maxLength={40}
              value={documentNumber}
              onChange={setDocumentNumber}
            />
            <MoneyField
              label={t.head.total}
              optional
              hint={t.head.totalHint}
              value={documentTotal}
              onChange={setDocumentTotal}
            />
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
            shown.map(({ line, article }, index) => (
              <RecordLine
                key={line.key}
                index={index}
                line={line}
                article={article}
                onChange={(patch) => {
                  patchLine(line.key, patch);
                }}
                onRemove={() => {
                  setLines((current) => current.filter((each) => each.key !== line.key));
                }}
              />
            ))
          )}
          <Card padding="compact" className="py-4">
            <ArticleAdder
              label={t.lines.add}
              hint={t.lines.addHint}
              onAdd={(articleId) => {
                const article = articles.get(articleId);
                if (article !== undefined) {
                  setLines((current) => [...current, newLine(key(), article, receivedOn)]);
                  setError(null);
                }
              }}
            />
          </Card>
        </div>
      </Section>

      <Section title={t.amounts.title} hint={t.amounts.hint}>
        <div className="space-y-3">
          {amounts.map((row, index) => (
            <Card key={row.key} padding="compact" className="py-4">
              <fieldset className="relative min-w-0">
                <legend className="sr-only">{t.amounts.row(index + 1)}</legend>
                <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.5fr)_auto] md:items-start">
                  <SelectField
                    label={t.amounts.kind}
                    required
                    options={KINDS.map((kind) => ({ value: kind, label: t.amounts.kinds[kind] }))}
                    value={row.kind}
                    onChange={(kind) => {
                      if (kind !== null) {
                        patchAmount(row.key, { kind });
                      }
                    }}
                  />
                  <MoneyField
                    label={t.amounts.amount}
                    value={row.amount}
                    onChange={(amount) => {
                      patchAmount(row.key, { amount });
                    }}
                  />
                  <TextField
                    label={t.amounts.note}
                    optional
                    maxLength={120}
                    value={row.note}
                    onChange={(next) => {
                      patchAmount(row.key, { note: next });
                    }}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={X}
                    aria-label={t.amounts.removeOf(index + 1)}
                    onClick={() => {
                      setAmounts((current) => current.filter((each) => each.key !== row.key));
                    }}
                    className="md:mt-7"
                  >
                    {t.lines.remove}
                  </Button>
                </div>
              </fieldset>
            </Card>
          ))}
          <Button
            variant="secondary"
            size="sm"
            icon={Plus}
            onClick={() => {
              setAmounts((current) => [
                ...current,
                { key: key(), kind: 'deposit', amount: null, note: '' },
              ]);
            }}
          >
            {t.amounts.add}
          </Button>
        </div>
      </Section>

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
            <PhotoField
              label={t.check.photo}
              hint={t.check.photoHint}
              value={photo}
              onChange={setPhoto}
            />
            <TextArea
              label={t.check.note}
              optional
              rows={2}
              maxLength={500}
              value={note}
              onChange={setNote}
              className="md:col-span-2"
            />
          </div>
        </Card>
      </Section>

      {unassigned === null ? null : unassigned === 0 ? (
        <Notice variant="row" tone="ok">
          {t.addsUp}
        </Notice>
      ) : (
        <Notice variant="row" tone="soon">
          {unassigned > 0
            ? t.unassigned(money.format(unassigned))
            : t.overassigned(money.format(rappen(0 - unassigned)))}
        </Notice>
      )}

      <FormActions
        primaryLabel={t.submit}
        primaryDisabled={busy}
        summary={shown.length === 0 ? undefined : t.summary(shown.length, money.format(linesTotal))}
        error={error}
      />
    </form>
  );
}

/**
 * «Einkauf erfassen» (ADR-0015): a purchase at a market is a goods receipt with the market as
 * supplier and the receipt number. The lines come from the ticked shopping list; the receipt
 * has to add up with its total, deposit and private amounts, which never reach the cost of goods.
 */
export function RecordPurchasePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const marketParam = params.get('market');
  const parsed = IdSchema.safeParse(marketParam);
  const marketId = parsed.success ? parsed.data : undefined;
  const result = useQueryResult('shopping.draft', marketId === undefined ? {} : { marketId });

  if (
    (marketParam !== null && marketId === undefined) ||
    (result.status === 'error' && isNotFound(result.error))
  ) {
    return <NotFoundPage text={t.notFound} />;
  }

  return (
    <>
      <PageHeader
        title={t.title}
        subtitle={t.subtitle}
        back={{ to: purchasingLinks.purchasing(marketId), label: purchasingMessages.back }}
      />
      {result.status === 'error' ? (
        <p role="alert" className="text-danger">
          {errorText(result.error)}
        </p>
      ) : null}
      {result.data === undefined ? null : (
        <RecordForm
          draft={result.data}
          onBooked={(booked) => {
            void navigate(purchasingLinks.purchasing(booked), { replace: true });
          }}
        />
      )}
    </>
  );
}
