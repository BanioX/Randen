import type { RouteObject } from 'react-router';

/** The style guide: every building block of the UI kit on one page. */
export const styleguideRoutes: RouteObject[] = [
  {
    path: 'styleguide',
    lazy: async () => ({ Component: (await import('./StyleguidePage')).StyleguidePage }),
  },
];
