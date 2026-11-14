import type { ArticleCategoryId, ArticleRef, Id, RecipeRef } from '@randen/core';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderApp } from '../app/test-helpers';
import { formMessages } from './messages.forms';
import {
  AreaPicker,
  ArticlePicker,
  CategoryPicker,
  Combobox,
  CountryPicker,
  RecipePicker,
  SpotPicker,
  StaffPicker,
  SupplierPicker,
  type ComboboxProps,
} from './pickers';

const t = formMessages.pickers;

const fruit = [
  { value: 'apple', label: 'Äpfel', detail: 'kg · 12 kg an Lager' },
  { value: 'apricot', label: 'Aprikosen', keywords: 'Marillen' },
  { value: 'pear', label: 'Birnen' },
  { value: 'pineapple', label: 'Ananas' },
];

function Fruit({
  onValue,
  initial = null,
  ...props
}: Partial<ComboboxProps<string>> & {
  onValue?: (value: string | null) => void;
  initial?: string | null;
}) {
  const [value, setValue] = useState<string | null>(initial);
  return (
    <Combobox
      label="Frucht"
      options={fruit}
      {...props}
      value={value}
      onChange={(next) => {
        setValue(next);
        onValue?.(next);
      }}
    />
  );
}

const optionTexts = () =>
  screen.getAllByRole('option').map((option) => option.querySelector('span span')?.textContent);

