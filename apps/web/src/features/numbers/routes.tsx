import type { RouteObject } from 'react-router';

/**
 * Pages of «Zahlen» inside the app frame: the overview, the budget of a month, the break-even,
 * the write-offs and the month report. They load when first opened; the path patterns are those
 * of `app/paths.ts`. The sales pages (`/numbers/sales`, margins, menu engineering) belong to the
 * sales function.
 */
export const numbersRoutes: RouteObject[] = [
  {
    path: 'numbers',
    lazy: async () => ({ Component: (await import('./NumbersPage')).NumbersPage }),
  },
  {
    path: 'numbers/budget',
    lazy: async () => ({ Component: (await import('./BudgetPage')).BudgetPage }),
  },
  {
    path: 'numbers/break-even',
    lazy: async () => ({ Component: (await import('./BreakEvenPage')).BreakEvenPage }),
  },
  {
    path: 'numbers/waste',
    lazy: async () => ({ Component: (await import('./WastePage')).WastePage }),
  },
  {
    path: 'numbers/report',
    lazy: async () => ({ Component: (await import('./MonthReportPage')).MonthReportPage }),
  },
];
