import {
  allergenLabel,
  articleCategory,
  COURSES,
  CommandError,
  courseLabel,
  DishLabelSchema,
  dishLabelText,
  formatPercent,
  formatQuantity,
  formatUnitPrice,
  IdSchema,
  milliToRappen,
  VAT_RATES_CH,
  type AllergenId,
  type ArticleRef,
  type Course,
  type DishLabel,
  type Id,
  type OperationOutput,
  type Rappen,
  type RecipeKind,
  type Unit,
} from '@randen/core';
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type SyntheticEvent,
} from 'react';
import { useNavigate, useParams } from 'react-router';
import {
  errorText,
  isNotFound,
  useCommand,
  useMoney,
  useQuery,
  useQueryResult,
} from '../../app/hooks';
import { NotFoundPage } from '../../app/NotFoundPage';
import { paths } from '../../app/paths';
import { AllergenPicker } from '../../ui/AllergenPicker';
import { MarginBadge } from '../../ui/badges';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { ChoiceChips, MultiChoiceChips } from '../../ui/ChoiceChips';
import { FormActions } from '../../ui/FormActions';
import { MoneyField } from '../../ui/MoneyField';
import { NumberField } from '../../ui/NumberField';
import { PageHeader } from '../../ui/PageHeader';
import { PhotoField } from '../../ui/PhotoField';
import { ArticlePicker } from '../../ui/pickers';
import { QuantityField, type EntryUnit } from '../../ui/QuantityField';
import { Section } from '../../ui/Section';
import { SelectField } from '../../ui/SelectField';
import { TextArea, TextField } from '../../ui/TextField';
import { useToast } from '../../ui/Toast';
import { liveBooks, liveFigures, NEW_ARTICLE_ID, NEW_RECIPE_ID } from './live';
import { recipesMessages } from './messages';
import { articleNameTaken, asError, loopOf } from './shared';

const t = recipesMessages.form;

type Editor = OperationOutput<'recipes.editor'>;
type StoredRecipe = NonNullable<Editor['recipe']>;

interface Line {
  key: string;
  articleId: Id | null;
  quantity: number | null;
  note: string;
}

interface Step {
  key: string;
  text: string;
}

/** What the form holds while the person types. */
interface Draft {
  name: string;
  kind: RecipeKind;
  course: Course;
  portions: number | null;
  outputQuantity: number | null;
  outputUnit: Unit;
  shelfLifeDays: number | null;
  description: string;
  photo: string | null;
  lines: Line[];
  steps: Step[];
  prepMinutes: number | null;
  priceRappen: Rappen | null;
  vatBps: number;
  extraAllergens: AllergenId[];
  extraTraces: AllergenId[];
  labels: DishLabel[];
}

let counter = 0;
/** A key for a row of the form, stable while rows move. */
const nextKey = () => {
  counter += 1;
  return `row-${String(counter)}`;
};

const emptyLine = (): Line => ({ key: nextKey(), articleId: null, quantity: null, note: '' });
const emptyStep = (): Step => ({ key: nextKey(), text: '' });

/** Shelf life a component made in house gets at first: the Richtwert of its group of goods. */
const PREPARED_SHELF_LIFE = articleCategory('prepared').shelfLifeDays;

function draftOf(editor: Editor): Draft {
  const recipe = editor.recipe;
  if (recipe === undefined) {
    return {
      name: '',
      kind: 'dish',
      course: 'main',
      portions: 1,
      outputQuantity: null,
      outputUnit: 'g',
      shelfLifeDays: PREPARED_SHELF_LIFE,
      description: '',
      photo: null,
      lines: [emptyLine()],
      steps: [emptyStep()],
      prepMinutes: null,
      priceRappen: null,
      vatBps: editor.defaultVatBps,
      extraAllergens: [],
      extraTraces: [],
      labels: [],
    };
  }
  return {
    name: recipe.name,
    kind: recipe.kind,
    course: recipe.course,
    portions: recipe.portions,
    outputQuantity: recipe.output?.quantity ?? null,
    outputUnit: recipe.output?.unit ?? 'g',
    shelfLifeDays: recipe.shelfLifeDays ?? null,
    description: recipe.description ?? '',
    photo: recipe.photo ?? null,
    lines: [
      ...recipe.ingredients.map((ingredient) => ({
        key: nextKey(),
        articleId: ingredient.articleId,
        quantity: ingredient.quantity,
        note: ingredient.note ?? '',
      })),
      emptyLine(),
    ],
    steps: [...recipe.steps.map((text) => ({ key: nextKey(), text })), emptyStep()],
    prepMinutes: recipe.prepMinutes ?? null,
    priceRappen: recipe.priceRappen ?? null,
    vatBps: recipe.vatBps,
    extraAllergens: recipe.extraAllergens,
    extraTraces: recipe.extraTraces,
    labels: recipe.labels,
  };
}

