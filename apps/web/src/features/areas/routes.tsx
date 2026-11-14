import type { RouteObject } from 'react-router';
import { messages } from '../../app/messages';
import { PlaceholderPage } from '../placeholder/PlaceholderPage';

/** Pages of «areas» inside the app frame. The module replaces this placeholder. */
export const areasRoutes: RouteObject[] = [
  { path: 'areas/*', element: <PlaceholderPage title={messages.nav.areas} /> },
];
