import type { RouteObject } from 'react-router';
import { messages } from '../../app/messages';
import { PlaceholderPage } from '../placeholder/PlaceholderPage';

/** Pages of «numbers» inside the app frame. The module replaces this placeholder. */
export const numbersRoutes: RouteObject[] = [
  { path: 'numbers/*', element: <PlaceholderPage title={messages.nav.numbers} /> },
];
