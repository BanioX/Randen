import { formatSwissDate, type LocalDate } from '@randen/core';
import type { jsPDF } from 'jspdf';
import { fileMessages } from '../messages.files';

/**
 * A small drawing kit for PDFs made on the device (ADR-0019), ported from Rettich
 * (`features/reports/pdf-kit.ts`, Rettich ADR-0030) and set in Randen's colours (docs/design.md).
 * A4 portrait, millimetres, the standard font Helvetica (umlauts, «», – and … included). Vector
 * only. A PDF is for paper: it stays light also when the device is dark (Rettich ADR-0081).
 *
 * The kit only draws. What a page shows comes from the same query as the page, so page and PDF
 * agree; money comes formatted from the app's money formatter (`useMoney().format`).
 */
export type Rgb = readonly [number, number, number];

/** The light colours of docs/design.md; no dark surfaces on paper. */
export const PDF_COLOR = {
  /** Rotwein #6D1F2F: headings in small capitals, rules. */
  wine: [109, 31, 47],
  /** Traube #3F0F1C: the large title. */
  grape: [63, 15, 28],
  /** Kork #E8D9C0: a quiet band. */
  cork: [232, 217, 192],
  /** Onyx #14161A: text. */
  ink: [20, 22, 26],
  /** #605A50: secondary text. */
  muted: [96, 90, 80],
  /** #E3DACC: hairlines. */
  line: [227, 218, 204],
  /** #877F72: lines that must be seen. */
  lineStrong: [135, 127, 114],
  /** #F0EADF: quiet surfaces, the track of a bar. */
  surfaceMuted: [240, 234, 223],
  /** #F9F5F0: the ground of the app, a breath of cork. */
  ground: [249, 245, 240],
  /** Zinnober #C33701: what is wrong or missing. */
  danger: [195, 55, 1],
  white: [255, 255, 255],
} as const satisfies Record<string, Rgb>;

/** Colours for series, from `--color-chart-*` (light). */
export const PDF_SERIES: readonly Rgb[] = [
  [149, 52, 71],
  [3, 118, 158],
  [148, 109, 3],
  [77, 63, 152],
];

/** A4 in millimetres and the margin of every page. */
export const PAGE = { width: 210, height: 297, margin: 18 } as const;
/** The width between the margins. */
export const CONTENT_WIDTH = PAGE.width - 2 * PAGE.margin;
/** Where the footer line sits. */
export const FOOTER = PAGE.height - 14;
/** Where content begins on a page. */
export const TOP = 20;
/** Content ends here, so it never meets the footer. */
export const BOTTOM = FOOTER - 5;

/** Millimetres per typographic point. */
const PT = 25.4 / 72;
/** Space between lines of a paragraph, as a factor of the font size. */
const LEADING = 1.35;

export interface TextStyle {
  /** Font size in points. */
  size: number;
  color: Rgb;
  bold?: boolean | undefined;
  italic?: boolean | undefined;
  align?: 'left' | 'center' | 'right' | undefined;
  baseline?: 'alphabetic' | 'middle' | 'top' | undefined;
  /** Letter spacing in mm, for small headings in capitals. */
  spacing?: number | undefined;
}

/** The characters of the standard font beyond Latin-1 (WinAnsiEncoding). */
const WIN_ANSI_EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ');

/** True for a character the standard font draws: Latin-1 and the WinAnsi extras, and «\n». */
function drawable(char: string): boolean {
  const code = char.codePointAt(0) ?? 0;
  const latin1 = (code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff);
  return char === '\n' || (latin1 && code !== 0xad) || WIN_ANSI_EXTRA.has(char);
}

/** Letters with a stroke have no decomposition: their base letter, by hand. */
const STROKED: Partial<Record<string, string>> = {
  Đ: 'D',
  đ: 'd',
  Ł: 'L',
  ł: 'l',
  Ħ: 'H',
  ħ: 'h',
  ı: 'i',
};

/**
 * A character the font lacks, as close as the font gets. A letter decomposes into its base
 * letter and its accents (NFKD), and the accents go: «Ć» becomes «C». NFKD also opens the
 * compatibility forms: the ligature «ﬂ» becomes «fl», «℃» becomes «°C», «⅓» becomes «1/3»
 * (its fraction slash as «/»). What is still not drawable is left out.
 */
function nearest(char: string): string {
  const base =
    STROKED[char] ??
    char
      .normalize('NFKD')
      .replace(/\p{M}/gu, '')
      .replace(/\u2044/g, '/');
  let out = '';
  for (const part of base) {
    if (drawable(part)) {
      out += part;
    }
  }
  return out;
}

