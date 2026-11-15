import {
  CourseSchema,
  courseLabel,
  formatPercent,
  formatQuantity,
  formatUnitPrice,
  RecipeKindSchema,
  RecipeListFilterSchema,
  type RecipeKind,
  type RecipeListFilter,
  type RecipeListRow,
} from '@randen/core';
import { ChefHat, Plus } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';
import { useMoney, useQuery } from '../../app/hooks';
import { paths } from '../../app/paths';
import { MarginBadge } from '../../ui/badges';
import { ButtonLink } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { ChoiceChips } from '../../ui/ChoiceChips';
import { DishPhoto } from '../../ui/DishPhoto';
import { EmptyState } from '../../ui/EmptyState';
import { PageHeader } from '../../ui/PageHeader';
import { SearchField } from '../../ui/SearchField';
import { SegmentedControl } from '../../ui/SegmentedControl';
import { SelectField } from '../../ui/SelectField';
import { StatusChip } from '../../ui/StatusChip';
import { recipesMessages } from './messages';
import { useLast } from './shared';

const t = recipesMessages;
const ALL = 'all';

/** One card of the recipe book: photo, name, course, price and how the margin stands. */
function RecipeCard({ row }: { row: RecipeListRow }) {
  const money = useMoney();
  const component = row.kind === 'component';
  const meta = component
    ? row.output === undefined
      ? t.component
      : `${t.component} · ${formatQuantity(row.output.quantity, row.output.unit, { style: 'kitchen' })}`
    : courseLabel(row.course);
  return (
    <Link
      to={paths.recipe(row.id)}
      className="flex h-full min-w-0 flex-col rounded-2xl bg-surface shadow-card transition-colors hover:bg-surface-muted"
    >
      <span className="block p-2 pb-0">
        <DishPhoto photo={row.photo} alt="" ratio="card" radius="md" />
      </span>
      <span className="flex flex-1 flex-col gap-1 p-3">
        <span className="block leading-snug font-semibold break-words hyphens-calm">
          {row.name}
        </span>
        <span className="block text-[0.8125rem] text-ink-muted">{meta}</span>
        <span className="mt-auto flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5 pt-2">
          {component ? (
            <span className="text-[0.9375rem] font-semibold tabular-nums">
              {row.output !== undefined && row.output.costPer1000 > 0
                ? formatUnitPrice(row.output.costPer1000, row.output.unit, money.currency)
                : t.priceMissing}
            </span>
          ) : (
            <>
              <span className="text-[0.9375rem] font-semibold tabular-nums">
                {row.priceRappen === undefined || row.priceRappen <= 0
                  ? t.list.noPrice
                  : money.format(row.priceRappen)}
              </span>
              {row.priceRappen === undefined || row.priceRappen <= 0 ? null : (
                <MarginBadge status={row.status} foodCostBps={row.foodCostBps} short size="sm" />
              )}
            </>
          )}
        </span>
        {row.incomplete || !row.active ? (
          <span className="flex flex-wrap gap-1.5 pt-1">
            {row.incomplete ? (
              <StatusChip tone="neutral" size="sm" outline>
                {t.incomplete}
              </StatusChip>
            ) : null}
            {row.active ? null : (
              <StatusChip tone="neutral" size="sm">
                {t.inactive}
              </StatusChip>
            )}
          </span>
        ) : null}
      </span>
    </Link>
  );
}

/**
 * «Rezepte»: the recipe book as a grid of cards, dishes with their price and margin,
 * components with what a kilo or a litre costs. Kind, search, course and view live in the
 * address, so «Zurück» from a recipe shows the book as it was.
 */
