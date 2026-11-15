import type { RouteObject } from 'react-router';
import { messages } from '../../app/messages';
import { PlaceholderPage } from '../placeholder/PlaceholderPage';

/** Pages of «Betrieb» under /more. The settings module adds business, team and data. */
export const settingsRoutes: RouteObject[] = [
  {
    path: 'more',
    lazy: async () => ({ Component: (await import('./MorePage')).MorePage }),
  },
  {
    path: 'setup',
    lazy: async () => ({ Component: (await import('./SetupPage')).SetupPage }),
  },
  {
    path: 'more/features',
    lazy: async () => ({ Component: (await import('./FeaturesPage')).FeaturesPage }),
  },
  { path: 'more/*', element: <PlaceholderPage title={messages.nav.business} /> },
];
