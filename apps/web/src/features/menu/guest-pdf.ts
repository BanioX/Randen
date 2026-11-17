import {
  ALLERGEN_IDS,
  dietLabel,
  type AllergenRef,
  type GuestSection,
  type LocalDate,
  type MenuCardView,
} from '@randen/core';
import type { jsPDF } from 'jspdf';
import type { Money } from '../../app/money-format';
import { createPdf } from '../../ui/pdf/create';
import {
  CONTENT_WIDTH,
  footers,
  heading,
  lineHeight,
  measure,
  PAGE,
  paragraph,
  PDF_COLOR,
  pills,
  room,
  rule,
  startFlow,
  table,
  titleBlock,
  wrap,
  write,
  type Flow,
  type Pill,
  type TextStyle,
} from '../../ui/pdf/kit';
import type { FilteredDish } from './guest-filter';
import { originWords } from './GuestDish';
import { menuMessages } from './messages';

const t = menuMessages.guest;

/**
 * What the guest card prints, from the page's own query (`menu.guest`) and filter: so the page
 * and the PDF always agree (ADR-0019).
 */
export interface GuestPdfInput {
  businessName: string;
  card: MenuCardView;
  /** The sections as the page shows them, after the guest's filter. */
  groups: readonly { section: GuestSection; entries: readonly FilteredDish[] }[];
  /** Whether the card has sections at all, for the sentence of an empty card. */
  hasSections: boolean;
  money: Money;
  /** The Swiss calendar day of printing, for the footer. */
  printedOn: LocalDate;
}

const NAME: TextStyle = { size: 11.5, color: PDF_COLOR.ink, bold: true };
const DESCRIPTION: TextStyle = { size: 10, color: PDF_COLOR.muted };
const SMALL: TextStyle = { size: 9, color: PDF_COLOR.muted };
const WARNING: TextStyle = { size: 9, color: PDF_COLOR.danger, bold: true };

/** The pills of a dish, as on the card: allergens, traces, diet, labels. */
function dishPills(entry: FilteredDish): Pill[] {
  const { dish } = entry;
  return [
    ...dish.allergens.map((item) => ({ text: item.label })),
    ...dish.traces.map((item) => ({ text: `${t.traces}: ${item.label}`, dashed: true })),
    ...(dish.diet === undefined || dish.diet === 'omnivore'
      ? []
      : [{ text: dietLabel(dish.diet) }]),
    ...dish.labels.map((label) => ({ text: label.text })),
  ];
}

/** The lines below the pills: a trace the guest left out, the origins, an incomplete notice. */
function notes(entry: FilteredDish): { text: string; style: TextStyle }[] {
  const { dish, traceHits } = entry;
  return [
    ...(traceHits.length === 0
      ? []
      : [{ text: t.traceMark(traceHits.map((item) => item.label).join(', ')), style: SMALL }]),
    ...originWords(dish).map((text) => ({ text, style: SMALL })),
    ...(dish.incomplete ? [{ text: t.incomplete, style: WARNING }] : []),
  ];
}

/**
 * One dish, measured first and then drawn, so it never splits across two pages (as
 * `break-inside: avoid` on the printed page). Name on the left, price on the right.
 */
