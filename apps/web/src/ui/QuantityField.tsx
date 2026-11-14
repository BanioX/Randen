import { formatDecimal, formatQuantity, parseQuantityInput, type Unit } from '@randen/core';
import { useId, useState } from 'react';
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

/** The unit a bare number is meant in: the switch next to the field. */
export type EntryUnit = 'kg' | 'g' | 'l' | 'dl' | 'ml' | 'stk';

interface EntryOption {
  id: EntryUnit;
  label: string;
  /** Base units in one of this unit. */
  factor: number;
}

const KILOGRAM: EntryOption = { id: 'kg', label: 'kg', factor: 1000 };
const LITRE: EntryOption = { id: 'l', label: 'l', factor: 1000 };
const PIECE: EntryOption = { id: 'stk', label: 'Stk.', factor: 1 };

const ENTRY_UNITS: Record<Unit, readonly EntryOption[]> = {
  g: [KILOGRAM, { id: 'g', label: 'g', factor: 1 }],
  ml: [LITRE, { id: 'dl', label: 'dl', factor: 100 }, { id: 'ml', label: 'ml', factor: 1 }],
  pcs: [PIECE],
};

const LARGEST: Record<Unit, EntryOption> = { g: KILOGRAM, ml: LITRE, pcs: PIECE };

/** True if the quantity can be written in this unit with at most three decimals. */
function fits(value: number, option: EntryOption): boolean {
  const thousandths = (value / option.factor) * 1000;
  return Math.abs(thousandths - Math.round(thousandths)) < 1e-6;
}

/** The unit a stored value is shown in: the wanted one if it reads well, else the nearest. */
function entryFor(unit: Unit, value: number | null, wanted: EntryUnit | undefined): EntryOption {
  const options = ENTRY_UNITS[unit];
  const preferred = options.find((option) => option.id === wanted);
  if (value === null) {
    return preferred ?? LARGEST[unit];
  }
  if (preferred !== undefined && fits(value, preferred)) {
    return preferred;
  }
  return (
    options.find((option) => value >= option.factor && fits(value, option)) ??
    options.at(-1) ??
    LARGEST[unit]
  );
}

const TYPED_UNIT = /[a-zA-Zäöü]/;

