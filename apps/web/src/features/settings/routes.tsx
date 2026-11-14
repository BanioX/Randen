import type { RouteObject } from 'react-router';
import { messages } from '../../app/messages';
import { PlaceholderPage } from '../placeholder/PlaceholderPage';

/** Pages of «settings» inside the app frame. The module replaces this placeholder. */
export const settingsRoutes: RouteObject[] = [
  { path: 'more/*', element: <PlaceholderPage title={messages.nav.more} /> },
];
