import {
  formatQuantity,
  formatSwissDate,
  IdSchema,
  lineValue,
  roundQuantity,
  sumRappen,
  type ArticleRef,
  type CountSheetLot,
  type Id,
  type LocalDate,
  type OperationOutput,
  type Rappen,
  type Unit,
} from '@randen/core';
import { ClipboardCheck, Plus, Printer, X } from 'lucide-react';
import { useCallback, useRef, useState, type KeyboardEvent } from 'react';
import { useSearchParams } from 'react-router';
import {
  errorText,
  useBusiness,
  useCommand,
  useMoney,
  useQuery,
  useQueryResult,
  useToday,
} from '../../app/hooks';
import { paths } from '../../app/paths';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { ChoiceChips } from '../../ui/ChoiceChips';
import { DateField } from '../../ui/DateField';
import { EmptyState } from '../../ui/EmptyState';
import { FormActions } from '../../ui/FormActions';
import { GroupedList, GroupedListItem } from '../../ui/GroupedList';
import { Notice } from '../../ui/Notice';
import { PageHeader } from '../../ui/PageHeader';
import { AreaPicker, ArticlePicker } from '../../ui/pickers';
import { QuantityField } from '../../ui/QuantityField';
import { Section } from '../../ui/Section';
import { Sheet } from '../../ui/Sheet';
import { TextArea } from '../../ui/TextField';
import { useToast } from '../../ui/Toast';
import { useEnterKeyHint, useFocusOn, useKept } from './hooks';
import { dateText } from './labels';
import { countDelta } from './math';
import { stockMessages } from './messages';

const t = stockMessages.count;

type CountSheet = OperationOutput<'stock.countSheet'>;

const ALL = 'all';
/** How many differences the question before finishing lists by name. */
const SHOWN_DIFFERENCES = 8;

const countId = (lotId: string) => `count-${lotId}`;

/** Goods that lie there but stand on no lot. */
interface FoundEntry {
  key: number;
  articleId: Id;
  name: string;
  unit: Unit;
  pricePer1000: number;
  areaId: Id;
  areaName: string;
  quantity: number;
  expiresOn: LocalDate | null;
}

interface Difference {
  key: string;
  text: string;
}

/** What tells two lots of one article apart: the date, and the number of the lot if it has one. */
function lotDetail(lot: CountSheetLot): string {
  const date =
    lot.expiresOn === undefined ? stockMessages.date.none : formatSwissDate(lot.expiresOn);
  return lot.lotCode === undefined ? date : `${date}, ${lot.lotCode}`;
}

/**
 * «Inventur»: count what is there, one area or the whole house. Every lot has a field for the
 * counted quantity; an empty field means not counted. «stimmt» fills in what was expected.
 * Before finishing, the page lists the differences; what is booked becomes corrections in the
 * journal. The empty count sheet can be printed to count with a pen.
 */
