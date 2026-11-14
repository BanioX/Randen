import type { RouteObject } from 'react-router';
import { messages } from '../../app/messages';
import { PlaceholderPage } from '../placeholder/PlaceholderPage';

/** Pages of «recipes» inside the app frame. The module replaces this placeholder. */
export const recipesRoutes: RouteObject[] = [
  { path: 'recipes/*', element: <PlaceholderPage title={messages.nav.recipes} /> },
];
