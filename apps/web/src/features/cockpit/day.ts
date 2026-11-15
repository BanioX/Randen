import {
  planSlotLabel,
  type CockpitMealSlot,
  type CockpitTodo,
  type CockpitTodoKind,
  type ModuleId,
  type Rappen,
} from '@randen/core';
import {
  CalendarDays,
  Clock,
  CookingPot,
  ShoppingCart,
  SprayCan,
  Thermometer,
  TriangleAlert,
  Truck,
  Utensils,
  type LucideIcon,
} from 'lucide-react';
import { paths } from '../../app/paths';
import type { Tone } from '../../ui/tones';
import { cockpitMessages } from './messages';
import { belowMinPath, targetPath } from './shared';

const t = cockpitMessages.today;

/** One row of «Heute» as the page shows it: words, symbol, tone and where it leads. */
export interface DayRow {
  key: CockpitTodoKind;
  title: string;
  subtitle: string;
  icon: LucideIcon;
  /** One meaning per colour (docs/design.md): vermilion must go, amber is open, calm the rest. */
  tone: Tone;
  valueRappen?: Rappen;
  to: string;
}

const looks: Record<CockpitTodoKind, { icon: LucideIcon; tone: Tone }> = {
  expired: { icon: TriangleAlert, tone: 'danger' },
  due_today: { icon: Clock, tone: 'today' },
  temperature: { icon: Thermometer, tone: 'soon' },
  hygiene: { icon: SprayCan, tone: 'soon' },
  orders: { icon: Truck, tone: 'neutral' },
  plan: { icon: CalendarDays, tone: 'neutral' },
  meals: { icon: Utensils, tone: 'neutral' },
  below_min: { icon: ShoppingCart, tone: 'soon' },
  shopping: { icon: ShoppingCart, tone: 'soon' },
};

/** The names of a row, or the count in words when it has none. */
function subtitle(row: CockpitTodo): string {
  const names = cockpitMessages.list(row.names, row.count);
  return names === '' ? t.kinds[row.kind].detail(row.count) : names;
}

function plain(row: CockpitTodo): DayRow {
  return {
    key: row.kind,
    title: t.kinds[row.kind].title,
    subtitle: subtitle(row),
    ...looks[row.kind],
    ...(row.valueRappen === undefined ? {} : { valueRappen: row.valueRappen }),
    to: targetPath(row.target),
  };
}

/**
 * «Heute» in the words of the functions the business uses (ADR-0015). The core, what expires
 * and the self-control, is always there. Deliveries come with ordering, today's plan with
 * planning («Heute produzieren» where production is on), the meals to count with meals. What
 * is under its minimum leads to the shopping list with the market, to the order proposal with
 * ordering, and to the stock list without either; the lines of the shopping list join it.
 */
export function dayRows(
  todo: readonly CockpitTodo[],
  meals: readonly CockpitMealSlot[],
  modules: ReadonlySet<ModuleId>,
): DayRow[] {
  const market = modules.has('market');
  const ordering = modules.has('ordering');
  const shopping = market ? todo.find((row) => row.kind === 'shopping') : undefined;
  const rows: DayRow[] = [];
  for (const row of todo) {
    switch (row.kind) {
      case 'expired':
      case 'due_today':
      case 'temperature':
      case 'hygiene':
        rows.push(plain(row));
        break;
      case 'orders':
        if (ordering) {
          rows.push(plain(row));
        }
        break;
      case 'plan':
        if (modules.has('planning')) {
          rows.push(
            modules.has('production')
              ? { ...plain(row), title: t.produce, icon: CookingPot, to: paths.production() }
              : plain(row),
          );
        }
        break;
      case 'meals':
        if (modules.has('meals')) {
          const waiting = meals
            .filter((meal) => meal.served === undefined)
            .map((meal) => t.meal(planSlotLabel(meal.slot), meal.expected));
          rows.push({
            ...plain(row),
            subtitle: waiting.length === 0 ? subtitle(row) : waiting.join(' · '),
          });
        }
        break;
      case 'below_min': {
        const count = row.count + (shopping?.count ?? 0);
        const names = [...row.names, ...(shopping?.names ?? [])].slice(0, 3);
        rows.push({
          ...plain(row),
          key: shopping === undefined ? 'below_min' : 'shopping',
          title:
            market && ordering
              ? t.restock
              : market
                ? t.kinds.shopping.title
                : ordering
                  ? t.order
                  : t.kinds.below_min.title,
          subtitle: cockpitMessages.list(names, count),
          to: market || ordering ? paths.purchasing() : belowMinPath(),
        });
        break;
      }
      case 'shopping':
        // Joined with the articles under their minimum when there are some.
        if (market && !todo.some((other) => other.kind === 'below_min')) {
          rows.push(plain(row));
        }
        break;
    }
  }
  return rows;
}
