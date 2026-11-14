import { describe, expect, it } from 'vitest';
import { DEFAULT_CURRENCY, type ArticleCategoryId } from '../src';
import { foldName, guessCategory } from '../src/modules/articles/category-guess';
import {
  IMPORT_MAX_LINES,
  nameKey,
  parseImportLines,
  readImportPrice,
} from '../src/modules/articles/import-lines';
import { createTestContext, seedKitchen, type TestContext } from '../src/testing';

async function setup() {
  const t = await createTestContext();
  const kitchen = await seedKitchen(t);
  return { t, kitchen, run: t.useCases };
}

const eventTypes = async (t: TestContext) =>
  (await t.storage.events.ofBusiness(t.businessId)).map((event) => event.type);

/** Six lines as a cook pastes them: semicolons, one line from a spreadsheet, one that exists. */
const SIX_LINES = [
  'Rindsfilet; kg; 78.00; Metzgerei Muster',
  'Halbrahm; l; 5.20; Molkerei Beispiel',
  'Wachteleier\tStk\t0.45\tGrosshandel Beispiel',
  'Olivenöl; l; 14,50',
  'Basmatireis; kg',
  'Vollrahm; l; 6.40; Grosshandel Beispiel',
].join('\n');

describe('guessCategory', () => {
  it('guesses the group of goods from words of the name', () => {
    const cases: [string, ArticleCategoryId][] = [
      ['Rindsentrecôte', 'meat'],
      ['Kalbsfilet', 'meat'],
      ['Schweinsbraten', 'meat'],
      ['Hackfleisch gemischt', 'meat'],
      ['Pouletbrust', 'poultry'],
      ['Pouletbrustfilet', 'poultry'],
      ['Lachsfilet', 'fish'],
      ['Crevetten roh', 'fish'],
      ['Rohschinken', 'charcuterie'],
      ['Kalbsbratwurst', 'charcuterie'],
      ['Vollrahm', 'dairy'],
      ['Kaffeerahm', 'dairy'],
      ['Vollmilch', 'dairy'],
      ['Naturjoghurt', 'dairy'],
      ['Kochbutter', 'dairy'],
      ['Gruyère AOP', 'cheese'],
      ['Ziegenfrischkäse', 'cheese'],
      ['Eier', 'eggs'],
      ['Freilandeier', 'eggs'],
      ['Wachteleier', 'eggs'],
      ['Weissmehl', 'dry'],
      ['Risottoreis', 'dry'],
      ['Spaghetti', 'dry'],
      ['Meersalz', 'spices'],
      ['Olivenöl', 'oils'],
      ['Zwiebeln', 'vegetables'],
      ['Kartoffeln festkochend', 'vegetables'],
      ['Cherrytomaten', 'vegetables'],
      ['Zitronen', 'fruit'],
      ['Erdbeeren', 'fruit'],
      ['Petersilie glatt', 'herbs'],
      ['Kopfsalat', 'herbs'],
      ['Ruchbrot', 'bakery'],
      ['Butterzopf', 'bakery'],
      ['Dunkle Schokolade 70 %', 'sweets'],
      ['Tomatensauce', 'sauces'],
      ['Kalbsfond', 'sauces'],
      ['Demi-Glace', 'sauces'],
      ['Pelati Dose', 'canned'],
      ['Kokosmilch', 'canned'],
      ['Erbsen TK', 'frozen'],
      ['Vanilleglace', 'frozen'],
      ['Blätterteig', 'convenience'],
      ['Mineralwasser', 'softdrinks'],
      ['Orangensaft', 'softdrinks'],
      ['Rotwein zum Kochen', 'wine'],
      ['Lagerbier', 'beer'],
      ['Kirsch', 'spirits'],
      ['Kaffeebohnen', 'coffee_tea'],
      ['Schwarztee', 'coffee_tea'],
      ['Servietten weiss', 'nonfood'],
      ['Etwas ganz anderes', 'other'],
      ['', 'other'],
    ];
    for (const [name, category] of cases) {
      expect(guessCategory(name), name).toBe(category);
    }
  });

  it('matches whole words, so a word inside another does not mislead', () => {
    // «Reis» is no egg, a boar no wine, rice pudding no dairy, peanut butter no butter.
    expect(guessCategory('Reis')).toBe('dry');
    expect(guessCategory('Wildschwein')).toBe('meat');
    expect(guessCategory('Schweinsfilet')).toBe('meat');
    expect(guessCategory('Milchreis')).toBe('dry');
    expect(guessCategory('Erdnussbutter')).toBe('dry');
    expect(guessCategory('Eierschwämmli')).toBe('vegetables');
    expect(guessCategory('Fleischkäse')).toBe('charcuterie');
  });

  it('ignores case and the accents people leave out, but keeps umlauts', () => {
    expect(foldName('  Entrecôte ')).toBe('entrecote');
    expect(foldName('GRUYÈRE')).toBe('gruyere');
    expect(foldName('Öl')).toBe('öl');
    expect(guessCategory('ENTRECOTE')).toBe('meat');
    expect(guessCategory('Gruyere')).toBe('cheese');
  });
});

