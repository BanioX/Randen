import { Check } from 'lucide-react';
import { useId } from 'react';

export interface SwitchProps {
  label: string;
  /** A quiet line under the label that says what the switch does. */
  description?: string | undefined;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean | undefined;
  id?: string | undefined;
  name?: string | undefined;
  className?: string | undefined;
}

/**
 * An on/off setting that takes effect at once, as a row with the label on the left and the
 * switch on the right. A native checkbox with the role `switch` lies over the track: Space,
 * the label and screen readers work without extra code. On shows a check mark in the knob, so
 * the state does not hang on colour alone.
 */
export function Switch({
  label,
  description,
  checked,
  onChange,
  disabled = false,
  id,
  name,
  className = '',
}: SwitchProps) {
  const generated = useId();
  const inputId = id ?? generated;
  const descriptionId = `${inputId}-description`;
  return (
    <div className={`flex min-h-11 min-w-0 items-center justify-between gap-4 ${className}`}>
      <div className="min-w-0">
        <label
          htmlFor={inputId}
          className={`block font-medium ${disabled ? 'cursor-not-allowed text-ink-muted' : 'cursor-pointer'}`}
        >
          {label}
        </label>
        {description === undefined ? null : (
          <p id={descriptionId} className="text-sm text-ink-muted">
            {description}
          </p>
        )}
      </div>
      <span className="relative flex min-h-11 shrink-0 items-center">
        <input
          id={inputId}
          name={name}
          type="checkbox"
          role="switch"
          checked={checked}
          disabled={disabled}
          aria-describedby={description === undefined ? undefined : descriptionId}
          onChange={(event) => {
            onChange(event.target.checked);
          }}
          className="peer absolute inset-0 z-10 size-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
        />
        <span
          aria-hidden="true"
          className={`flex h-8 w-[3.25rem] items-center rounded-full p-0.5 transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-wine-600 peer-disabled:opacity-60 ${
            checked ? 'bg-wine-700' : 'bg-line-strong'
          }`}
        >
          <span
            className={`flex size-7 items-center justify-center rounded-full bg-white shadow-card transition-transform ${
              checked ? 'translate-x-5' : ''
            }`}
          >
            {/* Stroke, not text colour: on the white knob the mark stays dark in dark mode. */}
            {checked ? <Check size={16} strokeWidth={3} className="stroke-wine-700" /> : null}
          </span>
        </span>
      </span>
    </div>
  );
}
