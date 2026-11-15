import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { writeDetailed } from '../../app/view';
import { paths } from '../../app/paths';
import { renderApp } from '../../app/test-helpers';
import { ToastProvider } from '../../ui/Toast';
import { PlanPage } from './PlanPage';
import { productionMessages } from './messages';

const t = productionMessages;
const SLOW = 20_000;

async function renderPlan() {
  const view = await renderApp(<PlanPage />, { route: paths.plan(), path: '/plan' });
  await screen.findByRole('heading', { level: 1, name: t.plan.title });
  return view;
}

/** The column of a day, found by its weekday and day of the month. */
async function dayColumn(name: RegExp) {
  return screen.findByRole('article', { name });
}

describe('PlanPage', () => {
  afterEach(() => {
    writeDetailed(true);
  });

  it(
    'shows the week of today with its dishes, and «Reste verwerten» with what the salmon saves',
    async () => {
      const view = await renderPlan();
      await view.t.useCases['plan.add']({
        commandId: view.t.cmd(),
        businessId: view.t.businessId,
        date: '2026-11-14',
        slot: 'lunch',
        recipeId: view.kitchen.recipes.salmonDish.id,
        portions: 4,
      });
      const saturday = await dayColumn(/Sa 14\.11\./);
      expect(within(saturday).getByText('Lachs mit Rahmsauce')).toBeTruthy();
      expect(screen.getByText(new RegExp(`^${t.plan.week(46)}`))).toBeTruthy();
      expect(
        await screen.findByText(/verwertet 1\.44 kg Lachsfilet, läuft morgen ab, CHF 54\.72/),
      ).toBeTruthy();
      // The salmon is on the plan already: the suggestion says so.
      expect(screen.getAllByRole('button', { name: t.suggest.planned }).length).toBeGreaterThan(0);
    },
    SLOW,
  );

  it(
    'puts a suggestion on its proposed day with one press',
    async () => {
      const view = await renderPlan();
      await screen.findByText(/verwertet 1\.44 kg Lachsfilet/);
      // Several suggestions name the salmon; the first is the one that saves the most.
      const first = (await screen.findAllByRole('button', { name: t.suggest.add }))[0];
      if (first === undefined) {
        throw new Error('no suggestion to plan');
      }
      await view.user.click(first);
      await screen.findAllByRole('button', { name: t.suggest.planned });
      const entries = await view.t.storage.planEntries.ofBusiness(view.t.businessId);
      expect(entries).toEqual([
        expect.objectContaining({ date: '2026-11-14', slot: 'lunch', portions: 9 }),
      ]);
    },
    SLOW,
  );

  it(
    'fills the empty meals of the week after a confirm and shows what it planned',
    async () => {
      const view = await renderPlan();
      // The buttons of the week wait for the week to load.
      await dayColumn(/Sa 14\.11\./);
      await view.user.click(await screen.findByRole('button', { name: t.plan.fill }));
      await screen.findByText(t.fill.text);
      const buttons = await screen.findAllByRole('button', { name: t.fill.action });
      const confirm = buttons[buttons.length - 1];
      if (confirm === undefined) {
        throw new Error('no confirm button');
      }
      await view.user.click(confirm);
      const result = await screen.findByRole('dialog', { name: t.fill.resultTitle });
      // Salmon today, then the best dish by margin for tomorrow's lunch.
      expect(within(result).getByText(t.fill.resultCount(2, 0))).toBeTruthy();
      expect(
        within(result).getByText(/verwertet 1\.44 kg Lachsfilet, läuft am 15\.11\.2026 ab/),
      ).toBeTruthy();
      // Every day of the result in Swiss form, none as the ISO day of the store.
      expect(result.textContent).toMatch(/\d{2}\.11\.2026 · /);
      expect(result.textContent).not.toMatch(/\d{4}-\d{2}-\d{2}/);
      const entries = await view.t.storage.planEntries.ofBusiness(view.t.businessId);
      expect(entries).toHaveLength(2);
    },
    SLOW,
  );

  it(
    'plans a dish through the sheet on the day chosen',
    async () => {
      const view = await renderPlan();
      await view.user.click(await screen.findByRole('button', { name: t.plan.add }));
      const dialog = await screen.findByRole('dialog', { name: t.add.title });
      await view.user.click(within(dialog).getByLabelText(t.add.recipe));
      await view.user.type(within(dialog).getByLabelText(t.add.recipe), 'Entrecôte');
      await view.user.click(await screen.findByRole('option', { name: /^Entrecôte/ }));
      await view.user.click(within(dialog).getByRole('button', { name: t.add.action }));
      const column = await dayColumn(/Sa 14\.11\./);
      expect(
        await within(column).findByText('Entrecôte mit Rotweinjus und Kartoffelstock'),
      ).toBeTruthy();
      expect(await view.t.storage.planEntries.ofBusiness(view.t.businessId)).toHaveLength(1);
    },
    SLOW,
  );

  it(
    'changes the portions of an entry on its sheet',
    async () => {
      const view = await renderPlan();
      await view.t.useCases['plan.add']({
        commandId: view.t.cmd(),
        businessId: view.t.businessId,
        date: '2026-11-14',
        slot: 'lunch',
        recipeId: view.kitchen.recipes.salmonDish.id,
        portions: 4,
      });
      const column = await dayColumn(/Sa 14\.11\./);
      await view.user.click(
        await within(column).findByRole('button', { name: /Lachs mit Rahmsauce/ }),
      );
      const dialog = await screen.findByRole('dialog', { name: 'Lachs mit Rahmsauce' });
      await view.user.click(
        within(dialog).getByRole('button', { name: t.newPage.portionsMore(t.entry.portions) }),
      );
      await view.user.click(within(dialog).getByRole('button', { name: t.entry.save }));
      await screen.findByRole('status').catch(() => undefined);
      const entries = await view.t.storage.planEntries.ofBusiness(view.t.businessId);
      expect(entries[0]?.portions).toBe(5);
    },
    SLOW,
  );

  it(
    'adds a menu line and shows it in the list of the lines',
    async () => {
      const view = await renderPlan();
      await view.user.click(await screen.findByRole('button', { name: t.plan.lines }));
      const dialog = await screen.findByRole('dialog', { name: t.lines.title });
      await view.user.type(within(dialog).getByLabelText(t.lines.name), 'Menü 1');
      await view.user.click(within(dialog).getByRole('button', { name: t.lines.add }));
      expect(await within(dialog).findByText('Menü 1')).toBeTruthy();
      expect(await view.t.storage.menuLines.ofBusiness(view.t.businessId)).toHaveLength(1);
    },
    SLOW,
  );

  it(
    'weighs a plate return and shows it in grams',
    async () => {
      const view = await renderPlan();
      await view.user.click(await screen.findByRole('button', { name: t.weighings.add }));
      const dialog = await screen.findByRole('dialog', { name: t.weighings.add });
      await view.user.type(within(dialog).getByLabelText(t.weighings.grams), '4200');
      await view.user.click(within(dialog).getByRole('button', { name: t.weighings.action }));
      expect(await screen.findByText('4.2 kg')).toBeTruthy();
      expect(await view.t.storage.wasteWeighings.ofBusiness(view.t.businessId)).toHaveLength(1);
    },
    SLOW,
  );

  it(
    'shows the revenue and the cost of a day only under «Erweitert»',
    async () => {
      writeDetailed(false);
      const view = await renderPlan();
      await view.t.useCases['plan.add']({
        commandId: view.t.cmd(),
        businessId: view.t.businessId,
        date: '2026-11-14',
        slot: 'lunch',
        recipeId: view.kitchen.recipes.salmonDish.id,
        portions: 4,
      });
      const saturday = await dayColumn(/Sa 14\.11\./);
      expect(within(saturday).getAllByText(t.plan.entryMeta(4)).length).toBeGreaterThan(0);
      expect(within(saturday).queryByText(/Wareneinsatz/)).toBeNull();
      writeDetailed(true);
      expect(await within(saturday).findByText(/Wareneinsatz CHF 26\.80/)).toBeTruthy();
    },
    SLOW,
  );

  it(
    'shows the margin of a planned dish only under «Erweitert»',
    async () => {
      writeDetailed(false);
      const view = await renderPlan();
      await view.t.useCases['plan.add']({
        commandId: view.t.cmd(),
        businessId: view.t.businessId,
        date: '2026-11-14',
        slot: 'lunch',
        recipeId: view.kitchen.recipes.salmonDish.id,
        portions: 4,
      });
      const margin = /im Ziel|knapp über dem Ziel|über dem Ziel/;
      const saturday = await dayColumn(/Sa 14\.11\./);
      expect(within(saturday).getAllByText(t.plan.entryMeta(4)).length).toBeGreaterThan(0);
      expect(within(saturday).queryByText(margin)).toBeNull();
      writeDetailed(true);
      expect(await within(saturday).findByText(margin)).toBeTruthy();
    },
    SLOW,
  );
});

