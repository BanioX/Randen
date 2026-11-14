import { localDate, type LocalDate } from '@randen/core';
import { fireEvent, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderApp } from '../app/test-helpers';
import { DateField, type DateFieldProps } from './DateField';
import { describeDate, describeRelative, nextDateText } from './date-text';
import { formMessages } from './messages.forms';

/** The day every test runs on (the fixed clock of `renderApp`): Saturday, 14.11.2026. */
const today = localDate('2026-11-14');

const presets = [
  { label: 'morgen', days: 1 },
  { label: '3 Tage', days: 3 },
  { label: '1 Woche', days: 7 },
];

function Dates({
  onValue,
  initial = null,
  ...props
}: Partial<DateFieldProps> & {
  onValue?: (value: LocalDate | null) => void;
  initial?: LocalDate | null;
}) {
  const [value, setValue] = useState<LocalDate | null>(initial);
  return (
    <DateField
      label="Ablaufdatum"
      presets={presets}
      {...props}
      value={value}
      onChange={(next) => {
        setValue(next);
        onValue?.(next);
      }}
    />
  );
}

describe('nextDateText', () => {
  it('adds dots while only digits are typed', () => {
    let state = { text: '', autoFormatting: true };
    for (const char of '201126') {
      state = nextDateText(state.text, state.text + char, state.autoFormatting);
    }
    expect(state.text).toBe('20.11.26');
    state = { text: '', autoFormatting: true };
    for (const char of '20112026') {
      state = nextDateText(state.text, state.text + char, state.autoFormatting);
    }
    expect(state.text).toBe('20.11.2026');
  });

  it('keeps the text as typed once a separator is typed', () => {
    let state = { text: '', autoFormatting: true };
    for (const char of '11.2026') {
      state = nextDateText(state.text, state.text + char, state.autoFormatting);
    }
    expect(state).toEqual({ text: '11.2026', autoFormatting: false });
    expect(nextDateText('6', '6.', true)).toEqual({ text: '6.', autoFormatting: false });
  });

  it('re-groups after deleting and resets when empty', () => {
    expect(nextDateText('20.11.26', '20.11.2', true).text).toBe('20.11.2');
    expect(nextDateText('20.1', '20.', true).text).toBe('20');
    expect(nextDateText('2', '', false)).toEqual({ text: '', autoFormatting: true });
  });
});

describe('describeDate and describeRelative', () => {
  it('names weekday, day, month and year the same on every device', () => {
    expect(describeDate(localDate('2026-11-20'))).toBe('Fr, 20. Nov. 2026');
    expect(describeDate(localDate('2027-03-01'))).toBe('Mo, 1. März 2027');
    expect(describeDate(localDate('2026-11-15'))).toBe('So, 15. Nov. 2026');
  });

  it.each([
    ['2026-11-14', 'heute'],
    ['2026-11-15', 'morgen'],
    ['2026-11-13', 'gestern'],
    ['2026-11-20', 'in 6 Tagen'],
    ['2026-12-12', 'in 4 Wochen'],
    ['2027-05-14', 'in 6 Monaten'],
    ['2031-11-14', 'in 5 Jahren'],
    ['2026-11-09', 'vor 5 Tagen'],
  ])('describes %s as «%s»', (date, expected) => {
    expect(describeRelative(localDate(date), today)).toBe(expected);
  });
});

