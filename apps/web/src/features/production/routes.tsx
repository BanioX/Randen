import type { RouteObject } from 'react-router';
import { messages } from '../../app/messages';
import { PlaceholderPage } from '../placeholder/PlaceholderPage';

/** Pages of «production» inside the app frame. The module replaces this placeholder. */
export const productionRoutes: RouteObject[] = [
  { path: 'production/*', element: <PlaceholderPage title={messages.nav.production} /> },
  { path: 'plan/*', element: <PlaceholderPage title={messages.nav.plan} /> },
];
