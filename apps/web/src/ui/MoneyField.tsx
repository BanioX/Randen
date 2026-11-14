import { rappen, type Rappen } from '@randen/core';
import { useMoney } from '../app/hooks';
import { ParsedField, withoutTrailingMark, type FieldBaseProps } from './Field';
import { formMessages } from './messages.forms';

export interface MoneyFieldProps extends FieldBaseProps {
  /** The amount in the smallest unit of the business currency (Rappen), never a float. */
  value: Rappen | null;
  onChange: (value: Rappen | null) => void;
  /** Amounts below zero are allowed (a credit note). Default: from zero up. */
  allowNegative?: boolean | undefined;
  placeholder?: string | undefined;
}

/** What the example in an error message shows: twelve and a half of the currency. */
const EXAMPLE = rappen(1250);

/**
 * An amount of money in the business currency, with the currency in front of the field. Reads
 * «12.50», «12,50», «1’234.50» and «12.–» through the core, so no float ever touches an amount.
 */
export function MoneyField({
  value,
  onChange,
  allowNegative = false,
  placeholder,
  ...base
}: MoneyFieldProps) {
  const money = useMoney();
  const read = (text: string) => money.parse(withoutTrailingMark(text));
  return (
    <ParsedField
      {...base}
      value={value}
      onChange={onChange}
      inputMode="decimal"
      prefix={money.symbol}
      placeholder={placeholder}
      parse={(text) => {
        const amount = read(text);
        return amount !== null && amount < 0 && !allowNegative ? null : amount;
      }}
      format={(amount) => money.format(amount, { currency: false })}
      problem={(text) =>
        read(text) === null
          ? formMessages.money.unreadable(money.format(EXAMPLE, { currency: false }))
          : formMessages.money.negative
      }
    />
  );
}
