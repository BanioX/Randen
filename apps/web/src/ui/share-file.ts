/**
 * Hands a file out of the app (ADR-0019; SE-08 share, SE-10 save as file). Nothing is sent
 * anywhere: the person picks in the share sheet where the file goes, or the browser saves it.
 *
 * Why the share sheet: since iOS and iPadOS 27, the print dialog does not open in a web app
 * installed to the Home Screen (WebKit bug 327504), and a download there opens a preview instead
 * of saving. The share sheet works there and offers «Drucken» and «In Dateien sichern».
 *
 * Rules of the share sheet (after Rettich `features/reports/share-file.ts`):
 * - `navigator.share` needs the tap itself (transient user activation). The file must be ready
 *   before the tap; call `shareOrDownload` directly in the tap handler, not after an `await`.
 * - Files are shared without text, else some targets drop the file.
 * - `canShare({ files })` first; desktop Firefox has no `share` at all.
 * - `AbortError` means the person closed the sheet: a normal cancel, nothing to report.
 */

export type ShareOutcome = 'shared' | 'cancelled' | 'downloaded' | 'failed';

/** What this module reads of the browser. Tests pass their own. */
export interface Device {
  navigator: Navigator;
  matchMedia?: ((query: string) => MediaQueryList) | undefined;
}

/** iOS-only property: true in a web app opened from the Home Screen. */
type IosNavigator = Navigator & { standalone?: boolean };

function thisDevice(): Device {
  // Not every environment has matchMedia (jsdom in tests).
  const media = typeof (window.matchMedia as unknown) === 'function';
  return {
    navigator: window.navigator,
    matchMedia: media ? (query) => window.matchMedia(query) : undefined,
  };
}

/** An iPhone, iPod or iPad; iPadOS says «Macintosh» but is the only one of those with touch. */
function isIosDevice(navigator: Navigator): boolean {
  const agent = navigator.userAgent;
  if (/\b(iPhone|iPad|iPod)\b/.test(agent)) {
    return true;
  }
  return /\bMacintosh\b/.test(agent) && navigator.maxTouchPoints > 1;
}

/**
 * True in Randen installed to the Home Screen of an iPhone or iPad. Only on an iOS device:
 * a Mac web app added to the Dock also reports `navigator.standalone`, and there the print
 * dialog works. On the device `navigator.standalone` is the sure sign; else the display mode,
 * where an installed app can report `fullscreen` instead of `standalone` (WebKit bug 264218).
 * The display mode alone is never enough: Android and desktop apps report it too.
 */
export function isInstalledIos(device: Device = thisDevice()): boolean {
  const navigator = device.navigator as IosNavigator;
  if (!isIosDevice(navigator)) {
    return false;
  }
  if (navigator.standalone === true) {
    return true;
  }
  if (device.matchMedia === undefined) {
    return false;
  }
  return device.matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches;
}

/** True if this browser can hand this file to the share sheet. */
export function canShareFiles(file: File, navigator: Navigator = window.navigator): boolean {
  // The types say both always exist; desktop Firefox has neither.
  if (typeof (navigator.share as unknown) !== 'function') {
    return false;
  }
  if (typeof (navigator.canShare as unknown) !== 'function') {
    return false;
  }
  try {
    return navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

/**
 * Saves the file with a link that is clicked once (SE-10). The address is released a little
 * later: some browsers start the download only after the click has returned. False if the
 * browser cannot even start it.
 */
export function downloadFile(file: Blob, name: string): boolean {
  let url: string;
  try {
    url = URL.createObjectURL(file);
  } catch {
    return false;
  }
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
  return true;
}

/**
 * True if the file left the app and is kept somewhere after this outcome, so a backup counts as
 * saved. In the installed iOS app a download only opens a preview, which is gone once it is
 * closed (ADR-0019): there only `shared` counts. Elsewhere a download saves the file.
 */
export function fileHandedOver(outcome: ShareOutcome, installedIos: boolean): boolean {
  return outcome === 'shared' || (outcome === 'downloaded' && !installedIos);
}

/**
 * Hands the file to the share sheet, or downloads it where sharing files is not possible.
 *
 * - `shared`: the person chose a target in the sheet.
 * - `cancelled`: the person closed the sheet (`AbortError`); nothing else happens.
 * - `downloaded`: no share sheet for files, or the sheet refused (`NotAllowedError` when the tap
 *   was too long ago, `TypeError`, `DataError`): the file is downloaded instead, as in Rettich.
 *   The download is the one path left; refusing silently would leave a button that does nothing.
 *   In the installed iOS app it only opens a preview: see `fileHandedOver`.
 * - `failed`: the download could not start either. The page says what to do.
 */
export async function shareOrDownload(
  file: File,
  options: { title?: string | undefined; navigator?: Navigator | undefined } = {},
): Promise<ShareOutcome> {
  const navigator = options.navigator ?? window.navigator;
  if (canShareFiles(file, navigator)) {
    try {
      // Files without text: some targets keep only the text when both come.
      await navigator.share(
        options.title === undefined ? { files: [file] } : { files: [file], title: options.title },
      );
      return 'shared';
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return 'cancelled';
      }
    }
  }
  return downloadFile(file, file.name) ? 'downloaded' : 'failed';
}
