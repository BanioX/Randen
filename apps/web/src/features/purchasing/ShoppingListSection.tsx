import {
  articleCategoryLabel,
  formatQuantity,
  formatUnitPrice,
  type Id,
  type ShoppingItem,
} from '@randen/core';
import { Check, ListPlus, ShoppingBasket, X } from 'lucide-react';
import { useId, useState } from 'react';
import { errorText, useCommand, useMoney, useQuery } from '../../app/hooks';
import { Button } from '../../ui/Button';
import { ChoiceChips } from '../../ui/ChoiceChips';
import { EmptyState } from '../../ui/EmptyState';
import { FormActions } from '../../ui/FormActions';
import { GroupedList, GroupedListItem } from '../../ui/GroupedList';
import { ArticlePicker } from '../../ui/pickers';
import { QuantityField } from '../../ui/QuantityField';
import { Section } from '../../ui/Section';
import { Sheet } from '../../ui/Sheet';
import { TextField } from '../../ui/TextField';
import { useToast } from '../../ui/Toast';
import { purchasingMessages } from './messages';
import { quantityLabel, ReasonChips, shortDate } from './shared';

const t = purchasingMessages.shopping;
const ALL = 'all';

/** One line of the list: a large tick, what and how much, why, and the last price paid. */
function ShoppingRow({ item }: { item: ShoppingItem }) {
  const money = useMoney();
  const run = useCommand();
  const toast = useToast();
  const id = useId();
  const [busy, setBusy] = useState(false);
  const details = [
    ...(item.quantity === undefined || item.unit === undefined
      ? []
      : [quantityLabel(item.quantity, item.unit, item.packs)]),
    ...(item.stock === undefined || item.unit === undefined
      ? []
      : [
          t.stockLine(
            formatQuantity(item.stock, item.unit),
            item.minStock === undefined ? undefined : formatQuantity(item.minStock, item.unit),
          ),
        ]),
  ].join(' · ');
  const last = item.lastPrices[0];

  function toggle(checked: boolean) {
    setBusy(true);
    const input =
      item.lineId === undefined
        ? {
            articleId: item.articleId,
            ...(item.quantity === undefined ? {} : { quantity: item.quantity }),
            ...(item.supplierId === undefined ? {} : { supplierId: item.supplierId }),
            checked,
          }
        : { lineId: item.lineId, checked };
    run('shopping.check', input)
      .catch((error: unknown) => {
        toast({ text: errorText(error), tone: 'danger' });
      })
      .finally(() => {
        setBusy(false);
      });
  }

  function remove() {
    if (item.lineId === undefined) {
      return;
    }
    run('shopping.remove', { lineId: item.lineId })
      .then(() => {
        toast({ text: t.removed(item.name) });
      })
      .catch((error: unknown) => {
        toast({ text: errorText(error), tone: 'danger' });
      });
  }

  return (
    <GroupedListItem inset="check">
      <div className="flex min-h-14 items-start gap-3 py-2.5 pr-2 pl-4">
        <span className="relative mt-0.5 flex size-6 shrink-0 items-center justify-center">
          <input
            id={id}
            type="checkbox"
            checked={item.checked}
            disabled={busy}
            aria-describedby={`${id}-details`}
            onChange={(event) => {
              toggle(event.target.checked);
            }}
            className="peer absolute -inset-2.5 z-10 cursor-pointer opacity-0"
          />
          <span
            aria-hidden="true"
            className={`flex size-6 items-center justify-center rounded-md border-2 text-white transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-wine-600 ${
              item.checked ? 'border-wine-700 bg-wine-700' : 'border-line-strong bg-surface'
            }`}
          >
            {item.checked ? <Check size={16} strokeWidth={3} /> : null}
          </span>
        </span>
        <div className="min-w-0 flex-1">
          <label
            htmlFor={id}
            className={`block cursor-pointer font-semibold break-words hyphens-calm ${
              item.checked ? 'text-ink-muted line-through' : ''
            }`}
          >
            {item.name}
          </label>
          <div id={`${id}-details`} className="text-sm text-ink-muted">
            {details === '' ? null : <p className="tabular-nums">{details}</p>}
            {last === undefined || item.unit === undefined ? null : (
              <p>
                {t.lastPrice(
                  formatUnitPrice(last.pricePer1000, item.unit, money.currency),
                  last.supplierName,
                  shortDate(last.on),
                )}
              </p>
            )}
            {item.reasons.length === 0 ? null : (
              <p className="mt-1 flex flex-wrap gap-1.5">
                <ReasonChips reasons={item.reasons} />
              </p>
            )}
          </div>
        </div>
        {item.removable ? (
          <Button
            variant="ghost"
            size="sm"
            icon={X}
            aria-label={t.removeOf(item.name)}
            onClick={remove}
            className="shrink-0"
          >
            <span className="sr-only md:not-sr-only">{t.remove}</span>
          </Button>
        ) : null}
      </div>
    </GroupedListItem>
  );
}