describe('Combobox', () => {
  it('is a combobox under its label that opens a named list', async () => {
    const user = userEvent.setup();
    render(<Fruit />);
    const input = screen.getByLabelText<HTMLInputElement>('Frucht');
    expect(input.getAttribute('role')).toBe('combobox');
    expect(input.getAttribute('aria-expanded')).toBe('false');
    expect(input.getAttribute('aria-autocomplete')).toBe('list');
    expect(screen.queryByRole('listbox')).toBeNull();
    await user.click(input);
    expect(input.getAttribute('aria-expanded')).toBe('true');
    const list = screen.getByRole('listbox', { name: t.suggestions });
    expect(input.getAttribute('aria-controls')).toBe(list.id);
    expect(optionTexts()).toEqual(['Äpfel', 'Aprikosen', 'Birnen', 'Ananas']);
    expect(within(list).getByText('kg · 12 kg an Lager')).toBeTruthy();
  });

  it('searches while typing, without minding accents, case or hidden words', async () => {
    const user = userEvent.setup();
    render(<Fruit />);
    const input = screen.getByLabelText('Frucht');
    await user.type(input, 'a');
    // What starts with the typed letters comes first.
    expect(optionTexts()).toEqual(['Äpfel', 'Aprikosen', 'Ananas']);
    await user.type(input, 'PF');
    expect(optionTexts()).toEqual(['Äpfel']);
    await user.clear(input);
    await user.type(input, 'marille');
    expect(optionTexts()).toEqual(['Aprikosen']);
  });

  it('walks the list with the arrow keys and takes the marked entry with Enter', async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    const onSubmit = vi.fn();
    render(
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <Fruit onValue={onValue} />
      </form>,
    );
    const input = screen.getByLabelText<HTMLInputElement>('Frucht');
    input.focus();
    await user.keyboard('{ArrowDown}');
    expect(input.getAttribute('aria-expanded')).toBe('true');
    const first = screen.getByRole('option', { name: /Äpfel/ });
    expect(input.getAttribute('aria-activedescendant')).toBe(first.id);
    expect(first.getAttribute('aria-selected')).toBe('true');
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(input.getAttribute('aria-activedescendant')).toBe(
      screen.getByRole('option', { name: 'Birnen' }).id,
    );
    await user.keyboard('{ArrowUp}');
    expect(input.getAttribute('aria-activedescendant')).toBe(
      screen.getByRole('option', { name: 'Aprikosen' }).id,
    );
    await user.keyboard('{Enter}');
    expect(onValue).toHaveBeenLastCalledWith('apricot');
    expect(input.value).toBe('Aprikosen');
    expect(screen.queryByRole('listbox')).toBeNull();
    // Enter took the entry; it did not send the form.
    expect(onSubmit).not.toHaveBeenCalled();
    // The arrow keys wrap around at both ends.
    await user.keyboard('{ArrowUp}');
    expect(input.getAttribute('aria-activedescendant')).toBe(
      screen.getByRole('option', { name: 'Ananas' }).id,
    );
    await user.keyboard('{ArrowDown}');
    expect(input.getAttribute('aria-activedescendant')).toBe(
      screen.getByRole('option', { name: /Äpfel/ }).id,
    );
  });

  it('starts at the last entry when the list was opened by a tap and up is pressed', async () => {
    const user = userEvent.setup();
    render(<Fruit />);
    const input = screen.getByLabelText('Frucht');
    await user.click(input);
    expect(input.getAttribute('aria-activedescendant')).toBeNull();
    await user.keyboard('{ArrowUp}');
    expect(input.getAttribute('aria-activedescendant')).toBe(
      screen.getByRole('option', { name: 'Ananas' }).id,
    );
  });

  it('puts the entry typed out in full before longer names', async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    const dairy = [
      { value: 'buttermilk', label: 'Buttermilch' },
      { value: 'butter', label: 'Butter' },
    ];
    render(<Fruit options={dairy} onValue={onValue} />);
    await user.type(screen.getByLabelText('Frucht'), 'butter');
    expect(optionTexts()).toEqual(['Butter', 'Buttermilch']);
    expect(onValue).toHaveBeenLastCalledWith('butter');
    await user.keyboard('{Enter}');
    expect(onValue).toHaveBeenLastCalledWith('butter');
    expect(screen.getByLabelText<HTMLInputElement>('Frucht').value).toBe('Butter');
  });

  it('takes the first hit with Enter after typing', async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<Fruit onValue={onValue} />);
    await user.type(screen.getByLabelText('Frucht'), 'bir{Enter}');
    expect(onValue).toHaveBeenLastCalledWith('pear');
    expect(screen.getByLabelText<HTMLInputElement>('Frucht').value).toBe('Birnen');
  });

  it('closes the list with Escape and keeps the choice', async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    const onEscape = vi.fn();
    render(
      <div
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            onEscape();
          }
        }}
      >
        <Fruit onValue={onValue} initial="pear" />
      </div>,
    );
    const input = screen.getByLabelText<HTMLInputElement>('Frucht');
    expect(input.value).toBe('Birnen');
    await user.click(input);
    expect(screen.getByRole('option', { name: /Birnen/ }).textContent).toContain(t.chosen);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(input.getAttribute('aria-expanded')).toBe('false');
    // The list took the key; a dialog around the field stays open.
    expect(onEscape).not.toHaveBeenCalled();
    expect(onValue).not.toHaveBeenCalled();
    expect(input.value).toBe('Birnen');
    await user.keyboard('{Escape}');
    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  it('takes a tap on an entry', async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<Fruit onValue={onValue} />);
    await user.click(screen.getByRole('button', { name: 'Liste zeigen, Frucht' }));
    await user.click(screen.getByRole('option', { name: 'Ananas' }));
    expect(onValue).toHaveBeenLastCalledWith('pineapple');
    expect(screen.getByLabelText<HTMLInputElement>('Frucht').value).toBe('Ananas');
    expect(document.activeElement).toBe(screen.getByLabelText('Frucht'));
  });

  it('follows the text: a name typed in full is the value, anything else is null', async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<Fruit onValue={onValue} initial="pear" />);
    const input = screen.getByLabelText<HTMLInputElement>('Frucht');
    await user.clear(input);
    expect(onValue).toHaveBeenLastCalledWith(null);
    await user.type(input, 'ananas');
    expect(onValue).toHaveBeenLastCalledWith('pineapple');
    await user.tab();
    // Left alone, the field shows the entry as it is written.
    expect(input.value).toBe('Ananas');
    expect(screen.queryByText(t.unknown)).toBeNull();
  });

  it('answers text that matches no entry with null and a message', async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<Fruit onValue={onValue} initial="pear" />);
    const input = screen.getByLabelText<HTMLInputElement>('Frucht');
    await user.clear(input);
    await user.type(input, 'Mango');
    expect(onValue).toHaveBeenLastCalledWith(null);
    expect(screen.getByRole('status').textContent).toBe(t.noMatch);
    expect(input.getAttribute('aria-expanded')).toBe('false');
    await user.tab();
    // The text stays, with a message: nothing typed is dropped without a word.
    expect(input.value).toBe('Mango');
    expect(screen.getByText(t.unknown)).toBeTruthy();
    expect(input.getAttribute('aria-invalid')).toBe('true');
  });

  it('shows the entry of a value set from outside', () => {
    const { rerender } = render(
      <Combobox label="Frucht" options={fruit} value="apple" onChange={vi.fn()} />,
    );
    expect(screen.getByLabelText<HTMLInputElement>('Frucht').value).toBe('Äpfel');
    rerender(<Combobox label="Frucht" options={fruit} value="pear" onChange={vi.fn()} />);
    expect(screen.getByLabelText<HTMLInputElement>('Frucht').value).toBe('Birnen');
    rerender(<Combobox label="Frucht" options={fruit} value={null} onChange={vi.fn()} />);
    expect(screen.getByLabelText<HTMLInputElement>('Frucht').value).toBe('');
  });

  it('shows fifty entries of a long list and says how many more there are', async () => {
    const user = userEvent.setup();
    const many = Array.from({ length: 60 }, (_, index) => ({
      value: `a${String(index)}`,
      label: `Artikel ${String(index + 1)}`,
    }));
    render(<Fruit options={many} />);
    await user.click(screen.getByLabelText('Frucht'));
    expect(screen.getAllByRole('option')).toHaveLength(50);
    expect(screen.getByText(t.more(10))).toBeTruthy();
  });
});

