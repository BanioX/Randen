import type { RouteObject } from 'react-router';
import { messages } from '../../app/messages';
import { PlaceholderPage } from '../placeholder/PlaceholderPage';

/** Pages of «articles» inside the app frame. The module replaces this placeholder. */
export const articlesRoutes: RouteObject[] = [
  { path: 'articles/*', element: <PlaceholderPage title={messages.nav.articles} /> },
  { path: 'suppliers/*', element: <PlaceholderPage title={messages.nav.suppliers} /> },
];
