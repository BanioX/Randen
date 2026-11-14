import { formatDecimal, parseTemperature } from '@randen/core';
import { Minus } from 'lucide-react';
import {
  affixId,
  BOXED_INPUT_CLASS,
  Field,
  InputBox,
  joinIds,
  useParsedText,
  withoutTrailingMark,
  type FieldBaseProps,
} from './Field';
import { formMessages } from './messages.forms';

export interface TemperatureFieldProps extends FieldBaseProps {
  /** Tenths of a degree Celsius: 45 = 4.5 °C, -180 = -18 °C. */
  value: number | null;
  onChange: (value: number | null) => void;
  placeholder?: string | undefined;
}

const SIGN = /^\s*[-−]\s*/;

/**
 * A measured temperature. The number pad of a phone has no minus key, so a button next to the
 * field sets the sign: a freezer reads «18» and one tap.
 */
export function TemperatureField({
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
  placeholder,
}: TemperatureFieldProps) {
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
    parse: (text) => parseTemperature(withoutTrailingMark(text)),
    format: (deciC) => formatDecimal(deciC / 10, { digits: 1, group: false }),
    problem: () => formMessages.temperature.unreadable,
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
            <span className="sr-only">{formMessages.temperature.minus(label)}</span>
          </button>
          <InputBox
            controlId={control.id}
            invalid={shown !== undefined}
            disabled={disabled}
            suffix="°C"
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
