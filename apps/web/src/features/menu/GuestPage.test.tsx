import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { paths } from '../../app/paths';
import { renderApp } from '../../app/test-helpers';
import { GuestPage } from './GuestPage';
import { menuMessages } from './messages';
import { fileMessages } from '../../ui/messages.files';
import { readPdf } from '../../ui/pdf/test-helpers';
import { pretendInstalledIphone } from '../../ui/test-helpers';
import { addDishTo, makeCard } from './test-helpers';

const t = menuMessages.guest;

/** The element at a position of a list of found elements; the test fails when there is none. */
function nth<TElement>(elements: TElement[], index: number): TElement {
  const element = elements[index];
  if (element === undefined) {
    throw new Error(`No element at ${String(index)}`);
  }
  return element;
}
const NOT_A_CARD = '00000000-0000-7000-8000-000000000000';

/**
 * The guest view of a card: the two seeded dishes (both with milk; the salmon with fish) and a
 * vegetarian soup with milk. Published unless told otherwise.
 */
async function renderGuest(
  options: { published?: boolean; search?: string; photos?: boolean } = {},
) {
  const published = options.published ?? true;
  const view = await renderApp(<GuestPage />, {
    route: `/guest/${NOT_A_CARD}`,
    path: '/guest/:cardId',
  });
  const { entrecoteDish, salmonDish } = view.kitchen.recipes;
  const soup = await addDishTo(view, 'Rahmsuppe', {
    priceRappen: 900,
    ingredientIds: [view.kitchen.articles.cream.id],
  });
  const cardId = await makeCard(
    view,
    'Abendkarte',
    [{ title: 'Hauptgänge', recipeIds: [entrecoteDish.id, salmonDish.id, soup] }],
    { published, showPhotos: options.photos ?? true },
  );
  const search = options.search ?? '';
  await view.router.navigate(`${paths.guest(cardId)}${search}`);
  if (published || search.includes('preview=1')) {
    await screen.findByRole('heading', { level: 1, name: 'Testküche' });
  }
  return { ...view, cardId };
}

