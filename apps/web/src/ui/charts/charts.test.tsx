import { render, screen, within } from '@testing-library/react';
import { cloneElement, type ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import { BarChart } from './BarChart';
import { Donut } from './Donut';
import { HBarChart } from './HBarChart';
import { LineChart } from './LineChart';
import { ProgressBar } from './ProgressBar';
import { Sparkline } from './Sparkline';

const WEEK = [
  { label: 'Mo', value: 1840, second: 560 },
  { label: 'Di', value: 2120, second: 640 },
  { label: 'Mi', value: 2460, second: 790 },
];

const francs = (value: number) => `CHF ${String(value)}`;

/** The cells of the data table of a chart, row by row (header, body, footer). */
function tableRows(caption: string): string[][] {
  const table = screen.getByRole('table', { name: caption });
  return within(table)
    .getAllByRole('row')
    .map((row) => [...row.querySelectorAll('th, td')].map((cell) => cell.textContent));
}

/** Every attribute of every element inside the SVGs of a chart, and inline styles around them. */
function drawnValues(container: HTMLElement): string[] {
  const values: string[] = [];
  for (const element of container.querySelectorAll('svg, svg *, [style]')) {
    for (const attribute of element.attributes) {
      values.push(`${element.tagName} ${attribute.name}="${attribute.value}"`);
    }
  }
  return values;
}

function expectCleanGeometry(chart: ReactElement) {
  const { container, unmount } = render(chart);
  const values = drawnValues(container);
  expect(values.length).toBeGreaterThan(0);
  for (const value of values) {
    expect(value).not.toMatch(/NaN|Infinity|undefined|null/);
  }
  unmount();
}

describe('every chart', () => {
  const charts: [name: string, chart: ReactElement<{ showTable?: boolean }>][] = [
    [
      'BarChart',
      <BarChart
        key="bar"
        summary="Der Umsatz steigt."
        categoryLabel="Tag"
        valueLabel="Umsatz"
        data={WEEK}
      />,
    ],
    [
      'HBarChart',
      <HBarChart
        key="hbar"
        summary="Der Umsatz steigt."
        categoryLabel="Tag"
        valueLabel="Umsatz"
        data={WEEK}
      />,
    ],
    [
      'LineChart',
      <LineChart
        key="line"
        summary="Der Umsatz steigt."
        categoryLabel="Tag"
        valueLabel="Umsatz"
        data={WEEK}
      />,
    ],
    [
      'Donut',
      <Donut
        key="donut"
        summary="Der Umsatz steigt."
        categoryLabel="Tag"
        valueLabel="Umsatz"
        parts={WEEK}
      />,
    ],
    [
      'ProgressBar',
      <ProgressBar
        key="progress"
        summary="Der Umsatz steigt."
        label="Budget"
        value={3}
        max={9}
        valueText="3 von 9"
      />,
    ],
    ['Sparkline', <Sparkline key="spark" summary="Der Umsatz steigt." values={[1, 3, 2]} />],
  ];

  it.each(charts)('%s is a picture named by its takeaway', (_name, chart) => {
    render(chart);
    expect(screen.getByRole('img', { name: 'Der Umsatz steigt.' })).toBeTruthy();
  });

  it.each(charts.slice(0, 4))(
    '%s keeps its values in a data table for screen readers',
    (_name, chart) => {
      render(chart);
      const table = screen.getByRole('table', { name: 'Daten: Umsatz nach Tag' });
      expect(table.className).toBe('sr-only');
      expect(table.closest('figure')?.className).toContain('relative');
      const rows = tableRows('Daten: Umsatz nach Tag');
      expect(rows[0]?.slice(0, 2)).toEqual(['Tag', 'Umsatz']);
      expect(rows.slice(1).map((row) => row.slice(0, 2))).toEqual([
        ['Mo', '1’840'],
        ['Di', '2’120'],
        ['Mi', '2’460'],
      ]);
    },
  );

  it.each(charts.slice(0, 4))('%s can show its data table', (_name, chart) => {
    render(cloneElement(chart, { showTable: true }));
    expect(screen.getByRole('table', { name: 'Daten: Umsatz nach Tag' }).className).not.toBe(
      'sr-only',
    );
  });
});

describe('BarChart', () => {
  it('formats values with the function of the page and labels the highest bar', () => {
    const { container } = render(
      <BarChart
        summary="Mittwoch war der beste Tag."
        categoryLabel="Tag"
        valueLabel="Umsatz"
        data={WEEK}
        formatValue={francs}
        valueLabels="max"
      />,
    );
    expect(tableRows('Daten: Umsatz nach Tag')[3]).toEqual(['Mi', 'CHF 2460']);
    const texts = [...container.querySelectorAll('svg text')].map((text) => text.textContent);
    expect(texts).toContain('CHF 2460');
    expect(texts).not.toContain('CHF 1840');
    // Category labels under the bars.
    expect(texts).toEqual(expect.arrayContaining(['Mo', 'Di', 'Mi']));
  });

  it('draws one thin bar per category, at most 24 px wide, with a tooltip', () => {
    const { container } = render(
      <BarChart
        summary="s"
        categoryLabel="Tag"
        valueLabel="Umsatz"
        data={WEEK}
        formatValue={francs}
      />,
    );
    const bars = [...container.querySelectorAll('svg path')];
    expect(bars).toHaveLength(3);
    for (const bar of bars) {
      // The path runs from its left edge (M x) to its right edge (the last H x).
      const xs = [...(bar.getAttribute('d') ?? '').matchAll(/[MH](-?[\d.]+)/g)].map((m) =>
        Number(m[1]),
      );
      expect(Math.max(...xs) - Math.min(...xs)).toBeLessThanOrEqual(24);
      expect(bar.getAttribute('fill')).toBe('var(--color-chart-1)');
    }
    expect([...container.querySelectorAll('svg title')].map((title) => title.textContent)).toEqual([
      'Mo: CHF 1840',
      'Di: CHF 2120',
      'Mi: CHF 2460',
    ]);
  });

  it('stacks a second series, names both in an HTML legend and totals them on the cap', () => {
    const { container } = render(
      <BarChart
        summary="s"
        categoryLabel="Tag"
        valueLabel="Küche"
        secondLabel="Getränke"
        data={WEEK}
        valueLabels="all"
      />,
    );
    expect(tableRows('Daten: Küche nach Tag')).toEqual([
      ['Tag', 'Küche', 'Getränke'],
      ['Mo', '1’840', '560'],
      ['Di', '2’120', '640'],
      ['Mi', '2’460', '790'],
    ]);
    const legend = container.querySelector('figure > ul');
    expect([...(legend?.querySelectorAll('li') ?? [])].map((item) => item.textContent)).toEqual([
      'Küche',
      'Getränke',
    ]);
    expect(container.querySelector('svg ul')).toBeNull();
    const texts = [...container.querySelectorAll('svg text')].map((text) => text.textContent);
    expect(texts).toContain('2’400');
    expect(container.querySelectorAll('[fill="var(--color-chart-2)"]')).toHaveLength(3);
  });

  it('puts two series side by side when asked', () => {
    const { container } = render(
      <BarChart
        summary="s"
        categoryLabel="Tag"
        valueLabel="Plan"
        secondLabel="Ist"
        mode="grouped"
        data={WEEK}
      />,
    );
    expect(container.querySelectorAll('svg path[fill="var(--color-chart-1)"]')).toHaveLength(3);
    expect(container.querySelectorAll('svg path[fill="var(--color-chart-2)"]')).toHaveLength(3);
  });

  it('draws the target as a dashed line, names it in the legend and keeps it in the table', () => {
    const { container } = render(
      <BarChart
        summary="s"
        categoryLabel="Tag"
        valueLabel="Umsatz"
        data={WEEK}
        target={{ value: 3000, label: 'Tagesziel' }}
      />,
    );
    expect(container.querySelector('svg line[stroke-dasharray]')).not.toBeNull();
    expect(container.querySelector('figure > ul')?.textContent).toBe('Tagesziel');
    expect(tableRows('Daten: Umsatz nach Tag').at(-1)).toEqual(['Tagesziel', '3’000']);
    // The axis reaches the target even though every bar is lower.
    const ticks = [...container.querySelectorAll('svg text')].map((text) => text.textContent);
    expect(ticks).toContain('3’000');
  });

  it('uses status colours only where a bar carries a tone, and explains them', () => {
    const { container } = render(
      <BarChart
        summary="s"
        categoryLabel="Woche"
        valueLabel="Einkauf"
        data={[
          { label: 'KW 45', value: 900, tone: 'ok' },
          { label: 'KW 46', value: 1300, tone: 'danger' },
        ]}
        toneLabels={{ ok: 'im Budget', danger: 'über dem Budget' }}
      />,
    );
    expect(container.querySelector('svg path[fill="var(--color-ok)"]')).not.toBeNull();
    expect(container.querySelector('svg path[fill="var(--color-danger)"]')).not.toBeNull();
    expect(
      [...container.querySelectorAll('figure > ul li')].map((item) => item.textContent),
    ).toEqual(['im Budget', 'über dem Budget']);
  });

  it('thins out the labels under many bars instead of letting them collide', () => {
    const days = Array.from({ length: 14 }, (_, index) => ({
      label: `${String(index + 1)}.11.2026`,
      value: 100 + index,
    }));
    const { container } = render(
      <BarChart
        summary="s"
        categoryLabel="Tag"
        valueLabel="Umsatz"
        data={days}
        valueLabels="none"
      />,
    );
    const shown = [...container.querySelectorAll('svg text')]
      .map((text) => text.textContent)
      .filter((text) => text.endsWith('.2026'));
    expect(shown.length).toBeLessThan(14);
    expect(shown[0]).toBe('1.11.2026');
    expect(shown.at(-1)).toBe('14.11.2026');
    expect(tableRows('Daten: Umsatz nach Tag')).toHaveLength(15);
  });
});

describe('HBarChart', () => {
  it('shows names and values as text and scales the bars to the longest', () => {
    const { container } = render(
      <HBarChart
        summary="Abgelaufene Ware ist der grösste Posten."
        categoryLabel="Grund"
        valueLabel="Abschreiber"
        formatValue={francs}
        data={[
          { label: 'Abgelaufen', value: 80 },
          { label: 'Verdorben', value: 40 },
          { label: 'Beschädigt', value: 0 },
        ]}
      />,
    );
    const picture = screen.getByRole('img', { name: 'Abgelaufene Ware ist der grösste Posten.' });
    expect(within(picture).getByText('Abgelaufen')).toBeTruthy();
    expect(within(picture).getByText('CHF 80')).toBeTruthy();
    const bars = [...container.querySelectorAll('svg')].map(
      (svg) => svg.querySelector('rect')?.getAttribute('width') ?? 'none',
    );
    expect(bars).toEqual(['100%', '50%', 'none']);
    expect(tableRows('Daten: Abschreiber nach Grund')).toEqual([
      ['Grund', 'Abschreiber'],
      ['Abgelaufen', 'CHF 80'],
      ['Verdorben', 'CHF 40'],
      ['Beschädigt', 'CHF 0'],
    ]);
  });

  it('says so when there is no data, and keeps the table', () => {
    render(<HBarChart summary="s" categoryLabel="Grund" valueLabel="Abschreiber" data={[]} />);
    expect(screen.getByText('Noch keine Daten')).toBeTruthy();
    expect(tableRows('Daten: Abschreiber nach Grund')).toEqual([['Grund', 'Abschreiber']]);
  });
});

describe('LineChart', () => {
  it('draws a line with a light area, an end dot and the last value', () => {
    const { container } = render(
      <LineChart
        summary="Der Umsatz steigt."
        categoryLabel="Tag"
        valueLabel="Umsatz"
        data={WEEK}
        formatValue={francs}
      />,
    );
    const paths = [...container.querySelectorAll('svg path')];
    expect(paths).toHaveLength(2);
    expect(paths[0]?.getAttribute('fill-opacity')).toBe('0.1');
    expect(paths[1]?.getAttribute('stroke-width')).toBe('2');
    expect(paths[1]?.getAttribute('fill')).toBe('none');
    expect(container.querySelectorAll('svg circle')).toHaveLength(1);
    const texts = [...container.querySelectorAll('svg text')].map((text) => text.textContent);
    expect(texts).toContain('CHF 2460');
    expect(texts).toEqual(expect.arrayContaining(['Mo', 'Mi']));
    // One series needs no legend.
    expect(container.querySelector('figure > ul')).toBeNull();
  });

  it('draws two series on one axis with a legend and both columns in the table', () => {
    const { container } = render(
      <LineChart
        summary="s"
        categoryLabel="Tag"
        valueLabel="Umsatz"
        secondLabel="Warenkosten"
        data={WEEK}
      />,
    );
    expect(container.querySelectorAll('svg path[stroke]')).toHaveLength(2);
    expect(container.querySelectorAll('svg circle')).toHaveLength(2);
    expect(
      [...container.querySelectorAll('figure > ul li')].map((item) => item.textContent),
    ).toEqual(['Umsatz', 'Warenkosten']);
    expect(tableRows('Daten: Umsatz nach Tag')[1]).toEqual(['Mo', '1’840', '560']);
    expect(container.querySelector('svg title')?.textContent).toBe(
      'Mo: Umsatz 1’840, Warenkosten 560',
    );
  });

  it('has three or four ticks from zero up to a round number', () => {
    const { container } = render(
      <LineChart summary="s" categoryLabel="Tag" valueLabel="Umsatz" data={WEEK} />,
    );
    const ticks = [...container.querySelectorAll('svg text[text-anchor="end"]')]
      .map((text) => text.textContent)
      .filter((text) => /^[\d’]+$/.test(text));
    expect(ticks.slice(0, 4)).toEqual(['0', '1’000', '2’000', '3’000']);
  });
});

describe('Donut', () => {
  it('lists every part with its value and share beside the ring, and the total in the middle', () => {
    const { container } = render(
      <Donut
        summary="Die meisten Gerichte sind Gewinner."
        categoryLabel="Klasse"
        valueLabel="Gerichte"
        parts={[
          { label: 'Gewinner', value: 6 },
          { label: 'Renner', value: 3 },
          { label: 'Verlierer', value: 3 },
        ]}
        centerValue="12"
        centerLabel="Gerichte"
        showShare
      />,
    );
    expect(tableRows('Daten: Gerichte nach Klasse')).toEqual([
      ['Klasse', 'Gerichte', 'Anteil'],
      ['Gewinner', '6', '50 %'],
      ['Renner', '3', '25 %'],
      ['Verlierer', '3', '25 %'],
    ]);
    const legend = [...container.querySelectorAll('figure ul li')].map((item) => item.textContent);
    expect(legend).toEqual(['Gewinner650 %', 'Renner325 %', 'Verlierer325 %']);
    // Track plus one arc per part, each in the next colour of the fixed order.
    const arcs = [...container.querySelectorAll('svg circle')].slice(1);
    expect(arcs.map((arc) => arc.getAttribute('stroke'))).toEqual([
      'var(--color-chart-1)',
      'var(--color-chart-2)',
      'var(--color-chart-3)',
    ]);
    expect(screen.getByText('12')).toBeTruthy();
  });

  it('folds everything beyond six parts into «Übrige»', () => {
    const parts = Array.from({ length: 8 }, (_, index) => ({
      label: `Teil ${String(index + 1)}`,
      value: 10,
    }));
    const { container } = render(
      <Donut summary="s" categoryLabel="Teil" valueLabel="Menge" parts={parts} />,
    );
    const rows = tableRows('Daten: Menge nach Teil');
    expect(rows).toHaveLength(7);
    expect(rows.at(-1)).toEqual(['Übrige', '30', '38 %']);
    expect(container.querySelectorAll('svg circle')).toHaveLength(7);
    expect(container.querySelectorAll('svg circle')[6]?.getAttribute('stroke')).toBe(
      'var(--color-ink-muted)',
    );
  });
});

describe('ProgressBar', () => {
  it('shows label and figures as text and fills the bar to the share', () => {
    const { container } = render(
      <ProgressBar
        summary="69 % des Budgets sind verbraucht."
        label="Einkauf Küche"
        value={6240}
        max={9000}
        valueText="CHF 6’240 von CHF 9’000"
        marker={{ value: 4200, label: 'heute' }}
        hint="Es bleiben CHF 2’760."
      />,
    );
    expect(screen.getByText('Einkauf Küche')).toBeTruthy();
    expect(screen.getByText('CHF 6’240 von CHF 9’000')).toBeTruthy();
    expect(screen.getByText('Es bleiben CHF 2’760.')).toBeTruthy();
    const [track, fill] = [...container.querySelectorAll('svg rect')];
    expect(track?.getAttribute('width')).toBe('100%');
    expect(fill?.getAttribute('width')).toBe('69.33%');
    expect(fill?.getAttribute('fill')).toBe('var(--color-wine-700)');
    const marker = container.querySelector('svg line[stroke="var(--color-ink)"]');
    expect(marker?.getAttribute('x1')).toBe('46.67%');
    expect(screen.getByText('heute').style.left).toBe('46.67%');
  });

  it('never fills more than the whole and wears the tone of the page', () => {
    const { container } = render(
      <ProgressBar
        summary="Das Budget ist überschritten."
        label="Reinigung"
        value={468}
        max={400}
        valueText="CHF 468 von CHF 400"
        tone="danger"
      />,
    );
    const [track, fill] = [...container.querySelectorAll('svg rect')];
    expect(fill?.getAttribute('width')).toBe('100%');
    expect(fill?.getAttribute('fill')).toBe('var(--color-danger)');
    expect(track?.getAttribute('fill')).toBe('var(--color-danger-bg)');
  });

  it('keeps the label of the marker inside the bar at both ends', () => {
    const { rerender } = render(
      <ProgressBar
        summary="s"
        label="Budget"
        value={1}
        max={100}
        valueText="1"
        marker={{ value: 2, label: 'Monatsanfang' }}
      />,
    );
    expect(screen.getByText('Monatsanfang').style.left).toBe('0px');
    rerender(
      <ProgressBar
        summary="s"
        label="Budget"
        value={1}
        max={100}
        valueText="1"
        marker={{ value: 98, label: 'Monatsende' }}
      />,
    );
    expect(screen.getByText('Monatsende').style.right).toBe('0px');
  });
});

describe('Sparkline', () => {
  it('draws the course as a quiet line with the latest point marked', () => {
    const { container } = render(<Sparkline summary="Leicht gestiegen." values={[3, 5, 4, 8]} />);
    expect(container.querySelector('path')?.getAttribute('stroke')).toBe('var(--color-ink-muted)');
    const dot = container.querySelector('circle');
    expect(dot?.getAttribute('fill')).toBe('var(--color-chart-1)');
    // The highest and latest value sits at the top right.
    expect(Number(dot?.getAttribute('cx'))).toBeGreaterThan(80);
    expect(Number(dot?.getAttribute('cy'))).toBeLessThan(10);
  });

  it('uses the colours of the dark card on Traube', () => {
    const { container } = render(<Sparkline onDark summary="s" values={[1, 2]} />);
    expect(container.querySelector('path')?.getAttribute('stroke')).toBe('var(--color-mist)');
    expect(container.querySelector('circle')?.getAttribute('fill')).toBe('var(--color-cork)');
  });
});

describe('geometry never contains NaN', () => {
  const base = { summary: 's', categoryLabel: 'Tag', valueLabel: 'Umsatz' };
  const broken = [
    { label: 'a', value: Number.NaN, second: Number.POSITIVE_INFINITY },
    { label: 'b', value: -5, second: Number.NaN },
  ];
  const cases: [name: string, data: { label: string; value: number; second?: number }[]][] = [
    ['no data', []],
    ['a single value', [{ label: 'Mo', value: 1840 }]],
    [
      'only zeros',
      [
        { label: 'Mo', value: 0 },
        { label: 'Di', value: 0 },
      ],
    ],
    ['values that are not numbers', broken],
  ];

  it.each(cases)('BarChart with %s', (_name, data) => {
    expectCleanGeometry(<BarChart {...base} data={data} />);
    expectCleanGeometry(<BarChart {...base} data={data} secondLabel="Zweite" mode="grouped" />);
    expectCleanGeometry(
      <BarChart
        {...base}
        data={data}
        secondLabel="Zweite"
        target={{ value: Number.NaN, label: 'Ziel' }}
      />,
    );
  });

  it.each(cases)('LineChart with %s', (_name, data) => {
    expectCleanGeometry(<LineChart {...base} data={data} />);
    expectCleanGeometry(<LineChart {...base} data={data} secondLabel="Zweite" />);
  });

  it.each(cases)('HBarChart with %s', (_name, data) => {
    const { container, unmount } = render(<HBarChart {...base} data={data} />);
    for (const value of drawnValues(container)) {
      expect(value).not.toMatch(/NaN|Infinity|undefined|null/);
    }
    unmount();
  });

  it.each(cases)('Donut with %s', (_name, data) => {
    expectCleanGeometry(<Donut {...base} parts={data} showShare />);
  });

  it.each([
    ['no whole', 5, 0],
    ['nothing at all', 0, 0],
    ['values that are not numbers', Number.NaN, Number.NaN],
    ['an infinite whole', 5, Number.POSITIVE_INFINITY],
  ])('ProgressBar with %s', (_name, value, max) => {
    expectCleanGeometry(
      <ProgressBar
        summary="s"
        label="Budget"
        value={value}
        max={max}
        valueText="–"
        marker={{ value, label: 'heute' }}
      />,
    );
  });

  it.each([
    ['no data', []],
    ['a single value', [7]],
    ['a flat course', [4, 4, 4]],
    ['values that are not numbers', [Number.NaN, 3, Number.NEGATIVE_INFINITY]],
  ])('Sparkline with %s', (_name, values) => {
    expectCleanGeometry(<Sparkline summary="s" values={values} />);
  });

  it('shows «Noch keine Daten» in an empty bar or line chart and an empty table', () => {
    const { container } = render(
      <>
        <BarChart {...base} data={[]} />
        <LineChart {...base} data={[]} />
      </>,
    );
    expect(screen.getAllByText('Noch keine Daten')).toHaveLength(2);
    expect(container.querySelectorAll('svg path')).toHaveLength(0);
    for (const table of screen.getAllByRole('table')) {
      expect(within(table).getAllByRole('row')).toHaveLength(1);
    }
  });

  it('draws a single value as one bar and as one dot', () => {
    const one = [{ label: 'Mo', value: 1840 }];
    const bar = render(<BarChart {...base} data={one} />);
    expect(bar.container.querySelectorAll('svg path')).toHaveLength(1);
    bar.unmount();
    const line = render(<LineChart {...base} data={one} />);
    expect(line.container.querySelectorAll('svg path')).toHaveLength(0);
    expect(line.container.querySelectorAll('svg circle')).toHaveLength(1);
  });
});
