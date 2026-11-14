import {
  CommandError,
  createCommandKit,
  type AppContext,
  type UseCase,
} from '../../application/command';
import { CONTRACT_V1 } from '../../contract';
import { roundQuantity } from '../../domain/units';
import type { Id } from '../../ids';
import { BusinessSchema } from '../../model/business';
import { alive } from '../../ports/storage';

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'de-CH');

/** Use cases of the shared reads: the business and the light lists for pickers. */
export function createLookupUseCases(ctx: AppContext) {
  const { storage, clock } = ctx;
  const { emit, runCommand } = createCommandKit(ctx);

  async function business(businessId: Id) {
    const row = await storage.businesses.get(businessId);
    if (row === undefined) {
      throw new CommandError('not_found', `Business ${businessId} not found`);
    }
    return row;
  }

  const getBusiness: UseCase<'business.get'> = async (raw) => {
    const input = CONTRACT_V1['business.get'].input.parse(raw);
    return { business: await business(input.businessId) };
  };

  const updateBusiness: UseCase<'business.update'> = async (raw) => {
    const input = CONTRACT_V1['business.update'].input.parse(raw);
    return runCommand('business.update', input.commandId, async () => {
      const row = await business(input.businessId);
      const fields = (['name', 'kind', 'targetFoodCostBps', 'defaultVatBps'] as const).filter(
        (field) => input[field] !== undefined && input[field] !== row[field],
      );
      if (fields.length === 0) {
        return { business: row };
      }
      const next = BusinessSchema.parse({
        ...row,
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.kind === undefined ? {} : { kind: input.kind }),
        ...(input.targetFoodCostBps === undefined
          ? {}
          : { targetFoodCostBps: input.targetFoodCostBps }),
        ...(input.defaultVatBps === undefined ? {} : { defaultVatBps: input.defaultVatBps }),
        updatedAt: clock.now(),
      });
      await storage.businesses.put(next);
      await emit(input.businessId, 'business.updated', { fields });
      return { business: next };
    });
  };

  const staff: UseCase<'lookup.staff'> = async (raw) => {
    const input = CONTRACT_V1['lookup.staff'].input.parse(raw);
    const rows = alive(await storage.staff.ofBusiness(input.businessId));
    return {
      staff: rows
        .filter((row) => input.includeInactive || row.active)
        .sort(byName)
        .map(({ id, name, role, active }) => ({ id, name, role, active })),
    };
  };

  const areas: UseCase<'lookup.areas'> = async (raw) => {
    const input = CONTRACT_V1['lookup.areas'].input.parse(raw);
    const [areaRows, spotRows] = await Promise.all([
      storage.areas.ofBusiness(input.businessId),
      storage.spots.ofBusiness(input.businessId),
    ]);
    const spots = alive(spotRows).sort((a, b) => a.sortOrder - b.sortOrder || byName(a, b));
    return {
      areas: alive(areaRows)
        .sort((a, b) => a.sortOrder - b.sortOrder || byName(a, b))
        .map((area) => ({
          id: area.id,
          name: area.name,
          kind: area.kind,
          ...(area.minDeciC === undefined ? {} : { minDeciC: area.minDeciC }),
          ...(area.maxDeciC === undefined ? {} : { maxDeciC: area.maxDeciC }),
          spots: spots
            .filter((spot) => spot.areaId === area.id)
            .map(({ id, name }) => ({ id, name })),
        })),
    };
  };

  const suppliers: UseCase<'lookup.suppliers'> = async (raw) => {
    const input = CONTRACT_V1['lookup.suppliers'].input.parse(raw);
    const rows = alive(await storage.suppliers.ofBusiness(input.businessId));
    return { suppliers: rows.sort(byName).map(({ id, name }) => ({ id, name })) };
  };

  const articles: UseCase<'lookup.articles'> = async (raw) => {
    const input = CONTRACT_V1['lookup.articles'].input.parse(raw);
    const [articleRows, lotRows] = await Promise.all([
      storage.articles.ofBusiness(input.businessId),
      storage.lots.ofBusiness(input.businessId),
    ]);
    const stock = new Map<Id, number>();
    for (const lot of alive(lotRows)) {
      if (lot.status === 'active') {
        stock.set(lot.articleId, (stock.get(lot.articleId) ?? 0) + lot.quantity);
      }
    }
    return {
      articles: alive(articleRows)
        .filter((row) => input.includeInactive || row.active)
        .sort(byName)
        .map((row) => ({
          id: row.id,
          name: row.name,
          kind: row.kind,
          categoryId: row.categoryId,
          unit: row.unit,
          pricePer1000: row.pricePer1000,
          yieldBps: row.yieldBps,
          allergens: row.allergens,
          traces: row.traces,
          diet: row.diet,
          dateKind: row.dateKind,
          ...(row.shelfLifeDays === undefined ? {} : { shelfLifeDays: row.shelfLifeDays }),
          ...(row.supplierId === undefined ? {} : { supplierId: row.supplierId }),
          ...(row.areaId === undefined ? {} : { areaId: row.areaId }),
          ...(row.spotId === undefined ? {} : { spotId: row.spotId }),
          ...(row.packSize === undefined ? {} : { packSize: row.packSize }),
          ...(row.packLabel === undefined ? {} : { packLabel: row.packLabel }),
          ...(row.recipeId === undefined ? {} : { recipeId: row.recipeId }),
          active: row.active,
          stock: roundQuantity(stock.get(row.id) ?? 0),
        })),
    };
  };

  const recipes: UseCase<'lookup.recipes'> = async (raw) => {
    const input = CONTRACT_V1['lookup.recipes'].input.parse(raw);
    const rows = alive(await storage.recipes.ofBusiness(input.businessId));
    return {
      recipes: rows
        .filter((row) => input.includeInactive || row.active)
        .sort(byName)
        .map((row) => ({
          id: row.id,
          name: row.name,
          kind: row.kind,
          course: row.course,
          portions: row.portions,
          ...(row.priceRappen === undefined ? {} : { priceRappen: row.priceRappen }),
          vatBps: row.vatBps,
          ...(row.output === undefined ? {} : { outputArticleId: row.output.articleId }),
          hasPhoto: row.photo !== undefined,
          active: row.active,
        })),
    };
  };

  return {
    'business.get': getBusiness,
    'business.update': updateBusiness,
    'lookup.staff': staff,
    'lookup.areas': areas,
    'lookup.suppliers': suppliers,
    'lookup.articles': articles,
    'lookup.recipes': recipes,
  };
}
