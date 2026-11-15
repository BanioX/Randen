import {
  formatQuantity,
  formatSwissDate,
  IdSchema,
  relativeDays,
  daysBetween,
  type Id,
  type OperationOutput,
} from '@randen/core';
import { Printer } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { isNotFound, useMoney, useQuery, useQueryResult, useToday } from '../../app/hooks';
import { NotFoundPage } from '../../app/NotFoundPage';
import { paths } from '../../app/paths';
import { useDetailed } from '../../app/view';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { DataTable, type DataTableColumn } from '../../ui/DataTable';
import { ExpiryChip } from '../../ui/badges';
import { KpiGrid, StatTile } from '../../ui/StatTile';
import { Notice } from '../../ui/Notice';
import { PageHeader } from '../../ui/PageHeader';
import { Section } from '../../ui/Section';
import { LabelCard } from './LabelCard';
import { productionMessages } from './messages';

const t = productionMessages;
const NO_RUN: Id = IdSchema.parse('01900000-0000-7000-8000-0000000000fe');

type Detail = OperationOutput<'production.get'>;
type TraceIn = Detail['ins'][number];

/**
 * One production run (pattern H2): what went in, lot by lot, what came out, and the label of the
 * output. The label is the only part that prints.
 */
export function ProductionRunPage() {
  const { productionId } = useParams();
  const parsed = IdSchema.safeParse(productionId);
  const enabled = parsed.success;
  const id = parsed.success ? parsed.data : NO_RUN;
  const money = useMoney();
  const today = useToday();
  const detailed = useDetailed();
  const detail = useQueryResult('production.get', { productionId: id }, { enabled });
  const label = useQuery('production.label', { productionId: id }, { enabled });
  const [params, setParams] = useSearchParams();
  const printRequested = params.get('print') === '1';
  const labelReady = label !== undefined && detail.data?.output !== undefined;
  const printed = useRef(false);

  // «Etikett drucken» on the result of a production: the label prints as soon as it is on the
  // page, once (StrictMode runs effects twice). The address forgets the request, so a reload
  // does not print again.
  useEffect(() => {
    if (!printRequested || !labelReady || printed.current) {
      return;
    }
    printed.current = true;
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete('print');
        return next;
      },
      { replace: true },
    );
    window.print();
  }, [printRequested, labelReady, setParams]);

  if (!enabled || (detail.status === 'error' && isNotFound(detail.error))) {
    return <NotFoundPage text={t.runPage.notFoundText} />;
  }
  if (detail.status === 'error') {
    return <NotFoundPage text={t.errors.unknown} />;
  }
  const data = detail.data;
  const title = data?.output?.name ?? data?.production.recipeName ?? t.production.title;
  const ins = data?.ins ?? [];
  // The value of a lot is an evaluation: only under «Erweitert» (ADR-0015).
  const columns: DataTableColumn<TraceIn>[] = [
    {
      key: 'name',
      header: t.runPage.columns.ingredient,
      render: (row) => (
        <span className="block break-words">
          <span className="block font-medium">{row.name}</span>
          <span className="block text-sm text-ink-muted">
            {formatQuantity(row.quantity, row.unit)}
          </span>
        </span>
      ),
    },
    {
      key: 'value',
      header: t.runPage.columns.value,
      align: 'right',
      render: (row) => money.format(row.valueRappen),
    },
    {
      key: 'lot',
      header: t.runPage.columns.lot,
      hideBelow: 'md',
      render: (row) => t.runPage.lotCode(row.lotCode),
    },
    {
      key: 'supplier',
      header: t.runPage.columns.supplier,
      hideBelow: 'lg',
      render: (row) => row.supplierName ?? '–',
    },
    {
      key: 'received',
      header: t.runPage.columns.received,
      hideBelow: 'lg',
      render: (row) => formatSwissDate(row.receivedOn),
    },
  ];

  const shownColumns = detailed ? columns : columns.filter((column) => column.key !== 'value');

  return (
    <div className="space-y-8">
      <div className="print:hidden space-y-8">
        <PageHeader
          title={title}
          back={{ to: paths.production(), label: t.runPage.back }}
          actions={
            label === undefined || data?.output === undefined ? undefined : (
              <Button
                variant="primary"
                icon={Printer}
                onClick={() => {
                  window.print();
                }}
              >
                {t.runPage.labelAction}
              </Button>
            )
          }
        />
        {data === undefined ? null : (
          <KpiGrid>
            {detailed ? (
              <StatTile
                label={t.runPage.statCost}
                value={money.format(data.production.costRappen, { currency: false })}
                unit={money.symbol}
              />
            ) : null}
            {detailed ? (
              <StatTile
                label={t.runPage.statPerPortion}
                value={money.format(data.production.costPerPortionRappen, { currency: false })}
                unit={money.symbol}
              />
            ) : null}
            <StatTile label={t.runPage.statPortions} value={String(data.production.portions)} />
            <StatTile
              label={t.runPage.shortagesTitle}
              value={String(data.shortages.length)}
              tone={data.shortages.length > 0 ? 'soon' : 'ok'}
            />
          </KpiGrid>
        )}

        {data === undefined || data.shortages.length === 0 ? null : (
          <Notice tone="soon" title={t.runPage.shortagesTitle}>
            <ul className="space-y-1">
              {data.shortages.map((shortage) => (
                <li key={shortage.articleId}>
                  {shortage.name}: {formatQuantity(shortage.missing, shortage.unit)}
                </li>
              ))}
            </ul>
          </Notice>
        )}

        <Section title={t.runPage.insTitle} hint={t.runPage.insCaption}>
          {data === undefined || ins.length === 0 ? (
            <p className="text-ink-muted">{t.runPage.insEmpty}</p>
          ) : (
            <DataTable
              caption={t.runPage.insTitle}
              columns={shownColumns}
              rows={ins}
              getRowKey={(row) => row.lotId}
            />
          )}
        </Section>

        <Section title={t.runPage.outTitle}>
          {data?.output === undefined ? (
            <p className="text-ink-muted">{t.runPage.outEmpty}</p>
          ) : (
            <Card>
              <p className="text-lg font-semibold">{data.output.name}</p>
              <p className="mt-1 text-ink-muted">
                {formatQuantity(data.output.quantity, data.output.unit)} ·{' '}
                {t.runPage.remaining(formatQuantity(data.output.remaining, data.output.unit))}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <ExpiryChip
                  expiresOn={data.output.expiresOn}
                  dateKind={data.output.dateKind}
                  today={today}
                />
                <span className="text-ink-muted">{t.runPage.lotCode(data.output.lotCode)}</span>
              </div>
              <p className="mt-2 text-[0.9375rem] text-ink-muted">
                {data.output.areaName ?? ''}
                {data.output.expiresOn === undefined
                  ? ''
                  : ` · ${relativeDays(daysBetween(today, data.output.expiresOn))}`}
              </p>
            </Card>
          )}
        </Section>
      </div>

      {label === undefined || data?.output === undefined ? null : <LabelCard label={label} />}
    </div>
  );
}
