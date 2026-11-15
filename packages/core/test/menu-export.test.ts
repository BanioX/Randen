import { describe, expect, it } from 'vitest';
import { ALLERGENS } from '../src';
import { addCard, addDish, givePhotos, PHOTO, refusal, setup, without } from './menu-support';

async function dinnerCard(s: Awaited<ReturnType<typeof setup>>, published = true) {
  const { entrecoteDish, salmonDish } = s.kitchen.recipes;
  return addCard(
    s,
    'Abendkarte',
    [{ title: 'Hauptgänge', recipeIds: [entrecoteDish.id, salmonDish.id] }],
    { published },
  );
}

describe('menu.allergenSheet', () => {
  it('gives every dish against the fourteen allergens in the order of the ordinance', async () => {
    const s = await setup();
    const cardId = await dinnerCard(s, false);
    const sheet = await s.run['menu.allergenSheet']({ businessId: s.businessId, cardId });
    expect(sheet.businessName).toBe('Testküche');
    expect(sheet.allergens.map((item) => item.id)).toEqual(ALLERGENS.map((item) => item.id));
    expect(sheet.allergens).toHaveLength(14);
    expect(sheet.rows.map((row) => row.name)).toEqual([
      'Entrecôte mit Rotweinjus und Kartoffelstock',
      'Lachs mit Rahmsauce',
    ]);
    const entrecote = sheet.rows[0];
    const cell = (id: string) => entrecote?.cells.find((item) => item.id === id)?.state;
    expect(cell('milk')).toBe('contains');
    expect(cell('sulphites')).toBe('contains');
    expect(cell('nuts')).toBe('none');
    expect(entrecote?.origins).toEqual([
      { name: 'Rindsentrecôte', country: 'CH', countryName: 'Schweiz' },
    ]);
    expect(entrecote?.section).toBe('Hauptgänge');
    expect(entrecote?.active).toBe(true);
  });

  it('shows traces as traces, and inactive dishes too (the staff needs the whole card)', async () => {
    const s = await setup();
    const { entrecoteDish, salmonDish } = s.kitchen.recipes;
    await s.t.storage.recipes.put({ ...entrecoteDish, extraTraces: ['nuts', 'milk'] });
    await s.t.storage.recipes.put({ ...salmonDish, active: false });
    const cardId = await dinnerCard(s, false);
    const sheet = await s.run['menu.allergenSheet']({ businessId: s.businessId, cardId });
    const entrecote = sheet.rows[0];
    expect(entrecote?.cells.find((item) => item.id === 'nuts')?.state).toBe('traces');
    expect(entrecote?.cells.find((item) => item.id === 'milk')?.state).toBe('contains');
    expect(sheet.rows[1]?.active).toBe(false);
  });

  it('leaves out deleted dishes and components', async () => {
    const s = await setup();
    const { entrecoteDish, salmonDish } = s.kitchen.recipes;
    const cardId = await dinnerCard(s, false);
    await s.t.storage.recipes.put({ ...salmonDish, deletedAt: s.t.clock.now() });
    const sheet = await s.run['menu.allergenSheet']({ businessId: s.businessId, cardId });
    expect(sheet.rows.map((row) => row.id)).toEqual([entrecoteDish.id]);
  });

  it('gives not_found for a card that does not exist', async () => {
    const s = await setup();
    const error = await refusal(
      s.run['menu.allergenSheet']({ businessId: s.businessId, cardId: s.t.ids.next() }),
    );
    expect(error.code).toBe('not_found');
  });
});

