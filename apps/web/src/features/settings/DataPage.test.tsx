import { screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../app/test-helpers';
import { pretendInstalledIphone } from '../../ui/test-helpers';
import { ToastProvider } from '../../ui/Toast';
import { decryptBackup, encryptBackup, readEnvelope } from './backup-crypto';
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
  // With the toasts of the shell: what a backup says is part of what it does.
  return renderApp(
    <ToastProvider>
      <DataPage />
    </ToastProvider>,
    { route: '/more/data', path: '/more/data' },
  );
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
    // In a browser the download saves the file: it counts.
    expect(screen.getByText('Sicherung heruntergeladen.')).toBeTruthy();
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

  it('in the app installed on an iPhone, builds the backup with one tap and shares it with a second', async () => {
    const share = vi.fn((_data: ShareData) => Promise.resolve());
    const undo = pretendInstalledIphone({ share, canShare: () => true });
    try {
      const { user } = await renderData();
      await user.click(await screen.findByRole('button', { name: 'Sicherung erstellen' }));
      const shareButton = await screen.findByRole('button', { name: 'Sicherung teilen' });
      expect(screen.getByText(/Sicherung bereit\. Tippe auf «Sicherung teilen»/)).toBeTruthy();
      expect(share).not.toHaveBeenCalled();
      expect(window.localStorage.getItem('randen:last-backup')).toBeNull();
      await user.click(shareButton);
      await waitFor(() => {
        expect(share).toHaveBeenCalledTimes(1);
      });
      const shared = share.mock.calls[0]?.[0].files?.[0];
      expect(shared?.name).toBe('randen-sicherung-2026-11-14.json');
      expect(JSON.parse((await shared?.text()) ?? '{}')).toMatchObject({ format: 'randen-backup' });
      expect(await screen.findByText('Letzte Sicherung heute.')).toBeTruthy();
      expect(screen.getByText('Die Sicherung ist weitergegeben.')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Sicherung erstellen' })).toBeTruthy();
      expect(saved).toHaveLength(0);
    } finally {
      undo();
    }
  });

  it('in the app installed on an iPhone, does not count a download that only opens a preview', async () => {
    // The share sheet refuses (the tap was too long ago): the file is downloaded, which iOS
    // shows as a preview there. Nothing is saved yet.
    const share = vi.fn<(data: ShareData) => Promise<void>>(() =>
      Promise.reject(new DOMException('no tap', 'NotAllowedError')),
    );
    const undo = pretendInstalledIphone({ share, canShare: () => true });
    try {
      const { user } = await renderData();
      await user.click(await screen.findByRole('button', { name: 'Sicherung erstellen' }));
      await user.click(await screen.findByRole('button', { name: 'Sicherung teilen' }));
      expect(await screen.findByText(/nur als Vorschau geöffnet/)).toBeTruthy();
      expect(screen.getByText(/Teilen-Symbol und wähle «In Dateien sichern»/)).toBeTruthy();
      expect(saved).toHaveLength(1);
      expect(window.localStorage.getItem('randen:last-backup')).toBeNull();
      expect(screen.getByText('Noch nie gesichert.')).toBeTruthy();
      expect(screen.queryByText('Sicherung heruntergeladen.')).toBeNull();
      expect(screen.getByRole('button', { name: 'Als gesichert vermerken' })).toBeTruthy();
      // The file stays ready: a second tap can still hand it to the share sheet.
      share.mockResolvedValueOnce(undefined);
      await user.click(screen.getByRole('button', { name: 'Sicherung teilen' }));
      expect(await screen.findByText('Letzte Sicherung heute.')).toBeTruthy();
      expect(screen.queryByText(/nur als Vorschau geöffnet/)).toBeNull();
    } finally {
      undo();
    }
  });

  it('in the app installed on an iPhone, remembers the day when the person saved the backup from the preview', async () => {
    const share = vi.fn<(data: ShareData) => Promise<void>>(() =>
      Promise.reject(new DOMException('no tap', 'NotAllowedError')),
    );
    const undo = pretendInstalledIphone({ share, canShare: () => true });
    try {
      const { user } = await renderData();
      await user.click(await screen.findByRole('button', { name: 'Sicherung erstellen' }));
      await user.click(await screen.findByRole('button', { name: 'Sicherung teilen' }));
      await user.click(await screen.findByRole('button', { name: 'Als gesichert vermerken' }));
      expect(
        await screen.findByText('Vermerkt. Randen erinnert dich in 14 Tagen wieder.'),
      ).toBeTruthy();
      expect(screen.getByText('Letzte Sicherung heute.')).toBeTruthy();
      expect(window.localStorage.getItem('randen:last-backup')).not.toBeNull();
    } finally {
      undo();
    }
  });

  it('locks the switch and the password while the protected backup is built', async () => {
    const share = vi.fn((_data: ShareData) => Promise.resolve());
    const undo = pretendInstalledIphone({ share, canShare: () => true });
    try {
      const { user } = await renderData();
      const protect = await screen.findByRole<HTMLInputElement>('switch', {
        name: /Mit Passwort schützen/,
      });
      await user.click(protect);
      const password = screen.getByLabelText<HTMLInputElement>('Passwort');
      const repeat = screen.getByLabelText<HTMLInputElement>('Passwort wiederholen');
      await user.type(password, 'geheim-geheim');
      await user.type(repeat, 'geheim-geheim');
      await user.click(screen.getByRole('button', { name: 'Sicherung erstellen' }));
      // Encrypting takes a moment: no edit can slip in and leave a file with the old password.
      expect(password.disabled).toBe(true);
      expect(repeat.disabled).toBe(true);
      expect(protect.disabled).toBe(true);
      await user.click(
        await screen.findByRole('button', { name: 'Sicherung teilen' }, { timeout: 15_000 }),
      );
      expect(password.disabled).toBe(false);
      await waitFor(() => {
        expect(share).toHaveBeenCalledTimes(1);
      });
      const shared = await share.mock.calls[0]?.[0].files?.[0]?.text();
      const envelope = readEnvelope(JSON.parse(shared ?? '{}'));
      if (envelope === 'invalid' || envelope === 'plain') {
        throw new Error('The shared backup is not protected');
      }
      expect(await decryptBackup(envelope, 'geheim-geheim')).toContain('randen-backup');
    } finally {
      undo();
    }
  }, 30_000);

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
