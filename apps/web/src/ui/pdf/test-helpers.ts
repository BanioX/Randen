import { inflateSync } from 'node:zlib';

/** WinAnsiEncoding beyond Latin-1: byte 0x80 + index → character. */
const WIN_ANSI_HIGH = '€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008dŽ\u008f\u0090‘’“”•–—˜™š›œ\u009džŸ';

function decode(bytes: string): string {
  let out = '';
  for (let index = 0; index < bytes.length; index += 1) {
    const code = bytes.charCodeAt(index);
    out += code >= 0x80 && code <= 0x9f ? (WIN_ANSI_HIGH[code - 0x80] ?? '') : bytes.charAt(index);
  }
  return out;
}

/** The content streams of a PDF, inflated where they are compressed. */
function streams(data: Buffer): string[] {
  const found: string[] = [];
  let at = 0;
  for (;;) {
    const start = data.indexOf('stream', at, 'latin1');
    if (start < 0) {
      return found;
    }
    const bodyStart = data[start + 6] === 0x0d ? start + 8 : start + 7;
    const end = data.indexOf('endstream', bodyStart, 'latin1');
    if (end < 0) {
      return found;
    }
    const body = data.subarray(bodyStart, end);
    try {
      found.push(inflateSync(body).toString('latin1'));
    } catch {
      found.push(body.toString('latin1'));
    }
    at = end + 9;
  }
}

/** The strings of the text operators (`(…) Tj`), unescaped and decoded, in drawing order. */
function strings(content: string): string[] {
  const out: string[] = [];
  for (const match of content.matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj/g)) {
    const raw = (match[1] ?? '').replace(/\\([0-7]{1,3}|.)/g, (_, escaped: string) =>
      /^[0-7]+$/.test(escaped) ? String.fromCharCode(parseInt(escaped, 8)) : escaped,
    );
    out.push(decode(raw));
  }
  return out;
}

/**
 * What a PDF made by the kit says, for tests: every line of text in drawing order, and the number
 * of pages. Reads compressed content streams, so it checks the file that ships.
 */
export async function readPdf(
  file: Blob,
): Promise<{ lines: string[]; text: string; pages: number }> {
  const data = Buffer.from(await file.arrayBuffer());
  const lines = streams(data).flatMap(strings);
  const pages = data.toString('latin1').match(/\/Type \/Page\b(?!s)/g)?.length ?? 0;
  return { lines, text: lines.join('\n'), pages };
}
