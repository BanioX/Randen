import { formatDecimal } from '@randen/core';
import { ParsedField, type FieldBaseProps } from './Field';
import { formMessages } from './messages.forms';

export interface NumberFieldProps extends FieldBaseProps {
  /** A whole number, or null while the field is empty or cannot be read. */
  value: number | null;
  onChange: (value: number | null) => void;
  /** Smallest number allowed. Default 0. */
  min?: number | undefined;
  max?: number | undefined;
  /** Words behind the number: «Portionen», «Tage». */
  suffix?: string | undefined;
  placeholder?: string | undefined;
}

/** «12», «1’250», «12.0» and «12,0»; anything with a real fraction is no whole number. */
function readWholeNumber(input: string): number | null {
  const text = input.trim().replace(/[’'\s]/g, '');
  const match = /^(-?\d+)(?:[.,]0*)?$/.exec(text.replace('−', '-'));
  if (match === null) {
    return null;
  }
  const value = Number(match[1]);
  return Number.isSafeInteger(value) ? value : null;
}

/** A whole number: portions, days, covers. */
export function NumberField({
  value,
  onChange,
  min = 0,
  max,
  suffix,
  placeholder,
  ...base
}: NumberFieldProps) {
  const tooSmall = (number: number) => number < min;
  const tooLarge = (number: number) => max !== undefined && number > max;
  return (
    <ParsedField
      {...base}
      value={value}
      onChange={onChange}
      inputMode="numeric"
      suffix={suffix}
      placeholder={placeholder}
      parse={(text) => {
        const number = readWholeNumber(text);
        return number === null || tooSmall(number) || tooLarge(number) ? null : number;
      }}
      format={(number) => String(number)}
      problem={(text) => {
        const number = readWholeNumber(text);
        if (number === null) {
          return formMessages.number.unreadable;
        }
        return tooSmall(number)
          ? formMessages.number.min(formatDecimal(min, { digits: 0 }))
          : formMessages.number.max(formatDecimal(max ?? number, { digits: 0 }));
      }}
    />
  );
}