export function CountPage() {
  const [params, setParams] = useSearchParams();
  const today = useToday();
  const money = useMoney();
  const business = useBusiness();
  const run = useCommand();
  const toast = useToast();
  const form = useRef<HTMLFormElement>(null);
  const nextKey = useRef(0);
  const parsedArea = IdSchema.safeParse(params.get('area'));
  const areaId = parsedArea.success ? parsedArea.data : null;
  const areas = useQuery('lookup.areas', {})?.areas ?? [];
  const result = useQueryResult('stock.countSheet', areaId === null ? {} : { areaId });
  const sheet = useKept(result.data);

  /** Counts the finished stock takes of this visit: each one starts with empty fields. */
  const [round, setRound] = useState(0);
  const [countedOn, setCountedOn] = useState<LocalDate | null>(today);
  const [counted, setCounted] = useState<Readonly<Record<string, number | null>>>({});
  const [found, setFound] = useState<readonly FoundEntry[]>([]);
  const [note, setNote] = useState('');
  const [addingFound, setAddingFound] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);

  useEnterKeyHint(form, 'next');
  useFocusOn(
    focusId,
    useCallback(() => {
      setFocusId(null);
    }, []),
  );

  const lots = sheet?.areas.flatMap((group) => group.lots) ?? [];
  const lines = lots.flatMap((lot) => {
    const value = counted[lot.lotId];
    return value === undefined || value === null ? [] : [{ lot, counted: value }];
  });
  const lineDeltas = lines.map(({ lot, counted: value }) =>
    countDelta(lot.expected, value, lot.pricePer1000),
  );
  const foundValues = found.map((entry) => lineValue(entry.quantity, entry.pricePer1000));
  const totalDelta = sumRappen([...lineDeltas, ...foundValues]);
  const amount = (value: Rappen) => money.format(value);

  const differences: Difference[] = [
    ...lines.flatMap(({ lot, counted: value }, index) => {
      const delta = roundQuantity(value - lot.expected);
      return delta === 0
        ? []
        : [
            {
              key: lot.lotId,
              text: t.confirm.line(
                lot.articleName,
                formatQuantity(delta, lot.unit),
                amount(lineDeltas[index] ?? sumRappen([])),
              ),
            },
          ];
    }),
    ...found.map((entry, index) => ({
      key: `found-${entry.key}`,
      text: t.confirm.foundLine(
        entry.name,
        formatQuantity(entry.quantity, entry.unit),
        amount(foundValues[index] ?? sumRappen([])),
      ),
    })),
  ];

  function setArea(next: Id | null) {
    setParams(
      (current) => {
        const updated = new URLSearchParams(current);
        if (next === null) {
          updated.delete('area');
        } else {
          updated.set('area', next);
        }
        return updated;
      },
      { replace: true },
    );
  }

  /** Enter in a count field leads to the next lot, never to the end of the stock take. */
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
    const fieldId = event.target.id;
    const index = lots.findIndex((lot) => countId(lot.lotId) === fieldId);
    const next = index === -1 ? undefined : lots[index + 1];
    if (next !== undefined) {
      setFocusId(countId(next.lotId));
    }
  }

  function review() {
    if (lines.length === 0 && found.length === 0) {
      setError(t.nothingCounted);
      return;
    }
    if (countedOn === null) {
      return;
    }
    setError(null);
    setConfirming(true);
  }

  async function finish() {
    setConfirming(false);
    if (countedOn === null) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const booked = await run('stock.count', {
        countedOn,
        ...(areaId === null ? {} : { areaId }),
        ...(note.trim() === '' ? {} : { note: note.trim() }),
        lines: lines.map(({ lot, counted: value }) => ({ lotId: lot.lotId, counted: value })),
        found: found.map((entry) => ({
          articleId: entry.articleId,
          areaId: entry.areaId,
          quantity: entry.quantity,
          ...(entry.expiresOn === null ? {} : { expiresOn: entry.expiresOn }),
        })),
      });
      const text = t.done(amount(booked.valueDeltaRappen));
      toast({ text, tone: 'ok' });
      setDone(text);
      setCounted({});
      setFound([]);
      setNote('');
      setRound((current) => current + 1);
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="print:hidden">
        <PageHeader
          title={t.title}
          subtitle={t.subtitle}
          back={{ to: paths.stock(), label: stockMessages.back }}
          actions={
            <Button
              variant="secondary"
              icon={Printer}
              onClick={() => {
                window.print();
              }}
            >
              {t.print}
            </Button>
          }
        />
        <form
          ref={form}
          onKeyDown={onKeyDown}
          onSubmit={(event) => {
            event.preventDefault();
            review();
          }}
          className="space-y-6"
        >
          {done !== null && lines.length === 0 && found.length === 0 ? (
            <Notice variant="row" tone="ok">
              {done}
            </Notice>
          ) : null}
          <div className="space-y-4 md:flex md:items-start md:gap-6 md:space-y-0">
            {areas.length > 1 ? (
              <ChoiceChips
                legend={t.area}
                options={[
                  { value: ALL, label: t.allAreas },
                  ...areas.map((area) => ({ value: area.id, label: area.name })),
                ]}
                value={areaId ?? ALL}
                onChange={(value) => {
                  setArea(areas.find((area) => area.id === value)?.id ?? null);
                }}
                className="md:flex-1"
              />
            ) : null}
            <DateField
              label={t.date}
              value={countedOn}
              onChange={setCountedOn}
              max={today}
              required
              className="md:w-64 md:shrink-0"
            />
          </div>

          {result.status === 'error' ? (
            <p role="alert" className="text-danger">
              {errorText(result.error)}
            </p>
          ) : sheet === undefined ? null : sheet.lotCount === 0 ? (
            <EmptyState icon={ClipboardCheck} title={t.emptyTitle} text={t.emptyText} />
          ) : (
            sheet.areas.map((group) => (
              <Section key={group.area.id} title={group.area.name} titleStyle="group">
                <GroupedList>
                  {group.lots.map((lot) => (
                    <CountRow
                      key={`${lot.lotId}-${round}`}
                      lot={lot}
                      counted={counted[lot.lotId] ?? null}
                      onCount={(value) => {
                        setCounted((current) => ({ ...current, [lot.lotId]: value }));
                        setError(null);
                      }}
                    />
                  ))}
                </GroupedList>
              </Section>
            ))
          )}

          <Section title={t.found.title} titleStyle="group" hint={t.found.hint}>
            <div className="space-y-3">
              {found.length === 0 ? null : (
                <GroupedList label={t.found.listLabel}>
                  {found.map((entry) => (
                    <GroupedListItem key={entry.key} inset="text">
                      <div className="flex items-center justify-between gap-3 py-2 pr-2 pl-4">
                        <div className="min-w-0">
                          <p className="font-semibold break-words">{entry.name}</p>
                          <p className="text-sm text-ink-muted tabular-nums">
                            {t.found.row(
                              formatQuantity(entry.quantity, entry.unit),
                              entry.areaName,
                            )}
                            {entry.expiresOn === null
                              ? ''
                              : ` · ${formatSwissDate(entry.expiresOn)}`}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={X}
                          aria-label={t.found.removeOf(entry.name)}
                          onClick={() => {
                            setFound((current) => current.filter((each) => each.key !== entry.key));
                          }}
                        >
                          {t.found.remove}
                        </Button>
                      </div>
                    </GroupedListItem>
                  ))}
                </GroupedList>
              )}
              <Button
                variant="secondary"
                icon={Plus}
                onClick={() => {
                  setAddingFound(true);
                }}
              >
                {t.found.add}
              </Button>
            </div>
          </Section>

          <Card>
            <TextArea
              label={t.note}
              optional
              rows={2}
              maxLength={500}
              value={note}
              onChange={setNote}
            />
          </Card>

          <FormActions
            primaryLabel={t.submit}
            primaryDisabled={busy}
            summary={
              found.length === 0
                ? t.summary(lines.length, lots.length, amount(totalDelta))
                : t.summaryFound(lines.length, lots.length, found.length, amount(totalDelta))
            }
            error={error}
          />
        </form>
      </div>

      {sheet === undefined ? null : (
        <PrintSheet
          sheet={sheet}
          meta={t.sheet.meta(business.name, formatSwissDate(countedOn ?? today))}
        />
      )}

      <Sheet
        open={addingFound}
        onClose={() => {
          setAddingFound(false);
        }}
        title={t.found.sheetTitle}
      >
        <FoundForm
          defaultAreaId={areaId}
          onClose={() => {
            setAddingFound(false);
          }}
          onAdd={(entry) => {
            const key = nextKey.current;
            nextKey.current += 1;
            setFound((current) => [...current, { ...entry, key }]);
            setAddingFound(false);
            setError(null);
          }}
        />
      </Sheet>

      <Sheet
        open={confirming}
        onClose={() => {
          setConfirming(false);
        }}
        title={t.confirm.title}
        role="alertdialog"
        hideClose
        footer={
          <div className="flex flex-col-reverse gap-2 md:flex-row md:justify-end">
            <Button
              variant="secondary"
              data-autofocus=""
              onClick={() => {
                setConfirming(false);
              }}
            >
              {stockMessages.sheets.cancel}
            </Button>
            <Button
              onClick={() => {
                void finish();
              }}
            >
              {t.confirm.action}
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <p>{t.confirm.counted(lines.length + found.length, lots.length - lines.length)}</p>
          {differences.length === 0 ? (
            <p className="text-ink-muted">{t.confirm.none}</p>
          ) : (
            <div>
              <p className="text-sm font-semibold text-ink-muted">{t.confirm.differences}</p>
              <ul className="mt-1 space-y-1 tabular-nums">
                {differences.slice(0, SHOWN_DIFFERENCES).map((difference) => (
                  <li key={difference.key}>{difference.text}</li>
                ))}
                {differences.length > SHOWN_DIFFERENCES ? (
                  <li className="text-ink-muted">
                    {t.confirm.more(differences.length - SHOWN_DIFFERENCES)}
                  </li>
                ) : null}
              </ul>
            </div>
          )}
          <p className="font-semibold tabular-nums">{t.confirm.total(amount(totalDelta))}</p>
        </div>
      </Sheet>
    </>
  );
}

