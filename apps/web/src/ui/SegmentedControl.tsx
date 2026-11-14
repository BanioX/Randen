import { useId, useRef, type KeyboardEvent } from 'react';

export interface Segment<TValue extends string> {
  value: TValue;
  label: string;
}

interface SegmentedControlProps<TValue extends string> {
  /** What is chosen here: «Zeitraum», «Ansicht». Read out; shown above unless `hideLabel`. */
  label: string;
  /** Two to four short options. */
  options: readonly Segment<TValue>[];
  value: TValue;
  onChange: (value: TValue) => void;
  hideLabel?: boolean | undefined;
  className?: string | undefined;
}

/**
 * Two to four views of the same thing, as on iOS: a grey track, the chosen segment in Rotwein with
 * white text. A radio group: Tab reaches the chosen segment, the arrow keys move and choose.
 */
export function SegmentedControl<TValue extends string>({
  label,
  options,
  value,
  onChange,
  hideLabel = false,
  className = '',
}: SegmentedControlProps<TValue>) {
  const labelId = useId();
  const group = useRef<HTMLDivElement>(null);
  const chosen = options.findIndex((option) => option.value === value);

  function choose(index: number) {
    const option = options[index];
    if (option === undefined) {
      return;
    }
    onChange(option.value);
    group.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[index]?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const current = Math.max(chosen, 0);
    const last = options.length - 1;
    const target = {
      ArrowRight: current === last ? 0 : current + 1,
      ArrowDown: current === last ? 0 : current + 1,
      ArrowLeft: current === 0 ? last : current - 1,
      ArrowUp: current === 0 ? last : current - 1,
      Home: 0,
      End: last,
    }[event.key];
    if (target === undefined) {
      return;
    }
    event.preventDefault();
    choose(target);
  }

  return (
    // `relative`: the label may be visually hidden and must not escape a scroll container.
    <div className={`relative min-w-0 ${className}`}>
      <span
        id={labelId}
        className={hideLabel ? 'sr-only' : 'mb-1.5 block text-sm font-semibold text-ink-muted'}
      >
        {label}
      </span>
      <div
        ref={group}
        role="radiogroup"
        aria-labelledby={labelId}
        onKeyDown={onKeyDown}
        className="grid auto-cols-fr grid-flow-col gap-1 rounded-xl bg-surface-muted p-1"
      >
        {options.map((option, index) => {
          const checked = index === chosen;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={checked}
              // Roving focus: only the chosen segment (or the first, if none) is a tab stop.
              tabIndex={checked || (chosen === -1 && index === 0) ? 0 : -1}
              onClick={() => {
                onChange(option.value);
              }}
              className={`min-h-11 min-w-0 rounded-[0.625rem] px-2 py-1.5 text-center text-[0.9375rem] leading-tight break-words hyphens-calm transition-colors ${
                checked
                  ? 'bg-wine-700 font-semibold text-white shadow-sm dark:ring-1 dark:ring-line-strong dark:ring-inset'
                  : 'font-medium text-ink hover:bg-surface'
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
