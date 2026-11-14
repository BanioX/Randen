import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The register of side effects (docs/nebenwirkungen.md) against the code. Whatever the app does
 * outside itself (network, storage of the device, camera, printing, sharing, files) is a KIND
 * below. A kind that occurs in the code must stand in the register, in the column «Im Code».
 * So a new kind of side effect breaks this test until it is written down, and anything that
 * talks to a server breaks it until Alban has decided (CLAUDE.md, «Arbeitsweise» 4; ADR-0006).
 */
const root = resolve(import.meta.dirname, '..', '..', '..');
const registerText = readFileSync(join(root, 'docs', 'nebenwirkungen.md'), 'utf8');

interface Kind {
  /** How the register names it in «Im Code», in backticks. */
  key: string;
  /** How the code gives it away (comments are removed first). */
  pattern: RegExp;
  /** Sends something to a server: never without an explicit decision by Alban. */
  network?: true;
}

const KINDS: readonly Kind[] = [
  // Network
  { key: 'fetch(', pattern: /\bfetch\s*\(/, network: true },
  { key: 'XMLHttpRequest', pattern: /\bXMLHttpRequest\b/, network: true },
  { key: 'WebSocket', pattern: /\b(WebSocket|WebTransport|RTCPeerConnection)\b/, network: true },
  { key: 'EventSource', pattern: /\bEventSource\b/, network: true },
  { key: 'sendBeacon', pattern: /\bsendBeacon\b/, network: true },
  // Storage of the device
  { key: 'indexedDB', pattern: /\bindexedDB\b|\bDexie\b|from\s+['"]dexie/ },
  { key: 'localStorage', pattern: /\blocalStorage\b/ },
  { key: 'sessionStorage', pattern: /\bsessionStorage\b/ },
  { key: 'document.cookie', pattern: /\bdocument\s*\.\s*cookie\b/ },
  { key: 'storage.persist', pattern: /\.\s*persist\s*\(/ },
  { key: 'serviceWorker', pattern: /\bserviceWorker\b|\bVitePWA\s*\(|virtual:pwa-register/ },
  // Functions of the device
  { key: 'getUserMedia', pattern: /\bgetUserMedia\b|\bmediaDevices\b/ },
  { key: 'capture=', pattern: /\bcapture\s*=/ },
  { key: 'type="file"', pattern: /\btype\s*=\s*\{?\s*['"]file['"]/ },
  { key: 'geolocation', pattern: /\bgeolocation\b/ },
  {
    key: 'Notification',
    pattern:
      /\bnew\s+Notification\s*\(|\bNotification\s*\.\s*(requestPermission|permission)\b|\.\s*showNotification\s*\(/,
  },
  // What a person carries out of the app
  { key: 'window.print', pattern: /\bwindow\s*\.\s*print\b|(?<![.\w])print\s*\(\s*\)/ },
  { key: 'navigator.share', pattern: /\bnavigator\s*\.\s*(share|canShare)\b/ },
  {
    key: 'navigator.clipboard',
    pattern: /\bnavigator\s*\.\s*clipboard\b|\bexecCommand\s*\(\s*['"](copy|cut)['"]/,
  },
  { key: 'window.open', pattern: /\bwindow\s*\.\s*open\s*\(/ },
  { key: 'download', pattern: /<a\b[^>]*\bdownload\b|\bdownload\s*=(?!=)/ },
  { key: 'createObjectURL', pattern: /\bcreateObjectURL\b/ },
];

const kindOf = new Map(KINDS.map((kind) => [kind.key, kind]));

interface Source {
  path: string;
  code: string;
}

/**
 * Code without its comments, so a sentence about `fetch(` in a comment is no side effect. A
 * `//` right after a colon or inside a quote stays (an address in a string is code).
 */
function withoutComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      return sourceFiles(path);
    }
    return /\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [path] : [];
  });
}

/** Everything that ships: the app, the logic it runs, and the build config (service worker). */
function shippedCode(): Source[] {
  const files = [
    ...sourceFiles(join(root, 'apps', 'web', 'src')),
    ...sourceFiles(join(root, 'packages', 'core', 'src')),
    join(root, 'apps', 'web', 'vite.config.ts'),
  ];
  return files.map((file) => ({
    path: relative(root, file).replaceAll('\\', '/'),
    code: readFileSync(file, 'utf8'),
  }));
}

/** Which kinds occur, and in which files. */
function occurrences(sources: readonly Source[]): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const { path, code } of sources) {
    const bare = withoutComments(code);
    for (const kind of KINDS) {
      if (kind.pattern.test(bare)) {
        found.set(kind.key, [...(found.get(kind.key) ?? []), path]);
      }
    }
  }
  return found;
}

interface Row {
  id: string;
  /** The whole line, for storage keys and for messages. */
  line: string;
  keys: string[];
  leaves: string;
  decision: string;
  since: string;
}

const COLUMNS = [
  'Kennung',
  'Nebenwirkung',
  'Im Code',
  'Wo',
  'Daten verlassen das Gerät?',
  'Entscheid',
  'Seit',
] as const;

const cells = (line: string) =>
  line
    .split('|')
    .slice(1, -1)
    .map((cell) => cell.trim());

/** Every row `| SE-nn | … |` of every table in the register. */
function parseRegister(text: string): Row[] {
  return text
    .split('\n')
    .filter((line) => /^\|\s*SE-/.test(line))
    .map((line) => {
      const [id = '', , inCode = '', , leaves = '', decision = '', since = ''] = cells(line);
      return {
        id,
        line,
        keys: [...inCode.matchAll(/`([^`]+)`/g)].map((match) => match[1] ?? ''),
        leaves,
        decision,
        since,
      };
    });
}

const ALBAN_DECIDED = /\bAlban, \d{1,2}\.\d{1,2}\.\d{4}\b/;
const ADR = /\bADR-\d{4}\b/;

/** What is wrong between the code and the register; empty when all is in order. */
function problems(found: ReadonlyMap<string, readonly string[]>, rows: readonly Row[]): string[] {
  const list: string[] = [];
  for (const [key, paths] of found) {
    const where = paths.join(', ');
    const registered = rows.filter((row) => row.keys.includes(key));
    if (kindOf.get(key)?.network === true) {
      const decided = registered.filter(
        (row) =>
          row.leaves.startsWith('ja') && ALBAN_DECIDED.test(row.decision) && ADR.test(row.decision),
      );
      if (decided.length === 0) {
        list.push(
          `\`${key}\` in ${where}: Anfragen an einen Server brauchen einen Entscheid von Alban. ` +
            'Zeile in docs/nebenwirkungen.md mit «ja» und «Alban, TT.MM.JJJJ, ADR-NNNN» in «Entscheid».',
        );
      }
    } else if (registered.length === 0) {
      list.push(
        `\`${key}\` in ${where}: steht nicht in docs/nebenwirkungen.md. ` +
          'Neue Zeile mit der nächsten Kennung und dieser Art in «Im Code» eintragen.',
      );
    }
  }
  return list;
}

const rows = parseRegister(registerText);
const sources = shippedCode();
const found = occurrences(sources);

describe('register of side effects (docs/nebenwirkungen.md)', () => {
  it('has the columns the test reads, in every table', () => {
    const headers = registerText.split('\n').filter((line) => /^\|\s*Kennung\s*\|/.test(line));
    expect(headers.length).toBeGreaterThan(0);
    for (const header of headers) {
      expect(cells(header)).toEqual([...COLUMNS]);
    }
  });

  it('is well formed: unique ids, a clear yes or no, a date or «geplant»', () => {
    expect(rows.length).toBeGreaterThanOrEqual(5);
    const ids = rows.map((row) => row.id);
    expect(new Set(ids).size, 'Kennungen sind eindeutig').toBe(ids.length);
    for (const row of rows) {
      expect(cells(row.line), row.id).toHaveLength(COLUMNS.length);
      expect(row.id).toMatch(/^SE-\d{2}$/);
      expect(row.leaves, `${row.id} «Daten verlassen das Gerät?»`).toMatch(
        /^(ja|nein)(?![a-zäöü])/,
      );
      expect(row.since, `${row.id} «Seit»`).toMatch(/^(\d{1,2}\.\d{1,2}\.\d{4}|geplant)$/);
      expect(row.decision, `${row.id} «Entscheid»`).toMatch(ADR);
    }
  });

  it('names only kinds this test knows, so a typo cannot hide a side effect', () => {
    for (const row of rows) {
      for (const key of row.keys) {
        expect([...kindOf.keys()], `${row.id} «Im Code»`).toContain(key);
      }
    }
  });

  it('allows a request to a server only in a row that carries the decision by Alban', () => {
    const network = rows.filter((row) => row.keys.some((key) => kindOf.get(key)?.network === true));
    for (const row of network) {
      expect(row.leaves, row.id).toMatch(/^ja(?![a-zäöü])/);
      expect(row.decision, row.id).toMatch(ALBAN_DECIDED);
    }
  });
});

describe('side effects in the code', () => {
  it('really reads the code: what exists today is found', () => {
    expect(sources.length).toBeGreaterThan(40);
    expect(found.get('indexedDB')).toContain('apps/web/src/data/db.ts');
    expect(found.get('storage.persist')).toContain('apps/web/src/data/persistence.ts');
    expect(found.get('sessionStorage')).toContain('apps/web/src/app/new-version.ts');
    expect(found.get('serviceWorker')).toContain('apps/web/vite.config.ts');
  });

  it('lists every kind that occurs in the register', () => {
    expect(problems(found, rows)).toEqual([]);
  });

  it('talks to no server unless Alban has decided it: fetch, XMLHttpRequest, WebSocket …', () => {
    const requests = new Map([...found].filter(([key]) => kindOf.get(key)?.network === true));
    expect(problems(requests, rows)).toEqual([]);
  });

  it('lists every key the app keeps in local or session storage', () => {
    const keys = new Set(
      sources.flatMap(({ code }) =>
        [...withoutComments(code).matchAll(/['"`](randen:[a-z0-9-]+)['"`]/g)].map(
          (match) => match[1] ?? '',
        ),
      ),
    );
    expect(keys).toContain('randen:reloaded-for-update');
    for (const key of keys) {
      const listed = rows.some((row) => row.line.includes(`\`${key}\``));
      expect(listed, `${key} fehlt in docs/nebenwirkungen.md`).toBe(true);
    }
  });
});

describe('the guard itself', () => {
  const at = (code: string) => occurrences([{ path: 'apps/web/src/features/x/Page.tsx', code }]);

  it('fails for a new kind of side effect until the register lists it', () => {
    const notification = at(`new Notification('Lieferung ist da');`);
    expect(problems(notification, rows)).toHaveLength(1);
    expect(problems(notification, rows)[0]).toContain('apps/web/src/features/x/Page.tsx');

    const registered = parseRegister(
      '| SE-90 | Mitteilung des Geräts | `Notification` | x | nein | ADR-0006 | 14.11.2026 |',
    );
    expect(problems(notification, [...rows, ...registered])).toEqual([]);
  });

  it('passes when a planned kind arrives: printing, sharing, copying, saving a file', () => {
    const arriving = at(
      [
        'window.print();',
        'await navigator.share({ text });',
        'await navigator.clipboard.writeText(text);',
        'const url = URL.createObjectURL(blob);',
        'return <a href={url} download="randen-sicherung.json">Sichern</a>;',
        'return <input type="file" accept="image/*" capture="environment" />;',
      ].join('\n'),
    );
    expect([...arriving.keys()].sort()).toEqual(
      [
        'capture=',
        'createObjectURL',
        'download',
        'navigator.clipboard',
        'navigator.share',
        'type="file"',
        'window.print',
      ].sort(),
    );
    expect(problems(arriving, rows)).toEqual([]);
  });

  it('always fails for a request to a server, even with an ordinary row', () => {
    const samples: Record<string, string> = {
      'fetch(': `await fetch('/api/orders', { method: 'POST', body });`,
      XMLHttpRequest: 'const request = new XMLHttpRequest();',
      WebSocket: `const socket = new WebSocket('wss://example.invalid');`,
      EventSource: `const stream = new EventSource('/events');`,
      sendBeacon: `navigator.sendBeacon('/log', data);`,
    };
    for (const kind of KINDS.filter(({ network }) => network === true)) {
      const request = at(samples[kind.key] ?? '');
      expect([...request.keys()], kind.key).toEqual([kind.key]);
      expect(problems(request, rows), kind.key).toHaveLength(1);
      expect(problems(request, rows)[0]).toContain('Entscheid von Alban');

      const ordinary = parseRegister(
        `| SE-91 | Bestellung senden | \`${kind.key}\` | x | ja | ADR-0099 | 14.11.2026 |`,
      );
      expect(problems(request, ordinary), `${kind.key} without Alban`).toHaveLength(1);
      const denied = parseRegister(
        `| SE-91 | Bestellung senden | \`${kind.key}\` | x | nein | Alban, 14.11.2026, ADR-0099 | 14.11.2026 |`,
      );
      expect(problems(request, denied), `${kind.key} marked «nein»`).toHaveLength(1);
      const decided = parseRegister(
        `| SE-91 | Bestellung senden | \`${kind.key}\` | x | ja | Alban, 14.11.2026, ADR-0099 | 14.11.2026 |`,
      );
      expect(problems(request, decided), `${kind.key} decided`).toEqual([]);
    }
  });

  it('ignores comments, but not code that follows an address in a string', () => {
    expect(at('// later: fetch( the price list\n/* navigator.share */ const a = 1;').size).toBe(0);
    expect(at(`const base = 'https://example.invalid'; fetch(base);`).has('fetch(')).toBe(true);
  });

  it('tells similar words apart', () => {
    expect(at('refetch(); const printable = true; className="print:hidden"').size).toBe(0);
    expect(at('addEventListener("x", f, { capture: true });').size).toBe(0);
    expect(at('if (download === wanted) {}').size).toBe(0);
  });
});
