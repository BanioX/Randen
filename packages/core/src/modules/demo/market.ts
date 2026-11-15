import { createStockLedger, type AppContext } from '../../application';
import { createCommandKit } from '../../application/command';
import { lineValue } from '../../domain/units';
import type { Id } from '../../ids';
import { rappen } from '../../money';
import type { LocalDate } from '../../model/primitives';
import {
  DeliverySchema,
  ShoppingLineSchema,
  type DeliveryLine,
  type ReceiptAmount,
} from '../../model/stock';
import { articleOf, must } from './plan';
import { MARKET_PURCHASES, SHOPPING_LINES, type AreaKey } from './catalogue';
import { dayAt } from './support';

/**
 * Purchases at Markt Nord (ADR-0015): the kitchen fetches its goods itself, pays at the till and
 * keeps the receipt. Every line is a goods receipt through the ledger (origin purchase), the
 * receipt adds up with its deposits and private items, and the shopping list of the next visit
 * holds what is open. Nothing here reads the walk: the walk is over when the market is written.
 */

/** A price of a promo: the regular price of the article, a little less (ADR-0015). */
const PROMO_BPS = 7700;

export interface MarketIds {
  market: Id;
  /** The staff member who buys: the purchasing person of the team. */
  purchasing: Id;
  areas: Record<AreaKey, Id>;
  articles: Map<string, Id>;
}

/** Writes the market receipts and the open shopping list, through the ledger. */
export async function writeMarket(
  ctx: AppContext,
  businessId: Id,
  today: LocalDate,
  ids: MarketIds,
): Promise<void> {
  const { storage } = ctx;
  const { stamps } = createCommandKit(ctx);
  const ledger = createStockLedger({ ...ctx, actor: ids.purchasing });
  const articleId = (key: string) => must(ids.articles.get(key), `article ${key}`);

  for (const purchase of MARKET_PURCHASES) {
    const deliveryId = ctx.ids.next();
    const receivedOn = dayAt(today, purchase.day);
    const lines: DeliveryLine[] = [];
    for (const line of purchase.lines) {
      const id = articleId(line.article);
      const article = must(await storage.articles.get(id), `article row ${line.article}`);
      const definition = articleOf(line.article);
      // The price the market asks today: the article's own, or less for a promo.
      const price =
        line.promo === true
          ? Math.round((article.pricePer1000 * PROMO_BPS) / 10_000)
          : article.pricePer1000;
      const expiresOn =
        line.shelfDays === undefined ? undefined : dayAt(receivedOn, line.shelfDays);
      const lot = await ledger.receive({
        businessId,
        articleId: id,
        areaId: ids.areas[definition.area],
        quantity: line.quantity,
        pricePer1000: price,
        receivedOn,
        expiresOn,
        dateKind: article.dateKind,
        supplierId: ids.market,
        deliveryId,
        origin: 'purchase',
        // A promo keeps the regular price of the article: it was an offer, not the price.
        updateArticlePrice: line.promo !== true,
      });
      lines.push({
        articleId: id,
        lotId: lot.id,
        areaId: lot.areaId,
        quantity: line.quantity,
        pricePer1000: rappen(price),
        valueRappen: lineValue(line.quantity, price),
        ...(expiresOn === undefined ? {} : { expiresOn }),
        ...(line.packs === undefined ? {} : { packs: line.packs }),
        ...(line.promo === true ? { promo: true } : {}),
      });
    }

    const totalRappen = lines.reduce((sum, line) => sum + line.valueRappen, 0);
    const otherAmounts: ReceiptAmount[] = purchase.others.map((other) => ({
      kind: other.kind,
      amountRappen: rappen(other.amountRappen),
      ...(other.note === undefined ? {} : { note: other.note }),
    }));
    // The receipt adds up: goods plus what is not goods in stock is the total printed on it.
    const documentTotalRappen =
      totalRappen + otherAmounts.reduce((sum, amount) => sum + amount.amountRappen, 0);
    await storage.deliveries.add(
      DeliverySchema.parse({
        id: deliveryId,
        businessId,
        ...stamps(),
        supplierId: ids.market,
        receivedOn,
        documentNumber: purchase.documentNumber,
        lines,
        totalRappen,
        checkOk: true,
        documentTotalRappen,
        otherAmounts,
        receivedBy: ids.purchasing,
      }),
    );
  }

  for (const line of SHOPPING_LINES) {
    await storage.shoppingLines.add(
      ShoppingLineSchema.parse({
        id: ctx.ids.next(),
        businessId,
        ...stamps(),
        supplierId: ids.market,
        ...(line.article === undefined ? {} : { articleId: articleId(line.article) }),
        ...(line.text === undefined ? {} : { text: line.text }),
        ...(line.quantity === undefined ? {} : { quantity: line.quantity }),
        source: line.source,
        checked: line.checked,
      }),
    );
  }
}
