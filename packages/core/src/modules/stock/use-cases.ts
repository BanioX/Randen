import {
  CommandError,
  createCommandKit,
  requireRow,
  type AppContext,
  type UseCase,
} from '../../application/command';
import { createStockLedger } from '../../application/stock-ledger';
import { CONTRACT_V1, type OperationOutput } from '../../contract';
import { articleCategory } from '../../domain/categories';
import { expiryInfo, mustNotUse, type ExpiryInfo } from '../../domain/expiry';
import { fefoOrder, usableQuantity } from '../../domain/fefo';
import { lineValue, roundQuantity, unitPriceFromTotal } from '../../domain/units';
import type { Id } from '../../ids';
import { rappen, type Rappen } from '../../money';
import type { Article } from '../../model/article';
import { TemperatureLogSchema } from '../../model/haccp';
import type { LocalDate } from '../../model/primitives';
import {
  DeliverySchema,
  InventoryCountSchema,
  MovementTypeSchema,
  PurchaseOrderSchema,
  type DeliveryLine,
  type InventoryCount,
  type StockLot,
  type StockMovement,
} from '../../model/stock';
import type { StorageArea } from '../../model/storage-area';
import { alive } from '../../ports/storage';
import type { ExpiryGroup, MovementView, ReceiveLine, StockTally } from './contract';

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'de-CH');
const byOrder = (a: StorageArea, b: StorageArea) => a.sortOrder - b.sortOrder || byName(a, b);

/** «Entrecôte» is found by «entrecote», «Käse» by «KASE». */
function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('de-CH').trim();
}

const areaTag = (area: StorageArea) => ({ id: area.id, name: area.name, kind: area.kind });
const lotValue = (lot: StockLot): Rappen => lineValue(lot.quantity, lot.pricePer1000);
const emptyTally = (): StockTally => ({ count: 0, valueRappen: rappen(0) });

function addTo(tally: StockTally, value: Rappen): void {
  tally.count += 1;
  tally.valueRappen = rappen(tally.valueRappen + value);
}

/** The highest unit price the model takes; a line total over a tiny quantity can exceed it. */
const MAX_UNIT_PRICE = 100_000_000_000;

/** Statuses that put an article on the list «läuft ab». */
const DUE = new Set(['expired', 'today', 'soon', 'past_best_before']);

const GROUP_RANK: Record<ExpiryGroup, number> = {
  expired: 0,
  today: 1,
  soon: 2,
  week: 3,
  past_best_before: 4,
};

/** The group of the list «Ablauf» a lot belongs to, or undefined if it is not due yet. */
function expiryGroup(info: ExpiryInfo, withinDays: number): ExpiryGroup | undefined {
  switch (info.status) {
    case 'expired':
    case 'today':
    case 'past_best_before':
      return info.status;
    case 'soon':
      return (info.daysLeft ?? 0) <= withinDays ? 'soon' : undefined;
    case 'ok':
      return (info.daysLeft ?? Number.MAX_SAFE_INTEGER) <= withinDays ? 'week' : undefined;
    case 'none':
      return undefined;
  }
}

/** Newest first: by the day it counts for, then by the moment it was booked. */
function newestFirst(a: StockMovement, b: StockMovement): number {
  return b.on.localeCompare(a.on) || b.at.localeCompare(a.at) || b.id.localeCompare(a.id);
}

/**
 * Use cases of the module «Lager». Queries join names and numbers for the pages; commands
 * change stock only through the ledger (ADR-0007), which writes a movement for every change.
 */
