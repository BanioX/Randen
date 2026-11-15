import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { paths } from '../../app/paths';
import { renderApp } from '../../app/test-helpers';
import { recipesMessages } from './messages';
import { PriceChangePage } from './PriceChangePage';

const t = recipesMessages.priceChange;

async function renderPage() {
  const view = await renderApp(<PriceChangePage />, {
    route: paths.recipesPriceChange(),
    path: '/recipes/price-change',
  });
  await screen.findByRole('heading', { level: 1, name: t.title });
  return view;
}

/** Types an article into the picker and takes the first row that matches. */
async function pickArticle(user: Awaited<ReturnType<typeof renderPage>>['user'], name: string) {
  await user.type(screen.getByLabelText(t.article), name);
  await user.click(await screen.findByRole('option', { name: new RegExp(name) }));
}

describe('PriceChangePage', () => {
  it('asks for an article and a change first, and shows nothing before', async () => {
    await renderPage();
    expect(screen.getByText(t.ask)).toBeTruthy();
    expect(screen.queryByRole('list', { name: t.dishes })).toBeNull();
  });

  it('shows the new price, the summary and each dish with its share before and after', async () => {
    const { user } = await renderPage();
    await pickArticle(user, 'Butter');
    await user.type(screen.getByLabelText(t.percent), '15');

    // Butter CHF 14.00 per kg; +15 % is CHF 16.10 per kg.
    expect(await screen.findByText('Neuer Preis: CHF 16.10 / kg')).toBeTruthy();
    expect(screen.getByText('2 Gerichte verwenden diesen Artikel.')).toBeTruthy();
    expect(screen.getByText(t.unchanged)).toBeTruthy();

    const entrecote = screen.getByRole('link', { name: /Entrecôte mit Rotweinjus/ });
    expect(within(entrecote).getByText('35.3 % → 35.4 %')).toBeTruthy();
    expect(within(entrecote).getAllByText('über dem Ziel')).toHaveLength(2);
    expect(entrecote.getAttribute('href')).toMatch(/^\/recipes\//);
    const salmon = screen.getByRole('link', { name: /Lachs mit Rahmsauce/ });
    expect(within(salmon).getByText('21.3 % → 21.4 %')).toBeTruthy();
    expect(within(salmon).getAllByText('im Ziel')).toHaveLength(2);
  });

  it('says which dish slips over the target when the price rises further', async () => {
    const { user } = await renderPage();
    await pickArticle(user, 'Lachsfilet');
    await user.type(screen.getByLabelText(t.percent), '50');

    // Salmon CHF 38.00 per kg +50 % = CHF 57.00: the dish goes from 21.3 % to 31 %, watch.
    expect(await screen.findByText('Neuer Preis: CHF 57.00 / kg')).toBeTruthy();
    expect(screen.getByText('1 Gericht verwendet diesen Artikel.')).toBeTruthy();
    expect(screen.getByText('1 Gericht rutscht über das Ziel.')).toBeTruthy();
    const salmon = screen.getByRole('link', { name: /Lachs mit Rahmsauce/ });
    expect(within(salmon).getByText('21.3 % → 31 %')).toBeTruthy();
    expect(within(salmon).getByText('knapp über dem Ziel')).toBeTruthy();
  });

  it('takes a minus sign for a price that falls, from a button next to the field', async () => {
    const { user } = await renderPage();
    await pickArticle(user, 'Butter');
    await user.type(screen.getByLabelText(t.percent), '10');
    const minus = screen.getByRole('button', { name: 'Minus, Preisänderung' });
    expect(minus.getAttribute('aria-pressed')).toBe('false');
    await user.click(minus);

    expect(minus.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByLabelText(t.percent)).toHaveProperty('value', '-10');
    // 1400 × 0.9 = 1260 Rappen per kilo.
    expect(await screen.findByText('Neuer Preis: CHF 12.60 / kg')).toBeTruthy();
  });

  it('says so, in one sentence, when no dish uses the article', async () => {
    const { user } = await renderPage();
    await pickArticle(user, 'Weissmehl');
    await user.type(screen.getByLabelText(t.percent), '15');
    expect(await screen.findByText(t.none)).toBeTruthy();
    expect(screen.queryByRole('list', { name: t.dishes })).toBeNull();
  });

  it('says that the article has no price yet, and computes nothing', async () => {
    const { user } = await renderPage();
    // The Rotweinjus is made in house and has no price of its own.
    await pickArticle(user, 'Rotweinjus');
    await user.type(screen.getByLabelText(t.percent), '15');
    expect(
      await screen.findByText(
        'Der Artikel hat noch keinen Preis, darum lässt sich nichts durchrechnen.',
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/Neuer Preis/)).toBeNull();
  });
});
