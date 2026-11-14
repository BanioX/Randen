import {
  CommandError,
  formatQuantity,
  IdSchema,
  type OperationOutput,
  type SupplierArticleRow,
} from '@randen/core';
import { Mail, Pencil, Phone } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { errorText, isNotFound, useCommand, useMoney, useQueryResult } from '../../app/hooks';
import { NotFoundPage } from '../../app/NotFoundPage';
import { paths } from '../../app/paths';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { DataTable, type DataTableColumn } from '../../ui/DataTable';
import { GroupedList, ListRow } from '../../ui/GroupedList';
import { Notice } from '../../ui/Notice';
import { PageHeader } from '../../ui/PageHeader';
import { Section } from '../../ui/Section';
import { ConfirmDialog, Sheet } from '../../ui/Sheet';
import { KpiGrid, StatTile } from '../../ui/StatTile';
import { StatusChip } from '../../ui/StatusChip';
import { useToast } from '../../ui/Toast';
import { articlesMessages } from './messages';
import { asError, dayText, Fact, priceText, WeekdayMarks } from './shared';
import { SupplierForm } from './SupplierForm';

const t = articlesMessages.suppliers;
const d = t.detail;
/** A contact line that calls or writes: the whole line is the target. */
const CONTACT =
  '-mx-2 flex min-h-11 items-center gap-3 rounded-xl px-2 font-semibold text-wine-800 hover:bg-surface-muted';

type Detail = OperationOutput<'suppliers.get'>;

interface SupplierDetailProps {
  detail: Detail;
  /** Told before the supplier is deleted, so the page does not call it «nicht gefunden» meanwhile. */
  onLeaving: (leaving: boolean) => void;
}

