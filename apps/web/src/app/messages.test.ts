import { describe, expect, it } from 'vitest';
import { messages } from './messages';

/** Every feature's catalog, found by its file name, so a new feature is checked without a list. */
const featureCatalogs = import.meta.glob<Record<string, unknown>>('../features/*/messages.ts', {
  eager: true,
});

/** Every text in a catalog, including the literal parts of message functions. */
function texts(value: unknown, path: string): [path: string, text: string][] {
  if (typeof value === 'string' || typeof value === 'function') {
    return [[path, String(value)]];
  }
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value).flatMap(([key, child]) => texts(child, `${path}.${key}`));
  }
  return [];
}

const all = [
  ...texts(messages, 'messages'),
  ...Object.entries(featureCatalogs).flatMap(([file, catalog]) => texts(catalog, file)),
];

describe('texts of the app (de-CH)', () => {
  it('finds the catalog of every feature', () => {
    expect(Object.keys(featureCatalogs).length).toBeGreaterThanOrEqual(11);
    expect(all.length).toBeGreaterThan(40);
  });

  it('talks to one person with «du», never «ihr», «euch», «euer» or «Sie»', () => {
    for (const [path, text] of all) {
      expect(text, path).not.toMatch(/\b(ihr|euch|euer|eure[mnrs]?)\b/i);
      expect(text, path).not.toMatch(/\b(Ihnen|Ihre[mnrs]?)\b/);
      expect(text, path).not.toMatch(/\b(können|möchten|wollen|haben|sind|müssen) Sie\b/);
    }
  });

  it('uses «ss» instead of «ß»', () => {
    for (const [path, text] of all) {
      expect(text, path).not.toContain('ß');
    }
  });

  it('speaks calmly: no buzzwords and no exclamation marks', () => {
    for (const [path, text] of all) {
      expect(text, path).not.toMatch(/\b(smart|insights?|hub|magic|journey|gamechanger)\b/i);
      expect(text, path).not.toMatch(/![^=]/);
    }
  });

  it('writes the name «Randen» with a capital R', () => {
    for (const [path, text] of all) {
      expect(text, path).not.toMatch(/(?<![\w/@.-])randen(?![\w.-])/);
    }
  });
});
