import { CHF_MONEY } from '../../app/money-format';
import { localDate, rappen } from '@randen/core';
import { describe, expect, it } from 'vitest';
import { fileMessages } from '../messages.files';
import { createPdf } from './create';
import {
  BOTTOM,
  bars,
  columns,
  fit,
  footers,
  measure,
  niceTicks,
  paragraph,
  pdfFile,
  pdfText,
  PDF_COLOR,
  startFlow,
  table,
  titleBlock,
  TOP,
  wrap,
  type TextStyle,
} from './kit';
import { readPdf } from './test-helpers';

const body: TextStyle = { size: 10, color: PDF_COLOR.ink };
const PRINTED_ON = localDate('2026-11-16');

describe('pdfText', () => {
  it('keeps what the standard font draws: umlauts, «», dashes, ellipsis, apostrophe', () => {
    expect(pdfText('Entrecôte «Grossmutter» – CHF 1’200.00 … Spätzli ß')).toBe(
      'Entrecôte «Grossmutter» – CHF 1’200.00 … Spätzli ß',
    );
  });

  it('turns thin spaces into spaces and leaves out what it cannot draw', () => {
    expect(pdfText('5\u202F°C\tkühl')).toBe('5 °C kühl');
    expect(pdfText('Rotwein 🍷 und\u200B Kork')).toBe('Rotwein  und Kork');
    expect(pdfText('Zeile\r\nzwei')).toBe('Zeile\nzwei');
  });

  it('prints a letter the font lacks as its base letter, and keeps the letters it has', () => {
    expect(pdfText('Ćevapčići')).toBe('Cevapcici');
    expect(pdfText('Đuveč mit Łosoś')).toBe('Duvec mit Losos');
    expect(pdfText('Crème brûlée')).toBe('Crème brûlée');
    expect(pdfText('Rösti')).toBe('Rösti');
    // The same «ö», typed as «o» and a combining diaeresis.
    expect(pdfText('Ro\u0308sti')).toBe('Rösti');
    expect(pdfText('Œuf, Façon, Jalapeño, Strasse ß')).toBe('Œuf, Façon, Jalapeño, Strasse ß');
  });

  it('opens ligatures and unit signs, and leaves out a symbol without a stand-in', () => {
    expect(pdfText('Souf\uFB02é')).toBe('Soufflé');
    expect(pdfText('Kühlung unter 5 \u2103')).toBe('Kühlung unter 5 °C');
    expect(pdfText('\u2153 Liter Rahm')).toBe('1/3 Liter Rahm');
    expect(pdfText('Rahm → Sauce ✓')).toBe('Rahm  Sauce ');
  });
});

describe('text on the page', () => {
  it('shortens a line with «…» until it fits, and wraps a paragraph at its width', async () => {
    const doc = await createPdf({ title: 'Test' });
    const long = 'Glutenhaltiges Getreide, namentlich Weizen, Dinkel, Khorasan-Weizen und Roggen';
    const short = fit(doc, long, 40, body);
    expect(short.endsWith('…')).toBe(true);
    expect(measure(doc, short, body)).toBeLessThanOrEqual(40);
    const lines = wrap(doc, `${long}\nZweite Zeile`, 60, body);
    expect(lines.length).toBeGreaterThan(2);
    expect(lines.at(-1)).toBe('Zweite Zeile');
    for (const line of lines) {
      expect(measure(doc, line, body)).toBeLessThanOrEqual(60.5);
    }
  });

  it('flows a long text onto the next page and never below the footer', async () => {
    const doc = await createPdf({ title: 'Test' });
    const flow = startFlow(doc);
    titleBlock(flow, { kicker: 'Testküche', title: 'Journal', subtitle: 'November 2026' });
    for (let line = 1; line <= 80; line += 1) {
      paragraph(flow, `Zeile ${String(line)}`, body);
      expect(flow.y).toBeLessThanOrEqual(BOTTOM + 0.01);
    }
    expect(doc.getNumberOfPages()).toBe(2);
    expect(flow.y).toBeGreaterThan(TOP);
    const { text } = await readPdf(pdfFile(doc, 'test.pdf'));
    expect(text).toContain('TESTKÜCHE');
    expect(text).toContain('Journal');
    expect(text).toContain('Zeile 80');
  });
});

