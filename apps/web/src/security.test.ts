import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseHeadersFile } from '../scripts/static-headers.ts';

/**
 * «Nichts verlässt das Gerät» (ADR-0006) and «nie in Suchmaschinen», proven on the two files the
 * host serves as they are: `public/_headers` (response headers) and `index.html`. The E2E smoke
 * test checks the same headers on the running app; this test fails earlier and without a browser.
 */
const webRoot = resolve(import.meta.dirname, '..');
const headersFile = readFileSync(resolve(webRoot, 'public', '_headers'), 'utf8');
const html = readFileSync(resolve(webRoot, 'index.html'), 'utf8');
const rules = parseHeadersFile(headersFile);

/** The headers a path gets, names in lower case; later rules win as on the host. */
function headersFor(path: string): Map<string, string> {
  const headers = new Map<string, string>();
  for (const rule of rules.filter(({ pattern }) => pattern.test(path))) {
    for (const [name, value] of rule.headers) {
      headers.set(name.toLowerCase(), value);
    }
  }
  return headers;
}

/** A policy as `directive → sources`. */
function directives(policy: string): Map<string, string[]> {
  return new Map(
    policy
      .split(';')
      .map((part) => part.trim().split(/\s+/))
      .filter((words) => words[0] !== undefined && words[0] !== '')
      .map(([name = '', ...sources]) => [name, sources]),
  );
}

const policy = headersFor('/').get('content-security-policy') ?? '';
const csp = directives(policy);

describe('response headers (public/_headers)', () => {
  it('gives every path the same policy: pages, assets and the service worker', () => {
    expect(policy).not.toBe('');
    for (const path of ['/stock', '/menu/card-1', '/assets/index-abc.js', '/sw.js', '/icon.svg']) {
      expect(headersFor(path).get('content-security-policy'), path).toBe(policy);
      expect(headersFor(path).get('x-robots-tag'), path).toMatch(/\bnoindex\b/);
    }
  });

  it("loads everything from the app's own origin by default", () => {
    expect(csp.get('default-src')).toEqual(["'self'"]);
    expect(csp.get('script-src')).toEqual(["'self'"]);
    expect(csp.get('font-src')).toEqual(["'self'"]);
    expect(csp.get('object-src')).toEqual(["'none'"]);
    expect(csp.get('base-uri')).toEqual(["'self'"]);
    expect(csp.get('form-action')).toEqual(["'self'"]);
  });

  it("talks to no server but its own: connect-src is 'self' and nothing else", () => {
    expect(csp.get('connect-src')).toEqual(["'self'"]);
  });

  it('names no foreign origin, no wildcard and no unsafe source in any directive', () => {
    expect(policy).not.toMatch(/\b(https?|wss?):/i);
    expect(policy).not.toContain('*');
    // Local data only: `data:` and `blob:` are photos and files that never left the device.
    const local = new Set(["'self'", "'none'", 'data:', 'blob:']);
    for (const [name, sources] of csp) {
      expect(sources.length, name).toBeGreaterThan(0);
      for (const source of sources) {
        expect(local, `${name} ${source}`).toContain(source);
      }
    }
    for (const name of ['default-src', 'script-src', 'connect-src', 'font-src', 'style-src']) {
      expect(csp.get(name), name).not.toContain('data:');
      expect(csp.get(name), name).not.toContain('blob:');
    }
  });

  it('cannot be framed by another site', () => {
    expect(csp.get('frame-ancestors')).toEqual(["'none'"]);
    expect(headersFor('/').get('x-frame-options')).toBe('DENY');
  });

  it('stays out of search engines', () => {
    expect(headersFor('/').get('x-robots-tag')).toMatch(/\bnoindex\b/);
    expect(headersFor('/').get('x-robots-tag')).toMatch(/\bnofollow\b/);
  });

  it('asks for the camera only, and only for itself', () => {
    const permissions = headersFor('/').get('permissions-policy') ?? '';
    expect(permissions).toContain('camera=(self)');
    expect(permissions).toContain('microphone=()');
    expect(permissions).toContain('geolocation=()');
  });
});

describe('index.html', () => {
  const page = new DOMParser().parseFromString(html, 'text/html');

  it('tells search engines not to index the app', () => {
    const robots = page.querySelector('meta[name="robots"]')?.getAttribute('content') ?? '';
    expect(robots).toMatch(/\bnoindex\b/);
    expect(robots).toMatch(/\bnofollow\b/);
  });

  it('loads no script, style sheet, font or image from another origin', () => {
    const references = [...page.querySelectorAll('[src], [href], [srcset], [action]')].flatMap(
      (element) =>
        ['src', 'href', 'srcset', 'action']
          .map((name) => element.getAttribute(name))
          .filter((value) => value !== null)
          // `srcset` holds several addresses, each with a size after a space.
          .flatMap((value) => value.split(',').map((part) => part.trim().split(/\s+/)[0] ?? '')),
    );
    expect(references.length).toBeGreaterThan(0);
    const here = 'https://app.invalid';
    for (const reference of references) {
      // `/icon.svg` and `icon.svg` stay here; `https://…`, `//host/…` and `data:` do not.
      expect(new URL(reference, `${here}/`).origin, reference).toBe(here);
    }
    // Nothing hides in the text of the file either (a preconnect, an @import, a comment).
    // The XML namespaces of an inline drawing are names, not addresses that get loaded.
    const text = html.replaceAll(/http:\/\/www\.w3\.org\/[\w/.#-]*/g, '');
    expect(text).not.toMatch(/\b(https?|wss?):\/\//i);
    expect(text).not.toMatch(/(src|href)\s*=\s*["']?\/\//i);
  });

  it('has no inline script or style: the policy would block them', () => {
    for (const script of page.querySelectorAll('script')) {
      expect(script.getAttribute('src'), script.outerHTML).not.toBeNull();
      expect(script.textContent.trim(), script.outerHTML).toBe('');
    }
    expect(page.querySelectorAll('style')).toHaveLength(0);
    expect(page.querySelectorAll('[style]')).toHaveLength(0);
    expect(page.querySelectorAll('meta[http-equiv="refresh" i]')).toHaveLength(0);
  });

  it('is called «Randen» and speaks Swiss German', () => {
    expect(page.title).toBe('Randen');
    expect(page.documentElement.lang).toBe('de-CH');
  });
});
