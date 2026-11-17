import {
  addDays,
  formatSwissDate,
  localDate,
  MovementTypeSchema,
  movementTypeLabel,
  type LocalDate,
} from '@randen/core';
import { useSearchParams } from 'react-router';
import { useBusiness, useMoney, useQuery, useToday } from '../../app/hooks';
import { paths } from '../../app/paths';
import { PrintButton } from '../../ui/PrintButton';
import { ChoiceChips } from '../../ui/ChoiceChips';
import { PageHeader } from '../../ui/PageHeader';
import { Section } from '../../ui/Section';
import { SegmentedControl } from '../../ui/SegmentedControl';
import { StatTile } from '../../ui/StatTile';
import { useKept } from './hooks';
import { stockMessages } from './messages';
import { MovementList } from './MovementList';

const t = stockMessages.journal;

/** The periods as they stand in the address: `?period=30`. */
const PERIODS = ['7', '30', 'month'] as const;
type Period = (typeof PERIODS)[number];

const TYPES = MovementTypeSchema.options;
const ALL = 'all';

function periodStart(period: Period, today: LocalDate): LocalDate {
  if (period === 'month') {
    return localDate(`${today.slice(0, 8)}01`);
  }
  return addDays(today, period === '7' ? -6 : -29);
}

/**
 * «Journal»: every movement of the stock, newest first. The sums per type answer first (what
 * came in, what was used, what was written off), then the lines. A wrong booking is corrected
 * by a counter booking; nothing is ever taken out of the journal.
 */
export function JournalPage() {
  const [params, setParams] = useSearchParams();
  const today = useToday();
  const money = useMoney();
  const business = useBusiness();
  const period = PERIODS.find((each) => each === params.get('period')) ?? '7';
  const type = TYPES.find((each) => each === params.get('type'));
  const from = periodStart(period, today);
  const data = useKept(
    useQuery('stock.journal', { from, to: today, ...(type === undefined ? {} : { type }) }),
  );

  function setParam(name: string, value: string | null) {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (value === null) {
          next.delete(name);
        } else {
          next.set(name, value);
        }
        return next;
      },
      { replace: true },
    );
  }

  return (
    <>
      <PageHeader
        title={t.title}
        subtitle={t.subtitle}
        back={{ to: paths.stock(), label: stockMessages.back }}
        actions={
          <span className="print:hidden">
            <PrintButton variant="secondary" label={t.print} />
          </span>
        }
      />
      <p className="mb-4 hidden text-sm print:block">
        {t.printMeta(business.name, formatSwissDate(from), formatSwissDate(today))}
      </p>
      <div className="space-y-5">
        <div className="space-y-3 print:hidden">
          <SegmentedControl
            label={t.period.label}
            hideLabel
            options={[
              { value: '7', label: t.period.week },
              { value: '30', label: t.period.month },
              { value: 'month', label: t.period.calendar },
            ]}
            value={period}
            onChange={(next) => {
              setParam('period', next === '7' ? null : next);
            }}
            className="md:max-w-md"
          />
          <ChoiceChips
            legend={t.type}
            hideLegend
            options={[
              { value: ALL, label: t.allTypes },
              ...TYPES.map((each) => ({ value: each, label: movementTypeLabel(each) })),
            ]}
            value={type ?? ALL}
            onChange={(next) => {
              setParam('type', next === ALL ? null : next);
            }}
          />
        </div>

        {data === undefined ? null : (
          <>
            <p className="text-ink-muted">
              {t.answer(data.total, formatSwissDate(from), formatSwissDate(today))}
            </p>
            <Section title={t.sums} titleStyle="group">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
                {data.sums.map((sum) => (
                  <StatTile
                    key={sum.type}
                    label={movementTypeLabel(sum.type)}
                    unit={money.symbol}
                    value={money.format(sum.valueRappen, { currency: false })}
                    hint={stockMessages.bookings(sum.count)}
                  />
                ))}
              </div>
            </Section>
            {data.movements.length === 0 ? (
              <p className="rounded-2xl bg-surface px-4 py-8 text-center text-ink-muted shadow-card">
                {t.empty}
              </p>
            ) : (
              <>
                {data.total > data.movements.length ? (
                  <p className="text-sm text-ink-muted">
                    {t.limited(data.movements.length, data.total)}
                  </p>
                ) : null}
                <MovementList
                  movements={data.movements}
                  showArticle
                  printable
                  caption={stockMessages.movements.caption}
                />
              </>
            )}
          </>
        )}
      </div>
    </>
  );
}
