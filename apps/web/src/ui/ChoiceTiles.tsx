import { Check } from 'lucide-react';
import { useId } from 'react';
import { FieldGroup } from './Field';

export interface TileOption<TValue extends string> {
  value: TValue;
  label: string;
  /** A quiet line under the label: examples, or what the choice means. */
  detail?: string | undefined;
}

interface TilesBaseProps<TValue extends string> {
  legend: string;
  options: readonly TileOption<TValue>[];
  /** Visually hide the legend when a heading above already says the same. */
  hideLegend?: boolean | undefined;
  hint?: string | undefined;
  error?: string | null | undefined;
  /** Two columns from 768 px for long lists, such as the kinds of business. */
  columns?: 1 | 2 | undefined;
}

export interface ChoiceTilesProps<TValue extends string> extends TilesBaseProps<TValue> {
  /** `null`: nothing chosen yet. */
  value: TValue | null;
  onChange: (value: TValue) => void;
}

export interface MultiChoiceTilesProps<TValue extends string> extends TilesBaseProps<TValue> {
  value: readonly TValue[];
  /** Gets the chosen values in the order of `options`. */
  onChange: (value: TValue[]) => void;
}

const TILE =
  'relative flex min-h-14 cursor-pointer items-start gap-3 rounded-2xl border px-4 py-3 text-left transition-colors has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-wine-600';
const CHOSEN = 'border-wine-700 bg-wine-50 ring-1 ring-wine-700';
const IDLE = 'border-line bg-surface shadow-card hover:bg-surface-muted';

function Mark({ checked, round }: { checked: boolean; round: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`mt-0.5 flex size-6 shrink-0 items-center justify-center border-2 ${round ? 'rounded-full' : 'rounded-md'} ${
        checked ? 'border-wine-700 bg-wine-700 text-white' : 'border-line-strong bg-surface'
      }`}
    >
      {checked ? <Check size={14} strokeWidth={3} /> : null}
    </span>
  );
}

function Text({ label, detail, detailId }: { label: string; detail?: string; detailId: string }) {
  return (
    <span className="min-w-0">
      <span className="block font-semibold">{label}</span>
      {detail === undefined ? null : (
        <span id={detailId} className="block text-sm text-ink-muted">
          {detail}
        </span>
      )}
    </span>
  );
}

const grid = (columns: 1 | 2) => `grid gap-2.5 ${columns === 2 ? 'md:grid-cols-2' : ''}`;

/**
 * Large choices for a question that stands alone on a screen, such as the steps of «Randen
 * einrichten»: the question as a title, a tile per answer with a line of explanation, easy to
 * hit with a thumb. Native
 * radio buttons underneath, so arrow keys and screen readers work as usual.
 */
export function ChoiceTiles<TValue extends string>({
  legend,
  options,
  value,
  onChange,
  hideLegend,
  hint,
  error,
  columns = 1,
}: ChoiceTilesProps<TValue>) {
  const name = useId();
  return (
    <FieldGroup
      legend={legend}
      legendStyle="title"
      hideLegend={hideLegend}
      hint={hint}
      error={error}
    >
      <div className={grid(columns)}>
        {options.map((option) => {
          const checked = option.value === value;
          const detailId = `${name}-${option.value}`;
          return (
            <label key={option.value} className={`${TILE} ${checked ? CHOSEN : IDLE}`}>
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={checked}
                aria-describedby={option.detail === undefined ? undefined : detailId}
                onChange={() => {
                  onChange(option.value);
                }}
                className="sr-only"
              />
              <Mark checked={checked} round />
              <Text
                label={option.label}
                detailId={detailId}
                {...(option.detail === undefined ? {} : { detail: option.detail })}
              />
            </label>
          );
        })}
      </div>
    </FieldGroup>
  );
}

/** The same tiles for questions with several answers («Wähle alles, was zutrifft»). */
export function MultiChoiceTiles<TValue extends string>({
  legend,
  options,
  value,
  onChange,
  hideLegend,
  hint,
  error,
  columns = 1,
}: MultiChoiceTilesProps<TValue>) {
  const name = useId();
  return (
    <FieldGroup
      legend={legend}
      legendStyle="title"
      hideLegend={hideLegend}
      hint={hint}
      error={error}
    >
      <div className={grid(columns)}>
        {options.map((option) => {
          const checked = value.includes(option.value);
          const detailId = `${name}-${option.value}`;
          return (
            <label key={option.value} className={`${TILE} ${checked ? CHOSEN : IDLE}`}>
              <input
                type="checkbox"
                value={option.value}
                checked={checked}
                aria-describedby={option.detail === undefined ? undefined : detailId}
                onChange={(event) => {
                  const next = new Set(value);
                  if (event.target.checked) {
                    next.add(option.value);
                  } else {
                    next.delete(option.value);
                  }
                  onChange(options.map((o) => o.value).filter((v) => next.has(v)));
                }}
                className="sr-only"
              />
              <Mark checked={checked} round={false} />
              <Text
                label={option.label}
                detailId={detailId}
                {...(option.detail === undefined ? {} : { detail: option.detail })}
              />
            </label>
          );
        })}
      </div>
    </FieldGroup>
  );
}
