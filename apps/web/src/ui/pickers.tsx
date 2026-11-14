import {
  ARTICLE_CATEGORIES,
  courseLabel,
  formatQuantity,
  ORIGIN_COUNTRIES,
  priceUnitLabel,
  type AreaKind,
  type ArticleCategoryId,
  type ArticleRef,
  type Id,
  type RecipeKind,
  type RecipeRef,
} from '@randen/core';
import { Check, ChevronsUpDown } from 'lucide-react';
import { useEffect, useId, useState, type KeyboardEvent } from 'react';
import { useQuery } from '../app/hooks';
import {
  BOXED_INPUT_CLASS,
  Field,
  firstError,
  InputBox,
  useSubmitGuard,
  type FieldBaseProps,
} from './Field';
import { formMessages } from './messages.forms';
import { SelectField } from './SelectField';

const t = formMessages.pickers;

export interface ComboboxOption<TValue extends string> {
  value: TValue;
  label: string;
  /** A quiet second line: unit and stock of an article, course and portions of a recipe. */
  detail?: string | undefined;
  /** Further words the search finds, which are not shown. */
  keywords?: string | undefined;
}

export interface ComboboxProps<TValue extends string> extends FieldBaseProps {
  options: readonly ComboboxOption<TValue>[];
  /** The chosen value, or null while nothing is chosen or the text matches no entry. */
  value: TValue | null;
  onChange: (value: TValue | null) => void;
  placeholder?: string | undefined;
}

/** How many entries the list shows at once; typing narrows it down. */
const LIST_LIMIT = 50;

/** «Entrecôte» is found by «entrecote», «Käse» by «kase» and by «KÄSE». */
function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('de-CH').trim();
}

function search<TValue extends string>(
  options: readonly ComboboxOption<TValue>[],
  query: string,
): readonly ComboboxOption<TValue>[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  const [first] = words;
  if (first === undefined) {
    return options;
  }
  const hits = options.filter((option) => {
    const haystack = fold(`${option.label} ${option.keywords ?? ''}`);
    return words.every((word) => haystack.includes(word));
  });
  // The entry typed out in full comes first, then what starts with the typed word; the order
  // inside each group stays.
  const whole = fold(query);
  const rank = (option: ComboboxOption<TValue>) => {
    const name = fold(option.label);
    return name === whole ? 0 : name.startsWith(first) ? 1 : 2;
  };
  return [0, 1, 2].flatMap((group) => hits.filter((option) => rank(option) === group));
}

/**
 * A text field that searches a long list while the person types (articles, recipes), built
 * after the ARIA combobox pattern: arrow keys walk the list, Enter takes the marked entry,
 * Escape closes the list. The value always follows the text: an entry picked or typed out in
 * full is the value, anything else is null and gets a message, never a silent guess.
 */
