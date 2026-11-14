import {
  formatPercent,
  formatUnitPrice,
  lineValue,
  priceUnitLabel,
  rappen,
  type Id,
  type LocalDate,
  type Rappen,
  type ReceiveProposal,
} from '@randen/core';
import { X } from 'lucide-react';
import { useMoney } from '../../app/hooks';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { ChoiceChips } from '../../ui/ChoiceChips';
import { DateField } from '../../ui/DateField';
import { MoneyField } from '../../ui/MoneyField';
import { Notice } from '../../ui/Notice';
import { AreaPicker } from '../../ui/pickers';
import { QuantityField } from '../../ui/QuantityField';
import { TextField } from '../../ui/TextField';
import { UnitPriceField } from '../../ui/UnitPriceField';
import { priceChangeBps, priceFromTotal } from './math';
import { stockMessages } from './messages';

const t = stockMessages.receive.lines;

/** One line of a goods receipt while it is being typed. */
export interface DraftLine {
  /** Stable while the form lives: names the fields and keeps React's order. */
  key: number;
  articleId: Id;
  quantity: number | null;
  /** The price is typed per unit, or as the amount of the line on the delivery note. */
  mode: 'unit' | 'total';
  unitPrice: Rappen | null;
  total: Rappen | null;
  expiresOn: LocalDate | null;
  /** True while the date is still the proposal (receipt day plus shelf life). */
  proposed: boolean;
  areaId: Id | null;
  lotCode: string;
  withLotCode: boolean;
}

/** From how far off the last price a calm notice appears: more than 10 %. */
const NOTICE_BPS = 1000;

const PRESETS = [
  { label: t.presets.three, days: 3 },
  { label: t.presets.week, days: 7 },
  { label: t.presets.month, days: 30 },
] as const;

/** The unit price a line will be booked at, or null if the article's last price applies. */
export function typedPrice(line: DraftLine): Rappen | null {
  return line.mode === 'unit' ? line.unitPrice : priceFromTotal(line.total, line.quantity);
}

/** What a line adds to the delivery, counted the way the ledger will book it. */
export function lineAmount(line: DraftLine, lastPrice: number): Rappen {
  if (line.quantity === null) {
    return rappen(0);
  }
  return lineValue(line.quantity, typedPrice(line) ?? lastPrice);
}

export const lineIds = (key: number) => ({
  quantity: `receive-line-${key}-quantity`,
  lotCode: `receive-line-${key}-lot-code`,
});

interface ReceiveLineProps {
  index: number;
  line: DraftLine;
  proposal: ReceiveProposal;
  onChange: (patch: Partial<DraftLine>) => void;
  onRemove: () => void;
  /** Asks the page to move the focus, e.g. into the field that just appeared. */
  onFocus: (id: string) => void;
}

/**
 * One line of the goods receipt: quantity, price (per unit or as the amount of the line), date
 * and area. Everything usual is prefilled from the article and marked as a proposal; a price
 * that differs from the last one is said, calmly.
 */
