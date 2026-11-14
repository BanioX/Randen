// Build command of Cloudflare Workers Builds (docs/previews.md, wrangler.jsonc).
// One build for every branch: the demo business is loaded by the person under «Mehr», so the
// preview links and `main` ship the same app.
import { execSync } from 'node:child_process';

process.stdout.write(`Cloudflare build: ${process.env.WORKERS_CI_BRANCH ?? 'local'}\n`);
execSync('pnpm --filter @randen/web build', { stdio: 'inherit' });
