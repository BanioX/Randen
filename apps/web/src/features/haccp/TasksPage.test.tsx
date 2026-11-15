import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../../app/test-helpers';
import { paths } from '../../app/paths';
import { ToastProvider } from '../../ui/Toast';
import { TasksPage } from './TasksPage';
import { haccpMessages as t } from './messages';

async function renderPlan() {
  return renderApp(
    <ToastProvider>
      <TasksPage />
    </ToastProvider>,
    {
      route: paths.hygieneTasks(),
      path: paths.hygieneTasks(),
      routes: [{ path: paths.haccp(), element: <p>Selbstkontrolle</p> }],
    },
  );
}

describe('TasksPage', () => {
  it('offers the starter plan to a business without tasks, and groups it by rhythm', async () => {
    const view = await renderPlan();
    await view.user.click(await screen.findByRole('button', { name: t.plan.empty.standard }));
    expect(
      await screen.findByRole('heading', { level: 2, name: t.frequencies.daily }),
    ).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: t.frequencies.weekly })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: t.frequencies.monthly })).toBeTruthy();
    const row = screen.getByRole('button', { name: /Kühlzelle auswischen/ });
    expect(within(row).getByText('Kühlzelle · Montag')).toBeTruthy();
    expect(within(row).getByText(t.plan.neverDone)).toBeTruthy();
    expect(await view.t.storage.hygieneTasks.ofBusiness(view.t.businessId)).toHaveLength(10);
  });

  it('adds a weekly task: it needs a weekday, then it is listed under its rhythm', async () => {
    const view = await renderPlan();
    await view.user.click(await screen.findByRole('button', { name: t.plan.add }));
    const sheet = await screen.findByRole('dialog', { name: t.plan.sheet.createTitle });
    await view.user.type(within(sheet).getByLabelText(t.plan.sheet.name), 'Fettfilter reinigen');
    await view.user.click(within(sheet).getByRole('radio', { name: t.frequencies.weekly }));
    await view.user.click(within(sheet).getByRole('button', { name: t.plan.sheet.save }));
    expect(await within(sheet).findByText(t.plan.sheet.weekdayMissing)).toBeTruthy();
    await view.user.click(within(sheet).getByRole('radio', { name: t.weekdays.fri }));
    await view.user.click(within(sheet).getByRole('button', { name: t.plan.sheet.save }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: t.plan.sheet.createTitle })).toBeNull();
    });
    const row = await screen.findByRole('button', { name: /Fettfilter reinigen/ });
    expect(within(row).getByText('Freitag')).toBeTruthy();
    const tasks = await view.t.storage.hygieneTasks.ofBusiness(view.t.businessId);
    expect(tasks).toEqual([
      expect.objectContaining({
        name: 'Fettfilter reinigen',
        frequency: 'weekly',
        weekday: 'fri',
        active: true,
      }),
    ]);
  });

  it('refuses a second task with the same name', async () => {
    const view = await renderPlan();
    await view.user.click(await screen.findByRole('button', { name: t.plan.empty.standard }));
    await screen.findByRole('button', { name: /Böden nass reinigen/ });
    await view.user.click(screen.getByRole('button', { name: t.plan.add }));
    const sheet = await screen.findByRole('dialog', { name: t.plan.sheet.createTitle });
    await view.user.type(within(sheet).getByLabelText(t.plan.sheet.name), 'böden NASS reinigen');
    await view.user.click(within(sheet).getByRole('button', { name: t.plan.sheet.save }));
    expect(await within(sheet).findByText('Diesen Namen gibt es schon.')).toBeTruthy();
  });

  it('changes a task in its sheet, then removes it after asking', async () => {
    const view = await renderPlan();
    await view.user.click(await screen.findByRole('button', { name: t.plan.empty.standard }));
    await view.user.click(
      await screen.findByRole('button', { name: /Trockenlager kontrollieren/ }),
    );
    const sheet = await screen.findByRole('dialog', { name: t.plan.sheet.editTitle });
    const name = within(sheet).getByLabelText(t.plan.sheet.name);
    expect((name as HTMLInputElement).value).toBe('Trockenlager kontrollieren');
    await view.user.clear(name);
    await view.user.type(name, 'Trockenlager und Schädlinge kontrollieren');
    await view.user.click(within(sheet).getByRole('button', { name: t.plan.sheet.save }));
    expect(
      await screen.findByRole('button', { name: /Trockenlager und Schädlinge kontrollieren/ }),
    ).toBeTruthy();
    await view.user.click(
      screen.getByRole('button', { name: /Trockenlager und Schädlinge kontrollieren/ }),
    );
    const again = await screen.findByRole('dialog', { name: t.plan.sheet.editTitle });
    await view.user.click(within(again).getByRole('button', { name: t.plan.sheet.remove }));
    const asking = await screen.findByRole('alertdialog', { name: t.plan.sheet.removeTitle });
    await view.user.click(within(asking).getByRole('button', { name: t.plan.sheet.remove }));
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /Trockenlager und Schädlinge/ })).toBeNull();
    });
    const rows = await view.t.storage.hygieneTasks.ofBusiness(view.t.businessId);
    expect(rows.find((row) => row.name.startsWith('Trockenlager'))?.deletedAt).toBeDefined();
  });

  it('shows the empty state with the way to add a task', async () => {
    const view = await renderPlan();
    expect(await screen.findByText(t.plan.empty.title)).toBeTruthy();
    expect(screen.getByRole('button', { name: t.plan.add })).toBeTruthy();
    expect(view.kitchen.areas.cold).toBeDefined();
  });
});
