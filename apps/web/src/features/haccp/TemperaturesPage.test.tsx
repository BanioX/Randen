import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { TemperatureLogSchema } from '@randen/core';
import { renderApp, type AppView } from '../../app/test-helpers';
import { paths } from '../../app/paths';
import { writeDetailed } from '../../app/view';
import { ToastProvider } from '../../ui/Toast';
import { TemperaturesPage } from './TemperaturesPage';
import { haccpMessages as t } from './messages';

afterEach(() => {
  writeDetailed(true);
});

async function renderHistory(route = paths.temperatures()) {
  return renderApp(
    <ToastProvider>
      <TemperaturesPage />
    </ToastProvider>,
    { route, path: paths.temperatures() },
  );
}

/** Fills the form for a food reading and submits it. */
async function recordFood(view: AppView, label: string, value: string) {
  await view.user.click(await screen.findByRole('radio', { name: t.kinds.cooking }));
  await view.user.type(await screen.findByLabelText(t.temperatures.label), label);
  await view.user.type(screen.getByLabelText(t.temperatures.temperature), value);
}

describe('TemperaturesPage: measuring', () => {
  it('records a core temperature in order with its Richtwert, and resets the value for the next one', async () => {
    const view = await renderHistory();
    await recordFood(view, 'Pouletbrust, Kern', '72.5');
    expect(screen.getByText(t.temperatures.proposal('mindestens 70 °C'))).toBeTruthy();
    await view.user.click(screen.getByRole('button', { name: t.temperatures.recordSave }));
    await waitFor(async () => {
      const logs = await view.t.storage.temperatureLogs.ofBusiness(view.t.businessId);
      expect(logs).toHaveLength(1);
    });
    const [log] = await view.t.storage.temperatureLogs.ofBusiness(view.t.businessId);
    expect(log).toMatchObject({
      kind: 'cooking',
      label: 'Pouletbrust, Kern',
      deciC: 725,
      minDeciC: 700,
      ok: true,
    });
    await waitFor(() => {
      expect(screen.getByLabelText<HTMLInputElement>(t.temperatures.temperature).value).toBe('');
    });
  });

  it('asks for the action of an out-of-range food reading, and needs it before saving', async () => {
    const view = await renderHistory();
    await recordFood(view, 'Gemüse', '65');
    const action = await screen.findByLabelText(t.action.label);
    const save = screen.getByRole('button', { name: t.temperatures.recordSave });
    expect((save as HTMLButtonElement).disabled).toBe(false);
    await view.user.click(save);
    // The field is required: nothing is stored without its text.
    expect(await view.t.storage.temperatureLogs.ofBusiness(view.t.businessId)).toHaveLength(0);
    await view.user.type(action, 'Weiter gegart, nochmals gemessen.');
    await view.user.click(save);
    await waitFor(async () => {
      expect(await view.t.storage.temperatureLogs.ofBusiness(view.t.businessId)).toHaveLength(1);
    });
    const [log] = await view.t.storage.temperatureLogs.ofBusiness(view.t.businessId);
    expect(log).toMatchObject({
      kind: 'cooking',
      deciC: 650,
      ok: false,
      minDeciC: 700,
      action: 'Weiter gegart, nochmals gemessen.',
    });
  });

  it('measures a storage area with its range, and names the area', async () => {
    const view = await renderHistory();
    await screen.findByRole('option', { name: 'Kühlzelle' });
    await view.user.selectOptions(
      screen.getByLabelText(t.temperatures.area),
      view.kitchen.areas.cold.id,
    );
    await view.user.type(screen.getByLabelText(t.temperatures.temperature), '4.5');
    await view.user.click(screen.getByRole('button', { name: t.temperatures.recordSave }));
    await waitFor(async () => {
      expect(await view.t.storage.temperatureLogs.ofBusiness(view.t.businessId)).toHaveLength(1);
    });
    const [log] = await view.t.storage.temperatureLogs.ofBusiness(view.t.businessId);
    expect(log).toMatchObject({
      kind: 'storage',
      areaId: view.kitchen.areas.cold.id,
      deciC: 45,
      ok: true,
      minDeciC: 0,
      maxDeciC: 50,
    });
  });

  it('opens with the kind of its address: ?kind=cooking shows the core temperature', async () => {
    await renderHistory(`${paths.temperatures()}?kind=cooking`);
    expect(await screen.findByLabelText(t.temperatures.label)).toBeTruthy();
    expect((await screen.findByRole('radio', { name: t.kinds.cooking })).matches(':checked')).toBe(
      true,
    );
  });
});

