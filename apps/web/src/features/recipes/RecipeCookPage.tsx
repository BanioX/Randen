import {
  allergenLabel,
  courseLabel,
  formatSwissDate,
  IdSchema,
  type OperationOutput,
} from '@randen/core';
import { Check } from 'lucide-react';
import { useState } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { isNotFound, useQueryResult, useToday } from '../../app/hooks';
import { NotFoundPage } from '../../app/NotFoundPage';
import { paths } from '../../app/paths';
import { DietBadge } from '../../ui/badges';
import { BackLink } from '../../ui/BackLink';
import { PrintButton } from '../../ui/PrintButton';
import { DishPhoto } from '../../ui/DishPhoto';
import { Notice } from '../../ui/Notice';
import { PageHeader } from '../../ui/PageHeader';
import { recipesMessages } from './messages';
import { asError, PortionStepper, useLast } from './shared';

const t = recipesMessages.cook;

type RecipeCard = OperationOutput<'recipes.card'>;

interface CookViewProps {
  card: RecipeCard;
  onPortions: (portions: number) => void;
}

/** The recipe at the pass: large, scaled, with steps to tick off, and as a printed card. */
function CookView({ card, onPortions }: CookViewProps) {
  const today = useToday();
  const [done, setDone] = useState<ReadonlySet<number>>(new Set());
  const component = card.kind === 'component';
  const batches = Math.max(1, Math.round(card.portions / card.basePortions));
  const amount = component ? t.forBatches(batches) : t.forPortions(card.portions);

  function toggle(index: number) {
    setDone((current) => {
      const next = new Set(current);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }

  return (
    <article className="space-y-6 print:space-y-4 print:text-black">
      <div className="print:hidden">
        <BackLink to={paths.recipe(card.id)} label={t.back(card.name)} />
      </div>

      <header className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-[2.25rem] leading-tight font-bold tracking-tight break-words hyphens-calm md:text-5xl print:text-3xl">
            {card.name}
          </h1>
          <p className="mt-2 text-xl text-ink-muted print:text-base">
            {component
              ? [amount, card.yieldText === undefined ? undefined : t.gives(card.yieldText)]
                  .filter(Boolean)
                  .join(' · ')
              : `${courseLabel(card.course)} · ${amount}`}
          </p>
          <p className="hidden text-sm print:block">
            {t.printedFor(card.businessName, formatSwissDate(today))}
          </p>
        </div>
        {card.photo === undefined ? null : (
          <DishPhoto
            photo={card.photo}
            alt=""
            ratio="square"
            radius="md"
            className="size-24 md:size-32 print:size-24"
          />
        )}
      </header>

      <section aria-label={t.allergens} className="space-y-2">
        {/* At the pass the allergens are read from a step away: large, before anything else. */}
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2">
          <h2 className="text-xl font-semibold print:text-base">{t.allergens}</h2>
          {card.allergens.length === 0 ? (
            <p className="text-xl text-ink-muted print:text-base">{t.noAllergens}</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {card.allergens.map((id) => (
                <li
                  key={id}
                  className="rounded-full border border-line-strong bg-surface px-4 py-1.5 text-xl font-semibold text-ink print:border print:border-black print:bg-transparent print:px-2 print:py-0 print:text-base"
                >
                  {allergenLabel(id)}
                </li>
              ))}
            </ul>
          )}
          {card.traces.length === 0 ? null : (
            <p className="text-lg text-ink-muted print:text-sm">
              {t.traces(card.traces.map((id) => allergenLabel(id)).join(', '))}
            </p>
          )}
          <DietBadge diet={card.diet} />
        </div>
        {card.declarationIncomplete ? (
          <Notice tone="soon" variant="row">
            {t.incomplete}
          </Notice>
        ) : null}
      </section>

      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <PortionStepper
          label={component ? t.batches : t.portions}
          value={component ? batches : card.portions}
          onChange={(value) => {
            onPortions(component ? value * card.basePortions : value);
          }}
          size="large"
        />
        <span className="text-xl text-ink-muted">{component ? t.batches : t.portions}</span>
        <PrintButton variant="secondary" className="ml-auto" label={t.print} />
      </div>

      <div className="flex flex-col gap-8 lg:grid lg:grid-cols-5 lg:items-start lg:gap-10 print:block print:space-y-6">
        <section aria-labelledby="cook-ingredients" className="lg:col-span-2">
          <h2 id="cook-ingredients" className="mb-3 text-2xl font-semibold print:text-xl">
            {t.ingredients}
          </h2>
          <ul className="divide-y divide-line rounded-2xl bg-surface px-4 shadow-card print:rounded-none print:px-0 print:shadow-none">
            {card.ingredients.map((line, index) => (
              <li
                key={`${line.articleId}-${String(index)}`}
                className="flex items-baseline gap-4 py-3 text-2xl print:py-1.5 print:text-base"
              >
                <span className="w-28 shrink-0 text-right font-bold tabular-nums md:w-32 print:w-24">
                  {line.quantityText}
                </span>
                <span className="min-w-0 break-words">
                  {line.name === '' ? recipesMessages.unknownArticle : line.name}
                  {line.note === undefined ? null : (
                    <span className="block text-lg text-ink-muted print:text-sm">{line.note}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="cook-steps" className="lg:col-span-3">
          <h2 id="cook-steps" className="mb-3 text-2xl font-semibold print:text-xl">
            {t.steps}
          </h2>
          <ol className="space-y-3 print:space-y-2">
            {card.steps.map((step, index) => {
              const ticked = done.has(index);
              return (
                <li key={`${String(index)}-${step}`}>
                  <button
                    type="button"
                    aria-pressed={ticked}
                    aria-label={`${String(index + 1)}. ${step}`}
                    onClick={() => {
                      toggle(index);
                    }}
                    className={`flex w-full items-start gap-4 rounded-2xl p-4 text-left text-2xl leading-snug transition-colors print:p-0 print:text-base ${
                      ticked
                        ? 'bg-surface-muted text-ink-muted'
                        : 'bg-surface shadow-card hover:bg-surface-muted print:shadow-none'
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`flex size-11 shrink-0 items-center justify-center rounded-full text-xl font-bold tabular-nums print:size-7 print:text-base ${
                        ticked ? 'bg-ok text-white' : 'bg-surface-muted text-ink'
                      }`}
                    >
                      {ticked ? <Check size={24} strokeWidth={3} /> : index + 1}
                    </span>
                    <span
                      aria-hidden="true"
                      className={`min-w-0 pt-1.5 break-words whitespace-pre-line print:pt-0 ${
                        ticked ? 'line-through print:no-underline' : ''
                      }`}
                    >
                      {step}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </section>
      </div>
    </article>
  );
}

const MAX_PORTIONS = 10_000;

/** «Kochansicht»: the recipe card for the pass, scaled to the portions of the service. */
export function RecipeCookPage() {
  const { recipeId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const known = IdSchema.safeParse(recipeId).success;
  const asked = Number.parseInt(params.get('portions') ?? '', 10);
  const portions =
    Number.isInteger(asked) && asked >= 1 && asked <= MAX_PORTIONS ? asked : undefined;
  const result = useQueryResult(
    'recipes.card',
    { recipeId, ...(portions === undefined ? {} : { portions }) },
    { enabled: known },
  );
  const last = useLast(result.status === 'ready' ? result.data : undefined);

  function setPortions(next: number) {
    const search = new URLSearchParams(params);
    search.set('portions', String(next));
    setParams(search, { replace: true });
  }

  if (!known) {
    return <NotFoundPage />;
  }
  if (result.status === 'error') {
    if (isNotFound(result.error)) {
      return <NotFoundPage />;
    }
    throw asError(result.error);
  }
  // While another number of portions loads, the last card of this recipe stays.
  const shown = [result.data, last].find((data) => data?.id === recipeId);
  if (shown === undefined) {
    return (
      <PageHeader
        title={recipesMessages.detail.cook}
        back={{ to: paths.recipe(recipeId), label: recipesMessages.detail.back }}
      />
    );
  }
  return <CookView card={shown} onPortions={setPortions} />;
}
