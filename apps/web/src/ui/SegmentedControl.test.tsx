import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { SegmentedControl } from './SegmentedControl';

type Period = 'week' | 'month' | 'year';

function Periods({ onChange }: { onChange?: (value: Period) => void }) {
  const [value, setValue] = useState<Period>('week');
  return (
    <SegmentedControl
      label="Zeitraum"
      options={[
        { value: 'week', label: 'Woche' },
        { value: 'month', label: 'Monat' },
        { value: 'year', label: 'Jahr' },
      ]}
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
    />
  );
}

const checked = () =>
  screen
    .getAllByRole('radio')
    .filter((radio) => radio.getAttribute('aria-checked') === 'true')
    .map((radio) => radio.textContent);

describe('SegmentedControl', () => {
  it('is a labelled radio group with one chosen segment', () => {
    render(<Periods />);
    const group = screen.getByRole('radiogroup', { name: 'Zeitraum' });
    expect(group).toBeTruthy();
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    expect(checked()).toEqual(['Woche']);
    // The chosen segment is Rotwein with white text; the others are not.
    expect(screen.getByRole('radio', { name: 'Woche' }).className).toContain('bg-wine-700');
    expect(screen.getByRole('radio', { name: 'Monat' }).className).not.toContain('bg-wine-700');
  });

  it('chooses with a click', async () => {
    const changes: Period[] = [];
    render(<Periods onChange={(value) => changes.push(value)} />);
    await userEvent.setup().click(screen.getByRole('radio', { name: 'Jahr' }));
    expect(checked()).toEqual(['Jahr']);
    expect(changes).toEqual(['year']);
  });

  it('has one tab stop: the chosen segment', () => {
    render(<Periods />);
    expect(screen.getAllByRole('radio').map((radio) => radio.tabIndex)).toEqual([0, -1, -1]);
  });

  it('moves and chooses with the arrow keys, around the ends', async () => {
    const user = userEvent.setup();
    render(<Periods />);
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'Woche' }));

    await user.keyboard('{ArrowRight}');
    expect(checked()).toEqual(['Monat']);
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'Monat' }));

    await user.keyboard('{ArrowDown}');
    expect(checked()).toEqual(['Jahr']);

    await user.keyboard('{ArrowRight}');
    expect(checked()).toEqual(['Woche']);
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'Woche' }));

    await user.keyboard('{ArrowLeft}');
    expect(checked()).toEqual(['Jahr']);

    await user.keyboard('{ArrowUp}');
    expect(checked()).toEqual(['Monat']);
  });

  it('jumps to the first and the last segment with Home and End', async () => {
    const user = userEvent.setup();
    render(<Periods />);
    await user.tab();
    await user.keyboard('{End}');
    expect(checked()).toEqual(['Jahr']);
    await user.keyboard('{Home}');
    expect(checked()).toEqual(['Woche']);
  });

  it('keeps a hidden label for screen readers, inside a positioned box', () => {
    render(
      <SegmentedControl
        label="Ansicht"
        hideLabel
        options={[
          { value: 'list', label: 'Liste' },
          { value: 'table', label: 'Tabelle' },
        ]}
        value="list"
        onChange={() => undefined}
      />,
    );
    const group = screen.getByRole('radiogroup', { name: 'Ansicht' });
    expect(screen.getByText('Ansicht').className).toBe('sr-only');
    expect(group.parentElement?.className).toContain('relative');
  });

  it('lets long words break instead of cutting them off', () => {
    render(<Periods />);
    const segment = screen.getByRole('radio', { name: 'Monat' });
    expect(segment.className).toContain('hyphens-calm');
    expect(segment.className).toContain('min-h-11');
    expect(segment.className).not.toContain('truncate');
  });
});
