import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { paths } from '../../app/paths';
import { renderApp, type AppView } from '../../app/test-helpers';
import type { Id } from '@randen/core';
import { addDishTo, goTo, makeCard } from './test-helpers';
import { MenuCardPage } from './MenuCardPage';
import { menuMessages } from './messages';

const t = menuMessages;
const NOT_A_CARD = '00000000-0000-7000-8000-000000000000';

/** Renders the editor of a card made by `build` on the page's own database. */
async function renderEditor(build: (view: AppView) => Promise<string>) {
  const view = await renderApp(<MenuCardPage />, {
    route: `/menu/${NOT_A_CARD}`,
    path: '/menu/:cardId',
  });
  const cardId = await build(view);
  await goTo(view, paths.menuCard(cardId));
  await screen.findByRole('heading', { level: 1, name: 'Abendkarte' });
  return { ...view, cardId };
}

/** The element at a position of a list of found elements; the test fails when there is none. */
function nth<TElement>(elements: TElement[], index: number): TElement {
  const element = elements[index];
  if (element === undefined) {
    throw new Error(`No element at ${String(index)}`);
  }
  return element;
}

/** Two sections: Vorspeisen (empty) and Hauptgänge with the entrecôte and the salmon dish. */
async function dinnerCard(view: AppView) {
  const { entrecoteDish, salmonDish } = view.kitchen.recipes;
  return makeCard(view, 'Abendkarte', [
    { title: 'Vorspeisen', recipeIds: [] },
    { title: 'Hauptgänge', recipeIds: [entrecoteDish.id, salmonDish.id] },
  ]);
}

/** The stored row of a card; the id comes from the test itself, so it is a real one. */
async function storedCard(view: AppView, cardId: string) {
  return view.t.storage.menuCards.get(cardId as Id);
}

