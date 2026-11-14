import { describe, expect, it } from 'vitest';
import { displayMessages } from './messages.display';

/** Every text in the catalog, including the literal parts of message functions. */
function texts(value: unknown, path: string): [path: string, text: string][] {
  if (typeof value === 'string' || typeof value === 'function') {
    return [[path, String(value)]];
  }
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value).flatMap(([key, child]) => texts(child, `${path}.${key}`));
  }
  return [];
}

const all = texts(displayMessages, 'displayMessages');

describe('texts of the display components (de-CH)', () => {
  it('finds the texts', () => {
    expect(all.length).toBeGreaterThan(20);
  });

  it('talks to one person with «du», never «ihr», «euch», «euer» or «Sie»', () => {
    for (const [path, text] of all) {
      expect(text, path).not.toMatch(/\b(ihr|euch|euer|eure[mnrs]?)\b/i);
      expect(text, path).not.toMatch(/\b(Ihnen|Ihre[mnrs]?)\b/);
      expect(text, path).not.toMatch(/\b(können|möchten|wollen|haben|sind|müssen) Sie\b/);
    }
  });

  it('uses «ss» instead of «ß» and speaks calmly', () => {
    for (const [path, text] of all) {
      expect(text, path).not.toContain('ß');
      expect(text, path).not.toMatch(/![^=]/);
      expect(text, path).not.toMatch(/\b(smart|insights?|hub|magic|journey|gamechanger)\b/i);
    }
  });
});
