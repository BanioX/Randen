/** The user agent of an iPhone with iOS 27. */
export const IPHONE_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 27_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';

/**
 * Makes jsdom look like Randen installed on an iPhone (ADR-0019): an iPhone user agent and
 * `navigator.standalone`, plus the fields a test adds (`share`, `canShare`). Returns the undo,
 * which removes every field again; call it in `finally` or `afterEach`.
 */
export function pretendInstalledIphone(fields: Record<string, unknown> = {}): () => void {
  const all: Record<string, unknown> = { userAgent: IPHONE_AGENT, standalone: true, ...fields };
  for (const [key, value] of Object.entries(all)) {
    Object.defineProperty(window.navigator, key, { value, configurable: true, writable: true });
  }
  return () => {
    for (const key of Object.keys(all)) {
      Reflect.deleteProperty(window.navigator, key);
    }
  };
}
