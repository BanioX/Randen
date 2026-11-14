import { CircleAlert } from 'lucide-react';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
  type RefObject,
  type SyntheticEvent,
} from 'react';
import { formMessages } from './messages.forms';

/** What every field of the kit accepts. */
export interface FieldBaseProps {
  label: string;
  /** Help under the field, always visible. */
  hint?: string | undefined;
  /**
   * An error the form found, e.g. after «Sichern». Input the field cannot read shows the
   * field's own message first.
   */
  error?: string | null | undefined;
  /** Keeps the label for screen readers only, when a heading or a column already says it. */
  hideLabel?: boolean | undefined;
  /** Shows «optional» next to the label. */
  optional?: boolean | undefined;
  /** A form with a submit button is not sent while the field is empty; the field then says so. */
  required?: boolean | undefined;
  disabled?: boolean | undefined;
  /** For forms that need a fixed id; generated otherwise. */
  id?: string | undefined;
  name?: string | undefined;
  /** Classes of the outer element, for the place in a grid (`sm:col-span-2`). */
  className?: string | undefined;
}

/** What `Field` hands to its control: spread it onto the input, select or textarea. */
export interface FieldControl {
  id: string;
  'aria-describedby': string | undefined;
  'aria-invalid': true | undefined;
}

/** The label of every field and group: 13 px, semibold, quiet. */
export const FIELD_LABEL_CLASS = 'text-[0.8125rem] leading-snug font-semibold text-ink-muted';

/**
 * The id of the visible label of a field. Controls next to the field (the calendar button, the
 * quick choices) point at it with `aria-describedby`: they keep a short name of their own, so a
 * search for the label finds the field alone.
 */
export function fieldLabelId(controlId: string): string {
  return `${controlId}-label`;
}

/** Ids for `aria-describedby`, without the ones that are not there. */
export function joinIds(...ids: (string | false | null | undefined)[]): string | undefined {
  const present = ids.filter((id): id is string => typeof id === 'string' && id !== '');
  return present.length === 0 ? undefined : present.join(' ');
}

function hasText(text: string | null | undefined): text is string {
  return typeof text === 'string' && text !== '';
}

/** The first error that is there: the field's own message wins over the one of the form. */
export function firstError(...errors: (string | false | null | undefined)[]): string | undefined {
  return errors.find((error): error is string => typeof error === 'string' && error !== '');
}

/**
 * The look of a bare control (input, select, textarea): at least 48 px high, 12 px radius, a
 * border that can be seen (3:1), vermilion when something is wrong. The focus ring is the
 * global one in Rotwein.
 */
export function controlClass(invalid: boolean): string {
  return `min-h-12 w-full min-w-0 rounded-xl border bg-surface px-4 text-ink placeholder:text-ink-muted disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-ink-muted ${
    invalid ? 'border-danger' : 'border-line-strong'
  }`;
}

/** An input inside an `InputBox`: the box draws border and focus ring. */
export const BOXED_INPUT_CLASS =
  'min-h-11 min-w-0 flex-1 self-stretch rounded-xl bg-transparent px-4 text-ink tabular-nums outline-none placeholder:text-ink-muted disabled:cursor-not-allowed disabled:text-ink-muted';

/** The message of a field that has a problem: vermilion, with a symbol, never colour alone. */
export function FieldError({ id, children }: { id: string; children: string }) {
  return (
    <p id={id} className="mt-1.5 flex items-start gap-1.5 text-sm text-danger">
      <CircleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
      <span className="min-w-0">{children}</span>
    </p>
  );
}

function FieldNotes({
  ids,
  error,
  info,
  hint,
}: {
  ids: { error: string; info: string; hint: string };
  error: string | null | undefined;
  info: string | null | undefined;
  hint: string | undefined;
}) {
  return (
    <>
      {/* Always in the page, so screen readers hear a message the moment it appears. */}
      <div aria-live="polite">
        {hasText(error) ? (
          <FieldError id={ids.error}>{error}</FieldError>
        ) : hasText(info) ? (
          <p id={ids.info} className="mt-1.5 text-sm text-ink-muted tabular-nums">
            {info}
          </p>
        ) : null}
      </div>
      {hasText(hint) ? (
        <p id={ids.hint} className="mt-1.5 text-sm text-ink-muted">
          {hint}
        </p>
      ) : null}
    </>
  );
}

