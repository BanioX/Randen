import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../../app/test-helpers';
import { MorePage } from './MorePage';

const open = (name: string) => screen.findByRole('link', { name: new RegExp(name) });

describe('Mehr (ADR-0015)', () => {
  it('lists the business, the team, the data, the demo and the about page, and who works now', async () => {
    const { kitchen } = await renderApp(<MorePage />, { route: '/more', path: '/more' });
    expect(await screen.findByRole('heading', { level: 1, name: 'Mehr' })).toBeTruthy();
    expect((await open('Du arbeitest als Testperson')).getAttribute('href')).toBe('/more/team');
    expect((await open('^Betrieb')).getAttribute('href')).toBe('/more/business');
    expect((await open('^Team')).getAttribute('href')).toBe('/more/team');
    expect((await open('^Funktionen')).getAttribute('href')).toBe('/more/features');
    expect((await open('^Daten und Sicherung')).getAttribute('href')).toBe('/more/data');
    expect((await open('^Demo-Betrieb')).getAttribute('href')).toBe('/more/demo');
    expect((await open('^Über Randen')).getAttribute('href')).toBe('/more/about');
    // The test kitchen has ten articles; the page does not count them.
    expect(kitchen.articles.salmon).toBeDefined();
  });

  it('hides the team while the function «team» is off, and keeps the business rows', async () => {
    const { t } = await renderApp(<MorePage />, { route: '/more', path: '/more' });
    await open('^Daten und Sicherung');
    expect(screen.getByRole('link', { name: /^Team/ })).toBeTruthy();
    await t.useCases['business.update']({
      commandId: t.cmd(),
      businessId: t.businessId,
      modules: ['menu_card', 'ordering'],
    });
    await waitFor(() => {
      expect(screen.queryByRole('link', { name: /^Team/ })).toBeNull();
    });
    expect(screen.queryByRole('link', { name: /Du arbeitest als/ })).toBeNull();
    expect(screen.getByRole('link', { name: /^Daten und Sicherung/ })).toBeTruthy();
  });
});