/**
 * Text the standard font can draw. Thin and narrow spaces become spaces, other dashes a hyphen.
 * A letter the font does not know becomes its base letter («Ćevapčići» prints «Cevapcici»),
 * while letters it has stay as they are (ä, é, ç, ñ, ß, Œ). What has no such stand-in (emoji,
 * most symbols) is left out: jsPDF would print it as garbage otherwise.
 */
export function pdfText(value: string): string {
  // NFC first: an «ö» typed as «o» and a combining diaeresis is the «ö» the font has.
  const normal = value
    .normalize('NFC')
    .replace(/[\t\u2000-\u200A\u202F\u205F\u3000]/g, ' ')
    .replace(/[\u2010\u2011\u2212]/g, '-')
    .replace(/\r\n?/g, '\n');
  let out = '';
  for (const char of normal) {
    out += drawable(char) ? char : nearest(char);
  }
  return out;
}

function applyFont(doc: jsPDF, style: TextStyle): void {
  const bold = style.bold === true;
  const italic = style.italic === true;
  const variant = bold ? (italic ? 'bolditalic' : 'bold') : italic ? 'italic' : 'normal';
  doc.setFont('helvetica', variant);
  doc.setFontSize(style.size);
  doc.setTextColor(...style.color);
}

/** The height of one line of text in this style, with its leading, in mm. */
export function lineHeight(style: TextStyle): number {
  return style.size * PT * LEADING;
}

/** Width of a text in millimetres. */
export function measure(doc: jsPDF, value: string, style: TextStyle): number {
  applyFont(doc, style);
  const text = pdfText(value);
  const spacing = (style.spacing ?? 0) * Math.max(0, text.length - 1);
  return doc.getTextWidth(text) + spacing;
}

/** Text shortened with «…» until it fits `width` millimetres. */
export function fit(doc: jsPDF, value: string, width: number, style: TextStyle): string {
  const text = pdfText(value);
  // A hair of slack: a width computed as `measure + padding - padding` is not always `measure`.
  const limit = width + 0.01;
  if (measure(doc, text, style) <= limit) {
    return text;
  }
  let short = text;
  while (short.length > 1 && measure(doc, `${short}…`, style) > limit) {
    short = short.slice(0, -1);
  }
  return `${short.trimEnd()}…`;
}

/** One line of text at `x`/`y`; with `width` it is shortened with «…» to fit. */
export function write(
  doc: jsPDF,
  value: string,
  x: number,
  y: number,
  style: TextStyle,
  width?: number,
): void {
  const text = width === undefined ? pdfText(value) : fit(doc, value, width, style);
  applyFont(doc, style);
  doc.text(text, x, y, {
    align: style.align ?? 'left',
    baseline: style.baseline ?? 'alphabetic',
    ...(style.spacing === undefined ? {} : { charSpace: style.spacing }),
  });
}

/**
 * The lines of a text that wraps at `width` mm. Line breaks the person typed stay; a word longer
 * than the line is broken.
 */
export function wrap(doc: jsPDF, value: string, width: number, style: TextStyle): string[] {
  applyFont(doc, style);
  return pdfText(value)
    .split('\n')
    .flatMap((part) => {
      if (part.trim() === '') {
        return [''];
      }
      const lines: unknown = doc.splitTextToSize(part, width);
      return Array.isArray(lines) ? lines.map((line) => String(line)) : [part];
    });
}

/** How far down the current page the content has come, across pages. */
export interface Flow {
  readonly doc: jsPDF;
  /** Where the next block starts, in mm from the top of the page. */
  y: number;
}

export function startFlow(doc: jsPDF, y: number = TOP): Flow {
  return { doc, y };
}

/** Starts a new page and moves to its top. */
export function newPage(flow: Flow): void {
  flow.doc.addPage('a4', 'portrait');
  flow.y = TOP;
}

/** Makes room for `height` mm: a new page when it does not fit. True if a page began. */
export function room(flow: Flow, height: number): boolean {
  if (flow.y + height <= BOTTOM || flow.y <= TOP) {
    return false;
  }
  newPage(flow);
  return true;
}

/** The height of a wrapped text, in mm. */
export function textHeight(doc: jsPDF, value: string, width: number, style: TextStyle): number {
  return wrap(doc, value, width, style).length * lineHeight(style);
}

/**
 * A text that wraps, line by line down the page and onto the next. `x` and `width` default to
 * the margins; `after` is the space below it.
 */
