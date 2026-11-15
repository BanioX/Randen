import {
  CommandError,
  createCommandKit,
  requireRow,
  type AppContext,
  type UseCase,
} from '../../application/command';
import { createStockLedger } from '../../application/stock-ledger';
import { CONTRACT_V1 } from '../../contract';
import { addDays, toLocalDate } from '../../dates';
import { hasModule } from '../../domain/business-profiles';
import { ARTICLE_CATEGORY_IDS, articleCategory } from '../../domain/categories';
import { lineValue, roundQuantity, unitPriceFromTotal } from '../../domain/units';
import type { Id } from '../../ids';
import { rappen, sumRappen, type Rappen } from '../../money';
import type { Article, Supplier } from '../../model/article';
import type { Business } from '../../model/business';
import { TemperatureLogSchema } from '../../model/haccp';
import type { LocalDate } from '../../model/primitives';
import {
  DeliverySchema,
  PurchaseOrderSchema,
  ShoppingLineSchema,
  type DeliveryLine,
  type OrderLine,
  type PurchaseOrder,
  type ShoppingLine,
} from '../../model/stock';
import { alive } from '../../ports/storage';
import type {
  OrderLineView,
  OrderSummary,
  PurchaseArticle,
  PurchaseSupplier,
  ShoppingGroup,
  ShoppingItem,
  ShoppingReason,
  SuggestionGroup,
  SuggestionLine,
} from './contract';
import {
  changeBps,
  marketPrices,
  orderSubject,
  orderText,
  packsOf,
  priceImpacts,
  promoLots,
  proposal,
  purchaseHistory,
  supplierDays,
  type MarketPricePoint,
  type ProposalLine,
} from './rules';

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'de-CH');

/** The highest unit price the model takes; a line total over a tiny quantity can exceed it. */
const MAX_UNIT_PRICE = 100_000_000_000;

const isOpen = (order: PurchaseOrder) => order.status === 'draft' || order.status === 'sent';
const isMarket = (supplier: Supplier | undefined) => supplier?.kind === 'market';
/** A line still on the shopping list: not settled by a purchase, not removed. */
const isOpenLine = (line: ShoppingLine) =>
  line.deletedAt === undefined && line.deliveryId === undefined;

const orderValue = (lines: readonly OrderLine[]): Rappen =>
  sumRappen(lines.map((line) => lineValue(line.quantity, line.pricePer1000)));

/**
 * Use cases of the module «Einkauf». Reads join names and numbers for the pages; commands write
 * orders and the shopping list, and a purchase at a market books its goods through the stock
 * ledger (ADR-0007). Nothing is sent anywhere: the person copies, shares or prints (ADR-0011).
 */
