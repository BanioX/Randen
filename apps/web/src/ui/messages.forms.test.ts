import { describe, expect, it } from 'vitest';
import { formMessages } from './messages.forms';

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

const all = texts(formMessages, 'formMessages');

/** The same rules as for the catalogs of the features (`app/messages.test.ts`). */
describe('texts of the form kit (de-CH)', () => {
  it('finds the texts', () => {
    expect(all.length).toBeGreaterThan(80);
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

  it('says what to do instead of calling an input invalid', () => {
    for (const [path, text] of all) {
      expect(text, path).not.toMatch(/ungültig|fehlerhaft|falsch/i);
    }
  });
});