export function paragraph(
  flow: Flow,
  value: string,
  style: TextStyle,
  options: { x?: number; width?: number; after?: number } = {},
): void {
  const x = options.x ?? PAGE.margin;
  const width = options.width ?? PAGE.width - PAGE.margin - x;
  const height = lineHeight(style);
  for (const line of wrap(flow.doc, value, width, style)) {
    room(flow, height);
    write(flow.doc, line, x, flow.y, { ...style, baseline: 'top' });
    flow.y += height;
  }
  flow.y += options.after ?? 0;
}

/** A horizontal line across the content width (or from `from` to `to`). */
export function rule(
  doc: jsPDF,
  y: number,
  options: { color?: Rgb; width?: number; from?: number; to?: number } = {},
): void {
  doc.setDrawColor(...(options.color ?? PDF_COLOR.line));
  doc.setLineWidth(options.width ?? 0.2);
  doc.line(options.from ?? PAGE.margin, y, options.to ?? PAGE.width - PAGE.margin, y);
}

/**
 * The head of the first page: a small heading in capitals (the business, or the kind of
 * paper), the title in Traube, an optional line below, and a rule in Rotwein.
 */
export function titleBlock(
  flow: Flow,
  block: { kicker: string; title: string; subtitle?: string | undefined },
): void {
  const kicker: TextStyle = { size: 9, color: PDF_COLOR.wine, bold: true, spacing: 0.5 };
  write(flow.doc, block.kicker.toLocaleUpperCase('de-CH'), PAGE.margin, flow.y, {
    ...kicker,
    baseline: 'top',
  });
  flow.y += lineHeight(kicker) + 1.5;
  paragraph(flow, block.title, { size: 24, color: PDF_COLOR.grape, bold: true });
  if (block.subtitle !== undefined) {
    flow.y += 0.5;
    paragraph(flow, block.subtitle, { size: 13, color: PDF_COLOR.wine });
  }
  flow.y += 3;
  rule(flow.doc, flow.y, { color: PDF_COLOR.wine, width: 0.5 });
  flow.y += 7;
}

/** A small heading in capitals and Rotwein, kept together with what follows (`keep` mm). */
export function heading(flow: Flow, value: string, keep = 12): void {
  const style: TextStyle = { size: 9.5, color: PDF_COLOR.wine, bold: true, spacing: 0.45 };
  room(flow, lineHeight(style) + keep);
  write(flow.doc, value.toLocaleUpperCase('de-CH'), PAGE.margin, flow.y, {
    ...style,
    baseline: 'top',
  });
  flow.y += lineHeight(style) + 1.5;
}

/** A card like the app's, with rounded corners and no border; light fills only. */
export function card(
  doc: jsPDF,
  box: { x: number; y: number; width: number; height: number },
  fill: Rgb = PDF_COLOR.ground,
  radius = 3,
): void {
  doc.setFillColor(...fill);
  doc.roundedRect(box.x, box.y, box.width, box.height, radius, radius, 'F');
}

export interface Pill {
  text: string;
  /** A dashed edge and quiet text, like a trace on the guest card. */
  dashed?: boolean | undefined;
}

const PILL = { size: 8, height: 4.8, padding: 2.2, gap: 1.5 } as const;

/**
 * Small pills like the app's (allergens, diet, labels), left to right and onto the next line at
 * `width`. Returns the height used; with `draw: false` it only measures.
 */
export function pills(
  doc: jsPDF,
  items: readonly Pill[],
  box: { x: number; y: number; width: number },
  draw = true,
): number {
  if (items.length === 0) {
    return 0;
  }
  let x = box.x;
  let y = box.y;
  for (const item of items) {
    const style: TextStyle = {
      size: PILL.size,
      color: item.dashed === true ? PDF_COLOR.muted : PDF_COLOR.ink,
    };
    const width = Math.min(box.width, measure(doc, item.text, style) + 2 * PILL.padding);
    if (x > box.x && x + width > box.x + box.width) {
      x = box.x;
      y += PILL.height + PILL.gap;
    }
    if (draw) {
      const edge: Rgb = item.dashed === true ? PDF_COLOR.lineStrong : PDF_COLOR.line;
      doc.setDrawColor(...edge);
      doc.setLineWidth(0.25);
      if (item.dashed === true) {
        doc.setLineDashPattern([0.8, 0.6], 0);
      }
      const radius = PILL.height / 2;
      doc.roundedRect(x, y, width, PILL.height, radius, radius, 'S');
      doc.setLineDashPattern([], 0);
      write(
        doc,
        item.text,
        x + PILL.padding,
        y + PILL.height / 2,
        { ...style, baseline: 'middle' },
        width - 2 * PILL.padding,
      );
    }
    x += width + PILL.gap;
  }
  return y - box.y + PILL.height;
}

