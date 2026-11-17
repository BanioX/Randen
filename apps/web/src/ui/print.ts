import { useCallback, useEffect, useState } from 'react';
import { isInstalledIos, shareOrDownload } from './share-file';

/**
 * Printing a page (ADR-0019, SE-07). In a browser the tap opens the print dialog, as always.
 * In the app installed on an iPhone or iPad `window.print()` does nothing (WebKit bug 327504):
 * there the page's PDF is built on the device as soon as its data is there, and the tap hands
 * the finished file to the share sheet, which offers «Drucken» and «In Dateien sichern».
 */

/** The PDF of a page. A page without one yet leaves it out. */
export interface PrintPdf {
  /**
   * Builds the PDF from the page's data, or `undefined` while the data loads. Keep it stable
   * (`useMemo`, `useCallback`): a new function builds the PDF again, for new data.
   */
  buildPdf: (() => Promise<Blob>) | undefined;
  fileName: string;
  /** The subject, where a share target uses one (Mail). */
  title?: string | undefined;
}

/**
 * `pending`: this page has no PDF yet. `buildFailed`: the PDF could not be prepared; `retry`
 * builds it again. `failed`: the finished PDF could be neither shared nor saved.
 */
export type PrintNotice = 'pending' | 'buildFailed' | 'failed';

export interface PrintAction {
  /** How this device prints: the print dialog, or a PDF through the share sheet. */
  mode: 'dialog' | 'share';
  /** For the tap: call it in the tap handler itself, never after an `await`. */
  print: () => void;
  /**
   * A print the address asked for (`?drucken=1`): the dialog at once in a browser. In the
   * installed iOS app the share sheet needs a tap: the page asks for it; a page without a PDF
   * yet shows its notice.
   */
  printFromAddress: () => void;
  /** The PDF is being built or handed out: the button turns and takes no second tap. */
  busy: boolean;
  /** A calm notice the page shows after a tap, or null. */
  notice: PrintNotice | null;
  dismiss: () => void;
  /** After `buildFailed`: closes the notice and builds the PDF again. */
  retry: () => void;
}

interface Built {
  build: () => Promise<Blob>;
  /** Which try this is: a retry builds again from the same data. */
  attempt: number;
  file: File | null;
}

export function usePrintAction(pdf?: PrintPdf): PrintAction {
  const [installedIos] = useState(() => isInstalledIos());
  const [built, setBuilt] = useState<Built | null>(null);
  const [sharing, setSharing] = useState(false);
  const [notice, setNotice] = useState<PrintNotice | null>(null);
  const [attempt, setAttempt] = useState(0);

  const build = installedIos ? pdf?.buildPdf : undefined;
  const fileName = pdf?.fileName;
  const title = pdf?.title;

  // Built while the page is open, so the file is ready before the tap (transient activation).
  useEffect(() => {
    if (build === undefined || fileName === undefined) {
      return;
    }
    const state = { cancelled: false };
    build().then(
      (blob) => {
        if (!state.cancelled) {
          const file = new File([blob], fileName, { type: 'application/pdf' });
          setBuilt({ build, attempt, file });
        }
      },
      () => {
        if (!state.cancelled) {
          setBuilt({ build, attempt, file: null });
        }
      },
    );
    return () => {
      state.cancelled = true;
    };
  }, [build, fileName, attempt]);

  // A PDF built from older data, or a failure before the retry, does not count.
  const current =
    built !== null && built.build === build && built.attempt === attempt ? built : null;
  const file = current?.file ?? null;
  const buildFailed = current !== null && current.file === null;
  const hasPdf = pdf !== undefined;

  const print = useCallback(() => {
    if (!installedIos) {
      window.print();
      return;
    }
    if (!hasPdf) {
      setNotice('pending');
      return;
    }
    if (buildFailed) {
      setNotice('buildFailed');
      return;
    }
    if (file === null || sharing) {
      return;
    }
    setSharing(true);
    void shareOrDownload(file, { title }).then((outcome) => {
      setSharing(false);
      if (outcome === 'failed') {
        setNotice('failed');
      }
    });
  }, [installedIos, hasPdf, buildFailed, file, sharing, title]);

  const printFromAddress = useCallback(() => {
    if (!installedIos) {
      window.print();
    } else if (!hasPdf) {
      // The person asked to print on the page before: say why nothing prints, never stay silent.
      setNotice('pending');
    }
  }, [installedIos, hasPdf]);

  const dismiss = useCallback(() => {
    setNotice(null);
  }, []);

  const retry = useCallback(() => {
    setNotice(null);
    setAttempt((count) => count + 1);
  }, []);

  return {
    mode: installedIos ? 'share' : 'dialog',
    print,
    printFromAddress,
    busy: installedIos && hasPdf && !buildFailed && (file === null || sharing),
    notice,
    dismiss,
    retry,
  };
}
