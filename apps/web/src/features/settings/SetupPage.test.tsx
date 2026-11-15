import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { renderApp } from '../../app/test-helpers';
import { readDetailed } from '../../app/view';
import { SetupPage } from './SetupPage';

afterEach(() => {
  window.localStorage.clear();
});

describe('Randen einrichten (ADR-0015)', () => {
  it('sets up a kebab shop that buys at the cash & carry, one question per screen', async () => {
    const { user, t } = await renderApp(<SetupPage />, {
      route: '/setup',
      routes: [{ path: '/', element: <p>Cockpit</p> }],
    });
    await user.click(await screen.findByRole('button', { name: 'Einrichten' }));
    expect(screen.getByText('Schritt 1 von 5')).toBeTruthy();
    await user.click(screen.getByRole('radio', { name: /Imbiss und Take-away/ }));
    // A counter is asked where its guests eat: one step more.
    expect(screen.getByText('Schritt 1 von 6')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Weiter' }));

    // The kind proposes where the goods come from: a counter fetches them itself.
    const pickup = screen.getByRole('checkbox', { name: /Ich hole sie selbst/ });
    expect((pickup as HTMLInputElement).checked).toBe(true);
    expect(screen.queryByRole('group', { name: /im Voraus/ })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Weiter' }));

    await user.click(screen.getByRole('radio', { name: 'Ich allein oder zu zweit' }));
    await user.click(screen.getByRole('button', { name: 'Weiter' }));
    await user.click(screen.getByRole('radio', { name: /Sie nehmen es mit/ }));
    await user.click(screen.getByRole('button', { name: 'Weiter' }));

    const name = screen.getByRole('textbox', { name: /Name des Betriebs/ });
    await user.clear(name);
    await user.type(name, 'Imbiss am Bach');
    await user.click(screen.getByRole('button', { name: 'Weiter' }));

    expect(screen.getByRole('heading', { name: 'Das richtet Randen für dich ein' })).toBeTruthy();
    expect(screen.getByRole('switch', { name: /Einkauf im Markt/ })).toBeTruthy();
    expect(screen.queryByRole('switch', { name: /Bestellen bei Lieferanten/ })).toBeTruthy();
    expect(
      screen.getByRole<HTMLInputElement>('switch', { name: /Bestellen bei Lieferanten/ }).checked,
    ).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Fertig' }));

    expect(await screen.findByText('Cockpit')).toBeTruthy();
    const business = await t.storage.businesses.get(t.businessId);
    expect(business).toMatchObject({
      kind: 'takeaway',
      name: 'Imbiss am Bach',
      modules: ['menu_card', 'market'],
      defaultVatBps: 260,
    });
    expect(readDetailed()).toBe(false);
  });

  it('asks about orders only for delivered goods and needs at least one answer', async () => {
    const { user } = await renderApp(<SetupPage />, { route: '/setup' });
    await user.click(await screen.findByRole('button', { name: 'Einrichten' }));
    await user.click(screen.getByRole('radio', { name: /Personalrestaurant und Kantine/ }));
    await user.click(screen.getByRole('button', { name: 'Weiter' }));
    expect(screen.getByRole('group', { name: /im Voraus/ })).toBeTruthy();
    await user.click(screen.getByRole('checkbox', { name: /Sie wird mir geliefert/ }));
    expect(screen.queryByRole('group', { name: /im Voraus/ })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Weiter' }));
    expect(screen.getByText('Wähle mindestens eine Antwort.')).toBeTruthy();
    // No question about where guests eat for a canteen: five steps.
    expect(screen.getByText('Schritt 2 von 5')).toBeTruthy();
  });
});
