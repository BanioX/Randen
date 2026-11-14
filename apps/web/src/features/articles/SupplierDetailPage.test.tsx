import type { Id } from '@randen/core';
import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { messages } from '../../app/messages';
import { paths } from '../../app/paths';
import { renderApp, type AppView } from '../../app/test-helpers';
import { articlesMessages } from './messages';
import { SupplierDetailPage } from './SupplierDetailPage';

const t = articlesMessages.suppliers;
const d = t.detail;

async function renderDetail(pick: (view: AppView) => Id | Promise<Id>) {
  const view = await renderApp(<SupplierDetailPage />, {
    route: '/',
    path: '/suppliers/:supplierId',
    routes: [
      { path: '/', element: <p>Start</p> },
      { path: '/suppliers', element: <p>Liste der Lieferanten</p> },
    ],
  });
  const supplierId = await pick(view);
  await view.router.navigate(paths.supplier(supplierId));
  return { ...view, supplierId };
}

describe('SupplierDetailPage', () => {
  it('shows days, contact and the articles of a supplier', async () => {
    const { kitchen } = await renderDetail(async ({ t: context, kitchen }) => {
      await context.useCases['suppliers.update']({
        commandId: context.cmd(),
        businessId: context.businessId,
        supplierId: kitchen.suppliers.butcher.id,
        phone: '044 000 00 00',
        email: 'bestellung@metzgerei-muster.example',
        customerNumber: 'K-1042',
        minOrderRappen: 15_000,
        note: 'Bestellung bis 14 Uhr.',
      });
      return kitchen.suppliers.butcher.id;
    });
    expect(await screen.findByRole('heading', { level: 1, name: 'Metzgerei Muster' })).toBeTruthy();
    // Saturday, 14.11.2026: the next order day is Monday, the next delivery Tuesday.
    expect(screen.getByText('Mo, in 2 Tagen')).toBeTruthy();
    expect(screen.getByText('Di, in 3 Tagen')).toBeTruthy();
    expect(screen.getByText('150.00')).toBeTruthy();
    // The week is read out by name.
    expect(screen.getByText('Bestelltage: Montag, Donnerstag')).toBeTruthy();
    expect(screen.getByText('Liefertage: Dienstag, Freitag')).toBeTruthy();

    expect(screen.getByRole('link', { name: d.call('044 000 00 00') }).getAttribute('href')).toBe(
      'tel:0440000000',
    );
    expect(
      screen
        .getByRole('link', { name: d.write('bestellung@metzgerei-muster.example') })
        .getAttribute('href'),
    ).toBe('mailto:bestellung@metzgerei-muster.example');
    expect(screen.getByText('K-1042')).toBeTruthy();
    expect(screen.getByText('Bestellung bis 14 Uhr.')).toBeTruthy();

    const articles = screen.getByRole('table', { name: d.articlesCaption });
    const entrecote = within(articles).getByRole('row', { name: /Rindsentrecôte/ });
    expect(within(entrecote).getByText('4 kg')).toBeTruthy();
    expect(within(entrecote).getByText('CHF 62.00 / kg')).toBeTruthy();
    expect(within(entrecote).getByRole('link').getAttribute('href')).toBe(
      paths.article(kitchen.articles.entrecote.id),
    );
    // The supplier pages lead back to the articles.
    expect(screen.getByRole('link', { name: d.allArticles }).getAttribute('href')).toBe(
      paths.articles(),
    );
  });

  it('marks the articles that run low', async () => {
    await renderDetail((view) => view.kitchen.suppliers.wholesaler.id);
    const articles = await screen.findByRole('table', { name: d.articlesCaption });
    expect(within(articles).getAllByRole('rowheader')).toHaveLength(8);
    const flour = within(articles).getByRole('row', { name: /Weissmehl/ });
    expect(within(flour).getByText('3 kg')).toBeTruthy();
    expect(within(flour).getByText('Mindestbestand 5 kg')).toBeTruthy();
    expect(screen.getByText(d.noContact)).toBeTruthy();
  });

  it('edits the supplier in a sheet', async () => {
    const {
      user,
      t: context,
      supplierId,
    } = await renderDetail((view) => view.kitchen.suppliers.butcher.id);
    await user.click(await screen.findByRole('button', { name: d.edit }));
    const sheet = await screen.findByRole('dialog', { name: t.form.editTitle });
    expect(within(sheet).getByLabelText<HTMLInputElement>(t.form.name).value).toBe(
      'Metzgerei Muster',
    );
    const orderDays = within(sheet).getByRole('group', { name: t.form.orderDays });
    expect(within(orderDays).getByRole<HTMLInputElement>('checkbox', { name: 'Mo' }).checked).toBe(
      true,
    );
    // Orders on Saturday too, and a phone number.
    await user.click(within(orderDays).getByRole('checkbox', { name: 'Sa' }));
    await user.type(within(sheet).getByLabelText(t.form.phone), '044 000 00 00');
    await user.click(within(sheet).getByRole('button', { name: t.form.save }));

    // Saved: the sheet is gone and the page shows the new facts.
    expect(await screen.findByRole('link', { name: d.call('044 000 00 00') })).toBeTruthy();
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(screen.getByText('Sa, heute')).toBeTruthy();
    expect(screen.getByText('Bestelltage: Montag, Donnerstag, Samstag')).toBeTruthy();
    expect(await context.storage.suppliers.get(supplierId)).toMatchObject({
      phone: '044 000 00 00',
      orderDays: ['mon', 'thu', 'sat'],
    });

    // «Abbrechen» changes nothing.
    await user.click(screen.getByRole('button', { name: d.edit }));
    const again = await screen.findByRole('dialog', { name: t.form.editTitle });
    await user.clear(within(again).getByLabelText(t.form.name));
    await user.click(within(again).getByRole('button', { name: t.form.cancel }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect((await context.storage.suppliers.get(supplierId))?.name).toBe('Metzgerei Muster');
  });

  it('refuses to delete a supplier that articles name, and says what to do', async () => {
    const {
      user,
      t: context,
      supplierId,
    } = await renderDetail((view) => view.kitchen.suppliers.butcher.id);
    await user.click(await screen.findByRole('button', { name: d.remove }));
    const dialog = await screen.findByRole('dialog', { name: d.blockedTitle('Metzgerei Muster') });
    expect(
      within(dialog).getByText(
        '1 Artikel nennt diesen Lieferanten. Trag dort zuerst einen anderen ein.',
      ),
    ).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: d.close }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(await context.storage.suppliers.get(supplierId)).not.toHaveProperty('deletedAt');
  });

  it('deletes a supplier nothing names, after asking, and goes back to the list', async () => {
    const {
      user,
      t: context,
      supplierId,
      router,
    } = await renderDetail(async ({ t: context }) => {
      const created = await context.useCases['suppliers.create']({
        commandId: context.cmd(),
        businessId: context.businessId,
        name: 'Wochenmarkt',
      });
      return created.supplierId;
    });
    expect(await screen.findByText(d.noArticles)).toBeTruthy();
    expect(screen.getByText('Bestelltage: keine festen Tage')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: d.remove }));
    const dialog = await screen.findByRole('alertdialog', { name: d.removeTitle('Wochenmarkt') });
    expect(within(dialog).getByText(d.removeText)).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: d.remove }));
    expect(await screen.findByText('Liste der Lieferanten')).toBeTruthy();
    expect(router.state.location.pathname).toBe(paths.suppliers());
    expect(await context.storage.suppliers.get(supplierId)).toHaveProperty('deletedAt');
  });

  it('says so when the supplier does not exist', async () => {
    const { router } = await renderDetail((view) => view.t.cmd());
    expect(await screen.findByText(messages.errors.notFoundText)).toBeTruthy();
    await router.navigate(paths.supplier('kein-lieferant'));
    expect(await screen.findByText(messages.errors.notFoundText)).toBeTruthy();
  });
});
