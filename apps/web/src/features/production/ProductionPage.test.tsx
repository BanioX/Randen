import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { paths } from '../../app/paths';
import { renderApp } from '../../app/test-helpers';
import { productionMessages } from './messages';
import { ProductionPage } from './ProductionPage';

const t = productionMessages;

async function renderList() {
  const view = await renderApp(<ProductionPage />, {
    route: paths.production(),
    path: '/production',
  });
  await screen.findByRole('heading', { level: 1, name: t.production.title });
  return view;
}

describe('ProductionPage', () => {
  it('says so when nothing was produced in the last 14 days', async () => {
    await renderList();
    expect(await screen.findByText(t.production.runsEmpty)).toBeTruthy();
    expect(screen.getByRole('link', { name: t.production.newAction }).getAttribute('href')).toBe(
      paths.productionNew(),
    );
  });

  it('lists the runs newest first with their output and the cost', async () => {
    const view = await renderList();
    await view.t.useCases['production.record']({
      commandId: view.t.cmd(),
      businessId: view.t.businessId,
      recipeId: view.kitchen.recipes.jus.id,
      portions: 1,
    });
    const list = await screen.findByRole('list', { name: t.production.runsCaption });
    const row = within(list).getByRole('link', { name: /Rotweinjus/ });
    expect(row.getAttribute('href')).toMatch(/^\/production\//);
    // The day of the run in Swiss form, not as the ISO day of the store.
    expect(within(row).getByText(/14\.11\.2026/)).toBeTruthy();
    expect(within(row).queryByText(/2026-11-14/)).toBeNull();
  });

  it('shows the dishes of today that are still open in the plan, with a button to produce them', async () => {
    const view = await renderList();
    await view.t.useCases['plan.add']({
      commandId: view.t.cmd(),
      businessId: view.t.businessId,
      date: '2026-11-14',
      slot: 'lunch',
      recipeId: view.kitchen.recipes.salmonDish.id,
      portions: 4,
    });
    const today = await screen.findByRole('list', { name: t.production.todayTitle });
    expect(within(today).getByText('Lachs mit Rahmsauce')).toBeTruthy();
    const produce = within(today).getByRole('link', { name: t.production.produce });
    expect(produce.getAttribute('href')).toMatch(/\/production\/new\?recipe=.*&portions=4&entry=/);
  });
});

describe('ProductionPage with the functions of the business', () => {
  it('hides the plan of today when the business does not use the plan', async () => {
    const view = await renderList();
    expect(
      await screen.findByRole('heading', { level: 2, name: t.production.todayTitle }),
    ).toBeTruthy();
    await view.t.useCases['business.update']({
      commandId: view.t.cmd(),
      businessId: view.t.businessId,
      modules: ['production'],
    });
    await waitFor(() => {
      expect(screen.queryByRole('heading', { level: 2, name: t.production.todayTitle })).toBeNull();
    });
    expect(screen.getByRole('heading', { level: 2, name: t.production.runsTitle })).toBeTruthy();
  });
});
