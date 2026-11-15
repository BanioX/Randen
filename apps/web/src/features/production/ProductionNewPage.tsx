import {
  daysBetween,
  formatQuantity,
  IdSchema,
  relativeDays,
  type Id,
  type LocalDate,
  type OperationOutput,
  type RunIngredient,
} from '@randen/core';
import { ChefHat, Printer } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { errorText, useCommand, useMoney, useQuery, useToday } from '../../app/hooks';
import { paths } from '../../app/paths';
import { useDetailed } from '../../app/view';
import { ButtonLink } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { DataTable, type DataTableColumn } from '../../ui/DataTable';
import { DateField } from '../../ui/DateField';
import { FormActions } from '../../ui/FormActions';
import { Notice } from '../../ui/Notice';
import { PageHeader } from '../../ui/PageHeader';
import { AreaPicker, RecipePicker } from '../../ui/pickers';
import { Section } from '../../ui/Section';
import { Fact, Stepper } from './shared';
import { useToast } from '../../ui/Toast';
import { productionMessages } from './messages';

const t = productionMessages;
/** A placeholder id for the query while no recipe is chosen: the query stays off. */
const NO_RECIPE: Id = IdSchema.parse('01900000-0000-7000-8000-0000000000ff');

type Result = OperationOutput<'production.record'>;

/** Where the stock of one ingredient comes from, in words: area, quantity, date. */
function takesText(row: RunIngredient, today: LocalDate): string[] {
  const takes = row.takes.map((take) =>
    t.newPage.takes(
      take.areaName ?? '',
      formatQuantity(take.quantity, row.unit),
      take.expiresOn === undefined ? undefined : relativeDays(daysBetween(today, take.expiresOn)),
    ),
  );
  const unusable = row.unusable.map((lot) =>
    t.newPage.unusable(
      formatQuantity(lot.quantity, row.unit),
      relativeDays(daysBetween(today, lot.expiresOn)),
    ),
  );
  return [...takes, ...unusable];
}

/**
 * «Produktion erfassen» (pattern H4): a recipe, its portions, what it takes from stock, the
 * output and «Produzieren». Shortages do not block: they are booked as far as possible and kept.
 */
