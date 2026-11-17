import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fileMessages } from './messages.files';
import { usePrintAction, type PrintPdf } from './print';
import { PrintButton } from './PrintButton';
import { pretendInstalledIphone } from './test-helpers';

const t = fileMessages.print;

/** Undoes what a test set on `navigator`. */
let undo: (() => void) | undefined;

/** The app installed on an iPhone, with a share sheet that takes files. */
function installedIphone(share: (data: ShareData) => Promise<void>, canShare = true) {
  const shareMock = vi.fn(share);
  undo = pretendInstalledIphone({ share: shareMock, canShare: vi.fn(() => canShare) });
  return shareMock;
}

const pdfBlob = () => Promise.resolve(new Blob(['%PDF-1.3'], { type: 'application/pdf' }));

let clicked: string[];

beforeEach(() => {
  clicked = [];
  URL.createObjectURL = vi.fn(() => 'blob:randen/print');
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    clicked.push(this.download);
  });
});

afterEach(() => {
  undo?.();
  undo = undefined;
  vi.restoreAllMocks();
});

function button() {
  return screen.getByRole('button', { name: 'Drucken' });
}

async function ready() {
  await waitFor(() => {
    expect(button().getAttribute('aria-busy')).toBeNull();
  });
}

describe('PrintButton in a browser', () => {
  it('opens the print dialog in the tap itself, as before, and builds no PDF', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    const buildPdf = vi.fn(pdfBlob);
    render(<PrintButton label="Drucken" pdf={{ buildPdf, fileName: 'karte.pdf' }} />);
    await userEvent.click(button());
    expect(print).toHaveBeenCalledTimes(1);
    expect(buildPdf).not.toHaveBeenCalled();
  });

  it('prints a page without a PDF the same way', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    render(<PrintButton label="Drucken" />);
    await userEvent.click(button());
    expect(print).toHaveBeenCalledTimes(1);
  });
});