describe('DateField', () => {
  it('shows a stored date in the Swiss format with a readable line underneath', async () => {
    await renderApp(<Dates initial={localDate('2026-11-20')} />);
    const input = await screen.findByLabelText<HTMLInputElement>('Ablaufdatum');
    expect(input.value).toBe('20.11.2026');
    expect(input.type).toBe('text');
    expect(input.placeholder).toBe('TT.MM.JJJJ');
    expect(screen.getByText('Fr, 20. Nov. 2026 · in 6 Tagen')).toBeTruthy();
  });

  it('puts the dots in while digits are typed and reports the day', async () => {
    const onValue = vi.fn();
    const { user } = await renderApp(<Dates onValue={onValue} />);
    const input = await screen.findByLabelText<HTMLInputElement>('Ablaufdatum');
    await user.type(input, '24122026');
    expect(input.value).toBe('24.12.2026');
    expect(onValue).toHaveBeenLastCalledWith('2026-12-24');
    expect(screen.getByText('Do, 24. Dez. 2026 · in 6 Wochen')).toBeTruthy();
  });

  it('reads a day without a year and the month on a label', async () => {
    const onValue = vi.fn();
    const { user } = await renderApp(<Dates onValue={onValue} />);
    const input = await screen.findByLabelText('Ablaufdatum');
    await user.type(input, '20.11.');
    expect(onValue).toHaveBeenLastCalledWith('2026-11-20');
    await user.clear(input);
    await user.type(input, '03.2027');
    expect(onValue).toHaveBeenLastCalledWith('2027-03-31');
  });

  it('answers a day that does not exist with null and a message', async () => {
    const onValue = vi.fn();
    const { user } = await renderApp(<Dates onValue={onValue} />);
    const input = await screen.findByLabelText('Ablaufdatum');
    await user.type(input, '31022027');
    expect(onValue).toHaveBeenLastCalledWith(null);
    await user.tab();
    expect(screen.getByText(formMessages.date.unreadable)).toBeTruthy();
    expect(input.getAttribute('aria-invalid')).toBe('true');
  });

  it('sets the date with one tap on a quick choice', async () => {
    const onValue = vi.fn();
    const { user } = await renderApp(<Dates onValue={onValue} />);
    const group = await screen.findByRole('group', { name: 'Schnellwahl' });
    expect(group.querySelectorAll('button')).toHaveLength(3);
    // The group has a short name of its own and points at the label of its field.
    expect(document.getElementById(group.getAttribute('aria-describedby') ?? '')?.textContent).toBe(
      'Ablaufdatum',
    );
    await user.click(screen.getByRole('button', { name: '1 Woche' }));
    expect(screen.getByLabelText<HTMLInputElement>('Ablaufdatum').value).toBe('21.11.2026');
    expect(onValue).toHaveBeenLastCalledWith('2026-11-21');
    expect(screen.getByRole('button', { name: '1 Woche' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(screen.getByRole('button', { name: 'morgen' }).getAttribute('aria-pressed')).toBe(
      'false',
    );
    expect(screen.getByText('Sa, 21. Nov. 2026 · in 7 Tagen')).toBeTruthy();
  });

  it('takes the date from the calendar field that lies on the calendar symbol', async () => {
    const onValue = vi.fn();
    await renderApp(<Dates onValue={onValue} />);
    const calendar = await screen.findByLabelText<HTMLInputElement>('Kalender öffnen');
    expect(
      document.getElementById(calendar.getAttribute('aria-describedby') ?? '')?.textContent,
    ).toBe('Ablaufdatum');
    // A search for the label finds the field alone, also as a pattern.
    expect(screen.getAllByLabelText(/Ablaufdatum/)).toHaveLength(1);
    // A real, tappable date field (not hidden off-screen): iOS opens its wheel only for those.
    expect(calendar.type).toBe('date');
    expect(calendar.className).toContain('inset-0');
    expect(calendar.tabIndex).not.toBe(-1);
    fireEvent.change(calendar, { target: { value: '2026-12-24' } });
    expect(onValue).toHaveBeenLastCalledWith('2026-12-24');
    expect(screen.getByLabelText<HTMLInputElement>('Ablaufdatum').value).toBe('24.12.2026');
  });

  it('keeps to the earliest and the latest day', async () => {
    const onValue = vi.fn();
    const { user } = await renderApp(
      <Dates onValue={onValue} label="Produziert am" presets={[]} max={today} />,
    );
    const input = await screen.findByLabelText('Produziert am');
    await user.type(input, '15112026');
    await user.tab();
    expect(onValue).toHaveBeenLastCalledWith(null);
    expect(screen.getByText('Trag ein Datum bis zum 14.11.2026 ein.')).toBeTruthy();
    await user.clear(input);
    await user.type(input, '14112026');
    expect(onValue).toHaveBeenLastCalledWith('2026-11-14');
    expect(screen.getByText('Sa, 14. Nov. 2026 · heute')).toBeTruthy();
    expect(screen.queryByRole('group')).toBeNull();
  });
});
