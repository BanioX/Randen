// «pnpm check»: everything a push must pass, one step after the other, WITHOUT stopping at the
// first failure. Each step prints `<step> exit=<code> (<seconds> s)`; the last line is
// `ALL=GREEN` or `ALL=RED`, and the exit code is 1 on RED.
//
//   pnpm check            licences, format, lint, typecheck, contrast, unit tests, build
//   pnpm check --e2e      the same plus Playwright (set PW_CHROMIUM_EXECUTABLE and E2E_PORT)
//
// Two lessons from Rettich are built in:
// - `pnpm -s` swallows errors, so every step runs loud and its exit code is printed (L-R18).
// - A check whose tool is missing must fail, not look like a pass (L-R15): a step that cannot
//   be started, or that is killed by a signal, counts as failed.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const root = new URL('..', import.meta.url);

/** The steps in the order of the CI (.github/workflows/ci.yml): cheap ones first. */
const STEPS = ['licenses:check', 'format:check', 'lint', 'typecheck', 'contrast', 'test', 'build'];
const OPTIONAL = { '--e2e': 'e2e' };

const args = process.argv.slice(2);
const unknown = args.filter((arg) => !(arg in OPTIONAL));
if (unknown.length > 0) {
  // A typo such as `--e2` must not quietly run fewer checks.
  console.error(`Unknown option: ${unknown.join(' ')}. Known: ${Object.keys(OPTIONAL).join(' ')}`);
  console.error('ALL=RED');
  process.exit(2);
}
const steps = [...STEPS, ...args.map((arg) => OPTIONAL[arg])];

const { scripts = {} } = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

/** Runs one script of the root package.json and returns its exit code (never undefined). */
function run(step) {
  if (!(step in scripts)) {
    console.error(`check: package.json has no script «${step}»`);
    return 127;
  }
  const result = spawnSync(pnpm, ['run', step], { cwd: root, stdio: 'inherit' });
  if (result.error !== undefined) {
    console.error(`check: could not start «${pnpm} run ${step}»: ${result.error.message}`);
    return 127;
  }
  if (result.status === null) {
    console.error(`check: «${step}» was stopped by ${result.signal ?? 'a signal'}`);
    return 1;
  }
  return result.status;
}

const lines = [];
for (const step of steps) {
  process.stdout.write(`\n=== ${step} ===\n`);
  const started = performance.now();
  const code = run(step);
  const seconds = ((performance.now() - started) / 1000).toFixed(1);
  const line = `${step} exit=${String(code)} (${seconds} s)`;
  lines.push({ line, code });
  process.stdout.write(`${line}\n`);
}

// The summary once more at the very end, so nobody has to scroll: read the line `ALL=`, and on
// RED every line whose `exit=` is not 0.
const green = lines.every(({ code }) => code === 0);
process.stdout.write(`\n=== check ===\n${lines.map(({ line }) => line).join('\n')}\n`);
process.stdout.write(`ALL=${green ? 'GREEN' : 'RED'}\n`);
process.exit(green ? 0 : 1);
