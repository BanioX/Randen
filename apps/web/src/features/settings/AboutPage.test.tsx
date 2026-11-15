import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../../app/test-helpers';
import { AboutPage } from './AboutPage';

describe('Über Randen', () => {
  it('shows the figures of this device, that the data stays here, and that Randen is a help', async () => {
    await renderApp(<AboutPage />, { route: '/more/about', path: '/more/about' });
    expect(await screen.findByRole('heading', { level: 1, name: 'Über Randen' })).toBeTruthy();
    expect(await screen.findByText('Artikel')).toBeTruthy();
    expect(screen.getByText('Lagerbewegungen vom 13.11.2026 bis zum 13.11.2026.')).toBeTruthy();
    expect(screen.getByText('Noch keine Fotos.')).toBeTruthy();
    expect(screen.getByText(/Die Daten bleiben auf diesem Gerät/)).toBeTruthy();
    expect(screen.getByText(/Randen ist ein Hilfsmittel/)).toBeTruthy();
    expect(screen.getByText('Lizenz: proprietär, alle Rechte bei Alban Hyseni.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Styleguide ansehen' }).getAttribute('href')).toBe(
      '/styleguide',
    );
  });

  it('counts the photos and tells their size', async () => {
    const { t, kitchen } = await renderApp(<AboutPage />, {
      route: '/more/about',
      path: '/more/about',
    });
    await screen.findByText('Artikel');
    await t.storage.areas.put({ ...kitchen.areas.dry, photo: 'data:image/png;base64,AAAA' });
    expect(await screen.findByText(/1 Foto, 0 KB/)).toBeTruthy();
  });
});
