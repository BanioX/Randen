import {
  allergenLabel,
  courseLabel,
  dietLabel,
  dishLabelText,
  formatPercent,
  formatQuantity,
  formatUnitPrice,
  IdSchema,
  type OperationOutput,
  type Rappen,
  type RecipeLine,
} from '@randen/core';
import { ChefHat, CookingPot, Pencil } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { errorText, isNotFound, useCommand, useMoney, useQueryResult } from '../../app/hooks';
import { useModule } from '../../app/modules';
import { messages } from '../../app/messages';
import { NotFoundPage } from '../../app/NotFoundPage';
import { paths } from '../../app/paths';
import { AllergenBadges, MarginBadge } from '../../ui/badges';
import { Button, ButtonLink } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { DataTable, type DataTableColumn } from '../../ui/DataTable';
import { GroupedList, ListRow } from '../../ui/GroupedList';
import { Notice } from '../../ui/Notice';
import { PageHeader } from '../../ui/PageHeader';
import { ZoomablePhoto } from '../../ui/PhotoViewer';
import { Section } from '../../ui/Section';
import { ConfirmDialog, Sheet } from '../../ui/Sheet';
import { StatusChip } from '../../ui/StatusChip';
import { useToast } from '../../ui/Toast';
import { recipesMessages } from './messages';
import { asError, Fact, PortionStepper, unitName, useLast } from './shared';

const t = recipesMessages.detail;
const LINK =
  '-my-2.5 inline-flex min-h-11 items-center rounded-lg font-semibold text-wine-800 underline-offset-2 hover:underline';

type Detail = OperationOutput<'recipes.get'>;

/** «12 Portionen» or, for a component, «3 Ansätze». */
function countText(component: boolean, count: number) {
  return component ? recipesMessages.batches(count) : recipesMessages.portions(count);
}

