import type { RouteObject } from 'react-router';
import { messages } from '../../app/messages';
import { PlaceholderPage } from '../placeholder/PlaceholderPage';

/** Pages of «purchasing» inside the app frame. The module replaces this placeholder. */
export const purchasingRoutes: RouteObject[] = [
  { path: 'purchasing/*', element: <PlaceholderPage title={messages.nav.purchasing} /> },
];
