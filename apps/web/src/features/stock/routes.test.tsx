import { matchRoutes, type RouteObject } from 'react-router';
import { describe, expect, it } from 'vitest';
import { paths } from '../../app/paths';
import { stockLinks } from './links';
import { stockRoutes } from './routes';

const ID = '018f4e9a-7b1c-7000-8000-000000000001';

/** The route an address of the app leads to, as the app frame mounts the pages. */
function routeOf(address: string): RouteObject | undefined {
  const [pathname = ''] = address.split('?');
  return matchRoutes([{ path: '/', children: stockRoutes }], pathname)?.at(-1)?.route;
}

describe('routes of «Lager»', () => {
  it('has a page for every address of the area', () => {
    const addresses = [
      paths.stock(),
      paths.stockExpiring(),
      paths.stockArticle(ID),
      paths.receive(),
      paths.receive(ID),
      paths.waste(),
      paths.waste(ID),
      paths.count(),
      paths.journal(),
      stockLinks.belowMin(),
      stockLinks.expiringGroup('today'),
      stockLinks.openingStock(),
    ];
    for (const address of addresses) {
      expect(routeOf(address), address).toBeDefined();
    }
    expect(routeOf('/stock/unbekannt')).toBeUndefined();
  });

  it('loads every page lazily, and each one brings a component', async () => {
    expect(stockRoutes).toHaveLength(7);
    for (const route of stockRoutes) {
      expect(typeof route.lazy, route.path).toBe('function');
      const loaded = await (route.lazy as () => Promise<{ Component?: unknown }>)();
      expect(typeof loaded.Component, route.path).toBe('function');
    }
  });

  it('builds the filtered addresses on the paths of the app', () => {
    expect(stockLinks.belowMin()).toBe('/stock?filter=below_min');
    expect(stockLinks.expiringGroup('soon')).toBe('/stock/expiring?group=soon');
    expect(stockLinks.openingStock()).toBe('/stock/receive?mode=opening');
  });
});
