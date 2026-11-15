import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type ReactNode, type SyntheticEvent } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Field, joinIds } from './Field';
import { formMessages } from './messages.forms';
import { NumberField, type NumberFieldProps } from './NumberField';
import { PercentField, type PercentFieldProps } from './PercentField';
import { SelectField } from './SelectField';
import { TemperatureField } from './TemperatureField';
import { TextArea, TextField } from './TextField';

/** A form that records whether it was sent and never navigates. */
function Form({ onSubmit, children }: { onSubmit: () => void; children: ReactNode }) {
  return (
    <form
      onSubmit={(event: SyntheticEvent) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      {children}
      <button type="submit">Sichern</button>
    </form>
  );
}

function described(element: HTMLElement): string {
  return (element.getAttribute('aria-describedby') ?? '')
    .split(' ')
    .map((id) => document.getElementById(id)?.textContent ?? '')
    .join(' | ');
}

function Numbers({
  onValue,
  initial = null,
  ...props
}: Partial<NumberFieldProps> & {
  onValue?: (value: number | null) => void;
  initial?: number | null;
}) {
  const [value, setValue] = useState<number | null>(initial);
  return (
    <NumberField
      label="Portionen"
      {...props}
      value={value}
      onChange={(next) => {
        setValue(next);
        onValue?.(next);
      }}
    />
  );
}

function Percent({
  onValue,
  initial = null,
  ...props
}: Partial<PercentFieldProps> & {
  onValue?: (value: number | null) => void;
  initial?: number | null;
}) {
  const [value, setValue] = useState<number | null>(initial);
  return (
    <PercentField
      label="Ausbeute"
      {...props}
      value={value}
      onChange={(next) => {
        setValue(next);
        onValue?.(next);
      }}
    />
  );
}

function Temperature({
  onValue,
  initial = null,
}: {
  onValue?: (value: number | null) => void;
  initial?: number | null;
}) {
  const [value, setValue] = useState<number | null>(initial);
  return (
    <TemperatureField
      label="Kühlzelle"
      value={value}
      onChange={(next) => {
        setValue(next);
        onValue?.(next);
      }}
    />
  );
}

describe('Field', () => {
  it('wires label, hint and error to the control', () => {
    render(
      <Field
        label="Name"
        labelSuffix="des Artikels"
        hint="Wie auf dem Lieferschein."
        error="Zu lang."
      >
        {(control) => <input {...control} />}
      </Field>,
    );
    const input = screen.getByLabelText('Name des Artikels');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(described(input)).toBe('Zu lang. | Wie auf dem Lieferschein.');
  });

  it('keeps a hidden label for screen readers and marks optional fields', () => {
    render(
      <Field label="Notiz" hideLabel optional>
        {(control) => <input {...control} />}
      </Field>,
    );
    const input = screen.getByLabelText('Notiz');
    expect(input.getAttribute('aria-invalid')).toBeNull();
    expect(described(input)).toBe('optional');
  });

  it('joins only the ids that are there', () => {
    expect(joinIds('a', false, null, undefined, '', 'b')).toBe('a b');
    expect(joinIds(false, undefined)).toBeUndefined();
  });
});

describe('TextField and TextArea', () => {
  it('reports what is typed', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    function Name() {
      const [value, setValue] = useState('');
      return (
        <TextField
          label="Name"
          value={value}
          onChange={(next) => {
            setValue(next);
            onChange(next);
          }}
        />
      );
    }
    render(<Name />);
    await user.type(screen.getByLabelText('Name'), 'Vollrahm');
    expect(onChange).toHaveBeenLastCalledWith('Vollrahm');
    expect(screen.getByLabelText<HTMLInputElement>('Name').value).toBe('Vollrahm');
  });

  it('shows the error of the form with a symbol and marks the field', () => {
    render(
      <TextField
        label="Name"
        value="Butter"
        onChange={vi.fn()}
        error="Diesen Namen gibt es schon."
      />,
    );
    const input = screen.getByLabelText('Name');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(described(input)).toBe('Diesen Namen gibt es schon.');
    expect(
      screen.getByText('Diesen Namen gibt es schon.').parentElement?.querySelector('svg'),
    ).not.toBeNull();
  });

  it('does not let a form go while a required field is empty, and says so at the field', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    function Both() {
      const [name, setName] = useState('');
      const [note, setNote] = useState('   ');
      return (
        <Form onSubmit={onSubmit}>
          <TextField label="Name" value={name} onChange={setName} required />
          <TextArea label="Notiz" value={note} onChange={setNote} required />
        </Form>
      );
    }
    render(<Both />);
    expect(screen.queryByText(formMessages.required)).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Sichern' }));
    expect(onSubmit).not.toHaveBeenCalled();
    // Blanks alone are no text either.
    expect(screen.getAllByText(formMessages.required)).toHaveLength(2);
    // The first field with a problem takes the focus.
    expect(document.activeElement).toBe(screen.getByLabelText('Name'));

    await user.type(screen.getByLabelText('Name'), 'Jus');
    await user.clear(screen.getByLabelText('Notiz'));
    await user.type(screen.getByLabelText('Notiz'), 'Täglich frisch');
    expect(screen.queryByText(formMessages.required)).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Sichern' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('can be switched off', () => {
    render(<TextArea label="Notiz" value="" onChange={vi.fn()} disabled />);
    expect(screen.getByLabelText<HTMLTextAreaElement>('Notiz').disabled).toBe(true);
  });
});

