import { formatDecimal } from '@randen/core';
import { settingsMessages } from './messages';

const t = settingsMessages.units;

/** A size as a person reads it: «412 KB», «3.2 MB», «1.1 GB», with the Swiss decimal point. */
export function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000_000) {
    return `${formatDecimal(bytes / 1_000_000_000, { digits: 2 })} ${t.gb}`;
  }
  if (bytes >= 1_000_000) {
    return `${formatDecimal(bytes / 1_000_000, { digits: 1 })} ${t.mb}`;
  }
  return `${formatDecimal(bytes / 1000, { digits: 0 })} ${t.kb}`;
}
