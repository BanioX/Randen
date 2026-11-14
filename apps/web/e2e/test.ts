import BaseAxeBuilder from '@axe-core/playwright';
import { expect, test as base, type Page } from '@playwright/test';

export { expect } from '@playwright/test';

/** The three devices of Randen: iPhone, iPad upright, and the browser on a desk. */
export const VIEWPORTS = {
  /** iPhone: five tabs at the bottom. */
  phone: { width: 390, height: 844 },
  /** iPad upright: the narrow rail. */
  tablet: { width: 820, height: 1180 },
  /** iPad on its side: the full sidebar, on a touch screen. */
  tabletLandscape: { width: 1180, height: 820 },
  /** The browser on a desk. */
  desktop: { width: 1440, height: 900 },
} as const;

/** The accessible name of the app's navigation (side navigation and tab bar share it). */
export const NAV_LABEL = 'Hauptnavigation';

/** What axe checks: WCAG 2.0, 2.1 and 2.2, levels A and AA. */
export const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] as const;

/** Titles of the pages that stand in when something is wrong (app/messages.ts). */
const BROKEN_PAGE = /Das hat nicht geklappt|Neue Version|Nicht gefunden/;

/** True for an address that stays on the device: the app's own origin, `data:` or `blob:`. */
export function staysOnDevice(url: string, baseURL: string): boolean {
  const origin = new URL(baseURL).origin;
  return (
    url === origin ||
    url.startsWith(`${origin}/`) ||
    url.startsWith('data:') ||
    url.startsWith('blob:')
  );
}

export interface ErrorWatch {
  /** What went wrong so far: console errors, uncaught errors, failed requests, HTTP errors. */
  readonly problems: readonly string[];
  /** Fails the test if anything was recorded. */
  expectNone: () => void;
  /** Stops recording, e.g. before a step that provokes an error on purpose. */
  stop: () => void;
}

/**
 * Records everything a person would call «broken» without seeing it: errors in the console
 * (this includes what the Content-Security-Policy blocks), uncaught errors, requests that fail
 * and answers from 400 up. Call `expectNone()` at the end, or take the fixture `errors`, which
 * does so by itself. `ignore` lets a spec name what it provokes on purpose.
 */
export function watchErrors(page: Page, options: { ignore?: readonly RegExp[] } = {}): ErrorWatch {
  const problems: string[] = [];
  let recording = true;
  const record = (problem: string) => {
    if (recording && !(options.ignore ?? []).some((pattern) => pattern.test(problem))) {
      problems.push(problem);
    }
  };

  page.on('console', (message) => {
    if (message.type() === 'error') {
      record(`console: ${message.text()} (${message.location().url})`);
    }
  });
  page.on('pageerror', (error) => {
    record(`uncaught: ${error.message}`);
  });
  page.on('requestfailed', (request) => {
    const reason = request.failure()?.errorText ?? 'unknown';
    // Leaving a page cancels what it was still loading: that is no failure of the app.
    if (reason !== 'net::ERR_ABORTED') {
      record(`request failed: ${request.method()} ${request.url()} (${reason})`);
    }
  });
  page.on('response', (response) => {
    if (response.status() >= 400) {
      record(`HTTP ${String(response.status())}: ${response.url()}`);
    }
  });

  return {
    problems,
    expectNone: () => {
      expect(problems, 'console errors and failed requests').toEqual([]);
    },
    stop: () => {
      recording = false;
    },
  };
}

interface Fixtures {
  /** Every test: no request leaves the app's own origin (ADR-0006). Checked when it ends. */
  sameOrigin: undefined;
  /** For tests that ask for it: fails the test on any console error or failed request. */
  errors: ErrorWatch;
  /** `test.use({ newBusiness: true })`: start like a new business, with the essentials (ADR-0014). */
  newBusiness: boolean;
  /**
   * Every other test sees all functions. Set only when nothing is chosen yet, so a switch flipped
   * in a test survives the next page load (after Rettich ADR-0095).
   */
  allExtras: undefined;
}

export const test = base.extend<Fixtures>({
  newBusiness: [false, { option: true }],
  allExtras: [
    async ({ context, newBusiness }, provide) => {
      if (!newBusiness) {
        await context.addInitScript(() => {
          if (window.localStorage.getItem('randen:extras') === null) {
            window.localStorage.setItem('randen:extras', JSON.stringify({ on: true, groups: {} }));
          }
        });
      }
      await provide(undefined);
    },
    { auto: true },
  ],
  sameOrigin: [
    async ({ context, baseURL }, provide) => {
      if (baseURL === undefined) {
        throw new Error('playwright.config.ts must set use.baseURL');
      }
      const foreign: string[] = [];
      context.on('request', (request) => {
        if (!staysOnDevice(request.url(), baseURL)) {
          foreign.push(`${request.method()} ${request.url()}`);
        }
      });
      await provide(undefined);
      expect(foreign, 'requests that left the device (ADR-0006)').toEqual([]);
    },
    { auto: true },
  ],
  errors: async ({ page }, provide) => {
    const watch = watchErrors(page);
    await provide(watch);
    watch.expectNone();
  },
});

/**
 * Axe as in every spec, but it first waits until all transitions and animations have ended.
 * Mid-fade, colours are a little lighter than at rest, and axe reports contrast errors that a
 * person never sees (L-R19). Import it from here, never from `@axe-core/playwright` (lint rule).
 */
export class AxeBuilder extends BaseAxeBuilder {
  private readonly settlePage: Page;

  constructor(options: { page: Page }) {
    super(options);
    this.settlePage = options.page;
  }

  override async analyze(): ReturnType<BaseAxeBuilder['analyze']> {
    await this.settlePage.waitForFunction(() =>
      document.getAnimations().every((animation) => animation.playState !== 'running'),
    );
    return super.analyze();
  }
}

/**
 * The accessibility check of Randen on the page as it is now: one short line per violation and
 * element, so a failed run reads at a glance. Use it as `expect(await a11y(page)).toEqual([])`.
 */
export async function a11y(page: Page): Promise<string[]> {
  const { violations } = await new AxeBuilder({ page }).withTags([...WCAG_TAGS]).analyze();
  return violations.flatMap((violation) =>
    violation.nodes.map(
      (node) =>
        `${violation.id} (${violation.impact ?? 'unknown'}): ${violation.help} → ${node.target.join(' ')}`,
    ),
  );
}

/** Opens a route and waits for its page: exactly one visible h1 that is not an error page. */
export async function visit(page: Page, route: string): Promise<void> {
  await page.goto(route);
  const title = page.getByRole('heading', { level: 1 });
  await expect(title, `${route} shows one h1`).toBeVisible();
  await expect(title, `${route} is a page of the app, not an error`).not.toHaveText(BROKEN_PAGE);
}

/**
 * Every address the navigation leads to (side navigation and tab bar, also the one that is
 * hidden at this width), each once. The app must be open. A new entry is covered by every spec
 * that walks this list, without a second list to maintain.
 */
export async function navDestinations(page: Page): Promise<string[]> {
  const paths = await page
    .locator(`nav[aria-label="${NAV_LABEL}"] a[href]`)
    .evaluateAll((links) =>
      links.map((link) => new URL((link as HTMLAnchorElement).href).pathname),
    );
  const unique = [...new Set(paths)];
  // An empty list would make every loop over it pass without checking anything (L-R15).
  expect(unique.length, 'destinations of the navigation').toBeGreaterThanOrEqual(10);
  return unique;
}