export function ReceiveLine({
  index,
  line,
  proposal,
  onChange,
  onRemove,
  onFocus,
}: ReceiveLineProps) {
  const money = useMoney();
  const ids = lineIds(line.key);
  const unitName = priceUnitLabel(proposal.unit);
  const price = (per1000: number) => formatUnitPrice(per1000, proposal.unit, money.currency);
  const last = proposal.pricePer1000;
  const typed = typedPrice(line);
  const change =
    typed === null || last === 0 || typed === last ? null : priceChangeBps(typed, last);

  function setMode(mode: 'unit' | 'total') {
    if (mode === line.mode) {
      return;
    }
    // The other way of saying the same price comes prefilled, where it can be worked out.
    if (mode === 'total') {
      const known = line.quantity !== null && line.unitPrice !== null;
      onChange({
        mode,
        total: known ? lineValue(line.quantity ?? 0, line.unitPrice ?? 0) : line.total,
      });
    } else {
      onChange({ mode, unitPrice: priceFromTotal(line.total, line.quantity) ?? line.unitPrice });
    }
  }

  let priceInfo: string | undefined;
  if (typed === null) {
    priceInfo = last > 0 ? t.usesLast(price(last)) : t.noPrice(money.format(rappen(0)));
  } else if (last === 0) {
    priceInfo = t.firstPrice;
  } else if (change !== null && Math.abs(change) <= NOTICE_BPS) {
    priceInfo = t.lastPrice(
      price(last),
      `${change > 0 ? '+' : '-'}${formatPercent(Math.abs(change))}`,
    );
  }
  const derived = line.mode === 'total' && typed !== null ? t.derived(price(typed)) : undefined;

  return (
    <Card padding="compact" className="py-4">
      <fieldset className="relative min-w-0">
        <legend className="sr-only">{t.line(index + 1, proposal.name)}</legend>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p aria-hidden="true" className="text-lg font-semibold break-words hyphens-calm">
              {proposal.name}
            </p>
            {line.quantity === null ? null : (
              <p className="text-sm text-ink-muted tabular-nums">
                {t.value(money.format(lineAmount(line, last)))}
              </p>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            icon={X}
            aria-label={t.removeOf(proposal.name)}
            onClick={onRemove}
            className="-mr-2 shrink-0"
          >
            {t.remove}
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <QuantityField
            id={ids.quantity}
            label={t.quantity}
            unit={proposal.unit}
            value={line.quantity}
            onChange={(quantity) => {
              onChange({ quantity });
            }}
            positive
            required
          />
          <div className="min-w-0 space-y-2">
            {line.mode === 'unit' ? (
              <UnitPriceField
                label={t.price}
                unit={proposal.unit}
                value={line.unitPrice}
                onChange={(unitPrice) => {
                  onChange({ unitPrice });
                }}
                hint={priceInfo}
              />
            ) : (
              <MoneyField
                label={t.total}
                value={line.total}
                onChange={(total) => {
                  onChange({ total });
                }}
                hint={[derived, priceInfo].filter((part) => part !== undefined).join(' · ')}
              />
            )}
            <ChoiceChips
              legend={t.priceMode}
              hideLegend
              segmented
              options={[
                { value: 'unit', label: t.perUnit(unitName) },
                { value: 'total', label: t.perLine },
              ]}
              value={line.mode}
              onChange={setMode}
            />
          </div>
          <DateField
            label={stockMessages.date.label[proposal.dateKind]}
            optional
            value={line.expiresOn}
            onChange={(expiresOn) => {
              onChange({ expiresOn, proposed: false });
            }}
            presets={PRESETS}
            hint={
              line.proposed && line.expiresOn !== null && proposal.shelfLifeDays !== undefined
                ? t.proposal(proposal.shelfLifeDays)
                : undefined
            }
          />
          <div className="min-w-0 space-y-2">
            <AreaPicker
              label={t.area}
              value={line.areaId}
              onChange={(areaId) => {
                onChange({ areaId });
              }}
              required
            />
            {line.withLotCode ? (
              <TextField
                id={ids.lotCode}
                label={t.lotCode}
                optional
                maxLength={40}
                value={line.lotCode}
                onChange={(lotCode) => {
                  onChange({ lotCode });
                }}
              />
            ) : (
              <Button
                variant="ghost"
                size="sm"
                aria-label={t.addLotCodeOf(proposal.name)}
                onClick={() => {
                  onChange({ withLotCode: true });
                  onFocus(ids.lotCode);
                }}
                className="-ml-3.5"
              >
                {t.addLotCode}
              </Button>
            )}
          </div>
        </div>

        {change !== null && Math.abs(change) > NOTICE_BPS ? (
          <div className="mt-3">
            <Notice variant="row" tone="soon">
              {change > 0
                ? t.higher(formatPercent(change), price(last))
                : t.lower(formatPercent(-change), price(last))}
            </Notice>
          </div>
        ) : null}
      </fieldset>
    </Card>
  );
}
