import { addDays, createStockLedger, type Id } from '@randen/core';
import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { messages } from '../../app/messages';
import { paths } from '../../app/paths';
import { renderApp, type AppView } from '../../app/test-helpers';
import { ToastProvider } from '../../ui/Toast';
import { ArticleDetailPage } from './ArticleDetailPage';
import { articlesMessages } from './messages';

const t = articlesMessages.detail;

/** The detail page in the frame it needs: a start to come from, and the list to go back to. */
async function renderDetail(pick: (view: AppView) => Id | Promise<Id>) {
  const view = await renderApp(
    <ToastProvider>
      <ArticleDetailPage />
    </ToastProvider>,
    {
      route: '/',
      path: '/articles/:articleId',
      routes: [
        { path: '/', element: <p>Start</p> },
        { path: '/articles', element: <p>Liste der Artikel</p> },
      ],
    },
  );
  const articleId = await pick(view);
  await view.router.navigate(paths.article(articleId));
  return { ...view, articleId };
}

/** The tile of a key figure, found by its label. */
const tile = (label: string) => {
  const element = screen.getByText(label).closest('div,a');
  if (!(element instanceof HTMLElement)) {
    throw new Error(`No tile «${label}»`);
  }
  return element;
};

describe('ArticleDetailPage', () => {
  it('shows stock, value, price, the next date and where the article is used', async () => {
    const { kitchen, articleId } = await renderDetail((view) => view.kitchen.articles.entrecote.id);
    expect(await screen.findByRole('heading', { level: 1, name: 'Rindsentrecôte' })).toBeTruthy();

    // 4 kg at CHF 62.00, to be used by 16.11.2026.
    const stock = screen.getByRole('link', { name: /Bestand/ });
    expect(within(stock).getByText('4 kg')).toBeTruthy();
    expect(within(stock).getByText(t.lots(1))).toBeTruthy();
    expect(stock.getAttribute('href')).toBe(paths.stockArticle(articleId));
    expect(within(tile(t.stockValue)).getByText('248.00')).toBeTruthy();
    expect(within(tile(t.lastPrice)).getByText('62.00 / kg')).toBeTruthy();
    expect(within(tile(t.nextDate)).getByText('16.11.2026')).toBeTruthy();
    expect(within(tile(t.nextDate)).getByText(/in 2 Tagen/)).toBeTruthy();
    expect(within(tile(t.nextDate)).getByText(t.dateKinds.use_by)).toBeTruthy();

    // Nothing is missing: no notice.
    expect(screen.queryByText(t.open)).toBeNull();
    expect(screen.getByText(t.noAllergens)).toBeTruthy();
    expect(screen.getByText('Schweiz')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Metzgerei Muster' }).getAttribute('href')).toBe(
      paths.supplier(kitchen.suppliers.butcher.id),
    );
    expect(screen.getByText('Schublade Fleisch')).toBeTruthy();
    expect(screen.getByText('90 %')).toBeTruthy();

    const history = screen.getByRole('table', { name: t.historyCaption });
    expect(within(history).getByText('13.11.2026')).toBeTruthy();
    expect(within(history).getByText('CHF 62.00 / kg')).toBeTruthy();
    const recipe = screen.getByRole('link', { name: /Entrecôte mit Rotweinjus/ });
    expect(recipe.getAttribute('href')).toBe(paths.recipe(kitchen.recipes.entrecoteDish.id));
    expect(within(recipe).getByText(t.perPortions('1.8 kg', 10))).toBeTruthy();
    expect(screen.getByRole('link', { name: t.edit }).getAttribute('href')).toBe(
      paths.articleEdit(articleId),
    );
  });

  it('draws the price history once there are two purchases and names the change', async () => {
    await renderDetail(async ({ t: context, kitchen }) => {
      const ledger = createStockLedger(context.ctx);
      // CHF 62.00 yesterday, CHF 65.10 today: 5 % dearer.
      await context.storage.transaction(() =>
        ledger.receive({
          businessId: context.businessId,
          articleId: kitchen.articles.entrecote.id,
          areaId: kitchen.areas.cold.id,
          quantity: 2000,
          pricePer1000: 6510,
          receivedOn: addDays(context.clock.today(), 0),
          supplierId: kitchen.suppliers.butcher.id,
          origin: 'purchase',
        }),
      );
      return kitchen.articles.entrecote.id;
    });
    expect(await screen.findByText(t.priceUp('5 %'))).toBeTruthy();
    expect(within(tile(t.lastPrice)).getByText('65.10 / kg')).toBeTruthy();
    expect(
      screen.getByRole('img', {
        name: t.chartSummary(2, 'CHF 62.00 / kg', 'CHF 65.10 / kg'),
      }),
    ).toBeTruthy();
    const history = screen.getByRole('table', { name: t.historyCaption });
    expect(within(history).getByText('+5 %')).toBeTruthy();
    expect(within(history).getAllByRole('row')).toHaveLength(3);
    expect(within(screen.getByRole('link', { name: /Bestand/ })).getByText('6 kg')).toBeTruthy();
  });

  it('lists the last five purchases and the rest on request', async () => {
    const { user } = await renderDetail(async ({ t: context, kitchen }) => {
      const ledger = createStockLedger(context.ctx);
      await context.storage.transaction(async () => {
        // Six more purchases: seven in all.
        for (let day = 1; day <= 6; day += 1) {
          await ledger.receive({
            businessId: context.businessId,
            articleId: kitchen.articles.entrecote.id,
            areaId: kitchen.areas.cold.id,
            quantity: 1000,
            pricePer1000: 6200 + day * 10,
            receivedOn: addDays(context.clock.today(), day),
            origin: 'purchase',
          });
        }
      });
      return kitchen.articles.entrecote.id;
    });
    const history = await screen.findByRole('table', { name: t.historyCaption });
    expect(within(history).getAllByRole('rowheader')).toHaveLength(5);
    expect(within(history).getByText('20.11.2026')).toBeTruthy();
    expect(within(history).queryByText('13.11.2026')).toBeNull();
    await user.click(screen.getByRole('button', { name: t.historyShowAll(7) }));
    expect(within(history).getAllByRole('rowheader')).toHaveLength(7);
    expect(within(history).getByText('13.11.2026')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: t.historyShowLess }));
    expect(within(history).getAllByRole('rowheader')).toHaveLength(5);
  });

  it('says that the origin is missing until a country is chosen', async () => {
    const { t: context, articleId } = await renderDetail(async ({ t: context }) => {
      const created = await context.useCases['articles.create']({
        commandId: context.cmd(),
        businessId: context.businessId,
        name: 'Kalbsfilet',
        categoryId: 'meat',
        unit: 'g',
        pricePer1000: 8900,
      });
      return created.articleId;
    });
    expect(await screen.findByRole('heading', { level: 1, name: 'Kalbsfilet' })).toBeTruthy();
    expect(screen.getByText(t.open)).toBeTruthy();
    expect(screen.getByText(t.openTexts.origin)).toBeTruthy();
    expect(screen.getByText(t.openTexts.supplier)).toBeTruthy();
    expect(screen.queryByText(t.openTexts.price)).toBeNull();
    expect(screen.getByRole('link', { name: t.complete }).getAttribute('href')).toBe(
      paths.articleEdit(articleId),
    );
    expect(screen.getByText(t.originMissing)).toBeTruthy();
    expect(screen.getByText(t.noHistory)).toBeTruthy();
    expect(screen.getByText(t.usedInNone)).toBeTruthy();

    await context.useCases['articles.update']({
      commandId: context.cmd(),
      businessId: context.businessId,
      articleId,
      originCountry: 'CH',
    });
    // The page follows the data: the origin is there, the supplier still open.
    expect(await screen.findByText('Schweiz')).toBeTruthy();
    expect(screen.queryByText(t.openTexts.origin)).toBeNull();
    expect(screen.getByText(t.openTexts.supplier)).toBeTruthy();
  });

  it('shows a component with the recipe that makes it and what it declares', async () => {
    const { kitchen } = await renderDetail((view) => view.kitchen.articles.jus.id);
    expect(await screen.findByRole('heading', { level: 1, name: 'Rotweinjus' })).toBeTruthy();
    // No production yet: CHF 7.89 a litre from the prices of the ingredients.
    expect(within(tile(t.recipePrice)).getByText('7.89 / l')).toBeTruthy();
    expect(within(tile(t.recipePrice)).getByText(t.fromRecipe)).toBeTruthy();
    expect(screen.getByText(t.declarationFromRecipe)).toBeTruthy();
    const allergens = screen.getByRole('list', { name: 'Allergene' });
    expect(
      within(allergens)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Milch', 'Sulfite']);
    expect(screen.getByText('Vegetarisch')).toBeTruthy();
    expect(screen.getByText(t.madeByBatch('Rotweinjus', '1 l'), { exact: false })).toBeTruthy();
    expect(screen.getByRole('link', { name: t.openRecipe }).getAttribute('href')).toBe(
      paths.recipe(kitchen.recipes.jus.id),
    );
    expect(screen.getByText(t.perPortions('5 dl', 10))).toBeTruthy();
    expect(screen.getByText(t.noHistoryPrepared)).toBeTruthy();
    // A component has no supplier, and none is missing.
    expect(screen.queryByText(t.facts.supplier)).toBeNull();
    expect(screen.queryByText(t.open)).toBeNull();
  });

  it('refuses to delete an article with stock in words a cook understands, and offers to set it inactive', async () => {
    const {
      user,
      t: context,
      articleId,
    } = await renderDetail((view) => view.kitchen.articles.entrecote.id);
    await user.click(await screen.findByRole('button', { name: t.remove }));
    const dialog = await screen.findByRole('dialog', { name: t.blockedTitle('Rindsentrecôte') });
    expect(
      within(dialog).getByText(
        'Es sind noch 4 kg an Lager. Verbrauche den Bestand oder schreib ihn ab.',
      ),
    ).toBeTruthy();
    expect(
      within(dialog).getByText('1 Rezept rechnet mit dem Artikel. Nimm ihn dort zuerst heraus.'),
    ).toBeTruthy();
    expect(within(dialog).getByText(t.blockedAdvice)).toBeTruthy();
    // Nothing was deleted.
    expect(await context.storage.articles.get(articleId)).not.toHaveProperty('deletedAt');

    await user.click(within(dialog).getByRole('button', { name: t.deactivate }));
    expect(await screen.findByText(t.inactiveNotice)).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect((await context.storage.articles.get(articleId))?.active).toBe(false);
    // The toast offers the way back.
    expect(screen.getByText(t.deactivated('Rindsentrecôte'))).toBeTruthy();
    await user.click(screen.getByRole('button', { name: messages.actions.undo }));
    await waitFor(() => {
      expect(screen.queryByText(t.inactiveNotice)).toBeNull();
    });
    expect((await context.storage.articles.get(articleId))?.active).toBe(true);
  });

  it('sets an article inactive and active again', async () => {
    const {
      user,
      t: context,
      articleId,
    } = await renderDetail((view) => view.kitchen.articles.eggs.id);
    await user.click(await screen.findByRole('button', { name: t.deactivate }));
    expect(await screen.findByRole('button', { name: t.activate })).toBeTruthy();
    expect(screen.getByText(t.inactiveNotice)).toBeTruthy();
    expect((await context.storage.articles.get(articleId))?.active).toBe(false);
    await user.click(screen.getByRole('button', { name: t.activate }));
    expect(await screen.findByRole('button', { name: t.deactivate })).toBeTruthy();
    expect((await context.storage.articles.get(articleId))?.active).toBe(true);
  });

  it('deletes an article nothing holds, after asking, and goes back to the list', async () => {
    const {
      user,
      t: context,
      articleId,
      router,
    } = await renderDetail(async ({ t: context }) => {
      const created = await context.useCases['articles.create']({
        commandId: context.cmd(),
        businessId: context.businessId,
        name: 'Trüffel',
        categoryId: 'vegetables',
        unit: 'g',
      });
      return created.articleId;
    });
    await user.click(await screen.findByRole('button', { name: t.remove }));
    const dialog = await screen.findByRole('alertdialog', { name: t.removeTitle('Trüffel') });
    expect(within(dialog).getByText(t.removeText)).toBeTruthy();
    // «Abbrechen» keeps the article.
    await user.click(within(dialog).getByRole('button', { name: messages.actions.cancel }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(await context.storage.articles.get(articleId)).not.toHaveProperty('deletedAt');

    await user.click(screen.getByRole('button', { name: t.remove }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: t.remove }),
    );
    expect(await screen.findByText('Liste der Artikel')).toBeTruthy();
    expect(router.state.location.pathname).toBe(paths.articles());
    expect(await context.storage.articles.get(articleId)).toHaveProperty('deletedAt');
  });

  it('says so when the article does not exist', async () => {
    const { router } = await renderDetail((view) => view.t.cmd());
    expect(await screen.findByText(messages.errors.notFoundText)).toBeTruthy();
    await router.navigate(paths.article('kein-artikel'));
    expect(await screen.findByText(messages.errors.notFoundText)).toBeTruthy();
  });
});
