import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { DataTable, type DataTableColumn } from './DataTable';

interface Dish {
  id: string;
  name: string;
  price: string;
  sold: number;
}

const DISHES: Dish[] = [
  { id: 'a', name: 'Randenrisotto', price: 'CHF 24.00', sold: 28 },
  { id: 'b', name: 'Rindstatar', price: 'CHF 28.00', sold: 23 },
];

const COLUMNS: DataTableColumn<Dish>[] = [
  { key: 'name', header: 'Gericht', render: (dish) => dish.name },
  { key: 'sold', header: 'Verkauft', align: 'right', hideBelow: 'md', render: (dish) => dish.sold },
  { key: 'price', header: 'Preis', align: 'right', width: '8rem', render: (dish) => dish.price },
];

function renderTable(props: Partial<Parameters<typeof DataTable<Dish>>[0]> = {}) {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: (
          <DataTable
            caption="Gerichte dieser Woche"
            columns={COLUMNS}
            rows={DISHES}
            getRowKey={(dish) => dish.id}
            {...props}
          />
        ),
      },
      { path: '/recipes/:id', element: <p>Rezept geöffnet</p> },
    ],
    { initialEntries: ['/'] },
  );
  return { router, ...render(<RouterProvider router={router} />) };
}

describe('DataTable', () => {
  it('is a real table with a caption, column headers and a row header per row', () => {
    renderTable();
    const table = screen.getByRole('table', { name: 'Gerichte dieser Woche' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((header) => header.textContent),
    ).toEqual(['Gericht', 'Verkauft', 'Preis']);
    expect(
      within(table)
        .getAllByRole('rowheader')
        .map((header) => header.textContent),
    ).toEqual(['Randenrisotto', 'Rindstatar']);
    expect(within(table).getByRole('cell', { name: 'CHF 24.00' })).toBeTruthy();
  });

  it('aligns figures to the right in tabular numbers and keeps them on one line', () => {
    renderTable();
    for (const element of [
      screen.getByRole('columnheader', { name: 'Preis' }),
      screen.getByRole('cell', { name: 'CHF 28.00' }),
    ]) {
      expect(element.className).toContain('text-right');
      expect(element.className).toContain('tabular-nums');
      expect(element.className).toContain('whitespace-nowrap');
    }
    expect(screen.getByRole('columnheader', { name: 'Gericht' }).className).toContain('text-left');
  });

  it('hides a column below its breakpoint and sets a column width', () => {
    const { container } = renderTable();
    expect(screen.getByRole('columnheader', { name: 'Verkauft' }).className).toContain(
      'hidden md:table-cell',
    );
    expect(screen.getByRole('cell', { name: '28' }).className).toContain('hidden md:table-cell');
    const cols = container.querySelectorAll('col');
    expect(cols).toHaveLength(3);
    expect(cols[2]?.style.width).toBe('8rem');
  });

  it('scrolls inside its own labelled, focusable region', () => {
    renderTable({ maxHeight: '20rem' });
    const region = screen.getByRole('region', { name: 'Gerichte dieser Woche' });
    expect(region.tabIndex).toBe(0);
    expect(region.className).toContain('relative');
    expect(region.className).toContain('min-w-0');
    expect(region.className).toContain('overflow-auto');
    expect(region.style.maxHeight).toBe('20rem');
    expect(screen.getByRole('columnheader', { name: 'Gericht' }).className).toContain('sticky');
  });

  it('keeps the caption for screen readers when it is hidden', () => {
    renderTable({ hideCaption: true });
    const table = screen.getByRole('table', { name: 'Gerichte dieser Woche' });
    expect(table.querySelector('caption')?.className).toBe('sr-only');
  });

  it('turns the first cell into the link of the row', async () => {
    renderTable({ rowLink: (dish) => `/recipes/${dish.id}` });
    const link = screen.getByRole('link', { name: 'Randenrisotto' });
    expect(link.getAttribute('href')).toBe('/recipes/a');
    expect(link.closest('tr')?.className).toContain('hover:bg-surface-muted');
    await userEvent.setup().click(link);
    expect(await screen.findByText('Rezept geöffnet')).toBeTruthy();
  });

  it('follows the link of the row when another cell is clicked', async () => {
    const { router } = renderTable({ rowLink: (dish) => `/recipes/${dish.id}` });
    await userEvent.setup().click(screen.getByRole('cell', { name: 'CHF 28.00' }));
    expect(await screen.findByText('Rezept geöffnet')).toBeTruthy();
    expect(router.state.location.pathname).toBe('/recipes/b');
  });

  it('leaves rows without a target alone', async () => {
    const { router } = renderTable({
      rowLink: (dish) => (dish.id === 'a' ? '/recipes/a' : undefined),
    });
    expect(screen.queryByRole('link', { name: 'Rindstatar' })).toBeNull();
    await userEvent.setup().click(screen.getByRole('cell', { name: 'CHF 28.00' }));
    expect(router.state.location.pathname).toBe('/');
  });

  it('shows the totals in a footer row, by column key', () => {
    renderTable({ footer: { name: 'Total', sold: 51 } });
    const footer = screen.getByRole('table').querySelector('tfoot');
    expect(footer).not.toBeNull();
    const cells = [...(footer?.querySelectorAll('th, td') ?? [])].map((cell) => cell.textContent);
    expect(cells).toEqual(['Total', '51', '']);
    expect(footer?.querySelector('td')?.className).toContain('text-right');
  });

  it('says so when there are no rows, and drops the totals', () => {
    renderTable({ rows: [], empty: 'Noch keine Gerichte.', footer: { name: 'Total' } });
    const table = screen.getByRole('table', { name: 'Gerichte dieser Woche' });
    expect(within(table).getAllByRole('columnheader')).toHaveLength(3);
    const cell = within(table).getByRole('cell', { name: 'Noch keine Gerichte.' });
    expect(cell.getAttribute('colspan')).toBe('3');
    expect(table.querySelector('tfoot')).toBeNull();
  });

  it('has a standard sentence for an empty table', () => {
    renderTable({ rows: [] });
    expect(screen.getByRole('cell', { name: 'Noch keine Einträge.' })).toBeTruthy();
  });
});
