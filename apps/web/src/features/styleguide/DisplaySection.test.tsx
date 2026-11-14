import { screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../app/test-helpers';
import { DisplaySection } from './DisplaySection';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('DisplaySection (style guide)', () => {
  it('renders every building block without an error or a warning', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const warnings = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await renderApp(<DisplaySection />, { route: '/styleguide' });

    for (const title of [
      'Seitenkopf und Aktionen',
      'Kennzahlen',
      'Listen',
      'Chips und Auszeichnungen',
      'Hinweise',
      'Tabelle',
      'Dialoge und Meldungen',
      'Diagramme',
      'Bilder',
    ]) {
      expect(await screen.findByRole('heading', { level: 2, name: title })).toBeTruthy();
    }
    expect(errors).not.toHaveBeenCalled();
    expect(warnings).not.toHaveBeenCalled();
  });

  it('shows the cockpit row with the four key figures of the kitchen', async () => {
    await renderApp(<DisplaySection />);
    const figures = await screen.findByRole('region', { name: 'Kennzahlen' });
    expect(within(figures).getByText('18’420.50')).toBeTruthy();
    expect(within(figures).getByText('31.2 %')).toBeTruthy();
    expect(within(figures).getByText('212.40')).toBeTruthy();
    expect(within(figures).getByText('Läuft heute ab')).toBeTruthy();
    expect(within(figures).getByText('6')).toBeTruthy();
  });

  it('lists stock lots with an expiry chip for every status on the fixed day', async () => {
    await renderApp(<DisplaySection />);
    const lots = await screen.findByRole('region', { name: 'Kühlzelle 1' });
    const rows = within(lots)
      .getAllByRole('listitem')
      .map((row) => row.textContent);
    expect(rows).toEqual([
      'Lachsfilet1.8 kg · Schublade Fischabgelaufen seit gestern',
      'Rindsfilet2.4 kg · Regal 2, obenVerbrauchsdatum: heute',
      'Vollrahm 35 %6 l · Regal 1Verbrauchsdatum: in 2 Tagen',
      'Joghurt nature3 kg · Regal 1MHD überschritten seit 3 Tagen',
      'Kochbutter5 kg · Regal 3Mindesthaltbarkeit: in 12 Tagen',
      'Kalbsfond, Eigenproduktion4 l · Regal 2, unten',
    ]);
  });

  it('computes the dishes of the table with the rules of the core and filters them', async () => {
    const { user } = await renderApp(<DisplaySection />);
    const table = await screen.findByRole('table', { name: 'Gerichte dieser Woche' });
    const row = (name: string) => within(table).getByRole('rowheader', { name }).closest('tr');
    expect(row('Kürbissuppe mit Kernöl')?.textContent).toContain('20.3 %, im Ziel');
    expect(row('Rindstatar')?.textContent).toContain('35.1 %, knapp über dem Ziel');
    expect(row('Zürcher Geschnetzeltes mit Rösti')?.textContent).toContain('38.1 %, über dem Ziel');
    expect(row('Vermicelles mit Meringue')?.textContent).toContain('Preis fehlt');
    expect(row('Kürbissuppe mit Kernöl')?.textContent).toContain('CHF 12.50');
    expect(within(table).getByRole('rowheader', { name: 'Total' }).closest('tr')?.textContent).toBe(
      'Total31.5 %148',
    );

    await user.click(screen.getByRole('radio', { name: 'Über dem Ziel' }));
    expect(
      within(table)
        .getAllByRole('rowheader')
        .map((header) => header.textContent),
    ).toEqual(['Zürcher Geschnetzeltes mit Rösti', 'Rindstatar', 'Total']);
  });

  it('opens the sheet, writes off with a toast and takes it back with «Rückgängig»', async () => {
    const { user } = await renderApp(<DisplaySection />);
    await user.click(await screen.findByRole('button', { name: 'Charge abschreiben' }));
    const sheet = screen.getByRole('dialog', { name: 'Charge abschreiben' });
    await user.click(within(sheet).getByRole('radio', { name: 'Verdorben' }));
    await user.click(within(sheet).getByRole('button', { name: 'Abschreiben' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(await screen.findByText('1.8 kg Lachsfilet abgeschrieben.')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Rückgängig' }));
    expect(await screen.findByText('Abschreiber zurückgenommen.')).toBeTruthy();
    expect(screen.queryByText('1.8 kg Lachsfilet abgeschrieben.')).toBeNull();
  });

  it('asks before deleting and cancels with Escape', async () => {
    const { user } = await renderApp(<DisplaySection />);
    const opener = await screen.findByRole('button', { name: 'Rezept löschen' });
    await user.click(opener);
    expect(screen.getByRole('alertdialog', { name: 'Rezept löschen?' })).toBeTruthy();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.queryByText('Rezept gelöscht.')).toBeNull();

    await user.click(opener);
    const dialog = screen.getByRole('alertdialog', { name: 'Rezept löschen?' });
    await user.click(within(dialog).getByRole('button', { name: 'Löschen' }));
    expect(await screen.findByText('Rezept gelöscht.')).toBeTruthy();
  });

  it('shows a notice in every tone and every chart with a takeaway', async () => {
    await renderApp(<DisplaySection />);
    const notices = await screen.findByRole('region', { name: 'Hinweise' });
    expect(within(notices).getAllByRole('status')).toHaveLength(4);
    expect(within(notices).getAllByRole('alert')).toHaveLength(1);

    const charts = screen.getByRole('region', { name: 'Diagramme' });
    const pictures = within(charts).getAllByRole('img');
    // Three budget bars, write-offs, sales per day, course, menu classes, deliveries.
    expect(pictures).toHaveLength(8);
    for (const picture of pictures) {
      expect((picture.getAttribute('aria-label') ?? '').length).toBeGreaterThan(30);
    }
    expect(within(charts).getAllByRole('table')).toHaveLength(5);
    for (const element of charts.querySelectorAll('svg, svg *')) {
      for (const attribute of element.attributes) {
        expect(attribute.value).not.toMatch(/NaN|Infinity|undefined/);
      }
    }
  });

  it('speaks de-CH: «ss», no exclamation marks, no formal or plural address', async () => {
    const { container } = await renderApp(<DisplaySection />);
    await screen.findByRole('heading', { level: 2, name: 'Diagramme' });
    const text = container.textContent;
    expect(text).not.toContain('ß');
    expect(text).not.toContain('!');
    expect(text).not.toMatch(/\b(ihr|euch|euer|eure[mnrs]?)\b/i);
    expect(text).not.toMatch(/\b(Ihnen|Ihre[mnrs]?)\b/);
  });
});
