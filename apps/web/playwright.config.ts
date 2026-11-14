import { defineConfig, devices } from '@playwright/test';

const executablePath = process.env.PW_CHROMIUM_EXECUTABLE;
// A port of its own per run (E2E_PORT), so parallel work in several worktrees does not share a
// server by accident (lesson from Rettich: L-02, TD-06).
const port = Number(process.env.E2E_PORT ?? 4273);
const baseURL = `http://localhost:${String(port)}`;

export default defineConfig({
  testDir: 'e2e',
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'off',
    locale: 'de-CH',
    timezoneId: 'Europe/Zurich',
    // Specs run with «Bewegung reduzieren»: a tap during a transition may miss its target.
    reducedMotion: 'reduce',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        ...(executablePath ? { launchOptions: { executablePath } } : { channel: 'chromium' }),
      },
    },
  ],
  webServer: {
    command: `pnpm build && pnpm preview --port ${String(port)} --strictPort`,
    url: baseURL,
    reuseExistingServer: false,
  },
});
