import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as Core from '@randen/core';
import { paths } from '../../app/paths';
import { renderApp, type AppView } from '../../app/test-helpers';
import type { Id } from '@randen/core';
import { pretendInstalledIphone } from '../../ui/test-helpers';
import { ToastProvider } from '../../ui/Toast';
import { addDishTo, goTo, makeCard } from './test-helpers';
import { MenuCardPage } from './MenuCardPage';
import { menuMessages } from './messages';

const t = menuMessages;

/** Switched on by a test: the export of the card fails, as a broken photo could make it. */
const exportBreaks = vi.hoisted(() => ({ times: 0 }));

vi.mock('@randen/core', async (importOriginal) => {
  const core = await importOriginal<typeof Core>();
  return {
    ...core,
    createUseCases: (...args: Parameters<typeof core.createUseCases>) => {
      const cases = core.createUseCases(...args);
      const exportCard = cases['menu.export'];
      return {
        ...cases,
        'menu.export': (input: Parameters<typeof exportCard>[0]) => {
          if (exportBreaks.times > 0) {
            exportBreaks.times -= 1;
            return Promise.reject(new Error('The photo could not be read'));
          }
          return exportCard(input);
        },
      };
    },
  };
});
const NOT_A_CARD = '00000000-0000-7000-8000-000000000000';

/** Renders the editor of a card made by `build` on the page's own database. */
async function renderEditor(build: (view: AppView) => Promise<string>) {
  // With the toasts of the shell: what a file action says is part of what it does.
  const view = await renderApp(
    <ToastProvider>
      <MenuCardPage />
    </ToastProvider>,
    { route: `/menu/${NOT_A_CARD}`, path: '/menu/:cardId' },
  );
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
      // In a browser the download saves the file.
      expect(await screen.findByText(t.actions.fileSaved)).toBeTruthy();
    } finally {
      Reflect.deleteProperty(URL, 'createObjectURL');
      Reflect.deleteProperty(URL, 'revokeObjectURL');
    }
  });

  it('in the app installed on an iPhone, prepares the file with one tap and shares it with a second', async () => {
    const share = vi.fn((_data: ShareData) => Promise.resolve());
    const undo = pretendInstalledIphone({ share, canShare: () => true });
    try {
      const { user } = await renderEditor(dinnerCard);
      expect(screen.queryByRole('button', { name: t.actions.file })).toBeNull();
      await user.click(screen.getByRole('button', { name: t.actions.filePrepare }));
      const shareButton = await screen.findByRole('button', { name: t.actions.fileShare });
      expect(screen.getByText(t.actions.filePrepared)).toBeTruthy();
      expect(share).not.toHaveBeenCalled();
      await user.click(shareButton);
      await waitFor(() => {
        expect(share).toHaveBeenCalledTimes(1);
      });
      const shared = share.mock.calls[0]?.[0].files?.[0];
      expect(shared?.name).toBe('speisekarte-abendkarte.html');
      expect(await shared?.text()).toContain('<html lang="de-CH">');
      expect(await screen.findByText(t.actions.fileShared)).toBeTruthy();
      expect(screen.getByRole('button', { name: t.actions.filePrepare })).toBeTruthy();
    } finally {
      undo();
    }
  });

  it('in the app installed on an iPhone, drops a prepared file once the card changes', async () => {
    const share = vi.fn((_data: ShareData) => Promise.resolve());
    const undo = pretendInstalledIphone({ share, canShare: () => true });
    try {
      const { user } = await renderEditor(dinnerCard);
      await user.click(screen.getByRole('button', { name: t.actions.filePrepare }));
      await screen.findByRole('button', { name: t.actions.fileShare });
      const form = screen.getByRole('button', { name: t.settings.save }).closest('form');
      if (form === null) {
        throw new Error('The settings form is missing');
      }
      const name = within(form).getByRole('textbox', { name: /Name/ });
      await user.clear(name);
      await user.type(name, 'Sommerkarte');
      await user.click(within(form).getByRole('button', { name: t.settings.save }));
      await screen.findByRole('heading', { level: 1, name: 'Sommerkarte' });
      // The file of the old card is gone: it has to be prepared again.
      expect(await screen.findByRole('button', { name: t.actions.filePrepare })).toBeTruthy();
      expect(screen.queryByRole('button', { name: t.actions.fileShare })).toBeNull();
      expect(screen.queryByText(t.actions.filePrepared)).toBeNull();
      await user.click(screen.getByRole('button', { name: t.actions.filePrepare }));
      await user.click(await screen.findByRole('button', { name: t.actions.fileShare }));
      await waitFor(() => {
        expect(share).toHaveBeenCalledTimes(1);
      });
      const shared = share.mock.calls[0]?.[0].files?.[0];
      expect(shared?.name).toBe('speisekarte-sommerkarte.html');
      expect(await shared?.text()).toContain('Sommerkarte');
    } finally {
      undo();
    }
  });

  it('in the app installed on an iPhone, does not call a download that only opens a preview saved', async () => {
    const undo = pretendInstalledIphone({ share: vi.fn(), canShare: () => false });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    Object.defineProperty(URL, 'createObjectURL', {
      value: vi.fn(() => 'blob:menu'),
      configurable: true,
      writable: true,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      value: vi.fn(),
      configurable: true,
      writable: true,
    });
    try {
      const { user } = await renderEditor(dinnerCard);
      await user.click(screen.getByRole('button', { name: t.actions.filePrepare }));
      await user.click(await screen.findByRole('button', { name: t.actions.fileShare }));
      expect(await screen.findByText(t.actions.filePreviewOnly)).toBeTruthy();
      expect(click).toHaveBeenCalledTimes(1);
      expect(screen.queryByText(t.actions.fileSaved)).toBeNull();
      // The file stays ready for a share.
      expect(screen.getByRole('button', { name: t.actions.fileShare })).toBeTruthy();
    } finally {
      undo();
      Reflect.deleteProperty(URL, 'createObjectURL');
      Reflect.deleteProperty(URL, 'revokeObjectURL');
    }
  });

  it('says when the file could not be prepared, stops turning, and tries again', async () => {
    const share = vi.fn((_data: ShareData) => Promise.resolve());
    const undo = pretendInstalledIphone({ share, canShare: () => true });
    exportBreaks.times = 1;
    try {
      const { user } = await renderEditor(dinnerCard);
      const prepare = screen.getByRole('button', { name: t.actions.filePrepare });
      await user.click(prepare);
      expect(await screen.findByText(t.actions.fileExportFailed)).toBeTruthy();
      expect(prepare.getAttribute('aria-busy')).toBeNull();
      expect(screen.queryByRole('button', { name: t.actions.fileShare })).toBeNull();
      await user.click(screen.getByRole('button', { name: t.actions.fileRetry }));
      const shareButton = await screen.findByRole('button', { name: t.actions.fileShare });
      expect(screen.queryByText(t.actions.fileExportFailed)).toBeNull();
      await user.click(shareButton);
      await waitFor(() => {
        expect(share).toHaveBeenCalledTimes(1);
      });
    } finally {
      exportBreaks.times = 0;
      undo();
    }
  });

  it('in a browser, says when the file could not be prepared instead of turning for good', async () => {
    exportBreaks.times = 1;
    try {
      const { user } = await renderEditor(dinnerCard);
      const button = screen.getByRole('button', { name: t.actions.file });
      await user.click(button);
      expect(await screen.findByText(t.actions.fileExportFailed)).toBeTruthy();
      expect(button.getAttribute('aria-busy')).toBeNull();
    } finally {
      exportBreaks.times = 0;
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