describe('table', () => {
  interface Row {
    name: string;
    price: number;
  }
  const rows: Row[] = Array.from({ length: 70 }, (_, index) => ({
    name: `Artikel ${String(index + 1)}`,
    price: rappen(1250 + index),
  }));

  it('repeats the head row on every page the table continues on, with CHF and two decimals', async () => {
    const doc = await createPdf({ title: 'Test' });
    const flow = startFlow(doc);
    table(
      flow,
      [
        { header: 'Artikel', width: 3, text: (row: Row) => row.name },
        {
          header: 'Preis',
          width: 1,
          align: 'right',
          text: (row: Row) => CHF_MONEY.format(rappen(row.price)),
        },
      ],
      rows,
    );
    footers(doc, { label: 'Testküche', printedOn: PRINTED_ON });
    const { lines, pages } = await readPdf(pdfFile(doc, 'test.pdf'));
    expect(pages).toBeGreaterThan(1);
    expect(lines.filter((line) => line === 'Artikel')).toHaveLength(pages);
    expect(lines).toContain('Artikel 70');
    expect(lines).toContain('CHF 12.50');
    expect(lines).toContain('CHF 13.19');
    expect(lines).toContain(fileMessages.pdf.page(pages, pages));
    expect(lines).toContain(`Testküche · ${fileMessages.pdf.printedOn('16.11.2026')}`);
  });

  it('keeps a row whole: a cell that wraps moves the whole row to the next page', async () => {
    const doc = await createPdf({ title: 'Test' });
    const flow = startFlow(doc);
    flow.y = BOTTOM - 6;
    table(
      flow,
      [{ header: 'Hinweis', width: 1, text: (row: string) => row }],
      [
        'Eine lange Zeile, die in dieser schmalen Tabelle sicher über mehrere Zeilen läuft. '.repeat(
          3,
        ),
      ],
    );
    expect(doc.getNumberOfPages()).toBe(2);
  });
});

describe('charts and numbers', () => {
  it('finds round steps for an axis', () => {
    expect(niceTicks(1210, 3)).toEqual([0, 500, 1000, 1500]);
    expect(niceTicks(0)).toEqual([0, 1]);
  });

  it('draws grouped columns and bars with their values', async () => {
    const doc = await createPdf({ title: 'Test' });
    columns(
      doc,
      { x: 20, y: 40, width: 170, height: 60 },
      [
        { label: 'Okt', values: [{ value: 120, color: PDF_COLOR.wine }] },
        { label: 'Nov', values: [{ value: 80, color: PDF_COLOR.wine }] },
      ],
      (value) => `${String(value)} kg`,
    );
    const used = bars(
      doc,
      { x: 20, y: 120, width: 170 },
      [{ label: 'Abschreiber', value: 3, display: 'CHF 3.00', color: PDF_COLOR.wine }],
      { labelWidth: 40, valueWidth: 25 },
    );
    expect(used).toBe(8);
    const { lines } = await readPdf(pdfFile(doc, 'test.pdf'));
    expect(lines).toEqual(
      expect.arrayContaining(['120 kg', '80 kg', 'Nov', 'Abschreiber', 'CHF 3.00']),
    );
  });
});

describe('the file', () => {
  it('is an A4 PDF with compressed content and the title in its properties', async () => {
    const doc = await createPdf({ title: 'Abendkarte · Testküche' });
    paragraph(startFlow(doc), 'Rindsentrecôte', body);
    const file = pdfFile(doc, 'speisekarte-abendkarte.pdf');
    expect(file.type).toBe('application/pdf');
    expect(file.name).toBe('speisekarte-abendkarte.pdf');
    const raw = Buffer.from(await file.arrayBuffer()).toString('latin1');
    expect(raw.startsWith('%PDF-')).toBe(true);
    expect(raw).toContain('/FlateDecode');
    expect(raw).not.toContain('(Rindsentrec');
    // A4 is 595.28 × 841.89 points.
    expect(raw).toMatch(/\/MediaBox \[0 0 595\.2[78]\d* 841\.8[89]\d*\]/);
    expect((await readPdf(file)).text).toContain('Rindsentrecôte');
  });
});
