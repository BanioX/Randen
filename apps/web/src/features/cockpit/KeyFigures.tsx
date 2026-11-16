import { formatPercent, rappen, type CockpitToday } from '@randen/core';
import type { ReactElement } from 'react';
import { useMoney } from '../../app/hooks';
import { useModules } from '../../app/modules';
import { paths } from '../../app/paths';
import { useDetailed } from '../../app/view';
import { KpiGrid, StatTile, type StatTone } from '../../ui/StatTile';
import { cockpitMessages } from './messages';
import { expiringPath, monthName } from './shared';

const t = cockpitMessages.figures;

const statusTone = { good: 'ok', watch: 'soon', over: 'danger' } as const;

/**
 * The key figures under the day. The core (ADR-0015): the one dark card with the stock value,
 * what was thrown away and what expires today. With «Budget und Zahlen» the goods of the month
 * against the target: as a share of the revenue, or per meal where the kitchen counts meals
 * and sells no dishes. «Erweitert» shows the write-offs of the week against the week before
 * (a trend) instead of the month so far. What has to be bought stands in the day already.
 */
export function KeyFigures({ figures }: { figures: CockpitToday['figures'] }) {
  const money = useMoney();
  const modules = useModules();
  const detailed = useDetailed();
  const numbers = modules.has('numbers');
  const { stock, foodCost, costPerMeal, writeOffs, dueToday } = figures;
  const month = monthName(foodCost.month);

  const tiles: ReactElement[] = [
    <StatTile
      key="stock"
      variant="premium"
      label={t.stock}
      unit={money.symbol}
      value={money.format(stock.valueRappen, { currency: false })}
      hint={[
        stock.lotCount === 0 ? t.emptyStock : t.spread(stock.articleCount, stock.areaCount),
        stock.lotsWithoutPrice > 0 ? t.withoutPrice(stock.lotsWithoutPrice) : '',
      ]
        .filter((part) => part !== '')
        .join(' · ')}
      to={paths.stock()}
    />,
  ];

  if (numbers && modules.has('meals') && !modules.has('sales')) {
    const { perMealRappen, targetRappen, status } = costPerMeal;
    tiles.push(
      <StatTile
        key="per-meal"
        label={t.perMeal}
        unit={perMealRappen === undefined ? undefined : money.symbol}
        value={
          perMealRappen === undefined ? t.open : money.format(perMealRappen, { currency: false })
        }
        tone={status === 'unknown' ? undefined : statusTone[status]}
        hint={
          perMealRappen === undefined
            ? t.perMealHint.noMeals(month)
            : targetRappen === undefined || status === 'unknown'
              ? t.perMealHint.noTarget(t.meals(costPerMeal.served))
              : t.perMealHint[status](money.format(targetRappen))
        }
        to={paths.numbers()}
      />,
    );
  } else if (numbers) {
    tiles.push(
      <StatTile
        key="food-cost"
        label={t.foodCost(month)}
        value={foodCost.shareBps === undefined ? t.open : formatPercent(foodCost.shareBps)}
        tone={foodCost.status === 'unknown' ? undefined : statusTone[foodCost.status]}
        hint={
          foodCost.status === 'unknown'
            ? t.noRevenue(month)
            : t.target[foodCost.status](formatPercent(foodCost.targetBps))
        }
        to={paths.numbers()}
      />,
    );
  }

  if (detailed) {
    const difference = writeOffs.weekRappen - writeOffs.lastWeekRappen;
    const tone: StatTone | undefined =
      difference < 0 ? 'ok' : difference > 0 ? 'danger' : undefined;
    tiles.push(
      <StatTile
        key="write-offs"
        label={t.writeOffs}
        unit={money.symbol}
        value={money.format(writeOffs.weekRappen, { currency: false })}
        tone={tone}
        hint={
          writeOffs.weekRappen === 0 && writeOffs.lastWeekRappen === 0
            ? t.noWriteOffs
            : difference < 0
              ? t.less(money.format(rappen(-difference)))
              : difference > 0
                ? t.more(money.format(rappen(difference)))
                : t.same
        }
        to={numbers ? paths.wasteReport() : undefined}
      />,
    );
  } else {
    tiles.push(
      <StatTile
        key="thrown-away"
        label={t.thrownAway}
        unit={money.symbol}
        value={money.format(writeOffs.monthRappen, { currency: false })}
        hint={t.thrownAwayCount(writeOffs.monthCount, month)}
        to={numbers ? paths.wasteReport() : undefined}
      />,
    );
  }

  tiles.push(
    <StatTile
      key="due-today"
      label={t.dueToday}
      value={cockpitMessages.lots(dueToday.count)}
      tone={dueToday.count > 0 ? 'today' : 'ok'}
      hint={dueToday.count > 0 ? t.worth(money.format(dueToday.valueRappen)) : t.nothingDue}
      to={expiringPath('today')}
    />,
  );

  if (tiles.length === 4) {
    return <KpiGrid>{tiles}</KpiGrid>;
  }
  // Three figures: the dark card across the phone, three in a row from tablet width.
  return (
    <div className="@container min-w-0">
      <div className="grid grid-cols-2 gap-3 @2xl:grid-cols-3 @2xl:gap-4">
        {tiles.map((tile, index) => (
          <div key={tile.key} className={index === 0 ? 'col-span-2 @2xl:col-span-1' : undefined}>
            {tile}
          </div>
        ))}
      </div>
    </div>
  );
}
