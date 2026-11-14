import { addDays, ALLERGEN_IDS, AREA_KINDS, areaKindLabel, localDate } from '@randen/core';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  AllergenBadges,
  AreaBadge,
  areaLooks,
  DietBadge,
  ExpiryChip,
  MarginBadge,
  TemperatureBadge,
} from './badges';

/** The fixed day of the test clock. */
const TODAY = localDate('2026-11-14');

/** The chip of a lot whose date lies `days` from the fixed day. */
function expiry(days: number, dateKind: 'best_before' | 'use_by') {
  const { container } = render(
    <ExpiryChip expiresOn={addDays(TODAY, days)} dateKind={dateKind} today={TODAY} />,
  );
  const chip = container.firstElementChild;
  if (chip === null) {
    throw new Error('ExpiryChip rendered nothing');
  }
  return chip;
}

describe('ExpiryChip', () => {
  it('shows nothing without a date', () => {
    const { container } = render(
      <ExpiryChip expiresOn={undefined} dateKind="best_before" today={TODAY} />,
    );
    expect(container.textContent).toBe('');
    expect(container.firstElementChild).toBeNull();
  });

  it('ok: more than three days left, green, with the kind of date for screen readers', () => {
    const chip = expiry(12, 'best_before');
    expect(chip.textContent).toBe('Mindesthaltbarkeit: in 12 Tagen');
    expect(chip.querySelector('.sr-only')?.textContent).toBe('Mindesthaltbarkeit: ');
    expect(chip.className).toContain('bg-ok-bg');
    expect(chip.className).toContain('relative');
  });

  it('ok starts on the fourth day', () => {
    expect(expiry(4, 'use_by').className).toContain('bg-ok-bg');
    expect(expiry(3, 'use_by').className).toContain('bg-soon-bg');
  });

  it('soon: one to three days left, amber', () => {
    const chip = expiry(2, 'use_by');
    expect(chip.textContent).toBe('Verbrauchsdatum: in 2 Tagen');
    expect(chip.className).toContain('bg-soon-bg');
    expect(expiry(1, 'best_before').textContent).toBe('Mindesthaltbarkeit: morgen');
  });

  it('today: «heute», tinted vermilion', () => {
    const chip = expiry(0, 'use_by');
    expect(chip.textContent).toBe('Verbrauchsdatum: heute');
    expect(chip.className).toContain('bg-today-bg');
    expect(chip.className).toContain('text-today');
  });

  it('expired: a Verbrauchsdatum that is over says «abgelaufen», in full vermilion with an icon', () => {
    const chip = expiry(-3, 'use_by');
    expect(chip.textContent).toBe('abgelaufen seit 3 Tagen');
    expect(chip.className).toContain('bg-danger');
    expect(chip.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(expiry(-1, 'use_by').textContent).toBe('abgelaufen seit gestern');
  });

  it('past best before: «MHD überschritten», amber, never «abgelaufen»', () => {
    const chip = expiry(-3, 'best_before');
    expect(chip.textContent).toBe('MHD überschritten seit 3 Tagen');
    expect(chip.textContent).not.toContain('abgelaufen');
    expect(chip.className).toContain('bg-soon-bg');
    expect(chip.querySelector('svg')).not.toBeNull();
  });
});

describe('AllergenBadges', () => {
  it('lists the allergens in the order of the ordinance, traces outlined with «Spuren:»', () => {
    render(<AllergenBadges allergens={['milk', 'gluten']} traces={['nuts']} />);
    const list = screen.getByRole('list', { name: 'Allergene' });
    const items = within(list).getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual(['Gluten', 'Milch', 'Spuren: Nüsse']);
    expect(items[0]?.className).toContain('bg-surface-muted');
    expect(items[2]?.className).toContain('border');
  });

  it('does not repeat as a trace what the dish contains anyway', () => {
    render(<AllergenBadges allergens={['milk']} traces={['milk', 'sesame']} />);
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Milch',
      'Spuren: Sesam',
    ]);
  });

  it('knows a label for each of the fourteen allergens', () => {
    render(<AllergenBadges allergens={ALLERGEN_IDS} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(14);
  });

  it('shows the empty text when there is none, or nothing', () => {
    const { container, rerender } = render(
      <AllergenBadges allergens={[]} traces={[]} empty="Keine Allergene" />,
    );
    expect(container.textContent).toBe('Keine Allergene');
    expect(screen.queryByRole('list')).toBeNull();
    rerender(<AllergenBadges allergens={[]} />);
    expect(container.textContent).toBe('');
  });
});

