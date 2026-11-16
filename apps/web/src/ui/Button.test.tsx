import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './Button';

describe('Button while busy', () => {
  it('keeps keyboard focus after a click and does not call its handler', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button busy onClick={onClick}>
        Sichern
      </Button>,
    );
    const button = screen.getByRole<HTMLButtonElement>('button', { name: 'Sichern' });
    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(button);
    expect(button.disabled).toBe(false);
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(button.getAttribute('aria-busy')).toBe('true');
  });

  it('keeps its place in the tab order', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Button busy>Sichern</Button>
        <Button variant="secondary">Abbrechen</Button>
      </>,
    );
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Sichern' }));
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Abbrechen' }));
  });

  it('does not submit the form it sits in', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((event: { preventDefault: () => void }) => {
      event.preventDefault();
    });
    render(
      <form onSubmit={onSubmit}>
        <Button type="submit" busy>
          Sichern
        </Button>
      </form>,
    );
    await user.click(screen.getByRole('button', { name: 'Sichern' }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('calls its handler again once it is no longer busy', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const { rerender } = render(
      <Button busy onClick={onClick}>
        Sichern
      </Button>,
    );
    await user.click(screen.getByRole('button', { name: 'Sichern' }));
    expect(onClick).not.toHaveBeenCalled();
    rerender(<Button onClick={onClick}>Sichern</Button>);
    await user.click(screen.getByRole('button', { name: 'Sichern' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('drops the hover and press feedback while busy and keeps its colour', () => {
    const { rerender } = render(<Button>Sichern</Button>);
    expect(screen.getByRole('button', { name: 'Sichern' }).className).toContain(
      'hover:bg-wine-800',
    );
    rerender(<Button busy>Sichern</Button>);
    const busy = screen.getByRole('button', { name: 'Sichern' }).className;
    expect(busy).toContain('bg-wine-700');
    expect(busy).not.toContain('hover:');
    expect(busy).not.toContain('active:');
  });

  it('a real disabled button is still disabled and skipped by the tab order', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Button disabled>Sichern</Button>
        <Button variant="secondary">Abbrechen</Button>
      </>,
    );
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Sichern' }).disabled).toBe(true);
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Abbrechen' }));
  });
});
