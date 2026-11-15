import { DEFAULT_BUSINESS_NAMES } from '@randen/core';
import { matchRoutes, type RouteObject } from 'react-router';
import { describe, expect, it } from 'vitest';
import { messages } from '../../app/messages';
import { paths } from '../../app/paths';
import { demoRoutes } from './routes';

describe('routes of the demo business', () => {
  it('has its page at the address of the app and loads it lazily', async () => {
    const match = matchRoutes([{ path: '/', children: demoRoutes }], paths.demo());
    const route: RouteObject | undefined = match?.at(-1)?.route;
    expect(route?.path).toBe('more/demo');
    const loaded = await (route?.lazy as () => Promise<{ Component?: unknown }>)();
    expect(typeof loaded.Component).toBe('function');
  });

  it('renames the business the app makes on its first start', () => {
    // The demo replaces only a name nobody chose: the one the app gives a new business.
    expect(DEFAULT_BUSINESS_NAMES).toContain(messages.defaults.businessName);
  });
});