describe('MenuCardPage', () => {
  it('shows the sections with their dishes, prices and open points, and what is missing', async () => {
    const { entrecoteDish } = (await renderEditor(async (view) => dinnerCard(view))).kitchen
      .recipes;
    expect(entrecoteDish).toBeDefined();
    expect(screen.getByRole('heading', { level: 3, name: 'Hauptgänge' })).toBeTruthy();
    expect(screen.getByText('CHF 42.00')).toBeTruthy();
    expect(screen.getByText('CHF 34.00')).toBeTruthy();
    const notice = screen.getByText(t.editor.noticeBefore).closest('div');
    expect(notice).toBeTruthy();
    expect(
      screen.getByText('Entrecôte mit Rotweinjus und Kartoffelstock: Foto fehlt'),
    ).toBeTruthy();
    expect(screen.getByText(t.status.draft)).toBeTruthy();
  });

  it('saves the name and the intro, and says so with the name of the card', async () => {
    const { user, cardId, t: context } = await renderEditor(dinnerCard);
    const form = screen.getByRole('button', { name: t.settings.save }).closest('form');
    if (form === null) {
      throw new Error('The settings form is missing');
    }
    const name = within(form).getByRole('textbox', { name: /Name/ });
    await user.clear(name);
    await user.type(name, 'Sommerkarte');
    await user.type(within(form).getByRole('textbox', { name: /Einleitung/ }), 'Frisch vom Markt.');
    await user.click(within(form).getByRole('button', { name: t.settings.save }));
    await screen.findByRole('heading', { level: 1, name: 'Sommerkarte' });
    const row = await context.storage.menuCards.get(cardId as Id);
    expect(row).toMatchObject({ name: 'Sommerkarte', intro: 'Frisch vom Markt.' });
  });

  it('switches prices and photos off at once, and publishes the card', async () => {
    const view = await renderEditor(dinnerCard);
    const { user, cardId } = view;
    await user.click(screen.getByRole('switch', { name: t.settings.prices }));
    await waitFor(async () => {
      expect((await storedCard(view, cardId))?.showPrices).toBe(false);
    });
    await user.click(screen.getByRole('switch', { name: t.settings.photos }));
    await user.click(screen.getByRole('switch', { name: t.settings.publish }));
    await waitFor(async () => {
      expect((await storedCard(view, cardId))?.published).toBe(true);
    });
    await waitFor(() => {
      expect(screen.getByRole('link', { name: t.actions.guest }).getAttribute('href')).toBe(
        paths.guest(cardId),
      );
    });
    expect(screen.getByRole('heading', { level: 1, name: 'Abendkarte' })).toBeTruthy();
  });

  it('adds a section, and a dish picked from the dishes only', async () => {
    const view = await renderApp(<MenuCardPage />, {
      route: `/menu/${NOT_A_CARD}`,
      path: '/menu/:cardId',
    });
    const soup = await addDishTo(view, 'Gemüsesuppe');
    const cardId = await dinnerCard(view);
    await goTo(view, paths.menuCard(cardId));
    const { user } = view;
    await screen.findByRole('heading', { level: 1, name: 'Abendkarte' });

    await user.click(screen.getByRole('button', { name: t.sections.add }));
    const titleDialog = await screen.findByRole('dialog', { name: t.sheets.newSection });
    await user.type(within(titleDialog).getByRole('textbox'), 'Desserts');
    await user.click(within(titleDialog).getByRole('button', { name: t.sheets.sectionSubmit }));
    await waitFor(async () => {
      const titles = (await view.t.storage.menuCards.get(cardId))?.sections.map(
        (section) => section.title,
      );
      expect(titles).toEqual(['Vorspeisen', 'Hauptgänge', 'Desserts']);
    });

    await user.click(nth(screen.getAllByRole('button', { name: t.sections.addDish }), 0));
    const dialog = await screen.findByRole('dialog', { name: t.sheets.addDish('Vorspeisen') });
    await user.type(within(dialog).getByRole('combobox', { name: t.sheets.dish }), 'gemüse');
    await user.click(await screen.findByRole('option', { name: /Gemüsesuppe/ }));
    await user.click(within(dialog).getByRole('button', { name: t.sheets.dishSubmit }));
    await waitFor(async () => {
      expect((await view.t.storage.menuCards.get(cardId))?.sections[0]?.recipeIds).toEqual([soup]);
    });
  });

  it('refuses a dish that is already on the card, in the sheet, with a sentence', async () => {
    const view = await renderApp(<MenuCardPage />, {
      route: `/menu/${NOT_A_CARD}`,
      path: '/menu/:cardId',
    });
    const cardId = await dinnerCard(view);
    await goTo(view, paths.menuCard(cardId));
    const { user } = view;
    await screen.findByRole('heading', { level: 1, name: 'Abendkarte' });
    await user.click(nth(screen.getAllByRole('button', { name: t.sections.addDish }), 1));
    const dialog = await screen.findByRole('dialog', { name: t.sheets.addDish('Hauptgänge') });
    await user.type(within(dialog).getByRole('combobox', { name: t.sheets.dish }), 'Lachs');
    await user.click(await screen.findByRole('option', { name: /Lachs mit Rahmsauce/ }));
    await user.click(within(dialog).getByRole('button', { name: t.sheets.dishSubmit }));
    expect(await within(dialog).findByText(t.sheets.dishAlready)).toBeTruthy();
  });

  it('moves a dish down and takes another one off the card', async () => {
    const { user, cardId, kitchen, t: context } = await renderEditor(dinnerCard);
    await user.click(
      screen.getByRole('button', {
        name: t.sections.dishDown('Entrecôte mit Rotweinjus und Kartoffelstock'),
      }),
    );
    await waitFor(async () => {
      expect((await context.storage.menuCards.get(cardId as Id))?.sections[1]?.recipeIds).toEqual([
        kitchen.recipes.salmonDish.id,
        kitchen.recipes.entrecoteDish.id,
      ]);
    });
    await user.click(
      await screen.findByRole('button', { name: t.sections.dishRemove('Lachs mit Rahmsauce') }),
    );
    await waitFor(async () => {
      expect((await context.storage.menuCards.get(cardId as Id))?.sections[1]?.recipeIds).toEqual([
        kitchen.recipes.entrecoteDish.id,
      ]);
    });
  });

  it('asks before a section with dishes is removed, and removes an empty one at once', async () => {
    const { user, cardId, t: context } = await renderEditor(dinnerCard);
    await user.click(screen.getByRole('button', { name: `${t.sections.remove}: Vorspeisen` }));
    await waitFor(async () => {
      expect((await context.storage.menuCards.get(cardId as Id))?.sections).toHaveLength(1);
    });
    await user.click(
      await screen.findByRole('button', { name: `${t.sections.remove}: Hauptgänge` }),
    );
    const confirm = await screen.findByRole('alertdialog', {
      name: t.sections.removeTitle('Hauptgänge'),
    });
    await user.click(within(confirm).getByRole('button', { name: t.sections.removeConfirm }));
    await waitFor(async () => {
      expect((await context.storage.menuCards.get(cardId as Id))?.sections).toEqual([]);
    });
  });

  it('duplicates the card and opens the copy', async () => {
    const { user, cardId, t: context, router } = await renderEditor(dinnerCard);
    await user.click(screen.getByRole('button', { name: t.actions.duplicate }));
    await waitFor(() => {
      expect(router.state.location.pathname).not.toBe(paths.menuCard(cardId));
    });
    const cards = await context.storage.menuCards.ofBusiness(context.businessId);
    expect(cards.map((card) => card.name).sort()).toEqual(['Abendkarte', 'Abendkarte (Kopie)']);
  });

  it('deletes the card after a question, and goes back to the list', async () => {
    const { user, cardId, t: context, router } = await renderEditor(dinnerCard);
    await user.click(screen.getByRole('button', { name: t.removeCard.confirm }));
    const dialog = await screen.findByRole('alertdialog', { name: t.removeCard.title });
    await user.click(within(dialog).getByRole('button', { name: t.removeCard.confirm }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(paths.menu());
    });
    expect((await context.storage.menuCards.get(cardId as Id))?.deletedAt).toBeDefined();
  });

  it('saves the card as a file the browser downloads, under its own name', async () => {
    const created: Blob[] = [];
    const createUrl = vi.fn((blob: Blob) => {
      created.push(blob);
      return 'blob:menu';
    });
    Object.defineProperty(URL, 'createObjectURL', {
      value: createUrl,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      value: vi.fn(),
      configurable: true,
      writable: true,
    });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    try {
      const { user } = await renderEditor(dinnerCard);
      await user.click(screen.getByRole('button', { name: t.actions.file }));
      await waitFor(() => {
        expect(click).toHaveBeenCalledTimes(1);
      });
      const anchor = click.mock.contexts[0];
      expect(anchor).toBeInstanceOf(HTMLAnchorElement);
      expect((anchor as HTMLAnchorElement).download).toBe('speisekarte-abendkarte.html');
      const html = await created[0]?.text();
      expect(html).toContain('<html lang="de-CH">');
      expect(html).not.toContain('<script');
    } finally {
      Reflect.deleteProperty(URL, 'createObjectURL');
      Reflect.deleteProperty(URL, 'revokeObjectURL');
    }
  });

  it('links the staff list, the print and the guest view with the preview of a draft', async () => {
    const { cardId } = await renderEditor(dinnerCard);
    expect(screen.getByRole('link', { name: t.actions.staffList }).getAttribute('href')).toBe(
      paths.menuAllergens(cardId),
    );
    expect(screen.getByRole('link', { name: t.actions.print }).getAttribute('href')).toBe(
      `${paths.guest(cardId)}?preview=1&drucken=1`,
    );
    expect(screen.getByRole('link', { name: t.actions.guest }).getAttribute('href')).toBe(
      `${paths.guest(cardId)}?preview=1`,
    );
  });

  it('prints a published card from its guest address, without a preview', async () => {
    const { cardId } = await renderEditor(async (view) =>
      makeCard(view, 'Abendkarte', [], { published: true }),
    );
    expect(screen.getByRole('link', { name: t.actions.print }).getAttribute('href')).toBe(
      `${paths.guest(cardId)}?drucken=1`,
    );
  });

  it('asks for a price only while the card shows prices, as the core does', async () => {
    const view = await renderEditor(async (built) => {
      const dish = await addDishTo(built, 'Ohne Preis', {
        priceRappen: null,
        ingredientIds: [built.kitchen.articles.cream.id],
      });
      return makeCard(built, 'Abendkarte', [{ title: 'Hauptgänge', recipeIds: [dish] }], {
        showPrices: false,
      });
    });
    expect(screen.getByText('Ohne Preis')).toBeTruthy();
    expect(screen.queryByText(t.sections.priceMissing)).toBeNull();
    await view.t.useCases['menu.update']({
      commandId: view.t.cmd(),
      businessId: view.t.businessId,
      cardId: view.cardId,
      showPrices: true,
    });
    await waitFor(() => {
      expect(screen.getAllByText(t.sections.priceMissing).length).toBeGreaterThan(0);
    });
  });

  it('says the card is not there when the address does not lead to one', async () => {
    await renderApp(<MenuCardPage />, { route: `/menu/${NOT_A_CARD}`, path: '/menu/:cardId' });
    expect(await screen.findByText(/Diesen Eintrag gibt es nicht mehr\./)).toBeTruthy();
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});
