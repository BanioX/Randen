import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  canShareFiles,
  downloadFile,
  fileHandedOver,
  isInstalledIos,
  shareOrDownload,
  type Device,
} from './share-file';

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 27_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
const IPAD_AS_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.1 Safari/605.1.15';
const ANDROID =
  'Mozilla/5.0 (Linux; Android 16; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36';

function file(): File {
  return new File(['%PDF-1.3'], 'speisekarte.pdf', { type: 'application/pdf' });
}

/** A navigator with only what the module reads. */
function fakeNavigator(fields: Record<string, unknown>): Navigator {
  return { userAgent: 'Mozilla/5.0', maxTouchPoints: 0, ...fields } as unknown as Navigator;
}

function device(fields: Record<string, unknown>, matches: string[] = []): Device {
  return {
    navigator: fakeNavigator(fields),
    matchMedia: (query: string) =>
      ({ matches: matches.some((mode) => query.includes(mode)) }) as MediaQueryList,
  };
}

let clicked: string[];
let revoke: ReturnType<typeof vi.fn<(url: string) => void>>;

beforeEach(() => {
  clicked = [];
  // jsdom has no object URLs and does not navigate on a click: both are watched instead.
  URL.createObjectURL = vi.fn(() => 'blob:randen/1');
  revoke = vi.fn<(url: string) => void>();
  URL.revokeObjectURL = revoke;
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    clicked.push(this.download);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('isInstalledIos', () => {
  it('trusts navigator.standalone on an iPhone or iPad', () => {
    expect(isInstalledIos(device({ userAgent: IPHONE, standalone: true }))).toBe(true);
    // iPadOS says «Macintosh»; its touch points tell it from a Mac.
    expect(
      isInstalledIos(device({ userAgent: IPAD_AS_MAC, maxTouchPoints: 5, standalone: true })),
    ).toBe(true);
  });

  it('is false in a Mac web app in the Dock, which reports standalone too and prints', () => {
    expect(
      isInstalledIos(device({ userAgent: IPAD_AS_MAC, maxTouchPoints: 0, standalone: true })),
    ).toBe(false);
    expect(
      isInstalledIos(
        device({ userAgent: IPAD_AS_MAC, maxTouchPoints: 0, standalone: true }, ['standalone']),
      ),
    ).toBe(false);
  });

  it('accepts the display mode only on an iPhone or iPad, also «fullscreen» (WebKit 264218)', () => {
    expect(isInstalledIos(device({ userAgent: IPHONE }, ['fullscreen']))).toBe(true);
    expect(
      isInstalledIos(device({ userAgent: IPAD_AS_MAC, maxTouchPoints: 5 }, ['standalone'])),
    ).toBe(true);
  });

  it('is false in a Safari tab, on a Mac and in an installed Android or desktop app', () => {
    expect(isInstalledIos(device({ userAgent: IPHONE }))).toBe(false);
    expect(
      isInstalledIos(device({ userAgent: IPAD_AS_MAC, maxTouchPoints: 0 }, ['standalone'])),
    ).toBe(false);
    expect(isInstalledIos(device({ userAgent: ANDROID }, ['standalone']))).toBe(false);
  });

  it('is false where matchMedia is missing and nothing else says so', () => {
    expect(isInstalledIos({ navigator: fakeNavigator({ userAgent: IPHONE }) })).toBe(false);
  });
});

describe('canShareFiles', () => {
  it('needs share and canShare, and asks canShare about the file', () => {
    const canShare = vi.fn(() => true);
    expect(canShareFiles(file(), fakeNavigator({ share: vi.fn(), canShare }))).toBe(true);
    expect(canShare).toHaveBeenCalledWith({ files: [expect.any(File) as File] });
    expect(canShareFiles(file(), fakeNavigator({ share: vi.fn() }))).toBe(false);
    expect(canShareFiles(file(), fakeNavigator({ canShare }))).toBe(false);
    expect(
      canShareFiles(
        file(),
        fakeNavigator({
          share: vi.fn(),
          canShare: () => {
            throw new TypeError('no files');
          },
        }),
      ),
    ).toBe(false);
  });
});

describe('shareOrDownload', () => {
  it('shares the file, without text, when the device can', async () => {
    const share = vi.fn(() => Promise.resolve());
    const navigator = fakeNavigator({ share, canShare: () => true });
    const outcome = await shareOrDownload(file(), { navigator, title: 'Abendkarte' });
    expect(outcome).toBe('shared');
    expect(share).toHaveBeenCalledTimes(1);
    const data = (share.mock.calls[0] as unknown as [ShareData])[0];
    expect(data.files?.[0]?.name).toBe('speisekarte.pdf');
    expect(data.title).toBe('Abendkarte');
    expect(data.text).toBeUndefined();
    expect(clicked).toEqual([]);
  });

  it('downloads when canShare says no', async () => {
    const share = vi.fn(() => Promise.resolve());
    const navigator = fakeNavigator({ share, canShare: () => false });
    expect(await shareOrDownload(file(), { navigator })).toBe('downloaded');
    expect(share).not.toHaveBeenCalled();
    expect(clicked).toEqual(['speisekarte.pdf']);
  });

  it('downloads where there is no share at all (desktop Firefox)', async () => {
    expect(await shareOrDownload(file(), { navigator: fakeNavigator({}) })).toBe('downloaded');
    expect(clicked).toEqual(['speisekarte.pdf']);
  });

  it('treats a closed sheet (AbortError) as a cancel, and downloads nothing', async () => {
    const share = vi.fn(() => Promise.reject(new DOMException('closed', 'AbortError')));
    const navigator = fakeNavigator({ share, canShare: () => true });
    expect(await shareOrDownload(file(), { navigator })).toBe('cancelled');
    expect(clicked).toEqual([]);
  });

  it('downloads when the sheet refuses for another reason (activation lost)', async () => {
    const share = vi.fn(() => Promise.reject(new DOMException('no tap', 'NotAllowedError')));
    const navigator = fakeNavigator({ share, canShare: () => true });
    expect(await shareOrDownload(file(), { navigator })).toBe('downloaded');
    expect(clicked).toEqual(['speisekarte.pdf']);
  });

  it('fails only when the download cannot start either', async () => {
    URL.createObjectURL = vi.fn(() => {
      throw new Error('no object URLs');
    });
    const share = vi.fn(() => Promise.reject(new TypeError('bad data')));
    const navigator = fakeNavigator({ share, canShare: () => true });
    expect(await shareOrDownload(file(), { navigator })).toBe('failed');
  });
});

describe('fileHandedOver', () => {
  it('counts a download as kept only outside the installed iOS app, where it is a preview', () => {
    expect(fileHandedOver('shared', true)).toBe(true);
    expect(fileHandedOver('shared', false)).toBe(true);
    expect(fileHandedOver('downloaded', false)).toBe(true);
    expect(fileHandedOver('downloaded', true)).toBe(false);
    expect(fileHandedOver('cancelled', false)).toBe(false);
    expect(fileHandedOver('failed', false)).toBe(false);
  });
});

describe('downloadFile', () => {
  it('clicks a hidden link once and releases the address a second later', () => {
    vi.useFakeTimers();
    expect(downloadFile(file(), 'randen-sicherung.json')).toBe(true);
    expect(clicked).toEqual(['randen-sicherung.json']);
    expect(document.querySelector('a[download]')).toBeNull();
    expect(revoke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(revoke).toHaveBeenCalledWith('blob:randen/1');
  });
});
