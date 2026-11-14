import { ChevronDown } from 'lucide-react';
import { controlClass, Field, firstError, useSubmitGuard, type FieldBaseProps } from './Field';
import { formMessages } from './messages.forms';

export interface SelectOption<TValue extends string> {
  value: TValue;
  label: string;
  disabled?: boolean | undefined;
}

export interface SelectFieldProps<TValue extends string> extends FieldBaseProps {
  options: readonly SelectOption<TValue>[];
  /** The chosen value, or null while nothing is chosen. */
  value: TValue | null;
  onChange: (value: TValue | null) => void;
  /**
   * The words of the empty choice: «Bitte wählen» by default, or what «none» means here
   * («Kein Lieferant»). An optional field always offers it, so a choice can be taken back.
   */
  placeholder?: string | undefined;
}

/**
 * One choice from a short list, with the device's own picker: on the phone the wheel, at the
 * desk the list with type-ahead. For long lists that need a search use `Combobox`.
 */
export function SelectField<TValue extends string>({
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
  options,
  value,
  onChange,
  placeholder = formMessages.select.placeholder,
}: SelectFieldProps<TValue>) {
  // A value that is no longer in the list (a deleted supplier) shows as «nothing chosen».
  const chosen = options.find((option) => option.value === value);
  const missing = required && chosen === undefined;
  const { ref, submitted, onInvalid } = useSubmitGuard<HTMLSelectElement>(
    missing ? formMessages.required : null,
  );
  const shown = firstError(error, submitted && missing && formMessages.required);
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
        <div className="relative">
          <select
            {...control}
            ref={ref}
            name={name}
            required={required}
            disabled={disabled}
            value={chosen?.value ?? ''}
            onChange={(event) => {
              const next = options.find((option) => option.value === event.target.value);
              onChange(next?.value ?? null);
            }}
            onInvalid={onInvalid}
            className={`${controlClass(shown !== undefined)} appearance-none pr-11 text-ellipsis`}
          >
            {chosen === undefined || !required ? <option value="">{placeholder}</option> : null}
            {options.map((option) => (
              <option key={option.value} value={option.value} disabled={option.disabled}>
                {option.label}
              </option>
            ))}
          </select>
          <ChevronDown
            size={20}
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-ink-muted"
          />
        </div>
      )}
    </Field>
  );
}
