import { Link, Outlet, useLocation } from 'react-router';
import { useBusiness } from './hooks';
import { messages } from './messages';
import { activeItem, businessNavItem, navGroups, tabItems, type NavItem } from './nav';
import { paths } from './paths';

const sidebarItems: readonly NavItem[] = [
  ...navGroups.flatMap((group) => group.items),
  businessNavItem,
];

function SidebarLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      aria-current={active ? 'page' : undefined}
      className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-[0.9375rem] transition-colors ${
        active
          ? 'bg-wine-700 font-semibold text-white'
          : 'font-medium text-mist hover:bg-white/8 hover:text-white'
      }`}
    >
      <Icon size={20} strokeWidth={active ? 2 : 1.75} aria-hidden="true" />
      {item.label}
    </Link>
  );
}

/**
 * The frame of the app. From 1024 px a dark sidebar shows every area (office, tablet on the
 * pass); below, five tabs sit at the bottom as on the iPhone and the rest hangs off «Mehr».
 * No brand bar over the content: the large title leads each page.
 */
export function AppShell() {
  const { pathname } = useLocation();
  const business = useBusiness();
  const activeSide = activeItem(pathname, sidebarItems);
  const activeTab = activeItem(pathname, tabItems);

  return (
    <div className="min-h-dvh lg:pl-64">
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-xl focus:bg-surface focus:px-4 focus:py-3 focus:shadow-float"
      >
        {messages.skipToContent}
      </a>

      <nav
        aria-label={messages.navLabel}
        className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col bg-onyx px-3 pt-[calc(1.25rem+env(safe-area-inset-top))] pb-4 lg:flex print:hidden"
      >
        <Link to={paths.cockpit()} className="mb-5 flex items-center gap-3 rounded-xl px-3 py-1">
          <img src="/icon.svg" alt="" className="h-9 w-9 rounded-[0.6rem]" />
          <span className="min-w-0">
            <span className="block text-lg leading-tight font-semibold text-white">
              {messages.appName}
            </span>
            <span className="block truncate text-xs text-mist">{business.name}</span>
          </span>
        </Link>
        <div className="flex-1 space-y-4 overflow-y-auto">
          {navGroups.map((group) => (
            <div key={group.id}>
              <p className="px-3 pb-1 text-[0.6875rem] font-semibold tracking-wider text-mist/70 uppercase">
                {group.label}
              </p>
              <ul className="space-y-0.5">
                {group.items.map((item) => (
                  <li key={item.to}>
                    <SidebarLink item={item} active={item.to === activeSide} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <SidebarLink item={businessNavItem} active={businessNavItem.to === activeSide} />
      </nav>

      {/* Content scrolls under a frosted strip behind the status bar of the phone. */}
      <div
        aria-hidden="true"
        className="sticky top-0 z-10 h-[env(safe-area-inset-top)] bg-ground/80 backdrop-blur print:hidden"
      />

      <main
        id="content"
        className="mx-auto max-w-xl px-4 pt-5 pb-32 md:max-w-3xl lg:max-w-6xl lg:px-8 lg:pt-8 lg:pb-16 print:max-w-none print:p-0"
      >
        <Outlet />
      </main>

      <nav
        aria-label={messages.navLabel}
        className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden print:hidden"
      >
        <ul className="mx-auto flex max-w-xl">
          {tabItems.map(({ to, label, icon: Icon, primary = false }) => {
            const isActive = to === activeTab;
            return (
              <li key={to} className="flex-1">
                <Link
                  to={to}
                  aria-current={isActive ? 'page' : undefined}
                  className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl text-xs transition-colors ${
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