/** One lot on the count list: what is expected, the field for what was counted, and «stimmt». */
function CountRow({
  lot,
  counted,
  onCount,
}: {
  lot: CountSheetLot;
  counted: number | null;
  onCount: (value: number | null) => void;
}) {
  const money = useMoney();
  const detail = lotDetail(lot);
  const delta = counted === null ? null : roundQuantity(counted - lot.expected);
  return (
    <GroupedListItem inset="text">
      <div className="px-4 py-3 md:flex md:items-center md:justify-between md:gap-4">
        <div className="min-w-0">
          <p className="font-semibold break-words hyphens-calm">{lot.articleName}</p>
          <p className="text-sm text-ink-muted tabular-nums">
            {[
              t.expected(formatQuantity(lot.expected, lot.unit)),
              dateText(lot.expiresOn, lot.dateKind),
              lot.spotName ?? '',
              lot.lotCode === undefined ? '' : stockMessages.article.lots.code(lot.lotCode),
            ]
              .filter((part) => part !== '')
              .join(' · ')}
          </p>
          {delta === null ? null : (
            <p
              className={`text-sm font-semibold tabular-nums ${delta === 0 ? 'text-ok' : 'text-soon'}`}
            >
              {delta === 0
                ? t.noDifference
                : t.difference(
                    formatQuantity(delta, lot.unit),
                    money.format(countDelta(lot.expected, counted ?? 0, lot.pricePer1000)),
                  )}
            </p>
          )}
        </div>
        <div className="mt-2 flex items-start gap-2 md:mt-0 md:w-[22rem] md:shrink-0">
          <QuantityField
            id={countId(lot.lotId)}
            label={t.countedOf(lot.articleName, detail)}
            hideLabel
            unit={lot.unit}
            value={counted}
            onChange={onCount}
            placeholder={t.counted}
            className="flex-1"
          />
          <Button
            variant="secondary"
            aria-label={t.matchesOf(lot.articleName, detail)}
            onClick={() => {
              onCount(lot.expected);
            }}
            className="shrink-0"
          >
            {t.matches}
          </Button>
        </div>
      </div>
    </GroupedListItem>
  );
}

