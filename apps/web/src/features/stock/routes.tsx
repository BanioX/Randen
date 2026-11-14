import type { RouteObject } from 'react-router';
import { messages } from '../../app/messages';
import { PlaceholderPage } from '../placeholder/PlaceholderPage';

/** Pages of «stock» inside the app frame. The module replaces this placeholder. */
export const stockRoutes: RouteObject[] = [
  { path: 'stock/*', element: <PlaceholderPage title={messages.nav.stock} /> },
];
