import { useLayoutEffect } from 'react';
import { controlClass, Field, firstError, useSubmitGuard, type FieldBaseProps } from './Field';
import { formMessages } from './messages.forms';

export interface TextFieldProps extends FieldBaseProps {
  value: string;
  onChange: (value: string) => void;
  type?: 'text' | 'email' | 'tel' | 'url' | undefined;
  inputMode?: 'text' | 'email' | 'tel' | 'url' | 'numeric' | 'decimal' | undefined;
  placeholder?: string | undefined;
  autoComplete?: string | undefined;
  maxLength?: number | undefined;
}

/** What a required text field says once a form tried to send it empty. */
function useRequiredText<TElement extends HTMLInputElement | HTMLTextAreaElement>(
  value: string,
  required: boolean,
  error: string | null | undefined,
) {
  // Blanks alone are no name: the model trims them away.
  const missing = required && value.trim() === '';
  const { ref, submitted, onInvalid } = useSubmitGuard<TElement>(
    missing ? formMessages.required : null,
  );
  return {
    ref,
    onInvalid,
    shown: firstError(error, submitted && missing && formMessages.required),
  };
}

/** A line of text: a name, a number of a delivery note, a phone number. */
export function TextField({
  label,
  hint,
  error,
  hideLabel,
  optional,
  required = false,
  disabled,
  id,
  name,
  className,
  value,
  onChange,
  type = 'text',
  inputMode,
  placeholder,
  autoComplete = 'off',
  maxLength,
}: TextFieldProps) {
  const { ref, onInvalid, shown } = useRequiredText<HTMLInputElement>(value, required, error);
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
        <input
          {...control}
          ref={ref}
          name={name}
          type={type}
          inputMode={inputMode}
          autoComplete={autoComplete}
          placeholder={placeholder}
          maxLength={maxLength}
          required={required}
          disabled={disabled}
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
          }}
          onInvalid={onInvalid}
          className={controlClass(shown !== undefined)}
        />
      )}
    </Field>
  );
}

export interface TextAreaProps extends FieldBaseProps {
  value: string;
  onChange: (value: string) => void;
  /** Lines the field shows while empty; it grows with the text. Default 3. */
  rows?: number | undefined;
  placeholder?: string | undefined;
  maxLength?: number | undefined;
}

/** Several lines of text (a note, the steps of a recipe). Grows with what is written. */
export function TextArea({
  label,
  hint,
  error,
  hideLabel,
  optional,
  required = false,
  disabled,
  id,
  name,
  className,
  value,
  onChange,
  rows = 3,
  placeholder,
  maxLength,
}: TextAreaProps) {
  const { ref, onInvalid, shown } = useRequiredText<HTMLTextAreaElement>(value, required, error);

  useLayoutEffect(() => {
    const area = ref.current;
    // Without layout (tests, a hidden tab) there is nothing to measure: keep the rows.
    if (area === null || area.scrollHeight === 0) {
      return;
    }
    area.style.height = 'auto';
    const borders = area.offsetHeight - area.clientHeight;
    area.style.height = `${String(area.scrollHeight + borders)}px`;
  }, [ref, value]);

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
        <textarea
          {...control}
          ref={ref}
          name={name}
          rows={rows}
          placeholder={placeholder}
          maxLength={maxLength}
          required={required}
          disabled={disabled}
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
          }}
          onInvalid={onInvalid}
          className={`${controlClass(shown !== undefined)} block resize-none py-3 leading-snug`}
        />
      )}
    </Field>
  );
}
