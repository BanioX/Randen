/**
 * «Produktion»: a recipe is cooked. Its ingredients leave the stock first expired first out
 * (the ledger, ADR-0007), a component enters the stock as a new lot with a label, and the run is
 * kept with its cost and shortages (ADR-0008: cost is computed, the value consumed is recorded).
 */
import {
  CommandError,
  createCommandKit,
  requireRow,
  type AppContext,
  type UseCase,
} from '../../application/command';
import { createStockLedger } from '../../application/stock-ledger';
import { CONTRACT_V1 } from '../../contract';
import { addDays } from '../../dates';
import { allocateFefo, usableQuantity } from '../../domain/fefo';
import { mustNotUse } from '../../domain/expiry';
import type { Requirement } from '../../domain/requirements';
import { lineValue, roundQuantity, unitPriceFromTotal } from '../../domain/units';
import type { Id } from '../../ids';
import type { LocalDate } from '../../model/primitives';
import { rappen, type Rappen } from '../../money';
import { ProductionSchema, type Production, type Recipe } from '../../model/recipe';
import type { StockLot } from '../../model/stock';
import type { Book } from './book';
import {
  activeLots,
  areaNameOf,
  declarationFor,
  loadBook,
  nameOf,
  recipeRowOf,
  requireArticle,
  requireRecipe,
  requirementsOf,
  shortCode,
  staffNameOf,
  unitOf,
} from './book';
import type {
  ProductionDetail,
  ProductionLabel,
  ProductionPreview,
  ProductionRow,
  RunIngredient,
  RunOutput,
  RunTake,
  TraceIn,
} from './contract';

/** Value of `quantity` taken from a lot, as the ledger books it: the lot's value before minus after. */
function valueOfTake(lot: StockLot, quantity: number): Rappen {
  return rappen(
    lineValue(lot.quantity, lot.pricePer1000) -
      lineValue(roundQuantity(lot.quantity - quantity), lot.pricePer1000),
  );
}

/** One ingredient of a run: its need, what the stock may give, the lots it would take. */
function ingredientOf(book: Book, requirement: Requirement): RunIngredient {
  const lots = activeLots(book, requirement.articleId);
  const { picks, missing } = allocateFefo(lots, requirement.quantity, book.today);
  const byId = new Map(lots.map((lot) => [lot.id, lot]));
  const takes: RunTake[] = picks.flatMap((pick): RunTake[] => {
    const lot = byId.get(pick.lotId);
    if (lot === undefined) {
      return [];
    }
    const areaName = areaNameOf(book, lot.areaId);
    return [
      {
        lotId: lot.id,
        areaId: lot.areaId,
        ...(areaName === undefined ? {} : { areaName }),
        ...(lot.expiresOn === undefined ? {} : { expiresOn: lot.expiresOn }),
        dateKind: lot.dateKind,
        receivedOn: lot.receivedOn,
        quantity: pick.quantity,
        valueRappen: valueOfTake(lot, pick.quantity),
      },
    ];
  });
  const unusable = lots.flatMap((lot) =>
    lot.expiresOn !== undefined && mustNotUse(lot.expiresOn, lot.dateKind, book.today)
      ? [{ lotId: lot.id, areaId: lot.areaId, expiresOn: lot.expiresOn, quantity: lot.quantity }]
      : [],
  );
  return {
    articleId: requirement.articleId,
    name: nameOf(book, requirement.articleId),
    unit: unitOf(book, requirement.articleId),
    quantity: requirement.quantity,
    netQuantity: requirement.netQuantity,
    usable: usableQuantity(lots, book.today),
    missing,
    takes,
    unusable,
    valueRappen: rappen(takes.reduce((sum, take) => sum + take.valueRappen, 0)),
  };
}

/**
 * What the run makes, if the recipe has an output article («Komponente»). The proposal is the
 * article's usual area and today plus the shelf life the business set (a Richtwert).
 */
function outputOf(
  book: Book,
  recipe: Recipe,
  portions: number,
  day: LocalDate,
): RunOutput | undefined {
  if (recipe.output === undefined) {
    return undefined;
  }
  const article = book.articles.get(recipe.output.articleId);
  if (article === undefined) {
    return undefined;
  }
  const quantity = roundQuantity((recipe.output.quantity * portions) / recipe.portions);
  const shelfLife = recipe.shelfLifeDays ?? article.shelfLifeDays;
  return {
    articleId: article.id,
    name: article.name,
    unit: article.unit,
    quantity,
    ...(article.areaId === undefined ? {} : { proposedAreaId: article.areaId }),
    ...(shelfLife === undefined
      ? {}
      : { proposedExpiresOn: addDays(day, shelfLife), shelfLifeDays: shelfLife }),
  };
}

