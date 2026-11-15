import { OrderStatusFilterSchema, type OrderStatusFilter } from '@randen/core';
import { ClipboardList, PackageCheck } from 'lucide-react';
import { useSearchParams } from 'react-router';
import { useQuery } from '../../app/hooks';
import { paths } from '../../app/paths';
import { ButtonLink } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { EmptyState } from '../../ui/EmptyState';
import { GroupedList } from '../../ui/GroupedList';
import { PageHeader } from '../../ui/PageHeader';
import { SegmentedControl } from '../../ui/SegmentedControl';
import { purchasingMessages } from './messages';
import { OrderRow } from './OverviewSections';

const t = purchasingMessages.orders;

type Filter = OrderStatusFilter | 'all';
/** Four segments fit the phone: drafts and sent orders are both «offen». */
const FILTERS: readonly Filter[] = ['open', 'received', 'cancelled', 'all'];

/**
 * «Bestellungen» (pattern H1): every order, newest first, narrowed by status in the address.
 * New orders come from the proposal; a row opens the order with its text to send.
 */
export function OrdersPage() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('status');
  const parsed = OrderStatusFilterSchema.safeParse(raw);
  const filter: Filter = raw === 'all' ? 'all' : parsed.success ? parsed.data : 'open';
  const data = useQuery('orders.list', filter === 'all' ? {} : { status: filter });

  const counts = data?.counts;
  const countOf = (value: Filter) =>
    counts === undefined
      ? undefined
      : value === 'all'
        ? counts.draft + counts.sent + counts.received + counts.cancelled
        : value === 'open'
          ? counts.draft + counts.sent
          : counts[value];
  const total = countOf('all');

  return (
    <>
      <PageHeader
        title={t.title}
        back={{ to: paths.purchasing(), label: purchasingMessages.back }}
        actions={
          <ButtonLink to={paths.purchasing()} size="sm" icon={PackageCheck}>
            {t.toProposal}
          </ButtonLink>
        }
      />
      {total === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={t.emptyTitle}
          text={t.emptyText}
          action={
            <ButtonLink to={paths.purchasing()} size="sm" variant="secondary">
              {t.toProposal}
            </ButtonLink>
          }
        />
      ) : (
        <div className="space-y-4">
          <SegmentedControl
            label={t.filter}
            hideLabel
            options={FILTERS.map((value) => {
              const count = value === 'open' ? countOf(value) : undefined;
              return {
                value,
                label:
                  count === undefined
                    ? t.filters[value]
                    : t.filterWithCount(t.filters[value], count),
              };
            })}
            value={filter}
            onChange={(value) => {
              const next = new URLSearchParams(params);
              if (value === 'open') {
                next.delete('status');
              } else {
                next.set('status', value);
              }
              setParams(next, { replace: true });
            }}
          />
          {data === undefined ? null : data.orders.length === 0 ? (
            <Card>
              <p className="text-ink-muted">{t.noMatch}</p>
            </Card>
          ) : (
            <GroupedList label={t.caption}>
              {data.orders.map((order) => (
                <OrderRow key={order.id} order={order} />
              ))}
            </GroupedList>
          )}
        </div>
      )}
    </>
  );
}
