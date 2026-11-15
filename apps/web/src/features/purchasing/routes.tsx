import type { RouteObject } from 'react-router';

/**
 * Pages of «Einkauf» inside the app frame, each loaded when first opened. «Einkauf erfassen» is
 * a view of the first page (`?view=record`); the path patterns are those of `app/paths.ts`.
 */
export const purchasingRoutes: RouteObject[] = [
  {
    path: 'purchasing',
    lazy: async () => ({ Component: (await import('./PurchasingPage')).PurchasingPage }),
  },
  {
    path: 'purchasing/orders',
    lazy: async () => ({ Component: (await import('./OrdersPage')).OrdersPage }),
  },
  {
    path: 'purchasing/orders/:orderId',
    lazy: async () => ({ Component: (await import('./OrderPage')).OrderPage }),
  },
];