describe('readImportPrice', () => {
  const chf = DEFAULT_CURRENCY;
  it('turns a price per typed unit into Rappen per 1000 base units', () => {
    // Per kilogram and per litre: the amount itself.
    expect(readImportPrice('62.00', 1000, chf)).toBe(6200);
    expect(readImportPrice('6,40', 1000, chf)).toBe(640);
    // Per piece: 45 Rp × 1000.
    expect(readImportPrice('0.45', 1, chf)).toBe(45_000);
    expect(readImportPrice('.012', 1, chf)).toBe(1200);
    // Per decilitre: CHF 0.64 × 10 = CHF 6.40 a litre.
    expect(readImportPrice('0.64', 100, chf)).toBe(640);
    // Per gram: CHF 0.05 × 1000 = CHF 50.00 a kilogram.
    expect(readImportPrice('0.05', 1, chf)).toBe(5000);
  });

  it('reads amounts as people write them', () => {
    expect(readImportPrice('CHF 1’250.50', 1000, chf)).toBe(125_050);
    expect(readImportPrice("1'250.50 CHF", 1000, chf)).toBe(125_050);
    expect(readImportPrice('Fr. 12.–', 1000, chf)).toBe(1200);
    expect(readImportPrice('12.-', 1000, chf)).toBe(1200);
    expect(readImportPrice('12', 1000, chf)).toBe(1200);
    expect(readImportPrice('0', 1000, chf)).toBe(0);
  });

  it('gives up on what is no plain amount', () => {
    for (const text of ['', 'gratis', '-3.50', '12.345.6', '1.23456', '12 kg', '999999999999']) {
      expect(readImportPrice(text, 1000, chf), text).toBeUndefined();
    }
  });
});

