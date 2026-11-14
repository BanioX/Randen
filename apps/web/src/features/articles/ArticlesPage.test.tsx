import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { paths } from '../../app/paths';
import { renderApp } from '../../app/test-helpers';
import { ArticlesPage } from './ArticlesPage';
import { articlesMessages } from './messages';

const t = articlesMessages.list;

/** The table of the iPad and the web; the phone shows the same rows as a grouped list. */
const table = () => screen.findByRole('table', { name: t.caption });
const tableNames = (element: HTMLElement) =>
  within(element)
    .getAllByRole('rowheader')
    .map(
      (cell) => within(cell).getByRole('link').firstElementChild?.firstElementChild?.textContent,
    );

describe('ArticlesPage', () => {
  it('lists the articles of the kitchen with stock, price, supplier and place', async () => {
    const { kitchen } = await renderApp(<ArticlesPage />, { route: paths.articles() });
    const articles = await table();
    expect(tableNames(articles)).toEqual([
      'Butter',
      'Eier',
      'Kartoffeln',
      'Lachsfilet',
      'Rindsentrecôte',
      'Rotwein zum Kochen',
      'Rotweinjus',
      'Vollrahm',
      'Weissmehl',
      'Zwiebeln',
    ]);
    const entrecote = within(articles).getByRole('row', { name: /Rindsentrecôte/ });
    expect(within(entrecote).getByText('Fleisch')).toBeTruthy();
    expect(within(entrecote).getByText('4 kg')).toBeTruthy();
    expect(within(entrecote).getByText('CHF 62.00 / kg')).toBeTruthy();
    expect(within(entrecote).getByText('Metzgerei Muster')).toBeTruthy();
    expect(within(entrecote).getByText('Schublade Fleisch')).toBeTruthy();
    expect(within(entrecote).getByRole('link').getAttribute('href')).toBe(
      paths.article(kitchen.articles.entrecote.id),
    );
    // An egg at 45 Rappen is a price per piece.
    const eggs = within(articles).getByRole('row', { name: /^Eier/ });
    expect(within(eggs).getByText('60 Stk.')).toBeTruthy();
    expect(within(eggs).getByText('CHF 0.45 / Stk.')).toBeTruthy();
    // The component has no lot yet and costs what its recipe costs.
    const jus = within(articles).getByRole('row', { name: /Rotweinjus/ });
    expect(within(jus).getByText(articlesMessages.noStock)).toBeTruthy();
    expect(within(jus).getByText('CHF 7.89 / l')).toBeTruthy();
    // 3 kg of flour against a minimum of 5 kg.
    const flour = within(articles).getByRole('row', { name: /Weissmehl/ });
    expect(within(flour).getByText('Mindestbestand 5 kg')).toBeTruthy();

    // The same rows for the thumb, each one a link to its article.
    const list = screen.getByRole('list', { name: t.caption });
    expect(within(list).getAllByRole('listitem')).toHaveLength(10);
    expect(within(list).getByRole('link', { name: /Weissmehl.*nachbestellen/ })).toBeTruthy();

    expect(screen.getByRole('link', { name: t.suppliers }).getAttribute('href')).toBe(
      paths.suppliers(),
    );
    expect(screen.getByRole('link', { name: t.create }).getAttribute('href')).toBe(
      paths.articleNew(),
    );
    expect(screen.getByRole('link', { name: t.import }).getAttribute('href')).toBe(
      paths.articlesImport(),
    );
  });

  it('narrows by view, group of goods and search, and keeps the filters in the address', async () => {
    const { user, router } = await renderApp(<ArticlesPage />, { route: paths.articles() });
    await table();
    expect(screen.getByRole('radio', { name: 'Alle (10)' }).getAttribute('aria-checked')).toBe(
      'true',
    );

    await user.click(screen.getByRole('radio', { name: /^Unter Mindest.?bestand \(1\)$/ }));
    await waitFor(async () => {
      expect(tableNames(await table())).toEqual(['Weissmehl']);
    });
    expect(router.state.location.search).toBe('?filter=below_min');

    await user.click(screen.getByRole('radio', { name: 'Alle (10)' }));
    await user.click(await screen.findByRole('radio', { name: 'Milchprodukte (2)' }));
    await waitFor(async () => {
      expect(tableNames(await table())).toEqual(['Butter', 'Vollrahm']);
    });
    expect(router.state.location.search).toBe('?category=dairy');
    // The views are counted inside the chosen group of goods.
    expect(await screen.findByRole('radio', { name: 'Alle (2)' })).toBeTruthy();

    await user.click(screen.getByRole('radio', { name: t.allCategories }));
    await user.type(screen.getByRole('searchbox', { name: t.search }), 'entrecote');
    await waitFor(async () => {
      expect(tableNames(await table())).toEqual(['Rindsentrecôte']);
    });
    expect(router.state.location.search).toBe('?q=entrecote');

    await user.clear(screen.getByRole('searchbox', { name: t.search }));
    await user.type(screen.getByRole('searchbox', { name: t.search }), 'gibt es nicht');
    expect(await screen.findByText(t.noMatch)).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('opens with the filters of the address', async () => {
    await renderApp(<ArticlesPage />, { route: `${paths.articles()}?filter=below_min&q=mehl` });
    expect(tableNames(await table())).toEqual(['Weissmehl']);
    expect(screen.getByRole<HTMLInputElement>('searchbox', { name: t.search }).value).toBe('mehl');
    expect(
      screen
        .getByRole('radio', { name: /^Unter Mindest.?bestand \(1\)$/ })
        .getAttribute('aria-checked'),
    ).toBe('true');
  });

  it('says what is missing and where a view is empty', async () => {
    const { t: context } = await renderApp(<ArticlesPage />, {
      route: `${paths.articles()}?filter=no_price`,
    });
    expect(await screen.findByText(t.noneInView.no_price)).toBeTruthy();

    await context.useCases['articles.create']({
      commandId: context.cmd(),
      businessId: context.businessId,
      name: 'Kalbsfilet',
      categoryId: 'meat',
      unit: 'g',
    });
    const veal = within(await table()).getByRole('row', { name: /Kalbsfilet/ });
    expect(within(veal).getByText(articlesMessages.missing.price)).toBeTruthy();
    expect(within(veal).getByText(articlesMessages.missing.origin)).toBeTruthy();
    expect(within(veal).getByText(articlesMessages.missing.supplier)).toBeTruthy();
  });

  it('invites to the first article while there is none', async () => {
    const { t: context } = await renderApp(<ArticlesPage />, { route: paths.articles() });
    await table();
    const now = context.clock.now();
    for (const article of await context.storage.articles.ofBusiness(context.businessId)) {
      await context.storage.articles.put({ ...article, deletedAt: now });
    }
    expect(await screen.findByText(t.emptyTitle)).toBeTruthy();
    expect(screen.getByText(t.emptyText)).toBeTruthy();
    // One place per action: the empty state carries it, the header does not repeat it.
    expect(screen.getAllByRole('link', { name: t.create })).toHaveLength(1);
    expect(screen.queryByRole('searchbox')).toBeNull();
  });
});