export function Combobox<TValue extends string>({
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
  placeholder,
}: ComboboxProps<TValue>) {
  const listId = useId();
  /** What the person is typing; null while the field simply shows the chosen entry. */
  const [draft, setDraft] = useState<string | null>(null);
  const [lastValue, setLastValue] = useState(value);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [touched, setTouched] = useState(false);

  const exact = (source: string) => options.find((option) => fold(option.label) === fold(source));

  // The value is a new one (a loaded row, a reset form): drop what was being typed, unless it
  // is the form's answer to exactly that text.
  if (value !== lastValue) {
    setLastValue(value);
    if (draft !== null && (exact(draft)?.value ?? null) !== value) {
      setDraft(null);
    }
  }

  const chosen = options.find((option) => option.value === value);
  const text = draft ?? chosen?.label ?? '';
  const matches = search(options, draft ?? '');
  const visible = matches.slice(0, LIST_LIMIT);
  const expanded = open && visible.length > 0;
  const activeIndex = expanded && active >= 0 && active < visible.length ? active : -1;
  const optionId = (index: number) => `${listId}-${String(index)}`;

  const unknown = draft !== null && draft.trim() !== '' && exact(draft) === undefined;
  const missing = required && chosen === undefined && !unknown;
  const { ref, submitted, onInvalid } = useSubmitGuard<HTMLInputElement>(
    unknown ? t.unknown : missing ? formMessages.required : null,
  );
  const outer = firstError(error);
  const shown = unknown
    ? touched || submitted || outer !== undefined
      ? t.unknown
      : undefined
    : (outer ?? (submitted && missing ? formMessages.required : undefined));

  useEffect(() => {
    if (activeIndex < 0) {
      return;
    }
    const element = document.getElementById(`${listId}-${String(activeIndex)}`);
    // Test environments have no layout and no scrolling.
    if (element !== null && typeof element.scrollIntoView === 'function') {
      element.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex, listId]);

  function report(next: TValue | null) {
    if (next !== value) {
      onChange(next);
    }
  }

  function type(next: string) {
    setDraft(next);
    setOpen(true);
    setActive(next.trim() === '' ? -1 : 0);
    report(exact(next)?.value ?? null);
  }

  function pick(option: ComboboxOption<TValue>) {
    setDraft(null);
    setOpen(false);
    setActive(-1);
    report(option.value);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    // While a character is being composed (accents, other scripts) the keys belong to that.
    if (event.nativeEvent.isComposing) {
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (visible.length === 0) {
        return;
      }
      // With nothing marked yet, down starts at the first entry and up at the last.
      const step = event.key === 'ArrowDown' ? 1 : -1;
      const from = activeIndex >= 0 ? activeIndex : event.key === 'ArrowDown' ? -1 : 0;
      setOpen(true);
      setActive((from + step + visible.length) % visible.length);
      return;
    }
    if (event.key === 'Enter') {
      const option = visible[activeIndex];
      if (option !== undefined) {
        // The marked entry is taken; the form is not sent by the same key.
        event.preventDefault();
        pick(option);
      }
      return;
    }
    if (event.key === 'Escape' && open) {
      // Closes the list only, not a dialog around the field.
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      setActive(-1);
    }
  }

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
          <InputBox controlId={control.id} invalid={shown !== undefined} disabled={disabled}>
            <input
              {...control}
              ref={ref}
              name={name}
              type="text"
              role="combobox"
              aria-expanded={expanded}
              aria-controls={expanded ? listId : undefined}
              aria-autocomplete="list"
              aria-activedescendant={activeIndex < 0 ? undefined : optionId(activeIndex)}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              placeholder={placeholder}
              required={required}
              disabled={disabled}
              value={text}
              onChange={(event) => {
                type(event.target.value);
              }}
              onClick={() => {
                setOpen(true);
              }}
              onKeyDown={onKeyDown}
              onBlur={() => {
                setOpen(false);
                setActive(-1);
                setTouched(true);
                // Typed out in full, or emptied: the field shows the entry as it is written.
                if (draft !== null && !unknown) {
                  setDraft(null);
                }
              }}
              onInvalid={onInvalid}
              className={`${BOXED_INPUT_CLASS} pr-1 font-sans`}
            />
            <button
              type="button"
              tabIndex={-1}
              disabled={disabled}
              onMouseDown={(event) => {
                // The focus stays in the field, so the keyboard keeps working.
                event.preventDefault();
              }}
              onClick={() => {
                ref.current?.focus();
                setOpen(!open);
              }}
              className="relative inline-flex size-11 shrink-0 items-center justify-center rounded-[0.625rem] text-ink-muted hover:text-ink disabled:cursor-not-allowed"
            >
              <ChevronsUpDown size={18} aria-hidden="true" />
              <span className="sr-only">{t.showList(label)}</span>
            </button>
          </InputBox>
          {expanded ? (
            <div className="absolute inset-x-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-xl border border-line bg-surface py-1 shadow-float">
              <ul id={listId} role="listbox" aria-label={t.suggestions}>
                {visible.map((option, index) => (
                  <li
                    key={option.value}
                    id={optionId(index)}
                    role="option"
                    aria-selected={index === activeIndex}
                    onMouseDown={(event) => {
                      event.preventDefault();
                    }}
                    onClick={() => {
                      pick(option);
                    }}
                    className={`flex min-h-11 cursor-pointer items-center justify-between gap-3 px-4 py-2 ${
                      index === activeIndex ? 'bg-surface-muted' : 'hover:bg-surface-muted'
                    }`}
                  >
                    <span className="min-w-0">
                      <span className={`block ${option.value === value ? 'font-semibold' : ''}`}>
                        {option.label}
                      </span>
                      {option.detail === undefined ? null : (
                        <span className="block text-sm text-ink-muted tabular-nums">
                          {option.detail}
                        </span>
                      )}
                    </span>
                    {option.value === value ? (
                      <span className="relative shrink-0 text-wine-700">
                        <Check size={20} aria-hidden="true" />
                        <span className="sr-only">{t.chosen}</span>
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
              {matches.length > visible.length ? (
                <p className="px-4 py-2 text-sm text-ink-muted">
                  {t.more(matches.length - visible.length)}
                </p>
              ) : null}
            </div>
          ) : open && draft !== null && draft.trim() !== '' ? (
            <p
              role="status"
              className="absolute inset-x-0 top-full z-30 mt-1 rounded-xl border border-line bg-surface px-4 py-3 text-sm text-ink-muted shadow-float"
            >
              {t.noMatch}
            </p>
          ) : null}
        </div>
      )}
    </Field>
  );
}

/** What the pickers share with every field; the label has a default («Artikel», «Lieferant»). */
type PickerBaseProps = Omit<FieldBaseProps, 'label'> & {
  label?: string | undefined;
  placeholder?: string | undefined;
};

export interface ArticlePickerProps extends PickerBaseProps {
  value: Id | null;
  /** Gets the id and, for unit, price and allergens, the article itself. */
  onChange: (value: Id | null, article: ArticleRef | null) => void;
  /** Narrows the list: only bought goods, only one supplier, only what is in stock. */
  filter?: ((article: ArticleRef) => boolean) | undefined;
  /** Also offers articles that are no longer active. */
  includeInactive?: boolean | undefined;
}

/** What the list says under the name of an article: «kg · 4 kg an Lager». */
function articleDetail(article: ArticleRef): string {
  const stock =
    article.stock > 0 ? t.inStock(formatQuantity(article.stock, article.unit)) : t.noStock;
  return `${priceUnitLabel(article.unit)} · ${stock}`;
}

/** Finds an article by typing: every article with its unit and what is in stock. */
export function ArticlePicker({
  label = t.article,
  value,
  onChange,
  filter,
  includeInactive = false,
  ...base
}: ArticlePickerProps) {
  const data = useQuery('lookup.articles', { includeInactive });
  const articles = (data?.articles ?? []).filter((article) => filter?.(article) ?? true);
  return (
    <Combobox
      {...base}
      label={label}
      options={articles.map((article) => ({
        value: article.id,
        label: article.name,
        detail: articleDetail(article),
      }))}
      value={value}
      onChange={(next) => {
        onChange(next, articles.find((article) => article.id === next) ?? null);
      }}
    />
  );
}

export interface RecipePickerProps extends PickerBaseProps {
  value: Id | null;
  onChange: (value: Id | null, recipe: RecipeRef | null) => void;
  /** Only dishes (sold by the portion) or only components (mise en place). */
  kind?: RecipeKind | undefined;
  includeInactive?: boolean | undefined;
}

/** Finds a recipe by typing: dishes with course and portions, components marked as such. */
export function RecipePicker({
  label = t.recipe,
  value,
  onChange,
  kind,
  includeInactive = false,
  ...base
}: RecipePickerProps) {
  const data = useQuery('lookup.recipes', { includeInactive });
  const recipes = (data?.recipes ?? []).filter(
    (recipe) => kind === undefined || recipe.kind === kind,
  );
  return (
    <Combobox
      {...base}
      label={label}
      options={recipes.map((recipe) => ({
        value: recipe.id,
        label: recipe.name,
        detail:
          recipe.kind === 'component'
            ? t.component
            : `${courseLabel(recipe.course)} · ${t.portions(recipe.portions)}`,
      }))}
      value={value}
      onChange={(next) => {
        onChange(next, recipes.find((recipe) => recipe.id === next) ?? null);
      }}
    />
  );
}

export interface IdPickerProps extends PickerBaseProps {
  value: Id | null;
  onChange: (value: Id | null) => void;
}

/** A storage area: cold room, freezer, dry store. `kinds` narrows the list. */
export function AreaPicker({
  label = t.area,
  kinds,
  ...rest
}: IdPickerProps & { kinds?: readonly AreaKind[] | undefined }) {
  const areas = useQuery('lookup.areas', {})?.areas ?? [];
  return (
    <SelectField
      {...rest}
      label={label}
      options={areas
        .filter((area) => kinds?.includes(area.kind) ?? true)
        .map((area) => ({ value: area.id, label: area.name }))}
    />
  );
}

/**
 * A named spot inside one storage area («Regal 1, oben»). Without an area, or in an area
 * without spots, the field rests and says why.
 */
export function SpotPicker({
  label = t.spot,
  areaId,
  placeholder = t.noSpot,
  hint,
  disabled = false,
  ...rest
}: IdPickerProps & { areaId: Id | null }) {
  const areas = useQuery('lookup.areas', {})?.areas;
  const spots = areas?.find((area) => area.id === areaId)?.spots ?? [];
  const reason =
    areaId === null
      ? t.chooseAreaFirst
      : areas !== undefined && spots.length === 0
        ? t.noSpots
        : undefined;
  return (
    <SelectField
      {...rest}
      label={label}
      placeholder={placeholder}
      hint={reason ?? hint}
      disabled={disabled || reason !== undefined}
      options={spots.map((spot) => ({ value: spot.id, label: spot.name }))}
    />
  );
}

export function SupplierPicker({ label = t.supplier, ...rest }: IdPickerProps) {
  const suppliers = useQuery('lookup.suppliers', {})?.suppliers ?? [];
  return (
    <SelectField
      {...rest}
      label={label}
      options={suppliers.map((supplier) => ({ value: supplier.id, label: supplier.name }))}
    />
  );
}

/** A person of the team: who received, produced, measured. */
export function StaffPicker({
  label = t.staff,
  includeInactive = false,
  ...rest
}: IdPickerProps & { includeInactive?: boolean | undefined }) {
  const staff = useQuery('lookup.staff', { includeInactive })?.staff ?? [];
  return (
    <SelectField
      {...rest}
      label={label}
      options={staff.map((person) => ({ value: person.id, label: person.name }))}
    />
  );
}

const CATEGORY_OPTIONS = ARTICLE_CATEGORIES.map((category) => ({
  value: category.id,
  label: category.label,
}));

export interface CategoryPickerProps extends PickerBaseProps {
  value: ArticleCategoryId | null;
  onChange: (value: ArticleCategoryId | null) => void;
}

/** The group of goods of an article: meat, dairy, dry goods. */
export function CategoryPicker({ label = t.category, ...rest }: CategoryPickerProps) {
  return <SelectField {...rest} label={label} options={CATEGORY_OPTIONS} />;
}

const COUNTRY_OPTIONS = ORIGIN_COUNTRIES.map((country) => ({
  value: country.code,
  label: country.name,
}));

export interface CountryPickerProps extends PickerBaseProps {
  /** ISO 3166-1 alpha-2, e.g. `CH`. */
  value: string | null;
  onChange: (value: string | null) => void;
}

/** The country of origin of meat and fish, Switzerland first. */
export function CountryPicker({ label = t.country, ...rest }: CountryPickerProps) {
  return <SelectField {...rest} label={label} options={COUNTRY_OPTIONS} />;
}
