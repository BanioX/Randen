import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  parseDetailed,
  readDetailed,
  startWithEssentials,
  useDetailed,
  writeDetailed,
} from './view';

afterEach(() => {
  window.localStorage.clear();
});

describe('the view of this device (ADR-0014, ADR-0015)', () => {
  it('shows the detailed view when nothing or something unreadable is stored', () => {
    expect(parseDetailed(null)).toBe(true);
    expect(parseDetailed('kaputt')).toBe(true);
    expect(parseDetailed('42')).toBe(true);
    expect(readDetailed()).toBe(true);
  });

  it('reads the switch as ADR-0014 stored it, groups and all', () => {
    expect(parseDetailed(JSON.stringify({ on: false, groups: { numbers: true } }))).toBe(false);
    expect(parseDetailed(JSON.stringify({ on: true, groups: { numbers: false } }))).toBe(true);
  });

  it('starts a new business with the essentials once, and never overrides a choice', () => {
    startWithEssentials();
    expect(readDetailed()).toBe(false);
    writeDetailed(true);
    startWithEssentials();
    expect(readDetailed()).toBe(true);
  });

  it('lets every surface follow a switch at once', () => {
    writeDetailed(false);
    const { result } = renderHook(() => useDetailed());
    expect(result.current).toBe(false);
    act(() => {
      writeDetailed(true);
    });
    expect(result.current).toBe(true);
  });
});