function SupplierDetail({ detail, onLeaving }: SupplierDetailProps) {
  const { supplier, articles, openOrders } = detail;
  const money = useMoney();
  const run = useCommand();
  const navigate = useNavigate();
  const toast = useToast();
  const [dialog, setDialog] = useState<'edit' | 'confirm' | 'blocked' | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const blocked = articles.length > 0 || openOrders > 0;
  const stockText = (row: SupplierArticleRow) =>
    row.stock > 0 ? formatQuantity(row.stock, row.unit) : articlesMessages.noStock;

  function remove() {
    setDialog(null);
    setFailure(null);
    onLeaving(true);
    run('suppliers.delete', { supplierId: supplier.id })
      .then(() => {
        toast({ text: d.removed(supplier.name) });
        void navigate(paths.suppliers(), { replace: true });
      })
      .catch((error: unknown) => {
        onLeaving(false);
        setFailure(
          error instanceof CommandError && error.code === 'in_use'
            ? d.blockedGeneric
            : errorText(error),
        );
      });
  }

  const columns: DataTableColumn<SupplierArticleRow>[] = [
    {
      key: 'article',
      header: d.columns.article,
      render: (row) => (
        <span className="block">
          <span className="block">{row.name}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.8125rem] font-normal text-ink-muted">
            {row.categoryLabel}
            {row.active ? null : (
              <StatusChip tone="neutral" size="sm">
                {articlesMessages.inactive}
              </StatusChip>
            )}
          </span>
        </span>
      ),
    },
    {
      key: 'stock',
      header: d.columns.stock,
      align: 'right',
      render: (row) => (
        <>
          <span className={row.stock > 0 ? '' : 'text-ink-muted'}>{stockText(row)}</span>
          {row.belowMin && row.minStock !== undefined ? (
            <span className="block text-[0.8125rem] text-soon">
              {articlesMessages.minStock(formatQuantity(row.minStock, row.unit))}
            </span>
          ) : null}
        </>
      ),
    },
    {
      key: 'price',
      header: d.columns.price,
      align: 'right',
      render: (row) => (
        <span className={row.pricePer1000 > 0 ? '' : 'text-ink-muted'}>
          {priceText(row.pricePer1000, row.unit, money.currency)}
        </span>
      ),
    },
  ];

  const hasContact =
    supplier.phone !== undefined ||
    supplier.email !== undefined ||
    supplier.customerNumber !== undefined;

  return (
    <>
      <PageHeader
        title={supplier.name}
        back={{ to: paths.suppliers(), label: t.back }}
        actions={
          <Button
            icon={Pencil}
            size="sm"
            onClick={() => {
              setDialog('edit');
            }}
          >
            {d.edit}
          </Button>
        }
      />

      <div className="space-y-6">
        <KpiGrid>
          <StatTile
            label={d.nextOrder}
            value={
              supplier.nextOrder === undefined ? articlesMessages.none : dayText(supplier.nextOrder)
            }
            hint={supplier.nextOrder === undefined ? t.noDay : undefined}
          />
          <StatTile
            label={d.nextDelivery}
            value={
              supplier.nextDelivery === undefined
                ? articlesMessages.none
                : dayText(supplier.nextDelivery)
            }
            hint={supplier.nextDelivery === undefined ? t.noDay : undefined}
          />
          <StatTile label={d.articles} value={String(articles.length)} />
          <StatTile
            label={d.minOrder}
            {...(supplier.minOrderRappen === undefined ? {} : { unit: money.symbol })}
            value={
              supplier.minOrderRappen === undefined
                ? d.noMinOrder
                : money.format(supplier.minOrderRappen, { currency: false })
            }
          />
        </KpiGrid>

        <div className="flex flex-col gap-6 lg:grid lg:grid-cols-3 lg:items-start">
          <div className="lg:col-span-2">
            <Section title={d.articles} action={{ label: d.allArticles, to: paths.articles() }}>
              {articles.length === 0 ? (
                <Card>
                  <p className="text-ink-muted">{d.noArticles}</p>
                </Card>
              ) : (
                <>
                  <div className="md:hidden">
                    <GroupedList label={d.articlesCaption}>
                      {articles.map((row) => (
                        <ListRow
                          key={row.id}
                          to={paths.article(row.id)}
                          title={row.name}
                          subtitle={
                            row.pricePer1000 > 0
                              ? `${stockText(row)} · ${priceText(row.pricePer1000, row.unit, money.currency)}`
                              : `${stockText(row)} · ${articlesMessages.missing.price}`
                          }
                          trailing={
                            row.belowMin ? (
                              <StatusChip tone="soon">{articlesMessages.reorder}</StatusChip>
                            ) : row.active ? undefined : (
                              <StatusChip tone="neutral">{articlesMessages.inactive}</StatusChip>
                            )
                          }
                        />
                      ))}
                    </GroupedList>
                  </div>
                  <div className="hidden md:block">
                    <DataTable
                      caption={d.articlesCaption}
                      hideCaption
                      columns={columns}
                      rows={articles}
                      getRowKey={(row) => row.id}
                      rowLink={(row) => paths.article(row.id)}
                    />
                  </div>
                </>
              )}
            </Section>
          </div>

          <div className="order-first space-y-6 md:grid md:grid-cols-2 md:items-start md:gap-4 md:space-y-0 lg:order-none lg:block lg:space-y-6">
            <Section title={d.contact}>
              <Card padding="compact">
                {hasContact ? (
                  <>
                    {supplier.phone === undefined ? null : (
                      <a
                        href={`tel:${supplier.phone.replace(/[^\d+]/g, '')}`}
                        aria-label={d.call(supplier.phone)}
                        className={CONTACT}
                      >
                        <Phone
                          size={20}
                          strokeWidth={1.75}
                          aria-hidden="true"
                          className="shrink-0"
                        />
                        <span className="min-w-0 break-words tabular-nums">{supplier.phone}</span>
                      </a>
                    )}
                    {supplier.email === undefined ? null : (
                      <a
                        href={`mailto:${supplier.email}`}
                        aria-label={d.write(supplier.email)}
                        className={CONTACT}
                      >
                        <Mail
                          size={20}
                          strokeWidth={1.75}
                          aria-hidden="true"
                          className="shrink-0"
                        />
                        <span className="min-w-0 wrap-anywhere">{supplier.email}</span>
                      </a>
                    )}
                    {supplier.customerNumber === undefined ? null : (
                      <dl>
                        <Fact label={d.customerNumber}>{supplier.customerNumber}</Fact>
                      </dl>
                    )}
                  </>
                ) : (
                  <p className="py-2.5 text-ink-muted">{d.noContact}</p>
                )}
              </Card>
            </Section>

            <Section title={d.days}>
              <Card className="space-y-4">
                <div>
                  <p className="mb-2 text-[0.8125rem] font-semibold text-ink-muted">
                    {d.orderDays}
                  </p>
                  <WeekdayMarks label={d.orderDays} days={supplier.orderDays} />
                </div>
                <div>
                  <p className="mb-2 text-[0.8125rem] font-semibold text-ink-muted">
                    {d.deliveryDays}
                  </p>
                  <WeekdayMarks label={d.deliveryDays} days={supplier.deliveryDays} />
                </div>
                {supplier.note === undefined ? null : (
                  <p className="border-t border-line pt-3 text-[0.9375rem] whitespace-pre-line">
                    <span className="block text-ink-muted">{d.note}</span>
                    {supplier.note}
                  </p>
                )}
              </Card>
            </Section>
          </div>
        </div>

        <div>
          {failure === null ? null : (
            <div className="mb-3">
              <Notice tone="danger" variant="row">
                {failure}
              </Notice>
            </div>
          )}
          <Button
            variant="secondary"
            onClick={() => {
              setDialog(blocked ? 'blocked' : 'confirm');
            }}
          >
            {d.remove}
          </Button>
        </div>
      </div>

      <Sheet
        open={dialog === 'edit'}
        onClose={() => {
          setDialog(null);
        }}
        title={t.form.editTitle}
      >
        <SupplierForm
          supplier={supplier}
          placement="inline"
          onSaved={() => {
            setDialog(null);
            toast({ text: t.form.saved, tone: 'ok' });
          }}
          onCancel={() => {
            setDialog(null);
          }}
        />
      </Sheet>
      <ConfirmDialog
        open={dialog === 'confirm'}
        tone="danger"
        title={d.removeTitle(supplier.name)}
        text={d.removeText}
        confirmLabel={d.remove}
        onConfirm={remove}
        onCancel={() => {
          setDialog(null);
        }}
      />
      <Sheet
        open={dialog === 'blocked'}
        onClose={() => {
          setDialog(null);
        }}
        title={d.blockedTitle(supplier.name)}
        hideClose
        footer={
          <div className="flex justify-end">
            <Button
              data-autofocus=""
              className="w-full md:w-auto"
              onClick={() => {
                setDialog(null);
              }}
            >
              {d.close}
            </Button>
          </div>
        }
      >
        <div className="space-y-2">
          {articles.length > 0 ? <p>{d.blockedArticles(articles.length)}</p> : null}
          {openOrders > 0 ? <p>{d.blockedOrders(openOrders)}</p> : null}
        </div>
      </Sheet>
    </>
  );
}

/**
 * One supplier: when to order and when goods arrive, how to reach them, and the articles they
 * deliver. Editing happens in a sheet, so the page stays where it is.
 */
export function SupplierDetailPage() {
  const { supplierId = '' } = useParams();
  const known = IdSchema.safeParse(supplierId).success;
  const result = useQueryResult('suppliers.get', { supplierId }, { enabled: known });
  const [leaving, setLeaving] = useState(false);
  if (!known) {
    return <NotFoundPage />;
  }
  if (result.status === 'ready') {
    return <SupplierDetail detail={result.data} onLeaving={setLeaving} />;
  }
  if (result.status === 'loading' || leaving) {
    return <PageHeader title={t.title} back={{ to: paths.suppliers(), label: t.back }} />;
  }
  if (isNotFound(result.error)) {
    return <NotFoundPage />;
  }
  // Not a missing row: let the frame of the app say that something went wrong.
  throw asError(result.error);
}