describe('parseImportLines', () => {
  const parse = (text: string, existing: string[] = []) =>
    parseImportLines(text, DEFAULT_CURRENCY, new Set(existing.map(nameKey)));

  it('reads name, unit, price and supplier, separated by semicolons or tabs', () => {
    const { lines, truncated } = parse(SIX_LINES, ['Vollrahm']);
    expect(truncated).toBe(false);
    expect(lines).toEqual([
      {
        line: 1,
        raw: 'Rindsfilet; kg; 78.00; Metzgerei Muster',
        name: 'Rindsfilet',
        unit: 'g',
        pricePer1000: 7800,
        supplierName: 'Metzgerei Muster',
        categoryId: 'meat',
        problems: [],
      },
      {
        line: 2,
        raw: 'Halbrahm; l; 5.20; Molkerei Beispiel',
        name: 'Halbrahm',
        unit: 'ml',
        pricePer1000: 520,
        supplierName: 'Molkerei Beispiel',
        categoryId: 'dairy',
        problems: [],
      },
      {
        line: 3,
        raw: 'Wachteleier\tStk\t0.45\tGrosshandel Beispiel',
        name: 'Wachteleier',
        unit: 'pcs',
        pricePer1000: 45_000,
        supplierName: 'Grosshandel Beispiel',
        categoryId: 'eggs',
        problems: [],
      },
      {
        line: 4,
        raw: 'Olivenöl; l; 14,50',
        name: 'Olivenöl',
        unit: 'ml',
        pricePer1000: 1450,
        categoryId: 'oils',
        problems: [],
      },
      {
        line: 5,
        raw: 'Basmatireis; kg',
        name: 'Basmatireis',
        unit: 'g',
        categoryId: 'dry',
        problems: [],
      },
      {
        line: 6,
        raw: 'Vollrahm; l; 6.40; Grosshandel Beispiel',
        name: 'Vollrahm',
        unit: 'ml',
        pricePer1000: 640,
        supplierName: 'Grosshandel Beispiel',
        categoryId: 'dairy',
        problems: ['duplicate'],
      },
    ]);
  });

  it('understands the units a kitchen writes and converts their price', () => {
    const { lines } = parse(
      [
        'Safran; g; 12.50',
        'Vanilleextrakt; dl; 4.80',
        'Kirsch; cl; 0.35',
        'Zitronen; Stk.; 0.60',
        'Trüffelöl; ML; 0.09',
        'Mehl; Kilo; 1.60',
        'Milch; Liter; 1.75',
        'Brötchen; Stück; 0.55',
      ].join('\n'),
    );
    expect(lines.map((line) => [line.unit, line.pricePer1000, line.problems])).toEqual([
      // CHF 12.50 per gram is CHF 12’500 per kilogram.
      ['g', 1_250_000, []],
      // CHF 4.80 per decilitre is CHF 48.00 per litre.
      ['ml', 4800, []],
      // CHF 0.35 per centilitre is CHF 35.00 per litre.
      ['ml', 3500, []],
      ['pcs', 60_000, []],
      // CHF 0.09 per millilitre is CHF 90.00 per litre.
      ['ml', 9000, []],
      ['g', 160, []],
      ['ml', 175, []],
      ['pcs', 55_000, []],
    ]);
  });

  it('says what is wrong with a line and keeps reading the others', () => {
    const { lines } = parse(
      [
        '; kg; 12.00',
        'Kalbsfilet',
        'Kalbsfilet; Bund; 3.00',
        'Kalbshaxe; kg; teuer',
        `Kalbsleber; kg; 24.00; ${'L'.repeat(81)}`,
        `${'K'.repeat(121)}; kg`,
        'Kalbsragout; kg; 0',
        'kalbsragout; kg; 31.00',
        'Butter; kg',
      ].join('\n'),
      ['Butter'],
    );
    expect(lines.map((line) => line.problems)).toEqual([
      ['name'],
      ['unit'],
      ['unit', 'repeated'],
      ['price'],
      ['supplier'],
      ['name'],
      // A price of 0 means «not known yet», not a problem.
      [],
      ['repeated'],
      ['duplicate'],
    ]);
    expect(lines[6]).not.toHaveProperty('pricePer1000');
    expect(lines[1]).toMatchObject({ name: 'Kalbsfilet', categoryId: 'meat' });
    expect(lines[1]).not.toHaveProperty('unit');
  });

  it('leaves out empty lines and a heading, and keeps the line numbers of the text', () => {
    const { lines } = parse(
      ['', 'Name; Einheit; Preis; Lieferant', '', 'Eier; Stk; 0.45', '   ', 'Mehl; kg'].join(
        '\r\n',
      ),
    );
    expect(lines.map((line) => [line.line, line.name])).toEqual([
      [4, 'Eier'],
      [6, 'Mehl'],
    ]);
    // A heading only counts on the first line with content.
    expect(parse('Eier; Stk\nName; Einheit').lines.map((line) => line.problems)).toEqual([
      [],
      ['unit'],
    ]);
    expect(parse('').lines).toEqual([]);
  });

  it('stops after the lines one import takes', () => {
    const text = Array.from({ length: IMPORT_MAX_LINES + 1 }, (_, i) => `Artikel ${i}; kg`).join(
      '\n',
    );
    const { lines, truncated } = parse(text);
    expect(lines).toHaveLength(IMPORT_MAX_LINES);
    expect(truncated).toBe(true);
    expect(parse(text.split('\n').slice(1).join('\n')).truncated).toBe(false);
  });
});

