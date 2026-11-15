import type { RouteObject } from 'react-router';
import { messages } from '../../app/messages';
import { PlaceholderPage } from '../placeholder/PlaceholderPage';

/** Pages of «Produktion» and «Menüplan» inside the app frame, loaded when first opened. */
export const productionRoutes: RouteObject[] = [
  {
    path: 'production',
    lazy: async () => ({ Component: (await import('./ProductionPage')).ProductionPage }),
  },
  {
    path: 'production/new',
    lazy: async () => ({ Component: (await import('./ProductionNewPage')).ProductionNewPage }),
  },
  {
    path: 'production/:productionId',
    lazy: async () => ({ Component: (await import('./ProductionRunPage')).ProductionRunPage }),
  },
  {
    path: 'plan',
    lazy: async () => ({ Component: (await import('./PlanPage')).PlanPage }),
  },
  // Deliveries to satellites and events (ADR-0015): its own module once it is built.
  { path: 'dispatch/*', element: <PlaceholderPage title={messages.nav.dispatch} /> },
];