export interface TableColumn<Row> {
  header: string;
  /** Share of the content width; the widths are weights. */
  width: number;
  align?: 'left' | 'right' | undefined;
  bold?: boolean | undefined;
  text: (row: Row) => string;
}

/**
 * A table across the content width: a head row in bold, the rows below with a hairline between
 * them. Cells wrap in their column; a row never splits across pages, and the head row repeats
 * at the top of every page the table continues on.
 */
export function table<Row>(
  flow: Flow,
  columns: readonly TableColumn<Row>[],
  rows: readonly Row[],
  options: { size?: number } = {},
): void {
  const { doc } = flow;
  const size = options.size ?? 9.5;
  const gap = 3;
  const padding = 1.6;
  const total = columns.reduce((sum, column) => sum + column.width, 0) || 1;
  const last = columns.length - 1;
  let at: number = PAGE.margin;
  // Each cell keeps half the gap to its neighbours; the outer edges sit on the margins.
  const cells = columns.map((column, index) => {
    const width = (column.width / total) * CONTENT_WIDTH;
    const left = index === 0 ? at : at + gap / 2;
    const right = index === last ? at + width : at + width - gap / 2;
    at += width;
    const style: TextStyle = { size, color: PDF_COLOR.ink, bold: column.bold };
    return { column, left, right, style };
  });
  const headStyle: TextStyle = { size: size - 1, color: PDF_COLOR.muted, bold: true };
  const layout = (texts: readonly string[], head: boolean) => {
    const lines = cells.map((cell, index) =>
      wrap(doc, texts[index] ?? '', cell.right - cell.left, head ? headStyle : cell.style),
    );
    const step = lineHeight(head ? headStyle : { size, color: PDF_COLOR.ink });
    const count = Math.max(1, ...lines.map((cell) => cell.length));
    return { lines, step, head, height: count * step + 2 * padding };
  };
  const draw = (row: ReturnType<typeof layout>) => {
    cells.forEach((cell, index) => {
      const right = cell.column.align === 'right';
      (row.lines[index] ?? []).forEach((text, line) => {
        write(doc, text, right ? cell.right : cell.left, flow.y + padding + line * row.step, {
          ...(row.head ? headStyle : cell.style),
          align: right ? 'right' : 'left',
          baseline: 'top',
        });
      });
    });
    flow.y += row.height;
    rule(doc, flow.y, { color: row.head ? PDF_COLOR.lineStrong : PDF_COLOR.line });
  };
  const head = layout(
    cells.map((cell) => cell.column.header),
    true,
  );
  const body = rows.map((row) =>
    layout(
      cells.map((cell) => cell.column.text(row)),
      false,
    ),
  );
  // The head never stands alone at the foot of a page.
  room(flow, head.height + (body[0]?.height ?? 0));
  draw(head);
  for (const row of body) {
    if (room(flow, row.height)) {
      draw(head);
    }
    draw(row);
  }
}

/**
 * Round steps for an axis: `count` steps of 1, 2, 2.5 or 5 × 10ⁿ that reach at least `max`.
 * `niceTicks(1210, 3)` is `[0, 500, 1000, 1500]`.
 */
export function niceTicks(max: number, count = 3): number[] {
  if (max <= 0) {
    return [0, 1];
  }
  const rough = max / count;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = ([1, 2, 2.5, 5, 10].find((factor) => factor * power >= rough) ?? 10) * power;
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let value = 0; value <= top + step / 2; value += step) {
    ticks.push(Math.round(value * 1000) / 1000);
  }
  return ticks;
}

/** A bar with round ends, or `corner` mm corners; never rounder than it is wide. */
function bar(
  doc: jsPDF,
  box: { x: number; y: number; width: number; height: number },
  color: Rgb,
  corner?: number,
): void {
  if (box.width <= 0 || box.height <= 0) {
    return;
  }
  const radius = Math.min(corner ?? Infinity, box.width / 2, box.height / 2);
  doc.setFillColor(...color);
  doc.roundedRect(box.x, box.y, box.width, box.height, radius, radius, 'F');
}

export interface ColumnGroup {
  label: string;
  values: { value: number; color: Rgb }[];
}

/**
 * Grouped columns with a light grid: tick labels on the left, each group centred over its
 * label, the value above each column.
 */