/** The form for goods that stand on no lot: which article, where, how much. */
function FoundForm({
  defaultAreaId,
  onAdd,
  onClose,
}: {
  defaultAreaId: Id | null;
  onAdd: (entry: Omit<FoundEntry, 'key'>) => void;
  onClose: () => void;
}) {
  const areas = useQuery('lookup.areas', {})?.areas ?? [];
  const form = useRef<HTMLFormElement>(null);
  const [article, setArticle] = useState<ArticleRef | null>(null);
  const [areaId, setAreaId] = useState<Id | null>(defaultAreaId);
  const [quantity, setQuantity] = useState<number | null>(null);
  const [expiresOn, setExpiresOn] = useState<LocalDate | null>(null);
  useEnterKeyHint(form, 'done');

  function submit() {
    const area = areas.find((each) => each.id === areaId);
    if (article === null || area === undefined || quantity === null) {
      return;
    }
    onAdd({
      articleId: article.id,
      name: article.name,
      unit: article.unit,
      pricePer1000: article.pricePer1000,
      areaId: area.id,
      areaName: area.name,
      quantity,
      expiresOn,
    });
  }

  return (
    <form
      ref={form}
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className="space-y-4"
    >
      <ArticlePicker
        label={t.found.article}
        required
        value={article?.id ?? null}
        onChange={(_id, next) => {
          setArticle(next);
          // The usual area of the article, unless one area is being counted.
          if (areaId === null && next?.areaId !== undefined) {
            setAreaId(next.areaId);
          }
        }}
      />
      <AreaPicker label={t.found.area} required value={areaId} onChange={setAreaId} />
      {article === null ? null : (
        <>
          <QuantityField
            label={t.found.quantity}
            unit={article.unit}
            value={quantity}
            onChange={setQuantity}
            positive
            required
          />
          <DateField label={t.found.date} optional value={expiresOn} onChange={setExpiresOn} />
        </>
      )}
      <FormActions
        placement="inline"
        primaryLabel={t.found.confirm}
        secondaryLabel={stockMessages.sheets.cancel}
        onSecondary={onClose}
      />
    </form>
  );
}

