import { Plus } from 'lucide-react';
import { Link, Outlet, useLocation } from 'react-router';
import { useBusiness } from './hooks';
import { messages } from './messages';
import { activeItem, businessNavItem, navGroups, tabItems, type NavItem } from './nav';
import { paths } from './paths';

const sideItems: readonly NavItem[] = [
  ...navGroups.flatMap((group) => group.items),
  businessNavItem,
];

/**
 * One entry of the side navigation. From 1024 px it is a row with icon and label; between 768
 * and 1024 px (iPad upright) the same link is a tile of the rail: icon above a small label.
 */
function SideLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      aria-current={active ? 'page' : undefined}
      className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-1 text-center text-[0.6875rem] leading-tight transition-colors select-none [-webkit-touch-callout:none] lg:min-h-11 lg:flex-row lg:justify-start lg:gap-3 lg:px-3 lg:text-left lg:text-[0.9375rem] ${
        active
          ? 'bg-wine-700 font-semibold text-white'
          : 'font-medium text-mist hover:bg-white/8 hover:text-white'
      }`}
    >
      <Icon size={20} strokeWidth={active ? 2 : 1.75} aria-hidden="true" className="shrink-0" />
      <span className="hyphens-calm">{item.label}</span>
    </Link>
  );
}

/**
 * The frame of the app on its three devices (ADR-0013):
 * - iPhone (below 768 px): five tabs at the bottom, the rest hangs off «Mehr».
 * - iPad upright (768 to 1023 px): a narrow rail in Traube with every area one tap away, so the
 *   content keeps its width for tables.
 * - iPad on its side and the web (from 1024 px): the full sidebar with groups.
 * No brand bar over the content: the large title leads each page. Safe areas of the device
 * (notch, home indicator, rounded corners) are padded everywhere.
 */
export function AppShell() {
  const { pathname } = useLocation();
  const business = useBusiness();
  const activeSide = activeItem(pathname, sideItems);
  const activeTab = activeItem(pathname, tabItems);

  return (
    <div className="min-h-dvh md:pl-24 lg:pl-64">
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-xl focus:bg-surface focus:px-4 focus:py-3 focus:shadow-float"
      >
        {messages.skipToContent}
      </a>

      <nav
        aria-label={messages.navLabel}
        className="fixed inset-y-0 left-0 z-20 hidden w-24 flex-col bg-grape px-2 pt-[calc(0.875rem+env(safe-area-inset-top))] pb-[calc(0.5rem+env(safe-area-inset-bottom))] pl-[calc(0.5rem+env(safe-area-inset-left))] md:flex lg:w-64 lg:px-3 print:hidden"
      >
        <Link
          to={paths.cockpit()}
          aria-label={messages.appName}
          className="mb-2.5 flex items-center justify-center gap-3 rounded-xl py-1 lg:justify-start lg:px-3"
        >
          <img src="/icon.svg" alt="" className="h-10 w-10 rounded-[0.65rem] lg:h-9 lg:w-9" />
          <span className="hidden min-w-0 lg:block">
            <span className="block text-lg leading-tight font-semibold text-white">
              {messages.appName}
            </span>
            <span className="block truncate text-xs text-cork">{business.name}</span>
          </span>
        </Link>

        {/* The one main action, as the ＋ tab on the phone: capture something. */}
        <Link
          to={paths.add()}
          aria-current={pathname === paths.add() ? 'page' : undefined}
          className="mb-2.5 flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-cork font-semibold text-wine-900 transition-colors select-none hover:bg-white"
        >
          <Plus size={20} strokeWidth={2.25} aria-hidden="true" />
          <span className="sr-only lg:not-sr-only">{messages.nav.add}</span>
        </Link>

        <div className="-mx-1 flex-1 space-y-2 overflow-y-auto px-1 lg:space-y-2.5">
          {navGroups.map((group, index) => (
            <div key={group.id}>
              {group.label === undefined ? null : (
                <p className="hidden px-3 pb-0.5 text-[0.6875rem] font-semibold tracking-wider text-mist/70 uppercase lg:block">
                  {group.label}
                </p>
              )}
              {index > 0 ? <hr className="mx-3 mb-2 border-white/10 lg:hidden" /> : null}
              <ul className="space-y-0.5">
                {group.items.map((item) => (
                  <li key={item.to}>
                    <SideLink item={item} active={item.to === activeSide} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="shrink-0 pt-1.5">
          <SideLink item={businessNavItem} active={businessNavItem.to === activeSide} />
        </div>
      </nav>

      {/* Content scrolls under a frosted strip behind the status bar of the phone. */}
      <div
        aria-hidden="true"
        className="sticky top-0 z-10 h-[env(safe-area-inset-top)] bg-ground/80 backdrop-blur print:hidden"
      />

      <main
        id="content"
        className="mx-auto max-w-xl px-4 pt-5 pr-[max(1rem,env(safe-area-inset-right))] pb-32 pl-[max(1rem,env(safe-area-inset-left))] md:max-w-3xl md:px-6 md:pb-16 lg:max-w-6xl lg:px-8 lg:pt-8 print:max-w-none print:p-0"
      >
        <Outlet />
      </main>

      <nav
        aria-label={messages.navLabel}
        className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden print:hidden"
      >
        <ul className="mx-auto flex max-w-xl">
          {tabItems.map(({ to, label, icon: Icon, primary = false }) => {
            const isActive = to === activeTab;
            return (
              <li key={to} className="flex-1">
                <Link
                  to={to}
                  aria-current={isActive ? 'page' : undefined}
                  className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl text-xs transition-colors select-none [-webkit-touch-callout:none] ${
                    isActive ? 'font-semibold text-wine-800' : 'font-medium text-ink-muted'
                  }`}
                >
                  <span
                    className={`flex h-8 items-center justify-center rounded-full transition-colors ${
                      primary
                        ? 'w-12 bg-wine-700 text-white'
                        : `w-14 ${isActive ? 'bg-wine-100' : ''}`
                    }`}
                  >
                    <Icon
                      size={22}
                      strokeWidth={primary ? 2.5 : isActive ? 2 : 1.75}
                      aria-hidden="true"
                    />
                  </span>
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
