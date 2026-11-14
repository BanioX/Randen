import { Check } from 'lucide-react';
import { Fragment, useId } from 'react';
import { FieldGroup } from './Field';

export interface ChoiceOption<TValue extends string> {
  value: TValue;
  label: string;
  /** The long form of a short label: shown as a tooltip and read out by screen readers. */
  description?: string | undefined;
  /** Chosen, the option is vermilion instead of Rotwein: a choice that writes goods off. */
  danger?: boolean | undefined;
  disabled?: boolean | undefined;
}

interface ChipsBaseProps<TValue extends string> {
  legend: string;
  options: readonly ChoiceOption<TValue>[];
  /** Visually hide the legend when a heading above already says the same. */
  hideLegend?: boolean | undefined;
  hint?: string | undefined;
  error?: string | null | undefined;
  disabled?: boolean | undefined;
  className?: string | undefined;
}

export interface ChoiceChipsProps<TValue extends string> extends ChipsBaseProps<TValue> {
  /** `null`: nothing chosen yet. */
  value: TValue | null;
  onChange: (value: TValue) => void;
  /** Equal-width segments in one row instead of wrapping chips (for 2–4 short options). */
  segmented?: boolean | undefined;
}

export interface MultiChoiceChipsProps<TValue extends string> extends ChipsBaseProps<TValue> {
  /** Every chosen value. */
  value: readonly TValue[];
  /** Gets the chosen values in the order of `options`. */
  onChange: (value: TValue[]) => void;
}

const OPTION =
  'relative cursor-pointer font-semibold transition-colors has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-wine-600 has-disabled:cursor-not-allowed has-disabled:opacity-50';
const CHOSEN = 'bg-wine-700 text-white shadow-card';
const CHOSEN_DANGER = 'bg-danger text-white shadow-card';

/*
 * Chips: capsules that wrap (reasons, weekdays, allergens).
 * Segments: Apple's segmented control, one rounded track with equal segments and a 13 px
 * label. The chosen segment is filled with Rotwein rather than iOS white, so the state keeps 3:1
 * contrast (WCAG 1.4.11). Long words break with a hyphen on narrow screens instead of being cut.
 */
const LOOKS = {
  chips: {
    group: 'relative flex flex-wrap gap-2',
    option: `flex min-h-11 items-center justify-center gap-1.5 rounded-full border px-4 text-sm ${OPTION}`,
    chosen: `border-wine-700 ${CHOSEN}`,
    chosenDanger: `border-danger ${CHOSEN_DANGER}`,
    idle: 'border-line-strong bg-surface text-ink hover:bg-surface-muted',
  },
  segments: {
    group: 'relative grid auto-cols-fr grid-flow-col gap-0.5 rounded-xl bg-surface-muted p-0.5',
    option: `flex min-h-11 min-w-0 items-center justify-center rounded-[0.625rem] px-1 text-center text-[0.8125rem] leading-tight hyphens-calm ${OPTION}`,
    chosen: CHOSEN,
    chosenDanger: CHOSEN_DANGER,
    idle: 'text-ink hover:bg-surface',
  },
} as const;

/**
 * The long form of an option for screen readers. It stands next to the chip, not inside it, so
 * the name of the choice stays the short label.
 */
function Description({ id, text }: { id: string; text: string | undefined }) {
  return text === undefined ? null : (
    <span id={id} className="sr-only">
      {text}
    </span>
  );
}

function look<TValue extends string>(
  style: (typeof LOOKS)[keyof typeof LOOKS],
  option: ChoiceOption<TValue>,
  checked: boolean,
): string {
  const state = checked ? (option.danger === true ? style.chosenDanger : style.chosen) : style.idle;
  return `${style.option} ${state}`;
}

/**
 * A single choice shown as chips (reasons, the kind of a date, a course). Native radio buttons
 * underneath: arrow keys, screen readers and form semantics work without extra code.
 */
export function ChoiceChips<TValue extends string>({
  legend,
  options,
  value,
  onChange,
  hideLegend,
  segmented = false,
  hint,
  error,
  disabled = false,
  className,
}: ChoiceChipsProps<TValue>) {
  const name = useId();
  const style = LOOKS[segmented ? 'segments' : 'chips'];
  return (
    <FieldGroup
      legend={legend}
      hideLegend={hideLegend}
      hint={hint}
      error={error}
      className={className}
    >
      <div className={style.group}>
        {options.map((option) => {
          const checked = option.value === value;
          const descriptionId = `${name}-${option.value}`;
          return (
            <Fragment key={option.value}>
              <label title={option.description} className={look(style, option, checked)}>
                <input
                  type="radio"
                  name={name}
                  value={option.value}
                  checked={checked}
                  disabled={disabled || option.disabled === true}
                  aria-describedby={option.description === undefined ? undefined : descriptionId}
                  onChange={() => {
                    onChange(option.value);
                  }}
                  className="sr-only"
                />
                {option.label}
              </label>
              <Description id={descriptionId} text={option.description} />
            </Fragment>
          );
        })}
      </div>
    </FieldGroup>
  );
}

/**
 * Several choices at once as chips (allergens, delivery days, labels of a dish). Native
 * checkboxes underneath; a chosen chip is filled and carries a check mark.
 */
export function MultiChoiceChips<TValue extends string>({
  legend,
  options,
  value,
  onChange,
  hideLegend,
  hint,
  error,
  disabled = false,
  className,
}: MultiChoiceChipsProps<TValue>) {
  const name = useId();
  const style = LOOKS.chips;
  return (
    <FieldGroup
      legend={legend}
      hideLegend={hideLegend}
      hint={hint}
      error={error}
      className={className}
    >
      <div className={style.group}>
        {options.map((option) => {
          const checked = value.includes(option.value);
          const descriptionId = `${name}-${option.value}`;
          return (
            <Fragment key={option.value}>
              <label title={option.description} className={look(style, option, checked)}>
                <input
                  type="checkbox"
                  name={name}
                  value={option.value}
                  checked={checked}
                  disabled={disabled || option.disabled === true}
                  aria-describedby={option.description === undefined ? undefined : descriptionId}
                  onChange={(event) => {
                    const next = new Set(value);
                    if (event.target.checked) {
                      next.add(option.value);
                    } else {
                      next.delete(option.value);
                    }
                    onChange(options.map((each) => each.value).filter((each) => next.has(each)));
                  }}
                  className="sr-only"
                />
                {checked ? <Check size={16} strokeWidth={2.5} aria-hidden="true" /> : null}
                {option.label}
              </label>
              <Description id={descriptionId} text={option.description} />
            </Fragment>
          );
        })}
      </div>
    </FieldGroup>
  );
}
