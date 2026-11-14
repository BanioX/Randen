import { alive } from '@randen/core';
import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { messages } from '../../app/messages';
import { paths } from '../../app/paths';
import { renderApp } from '../../app/test-helpers';
import { articlesMessages } from './messages';
import { SupplierDetailPage } from './SupplierDetailPage';
import { SupplierNewPage } from './SupplierNewPage';
import { SuppliersPage } from './SuppliersPage';

const t = articlesMessages.suppliers;

describe('SuppliersPage', () => {
  it('lists the suppliers with their articles and the next order day', async () => {
    const { kitchen } = await renderApp(<SuppliersPage />, { route: paths.suppliers() });
    const table = await screen.findByRole('table', { name: t.caption });
    // Today is Saturday, 14.11.2026: orders on Monday, deliveries on Tuesday.
    const wholesaler = within(table).getByRole('row', { name: /Grosshandel Beispiel/ });
    expect(within(wholesaler).getByText('8')).toBeTruthy();
    expect(within(wholesaler).getByText(t.belowMin(1))).toBeTruthy();
    expect(within(wholesaler).getByText('Mo, in 2 Tagen')).toBeTruthy();
    expect(within(wholesaler).getByText('Di, in 3 Tagen')).toBeTruthy();
    const butcher = within(table).getByRole('row', { name: /Metzgerei Muster/ });
    expect(within(butcher).getByText('1')).toBeTruthy();
    expect(within(butcher).getByRole('link').getAttribute('href')).toBe(
      paths.supplier(kitchen.suppliers.butcher.id),
    );

    // The same for the thumb.
    const list = screen.getByRole('list', { name: t.caption });
    expect(
      within(list).getByRole('link', {
        name: /Metzgerei Muster.*1 Artikel · Bestellen: Mo, in 2 Tagen/,
      }),
    ).toBeTruthy();
    // Suppliers hang off the articles: the header leads back.
    expect(screen.getByRole('link', { name: t.toArticles }).getAttribute('href')).toBe(
      paths.articles(),
    );
    expect(screen.getByRole('link', { name: t.create }).getAttribute('href')).toBe(
      paths.supplierNew(),
    );
  });

  it('searches by name and says when nothing fits', async () => {
    const { user, router } = await renderApp(<SuppliersPage />, { route: paths.suppliers() });
    const search = await screen.findByRole('searchbox', { name: t.search });
    await user.type(search, 'metzg');
    await waitFor(() => {
      expect(
        within(screen.getByRole('table', { name: t.caption })).getAllByRole('rowheader'),
      ).toHaveLength(1);
    });
    expect(router.state.location.search).toBe('?q=metzg');
    await user.type(search, 'xyz');
    expect(await screen.findByText(t.noMatch)).toBeTruthy();
  });

  it('invites to the first supplier while there is none', async () => {
    const { t: context } = await renderApp(<SuppliersPage />, { route: paths.suppliers() });
    await screen.findByRole('table', { name: t.caption });
    const now = context.clock.now();
    for (const supplier of await context.storage.suppliers.ofBusiness(context.businessId)) {
      await context.storage.suppliers.put({ ...supplier, deletedAt: now });
    }
    expect(await screen.findByText(t.emptyTitle)).toBeTruthy();
    expect(screen.getAllByRole('link', { name: t.create })).toHaveLength(1);
  });
});

describe('SupplierNewPage', () => {
  it('creates a supplier with contact and days and opens it', async () => {
    const {
      user,
      t: context,
      router,
    } = await renderApp(<SupplierNewPage />, {
      route: paths.supplierNew(),
      path: '/suppliers/new',
      routes: [{ path: '/suppliers/:supplierId', element: <SupplierDetailPage /> }],
    });
    await screen.findByRole('heading', { level: 1, name: t.form.createTitle });
    await user.type(screen.getByLabelText(t.form.name), 'Gemüsehof Beispiel');
    await user.type(screen.getByLabelText(t.form.phone), '044 000 00 00');
    await user.type(screen.getByLabelText(t.form.email), 'keine adresse');
    const orderDays = screen.getByRole('group', { name: t.form.orderDays });
    await user.click(within(orderDays).getByRole('checkbox', { name: 'Fr' }));
    await user.click(within(orderDays).getByRole('checkbox', { name: 'Mo' }));
    const deliveryDays = screen.getByRole('group', { name: t.form.deliveryDays });
    await user.click(within(deliveryDays).getByRole('checkbox', { name: 'Sa' }));
    await user.type(screen.getByLabelText(t.form.minOrder), '150');

    // An address that is none stops the form and says so at the field.
    await user.click(screen.getByRole('button', { name: t.form.save }));
    expect(await screen.findByText(t.form.emailInvalid)).toBeTruthy();
    expect(alive(await context.storage.suppliers.ofBusiness(context.businessId))).toHaveLength(2);

    await user.clear(screen.getByLabelText(t.form.email));
    await user.type(screen.getByLabelText(t.form.email), 'bestellung@gemuesehof.example');
    await user.click(screen.getByRole('button', { name: t.form.save }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Gemüsehof Beispiel' }),
    ).toBeTruthy();
    const stored = alive(await context.storage.suppliers.ofBusiness(context.businessId)).find(
      (supplier) => supplier.name === 'Gemüsehof Beispiel',
    );
    expect(stored).toMatchObject({
      phone: '044 000 00 00',
      email: 'bestellung@gemuesehof.example',
      orderDays: ['mon', 'fri'],
      deliveryDays: ['sat'],
      minOrderRappen: 15_000,
    });
    expect(router.state.location.pathname).toBe(paths.supplier(stored?.id ?? ''));
    // Saturday is today: the next delivery day.
    expect(screen.getByText('Sa, heute')).toBeTruthy();
  });

  it('refuses a name that exists and says so at the field', async () => {
    const { user, t: context } = await renderApp(<SupplierNewPage />, {
      route: paths.supplierNew(),
    });
    await screen.findByRole('heading', { level: 1, name: t.form.createTitle });
    await user.type(screen.getByLabelText(t.form.name), 'metzgerei muster');
    await user.click(screen.getByRole('button', { name: t.form.save }));
    expect(await screen.findByText(t.form.duplicate)).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toBe(messages.errors.codes.duplicate_name);
    expect(alive(await context.storage.suppliers.ofBusiness(context.businessId))).toHaveLength(2);
  });
});
