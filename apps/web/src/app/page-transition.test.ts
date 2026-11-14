import { afterEach, describe, expect, it, vi } from 'vitest';
import { targetPath, transitionKind, withPageTransitions } from './page-transition';

describe('transitionKind', () => {
  it('cross-fades between the tabs', () => {
    expect(transitionKind('/', '/stock')).toBe('tab');
    expect(transitionKind('/stock', '/more')).toBe('tab');
    expect(transitionKind('/more/', '/')).toBe('tab');
  });

  it('pushes a deeper page in and goes back to a parent', () => {
    expect(transitionKind('/stock', '/stock/articles/abc')).toBe('forward');
    expect(transitionKind('/', '/stock/receive')).toBe('forward');
    expect(transitionKind('/more', '/more/features')).toBe('forward');
    expect(transitionKind('/stock/articles/abc', '/stock')).toBe('back');
    expect(transitionKind('/more/features', '/more')).toBe('back');
    expect(transitionKind('/stock/receive', '/')).toBe('back');
  });

  it('follows the history and keeps still on the same page', () => {
    expect(transitionKind('/stock/articles/abc', -1)).toBe('back');
    expect(transitionKind('/stock', 1)).toBe('forward');
    expect(transitionKind('/stock', 0)).toBe('none');
    expect(transitionKind('/stock', '/stock')).toBe('none');
  });

  it('pushes a page of another section in', () => {
    expect(transitionKind('/stock/articles/abc', '/recipes/x')).toBe('forward');
  });
});

describe('targetPath', () => {
  it('resolves strings and path objects', () => {
    expect(targetPath('/stock?view=kind', '/')).toBe('/stock');
    expect(targetPath('reports', '/more/')).toBe('/more/reports');
    expect(targetPath({ pathname: '/stock/receive' }, '/')).toBe('/stock/receive');
    expect(targetPath({ search: '?q=rahm' }, '/stock')).toBe('/stock');
  });
});

describe('withPageTransitions', () => {
  afterEach(() => {
    delete document.documentElement.dataset.transition;
    vi.unstubAllGlobals();
    Reflect.deleteProperty(document, 'startViewTransition');
  });

  /** The router's own navigate stays reachable as `spy` after the wrapper replaces it. */
  function fakeRouter() {
    const spy = vi.fn((to: unknown, options?: unknown) => Promise.resolve([to, options]));
    return { spy, navigate: spy, subscribe: vi.fn(() => () => undefined) };
  }

  function allowMotion(reduce: boolean) {
    Object.defineProperty(document, 'startViewTransition', {
      configurable: true,
      value: vi.fn(),
    });
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: reduce })),
    );
  }

  it('asks the router for a view transition and marks its kind', async () => {
    allowMotion(false);
    const inner = fakeRouter();
    const router = withPageTransitions(() => inner);
    await router.navigate('/stock', { replace: false });
    expect(inner.spy).toHaveBeenCalledWith('/stock', {
      replace: false,
      viewTransition: true,
    });
    expect(document.documentElement.dataset.transition).toBe('tab');
  });

  it('leaves the navigation as it is without motion', async () => {
    allowMotion(true);
    const inner = fakeRouter();
    const router = withPageTransitions(() => inner);
    await router.navigate('/stock/receive');
    expect(inner.spy).toHaveBeenCalledWith('/stock/receive', undefined);
    expect(document.documentElement.dataset.transition).toBeUndefined();
  });

  it('marks a step back in the history before the router sees it', () => {
    allowMotion(false);
    window.history.replaceState({ idx: 3 }, '');
    withPageTransitions(() => fakeRouter());
    window.dispatchEvent(new PopStateEvent('popstate', { state: { idx: 2 } }));
    expect(document.documentElement.dataset.transition).toBe('back');
    window.dispatchEvent(new PopStateEvent('popstate', { state: { idx: 4 } }));
    expect(document.documentElement.dataset.transition).toBe('forward');
  });
});