/** «2,50 KG» and «2.5 kg» say the same: number without noise, unit in small letters. */
function tidy(text: string): string {
  const match = /^([\d.,’'\s]*\d)\s*(.*)$/.exec(text.trim());
  if (match === null) {
    return text.trim().toLowerCase();
  }
  const number = Number.parseFloat((match[1] ?? '').replace(/[’'\s]/g, '').replace(',', '.'));
  const unit = (match[2] ?? '').toLowerCase().replace(/\.$/, '');
  return `${formatDecimal(number, { digits: 6, group: false })} ${unit}`.trim();
}

export interface QuantityFieldProps extends FieldBaseProps {
  /** The base unit of the article: every value is in grams, millilitres or pieces. */
  unit: Unit;
  /** The quantity in base units, or null while the field is empty or cannot be read. */
  value: number | null;
  onChange: (value: number | null) => void;
  /**
   * What a bare number means at first: `kg` (default for grams), `g`, `l` (default for
   * millilitres), `dl` or `ml`. The person can switch it next to the field.
   */
  entryUnit?: EntryUnit | undefined;
  /** Zero is no quantity here (goods receipt, a line of a recipe). Default: zero is allowed. */
  positive?: boolean | undefined;
  placeholder?: string | undefined;
}

/**
 * A quantity of an article. The person types «2.5» and picks the unit next to the field, or
 * types «2.5 kg» or «750 g» as on a delivery note. Under the field stands what the app
 * understood, whenever that differs from what was typed («= 2.5 kg»).
 */
export function QuantityField({
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
  unit,
  value,
  onChange,
  entryUnit,
  positive = false,
  placeholder,
}: QuantityFieldProps) {
  const group = useId();
  const options = ENTRY_UNITS[unit];
  const [chosen, setChosen] = useState<EntryUnit>(() => entryFor(unit, value, entryUnit).id);
  const [lastUnit, setLastUnit] = useState(unit);
  let entryId = chosen;
  // Another article, another base unit: the switch starts over, and the text is written anew
  // from the value (`resetKey` below), so both always say the same.
  if (unit !== lastUnit) {
    entryId = entryFor(unit, value, entryUnit).id;
    setLastUnit(unit);
    setChosen(entryId);
  }
  const entry = options.find((option) => option.id === entryId) ?? LARGEST[unit];

  const read = (text: string, fallback: EntryOption) =>
    parseQuantityInput(withoutTrailingMark(text), unit, fallback.id);
  const accept = (quantity: number | null) =>
    quantity === null || (positive && quantity === 0) ? null : quantity;

  const {
    ref,
    text,
    parsed,
    error: shown,
    commit,
    set,
    onBlur,
    onInvalid,
  } = useParsedText<number>({
    value,
    onChange,
    parse: (text) => accept(read(text, entry)),
    format: (quantity) => formatDecimal(quantity / entry.factor, { digits: 6, group: false }),
    problem: (text) =>
      read(text, entry) === 0 ? formMessages.quantity.zero : formMessages.quantity.unreadable[unit],
    resetKey: unit,
    error,
    required,
  });

  // A unit typed into the field wins over the switch, and the switch shows it.
  const typedUnit = options.find(
    (option) =>
      TYPED_UNIT.test(text) &&
      tidy(text).endsWith(` ${option.label.toLowerCase().replace(/\.$/, '')}`),
  );
  const shownEntry = typedUnit ?? entry;

  function switchTo(next: EntryOption) {
    setChosen(next.id);
    // The number stays, its meaning changes: «500» in kg becomes «500» in g.
    const number = text.replace(/\s*[a-zA-Zäöü.]+\s*$/, '');
    set(number, number.trim() === '' ? null : accept(read(number, next)));
  }

  let info: string | null = null;
  if (parsed !== null) {
    const understood = formatQuantity(parsed, unit);
    const typed = TYPED_UNIT.test(text) ? text : `${text} ${entry.label}`;
    info = tidy(typed) === tidy(understood) ? null : formMessages.quantity.parsed(understood);
  }

  return (
    <Field
      label={label}
      hint={hint}
      error={shown}
      info={info}
      hideLabel={hideLabel}
      optional={optional}
      id={id}
      className={className}
    >
      {(control) => (
        <div className="flex min-w-0 gap-2">
          <InputBox
            controlId={control.id}
            invalid={shown !== undefined}
            disabled={disabled}
            suffix={options.length === 1 ? entry.label : undefined}
            className="flex-1"
          >
            <input
              {...control}
              aria-describedby={joinIds(
                control['aria-describedby'],
                options.length === 1 && affixId(control.id, 'suffix'),
              )}
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
              className={`${BOXED_INPUT_CLASS} ${options.length === 1 ? 'pr-2' : ''}`}
            />
          </InputBox>
          {options.length > 1 ? (
            <fieldset disabled={disabled} className="relative min-w-0 shrink-0">
              <legend className="sr-only">{formMessages.quantity.unitOf(label)}</legend>
              <div className="grid h-full auto-cols-fr grid-flow-col gap-0.5 rounded-xl bg-surface-muted p-0.5">
                {options.map((option) => {
                  const checked = option.id === shownEntry.id;
                  return (
                    <label
                      key={option.id}
                      className={`relative flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-[0.625rem] px-2 text-[0.9375rem] font-semibold transition-colors has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-wine-600 has-disabled:cursor-not-allowed has-disabled:opacity-60 ${
                        checked ? 'bg-wine-700 text-white shadow-card' : 'text-ink hover:bg-surface'
                      }`}
                    >
                      <input
                        type="radio"
                        name={group}
                        value={option.id}
                        checked={checked}
                        onChange={() => {
                          switchTo(option);
                        }}
                        className="sr-only"
                      />
                      {option.label}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ) : null}
        </div>
      )}
    </Field>
  );
}
