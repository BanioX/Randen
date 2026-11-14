import { formatDecimal } from '@randen/core';
import { ParsedField, type FieldBaseProps } from './Field';
import { formMessages } from './messages.forms';

export interface PercentFieldProps extends FieldBaseProps {
  /** The share in basis points: 3000 = 30 %, 810 = 8.1 %. Whole numbers only. */
  value: number | null;
  onChange: (value: number | null) => void;
  /** Smallest share allowed, in basis points. Default 0. */
  min?: number | undefined;
  /** Largest share allowed, in basis points. Default 10000 (100 %). */
  max?: number | undefined;
  placeholder?: string | undefined;
}

/**
 * «30», «8.1», «8,1», «35.25 %» into basis points, with whole-number arithmetic: the digits
 * are counted, never multiplied as a float.
 */
function readPercent(input: string): number | null {
  const text = input.trim().replace(/\s*%$/, '').replace(',', '.');
  const match = /^(\d*)(?:\.(\d{0,2}))?$/.exec(text);
  const whole = match?.[1] ?? '';
  const fraction = match?.[2] ?? '';
  if (match === null || (whole === '' && fraction === '')) {
    return null;
  }
  const bps = Number(whole === '' ? '0' : whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(bps) ? bps : null;
}

const asText = (bps: number) => formatDecimal(bps / 100, { digits: 2, group: false });

/** A share in percent: yield, target food cost, VAT. */
export function PercentField({
  value,
  onChange,
  min = 0,
  max = 10_000,
  placeholder,
  ...base
}: PercentFieldProps) {
  return (
    <ParsedField
      {...base}
      value={value}
      onChange={onChange}
      inputMode="decimal"
      suffix="%"
      placeholder={placeholder}
      parse={(text) => {
        const bps = readPercent(text);
        return bps === null || bps < min || bps > max ? null : bps;
      }}
      format={asText}
      problem={(text) => {
        const bps = readPercent(text);
        if (bps === null) {
          return formMessages.percent.unreadable;
        }
        return bps < min
          ? formMessages.percent.min(`${asText(min)} %`)
          : formMessages.percent.max(`${asText(max)} %`);
      }}
    />
  );
}
