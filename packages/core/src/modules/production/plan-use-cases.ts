/**
 * «Menüplan» (ADR-0015, the function `planning`): the week with its dishes per day and meal,
 * allergens and warnings per line, what the week costs and needs, «Reste verwerten» and the auto
 * fill. Lines, meal counts and weighings are in `lines-use-cases.ts`.
 */
import {
  CommandError,
  createCommandKit,
  requireRow,
  type AppContext,
  type UseCase,
} from '../../application/command';
import { CONTRACT_V1 } from '../../contract';
import { addDays, daysBetween } from '../../dates';
import { combineDiets, sortAllergens, type Diet } from '../../domain/allergens';
import { netOfVat, type DishFigures, type RecipeCost } from '../../domain/costing';
import type { Declaration } from '../../domain/declaration';
import { sumRequirements, type Requirement } from '../../domain/requirements';
import { roundQuantity } from '../../domain/units';
import type { Id } from '../../ids';
import { rappen, type Rappen } from '../../money';
import {
  PLAN_SLOTS,
  PlanEntrySchema,
  type MenuLine,
  type PlanEntry,
  type PlanSlot,
} from '../../model/menu';
import type { LocalDate } from '../../model/primitives';
import type { Recipe } from '../../model/recipe';
import { alive } from '../../ports/storage';
import {
  costOf,
  declarationFor,
  figuresOf,
  loadBook,
  mondayOf,
  nameOf,
  perPortionOf,
  recipeRowOf,
  requirementsOf,
  usableMap,
  usableOf,
  weekDays,
  type Book,
} from './book';
import {
  planAutoFill,
  rankDishes,
  suggestDishes,
  type RankDish,
  type SuggestDish,
  type SuggestLot,
} from './suggest';
import type {
  AutoFillEntry,
  PlanDay,
  PlanDemand,
  PlanEntryView,
  PlanLineDay,
  PlanLineWarning,
  PlanSuggestion,
  PlanWeek,
} from './contract';
import { lineViewOf, mealViewOf, weighingViewOf } from './views';

const DIET_RANK: Record<Diet, number> = { vegan: 0, vegetarian: 1, omnivore: 2 };

/** Everything the plan shows about one dish, computed once per call. */
export interface DishFacts {
  recipe: Recipe;
  /** False when the recipe was deleted: its numbers are no longer complete. */
  live: boolean;
  perPortion: Rappen;
  figures: DishFigures | undefined;
  declaration: Declaration;
  incomplete: boolean;
}

/** Facts of every recipe the plan uses, looked up once. */
export function factsReader(book: Book): (recipeId: Id) => DishFacts | undefined {
  const cache = new Map<Id, DishFacts | undefined>();
  return (recipeId) => {
    if (cache.has(recipeId)) {
      return cache.get(recipeId);
    }
    const row = recipeRowOf(book, recipeId);
    let facts: DishFacts | undefined;
    if (row !== undefined) {
      const live = book.recipes.get(recipeId);
      const cost: RecipeCost | undefined = live === undefined ? undefined : costOf(book, live);
      facts = {
        recipe: row,
        live: live !== undefined,
        perPortion: cost?.perPortionRappen ?? rappen(0),
        figures: live !== undefined && cost !== undefined ? figuresOf(book, live, cost) : undefined,
        declaration: declarationFor(book, row),
        incomplete: live === undefined || cost === undefined || cost.missingPrices.length > 0,
      };
    }
    cache.set(recipeId, facts);
    return facts;
  };
}

/** The place of a line in the plan; a dish without a line, or a deleted one, comes last. */
function lineOrderOf(book: Book, lineId: Id | undefined): number {
  if (lineId === undefined) {
    return Number.MAX_SAFE_INTEGER;
  }
  return book.lines.get(lineId)?.sortOrder ?? Number.MAX_SAFE_INTEGER;
}

/** The menu price of one portion, net of VAT, when the dish has one. */
function netPriceOf(facts: DishFacts): Rappen | undefined {
  const price = facts.recipe.priceRappen;
  return price === undefined || price <= 0 ? undefined : netOfVat(price, facts.recipe.vatBps);
}

