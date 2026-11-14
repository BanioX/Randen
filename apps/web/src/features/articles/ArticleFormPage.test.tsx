import { alive } from '@randen/core';
import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { messages } from '../../app/messages';
import { paths } from '../../app/paths';
import { renderApp } from '../../app/test-helpers';
import { formMessages } from '../../ui/messages.forms';
import { ArticleDetailPage } from './ArticleDetailPage';
import { ArticleEditPage, ArticleNewPage } from './ArticleFormPage';
import { articlesMessages } from './messages';

const t = articlesMessages.form;
const detailRoute = { path: '/articles/:articleId', element: <ArticleDetailPage /> };
const radio = (name: string) => screen.getByRole<HTMLInputElement>('radio', { name });

async function renderNew() {
  const view = await renderApp(<ArticleNewPage />, {
    route: paths.articleNew(),
    path: '/articles/new',
    routes: [detailRoute],
  });
  await screen.findByRole('heading', { level: 1, name: t.createTitle });
  // The pickers read their lists first.
  await screen.findByRole('option', { name: 'Kühlzelle' });
  await screen.findByRole('option', { name: 'Metzgerei Muster' });
  return view;
}

describe('ArticleNewPage', () => {
  it('proposes area, date kind, shelf life and diet from the group of goods, and says what is missing', async () => {
    const { user, t: context, kitchen, router } = await renderNew();
    await user.type(screen.getByLabelText(t.name), 'Kalbsfilet');
    await user.selectOptions(screen.getByLabelText(t.category), 'Fleisch');

    // Fleisch: Kühlzelle, «zu verbrauchen bis», 3 days, with meat or fish.
    await waitFor(() => {
      expect(screen.getByLabelText<HTMLSelectElement>(t.area).value).toBe(kitchen.areas.cold.id);
    });
    expect(radio(t.dateKinds.use_by).checked).toBe(true);
    expect(screen.getByLabelText<HTMLInputElement>(t.shelfLife).value).toBe('3');
    expect(radio(t.diets.omnivore).checked).toBe(true);
    // The proposals are recognisable as such, and the origin is asked for meat.
    expect(screen.getAllByText(t.proposal('Fleisch')).length).toBeGreaterThanOrEqual(3);
    expect(screen.getByText(t.shelfLifeProposal('Fleisch'))).toBeTruthy();
    expect(screen.getByLabelText(t.origin)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: t.save }));
    // Saved: the detail page opens and says that the origin is still missing.
    expect(await screen.findByRole('heading', { level: 1, name: 'Kalbsfilet' })).toBeTruthy();
    expect(await screen.findByText(articlesMessages.detail.openTexts.origin)).toBeTruthy();

    const rows = alive(await context.storage.articles.ofBusiness(context.businessId));
    const stored = rows.find((row) => row.name === 'Kalbsfilet');
    expect(stored).toMatchObject({
      kind: 'purchased',
      categoryId: 'meat',
      unit: 'g',
      pricePer1000: 0,
      yieldBps: 10_000,
      diet: 'omnivore',
      dateKind: 'use_by',
      shelfLifeDays: 3,
      areaId: kitchen.areas.cold.id,
      active: true,
    });
    expect(stored).not.toHaveProperty('originCountry');
    expect(router.state.location.pathname).toBe(paths.article(stored?.id ?? ''));
  });

  it('keeps what the person decided when the group of goods changes', async () => {
    const { user, kitchen } = await renderNew();
    await user.selectOptions(screen.getByLabelText(t.category), 'Fleisch');
    await waitFor(() => {
      expect(radio(t.diets.omnivore).checked).toBe(true);
    });
    // The person knows better: this goes into the dry store and keeps 30 days.
    await user.selectOptions(screen.getByLabelText(t.area), 'Trockenlager');
    await user.clear(screen.getByLabelText(t.shelfLife));
    await user.type(screen.getByLabelText(t.shelfLife), '30');

    await user.selectOptions(screen.getByLabelText(t.category), 'Milchprodukte');
    // Diet and date kind still follow the proposal, area and shelf life stay as typed.
    await waitFor(() => {
      expect(radio(t.diets.vegetarian).checked).toBe(true);
    });
    expect(radio(t.dateKinds.best_before).checked).toBe(true);
    expect(screen.getByLabelText<HTMLSelectElement>(t.area).value).toBe(kitchen.areas.dry.id);
    expect(screen.getByLabelText<HTMLInputElement>(t.shelfLife).value).toBe('30');
    // Milk needs no country of origin.
    expect(screen.queryByLabelText(t.origin)).toBeNull();
  });

  it('takes «Kein fester Lagerbereich» as an answer, not as a gap to fill', async () => {
    const { user, t: context, kitchen } = await renderNew();
    await user.type(screen.getByLabelText(t.name), 'Fleur de Sel');
    await user.selectOptions(screen.getByLabelText(t.category), 'Gewürze');
    await waitFor(() => {
      expect(screen.getByLabelText<HTMLSelectElement>(t.area).value).toBe(kitchen.areas.dry.id);
    });
    await user.selectOptions(screen.getByLabelText(t.area), t.noArea);
    await user.clear(screen.getByLabelText(t.shelfLife));
    await user.click(screen.getByRole('button', { name: t.save }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Fleur de Sel' })).toBeTruthy();
    const rows = alive(await context.storage.articles.ofBusiness(context.businessId));
    const stored = rows.find((row) => row.name === 'Fleur de Sel');
    expect(stored).toMatchObject({ categoryId: 'spices', dateKind: 'best_before' });
    expect(stored).not.toHaveProperty('areaId');
    expect(stored).not.toHaveProperty('shelfLifeDays');
  });

  it('stores an egg at CHF 0.45 per piece as 45000', async () => {
    const { user, t: context } = await renderNew();
    await user.type(screen.getByLabelText(t.name), 'Wachteleier');
    await user.selectOptions(screen.getByLabelText(t.category), 'Eier');
    await user.click(radio(t.units.pcs));
    await user.type(screen.getByLabelText(`${t.price} pro Stk.`), '0.45');
    await user.click(
      within(screen.getByRole('group', { name: t.contains })).getByRole('checkbox', {
        name: 'Eier',
      }),
    );
    await user.click(screen.getByRole('button', { name: t.save }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Wachteleier' })).toBeTruthy();
    // The detail page shows it per piece.
    expect(await screen.findByText('0.45 / Stk.')).toBeTruthy();
    const rows = alive(await context.storage.articles.ofBusiness(context.businessId));
    expect(rows.find((row) => row.name === 'Wachteleier')).toMatchObject({
      unit: 'pcs',
      pricePer1000: 45_000,
      categoryId: 'eggs',
      allergens: ['eggs'],
    });
  });

  it('keeps the typed price when the unit changes and saves every field', async () => {
    const { user, t: context, kitchen } = await renderNew();
    await user.type(screen.getByLabelText(t.name), 'Haselnussglace');
    await user.selectOptions(screen.getByLabelText(t.category), 'Tiefkühlprodukte');
    await user.type(screen.getByLabelText(`${t.price} pro kg`), '12.50');
    await user.click(radio(t.units.ml));
    // Per litre now, the same number.
    expect(screen.getByLabelText<HTMLInputElement>(`${t.price} pro l`).value).toBe('12.50');

    await user.clear(screen.getByLabelText(t.yield));
    await user.type(screen.getByLabelText(t.yield), '95');
    // 12.50 ÷ 0.95 = 13.16: what the yield does to the cost.
    expect(screen.getByText(t.yieldEffect('95 %', 'CHF 13.16 / l', 'CHF 12.50 / l'))).toBeTruthy();

    const contains = screen.getByRole('group', { name: t.contains });
    await user.click(within(contains).getByRole('checkbox', { name: 'Nüsse' }));
    await user.click(within(contains).getByRole('checkbox', { name: 'Milch' }));
    const traces = screen.getByRole('group', { name: t.traces });
    // What it contains cannot also be a trace.
    expect(within(traces).getByRole<HTMLInputElement>('checkbox', { name: 'Milch' }).disabled).toBe(
      true,
    );
    await user.click(within(traces).getByRole('checkbox', { name: 'Erdnüsse' }));
    await user.click(radio(t.diets.vegetarian));
    await user.selectOptions(screen.getByLabelText(t.supplier), 'Grosshandel Beispiel');
    await user.selectOptions(screen.getByLabelText(t.area), 'Trockenlager');
    await user.selectOptions(screen.getByLabelText(t.spot), 'Regal 1, oben');
    await user.type(screen.getByLabelText(t.minStock), '5');
    await user.type(screen.getByLabelText(t.targetStock), '15');
    await user.type(screen.getByLabelText(t.packLabel), 'Wanne');
    await user.type(screen.getByLabelText(t.packSize), '5');
    await user.type(screen.getByLabelText(t.supplierArticleNumber), 'GL-204');
    await user.type(screen.getByLabelText(t.gtin), '7612345678900');
    await user.type(screen.getByLabelText(t.note), 'Nur für die Dessertkarte.');
    await user.click(screen.getByRole('button', { name: t.save }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Haselnussglace' })).toBeTruthy();
    const rows = alive(await context.storage.articles.ofBusiness(context.businessId));
    expect(rows.find((row) => row.name === 'Haselnussglace')).toMatchObject({
      categoryId: 'frozen',
      unit: 'ml',
      pricePer1000: 1250,
      yieldBps: 9500,
      allergens: ['milk', 'nuts'],
      traces: ['peanuts'],
      diet: 'vegetarian',
      supplierId: kitchen.suppliers.wholesaler.id,
      areaId: kitchen.areas.dry.id,
      spotId: kitchen.spots.dryShelf.id,
      minStock: 5000,
      targetStock: 15_000,
      packLabel: 'Wanne',
      packSize: 5000,
      supplierArticleNumber: 'GL-204',
      gtin: '7612345678900',
      note: 'Nur für die Dessertkarte.',
      dateKind: 'best_before',
      shelfLifeDays: 270,
    });
  });

  it('says at the field what does not fit and saves nothing until it does', async () => {
    const { user, t: context } = await renderNew();
    // Without a name and a group of goods the form is not sent.
    await user.click(screen.getByRole('button', { name: t.save }));
    expect((await screen.findAllByText(formMessages.required)).length).toBeGreaterThanOrEqual(2);

    await user.type(screen.getByLabelText(t.name), 'butter');
    await user.selectOptions(screen.getByLabelText(t.category), 'Milchprodukte');
    await user.type(screen.getByLabelText(t.minStock), '5');
    await user.type(screen.getByLabelText(t.targetStock), '2');
    await user.type(screen.getByLabelText(t.gtin), '7612345678901');
    await user.type(screen.getByLabelText(t.packLabel), 'Karton');
    await user.click(screen.getByRole('button', { name: t.save }));
    expect(await screen.findByText(t.targetBelowMin('5 kg'))).toBeTruthy();
    expect(screen.getByText(t.gtinInvalid)).toBeTruthy();
    expect(screen.getByText(t.packSizeMissing)).toBeTruthy();

    await user.clear(screen.getByLabelText(t.targetStock));
    await user.clear(screen.getByLabelText(t.gtin));
    await user.clear(screen.getByLabelText(t.packLabel));
    await user.click(screen.getByRole('button', { name: t.save }));
    // «Butter» exists: the command is refused, and the field says why.
    expect(await screen.findByText(t.duplicate)).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toBe(messages.errors.codes.duplicate_name);
    const rows = alive(await context.storage.articles.ofBusiness(context.businessId));
    expect(rows).toHaveLength(10);
  });
});

describe('ArticleEditPage', () => {
  it('opens with the stored values, locks the unit while there is stock, and saves changes', async () => {
    const view = await renderApp(<ArticleEditPage />, {
      route: '/',
      path: '/articles/:articleId/edit',
      routes: [detailRoute, { path: '/', element: <p>Start</p> }],
    });
    const { user, t: context, kitchen, router } = view;
    const articleId = kitchen.articles.entrecote.id;
    await router.navigate(paths.articleEdit(articleId));
    await screen.findByRole('heading', { level: 1, name: t.editTitle });
    await screen.findByRole('option', { name: 'Metzgerei Muster' });

    expect(screen.getByLabelText<HTMLInputElement>(t.name).value).toBe('Rindsentrecôte');
    expect(screen.getByLabelText<HTMLInputElement>(`${t.price} pro kg`).value).toBe('62.00');
    expect(screen.getByLabelText<HTMLInputElement>(t.yield).value).toBe('90');
    // 62.00 ÷ 0.9 = 68.89
    expect(
      screen.getByText(t.yieldEffect('90 %', 'CHF 68.89 / kg', 'CHF 62.00 / kg')),
    ).toBeTruthy();
    expect(screen.getByLabelText<HTMLSelectElement>(t.origin).value).toBe('CH');
    await waitFor(() => {
      expect(screen.getByLabelText<HTMLSelectElement>(t.spot).value).toBe(
        kitchen.spots.meatDrawer.id,
      );
    });
    // 4 kg are booked in grams: the unit stays.
    expect(radio(t.units.g).checked).toBe(true);
    expect(radio(t.units.pcs).disabled).toBe(true);
    expect(screen.getByText(t.unitLocked.stock)).toBeTruthy();
    // An existing article keeps its values: another group of goods proposes nothing.
    expect(screen.queryByText(t.proposal('Fleisch'))).toBeNull();

    await user.selectOptions(screen.getByLabelText(t.origin), 'Irland');
    await user.type(screen.getByLabelText(t.minStock), '2');
    await user.selectOptions(screen.getByLabelText(t.supplier), t.noSupplier);
    await user.click(screen.getByRole('button', { name: t.save }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Rindsentrecôte' })).toBeTruthy();
    expect(router.state.location.pathname).toBe(paths.article(articleId));
    const stored = await context.storage.articles.get(articleId);
    expect(stored).toMatchObject({ originCountry: 'IE', minStock: 2000, pricePer1000: 6200 });
    // «Kein Lieferant» clears the field, and the detail page says what is open now.
    expect(stored).not.toHaveProperty('supplierId');
    expect(await screen.findByText(articlesMessages.detail.openTexts.supplier)).toBeTruthy();
  });

  it('leaves name, price and allergens of a component to its recipe', async () => {
    const view = await renderApp(<ArticleEditPage />, {
      route: '/',
      path: '/articles/:articleId/edit',
      routes: [detailRoute, { path: '/', element: <p>Start</p> }],
    });
    const { user, t: context, kitchen, router } = view;
    await router.navigate(paths.articleEdit(kitchen.articles.jus.id));
    // The header stands while the article is read; the form follows.
    expect(await screen.findByText(t.fromRecipe('Rotweinjus'))).toBeTruthy();
    expect(screen.getByRole('link', { name: t.openRecipe }).getAttribute('href')).toBe(
      paths.recipe(kitchen.recipes.jus.id),
    );
    expect(screen.getByLabelText<HTMLInputElement>(t.name).disabled).toBe(true);
    expect(screen.queryByLabelText(`${t.price} pro l`)).toBeNull();
    expect(screen.queryByRole('group', { name: t.contains })).toBeNull();
    expect(screen.getByText(t.unitLocked.recipes)).toBeTruthy();

    await user.clear(screen.getByLabelText(t.shelfLife));
    await user.type(screen.getByLabelText(t.shelfLife), '4');
    await user.click(screen.getByRole('button', { name: t.save }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Rotweinjus' })).toBeTruthy();
    expect(await context.storage.articles.get(kitchen.articles.jus.id)).toMatchObject({
      shelfLifeDays: 4,
      name: 'Rotweinjus',
      recipeId: kitchen.recipes.jus.id,
    });
  });

  it('says so when the article does not exist', async () => {
    const { t: context, router } = await renderApp(<ArticleEditPage />, {
      route: '/',
      path: '/articles/:articleId/edit',
      routes: [{ path: '/', element: <p>Start</p> }],
    });
    await router.navigate(paths.articleEdit(context.cmd()));
    expect(await screen.findByText(messages.errors.notFoundText)).toBeTruthy();
    // An address that is no id at all is not looked up.
    await router.navigate(paths.articleEdit('kein-artikel'));
    expect(await screen.findByText(messages.errors.notFoundText)).toBeTruthy();
    expect(screen.queryByRole('button', { name: t.save })).toBeNull();
  });
});
