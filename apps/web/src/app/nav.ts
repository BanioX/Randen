import {
  BookOpen,
  CalendarDays,
  ChartColumn,
  CircleEllipsis,
  ClipboardList,
  CookingPot,
  LayoutDashboard,
  MapPin,
  Package,
  Plus,
  ShieldCheck,
  ShoppingCart,
  Tags,
  type LucideIcon,
} from 'lucide-react';
import { messages } from './messages';
import { paths } from './paths';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Further paths that belong to this entry, so it stays highlighted on its subpages. */
  also?: readonly string[];
  /** «Erfassen» is the main action on the phone: its icon sits in a filled circle. */
  primary?: boolean;
}

export interface NavGroup {
  id: string;
  /** No label: the group needs no heading (the cockpit stands alone). */
  label?: string;
  items: readonly NavItem[];
}

const t = messages.nav;

/**
 * The whole app in groups: the rail (iPad upright) and the sidebar (iPad on its side, web) show
 * them all, «Mehr» on the phone lists what the tab bar has no room for.
 */
export const navGroups: readonly NavGroup[] = [
  {
    id: 'overview',
    items: [{ to: paths.cockpit(), label: t.cockpit, icon: LayoutDashboard }],
  },
  {
    id: 'kitchen',
    label: t.groups.kitchen,
    items: [
      { to: paths.recipes(), label: t.recipes, icon: BookOpen },
      { to: paths.production(), label: t.production, icon: CookingPot },
      { to: paths.plan(), label: t.plan, icon: CalendarDays },
      { to: paths.menu(), label: t.menu, icon: ClipboardList },
    ],
  },
  {
    id: 'stock',
    label: t.groups.stock,
    items: [
      { to: paths.stock(), label: t.stock, icon: Package },
      { to: paths.purchasing(), label: t.purchasing, icon: ShoppingCart },
      { to: paths.areas(), label: t.areas, icon: MapPin },
      // Suppliers are master data next to the articles: reached from there, not a destination
      // of their own, so the whole navigation fits an iPad on its side without scrolling.
      { to: paths.articles(), label: t.articles, icon: Tags, also: [paths.suppliers()] },
    ],
  },
  {
    id: 'control',
    label: t.groups.control,
    items: [
      { to: paths.numbers(), label: t.numbers, icon: ChartColumn },
      { to: paths.haccp(), label: t.haccp, icon: ShieldCheck },
    ],
  },
];

/** The sidebar ends with the business itself: settings, team, data. */
export const businessNavItem: NavItem = {
  to: paths.more(),
  label: t.business,
  icon: CircleEllipsis,
};

/**
 * Five tabs on the phone, like on the iPhone: where you are, what is in the house, the one
 * main action in the middle, what you cook, and everything else.
 */
export const tabItems: readonly NavItem[] = [
  { to: paths.cockpit(), label: t.cockpit, icon: LayoutDashboard },
  { to: paths.stock(), label: t.stock, icon: Package },
  { to: paths.add(), label: t.add, icon: Plus, primary: true },
  { to: paths.recipes(), label: t.recipes, icon: BookOpen },
  {
    to: paths.more(),
    label: t.more,
    icon: CircleEllipsis,
    also: [
      paths.production(),
      paths.plan(),
      paths.menu(),
      paths.purchasing(),
      paths.areas(),
      paths.articles(),
      paths.suppliers(),
      paths.numbers(),
      paths.haccp(),
    ],
  },
];

const within = (path: string, base: string) =>
  base === '/' ? path === '/' : path === base || path.startsWith(`${base}/`);

/** The entry a page belongs to: the longest matching path wins. */
export function activeItem(path: string, items: readonly NavItem[]): string | undefined {
  const matches = items.flatMap(({ to, also = [] }) =>
    [to, ...also].filter((base) => within(path, base)).map((base) => ({ to, base })),
  );
  return matches.sort((a, b) => b.base.length - a.base.length)[0]?.to;
}
