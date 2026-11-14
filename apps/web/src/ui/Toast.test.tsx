import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TOAST_MS, ToastProvider, useToast, type ToastOptions } from './Toast';

function Trigger({ label, options }: { label: string; options: ToastOptions }) {
  const toast = useToast();
  return (
    <button
      type="button"
      onClick={() => {
        toast(options);
      }}
    >
      {label}
    </button>
  );
}

function click(name: string) {
  fireEvent.click(screen.getByRole('button', { name }));
}

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Toast', () => {
  it('appears in a polite live region that is there from the start', () => {
    render(
      <ToastProvider>
        <Trigger label="Sichern" options={{ text: 'Inventur gesichert.' }} />
      </ToastProvider>,
    );
    const region = screen.getByRole('status');
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(region.textContent).toBe('');

    click('Sichern');
    expect(region.textContent).toBe('Inventur gesichert.');
  });

  it('disappears after five seconds', () => {
    render(
      <ToastProvider>
        <Trigger label="Sichern" options={{ text: 'Inventur gesichert.' }} />
      </ToastProvider>,
    );
    click('Sichern');
    advance(TOAST_MS - 1);
    expect(screen.getByText('Inventur gesichert.')).toBeTruthy();
    advance(1);
    expect(screen.queryByText('Inventur gesichert.')).toBeNull();
    expect(TOAST_MS).toBe(5000);
  });

  it('offers «Rückgängig», runs the action and leaves', () => {
    const onAction = vi.fn();
    render(
      <ToastProvider>
        <Trigger
          label="Abschreiben"
          options={{ text: 'Charge abgeschrieben.', action: { label: 'Rückgängig', onAction } }}
        />
      </ToastProvider>,
    );
    click('Abschreiben');
    click('Rückgängig');
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Charge abgeschrieben.')).toBeNull();
  });

  it('shows the toast an action raises itself', () => {
    function Undoable() {
      const toast = useToast();
      return (
        <button
          type="button"
          onClick={() => {
            toast({
              text: 'Charge abgeschrieben.',
              action: {
                label: 'Rückgängig',
                onAction: () => {
                  toast({ text: 'Abschreiber zurückgenommen.' });
                },
              },
            });
          }}
        >
          Abschreiben
        </button>
      );
    }
    render(
      <ToastProvider>
        <Undoable />
      </ToastProvider>,
    );
    click('Abschreiben');
    click('Rückgängig');
    expect(screen.getByRole('status').textContent).toBe('Abschreiber zurückgenommen.');
    advance(TOAST_MS);
    expect(screen.getByRole('status').textContent).toBe('');
  });

  it('is replaced by the next toast, which gets its own five seconds', () => {
    render(
      <ToastProvider>
        <Trigger label="Erste" options={{ text: 'Wareneingang gesichert.' }} />
        <Trigger label="Zweite" options={{ text: 'Rezept gesichert.' }} />
      </ToastProvider>,
    );
    click('Erste');
    advance(4000);
    click('Zweite');
    expect(screen.queryByText('Wareneingang gesichert.')).toBeNull();
    expect(screen.getByText('Rezept gesichert.')).toBeTruthy();
    // The timer of the first toast must not take the second one away.
    advance(4000);
    expect(screen.getByText('Rezept gesichert.')).toBeTruthy();
    advance(1000);
    expect(screen.queryByText('Rezept gesichert.')).toBeNull();
  });

  it('shows the same text again when it is raised twice', () => {
    render(
      <ToastProvider>
        <Trigger label="Sichern" options={{ text: 'Gesichert.' }} />
      </ToastProvider>,
    );
    click('Sichern');
    advance(TOAST_MS);
    click('Sichern');
    expect(screen.getByText('Gesichert.')).toBeTruthy();
  });

  it('waits while the pointer rests on it', () => {
    render(
      <ToastProvider>
        <Trigger label="Sichern" options={{ text: 'Inventur gesichert.' }} />
      </ToastProvider>,
    );
    click('Sichern');
    const toast = screen.getByText('Inventur gesichert.').parentElement;
    expect(toast).not.toBeNull();
    if (toast === null) {
      return;
    }
    fireEvent.mouseEnter(toast);
    advance(TOAST_MS * 2);
    expect(screen.getByText('Inventur gesichert.')).toBeTruthy();
    fireEvent.mouseLeave(toast);
    advance(TOAST_MS);
    expect(screen.queryByText('Inventur gesichert.')).toBeNull();
  });

  it('adds an icon for a tone, never colour alone', () => {
    render(
      <ToastProvider>
        <Trigger label="Plain" options={{ text: 'Ohne Ton.' }} />
        <Trigger label="Fehler" options={{ text: 'Das hat nicht geklappt.', tone: 'danger' }} />
      </ToastProvider>,
    );
    click('Plain');
    expect(screen.getByRole('status').querySelector('svg')).toBeNull();
    click('Fehler');
    expect(screen.getByRole('status').querySelector('svg')).not.toBeNull();
  });

  it('does nothing without a provider, so a page can be rendered on its own', () => {
    render(<Trigger label="Sichern" options={{ text: 'Inventur gesichert.' }} />);
    click('Sichern');
    expect(screen.queryByText('Inventur gesichert.')).toBeNull();
  });
});
