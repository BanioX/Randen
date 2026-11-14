import {
  articleCategory,
  CommandError,
  formatPercent,
  formatQuantity,
  formatUnitPrice,
  IdSchema,
  isValidGtin,
  rappen,
  type AllergenId,
  type ArticleCategoryId,
  type ArticleView,
  type DateKind,
  type Diet,
  type Id,
  type Rappen,
  type Unit,
} from '@randen/core';
import { useState, type SyntheticEvent } from 'react';
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
import { ButtonLink } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { ChoiceChips } from '../../ui/ChoiceChips';
import { FormActions } from '../../ui/FormActions';
import { Notice } from '../../ui/Notice';
import { NumberField } from '../../ui/NumberField';
import { PageHeader } from '../../ui/PageHeader';
import { PercentField } from '../../ui/PercentField';
import {
  AreaPicker,
  CategoryPicker,
  CountryPicker,
  SpotPicker,
  SupplierPicker,
} from '../../ui/pickers';
import { QuantityField } from '../../ui/QuantityField';
import { Section } from '../../ui/Section';
import { TextArea, TextField } from '../../ui/TextField';
import { useToast } from '../../ui/Toast';
import { UnitPriceField } from '../../ui/UnitPriceField';
import { articlesMessages } from './messages';
import { asError } from './shared';

const t = articlesMessages.form;

/** What the form holds while the person types: every field of an article, empty as null or ''. */
interface Draft {
  name: string;
  categoryId: ArticleCategoryId | null;
  unit: Unit;
  pricePer1000: Rappen | null;
  yieldBps: number | null;
  allergens: AllergenId[];
  traces: AllergenId[];
  diet: Diet;
  originCountry: string | null;
  supplierId: Id | null;
  areaId: Id | null;
  spotId: Id | null;
  minStock: number | null;
  targetStock: number | null;
  packSize: number | null;
  packLabel: string;
  shelfLifeDays: number | null;
  dateKind: DateKind;
  supplierArticleNumber: string;
  gtin: string;
  note: string;
}

/** Fields the group of goods proposes, as long as the person has not set them. */
type Proposed = 'diet' | 'dateKind' | 'shelfLifeDays' | 'areaId';

const EMPTY: Draft = {
  name: '',
  categoryId: null,
  unit: 'g',
  pricePer1000: null,
  yieldBps: 10_000,
  allergens: [],
  traces: [],
  diet: 'vegan',
  originCountry: null,
  supplierId: null,
  areaId: null,
  spotId: null,
  minStock: null,
  targetStock: null,
  packSize: null,
  packLabel: '',
  shelfLifeDays: null,
  dateKind: 'best_before',
  supplierArticleNumber: '',
  gtin: '',
  note: '',
};

function draftOf(article: ArticleView): Draft {
  return {
    name: article.name,
    categoryId: article.categoryId,
    unit: article.unit,
    pricePer1000: article.pricePer1000 > 0 ? article.pricePer1000 : null,
    yieldBps: article.yieldBps,
    allergens: article.allergens,
    traces: article.traces,
    diet: article.diet,
    originCountry: article.originCountry ?? null,
    supplierId: article.supplierId ?? null,
    areaId: article.areaId ?? null,
    spotId: article.spotId ?? null,
    minStock: article.minStock ?? null,
    targetStock: article.targetStock ?? null,
    packSize: article.packSize ?? null,
    packLabel: article.packLabel ?? '',
    shelfLifeDays: article.shelfLifeDays ?? null,
    dateKind: article.dateKind,
    supplierArticleNumber: article.supplierArticleNumber ?? '',
    gtin: article.gtin ?? '',
    note: article.note ?? '',
  };
}

const textOrNull = (text: string) => (text.trim() === '' ? null : text.trim());

/** Null entries left out: what `articles.create` takes for «not given». */
function withoutNulls<TObject extends Record<string, unknown>>(object: TObject) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== null)) as {
    [TKey in keyof TObject]?: Exclude<TObject[TKey], null>;
  };
}

interface ArticleFormProps {
  /** The article to change; without it the form creates one. */
  article?: ArticleView | undefined;
  /** Why the unit can no longer change. */
  unitLock?: 'stock' | 'recipes' | undefined;
  /** For a component: the name of the recipe that owns name, price and allergens. */
  recipeName?: string | undefined;
}

