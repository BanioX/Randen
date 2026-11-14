import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FormActions } from './FormActions';

describe('FormActions', () => {
  it('sends the form around it with the main button', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <FormActions primaryLabel="Sichern" />
      </form>,
    );
    const save = screen.getByRole<HTMLButtonElement>('button', { name: 'Sichern' });
    expect(save.type).toBe('submit');
    await user.click(save);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('runs its own actions, the quiet one first and the main one last', async () => {
    const user = userEvent.setup();
    const onPrimary = vi.fn();
    const onSecondary = vi.fn();
    render(
      <FormActions
        primaryLabel="Wareneingang buchen"
        onPrimary={onPrimary}
        secondaryLabel="Abbrechen"
        onSecondary={onSecondary}
        summary="3 Chargen, CHF 412.60"
      />,
    );
    const buttons = screen.getAllByRole<HTMLButtonElement>('button');
    expect(buttons.map((button) => button.textContent)).toEqual([
      'Abbrechen',
      'Wareneingang buchen',
    ]);
    expect(buttons.map((button) => button.type)).toEqual(['button', 'button']);
    expect(screen.getByText('3 Chargen, CHF 412.60')).toBeTruthy();
    await user.click(buttons[0] ?? document.body);
    await user.click(buttons[1] ?? document.body);
    expect(onSecondary).toHaveBeenCalledTimes(1);
    expect(onPrimary).toHaveBeenCalledTimes(1);
  });

  it('reads out the message of a rejected command and can hold the main button', () => {
    render(
      <FormActions
        primaryLabel="Abschreiben"
        primaryDisabled
        error="Dafür ist zu wenig an Lager."
      />,
    );
    expect(screen.getByRole('alert').textContent).toBe('Dafür ist zu wenig an Lager.');
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Abschreiben' }).disabled).toBe(
      true,
    );
  });

  it('sticks above the tab bar on the phone, unless it sits inside a sheet', () => {
    const { container, rerender } = render(<FormActions primaryLabel="Sichern" />);
    expect(container.firstElementChild?.className).toContain('sticky');
    expect(container.firstElementChild?.className).toContain('safe-area-inset-bottom');
    expect(container.firstElementChild?.className).toContain('lg:static');
    expect(screen.getByRole('alert').textContent).toBe('');
    rerender(<FormActions primaryLabel="Sichern" placement="inline" />);
    expect(container.firstElementChild?.className).not.toContain('sticky');
  });
});
