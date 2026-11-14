import { screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AppShell } from '../../app/AppShell';
import { ESSENTIALS, writeExtras } from '../../app/extras';
import { renderApp } from '../../app/test-helpers';
import { FeaturesPage } from './FeaturesPage';
import { MorePage } from './MorePage';

afterEach(() => {
  window.localStorage.clear();
});

describe('Funktionen (ADR-0014)', () => {
  it('shows the essentials first and the extras once «Erweitert» is on', async () => {
    writeExtras(ESSENTIALS);
    const { user } = await renderApp(<FeaturesPage />, { route: '/more/features' });
    expect(await screen.findByRole('heading', { level: 1, name: 'Funktionen' })).toBeTruthy();
    expect(screen.queryByRole('switch', { name: /Produktion und Menüplan/ })).toBeNull();
    await user.click(screen.getByRole('switch', { name: /Erweitert/ }));
    const production = await screen.findByRole('switch', { name: /Produktion und Menüplan/ });
    expect((production as HTMLInputElement).checked).toBe(true);
    await user.click(production);
    expect(JSON.parse(window.localStorage.getItem('randen:extras') ?? '{}')).toMatchObject({
      on: true,
      groups: { production: false, numbers: true },
    });
  });

  it('hides the extras from the navigation and from «Mehr» while they are off', async () => {
    writeExtras(ESSENTIALS);
    await renderApp(<AppShell />, {
      route: '/more',
      routes: [],
    });
    const [sidebar] = await screen.findAllByRole('navigation', { name: 'Hauptnavigation' });
    if (sidebar === undefined) {
      throw new Error('Expected the side navigation');
    }
    expect(within(sidebar).getByRole('link', { name: 'Lager' })).toBeTruthy();
    expect(within(sidebar).queryByRole('link', { name: 'Produktion' })).toBeNull();
    expect(within(sidebar).queryByRole('link', { name: 'Zahlen' })).toBeNull();
    expect(within(sidebar).queryByRole('link', { name: 'Wo ist was?' })).toBeNull();
  });

  it('lists on «Mehr» what the tab bar has no room for', async () => {
    await renderApp(<MorePage />, { route: '/more' });
    expect(await screen.findByRole('link', { name: 'Speisekarte' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Zahlen' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Rezepte' })).toBeNull();
    expect(screen.getByRole('link', { name: /Funktionen/ })).toBeTruthy();
  });
});
