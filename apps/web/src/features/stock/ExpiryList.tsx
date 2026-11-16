import {
  EXPIRY_GROUPS,
  formatQuantity,
  type ExpiringLot,
  type ExpiryGroup,
  type OperationOutput,
} from '@randen/core';
import { CalendarCheck } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { errorText, useCommand, useMoney, useToday } from '../../app/hooks';
import { useModule } from '../../app/modules';
import { paths } from '../../app/paths';
import { AreaBadge, ExpiryChip } from '../../ui/badges';
import { Button, ButtonLink } from '../../ui/Button';
import { DataTable, type DataTableColumn } from '../../ui/DataTable';
import { EmptyState } from '../../ui/EmptyState';
import { GroupedList, GroupedListItem } from '../../ui/GroupedList';
import { Notice } from '../../ui/Notice';
import { Section } from '../../ui/Section';
import { ConfirmDialog } from '../../ui/Sheet';
import { useToast } from '../../ui/Toast';
import { stockMessages } from './messages';

const t = stockMessages.expiring;

/** Lots that can still be cooked: a link to the menu plan helps to use them in time. */
const USABLE: readonly ExpiryGroup[] = ['today', 'soon', 'week'];

interface ExpiryListProps {
  data: OperationOutput<'stock.expiring'>;
  /** Only this group, when a tile of the page led here. */
  only: ExpiryGroup | null;
  /** Where «Alle anzeigen» leads. */
  unfiltered: string;
}

const place = (lot: ExpiringLot) =>
  lot.spotName === undefined ? lot.area.name : `${lot.area.name}, ${lot.spotName}`;

/**
 * «Ablauf»: the lots that are due, by urgency. What is past its Verbrauchsdatum comes first
 * and can be written off in one go; what can still be used gets a way into the menu plan.
 */