describe('PlanPage with the functions of the business', () => {
  it(
    'offers the way to the purchasing only when the business orders or buys at the market',
    async () => {
      const view = await renderPlan();
      expect(await screen.findByRole('link', { name: t.demand.link })).toBeTruthy();
      await view.t.useCases['business.update']({
        commandId: view.t.cmd(),
        businessId: view.t.businessId,
        modules: ['planning'],
      });
      await waitFor(() => {
        expect(screen.queryByRole('link', { name: t.demand.link })).toBeNull();
      });
      await view.t.useCases['business.update']({
        commandId: view.t.cmd(),
        businessId: view.t.businessId,
        modules: ['planning', 'market'],
      });
      expect(await screen.findByRole('link', { name: t.demand.link })).toBeTruthy();
    },
    SLOW,
  );
});

describe('PlanPage without the planning', () => {
  it(
    'shows no way to add a dish to a day',
    async () => {
      const view = await renderPlan();
      await dayColumn(/Sa 14\.11\./);
      expect(screen.getAllByRole('button', { name: /^Gericht am / })).toHaveLength(7);
      await view.t.useCases['business.update']({
        commandId: view.t.cmd(),
        businessId: view.t.businessId,
        modules: ['production', 'ordering'],
      });
      await waitFor(() => {
        expect(screen.queryAllByRole('button', { name: /^Gericht am / })).toHaveLength(0);
      });
    },
    SLOW,
  );

  it(
    'shows the entries as text, they cannot be opened',
    async () => {
      const view = await renderPlan();
      await view.t.useCases['plan.add']({
        commandId: view.t.cmd(),
        businessId: view.t.businessId,
        date: '2026-11-14',
        slot: 'lunch',
        recipeId: view.kitchen.recipes.salmonDish.id,
        portions: 4,
      });
      const saturday = await dayColumn(/Sa 14\.11\./);
      expect(
        await within(saturday).findByRole('button', { name: /Lachs mit Rahmsauce/ }),
      ).toBeTruthy();
      await view.t.useCases['business.update']({
        commandId: view.t.cmd(),
        businessId: view.t.businessId,
        modules: ['production', 'ordering'],
      });
      await waitFor(() => {
        expect(within(saturday).queryByRole('button', { name: /Lachs mit Rahmsauce/ })).toBeNull();
      });
      expect(within(saturday).getByText('Lachs mit Rahmsauce')).toBeTruthy();
    },
    SLOW,
  );
});

