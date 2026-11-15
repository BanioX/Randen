import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AppShell } from '../../app/AppShell';
import { renderApp } from '../../app/test-helpers';
import { writeDetailed } from '../../app/view';
import { FeaturesPage } from './FeaturesPage';
import { MorePage } from './MorePage';

afterEach(() => {
  window.localStorage.clear();
});

const sideNav = async () => {
  const [sidebar] = await screen.findAllByRole('navigation', { name: 'Hauptnavigation' });
  if (sidebar === undefined) {
    throw new Error('Expected the side navigation');
  }
  return sidebar;
};

describe('Funktionen (ADR-0015)', () => {
  it('switches a function of the business and keeps the view of the device apart', async () => {
    const { user, t } = await renderApp(<FeaturesPage />, { route: '/more/features' });
    expect(await screen.findByRole('heading', { level: 1, name: 'Funktionen' })).toBeTruthy();
    // A business from before the setup on a detailed device: every function is on.
    const market = screen.getByRole('switch', { name: /Einkauf im Markt/ });
    expect((market as HTMLInputElement).checked).toBe(true);
    await user.click(market);
    await expect
      .poll(async () => (await t.storage.businesses.get(t.businessId))?.modules)
      .not.toContain('market');
    await waitFor(() => {
      expect(
        screen.getByRole<HTMLInputElement>('switch', { name: /Einkauf im Markt/ }).checked,
      ).toBe(false);
    });

    await user.click(screen.getByRole('switch', { name: /Erweitert/ }));
    expect(JSON.parse(window.localStorage.getItem('randen:extras') ?? '{}')).toEqual({ on: false });
    // The view changes nothing in the business.
    expect((await t.storage.businesses.get(t.businessId))?.modules).toContain('production');
  });

  it('switches off what needs a function together with it', async () => {
    const { user, t } = await renderApp(<FeaturesPage />, { route: '/more/features' });
    await user.click(await screen.findByRole('switch', { name: /^Produktion/ }));
    await expect
      .poll(async () => (await t.storage.businesses.get(t.businessId))?.modules)
      .not.toContain('dispatch');
  });

  it('shows a new business only the essentials until its setup', async () => {
    writeDetailed(false);
    await renderApp(<AppShell />, { route: '/more', routes: [] });
    const sidebar = await sideNav();
    expect(within(sidebar).getByRole('link', { name: 'Lager' })).toBeTruthy();
    expect(within(sidebar).getByRole('link', { name: 'Einkauf' })).toBeTruthy();
    expect(within(sidebar).queryByRole('link', { name: 'Produktion' })).toBeNull();
    expect(within(sidebar).queryByRole('link', { name: 'Zahlen' })).toBeNull();
    expect(within(sidebar).queryByRole('link', { name: 'Wo ist was?' })).toBeNull();
  });

  it('follows the functions of the business in the navigation and on the tabs', async () => {
    const { t } = await renderApp(<AppShell />, { route: '/more', routes: [] });
    await t.useCases['business.update']({
      commandId: t.cmd(),
      businessId: t.businessId,
      modules: ['menu_card', 'market'],
    });
    const sidebar = await sideNav();
    await expect.poll(() => within(sidebar).queryByRole('link', { name: 'Zahlen' })).toBeNull();
    expect(within(sidebar).getByRole('link', { name: 'Einkauf' })).toBeTruthy();
    // With the market, the shopping list is the fourth tab on the phone.
    const tabs = screen.getAllByRole('navigation', { name: 'Hauptnavigation' }).at(-1);
    if (tabs === undefined) {
      throw new Error('Expected the tab bar');
    }
    expect(
      within(tabs)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Cockpit', 'Lager', 'Erfassen', 'Einkauf', 'Mehr']);
  });

  it('lists on «Mehr» what the tab bar has no room for', async () => {
    await renderApp(<MorePage />, { route: '/more' });
    expect(await screen.findByRole('link', { name: 'Speisekarte' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Zahlen' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Rezepte' })).toBeNull();
    expect(screen.getByRole('link', { name: /Funktionen/ })).toBeTruthy();
  });
});