function useNoteIds(id: string | undefined) {
  const generated = useId();
  const base = id ?? generated;
  return {
    base,
    error: `${base}-error`,
    info: `${base}-info`,
    hint: `${base}-hint`,
    optional: `${base}-optional`,
  };
}

export interface FieldProps {
  label: string;
  /** Quiet words after the label that belong to its name: «pro kg». */
  labelSuffix?: string | undefined;
  hint?: string | undefined;
  error?: string | null | undefined;
  /** A line under the control that follows the input: «= 2.5 kg», the weekday of a date. */
  info?: string | null | undefined;
  hideLabel?: boolean | undefined;
  optional?: boolean | undefined;
  id?: string | undefined;
  className?: string | undefined;
  children: (control: FieldControl) => ReactNode;
}

/**
 * Label, control, hint and error of one field, wired for screen readers: the label points at
 * the control, error, info and hint describe it, and `aria-invalid` is set while an error shows.
 * Every field of the kit is built on it; use it directly for a control the kit does not have.
 */
export function Field({
  label,
  labelSuffix,
  hint,
  error,
  info,
  hideLabel = false,
  optional = false,
  id,
  className = '',
  children,
}: FieldProps) {
  const ids = useNoteIds(id);
  const invalid = hasText(error);
  const control: FieldControl = {
    id: ids.base,
    'aria-describedby': joinIds(
      invalid && ids.error,
      !invalid && hasText(info) && ids.info,
      hasText(hint) && ids.hint,
      optional && ids.optional,
    ),
    'aria-invalid': invalid ? true : undefined,
  };
  return (
    <div className={`relative min-w-0 ${className}`}>
      <div className={hideLabel ? 'sr-only' : 'mb-1.5 flex items-baseline justify-between gap-3'}>
        <label id={fieldLabelId(ids.base)} htmlFor={ids.base} className={FIELD_LABEL_CLASS}>
          {label}
          {hasText(labelSuffix) ? <span className="font-normal"> {labelSuffix}</span> : null}
        </label>
        {optional ? (
          <span id={ids.optional} className="shrink-0 text-[0.8125rem] text-ink-muted">
            {formMessages.optional}
          </span>
        ) : null}
      </div>
      {children(control)}
      <FieldNotes ids={ids} error={error} info={info} hint={hint} />
    </div>
  );
}

export interface FieldGroupProps {
  legend: string;
  hideLegend?: boolean | undefined;
  hint?: string | undefined;
  error?: string | null | undefined;
  disabled?: boolean | undefined;
  className?: string | undefined;
  children: ReactNode;
}

/**
 * Several controls under one name (chips, the two photo buttons): a fieldset with the same
 * label, hint and error as a single field.
 */
export function FieldGroup({
  legend,
  hideLegend = false,
  hint,
  error,
  disabled = false,
  className = '',
  children,
}: FieldGroupProps) {
  const ids = useNoteIds(undefined);
  const invalid = hasText(error);
  return (
    <fieldset
      disabled={disabled}
      aria-describedby={joinIds(invalid && ids.error, hasText(hint) && ids.hint)}
      className={`relative min-w-0 ${className}`}
    >
      <legend className={hideLegend ? 'sr-only' : `mb-1.5 ${FIELD_LABEL_CLASS}`}>{legend}</legend>
      {children}
      <FieldNotes ids={ids} error={error} info={null} hint={hint} />
    </fieldset>
  );
}

function focusControl(event: MouseEvent<HTMLElement>) {
  // A tap on «CHF» or «°C» belongs to the field next to it.
  event.preventDefault();
  event.currentTarget.parentElement?.querySelector('input')?.focus();
}

/** The id of the words in front of or behind a boxed input, for `aria-describedby`. */
export function affixId(controlId: string, side: 'prefix' | 'suffix'): string {
  return `${controlId}-${side}`;
}

/**
 * The frame of an input with words in front («CHF») or behind («°C», «Stk.»). The frame carries
 * border and focus ring, the input inside uses `BOXED_INPUT_CLASS`.
 */