/** The one dark card: what a portion costs and what it earns, or what a component costs. */
function FiguresCard({ detail, onTakeProposal }: { detail: Detail; onTakeProposal: () => void }) {
  const money = useMoney();
  const { recipe, cost, figures, component } = detail;
  const incomplete = cost.missingPrices.length > 0;
  const row = 'flex items-baseline justify-between gap-4 py-2.5';

  if (component !== undefined) {
    const gives = formatQuantity(component.outputQuantity, component.unit, { style: 'kitchen' });
    return (
      <Card variant="premium">
        <p className="text-[0.8125rem] font-semibold text-cork">
          {t.costPer(unitName(component.unit))}
        </p>
        <p className="mt-1 text-[1.75rem] leading-tight font-semibold tracking-tight tabular-nums">
          {component.costPer1000 > 0
            ? formatUnitPrice(component.costPer1000, component.unit, money.currency)
            : recipesMessages.priceMissing}
        </p>
        {incomplete ? <p className="mt-1 text-sm text-mist">{t.costIncomplete}</p> : null}
        <dl className="mt-4 divide-y divide-white/15">
          <div className={row}>
            <dt className="text-mist">{t.costOfBatch(gives)}</dt>
            <dd className="font-semibold tabular-nums">{money.format(cost.totalRappen)}</dd>
          </div>
          <div className={row}>
            <dt className="text-mist">{t.stock}</dt>
            <dd className="font-semibold tabular-nums">
              {formatQuantity(component.stock, component.unit)}
            </dd>
          </div>
        </dl>
        {component.lastPricePer1000 > 0 ? (
          <p className="mt-2 text-sm text-mist">
            {t.lastProduction(
              formatUnitPrice(component.lastPricePer1000, component.unit, money.currency),
            )}
          </p>
        ) : null}
      </Card>
    );
  }

  const target = figures?.targetFoodCostBps ?? 0;
  const price = recipe.priceRappen;
  const offer =
    figures?.suggestedPriceRappen !== undefined &&
    !incomplete &&
    cost.perPortionRappen > 0 &&
    (figures.status === 'over' || figures.status === 'watch' || price === undefined || price <= 0);
  return (
    <Card variant="premium">
      <p className="text-[0.8125rem] font-semibold text-cork">{t.costPerPortion}</p>
      <p className="mt-1 text-[2rem] leading-tight font-semibold tracking-tight tabular-nums">
        {money.format(cost.perPortionRappen)}
      </p>
      {incomplete ? <p className="mt-1 text-sm text-mist">{t.costIncomplete}</p> : null}
      <dl className="mt-4 divide-y divide-white/15">
        <div className={row}>
          <dt className="text-mist">{t.price}</dt>
          <dd className="text-right font-semibold tabular-nums">
            {price !== undefined && price > 0 ? money.format(price) : t.noPrice}
            {figures?.netRappen === undefined || figures.vatRappen === undefined ? null : (
              <span className="block text-[0.8125rem] font-normal text-mist">
                {t.net(
                  money.format(figures.netRappen, { currency: false }),
                  money.format(figures.vatRappen, { currency: false }),
                )}
              </span>
            )}
          </dd>
        </div>
        <div className={row}>
          <dt className="text-mist">{t.margin}</dt>
          <dd className="font-semibold tabular-nums">
            {figures?.marginRappen === undefined
              ? recipesMessages.none
              : money.format(figures.marginRappen)}
          </dd>
        </div>
        <div className={`${row} items-center`}>
          <dt className="text-mist">
            {t.share}
            <span className="block text-[0.8125rem]">{t.target(formatPercent(target))}</span>
          </dt>
          <dd>
            {figures === undefined ? null : (
              <MarginBadge status={figures.status} foodCostBps={figures.foodCostBps} short />
            )}
          </dd>
        </div>
      </dl>
      {offer && figures.suggestedPriceRappen !== undefined ? (
        <div className="mt-4 space-y-3 rounded-xl bg-white/10 p-3">
          <p className="font-semibold">
            {t.proposal(money.format(figures.suggestedPriceRappen), formatPercent(target))}
          </p>
          <Button variant="secondary" size="sm" fullWidth onClick={onTakeProposal}>
            {t.takeProposal}
          </Button>
        </div>
      ) : null}
    </Card>
  );
}

interface RecipeDetailProps {
  detail: Detail;
  onPortions: (portions: number) => void;
  /** Told before the recipe is deleted, so the page does not call it «nicht gefunden» meanwhile. */
  onLeaving: (leaving: boolean) => void;
}