describe('NumberField', () => {
  it('reads whole numbers and shows a stored value', async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<Numbers onValue={onValue} initial={10} suffix="Portionen" />);
    const input = screen.getByLabelText<HTMLInputElement>('Portionen');
    expect(input.value).toBe('10');
    expect(input.inputMode).toBe('numeric');
    expect(described(input)).toBe('Portionen');
    await user.clear(input);
    expect(onValue).toHaveBeenLastCalledWith(null);
    await user.type(input, '1’250');
    expect(onValue).toHaveBeenLastCalledWith(1250);
    await user.clear(input);
    await user.type(input, '12,0');
    expect(onValue).toHaveBeenLastCalledWith(12);
  });

  it('answers garbage with null and a message once the field is left', async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<Numbers onValue={onValue} />);
    const input = screen.getByLabelText('Portionen');
    await user.type(input, '2.5');
    expect(onValue).toHaveBeenLastCalledWith(null);
    // Not while typing: «2.» is on its way to «2.0».
    expect(screen.queryByText(formMessages.number.unreadable)).toBeNull();
    await user.tab();
    expect(screen.getByText(formMessages.number.unreadable)).toBeTruthy();
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(described(input)).toBe(formMessages.number.unreadable);
    // Once shown, the message follows the typing and goes when the text can be read.
    await user.clear(input);
    await user.type(input, '3');
    expect(screen.queryByText(formMessages.number.unreadable)).toBeNull();
    expect(input.getAttribute('aria-invalid')).toBeNull();
    expect(onValue).toHaveBeenLastCalledWith(3);
  });

  it('keeps to its range', async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<Numbers onValue={onValue} min={1} max={500} />);
    const input = screen.getByLabelText('Portionen');
    await user.type(input, '0');
    await user.tab();
    expect(onValue).toHaveBeenLastCalledWith(null);
    expect(screen.getByText('Trag mindestens 1 ein.')).toBeTruthy();
    await user.clear(input);
    await user.type(input, '501');
    expect(onValue).toHaveBeenLastCalledWith(null);
    expect(screen.getByText('Trag höchstens 500 ein.')).toBeTruthy();
  });

  it('shows unreadable text at once when the form reports an error of its own', async () => {
    const user = userEvent.setup();
    render(<Numbers error="Trag die Portionen ein." />);
    expect(screen.getByText('Trag die Portionen ein.')).toBeTruthy();
    await user.type(screen.getByLabelText('Portionen'), 'viele');
    expect(screen.getByText(formMessages.number.unreadable)).toBeTruthy();
    expect(screen.queryByText('Trag die Portionen ein.')).toBeNull();
  });

  it('stops a form with text it cannot read instead of dropping it', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <Form onSubmit={onSubmit}>
        <Numbers />
      </Form>,
    );
    // Enter in the field sends the form: no blur has happened yet.
    await user.type(screen.getByLabelText('Portionen'), 'zwölf{Enter}');
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(formMessages.number.unreadable)).toBeTruthy();
    await user.clear(screen.getByLabelText('Portionen'));
    await user.type(screen.getByLabelText('Portionen'), '12{Enter}');
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('keeps what was typed when the form holds on to its last value', async () => {
    const user = userEvent.setup();
    function Stubborn() {
      const [value, setValue] = useState<number | null>(10);
      return (
        <NumberField
          label="Portionen"
          value={value}
          onChange={(next) => {
            // A form that only ever stores readable numbers.
            if (next !== null) {
              setValue(next);
            }
          }}
        />
      );
    }
    render(<Stubborn />);
    const input = screen.getByLabelText<HTMLInputElement>('Portionen');
    await user.type(input, 'x');
    expect(input.value).toBe('10x');
    await user.tab();
    expect(screen.getByText(formMessages.number.unreadable)).toBeTruthy();
    await user.clear(input);
    expect(input.value).toBe('');
  });

  it('follows a value set from outside and clears with it', () => {
    const { rerender } = render(<NumberField label="Tage" value={3} onChange={vi.fn()} />);
    expect(screen.getByLabelText<HTMLInputElement>('Tage').value).toBe('3');
    rerender(<NumberField label="Tage" value={14} onChange={vi.fn()} />);
    expect(screen.getByLabelText<HTMLInputElement>('Tage').value).toBe('14');
    rerender(<NumberField label="Tage" value={null} onChange={vi.fn()} />);
    expect(screen.getByLabelText<HTMLInputElement>('Tage').value).toBe('');
  });
});

