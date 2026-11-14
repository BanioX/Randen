import { alive } from '@randen/core';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { paths } from '../../app/paths';
import { renderApp } from '../../app/test-helpers';
import { ArticlesImportPage } from './ArticlesImportPage';
import { articlesMessages } from './messages';

const t = articlesMessages.import;

/** Six lines as a cook pastes them: semicolons, one line from a spreadsheet, one that exists. */
const SIX_LINES = [
  'Rindsfilet; kg; 78.00; Metzgerei Muster',
  'Halbrahm; l; 5.20; Molkerei Beispiel',
  'Wachteleier\tStk\t0.45\tGrosshandel Beispiel',
  'Olivenöl; l; 14,50',
  'Basmatireis; kg',
  'Vollrahm; l; 6.40; Grosshandel Beispiel',
].join('\n');

const field = () => screen.getByLabelText<HTMLTextAreaElement>(t.lines);
/** Pasting sets the whole text at once. */
const paste = (text: string) => {
  fireEvent.change(field(), { target: { value: text } });
};

describe('ArticlesImportPage', () => {
  it('creates five articles from six pasted lines and keeps the bad line with its reason', async () => {
    const {
      user,
      t: context,
      kitchen,
    } = await renderApp(<ArticlesImportPage />, {
      route: paths.articlesImport(),
    });
    await screen.findByRole('heading', { level: 1, name: t.title });
    // Nothing pasted yet: nothing to create.
    expect(screen.getByText(t.empty)).toBeTruthy();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: t.submitNone }).disabled).toBe(
      true,
    );

    paste(SIX_LINES);
    const preview = await screen.findByRole('table', { name: t.caption });
    const rows = within(preview).getAllByRole('row').slice(1);
    expect(
      rows.map((row) => within(row).getByRole('rowheader').firstChild?.firstChild?.textContent),
    ).toEqual(['Rindsfilet', 'Halbrahm', 'Wachteleier', 'Olivenöl', 'Basmatireis']);
    const beef = within(preview).getByRole('row', { name: /Rindsfilet/ });
    expect(within(beef).getByText('CHF 78.00 / kg')).toBeTruthy();
    expect(within(beef).getByText('Metzgerei Muster')).toBeTruthy();
    // The group of goods is guessed from the name.
    expect(within(beef).getByLabelText<HTMLSelectElement>(t.categoryOf('Rindsfilet')).value).toBe(
      'meat',
    );
    expect(within(preview).getByText('CHF 0.45 / Stk.')).toBeTruthy();
    // The dairy is not a supplier yet: the import will create it.
    expect(
      within(within(preview).getByRole('row', { name: /Halbrahm/ })).getByText(t.newSupplier),
    ).toBeTruthy();
    // Without a price the unit still stands there (once for the phone, once in its column).
    expect(
      within(within(preview).getByRole('row', { name: /Basmatireis/ })).getAllByText(
        t.noPrice('kg'),
      ).length,
    ).toBeGreaterThanOrEqual(1);

    // The sixth line exists already: it is shown with its reason and left out.
    const skipped = screen.getByRole('list', { name: t.skippedList });
    expect(within(skipped).getByText('Vollrahm; l; 6.40; Grosshandel Beispiel')).toBeTruthy();
    expect(within(skipped).getByText(t.line(6))).toBeTruthy();
    expect(within(skipped).getByText(t.problems.duplicate)).toBeTruthy();
    expect(screen.getByText(t.skipped(1))).toBeTruthy();
    expect(screen.getByText(t.summary(5, 1, 1))).toBeTruthy();

    // «Basmatireis» is no «Trockenware» for this kitchen: the guess can be corrected.
    await user.selectOptions(screen.getByLabelText(t.categoryOf('Basmatireis')), 'Sonstiges');
    await user.click(screen.getByRole('button', { name: t.submit(5) }));

    expect(await screen.findByText(t.doneTitle(5))).toBeTruthy();
    expect(screen.getByText(t.doneRemaining(1))).toBeTruthy();
    expect(screen.getByRole('link', { name: t.toArticles }).getAttribute('href')).toBe(
      paths.articles(),
    );
    // The bad line stays in the field to be corrected; the five good ones are gone from it.
    expect(field().value).toBe('Vollrahm; l; 6.40; Grosshandel Beispiel');
    await waitFor(() => {
      expect(screen.queryByRole('table', { name: t.caption })).toBeNull();
    });
    expect(screen.getByRole<HTMLButtonElement>('button', { name: t.submitNone }).disabled).toBe(
      true,
    );

    const articles = alive(await context.storage.articles.ofBusiness(context.businessId));
    expect(articles).toHaveLength(15);
    const stored = (name: string) => articles.find((article) => article.name === name);
    expect(stored('Rindsfilet')).toMatchObject({
      categoryId: 'meat',
      unit: 'g',
      pricePer1000: 7800,
      supplierId: kitchen.suppliers.butcher.id,
      areaId: kitchen.areas.cold.id,
      dateKind: 'use_by',
    });
    expect(stored('Wachteleier')).toMatchObject({ unit: 'pcs', pricePer1000: 45_000 });
    expect(stored('Olivenöl')).toMatchObject({
      unit: 'ml',
      pricePer1000: 1450,
      categoryId: 'oils',
    });
    expect(stored('Basmatireis')).toMatchObject({ categoryId: 'other', pricePer1000: 0 });
    // Nothing was created for the line that exists.
    expect(articles.filter((article) => article.name === 'Vollrahm')).toHaveLength(1);
    const suppliers = alive(await context.storage.suppliers.ofBusiness(context.businessId));
    expect(suppliers.map((supplier) => supplier.name).sort()).toEqual([
      'Grosshandel Beispiel',
      'Metzgerei Muster',
      'Molkerei Beispiel',
    ]);
    expect(stored('Halbrahm')?.supplierId).toBe(
      suppliers.find((supplier) => supplier.name === 'Molkerei Beispiel')?.id,
    );
  });

  it('names every reason a line cannot be read', async () => {
    const { t: context } = await renderApp(<ArticlesImportPage />, {
      route: paths.articlesImport(),
    });
    await screen.findByRole('heading', { level: 1, name: t.title });
    paste(['Kalbsfilet', 'Kalbshaxe; kg; teuer', '; kg', 'Butter; kg; 14.00'].join('\n'));
    const skipped = await screen.findByRole('list', { name: t.skippedList });
    expect(within(skipped).getAllByRole('listitem')).toHaveLength(4);
    expect(within(skipped).getByText(t.problems.unit)).toBeTruthy();
    expect(within(skipped).getByText(t.problems.price)).toBeTruthy();
    expect(within(skipped).getByText(t.problems.name)).toBeTruthy();
    expect(within(skipped).getByText(t.problems.duplicate)).toBeTruthy();
    expect(screen.getByText(t.skipped(4))).toBeTruthy();
    // No line works: there is no table and nothing to send.
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: t.submitNone }).disabled).toBe(
      true,
    );
    expect(alive(await context.storage.articles.ofBusiness(context.businessId))).toHaveLength(10);
  });
});
