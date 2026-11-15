import type { RouteObject } from 'react-router';

/** Pages of «Speisekarte» inside the app frame, loaded when first opened. */
export const menuRoutes: RouteObject[] = [
  {
    path: 'menu',
    lazy: async () => ({ Component: (await import('./MenuPage')).MenuPage }),
  },
  {
    path: 'menu/:cardId',
    lazy: async () => ({ Component: (await import('./MenuCardPage')).MenuCardPage }),
  },
  {
    path: 'menu/:cardId/allergens',
    lazy: async () => ({ Component: (await import('./MenuAllergensPage')).MenuAllergensPage }),
  },
];

/** The guest view: outside the app frame, full screen, for the table, the phone or the counter. */
export const guestRoutes: RouteObject[] = [
  {
    path: 'guest/:cardId',
    lazy: async () => ({ Component: (await import('./GuestPage')).GuestPage }),
  },
];