describe('PercentField', () => {
  it('reads a share with point or comma into basis points', async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<Percent onValue={onValue} />);
    const input = screen.getByLabelText<HTMLInputElement>('Ausbeute');
    expect(input.inputMode).toBe('decimal');
    expect(described(input)).toBe('%');
    await user.type(input, '30');
    expect(onValue).toHaveBeenLastCalledWith(3000);
    await user.clear(input);
    await user.type(input, '8,1');
    expect(onValue).toHaveBeenLastCalledWith(810);
    await user.clear(input);
    await user.type(input, '35.25 %');
    expect(onValue).toHaveBeenLastCalledWith(3525);
  });

  it('takes a minus sign only where a change is meant, from the button or by typing', async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(
      <Percent onValue={onValue} allowNegative min={-9000} max={30000} label="Preisänderung" />,
    );
    const input = screen.getByLabelText<HTMLInputElement>('Preisänderung');
    const minus = screen.getByRole('button', { name: 'Minus, Preisänderung' });
    await user.type(input, '15');
    expect(onValue).toHaveBeenLastCalledWith(1500);
    expect(minus.getAttribute('aria-pressed')).toBe('false');
    await user.click(minus);
    expect(onValue).toHaveBeenLastCalledWith(-1500);
    expect(minus.getAttribute('aria-pressed')).toBe('true');
    await user.click(minus);
    expect(onValue).toHaveBeenLastCalledWith(1500);
    await user.clear(input);
    await user.type(input, '-8,5');
    expect(onValue).toHaveBeenLastCalledWith(-850);
    await user.clear(input);
    await user.type(input, '-95');
    await user.tab();
    expect(onValue).toHaveBeenLastCalledWith(null);
    expect(screen.getByText('Trag mindestens -90 % ein.')).toBeTruthy();
  });

  it('keeps a share unsigned: a minus is unreadable without allowNegative', async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<Percent onValue={onValue} />);
    await user.type(screen.getByLabelText('Ausbeute'), '-5');
    await user.tab();
    expect(onValue).toHaveBeenLastCalledWith(null);
    expect(screen.getByText(formMessages.percent.unreadable)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Minus/ })).toBeNull();
  });

  it('shows a stored share without float noise', () => {
    render(<Percent initial={810} />);
    expect(screen.getByLabelText<HTMLInputElement>('Ausbeute').value).toBe('8.1');
  });

  it('answers garbage and shares out of range with null and a message', async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<Percent onValue={onValue} min={500} />);
    const input = screen.getByLabelText('Ausbeute');
    await user.type(input, '8.125');
    await user.tab();
    expect(onValue).toHaveBeenLastCalledWith(null);
    expect(screen.getByText(formMessages.percent.unreadable)).toBeTruthy();
    await user.clear(input);
    await user.type(input, '120');
    expect(onValue).toHaveBeenLastCalledWith(null);
    expect(screen.getByText('Trag höchstens 100 % ein.')).toBeTruthy();
    await user.clear(input);
    await user.type(input, '2');
    expect(screen.getByText('Trag mindestens 5 % ein.')).toBeTruthy();
  });
});

