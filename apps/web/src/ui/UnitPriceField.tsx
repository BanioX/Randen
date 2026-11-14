import {
  formatUnitPrice,
  parseUnitPrice,
  priceUnitLabel,
  rappen,
  type Rappen,
  type Unit,
} from '@randen/core';
import { useMoney } from '../app/hooks';
import { ParsedField, type FieldBaseProps } from './Field';
import { formMessages } from './messages.forms';

export interface UnitPriceFieldProps extends FieldBaseProps {
  /** The base unit of the article: decides whether the price is per kg, per litre or per piece. */
  unit: Unit;
  /** Smallest currency units per 1000 base units (Rappen per kg, per litre, per 1000 pieces). */
  value: Rappen | null;
  onChange: (value: Rappen | null) => void;
  placeholder?: string | undefined;
}

/** What the example in an error message shows: 52.50 per kilogram or litre, 0.45 per piece. */
const EXAMPLE: Record<Unit, Rappen> = { g: rappen(5250), ml: rappen(5250), pcs: rappen(45_000) };

/**
 * The price of goods per kilogram, litre or piece. The label says which («Einkaufspreis pro
 * kg»), the currency stands in front. Nobody divides by 1000: the core reads and writes
 * `pricePer1000`.
 */
export function UnitPriceField({
  unit,
  value,
  onChange,
  placeholder,
  ...base
}: UnitPriceFieldProps) {
  const money = useMoney();
  /** «62.00 / kg» without the unit: the number as it stands in the field. */
  const bare = (price: number) =>
    formatUnitPrice(price, unit, money.currency, { currency: false }).replace(/\s*\/.*$/, '');
  return (
    <ParsedField
      {...base}
      labelSuffix={formMessages.unitPrice.per(priceUnitLabel(unit))}
      value={value}
      onChange={onChange}
      inputMode="decimal"
      prefix={money.symbol}
      placeholder={placeholder}
      parse={(text) => parseUnitPrice(text, unit, money.currency)}
      format={bare}
      resetKey={unit}
      problem={() => formMessages.unitPrice.unreadable(bare(EXAMPLE[unit]))}
    />
  );
}