describe('PlanPage under «Erweitert»', () => {
  afterEach(() => {
    writeDetailed(true);
  });

  it(
    'names the margin and the saving of an auto fill only in the detailed view',
    async () => {
      const view = await renderPlan();
      // The functions are set, so only the view («Erweitert») changes below.
      await view.t.useCases['business.update']({
        commandId: view.t.cmd(),
        businessId: view.t.businessId,
        modules: ['planning', 'ordering'],
      });
      writeDetailed(false);
      await dayColumn(/Sa 14\.11\./);
      await view.user.click(await screen.findByRole('button', { name: t.plan.fill }));
      await screen.findByText(t.fill.text);
      const buttons = await screen.findAllByRole('button', { name: t.fill.action });
      const confirm = buttons[buttons.length - 1];
      if (confirm === undefined) {
        throw new Error('no confirm button');
      }
      await view.user.click(confirm);
      const result = await screen.findByRole('dialog', { name: t.fill.resultTitle });
      expect(
        within(result).getByText(/verwertet 1\.44 kg Lachsfilet, läuft am 15\.11\.2026 ab/),
      ).toBeTruthy();
      expect(within(result).getByText(/in 28 Tagen/)).toBeTruthy();
      expect(result.textContent).not.toMatch(/Marge|CHF/);
      writeDetailed(true);
      expect(await within(result).findByText(/CHF 54\.72/)).toBeTruthy();
      expect(result.textContent).toMatch(/Marge/);
    },
    SLOW,
  );
});

describe('PlanPage, the words of the days', () => {
  it(
    'names the add button of a day with the Swiss date',
    async () => {
      await renderPlan();
      expect(
        await screen.findByRole('button', { name: 'Gericht am 14.11.2026 einplanen' }),
      ).toBeTruthy();
      expect(screen.queryByRole('button', { name: /2026-11-/ })).toBeNull();
    },
    SLOW,
  );
});

describe('PlanPage, copying a week', () => {
  it(
    'does not offer to copy an empty week, and says why',
    async () => {
      const view = await renderPlan();
      expect(await screen.findByText(t.copy.empty)).toBeTruthy();
      expect(screen.getByRole('button', { name: t.plan.copy }).hasAttribute('disabled')).toBe(true);
      await view.t.useCases['plan.add']({
        commandId: view.t.cmd(),
        businessId: view.t.businessId,
        date: '2026-11-14',
        slot: 'lunch',
        recipeId: view.kitchen.recipes.salmonDish.id,
        portions: 4,
      });
      await waitFor(() => {
        expect(screen.getByRole('button', { name: t.plan.copy }).hasAttribute('disabled')).toBe(
          false,
        );
      });
      expect(screen.queryByText(t.copy.empty)).toBeNull();
    },
    SLOW,
  );
});

