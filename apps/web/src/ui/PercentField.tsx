import { formatDecimal } from '@randen/core';
import { Minus } from 'lucide-react';
import {
  affixId,
  BOXED_INPUT_CLASS,
  Field,
  InputBox,
  joinIds,
  ParsedField,
  useParsedText,
  type FieldBaseProps,
} from './Field';
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
  /**
   * A change in percent, not a share: a minus sign counts («-15» is cheaper by 15 %). A button
   * next to the field sets it, as the number pad of a phone has no minus key. Default false.
   */
  allowNegative?: boolean | undefined;
}

/**
 * «30», «8.1», «8,1», «35.25 %» into basis points, with whole-number arithmetic: the digits
 * are counted, never multiplied as a float. With `signed`, a leading minus («-15», «−15») counts.
 */
function readPercent(input: string, signed: boolean): number | null {
  const text = input.trim().replace(/\s*%$/, '').replace(',', '.');
  const negative = signed && SIGN.test(text);
  const body = negative ? text.replace(SIGN, '') : text;
  const match = /^(\d*)(?:\.(\d{0,2}))?$/.exec(body);
  const whole = match?.[1] ?? '';
  const fraction = match?.[2] ?? '';
  if (match === null || (whole === '' && fraction === '')) {
    return null;
  }
  const bps = Number(whole === '' ? '0' : whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(bps)) {
    return null;
  }
  return negative && bps !== 0 ? -bps : bps;
}

/** A minus sign: hyphen-minus, the real minus sign or an en dash. */
const SIGN = /^\s*[-−–]\s*/;

const asText = (bps: number) => formatDecimal(bps / 100, { digits: 2, group: false });

/** A share in percent: yield, target food cost, VAT. */
export function PercentField({
  value,
  onChange,
  min = 0,
  max = 10_000,
  placeholder,
  allowNegative = false,
  ...base
}: PercentFieldProps) {
  if (allowNegative) {
    return (
      <SignedPercentField
        {...base}
        value={value}
        onChange={onChange}
        min={min}
        max={max}
        placeholder={placeholder}
      />
    );
  }
  return (
    <ParsedField
      {...base}
      value={value}
      onChange={onChange}
      inputMode="decimal"
      suffix="%"
      placeholder={placeholder}
      parse={(text) => {
        const bps = readPercent(text, false);
        return bps === null || bps < min || bps > max ? null : bps;
      }}
      format={asText}
      problem={(text) => percentProblem(text, false, min, max)}
    />
  );
}

function percentProblem(text: string, signed: boolean, min: number, max: number): string {
  const bps = readPercent(text, signed);
  if (bps === null) {
    return formMessages.percent.unreadable;
  }
  return bps < min
    ? formMessages.percent.min(`${asText(min)} %`)
    : formMessages.percent.max(`${asText(max)} %`);
}

/**
 * A change in percent: the sign is a button next to the field («Minus, Preisänderung»), the
 * number is typed as always. The button shows whether the change is a decrease.
 */
function SignedPercentField({
  label,
  hint,
  error,
  hideLabel,
  optional,
  required,
  disabled,
  id,
  name,
  className,
  value,
  onChange,
  min = -10_000,
  max = 10_000,
  placeholder,
}: Omit<PercentFieldProps, 'allowNegative'>) {
  const {
    ref,
    text,
    error: shown,
    commit,
    onBlur,
    onInvalid,
  } = useParsedText<number>({
    value,
    onChange,
    parse: (text) => {
      const bps = readPercent(text, true);
      return bps === null || bps < min || bps > max ? null : bps;
    },
    format: asText,
    problem: (text) => percentProblem(text, true, min, max),
    error,
    required,
  });
  const negative = SIGN.test(text);

  function toggleSign() {
    commit(negative ? text.replace(SIGN, '') : `-${text.trim()}`);
    ref.current?.focus();
  }

  return (
    <Field
      label={label}
      hint={hint}
      error={shown}
      hideLabel={hideLabel}
      optional={optional}
      id={id}
      className={className}
    >
      {(control) => (
        <div className="flex min-w-0 gap-2">
          <button
            type="button"
            aria-pressed={negative}
            disabled={disabled}
            onClick={toggleSign}
            className={`relative inline-flex min-h-12 min-w-12 shrink-0 items-center justify-center rounded-xl border transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
              negative
                ? 'border-wine-700 bg-wine-700 text-white'
                : 'border-line-strong bg-surface text-ink hover:bg-surface-muted'
            }`}
          >
            <Minus size={20} aria-hidden="true" />
            <span className="sr-only">{formMessages.percent.minus(label)}</span>
          </button>
          <InputBox
            controlId={control.id}
            invalid={shown !== undefined}
            disabled={disabled}
            suffix="%"
            className="flex-1"
          >
            <input
              {...control}
              aria-describedby={joinIds(control['aria-describedby'], affixId(control.id, 'suffix'))}
              ref={ref}
              name={name}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder={placeholder}
              required={required}
              disabled={disabled}
              value={text}
              onChange={(event) => {
                commit(event.target.value);
              }}
              onBlur={onBlur}
              onInvalid={onInvalid}
              className={`${BOXED_INPUT_CLASS} pr-2`}
            />
          </InputBox>
        </div>
      )}
    </Field>
  );
}
