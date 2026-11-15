import { CommandError, type Unit } from '@randen/core';
import { Minus, Plus } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { recipesMessages } from './messages';

const t = recipesMessages;

/**
 * The result of a live query, kept while the next one loads: a list that is being filtered,
 * or a recipe being rescaled, shows its last state instead of flashing empty.
 */
export function useLast<TData>(data: TData | undefined): TData | undefined {
  const [last, setLast] = useState(data);
  if (data !== undefined && data !== last) {
    setLast(data);
  }
  return data ?? last;
}

/** What a failed query threw, as an error the frame of the app can show. */
export function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error('Query failed', { cause: error });
}

/** «Kilo», «Liter», «1000 Stück»: what the cost of a component is quoted per. */
export function unitName(unit: Unit): string {
  return t.detail.unitNames[unit];
}

/** The chain of a loop out of the message of a refused command: «A → B → A». */
export function loopOf(error: unknown): string | undefined {
  if (error instanceof CommandError && error.code === 'invalid') {
    const match = /would contain itself: (.+)$/.exec(error.message);
    return match?.[1];
  }
  return undefined;
}

/** True when a component's name is taken by an article (not by a recipe). */
export function articleNameTaken(error: unknown): boolean {
  return (
    error instanceof CommandError &&
    error.code === 'duplicate_name' &&
    error.message.startsWith('Article')
  );
}

/** Whole numbers between `min` and `max`; anything else stays where it was. */
function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(value)));
}

interface PortionStepperProps {
  /** «Portionen» or «Ansätze»: what is counted, read out with the buttons. */
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  /** `large` for the cook view at the pass. */
  size?: 'md' | 'large';
  className?: string;
}

/**
 * How many portions to show: minus, the number, plus. The number can be typed too; the
 * buttons are 44 px or more and need no hover.
 */
export function PortionStepper({
  label,
  value,
  onChange,
  min = 1,
  max = 10_000,
  size = 'md',
  className = '',
}: PortionStepperProps) {
  const id = useId();
  const [text, setText] = useState(String(value));
  const [shown, setShown] = useState(value);
  if (shown !== value) {
    setShown(value);
    setText(String(value));
  }
  const large = size === 'large';
  const button = `inline-flex shrink-0 items-center justify-center rounded-full border border-line-strong bg-surface text-ink transition-colors hover:bg-surface-muted disabled:opacity-40 ${
    large ? 'size-14' : 'size-11'
  }`;
  const step = (delta: number) => {
    onChange(clamp(value + delta, min, max));
  };
  return (
    <div className={`relative flex items-center gap-2 ${className}`}>
      <button
        type="button"
        onClick={() => {
          step(-1);
        }}
        disabled={value <= min}
        aria-label={t.stepper.less(label)}
        className={button}
      >
        <Minus size={large ? 24 : 20} aria-hidden="true" />
      </button>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        enterKeyHint="done"
        autoComplete="off"
        value={text}
        onChange={(event) => {
          const next = event.target.value.replace(/\D/g, '');
          setText(next);
          const number = Number.parseInt(next, 10);
          if (Number.isFinite(number) && number >= min && number <= max) {
            onChange(number);
          }
        }}
        onBlur={() => {
          setText(String(value));
        }}
        className={`min-w-0 rounded-xl border border-line-strong bg-surface text-center font-semibold tabular-nums ${
          large ? 'h-14 w-24 text-3xl' : 'h-11 w-16 text-lg'
        }`}
      />
      <button
        type="button"
        onClick={() => {
          step(1);
        }}
        disabled={value >= max}
        aria-label={t.stepper.more(label)}
        className={button}
      >
        <Plus size={large ? 24 : 20} aria-hidden="true" />
      </button>
    </div>
  );
}

/** One line of a list of facts: the word on the left, the value on the right. */
export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt className="shrink-0 text-[0.9375rem] text-ink-muted">{label}</dt>
      <dd className="min-w-0 text-right font-medium break-words">{children}</dd>
    </div>
  );
}