/** Warnings and the declaration of one line on one day, from the dishes it holds (ADR-0008). */
function lineDayOf(
  book: Book,
  lineId: Id | undefined,
  items: { entry: PlanEntry; facts: DishFacts | undefined }[],
): PlanLineDay {
  const line: MenuLine | undefined = lineId === undefined ? undefined : book.lines.get(lineId);
  const declared = items.flatMap((item) =>
    item.facts === undefined ? [] : [item.facts.declaration],
  );
  const allergens = sortAllergens(
    new Set(declared.flatMap((declaration) => declaration.allergens)),
  );
  const traces = sortAllergens(new Set(declared.flatMap((declaration) => declaration.traces)));
  const diet = combineDiets(declared.map((declaration) => declaration.diet));
  const warnings: PlanLineWarning[] = [];
  if (line !== undefined && items.length > 0) {
    if (line.requiredDiet !== undefined && DIET_RANK[diet] > DIET_RANK[line.requiredDiet]) {
      warnings.push({ kind: 'diet', requiredDiet: line.requiredDiet, diet });
    }
    for (const allergen of line.freeOf) {
      if (allergens.includes(allergen)) {
        warnings.push({ kind: 'allergen', allergen, trace: false });
      } else if (traces.includes(allergen)) {
        warnings.push({ kind: 'allergen', allergen, trace: true });
      }
    }
  }
  return {
    ...(lineId === undefined ? {} : { lineId }),
    name: line?.name ?? '',
    entries: items.length,
    portions: items.reduce((sum, item) => sum + item.entry.portions, 0),
    allergens,
    traces,
    diet,
    incomplete: items.some((item) => item.facts === undefined || item.facts.incomplete),
    warnings,
  };
}

/** The dishes of one day grouped by line, in the order of the lines; without a line last. */
function linesOfDay(
  book: Book,
  items: { entry: PlanEntry; facts: DishFacts | undefined }[],
): PlanLineDay[] {
  const groups = new Map<string, { lineId: Id | undefined; items: typeof items }>();
  for (const item of items) {
    const key = item.entry.lineId ?? '';
    const group = groups.get(key) ?? { lineId: item.entry.lineId, items: [] };
    group.items.push(item);
    groups.set(key, group);
  }
  const order = (lineId: Id | undefined) => lineOrderOf(book, lineId);
  return [...groups.values()]
    .sort((a, b) => order(a.lineId) - order(b.lineId))
    .map((group) => lineDayOf(book, group.lineId, group.items));
}

/** The demand of the open entries: what they need in gross, what may be used, what is missing. */
function demandOf(book: Book, open: PlanEntry[]): PlanDemand[] {
  const lists: Requirement[][] = [];
  const entriesPerArticle = new Map<Id, number>();
  for (const entry of open) {
    const recipe = book.recipes.get(entry.recipeId);
    if (recipe === undefined) {
      continue;
    }
    const requirements = requirementsOf(book, recipe, entry.portions);
    lists.push(requirements);
    for (const requirement of requirements) {
      entriesPerArticle.set(
        requirement.articleId,
        (entriesPerArticle.get(requirement.articleId) ?? 0) + 1,
      );
    }
  }
  return sumRequirements(lists)
    .map((requirement): PlanDemand => {
      const usable = usableOf(book, requirement.articleId);
      const article = book.articles.get(requirement.articleId);
      return {
        articleId: requirement.articleId,
        name: nameOf(book, requirement.articleId),
        unit: article?.unit ?? 'g',
        needed: requirement.quantity,
        usable,
        missing: roundQuantity(Math.max(0, requirement.quantity - usable)),
        entries: entriesPerArticle.get(requirement.articleId) ?? 1,
      };
    })
    .sort((a, b) => b.missing - a.missing || a.name.localeCompare(b.name, 'de-CH'));
}

/** The active dishes as the suggestion rules see them: what one portion needs, per article. */
function dishesForSuggest(book: Book): SuggestDish[] {
  const dishes: SuggestDish[] = [];
  for (const recipe of book.recipes.values()) {
    if (recipe.kind !== 'dish' || !recipe.active) {
      continue;
    }
    const cost = costOf(book, recipe);
    dishes.push({
      recipeId: recipe.id,
      recipeName: recipe.name,
      course: recipe.course,
      perPortion: perPortionOf(book, recipe),
      marginStatus: figuresOf(book, recipe, cost)?.status ?? 'unknown',
    });
  }
  return dishes;
}