describe('TemperatureField', () => {
  it('reads tenths of a degree with point or comma', async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<Temperature onValue={onValue} />);
    const input = screen.getByLabelText<HTMLInputElement>('Kühlzelle');
    expect(described(input)).toBe('°C');
    await user.type(input, '4,5');
    expect(onValue).toHaveBeenLastCalledWith(45);
    await user.clear(input);
    await user.type(input, '-18');
    expect(onValue).toHaveBeenLastCalledWith(-180);
    await user.clear(input);
    await user.type(input, '7.5 °C');
    expect(onValue).toHaveBeenLastCalledWith(75);
  });

  it('sets the minus with a button, for number pads without a minus key', async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<Temperature onValue={onValue} />);
    const input = screen.getByLabelText<HTMLInputElement>('Kühlzelle');
    const minus = screen.getByRole('button', { name: 'Minusgrade, Kühlzelle' });
    expect(minus.getAttribute('aria-pressed')).toBe('false');
    await user.type(input, '18');
    await user.click(minus);
    expect(input.value).toBe('-18');
    expect(onValue).toHaveBeenLastCalledWith(-180);
    expect(minus.getAttribute('aria-pressed')).toBe('true');
    expect(document.activeElement).toBe(input);
    await user.click(minus);
    expect(input.value).toBe('18');
    expect(onValue).toHaveBeenLastCalledWith(180);
  });

  it('shows a stored value and answers garbage with null and a message', async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<Temperature onValue={onValue} initial={-180} />);
    const input = screen.getByLabelText<HTMLInputElement>('Kühlzelle');
    expect(input.value).toBe('-18');
    await user.clear(input);
    await user.type(input, 'kalt');
    await user.tab();
    expect(onValue).toHaveBeenLastCalledWith(null);
    expect(screen.getByText(formMessages.temperature.unreadable)).toBeTruthy();
  });
});

describe('SelectField', () => {
  const options = [
    { value: 'best_before', label: 'Mindestens haltbar bis' },
    { value: 'use_by', label: 'Zu verbrauchen bis' },
  ] as const;
  type Kind = (typeof options)[number]['value'];

  function Kinds({
    onValue,
    initial = null,
    required = false,
    placeholder,
  }: {
    onValue?: (value: Kind | null) => void;
    initial?: Kind | null;
    required?: boolean;
    placeholder?: string;
  }) {
    const [value, setValue] = useState<Kind | null>(initial);
    return (
      <SelectField
        label="Datum auf der Packung"
        options={options}
        value={value}
        required={required}
        placeholder={placeholder}
        onChange={(next) => {
          setValue(next);
          onValue?.(next);
        }}
      />
    );
  }

  it('offers the options under its label and reports the choice', async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<Kinds onValue={onValue} placeholder="Ohne Datum" />);
    const select = screen.getByLabelText<HTMLSelectElement>('Datum auf der Packung');
    expect(Array.from(select.options, (option) => option.text)).toEqual([
      'Ohne Datum',
      'Mindestens haltbar bis',
      'Zu verbrauchen bis',
    ]);
    await user.selectOptions(select, 'Zu verbrauchen bis');
    expect(onValue).toHaveBeenLastCalledWith('use_by');
    // An optional choice can be taken back.
    await user.selectOptions(select, 'Ohne Datum');
    expect(onValue).toHaveBeenLastCalledWith(null);
  });

  it('drops the empty choice of a required field once something is chosen', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <Form onSubmit={onSubmit}>
        <Kinds required />
      </Form>,
    );
    const select = screen.getByLabelText<HTMLSelectElement>('Datum auf der Packung');
    expect(select.options[0]?.text).toBe(formMessages.select.placeholder);
    await user.click(screen.getByRole('button', { name: 'Sichern' }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(formMessages.required)).toBeTruthy();
    await user.selectOptions(select, 'use_by');
    expect(select.options).toHaveLength(2);
    expect(screen.queryByText(formMessages.required)).toBeNull();
  });

  it('shows a value that is no longer in the list as nothing chosen', () => {
    render(
      <SelectField
        label="Lieferant"
        options={[{ value: 'a', label: 'Grosshandel Beispiel' }]}
        value="gone"
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByLabelText<HTMLSelectElement>('Lieferant').value).toBe('');
  });
});
