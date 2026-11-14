import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AppShell } from './AppShell';
import { navGroups, tabItems, activeItem } from './nav';
import { routes } from './routes';
import { renderApp } from './test-helpers';

describe('AppShell', () => {
  it('offers every area in the side navigation and five tabs on the phone', async () => {
    await renderApp(<AppShell />, { route: '/' });
    const [sidebar, tabs] = await screen.findAllByRole('navigation', { name: 'Hauptnavigation' });
    if (sidebar === undefined || tabs === undefined) {
      throw new Error('Expected a sidebar and a tab bar');
    }
    for (const item of navGroups.flatMap((group) => group.items)) {
      expect(within(sidebar).getByRole('link', { name: item.label })).toHaveProperty(
        'pathname',
        item.to,
      );
    }
    expect(within(sidebar).getByText('Testküche')).toBeTruthy();
    // The one main action is one tap away on the iPad and in the browser too.
    expect(within(sidebar).getByRole('link', { name: 'Erfassen' })).toHaveProperty(
      'pathname',
      '/add',
    );
    expect(
      within(tabs)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(tabItems.map((item) => item.label));
  });

  it('marks the area a page belongs to', async () => {
    await renderApp(<AppShell />, { route: '/stock/receive' });
    const [sidebar, tabs] = await screen.findAllByRole('navigation', { name: 'Hauptnavigation' });
    if (sidebar === undefined || tabs === undefined) {
      throw new Error('Expected a sidebar and a tab bar');
    }
    expect(within(sidebar).getByRole('link', { name: 'Lager' }).getAttribute('aria-current')).toBe(
      'page',
    );
    expect(within(tabs).getByRole('link', { name: 'Lager' }).getAttribute('aria-current')).toBe(
      'page',
    );
  });
});

describe('navigation', () => {
  it('counts pages without a tab of their own to «Mehr»', () => {
    expect(activeItem('/numbers/sales', tabItems)).toBe('/more');
    expect(activeItem('/recipes/abc', tabItems)).toBe('/recipes');
    expect(activeItem('/', tabItems)).toBe('/');
    expect(activeItem('/unknown', tabItems)).toBeUndefined();
  });

  it('has a page for every entry', () => {
    const shell = routes[0]?.children ?? [];
    const patterns = shell.map((route) => (route.index === true ? '' : (route.path ?? '')));
    const reachable = (to: string) => {
      const path = to.replace(/^\//, '');
      return patterns.some(
        (pattern) => pattern === path || (pattern.endsWith('/*') && path === pattern.slice(0, -2)),
      );
    };
    for (const item of [...navGroups.flatMap((group) => group.items), ...tabItems]) {
      expect(reachable(item.to), item.to).toBe(true);
    }
  });
});