function ArticleForm({ article, unitLock, recipeName }: ArticleFormProps) {
  const money = useMoney();
  const run = useCommand();
  const navigate = useNavigate();
  const toast = useToast();
  const areas = useQuery('lookup.areas', {})?.areas;

  const editing = article !== undefined;
  const prepared = article?.kind === 'prepared';
  const [draft, setDraft] = useState<Draft>(() => (editing ? draftOf(article) : EMPTY));
  /** What the person has set by hand; an existing article is all its own. */
  const [own, setOwn] = useState<ReadonlySet<Proposed>>(new Set());
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const [submitted, setSubmitted] = useState(false);

  const category = draft.categoryId === null ? null : articleCategory(draft.categoryId);
  // A new article follows the proposals of its group of goods until the person decides.
  const proposal =
    editing || category === null
      ? null
      : {
          diet: category.diet,
          dateKind: category.dateKind,
          shelfLifeDays: category.shelfLifeDays,
          areaId: areas?.find((area) => area.kind === category.area)?.id ?? null,
        };
  const proposes = (field: Proposed) => proposal !== null && !own.has(field);
  const diet = proposal !== null && proposes('diet') ? proposal.diet : draft.diet;
  const dateKind = proposal !== null && proposes('dateKind') ? proposal.dateKind : draft.dateKind;
  const shelfLifeDays =
    proposal !== null && proposes('shelfLifeDays') ? proposal.shelfLifeDays : draft.shelfLifeDays;
  const areaId = proposal !== null && proposes('areaId') ? proposal.areaId : draft.areaId;
  const proposalHint = (field: Proposed) =>
    category !== null && proposes(field) ? t.proposal(category.label) : undefined;

  const change = (fields: Partial<Draft>) => {
    setDraft((current) => ({ ...current, ...fields }));
  };
  /** A proposed field the person sets: from now on it is theirs. */
  const decide = (field: Proposed, fields: Partial<Draft>) => {
    setOwn((current) => new Set(current).add(field));
    change(fields);
  };

  /** Another unit: the typed price keeps its number, quantities start over. */
  function changeUnit(unit: Unit) {
    if (unit === draft.unit) {
      return;
    }
    const price = draft.pricePer1000;
    const perPiece = (from: Unit) => (from === 'pcs' ? 1000 : 1);
    change({
      unit,
      pricePer1000:
        price === null ? null : rappen(Math.round((price * perPiece(unit)) / perPiece(draft.unit))),
      minStock: null,
      targetStock: null,
      packSize: null,
    });
  }

  const showOrigin = category?.declaresOrigin === true;
  const gtin = draft.gtin.replace(/\s/g, '');
  const gtinError = gtin !== '' && !isValidGtin(gtin) ? t.gtinInvalid : null;
  const targetError =
    draft.minStock !== null && draft.targetStock !== null && draft.targetStock < draft.minStock
      ? t.targetBelowMin(formatQuantity(draft.minStock, draft.unit))
      : null;
  const packError =
    draft.packLabel.trim() !== '' && draft.packSize === null ? t.packSizeMissing : null;
  const duplicate = failure instanceof CommandError && failure.code === 'duplicate_name';

  const price = draft.pricePer1000 ?? 0;
  const yieldBps = draft.yieldBps ?? 10_000;
  const yieldHint =
    price > 0 && yieldBps > 0 && yieldBps < 10_000
      ? t.yieldEffect(
          formatPercent(yieldBps),
          formatUnitPrice(Math.round((price * 10_000) / yieldBps), draft.unit, money.currency),
          formatUnitPrice(price, draft.unit, money.currency),
        )
      : t.yieldHint;

  const back = editing ? paths.article(article.id) : paths.articles();

  async function save() {
    if (draft.categoryId === null) {
      return;
    }
    const optional = {
      supplierId: draft.supplierId,
      supplierArticleNumber: textOrNull(draft.supplierArticleNumber),
      packSize: draft.packSize,
      packLabel: textOrNull(draft.packLabel),
      minStock: draft.minStock,
      targetStock: draft.targetStock,
      areaId,
      spotId: areaId === null ? null : draft.spotId,
      shelfLifeDays,
      originCountry: showOrigin ? draft.originCountry : null,
      gtin: gtin === '' ? null : gtin,
      note: textOrNull(draft.note),
    };
    const kitchen = {
      categoryId: draft.categoryId,
      unit: draft.unit,
      yieldBps: draft.yieldBps ?? 10_000,
      dateKind,
    };
    // What the recipe of a component owns stays out of the command.
    const declared = {
      name: draft.name,
      pricePer1000: draft.pricePer1000 ?? rappen(0),
      allergens: draft.allergens,
      traces: draft.traces,
      diet,
    };
    if (editing) {
      await run('articles.update', {
        articleId: article.id,
        ...kitchen,
        ...(prepared ? {} : declared),
        ...optional,
      });
      return article.id;
    }
    const created = await run('articles.create', {
      ...kitchen,
      ...declared,
      ...withoutNulls(optional),
      // Null is an answer here: «Kein fester Lagerbereich» and an emptied shelf life stay empty
      // instead of falling back to what the group of goods proposes.
      areaId,
      shelfLifeDays,
    });
    return created.articleId;
  }

  function onSubmit(event: SyntheticEvent) {
    event.preventDefault();
    setSubmitted(true);
    if (saving || gtinError !== null || targetError !== null || packError !== null) {
      return;
    }
    setSaving(true);
    setFailure(null);
    save()
      .then((articleId) => {
        if (articleId !== undefined) {
          toast({ text: t.saved, tone: 'ok' });
          void navigate(paths.article(articleId), { replace: true });
        }
      })
      .catch((error: unknown) => {
        setFailure(error);
      })
      .finally(() => {
        setSaving(false);
      });
  }

  return (
    <>
      <PageHeader
        title={editing ? t.editTitle : t.createTitle}
        back={{ to: back, label: editing ? article.name : articlesMessages.title }}
      />
      <form onSubmit={onSubmit} className="max-w-2xl space-y-8">
        <Section title={t.sections.article}>
          <Card className="space-y-5">
            {prepared ? (
              <Notice
                variant="row"
                action={
                  article.recipeId === undefined ? undefined : (
                    <ButtonLink to={paths.recipe(article.recipeId)} variant="secondary" size="sm">
                      {t.openRecipe}
                    </ButtonLink>
                  )
                }
              >
                {recipeName === undefined ? t.fromRecipeUnknown : t.fromRecipe(recipeName)}
              </Notice>
            ) : null}
            <TextField
              label={t.name}
              required
              disabled={prepared}
              maxLength={120}
              placeholder={prepared ? undefined : t.namePlaceholder}
              value={draft.name}
              onChange={(name) => {
                change({ name });
                setFailure(null);
              }}
              error={duplicate ? t.duplicate : null}
            />
            <CategoryPicker
              label={t.category}
              required
              hint={editing ? undefined : t.categoryHint}
              value={draft.categoryId}
              onChange={(categoryId) => {
                change({ categoryId });
              }}
            />
            <ChoiceChips
              legend={t.unit}
              segmented
              options={[
                { value: 'g', label: t.units.g },
                { value: 'ml', label: t.units.ml },
                { value: 'pcs', label: t.units.pcs },
              ]}
              value={draft.unit}
              onChange={changeUnit}
              disabled={unitLock !== undefined}
              hint={unitLock === undefined ? t.unitHint : t.unitLocked[unitLock]}
            />
          </Card>
        </Section>

        <Section title={t.sections.price}>
          <Card className="grid gap-5 sm:grid-cols-2">
            {prepared ? null : (
              <UnitPriceField
                label={t.price}
                optional
                hint={t.priceHint}
                unit={draft.unit}
                value={draft.pricePer1000}
                onChange={(pricePer1000) => {
                  change({ pricePer1000 });
                }}
              />
            )}
            <PercentField
              label={t.yield}
              required
              min={100}
              hint={yieldHint}
              value={draft.yieldBps}
              onChange={(next) => {
                change({ yieldBps: next });
              }}
            />
          </Card>
        </Section>

        {prepared ? null : (
          <Section title={t.sections.declaration}>
            <Card className="space-y-5">
              <AllergenPicker
                legend={t.contains}
                hint={t.containsHint}
                value={draft.allergens}
                onChange={(allergens) => {
                  change({
                    allergens,
                    traces: draft.traces.filter((id) => !allergens.includes(id)),
                  });
                }}
              />
              <AllergenPicker
                legend={t.traces}
                hint={t.tracesHint}
                unavailable={draft.allergens}
                value={draft.traces}
                onChange={(traces) => {
                  change({ traces });
                }}
              />
              <ChoiceChips
                legend={t.diet}
                segmented
                options={[
                  { value: 'vegan', label: t.diets.vegan },
                  { value: 'vegetarian', label: t.diets.vegetarian },
                  { value: 'omnivore', label: t.diets.omnivore },
                ]}
                value={diet}
                onChange={(next) => {
                  decide('diet', { diet: next });
                }}
                hint={proposalHint('diet')}
              />
              {showOrigin ? (
                <CountryPicker
                  label={t.origin}
                  placeholder={t.originPlaceholder}
                  hint={t.originHint}
                  value={draft.originCountry}
                  onChange={(originCountry) => {
                    change({ originCountry });
                  }}
                />
              ) : null}
            </Card>
          </Section>
        )}

        <Section title={t.sections.storage}>
          <Card className="grid gap-5 sm:grid-cols-2">
            {prepared ? null : (
              <SupplierPicker
                label={t.supplier}
                optional
                placeholder={t.noSupplier}
                value={draft.supplierId}
                onChange={(supplierId) => {
                  change({ supplierId });
                }}
                className="sm:col-span-2"
              />
            )}
            <AreaPicker
              label={t.area}
              optional
              placeholder={t.noArea}
              hint={areaId === null ? undefined : proposalHint('areaId')}
              value={areaId}
              onChange={(next) => {
                decide('areaId', { areaId: next, spotId: null });
              }}
            />
            <SpotPicker
              label={t.spot}
              optional
              areaId={areaId}
              value={draft.spotId}
              onChange={(spotId) => {
                // The spot belongs to the area on screen: that area is now the person's choice.
                decide('areaId', { areaId, spotId });
              }}
            />
            <QuantityField
              label={t.minStock}
              optional
              hint={t.minStockHint}
              unit={draft.unit}
              value={draft.minStock}
              onChange={(minStock) => {
                change({ minStock });
              }}
            />
            <QuantityField
              label={t.targetStock}
              optional
              hint={t.targetStockHint}
              unit={draft.unit}
              value={draft.targetStock}
              onChange={(targetStock) => {
                change({ targetStock });
              }}
              error={submitted ? targetError : null}
            />
            {prepared ? null : (
              <>
                <TextField
                  label={t.packLabel}
                  optional
                  maxLength={30}
                  placeholder={t.packLabelPlaceholder}
                  value={draft.packLabel}
                  onChange={(packLabel) => {
                    change({ packLabel });
                  }}
                />
                <QuantityField
                  label={t.packSize}
                  optional
                  positive
                  hint={t.packSizeHint}
                  unit={draft.unit}
                  value={draft.packSize}
                  onChange={(packSize) => {
                    change({ packSize });
                  }}
                  error={submitted ? packError : null}
                />
              </>
            )}
            <NumberField
              label={t.shelfLife}
              optional
              suffix={t.days}
              max={36_500}
              hint={
                category !== null && proposes('shelfLifeDays')
                  ? t.shelfLifeProposal(category.label)
                  : t.shelfLifeHint
              }
              value={shelfLifeDays}
              onChange={(next) => {
                decide('shelfLifeDays', { shelfLifeDays: next });
              }}
              className="sm:col-span-2"
            />
            <ChoiceChips
              legend={t.dateKind}
              segmented
              options={[
                { value: 'best_before', label: t.dateKinds.best_before },
                { value: 'use_by', label: t.dateKinds.use_by },
              ]}
              value={dateKind}
              onChange={(next) => {
                decide('dateKind', { dateKind: next });
              }}
              hint={proposalHint('dateKind')}
              className="sm:col-span-2"
            />
          </Card>
        </Section>

        <Section title={t.sections.more}>
          <Card className="grid gap-5 sm:grid-cols-2">
            {prepared ? null : (
              <>
                <TextField
                  label={t.supplierArticleNumber}
                  optional
                  maxLength={40}
                  value={draft.supplierArticleNumber}
                  onChange={(supplierArticleNumber) => {
                    change({ supplierArticleNumber });
                  }}
                />
                <TextField
                  label={t.gtin}
                  optional
                  inputMode="numeric"
                  maxLength={20}
                  hint={t.gtinHint}
                  value={draft.gtin}
                  onChange={(next) => {
                    change({ gtin: next });
                  }}
                  error={submitted ? gtinError : null}
                />
              </>
            )}
            <TextArea
              label={t.note}
              optional
              maxLength={500}
              value={draft.note}
              onChange={(note) => {
                change({ note });
              }}
              className="sm:col-span-2"
            />
          </Card>
        </Section>

        <FormActions
          primaryLabel={t.save}
          primaryDisabled={saving}
          secondaryLabel={t.cancel}
          onSecondary={() => {
            void navigate(back);
          }}
          error={failure === null ? null : errorText(failure)}
        />
      </form>
    </>
  );
}

/** «Artikel erfassen»: a new article, with what its group of goods proposes. */
export function ArticleNewPage() {
  return <ArticleForm />;
}

/** «Artikel bearbeiten»: the form opens once the article is read, and keeps what is typed. */
export function ArticleEditPage() {
  const { articleId = '' } = useParams();
  const known = IdSchema.safeParse(articleId).success;
  const result = useQueryResult('articles.get', { articleId }, { enabled: known });
  if (!known || (result.status === 'error' && isNotFound(result.error))) {
    return <NotFoundPage />;
  }
  if (result.status === 'error') {
    // Not a missing row: let the frame of the app say that something went wrong.
    throw asError(result.error);
  }
  if (result.status === 'loading') {
    return (
      <PageHeader
        title={t.editTitle}
        back={{ to: paths.articles(), label: articlesMessages.title }}
      />
    );
  }
  const { article, unitLock, madeBy } = result.data;
  return (
    <ArticleForm key={article.id} article={article} unitLock={unitLock} recipeName={madeBy?.name} />
  );
}