describe('ArticlePicker', () => {
  function Articles({
    onPick,
    filter,
  }: {
    onPick?: (id: Id | null, article: ArticleRef | null) => void;
    filter?: (article: ArticleRef) => boolean;
  }) {
    const [value, setValue] = useState<Id | null>(null);
    return (
      <ArticlePicker
        value={value}
        filter={filter}
        onChange={(id, article) => {
          setValue(id);
          onPick?.(id, article);
        }}
      />
    );
  }

  it('finds an article by typing and shows unit and stock', async () => {
    const onPick = vi.fn();
    const { user, kitchen } = await renderApp(<Articles onPick={onPick} />);
    const input = await screen.findByLabelText<HTMLInputElement>('Artikel');
    await user.type(input, 'entrec');
    const option = await screen.findByRole('option', { name: /Rindsentrecôte/ });
    expect(option.textContent).toContain('kg · 4 kg an Lager');
    await user.keyboard('{Enter}');
    expect(input.value).toBe('Rindsentrecôte');
    expect(onPick).toHaveBeenLastCalledWith(
      kitchen.articles.entrecote.id,
      expect.objectContaining({ name: 'Rindsentrecôte', unit: 'g', stock: 4000 }),
    );
  });

  it('shows litres, pieces and what is not in stock', async () => {
    const { user } = await renderApp(<Articles />);
    await user.click(await screen.findByLabelText('Artikel'));
    expect((await screen.findByRole('option', { name: /Vollrahm/ })).textContent).toContain(
      'l · 8 l an Lager',
    );
    expect(screen.getByRole('option', { name: /Eier/ }).textContent).toContain(
      'Stk. · 60 Stk. an Lager',
    );
    expect(screen.getByRole('option', { name: /Rotweinjus/ }).textContent).toContain(
      `l · ${t.noStock}`,
    );
  });

  it('narrows the list with a filter', async () => {
    const { user } = await renderApp(
      <Articles filter={(article) => article.kind === 'purchased' && article.unit === 'ml'} />,
    );
    await user.click(await screen.findByLabelText('Artikel'));
    await screen.findByRole('option', { name: /Vollrahm/ });
    expect(
      screen.getAllByRole('option').map((option) => option.querySelector('span span')?.textContent),
    ).toEqual(['Rotwein zum Kochen', 'Vollrahm']);
  });

  it('shows the article of a stored id once the list has loaded', async () => {
    // Ids count up from the same start in every test kitchen: learn the id, then start over.
    const first = await renderApp(<p>Küche</p>);
    const butter = first.kitchen.articles.butter.id;
    first.unmount();
    await renderApp(<ArticlePicker label="Zutat" value={butter} onChange={vi.fn()} />);
    const input = await screen.findByLabelText<HTMLInputElement>('Zutat');
    await waitFor(() => {
      expect(input.value).toBe('Butter');
    });
  });
});

describe('RecipePicker', () => {
  function Recipes({
    kind,
    onPick,
  }: {
    kind?: 'dish' | 'component';
    onPick?: (id: Id | null, recipe: RecipeRef | null) => void;
  }) {
    const [value, setValue] = useState<Id | null>(null);
    return (
      <RecipePicker
        value={value}
        kind={kind}
        onChange={(id, recipe) => {
          setValue(id);
          onPick?.(id, recipe);
        }}
      />
    );
  }

  it('lists recipes with course and portions, components marked as such', async () => {
    const onPick = vi.fn();
    const { user, kitchen } = await renderApp(<Recipes onPick={onPick} />);
    await user.click(await screen.findByLabelText('Rezept'));
    expect(
      (await screen.findByRole('option', { name: /Lachs mit Rahmsauce/ })).textContent,
    ).toContain('Hauptgang · 4 Portionen');
    expect(screen.getByRole('option', { name: /^Rotweinjus/ }).textContent).toContain(t.component);
    await user.click(screen.getByRole('option', { name: /Lachs mit Rahmsauce/ }));
    expect(onPick).toHaveBeenLastCalledWith(
      kitchen.recipes.salmonDish.id,
      expect.objectContaining({ name: 'Lachs mit Rahmsauce', portions: 4 }),
    );
  });

  it('can offer dishes only', async () => {
    const { user } = await renderApp(<Recipes kind="dish" />);
    await user.click(await screen.findByLabelText('Rezept'));
    await screen.findByRole('option', { name: /Lachs mit Rahmsauce/ });
    expect(screen.getAllByRole('option')).toHaveLength(2);
    expect(screen.queryByRole('option', { name: /^Rotweinjus/ })).toBeNull();
  });
});

