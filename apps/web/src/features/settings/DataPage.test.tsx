import { screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../app/test-helpers';
import { encryptBackup } from './backup-crypto';
import { DataPage } from './DataPage';
import { reloadApp } from './reload';

vi.mock('./reload', () => ({ reloadApp: vi.fn() }));

/** The files the page saves: captured where the browser would take them. */
let saved: { name: string; blob: Blob }[] = [];
let lastBlob: Blob | undefined;

function firstSaved(): { name: string; blob: Blob } {
  const first = saved[0];
  if (first === undefined) {
    throw new Error('Nothing was saved');
  }
  return first;
}

function text(blob: Blob): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(typeof reader.result === 'string' ? reader.result : '');
    };
    reader.readAsText(blob);
  });
}

beforeEach(() => {
  saved = [];
  lastBlob = undefined;
  vi.mocked(reloadApp).mockClear();
  URL.createObjectURL = vi.fn((blob: Blob) => {
    lastBlob = blob;
    return 'blob:randen-test';
  });
  URL.revokeObjectURL = vi.fn();
  // The browser would start the download here; the name is the one the page set on the link.
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    if (lastBlob !== undefined) {
      saved.push({ name: this.download, blob: lastBlob });
    }
  });
});

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

async function renderData() {
  return renderApp(<DataPage />, { route: '/more/data', path: '/more/data' });
}

