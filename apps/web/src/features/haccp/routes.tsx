import type { RouteObject } from 'react-router';
import { messages } from '../../app/messages';
import { PlaceholderPage } from '../placeholder/PlaceholderPage';

/** Pages of «haccp» inside the app frame. The module replaces this placeholder. */
export const haccpRoutes: RouteObject[] = [
  { path: 'haccp/*', element: <PlaceholderPage title={messages.nav.haccp} /> },
];