describe('menu.export', () => {
  it('gives one self-contained document: de-CH, not indexed, no script, no address', async () => {
    const s = await setup();
    await givePhotos(s);
    const cardId = await dinnerCard(s);
    const { fileName, html } = await s.run['menu.export']({ businessId: s.businessId, cardId });
    expect(fileName).toBe('speisekarte-abendkarte.html');
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<html lang="de-CH">');
    expect(html).toContain('<meta name="robots" content="noindex">');
    expect(html).not.toContain('<script');
    expect(html).not.toMatch(/https?:\/\//);
    expect(html).not.toContain('http');
    expect(html).toContain('<h1>Testküche</h1>');
    expect(html).toContain('Rindsentrecôte: Schweiz');
    expect(html).toContain('Lachsfilet: Norwegen');
    expect(html).toContain('CHF 42.00');
    expect(html).toContain('CHF 34.00');
    expect(html).toContain('<span class="tag">Milch</span>');
    expect(html).toContain('<span class="tag">Sulfite</span>');
    expect(html).toContain(`<img src="${PHOTO}" alt="">`);
    expect(html).toContain(
      'Über Zutaten, die Allergien oder Unverträglichkeiten auslösen können, gibt das Personal gern Auskunft.',
    );
  });

  it('leaves out prices and photos the card does not show', async () => {
    const s = await setup();
    await givePhotos(s);
    const cardId = await addCard(
      s,
      'Stumm',
      [{ title: 'Hauptgänge', recipeIds: [s.kitchen.recipes.salmonDish.id] }],
      {
        showPrices: false,
        showPhotos: false,
      },
    );
    const { html } = await s.run['menu.export']({ businessId: s.businessId, cardId });
    expect(html).not.toContain('CHF');
    expect(html).not.toContain('<img');
    expect(html).toContain('Lachs mit Rahmsauce');
  });

  it('escapes names and texts, so they cannot break the document', async () => {
    const s = await setup();
    const dish = await addDish(s, {
      name: 'Rösti & <Speck> "Spezial"',
      description: 'Mit <b>Ei</b>',
    });
    const cardId = await addCard(
      s,
      'Mittag & Abend',
      [{ title: '<Hauptgänge>', recipeIds: [dish] }],
      { published: true },
    );
    const row = await s.t.storage.menuCards.get(cardId);
    if (row === undefined) {
      throw new Error('The card is missing');
    }
    await s.t.storage.menuCards.put({ ...row, footer: 'Bis 22 Uhr & später' });
    const { fileName, html } = await s.run['menu.export']({ businessId: s.businessId, cardId });
    expect(fileName).toBe('speisekarte-mittag-abend.html');
    expect(html).toContain('Rösti &amp; &lt;Speck&gt; &quot;Spezial&quot;');
    expect(html).toContain('Mit &lt;b&gt;Ei&lt;/b&gt;');
    expect(html).toContain('&lt;Hauptgänge&gt;');
    expect(html).toContain('Bis 22 Uhr &amp; später');
    expect(html).not.toContain('<Speck>');
    expect(html).not.toContain('<b>');
  });

  it('exports an unpublished card as the editor previews it', async () => {
    const s = await setup();
    const cardId = await dinnerCard(s, false);
    const { html } = await s.run['menu.export']({ businessId: s.businessId, cardId });
    expect(html).toContain('Rindsentrecôte');
  });

  it('marks a dish with an open declaration, and tells the guest to ask the staff', async () => {
    const s = await setup();
    await s.t.storage.articles.put({ ...s.kitchen.articles.cream, deletedAt: s.t.clock.now() });
    const cardId = await dinnerCard(s);
    const { html } = await s.run['menu.export']({ businessId: s.businessId, cardId });
    expect(html).toContain('Angaben unvollständig, bitte beim Personal nachfragen');
  });

  it('names a missing origin in the document, without a country', async () => {
    const s = await setup();
    await s.t.storage.articles.put(without(s.kitchen.articles.salmon, 'originCountry'));
    const cardId = await dinnerCard(s);
    const { html } = await s.run['menu.export']({ businessId: s.businessId, cardId });
    expect(html).toContain('Lachsfilet: Herkunft fehlt');
  });

  it('gives not_found for a card that does not exist', async () => {
    const s = await setup();
    const error = await refusal(
      s.run['menu.export']({ businessId: s.businessId, cardId: s.t.ids.next() }),
    );
    expect(error.code).toBe('not_found');
  });
});
