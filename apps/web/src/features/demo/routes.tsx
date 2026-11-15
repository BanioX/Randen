import type { RouteObject } from 'react-router';

/** The demo business inside the app frame («Mehr» › «Demo-Betrieb»), loaded when first opened. */
export const demoRoutes: RouteObject[] = [
  {
    path: 'more/demo',
    lazy: async () => ({ Component: (await import('./DemoPage')).DemoPage }),
  },
];
