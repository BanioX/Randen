import { formatQuantity, type CockpitToday } from '@randen/core';
import { useMoney, useToday } from '../../app/hooks';
import { useModule } from '../../app/modules';
import { paths } from '../../app/paths';
import { areaLooks, ExpiryChip } from '../../ui/badges';
import { GroupedList, ListRow } from '../../ui/GroupedList';
import { Section } from '../../ui/Section';
import { cockpitMessages } from './messages';

const t = cockpitMessages.useUp;

/**
 * «Heute verwerten» (core): the lots that expire within three days, the most urgent first, with
 * what they are worth. The way on is the menu plan («Reste verwerten») where the business plans
 * (ADR-0015), else the expiry list of the stock.
 */
export function UseUpList({ useUp }: { useUp: CockpitToday['useUp'] }) {
  const planning = useModule('planning');
  const money = useMoney();
  const today = useToday();
  const rest = useUp.count - useUp.lots.length;
  return (
    <Section
      title={t.title}
      titleStyle="group"
      hint={
        useUp.count === 0 ? undefined : t.summary(useUp.count, money.format(useUp.totalValueRappen))
      }
      action={
        useUp.count === 0
          ? undefined
          : planning
            ? { label: t.plan, to: paths.plan() }
            : { label: t.expiring, to: paths.stockExpiring() }
      }
    >
      {useUp.lots.length === 0 ? (
        <p className="rounded-2xl bg-surface px-4 py-4 text-ink-muted shadow-card">{t.none}</p>
      ) : (
        <GroupedList label={t.label}>
          {useUp.lots.map((lot) => (
            <ListRow
              key={lot.lotId}
              title={lot.articleName}
              subtitle={[formatQuantity(lot.quantity, lot.unit), lot.area.name, lot.spotName]
                .filter((part) => part !== undefined)
                .join(' · ')}
              icon={areaLooks[lot.area.kind].icon}
              iconTone={areaLooks[lot.area.kind].tone}
              trailing={
                <>
                  <span className="font-semibold">{money.format(lot.valueRappen)}</span>
                  <ExpiryChip
                    expiresOn={lot.expiresOn}
                    dateKind={lot.dateKind}
                    today={today}
                    size="sm"
                  />
                </>
              }
              to={paths.stockArticle(lot.articleId)}
            />
          ))}
          {rest > 0 ? <ListRow title={t.more(rest)} to={paths.stockExpiring()} /> : null}
        </GroupedList>
      )}
    </Section>
  );
}