export function createPurchasingUseCases(ctx: AppContext) {
  const { storage, clock, ids, actor } = ctx;
  const { emit, runCommand, stamps } = createCommandKit(ctx);
  const ledger = createStockLedger(ctx);

  async function businessOf(businessId: Id): Promise<Business> {
    const row = await storage.businesses.get(businessId);
    if (row === undefined) {
      throw new CommandError('not_found', `Business ${businessId} not found`);
    }
    return row;
  }

  function supplierView(supplier: Supplier, today: LocalDate): PurchaseSupplier {
    const market = isMarket(supplier);
    return {
      id: supplier.id,
      name: supplier.name,
      kind: supplier.kind ?? 'supplier',
      ...(supplier.customerNumber === undefined ? {} : { customerNumber: supplier.customerNumber }),
      ...(supplier.minOrderRappen === undefined || market
        ? {}
        : { minOrderRappen: supplier.minOrderRappen }),
      // A market has no order and delivery days (ADR-0015).
      ...(market ? {} : supplierDays(supplier, today)),
    };
  }

  /** The proposal of the whole business, with the rows it was computed from. */
  async function computeProposal(businessId: Id, horizonDays: number) {
    const today = clock.today();
    const [articleRows, recipeRows, lotRows, orderRows, planRows, supplierRows] = await Promise.all(
      [
        storage.articles.ofBusiness(businessId),
        storage.recipes.ofBusiness(businessId),
        storage.lots.ofBusiness(businessId),
        storage.orders.ofBusiness(businessId),
        storage.planEntries.ofBusiness(businessId),
        storage.suppliers.ofBusiness(businessId),
      ],
    );
    const articles = alive(articleRows);
    const lines = proposal({
      today,
      horizonDays,
      articles,
      recipes: new Map(alive(recipeRows).map((row) => [row.id, row])),
      lots: alive(lotRows).filter((lot) => lot.status === 'active'),
      orders: alive(orderRows),
      planEntries: alive(planRows),
    });
    return {
      today,
      lines,
      articles,
      suppliers: new Map(alive(supplierRows).map((row) => [row.id, row])),
    };
  }

  function suggestionLine(line: ProposalLine): SuggestionLine {
    const { article } = line;
    const valueRappen = lineValue(line.quantity, article.pricePer1000);
    return {
      articleId: article.id,
      name: article.name,
      unit: article.unit,
      categoryId: article.categoryId,
      stock: line.stock,
      usable: line.usable,
      ...(article.minStock === undefined ? {} : { minStock: article.minStock }),
      ...(article.targetStock === undefined ? {} : { targetStock: article.targetStock }),
      onOrder: line.onOrder,
      needForPlan: line.needForPlan,
      expiresBeforeUse: line.expiresBeforeUse,
      reason: line.reason,
      quantity: line.quantity,
      ...(line.packs === undefined ? {} : { packs: line.packs }),
      pricePer1000: article.pricePer1000,
      valueRappen,
      priceMissing: article.pricePer1000 <= 0,
      ...(article.supplierArticleNumber === undefined
        ? {}
        : { supplierArticleNumber: article.supplierArticleNumber }),
    };
  }

  /** The proposal per supplier: delivering suppliers by their next order day, markets, the rest. */
  function groupProposal(
    lines: readonly ProposalLine[],
    suppliers: ReadonlyMap<Id, Supplier>,
    today: LocalDate,
  ): SuggestionGroup[] {
    const bySupplier = new Map<Id | undefined, ProposalLine[]>();
    for (const line of lines) {
      const supplierId =
        line.article.supplierId !== undefined && suppliers.has(line.article.supplierId)
          ? line.article.supplierId
          : undefined;
      bySupplier.set(supplierId, [...(bySupplier.get(supplierId) ?? []), line]);
    }
    const groups = [...bySupplier.entries()].map(([supplierId, group]): SuggestionGroup => {
      const supplier = supplierId === undefined ? undefined : suppliers.get(supplierId);
      const view = supplier === undefined ? undefined : supplierView(supplier, today);
      const shown = group.map(suggestionLine).sort(byName);
      const totalRappen = sumRappen(shown.map((line) => line.valueRappen));
      const min = view?.minOrderRappen;
      return {
        ...(view === undefined ? {} : { supplier: view }),
        lines: shown,
        totalRappen,
        ...(min === undefined || min <= 0
          ? {}
          : {
              minOrderReached: totalRappen >= min,
              missingToMinRappen: rappen(Math.max(0, min - totalRappen)),
            }),
        priceMissingCount: shown.filter((line) => line.priceMissing).length,
      };
    });
    const rank = (group: SuggestionGroup) =>
      group.supplier === undefined ? 2 : group.supplier.kind === 'market' ? 1 : 0;
    return groups.sort(
      (a, b) =>
        rank(a) - rank(b) ||
        (a.supplier?.nextOrder?.inDays ?? 99) - (b.supplier?.nextOrder?.inDays ?? 99) ||
        (a.supplier?.name ?? '').localeCompare(b.supplier?.name ?? '', 'de-CH'),
    );
  }

  const suggestions: UseCase<'purchasing.suggestions'> = async (raw) => {
    const input = CONTRACT_V1['purchasing.suggestions'].input.parse(raw);
    await businessOf(input.businessId);
    const { today, lines, suppliers } = await computeProposal(input.businessId, input.horizonDays);
    const groups = groupProposal(lines, suppliers, today);
    return {
      horizonDays: input.horizonDays,
      from: today,
      to: addDays(today, input.horizonDays - 1),
      groups,
      lineCount: lines.length,
      totalRappen: sumRappen(groups.map((group) => group.totalRappen)),
    };
  };

  // -------------------------------------------------------------------------------------------
  // Orders

  async function orderBook(businessId: Id) {
    const [articleRows, supplierRows] = await Promise.all([
      storage.articles.ofBusiness(businessId),
      storage.suppliers.ofBusiness(businessId),
    ]);
    // Deleted rows keep their names: an old order stays readable.
    return {
      articles: new Map(articleRows.map((row) => [row.id, row])),
      suppliers: new Map(supplierRows.map((row) => [row.id, row])),
    };
  }

  function summary(order: PurchaseOrder, suppliers: ReadonlyMap<Id, Supplier>): OrderSummary {
    return {
      id: order.id,
      supplierId: order.supplierId,
      supplierName: suppliers.get(order.supplierId)?.name ?? '',
      status: order.status,
      lineCount: order.lines.length,
      valueRappen: orderValue(order.lines),
      priceMissing: order.lines.some((line) => line.pricePer1000 <= 0),
      ...(order.orderedOn === undefined ? {} : { orderedOn: order.orderedOn }),
      ...(order.expectedOn === undefined ? {} : { expectedOn: order.expectedOn }),
      createdOn: toLocalDate(order.createdAt),
    };
  }

  const listOrders: UseCase<'orders.list'> = async (raw) => {
    const input = CONTRACT_V1['orders.list'].input.parse(raw);
    const rows = alive(await storage.orders.ofBusiness(input.businessId));
    const { suppliers } = await orderBook(input.businessId);
    const counts = { draft: 0, sent: 0, received: 0, cancelled: 0 };
    for (const row of rows) {
      counts[row.status] += 1;
    }
    const wanted = (order: PurchaseOrder) =>
      input.status === undefined ||
      (input.status === 'open' ? isOpen(order) : order.status === input.status);
    return {
      orders: rows
        .filter(wanted)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
        .map((row) => summary(row, suppliers)),
      counts,
    };
  };

  function lineView(line: OrderLine, article: Article | undefined): OrderLineView {
    const packs = packsOf(line.quantity, article?.packSize, article?.packLabel);
    return {
      articleId: line.articleId,
      name: article?.name ?? '',
      unit: article?.unit ?? 'pcs',
      quantity: line.quantity,
      ...(packs === undefined ? {} : { packs }),
      ...(article?.packSize === undefined ? {} : { packSize: article.packSize }),
      ...(article?.packLabel === undefined ? {} : { packLabel: article.packLabel }),
      pricePer1000: line.pricePer1000,
      valueRappen: lineValue(line.quantity, line.pricePer1000),
      priceMissing: line.pricePer1000 <= 0,
      ...(article?.supplierArticleNumber === undefined
        ? {}
        : { supplierArticleNumber: article.supplierArticleNumber }),
    };
  }

  const getOrder: UseCase<'orders.get'> = async (raw) => {
    const input = CONTRACT_V1['orders.get'].input.parse(raw);
    const order = await requireRow(storage.orders, input.businessId, input.orderId, 'Order');
    const business = await businessOf(input.businessId);
    const { articles, suppliers } = await orderBook(input.businessId);
    const supplier = suppliers.get(order.supplierId);
    if (supplier === undefined) {
      throw new CommandError('not_found', `Supplier ${order.supplierId} not found`);
    }
    const lines = order.lines.map((line) => lineView(line, articles.get(line.articleId)));
    const view = supplierView(supplier, clock.today());
    return {
      order: {
        id: order.id,
        status: order.status,
        ...(order.orderedOn === undefined ? {} : { orderedOn: order.orderedOn }),
        ...(order.expectedOn === undefined ? {} : { expectedOn: order.expectedOn }),
        ...(order.note === undefined ? {} : { note: order.note }),
        ...(order.deliveryId === undefined ? {} : { deliveryId: order.deliveryId }),
        createdOn: toLocalDate(order.createdAt),
        valueRappen: orderValue(order.lines),
        priceMissing: lines.some((line) => line.priceMissing),
      },
      lines,
      supplier: {
        ...view,
        ...(supplier.phone === undefined ? {} : { phone: supplier.phone }),
        ...(supplier.email === undefined ? {} : { email: supplier.email }),
      },
      businessName: business.name,
      subject: orderSubject(business.name, order.expectedOn),
      text: orderText({
        businessName: business.name,
        customerNumber: supplier.customerNumber,
        expectedOn: order.expectedOn,
        lines,
        note: order.note,
      }),
    };
  };

  /** A supplier that takes orders; a market is where the kitchen fetches goods itself. */
  async function orderingSupplier(businessId: Id, supplierId: Id): Promise<Supplier> {
    const supplier = await requireRow(storage.suppliers, businessId, supplierId, 'Supplier');
    if (isMarket(supplier)) {
      throw new CommandError('invalid', `Supplier ${supplier.id} is a market and takes no orders`);
    }
    return supplier;
  }

  /** Lines as an order keeps them: articles that exist, one line per article, with a price. */
  async function orderLines(
    businessId: Id,
    lines: readonly { articleId: Id; quantity: number; pricePer1000?: number | undefined }[],
  ): Promise<OrderLine[]> {
    const merged = new Map<Id, OrderLine>();
    for (const line of lines) {
      const known = merged.get(line.articleId);
      if (known !== undefined) {
        known.quantity = roundQuantity(known.quantity + line.quantity);
        continue;
      }
      const article = await requireRow(storage.articles, businessId, line.articleId, 'Article');
      merged.set(line.articleId, {
        articleId: article.id,
        quantity: line.quantity,
        pricePer1000:
          line.pricePer1000 === undefined ? article.pricePer1000 : rappen(line.pricePer1000),
      });
    }
    return [...merged.values()];
  }

  async function writeDraft(input: {
    businessId: Id;
    supplierId: Id;
    lines: OrderLine[];
    expectedOn?: LocalDate | undefined;
    note?: string | undefined;
    source: 'hand' | 'suggestions';
  }) {
    const orderId = ids.next();
    const order = PurchaseOrderSchema.parse({
      id: orderId,
      businessId: input.businessId,
      ...stamps(),
      supplierId: input.supplierId,
      status: 'draft',
      lines: input.lines,
      ...(input.expectedOn === undefined ? {} : { expectedOn: input.expectedOn }),
      ...(input.note === undefined ? {} : { note: input.note }),
    });
    await storage.orders.add(order);
    const valueRappen = orderValue(order.lines);
    await emit(input.businessId, 'order.created', {
      orderId,
      supplierId: input.supplierId,
      lineCount: order.lines.length,
      valueRappen,
      source: input.source,
    });
    return { orderId, lineCount: order.lines.length, valueRappen };
  }

  const createOrder: UseCase<'orders.create'> = async (raw) => {
    const input = CONTRACT_V1['orders.create'].input.parse(raw);
    return runCommand('orders.create', input.commandId, async () => {
      const supplier = await orderingSupplier(input.businessId, input.supplierId);
      return writeDraft({
        businessId: input.businessId,
        supplierId: supplier.id,
        lines: await orderLines(input.businessId, input.lines),
        expectedOn: input.expectedOn,
        note: input.note,
        source: 'hand',
      });
    });
  };

  const createFromSuggestions: UseCase<'orders.createFromSuggestions'> = async (raw) => {
    const input = CONTRACT_V1['orders.createFromSuggestions'].input.parse(raw);
    return runCommand('orders.createFromSuggestions', input.commandId, async () => {
      const supplier = await orderingSupplier(input.businessId, input.supplierId);
      const { today, lines } = await computeProposal(input.businessId, input.horizonDays);
      const changed = new Map(input.quantities.map((entry) => [entry.articleId, entry.quantity]));
      const wanted = lines
        .filter((line) => line.article.supplierId === supplier.id)
        .sort((a, b) => byName(a.article, b.article))
        .map((line) => ({
          articleId: line.article.id,
          quantity: roundQuantity(changed.get(line.article.id) ?? line.quantity),
          pricePer1000: line.article.pricePer1000,
        }))
        .filter((line) => line.quantity > 0);
      if (wanted.length === 0) {
        throw new CommandError('invalid', `Nothing to order from supplier ${supplier.id}`);
      }
      return writeDraft({
        businessId: input.businessId,
        supplierId: supplier.id,
        lines: wanted,
        expectedOn: supplierDays(supplier, today).nextDelivery?.on,
        source: 'suggestions',
      });
    });
  };

  async function draftOrder(businessId: Id, orderId: Id): Promise<PurchaseOrder> {
    const order = await requireRow(storage.orders, businessId, orderId, 'Order');
    if (order.status !== 'draft') {
      throw new CommandError('not_allowed', `Order ${order.id} is ${order.status}, not a draft`);
    }
    return order;
  }

  const updateOrder: UseCase<'orders.update'> = async (raw) => {
    const input = CONTRACT_V1['orders.update'].input.parse(raw);
    return runCommand('orders.update', input.commandId, async () => {
      const order = await draftOrder(input.businessId, input.orderId);
      const lines =
        input.lines === undefined ? order.lines : await orderLines(input.businessId, input.lines);
      const next: Record<string, unknown> = {
        ...order,
        lines,
        updatedAt: clock.now(),
      };
      if (input.expectedOn === null) {
        delete next.expectedOn;
      } else if (input.expectedOn !== undefined) {
        next.expectedOn = input.expectedOn;
      }
      if (input.note === null) {
        delete next.note;
      } else if (input.note !== undefined) {
        next.note = input.note;
      }
      const row = PurchaseOrderSchema.parse(next);
      await storage.orders.put(row);
      const fields = [
        ...(input.lines === undefined ? [] : ['lines']),
        ...(input.expectedOn === undefined ? [] : ['expectedOn']),
        ...(input.note === undefined ? [] : ['note']),
      ];
      const valueRappen = orderValue(row.lines);
      await emit(input.businessId, 'order.updated', { orderId: row.id, fields, valueRappen });
      return { orderId: row.id, lineCount: row.lines.length, valueRappen };
    });
  };

  const markSent: UseCase<'orders.markSent'> = async (raw) => {
    const input = CONTRACT_V1['orders.markSent'].input.parse(raw);
    return runCommand('orders.markSent', input.commandId, async () => {
      const order = await requireRow(storage.orders, input.businessId, input.orderId, 'Order');
      const today = clock.today();
      if (order.status === 'sent') {
        // Marked twice (two devices, a double tap): nothing changes.
        return { orderId: order.id, status: order.status, orderedOn: order.orderedOn ?? today };
      }
      if (order.status !== 'draft') {
        throw new CommandError('not_allowed', `Order ${order.id} is ${order.status}`);
      }
      const row = PurchaseOrderSchema.parse({
        ...order,
        status: 'sent',
        orderedOn: today,
        updatedAt: clock.now(),
      });
      await storage.orders.put(row);
      await emit(input.businessId, 'order.sent', {
        orderId: row.id,
        supplierId: row.supplierId,
        orderedOn: today,
        valueRappen: orderValue(row.lines),
      });
      return { orderId: row.id, status: row.status, orderedOn: today };
    });
  };

  const cancelOrder: UseCase<'orders.cancel'> = async (raw) => {
    const input = CONTRACT_V1['orders.cancel'].input.parse(raw);
    return runCommand('orders.cancel', input.commandId, async () => {
      const order = await requireRow(storage.orders, input.businessId, input.orderId, 'Order');
      if (order.status === 'cancelled') {
        return { orderId: order.id, status: order.status };
      }
      if (order.status === 'received') {
        throw new CommandError('not_allowed', `Order ${order.id} is already received`);
      }
      const row = PurchaseOrderSchema.parse({
        ...order,
        status: 'cancelled',
        updatedAt: clock.now(),
      });
      await storage.orders.put(row);
      await emit(input.businessId, 'order.cancelled', { orderId: row.id, was: order.status });
      return { orderId: row.id, status: row.status };
    });
  };

  const deleteOrder: UseCase<'orders.delete'> = async (raw) => {
    const input = CONTRACT_V1['orders.delete'].input.parse(raw);
    return runCommand('orders.delete', input.commandId, async () => {
      const order = await draftOrder(input.businessId, input.orderId);
      const now = clock.now();
      await storage.orders.put(
        PurchaseOrderSchema.parse({ ...order, deletedAt: now, updatedAt: now }),
      );
      await emit(input.businessId, 'order.deleted', { orderId: order.id });
      return { orderId: order.id };
    });
  };

  // -------------------------------------------------------------------------------------------
  // Prices

  const priceWatch: UseCase<'purchasing.priceWatch'> = async (raw) => {
    const input = CONTRACT_V1['purchasing.priceWatch'].input.parse(raw);
    await businessOf(input.businessId);
    const [lotRows, deliveryRows, articleRows, recipeRows, supplierRows] = await Promise.all([
      storage.lots.ofBusiness(input.businessId),
      storage.deliveries.ofBusiness(input.businessId),
      storage.articles.ofBusiness(input.businessId),
      storage.recipes.ofBusiness(input.businessId),
      storage.suppliers.ofBusiness(input.businessId),
    ]);
    const articles = new Map(alive(articleRows).map((row) => [row.id, row]));
    const recipes = new Map(alive(recipeRows).map((row) => [row.id, row]));
    const suppliers = new Map(supplierRows.map((row) => [row.id, row]));
    const history = purchaseHistory(alive(lotRows), promoLots(alive(deliveryRows)));
    const changes = [];
    for (const [articleId, points] of history) {
      const article = articles.get(articleId);
      const latest = points.at(-1);
      const before = points.at(-2);
      if (article === undefined || latest === undefined || before === undefined) {
        continue;
      }
      const change = changeBps(before.pricePer1000, latest.pricePer1000);
      if (Math.abs(change) < input.thresholdBps) {
        continue;
      }
      const supplierName =
        latest.supplierId === undefined ? undefined : suppliers.get(latest.supplierId)?.name;
      changes.push({
        articleId,
        name: article.name,
        unit: article.unit,
        oldPricePer1000: rappen(before.pricePer1000),
        newPricePer1000: rappen(latest.pricePer1000),
        changeBps: change,
        oldOn: before.on,
        newOn: latest.on,
        ...(supplierName === undefined ? {} : { supplierName }),
        dishes: priceImpacts({
          articleId,
          oldPricePer1000: before.pricePer1000,
          newPricePer1000: latest.pricePer1000,
          articles,
          recipes,
        }),
      });
    }
    changes.sort((a, b) => Math.abs(b.changeBps) - Math.abs(a.changeBps) || byName(a, b));
    return { changes: changes.slice(0, input.limit), total: changes.length };
  };

  // -------------------------------------------------------------------------------------------
  // Shopping list for a market (ADR-0015)

  async function shoppingBook(businessId: Id) {
    const [lineRows, deliveryRows, supplierRows, areaRows] = await Promise.all([
      storage.shoppingLines.ofBusiness(businessId),
      storage.deliveries.ofBusiness(businessId),
      storage.suppliers.ofBusiness(businessId),
      storage.areas.ofBusiness(businessId),
    ]);
    const suppliers = alive(supplierRows);
    const markets = suppliers.filter(isMarket).sort(byName);
    return {
      lines: lineRows.filter(isOpenLine),
      markets,
      prices: marketPrices(alive(deliveryRows), new Set(markets.map((row) => row.id))),
      supplierNames: new Map(supplierRows.map((row) => [row.id, row.name])),
      areas: alive(areaRows).sort((a, b) => a.sortOrder - b.sortOrder || byName(a, b)),
    };
  }

  /** The chosen market: the one asked for if it is a market of the business, else the only one. */
  function chosenMarket(markets: readonly Supplier[], marketId: Id | undefined) {
    const asked = markets.find((market) => market.id === marketId);
    return asked ?? (markets.length === 1 ? markets[0] : undefined);
  }

  const marketRef = (market: Supplier) => ({
    id: market.id,
    name: market.name,
    ...(market.customerNumber === undefined ? {} : { customerNumber: market.customerNumber }),
  });

  const proposalReasons = (line: ProposalLine | undefined): ShoppingReason[] =>
    line === undefined ? [] : line.reason === 'both' ? ['below_min', 'plan'] : [line.reason];

  const shoppingList: UseCase<'shopping.list'> = async (raw) => {
    const input = CONTRACT_V1['shopping.list'].input.parse(raw);
    const business = await businessOf(input.businessId);
    const book = await shoppingBook(input.businessId);
    const {
      lines: proposed,
      articles,
      suppliers,
    } = await computeProposal(input.businessId, input.horizonDays);
    const market = chosenMarket(book.markets, input.marketId);
    const articleById = new Map(articles.map((row) => [row.id, row]));
    const ordering = hasModule(business, 'ordering');
    // What the kitchen fetches itself: articles of a market, without a supplier, or all of them
    // when the business orders nothing ahead.
    const fetched = (article: Article) => {
      const supplier =
        article.supplierId === undefined ? undefined : suppliers.get(article.supplierId);
      return supplier === undefined || isMarket(supplier) || !ordering;
    };
    const proposalOf = new Map(
      proposed.filter((line) => fetched(line.article)).map((line) => [line.article.id, line]),
    );
    const marketOf = (article: Article | undefined) => {
      const supplier =
        article?.supplierId === undefined ? undefined : suppliers.get(article.supplierId);
      return isMarket(supplier) ? supplier?.id : undefined;
    };
    const lastPrices = (articleId: Id) => {
      const points: MarketPricePoint[] = book.prices.get(articleId) ?? [];
      const first = points.filter((point) => point.supplierId === market?.id);
      const rest = points.filter((point) => point.supplierId !== market?.id);
      return [...first, ...rest].slice(0, 3).map((point) => ({
        supplierId: point.supplierId,
        supplierName: book.supplierNames.get(point.supplierId) ?? '',
        pricePer1000: rappen(point.pricePer1000),
        on: point.on,
      }));
    };
    const articleFacts = (article: Article) => ({
      articleId: article.id,
      name: article.name,
      unit: article.unit,
      categoryId: article.categoryId,
      ...(article.minStock === undefined ? {} : { minStock: article.minStock }),
      lastPrices: lastPrices(article.id),
    });

    const items: ShoppingItem[] = [];
    const stored = new Set<Id>();
    for (const line of book.lines) {
      const article = line.articleId === undefined ? undefined : articleById.get(line.articleId);
      if (line.articleId !== undefined && article === undefined) {
        continue;
      }
      const from = article === undefined ? undefined : proposalOf.get(article.id);
      const quantity = line.quantity ?? from?.quantity;
      const packs =
        article === undefined || quantity === undefined
          ? undefined
          : packsOf(quantity, article.packSize, article.packLabel);
      const reasons: ShoppingReason[] = [
        ...(line.source === 'proposal' ? [] : [line.source]),
        ...proposalReasons(from),
      ];
      if (article !== undefined) {
        stored.add(article.id);
      }
      const supplierId = line.supplierId ?? marketOf(article);
      items.push({
        key: line.id,
        lineId: line.id,
        ...(article === undefined
          ? { name: line.text ?? '', lastPrices: [] }
          : {
              ...articleFacts(article),
              stock: from?.stock ?? 0,
            }),
        ...(quantity === undefined ? {} : { quantity }),
        ...(packs === undefined ? {} : { packs }),
        reasons,
        checked: line.checked,
        ...(supplierId === undefined ? {} : { supplierId }),
        removable: true,
      });
    }
    for (const line of proposalOf.values()) {
      if (stored.has(line.article.id)) {
        continue;
      }
      const supplierId = marketOf(line.article);
      items.push({
        key: `article:${line.article.id}`,
        ...articleFacts(line.article),
        stock: line.stock,
        quantity: line.quantity,
        ...(line.packs === undefined ? {} : { packs: line.packs }),
        reasons: proposalReasons(line),
        checked: false,
        ...(supplierId === undefined ? {} : { supplierId }),
        removable: false,
      });
    }

    const shown = items.filter(
      (item) =>
        market === undefined || item.supplierId === undefined || item.supplierId === market.id,
    );
    const others = new Map<Id, number>();
    for (const item of items) {
      if (!shown.includes(item) && item.supplierId !== undefined) {
        others.set(item.supplierId, (others.get(item.supplierId) ?? 0) + 1);
      }
    }
    // The walk through the chosen market, then the usual order of the groups of goods.
    const walk = [...new Set([...(market?.categoryOrder ?? []), ...ARTICLE_CATEGORY_IDS])];
    const groups: ShoppingGroup[] = [];
    for (const categoryId of walk) {
      const inGroup = shown.filter((item) => item.categoryId === categoryId).sort(byName);
      if (inGroup.length > 0) {
        groups.push({ categoryId, items: inGroup });
      }
    }
    const loose = shown.filter((item) => item.categoryId === undefined).sort(byName);
    if (loose.length > 0) {
      groups.push({ items: loose });
    }
    return {
      markets: book.markets.map(marketRef),
      ...(market === undefined ? {} : { marketId: market.id }),
      groups,
      count: shown.length,
      checkedCount: shown.filter((item) => item.checked).length,
      otherMarkets: [...others.entries()].map(([id, count]) => ({
        id,
        name: book.supplierNames.get(id) ?? '',
        count,
      })),
    };
  };

  async function openLineOf(businessId: Id, articleId: Id): Promise<ShoppingLine | undefined> {
    const rows = await storage.shoppingLines.ofBusiness(businessId);
    return rows.find((row) => isOpenLine(row) && row.articleId === articleId);
  }

  const addShoppingLine: UseCase<'shopping.add'> = async (raw) => {
    const input = CONTRACT_V1['shopping.add'].input.parse(raw);
    return runCommand('shopping.add', input.commandId, async () => {
      if (input.supplierId !== undefined) {
        await requireRow(storage.suppliers, input.businessId, input.supplierId, 'Supplier');
      }
      let known: ShoppingLine | undefined;
      if (input.articleId !== undefined) {
        await requireRow(storage.articles, input.businessId, input.articleId, 'Article');
        known = await openLineOf(input.businessId, input.articleId);
      } else {
        const text = (input.text ?? '').toLocaleLowerCase('de-CH');
        const rows = await storage.shoppingLines.ofBusiness(input.businessId);
        known = rows.find(
          (row) => isOpenLine(row) && row.text?.toLocaleLowerCase('de-CH') === text,
        );
      }
      if (known !== undefined) {
        if (input.quantity !== undefined && input.quantity !== known.quantity) {
          await storage.shoppingLines.put(
            ShoppingLineSchema.parse({
              ...known,
              quantity: input.quantity,
              updatedAt: clock.now(),
            }),
          );
        }
        await emit(input.businessId, 'shopping_line.added', {
          lineId: known.id,
          merged: true,
        });
        return { lineId: known.id, merged: true };
      }
      const line = ShoppingLineSchema.parse({
        id: ids.next(),
        businessId: input.businessId,
        ...stamps(),
        ...(input.articleId === undefined ? {} : { articleId: input.articleId }),
        ...(input.text === undefined ? {} : { text: input.text }),
        ...(input.quantity === undefined ? {} : { quantity: input.quantity }),
        ...(input.supplierId === undefined ? {} : { supplierId: input.supplierId }),
        source: 'manual',
        checked: false,
      });
      await storage.shoppingLines.add(line);
      await emit(input.businessId, 'shopping_line.added', {
        lineId: line.id,
        source: line.source,
        ...(line.articleId === undefined ? {} : { articleId: line.articleId }),
      });
      return { lineId: line.id, merged: false };
    });
  };

  const markMissing: UseCase<'shopping.markMissing'> = async (raw) => {
    const input = CONTRACT_V1['shopping.markMissing'].input.parse(raw);
    return runCommand('shopping.markMissing', input.commandId, async () => {
      const article = await requireRow(
        storage.articles,
        input.businessId,
        input.articleId,
        'Article',
      );
      if (input.supplierId !== undefined) {
        await requireRow(storage.suppliers, input.businessId, input.supplierId, 'Supplier');
      }
      const known = await openLineOf(input.businessId, article.id);
      if (known !== undefined) {
        await emit(input.businessId, 'shopping_line.added', { lineId: known.id, merged: true });
        return { lineId: known.id, merged: true };
      }
      const line = ShoppingLineSchema.parse({
        id: ids.next(),
        businessId: input.businessId,
        ...stamps(),
        articleId: article.id,
        ...(input.supplierId === undefined ? {} : { supplierId: input.supplierId }),
        source: 'missing',
        checked: false,
      });
      await storage.shoppingLines.add(line);
      await emit(input.businessId, 'shopping_line.added', {
        lineId: line.id,
        source: line.source,
        articleId: article.id,
      });
      return { lineId: line.id, merged: false };
    });
  };

  const checkShoppingLine: UseCase<'shopping.check'> = async (raw) => {
    const input = CONTRACT_V1['shopping.check'].input.parse(raw);
    return runCommand('shopping.check', input.commandId, async () => {
      const now = clock.now();
      let line: ShoppingLine | undefined;
      if (input.lineId !== undefined) {
        line = await requireRow(storage.shoppingLines, input.businessId, input.lineId, 'Line');
        if (line.deliveryId !== undefined) {
          throw new CommandError('not_allowed', `Line ${line.id} was bought already`);
        }
      } else if (input.articleId !== undefined) {
        await requireRow(storage.articles, input.businessId, input.articleId, 'Article');
        line = await openLineOf(input.businessId, input.articleId);
        if (line === undefined && input.checked) {
          // A line of the proposal is ticked: from now on it is kept, also offline.
          const created = ShoppingLineSchema.parse({
            id: ids.next(),
            businessId: input.businessId,
            ...stamps(),
            articleId: input.articleId,
            ...(input.quantity === undefined ? {} : { quantity: input.quantity }),
            ...(input.supplierId === undefined ? {} : { supplierId: input.supplierId }),
            source: 'proposal',
            checked: true,
          });
          await storage.shoppingLines.add(created);
          await emit(input.businessId, 'shopping_line.checked', {
            lineId: created.id,
            checked: true,
          });
          return { lineId: created.id, checked: true };
        }
      }
      if (line === undefined) {
        return { checked: input.checked };
      }
      if (line.checked === input.checked) {
        return { lineId: line.id, checked: line.checked };
      }
      // A line of the proposal that is opened again goes back to being the live proposal.
      const back = !input.checked && line.source === 'proposal';
      await storage.shoppingLines.put(
        ShoppingLineSchema.parse({
          ...line,
          checked: input.checked,
          updatedAt: now,
          ...(back ? { deletedAt: now } : {}),
        }),
      );
      await emit(input.businessId, 'shopping_line.checked', {
        lineId: line.id,
        checked: input.checked,
      });
      return back ? { checked: false } : { lineId: line.id, checked: input.checked };
    });
  };

  const removeShoppingLine: UseCase<'shopping.remove'> = async (raw) => {
    const input = CONTRACT_V1['shopping.remove'].input.parse(raw);
    return runCommand('shopping.remove', input.commandId, async () => {
      const line = await requireRow(storage.shoppingLines, input.businessId, input.lineId, 'Line');
      if (line.deliveryId !== undefined) {
        throw new CommandError('not_allowed', `Line ${line.id} was bought already`);
      }
      const now = clock.now();
      await storage.shoppingLines.put(
        ShoppingLineSchema.parse({ ...line, deletedAt: now, updatedAt: now }),
      );
      await emit(input.businessId, 'shopping_line.removed', { lineId: line.id });
      return { lineId: line.id };
    });
  };

  const shoppingDraft: UseCase<'shopping.draft'> = async (raw) => {
    const input = CONTRACT_V1['shopping.draft'].input.parse(raw);
    await businessOf(input.businessId);
    const book = await shoppingBook(input.businessId);
    const market = chosenMarket(book.markets, input.marketId);
    const articles = alive(await storage.articles.ofBusiness(input.businessId));
    const articleById = new Map(articles.map((row) => [row.id, row]));
    const ticked = book.lines.filter((line) => line.checked);
    const lines = ticked.flatMap((line) => {
      const article = line.articleId === undefined ? undefined : articleById.get(line.articleId);
      if (article === undefined) {
        return [];
      }
      const packs =
        line.quantity === undefined
          ? undefined
          : packsOf(line.quantity, article.packSize, article.packLabel);
      return [
        {
          lineId: line.id,
          articleId: article.id,
          ...(line.quantity === undefined ? {} : { quantity: line.quantity }),
          ...(packs === undefined ? {} : { packs }),
        },
      ];
    });
    const inLines = new Set(lines.map((line) => line.articleId));
    const purchaseArticle = (article: Article): PurchaseArticle => {
      const category = articleCategory(article.categoryId);
      const area =
        book.areas.find((candidate) => candidate.id === article.areaId) ??
        book.areas.find((candidate) => candidate.kind === category.area) ??
        book.areas[0];
      const atMarket = (book.prices.get(article.id) ?? []).find(
        (point) => point.supplierId === market?.id,
      );
      return {
        articleId: article.id,
        name: article.name,
        unit: article.unit,
        categoryId: article.categoryId,
        pricePer1000: rappen(atMarket?.pricePer1000 ?? article.pricePer1000),
        ...(area === undefined ? {} : { areaId: area.id }),
        dateKind: article.dateKind,
        shelfLifeDays: article.shelfLifeDays ?? category.shelfLifeDays,
        ...(article.packSize === undefined ? {} : { packSize: article.packSize }),
        ...(article.packLabel === undefined ? {} : { packLabel: article.packLabel }),
      };
    };
    return {
      ...(market === undefined ? {} : { market: marketRef(market) }),
      markets: book.markets.map(marketRef),
      lines,
      freeText: ticked.flatMap((line) =>
        line.articleId === undefined && line.text !== undefined
          ? [{ lineId: line.id, text: line.text }]
          : [],
      ),
      articles: articles
        .filter(
          (article) => (article.kind === 'purchased' && article.active) || inLines.has(article.id),
        )
        .sort(byName)
        .map(purchaseArticle),
    };
  };

  const recordPurchase: UseCase<'shopping.record'> = async (raw) => {
    const input = CONTRACT_V1['shopping.record'].input.parse(raw);
    return runCommand('shopping.record', input.commandId, async () => {
      if (input.receivedOn > clock.today()) {
        throw new CommandError('invalid', `Purchase ${input.receivedOn} lies in the future`);
      }
      const supplier =
        input.supplierId === undefined
          ? undefined
          : await requireRow(storage.suppliers, input.businessId, input.supplierId, 'Supplier');
      const deliveryId = ids.next();
      const lines: DeliveryLine[] = [];
      for (const line of input.lines) {
        const article = await requireRow(
          storage.articles,
          input.businessId,
          line.articleId,
          'Article',
        );
        // A large amount over a tiny quantity gives a price no article can have.
        if ((line.lineTotalRappen * 1000) / line.quantity > MAX_UNIT_PRICE) {
          throw new CommandError('invalid', `The price of ${article.id} is out of range`);
        }
        const lot = await ledger.receive({
          businessId: input.businessId,
          articleId: article.id,
          areaId: line.areaId,
          quantity: line.quantity,
          pricePer1000: unitPriceFromTotal(line.lineTotalRappen, line.quantity),
          receivedOn: input.receivedOn,
          expiresOn: line.expiresOn,
          lotCode: line.lotCode,
          supplierId: supplier?.id,
          deliveryId,
          origin: 'purchase',
          // An offer is booked at its price but is not the price for costing (ADR-0015).
          ...(line.promo === true ? { updateArticlePrice: false } : {}),
        });
        lines.push({
          articleId: article.id,
          lotId: lot.id,
          areaId: lot.areaId,
          quantity: lot.quantity,
          pricePer1000: lot.pricePer1000,
          valueRappen: lineValue(lot.quantity, lot.pricePer1000),
          ...(lot.expiresOn === undefined ? {} : { expiresOn: lot.expiresOn }),
          ...(lot.lotCode === undefined ? {} : { lotCode: lot.lotCode }),
          ...(line.packs === undefined ? {} : { packs: line.packs }),
          ...(line.promo === true ? { promo: true } : {}),
        });
      }
      const totalRappen = sumRappen(lines.map((line) => line.valueRappen));
      const linesRappen = sumRappen(input.lines.map((line) => rappen(line.lineTotalRappen)));
      const otherRappen = sumRappen(input.otherAmounts.map((amount) => amount.amountRappen));
      const unassignedRappen =
        input.documentTotalRappen === undefined
          ? undefined
          : rappen(input.documentTotalRappen - linesRappen - otherRappen);
      await storage.deliveries.add(
        DeliverySchema.parse({
          id: deliveryId,
          businessId: input.businessId,
          ...stamps(),
          ...(supplier === undefined ? {} : { supplierId: supplier.id }),
          receivedOn: input.receivedOn,
          ...(input.documentNumber === undefined ? {} : { documentNumber: input.documentNumber }),
          lines,
          totalRappen,
          ...(input.tempDeciC === undefined ? {} : { tempDeciC: input.tempDeciC }),
          checkOk: true,
          ...(input.documentTotalRappen === undefined
            ? {}
            : { documentTotalRappen: input.documentTotalRappen }),
          ...(input.otherAmounts.length === 0 ? {} : { otherAmounts: input.otherAmounts }),
          ...(input.photo === undefined ? {} : { photo: input.photo }),
          ...(input.note === undefined ? {} : { note: input.note }),
          receivedBy: actor,
        }),
      );
      if (input.tempDeciC !== undefined) {
        // Measured at pick-up: a record of the self-control, like at the door.
        await storage.temperatureLogs.add(
          TemperatureLogSchema.parse({
            id: ids.next(),
            businessId: input.businessId,
            ...stamps(),
            kind: 'receiving',
            label: supplier?.name ?? 'Einkauf',
            deciC: input.tempDeciC,
            ok: true,
            on: input.receivedOn,
            measuredAt: clock.now(),
            measuredBy: actor,
          }),
        );
      }
      const settled: Id[] = [];
      for (const lineId of new Set(input.shoppingLineIds)) {
        const row = await storage.shoppingLines.get(lineId);
        if (row?.businessId !== input.businessId || !isOpenLine(row)) {
          continue;
        }
        await storage.shoppingLines.put(
          ShoppingLineSchema.parse({ ...row, checked: true, deliveryId, updatedAt: clock.now() }),
        );
        settled.push(row.id);
      }
      const lotIds = lines.map((line) => line.lotId);
      await emit(input.businessId, 'delivery.received', {
        deliveryId,
        ...(supplier === undefined ? {} : { supplierId: supplier.id }),
        lotIds,
        totalRappen,
        checkOk: true,
        purchase: true,
        ...(input.documentTotalRappen === undefined
          ? {}
          : { documentTotalRappen: input.documentTotalRappen }),
        ...(unassignedRappen === undefined ? {} : { unassignedRappen }),
        shoppingLineIds: settled,
      });
      return {
        deliveryId,
        lotIds,
        totalRappen,
        linesRappen,
        otherRappen,
        ...(unassignedRappen === undefined ? {} : { unassignedRappen }),
      };
    });
  };

  return {
    'purchasing.suggestions': suggestions,
    'orders.list': listOrders,
    'orders.get': getOrder,
    'orders.create': createOrder,
    'orders.createFromSuggestions': createFromSuggestions,
    'orders.update': updateOrder,
    'orders.markSent': markSent,
    'orders.cancel': cancelOrder,
    'orders.delete': deleteOrder,
    'purchasing.priceWatch': priceWatch,
    'shopping.list': shoppingList,
    'shopping.add': addShoppingLine,
    'shopping.markMissing': markMissing,
    'shopping.check': checkShoppingLine,
    'shopping.remove': removeShoppingLine,
    'shopping.draft': shoppingDraft,
    'shopping.record': recordPurchase,
  };
}