describe('pickers with a short list', () => {
  const optionsOf = (select: HTMLSelectElement) => Array.from(select.options, (o) => o.text);

  it('offers areas, and the spots of the chosen area', async () => {
    const onArea = vi.fn();
    const onSpot = vi.fn();
    function Place() {
      const [areaId, setAreaId] = useState<Id | null>(null);
      const [spotId, setSpotId] = useState<Id | null>(null);
      return (
        <>
          <AreaPicker
            value={areaId}
            onChange={(next) => {
              setAreaId(next);
              setSpotId(null);
              onArea(next);
            }}
          />
          <SpotPicker
            areaId={areaId}
            value={spotId}
            onChange={(next) => {
              setSpotId(next);
              onSpot(next);
            }}
          />
        </>
      );
    }
    const { user, kitchen } = await renderApp(<Place />);
    const area = await screen.findByLabelText<HTMLSelectElement>('Lagerbereich');
    await screen.findByRole('option', { name: 'Kühlzelle' });
    expect(optionsOf(area)).toEqual([
      formMessages.select.placeholder,
      'Kühlzelle',
      'Tiefkühlzelle',
      'Trockenlager',
    ]);
    const spot = screen.getByLabelText<HTMLSelectElement>('Platz');
    expect(spot.disabled).toBe(true);
    expect(screen.getByText(t.chooseAreaFirst)).toBeTruthy();

    await user.selectOptions(area, 'Kühlzelle');
    expect(onArea).toHaveBeenLastCalledWith(kitchen.areas.cold.id);
    expect(spot.disabled).toBe(false);
    expect(optionsOf(spot)).toEqual([t.noSpot, 'Schublade Fleisch']);
    await user.selectOptions(spot, 'Schublade Fleisch');
    expect(onSpot).toHaveBeenLastCalledWith(kitchen.spots.meatDrawer.id);

    await user.selectOptions(area, 'Tiefkühlzelle');
    expect(spot.disabled).toBe(true);
    expect(screen.getByText(t.noSpots)).toBeTruthy();
  });

  it('can offer areas of some kinds only', async () => {
    await renderApp(
      <AreaPicker label="Kühlung" kinds={['cold', 'frozen']} value={null} onChange={vi.fn()} />,
    );
    await screen.findByRole('option', { name: 'Kühlzelle' });
    expect(optionsOf(screen.getByLabelText<HTMLSelectElement>('Kühlung'))).toEqual([
      formMessages.select.placeholder,
      'Kühlzelle',
      'Tiefkühlzelle',
    ]);
  });

  it('offers suppliers and the team', async () => {
    const onSupplier = vi.fn();
    const {
      user,
      kitchen,
      t: context,
    } = await renderApp(
      <>
        <SupplierPicker value={null} onChange={onSupplier} placeholder="Kein Lieferant" optional />
        <StaffPicker label="Wer" value={null} onChange={vi.fn()} />
      </>,
    );
    await screen.findByRole('option', { name: 'Metzgerei Muster' });
    const supplier = screen.getByLabelText<HTMLSelectElement>('Lieferant');
    expect(optionsOf(supplier)).toEqual([
      'Kein Lieferant',
      'Grosshandel Beispiel',
      'Metzgerei Muster',
    ]);
    await user.selectOptions(supplier, 'Metzgerei Muster');
    expect(onSupplier).toHaveBeenLastCalledWith(kitchen.suppliers.butcher.id);
    const staff = screen.getByLabelText<HTMLSelectElement>('Wer');
    expect(await within(staff).findByRole('option', { name: 'Testperson' })).toHaveProperty(
      'value',
      context.actor,
    );
  });

  it('offers the groups of goods and the countries of origin, Switzerland first', async () => {
    const user = userEvent.setup();
    const onCategory = vi.fn<(value: ArticleCategoryId | null) => void>();
    const onCountry = vi.fn();
    render(
      <>
        <CategoryPicker value={null} onChange={onCategory} />
        <CountryPicker value="NO" onChange={onCountry} />
      </>,
    );
    const category = screen.getByLabelText<HTMLSelectElement>('Warengruppe');
    expect(category.options).toHaveLength(28);
    await user.selectOptions(category, 'Fisch und Meeresfrüchte');
    expect(onCategory).toHaveBeenLastCalledWith('fish');
    const country = screen.getByLabelText<HTMLSelectElement>('Herkunft');
    expect(country.value).toBe('NO');
    expect(country.options[1]?.text).toBe('Schweiz');
    await user.selectOptions(country, 'Schweiz');
    expect(onCountry).toHaveBeenLastCalledWith('CH');
  });
});
