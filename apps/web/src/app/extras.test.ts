import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ALL_EXTRAS,
  ESSENTIALS,
  isShown,
  parseExtras,
  readExtras,
  startWithEssentials,
  useExtra,
  writeExtras,
} from './extras';

afterEach(() => {
  window.localStorage.clear();
});

describe('extras', () => {
  it('shows everything when nothing or something unreadable is stored', () => {
    expect(parseExtras(null)).toEqual(ALL_EXTRAS);
    expect(parseExtras('kaputt')).toEqual(ALL_EXTRAS);
    expect(parseExtras('42')).toEqual(ALL_EXTRAS);
    expect(readExtras()).toEqual(ALL_EXTRAS);
  });

  it('reads the switch and single groups', () => {
    const state = parseExtras(JSON.stringify({ on: true, groups: { numbers: false } }));
    expect(isShown(state, 'numbers')).toBe(false);
    expect(isShown(state, 'production')).toBe(true);
    expect(isShown(ESSENTIALS, 'production')).toBe(false);
  });

  it('starts a new business with the essentials once, and never overrides a choice', () => {
    startWithEssentials();
    expect(readExtras()).toEqual(ESSENTIALS);
    writeExtras(ALL_EXTRAS);
    startWithEssentials();
    expect(readExtras()).toEqual(ALL_EXTRAS);
  });

  it('lets every surface follow a switch at once', () => {
    writeExtras(ESSENTIALS);
    const { result } = renderHook(() => useExtra('places'));
    expect(result.current).toBe(false);
    act(() => {
      writeExtras({ ...ESSENTIALS, on: true });
    });
    expect(result.current).toBe(true);
  });
});
