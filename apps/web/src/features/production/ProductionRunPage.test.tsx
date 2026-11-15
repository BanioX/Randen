import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { paths } from '../../app/paths';
import { renderApp } from '../../app/test-helpers';
import { writeDetailed } from '../../app/view';
import { productionMessages } from './messages';
import { ProductionRunPage } from './ProductionRunPage';

const t = productionMessages;

describe('ProductionRunPage', () => {
  afterEach(() => {
    writeDetailed(true);
  });

  it('traces every lot that went into the Rotweinjus and shows its label', async () => {
    const view = await renderApp(<ProductionRunPage />, {
      route: '/',
      path: '/production/:productionId',
    });
    const result = await view.t.useCases['production.record']({
      commandId: view.t.cmd(),
      businessId: view.t.businessId,
      recipeId: view.kitchen.recipes.jus.id,
      portions: 1,
    });
    await view.router.navigate(paths.productionRun(result.productionId));
    await screen.findByRole('heading', { level: 1, name: 'Rotweinjus' });
    const ins = screen.getByRole('table', { name: t.runPage.insTitle });
    expect(within(ins).getByText('Zwiebeln')).toBeTruthy();
    expect(within(ins).getByText('CHF 0.44')).toBeTruthy();
    expect(within(ins).getByText('CHF 6.75')).toBeTruthy();
    expect(within(ins).getAllByText('Grosshandel Beispiel').length).toBeGreaterThan(0);
    // The label: name, dates, quantity, the allergens of the ingredients and a code.
    const label = screen.getByRole('region', { name: t.runPage.labelTitle });
    expect(within(label).getByText(/17\.11\.2026/)).toBeTruthy();
    expect(within(label).getByText(/Milch/)).toBeTruthy();
    // The code of a lot is the last eight characters of its id (core `shortCode`, C2).
    expect(
      within(label).getByText(new RegExp(result.outputLotId?.slice(-8) ?? 'none')),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: t.runPage.labelAction })).toBeTruthy();
  });

  it('says so when the run does not exist', async () => {
    await renderApp(<ProductionRunPage />, {
      route: paths.productionRun('01900000-0000-7000-8000-00000000dead'),
      path: '/production/:productionId',
    });
    expect(await screen.findByText(t.runPage.notFoundText)).toBeTruthy();
  });
});

describe('ProductionRunPage under «Erweitert»', () => {
  it('shows the cost of the run and the value of its lots only in the detailed view', async () => {
    writeDetailed(false);
    const view = await renderApp(<ProductionRunPage />, {
      route: '/',
      path: '/production/:productionId',
    });
    const result = await view.t.useCases['production.record']({
      commandId: view.t.cmd(),
      businessId: view.t.businessId,
      recipeId: view.kitchen.recipes.jus.id,
      portions: 1,
    });
    await view.router.navigate(paths.productionRun(result.productionId));
    const ins = await screen.findByRole('table', { name: t.runPage.insTitle });
    expect(within(ins).getByText('Zwiebeln')).toBeTruthy();
    expect(screen.queryByText(t.runPage.statCost)).toBeNull();
    expect(screen.queryByText(t.runPage.statPerPortion)).toBeNull();
    expect(within(ins).queryByRole('columnheader', { name: t.runPage.columns.value })).toBeNull();
    expect(within(ins).queryByText('CHF 0.44')).toBeNull();
    // The essentials stay: the portions and the lot.
    expect(screen.getByText(t.runPage.statPortions)).toBeTruthy();
    writeDetailed(true);
    await waitFor(() => {
      expect(screen.getByText(t.runPage.statCost)).toBeTruthy();
    });
    expect(within(ins).getByRole('columnheader', { name: t.runPage.columns.value })).toBeTruthy();
    expect(within(ins).getByText('CHF 0.44')).toBeTruthy();
  });
});