describe('articles.importPreview', () => {
  it('shows per line what would be created, and why a line would not', async () => {
    const { t, run } = await setup();
    const preview = await run['articles.importPreview']({
      businessId: t.businessId,
      text: SIX_LINES,
    });
    expect(preview.valid).toBe(5);
    expect(preview.invalid).toBe(1);
    expect(preview.truncated).toBe(false);
    // «Metzgerei Muster» and «Grosshandel Beispiel» exist; the dairy is new.
    expect(preview.newSuppliers).toEqual(['Molkerei Beispiel']);
    expect(preview.lines.map((line) => [line.name, line.categoryLabel, line.ok])).toEqual([
      ['Rindsfilet', 'Fleisch', true],
      ['Halbrahm', 'Milchprodukte', true],
      ['Wachteleier', 'Eier', true],
      ['Olivenöl', 'Öle und Fette', true],
      ['Basmatireis', 'Trockenwaren', true],
      ['Vollrahm', 'Milchprodukte', false],
    ]);
    expect(preview.lines[0]).toEqual({
      line: 1,
      raw: 'Rindsfilet; kg; 78.00; Metzgerei Muster',
      name: 'Rindsfilet',
      unit: 'g',
      pricePer1000: 7800,
      supplierName: 'Metzgerei Muster',
      supplierIsNew: false,
      categoryId: 'meat',
      categoryLabel: 'Fleisch',
      problems: [],
      ok: true,
    });
    expect(preview.lines[1]).toMatchObject({ supplierIsNew: true });
    expect(preview.lines[5]).toMatchObject({ problems: ['duplicate'], ok: false });
    // A query writes nothing.
    expect((await run['articles.list']({ businessId: t.businessId })).total).toBe(10);
    expect((await run['suppliers.list']({ businessId: t.businessId })).total).toBe(2);
  });

  it('does not count the supplier of a line that will not be imported as new', async () => {
    const { t, run } = await setup();
    const preview = await run['articles.importPreview']({
      businessId: t.businessId,
      text: 'Butter; kg; 14.00; Molkerei Beispiel\nRahmquark; kg; 6.00; molkerei beispiel\nKefir; l; 3.00; Molkerei Beispiel',
    });
    expect(preview).toMatchObject({ valid: 2, invalid: 1, newSuppliers: ['molkerei beispiel'] });
  });

  it('reads against the articles of its own business only', async () => {
    const { t } = await setup();
    const other = await createTestContext({ storage: t.storage, idStart: 100_000 });
    const preview = await other.useCases['articles.importPreview']({
      businessId: other.businessId,
      text: SIX_LINES,
    });
    // «Vollrahm» is no duplicate there, and every supplier would be new.
    expect(preview).toMatchObject({ valid: 6, invalid: 0 });
    expect(preview.newSuppliers).toEqual([
      'Grosshandel Beispiel',
      'Metzgerei Muster',
      'Molkerei Beispiel',
    ]);
    await expect(
      other.useCases['articles.importPreview']({ businessId: other.cmd(), text: SIX_LINES }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('articles.import', () => {
  it('creates the five good lines of six, the missing supplier, and returns the bad line', async () => {
    const { t, kitchen, run } = await setup();
    const commandId = t.cmd();
    const result = await run['articles.import']({
      commandId,
      businessId: t.businessId,
      text: SIX_LINES,
    });
    expect(result).toMatchObject({
      created: 5,
      skipped: 1,
      suppliersCreated: 1,
      remaining: 'Vollrahm; l; 6.40; Grosshandel Beispiel',
    });
    expect(result.articleIds).toHaveLength(5);

    const list = await run['articles.list']({ businessId: t.businessId });
    expect(list.total).toBe(15);
    const row = (name: string) => list.rows.find((each) => each.name === name);
    // Each article gets what its group of goods proposes.
    expect(row('Rindsfilet')).toMatchObject({
      categoryId: 'meat',
      unit: 'g',
      pricePer1000: 7800,
      supplierName: 'Metzgerei Muster',
      areaName: 'Kühlzelle',
      diet: 'omnivore',
      stock: 0,
      // Meat needs its country before it goes on a menu card.
      missing: ['origin'],
    });
    expect(row('Halbrahm')).toMatchObject({
      categoryId: 'dairy',
      unit: 'ml',
      pricePer1000: 520,
      supplierName: 'Molkerei Beispiel',
      diet: 'vegetarian',
    });
    expect(row('Wachteleier')).toMatchObject({
      unit: 'pcs',
      pricePer1000: 45_000,
      supplierId: kitchen.suppliers.wholesaler.id,
    });
    expect(row('Olivenöl')).toMatchObject({
      categoryId: 'oils',
      areaName: 'Trockenlager',
      missing: ['supplier'],
    });
    expect(row('Basmatireis')).toMatchObject({ pricePer1000: 0, missing: ['price', 'supplier'] });
    const stored = await t.storage.articles.get(result.articleIds[0] ?? t.cmd());
    expect(stored).toMatchObject({
      name: 'Rindsfilet',
      kind: 'purchased',
      dateKind: 'use_by',
      shelfLifeDays: 3,
      yieldBps: 10_000,
      active: true,
    });
    // The one existing «Vollrahm» is untouched.
    expect(list.rows.filter((each) => each.name === 'Vollrahm')).toHaveLength(1);
    expect((await run['suppliers.list']({ businessId: t.businessId })).total).toBe(3);

    const events = await t.storage.events.ofBusiness(t.businessId);
    expect(events.map((event) => event.type)).toEqual(['supplier.created', 'articles.imported']);
    expect(events[1]?.payload).toMatchObject({ articleIds: result.articleIds, skipped: 1 });

    // Idempotent: the same command again creates nothing.
    expect(
      await run['articles.import']({ commandId, businessId: t.businessId, text: SIX_LINES }),
    ).toEqual(result);
    expect((await run['articles.list']({ businessId: t.businessId })).total).toBe(15);
    // Pasted again as a new command, every line is a duplicate now.
    await expect(
      run['articles.import']({ commandId: t.cmd(), businessId: t.businessId, text: SIX_LINES }),
    ).rejects.toMatchObject({ code: 'invalid' });
    expect(await eventTypes(t)).toHaveLength(2);
  });

  it('takes a corrected group of goods per line and one new supplier for several lines', async () => {
    const { t, run } = await setup();
    const result = await run['articles.import']({
      commandId: t.cmd(),
      businessId: t.businessId,
      text: 'Burrata; Stk; 2.40; Molkerei Beispiel\n\nSpezialmischung; kg; 9.00; molkerei beispiel',
      // Line 3 of the text is the second article: the guess «Sonstiges» becomes «Gewürze».
      categories: [{ line: 3, categoryId: 'spices' }],
    });
    expect(result).toMatchObject({ created: 2, skipped: 0, suppliersCreated: 1, remaining: '' });
    const { rows } = await run['articles.list']({ businessId: t.businessId, search: 'molkerei' });
    expect(rows.map((row) => [row.name, row.categoryId, row.supplierName])).toEqual([
      ['Burrata', 'cheese', 'Molkerei Beispiel'],
      ['Spezialmischung', 'spices', 'Molkerei Beispiel'],
    ]);
  });

  it('creates nothing when no line works', async () => {
    const { t, run } = await setup();
    await expect(
      run['articles.import']({
        commandId: t.cmd(),
        businessId: t.businessId,
        text: 'Butter; kg; 14.00; Neuer Lieferant\nohne Einheit',
      }),
    ).rejects.toMatchObject({ code: 'invalid' });
    await expect(
      run['articles.import']({ commandId: t.cmd(), businessId: t.businessId, text: '' }),
    ).rejects.toMatchObject({ code: 'invalid' });
    expect((await run['articles.list']({ businessId: t.businessId })).total).toBe(10);
    expect((await run['suppliers.list']({ businessId: t.businessId })).total).toBe(2);
    expect(await eventTypes(t)).toEqual([]);
  });

  it('imports into its own business only', async () => {
    const { t, run } = await setup();
    const other = await createTestContext({ storage: t.storage, idStart: 100_000 });
    const result = await other.useCases['articles.import']({
      commandId: other.cmd(),
      businessId: other.businessId,
      text: 'Vollrahm; l; 6.40; Grosshandel Beispiel',
    });
    expect(result).toMatchObject({ created: 1, suppliersCreated: 1 });
    expect((await run['articles.list']({ businessId: t.businessId })).total).toBe(10);
    expect((await run['suppliers.list']({ businessId: t.businessId })).total).toBe(2);
    // The other business has no areas: the article simply has none.
    const { rows } = await other.useCases['articles.list']({ businessId: other.businessId });
    expect(rows).toHaveLength(1);
    expect(rows[0]).not.toHaveProperty('areaName');
  });
});
