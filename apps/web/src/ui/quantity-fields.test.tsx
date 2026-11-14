import type { Rappen, Unit } from '@randen/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderApp } from '../app/test-helpers';
import { formMessages } from './messages.forms';
import { MoneyField, type MoneyFieldProps } from './MoneyField';
import { QuantityField, type QuantityFieldProps } from './QuantityField';
import { UnitPriceField } from './UnitPriceField';

function Quantity({
  onValue,
  initial = null,
  unit = 'g',
  ...props
}: Partial<QuantityFieldProps> & {
  onValue?: (value: number | null) => void;
  initial?: number | null;
}) {
  const [value, setValue] = useState<number | null>(initial);
  return (
    <QuantityField
      label="Menge"
      {...props}
      unit={unit}
      value={value}
      onChange={(next) => {
        setValue(next);
        onValue?.(next);
      }}
    />
  );
}

function Money({
  onValue,
  initial = null,
  ...props
}: Partial<MoneyFieldProps> & {
  onValue?: (value: Rappen | null) => void;
  initial?: Rappen | null;
}) {
  const [value, setValue] = useState<Rappen | null>(initial);
  return (
    <MoneyField
      label="Betrag"
      {...props}
      value={value}
      onChange={(next) => {
        setValue(next);
        onValue?.(next);
      }}
    />
  );
}

function Price({
  onValue,
  unit,
  initial = null,
}: {
  onValue?: (value: Rappen | null) => void;
  unit: Unit;
  initial?: Rappen | null;
}) {
  const [value, setValue] = useState<Rappen | null>(initial);
  return (
    <UnitPriceField
      label="Einkaufspreis"
      unit={unit}
      value={value}
      onChange={(next) => {
        setValue(next);
        onValue?.(next);
      }}
    />
  );
}

const unitSwitch = (name: string) => screen.getByRole<HTMLInputElement>('radio', { name });

