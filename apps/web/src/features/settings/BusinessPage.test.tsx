import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useLocation } from 'react-router';
import { renderApp } from '../../app/test-helpers';
import { BusinessPage } from './BusinessPage';

/** Where the page led after saving: the address of the Mehr page. */
function Address() {
  const location = useLocation();
  return <p>Adresse: {location.pathname}</p>;
}

async function renderBusiness() {
  return renderApp(<BusinessPage />, {
    route: '/more/business',
    path: '/more/business',
    routes: [{ path: '/more', element: <Address /> }],
  });
}

describe('Betrieb (H3)', () => {
  it('shows the business as it is stored: name, kind, target and VAT', async () => {
    await renderBusiness();
    expect(await screen.findByRole('heading', { level: 1, name: 'Betrieb' })).toBeTruthy();
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: /Name des Betriebs/ }).value).toBe(
      'Testküche',
    );
    expect(screen.getByRole<HTMLSelectElement>('combobox', { name: /Betriebsart/ }).value).toBe(
      'restaurant',
    );
    // 3000 basis points: 30 % Wareneinsatz is the target of the test kitchen.
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: /Ziel Wareneinsatz/ }).value).toBe(
      '30',
    );
    expect(screen.getByRole<HTMLSelectElement>('combobox', { name: /Mehrwertsteuer/ }).value).toBe(
      'standard',
    );
    expect(screen.getByText('CHF. Beträge rechnet Randen in ganzen Rappen.')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Randen einrichten/ }).getAttribute('href')).toBe(
      '/setup',
    );
  });

  it('saves the changed target and kind, and goes back to Mehr', async () => {
    const { user, t, router } = await renderBusiness();
    const target = await screen.findByRole('textbox', { name: /Ziel Wareneinsatz/ });
    await user.clear(target);
    await user.type(target, '35');
    await user.selectOptions(screen.getByRole('combobox', { name: /Betriebsart/ }), 'bistro');
    await user.click(screen.getByRole('button', { name: 'Sichern' }));
    expect(await screen.findByText('Adresse: /more')).toBeTruthy();
    expect(router.state.location.pathname).toBe('/more');
    const stored = await t.storage.businesses.get(t.businessId);
    expect(stored).toMatchObject({ targetFoodCostBps: 3500, kind: 'bistro', name: 'Testküche' });
  });

  it('asks for a VAT rate of its own when «Anderer Satz» is chosen, and stores it', async () => {
    const { user, t } = await renderBusiness();
    await screen.findByRole('combobox', { name: /Mehrwertsteuer/ });
    expect(screen.queryByRole('textbox', { name: /Anderer MWST-Satz/ })).toBeNull();
    await user.selectOptions(screen.getByRole('combobox', { name: /Mehrwertsteuer/ }), 'other');
    const own = screen.getByRole('textbox', { name: /Anderer MWST-Satz/ });
    await user.type(own, '2.6');
    await user.click(screen.getByRole('button', { name: 'Sichern' }));
    await waitFor(async () => {
      expect((await t.storage.businesses.get(t.businessId))?.defaultVatBps).toBe(260);
    });
  });

  it('does not save a target that is empty: the form says which field is missing', async () => {
    const { user, t } = await renderBusiness();
    const target = await screen.findByRole('textbox', { name: /Ziel Wareneinsatz/ });
    await user.clear(target);
    await user.click(screen.getByRole('button', { name: 'Sichern' }));
    expect(await screen.findByText(/Hier fehlt eine Angabe/)).toBeTruthy();
    expect((await t.storage.businesses.get(t.businessId))?.targetFoodCostBps).toBe(3000);
  });
});