/** The empty count sheet for the printer: black on white, with room to write. */
function PrintSheet({ sheet, meta }: { sheet: CountSheet; meta: string }) {
  const cell = 'border border-black px-2 py-1.5 text-left align-top';
  return (
    <div className="hidden text-sm text-black print:block">
      <p className="text-2xl font-semibold">{t.sheet.title}</p>
      <p className="mb-4">{meta}</p>
      {sheet.areas.map((group) => (
        <table key={group.area.id} className="mb-6 w-full table-fixed border-collapse">
          <caption className="mb-1 text-left text-base font-semibold">{group.area.name}</caption>
          <thead>
            <tr>
              {/* The same shares in every table: the areas stand under each other. */}
              <th scope="col" className={`${cell} w-[32%]`}>
                {t.sheet.article}
              </th>
              <th scope="col" className={`${cell} w-[20%]`}>
                {t.sheet.date}
              </th>
              <th scope="col" className={`${cell} w-[20%]`}>
                {t.sheet.spot}
              </th>
              <th scope="col" className={`${cell} w-[12%] text-right`}>
                {t.sheet.expected}
              </th>
              <th scope="col" className={cell}>
                {t.sheet.counted}
              </th>
            </tr>
          </thead>
          <tbody>
            {group.lots.map((lot) => (
              <tr key={lot.lotId}>
                <th scope="row" className={`${cell} font-normal`}>
                  {lot.articleName}
                </th>
                <td className={cell}>{lotDetail(lot)}</td>
                <td className={cell}>{lot.spotName ?? ''}</td>
                <td className={`${cell} text-right tabular-nums`}>
                  {formatQuantity(lot.expected, lot.unit)}
                </td>
                <td className={cell} />
              </tr>
            ))}
          </tbody>
        </table>
      ))}
      <p className="mt-8">{t.sheet.signature}: ______________________________</p>
    </div>
  );
}
