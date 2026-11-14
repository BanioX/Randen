// Proves the colour pairs of the design system (docs/design.md): reads the tokens from
// apps/web/src/index.css, light and dark, and checks every pair against its WCAG minimum.
// Usage: node scripts/check-contrast.mjs   (exit code 1 if a pair fails)
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../apps/web/src/index.css', import.meta.url), 'utf8');

/** `--color-name: #hex;` declarations of one block. */
function tokens(block) {
  const map = new Map();
  for (const [, name, value] of block.matchAll(/--color-([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    map.set(name, value.toLowerCase());
  }
  return map;
}

const themeBlock = /@theme\s*\{([\s\S]*?)\n\}/.exec(css)?.[1];
const darkBlock = /prefers-color-scheme:\s*dark\)\s*\{\s*:root\s*\{([\s\S]*?)\n\s{2}\}/.exec(
  css,
)?.[1];
if (themeBlock === undefined || darkBlock === undefined) {
  console.error('Could not find the @theme block or the dark :root block in index.css');
  process.exit(1);
}
const light = tokens(themeBlock);
const dark = new Map([...light, ...tokens(darkBlock)]);
/** Text colours the dark block sets on classes instead of tokens. */
const darkText = { wine: '#e79ea6', ok: '#81d39f', danger: '#fd9376' };
for (const value of Object.values(darkText)) {
  if (!css.includes(value)) {
    console.error(`Dark text colour ${value} is not in index.css any more: update this script`);
    process.exit(1);
  }
}

function luminance(hex) {
  const channel = (index) => {
    const value = Number.parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

function ratio(a, b) {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

const WHITE = '#ffffff';
const failures = [];
let checked = 0;

function check(mode, label, foreground, background, minimum) {
  if (foreground === undefined || background === undefined) {
    failures.push(`${mode}  ${label}: token missing`);
    return;
  }
  checked += 1;
  const value = ratio(foreground, background);
  const line = `${mode.padEnd(5)} ${label.padEnd(44)} ${value.toFixed(2).padStart(6)}  (min ${minimum})`;
  if (value < minimum) {
    failures.push(line);
  }
  process.stdout.write(`${value < minimum ? 'FAIL ' : 'ok   '}${line}\n`);
}

for (const [mode, t, text] of [
  [
    'light',
    light,
    { wine: light.get('wine-800'), ok: light.get('ok'), danger: light.get('danger') },
  ],
  ['dark', dark, darkText],
]) {
  const surfaces = ['ground', 'surface', 'surface-muted'];
  for (const surface of surfaces) {
    check(mode, `ink on ${surface}`, t.get('ink'), t.get(surface), 7);
    check(mode, `ink-muted on ${surface}`, t.get('ink-muted'), t.get(surface), 4.5);
    check(mode, `wine text on ${surface}`, text.wine, t.get(surface), 4.5);
    check(mode, `danger text on ${surface}`, text.danger, t.get(surface), 4.5);
    check(mode, `ok text on ${surface}`, text.ok, t.get(surface), 4.5);
    check(mode, `focus ring (wine-600) on ${surface}`, t.get('wine-600'), t.get(surface), 3);
    check(mode, `line-strong on ${surface}`, t.get('line-strong'), t.get(surface), 3);
  }
  // Fills with white text.
  check(mode, 'white on wine-700 (button)', WHITE, t.get('wine-700'), 7);
  check(mode, 'white on wine-800 (hover)', WHITE, t.get('wine-800'), 7);
  check(mode, 'white on danger (button)', WHITE, t.get('danger'), 4.5);
  check(mode, 'white on ok (button)', WHITE, t.get('ok'), 4.5);
  check(mode, 'white on grape (sidebar, dark card)', WHITE, t.get('grape'), 7);
  check(mode, 'cork on grape', t.get('cork'), t.get('grape'), 7);
  check(mode, 'mist on grape', t.get('mist'), t.get('grape'), 4.5);
  check(mode, 'wine-700 pill on grape (active entry)', t.get('wine-700'), t.get('grape'), 1.3);
  check(mode, 'white on onyx', WHITE, t.get('onyx'), 7);
  // Tints with their text.
  check(mode, 'wine text on wine-50 (tip card)', text.wine, t.get('wine-50'), 4.5);
  check(mode, 'wine text on wine-100 (active tab)', text.wine, t.get('wine-100'), 4.5);
  check(mode, 'ink on wine-50', t.get('ink'), t.get('wine-50'), 7);
  check(mode, 'ok text on ok-bg', text.ok, t.get('ok-bg'), 4.5);
  check(mode, 'soon on soon-bg', t.get('soon'), t.get('soon-bg'), 4.5);
  check(mode, 'danger text on today-bg', text.danger, t.get('today-bg'), 4.5);
  for (const area of ['cold', 'frozen', 'dry', 'bar']) {
    check(mode, `${area} on ${area}-bg`, t.get(area), t.get(`${area}-bg`), 4.5);
    check(mode, `${area} on surface`, t.get(area), t.get('surface'), 4.5);
  }
  check(mode, 'soon on surface', t.get('soon'), t.get('surface'), 4.5);
  // Chart marks are graphics: 3:1 against the card they sit on.
  for (let index = 1; index <= 6; index += 1) {
    check(mode, `chart-${index} on surface`, t.get(`chart-${index}`), t.get('surface'), 3);
  }
  // The brand is red, so «wrong» must not look like «tap here».
  check(mode, 'danger vs wine-700 (told apart)', t.get('danger'), t.get('wine-700'), 1.5);
}

process.stdout.write(`\n${checked} pairs checked, ${failures.length} failed.\n`);
if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