function costPerPortion(costRappen: number, portions: number): Rappen {
  return rappen(Math.round(costRappen / Math.max(1, portions)));
}

/**
 * The lots a run made: its output lot, and the parts a move split off it. They all carry the
 * run's productionId, so the run's output is their sum (initial quantities: what was made).
 */
function outputLotsOf(book: Book, productionId: Id): StockLot[] {
  return [...book.lots.values()].filter(
    (lot) => lot.productionId === productionId && lot.origin === 'production',
  );
}

/** The lot of a run's output that holds most: its area, date and price are the ones shown. */
function mainOutputLot(lots: readonly StockLot[]): StockLot | undefined {
  return [...lots].sort((a, b) => b.quantity - a.quantity || a.id.localeCompare(b.id))[0];
}

function sumOf(lots: readonly StockLot[], of: (lot: StockLot) => number): number {
  return lots.reduce((sum, lot) => sum + of(lot), 0);
}

/** A run as lists show it: names and numbers joined, cost per portion computed. */
function rowOf(book: Book, production: Production): ProductionRow {
  const recipe = recipeRowOf(book, production.recipeId);
  const outputLot =
    production.outputLotId === undefined ? undefined : book.lots.get(production.outputLotId);
  const producedByName = staffNameOf(book, production.producedBy);
  return {
    id: production.id,
    recipeId: production.recipeId,
    recipeName: recipe?.name ?? '',
    kind: recipe?.kind ?? 'dish',
    portions: production.portions,
    producedOn: production.producedOn,
    costRappen: production.costRappen,
    costPerPortionRappen: costPerPortion(production.costRappen, production.portions),
    shortageCount: production.shortages.length,
    producedBy: production.producedBy,
    ...(producedByName === undefined ? {} : { producedByName }),
    ...(outputLot === undefined
      ? {}
      : { outputLotId: outputLot.id, outputName: nameOf(book, outputLot.articleId) }),
    ...(production.planEntryId === undefined ? {} : { planEntryId: production.planEntryId }),
    ...(production.note === undefined ? {} : { note: production.note }),
  };
}

