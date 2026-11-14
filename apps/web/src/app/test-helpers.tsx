import {
  createTestContext,
  seedKitchen,
  type Kitchen,
  type TestContext,
} from '@randen/core/testing';
import { render, type RenderResult } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router';
import { RandenDb } from '../data/db';
import { dexieStorage } from '../data/dexie-storage';
import { AppDataProvider } from './AppData';

export interface AppView extends RenderResult {
  /** The test context on the page's own database: storage, fixed clock, ids, use cases. */
  t: TestContext;
  /** The seeded test kitchen (see `seedKitchen` in @randen/core/testing for every value). */
  kitchen: Kitchen;
  user: UserEvent;
  router: ReturnType<typeof createMemoryRouter>;
}

interface RenderOptions {
  /** Where the app is opened, e.g. `/stock`. Default `/`. */
  route?: string;
  /** The route pattern `element` is mounted at, e.g. `/recipes/:recipeId`. Default: any path. */
  path?: string;
  /** Further routes, so links and redirects of the page under test have a target. */
  routes?: RouteObject[];
  /** The Swiss calendar day the test runs on. Default 14.11.2026. */
  today?: string;
}

/**
 * Renders a page as the app does: inside the app data provider on a fresh IndexedDB (fake) that
 * already holds the test kitchen, with a fixed clock and a memory router. Wait for content with
 * `findBy…`: the provider opens the database first.
 */
export async function renderApp(
  element: ReactElement,
  options: RenderOptions = {},
): Promise<AppView> {
  const db = new RandenDb(`test-${crypto.randomUUID()}`);
  const t = await createTestContext({
    storage: dexieStorage(db),
    ...(options.today === undefined ? {} : { today: options.today }),
  });
  const kitchen = await seedKitchen(t);
  const router = createMemoryRouter(
    [{ path: options.path ?? '*', element }, ...(options.routes ?? [])],
    { initialEntries: [options.route ?? '/'] },
  );
  const view = render(
    <AppDataProvider db={db} clock={t.clock} ids={t.ids}>
      <RouterProvider router={router} />
    </AppDataProvider>,
  );
  return { ...view, t, kitchen, user: userEvent.setup(), router };
}