/** Suggestions of every active dish, for «Reste verwerten» and the auto fill. */
function suggestDishesOf(
  book: Book,
  from: LocalDate,
  days: number,
  dishes: SuggestDish[] = dishesForSuggest(book),
): PlanSuggestion[] {
  const lots: SuggestLot[] = [];
  for (const lot of book.lots.values()) {
    if (lot.status === 'active' && lot.quantity > 0 && lot.expiresOn !== undefined) {
      lots.push({
        id: lot.id,
        articleId: lot.articleId,
        quantity: lot.quantity,
        pricePer1000: lot.pricePer1000,
        expiresOn: lot.expiresOn,
        dateKind: lot.dateKind,
      });
    }
  }
  const articles = new Map(
    [...book.articles.values()].map((article) => [
      article.id,
      { name: article.name, unit: article.unit },
    ]),
  );
  const usable = new Map(
    [...book.lotsByArticle.keys()].map((articleId) => [articleId, usableOf(book, articleId)]),
  );
  return suggestDishes({ today: from, days, lots, dishes, articles, usable });
}

/** Sales of the last 28 days per recipe, in portions. */
function soldLast28Of(
  sales: readonly { soldOn: LocalDate; recipeId?: Id | undefined; portions: number }[],
  today: LocalDate,
): Map<Id, number> {
  const since = addDays(today, -27);
  const sold = new Map<Id, number>();
  for (const sale of sales) {
    if (sale.recipeId === undefined || sale.soldOn < since || sale.soldOn > today) {
      continue;
    }
    sold.set(sale.recipeId, (sold.get(sale.recipeId) ?? 0) + sale.portions);
  }
  return sold;
}

