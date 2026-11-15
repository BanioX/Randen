import { describe, expect, it } from 'vitest';
import {
  escapeHtml,
  fileNameOf,
  renderGuestHtml,
  GUEST_NOTICE,
  INCOMPLETE_NOTICE,
} from '../src/modules/menu/html';
import { analyseDish, menuBook, UNKNOWN_DISH } from '../src/modules/menu/view';
import { DEFAULT_CURRENCY, rappen, uuidV7 } from '../src';
import { addDish, setup, without, type Setup } from './menu-support';

/** The book the rules read, from the rows of the test kitchen. */
async function bookOf(s: Setup) {
  const business = await s.t.storage.businesses.get(s.businessId);
  if (business === undefined) {
    throw new Error('The business is missing');
  }
  return menuBook(
    business,
    await s.t.storage.articles.ofBusiness(s.businessId),
    await s.t.storage.recipes.ofBusiness(s.businessId),
  );
}

const card = { showPrices: true, showPhotos: true };

describe('analyseDish', () => {
  it('reports a recipe that is gone as missing, and keeps the name it still has', async () => {
    const s = await setup();
    const book = await bookOf(s);
    const unknown = analyseDish(uuidV7(1_800_000_000_000, new Uint8Array(10)), card, book);
    expect(unknown).toMatchObject({
      name: UNKNOWN_DISH,
      course: 'other',
      isDish: false,
      active: false,
    });
    expect(unknown.problems.map((problem) => problem.text)).toEqual(['Rezept ist gelöscht']);

    const deleted = await addDish(s, { name: 'Alter Teller', deletedAt: s.t.clock.now() });
    const again = await bookOf(s);
    expect(analyseDish(deleted, card, again)).toMatchObject({
      name: 'Alter Teller',
      isDish: false,
    });
  });

  it('reports a component on a card as no dish', async () => {
    const s = await setup();
    const book = await bookOf(s);
    const state = analyseDish(s.kitchen.recipes.jus.id, card, book);
    expect(state.isDish).toBe(false);
    expect(state.problems.map((problem) => problem.text)).toEqual(['Komponente, kein Gericht']);
  });

  it('counts a price of zero as missing, and an inactive dish as an open point', async () => {
    const s = await setup();
    const free = await addDish(s, { name: 'Gratis', priceRappen: rappen(0), active: false });
    const book = await bookOf(s);
    const state = analyseDish(free, card, book);
    expect(state.problems.map((problem) => problem.kind)).toEqual(['inactive', 'price', 'photo']);
  });

  it('lists every missing origin of a dish in one open point', async () => {
    const s = await setup();
    await s.t.storage.articles.put(without(s.kitchen.articles.salmon, 'originCountry'));
    await s.t.storage.articles.put(without(s.kitchen.articles.entrecote, 'originCountry'));
    const book = await bookOf(s);
    const mains = analyseDish(
      s.kitchen.recipes.entrecoteDish.id,
      { showPrices: false, showPhotos: false },
      book,
    );
    expect(mains.problems).toEqual([{ kind: 'origin', text: 'Herkunft fehlt: Rindsentrecôte' }]);
    const salmon = analyseDish(
      s.kitchen.recipes.salmonDish.id,
      { showPrices: false, showPhotos: false },
      book,
    );
    expect(salmon.problems).toEqual([{ kind: 'origin', text: 'Herkunft fehlt: Lachsfilet' }]);
  });
});

describe('fileNameOf and escapeHtml', () => {
  it('makes a file name from the card name, with umlauts spelled out', () => {
    expect(fileNameOf('Sommerkarte für Gäste')).toBe('speisekarte-sommerkarte-fuer-gaeste.html');
    expect(fileNameOf('Ölküche & Grill')).toBe('speisekarte-oelkueche-grill.html');
    expect(fileNameOf('Straße')).toBe('speisekarte-strasse.html');
    expect(fileNameOf('!!!')).toBe('speisekarte-karte.html');
  });

  it('escapes the five characters that matter', () => {
    expect(escapeHtml(`<a href="x">Tom's & Jerry</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;Tom&#39;s &amp; Jerry&lt;/a&gt;',
    );
  });
});

describe('renderGuestHtml', () => {
  it('shows the intro, the footer and the incomplete notice, and leaves out what is missing', () => {
    const html = renderGuestHtml({
      businessName: 'Bistro',
      currency: DEFAULT_CURRENCY,
      card: {
        id: uuidV7(1_800_000_000_000, new Uint8Array(10)),
        name: 'Abend',
        intro: 'Willkommen',
        footer: 'Bis bald',
        showPrices: true,
        showPhotos: true,
        published: true,
      },
      sections: [
        {
          id: uuidV7(1_800_000_000_000, new Uint8Array(10)),
          title: 'Hauptgänge',
          dishes: [
            {
              id: uuidV7(1_800_000_000_000, new Uint8Array(10)),
              name: 'Risotto',
              allergens: [],
              traces: [],
              diet: 'vegetarian',
              labels: [{ id: 'new', text: 'Neu' }],
              origins: [{ name: 'Reis' }],
              incomplete: true,
            },
          ],
        },
      ],
    });
    expect(html).toContain('<p class="intro">Willkommen</p>');
    expect(html).toContain('<p class="footer">Bis bald</p>');
    expect(html).toContain('<span class="tag">Vegetarisch</span>');
    expect(html).toContain('<span class="tag">Neu</span>');
    expect(html).toContain('<p class="origin">Reis: Herkunft fehlt</p>');
    expect(html).toContain(`<p class="incomplete">${INCOMPLETE_NOTICE}</p>`);
    expect(html).toContain(GUEST_NOTICE);
    expect(html).not.toContain('class="photo"');
    expect(html).not.toContain('class="price"');
  });

  it('leaves the intro and the footer out when the card has none', () => {
    const html = renderGuestHtml({
      businessName: 'Bistro',
      currency: DEFAULT_CURRENCY,
      card: {
        id: uuidV7(1_800_000_000_000, new Uint8Array(10)),
        name: 'Leer',
        showPrices: false,
        showPhotos: false,
        published: false,
      },
      sections: [],
    });
    expect(html).not.toContain('class="intro"');
    expect(html).not.toContain('class="footer"');
  });
});