describe('Daten und Sicherung (ADR-0006)', () => {
  it('saves the whole business as one file and remembers the day', async () => {
    const { user, t } = await renderData();
    expect(await screen.findByText('Noch nie gesichert.')).toBeTruthy();
    expect(
      screen.getByText('Ob der Browser die Daten dauerhaft behält, lässt sich hier nicht prüfen.'),
    ).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Sicherung herunterladen' }));
    await waitFor(() => {
      expect(saved).toHaveLength(1);
    });
    expect(firstSaved().name).toBe('randen-sicherung-2026-11-14.json');
    const document = JSON.parse(await text(firstSaved().blob)) as {
      format: string;
      business: { name: string; id: string };
      counts: { articles: number };
    };
    expect(document).toMatchObject({ format: 'randen-backup', business: { name: 'Testküche' } });
    expect(document.counts.articles).toBe(10);
    expect(await screen.findByText('Letzte Sicherung heute.')).toBeTruthy();
    expect(window.localStorage.getItem('randen:last-backup')).toBe('2026-11-14');
    expect(document.business.id).toBe(t.businessId);
  });

  it('protects the file with a password, refuses a short or different one, and hides the names', async () => {
    const { user } = await renderData();
    await user.click(await screen.findByRole('switch', { name: /Mit Passwort schützen/ }));
    const password = screen.getByLabelText('Passwort');
    await user.type(password, 'kurz');
    expect(await screen.findByText('Zu kurz. Mindestens 8 Zeichen.')).toBeTruthy();
    await user.clear(password);
    await user.type(password, 'geheim-geheim');
    await user.type(screen.getByLabelText('Passwort wiederholen'), 'anders-anders');
    expect(await screen.findByText('Die beiden Passwörter sind nicht gleich.')).toBeTruthy();
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Sicherung herunterladen' }).disabled,
    ).toBe(true);
    await user.clear(screen.getByLabelText('Passwort wiederholen'));
    await user.type(screen.getByLabelText('Passwort wiederholen'), 'geheim-geheim');
    await user.click(screen.getByRole('button', { name: 'Sicherung herunterladen' }));
    await waitFor(() => {
      expect(saved).toHaveLength(1);
    });
    const file = await text(firstSaved().blob);
    expect(JSON.parse(file)).toMatchObject({ format: 'randen-encrypted', version: 1 });
    expect(file).not.toContain('Testküche');
    expect(file).not.toContain('Rotwein');
    // 600 000 PBKDF2 rounds take a moment, and the password is typed key by key.
  }, 20_000);

  it('reminds calmly once the last backup is 14 days old or more', async () => {
    window.localStorage.setItem('randen:last-backup', '2026-10-30');
    await renderData();
    expect(await screen.findByText('Letzte Sicherung vor 15 Tagen.')).toBeTruthy();
    expect(screen.getByText(/Die letzte Sicherung ist über 14 Tage alt/)).toBeTruthy();
  });

  it('shows no reminder for a backup of the last days', async () => {
    window.localStorage.setItem('randen:last-backup', '2026-11-12');
    await renderData();
    expect(await screen.findByText('Letzte Sicherung vor 2 Tagen.')).toBeTruthy();
    expect(screen.queryByText(/über 14 Tage alt/)).toBeNull();
  });

  it('restores a file after a preview and one confirmation, then starts the app again', async () => {
    const { user, t } = await renderData();
    const document = await t.useCases['settings.export']({ businessId: t.businessId });
    const file = new File([JSON.stringify(document)], 'sicherung.json', {
      type: 'application/json',
    });
    await user.upload(await screen.findByLabelText('Sicherungsdatei wählen'), file);
    expect(await screen.findByText('Die Sicherung ist vollständig.')).toBeTruthy();
    expect(screen.getByText('Testküche')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Sicherung zurückholen' }));
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Zurückholen' }));
    await waitFor(() => {
      expect(reloadApp).toHaveBeenCalledTimes(1);
    });
    expect(await t.storage.businesses.get(t.businessId)).toBeDefined();
  });

  it('refuses a damaged file as a whole and says which row does not fit', async () => {
    const { user, t } = await renderData();
    const document = (await t.useCases['settings.export']({
      businessId: t.businessId,
    })) as unknown as {
      tables: { articles: { pricePer1000: number }[] };
    };
    const first = document.tables.articles[0];
    if (first === undefined) {
      throw new Error('No article');
    }
    first.pricePer1000 = 6200.5;
    const file = new File([JSON.stringify(document)], 'kaputt.json', { type: 'application/json' });
    await user.upload(await screen.findByLabelText('Sicherungsdatei wählen'), file);
    expect(
      await screen.findByText(
        'Diese Sicherung lässt sich nicht zurückholen. Es wurde nichts geändert.',
      ),
    ).toBeTruthy();
    expect(screen.getByText(/in «articles» passt nicht/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Sicherung zurückholen' })).toBeNull();
    expect(reloadApp).not.toHaveBeenCalled();
  });

  it('says what a file that is no backup of Randen is', async () => {
    const { user } = await renderData();
    const file = new File(['Einkaufsliste'], 'liste.json', { type: 'application/json' });
    await user.upload(await screen.findByLabelText('Sicherungsdatei wählen'), file);
    expect(await screen.findByText('Diese Datei ist keine Sicherung von Randen.')).toBeTruthy();
  });

  it('opens a protected backup only with its password', async () => {
    const { user, t } = await renderData();
    const document = await t.useCases['settings.export']({ businessId: t.businessId });
    const sealed = await encryptBackup(JSON.stringify(document), 'geheim-geheim');
    await user.upload(
      await screen.findByLabelText('Sicherungsdatei wählen'),
      new File([sealed], 'verschluesselt.json', { type: 'application/json' }),
    );
    expect(
      await screen.findByText('Diese Sicherung ist mit einem Passwort geschützt.'),
    ).toBeTruthy();
    const password = screen.getByLabelText('Passwort');
    await user.type(password, 'falsch-falsch');
    await user.click(screen.getByRole('button', { name: 'Öffnen' }));
    expect(
      await screen.findByText('Das Passwort passt nicht. Probiere es noch einmal.'),
    ).toBeTruthy();
    await user.clear(password);
    await user.type(password, 'geheim-geheim');
    await user.click(screen.getByRole('button', { name: 'Öffnen' }));
    expect(await screen.findByText('Die Sicherung ist vollständig.')).toBeTruthy();
    expect(screen.getByText('Testküche')).toBeTruthy();
  });

  it('deletes everything only after the name of the business is typed', async () => {
    const { user, t } = await renderData();
    await user.click(await screen.findByRole('button', { name: 'Alles löschen …' }));
    const confirm = screen.getByRole<HTMLButtonElement>('button', { name: 'Alles löschen' });
    expect(confirm.disabled).toBe(true);
    await user.type(screen.getByRole('textbox', { name: 'Name des Betriebs' }), 'Testküche');
    expect(confirm.disabled).toBe(false);
    await user.click(confirm);
    await waitFor(() => {
      expect(reloadApp).toHaveBeenCalledTimes(1);
    });
    expect(await t.storage.businesses.get(t.businessId)).toBeUndefined();
  });
});
