import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { paths } from '../../app/paths';
import { renderApp, type AppView } from '../../app/test-helpers';
import { writeDetailed } from '../../app/view';
import { productionMessages } from './messages';
import { ProductionNewPage } from './ProductionNewPage';
import { ProductionRunPage } from './ProductionRunPage';

const t = productionMessages;

/** Opens the form and, if asked, chooses a recipe by its name at the start of the option. */
async function renderForm(
  recipeName?: string,
  route: string = paths.productionNew(),
): Promise<AppView> {
  const view = await renderApp(<ProductionNewPage />, { route, path: '/production/new' });
  await screen.findByRole('heading', { level: 1, name: t.newPage.title });
  if (recipeName !== undefined) {
    await view.user.click(screen.getByLabelText(t.newPage.recipe));
    await view.user.type(screen.getByLabelText(t.newPage.recipe), recipeName);
    await view.user.click(
      await screen.findByRole('option', { name: new RegExp(`^${recipeName}`) }),
    );
  }
  return view;
}

describe('ProductionNewPage', () => {
  it('asks for a recipe first and shows no preview', async () => {
    await renderForm();
    expect(screen.getByText(t.newPage.noRecipe)).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('shows what the Rotweinjus takes and costs, and books it: CHF 7.89 for 1 l with a date three days ahead', async () => {
    const view = await renderForm('Rotweinjus');
    // The batch: 200 g onions, 750 ml wine, 50 g butter: CHF 7.89.
    const table = await screen.findByRole('table', { name: t.newPage.previewCaption });
    expect(within(table).getByText('Zwiebeln')).toBeTruthy();
    expect(within(table).getByText('200 g')).toBeTruthy();
    expect(screen.getByText(t.newPage.summary(1, 'CHF 7.89'))).toBeTruthy();
    // The output is 1 l, due in three days by the business's Richtwert.
    expect(screen.getByText('Richtwert: 3 Tage ab heute')).toBeTruthy();
    await view.user.click(screen.getByRole('button', { name: t.newPage.produceAction }));
    await screen.findByRole('heading', { level: 1, name: t.newPage.produced });
    // The batch costs CHF 7.89, and one portion of one batch as well.
    expect(screen.getAllByText('CHF 7.89')).toHaveLength(2);
    const link = screen.getByRole('link', { name: t.newPage.labelAction });
    expect(link.getAttribute('href')).toMatch(/^\/production\//);
    const runs = await view.t.storage.productions.ofBusiness(view.t.businessId);
    expect(runs).toHaveLength(1);
    const lots = (await view.t.storage.lots.ofBusiness(view.t.businessId)).filter(
      (lot) => lot.origin === 'production',
    );
    expect(lots[0]).toMatchObject({ quantity: 1000, pricePer1000: 789, expiresOn: '2026-11-17' });
  });

  it('books the entrecôte dish without jus: the shortage is shown, booked and does not fail', async () => {
    const view = await renderForm('Entrecôte');
    expect(await screen.findByText(t.newPage.shortages(1))).toBeTruthy();
    const table = screen.getByRole('table', { name: t.newPage.previewCaption });
    // Needed and missing: 500 ml each.
    expect(within(table).getAllByText('500 ml')).toHaveLength(2);
    await view.user.click(screen.getByRole('button', { name: t.newPage.produceAction }));
    await screen.findByRole('heading', { level: 1, name: t.newPage.produced });
    expect(screen.getByText('CHF 133.16')).toBeTruthy();
    const runs = await view.t.storage.productions.ofBusiness(view.t.businessId);
    expect(runs[0]?.shortages).toHaveLength(1);
  });
});

describe('shortage wording', () => {
  it('counts shortages in words, for one and for more', () => {
    expect(t.newPage.shortages(1)).toMatch(/^1 Zutat reicht nicht/);
    expect(t.newPage.shortages(2)).toMatch(/^2 Zutaten reichen nicht/);
  });
});

describe('ProductionNewPage, the portions', () => {
  it('shows the caption «Portionen» above the stepper, not only for screen readers', async () => {
    await renderForm('Rotweinjus');
    const caption = await screen.findByText(t.newPage.portions, { selector: 'p' });
    expect(caption.classList.contains('sr-only')).toBe(false);
  }, 20_000);
});

describe('ProductionNewPage under «Erweitert»', () => {
  afterEach(() => {
    writeDetailed(true);
  });

  it('shows the cost of the batch and of a portion only in the detailed view', async () => {
    writeDetailed(false);
    const view = await renderForm('Rotweinjus');
    await screen.findByRole('table', { name: t.newPage.previewCaption });
    expect(screen.getByText(t.production.portionCount(1))).toBeTruthy();
    expect(screen.queryByText(/Wareneinsatz/)).toBeNull();
    await view.user.click(screen.getByRole('button', { name: t.newPage.produceAction }));
    await screen.findByRole('heading', { level: 1, name: t.newPage.produced });
    expect(screen.queryByText(t.newPage.resultCost)).toBeNull();
    expect(screen.queryByText(t.newPage.resultPerPortion)).toBeNull();
    expect(screen.queryByText('CHF 7.89')).toBeNull();
    expect(screen.getByText(t.newPage.resultShortages)).toBeTruthy();
    writeDetailed(true);
    expect(await screen.findByText(t.newPage.resultCost)).toBeTruthy();
    expect(screen.getAllByText('CHF 7.89')).toHaveLength(2);
  });
});

describe('ProductionNewPage, the label', () => {
  it('opens the run and prints the label at once, not after a second tap', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    const view = await renderApp(<ProductionNewPage />, {
      route: paths.productionNew(),
      path: '/production/new',
      routes: [{ path: '/production/:productionId', element: <ProductionRunPage /> }],
    });
    await screen.findByRole('heading', { level: 1, name: t.newPage.title });
    await view.user.click(screen.getByLabelText(t.newPage.recipe));
    await view.user.type(screen.getByLabelText(t.newPage.recipe), 'Rotweinjus');
    await view.user.click(await screen.findByRole('option', { name: /^Rotweinjus/ }));
    await view.user.click(await screen.findByRole('button', { name: t.newPage.produceAction }));
    await screen.findByRole('heading', { level: 1, name: t.newPage.produced });
    await view.user.click(screen.getByRole('link', { name: t.newPage.labelAction }));
    await screen.findByRole('region', { name: t.runPage.labelTitle });
    await waitFor(() => {
      expect(print).toHaveBeenCalledTimes(1);
    });
    // The request is used up: a reload of the address does not print again.
    expect(view.router.state.location.search).toBe('');
    print.mockRestore();
  }, 20_000);
});