export function InputBox({
  controlId,
  invalid,
  disabled = false,
  prefix,
  suffix,
  className = '',
  children,
}: {
  controlId: string;
  invalid: boolean;
  disabled?: boolean | undefined;
  prefix?: string | undefined;
  suffix?: string | undefined;
  className?: string | undefined;
  children: ReactNode;
}) {
  return (
    <div
      className={`flex min-h-12 min-w-0 items-center rounded-xl border has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-wine-600 ${
        invalid ? 'border-danger' : 'border-line-strong'
      } ${disabled ? 'bg-surface-muted' : 'bg-surface'} ${className}`}
    >
      {hasText(prefix) ? (
        <span
          id={affixId(controlId, 'prefix')}
          onMouseDown={focusControl}
          className="shrink-0 pl-4 text-ink-muted select-none"
        >
          {prefix}
        </span>
      ) : null}
      {children}
      {hasText(suffix) ? (
        <span
          id={affixId(controlId, 'suffix')}
          onMouseDown={focusControl}
          className="shrink-0 pr-4 text-ink-muted select-none"
        >
          {suffix}
        </span>
      ) : null}
    </div>
  );
}

type Validatable = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

function isInvalidControl(element: Element): boolean {
  return (
    (element instanceof HTMLInputElement ||
      element instanceof HTMLSelectElement ||
      element instanceof HTMLTextAreaElement) &&
    element.willValidate &&
    !element.validity.valid
  );
}

export interface SubmitGuard<TElement extends Validatable> {
  ref: RefObject<TElement | null>;
  /** True once a form tried to send the field with a problem. */
  submitted: boolean;
  onInvalid: (event: SyntheticEvent<TElement>) => void;
}

/**
 * Keeps a form from being sent while a field has a problem (empty but required, or text the
 * field cannot read). The control reports the problem to the browser's own form check, so a
 * `<form>` with a submit button stops by itself; instead of the browser's bubble the field shows
 * its message, and the first field with a problem takes the focus. Nothing a person typed is
 * dropped without a word.
 */
export function useSubmitGuard<TElement extends Validatable>(
  problem: string | null,
): SubmitGuard<TElement> {
  const ref = useRef<TElement>(null);
  const [submitted, setSubmitted] = useState(false);
  useEffect(() => {
    ref.current?.setCustomValidity(problem ?? '');
  }, [problem]);
  const onInvalid = (event: SyntheticEvent<TElement>) => {
    event.preventDefault();
    setSubmitted(true);
    const control = event.currentTarget;
    if (Array.from(control.form?.elements ?? []).find(isInvalidControl) === control) {
      control.focus();
    }
  };
  return { ref, submitted, onInvalid };
}

/** A decimal mark left at the end while typing («12.») is not an error. */
export function withoutTrailingMark(text: string): string {
  return text.trim().replace(/(?<=\d)[.,]$/, '');
}

export interface ParsedTextOptions<TValue extends string | number> {
  value: TValue | null;
  onChange: (value: TValue | null) => void;
  /** Reads a text that is not empty; null if it cannot be read. */
  parse: (text: string) => TValue | null;
  /** The text for a value that comes from outside (a stored value, a reset form). */
  format: (value: TValue) => string;
  /** Says what is wrong with a text `parse` gave up on. */
  problem: (text: string) => string;
  /**
   * What the text is measured in (the unit of the article). When it changes, the same value
   * reads differently, so the text is written anew from the value.
   */
  resetKey?: string | undefined;
  error?: string | null | undefined;
  required?: boolean | undefined;
}

export interface ParsedText<TValue extends string | number> extends SubmitGuard<HTMLInputElement> {
  /** What stands in the input: the raw text of the person. */
  text: string;
  /** The value of that text; null while it is empty or cannot be read. */
  parsed: TValue | null;
  /** The message to show under the field right now, if any. */
  error: string | undefined;
  /** Takes a new text (typed, or picked from a quick choice) and reports its value. */
  commit: (text: string) => void;
  /** Sets text and value together, when the caller knows the value better than `parse` does. */
  set: (text: string, value: TValue | null) => void;
  onBlur: () => void;
}

/**
 * The engine of every field that reads a value out of text. The field keeps the raw text;
 * `onChange` gets the value, or null while the text is empty or cannot be read. Unreadable text
 * is never dropped silently: the message appears when the person leaves the field, when a form
 * tries to send it, or as soon as the form passes an error of its own.
 */
