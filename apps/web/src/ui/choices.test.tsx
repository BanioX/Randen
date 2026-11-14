import { ALLERGENS, allergenOfficial, type AllergenId } from '@randen/core';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AllergenPicker } from './AllergenPicker';
import { Checkbox } from './Checkbox';
import { ChoiceChips, MultiChoiceChips } from './ChoiceChips';
import { formMessages } from './messages.forms';
import { SearchField } from './SearchField';
import { Switch } from './Switch';

describe('ChoiceChips', () => {
  const options = [
    { value: 'best_before', label: 'Mindestens haltbar bis' },
    { value: 'use_by', label: 'Zu verbrauchen bis', description: 'Danach nicht mehr verwenden.' },
  ] as const;

  it('is a labelled radio group that reports the chosen value', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ChoiceChips
        legend="Datum auf der Packung"
        options={options}
        value="best_before"
        onChange={onChange}
      />,
    );
    expect(screen.getByRole('group', { name: 'Datum auf der Packung' })).toBeTruthy();
    expect(
      screen.getByRole<HTMLInputElement>('radio', { name: 'Mindestens haltbar bis' }).checked,
    ).toBe(true);
    const useBy = screen.getByRole('radio', { name: 'Zu verbrauchen bis' });
    // The long form describes the choice, it is not part of its name.
    expect(document.getElementById(useBy.getAttribute('aria-describedby') ?? '')?.textContent).toBe(
      'Danach nicht mehr verwenden.',
    );
    await user.click(useBy);
    expect(onChange).toHaveBeenCalledWith('use_by');
  });

  it('can start with nothing chosen, as segments, with an error', () => {
    render(
      <ChoiceChips
        legend="Art"
        options={options}
        value={null}
        onChange={vi.fn()}
        segmented
        error="Wähle die Art des Datums."
      />,
    );
    for (const radio of screen.getAllByRole<HTMLInputElement>('radio')) {
      expect(radio.checked).toBe(false);
    }
    const group = screen.getByRole('group', { name: 'Art' });
    expect(document.getElementById(group.getAttribute('aria-describedby') ?? '')?.textContent).toBe(
      'Wähle die Art des Datums.',
    );
  });
});

describe('MultiChoiceChips', () => {
  const days = [
    { value: 'mon', label: 'Mo' },
    { value: 'tue', label: 'Di' },
    { value: 'thu', label: 'Do', disabled: true },
    { value: 'fri', label: 'Fr' },
  ] as const;
  type Day = (typeof days)[number]['value'];

  it('toggles checkboxes and reports the choice in the order of the options', async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    function Days() {
      const [value, setValue] = useState<Day[]>(['fri']);
      return (
        <MultiChoiceChips
          legend="Liefertage"
          options={days}
          value={value}
          onChange={(next) => {
            setValue(next);
            onValue(next);
          }}
        />
      );
    }
    render(<Days />);
    const group = screen.getByRole('group', { name: 'Liefertage' });
    expect(within(group).getAllByRole('checkbox')).toHaveLength(4);
    await user.click(screen.getByRole('checkbox', { name: 'Mo' }));
    expect(onValue).toHaveBeenLastCalledWith(['mon', 'fri']);
    await user.click(screen.getByRole('checkbox', { name: 'Fr' }));
    expect(onValue).toHaveBeenLastCalledWith(['mon']);
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: 'Do' }).disabled).toBe(true);
    // A chosen chip carries a check mark, not colour alone.
    expect(screen.getByText('Mo').querySelector('svg')).not.toBeNull();
    expect(screen.getByText('Fr').querySelector('svg')).toBeNull();
  });
});

describe('AllergenPicker', () => {
  function Allergens({
    onValue,
    initial = [],
    unavailable,
  }: {
    onValue?: (value: AllergenId[]) => void;
    initial?: AllergenId[];
    unavailable?: AllergenId[];
  }) {
    const [value, setValue] = useState<AllergenId[]>(initial);
    return (
      <AllergenPicker
        legend="Enthält"
        value={value}
        unavailable={unavailable}
        onChange={(next) => {
          setValue(next);
          onValue?.(next);
        }}
      />
    );
  }

  it('offers the fourteen allergens in the order of the ordinance', () => {
    render(<Allergens />);
    const boxes = within(screen.getByRole('group', { name: 'Enthält' })).getAllByRole('checkbox');
    expect(boxes).toHaveLength(14);
    expect(boxes.map((box) => box.closest('label')?.textContent)).toEqual([
      'Gluten',
      'Krebstiere',
      'Eier',
      'Fisch',
      'Erdnüsse',
      'Soja',
      'Milch',
      'Nüsse',
      'Sellerie',
      'Senf',
      'Sesam',
      'Sulfite',
      'Lupinen',
      'Weichtiere',
    ]);
    expect(boxes.map((box) => box.getAttribute('value'))).toEqual(
      ALLERGENS.map((allergen) => allergen.id),
    );
  });

  it('carries the official wording as tooltip and description', () => {
    render(<Allergens />);
    const nuts = screen.getByRole('checkbox', { name: 'Nüsse' });
    expect(nuts.closest('label')?.title).toBe(allergenOfficial('nuts'));
    expect(document.getElementById(nuts.getAttribute('aria-describedby') ?? '')?.textContent).toBe(
      allergenOfficial('nuts'),
    );
  });

  it('reports the choice sorted, whatever was tapped first', async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<Allergens onValue={onValue} initial={['sulphites']} unavailable={['fish']} />);
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: 'Sulfite' }).checked).toBe(true);
    await user.click(screen.getByRole('checkbox', { name: 'Milch' }));
    await user.click(screen.getByRole('checkbox', { name: 'Gluten' }));
    expect(onValue).toHaveBeenLastCalledWith(['gluten', 'milk', 'sulphites']);
    await user.click(screen.getByRole('checkbox', { name: 'Sulfite' }));
    expect(onValue).toHaveBeenLastCalledWith(['gluten', 'milk']);
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: 'Fisch' }).disabled).toBe(true);
  });

  it('is called «Allergene» unless the form says otherwise', () => {
    render(<AllergenPicker value={[]} onChange={vi.fn()} />);
    expect(screen.getByRole('group', { name: formMessages.allergens.legend })).toBeTruthy();
  });
});