export function columns(
  doc: jsPDF,
  box: { x: number; y: number; width: number; height: number },
  groups: readonly ColumnGroup[],
  format: (value: number) => string,
  formatTick: (value: number) => string = format,
): void {
  const axis = 14;
  const plot = {
    x: box.x + axis,
    width: box.width - axis,
    top: box.y + 6,
    bottom: box.y + box.height - 7,
  };
  const max = Math.max(0, ...groups.flatMap((group) => group.values.map((entry) => entry.value)));
  const ticks = niceTicks(max, 3);
  const top = ticks.at(-1) ?? 1;
  const yOf = (value: number) => plot.bottom - (value / top) * (plot.bottom - plot.top);
  const small: TextStyle = { size: 8, color: PDF_COLOR.muted };
  for (const tick of ticks) {
    const y = yOf(tick);
    rule(doc, y, {
      color: tick === 0 ? PDF_COLOR.lineStrong : PDF_COLOR.line,
      from: plot.x,
      to: plot.x + plot.width,
    });
    write(doc, formatTick(tick), plot.x - 2.5, y, { ...small, align: 'right', baseline: 'middle' });
  }
  const slot = plot.width / Math.max(1, groups.length);
  groups.forEach((group, index) => {
    const center = plot.x + slot * index + slot / 2;
    const count = Math.max(1, group.values.length);
    const width = Math.min(6.5, (slot * 0.55 - (count - 1)) / count);
    const groupWidth = count * width + (count - 1) * 1.2;
    group.values.forEach((entry, position) => {
      const x = center - groupWidth / 2 + position * (width + 1.2);
      const y = yOf(entry.value);
      if (entry.value > 0) {
        // Softly rounded top, square foot on the axis.
        const corner = Math.min(1.4, (plot.bottom - y) / 2);
        bar(doc, { x, y, width, height: plot.bottom - y }, entry.color, corner);
        doc.setFillColor(...entry.color);
        doc.rect(x, plot.bottom - corner, width, corner, 'F');
        write(doc, format(entry.value), x + width / 2, y - 1.6, {
          size: 7,
          color: entry.color,
          bold: true,
          align: 'center',
        });
      }
    });
    write(
      doc,
      group.label,
      center,
      plot.bottom + 5.5,
      { ...small, color: PDF_COLOR.ink, align: 'center' },
      slot - 1,
    );
  });
}

export interface BarRow {
  label: string;
  value: number;
  display: string;
  color: Rgb;
}

/**
 * Horizontal bars: label on the left, the bar on a quiet track, the value on the right. Returns
 * the height used.
 */
export function bars(
  doc: jsPDF,
  box: { x: number; y: number; width: number },
  rows: readonly BarRow[],
  options: { labelWidth: number; valueWidth: number },
): number {
  const rowHeight = 8;
  const trackX = box.x + options.labelWidth + 2;
  const trackWidth = box.width - options.labelWidth - options.valueWidth - 4;
  const max = Math.max(1, ...rows.map((row) => row.value));
  rows.forEach((row, index) => {
    const middle = box.y + index * rowHeight + rowHeight / 2;
    const text: TextStyle = { size: 9.5, color: PDF_COLOR.ink, baseline: 'middle' };
    write(doc, row.label, box.x, middle, text, options.labelWidth);
    bar(
      doc,
      { x: trackX, y: middle - 1.6, width: trackWidth, height: 3.2 },
      PDF_COLOR.surfaceMuted,
    );
    const width = Math.max(3.2, (Math.max(0, row.value) / max) * trackWidth);
    bar(doc, { x: trackX, y: middle - 1.6, width, height: 3.2 }, row.color);
    write(doc, row.display, box.x + box.width, middle, { ...text, bold: true, align: 'right' });
  });
  return rows.length * rowHeight;
}

/**
 * The footer of every page: a hairline, the paper's name and the day it was printed (a Swiss
 * calendar day), and the page number.
 */
export function footers(doc: jsPDF, footer: { label: string; printedOn: LocalDate }): void {
  const t = fileMessages.pdf;
  const pages = doc.getNumberOfPages();
  const style: TextStyle = { size: 8, color: PDF_COLOR.muted };
  const left = `${footer.label} · ${t.printedOn(formatSwissDate(footer.printedOn))}`;
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    rule(doc, FOOTER);
    write(doc, left, PAGE.margin, FOOTER + 5, style, CONTENT_WIDTH * 0.7);
    write(doc, t.page(page, pages), PAGE.width - PAGE.margin, FOOTER + 5, {
      ...style,
      align: 'right',
    });
  }
}

/** The finished PDF as a file the device can share or save. */
export function pdfFile(doc: jsPDF, fileName: string): File {
  return new File([doc.output('blob')], fileName, { type: 'application/pdf' });
}