describe('PrintButton in the app installed on an iPhone', () => {
  it('turns until the data and the PDF are ready, then shares the file in the tap', async () => {
    const share = installedIphone(() => Promise.resolve());
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    const loading: PrintPdf = { buildPdf: undefined, fileName: 'speisekarte-abendkarte.pdf' };
    const { rerender } = render(<PrintButton label="Drucken" pdf={loading} />);
    expect(button().getAttribute('aria-busy')).toBe('true');
    await userEvent.click(button());
    expect(share).not.toHaveBeenCalled();

    const buildPdf = vi.fn(pdfBlob);
    rerender(<PrintButton label="Drucken" pdf={{ ...loading, buildPdf }} />);
    await ready();
    expect(buildPdf).toHaveBeenCalledTimes(1);
    await userEvent.click(button());
    expect(share).toHaveBeenCalledTimes(1);
    const data = (share.mock.calls[0] as [ShareData])[0];
    expect(data.files?.[0]?.name).toBe('speisekarte-abendkarte.pdf');
    expect(data.files?.[0]?.type).toBe('application/pdf');
    expect(data.text).toBeUndefined();
    expect(print).not.toHaveBeenCalled();
    await ready();
  });

  it('downloads the PDF where the share sheet takes no files', async () => {
    installedIphone(() => Promise.resolve(), false);
    render(<PrintButton label="Drucken" pdf={{ buildPdf: pdfBlob, fileName: 'karte.pdf' }} />);
    await ready();
    await userEvent.click(button());
    await waitFor(() => {
      expect(clicked).toEqual(['karte.pdf']);
    });
  });

  it('takes a closed share sheet as a cancel: no notice, no download', async () => {
    installedIphone(() => Promise.reject(new DOMException('closed', 'AbortError')));
    render(<PrintButton label="Drucken" pdf={{ buildPdf: pdfBlob, fileName: 'karte.pdf' }} />);
    await ready();
    await userEvent.click(button());
    await ready();
    expect(clicked).toEqual([]);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('says calmly what to do when neither sharing nor saving works', async () => {
    installedIphone(() => Promise.reject(new DOMException('no tap', 'NotAllowedError')));
    URL.createObjectURL = vi.fn(() => {
      throw new Error('no object URLs');
    });
    render(<PrintButton label="Drucken" pdf={{ buildPdf: pdfBlob, fileName: 'karte.pdf' }} />);
    await ready();
    await userEvent.click(button());
    const dialog = await screen.findByRole('dialog', { name: t.sheetTitle });
    expect(within(dialog).getByText(t.failed)).toBeTruthy();
  });

  it('says the PDF could not be prepared, and builds it again on «Noch einmal»', async () => {
    const share = installedIphone(() => Promise.resolve());
    const buildPdf = vi
      .fn<() => Promise<Blob>>()
      .mockRejectedValueOnce(new Error('jsPDF missing'))
      .mockImplementation(pdfBlob);
    render(<PrintButton label="Drucken" pdf={{ buildPdf, fileName: 'karte.pdf' }} />);
    await ready();
    await userEvent.click(button());
    const dialog = await screen.findByRole('dialog', { name: t.sheetTitle });
    expect(within(dialog).getByText(t.buildFailed)).toBeTruthy();
    expect(within(dialog).queryByText(t.failed)).toBeNull();
    expect(share).not.toHaveBeenCalled();
    expect(buildPdf).toHaveBeenCalledTimes(1);

    await userEvent.click(within(dialog).getByRole('button', { name: t.retry }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(buildPdf).toHaveBeenCalledTimes(2);
    await ready();
    await userEvent.click(button());
    expect(share).toHaveBeenCalledTimes(1);
    expect((share.mock.calls[0] as [ShareData])[0].files?.[0]?.name).toBe('karte.pdf');
  });

  it('closes the notice of a failed build without building again', async () => {
    installedIphone(() => Promise.resolve());
    const buildPdf = vi.fn(() => Promise.reject(new Error('jsPDF missing')));
    render(<PrintButton label="Drucken" pdf={{ buildPdf, fileName: 'karte.pdf' }} />);
    await ready();
    await userEvent.click(button());
    const dialog = await screen.findByRole('dialog', { name: t.sheetTitle });
    await userEvent.click(within(dialog).getByRole('button', { name: t.close }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(buildPdf).toHaveBeenCalledTimes(1);
  });

  it('on a page without a PDF yet, says that it follows and what works today', async () => {
    const share = installedIphone(() => Promise.resolve());
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    render(<PrintButton label="Drucken" />);
    expect(button().getAttribute('aria-busy')).toBeNull();
    await userEvent.click(button());
    const dialog = await screen.findByRole('dialog', { name: t.sheetTitle });
    expect(within(dialog).getByText(t.pending)).toBeTruthy();
    expect(within(dialog).getByText(t.pendingToday)).toBeTruthy();
    await userEvent.click(within(dialog).getByRole('button', { name: t.close }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(print).not.toHaveBeenCalled();
    expect(share).not.toHaveBeenCalled();
  });

  it('builds again when the data changes, and never shares an older PDF', async () => {
    const share = installedIphone(() => Promise.resolve());
    const first = vi.fn(() => Promise.resolve(new Blob(['eins'])));
    const { rerender } = render(
      <PrintButton label="Drucken" pdf={{ buildPdf: first, fileName: 'karte.pdf' }} />,
    );
    await ready();
    let release: (blob: Blob) => void = () => undefined;
    const second = vi.fn(
      () =>
        new Promise<Blob>((resolve) => {
          release = resolve;
        }),
    );
    rerender(<PrintButton label="Drucken" pdf={{ buildPdf: second, fileName: 'karte.pdf' }} />);
    expect(button().getAttribute('aria-busy')).toBe('true');
    await userEvent.click(button());
    expect(share).not.toHaveBeenCalled();
    release(new Blob(['zwei']));
    await ready();
    await userEvent.click(button());
    const data = (share.mock.calls[0] as [ShareData])[0];
    expect(await data.files?.[0]?.text()).toBe('zwei');
  });
});

/** A page that asks for a print through its address, like `?drucken=1`. */
function FromAddress({ pdf }: { pdf: PrintPdf }) {
  const action = usePrintAction(pdf);
  const { printFromAddress } = action;
  useEffect(() => {
    printFromAddress();
  }, [printFromAddress]);
  return <p>{action.mode}</p>;
}

describe('a print the address asks for', () => {
  it('opens the dialog in a browser', () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    render(<FromAddress pdf={{ buildPdf: pdfBlob, fileName: 'karte.pdf' }} />);
    expect(print).toHaveBeenCalledTimes(1);
    expect(screen.getByText('dialog')).toBeTruthy();
  });

  it('says at once that a page without a PDF cannot print in the installed app', async () => {
    installedIphone(() => Promise.resolve());
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    function NoPdf() {
      const action = usePrintAction();
      const { printFromAddress } = action;
      useEffect(() => {
        printFromAddress();
      }, [printFromAddress]);
      return <p>{action.notice}</p>;
    }
    render(<NoPdf />);
    expect(await screen.findByText('pending')).toBeTruthy();
    expect(print).not.toHaveBeenCalled();
  });

  it('waits for a tap in the installed app, where the share sheet needs one', () => {
    installedIphone(() => Promise.resolve());
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    render(<FromAddress pdf={{ buildPdf: pdfBlob, fileName: 'karte.pdf' }} />);
    expect(print).not.toHaveBeenCalled();
    expect(screen.getByText('share')).toBeTruthy();
  });
});
