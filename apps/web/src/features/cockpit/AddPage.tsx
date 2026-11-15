import {
  BookOpen,
  ChartColumn,
  ClipboardCheck,
  CookingPot,
  PackagePlus,
  ReceiptText,
  ShoppingCart,
  Tags,
  Thermometer,
  Trash2,
  Utensils,
  type LucideIcon,
} from 'lucide-react';
import { useModules } from '../../app/modules';
import { paths } from '../../app/paths';
import { GroupedList, ListRow } from '../../ui/GroupedList';
import { PageHeader } from '../../ui/PageHeader';
import { Section } from '../../ui/Section';
import { cockpitMessages } from './messages';
import { belowMinPath } from './shared';

const t = cockpitMessages.add;

interface Way {
  key: keyof typeof t.rows;
  icon: LucideIcon;
  to: string;
  /** The line under the title, where it differs from the catalog's one line. */
  text?: string;
  /** Shown only while the business uses this function (ADR-0015); without: the core. */
  shown?: boolean;
}

/**
 * «Erfassen», behind the ＋ in the middle of the tab bar (docs/regeln.md H1): every way to book
 * what happened in the kitchen, one large row each, by the functions the business uses
 * (ADR-0015). The core is always there: goods in, write-off, temperature, what is missing, the
 * count. A kitchen at the market books its purchase first; production, meals and sales come
 * with their functions.
 */
export function AddPage() {
  const modules = useModules();
  const market = modules.has('market');
  const ordering = modules.has('ordering');
  const receive: Way = { key: 'receive', icon: PackagePlus, to: paths.receive() };
  const purchase: Way = { key: 'purchase', icon: ReceiptText, to: paths.receive(), shown: market };
  const book: Way[] = [
    // A kitchen that fetches its goods and orders nothing ahead buys more than it receives.
    ...(market && !ordering ? [purchase, receive] : [receive, purchase]),
    { key: 'waste', icon: Trash2, to: paths.waste() },
    { key: 'temperature', icon: Thermometer, to: paths.temperatures() },
    {
      key: 'missing',
      icon: ShoppingCart,
      to: market || ordering ? paths.purchasing() : belowMinPath(),
      text: t.rows.missing.text[market ? 'market' : ordering ? 'ordering' : 'stock'],
    },
    {
      key: 'production',
      icon: CookingPot,
      to: paths.productionNew(),
      shown: modules.has('production'),
    },
    { key: 'meals', icon: Utensils, to: paths.plan(), shown: modules.has('meals') },
    // Revenue without dishes (the till's total) is how a kitchen with numbers but no sales of
    // dishes enters what it took.
    modules.has('sales')
      ? { key: 'sales', icon: ChartColumn, to: paths.sales() }
      : { key: 'revenue', icon: ChartColumn, to: paths.sales(), shown: modules.has('numbers') },
    { key: 'count', icon: ClipboardCheck, to: paths.count() },
  ];
  const create: Way[] = [
    { key: 'article', icon: Tags, to: paths.articleNew() },
    { key: 'recipe', icon: BookOpen, to: paths.recipeNew() },
  ];

  const rows = (ways: Way[]) =>
    ways
      .filter((way) => way.shown !== false)
      .map((way) => {
        const words = t.rows[way.key];
        return (
          <ListRow
            key={way.key}
            title={words.title}
            subtitle={way.text ?? (typeof words.text === 'string' ? words.text : undefined)}
            icon={way.icon}
            to={way.to}
          />
        );
      });

  return (
    <div className="md:max-w-2xl">
      <PageHeader title={t.title} subtitle={t.subtitle} />
      <div className="space-y-8">
        <Section title={t.book} titleStyle="group">
          <GroupedList>{rows(book)}</GroupedList>
        </Section>
        <Section title={t.create} titleStyle="group">
          <GroupedList>{rows(create)}</GroupedList>
        </Section>
      </div>
    </div>
  );
}
