import { localDate, type OperationOutput } from '@randen/core';
import { createTestContext, seedKitchen } from '@randen/core/testing';
import { describe, expect, it } from 'vitest';
import { CHF_MONEY } from '../../app/money-format';
import { fileMessages } from '../../ui/messages.files';
import { readPdf } from '../../ui/pdf/test-helpers';
import { filterDishes, type GuestFilter } from './guest-filter';
import { buildGuestPdf, type GuestPdfInput } from './guest-pdf';
import { menuMessages } from './messages';

const t = menuMessages.guest;
const ALL: GuestFilter = { diet: 'all', without: [] };

/** The «Abendkarte» of the test kitchen, as the guest page reads it (`menu.guest`). */
async function eveningCard(
  options: { showPrices?: boolean; intro?: string; footer?: string } = {},
): Promise<{ data: OperationOutput<'menu.guest'> }> {
  const context = await createTestContext();
  const kitchen = await seedKitchen(context);
  const base = { commandId: context.cmd(), businessId: context.businessId };
  const { cardId } = await context.useCases['menu.create']({
    ...base,
    name: 'Abendkarte',
    showPrices: options.showPrices ?? true,
    showPhotos: true,
  });
  await context.useCases['menu.setSections']({
    commandId: context.cmd(),
    businessId: context.businessId,
    cardId,
    sections: [
      {
        title: 'Hauptgänge',
        recipeIds: [kitchen.recipes.entrecoteDish.id, kitchen.recipes.salmonDish.id],
      },
    ],
  });
  if (options.intro !== undefined || options.footer !== undefined) {
    await context.useCases['menu.update']({
      commandId: context.cmd(),
      businessId: context.businessId,
      cardId,
      ...(options.intro === undefined ? {} : { intro: options.intro }),
      ...(options.footer === undefined ? {} : { footer: options.footer }),
    });
  }
  await context.useCases['menu.setPublished']({
    commandId: context.cmd(),
    businessId: context.businessId,
    cardId,
    published: true,
  });
  const data = await context.useCases['menu.guest']({
    businessId: context.businessId,
    cardId,
    preview: false,
  });
  return { data };
}

function input(data: OperationOutput<'menu.guest'>, filter: GuestFilter = ALL): GuestPdfInput {
  return {
    businessName: data.businessName,
    card: data.card,
    groups: data.sections
      .map((section) => ({ section, entries: filterDishes(section.dishes, filter) }))
      .filter((group) => group.entries.length > 0),
    hasSections: data.sections.length > 0,
    money: CHF_MONEY,
    printedOn: localDate('2026-11-16'),
  };
}

describe('the guest card as a PDF', () => {
  it('holds what the printed card holds: names, prices, allergens, origins and the notice', async () => {
    const { data } = await eveningCard({
      intro: 'Saisonal gekocht.',
      footer: 'Montags geschlossen.',
    });
    const blob = await buildGuestPdf(input(data));
    expect(blob.type).toBe('application/pdf');
    const { lines, text, pages } = await readPdf(blob);
    expect(pages).toBe(1);
    expect(lines).toContain('Testküche');
    expect(lines).toContain('Abendkarte');
    expect(lines).toContain(t.kicker.toLocaleUpperCase('de-CH'));
    expect(lines).toContain('Saisonal gekocht.');
    expect(lines).toContain('HAUPTGÄNGE');
    expect(lines).toContain('Entrecôte mit Rotweinjus und Kartoffelstock');
    expect(lines).toContain('CHF 42.00');
    expect(lines).toContain('Lachs mit Rahmsauce');
    expect(lines).toContain('CHF 34.00');
    expect(lines).toContain('Milch');
    expect(lines).toContain('Fisch');
    expect(lines).toContain('Sulfite');
    expect(lines).toContain('Rindsentrecôte: Schweiz');
    expect(lines).toContain('Lachsfilet: Norwegen');
    expect(lines).toContain('Montags geschlossen.');
    expect(text.replace(/\n/g, ' ')).toContain(t.notice);
    // On paper no dish opens: the official names of the allergens stand at the end.
    expect(lines).toContain(t.allergensCaption.toLocaleUpperCase('de-CH'));
    expect(text.replace(/\n/g, ' ')).toContain('Fische und daraus gewonnene Erzeugnisse');
    expect(lines).toContain(`Abendkarte · Testküche · ${fileMessages.pdf.printedOn('16.11.2026')}`);
    expect(lines).toContain(fileMessages.pdf.page(1, 1));
  });

  it('leaves out the prices the card does not show', async () => {
    const { data } = await eveningCard({ showPrices: false });
    const { lines } = await readPdf(await buildGuestPdf(input(data)));
    expect(lines).toContain('Entrecôte mit Rotweinjus und Kartoffelstock');
    expect(lines.some((line) => line.startsWith('CHF'))).toBe(false);
  });

  it('prints the card as the guest filtered it, like the page', async () => {
    const { data } = await eveningCard();
    const { lines } = await readPdf(
      await buildGuestPdf(input(data, { diet: 'all', without: ['fish'] })),
    );
    expect(lines).toContain('Entrecôte mit Rotweinjus und Kartoffelstock');
    expect(lines).not.toContain('Lachs mit Rahmsauce');
    expect(lines).not.toContain('Fisch');
    expect(lines).not.toContain('Fische und daraus gewonnene Erzeugnisse');
  });

  it('says where the declaration is not complete', async () => {
    const { data } = await eveningCard();
    const salmon = data.sections[0]?.dishes.find((dish) => dish.name === 'Lachs mit Rahmsauce');
    expect(salmon).toBeDefined();
    const incomplete = {
      ...data,
      sections: data.sections.map((section) => ({
        ...section,
        dishes: section.dishes.map((dish) =>
          dish.id === salmon?.id ? { ...dish, incomplete: true } : dish,
        ),
      })),
    };
    const { text } = await readPdf(await buildGuestPdf(input(incomplete)));
    expect(text.replace(/\n/g, ' ')).toContain(t.incomplete);
  });

  it('runs onto a second page for a long card, never cutting a dish', async () => {
    const { data } = await eveningCard();
    const section = data.sections[0];
    if (section === undefined) {
      throw new Error('The card has no section');
    }
    const many = {
      ...data,
      sections: Array.from({ length: 8 }, (_, index) => ({
        ...section,
        id: section.id,
        title: `Abschnitt ${String(index + 1)}`,
      })),
    };
    const { lines, pages } = await readPdf(await buildGuestPdf(input(many)));
    expect(pages).toBeGreaterThan(1);
    expect(
      lines.filter((line) => line === 'Entrecôte mit Rotweinjus und Kartoffelstock'),
    ).toHaveLength(8);
    expect(lines).toContain(fileMessages.pdf.page(pages, pages));
  });
});
