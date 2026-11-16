import {
  formatQuantity,
  lineValue,
  rappen,
  sumRappen,
  type Id,
  type OperationOutput,
  type SuggestionGroup,
  type SuggestionLine,
} from '@randen/core';
import { PackageCheck } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { errorText, useCommand, useMoney, useToday } from '../../app/hooks';
import { paths } from '../../app/paths';
import { Button, ButtonLink } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { EmptyState } from '../../ui/EmptyState';
import { Notice } from '../../ui/Notice';
import { QuantityField } from '../../ui/QuantityField';
import { Section } from '../../ui/Section';
import { useToast } from '../../ui/Toast';
import { purchasingMessages } from './messages';
import { PackStepper, quantityLabel, ReasonChips, supplierDayLabel } from './shared';

const t = purchasingMessages.proposal;

type Suggestions = OperationOutput<'purchasing.suggestions'>;

/** The facts that explain a quantity: stock, minimum, plan, what is on order. */
function lineFacts(line: SuggestionLine): string {
  const q = (value: number) => formatQuantity(value, line.unit);
  return [
    t.stock(q(line.stock)),
    ...(line.minStock === undefined ? [] : [t.min(q(line.minStock))]),
    ...(line.needForPlan > 0 ? [t.plan(q(line.needForPlan))] : []),
    ...(line.onOrder > 0 ? [t.onOrder(q(line.onOrder))] : []),
  ].join(' · ');
}

interface LineProps {
  line: SuggestionLine;
  /** null while the field is empty or unreadable: nothing is ordered. */
  quantity: number | null;
  onChange?: ((quantity: number | null) => void) | undefined;
}

/** One article of the proposal: why, how much (editable), and what it costs at the last price. */
function ProposalLine({ line, quantity, onChange }: LineProps) {
  const money = useMoney();
  const value = lineValue(quantity ?? 0, line.pricePer1000);
  return (
    <li className="py-3 first:pt-0 last:pb-0 md:flex md:items-center md:gap-4">
      <div className="min-w-0 flex-1">
        <p className="font-semibold break-words hyphens-calm">
          {onChange === undefined ? (
            <Link
              to={paths.article(line.articleId)}
              className="text-wine-800 underline-offset-2 hover:underline"
            >
              {line.name}
            </Link>
          ) : (
            line.name
          )}
        </p>
        <p className="text-sm text-ink-muted tabular-nums">{lineFacts(line)}</p>
        {line.expiresBeforeUse > 0 ? (
          <p className="text-sm text-soon">
            {t.expiresBefore(formatQuantity(line.expiresBeforeUse, line.unit))}
          </p>
        ) : null}
        <p className="mt-1.5 flex flex-wrap gap-1.5">
          <ReasonChips reasons={[line.reason]} />
        </p>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 md:mt-0 md:shrink-0">
        {onChange === undefined ? (
          <span className="font-semibold tabular-nums">
            {quantityLabel(line.quantity, line.unit, line.packs)}
          </span>
        ) : line.packs === undefined ? (
          <QuantityField
            label={t.quantityOf(line.name)}
            hideLabel
            unit={line.unit}
            value={quantity}
            onChange={onChange}
            className="w-44"
          />
        ) : (
          <PackStepper
            name={line.name}
            count={Math.round((quantity ?? 0) / line.packs.size)}
            label={line.packs.label}
            size={line.packs.size}
            unit={line.unit}
            onChange={(count) => {
              onChange(count * (line.packs?.size ?? 0));
            }}
          />
        )}
        <span
          className={`w-24 shrink-0 text-right tabular-nums ${line.priceMissing ? 'text-ink-muted' : 'font-semibold'}`}
        >
          {line.priceMissing ? purchasingMessages.priceMissing : money.format(value)}
        </span>
      </div>
    </li>
  );
}

interface CardProps {
  group: SuggestionGroup;
  horizonDays: number;
  primary: boolean;
}