describe('DietBadge', () => {
  it('names vegan and vegetarian dishes with a leaf, and says nothing about the rest', () => {
    const { container, rerender } = render(<DietBadge diet="vegan" />);
    expect(container.textContent).toBe('Vegan');
    expect(container.querySelector('svg')).not.toBeNull();
    rerender(<DietBadge diet="vegetarian" />);
    expect(container.textContent).toBe('Vegetarisch');
    rerender(<DietBadge diet="omnivore" />);
    expect(container.firstElementChild).toBeNull();
  });
});

describe('AreaBadge', () => {
  it('has an icon and a tone for every kind of area in the core', () => {
    expect(Object.keys(areaLooks).sort()).toEqual([...AREA_KINDS].sort());
    for (const kind of AREA_KINDS) {
      const { container, unmount } = render(<AreaBadge kind={kind} />);
      expect(container.textContent).toBe(areaKindLabel(kind));
      expect(container.querySelector('svg')).not.toBeNull();
      unmount();
    }
  });

  it('wears the tone of its kind', () => {
    const tones = {
      cold: 'bg-cold-bg',
      frozen: 'bg-frozen-bg',
      dry: 'bg-dry-bg',
      bar: 'bg-bar-bg',
    };
    for (const [kind, tone] of Object.entries(tones)) {
      const { container, unmount } = render(<AreaBadge kind={kind as keyof typeof tones} />);
      expect(container.firstElementChild?.className).toContain(tone);
      unmount();
    }
    const { container } = render(<AreaBadge kind="station" name="Garde-manger" />);
    expect(container.firstElementChild?.className).toContain('bg-surface-muted');
  });

  it('shows the name of the business and keeps the kind for screen readers', () => {
    const { container } = render(<AreaBadge kind="frozen" name="TK 2" />);
    expect(container.textContent).toBe('Tiefkühlzelle: TK 2');
    expect(container.querySelector('.sr-only')?.textContent).toBe('Tiefkühlzelle: ');
  });
});

describe('MarginBadge', () => {
  it('good: the share in green, «im Ziel» for screen readers', () => {
    const { container } = render(<MarginBadge status="good" foodCostBps={3000} />);
    expect(container.textContent).toBe('30 % Wareneinsatz, im Ziel');
    expect(container.firstElementChild?.className).toContain('bg-ok-bg');
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('watch: amber, «knapp über dem Ziel»', () => {
    const { container } = render(<MarginBadge status="watch" foodCostBps={3510} />);
    expect(container.textContent).toBe('35.1 % Wareneinsatz, knapp über dem Ziel');
    expect(container.firstElementChild?.className).toContain('bg-soon-bg');
  });

  it('over: vermilion, «über dem Ziel»', () => {
    const { container } = render(<MarginBadge status="over" foodCostBps={3810} />);
    expect(container.textContent).toBe('38.1 % Wareneinsatz, über dem Ziel');
    expect(container.firstElementChild?.className).toContain('bg-today-bg');
  });

  it('unknown: says «Preis fehlt» instead of a number', () => {
    const { container } = render(<MarginBadge status="unknown" foodCostBps={2000} />);
    expect(container.textContent).toBe('Preis fehlt');
    expect(container.firstElementChild?.className).toContain('bg-surface-muted');
  });

  it('short: only the share, for a column headed «Wareneinsatz»', () => {
    const { container } = render(<MarginBadge short status="good" foodCostBps={2300} />);
    expect(container.textContent).toBe('23 %, im Ziel');
  });

  it('says how the dish stands when there is no share', () => {
    const { container } = render(<MarginBadge status="over" />);
    expect(container.textContent).toBe('über dem Ziel');
  });
});

describe('TemperatureBadge', () => {
  it('inside the range: green with a thermometer', () => {
    const { container } = render(<TemperatureBadge deciC={45} ok />);
    expect(container.textContent).toBe('4.5 °C, im Bereich');
    expect(container.firstElementChild?.className).toContain('bg-ok-bg');
  });

  it('outside the range: vermilion with a warning sign', () => {
    const { container } = render(<TemperatureBadge deciC={-124} ok={false} />);
    expect(container.textContent).toBe('-12.4 °C, ausserhalb des Bereichs');
    expect(container.firstElementChild?.className).toContain('bg-danger');
  });

  it('tells the two apart by the icon as well as by the colour', () => {
    const inside = render(<TemperatureBadge deciC={45} ok />).container.querySelector('svg');
    const outside = render(<TemperatureBadge deciC={45} ok={false} />).container.querySelector(
      'svg',
    );
    expect(inside?.innerHTML).not.toBe(outside?.innerHTML);
  });

  it('stays neutral without a judgement', () => {
    const { container } = render(<TemperatureBadge deciC={-180} />);
    expect(container.textContent).toBe('-18 °C');
    expect(container.firstElementChild?.className).toContain('bg-surface-muted');
  });
});