describe('GuestPage', () => {
  it('shows an unpublished card only as not found, or as a preview to the editor', async () => {
    await renderGuest({ published: false });
    expect(await screen.findByRole('heading', { level: 1, name: t.notFoundTitle })).toBeTruthy();
    expect(screen.queryByText('Lachs mit Rahmsauce')).toBeNull();
  });

  it('shows the preview of an unpublished card to the editor, with a notice', async () => {
    await renderGuest({ published: false, search: '?preview=1' });
    expect(await screen.findByText(t.previewNotice)).toBeTruthy();
    expect(screen.getByText('Lachs mit Rahmsauce')).toBeTruthy();
  });

  it('gives the cover, the sections, the dishes with price and origin, and the footer', async () => {
    await renderGuest();
    expect(screen.getByRole('heading', { level: 1, name: 'Testküche' })).toBeTruthy();
    expect(screen.getByText('Abendkarte')).toBeTruthy();
    const section = screen.getByRole('heading', { level: 2, name: 'Hauptgänge' });
    expect(section).toBeTruthy();
    const entrecote = screen.getByRole('button', { name: /Entrecôte mit Rotweinjus/ });
    expect(within(entrecote).getByText('CHF 42.00')).toBeTruthy();
    expect(within(entrecote).getByText('Milch')).toBeTruthy();
    expect(within(entrecote).getByText('Sulfite')).toBeTruthy();
    expect(within(entrecote).getByText('Rindsentrecôte: Schweiz')).toBeTruthy();
    const salmon = screen.getByRole('button', { name: /Lachs mit Rahmsauce/ });
    expect(within(salmon).getByText('Lachsfilet: Norwegen')).toBeTruthy();
    expect(screen.getByText(t.notice)).toBeTruthy();
    expect(screen.getByRole('link', { name: t.back }).getAttribute('href')).toBe('/');
  });

  it('hides the prices and photos the card does not show', async () => {
    const view = await renderGuest({ photos: false });
    await view.t.useCases['menu.update']({
      commandId: view.t.cmd(),
      businessId: view.t.businessId,
      cardId: view.cardId,
      showPrices: false,
    });
    await waitFor(() => {
      expect(screen.queryByText('CHF 42.00')).toBeNull();
    });
  });

  it('says where the declaration is not complete, and asks the staff', async () => {
    const view = await renderGuest();
    await view.t.storage.articles.put({
      ...view.kitchen.articles.cream,
      deletedAt: view.t.clock.now(),
    });
    await waitFor(() => {
      expect(screen.getAllByText(t.incomplete).length).toBeGreaterThan(0);
    });
  });

  it('filters to vegetarian dishes, with the chip pressed and the address showing it', async () => {
    const { user, router } = await renderGuest();
    expect(screen.queryByRole('button', { name: t.vegan })).toBeNull();
    await user.click(screen.getByRole('button', { name: t.vegetarian }));
    await waitFor(() => {
      expect(router.state.location.search).toBe('?diet=vegetarian');
    });
    expect(screen.queryByRole('button', { name: /Entrecôte mit Rotweinjus/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Rahmsuppe/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: t.vegetarian }).getAttribute('aria-pressed')).toBe(
      'true',
    );
  });

  it('leaves out the dishes with an excluded allergen, chosen in the sheet', async () => {
    const { user, router } = await renderGuest();
    await user.click(screen.getByRole('button', { name: t.without }));
    const sheet = await screen.findByRole('dialog', { name: t.sheetTitle });
    await user.click(within(sheet).getByRole('checkbox', { name: 'Milch' }));
    await waitFor(() => {
      expect(router.state.location.search).toBe('?ohne=milk');
    });
    await user.click(within(sheet).getByRole('button', { name: t.done }));
    expect(screen.getByText(t.noneLeft)).toBeTruthy();
    expect(screen.queryByText('Lachs mit Rahmsauce')).toBeNull();
    expect(screen.getByRole('button', { name: t.withoutSome('Milch') })).toBeTruthy();
  });

  it('hides the salmon for «Ohne Fisch» and keeps the rest', async () => {
    await renderGuest({ search: '?ohne=fish' });
    expect(await screen.findByRole('button', { name: /Entrecôte mit Rotweinjus/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Lachs mit Rahmsauce/ })).toBeNull();
  });

  it('keeps a dish that may only contain traces of the excluded allergen, with a mark', async () => {
    const view = await renderGuest({ search: '?ohne=nuts' });
    await view.t.storage.recipes.put({
      ...view.kitchen.recipes.entrecoteDish,
      extraTraces: ['nuts'],
    });
    const entrecote = await screen.findByRole('button', { name: /Entrecôte mit Rotweinjus/ });
    await waitFor(() => {
      expect(within(entrecote).getByText(t.traceMark('Nüsse'))).toBeTruthy();
    });
    expect(within(entrecote).getByText('Spuren: Nüsse')).toBeTruthy();
  });

  it('opens a dish with its official allergen names', async () => {
    const { user } = await renderGuest();
    await user.click(screen.getByRole('button', { name: /Lachs mit Rahmsauce/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Lachs mit Rahmsauce' });
    expect(within(dialog).getByText('Fische und daraus gewonnene Erzeugnisse')).toBeTruthy();
    expect(within(dialog).getByText('Lachsfilet: Norwegen')).toBeTruthy();
  });

  it('calls the print dialog once when the staff opens it from the editor', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    await renderGuest({ search: '?drucken=1' });
    await waitFor(() => {
      expect(print).toHaveBeenCalledTimes(1);
    });
  });

  it('in the app installed on an iPhone, shares the PDF of the card instead of the dead dialog', async () => {
    const share = vi.fn((_data: ShareData) => Promise.resolve());
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    const undo = pretendInstalledIphone({ share, canShare: () => true });
    try {
      const { user } = await renderGuest({ search: '?drucken=1' });
      expect(screen.getByText(fileMessages.print.fromAddress)).toBeTruthy();
      const buttons = screen.getAllByRole('button', { name: t.print });
      expect(buttons).toHaveLength(2);
      const button = nth(buttons, 0);
      await waitFor(
        () => {
          expect(button.getAttribute('aria-busy')).toBeNull();
        },
        { timeout: 10_000 },
      );
      await user.click(button);
      await waitFor(() => {
        expect(share).toHaveBeenCalledTimes(1);
      });
      const file = share.mock.calls[0]?.[0].files?.[0];
      expect(file?.name).toBe('speisekarte-abendkarte.pdf');
      expect(file?.type).toBe('application/pdf');
      const { lines } = await readPdf(file ?? new Blob());
      expect(lines).toContain('Entrecôte mit Rotweinjus und Kartoffelstock');
      expect(lines).toContain('CHF 42.00');
      expect(print).not.toHaveBeenCalled();
    } finally {
      undo();
    }
  }, 20_000);

  it('says an empty card has no dishes yet, and does not speak of a filter', async () => {
    const view = await renderApp(<GuestPage />, {
      route: `/guest/${NOT_A_CARD}`,
      path: '/guest/:cardId',
    });
    const cardId = await makeCard(view, 'Leere Karte', [], { published: true });
    await view.router.navigate(paths.guest(cardId));
    expect(await screen.findByText(t.emptyCard)).toBeTruthy();
    expect(screen.queryByText(t.noneLeft)).toBeNull();
  });

  it('says the same for a card whose dishes are all inactive', async () => {
    const view = await renderApp(<GuestPage />, {
      route: `/guest/${NOT_A_CARD}`,
      path: '/guest/:cardId',
    });
    const dishId = await addDishTo(view, 'Ruhender Teller', {
      ingredientIds: [view.kitchen.articles.cream.id],
    });
    const row = await view.t.storage.recipes.get(dishId);
    if (row === undefined) {
      throw new Error('The dish is missing');
    }
    await view.t.storage.recipes.put({ ...row, active: false });
    const cardId = await makeCard(
      view,
      'Ruhende Karte',
      [{ title: 'Hauptgänge', recipeIds: [dishId] }],
      { published: true },
    );
    await view.router.navigate(paths.guest(cardId));
    expect(await screen.findByText(t.emptyCard)).toBeTruthy();
    expect(screen.queryByText(t.noneLeft)).toBeNull();
  });

  it('keeps the line breaks the staff typed in the intro and the footer', async () => {
    const view = await renderGuest();
    await view.t.useCases['menu.update']({
      commandId: view.t.cmd(),
      businessId: view.t.businessId,
      cardId: view.cardId,
      intro: 'Saisonal gekocht.\nFrisch vom Markt.',
      footer: 'Montags geschlossen.\nBis bald.',
    });
    const intro = await screen.findByText(/Saisonal gekocht/);
    expect(intro.className).toContain('whitespace-pre-line');
    expect(screen.getByText(/Montags geschlossen/).className).toContain('whitespace-pre-line');
  });

  it('shows a dish without ingredients as incomplete, with no diet pill', async () => {
    const view = await renderApp(<GuestPage />, {
      route: `/guest/${NOT_A_CARD}`,
      path: '/guest/:cardId',
    });
    const dishId = await addDishTo(view, 'Leerer Teller');
    const cardId = await makeCard(view, 'Karte', [{ title: 'Hauptgänge', recipeIds: [dishId] }], {
      published: true,
    });
    await view.router.navigate(paths.guest(cardId));
    const dish = await screen.findByRole('button', { name: /Leerer Teller/ });
    expect(within(dish).getByText(t.incomplete)).toBeTruthy();
    expect(within(dish).queryByText(t.vegan)).toBeNull();
    expect(within(dish).queryByText(t.vegetarian)).toBeNull();
  });

  it('says the card is not there for an address that leads nowhere', async () => {
    await renderApp(<GuestPage />, { route: `/guest/${NOT_A_CARD}`, path: '/guest/:cardId' });
    expect(await screen.findByRole('heading', { level: 1, name: t.notFoundTitle })).toBeTruthy();
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});
