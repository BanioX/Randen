import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { paths } from '../../app/paths';
import { renderApp } from '../../app/test-helpers';
import { makeCard } from './test-helpers';
import { menuMessages } from './messages';
import { MenuPage } from './MenuPage';

const t = menuMessages;

async function renderList() {
  const view = await renderApp(<MenuPage />, { route: paths.menu(), path: '/menu' });
  await screen.findByRole('heading', { level: 1, name: t.title });
  return view;
}

describe('MenuPage', () => {
  it('says what the first card is for, and offers to make it', async () => {
    const { user } = await renderList();
    expect(await screen.findByText(t.list.emptyTitle)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: t.create }));
    expect(await screen.findByRole('dialog', { name: t.createSheet.title })).toBeTruthy();
  });

  it('creates a card from its name and opens the editor of it', async () => {
    const { user, router, t: context } = await renderList();
    await screen.findByText(t.list.emptyTitle);
    await user.click(screen.getByRole('button', { name: t.create }));
    const sheet = await screen.findByRole('dialog', { name: t.createSheet.title });
    await user.type(within(sheet).getByRole('textbox'), 'Sommerkarte');
    await user.click(screen.getByRole('button', { name: t.createSheet.submit }));
    await waitFor(() => {
      expect(router.state.location.pathname).toMatch(/^\/menu\/[0-9a-f-]{36}$/);
    });
    const cards = await context.storage.menuCards.ofBusiness(context.businessId);
    expect(cards.map((card) => card.name)).toEqual(['Sommerkarte']);
  });

  it('lists the cards with sections, dishes, status and the open points', async () => {
    const view = await renderList();
    const { entrecoteDish, salmonDish } = view.kitchen.recipes;
    await makeCard(
      view,
      'Abendkarte',
      [{ title: 'Hauptgänge', recipeIds: [entrecoteDish.id, salmonDish.id] }],
      {
        published: true,
      },
    );
    await makeCard(view, 'Mittagskarte');
    const list = await screen.findByRole('list', { name: t.list.caption });
    const evening = within(list).getByRole('link', { name: /Abendkarte/ });
    expect(within(evening).getByText('1 Abschnitt · 2 Gerichte')).toBeTruthy();
    expect(within(evening).getByText(t.status.published)).toBeTruthy();
    expect(within(evening).getByText(t.count.open(2))).toBeTruthy();
    expect(evening.getAttribute('href')).toMatch(/^\/menu\/[0-9a-f-]{36}$/);
    const draft = within(list).getByRole('link', { name: /Mittagskarte/ });
    expect(within(draft).getByText(t.status.draft)).toBeTruthy();
  });

  it('lists the published cards for the guest view, and nothing for drafts', async () => {
    const view = await renderList();
    await makeCard(view, 'Abendkarte', [], { published: true });
    await makeCard(view, 'Mittagskarte');
    const guests = await screen.findByRole('list', { name: t.list.guestsTitle });
    const links = within(guests).getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0]?.textContent).toContain('Abendkarte');
    expect(links[0]?.getAttribute('href')).toMatch(/^\/guest\//);
  });
});