export function createStockUseCases(ctx: AppContext) {
  const { storage, clock, ids, actor } = ctx;
  const { emit, runCommand, stamps } = createCommandKit(ctx);
  const ledger = createStockLedger(ctx);

  async function activeLots(businessId: Id): Promise<StockLot[]> {
    return alive(await storage.lots.ofBusiness(businessId)).filter(
      (lot) => lot.status === 'active',
    );
  }

  /** Turns movements into lines of the journal: names of article and person instead of ids. */
  async function movementViews(
    businessId: Id,
    movements: readonly StockMovement[],
  ): Promise<MovementView[]> {
    const [articleRows, staffRows, lotRows] = await Promise.all([
      storage.articles.ofBusiness(businessId),
      storage.staff.ofBusiness(businessId),
      storage.lots.ofBusiness(businessId),
    ]);
    // Deleted rows keep their names: the journal stays true.
    const articles = new Map(articleRows.map((row) => [row.id, row]));
    const staff = new Map(staffRows.map((row) => [row.id, row.name]));
    const origins = new Map(lotRows.map((row) => [row.id, row.origin]));
    return movements.map((movement) => {
      const article = articles.get(movement.articleId);
      const origin = origins.get(movement.lotId);
      return {
        id: movement.id,
        type: movement.type,
        articleId: movement.articleId,
        articleName: article?.name ?? '',
        unit: article?.unit ?? 'pcs',
        lotId: movement.lotId,
        ...(origin === undefined ? {} : { lotOrigin: origin }),
        quantity: movement.quantity,
        valueRappen: movement.valueRappen,
        on: movement.on,
        at: movement.at,
        who: staff.get(movement.actor) ?? '',
        ...(movement.reason === undefined ? {} : { reason: movement.reason }),
        ...(movement.purpose === undefined ? {} : { purpose: movement.purpose }),
        ...(movement.countId === undefined ? {} : { countId: movement.countId }),
        ...(movement.note === undefined ? {} : { note: movement.note }),
      };
    });
  }

  const overview: UseCase<'stock.overview'> = async (raw) => {
    const input = CONTRACT_V1['stock.overview'].input.parse(raw);
    const today = clock.today();
    const [articleRows, lots, areaRows] = await Promise.all([
      storage.articles.ofBusiness(input.businessId),
      activeLots(input.businessId),
      storage.areas.ofBusiness(input.businessId),
    ]);
    const areas = new Map(areaRows.map((row) => [row.id, row]));
    const lotsOf = new Map<Id, StockLot[]>();
    const totals = {
      valueRappen: rappen(0),
      articleCount: 0,
      areaCount: new Set(lots.map((lot) => lot.areaId)).size,
      lotCount: lots.length,
      expired: emptyTally(),
      today: emptyTally(),
      soon: emptyTally(),
      pastBestBefore: emptyTally(),
      belowMinCount: 0,
      lotsWithoutPrice: 0,
    };
    for (const lot of lots) {
      lotsOf.set(lot.articleId, [...(lotsOf.get(lot.articleId) ?? []), lot]);
      const value = lotValue(lot);
      totals.valueRappen = rappen(totals.valueRappen + value);
      if (lot.pricePer1000 === 0) {
        totals.lotsWithoutPrice += 1;
      }
      const { status } = expiryInfo(lot.expiresOn, lot.dateKind, today);
      if (status === 'expired') {
        addTo(totals.expired, value);
      } else if (status === 'today') {
        addTo(totals.today, value);
      } else if (status === 'soon') {
        addTo(totals.soon, value);
      } else if (status === 'past_best_before') {
        addTo(totals.pastBestBefore, value);
      }
    }
    totals.articleCount = lotsOf.size;

    const words = fold(input.search ?? '')
      .split(/\s+/)
      .filter(Boolean);
    const rows: OperationOutput<'stock.overview'>['rows'] = [];
    for (const article of [...articleRows].sort(byName)) {
      const all = lotsOf.get(article.id) ?? [];
      const watched =
        article.deletedAt === undefined &&
        article.active &&
        article.minStock !== undefined &&
        article.minStock > 0;
      // What is in the house always shows, also for an article that was set inactive since.
      if (all.length === 0 && !watched) {
        continue;
      }
      const stock = roundQuantity(all.reduce((sum, lot) => sum + lot.quantity, 0));
      const belowMin = watched && stock < (article.minStock ?? 0);
      if (belowMin) {
        totals.belowMinCount += 1;
      }
      const shown =
        input.areaId === undefined ? all : all.filter((lot) => lot.areaId === input.areaId);
      if (input.areaId !== undefined && shown.length === 0) {
        // An article without any stock still belongs to the area it is usually kept in.
        if (all.length > 0 || article.areaId !== input.areaId) {
          continue;
        }
      }
      if (input.categoryId !== undefined && article.categoryId !== input.categoryId) {
        continue;
      }
      const name = fold(article.name);
      if (!words.every((word) => name.includes(word))) {
        continue;
      }
      const next = fefoOrder(shown).find((lot) => lot.expiresOn !== undefined);
      const info = expiryInfo(next?.expiresOn, next?.dateKind ?? article.dateKind, today);
      if (input.filter === 'expiring' && !DUE.has(info.status)) {
        continue;
      }
      if (input.filter === 'below_min' && !belowMin) {
        continue;
      }
      const areaIds = shown.length > 0 ? shown.map((lot) => lot.areaId) : [article.areaId];
      const rowAreas = [...new Set(areaIds)]
        .map((id) => (id === undefined ? undefined : areas.get(id)))
        .filter((area) => area !== undefined)
        .sort(byOrder)
        .map(areaTag);
      rows.push({
        articleId: article.id,
        name: article.name,
        unit: article.unit,
        categoryId: article.categoryId,
        quantity: roundQuantity(shown.reduce((sum, lot) => sum + lot.quantity, 0)),
        valueRappen: rappen(shown.reduce((sum, lot) => sum + lotValue(lot), 0)),
        lotCount: shown.length,
        areas: rowAreas,
        ...(next?.expiresOn === undefined ? {} : { nextExpiresOn: next.expiresOn }),
        dateKind: next?.dateKind ?? article.dateKind,
        expiryStatus: info.status,
        ...(info.daysLeft === undefined ? {} : { daysLeft: info.daysLeft }),
        ...(article.minStock === undefined ? {} : { minStock: article.minStock }),
        belowMin,
        priceMissing: shown.some((lot) => lot.pricePer1000 === 0),
      });
    }
    return { rows, totals };
  };

  const expiring: UseCase<'stock.expiring'> = async (raw) => {
    const input = CONTRACT_V1['stock.expiring'].input.parse(raw);
    const today = clock.today();
    const [lots, articleRows, areaRows, spotRows] = await Promise.all([
      activeLots(input.businessId),
      storage.articles.ofBusiness(input.businessId),
      storage.areas.ofBusiness(input.businessId),
      storage.spots.ofBusiness(input.businessId),
    ]);
    const articles = new Map(articleRows.map((row) => [row.id, row]));
    const areas = new Map(areaRows.map((row) => [row.id, row]));
    const spots = new Map(alive(spotRows).map((row) => [row.id, row]));
    const groups = {
      expired: emptyTally(),
      today: emptyTally(),
      soon: emptyTally(),
      week: emptyTally(),
      past_best_before: emptyTally(),
    };
    const due: OperationOutput<'stock.expiring'>['lots'] = [];
    for (const lot of lots) {
      const article = articles.get(lot.articleId);
      const area = areas.get(lot.areaId);
      const info = expiryInfo(lot.expiresOn, lot.dateKind, today);
      const group = expiryGroup(info, input.withinDays);
      if (
        lot.expiresOn === undefined ||
        info.daysLeft === undefined ||
        group === undefined ||
        article === undefined ||
        area === undefined
      ) {
        continue;
      }
      const value = lotValue(lot);
      addTo(groups[group], value);
      const spot = article.spotId === undefined ? undefined : spots.get(article.spotId);
      due.push({
        lotId: lot.id,
        articleId: article.id,
        articleName: article.name,
        unit: article.unit,
        quantity: lot.quantity,
        valueRappen: value,
        area: areaTag(area),
        ...(spot?.areaId === lot.areaId ? { spotName: spot.name } : {}),
        expiresOn: lot.expiresOn,
        dateKind: lot.dateKind,
        status: info.status,
        daysLeft: info.daysLeft,
        group,
        mustWriteOff: info.status === 'expired',
        ...(lot.lotCode === undefined ? {} : { lotCode: lot.lotCode }),
      });
    }
    due.sort(
      (a, b) =>
        GROUP_RANK[a.group] - GROUP_RANK[b.group] ||
        a.expiresOn.localeCompare(b.expiresOn) ||
        a.articleName.localeCompare(b.articleName, 'de-CH') ||
        a.lotId.localeCompare(b.lotId),
    );
    return { lots: due, groups };
  };

  const articleStock: UseCase<'stock.article'> = async (raw) => {
    const input = CONTRACT_V1['stock.article'].input.parse(raw);
    const today = clock.today();
    // A link to one lot leads to its article, also when the lot is used up by now.
    const articleId =
      input.lotId === undefined
        ? input.articleId
        : (await requireRow(storage.lots, input.businessId, input.lotId, 'Lot')).articleId;
    if (articleId === undefined) {
      throw new CommandError('invalid', 'An article or a lot is needed');
    }
    const article = await requireRow(storage.articles, input.businessId, articleId, 'Article');
    const [allLots, areaRows, supplierRows, movementRows] = await Promise.all([
      activeLots(input.businessId),
      storage.areas.ofBusiness(input.businessId),
      storage.suppliers.ofBusiness(input.businessId),
      storage.movements.ofBusiness(input.businessId),
    ]);
    const areas = new Map(areaRows.map((row) => [row.id, row]));
    const suppliers = new Map(supplierRows.map((row) => [row.id, row.name]));
    const lots = fefoOrder(allLots.filter((lot) => lot.articleId === article.id));
    const quantity = roundQuantity(lots.reduce((sum, lot) => sum + lot.quantity, 0));
    const supplierName =
      article.supplierId === undefined ? undefined : suppliers.get(article.supplierId);
    const movements = movementRows
      .filter((movement) => movement.articleId === article.id)
      .sort(newestFirst)
      .slice(0, 30);
    return {
      article: {
        id: article.id,
        name: article.name,
        kind: article.kind,
        categoryId: article.categoryId,
        unit: article.unit,
        pricePer1000: article.pricePer1000,
        yieldBps: article.yieldBps,
        ...(article.minStock === undefined ? {} : { minStock: article.minStock }),
        ...(article.targetStock === undefined ? {} : { targetStock: article.targetStock }),
        dateKind: article.dateKind,
        ...(article.areaId === undefined ? {} : { areaId: article.areaId }),
        ...(supplierName === undefined ? {} : { supplierName }),
        active: article.active,
      },
      quantity,
      valueRappen: rappen(lots.reduce((sum, lot) => sum + lotValue(lot), 0)),
      usableQuantity: usableQuantity(lots, today),
      belowMin:
        article.minStock !== undefined && article.minStock > 0 && quantity < article.minStock,
      lots: lots.flatMap((lot) => {
        const area = areas.get(lot.areaId);
        if (area === undefined) {
          return [];
        }
        const info = expiryInfo(lot.expiresOn, lot.dateKind, today);
        const lotSupplier =
          lot.supplierId === undefined ? undefined : suppliers.get(lot.supplierId);
        return [
          {
            lotId: lot.id,
            area: areaTag(area),
            ...(lot.expiresOn === undefined ? {} : { expiresOn: lot.expiresOn }),
            dateKind: lot.dateKind,
            status: info.status,
            ...(info.daysLeft === undefined ? {} : { daysLeft: info.daysLeft }),
            mustNotUse: info.status === 'expired',
            quantity: lot.quantity,
            initialQuantity: lot.initialQuantity,
            pricePer1000: lot.pricePer1000,
            valueRappen: lotValue(lot),
            ...(lotSupplier === undefined ? {} : { supplierName: lotSupplier }),
            ...(lot.lotCode === undefined ? {} : { lotCode: lot.lotCode }),
            receivedOn: lot.receivedOn,
            origin: lot.origin,
          },
        ];
      }),
      movements: await movementViews(input.businessId, movements),
    };
  };

  const receiveDraft: UseCase<'stock.receiveDraft'> = async (raw) => {
    const input = CONTRACT_V1['stock.receiveDraft'].input.parse(raw);
    const order =
      input.orderId === undefined
        ? undefined
        : await requireRow(storage.orders, input.businessId, input.orderId, 'Order');
    const [articleRows, areaRows] = await Promise.all([
      storage.articles.ofBusiness(input.businessId),
      storage.areas.ofBusiness(input.businessId),
    ]);
    const areas = alive(areaRows).sort(byOrder);
    const articles = alive(articleRows);
    const known = new Set(articles.map((row) => row.id));
    const lines = (order?.lines ?? []).filter((line) => known.has(line.articleId));
    const ordered = new Set(lines.map((line) => line.articleId));
    const supplier =
      order === undefined ? undefined : await storage.suppliers.get(order.supplierId);
    return {
      ...(order === undefined
        ? {}
        : {
            order: {
              id: order.id,
              status: order.status,
              supplierId: order.supplierId,
              supplierName: supplier?.name ?? '',
              ...(order.orderedOn === undefined ? {} : { orderedOn: order.orderedOn }),
              ...(order.expectedOn === undefined ? {} : { expectedOn: order.expectedOn }),
            },
          }),
      lines: lines.map(({ articleId, quantity, pricePer1000 }) => ({
        articleId,
        quantity,
        pricePer1000,
      })),
      proposals: articles
        .filter((row) => row.active || ordered.has(row.id))
        .sort(byName)
        .map((row) => {
          const category = articleCategory(row.categoryId);
          const area =
            areas.find((candidate) => candidate.id === row.areaId) ??
            areas.find((candidate) => candidate.kind === category.area);
          return {
            articleId: row.id,
            name: row.name,
            unit: row.unit,
            pricePer1000: row.pricePer1000,
            ...(area === undefined ? {} : { areaId: area.id }),
            shelfLifeDays: row.shelfLifeDays ?? category.shelfLifeDays,
            dateKind: row.dateKind,
            ...(row.supplierId === undefined ? {} : { supplierId: row.supplierId }),
          };
        }),
    };
  };

  /** A day on which something was received or counted lies today or earlier. */
  function notInFuture(day: LocalDate, what: string): void {
    if (day > clock.today()) {
      throw new CommandError('invalid', `${what} ${day} lies in the future`);
    }
  }

  /** The unit price of a line: as typed, derived from the line total, or the last price. */
  function priceOf(line: ReceiveLine, article: Article): number {
    if (line.pricePer1000 !== undefined) {
      return line.pricePer1000;
    }
    if (line.lineTotalRappen === undefined) {
      return article.pricePer1000;
    }
    // A large amount over a tiny quantity gives a price no article can have.
    if ((line.lineTotalRappen * 1000) / line.quantity > MAX_UNIT_PRICE) {
      throw new CommandError('invalid', `The price of ${article.id} is out of range`);
    }
    return unitPriceFromTotal(line.lineTotalRappen, line.quantity);
  }

  /** One lot per line through the ledger; returns the lines as a delivery keeps them. */
  async function receiveLines(
    businessId: Id,
    lines: readonly ReceiveLine[],
    receivedOn: LocalDate,
    extra: { origin: 'purchase' | 'opening'; supplierId?: Id | undefined; deliveryId?: Id },
  ): Promise<DeliveryLine[]> {
    const booked: DeliveryLine[] = [];
    for (const line of lines) {
      // Read per line: an earlier line of the same article may have set a new last price.
      const article = await requireRow(storage.articles, businessId, line.articleId, 'Article');
      const lot = await ledger.receive({
        businessId,
        articleId: article.id,
        areaId: line.areaId,
        quantity: line.quantity,
        pricePer1000: priceOf(line, article),
        receivedOn,
        expiresOn: line.expiresOn,
        lotCode: line.lotCode,
        supplierId: extra.supplierId,
        deliveryId: extra.deliveryId,
        origin: extra.origin,
        // An opening stock is no purchase, but it may bring the first price of an article.
        ...(extra.origin === 'opening' ? { updateArticlePrice: article.pricePer1000 === 0 } : {}),
      });
      booked.push({
        articleId: article.id,
        lotId: lot.id,
        areaId: lot.areaId,
        quantity: lot.quantity,
        pricePer1000: lot.pricePer1000,
        valueRappen: lotValue(lot),
        ...(lot.expiresOn === undefined ? {} : { expiresOn: lot.expiresOn }),
        ...(lot.lotCode === undefined ? {} : { lotCode: lot.lotCode }),
      });
    }
    return booked;
  }

  const totalOf = (lines: readonly DeliveryLine[]) =>
    rappen(lines.reduce((sum, line) => sum + line.valueRappen, 0));

  const receive: UseCase<'stock.receive'> = async (raw) => {
    const input = CONTRACT_V1['stock.receive'].input.parse(raw);
    return runCommand('stock.receive', input.commandId, async () => {
      notInFuture(input.receivedOn, 'Receipt');
      const order =
        input.orderId === undefined
          ? undefined
          : await requireRow(storage.orders, input.businessId, input.orderId, 'Order');
      if (input.supplierId !== undefined) {
        await requireRow(storage.suppliers, input.businessId, input.supplierId, 'Supplier');
      }
      const supplierId = input.supplierId ?? order?.supplierId;
      const supplier =
        supplierId === undefined ? undefined : await storage.suppliers.get(supplierId);
      const deliveryId = ids.next();
      const lines = await receiveLines(input.businessId, input.lines, input.receivedOn, {
        origin: 'purchase',
        supplierId,
        deliveryId,
      });
      const totalRappen = totalOf(lines);
      const lotIds = lines.map((line) => line.lotId);
      await storage.deliveries.add(
        DeliverySchema.parse({
          id: deliveryId,
          businessId: input.businessId,
          ...stamps(),
          ...(supplierId === undefined ? {} : { supplierId }),
          ...(order === undefined ? {} : { orderId: order.id }),
          receivedOn: input.receivedOn,
          ...(input.documentNumber === undefined ? {} : { documentNumber: input.documentNumber }),
          lines,
          totalRappen,
          ...(input.tempDeciC === undefined ? {} : { tempDeciC: input.tempDeciC }),
          checkOk: input.checkOk,
          ...(input.note === undefined ? {} : { note: input.note }),
          receivedBy: actor,
        }),
      );
      if (order !== undefined && order.status !== 'received') {
        await storage.orders.put(
          PurchaseOrderSchema.parse({
            ...order,
            status: 'received',
            deliveryId,
            updatedAt: clock.now(),
          }),
        );
        await emit(input.businessId, 'order.received', { orderId: order.id, deliveryId });
      }
      if (input.tempDeciC !== undefined) {
        // The check at the door is part of the self-control: one measured temperature.
        await storage.temperatureLogs.add(
          TemperatureLogSchema.parse({
            id: ids.next(),
            businessId: input.businessId,
            ...stamps(),
            kind: 'receiving',
            label: supplier?.name ?? 'Wareneingang',
            deciC: input.tempDeciC,
            ok: input.checkOk,
            ...(input.checkOk || input.note === undefined
              ? {}
              : { action: input.note.slice(0, 300) }),
            on: input.receivedOn,
            measuredAt: clock.now(),
            measuredBy: actor,
          }),
        );
      }
      await emit(input.businessId, 'delivery.received', {
        deliveryId,
        ...(supplierId === undefined ? {} : { supplierId }),
        ...(order === undefined ? {} : { orderId: order.id }),
        lotIds,
        totalRappen,
        checkOk: input.checkOk,
      });
      return { deliveryId, lotIds, totalRappen };
    });
  };

  const openingStock: UseCase<'stock.openingStock'> = async (raw) => {
    const input = CONTRACT_V1['stock.openingStock'].input.parse(raw);
    return runCommand('stock.openingStock', input.commandId, async () => {
      notInFuture(input.on, 'Opening stock');
      const lines = await receiveLines(input.businessId, input.lines, input.on, {
        origin: 'opening',
      });
      const totalRappen = totalOf(lines);
      const lotIds = lines.map((line) => line.lotId);
      await emit(input.businessId, 'stock.opened', { lotIds, totalRappen });
      return { lotIds, totalRappen };
    });
  };

  const writeOff: UseCase<'stock.writeOff'> = async (raw) => {
    const input = CONTRACT_V1['stock.writeOff'].input.parse(raw);
    return runCommand('stock.writeOff', input.commandId, async () => {
      const result = await ledger.writeOff({
        businessId: input.businessId,
        lotId: input.lotId,
        quantity: input.quantity,
        reason: input.reason,
        on: clock.today(),
        note: input.note,
      });
      await emit(input.businessId, 'stock.written_off', {
        lotId: input.lotId,
        articleId: result.articleId,
        quantity: input.quantity,
        reason: input.reason,
        valueRappen: result.valueRappen,
      });
      return result;
    });
  };

  const writeOffExpired: UseCase<'stock.writeOffExpired'> = async (raw) => {
    const input = CONTRACT_V1['stock.writeOffExpired'].input.parse(raw);
    return runCommand('stock.writeOffExpired', input.commandId, async () => {
      const today = clock.today();
      const expired = fefoOrder(await ledger.activeLots(input.businessId)).filter((lot) =>
        mustNotUse(lot.expiresOn, lot.dateKind, today),
      );
      let value = 0;
      for (const lot of expired) {
        const result = await ledger.writeOff({
          businessId: input.businessId,
          lotId: lot.id,
          quantity: lot.quantity,
          reason: 'expired',
          on: today,
        });
        value += result.valueRappen;
      }
      const output = {
        count: expired.length,
        valueRappen: rappen(value),
        lotIds: expired.map((lot) => lot.id),
      };
      await emit(input.businessId, 'stock.expired_written_off', output);
      return output;
    });
  };

  const withdraw: UseCase<'stock.withdraw'> = async (raw) => {
    const input = CONTRACT_V1['stock.withdraw'].input.parse(raw);
    return runCommand('stock.withdraw', input.commandId, async () => {
      const today = clock.today();
      const article = await requireRow(
        storage.articles,
        input.businessId,
        input.articleId,
        'Article',
      );
      const shortage = (available: number) =>
        new CommandError(
          'insufficient_stock',
          `${article.id}: ${String(available)} usable, ${String(input.quantity)} wanted`,
        );
      let output: OperationOutput<'stock.withdraw'>;
      if (input.lotId === undefined) {
        // A shortage is an error here, so nothing is booked: the person asked for this amount.
        const lots = await ledger.activeLots(input.businessId, article.id);
        const usable = usableQuantity(lots, today);
        if (input.quantity > usable) {
          throw shortage(usable);
        }
        const result = await ledger.consume({
          businessId: input.businessId,
          articleId: article.id,
          quantity: input.quantity,
          on: today,
          purpose: input.purpose,
          note: input.note,
        });
        output = {
          consumed: result.consumed,
          valueRappen: result.valueRappen,
          picks: result.picks,
        };
      } else {
        const lot = await requireRow(storage.lots, input.businessId, input.lotId, 'Lot');
        if (lot.articleId !== article.id) {
          throw new CommandError('invalid', `Lot ${lot.id} is not of article ${article.id}`);
        }
        if (mustNotUse(lot.expiresOn, lot.dateKind, today)) {
          throw new CommandError('not_allowed', `Lot ${lot.id} is past its use-by date`);
        }
        if (input.quantity > lot.quantity) {
          throw shortage(lot.quantity);
        }
        const result = await ledger.consumeLot({
          businessId: input.businessId,
          lotId: lot.id,
          quantity: input.quantity,
          on: today,
          purpose: input.purpose,
          note: input.note,
        });
        output = {
          consumed: input.quantity,
          valueRappen: result.valueRappen,
          picks: [{ lotId: lot.id, quantity: input.quantity, valueRappen: result.valueRappen }],
        };
      }
      await emit(input.businessId, 'stock.withdrawn', {
        articleId: article.id,
        quantity: output.consumed,
        purpose: input.purpose,
        valueRappen: output.valueRappen,
        lotIds: output.picks.map((pick) => pick.lotId),
      });
      return output;
    });
  };

  const move: UseCase<'stock.move'> = async (raw) => {
    const input = CONTRACT_V1['stock.move'].input.parse(raw);
    return runCommand('stock.move', input.commandId, async () => {
      const lot = await requireRow(storage.lots, input.businessId, input.lotId, 'Lot');
      if (lot.areaId === input.areaId) {
        throw new CommandError('invalid', `Lot ${lot.id} already lies in that area`);
      }
      const moved = await ledger.move({
        businessId: input.businessId,
        lotId: lot.id,
        areaId: input.areaId,
        quantity: input.quantity,
      });
      await emit(input.businessId, 'stock.moved', {
        lotId: lot.id,
        movedLotId: moved.lotId,
        fromAreaId: lot.areaId,
        toAreaId: input.areaId,
        quantity: input.quantity ?? lot.quantity,
      });
      return moved;
    });
  };

  const countSheet: UseCase<'stock.countSheet'> = async (raw) => {
    const input = CONTRACT_V1['stock.countSheet'].input.parse(raw);
    if (input.areaId !== undefined) {
      await requireRow(storage.areas, input.businessId, input.areaId, 'Area');
    }
    const [lots, articleRows, areaRows, spotRows] = await Promise.all([
      activeLots(input.businessId),
      storage.articles.ofBusiness(input.businessId),
      storage.areas.ofBusiness(input.businessId),
      storage.spots.ofBusiness(input.businessId),
    ]);
    const articles = new Map(articleRows.map((row) => [row.id, row]));
    const spots = new Map(alive(spotRows).map((row) => [row.id, row]));
    const sheet = [...areaRows]
      .sort(byOrder)
      .filter((area) => input.areaId === undefined || area.id === input.areaId)
      .map((area) => ({
        area: areaTag(area),
        lots: fefoOrder(lots.filter((lot) => lot.areaId === area.id))
          .flatMap((lot) => {
            const article = articles.get(lot.articleId);
            if (article === undefined) {
              return [];
            }
            const spot = article.spotId === undefined ? undefined : spots.get(article.spotId);
            return [
              {
                lotId: lot.id,
                articleId: article.id,
                articleName: article.name,
                unit: article.unit,
                expected: lot.quantity,
                pricePer1000: lot.pricePer1000,
                ...(lot.expiresOn === undefined ? {} : { expiresOn: lot.expiresOn }),
                dateKind: lot.dateKind,
                ...(lot.lotCode === undefined ? {} : { lotCode: lot.lotCode }),
                ...(spot?.areaId === area.id ? { spotName: spot.name } : {}),
              },
            ];
          })
          // By article; the sort is stable, so the lots of one article stay first expired first.
          .sort((a, b) => a.articleName.localeCompare(b.articleName, 'de-CH')),
      }))
      .filter((group) => group.lots.length > 0);
    return { areas: sheet, lotCount: sheet.reduce((sum, group) => sum + group.lots.length, 0) };
  };

  const count: UseCase<'stock.count'> = async (raw) => {
    const input = CONTRACT_V1['stock.count'].input.parse(raw);
    return runCommand('stock.count', input.commandId, async () => {
      notInFuture(input.countedOn, 'Count');
      if (input.areaId !== undefined) {
        await requireRow(storage.areas, input.businessId, input.areaId, 'Area');
      }
      if (new Set(input.lines.map((line) => line.lotId)).size !== input.lines.length) {
        throw new CommandError('invalid', 'A lot is counted twice');
      }
      const countId = ids.next();
      const lines: InventoryCount['lines'] = [];
      let adjusted = 0;
      for (const line of input.lines) {
        const result = await ledger.adjust({
          businessId: input.businessId,
          lotId: line.lotId,
          counted: line.counted,
          on: input.countedOn,
          countId,
        });
        adjusted += result.delta === 0 ? 0 : 1;
        // A line that matches is part of the record, but books nothing.
        lines.push({
          lotId: line.lotId,
          articleId: result.lot.articleId,
          expected: result.lot.quantity,
          counted: line.counted,
          valueDeltaRappen: result.valueDeltaRappen,
        });
      }
      const foundLotIds: Id[] = [];
      for (const found of input.found) {
        const article = await requireRow(
          storage.articles,
          input.businessId,
          found.articleId,
          'Article',
        );
        // Goods nobody had on a lot: a new lot at the last known price, not a purchase.
        const lot = await ledger.receive({
          businessId: input.businessId,
          articleId: article.id,
          areaId: found.areaId,
          quantity: found.quantity,
          pricePer1000: article.pricePer1000,
          receivedOn: input.countedOn,
          expiresOn: found.expiresOn,
          origin: 'count',
        });
        adjusted += 1;
        foundLotIds.push(lot.id);
        lines.push({
          lotId: lot.id,
          articleId: article.id,
          expected: 0,
          counted: lot.quantity,
          valueDeltaRappen: lotValue(lot),
        });
      }
      const valueDeltaRappen = rappen(lines.reduce((sum, line) => sum + line.valueDeltaRappen, 0));
      await storage.counts.add(
        InventoryCountSchema.parse({
          id: countId,
          businessId: input.businessId,
          ...stamps(),
          countedOn: input.countedOn,
          ...(input.areaId === undefined ? {} : { areaId: input.areaId }),
          lines,
          valueDeltaRappen,
          countedBy: actor,
          ...(input.note === undefined ? {} : { note: input.note }),
        }),
      );
      await emit(input.businessId, 'inventory.counted', {
        countId,
        ...(input.areaId === undefined ? {} : { areaId: input.areaId }),
        lineCount: lines.length,
        adjusted,
        found: foundLotIds.length,
        valueDeltaRappen,
      });
      return { countId, lineCount: lines.length, adjusted, valueDeltaRappen, foundLotIds };
    });
  };

  const journal: UseCase<'stock.journal'> = async (raw) => {
    const input = CONTRACT_V1['stock.journal'].input.parse(raw);
    const inPeriod = (await storage.movements.ofBusiness(input.businessId)).filter(
      (movement) =>
        (input.from === undefined || movement.on >= input.from) &&
        (input.to === undefined || movement.on <= input.to) &&
        (input.articleId === undefined || movement.articleId === input.articleId),
    );
    const sums = MovementTypeSchema.options.map((type) => {
      const ofType = inPeriod.filter((movement) => movement.type === type);
      return {
        type,
        count: ofType.length,
        valueRappen: rappen(ofType.reduce((sum, movement) => sum + movement.valueRappen, 0)),
      };
    });
    const matching = inPeriod
      .filter((movement) => input.type === undefined || movement.type === input.type)
      .sort(newestFirst);
    return {
      movements: await movementViews(input.businessId, matching.slice(0, input.limit)),
      total: matching.length,
      sums,
    };
  };

  return {
    'stock.overview': overview,
    'stock.expiring': expiring,
    'stock.article': articleStock,
    'stock.receiveDraft': receiveDraft,
    'stock.receive': receive,
    'stock.openingStock': openingStock,
    'stock.writeOff': writeOff,
    'stock.writeOffExpired': writeOffExpired,
    'stock.withdraw': withdraw,
    'stock.move': move,
    'stock.countSheet': countSheet,
    'stock.count': count,
    'stock.journal': journal,
  };
}
