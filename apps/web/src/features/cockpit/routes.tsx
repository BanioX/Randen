import type { RouteObject } from 'react-router';
import { CockpitPage } from './CockpitPage';

/**
 * Pages of «Cockpit» inside the app frame. The cockpit is the first screen and loads with the
 * app; «Erfassen» loads when it is first opened. The path patterns are those of `app/paths.ts`.
 */
export const cockpitRoutes: RouteObject[] = [
  { index: true, element: <CockpitPage /> },
  {
    path: 'add',
    lazy: async () => ({ Component: (await import('./AddPage')).AddPage }),
  },
];