export function ProductionNewPage() {
  const [params] = useSearchParams();
  const today = useToday();
  const money = useMoney();
  const detailed = useDetailed();
  const toast = useToast();
  const run = useCommand();
  const recipeParam = IdSchema.safeParse(params.get('recipe'));
  const entryParam = IdSchema.safeParse(params.get('entry'));
  const portionsParam = Number.parseInt(params.get('portions') ?? '', 10);

  const [recipeId, setRecipeId] = useState<Id | null>(
    recipeParam.success ? recipeParam.data : null,
  );
  const [portions, setPortions] = useState<number>(
    Number.isFinite(portionsParam) && portionsParam > 0 ? portionsParam : 1,
  );
  const [areaChoice, setAreaChoice] = useState<Id | null | undefined>(undefined);
  const [dateChoice, setDateChoice] = useState<LocalDate | null | undefined>(undefined);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const preview = useQuery(
    'production.preview',
    { recipeId: recipeId ?? NO_RECIPE, portions },
    { enabled: recipeId !== null },
  );
  const output = preview?.output;
  const area = areaChoice === undefined ? (output?.proposedAreaId ?? null) : areaChoice;
  const expiry = dateChoice === undefined ? (output?.proposedExpiresOn ?? null) : dateChoice;

  /** Choosing a recipe: its batch size is the start; the output choices start over. */
  function chooseRecipe(next: Id | null, portionsOfBatch?: number) {
    setRecipeId(next);
    setAreaChoice(undefined);
    setDateChoice(undefined);
    setResult(null);
    setError(null);
    if (portionsOfBatch !== undefined) {
      setPortions(portionsOfBatch);
    }
  }

  async function produce() {
    if (recipeId === null || preview === undefined) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const booked = await run('production.record', {
        recipeId,
        portions,
        ...(entryParam.success ? { planEntryId: entryParam.data } : {}),
        ...(output !== undefined && area !== null ? { outputAreaId: area } : {}),
        ...(output !== undefined && expiry !== null ? { outputExpiresOn: expiry } : {}),
      });
      setResult(booked);
      toast({ text: t.newPage.toast(preview.recipeName), tone: 'ok' });
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy(false);
    }
  }

  const columns: DataTableColumn<RunIngredient>[] = [
    {
      key: 'name',
      header: t.newPage.columns.ingredient,
      render: (row) => {
        const lines = takesText(row, today);
        return (
          <span className="block min-w-0">
            <span className="block font-medium break-words">{row.name}</span>
            {lines.length === 0 ? (
              <span className="block text-sm text-ink-muted">{t.newPage.noLots}</span>
            ) : (
              lines.map((line) => (
                <span key={line} className="block text-sm text-ink-muted">
                  {line}
                </span>
              ))
            )}
          </span>
        );
      },
    },
    {
      key: 'need',
      header: t.newPage.columns.need,
      align: 'right',
      render: (row) => formatQuantity(row.quantity, row.unit),
    },
    {
      key: 'stock',
      header: t.newPage.columns.stock,
      align: 'right',
      hideBelow: 'md',
      render: (row) => formatQuantity(row.usable, row.unit),
    },
    {
      key: 'missing',
      header: t.newPage.columns.missing,
      align: 'right',
      render: (row) =>
        row.missing > 0 ? <strong>{formatQuantity(row.missing, row.unit)}</strong> : '–',
    },
  ];

  if (result !== null && preview !== undefined) {
    return (
      <div className="space-y-6">
        <PageHeader
          title={t.newPage.produced}
          back={{ to: paths.production(), label: t.newPage.title }}
        />
        <Card>
          <dl className="divide-y divide-line">
            {detailed ? (
              <Fact label={t.newPage.resultCost}>{money.format(result.costRappen)}</Fact>
            ) : null}
            {detailed ? (
              <Fact label={t.newPage.resultPerPortion}>
                {money.format(result.costPerPortionRappen)}
              </Fact>
            ) : null}
            <Fact label={t.newPage.resultShortages}>
              {result.shortages.length === 0
                ? t.newPage.resultNoShortages
                : String(result.shortages.length)}
            </Fact>
          </dl>
          {result.shortages.length > 0 ? (
            <ul className="mt-3 space-y-1 text-[0.9375rem]">
              {result.shortages.map((shortage) => (
                <li key={shortage.articleId}>
                  {shortage.name}: {formatQuantity(shortage.missing, shortage.unit)}
                </li>
              ))}
            </ul>
          ) : null}
        </Card>
        <div className="flex flex-wrap gap-3">
          {result.outputLotId === undefined ? null : (
            <ButtonLink
              // The run page prints the label at once (`print=1`), so one tap is enough.
              to={`${paths.productionRun(result.productionId)}?print=1`}
              variant="primary"
              icon={Printer}
            >
              {t.newPage.labelAction}
            </ButtonLink>
          )}
          <ButtonLink to={paths.productionRun(result.productionId)} variant="secondary">
            {t.newPage.openRun}
          </ButtonLink>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t.newPage.title}
        back={{ to: paths.production(), label: t.newPage.back }}
      />

      <Section title={t.newPage.what}>
        <div className="max-w-2xl space-y-4">
          <RecipePicker
            label={t.newPage.recipe}
            value={recipeId}
            onChange={(id, recipe) => {
              chooseRecipe(id, recipe?.portions);
            }}
          />
          {recipeId === null ? (
            <p className="text-ink-muted">{t.newPage.noRecipe}</p>
          ) : (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-ink-muted">{t.newPage.portions}</p>
              <Stepper label={t.newPage.portions} value={portions} onChange={setPortions} />
            </div>
          )}
        </div>
      </Section>

      {preview === undefined || recipeId === null ? null : (
        <>
          <Section
            title={t.newPage.previewTitle}
            hint={
              detailed
                ? t.newPage.summary(portions, money.format(preview.costRappen))
                : t.production.portionCount(portions)
            }
          >
            {preview.shortages.length > 0 ? (
              <Notice tone="soon" title={t.newPage.shortages(preview.shortages.length)} />
            ) : null}
            <DataTable
              caption={t.newPage.previewCaption}
              columns={columns}
              rows={preview.ingredients}
              getRowKey={(row) => row.articleId}
            />
          </Section>

          {output === undefined ? null : (
            <Section title={t.newPage.outputTitle}>
              <div className="max-w-2xl space-y-4">
                <p className="text-[1.0625rem] font-semibold">
                  {output.name} · {formatQuantity(output.quantity, output.unit)}
                </p>
                <AreaPicker
                  label={t.newPage.outputArea}
                  value={area}
                  onChange={(next) => {
                    setAreaChoice(next);
                  }}
                />
                <DateField
                  label={t.newPage.outputDate}
                  value={expiry}
                  onChange={(next) => {
                    setDateChoice(next);
                  }}
                  hint={
                    output.shelfLifeDays === undefined
                      ? t.newPage.outputNoDate
                      : t.newPage.outputDateHint(output.shelfLifeDays)
                  }
                />
              </div>
            </Section>
          )}

          <FormActions
            placement="inline"
            primaryLabel={t.newPage.produceAction}
            primaryIcon={ChefHat}
            onPrimary={() => {
              void produce();
            }}
            primaryDisabled={busy}
            error={error}
          />
        </>
      )}
    </div>
  );
}
