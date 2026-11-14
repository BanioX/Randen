import { addDays, createStockLedger } from '@randen/core';
import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useLocation } from 'react-router';
import { renderApp, type AppView } from '../../app/test-helpers';
import { areasMessages } from './messages';
import { WherePage } from './WherePage';

const t = areasMessages.where;
const PHOTO = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';

function Address() {
  const location = useLocation();
  return <p>Adresse: {`${location.pathname}${location.search}`}</p>;
}

async function renderWhere(route = '/areas/where', prepare?: (view: AppView) => Promise<void>) {
  const view = await renderApp(<WherePage />, {
    route: '/',
    path: '/areas/where',
    routes: [{ path: '/', element: <p>Start</p> }],
  });
  await prepare?.(view);
  await view.router.navigate(route);
  return view;
}

/** The card of an article found, by its heading. */
async function hit(name: string) {
  const heading = await screen.findByRole('heading', { level: 3, name });
  const card = heading.closest('li');
  if (card === null) {
    throw new Error(`No hit «${name}»`);
  }
  return card;
}

describe('WherePage', () => {
  it('starts with the cursor in the field and every area with its spots', async () => {
    const { kitchen } = await renderWhere();
    const search = await screen.findByRole('searchbox', { name: t.search });
    await waitFor(() => {
      expect(document.activeElement).toBe(search);
    });
    expect(screen.getByText(t.startHint)).toBeTruthy();
    const cold = await screen.findByRole('region', { name: 'Kühlzelle' });
    const drawer = within(cold).getByRole('link', { name: /Schublade Fleisch/ });
    expect(drawer.getAttribute('href')).toBe(`/areas/${kitchen.areas.cold.id}`);
    expect(within(drawer).getByText('1 Artikel')).toBeTruthy();
    const frozen = screen.getByRole('region', { name: 'Tiefkühlzelle' });
    expect(within(frozen).getByText(t.wholeArea)).toBeTruthy();
    expect(within(frozen).getByText('Noch keine Plätze · 0 Artikel')).toBeTruthy();
  });

  it('finds «Vollrahm» by «rahm» while typing, and keeps the text in the address', async () => {
    const { user, router } = await renderWhere();
    await user.type(await screen.findByRole('searchbox', { name: t.search }), 'rahm');
    const cream = await hit('Vollrahm');
    expect(within(cream).getByText('Kühlzelle, ohne festen Platz')).toBeTruthy();
    expect(within(cream).getByText('8 l an Lager')).toBeTruthy();
    expect(within(cream).getByText(t.noSpot)).toBeTruthy();
    expect(
      within(cream).getByRole('link', { name: 'Platz eintragen, Vollrahm' }).getAttribute('href'),
    ).toMatch(/^\/articles\/.+\/edit$/);
    expect(within(cream).getByRole('link', { name: 'Kühlzelle öffnen' })).toBeTruthy();
    expect(router.state.location.search).toBe('?q=rahm');
  });

  it('finds «Rindsentrecôte» by «entrecote» with the photo of its spot, large on a tap', async () => {
    const { user } = await renderWhere('/areas/where?q=entrecote', async (view) => {
      await view.t.storage.spots.put({
        ...view.kitchen.spots.meatDrawer,
        note: 'Unterste Schublade links',
        photo: PHOTO,
      });
    });
    const entrecote = await hit('Rindsentrecôte');
    expect(within(entrecote).getByText('Kühlzelle · Schublade Fleisch')).toBeTruthy();
    expect(within(entrecote).getByText('Unterste Schublade links')).toBeTruthy();
    expect(within(entrecote).getByText('4 kg an Lager')).toBeTruthy();
    await user.click(
      within(entrecote).getByRole('button', {
        name: 'Schublade Fleisch, Kühlzelle gross anzeigen',
      }),
    );
    const viewer = screen.getByRole('dialog', { name: 'Schublade Fleisch, Kühlzelle' });
    expect(within(viewer).getByRole('img').getAttribute('src')).toBe(PHOTO);
    await user.click(within(viewer).getByRole('button', { name: 'Schliessen' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    // The spot is a hit of its own only when its name matches: here it does not.
    expect(screen.queryByRole('region', { name: t.spots })).toBeNull();
  });

  it('says where the stock lies right now when it is not where it belongs', async () => {
    await renderWhere('/areas/where?q=entrecote', async ({ t: context, kitchen }) => {
      const ledger = createStockLedger(context.ctx);
      await context.storage.transaction(() =>
        ledger.receive({
          businessId: context.businessId,
          articleId: kitchen.articles.entrecote.id,
          areaId: kitchen.areas.frozen.id,
          quantity: 1500,
          pricePer1000: 6200,
          receivedOn: context.clock.today(),
          expiresOn: addDays(context.clock.today(), 90),
          origin: 'purchase',
        }),
      );
    });
    const entrecote = await hit('Rindsentrecôte');
    expect(within(entrecote).getByText('5.5 kg an Lager')).toBeTruthy();
    expect(
      within(entrecote).getByText('Liegt gerade: Kühlzelle 4 kg, Tiefkühlzelle 1.5 kg'),
    ).toBeTruthy();
  });

  it('finds spots and areas by their names', async () => {
    const { kitchen } = await renderWhere('/areas/where?q=k%C3%BChl');
    const areas = await screen.findByRole('region', { name: t.areas });
    const links = within(areas).getAllByRole('link');
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      `/areas/${kitchen.areas.cold.id}`,
      `/areas/${kitchen.areas.frozen.id}`,
    ]);
    const cold = within(areas).getByRole('link', { name: /^Kühlzelle/ });
    expect(within(cold).getByText('1 Platz · 6 Artikel')).toBeTruthy();
  });

  it('says calmly that nothing is found, and where a place is set', async () => {
    await renderWhere('/areas/where?q=Safran');
    expect(await screen.findByText(t.noHits('Safran'))).toBeTruthy();
    expect(screen.getByText(t.noHitsHint)).toBeTruthy();
    expect(screen.getByRole('link', { name: t.toArticles }).getAttribute('href')).toBe('/articles');
  });

  it('goes back to the areas', async () => {
    const view = await renderApp(<WherePage />, {
      route: '/areas/where',
      path: '/areas/where',
      routes: [{ path: '/areas', element: <Address /> }],
    });
    await view.user.click(await screen.findByRole('link', { name: /Wo ist was\?/ }));
    expect(await screen.findByText('Adresse: /areas')).toBeTruthy();
  });
});
