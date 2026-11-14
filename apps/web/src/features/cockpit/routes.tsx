import type { RouteObject } from 'react-router';
import { messages } from '../../app/messages';
import { PlaceholderPage } from '../placeholder/PlaceholderPage';

/** Pages of «cockpit» inside the app frame. The module replaces this placeholder. */
export const cockpitRoutes: RouteObject[] = [
  { index: true, element: <PlaceholderPage title={messages.nav.cockpit} /> },
  { path: 'add', element: <PlaceholderPage title={messages.nav.add} /> },
];
