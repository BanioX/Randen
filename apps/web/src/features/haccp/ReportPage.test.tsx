import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../app/test-helpers';
import { paths } from '../../app/paths';
import { writeDetailed } from '../../app/view';
import { ReportPage } from './ReportPage';
import { haccpMessages as t } from './messages';

afterEach(() => {
  writeDetailed(true);
  vi.restoreAllMocks();
});

async function renderReport(route = paths.haccpReport()) {
  return renderApp(<ReportPage />, { route, path: paths.haccpReport() });
}

describe('ReportPage', () => {
  it('answers in one sentence, then lists the days, the deviations and the people behind the initials', async () => {
    const view = await renderReport();
    await view.t.useCases['temperatures.record']({
      commandId: view.t.cmd(),
      businessId: view.t.businessId,
      kind: 'storage',
      areaId: view.kitchen.areas.cold.id,
      deciC: 75,
      action: 'Tür war offen.',
    });
    // Saturday 14.11.: the week is 9.11. to 15.11., and 9. to 13.11. have no measurement.
    expect(await screen.findByText(t.report.summary(1, 1, 5), { exact: false })).toBeTruthy();
    expect(screen.getByText(t.report.disclaimer)).toBeTruthy();
    const storage = screen.getByRole('table', { name: t.report.storage.title });
    expect(within(storage).getAllByRole('row')).toHaveLength(8);
    expect(within(storage).getByText(t.report.storage.out(1), { exact: false })).toBeTruthy();
    expect(screen.getAllByText('Sa 14.11.').length).toBeGreaterThan(0);
    expect(screen.getByText(t.report.deviations.action('Tür war offen.'))).toBeTruthy();
    expect(screen.getByText(t.report.people.line('TE', 'Testperson'))).toBeTruthy();
    expect(
      screen.getByText(
        t.report.missing.text('09.11.2026, 10.11.2026, 11.11.2026, 12.11.2026, 13.11.2026'),
      ),
    ).toBeTruthy();
  });

  it('switches the period in the address: last week has no measurement', async () => {
    const view = await renderReport();
    await view.user.click(await screen.findByRole('radio', { name: t.report.periods.lastWeek }));
    await waitFor(() => {
      expect(view.router.state.location.search).toBe('?zeitraum=lastWeek');
    });
    expect(await screen.findByText(t.report.summary(0, 0, 7), { exact: false })).toBeTruthy();
    // The period is in the header and in the print view: both say it.
    expect(screen.getAllByText(t.report.period('02.11.2026', '08.11.2026')).length).toBeGreaterThan(
      0,
    );
    expect(
      screen.getByText(
        t.report.missing.text(
          '02.11.2026, 03.11.2026, 04.11.2026, 05.11.2026, 06.11.2026, 07.11.2026, 08.11.2026',
        ),
      ),
    ).toBeTruthy();
  });

  it('covers the whole month for «Dieser Monat» and leaves out the days to come', async () => {
    const view = await renderReport();
    await view.user.click(await screen.findByRole('radio', { name: t.report.periods.thisMonth }));
    expect(
      (await screen.findAllByText(t.report.period('01.11.2026', '30.11.2026'))).length,
    ).toBeGreaterThan(0);
    // Only the days up to today count as missing: 1. to 13. November, since 14. is today and has none either.
    expect(screen.getByText(t.report.summary(0, 0, 14), { exact: false })).toBeTruthy();
    expect(view.kitchen.areas.cold).toBeDefined();
  });

  it('prints the report with the window print of the device', async () => {
    const view = await renderReport();
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    await view.user.click(await screen.findByRole('button', { name: t.report.print }));
    expect(print).toHaveBeenCalledTimes(1);
  });

  it('shows a calm sentence for a period with no task and no receipt', async () => {
    await renderReport();
    expect(await screen.findByText(t.report.tasks.empty)).toBeTruthy();
    expect(screen.getByText(t.report.receipts.empty)).toBeTruthy();
    expect(screen.getByText(t.report.summaryReceipts(0, 0))).toBeTruthy();
  });

  it('keeps the reading when the device shows the detailed view again', async () => {
    writeDetailed(true);
    await renderReport();
    expect(await screen.findByRole('heading', { level: 1, name: t.report.title })).toBeTruthy();
  });
});
