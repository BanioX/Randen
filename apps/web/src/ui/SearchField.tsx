import { Search, X } from 'lucide-react';
import { useRef } from 'react';
import { BOXED_INPUT_CLASS, Field } from './Field';
import { formMessages } from './messages.forms';

export interface SearchFieldProps {
  /** What is searched, e.g. «Artikel suchen». Always there for screen readers. */
  label: string;
  /** Keeps the label for screen readers only; the placeholder then says what to type. */
  hideLabel?: boolean | undefined;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string | undefined;
  hint?: string | undefined;
  disabled?: boolean | undefined;
  id?: string | undefined;
  name?: string | undefined;
  className?: string | undefined;
}

/**
 * The search line above a list: a magnifier, the text, and a button that empties it. The
 * list filters while the person types; nothing has to be sent.
 */
export function SearchField({
  label,
  hideLabel = false,
  value,
  onChange,
  placeholder,
  hint,
  disabled = false,
  id,
  name,
  className,
}: SearchFieldProps) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <Field label={label} hideLabel={hideLabel} hint={hint} id={id} className={className}>
      {(control) => (
        <div
          className={`flex min-h-12 min-w-0 items-center rounded-xl border border-line-strong has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-wine-600 ${
            disabled ? 'bg-surface-muted' : 'bg-surface'
          }`}
        >
          <Search
            size={20}
            aria-hidden="true"
            className="pointer-events-none ml-3.5 shrink-0 text-ink-muted"
          />
          <input
            {...control}
            ref={input}
            name={name}
            type="search"
            autoComplete="off"
            enterKeyHint="search"
            placeholder={placeholder}
            disabled={disabled}
            value={value}
            onChange={(event) => {
              onChange(event.target.value);
            }}
            className={`${BOXED_INPUT_CLASS} appearance-none pl-2.5 font-sans [&::-webkit-search-cancel-button]:appearance-none`}
          />
          {value === '' ? null : (
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                onChange('');
                input.current?.focus();
              }}
              className="relative mr-0.5 inline-flex size-11 shrink-0 items-center justify-center rounded-[0.625rem] text-ink-muted hover:bg-surface-muted hover:text-ink"
            >
              <X size={20} aria-hidden="true" />
              <span className="sr-only">{formMessages.search.clear}</span>
            </button>
          )}
        </div>
      )}
    </Field>
  );
}