/** The proposal for one supplier, with its days, the sum and «Bestellung anlegen». */
function SupplierCard({ group, horizonDays, primary }: CardProps) {
  const money = useMoney();
  const today = useToday();
  const run = useCommand();
  const toast = useToast();
  const navigate = useNavigate();
  const [edited, setEdited] = useState<ReadonlyMap<Id, number | null>>(new Map());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { supplier } = group;
  const orderable = supplier?.kind === 'supplier';
  const quantityOf = (line: SuggestionLine) =>
    edited.has(line.articleId) ? (edited.get(line.articleId) ?? null) : line.quantity;
  const total = sumRappen(
    group.lines.map((line) => lineValue(quantityOf(line) ?? 0, line.pricePer1000)),
  );
  const wanted = group.lines.filter((line) => (quantityOf(line) ?? 0) > 0).length;
  const name = supplier?.name ?? t.withoutSupplier;
  const min = supplier?.minOrderRappen;

  async function create() {
    if (supplier === undefined) {
      return;
    }
    if (wanted === 0) {
      setError(t.nothingLeft);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await run('orders.createFromSuggestions', {
        supplierId: supplier.id,
        horizonDays,
        quantities: [...edited.entries()].map(([articleId, quantity]) => ({
          articleId,
          quantity: quantity ?? 0,
        })),
      });
      toast({ text: t.created(result.lineCount, money.format(result.valueRappen)), tone: 'ok' });
      void navigate(paths.order(result.orderId));
    } catch (failure) {
      setError(errorText(failure));
      setBusy(false);
    }
  }

  const days =
    supplier === undefined || supplier.kind === 'market'
      ? undefined
      : [
          supplier.nextOrder === undefined
            ? t.noDays
            : t.orderBy(supplierDayLabel(supplier.nextOrder, today)),
          ...(supplier.nextDelivery === undefined
            ? []
            : [t.deliveredOn(supplierDayLabel(supplier.nextDelivery, today))]),
        ].join(' · ');

  return (
    <Card padding="compact" className="py-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="text-lg font-semibold break-words hyphens-calm">
          {supplier === undefined ? (
            name
          ) : (
            <Link to={paths.supplier(supplier.id)} className="underline-offset-2 hover:underline">
              {name}
            </Link>
          )}
        </h3>
        {days === undefined ? null : <p className="text-sm text-ink-muted">{days}</p>}
      </div>
      {supplier === undefined ? (
        <p className="mb-3 text-sm text-ink-muted">{t.withoutSupplierHint}</p>
      ) : supplier.kind === 'market' ? (
        <p className="mb-3 text-sm text-ink-muted">{t.marketHint}</p>
      ) : null}
      <ul aria-label={t.linesOf(name)} className="divide-y divide-line">
        {group.lines.map((line) => (
          <ProposalLine
            key={line.articleId}
            line={line}
            quantity={quantityOf(line)}
            onChange={
              orderable
                ? (quantity) => {
                    setEdited((current) => new Map(current).set(line.articleId, quantity));
                    setError(null);
                  }
                : undefined
            }
          />
        ))}
      </ul>
      <div className="mt-4 space-y-3 border-t border-line pt-3">
        <p className="flex items-baseline justify-between gap-3 font-semibold tabular-nums">
          <span>{t.sum}</span>
          <span>{money.format(total)}</span>
        </p>
        {min === undefined || min <= 0 ? null : total < min ? (
          <Notice variant="row" tone="soon">
            {t.minOrderMissing(money.format(min), money.format(rappen(min - total)))}
          </Notice>
        ) : (
          <p className="text-sm text-ink-muted">{t.minOrderReached(money.format(min))}</p>
        )}
        {group.priceMissingCount > 0 ? (
          <p className="text-sm text-ink-muted">{t.withoutPrice(group.priceMissingCount)}</p>
        ) : null}
        {error === null ? null : (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        {orderable ? (
          <Button
            variant={primary ? 'primary' : 'secondary'}
            icon={PackageCheck}
            fullWidth
            className="md:w-auto"
            busy={busy}
            aria-label={t.createFor(name)}
            onClick={() => {
              void create();
            }}
          >
            {t.create}
          </Button>
        ) : null}
      </div>
    </Card>
  );
}

interface ProposalSectionProps {
  data: Suggestions | undefined;
  /** Market groups and articles without a supplier belong to the shopping list then. */
  withMarket: boolean;
  planning: boolean;
}

/**
 * «Bestellvorschlag»: one card per supplier, by the next day to order on. Quantities can be
 * changed before the draft is made; nothing is sent from here (ADR-0011).
 */
export function ProposalSection({ data, withMarket, planning }: ProposalSectionProps) {
  const groups = (data?.groups ?? []).filter(
    (group) => !withMarket || group.supplier?.kind === 'supplier',
  );
  const orderable = groups.filter((group) => group.supplier?.kind === 'supplier');
  return (
    <Section
      title={t.title}
      hint={data === undefined ? undefined : planning ? t.hint(data.horizonDays) : t.hintNoPlan}
    >
      {data === undefined ? null : groups.length === 0 ? (
        <EmptyState
          icon={PackageCheck}
          title={t.empty}
          text={t.emptyHint}
          action={
            <ButtonLink variant="secondary" size="sm" to={paths.articles()}>
              {t.toArticles}
            </ButtonLink>
          }
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
          {groups.map((group, index) => (
            <SupplierCard
              // A group without a supplier shares the id «none»: the index keeps the keys unique.
              key={group.supplier?.id ?? `none-${String(index)}`}
              group={group}
              horizonDays={data.horizonDays}
              primary={orderable.length === 1}
            />
          ))}
        </div>
      )}
    </Section>
  );
}