describe('QuantityField', () => {
  it('reads a bare number in the unit of the switch, kilograms first', async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<Quantity onValue={onValue} />);
    const input = screen.getByLabelText<HTMLInputElement>('Menge');
    expect(input.inputMode).toBe('decimal');
    expect(screen.getByRole('group', { name: 'Einheit für Menge' })).toBeTruthy();
    expect(unitSwitch('kg').checked).toBe(true);
    await user.type(input, '2.5');
    expect(onValue).toHaveBeenLastCalledWith(2500);
    // What was typed says it all: no line underneath.
    expect(screen.queryByText(/^=/)).toBeNull();
  });

  it('takes a comma as decimal mark', async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<Quantity onValue={onValue} />);
    await user.type(screen.getByLabelText('Menge'), '2,5');
    expect(onValue).toHaveBeenLastCalledWith(2500);
    expect(screen.queryByText(/^=/)).toBeNull();
  });

  it('reads a typed unit, shows it on the switch and says what it understood', async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<Quantity onValue={onValue} />);
    const input = screen.getByLabelText('Menge');
    await user.type(input, '750 g');
    expect(onValue).toHaveBeenLastCalledWith(750);
    expect(unitSwitch('g').checked).toBe(true);
    expect(screen.queryByText(/^=/)).toBeNull();
    await user.clear(input);
    await user.type(input, '2500 g');
    expect(onValue).toHaveBeenLastCalledWith(2500);
    expect(screen.getByText('= 2.5 kg')).toBeTruthy();
    await user.clear(input);
    await user.type(input, '0.75');
    expect(onValue).toHaveBeenLastCalledWith(750);
    expect(screen.getByText('= 750 g')).toBeTruthy();
  });

  it('gives the number a new meaning when the unit is switched', async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<Quantity onValue={onValue} />);
    const input = screen.getByLabelText<HTMLInputElement>('Menge');
    await user.type(input, '500');
    expect(onValue).toHaveBeenLastCalledWith(500_000);
    await user.click(unitSwitch('g'));
    expect(input.value).toBe('500');
    expect(onValue).toHaveBeenLastCalledWith(500);
    // A typed unit gives way to the switch.
    await user.clear(input);
    await user.type(input, '2 kg');
    await user.click(unitSwitch('g'));
    expect(input.value).toBe('2');
    expect(onValue).toHaveBeenLastCalledWith(2);
  });

  it('offers litres, decilitres and millilitres for liquids', async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<Quantity onValue={onValue} unit="ml" entryUnit="dl" />);
    expect(unitSwitch('dl').checked).toBe(true);
    await user.type(screen.getByLabelText('Menge'), '7,5');
    expect(onValue).toHaveBeenLastCalledWith(750);
    expect(screen.getByText('= 750 ml')).toBeTruthy();
    await user.click(unitSwitch('l'));
    expect(onValue).toHaveBeenLastCalledWith(7500);
  });

  it('counts pieces without a switch', async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<Quantity onValue={onValue} unit="pcs" />);
    expect(screen.queryByRole('radio')).toBeNull();
    const input = screen.getByLabelText('Menge');
    expect(document.getElementById(input.getAttribute('aria-describedby') ?? '')?.textContent).toBe(
      'Stk.',
    );
    await user.type(input, '12 Stk.');
    expect(onValue).toHaveBeenLastCalledWith(12);
  });

  it('shows a stored quantity in the unit that reads best', () => {
    const { unmount } = render(<Quantity initial={2500} />);
    expect(screen.getByLabelText<HTMLInputElement>('Menge').value).toBe('2.5');
    expect(unitSwitch('kg').checked).toBe(true);
    unmount();
    render(<Quantity initial={750} />);
    expect(screen.getByLabelText<HTMLInputElement>('Menge').value).toBe('750');
    expect(unitSwitch('g').checked).toBe(true);
  });

  it('answers garbage with null and a message that says how to write it', async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<Quantity onValue={onValue} />);
    const input = screen.getByLabelText('Menge');
    await user.type(input, 'zwei Kilo');
    expect(onValue).toHaveBeenLastCalledWith(null);
    await user.tab();
    expect(screen.getByText(formMessages.quantity.unreadable.g)).toBeTruthy();
    expect(input.getAttribute('aria-invalid')).toBe('true');
    // Litres are no weight.
    await user.clear(input);
    await user.type(input, '2 l');
    expect(onValue).toHaveBeenLastCalledWith(null);
    expect(screen.getByText(formMessages.quantity.unreadable.g)).toBeTruthy();
  });

  it('can refuse zero where a quantity is needed', async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<Quantity onValue={onValue} positive />);
    await user.type(screen.getByLabelText('Menge'), '0');
    await user.tab();
    expect(onValue).toHaveBeenLastCalledWith(null);
    expect(screen.getByText(formMessages.quantity.zero)).toBeTruthy();
  });

  it('starts over when the article has another base unit', () => {
    const { rerender } = render(
      <QuantityField label="Menge" unit="g" value={2500} onChange={vi.fn()} />,
    );
    expect(screen.getByLabelText<HTMLInputElement>('Menge').value).toBe('2.5');
    // Same number, now pieces: the text follows the value, the switch is gone.
    rerender(<QuantityField label="Menge" unit="pcs" value={2500} onChange={vi.fn()} />);
    expect(screen.getByLabelText<HTMLInputElement>('Menge').value).toBe('2500');
    expect(screen.queryByRole('radio')).toBeNull();
    rerender(<QuantityField label="Menge" unit="ml" value={null} onChange={vi.fn()} />);
    expect(screen.getByLabelText<HTMLInputElement>('Menge').value).toBe('');
    expect(unitSwitch('l').checked).toBe(true);
  });

  it('clears when the form resets the value', () => {
    const { rerender } = render(
      <QuantityField label="Menge" unit="g" value={1500} onChange={vi.fn()} />,
    );
    expect(screen.getByLabelText<HTMLInputElement>('Menge').value).toBe('1.5');
    rerender(<QuantityField label="Menge" unit="g" value={null} onChange={vi.fn()} />);
    expect(screen.getByLabelText<HTMLInputElement>('Menge').value).toBe('');
  });
});

