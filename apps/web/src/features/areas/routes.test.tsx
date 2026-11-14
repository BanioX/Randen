import { matchRoutes, type RouteObject } from 'react-router';
import { describe, expect, it } from 'vitest';
import { paths } from '../../app/paths';
import { areasRoutes } from './routes';
import { areaLinks } from './shared';

const ID = '018f4e9a-7b1c-7000-8000-000000000001';

/** The route an address of the app leads to, as the app frame mounts the pages. */
function routeOf(address: string): RouteObject | undefined {
  const [pathname = ''] = address.split('?');
  return matchRoutes([{ path: '/', children: areasRoutes }], pathname)?.at(-1)?.route;
}

describe('routes of «Wo ist was?»', () => {
  it('has a page for every address of the area', () => {
    const addresses = [
      paths.areas(),
      paths.area(ID),
      paths.where(),
      paths.tour(),
      areaLinks.where('Rahm'),
      areaLinks.where('  '),
      areaLinks.editSpot(ID, ID),
      areaLinks.newSpot(ID),
      areaLinks.tourStep(3),
    ];
    for (const address of addresses) {
      expect(routeOf(address), address).toBeDefined();
    }
    // The fixed pages win over an area id.
    expect(routeOf(paths.where())?.path).toBe('areas/where');
    expect(routeOf(paths.tour())?.path).toBe('areas/tour');
    expect(routeOf(`${paths.area(ID)}/unbekannt`)).toBeUndefined();
  });

  it('keeps typed text whole in the address', () => {
    expect(areaLinks.where(' Crème & Rahm ')).toBe('/areas/where?q=Cr%C3%A8me%20%26%20Rahm');
    expect(areaLinks.where('')).toBe('/areas/where');
  });

  it('loads every page lazily, and each one brings a component', async () => {
    expect(areasRoutes).toHaveLength(4);
    for (const route of areasRoutes) {
      expect(typeof route.lazy, route.path).toBe('function');
      const lazy = route.lazy as () => Promise<{ Component?: unknown }>;
      expect(typeof (await lazy()).Component, route.path).toBe('function');
    }
  });
});
