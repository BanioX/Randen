import type { ModuleId } from '@randen/core';
import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { renderApp } from '../../app/test-helpers';
import { AddPage } from './AddPage';
import { cockpitRoutes } from './routes';

afterEach(() => {
  window.localStorage.clear();
});

/** The test kitchen with these functions (ADR-0015), once the page follows them. */
async function openWith(modules: ModuleId[], expectedRows: number) {
  const view = await renderApp(<AddPage />, { route: '/add' });
  await screen.findByRole('region', { name: 'Buchen' });
  await view.t.useCases['business.update']({
    commandId: view.t.cmd(),
    businessId: view.t.businessId,
    modules,
  });
  const book = screen.getByRole('region', { name: 'Buchen' });
  await waitFor(() => {
    expect(within(book).getAllByRole('link')).toHaveLength(expectedRows);
  });
  return book;
}

const href = (name: RegExp) => screen.getByRole('link', { name }).getAttribute('href');
const titles = (region: HTMLElement) =>
  within(region)
    .getAllByRole('link')
    .map((link) => link.querySelector('.font-semibold')?.textContent ?? '');

describe('AddPage («Erfassen»)', () => {
  it('offers a canteen with every function every way to book, one large row each', async () => {
    // The test kitchen has no list of functions: everything is on, as for a canteen.
    await renderApp(<AddPage />, { route: '/add' });
    expect(await screen.findByRole('heading', { level: 1, name: 'Erfassen' })).toBeTruthy();
    const book = screen.getByRole('region', { name: 'Buchen' });
    expect(within(book).getAllByRole('link')).toHaveLength(9);
    expect(href(/^Wareneingang/)).toBe('/stock/receive');
    expect(href(/^Einkauf erfassen/)).toBe('/stock/receive');
    expect(href(/^Abschreiben/)).toBe('/stock/waste');
    expect(href(/^Temperatur/)).toBe('/haccp/temperatures');
    expect(href(/^Fehlt/)).toBe('/purchasing');
    expect(screen.getByText('Auf die Einkaufsliste setzen, was ausgegangen ist.')).toBeTruthy();
    expect(href(/^Produktion/)).toBe('/production/new');
    expect(href(/^Mahlzeiten/)).toBe('/plan');
    expect(href(/^Verkäufe/)).toBe('/numbers/sales');
    expect(href(/^Inventur/)).toBe('/stock/count');
    // Delivered goods first where the kitchen orders ahead.
    expect(within(book).getAllByRole('link')[0]?.textContent).toMatch(/^Wareneingang/);
    const create = screen.getByRole('region', { name: 'Neu erfassen' });
    expect(within(create).getAllByRole('link')).toHaveLength(2);
    expect(href(/^Artikel/)).toBe('/articles/new');
    expect(href(/^Rezept/)).toBe('/recipes/new');
  });

  it('shows a kebab shop the core and its purchase at the market, nothing more', async () => {
    // What «Randen einrichten» proposes for «Imbiss», «Ich hole sie selbst», «Ich allein».
    const book = await openWith(['menu_card', 'market'], 6);
    expect(
      within(book)
        .getAllByRole('link')
        .map((link) => link.getAttribute('href')),
    ).toEqual([
      '/stock/receive',
      '/stock/receive',
      '/stock/waste',
      '/haccp/temperatures',
      '/purchasing',
      '/stock/count',
    ]);
    expect(titles(book)).toEqual([
      'Einkauf erfassen',
      'Wareneingang',
      'Abschreiben',
      'Temperatur',
      'Fehlt',
      'Inventur',
    ]);
    expect(screen.queryByRole('link', { name: /^Produktion/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /^Mahlzeiten/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /^Verkäufe/ })).toBeNull();
  });

  it('lets a kitchen with numbers but no sales of dishes enter its revenue', async () => {
    // A care home: plans and counts meals, orders ahead, numbers, no sales of dishes.
    const book = await openWith(['ordering', 'production', 'planning', 'meals', 'numbers'], 8);
    expect(titles(book)).toEqual([
      'Wareneingang',
      'Abschreiben',
      'Temperatur',
      'Fehlt',
      'Produktion',
      'Mahlzeiten',
      'Umsatz',
      'Inventur',
    ]);
    expect(href(/^Umsatz/)).toBe('/numbers/sales');
    expect(
      screen.getByText('Für die nächste Bestellung vormerken, was ausgegangen ist.'),
    ).toBeTruthy();
  });

  it('is reached at /add and the cockpit at the index', () => {
    expect(cockpitRoutes.map((route) => (route.index === true ? 'index' : route.path))).toEqual([
      'index',
      'add',
    ]);
  });
});