describe('PlanPage, copying a week with a dish that left the menu', () => {
  it(
    'copies what may be copied and says how many entries it skipped',
    async () => {
      const view = await renderApp(
        <ToastProvider>
          <PlanPage />
        </ToastProvider>,
        { route: paths.plan(), path: '/plan' },
      );
      await screen.findByRole('heading', { level: 1, name: t.plan.title });
      await view.t.useCases['plan.add']({
        commandId: view.t.cmd(),
        businessId: view.t.businessId,
        date: '2026-11-14',
        slot: 'lunch',
        recipeId: view.kitchen.recipes.salmonDish.id,
        portions: 4,
      });
      // The dish leaves the menu after its entry came in: the copy does not take it along.
      await view.t.storage.recipes.put({ ...view.kitchen.recipes.salmonDish, active: false });
      await view.user.click(await screen.findByRole('button', { name: t.plan.copy }));
      await view.user.click(await screen.findByRole('button', { name: t.copy.action }));
      expect(await screen.findByText(/0 Einträge kopiert\. 1 Eintrag übersprungen/)).toBeTruthy();
      expect(await view.t.storage.planEntries.ofBusiness(view.t.businessId)).toHaveLength(1);
    },
    SLOW,
  );
});

describe('PlanPage, a double tap on «Einplanen»', () => {
  it(
    'plans the dish once',
    async () => {
      const view = await renderPlan();
      await view.user.click(await screen.findByRole('button', { name: t.plan.add }));
      const dialog = await screen.findByRole('dialog', { name: t.add.title });
      await view.user.click(within(dialog).getByLabelText(t.add.recipe));
      await view.user.type(within(dialog).getByLabelText(t.add.recipe), 'Entrecôte');
      await view.user.click(await screen.findByRole('option', { name: /^Entrecôte/ }));
      const action = within(dialog).getByRole('button', { name: t.add.action });
      // Two taps before the first command has come back.
      fireEvent.click(action);
      fireEvent.click(action);
      await waitFor(async () => {
        expect(await view.t.storage.planEntries.ofBusiness(view.t.businessId)).toHaveLength(1);
      });
      // A second command would land a little later: give it the time, then count again.
      await act(async () => {
        await new Promise((resolve) => {
          setTimeout(resolve, 200);
        });
      });
      expect(await view.t.storage.planEntries.ofBusiness(view.t.businessId)).toHaveLength(1);
    },
    SLOW,
  );
});

describe('PlanPage, a double tap on a weighing', () => {
  it(
    'writes the weighing once',
    async () => {
      const view = await renderPlan();
      await view.user.click(await screen.findByRole('button', { name: t.weighings.add }));
      const dialog = await screen.findByRole('dialog', { name: t.weighings.add });
      await view.user.type(within(dialog).getByLabelText(t.weighings.grams), '4200');
      const action = within(dialog).getByRole('button', { name: t.weighings.action });
      fireEvent.click(action);
      fireEvent.click(action);
      await waitFor(async () => {
        expect(await view.t.storage.wasteWeighings.ofBusiness(view.t.businessId)).toHaveLength(1);
      });
      await act(async () => {
        await new Promise((resolve) => {
          setTimeout(resolve, 200);
        });
      });
      expect(await view.t.storage.wasteWeighings.ofBusiness(view.t.businessId)).toHaveLength(1);
    },
    SLOW,
  );
});

describe('PlanPage, a double tap on a suggestion', () => {
  it(
    'plans the suggested dish once',
    async () => {
      const view = await renderPlan();
      await screen.findByText(/verwertet 1\.44 kg Lachsfilet/);
      const first = (await screen.findAllByRole('button', { name: t.suggest.add }))[0];
      if (first === undefined) {
        throw new Error('no suggestion to plan');
      }
      fireEvent.click(first);
      fireEvent.click(first);
      await waitFor(async () => {
        expect(await view.t.storage.planEntries.ofBusiness(view.t.businessId)).toHaveLength(1);
      });
      await act(async () => {
        await new Promise((resolve) => {
          setTimeout(resolve, 200);
        });
      });
      expect(await view.t.storage.planEntries.ofBusiness(view.t.businessId)).toHaveLength(1);
    },
    SLOW,
  );
});
