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
  Truck,
  type LucideIcon,
} from 'lucide-react';
import type { ModuleId } from '@randen/core';
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
  /**
   * The functions this entry belongs to (ADR-0015): shown while the business uses at least one
   * of them. Without: the core, always there.
   */
  modules?: readonly ModuleId[];
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
      { to: paths.production(), label: t.production, icon: CookingPot, modules: ['production'] },
      { to: paths.plan(), label: t.plan, icon: CalendarDays, modules: ['planning'] },
      { to: paths.dispatch(), label: t.dispatch, icon: Truck, modules: ['dispatch'] },
      { to: paths.menu(), label: t.menu, icon: ClipboardList, modules: ['menu_card'] },
    ],
  },
  {
    id: 'stock',
    label: t.groups.stock,
    items: [
      { to: paths.stock(), label: t.stock, icon: Package },
      {
        to: paths.purchasing(),
        label: t.purchasing,
        icon: ShoppingCart,
        modules: ['ordering', 'market'],
      },
      { to: paths.areas(), label: t.areas, icon: MapPin, modules: ['places'] },
      // Suppliers are master data next to the articles: reached from there, not a destination
      // of their own, so the whole navigation fits an iPad on its side without scrolling.
      { to: paths.articles(), label: t.articles, icon: Tags, also: [paths.suppliers()] },
    ],
  },
  {
    id: 'control',
    label: t.groups.control,
    items: [
      {
        to: paths.numbers(),
        label: t.numbers,
        icon: ChartColumn,
        modules: ['numbers', 'sales', 'meals'],
      },
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

const navPaths = [...navGroups.flatMap((group) => group.items.map((item) => item.to))];

const recipesTab: NavItem = { to: paths.recipes(), label: t.recipes, icon: BookOpen };
const purchasingTab: NavItem = { to: paths.purchasing(), label: t.purchasing, icon: ShoppingCart };

/**
 * Five tabs on the phone, like on the iPhone: where you are, what is in the house, the one
 * main action in the middle, what you cook, and everything else. A kitchen that fetches its
 * goods itself and orders nothing ahead (ADR-0015) gets its shopping list as the fourth tab
 * instead: it is open in the hand while walking through the halls, the recipes move to «Mehr».
 */
export function tabItemsFor(modules: ReadonlySet<ModuleId>): readonly NavItem[] {
  const fourth = modules.has('market') && !modules.has('ordering') ? purchasingTab : recipesTab;
  const shown = new Set([paths.cockpit(), paths.stock(), paths.add(), fourth.to]);
  return [
    { to: paths.cockpit(), label: t.cockpit, icon: LayoutDashboard },
    { to: paths.stock(), label: t.stock, icon: Package },
    { to: paths.add(), label: t.add, icon: Plus, primary: true },
    fourth,
    {
      to: paths.more(),
      label: t.more,
      icon: CircleEllipsis,
      also: [...navPaths.filter((to) => !shown.has(to)), paths.suppliers()],
    },
  ];
}

/** The tabs of a kitchen without the market: the usual five. */
export const tabItems: readonly NavItem[] = tabItemsFor(new Set());

/** The groups of the navigation with the functions in use (ADR-0015); empty groups drop out. */
export function visibleNavGroups(modules: ReadonlySet<ModuleId>): NavGroup[] {
  return navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) => item.modules === undefined || item.modules.some((id) => modules.has(id)),
      ),
    }))
    .filter((group) => group.items.length > 0);
}

const within = (path: string, base: string) =>
  base === '/' ? path === '/' : path === base || path.startsWith(`${base}/`);

/** The entry a page belongs to: the longest matching path wins. */
export function activeItem(path: string, items: readonly NavItem[]): string | undefined {
  const matches = items.flatMap(({ to, also = [] }) =>
    [to, ...also].filter((base) => within(path, base)).map((base) => ({ to, base })),
  );
  return matches.sort((a, b) => b.base.length - a.base.length)[0]?.to;
}
