import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../../app/test-helpers';
import { TeamPage } from './TeamPage';

describe('Team (ADR-0015, function «team»)', () => {
  it('lists the people by role and marks the one who works now', async () => {
    const { t } = await renderApp(<TeamPage />, { route: '/more/team', path: '/more/team' });
    expect(await screen.findByRole('heading', { level: 1, name: 'Team' })).toBeTruthy();
    await screen.findByRole('heading', { level: 2, name: 'Küchenchef:in' });
    expect(screen.getByText('Testperson')).toBeTruthy();
    expect(screen.getByText('Arbeitet gerade hier')).toBeTruthy();
    expect(screen.getByText(/Nicht, um Leute zu bewerten/)).toBeTruthy();
    expect(t.actor).toBeDefined();
  });

  it('adds a person in a sheet, under her or his role, and stores the row', async () => {
    const { user, t } = await renderApp(<TeamPage />, { route: '/more/team', path: '/more/team' });
    await user.click(await screen.findByRole('button', { name: 'Person erfassen' }));
    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Anna Muster');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Rolle' }), 'cook');
    await user.click(screen.getByRole('button', { name: 'Sichern' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Köch:in' })).toBeTruthy();
    expect(await screen.findByText('Anna Muster')).toBeTruthy();
    const stored = (await t.storage.staff.ofBusiness(t.businessId)).find(
      (row) => row.name === 'Anna Muster',
    );
    expect(stored).toMatchObject({ role: 'cook', active: true });
  });

  it('refuses a second person with the same name, whatever the case', async () => {
    const { user } = await renderApp(<TeamPage />, { route: '/more/team', path: '/more/team' });
    await user.click(await screen.findByRole('button', { name: 'Person erfassen' }));
    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'testPERSON');
    await user.click(screen.getByRole('button', { name: 'Sichern' }));
    expect(await screen.findByText('Diesen Namen gibt es schon.')).toBeTruthy();
  });

  it('makes a person the one who works now, and says so', async () => {
    const { user } = await renderApp(<TeamPage />, { route: '/more/team', path: '/more/team' });
    await user.click(await screen.findByRole('button', { name: 'Person erfassen' }));
    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Ben Probe');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Rolle' }), 'service');
    await user.click(screen.getByRole('button', { name: 'Sichern' }));
    await screen.findByText('Ben Probe');
    await user.click(screen.getByRole('button', { name: /Ben Probe/ }));
    await user.click(await screen.findByRole('button', { name: 'Als diese Person arbeiten' }));
    // The marker moves with the person: one row says it, and it is not the test person any more.
    await waitFor(() => {
      expect(screen.getAllByText('Arbeitet gerade hier')).toHaveLength(1);
    });
    expect(screen.queryByText('Testperson')).not.toBeNull();
    expect(screen.getByText('Arbeitet gerade hier').parentElement?.textContent).toContain(
      'Ben Probe',
    );
  });

  it('keeps the person who works now, and the last active person, from being removed', async () => {
    const { user } = await renderApp(<TeamPage />, { route: '/more/team', path: '/more/team' });
    await user.click(await screen.findByRole('button', { name: /Testperson/ }));
    expect(
      await screen.findByText('Die Person, die gerade arbeitet, lässt sich nicht entfernen.'),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Person entfernen' })).toBeNull();
  });

  it('removes a person after a confirmation, and the bookings keep the name', async () => {
    const { user, t } = await renderApp(<TeamPage />, { route: '/more/team', path: '/more/team' });
    await user.click(await screen.findByRole('button', { name: 'Person erfassen' }));
    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Carla Kurz');
    await user.click(screen.getByRole('button', { name: 'Sichern' }));
    await user.click(await screen.findByRole('button', { name: /Carla Kurz/ }));
    await user.click(await screen.findByRole('button', { name: 'Person entfernen' }));
    await user.click(await screen.findByRole('button', { name: 'Entfernen' }));
    await waitFor(() => {
      expect(screen.queryByText('Carla Kurz')).toBeNull();
    });
    // Removed softly: the row stays, so the bookings of this person keep their name.
    const stored = (await t.storage.staff.ofBusiness(t.businessId)).find(
      (row) => row.name === 'Carla Kurz',
    );
    expect(stored?.deletedAt).toBeDefined();
  });
});