function dish(flow: Flow, entry: FilteredDish, money: Money): void {
  const { doc } = flow;
  const x = PAGE.margin;
  const price =
    entry.dish.priceRappen === undefined ? undefined : money.format(entry.dish.priceRappen);
  const priceWidth = price === undefined ? 0 : measure(doc, price, NAME) + 4;
  const name = wrap(doc, entry.dish.name, CONTENT_WIDTH - priceWidth, NAME);
  const description =
    entry.dish.description === undefined
      ? []
      : wrap(doc, entry.dish.description, CONTENT_WIDTH - priceWidth, DESCRIPTION);
  const tags = dishPills(entry);
  const lines = notes(entry).map((note) => ({
    style: note.style,
    lines: wrap(doc, note.text, CONTENT_WIDTH, note.style),
  }));
  const tagsHeight = pills(doc, tags, { x, y: 0, width: CONTENT_WIDTH }, false);
  const height =
    3 +
    name.length * lineHeight(NAME) +
    description.length * lineHeight(DESCRIPTION) +
    (tagsHeight === 0 ? 0 : tagsHeight + 2) +
    lines.reduce((sum, note) => sum + note.lines.length * lineHeight(note.style) + 0.6, 0) +
    3;
  room(flow, height);

  let y = flow.y + 3;
  if (price !== undefined) {
    write(doc, price, PAGE.width - PAGE.margin, y, { ...NAME, align: 'right', baseline: 'top' });
  }
  for (const line of name) {
    write(doc, line, x, y, { ...NAME, baseline: 'top' });
    y += lineHeight(NAME);
  }
  for (const line of description) {
    write(doc, line, x, y, { ...DESCRIPTION, baseline: 'top' });
    y += lineHeight(DESCRIPTION);
  }
  if (tagsHeight > 0) {
    y += 1;
    pills(doc, tags, { x, y, width: CONTENT_WIDTH });
    y += tagsHeight + 1;
  }
  for (const note of lines) {
    y += 0.6;
    for (const line of note.lines) {
      write(doc, line, x, y, { ...note.style, baseline: 'top' });
      y += lineHeight(note.style);
    }
  }
  flow.y = y + 3;
}

/** Every allergen and trace on the printed dishes, once, in the order of the ordinance. */
function allergensOf(groups: GuestPdfInput['groups']): AllergenRef[] {
  const found = new Map<string, AllergenRef>();
  for (const group of groups) {
    for (const { dish: entry } of group.entries) {
      for (const item of [...entry.allergens, ...entry.traces]) {
        found.set(item.id, item);
      }
    }
  }
  return ALLERGEN_IDS.flatMap((id) => {
    const item = found.get(id);
    return item === undefined ? [] : [item];
  });
}

/** Draws the guest card onto `doc`: what the printed card holds, light colours only. */
export function drawGuestCard(doc: jsPDF, input: GuestPdfInput): void {
  const { card, groups, money } = input;
  const flow = startFlow(doc);
  titleBlock(flow, { kicker: t.kicker, title: input.businessName, subtitle: card.name });
  if (card.intro !== undefined) {
    paragraph(flow, card.intro, { size: 10.5, color: PDF_COLOR.ink }, { after: 4 });
  }

  if (groups.length === 0) {
    paragraph(flow, input.hasSections ? t.noneLeft : t.emptyCard, DESCRIPTION, { after: 4 });
  }
  for (const { section, entries } of groups) {
    flow.y += 2;
    heading(flow, section.title, 18);
    entries.forEach((entry, index) => {
      if (index > 0) {
        rule(doc, flow.y);
      }
      dish(flow, entry, money);
    });
    flow.y += 2;
  }

  room(flow, 20);
  rule(doc, flow.y, { color: PDF_COLOR.lineStrong });
  flow.y += 4;
  if (card.footer !== undefined) {
    paragraph(flow, card.footer, { size: 10, color: PDF_COLOR.ink }, { after: 2 });
  }
  paragraph(flow, t.notice, { size: 9.5, color: PDF_COLOR.ink });

  // On paper no dish opens: the official names of the allergens stand at the end.
  const allergens = allergensOf(groups);
  if (allergens.length > 0) {
    flow.y += 6;
    heading(flow, t.allergensCaption, 16);
    table(
      flow,
      [
        { header: t.pdfLegendShort, width: 1, bold: true, text: (item: AllergenRef) => item.label },
        { header: t.pdfLegendOfficial, width: 3.2, text: (item: AllergenRef) => item.official },
      ],
      allergens,
      { size: 9 },
    );
  }

  footers(doc, { label: `${card.name} · ${input.businessName}`, printedOn: input.printedOn });
}

/** The guest card as a PDF file, built on the device; jsPDF loads on the first call. */
export async function buildGuestPdf(input: GuestPdfInput): Promise<Blob> {
  const doc = await createPdf({ title: `${input.card.name} · ${input.businessName}` });
  drawGuestCard(doc, input);
  return doc.output('blob');
}