describe('MoneyField', () => {
  it('reads an amount into Rappen, with point or comma, and names the currency', async () => {
    const onValue = vi.fn();
    const { user } = await renderApp(<Money onValue={onValue} />);
    const input = await screen.findByLabelText<HTMLInputElement>('Betrag');
    expect(input.inputMode).toBe('decimal');
    expect(document.getElementById(input.getAttribute('aria-describedby') ?? '')?.textContent).toBe(
      'CHF',
    );
    await user.type(input, '12.5');
    expect(onValue).toHaveBeenLastCalledWith(1250);
    await user.clear(input);
    await user.type(input, '3,95');
    expect(onValue).toHaveBeenLastCalledWith(395);
    await user.clear(input);
    await user.type(input, '1’234.50');
    expect(onValue).toHaveBeenLastCalledWith(123_450);
  });

  it('shows a stored amount with two decimals', async () => {
    await renderApp(<Money initial={41_260 as Rappen} />);
    expect((await screen.findByLabelText<HTMLInputElement>('Betrag')).value).toBe('412.60');
  });

  it('answers garbage and three decimals with null and a message', async () => {
    const onValue = vi.fn();
    const { user } = await renderApp(<Money onValue={onValue} />);
    const input = await screen.findByLabelText('Betrag');
    await user.type(input, '12.345');
    await user.tab();
    expect(onValue).toHaveBeenLastCalledWith(null);
    expect(screen.getByText(formMessages.money.unreadable('12.50'))).toBeTruthy();
    await user.clear(input);
    await user.type(input, 'gratis');
    expect(onValue).toHaveBeenLastCalledWith(null);
    expect(input.getAttribute('aria-invalid')).toBe('true');
  });

  it('takes amounts below zero only where they are allowed', async () => {
    const onValue = vi.fn();
    const { user } = await renderApp(
      <>
        <Money onValue={onValue} />
        <Money label="Gutschrift" allowNegative onValue={onValue} />
      </>,
    );
    await user.type(await screen.findByLabelText('Betrag'), '-5');
    await user.tab();
    expect(onValue).toHaveBeenLastCalledWith(null);
    expect(screen.getByText(formMessages.money.negative)).toBeTruthy();
    await user.type(screen.getByLabelText('Gutschrift'), '-5');
    expect(onValue).toHaveBeenLastCalledWith(-500);
  });
});

describe('UnitPriceField', () => {
  it('says what the price refers to and reads it per 1000 base units', async () => {
    const onValue = vi.fn();
    const { user } = await renderApp(<Price unit="g" onValue={onValue} />);
    const input = await screen.findByLabelText('Einkaufspreis pro kg');
    await user.type(input, '62');
    expect(onValue).toHaveBeenLastCalledWith(6200);
    await user.clear(input);
    await user.type(input, '52,50');
    expect(onValue).toHaveBeenLastCalledWith(5250);
  });

  it('reads a price per piece and keeps small prices exact', async () => {
    const onValue = vi.fn();
    const { user } = await renderApp(<Price unit="pcs" onValue={onValue} />);
    const input = await screen.findByLabelText('Einkaufspreis pro Stk.');
    await user.type(input, '0.45');
    expect(onValue).toHaveBeenLastCalledWith(45_000);
    await user.clear(input);
    await user.type(input, '0.012');
    expect(onValue).toHaveBeenLastCalledWith(1200);
  });

  it('shows a stored price per litre and per piece', async () => {
    await renderApp(
      <>
        <Price unit="ml" initial={640 as Rappen} />
        <UnitPriceField label="Preis" unit="pcs" value={45_000 as Rappen} onChange={vi.fn()} />
      </>,
    );
    expect((await screen.findByLabelText<HTMLInputElement>('Einkaufspreis pro l')).value).toBe(
      '6.40',
    );
    expect(screen.getByLabelText<HTMLInputElement>('Preis pro Stk.').value).toBe('0.45');
  });

  it('writes the price anew when the unit changes under the same number', async () => {
    function Switching() {
      const [unit, setUnit] = useState<Unit>('g');
      return (
        <>
          <UnitPriceField label="Preis" unit={unit} value={45_000 as Rappen} onChange={vi.fn()} />
          <button
            type="button"
            onClick={() => {
              setUnit('pcs');
            }}
          >
            Stück
          </button>
        </>
      );
    }
    const { user } = await renderApp(<Switching />);
    expect((await screen.findByLabelText<HTMLInputElement>('Preis pro kg')).value).toBe('450.00');
    await user.click(screen.getByRole('button', { name: 'Stück' }));
    expect(screen.getByLabelText<HTMLInputElement>('Preis pro Stk.').value).toBe('0.45');
  });

  it('answers garbage with null and a message', async () => {
    const onValue = vi.fn();
    const { user } = await renderApp(<Price unit="g" onValue={onValue} />);
    await user.type(await screen.findByLabelText('Einkaufspreis pro kg'), 'teuer');
    await user.tab();
    expect(onValue).toHaveBeenLastCalledWith(null);
    expect(screen.getByText(formMessages.unitPrice.unreadable('52.50'))).toBeTruthy();
  });
});