/** What a bare number in a line means at first: grams, decilitres, pieces. */
const ENTRY: Record<Unit, EntryUnit> = { g: 'g', ml: 'dl', pcs: 'stk' };

/** The row moved by one place, or the list as it was at the ends. */
function moved<TItem>(items: readonly TItem[], index: number, by: -1 | 1): TItem[] {
  const target = index + by;
  if (target < 0 || target >= items.length) {
    return [...items];
  }
  const next = [...items];
  const [item] = next.splice(index, 1);
  if (item !== undefined) {
    next.splice(target, 0, item);
  }
  return next;
}

const textOrNull = (text: string) => (text.trim() === '' ? null : text.trim());

/** Small square buttons to move and remove a row; reachable by keyboard, 44 px. */
function RowActions({
  what,
  first,
  last,
  onUp,
  onDown,
  onRemove,
}: {
  what: string;
  first: boolean;
  last: boolean;
  onUp: () => void;
  onDown: () => void;
  onRemove: () => void;
}) {
  const button =
    'inline-flex size-11 shrink-0 items-center justify-center rounded-xl text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink disabled:opacity-30';
  return (
    <span className="flex shrink-0 items-center gap-0.5">
      <button
        type="button"
        onClick={onUp}
        disabled={first}
        aria-label={t.moveUp(what)}
        className={button}
      >
        <ArrowUp size={20} aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={onDown}
        disabled={last}
        aria-label={t.moveDown(what)}
        className={button}
      >
        <ArrowDown size={20} aria-hidden="true" />
      </button>
      <button type="button" onClick={onRemove} aria-label={t.removeRow(what)} className={button}>
        <X size={20} aria-hidden="true" />
      </button>
    </span>
  );
}

interface RecipeFormProps {
  editor: Editor;
  recipe?: StoredRecipe | undefined;
}

