import {
  formatPercent,
  formatSwissDate,
  formatUnitPrice,
  type OrderSummary,
  type PriceChange,
} from '@randen/core';
import { useMoney, useQuery, useToday } from '../../app/hooks';
import { paths } from '../../app/paths';
import { useDetailed } from '../../app/view';
import { Card } from '../../ui/Card';
import { GroupedList, GroupedListItem, ListRow } from '../../ui/GroupedList';
import { Section } from '../../ui/Section';
import { StatusChip } from '../../ui/StatusChip';
import { purchasingMessages } from './messages';
import { dayLabel, OrderStatusChip } from './shared';

const t = purchasingMessages;

/** What an order row says under the supplier: lines, when ordered, when it comes. */
export function OrderRowFacts({ order }: { order: OrderSummary }) {
  const today = useToday();
  return (
    <>
      {[
        t.orders.lines(order.lineCount),
        order.orderedOn === undefined
          ? t.orders.createdOn(formatSwissDate(order.createdOn))
          : t.orders.orderedOn(formatSwissDate(order.orderedOn)),
        ...(order.expectedOn === undefined
          ? []
          : [t.orders.expected(dayLabel(order.expectedOn, today))]),
      ].join(' · ')}
    </>
  );
}

/** One order in a list: supplier, facts, status and value; the row opens the order. */
export function OrderRow({ order }: { order: OrderSummary }) {
  const money = useMoney();
  return (
    <ListRow
      to={paths.order(order.id)}
      title={order.supplierName}
      subtitle={<OrderRowFacts order={order} />}
      trailing={
        <>
          <OrderStatusChip status={order.status} size="sm" />
          <span className="font-semibold">
            {order.priceMissing && order.valueRappen === 0
              ? t.priceMissing
              : money.format(order.valueRappen)}
          </span>
        </>
      }
    />
  );
}

/** «Offene Bestellungen»: drafts and sent orders, the newest first. */
export function OpenOrdersSection() {
  const data = useQuery('orders.list', { status: 'open' });
  return (
    <Section title={t.openOrders.title} action={{ label: t.openOrders.all, to: paths.orders() }}>
      {data === undefined ? null : data.orders.length === 0 ? (
        <Card>
          <p className="text-ink-muted">{t.openOrders.none}</p>
        </Card>
      ) : (
        <GroupedList label={t.openOrders.caption}>
          {data.orders.map((order) => (
            <OrderRow key={order.id} order={order} />
          ))}
        </GroupedList>
      )}
    </Section>
  );
}

function PriceChangeRow({ change, detailed }: { change: PriceChange; detailed: boolean }) {
  const money = useMoney();
  const p = t.priceWatch;
  const price = (value: number) => formatUnitPrice(value, change.unit, money.currency);
  const share = formatPercent(Math.abs(change.changeBps));
  return (
    <GroupedListItem inset="text">
      <div className="px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
          <div className="min-w-0 flex-1">
            <p className="font-semibold break-words hyphens-calm">{change.name}</p>
            <p className="text-sm text-ink-muted tabular-nums">
              {p.change(price(change.oldPricePer1000), price(change.newPricePer1000))}
            </p>
            <p className="text-sm text-ink-muted">
              {p.since(formatSwissDate(change.newOn), change.supplierName)}
            </p>
          </div>
          <StatusChip tone={change.changeBps > 0 ? 'soon' : 'ok'} size="sm">
            {change.changeBps > 0 ? p.dearer(share) : p.cheaper(share)}
          </StatusChip>
        </div>
        {change.dishes.length === 0 ? (
          <p className="mt-1 text-sm text-ink-muted">{p.noDishes}</p>
        ) : detailed ? (
          <ul aria-label={p.dishesCaption(change.name)} className="mt-2 space-y-1.5">
            {change.dishes.map((dish) => (
              <li
                key={dish.recipeId}
                className="flex flex-wrap items-baseline justify-between gap-x-3 rounded-xl bg-surface-muted px-3 py-2 text-sm"
              >
                <span className="min-w-0">
                  <span className="font-semibold">{dish.name}</span>
                  {dish.via === undefined ? null : (
                    <span className="text-ink-muted"> ({p.via(dish.via)})</span>
                  )}
                </span>
                <span className="tabular-nums">
                  {dish.foodCostBeforeBps === undefined || dish.foodCostAfterBps === undefined
                    ? `${p.costChange(money.format(dish.costBeforeRappen), money.format(dish.costAfterRappen))}, ${p.noPrice}`
                    : p.costChange(
                        formatPercent(dish.foodCostBeforeBps),
                        formatPercent(dish.foodCostAfterBps),
                      )}
                  {dish.incomplete ? `, ${p.incomplete}` : ''}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-sm text-ink-muted">{p.dishes(change.dishes.length)}</p>
        )}
      </div>
    </GroupedListItem>
  );
}

/**
 * «Preisänderungen»: what got dearer or cheaper since the purchase before. The dishes it reaches
 * and their food cost before and after are an evaluation: the view «Erweitert» shows them.
 */
export function PriceWatchSection() {
  const data = useQuery('purchasing.priceWatch', {});
  const detailed = useDetailed();
  return (
    <Section title={t.priceWatch.title} hint={t.priceWatch.hint}>
      {data === undefined ? null : data.changes.length === 0 ? (
        <Card>
          <p className="text-ink-muted">{t.priceWatch.none}</p>
        </Card>
      ) : (
        <GroupedList label={t.priceWatch.caption}>
          {data.changes.map((change) => (
            <PriceChangeRow key={change.articleId} change={change} detailed={detailed} />
          ))}
        </GroupedList>
      )}
    </Section>
  );
}
