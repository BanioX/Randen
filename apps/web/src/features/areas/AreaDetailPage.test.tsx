import type { Id } from '@randen/core';
import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderApp, type AppView } from '../../app/test-helpers';
import { compressPhoto } from '../../ui/photo';
import type * as PhotoModule from '../../ui/photo';
import { ToastProvider } from '../../ui/Toast';
import { AreaDetailPage } from './AreaDetailPage';
import { areasMessages } from './messages';
import { TourPage } from './TourPage';

vi.mock('../../ui/photo', async (importOriginal) => {
  const original = await importOriginal<typeof PhotoModule>();
  return { ...original, compressPhoto: vi.fn(original.compressPhoto) };
});

const t = areasMessages.detail;
const PHOTO = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';

/** The detail page in the frame it needs: the list to go back to, the tour, the stock. */
async function renderArea(pick: (view: AppView) => Id, query = '') {
  const view = await renderApp(
    <ToastProvider>
      <AreaDetailPage />
    </ToastProvider>,
    {
      route: '/',
      path: '/areas/:areaId',
      routes: [
        { path: '/', element: <p>Start</p> },
        { path: '/areas', element: <p>Liste der Bereiche</p> },
        { path: '/areas/tour', element: <TourPage /> },
      ],
    },
  );
  const areaId = pick(view);
  await view.router.navigate(`/areas/${areaId}${query}`);
  return { ...view, areaId };
}

/** The card of a spot, found by its heading. */
async function spotCard(name: string) {
  const heading = await screen.findByRole('heading', { level: 3, name });
  const card = heading.closest('li');
  if (card === null) {
    throw new Error(`No card «${name}»`);
  }
  return card;
}

afterEach(() => {
  vi.mocked(compressPhoto).mockReset();
});