function RecipeDetail({ detail, onPortions, onLeaving }: RecipeDetailProps) {
  const { recipe, lines, cost, declaration, availability, component, gaps, blockers } = detail;
  const money = useMoney();
  const run = useCommand();
  const navigate = useNavigate();
  const toast = useToast();
  const producing = useModule('production');
  const [dialog, setDialog] = useState<'confirm' | 'blocked' | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const isComponent = recipe.kind === 'component';
  const batches = Math.max(1, Math.round(detail.portions / recipe.portions));
  const blocked =
    blockers.menuCards.length > 0 ||
    blockers.planEntries > 0 ||
    blockers.recipes.length > 0 ||
    blockers.stock > 0;
  const missingNames = cost.missingPrices
    .map((line) => (line.name === '' ? recipesMessages.unknownArticle : line.name))
    .join(', ');
  const originMissing = declaration.origins
    .filter((origin) => origin.country === undefined)
    .map((origin) => origin.name)
    .join(', ');

  function act(promise: Promise<unknown>, done: () => void) {
    setFailure(null);
    promise.then(done).catch((error: unknown) => {
      setFailure(errorText(error));
    });
  }

  /** Takes the proposal; the toast offers to go back to the price before. */
  function takeProposal(proposal: Rappen) {
    const previous = recipe.priceRappen ?? null;
    act(run('recipes.setPrice', { recipeId: recipe.id, priceRappen: proposal }), () => {
      toast({
        text: t.proposalTaken(money.format(proposal)),
        tone: 'ok',
        action: {
          label: messages.actions.undo,
          onAction: () => {
            act(
              run('recipes.setPrice', { recipeId: recipe.id, priceRappen: previous }),
              () => undefined,
            );
          },
        },
      });
    });
  }

  function setActive(active: boolean, undo = true) {
    act(run('recipes.setActive', { recipeId: recipe.id, active }), () => {
      toast({
        text: active ? t.activated(recipe.name) : t.deactivated(recipe.name),
        ...(undo
          ? {
              action: {
                label: messages.actions.undo,
                onAction: () => {
                  setActive(!active, false);
                },
              },
            }
          : {}),
      });
    });
  }

  function duplicate() {
    act(
      run('recipes.duplicate', { recipeId: recipe.id }).then((copy) => {
        toast({ text: t.duplicated(copy.name), tone: 'ok' });
        void navigate(paths.recipe(copy.recipeId));
      }),
      () => undefined,
    );
  }

  function remove() {
    setDialog(null);
    setFailure(null);
    onLeaving(true);
    run('recipes.delete', { recipeId: recipe.id })
      .then(() => {
        toast({ text: t.removed(recipe.name) });
        void navigate(paths.recipes(), { replace: true });
      })
      .catch((error: unknown) => {
        onLeaving(false);
        setFailure(errorText(error));
      });
  }

  const lineLink = (line: RecipeLine) =>
    line.componentRecipeId === undefined
      ? line.known
        ? paths.article(line.articleId)
        : undefined
      : paths.recipe(line.componentRecipeId);
  const lineMeta = (line: RecipeLine) => {
    const meta = [
      line.componentRecipeId === undefined ? undefined : t.componentMark,
      line.note,
    ].filter(Boolean);
    return meta.length === 0 ? undefined : meta.join(' · ');
  };
  const totalText = isComponent
    ? money.format(cost.scaledRappen)
    : `${money.format(cost.scaledRappen)} · ${t.perPortionTotal(money.format(cost.perPortionRappen))}`;
  const quantity = (line: RecipeLine, value: number) =>
    formatQuantity(value, line.unit, { style: 'kitchen' });
  const columns: DataTableColumn<RecipeLine>[] = [
    {
      key: 'ingredient',
      header: t.columns.ingredient,
      render: (line) => {
        const meta = lineMeta(line);
        return (
          <span className="block">
            <span className="block">{line.known ? line.name : recipesMessages.unknownArticle}</span>
            {meta === undefined ? null : (
              <span className="mt-0.5 block text-[0.8125rem] font-normal text-ink-muted">
                {meta}
              </span>
            )}
          </span>
        );
      },
    },
    {
      key: 'net',
      header: t.columns.net,
      align: 'right',
      render: (line) => quantity(line, line.scaledQuantity),
    },
    {
      key: 'gross',
      header: t.columns.gross,
      align: 'right',
      hideBelow: 'md',
      render: (line) =>
        line.yieldBps >= 10_000 ? (
          <span className="text-ink-muted">{recipesMessages.none}</span>
        ) : (
          <>
            {quantity(line, line.scaledGrossQuantity)}
            <span className="block text-[0.8125rem] font-normal text-ink-muted">
              {t.grossHint(formatPercent(line.yieldBps))}
            </span>
          </>
        ),
    },
    {
      key: 'price',
      header: t.columns.price,
      align: 'right',
      hideBelow: 'lg',
      render: (line) =>
        line.priceMissing ? (
          <span className="text-ink-muted">{recipesMessages.priceMissing}</span>
        ) : (
          formatUnitPrice(line.pricePer1000, line.unit, money.currency)
        ),
    },
    {
      key: 'cost',
      header: t.columns.cost,
      align: 'right',
      render: (line) =>
        line.priceMissing ? (
          <span className="text-ink-muted">{recipesMessages.priceMissing}</span>
        ) : (
          money.format(line.scaledCostRappen)
        ),
    },
  ];

  const hasIntro =
    recipe.photo !== undefined || recipe.description !== undefined || recipe.labels.length > 0;
  const count = (value: number) => countText(isComponent, value);
  const askedText = count(isComponent ? batches : detail.portions);

  return (
    <>
      <PageHeader
        title={recipe.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {isComponent && recipe.output !== undefined
              ? t.componentOf(
                  formatQuantity(recipe.output.quantity, recipe.output.unit, { style: 'kitchen' }),
                )
              : `${courseLabel(recipe.course)} · ${recipesMessages.forPortions(recipe.portions)}`}
            {recipe.active ? null : (
              <StatusChip tone="neutral">{recipesMessages.inactive}</StatusChip>
            )}
          </span>
        }
        back={{ to: paths.recipes(), label: t.back }}
        actions={
          <>
            <ButtonLink
              to={paths.recipeEdit(recipe.id)}
              icon={Pencil}
              variant="secondary"
              size="sm"
            >
              {t.edit}
            </ButtonLink>
            {producing ? (
              <ButtonLink
                to={paths.productionNew(recipe.id)}
                icon={CookingPot}
                variant="secondary"
                size="sm"
              >
                {t.produce}
              </ButtonLink>
            ) : null}
            <ButtonLink to={paths.recipeCook(recipe.id)} icon={ChefHat} size="sm">
              {t.cook}
            </ButtonLink>
          </>
        }
      />

      <div className="space-y-6">
        {/* Phone and iPad: intro, the dark card, the recipe, the rest. Wide: the dark card heads
            the side column, so a recipe without a photo leaves no hole. */}
        <div className="flex flex-col gap-6 lg:grid lg:grid-cols-3 lg:items-start">
          <div className="contents lg:col-span-2 lg:flex lg:flex-col lg:gap-6">
            {hasIntro ? (
              <div className="order-1 space-y-4">
                {recipe.photo === undefined ? null : (
                  <ZoomablePhoto
                    src={recipe.photo}
                    title={t.photoTitle(recipe.name)}
                    className="aspect-video"
                  />
                )}
                {recipe.description === undefined && recipe.labels.length === 0 ? null : (
                  <div className="space-y-3">
                    {recipe.description === undefined ? null : (
                      <p className="text-lg leading-relaxed">{recipe.description}</p>
                    )}
                    {recipe.labels.length === 0 ? null : (
                      <ul aria-label={t.labels} className="flex flex-wrap gap-1.5">
                        {recipe.labels.map((label) => (
                          <li key={label}>
                            <StatusChip tone="wine" size="sm">
                              {dishLabelText(label)}
                            </StatusChip>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            ) : null}
            <div className="order-3 space-y-6">
              {recipe.active ? null : <Notice variant="row">{t.inactiveNotice}</Notice>}

              {gaps.length === 0 ? null : (
                <Notice
                  title={t.open}
                  action={
                    <ButtonLink to={paths.recipeEdit(recipe.id)} variant="secondary" size="sm">
                      {t.edit}
                    </ButtonLink>
                  }
                >
                  <ul className="space-y-0.5">
                    {gaps.map((gap) => (
                      <li key={gap}>
                        {gap === 'cost'
                          ? t.openTexts.cost(missingNames)
                          : gap === 'origin'
                            ? t.openTexts.origin(originMissing)
                            : t.openTexts[gap]}
                      </li>
                    ))}
                  </ul>
                </Notice>
              )}
              <Section title={t.ingredients}>
                <div className="mb-3 flex flex-wrap items-center gap-3">
                  <PortionStepper
                    label={isComponent ? t.batchesLabel : t.portionsLabel}
                    value={isComponent ? batches : detail.portions}
                    onChange={(value) => {
                      onPortions(isComponent ? value * recipe.portions : value);
                    }}
                  />
                  <span className="text-ink-muted">
                    {isComponent ? t.batchesLabel : t.portionsLabel}
                  </span>
                </div>
                {lines.length === 0 ? (
                  <Card>
                    <p className="text-ink-muted">{t.noIngredients}</p>
                  </Card>
                ) : (
                  <>
                    {/* On the phone a list: name, quantity and cost without cramped columns. */}
                    <div className="space-y-3 md:hidden">
                      <GroupedList label={t.ingredientsCaption}>
                        {lines.map((line) => (
                          <ListRow
                            key={line.index}
                            title={line.known ? line.name : recipesMessages.unknownArticle}
                            subtitle={lineMeta(line)}
                            to={lineLink(line)}
                            trailing={
                              <span className="block text-right tabular-nums">
                                <span className="block font-semibold">
                                  {quantity(line, line.scaledQuantity)}
                                </span>
                                <span className="block text-[0.8125rem] text-ink-muted">
                                  {line.priceMissing
                                    ? recipesMessages.priceMissing
                                    : money.format(line.scaledCostRappen)}
                                </span>
                              </span>
                            }
                          />
                        ))}
                      </GroupedList>
                      <p className="flex flex-wrap items-baseline justify-between gap-x-4 px-4 tabular-nums">
                        <span className="font-semibold">{t.total}</span>
                        <span>{totalText}</span>
                      </p>
                    </div>
                    <div className="hidden md:block">
                      <DataTable
                        caption={t.ingredientsCaption}
                        hideCaption
                        columns={columns}
                        rows={lines}
                        getRowKey={(line) => String(line.index)}
                        rowLink={lineLink}
                        footer={{ ingredient: t.total, cost: totalText }}
                      />
                    </div>
                  </>
                )}
              </Section>

              <Section
                title={t.steps}
                hint={recipe.prepMinutes === undefined ? undefined : t.prepTime(recipe.prepMinutes)}
              >
                {recipe.steps.length === 0 ? (
                  <Card>
                    <p className="text-ink-muted">{t.noSteps}</p>
                  </Card>
                ) : (
                  <Card>
                    <ol className="space-y-4">
                      {recipe.steps.map((step, index) => (
                        <li key={`${String(index)}-${step}`} className="flex gap-3">
                          <span
                            aria-hidden="true"
                            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-muted font-semibold tabular-nums"
                          >
                            {index + 1}
                          </span>
                          <span className="min-w-0 pt-1 break-words whitespace-pre-line">
                            {step}
                          </span>
                        </li>
                      ))}
                    </ol>
                  </Card>
                )}
              </Section>
            </div>
          </div>
          <div className="contents lg:flex lg:flex-col lg:gap-6">
            <div className="order-2">
              <FiguresCard
                detail={detail}
                onTakeProposal={() => {
                  const proposal = detail.figures?.suggestedPriceRappen;
                  if (proposal !== undefined) {
                    takeProposal(proposal);
                  }
                }}
              />
            </div>
            <div className="order-4 space-y-6 md:grid md:grid-cols-2 md:items-start md:gap-4 md:space-y-0 lg:block lg:space-y-6">
              <Section title={t.declaration} hint={t.declarationNote}>
                <Card padding="compact">
                  <dl className="divide-y divide-line">
                    <Fact label={t.contains}>
                      <AllergenBadges allergens={declaration.allergens} empty={t.noAllergens} />
                    </Fact>
                    {declaration.traces.length === 0 ? null : (
                      <Fact label={t.traces}>
                        <AllergenBadges allergens={[]} traces={declaration.traces} />
                      </Fact>
                    )}
                    <Fact label={t.diet}>{dietLabel(declaration.diet)}</Fact>
                    {declaration.origins.length === 0 ? null : (
                      <Fact label={t.origin}>
                        <span className="block space-y-0.5">
                          {declaration.origins.map((origin) => (
                            <span key={origin.articleId} className="block">
                              {origin.countryName === undefined ? (
                                <>
                                  {origin.name}:{' '}
                                  <span className="text-ink-muted">{t.originMissing}</span>
                                </>
                              ) : (
                                t.originLine(origin.name, origin.countryName)
                              )}
                            </span>
                          ))}
                        </span>
                      </Fact>
                    )}
                  </dl>
                  {declaration.sources.length === 0 ? null : (
                    <ul className="space-y-1 border-t border-line py-2.5 text-[0.9375rem]">
                      {declaration.sources.map((source) => (
                        <li key={`${source.allergen}-${String(source.trace)}`}>
                          <span className="font-semibold">
                            {source.trace
                              ? `${t.traces}: ${allergenLabel(source.allergen)}`
                              : allergenLabel(source.allergen)}
                          </span>{' '}
                          <span className="text-ink-muted">
                            {[
                              source.from.length === 0 ? undefined : t.from(source.from.join(', ')),
                              source.extra ? t.extra : undefined,
                            ]
                              .filter(Boolean)
                              .join(', ')}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {declaration.incomplete ? (
                    <div className="pb-2.5">
                      <Notice tone="soon" variant="row">
                        {t.declarationIncomplete}
                      </Notice>
                    </div>
                  ) : null}
                </Card>
              </Section>

              {availability.portionsCovered === undefined ? null : (
                <Section title={t.availability} hint={t.availabilityNote}>
                  <Card className="space-y-2">
                    <p className="text-lg font-semibold">
                      {availability.portionsCovered === 0
                        ? isComponent
                          ? t.coversNothingBatch
                          : t.coversNothing
                        : t.covers(
                            count(
                              isComponent
                                ? Math.floor(availability.portionsCovered / recipe.portions)
                                : availability.portionsCovered,
                            ),
                          )}
                    </p>
                    {availability.limiting.length === 0 ? null : (
                      <p className="text-ink-muted">
                        {t.firstShort(
                          availability.limiting
                            .map((line) => line.name || recipesMessages.unknownArticle)
                            .join(', '),
                        )}
                      </p>
                    )}
                    {availability.short.length === 0 ? (
                      <p className="text-ink-muted">{t.allThere(askedText)}</p>
                    ) : (
                      <div className="border-t border-line pt-2">
                        <p className="font-semibold">{t.shortFor(askedText)}</p>
                        <ul className="mt-1 space-y-0.5">
                          {availability.short.map((line) => (
                            <li key={line.articleId} className="tabular-nums">
                              {t.shortLine(
                                line.name || recipesMessages.unknownArticle,
                                formatQuantity(line.missing, line.unit),
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </Card>
                </Section>
              )}

              {component === undefined ? null : (
                <Section title={t.usedIn}>
                  {component.usedIn.length === 0 ? (
                    <Card>
                      <p className="text-ink-muted">{t.usedInNone}</p>
                    </Card>
                  ) : (
                    <GroupedList>
                      {component.usedIn.map((use) => {
                        const amount = formatQuantity(use.quantity, component.unit, {
                          style: 'kitchen',
                        });
                        return (
                          <ListRow
                            key={use.recipeId}
                            to={paths.recipe(use.recipeId)}
                            title={use.name}
                            subtitle={
                              use.kind === 'dish'
                                ? t.perPortions(amount, use.portions)
                                : t.perBatch(amount)
                            }
                            trailing={
                              use.active ? undefined : (
                                <StatusChip tone="neutral">{recipesMessages.inactive}</StatusChip>
                              )
                            }
                          />
                        );
                      })}
                    </GroupedList>
                  )}
                  <p className="mt-3 px-1">
                    <Link to={paths.article(component.articleId)} className={LINK}>
                      {t.article}
                    </Link>
                  </p>
                </Section>
              )}
            </div>
          </div>
        </div>

        <div>
          {failure === null ? null : (
            <div className="mb-3">
              <Notice tone="danger" variant="row">
                {failure}
              </Notice>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={duplicate}>
              {t.duplicate}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setActive(!recipe.active);
              }}
            >
              {recipe.active ? t.deactivate : t.activate}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setDialog(blocked ? 'blocked' : 'confirm');
              }}
            >
              {t.remove}
            </Button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={dialog === 'confirm'}
        tone="danger"
        title={t.removeTitle(recipe.name)}
        text={isComponent ? t.removeTextComponent : t.removeText}
        confirmLabel={t.remove}
        onConfirm={remove}
        onCancel={() => {
          setDialog(null);
        }}
      />
      <Sheet
        open={dialog === 'blocked'}
        onClose={() => {
          setDialog(null);
        }}
        title={t.blockedTitle(recipe.name)}
        hideClose
        footer={
          <div className="flex flex-col-reverse gap-2 md:flex-row md:justify-end">
            <Button
              variant={recipe.active ? 'secondary' : 'primary'}
              data-autofocus=""
              onClick={() => {
                setDialog(null);
              }}
            >
              {t.close}
            </Button>
            {recipe.active ? (
              <Button
                onClick={() => {
                  setDialog(null);
                  setActive(false);
                }}
              >
                {t.deactivate}
              </Button>
            ) : null}
          </div>
        }
      >
        <div className="space-y-2">
          {blockers.menuCards.length > 0 ? (
            <p>{t.blockedMenu(blockers.menuCards.join(', '))}</p>
          ) : null}
          {blockers.planEntries > 0 ? <p>{t.blockedPlan(blockers.planEntries)}</p> : null}
          {blockers.recipes.length > 0 ? (
            <p>{t.blockedRecipes(blockers.recipes.map((use) => use.name).join(', '))}</p>
          ) : null}
          {blockers.stock > 0 && component !== undefined ? (
            <p>{t.blockedStock(formatQuantity(blockers.stock, component.unit))}</p>
          ) : null}
          {recipe.active ? <p className="text-ink-muted">{t.blockedAdvice}</p> : null}
        </div>
      </Sheet>
    </>
  );
}

const MAX_PORTIONS = 10_000;

/**
 * One recipe: the dark card with cost and margin (or what a component costs), the
 * declaration from the ingredients, the ingredients for any number of portions, the steps,
 * how far the stock reaches and, for a component, where it is used.
 */
export function RecipeDetailPage() {
  const { recipeId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const known = IdSchema.safeParse(recipeId).success;
  const asked = Number.parseInt(params.get('portions') ?? '', 10);
  const portions =
    Number.isInteger(asked) && asked >= 1 && asked <= MAX_PORTIONS ? asked : undefined;
  const result = useQueryResult(
    'recipes.get',
    { recipeId, ...(portions === undefined ? {} : { portions }) },
    { enabled: known },
  );
  const last = useLast(result.status === 'ready' ? result.data : undefined);
  const [leaving, setLeaving] = useState(false);

  function setPortions(next: number) {
    const search = new URLSearchParams(params);
    search.set('portions', String(next));
    setParams(search, { replace: true });
  }

  if (!known) {
    return <NotFoundPage />;
  }
  const header = <PageHeader title={t.back} back={{ to: paths.recipes(), label: t.back }} />;
  if (leaving) {
    return header;
  }
  if (result.status === 'error') {
    if (isNotFound(result.error)) {
      return <NotFoundPage />;
    }
    // Not a missing row: let the frame of the app say that something went wrong.
    throw asError(result.error);
  }
  // While another recipe or another number of portions loads, the last one of this recipe stays.
  const shown = [result.data, last].find((data) => data?.recipe.id === recipeId);
  if (shown === undefined) {
    return header;
  }
  return <RecipeDetail detail={shown} onPortions={setPortions} onLeaving={setLeaving} />;
}