/** «Zeile hinzufügen»: an article with a quantity, or free text such as «Servietten». */
function AddSheet({
  open,
  onClose,
  marketId,
  startWithText,
}: {
  open: boolean;
  onClose: () => void;
  marketId: Id | undefined;
  /** Opened from the address (`?add=1`): free text first, the way the cockpit adds a note. */
  startWithText: boolean;
}) {
  const run = useCommand();
  const toast = useToast();
  const [mode, setMode] = useState<'article' | 'text'>(startWithText ? 'text' : 'article');
  const [articleId, setArticleId] = useState<Id | null>(null);
  const [unit, setUnit] = useState<'g' | 'ml' | 'pcs'>('g');
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState<number | null>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function reset() {
    setArticleId(null);
    setQuantity(null);
    setText('');
    setError(null);
    setBusy(false);
  }

  async function submit() {
    const input =
      mode === 'article'
        ? articleId === null
          ? null
          : { articleId, ...(quantity === null || quantity <= 0 ? {} : { quantity }) }
        : text.trim() === ''
          ? null
          : { text: text.trim() };
    if (input === null) {
      setError(mode === 'article' ? t.needArticle : null);
      return;
    }
    setBusy(true);
    try {
      const result = await run('shopping.add', {
        ...input,
        ...(marketId === undefined ? {} : { supplierId: marketId }),
      });
      const label = mode === 'article' ? name : text.trim();
      toast({ text: result.merged ? t.already(label) : t.added(label) });
      reset();
      onClose();
    } catch (failure) {
      setError(errorText(failure));
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title={t.addTitle}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
        className="space-y-4"
      >
        <ChoiceChips
          legend={t.mode}
          hideLegend
          segmented
          options={[
            { value: 'article', label: t.modes.article },
            { value: 'text', label: t.modes.text },
          ]}
          value={mode}
          onChange={(next) => {
            setMode(next);
            setError(null);
          }}
        />
        {mode === 'article' ? (
          <>
            <ArticlePicker
              data-autofocus
              value={articleId}
              onChange={(id, article) => {
                setArticleId(id);
                setError(null);
                if (article !== null) {
                  setUnit(article.unit);
                  setName(article.name);
                }
              }}
              filter={(article) => article.kind === 'purchased'}
              error={error}
            />
            <QuantityField
              label={t.quantity}
              optional
              unit={unit}
              value={quantity}
              onChange={setQuantity}
            />
          </>
        ) : (
          <TextField
            label={t.text}
            hint={t.textHint}
            maxLength={80}
            value={text}
            onChange={setText}
            required
          />
        )}
        <FormActions
          placement="inline"
          primaryLabel={t.submitAdd}
          primaryIcon={ListPlus}
          primaryDisabled={busy}
          error={mode === 'text' ? error : null}
        />
      </form>
    </Sheet>
  );
}

interface ShoppingListSectionProps {
  marketId: Id | undefined;
  onMarket: (marketId: Id | undefined) => void;
  /** `?add=1` in the address: the add sheet opens at once, with free text. */
  addRequested: boolean;
  onAddHandled: () => void;
}

/**
 * «Einkaufsliste» for the walk through the market (ADR-0015): grouped by goods in the order of
 * the chosen market, ticked in the hand. A tick is a command on the device, so it works offline
 * in the basement of the market and stays until the purchase is booked.
 */
export function ShoppingListSection({
  marketId,
  onMarket,
  addRequested,
  onAddHandled,
}: ShoppingListSectionProps) {
  const data = useQuery('shopping.list', marketId === undefined ? {} : { marketId });
  const [adding, setAdding] = useState(false);
  const chosen = data?.marketId;

  return (
    <Section
      title={t.title}
      hint={t.hint}
      action={{
        label: t.add,
        onClick: () => {
          setAdding(true);
        },
      }}
    >
      <div className="space-y-4">
        {data !== undefined && data.markets.length > 1 ? (
          <ChoiceChips
            legend={t.market}
            hideLegend
            options={[
              { value: ALL, label: t.allMarkets },
              ...data.markets.map((market) => ({ value: market.id, label: market.name })),
            ]}
            value={chosen ?? ALL}
            onChange={(next) => {
              onMarket(next === ALL ? undefined : next);
            }}
          />
        ) : null}
        {data === undefined ? null : data.count === 0 ? (
          <EmptyState
            icon={ShoppingBasket}
            title={t.title}
            text={t.empty}
            action={
              <Button
                variant="secondary"
                size="sm"
                icon={ListPlus}
                onClick={() => {
                  setAdding(true);
                }}
              >
                {t.add}
              </Button>
            }
          />
        ) : (
          <>
            <p className="px-4 text-sm text-ink-muted" aria-live="polite">
              {t.progress(data.checkedCount, data.count)}
            </p>
            {data.groups.map((group) => {
              const label =
                group.categoryId === undefined ? t.other : articleCategoryLabel(group.categoryId);
              return (
                <Section
                  key={group.categoryId ?? 'other'}
                  title={label}
                  titleStyle="group"
                  level={3}
                >
                  <GroupedList label={t.caption(label)}>
                    {group.items.map((item) => (
                      <ShoppingRow key={item.articleId ?? item.key} item={item} />
                    ))}
                  </GroupedList>
                </Section>
              );
            })}
          </>
        )}
        {data === undefined || data.otherMarkets.length === 0 ? null : (
          <div className="flex flex-wrap gap-2 px-1">
            {data.otherMarkets.map((market) => (
              <Button
                key={market.id}
                variant="ghost"
                size="sm"
                onClick={() => {
                  onMarket(market.id);
                }}
              >
                {t.otherMarkets(market.count, market.name)}
              </Button>
            ))}
          </div>
        )}
      </div>
      <AddSheet
        // A new key per way of opening: the sheet starts in the mode that opened it.
        key={addRequested ? 'requested' : 'manual'}
        open={adding || addRequested}
        startWithText={addRequested}
        onClose={() => {
          setAdding(false);
          if (addRequested) {
            onAddHandled();
          }
        }}
        marketId={chosen}
      />
    </Section>
  );
}