/** Use cases of the menu plan: the week, its entries, «Reste verwerten», copying and the auto fill. */
export function createPlanUseCases(ctx: AppContext) {
  const { storage, clock, ids } = ctx;
  const { emit, runCommand, stamps } = createCommandKit(ctx);

  const week: UseCase<'plan.week'> = async (raw) => {
    const input = CONTRACT_V1['plan.week'].input.parse(raw);
    const { businessId } = input;
    const book = await loadBook(ctx, businessId);
    const monday = mondayOf(input.weekStart);
    const dates = weekDays(monday);
    const weekEnd = addDays(monday, 6);
    const inWeek = (date: LocalDate) => date >= monday && date <= weekEnd;
    const facts = factsReader(book);
    const weekEntries = alive(await storage.planEntries.ofBusiness(businessId)).filter((entry) =>
      inWeek(entry.date),
    );
    const meals = alive(await storage.mealCounts.ofBusiness(businessId)).filter((meal) =>
      inWeek(meal.date),
    );
    const weighings = alive(await storage.wasteWeighings.ofBusiness(businessId)).filter((row) =>
      inWeek(row.date),
    );

    const lines = [...book.lines.values()].sort((a, b) => a.sortOrder - b.sortOrder);
    const activeLines = lines.filter((line) => line.active);
    const slotOrder = (slot: PlanSlot) => PLAN_SLOTS.indexOf(slot);
    const lineOrder = (lineId: Id | undefined) => lineOrderOf(book, lineId);

    const days: PlanDay[] = dates.map((date) => {
      const items = weekEntries
        .filter((entry) => entry.date === date)
        .sort(
          (a, b) =>
            slotOrder(a.slot) - slotOrder(b.slot) ||
            lineOrder(a.lineId) - lineOrder(b.lineId) ||
            (facts(a.recipeId)?.recipe.name ?? '').localeCompare(
              facts(b.recipeId)?.recipe.name ?? '',
              'de-CH',
            ),
        )
        .map((entry) => ({ entry, facts: facts(entry.recipeId) }));
      const entries: PlanEntryView[] = items.map(({ entry, facts: dish }) => {
        const lineName =
          entry.lineId === undefined ? undefined : book.lines.get(entry.lineId)?.name;
        const recipe = dish?.recipe;
        const foodCostBps = dish?.figures?.foodCostBps;
        return {
          id: entry.id,
          date: entry.date,
          slot: entry.slot,
          recipeId: entry.recipeId,
          recipeName: recipe?.name ?? '',
          course: recipe?.course ?? 'other',
          ...(recipe?.photo === undefined ? {} : { photo: recipe.photo }),
          portions: entry.portions,
          ...(entry.lineId === undefined ? {} : { lineId: entry.lineId }),
          ...(lineName === undefined ? {} : { lineName }),
          ...(entry.note === undefined ? {} : { note: entry.note }),
          ...(entry.productionId === undefined ? {} : { productionId: entry.productionId }),
          produced: entry.productionId !== undefined,
          costPerPortionRappen: dish?.perPortion ?? rappen(0),
          costIncomplete: dish?.incomplete ?? true,
          ...(recipe?.priceRappen === undefined || recipe.priceRappen <= 0
            ? {}
            : { priceRappen: recipe.priceRappen }),
          marginStatus: dish?.figures?.status ?? 'unknown',
          ...(foodCostBps === undefined ? {} : { foodCostBps }),
          recipeActive: recipe?.active ?? false,
        };
      });
      const netRevenue = items.reduce((sum, { entry, facts: dish }) => {
        const net = dish === undefined ? undefined : netPriceOf(dish);
        return sum + (net === undefined ? 0 : net * entry.portions);
      }, 0);
      const cost = items.reduce(
        (sum, { entry, facts: dish }) =>
          sum + (dish === undefined ? 0 : dish.perPortion * entry.portions),
        0,
      );
      return {
        date,
        entries,
        portions: items.reduce((sum, { entry }) => sum + entry.portions, 0),
        netRevenueRappen: rappen(netRevenue),
        costRappen: rappen(cost),
        unpricedEntries: items.filter(
          ({ facts: dish }) =>
            dish === undefined || dish.incomplete || netPriceOf(dish) === undefined,
        ).length,
        lines: linesOfDay(book, items),
      };
    });

    const allEntries = days.flatMap((day) => day.entries);
    const open = weekEntries.filter((entry) => entry.productionId === undefined);
    const usedSlots = new Set<PlanSlot>(['lunch']);
    for (const entry of weekEntries) {
      usedSlots.add(entry.slot);
    }
    for (const line of activeLines) {
      if (line.slot !== undefined) {
        usedSlots.add(line.slot);
      }
    }
    for (const meal of meals) {
      usedSlots.add(meal.slot);
    }
    const planned = new Map<
      string,
      { date: LocalDate; slot: PlanSlot; lineId?: Id; portions: number }
    >();
    for (const entry of weekEntries) {
      const key = `${entry.date}|${entry.slot}|${entry.lineId ?? ''}`;
      const known = planned.get(key);
      planned.set(key, {
        date: entry.date,
        slot: entry.slot,
        ...(entry.lineId === undefined ? {} : { lineId: entry.lineId }),
        portions: (known?.portions ?? 0) + entry.portions,
      });
    }
    const result: PlanWeek = {
      weekStart: monday,
      weekEnd,
      today: book.today,
      slots: PLAN_SLOTS.filter((slot) => usedSlots.has(slot)),
      lines: activeLines.map(lineViewOf),
      days,
      entries: allEntries.length,
      open: open.length,
      portions: days.reduce((sum, day) => sum + day.portions, 0),
      netRevenueRappen: rappen(days.reduce((sum, day) => sum + day.netRevenueRappen, 0)),
      costRappen: rappen(days.reduce((sum, day) => sum + day.costRappen, 0)),
      unpricedEntries: days.reduce((sum, day) => sum + day.unpricedEntries, 0),
      demand: demandOf(book, open),
      meals: meals.map(mealViewOf),
      planned: [...planned.values()],
      weighings: weighings.map(weighingViewOf),
    };
    return result;
  };

  /** A dish is planned on a day: the entry, checked against the recipe and the line. */
  async function checkedDish(
    businessId: Id,
    recipeId: Id,
    slot: PlanSlot,
    lineId: Id | undefined,
  ): Promise<void> {
    const recipe = await requireRow(storage.recipes, businessId, recipeId, 'Recipe');
    if (recipe.kind !== 'dish') {
      throw new CommandError('invalid', 'Nur Gerichte kommen in den Menüplan, keine Komponenten');
    }
    if (!recipe.active) {
      throw new CommandError('not_allowed', 'Das Rezept ist nicht mehr aktiv');
    }
    if (lineId !== undefined) {
      const line = await requireRow(storage.menuLines, businessId, lineId, 'MenuLine');
      if (!line.active) {
        throw new CommandError('not_allowed', 'Die Menülinie ist nicht mehr aktiv');
      }
      if (line.slot !== undefined && line.slot !== slot) {
        throw new CommandError('invalid', 'Die Menülinie gehört zu einer anderen Mahlzeit');
      }
    }
  }

  const add: UseCase<'plan.add'> = async (raw) => {
    const input = CONTRACT_V1['plan.add'].input.parse(raw);
    return runCommand('plan.add', input.commandId, async () => {
      await checkedDish(input.businessId, input.recipeId, input.slot, input.lineId);
      const entryId = ids.next();
      await storage.planEntries.add(
        PlanEntrySchema.parse({
          id: entryId,
          businessId: input.businessId,
          date: input.date,
          slot: input.slot,
          recipeId: input.recipeId,
          portions: input.portions,
          ...(input.lineId === undefined ? {} : { lineId: input.lineId }),
          ...(input.note === undefined ? {} : { note: input.note }),
          ...stamps(),
        }),
      );
      await emit(input.businessId, 'plan.entry_added', {
        entryId,
        date: input.date,
        slot: input.slot,
        recipeId: input.recipeId,
        portions: input.portions,
      });
      return { entryId };
    });
  };

  const update: UseCase<'plan.update'> = async (raw) => {
    const input = CONTRACT_V1['plan.update'].input.parse(raw);
    return runCommand('plan.update', input.commandId, async () => {
      const { businessId } = input;
      const entry = await requireRow(storage.planEntries, businessId, input.entryId, 'PlanEntry');
      const { lineId: currentLine, note: currentNote, ...rest } = entry;
      const lineId = input.lineId === undefined ? currentLine : (input.lineId ?? undefined);
      const note = input.note === undefined ? currentNote : (input.note ?? undefined);
      const slot = input.slot ?? entry.slot;
      await checkedDish(businessId, entry.recipeId, slot, lineId);
      const next = PlanEntrySchema.parse({
        ...rest,
        date: input.date ?? entry.date,
        slot,
        portions: input.portions ?? entry.portions,
        ...(lineId === undefined ? {} : { lineId }),
        ...(note === undefined ? {} : { note }),
        updatedAt: clock.now(),
      });
      await storage.planEntries.put(next);
      await emit(businessId, 'plan.entry_updated', {
        entryId: entry.id,
        date: next.date,
        slot,
        portions: next.portions,
      });
      return { entryId: entry.id };
    });
  };

  const remove: UseCase<'plan.remove'> = async (raw) => {
    const input = CONTRACT_V1['plan.remove'].input.parse(raw);
    return runCommand('plan.remove', input.commandId, async () => {
      const entry = await requireRow(
        storage.planEntries,
        input.businessId,
        input.entryId,
        'PlanEntry',
      );
      const now = clock.now();
      await storage.planEntries.put({ ...entry, deletedAt: now, updatedAt: now });
      await emit(input.businessId, 'plan.entry_removed', { entryId: entry.id, date: entry.date });
      return { entryId: entry.id };
    });
  };

  const copyWeek: UseCase<'plan.copyWeek'> = async (raw) => {
    const input = CONTRACT_V1['plan.copyWeek'].input.parse(raw);
    return runCommand('plan.copyWeek', input.commandId, async () => {
      const { businessId } = input;
      const from = mondayOf(input.fromWeekStart);
      const to = mondayOf(input.toWeekStart);
      if (from === to) {
        throw new CommandError('invalid', 'Die Woche kopiert sich nicht in sich selbst');
      }
      const inWeek = (start: LocalDate, date: LocalDate) =>
        date >= start && date <= addDays(start, 6);
      const rows = alive(await storage.planEntries.ofBusiness(businessId));
      if (rows.some((row) => inWeek(to, row.date))) {
        throw new CommandError('not_allowed', 'Die Zielwoche ist nicht leer');
      }
      const source = rows.filter((row) => inWeek(from, row.date));
      const offset = daysBetween(from, to);
      const now = clock.now();
      let copied = 0;
      let skipped = 0;
      for (const row of source) {
        // A dish that left the menu, or a line that was switched off, is not copied: it is counted.
        try {
          await checkedDish(businessId, row.recipeId, row.slot, row.lineId);
        } catch (error) {
          if (error instanceof CommandError) {
            skipped += 1;
            continue;
          }
          throw error;
        }
        copied += 1;
        await storage.planEntries.add(
          PlanEntrySchema.parse({
            id: ids.next(),
            businessId,
            date: addDays(row.date, offset),
            slot: row.slot,
            recipeId: row.recipeId,
            portions: row.portions,
            ...(row.lineId === undefined ? {} : { lineId: row.lineId }),
            ...(row.note === undefined ? {} : { note: row.note }),
            createdAt: now,
            updatedAt: now,
          }),
        );
      }
      await emit(businessId, 'plan.week_copied', { from, to, copied, skipped });
      return { copied, skipped };
    });
  };

  const suggest: UseCase<'plan.suggest'> = async (raw) => {
    const input = CONTRACT_V1['plan.suggest'].input.parse(raw);
    const book = await loadBook(ctx, input.businessId);
    return { suggestions: suggestDishesOf(book, input.from, input.days) };
  };

  const autoFill: UseCase<'plan.autoFill'> = async (raw) => {
    const input = CONTRACT_V1['plan.autoFill'].input.parse(raw);
    return runCommand('plan.autoFill', input.commandId, async () => {
      const { businessId } = input;
      const book = await loadBook(ctx, businessId);
      const monday = mondayOf(input.weekStart);
      const dates = weekDays(monday);
      const weekEnd = addDays(monday, 6);
      const days = dates.filter((date) => date >= book.today);
      const dishes = dishesForSuggest(book);
      const rows = alive(await storage.planEntries.ofBusiness(businessId));
      const weekRows = rows.filter((row) => row.date >= monday && row.date <= weekEnd);
      const occupied = new Set(weekRows.map((row) => `${row.date}|${row.slot}`));
      const usedRecipes = new Set(weekRows.map((row) => row.recipeId));
      const suggestions = suggestDishesOf(
        book,
        book.today,
        Math.max(0, daysBetween(book.today, weekEnd)),
        dishes,
      );
      const sold = soldLast28Of(alive(await storage.sales.ofBusiness(businessId)), book.today);
      const ranking: RankDish[] = rankDishes(
        [...book.recipes.values()]
          .filter((recipe) => recipe.kind === 'dish' && recipe.active)
          .map((recipe) => {
            const cost = costOf(book, recipe);
            const figures = figuresOf(book, recipe, cost);
            return {
              recipeId: recipe.id,
              recipeName: recipe.name,
              marginStatus: figures?.status ?? 'unknown',
              marginRappen: figures?.marginRappen,
              soldLast28: sold.get(recipe.id) ?? 0,
            };
          }),
      );
      const result = planAutoFill({
        days,
        slots: PLAN_SLOTS.filter((slot) => input.slots.includes(slot)),
        occupied,
        usedRecipes,
        dishesPerSlot: input.dishesPerSlot,
        suggestions,
        ranking,
        stock: { dishes, usable: usableMap(book) },
      });
      const now = clock.now();
      const planned: AutoFillEntry[] = [];
      for (const pick of result.picks) {
        const entryId = ids.next();
        await storage.planEntries.add(
          PlanEntrySchema.parse({
            id: entryId,
            businessId,
            date: pick.date,
            slot: pick.slot,
            recipeId: pick.recipeId,
            portions: pick.portions,
            createdAt: now,
            updatedAt: now,
          }),
        );
        planned.push({
          entryId,
          date: pick.date,
          slot: pick.slot,
          recipeId: pick.recipeId,
          recipeName: pick.recipeName,
          portions: pick.portions,
          reason:
            pick.reason.kind === 'expiring'
              ? {
                  kind: 'expiring',
                  articleName: pick.reason.articleName,
                  quantity: pick.reason.quantity,
                  unit: pick.reason.unit,
                  expiresOn: pick.reason.expiresOn,
                  savedRappen: rappen(pick.reason.savedRappen),
                }
              : {
                  kind: 'ranking',
                  soldLast28: pick.reason.soldLast28,
                  marginStatus: pick.reason.marginStatus,
                },
        });
      }
      await emit(businessId, 'plan.week_filled', {
        weekStart: monday,
        planned: planned.length,
        skipped: result.skipped,
      });
      return { planned, skipped: result.skipped };
    });
  };

  return {
    'plan.week': week,
    'plan.add': add,
    'plan.update': update,
    'plan.remove': remove,
    'plan.copyWeek': copyWeek,
    'plan.suggest': suggest,
    'plan.autoFill': autoFill,
  };
}