describe('AreaDetailPage', () => {
  it('shows the area, its spots with their articles, the rest and the lots', async () => {
    const { kitchen } = await renderArea((view) => view.kitchen.areas.cold.id);
    expect(await screen.findByRole('heading', { level: 1, name: 'Kühlzelle' })).toBeTruthy();
    expect(screen.getByText('0 bis 5 °C · Richtwert')).toBeTruthy();
    // Six lots worth CHF 411.20.
    expect(screen.getByText('411.20')).toBeTruthy();
    expect(screen.getByText('6 Chargen')).toBeTruthy();
    expect(screen.getByText('0 mit Foto')).toBeTruthy();
    expect(screen.getByText(t.unplacedCount(5))).toBeTruthy();

    const drawer = await spotCard('Schublade Fleisch');
    expect(within(drawer).getByRole('link', { name: 'Rindsentrecôte' }).getAttribute('href')).toBe(
      `/articles/${kitchen.articles.entrecote.id}`,
    );
    expect(within(drawer).getByText('4 kg')).toBeTruthy();
    expect(
      within(drawer).getByRole('button', { name: 'Foto hinzufügen, Schublade Fleisch' }),
    ).toBeTruthy();

    const rest = screen.getByRole('region', { name: t.unplacedTitle });
    expect(within(rest).getByText('Vollrahm')).toBeTruthy();
    expect(within(rest).getByText('8 l')).toBeTruthy();
    expect(within(rest).getByText(t.noStockHere)).toBeTruthy();

    const lots = screen.getByRole('table', { name: t.lotsCaption });
    const salmon = within(lots).getByRole('row', { name: /Lachsfilet/ });
    expect(within(salmon).getByText('1.5 kg')).toBeTruthy();
    expect(within(salmon).getByText(/morgen/)).toBeTruthy();
    expect(within(salmon).getByText('CHF 57.00')).toBeTruthy();
    expect(within(lots).getByText('Total 6 Chargen')).toBeTruthy();
    expect(within(lots).getByText('CHF 411.20')).toBeTruthy();
  });

  it('creates a spot with a photo from the phone, and the tour shows it', async () => {
    vi.mocked(compressPhoto).mockResolvedValue(PHOTO);
    const { user, router, t: context } = await renderArea((view) => view.kitchen.areas.cold.id);
    await user.click(await screen.findByRole('button', { name: t.addSpot }));
    const sheet = screen.getByRole('dialog', { name: areasMessages.spot.titleCreate });
    await user.type(within(sheet).getByLabelText(areasMessages.spot.name), 'Regal Milch');
    await user.type(within(sheet).getByLabelText(areasMessages.spot.note), 'Links, zweites Brett');
    await user.upload(
      within(sheet).getByLabelText('Foto aufnehmen, Foto des Platzes'),
      new File(['picture'], 'regal.jpg', { type: 'image/jpeg' }),
    );
    expect(
      await within(sheet).findByRole('button', { name: 'Foto des Platzes gross anzeigen' }),
    ).toBeTruthy();
    await user.click(within(sheet).getByRole('button', { name: areasMessages.spot.save }));

    const card = await spotCard('Regal Milch');
    expect(within(card).getByText('Links, zweites Brett')).toBeTruthy();
    expect(
      within(card).getByRole('button', { name: 'Regal Milch, Kühlzelle gross anzeigen' }),
    ).toBeTruthy();
    const spots = await context.storage.spots.ofBusiness(context.businessId);
    expect(spots.find((spot) => spot.name === 'Regal Milch')).toMatchObject({
      photo: PHOTO,
      sortOrder: 1,
    });

    // The tour: Schublade Fleisch, Regal Milch, the freezer, the shelf in the dry store.
    await router.navigate('/areas/tour?step=2');
    expect(await screen.findByRole('heading', { level: 2, name: 'Regal Milch' })).toBeTruthy();
    expect(screen.getByText('2 von 4')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Regal Milch, Kühlzelle gross anzeigen' }),
    ).toBeTruthy();
  });

  it('opens a spot from the address, saves a note and deletes it on request', async () => {
    const {
      user,
      kitchen,
      t: context,
    } = await renderArea((view) => view.kitchen.areas.cold.id, '?spot=unbekannt');
    // An unknown spot in the address opens nothing.
    expect(await screen.findByRole('heading', { level: 1, name: 'Kühlzelle' })).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();

    await user.click(
      within(await spotCard('Schublade Fleisch')).getByRole('button', {
        name: 'Bearbeiten, Schublade Fleisch',
      }),
    );
    const sheet = screen.getByRole('dialog', { name: areasMessages.spot.titleEdit });
    expect(within(sheet).getByLabelText<HTMLInputElement>('Name').value).toBe('Schublade Fleisch');
    await user.type(within(sheet).getByLabelText(areasMessages.spot.note), 'Ganz unten');
    await user.click(within(sheet).getByRole('button', { name: areasMessages.spot.save }));
    expect(await within(await spotCard('Schublade Fleisch')).findByText('Ganz unten')).toBeTruthy();
    expect((await context.storage.spots.get(kitchen.spots.meatDrawer.id))?.note).toBe('Ganz unten');

    await user.click(screen.getByRole('button', { name: 'Bearbeiten, Schublade Fleisch' }));
    await user.click(screen.getByRole('button', { name: areasMessages.spot.remove }));
    const confirm = screen.getByRole('alertdialog', { name: 'Schublade Fleisch löschen?' });
    expect(within(confirm).getByText(areasMessages.spot.removeText('1 Artikel'))).toBeTruthy();
    await user.click(within(confirm).getByRole('button', { name: areasMessages.spot.remove }));
    await waitFor(() => {
      expect(screen.queryByRole('heading', { level: 3, name: 'Schublade Fleisch' })).toBeNull();
    });
    expect(screen.getByText(t.spotsEmpty)).toBeTruthy();
    const rest = screen.getByRole('region', { name: t.unplacedTitle });
    expect(await within(rest).findByText('Rindsentrecôte')).toBeTruthy();
  });

  it('puts articles on a spot with a searchable list', async () => {
    const { user, kitchen, t: context } = await renderArea((view) => view.kitchen.areas.cold.id);
    await user.click(
      within(await spotCard('Schublade Fleisch')).getByRole('button', {
        name: 'Artikel zuweisen, Schublade Fleisch',
      }),
    );
    const sheet = screen.getByRole('dialog', { name: 'Artikel für Schublade Fleisch' });
    const entrecote = await within(sheet).findByRole('checkbox', { name: 'Rindsentrecôte' });
    expect(entrecote).toHaveProperty('checked', true);
    expect(within(sheet).getByText('1 Artikel angehakt')).toBeTruthy();
    await user.type(within(sheet).getByRole('searchbox', { name: 'Artikel suchen' }), 'rahm');
    expect(within(sheet).queryByRole('checkbox', { name: 'Rindsentrecôte' })).toBeNull();
    const cream = within(sheet).getByRole('checkbox', { name: 'Vollrahm' });
    expect(within(sheet).getByText('Kühlzelle, ohne Platz · 8 l')).toBeTruthy();
    await user.click(cream);
    await user.type(within(sheet).getByRole('searchbox', { name: 'Artikel suchen' }), 'xyz');
    expect(within(sheet).getByText(areasMessages.assign.noMatch)).toBeTruthy();
    await user.click(within(sheet).getByRole('button', { name: areasMessages.assign.save }));

    const card = await spotCard('Schublade Fleisch');
    expect(await within(card).findByRole('link', { name: 'Vollrahm' })).toBeTruthy();
    expect((await context.storage.articles.get(kitchen.articles.cream.id))?.spotId).toBe(
      kitchen.spots.meatDrawer.id,
    );
  });

  it('takes articles out of the area without a spot', async () => {
    const { user, kitchen, t: context } = await renderArea((view) => view.kitchen.areas.cold.id);
    const rest = await screen.findByRole('region', { name: t.unplacedTitle });
    await user.click(within(rest).getByRole('button', { name: `${t.assign}, ${t.unplacedTitle}` }));
    const sheet = screen.getByRole('dialog', { name: 'Kühlzelle: Artikel ohne Platz' });
    await user.click(await within(sheet).findByRole('checkbox', { name: 'Eier' }));
    await user.click(within(sheet).getByRole('button', { name: areasMessages.assign.save }));
    await waitFor(async () => {
      expect(await context.storage.articles.get(kitchen.articles.eggs.id)).not.toHaveProperty(
        'areaId',
      );
    });
    await waitFor(() => {
      expect(within(rest).queryByText('Eier')).toBeNull();
    });
  });

  it('refuses to delete an area while lots lie in it, in clear words', async () => {
    const { user, areaId } = await renderArea((view) => view.kitchen.areas.cold.id);
    await user.click(await screen.findByRole('button', { name: t.remove }));
    const sheet = screen.getByRole('dialog', { name: t.blockedTitle('Kühlzelle') });
    expect(within(sheet).getByText(t.blockedText('6 Chargen', 'CHF 411.20'))).toBeTruthy();
    expect(within(sheet).getByRole('link', { name: t.toStock }).getAttribute('href')).toBe(
      `/stock?area=${areaId}`,
    );
    await user.click(within(sheet).getByRole('button', { name: t.close }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('deletes an empty area after asking, and goes back to the list', async () => {
    const { user, areaId, t: context } = await renderArea((view) => view.kitchen.areas.frozen.id);
    expect(await screen.findByRole('heading', { level: 1, name: 'Tiefkühlzelle' })).toBeTruthy();
    expect(screen.getByText(t.lotsEmpty)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: t.remove }));
    const confirm = screen.getByRole('alertdialog', { name: 'Tiefkühlzelle löschen?' });
    expect(within(confirm).getByText(t.removeText('0 Plätze', '0 Artikel'))).toBeTruthy();
    await user.click(within(confirm).getByRole('button', { name: t.remove }));
    expect(await screen.findByText('Liste der Bereiche')).toBeTruthy();
    expect((await context.storage.areas.get(areaId))?.deletedAt).toBeDefined();
  });

  it('edits the area in a sheet', async () => {
    const { user, areaId, t: context } = await renderArea((view) => view.kitchen.areas.dry.id);
    await user.click(await screen.findByRole('button', { name: t.edit }));
    const sheet = screen.getByRole('dialog', { name: areasMessages.form.titleEdit });
    const name = within(sheet).getByLabelText(areasMessages.form.name);
    await user.clear(name);
    await user.type(name, 'Economat');
    await user.type(within(sheet).getByLabelText(areasMessages.form.max), '20');
    await user.click(within(sheet).getByRole('button', { name: areasMessages.form.save }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Economat' })).toBeTruthy();
    expect(screen.getAllByText('höchstens 20 °C').length).toBeGreaterThan(0);
    expect(screen.getByText(areasMessages.range.own)).toBeTruthy();
    expect(await context.storage.areas.get(areaId)).toMatchObject({
      name: 'Economat',
      maxDeciC: 200,
    });
  });

  it('says «nicht gefunden» for an area that is gone or an address that is none', async () => {
    const { router } = await renderArea(() => '018f4e9a-7b1c-7000-8000-000000000001' as Id);
    expect(await screen.findByRole('heading', { name: 'Nicht gefunden' })).toBeTruthy();
    await router.navigate('/areas/kein-bereich');
    expect(await screen.findByRole('heading', { name: 'Nicht gefunden' })).toBeTruthy();
  });
});