function RecipeForm({ editor, recipe }: RecipeFormProps) {
  const money = useMoney();
  const run = useCommand();
  const navigate = useNavigate();
  const toast = useToast();
  const articles = useQuery('lookup.articles', { includeInactive: true })?.articles;

  const editing = recipe !== undefined;
  const [draft, setDraft] = useState<Draft>(() => draftOf(editor));
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // A new row or step takes the focus, so the next one can be typed right away.
  useEffect(() => {
    if (focus !== null) {
      formRef.current?.querySelector<HTMLElement>(`#${focus}`)?.focus();
    }
  }, [focus]);

  const change = (fields: Partial<Draft>) => {
    setDraft((current) => ({ ...current, ...fields }));
  };
  const changeLine = (key: string, fields: Partial<Line>) => {
    setDraft((current) => ({
      ...current,
      lines: current.lines.map((line) => (line.key === key ? { ...line, ...fields } : line)),
    }));
  };
  const changeStep = (key: string, text: string) => {
    setDraft((current) => ({
      ...current,
      steps: current.steps.map((step) => (step.key === key ? { ...step, text } : step)),
    }));
  };

  const dish = draft.kind === 'dish';
  const byId = useMemo(
    () => new Map<Id, ArticleRef>((articles ?? []).map((article) => [article.id, article])),
    [articles],
  );
  /** Articles the recipe held when it was opened stay pickable even when inactive. */
  const held = useMemo(
    () => new Set(recipe?.ingredients.map((ingredient) => ingredient.articleId) ?? []),
    [recipe],
  );
  const loops = useMemo(
    () => new Map(editor.loops.map((loop) => [loop.articleId, loop.path])),
    [editor.loops],
  );
  const books = useMemo(
    () => liveBooks(articles ?? [], editor.components, editor.origins),
    [articles, editor.components, editor.origins],
  );

  const ready = draft.lines.filter(
    (line): line is Line & { articleId: Id; quantity: number } =>
      line.articleId !== null && line.quantity !== null && line.quantity > 0,
  );
  const recipeId = recipe?.id ?? NEW_RECIPE_ID;
  const live = liveFigures(
    {
      id: recipeId,
      portions: dish ? Math.max(1, draft.portions ?? 1) : (recipe?.portions ?? 1),
      ingredients: ready.map(({ articleId, quantity }) => ({ articleId, quantity })),
      extraAllergens: draft.extraAllergens,
      extraTraces: draft.extraTraces,
      output:
        dish || draft.outputQuantity === null || draft.outputQuantity <= 0
          ? undefined
          : {
              articleId: recipe?.output?.articleId ?? NEW_ARTICLE_ID,
              quantity: draft.outputQuantity,
            },
    },
    books,
    {
      dish: dish
        ? {
            priceRappen: draft.priceRappen,
            vatBps: draft.vatBps,
            targetFoodCostBps: editor.targetFoodCostBps,
          }
        : undefined,
      outputUnit: dish ? undefined : draft.outputUnit,
    },
  );
  const costOf = new Map(ready.map((line, index) => [line.key, live.cost.lines[index]]));
  const loopRows = draft.lines.filter(
    (line) => line.articleId !== null && loops.has(line.articleId),
  );
  const derived = live.sources.filter((source) => !source.trace);
  const derivedTraces = live.sources.filter((source) => source.trace);
  const derivedIds = derived.map((source) => source.allergen);
  const missingNames = live.cost.missingPrices
    .map((articleId) => byId.get(articleId)?.name ?? recipesMessages.unknownArticle)
    .join(', ');

  const duplicate = failure instanceof CommandError && failure.code === 'duplicate_name';
  const loop = loopOf(failure);
  const failureText =
    failure === null || duplicate ? null : loop === undefined ? errorText(failure) : t.loop(loop);

  const vatOptions = [
    ...VAT_RATES_CH.map((rate) => ({ value: String(rate.bps), label: rate.label })),
    ...(VAT_RATES_CH.some((rate) => rate.bps === draft.vatBps)
      ? []
      : [{ value: String(draft.vatBps), label: t.vatOther(formatPercent(draft.vatBps)) }]),
  ];

  const back = editing ? paths.recipe(recipe.id) : paths.recipes();

  function addLine() {
    const line = emptyLine();
    setDraft((current) => ({ ...current, lines: [...current.lines, line] }));
    setFocus(`ingredient-${line.key}`);
  }

  function addStep() {
    const step = emptyStep();
    setDraft((current) => ({ ...current, steps: [...current.steps, step] }));
    setFocus(`step-${step.key}`);
  }

  /** Enter walks on: from the article to the quantity, to the note, to a new row. */
  function onLineKey(event: KeyboardEvent<HTMLElement>, line: Line, last: boolean) {
    const target = event.target as HTMLElement;
    if (event.key !== 'Enter' || event.defaultPrevented || target.tagName !== 'INPUT') {
      return;
    }
    if ((target as HTMLInputElement).type === 'radio') {
      return;
    }
    event.preventDefault();
    if (target.id === `ingredient-${line.key}`) {
      setFocus(null);
      formRef.current?.querySelector<HTMLElement>(`#quantity-${line.key}`)?.focus();
    } else if (target.id === `quantity-${line.key}`) {
      formRef.current?.querySelector<HTMLElement>(`#note-${line.key}`)?.focus();
    } else if (last) {
      addLine();
    } else {
      const index = draft.lines.findIndex((row) => row.key === line.key);
      const next = draft.lines[index + 1];
      if (next !== undefined) {
        formRef.current?.querySelector<HTMLElement>(`#ingredient-${next.key}`)?.focus();
      }
    }
  }

  async function save(): Promise<Id> {
    const ingredients = ready.map((line) => ({
      articleId: line.articleId,
      quantity: line.quantity,
      ...(line.note.trim() === '' ? {} : { note: line.note.trim() }),
    }));
    const common = {
      name: draft.name,
      kind: draft.kind,
      course: draft.course,
      portions: dish ? (draft.portions ?? 1) : (recipe?.portions ?? 1),
      ingredients,
      steps: draft.steps.map((step) => step.text.trim()).filter((text) => text !== ''),
      vatBps: draft.vatBps,
      extraAllergens: draft.extraAllergens,
      extraTraces: draft.extraTraces.filter((id) => !draft.extraAllergens.includes(id)),
      labels: dish ? draft.labels : [],
    };
    const output =
      dish || draft.outputQuantity === null
        ? undefined
        : { quantity: draft.outputQuantity, unit: draft.outputUnit };
    if (editing) {
      await run('recipes.update', {
        recipeId: recipe.id,
        ...common,
        description: dish ? textOrNull(draft.description) : null,
        prepMinutes: draft.prepMinutes,
        photo: draft.photo,
        priceRappen: dish ? draft.priceRappen : null,
        ...(dish ? {} : { shelfLifeDays: draft.shelfLifeDays }),
        ...(output === undefined ? {} : { output }),
      });
      return recipe.id;
    }
    const description = dish ? textOrNull(draft.description) : null;
    const created = await run('recipes.create', {
      ...common,
      ...(description === null ? {} : { description }),
      ...(draft.prepMinutes === null ? {} : { prepMinutes: draft.prepMinutes }),
      ...(draft.photo === null ? {} : { photo: draft.photo }),
      ...(dish && draft.priceRappen !== null ? { priceRappen: draft.priceRappen } : {}),
      ...(dish || draft.shelfLifeDays === null ? {} : { shelfLifeDays: draft.shelfLifeDays }),
      ...(output === undefined ? {} : { output }),
    });
    return created.recipeId;
  }

  function onSubmit(event: SyntheticEvent) {
    event.preventDefault();
    if (saving || loopRows.length > 0) {
      return;
    }
    setSaving(true);
    setFailure(null);
    save()
      .then((id) => {
        toast({ text: t.saved, tone: 'ok' });
        void navigate(paths.recipe(id), { replace: true });
      })
      .catch((error: unknown) => {
        setFailure(error);
      })
      .finally(() => {
        setSaving(false);
      });
  }

  const quantityText = (article: ArticleRef, value: number) =>
    formatQuantity(value, article.unit, { style: 'kitchen' });

  return (
    <>
      <PageHeader
        title={editing ? t.editTitle : t.createTitle}
        back={{ to: back, label: editing ? recipe.name : recipesMessages.title }}
      />
      <form ref={formRef} onSubmit={onSubmit} className="max-w-2xl space-y-8">
        <Section title={t.sections.recipe}>
          <Card className="space-y-5">
            <TextField
              label={t.name}
              required
              maxLength={120}
              placeholder={t.namePlaceholder}
              value={draft.name}
              onChange={(name) => {
                change({ name });
                setFailure(null);
              }}
              error={
                duplicate ? (articleNameTaken(failure) ? t.duplicateArticle : t.duplicate) : null
              }
            />
            <ChoiceChips
              legend={t.kind}
              segmented
              options={[
                { value: 'dish', label: t.kinds.dish },
                { value: 'component', label: t.kinds.component },
              ]}
              value={draft.kind}
              onChange={(kind) => {
                change({ kind });
              }}
              disabled={editor.kindLock !== undefined}
              hint={editor.kindLock === undefined ? t.kindHint : t.kindLocked[editor.kindLock]}
            />
            <SelectField
              label={t.course}
              required
              options={COURSES.map((course) => ({ value: course, label: courseLabel(course) }))}
              value={draft.course}
              onChange={(course) => {
                if (course !== null) {
                  change({ course });
                }
              }}
            />
            {dish ? (
              <NumberField
                label={t.portions}
                required
                min={1}
                max={10_000}
                suffix={t.portionsSuffix}
                hint={t.portionsHint}
                value={draft.portions}
                onChange={(portions) => {
                  change({ portions });
                }}
              />
            ) : (
              <>
                <ChoiceChips
                  legend={t.outputUnit}
                  segmented
                  options={[
                    { value: 'g', label: t.units.g },
                    { value: 'ml', label: t.units.ml },
                    { value: 'pcs', label: t.units.pcs },
                  ]}
                  value={draft.outputUnit}
                  onChange={(outputUnit) => {
                    change({ outputUnit, outputQuantity: null });
                  }}
                  disabled={editor.unitLocked}
                  hint={editor.unitLocked ? t.unitLocked : undefined}
                />
                <QuantityField
                  label={t.output}
                  required
                  positive
                  unit={draft.outputUnit}
                  hint={t.outputHint}
                  value={draft.outputQuantity}
                  onChange={(outputQuantity) => {
                    change({ outputQuantity });
                  }}
                />
                <NumberField
                  label={t.shelfLife}
                  optional
                  max={3650}
                  suffix={t.days}
                  hint={t.shelfLifeHint(PREPARED_SHELF_LIFE)}
                  value={draft.shelfLifeDays}
                  onChange={(shelfLifeDays) => {
                    change({ shelfLifeDays });
                  }}
                />
              </>
            )}
            {dish ? (
              <TextArea
                label={t.description}
                optional
                maxLength={400}
                placeholder={t.descriptionPlaceholder}
                value={draft.description}
                onChange={(description) => {
                  change({ description });
                }}
              />
            ) : null}
            <PhotoField
              label={t.photo}
              value={draft.photo}
              onChange={(photo) => {
                change({ photo });
              }}
            />
          </Card>
        </Section>

        <Section title={t.sections.ingredients} hint={t.ingredientsHint}>
          <Card className="space-y-4">
            <ol className="space-y-3">
              {draft.lines.map((line, index) => {
                const article = line.articleId === null ? undefined : byId.get(line.articleId);
                const what = t.ingredient(index + 1);
                const path = line.articleId === null ? undefined : loops.get(line.articleId);
                const costLine = costOf.get(line.key);
                const info: string[] = [];
                if (article !== undefined && line.quantity !== null && costLine !== undefined) {
                  if (article.yieldBps < 10_000) {
                    info.push(
                      t.gross(
                        quantityText(article, costLine.grossQuantity),
                        formatPercent(article.yieldBps),
                      ),
                    );
                  }
                  info.push(
                    costLine.priceMissing
                      ? t.lineNoPrice
                      : t.lineCost(money.format(milliToRappen(costLine.costMilli))),
                  );
                } else if (article !== undefined) {
                  const price = article.pricePer1000;
                  if (price > 0) {
                    info.push(formatUnitPrice(price, article.unit, money.currency));
                  }
                }
                return (
                  <li
                    key={line.key}
                    onKeyDown={(event) => {
                      onLineKey(event, line, index === draft.lines.length - 1);
                    }}
                    className="flex gap-3 border-b border-line pb-3 last:border-b-0 last:pb-0"
                  >
                    <span
                      aria-hidden="true"
                      className="mt-2.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-muted text-[0.8125rem] font-semibold tabular-nums"
                    >
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap gap-2">
                        <ArticlePicker
                          id={`ingredient-${line.key}`}
                          label={what}
                          hideLabel
                          placeholder={t.ingredientPlaceholder}
                          includeInactive
                          filter={(candidate) => candidate.active || held.has(candidate.id)}
                          required={line.quantity !== null}
                          value={line.articleId}
                          onChange={(articleId) => {
                            changeLine(line.key, { articleId });
                          }}
                          error={path === undefined ? null : t.loop(path.join(' → '))}
                          className="min-w-0 flex-[1_1_15rem]"
                        />
                        <QuantityField
                          id={`quantity-${line.key}`}
                          label={t.quantity(index + 1)}
                          hideLabel
                          placeholder={t.quantityPlaceholder}
                          unit={article?.unit ?? 'g'}
                          entryUnit={ENTRY[article?.unit ?? 'g']}
                          positive
                          required={line.articleId !== null}
                          value={line.quantity}
                          onChange={(quantity) => {
                            changeLine(line.key, { quantity });
                          }}
                          className="min-w-0 flex-[1_1_13rem]"
                        />
                      </div>
                      <div className="flex items-start gap-2">
                        <TextField
                          id={`note-${line.key}`}
                          label={t.note(index + 1)}
                          hideLabel
                          maxLength={80}
                          placeholder={t.notePlaceholder}
                          value={line.note}
                          onChange={(note) => {
                            changeLine(line.key, { note });
                          }}
                          className="min-w-0 flex-1"
                        />
                        <RowActions
                          what={what}
                          first={index === 0}
                          last={index === draft.lines.length - 1}
                          onUp={() => {
                            change({ lines: moved(draft.lines, index, -1) });
                          }}
                          onDown={() => {
                            change({ lines: moved(draft.lines, index, 1) });
                          }}
                          onRemove={() => {
                            const lines = draft.lines.filter((row) => row.key !== line.key);
                            change({ lines: lines.length === 0 ? [emptyLine()] : lines });
                          }}
                        />
                      </div>
                      {info.length === 0 ? null : (
                        <p className="text-[0.8125rem] text-ink-muted tabular-nums">
                          {info.join(' · ')}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
            <Button variant="ghost" size="sm" icon={Plus} onClick={addLine}>
              {t.addIngredient}
            </Button>
            <div
              aria-live="polite"
              className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-xl bg-surface-muted px-4 py-3"
            >
              <span className="font-semibold">{t.totals}</span>
              <span className="text-right tabular-nums">
                {ready.length === 0
                  ? t.noIngredients
                  : dish
                    ? `${t.total(money.format(live.cost.totalRappen))} · ${t.perPortion(
                        money.format(live.cost.perPortionRappen),
                      )}`
                    : [
                        t.total(money.format(live.cost.totalRappen)),
                        live.costPer1000 === undefined
                          ? undefined
                          : formatUnitPrice(live.costPer1000, draft.outputUnit, money.currency),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
              </span>
            </div>
            {live.cost.missingPrices.length === 0 ? null : (
              <p className="text-[0.9375rem] text-soon">{t.missingPrices(missingNames)}</p>
            )}
          </Card>
        </Section>

        <Section title={t.sections.steps}>
          <Card className="space-y-4">
            <ol className="space-y-3">
              {draft.steps.map((step, index) => {
                const what = t.step(index + 1);
                return (
                  <li
                    key={step.key}
                    className="flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-2"
                  >
                    <TextArea
                      id={`step-${step.key}`}
                      label={what}
                      rows={2}
                      maxLength={1000}
                      value={step.text}
                      onChange={(text) => {
                        changeStep(step.key, text);
                      }}
                      className="min-w-0 flex-1"
                    />
                    <span className="flex justify-end sm:pt-7">
                      <RowActions
                        what={what}
                        first={index === 0}
                        last={index === draft.steps.length - 1}
                        onUp={() => {
                          change({ steps: moved(draft.steps, index, -1) });
                        }}
                        onDown={() => {
                          change({ steps: moved(draft.steps, index, 1) });
                        }}
                        onRemove={() => {
                          const steps = draft.steps.filter((row) => row.key !== step.key);
                          change({ steps: steps.length === 0 ? [emptyStep()] : steps });
                        }}
                      />
                    </span>
                  </li>
                );
              })}
            </ol>
            <Button variant="ghost" size="sm" icon={Plus} onClick={addStep}>
              {t.addStep}
            </Button>
            <NumberField
              label={t.prepMinutes}
              optional
              max={10_000}
              suffix={t.minutes}
              value={draft.prepMinutes}
              onChange={(prepMinutes) => {
                change({ prepMinutes });
              }}
              className="max-w-60"
            />
          </Card>
        </Section>

        {dish ? (
          <Section title={t.sections.price}>
            <Card className="space-y-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <MoneyField
                  label={t.price}
                  optional
                  hint={t.priceHint}
                  value={draft.priceRappen}
                  onChange={(priceRappen) => {
                    change({ priceRappen });
                  }}
                />
                <SelectField
                  label={t.vat}
                  required
                  options={vatOptions}
                  value={String(draft.vatBps)}
                  hint={draft.vatBps === editor.defaultVatBps ? t.vatProposal : undefined}
                  onChange={(value) => {
                    if (value !== null) {
                      change({ vatBps: Number(value) });
                    }
                  }}
                />
              </div>
              <div className="rounded-xl bg-surface-muted p-4">
                <h3 className="mb-2 font-semibold">{t.figures}</h3>
                {live.figures === undefined || ready.length === 0 ? (
                  <p className="text-ink-muted">{t.noFigures}</p>
                ) : (
                  <>
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 tabular-nums">
                      <div>
                        <dt className="text-[0.8125rem] text-ink-muted">{t.netPrice}</dt>
                        <dd className="font-semibold">
                          {live.figures.netRappen === undefined
                            ? recipesMessages.none
                            : money.format(live.figures.netRappen)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[0.8125rem] text-ink-muted">{t.costPerPortion}</dt>
                        <dd className="font-semibold">
                          {money.format(live.cost.perPortionRappen)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[0.8125rem] text-ink-muted">{t.margin}</dt>
                        <dd className="font-semibold">
                          {live.figures.marginRappen === undefined
                            ? recipesMessages.none
                            : money.format(live.figures.marginRappen)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[0.8125rem] text-ink-muted">{t.share}</dt>
                        <dd>
                          <MarginBadge
                            status={live.figures.status}
                            foodCostBps={live.figures.foodCostBps}
                            short
                          />
                        </dd>
                      </div>
                    </dl>
                    {live.figures.suggestedPriceRappen === undefined ||
                    live.cost.missingPrices.length > 0 ||
                    live.figures.suggestedPriceRappen === draft.priceRappen ? null : (
                      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
                        <p>
                          {t.proposal(
                            money.format(live.figures.suggestedPriceRappen),
                            formatPercent(editor.targetFoodCostBps),
                          )}
                        </p>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            change({ priceRappen: live.figures?.suggestedPriceRappen ?? null });
                          }}
                        >
                          {t.takeProposal}
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </Card>
          </Section>
        ) : null}

        <Section title={t.sections.declaration}>
          <Card className="space-y-5">
            <div>
              <h3 className="mb-1 font-semibold">{t.derived}</h3>
              {derived.length === 0 && derivedTraces.length === 0 ? (
                <p className="text-ink-muted">{t.derivedNone}</p>
              ) : (
                <ul className="space-y-1">
                  {[...derived, ...derivedTraces].map((source) => (
                    <li key={`${source.allergen}-${String(source.trace)}`}>
                      <span className="font-semibold">
                        {source.trace
                          ? `${t.extraTraces}: ${allergenLabel(source.allergen)}`
                          : allergenLabel(source.allergen)}
                      </span>{' '}
                      <span className="text-ink-muted">
                        {t.derivedFrom(
                          source.from
                            .map((name) => (name === '' ? recipesMessages.unknownArticle : name))
                            .join(', '),
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <AllergenPicker
              legend={t.extraAllergens}
              hint={t.extraAllergensHint}
              unavailable={derivedIds}
              value={draft.extraAllergens.filter((id) => !derivedIds.includes(id))}
              onChange={(extraAllergens) => {
                change({
                  extraAllergens,
                  extraTraces: draft.extraTraces.filter((id) => !extraAllergens.includes(id)),
                });
              }}
            />
            <AllergenPicker
              legend={t.extraTraces}
              hint={t.extraTracesHint}
              unavailable={[...derivedIds, ...draft.extraAllergens]}
              value={draft.extraTraces}
              onChange={(extraTraces) => {
                change({ extraTraces });
              }}
            />
            {dish ? (
              <MultiChoiceChips
                legend={t.labels}
                options={DishLabelSchema.options.map((label) => ({
                  value: label,
                  label: dishLabelText(label),
                }))}
                value={draft.labels}
                onChange={(labels) => {
                  change({ labels });
                }}
              />
            ) : null}
          </Card>
        </Section>

        <FormActions
          primaryLabel={t.save}
          primaryDisabled={saving}
          secondaryLabel={t.cancel}
          onSecondary={() => {
            void navigate(back);
          }}
          error={failureText}
        />
      </form>
    </>
  );
}

/** «Rezept erfassen»: a new dish or component, with live costing while typing. */
export function RecipeNewPage() {
  const result = useQueryResult('recipes.editor', {});
  if (result.status === 'error') {
    throw asError(result.error);
  }
  if (result.status === 'loading') {
    return (
      <PageHeader
        title={t.createTitle}
        back={{ to: paths.recipes(), label: recipesMessages.title }}
      />
    );
  }
  return <RecipeForm editor={result.data} />;
}

/** «Rezept bearbeiten»: the form opens once the recipe is read, and keeps what is typed. */
export function RecipeEditPage() {
  const { recipeId = '' } = useParams();
  const known = IdSchema.safeParse(recipeId).success;
  const result = useQueryResult('recipes.editor', { recipeId }, { enabled: known });
  const [opened, setOpened] = useState<Editor | null>(null);
  // The form keeps the editor it opened with: a save elsewhere does not reset what is typed.
  const kept = opened?.recipe?.id === recipeId ? opened : null;
  if (result.status === 'ready' && kept === null && result.data.recipe?.id === recipeId) {
    setOpened(result.data);
  }
  if (!known || (result.status === 'error' && isNotFound(result.error) && kept === null)) {
    return <NotFoundPage />;
  }
  if (result.status === 'error' && kept === null) {
    throw asError(result.error);
  }
  const editor =
    kept ?? (result.status === 'ready' && result.data.recipe?.id === recipeId ? result.data : null);
  if (editor?.recipe === undefined) {
    return (
      <PageHeader
        title={t.editTitle}
        back={{ to: paths.recipes(), label: recipesMessages.title }}
      />
    );
  }
  return <RecipeForm key={editor.recipe.id} editor={editor} recipe={editor.recipe} />;
}
