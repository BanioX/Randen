import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig } from 'vitest/config';

const modulesDir = join(import.meta.dirname, 'packages', 'core', 'src', 'modules');

/**
 * Modules whose contract is still empty (`{} as const`): placeholders until the module lands.
 * Their one-line files would count as fully covered and lift the numbers of the real logic, so
 * they stay out of the coverage until they hold operations. No list to maintain: a module that
 * gets its first operation is measured from then on.
 */
const stubModules = readdirSync(modulesDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .filter((name) => {
    try {
      return /=\s*\{\s*\}\s*as const\b/.test(
        readFileSync(join(modulesDir, name, 'contract.ts'), 'utf8'),
      );
    } catch {
      return false;
    }
  });

export default defineConfig({
  test: {
    projects: ['packages/*', 'apps/*'],
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**', 'apps/*/src/**'],
      exclude: [
        '**/*.d.ts',
        '**/main.tsx',
        // Helpers for tests are not what ships.
        'packages/core/src/testing/**',
        '**/test-helpers.tsx',
        '**/test-setup.ts',
        ...stubModules.map((name) => `packages/core/src/modules/${name}/**`),
      ],
      reporter: ['text', 'html', 'json-summary'],
      thresholds: {
        'packages/core/src/**': { lines: 90, functions: 90, branches: 85, statements: 90 },
      },
    },
  },
});
