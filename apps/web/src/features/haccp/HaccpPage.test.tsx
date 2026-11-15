import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../../app/test-helpers';
import { ToastProvider } from '../../ui/Toast';
import { HaccpPage } from './HaccpPage';
import { haccpMessages as t } from './messages';

/** The test kitchen on Saturday 14.11.2026; the Kühlzelle has 0 to 5 °C, the Tiefkühlzelle -18 °C. */
async function renderToday() {
  return renderApp(
    <ToastProvider>
      <HaccpPage />
    </ToastProvider>,
    { route: '/haccp', path: '/haccp' },
  );
}

describe('HaccpPage', () => {
  it('shows one card per area with a range, and says what is not measured yet', async () => {
    await renderToday();
    expect(await screen.findByRole('heading', { level: 1, name: t.title })).toBeTruthy();
    const cold = await screen.findByRole('heading', { name: 'Kühlzelle' });
    const card = cold.closest('li') as HTMLElement;
    expect(within(card).getByText('0 bis 5 °C')).toBeTruthy();
    expect(within(card).getByText(t.today.notYet)).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Tiefkühlzelle' })).toBeTruthy();
    // The dry store has no range: no card for it.
    expect(screen.queryByRole('heading', { name: 'Trockenlager' })).toBeNull();
    expect(screen.getByText(t.today.open('Kühlzelle, Tiefkühlzelle'))).toBeTruthy();
  });

  it('records a reading in order with one field and one button, and shows it as the last reading', async () => {
    const { user } = await renderToday();
    await user.type(await screen.findByLabelText('Temperatur in Kühlzelle'), '4.5');
    await user.click(screen.getByRole('button', { name: 'Erfassen für Kühlzelle' }));
    expect(await screen.findByText(/gemessen 11:00, Testperson/)).toBeTruthy();
    expect(screen.getByText('4.5 °C')).toBeTruthy();
    // The field is ready for the next reading.
    expect(screen.getByLabelText<HTMLInputElement>('Temperatur in Kühlzelle').value).toBe('');
  });

  it('asks what was done before an out-of-range reading is saved, and stores it with that action', async () => {
    const { user, t: context } = await renderToday();
    await user.type(await screen.findByLabelText('Temperatur in Kühlzelle'), '7.5');
    await user.click(screen.getByRole('button', { name: 'Erfassen für Kühlzelle' }));
    const sheet = await screen.findByRole('alertdialog', { name: t.action.title });
    const save = within(sheet).getByRole('button', { name: t.action.save });
    expect((save as HTMLButtonElement).disabled).toBe(true);
    await user.type(
      within(sheet).getByLabelText(t.action.label),
      'Tür war offen, Ware umgelagert.',
    );
    await user.click(save);
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog', { name: t.action.title })).toBeNull();
    });
    expect(await screen.findByText(/gemessen 11:00, Testperson/)).toBeTruthy();
    const logs = await context.storage.temperatureLogs.ofBusiness(context.businessId);
    expect(logs).toEqual([
      expect.objectContaining({
        deciC: 75,
        ok: false,
        minDeciC: 0,
        maxDeciC: 50,
        action: 'Tür war offen, Ware umgelagert.',
      }),
    ]);
  });

  it('offers the starter plan to a business without tasks, and then lists its tasks as a checklist', async () => {
    const { user, t: context } = await renderToday();
    await user.click(await screen.findByRole('button', { name: t.today.offer.action }));
    const box = await screen.findByRole('checkbox', { name: 'Böden nass reinigen' });
    expect((box as HTMLInputElement).checked).toBe(false);
    expect(await context.storage.hygieneTasks.ofBusiness(context.businessId)).toHaveLength(10);
    await user.click(box);
    expect(await screen.findByText(t.today.doneBy('11:00', 'Testperson'))).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: 'Böden nass reinigen' }).matches(':checked')).toBe(
      true,
    );
    await user.click(screen.getByRole('checkbox', { name: 'Böden nass reinigen' }));
    await waitFor(() => {
      expect(
        screen.getByRole('checkbox', { name: 'Böden nass reinigen' }).matches(':checked'),
      ).toBe(false);
    });
  });

  it('links to the history, the plan and the report', async () => {
    await renderToday();
    const history = await screen.findByRole('link', { name: t.today.links.history });
    expect(history.getAttribute('href')).toBe('/haccp/temperatures');
    expect(screen.getByRole('link', { name: t.today.links.plan }).getAttribute('href')).toBe(
      '/haccp/tasks',
    );
    expect(screen.getByRole('link', { name: t.today.links.report }).getAttribute('href')).toBe(
      '/haccp/report',
    );
  });
});