export function ExpiryList({ data, only, unfiltered }: ExpiryListProps) {
  const money = useMoney();
  const today = useToday();
  const run = useCommand();
  const toast = useToast();
  const planning = useModule('planning');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const expired = data.lots.filter((lot) => lot.group === 'expired');
  const groups = EXPIRY_GROUPS.filter((group) => only === null || group === only)
    .map((group) => ({ group, lots: data.lots.filter((lot) => lot.group === group) }))
    .filter(({ lots }) => lots.length > 0);
  /** One link to the menu plan on the page: at the first group that can still be used. */
  const planGroup = groups.find(({ group }) => USABLE.includes(group))?.group;

  async function writeOffExpired() {
    setConfirming(false);
    setBusy(true);
    setError(null);
    try {
      const result = await run('stock.writeOffExpired', {});
      toast({ text: t.done(result.count, money.format(result.valueRappen)), tone: 'ok' });
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setBusy(false);
    }
  }

  const columns: DataTableColumn<ExpiringLot>[] = [
    // Shares of the width: the tables of the groups stand under each other and share their axes.
    { key: 'article', header: t.table.article, width: '24%', render: (lot) => lot.articleName },
    {
      key: 'quantity',
      header: t.table.quantity,
      align: 'right',
      width: '10%',
      render: (lot) => formatQuantity(lot.quantity, lot.unit),
    },
    {
      key: 'value',
      header: t.table.value,
      align: 'right',
      width: '13%',
      render: (lot) => money.format(lot.valueRappen),
    },
    {
      key: 'date',
      header: t.table.date,
      width: '23%',
      render: (lot) => (
        <ExpiryChip expiresOn={lot.expiresOn} dateKind={lot.dateKind} today={today} />
      ),
    },
    {
      key: 'place',
      header: t.table.place,
      hideBelow: 'lg',
      width: '16%',
      render: (lot) => (
        <span className="flex flex-wrap items-center gap-1.5">
          <AreaBadge kind={lot.area.kind} name={lot.area.name} size="sm" />
          {lot.spotName === undefined ? null : (
            <span className="text-sm text-ink-muted">{lot.spotName}</span>
          )}
        </span>
      ),
    },
    {
      key: 'action',
      header: t.table.action,
      align: 'right',
      width: '14%',
      render: (lot) => <WriteOffLink lot={lot} />,
    },
  ];

  return (
    <div className="space-y-5">
      {only === null ? null : (
        <Notice
          variant="row"
          action={
            <ButtonLink to={unfiltered} variant="ghost" size="sm">
              {t.showAll}
            </ButtonLink>
          }
        >
          {t.onlyGroup(t.groups[only])}
        </Notice>
      )}

      {expired.length === 0 ? null : (
        <Notice
          tone="danger"
          title={t.notice.title(expired.length)}
          action={
            <Button
              variant="secondary"
              size="sm"
              busy={busy}
              onClick={() => {
                setConfirming(true);
              }}
            >
              {t.notice.action}
            </Button>
          }
        >
          {t.notice.text(money.format(data.groups.expired.valueRappen))}
        </Notice>
      )}
      {error === null ? null : (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      {groups.length === 0 ? (
        only === null ? (
          <EmptyState icon={CalendarCheck} title={t.emptyTitle} text={t.emptyText} />
        ) : (
          <p className="rounded-2xl bg-surface px-4 py-8 text-center text-ink-muted shadow-card">
            {t.emptyGroup}
          </p>
        )
      ) : (
        groups.map(({ group, lots }) => (
          <Section
            key={group}
            title={t.groups[group]}
            titleStyle="group"
            hint={t.groupHint(money.format(data.groups[group].valueRappen))}
            action={
              planning && group === planGroup ? { label: t.usePlan, to: paths.plan() } : undefined
            }
          >
            <div className="md:hidden">
              <GroupedList>
                {lots.map((lot) => (
                  <GroupedListItem key={lot.lotId} inset="text">
                    <div className="px-4 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                        <Link
                          to={paths.stockArticle(lot.articleId)}
                          className="inline-flex min-h-11 items-center rounded-lg font-semibold text-wine-800"
                        >
                          {lot.articleName}
                        </Link>
                        <ExpiryChip
                          expiresOn={lot.expiresOn}
                          dateKind={lot.dateKind}
                          today={today}
                          size="sm"
                        />
                      </div>
                      <div className="flex items-end justify-between gap-3">
                        <p className="min-w-0 flex-1 text-sm text-ink-muted tabular-nums">
                          {formatQuantity(lot.quantity, lot.unit)} · {money.format(lot.valueRappen)}
                          <span className="block">{place(lot)}</span>
                        </p>
                        <WriteOffLink lot={lot} />
                      </div>
                    </div>
                  </GroupedListItem>
                ))}
              </GroupedList>
            </div>
            <div className="hidden md:block">
              <DataTable
                caption={t.groups[group]}
                hideCaption
                columns={columns}
                rows={lots}
                getRowKey={(lot) => lot.lotId}
                rowLink={(lot) => paths.stockArticle(lot.articleId)}
              />
            </div>
          </Section>
        ))
      )}

      <ConfirmDialog
        open={confirming}
        tone="danger"
        title={t.confirm.title(expired.length)}
        text={t.confirm.text(
          expired
            .map((lot) => `${lot.articleName} ${formatQuantity(lot.quantity, lot.unit)}`)
            .join(', '),
          money.format(data.groups.expired.valueRappen),
        )}
        confirmLabel={t.confirm.action}
        onConfirm={() => {
          void writeOffExpired();
        }}
        onCancel={() => {
          setConfirming(false);
        }}
      />
    </div>
  );
}

/** «Abschreiben» for one lot: opens the write-off with this lot chosen. */
function WriteOffLink({ lot }: { lot: ExpiringLot }) {
  return (
    <ButtonLink
      to={paths.waste(lot.lotId)}
      variant="secondary"
      size="sm"
      aria-label={t.writeOffOf(lot.articleName, formatQuantity(lot.quantity, lot.unit))}
    >
      {t.writeOff}
    </ButtonLink>
  );
}
