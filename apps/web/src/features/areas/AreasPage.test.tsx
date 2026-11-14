import { alive } from '@randen/core';
import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useLocation } from 'react-router';
import { renderApp } from '../../app/test-helpers';
import { ToastProvider } from '../../ui/Toast';
import { AreasPage } from './AreasPage';
import { areasMessages } from './messages';

const t = areasMessages;

/** Where the page led: the address, for the routes the page links to. */
function Address() {
  const location = useLocation();
  return <p>Adresse: {`${location.pathname}${location.search}`}</p>;
}

async function renderList() {
  return renderApp(
    <ToastProvider>
      <AreasPage />
    </ToastProvider>,
    {
      route: '/areas',
      path: '/areas',
      routes: [
        { path: '/areas/where', element: <Address /> },
        { path: '/areas/tour', element: <Address /> },
        { path: '/areas/:areaId', element: <Address /> },
      ],
    },
  );
}

describe('AreasPage', () => {
  it('shows the areas as cards with spots, articles and the value of their lots', async () => {
    const { kitchen } = await renderList();
    expect(await screen.findByRole('heading', { level: 1, name: t.title })).toBeTruthy();
    const cold = await screen.findByRole('link', { name: /Kühlzelle.*1 Platz/ });
    expect(cold.getAttribute('href')).toBe(`/areas/${kitchen.areas.cold.id}`);
    expect(within(cold).getByText('1 Platz · 6 Artikel')).toBeTruthy();
    // Six lots in the cold room, worth CHF 411.20 (see the tests of the core).
    expect(within(cold).getByText('6 Chargen · CHF 411.20')).toBeTruthy();
    expect(within(cold).getByText('0 bis 5 °C · Richtwert')).toBeTruthy();
    const frozen = screen.getByRole('link', { name: /Tiefkühlzelle/ });
    expect(within(frozen).getByText('höchstens -18 °C · Richtwert')).toBeTruthy();
    expect(within(frozen).getByText(t.list.noStock)).toBeTruthy();
    expect(screen.getByText('3 Lagerbereiche · 2 Plätze, 0 mit Foto')).toBeTruthy();
    expect(screen.getByRole('link', { name: t.list.tour }).getAttribute('href')).toBe(
      '/areas/tour',
    );
  });

  it('opens the search with the typed text', async () => {
    const { user } = await renderList();
    await screen.findByRole('link', { name: /Kühlzelle/ });
    const search = screen.getByRole('searchbox', { name: t.list.search });
    await user.type(search, 'Rahm{Enter}');
    expect(await screen.findByText('Adresse: /areas/where?q=Rahm')).toBeTruthy();
  });

  it('creates an area in a sheet and opens it', async () => {
    const { user, t: context } = await renderList();
    await user.click(await screen.findByRole('button', { name: t.list.create }));
    const sheet = screen.getByRole('dialog', { name: t.form.titleCreate });
    // A new area starts as a cold room with the guideline range.
    expect(within(sheet).getByLabelText<HTMLInputElement>(t.form.min).value).toBe('0');
    expect(within(sheet).getByLabelText<HTMLInputElement>(t.form.max).value).toBe('5');
    expect(within(sheet).getByText(/Richtwert für Kühlzelle: 0 bis 5 °C/)).toBeTruthy();
    // A freezer brings its own guideline, as long as the range was not changed by hand.
    await user.selectOptions(within(sheet).getByLabelText(t.form.kind), 'Tiefkühlzelle');
    expect(within(sheet).getByLabelText<HTMLInputElement>(t.form.min).value).toBe('');
    expect(within(sheet).getByLabelText<HTMLInputElement>(t.form.max).value).toBe('-18');
    await user.selectOptions(within(sheet).getByLabelText(t.form.kind), 'Bar und Weinkeller');
    expect(within(sheet).getByLabelText<HTMLInputElement>(t.form.max).value).toBe('');
    expect(within(sheet).getByText(t.form.noProposalHint)).toBeTruthy();
    await user.type(within(sheet).getByLabelText(t.form.max), '12');
    await user.type(within(sheet).getByLabelText(t.form.name), 'Weinkeller');
    await user.click(within(sheet).getByRole('button', { name: t.form.save }));

    const address = await screen.findByText(/^Adresse: \/areas\//);
    const areas = alive(await context.storage.areas.ofBusiness(context.businessId));
    const cellar = areas.find((area) => area.name === 'Weinkeller');
    expect(cellar).toMatchObject({ kind: 'bar', maxDeciC: 120, sortOrder: 3 });
    expect(cellar).not.toHaveProperty('minDeciC');
    expect(address.textContent).toBe(`Adresse: /areas/${cellar?.id ?? ''}`);
  });

  it('says so when the name is taken, and when the range is upside down', async () => {
    const { user } = await renderList();
    await user.click(await screen.findByRole('button', { name: t.list.create }));
    const sheet = screen.getByRole('dialog', { name: t.form.titleCreate });
    await user.type(within(sheet).getByLabelText(t.form.name), 'kühlzelle');
    await user.click(within(sheet).getByRole('button', { name: t.form.save }));
    expect(await within(sheet).findByText(t.form.duplicate)).toBeTruthy();

    const min = within(sheet).getByLabelText(t.form.min);
    await user.clear(min);
    await user.type(min, '8');
    expect(within(sheet).getByText(t.form.upsideDown)).toBeTruthy();
  });

  it('changes the order of the areas', async () => {
    const { user, kitchen, t: context } = await renderList();
    await user.click(await screen.findByRole('button', { name: t.list.reorder }));
    const sheet = screen.getByRole('dialog', { name: t.reorder.title });
    expect(within(sheet).getByRole('button', { name: 'Nach oben, Kühlzelle' })).toHaveProperty(
      'disabled',
      true,
    );
    await user.click(within(sheet).getByRole('button', { name: 'Nach oben, Trockenlager' }));
    await user.click(within(sheet).getByRole('button', { name: 'Nach oben, Trockenlager' }));
    // At the top, «Nach oben» can no longer be used: the focus moves to «Nach unten».
    expect(document.activeElement).toBe(
      within(sheet).getByRole('button', { name: 'Nach unten, Trockenlager' }),
    );
    await user.click(within(sheet).getByRole('button', { name: 'Nach unten, Kühlzelle' }));
    await user.click(within(sheet).getByRole('button', { name: t.reorder.save }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    await waitFor(async () => {
      expect((await context.storage.areas.get(kitchen.areas.dry.id))?.sortOrder).toBe(0);
    });
    expect((await context.storage.areas.get(kitchen.areas.cold.id))?.sortOrder).toBe(2);
    await waitFor(() => {
      const names = screen
        .getAllByRole('link', { name: /zelle|lager/ })
        .map((link) => link.querySelector('.text-lg')?.textContent);
      expect(names).toEqual(['Trockenlager', 'Tiefkühlzelle', 'Kühlzelle']);
    });
  });

  it('says how many articles have no area yet', async () => {
    const { t: context, kitchen } = await renderList();
    await screen.findByRole('link', { name: /Kühlzelle/ });
    const withoutArea = { ...kitchen.articles.butter };
    Reflect.deleteProperty(withoutArea, 'areaId');
    await context.storage.articles.put(withoutArea);
    expect(await screen.findByText('1 Artikel ohne Lagerbereich.')).toBeTruthy();
    expect(screen.getByRole('link', { name: t.list.unplacedLink }).getAttribute('href')).toBe(
      '/articles',
    );
  });

  it('starts with one sentence and the one action when there is no area', async () => {
    const { t: context, kitchen } = await renderList();
    await screen.findByRole('link', { name: /Kühlzelle/ });
    const now = context.clock.now();
    for (const area of Object.values(kitchen.areas)) {
      await context.storage.areas.put({ ...area, deletedAt: now });
    }
    expect(await screen.findByText(t.list.emptyTitle)).toBeTruthy();
    expect(screen.getByText(t.list.emptyText)).toBeTruthy();
    expect(screen.getAllByRole('button', { name: t.list.create })).toHaveLength(1);
    expect(screen.queryByRole('link', { name: t.list.tour })).toBeNull();
  });
});