/** Use cases of the production runs: preview, record, list, trace and label. */
export function createRunUseCases(ctx: AppContext) {
  const { storage, clock, ids } = ctx;
  const { emit, runCommand, stamps } = createCommandKit(ctx);
  const ledger = createStockLedger(ctx);

  const preview: UseCase<'production.preview'> = async (raw) => {
    const input = CONTRACT_V1['production.preview'].input.parse(raw);
    const book = await loadBook(ctx, input.businessId);
    const recipe = requireRecipe(book, input.recipeId);
    const ingredients = requirementsOf(book, recipe, input.portions).map((requirement) =>
      ingredientOf(book, requirement),
    );
    const costRappen = rappen(ingredients.reduce((sum, row) => sum + row.valueRappen, 0));
    const output = outputOf(book, recipe, input.portions, book.today);
    const result: ProductionPreview = {
      recipeId: recipe.id,
      recipeName: recipe.name,
      kind: recipe.kind,
      batchPortions: recipe.portions,
      portions: input.portions,
      ingredients,
      costRappen,
      costPerPortionRappen: costPerPortion(costRappen, input.portions),
      shortages: ingredients.flatMap((row) =>
        row.missing > 0
          ? [{ articleId: row.articleId, name: row.name, unit: row.unit, missing: row.missing }]
          : [],
      ),
      today: book.today,
      ...(output === undefined ? {} : { output }),
    };
    return result;
  };

  const record: UseCase<'production.record'> = async (raw) => {
    const input = CONTRACT_V1['production.record'].input.parse(raw);
    return runCommand('production.record', input.commandId, async () => {
      const { businessId } = input;
      const book = await loadBook(ctx, businessId);
      const recipe = requireRecipe(book, input.recipeId);
      const producedOn = input.producedOn ?? book.today;
      if (producedOn > book.today) {
        throw new CommandError('invalid', 'Eine Produktion kann nicht in der Zukunft liegen');
      }
      const productionId = ids.next();
      const requirements = requirementsOf(book, recipe, input.portions);

      // Everything that can refuse is checked before the first movement is booked.
      const outputArticle =
        recipe.output === undefined ? undefined : requireArticle(book, recipe.output.articleId);
      const outputArea = input.outputAreaId ?? outputArticle?.areaId;
      if (outputArticle !== undefined && outputArea === undefined) {
        throw new CommandError('invalid', 'Für das Ergebnis fehlt der Lagerbereich');
      }
      if (outputArea !== undefined) {
        await requireRow(storage.areas, businessId, outputArea, 'Area');
      }
      const entry =
        input.planEntryId === undefined
          ? undefined
          : await requireRow(storage.planEntries, businessId, input.planEntryId, 'PlanEntry');
      if (entry !== undefined && entry.recipeId !== recipe.id) {
        throw new CommandError(
          'invalid',
          'Der Eintrag im Menüplan gehört zu einem anderen Gericht',
        );
      }
      if (entry?.productionId !== undefined) {
        throw new CommandError('invalid', 'Der Eintrag im Menüplan ist schon produziert');
      }

      // Expiry is judged on the day the run is booked, as the preview does: a run dated back still
      // never cooks what passed its Verbrauchsdatum.
      const consumed = await ledger.consumeMany(requirements, {
        businessId,
        on: producedOn,
        usableOn: book.today,
        purpose: 'production',
        productionId,
        ...(input.note === undefined ? {} : { note: input.note }),
      });
      const costRappen = consumed.valueRappen;
      const shortages = consumed.shortages.map((shortage) => ({
        articleId: shortage.articleId,
        name: nameOf(book, shortage.articleId),
        unit: unitOf(book, shortage.articleId),
        missing: shortage.missing,
      }));

      let outputLotId: Id | undefined;
      if (outputArticle !== undefined && outputArea !== undefined && recipe.output !== undefined) {
        const quantity = roundQuantity((recipe.output.quantity * input.portions) / recipe.portions);
        const shelfLife = recipe.shelfLifeDays ?? outputArticle.shelfLifeDays;
        const expiresOn =
          input.outputExpiresOn ??
          (shelfLife === undefined ? undefined : addDays(producedOn, shelfLife));
        const lot = await ledger.receive({
          businessId,
          articleId: outputArticle.id,
          areaId: outputArea,
          quantity,
          pricePer1000: unitPriceFromTotal(costRappen, quantity),
          receivedOn: producedOn,
          expiresOn,
          origin: 'production',
          productionId,
          // A run with shortages cost less than it really did: its price is not remembered.
          updateArticlePrice: shortages.length === 0,
        });
        outputLotId = lot.id;
      }

      const production = ProductionSchema.parse({
        id: productionId,
        businessId,
        recipeId: recipe.id,
        portions: input.portions,
        producedOn,
        costRappen,
        ...(outputLotId === undefined ? {} : { outputLotId }),
        shortages: shortages.map((shortage) => ({
          articleId: shortage.articleId,
          missing: shortage.missing,
        })),
        ...(input.planEntryId === undefined ? {} : { planEntryId: input.planEntryId }),
        producedBy: ctx.actor,
        ...(input.note === undefined ? {} : { note: input.note }),
        ...stamps(),
      });
      await storage.productions.add(production);
      if (entry !== undefined) {
        const now = clock.now();
        await storage.planEntries.put({ ...entry, productionId, updatedAt: now });
      }
      await emit(businessId, 'production.recorded', {
        productionId,
        recipeId: recipe.id,
        portions: input.portions,
        costRappen,
        shortages: shortages.length,
        ...(outputLotId === undefined ? {} : { outputLotId }),
      });
      return {
        productionId,
        costRappen,
        costPerPortionRappen: costPerPortion(costRappen, input.portions),
        shortages,
        ...(outputLotId === undefined ? {} : { outputLotId }),
      };
    });
  };

  const list: UseCase<'production.list'> = async (raw) => {
    const input = CONTRACT_V1['production.list'].input.parse(raw);
    const book = await loadBook(ctx, input.businessId);
    const rows = (await storage.productions.ofBusiness(input.businessId))
      .filter((row) => row.deletedAt === undefined)
      .filter((row) => input.from === undefined || row.producedOn >= input.from)
      .filter((row) => input.to === undefined || row.producedOn <= input.to)
      .sort(
        (a, b) =>
          b.producedOn.localeCompare(a.producedOn) || b.createdAt.localeCompare(a.createdAt),
      );
    return { productions: rows.map((row) => rowOf(book, row)) };
  };

  const get: UseCase<'production.get'> = async (raw) => {
    const input = CONTRACT_V1['production.get'].input.parse(raw);
    const { businessId, productionId } = input;
    const book = await loadBook(ctx, businessId);
    const production = await requireRow(
      storage.productions,
      businessId,
      productionId,
      'Production',
    );
    const movements = await storage.movements.ofBusiness(businessId);

    // What went in: the consumption movements of this run, summed per lot.
    const taken = new Map<Id, { quantity: number; value: number }>();
    for (const move of movements) {
      if (move.productionId !== productionId || move.type !== 'consumption') {
        continue;
      }
      const known = taken.get(move.lotId) ?? { quantity: 0, value: 0 };
      taken.set(move.lotId, {
        quantity: roundQuantity(known.quantity - move.quantity),
        value: known.value - move.valueRappen,
      });
    }
    const ins: TraceIn[] = [...taken.entries()].flatMap(([lotId, amount]) => {
      const lot = book.lots.get(lotId);
      if (lot === undefined || amount.quantity <= 0) {
        return [];
      }
      const supplierName =
        lot.supplierId === undefined ? undefined : book.suppliers.get(lot.supplierId)?.name;
      const areaName = areaNameOf(book, lot.areaId);
      return [
        {
          lotId: lot.id,
          lotCode: lot.lotCode ?? shortCode(lot.id),
          articleId: lot.articleId,
          name: nameOf(book, lot.articleId),
          unit: unitOf(book, lot.articleId),
          quantity: amount.quantity,
          valueRappen: rappen(Math.max(0, Math.round(amount.value))),
          ...(supplierName === undefined ? {} : { supplierName }),
          receivedOn: lot.receivedOn,
          ...(lot.expiresOn === undefined ? {} : { expiresOn: lot.expiresOn }),
          dateKind: lot.dateKind,
          origin: lot.origin,
          ...(areaName === undefined ? {} : { areaName }),
        },
      ];
    });
    ins.sort(
      (a, b) => a.name.localeCompare(b.name, 'de-CH') || a.receivedOn.localeCompare(b.receivedOn),
    );

    const outputLots = outputLotsOf(book, productionId);
    const outputLot = mainOutputLot(outputLots);
    const outputAreaName = outputLot === undefined ? undefined : areaNameOf(book, outputLot.areaId);
    const result: ProductionDetail = {
      production: rowOf(book, production),
      ins,
      shortages: production.shortages.map((shortage) => ({
        articleId: shortage.articleId,
        name: nameOf(book, shortage.articleId),
        unit: unitOf(book, shortage.articleId),
        missing: shortage.missing,
      })),
      ...(outputLot === undefined
        ? {}
        : {
            output: {
              lotId: outputLot.id,
              lotCode: outputLot.lotCode ?? shortCode(outputLot.id),
              articleId: outputLot.articleId,
              name: nameOf(book, outputLot.articleId),
              unit: unitOf(book, outputLot.articleId),
              quantity: roundQuantity(sumOf(outputLots, (lot) => lot.initialQuantity)),
              remaining: roundQuantity(sumOf(outputLots, (lot) => lot.quantity)),
              pricePer1000: outputLot.pricePer1000,
              ...(outputLot.expiresOn === undefined ? {} : { expiresOn: outputLot.expiresOn }),
              dateKind: outputLot.dateKind,
              ...(outputAreaName === undefined ? {} : { areaName: outputAreaName }),
            },
          }),
    };
    return result;
  };

  const label: UseCase<'production.label'> = async (raw) => {
    const input = CONTRACT_V1['production.label'].input.parse(raw);
    const { businessId, productionId } = input;
    const book = await loadBook(ctx, businessId);
    const production = await requireRow(
      storage.productions,
      businessId,
      productionId,
      'Production',
    );
    const recipe = recipeRowOf(book, production.recipeId);
    if (recipe === undefined) {
      throw new CommandError('not_found', `Recipe ${production.recipeId} not found`);
    }
    const declaration = declarationFor(book, recipe);
    const outputLot =
      production.outputLotId === undefined ? undefined : book.lots.get(production.outputLotId);
    const producedByName = staffNameOf(book, production.producedBy);
    const outputName = outputLot === undefined ? undefined : nameOf(book, outputLot.articleId);
    const result: ProductionLabel = {
      productionId,
      name: outputName ?? recipe.name,
      producedOn: production.producedOn,
      portions: production.portions,
      allergens: declaration.allergens,
      traces: declaration.traces,
      diet: declaration.diet,
      incomplete: declaration.incomplete,
      code: shortCode(outputLot?.id ?? production.id),
      ...(outputLot === undefined
        ? {}
        : {
            quantity: roundQuantity(
              sumOf(outputLotsOf(book, productionId), (lot) => lot.initialQuantity),
            ),
            unit: unitOf(book, outputLot.articleId),
            dateKind: outputLot.dateKind,
            ...(outputLot.expiresOn === undefined ? {} : { useBy: outputLot.expiresOn }),
          }),
      ...(producedByName === undefined ? {} : { producedByName }),
    };
    return result;
  };

  return {
    'production.preview': preview,
    'production.record': record,
    'production.list': list,
    'production.get': get,
    'production.label': label,
  };
}