export function RecipesPage() {
  const [params, setParams] = useSearchParams();
  const kindParam = RecipeKindSchema.safeParse(params.get('kind'));
  const kind: RecipeKind = kindParam.success ? kindParam.data : 'dish';
  const viewParam = RecipeListFilterSchema.safeParse(params.get('filter'));
  const filter: RecipeListFilter = viewParam.success ? viewParam.data : 'all';
  const courseParam = CourseSchema.safeParse(params.get('course'));
  const course = courseParam.success ? courseParam.data : undefined;
  const search = params.get('q') ?? '';

  const data = useLast(
    useQuery('recipes.list', {
      kind,
      filter,
      ...(search.trim() === '' ? {} : { search }),
      ...(course === undefined ? {} : { course }),
    }),
  );

  /** Writes one filter into the address; an empty value leaves it out. */
  function setParam(changes: Record<string, string>) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value === '') {
        next.delete(key);
      } else {
        next.set(key, value);
      }
    }
    setParams(next, { replace: true });
  }

  const empty = data !== undefined && data.kinds.dish + data.kinds.component === 0;
  const views = RecipeListFilterSchema.options.filter(
    (view) => kind === 'dish' || view !== 'over_target',
  );
  const courses = [
    { value: ALL, label: t.list.allCourses },
    ...(data?.courses ?? []).map((entry) => ({
      value: entry.course,
      label: t.list.courseWithCount(courseLabel(entry.course), entry.count),
    })),
  ];
  const viewOptions = views.map((view) => ({
    value: view,
    label:
      data === undefined
        ? t.list.views[view]
        : view === 'all'
          ? t.list.views.all
          : t.list.viewWithCount(t.list.views[view], data.counts[view]),
  }));

  return (
    <>
      <PageHeader
        title={t.title}
        subtitle={
          data === undefined || empty
            ? undefined
            : t.list.subtitle(formatPercent(data.targetFoodCostBps))
        }
        actions={
          empty ? undefined : (
            <ButtonLink to={paths.recipeNew()} icon={Plus} size="sm">
              {t.create}
            </ButtonLink>
          )
        }
      />

      {data === undefined ? null : empty ? (
        <EmptyState
          icon={ChefHat}
          title={t.list.emptyTitle}
          text={t.list.emptyText}
          action={
            <ButtonLink to={paths.recipeNew()} icon={Plus}>
              {t.create}
            </ButtonLink>
          }
        />
      ) : (
        <>
          <div className="mb-4 space-y-3">
            <div className="space-y-3 md:flex md:items-end md:gap-3 md:space-y-0">
              <SegmentedControl
                label={t.list.kind}
                hideLabel
                options={(['dish', 'component'] as const).map((value) => ({
                  value,
                  label: t.list.kindWithCount(t.list.kinds[value], data.kinds[value]),
                }))}
                value={kind}
                onChange={(value) => {
                  setParam({
                    kind: value === 'dish' ? '' : value,
                    course: '',
                    filter: filter === 'over_target' ? '' : filter === 'all' ? '' : filter,
                  });
                }}
                className="md:w-80 md:shrink-0"
              />
              <SearchField
                label={t.list.search}
                hideLabel
                placeholder={t.list.searchPlaceholder}
                value={search}
                onChange={(value) => {
                  setParam({ q: value });
                }}
                className="md:flex-1"
              />
            </div>

            {/* On the phone two quiet selects; chips where there is room. */}
            <div className="grid grid-cols-2 gap-3 md:hidden">
              <SelectField
                label={t.list.course}
                hideLabel
                required
                options={courses}
                value={course ?? ALL}
                onChange={(value) => {
                  setParam({ course: value === null || value === ALL ? '' : value });
                }}
              />
              <SelectField
                label={t.list.view}
                hideLabel
                required
                options={viewOptions}
                value={filter}
                onChange={(value) => {
                  setParam({ filter: value === null || value === 'all' ? '' : value });
                }}
              />
            </div>
            <div className="hidden gap-3 md:flex md:flex-wrap md:items-start md:justify-between">
              <ChoiceChips
                legend={t.list.course}
                hideLegend
                options={courses}
                value={course ?? ALL}
                onChange={(value) => {
                  setParam({ course: value === ALL ? '' : value });
                }}
              />
              <ChoiceChips
                legend={t.list.view}
                hideLegend
                options={viewOptions}
                value={filter}
                onChange={(value) => {
                  setParam({ filter: value === 'all' ? '' : value });
                }}
              />
            </div>
          </div>

          {data.rows.length === 0 ? (
            <Card>
              <p className="text-ink-muted">
                {search.trim() === '' && course === undefined
                  ? t.list.noneInView[filter]
                  : t.list.noMatch}
              </p>
            </Card>
          ) : (
            <ul
              aria-label={t.list.caption}
              className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 lg:grid-cols-4"
            >
              {data.rows.map((row) => (
                <li key={row.id} className="min-w-0">
                  <RecipeCard row={row} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
}
