import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderApp, type AppView } from '../../app/test-helpers';
import { areasMessages } from './messages';
import { TourPage, tourStops } from './TourPage';

const t = areasMessages.tour;
const PHOTO = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';

async function renderTour(prepare?: (view: AppView) => Promise<void>, route = '/areas/tour') {
  const view = await renderApp(<TourPage />, {
    route: '/',
    path: '/areas/tour',
    routes: [{ path: '/', element: <p>Start</p> }],
  });
  await prepare?.(view);
  await view.router.navigate(route);
  return view;
}

const stopHeading = (name: string) => screen.findByRole('heading', { level: 2, name });
/** The stop on the screen; the handout for the printer holds the same words. */
const stop = (name: string) => screen.findByRole('article', { name });

describe('tourStops', () => {
  it('takes every spot, and an area without spots as one stop', () => {
    const area = (name: string, spots: string[]) => ({
      id: name,
      name,
      spots: spots.map((spot) => ({ spotId: spot, name: spot })),
    });
    const stops = tourStops([area('A', ['a1', 'a2']), area('B', []), area('C', ['c1'])] as never);
    expect(stops.map((stop) => (stop.kind === 'spot' ? stop.spot.name : stop.area.name))).toEqual([
      'a1',
      'a2',
      'B',
      'c1',
    ]);
  });
});

describe('TourPage', () => {
  it('walks one stop at a time, with «Weiter» and «Zurück», to the end', async () => {
    const { user, kitchen, router } = await renderTour();
    expect(await screen.findByRole('heading', { level: 1, name: t.title })).toBeTruthy();
    expect(await screen.findByText('2 Plätze, 0 mit Foto')).toBeTruthy();

    // 1: the drawer for meat in the cold room, without a photo yet.
    const first = await stop('Schublade Fleisch');
    expect(screen.getByText('1 von 3')).toBeTruthy();
    expect(within(first).getByText('Rindsentrecôte')).toBeTruthy();
    expect(within(first).getByText(t.photoMissing)).toBeTruthy();
    expect(
      screen.getByRole('link', { name: 'Foto hinzufügen, Schublade Fleisch' }).getAttribute('href'),
    ).toBe(`/areas/${kitchen.areas.cold.id}?spot=${kitchen.spots.meatDrawer.id}`);
    expect(screen.queryByRole('button', { name: t.back2 })).toBeNull();

    // 2: the freezer has no spots: the whole area is a stop, with the way to add one.
    await user.click(screen.getByRole('button', { name: t.next }));
    const whole = await stopHeading(t.wholeArea);
    await waitFor(() => {
      expect(document.activeElement).toBe(whole);
    });
    expect(screen.getByText('2 von 3')).toBeTruthy();
    expect(within(await stop(t.wholeArea)).getByText(t.nothingHere)).toBeTruthy();
    expect(screen.getByRole('link', { name: t.addSpot }).getAttribute('href')).toBe(
      `/areas/${kitchen.areas.frozen.id}?spot=new`,
    );
    expect(router.state.location.search).toBe('?step=2');

    // 3: the last one says how to end.
    await user.click(screen.getByRole('button', { name: t.next }));
    expect(await stopHeading('Regal 1, oben')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: t.back2 }));
    expect(await stopHeading(t.wholeArea)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: t.next }));
    await user.click(await screen.findByRole('button', { name: t.finish }));
    expect(await screen.findByRole('heading', { level: 2, name: t.doneTitle })).toBeTruthy();
    expect(screen.getByText(t.doneText('2 Plätze', '3 Lagerbereiche'))).toBeTruthy();
    await user.click(screen.getByRole('button', { name: t.again }));
    expect(await stopHeading('Schublade Fleisch')).toBeTruthy();
  });

  it('shows the photo of a new spot large, names what lies there, and counts the rest', async () => {
    await renderTour(async ({ t: context, kitchen }) => {
      const { spotId } = await context.useCases['spots.create']({
        commandId: context.cmd(),
        businessId: context.businessId,
        areaId: kitchen.areas.cold.id,
        name: 'Regal Milch',
        note: 'Links, zweites Brett',
        photo: PHOTO,
      });
      await context.useCases['spots.assign']({
        commandId: context.cmd(),
        businessId: context.businessId,
        areaId: kitchen.areas.cold.id,
        spotId,
        articleIds: [
          kitchen.articles.cream.id,
          kitchen.articles.butter.id,
          kitchen.articles.eggs.id,
          kitchen.articles.salmon.id,
          kitchen.articles.jus.id,
          kitchen.articles.flour.id,
          kitchen.articles.onions.id,
          kitchen.articles.potatoes.id,
          kitchen.articles.redWine.id,
        ],
      });
    }, '/areas/tour?step=2');
    const milk = await stop('Regal Milch');
    expect(screen.getByText('3 Plätze, 1 mit Foto')).toBeTruthy();
    expect(within(milk).getByText('Links, zweites Brett')).toBeTruthy();
    expect(
      within(milk).getByRole('button', { name: 'Regal Milch, Kühlzelle gross anzeigen' }),
    ).toBeTruthy();
    // Nine articles: eight names and the rest as a number.
    expect(within(milk).getAllByRole('listitem')).toHaveLength(8);
    expect(within(milk).getByText('Butter')).toBeTruthy();
    expect(within(milk).getByText(t.more(1))).toBeTruthy();
    expect(within(milk).queryByText(t.photoMissing)).toBeNull();
  });

  it('prints a handout with every area and spot', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    const { user } = await renderTour();
    await user.click(await screen.findByRole('button', { name: t.print }));
    expect(print).toHaveBeenCalledTimes(1);
    print.mockRestore();
    const cold = screen.getByRole('table', { name: 'Kühlzelle · 0 bis 5 °C' });
    expect(within(cold).getByRole('rowheader', { name: 'Schublade Fleisch' })).toBeTruthy();
    expect(within(cold).getAllByText(t.printPhotoMissing).length).toBeGreaterThan(0);
    expect(within(cold).getByText('Butter, Eier, Lachsfilet, Rotweinjus, Vollrahm')).toBeTruthy();
    expect(screen.getByRole('table', { name: 'Tiefkühlzelle · höchstens -18 °C' })).toBeTruthy();
    expect(screen.getByText('Testküche · Stand 14.11.2026')).toBeTruthy();
  });

  it('says what a tour needs when there is nothing to walk', async () => {
    await renderTour(async ({ t: context, kitchen }) => {
      const now = context.clock.now();
      for (const area of Object.values(kitchen.areas)) {
        await context.storage.areas.put({ ...area, deletedAt: now });
      }
    });
    expect(await screen.findByText(t.emptyTitle)).toBeTruthy();
    expect(screen.getByRole('link', { name: t.toAreas }).getAttribute('href')).toBe('/areas');
    expect(screen.queryByRole('button', { name: t.print })).toBeNull();
  });

  it('keeps the stop within the tour whatever the address says', async () => {
    await renderTour(undefined, '/areas/tour?step=abc');
    expect(await stopHeading('Schublade Fleisch')).toBeTruthy();
  });
});