describe('Switch', () => {
  it('is a switch with a label and a description that toggles', async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    function Active() {
      const [checked, setChecked] = useState(false);
      return (
        <Switch
          label="Auf der Speisekarte"
          description="Gäste sehen das Gericht mit Preis und Allergenen."
          checked={checked}
          onChange={(next) => {
            setChecked(next);
            onValue(next);
          }}
        />
      );
    }
    render(<Active />);
    const toggle = screen.getByRole<HTMLInputElement>('switch', { name: 'Auf der Speisekarte' });
    expect(screen.getByLabelText('Auf der Speisekarte')).toBe(toggle);
    expect(toggle.checked).toBe(false);
    expect(
      document.getElementById(toggle.getAttribute('aria-describedby') ?? '')?.textContent,
    ).toBe('Gäste sehen das Gericht mit Preis und Allergenen.');
    await user.click(toggle);
    expect(onValue).toHaveBeenLastCalledWith(true);
    expect(toggle.checked).toBe(true);
    // The label toggles too, and so does the space bar.
    await user.click(screen.getByText('Auf der Speisekarte'));
    expect(onValue).toHaveBeenLastCalledWith(false);
    toggle.focus();
    await user.keyboard(' ');
    expect(onValue).toHaveBeenLastCalledWith(true);
  });

  it('can be switched off', () => {
    render(<Switch label="Aktiv" checked onChange={vi.fn()} disabled />);
    expect(screen.getByRole<HTMLInputElement>('switch', { name: 'Aktiv' }).disabled).toBe(true);
  });
});

describe('Checkbox', () => {
  it('ticks under its label and shows the error of the form', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Checkbox
        label="Ware kontrolliert"
        description="Temperatur, Verpackung und Datum stimmen."
        checked={false}
        onChange={onChange}
        error="Bestätige die Kontrolle."
      />,
    );
    const box = screen.getByRole('checkbox', { name: 'Ware kontrolliert' });
    expect(box.getAttribute('aria-invalid')).toBe('true');
    expect(
      (box.getAttribute('aria-describedby') ?? '')
        .split(' ')
        .map((id) => document.getElementById(id)?.textContent),
    ).toEqual(['Bestätige die Kontrolle.', 'Temperatur, Verpackung und Datum stimmen.']);
    await user.click(box);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('holds a form back until a required box is ticked', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    function Check() {
      const [checked, setChecked] = useState(false);
      return (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <Checkbox label="Ware kontrolliert" checked={checked} onChange={setChecked} required />
          <button type="submit">Buchen</button>
        </form>
      );
    }
    render(<Check />);
    await user.click(screen.getByRole('button', { name: 'Buchen' }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(formMessages.required)).toBeTruthy();
    await user.click(screen.getByRole('checkbox', { name: 'Ware kontrolliert' }));
    await user.click(screen.getByRole('button', { name: 'Buchen' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});

describe('SearchField', () => {
  function Search({ hideLabel = false }: { hideLabel?: boolean }) {
    const [value, setValue] = useState('');
    return (
      <SearchField
        label="Artikel suchen"
        hideLabel={hideLabel}
        placeholder="Name oder Warengruppe"
        value={value}
        onChange={setValue}
      />
    );
  }

  it('is a search field under its label with a button that empties it', async () => {
    const user = userEvent.setup();
    render(<Search />);
    const input = screen.getByLabelText<HTMLInputElement>('Artikel suchen');
    expect(input.type).toBe('search');
    expect(screen.getByRole('searchbox', { name: 'Artikel suchen' })).toBe(input);
    expect(screen.queryByRole('button', { name: formMessages.search.clear })).toBeNull();
    await user.type(input, 'Rahm');
    expect(input.value).toBe('Rahm');
    await user.click(screen.getByRole('button', { name: formMessages.search.clear }));
    expect(input.value).toBe('');
    expect(document.activeElement).toBe(input);
    expect(screen.queryByRole('button', { name: formMessages.search.clear })).toBeNull();
  });

  it('keeps its label for screen readers when it is hidden', () => {
    render(<Search hideLabel />);
    expect(screen.getByLabelText('Artikel suchen')).toBeTruthy();
    expect(screen.getByText('Artikel suchen').parentElement?.className).toContain('sr-only');
  });
});
