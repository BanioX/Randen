import type { RouteObject } from 'react-router';
import { messages } from '../../app/messages';
import { PlaceholderPage } from '../placeholder/PlaceholderPage';

/** Pages of «menu» inside the app frame. The module replaces this placeholder. */
export const menuRoutes: RouteObject[] = [
  { path: 'menu/*', element: <PlaceholderPage title={messages.nav.menu} /> },
];

/** Pages outside the app frame: the guest view of a menu card, full screen. */
export const guestRoutes: RouteObject[] = [];
