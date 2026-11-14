import type { ExpiryGroup } from '@randen/core';
import { paths } from '../../app/paths';

/**
 * Addresses inside «Lager» that carry a filter. They build on `paths`, so the path itself still
 * lives in one place; only the query part is ours.
 */
export const stockLinks = {
  /** The stock list narrowed to articles under their minimum. */
  belowMin: () => `${paths.stock()}?filter=below_min`,
  /** The expiry list narrowed to one group («Heute», «In 3 Tagen»). */
  expiringGroup: (group: ExpiryGroup) => `${paths.stockExpiring()}?group=${group}`,
  /** Goods receipt in the mode for the first stock of a business. */
  openingStock: () => `${paths.receive()}?mode=opening`,
} as const;