describe('TemperaturesPage: the history', () => {
  it('lists the readings newest first, with out-of-range rows said in words', async () => {
    const view = await renderHistory();
    await view.t.useCases['temperatures.record']({
      commandId: view.t.cmd(),
      businessId: view.t.businessId,
      kind: 'storage',
      areaId: view.kitchen.areas.cold.id,
      deciC: 45,
    });
    await view.t.useCases['temperatures.record']({
      commandId: view.t.cmd(),
      businessId: view.t.businessId,
      kind: 'storage',
      areaId: view.kitchen.areas.cold.id,
      deciC: 75,
      action: 'Tür war offen.',
    });
    const table = await screen.findByRole('table', { name: t.temperatures.table.caption });
    const [newest, oldest, ...rest] = within(table).getAllByRole('row').slice(1);
    expect(rest).toHaveLength(0);
    expect(newest && within(newest).getByText(t.results.out)).toBeTruthy();
    expect(oldest && within(oldest).getByText(t.results.ok)).toBeTruthy();
    expect(newest && within(newest).getByText('Tür war offen.')).toBeTruthy();
  });

  it('shows the empty state for a period without readings', async () => {
    await renderHistory();
    expect(await screen.findByText(t.temperatures.empty)).toBeTruthy();
  });

  it('opens a reading in a sheet and removes a reading of today after asking', async () => {
    const view = await renderHistory();
    const { logId } = await view.t.useCases['temperatures.record']({
      commandId: view.t.cmd(),
      businessId: view.t.businessId,
      kind: 'storage',
      areaId: view.kitchen.areas.cold.id,
      deciC: 45,
    });
    const table = await screen.findByRole('table', { name: t.temperatures.table.caption });
    const row = within(table).getAllByRole('row')[1];
    if (row === undefined) {
      throw new Error('the table has a row of the reading');
    }
    await view.user.click(row);
    const sheet = await screen.findByRole('dialog', { name: t.temperatures.detail.title });
    expect(within(sheet).getByText('4.5 °C')).toBeTruthy();
    await view.user.click(
      within(sheet).getByRole('button', { name: t.temperatures.detail.remove }),
    );
    const asking = await screen.findByRole('alertdialog', {
      name: t.temperatures.detail.removeTitle,
    });
    await view.user.click(
      within(asking).getByRole('button', { name: t.temperatures.detail.remove }),
    );
    await waitFor(async () => {
      const [row] = await view.t.storage.temperatureLogs.ofBusiness(view.t.businessId);
      expect(row?.deletedAt).toBeDefined();
    });
    expect(logId).toBeDefined();
  });

  it('says that a reading of an earlier day cannot be removed', async () => {
    const view = await renderHistory();
    const now = view.t.clock.now();
    const logId = view.t.ids.next();
    await view.t.storage.temperatureLogs.add(
      TemperatureLogSchema.parse({
        id: logId,
        businessId: view.t.businessId,
        createdAt: now,
        updatedAt: now,
        kind: 'storage',
        areaId: view.kitchen.areas.cold.id,
        deciC: 45,
        minDeciC: 0,
        maxDeciC: 50,
        ok: true,
        on: '2026-11-13',
        measuredAt: '2026-11-13T07:30:00.000Z',
        measuredBy: view.t.actor,
      }),
    );
    await view.router.navigate(`${paths.temperatures()}?messung=${logId}`);
    const sheet = await screen.findByRole('dialog', { name: t.temperatures.detail.title });
    expect(within(sheet).getByText(t.temperatures.detail.notRemovable)).toBeTruthy();
    expect(within(sheet).queryByRole('button', { name: t.temperatures.detail.remove })).toBeNull();
  });

  it('shows the chart of each area only in the detailed view', async () => {
    const view = await renderHistory();
    await view.t.useCases['temperatures.record']({
      commandId: view.t.cmd(),
      businessId: view.t.businessId,
      kind: 'storage',
      areaId: view.kitchen.areas.cold.id,
      deciC: 45,
    });
    expect(
      await screen.findByRole('heading', { name: t.temperatures.chart.title('Kühlzelle') }),
    ).toBeTruthy();
    writeDetailed(false);
    await view.router.navigate(paths.temperatures());
    await waitFor(() => {
      expect(
        screen.queryByRole('heading', { name: t.temperatures.chart.title('Kühlzelle') }),
      ).toBeNull();
    });
    // The log stays: the essentials keep the readings.
    expect(screen.getByRole('table', { name: t.temperatures.table.caption })).toBeTruthy();
  });
});