export function useParsedText<TValue extends string | number>({
  value,
  onChange,
  parse,
  format,
  problem,
  resetKey,
  error,
  required = false,
}: ParsedTextOptions<TValue>): ParsedText<TValue> {
  const [text, setText] = useState(() => (value === null ? '' : format(value)));
  const [lastValue, setLastValue] = useState(value);
  const [lastReset, setLastReset] = useState(resetKey);
  const [touched, setTouched] = useState(false);

  const read = (source: string) => (source.trim() === '' ? null : parse(source));

  // Another unit: the same value reads differently, so the text is written anew from it.
  if (resetKey !== lastReset) {
    setLastReset(resetKey);
    setLastValue(value);
    setText(value === null ? '' : format(value));
  }
  // The value is a new one (a loaded row, a reset form, or the form's answer to what was just
  // typed): show it, unless the text already means the same. A form that keeps its old value
  // changes nothing here, so the text of the person stays as typed.
  // `Object.is`: a NaN handed in by mistake must not start an endless loop of renders.
  if (resetKey === lastReset && !Object.is(value, lastValue)) {
    setLastValue(value);
    if (read(text) !== value) {
      setText(value === null ? '' : format(value));
    }
  }

  const parsed = read(text);
  const blank = text.trim() === '';
  const unreadable = !blank && parsed === null;
  const own = unreadable ? problem(text) : required && blank ? formMessages.required : null;
  const { ref, submitted, onInvalid } = useSubmitGuard<HTMLInputElement>(own);

  const set = (next: string, nextValue: TValue | null) => {
    setText(next);
    onChange(nextValue);
  };

  const outer = firstError(error);
  const shown = unreadable
    ? touched || submitted || outer !== undefined
      ? (own ?? undefined)
      : undefined
    : (outer ?? (submitted && own !== null ? own : undefined));

  return {
    ref,
    submitted,
    onInvalid,
    text,
    parsed,
    error: shown,
    commit: (next) => {
      set(next, read(next));
    },
    set,
    onBlur: () => {
      setTouched(true);
    },
  };
}

export interface ParsedFieldProps<TValue extends string | number>
  extends FieldBaseProps, Omit<ParsedTextOptions<TValue>, 'error' | 'required'> {
  labelSuffix?: string | undefined;
  inputMode: 'numeric' | 'decimal' | 'text';
  prefix?: string | undefined;
  suffix?: string | undefined;
  placeholder?: string | undefined;
  /** A line under the field for a readable value, when it says more than the text itself. */
  info?: ((value: TValue, text: string) => string | null) | undefined;
}

/** One text input that reads a value: the body of the number, money, price and percent fields. */
export function ParsedField<TValue extends string | number>({
  label,
  labelSuffix,
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
  parse,
  format,
  problem,
  resetKey,
  inputMode,
  prefix,
  suffix,
  placeholder,
  info,
}: ParsedFieldProps<TValue>) {
  const {
    ref,
    text,
    parsed,
    error: shown,
    commit,
    onBlur,
    onInvalid,
  } = useParsedText({ value, onChange, parse, format, problem, resetKey, error, required });
  return (
    <Field
      label={label}
      labelSuffix={labelSuffix}
      hint={hint}
      error={shown}
      info={parsed === null ? null : info?.(parsed, text)}
      hideLabel={hideLabel}
      optional={optional}
      id={id}
      className={className}
    >
      {(control) => (
        <InputBox
          controlId={control.id}
          invalid={shown !== undefined}
          disabled={disabled}
          prefix={prefix}
          suffix={suffix}
        >
          <input
            {...control}
            aria-describedby={joinIds(
              control['aria-describedby'],
              hasText(prefix) && affixId(control.id, 'prefix'),
              hasText(suffix) && affixId(control.id, 'suffix'),
            )}
            ref={ref}
            name={name}
            type="text"
            inputMode={inputMode}
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
            className={`${BOXED_INPUT_CLASS} ${hasText(prefix) ? 'pl-2' : ''} ${
              hasText(suffix) ? 'pr-2' : ''
            }`}
          />
        </InputBox>
      )}
    </Field>
  );
}
