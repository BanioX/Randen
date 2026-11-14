import { createBrowserRouter, type RouteObject } from 'react-router';
import { areasRoutes } from '../features/areas/routes';
import { articlesRoutes } from '../features/articles/routes';
import { cockpitRoutes } from '../features/cockpit/routes';
import { demoRoutes } from '../features/demo/routes';
import { haccpRoutes } from '../features/haccp/routes';
import { guestRoutes, menuRoutes } from '../features/menu/routes';
import { numbersRoutes } from '../features/numbers/routes';
import { productionRoutes } from '../features/production/routes';
import { purchasingRoutes } from '../features/purchasing/routes';
import { recipesRoutes } from '../features/recipes/routes';
import { salesRoutes } from '../features/sales/routes';
import { settingsRoutes } from '../features/settings/routes';
import { stockRoutes } from '../features/stock/routes';
import { styleguideRoutes } from '../features/styleguide/routes';
import { AppShell } from './AppShell';
import { NotFoundPage } from './NotFoundPage';
import { RouteError } from './RouteError';

/**
 * All pages. Each feature owns its part (`features/<name>/routes.tsx`); this file only puts
 * them into the app frame. Pages other than the cockpit should load lazily (`lazy`), so the
 * first screen stays small and the service worker caches the rest for offline use.
 */
export const routes: RouteObject[] = [
  {
    path: '/',
    element: <AppShell />,
    errorElement: <RouteError />,
    children: [
      ...cockpitRoutes,
      ...stockRoutes,
      ...articlesRoutes,
      ...areasRoutes,
      ...recipesRoutes,
      ...productionRoutes,
      ...menuRoutes,
      ...purchasingRoutes,
      ...salesRoutes,
      ...numbersRoutes,
      ...haccpRoutes,
      ...demoRoutes,
      ...settingsRoutes,
      ...styleguideRoutes,
      { path: '*', element: <NotFoundPage /> },
    ],
  },
  ...guestRoutes.map((route) => ({ errorElement: <RouteError />, ...route })),
];

export function createAppRouter() {
  return createBrowserRouter(routes);
}
