import type { RouteObject } from 'react-router';

/**
 * Pages of «Selbstkontrolle» inside the app frame, each loaded when it is first opened. The path
 * patterns are those of `app/paths.ts`. The function is always there (it is the core, ADR-0015).
 */
export const haccpRoutes: RouteObject[] = [
  {
    path: 'haccp',
    lazy: async () => ({ Component: (await import('./HaccpPage')).HaccpPage }),
  },
  {
    path: 'haccp/temperatures',
    lazy: async () => ({ Component: (await import('./TemperaturesPage')).TemperaturesPage }),
  },
  {
    path: 'haccp/tasks',
    lazy: async () => ({ Component: (await import('./TasksPage')).TasksPage }),
  },
  {
    path: 'haccp/report',
    lazy: async () => ({ Component: (await import('./ReportPage')).ReportPage }),
  },
];
