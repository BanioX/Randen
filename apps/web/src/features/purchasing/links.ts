import { paths } from '../../app/paths';

/**
 * Addresses of the feature that `app/paths.ts` does not have yet, built on top of it: the purchase
 * at a market is a view of the purchasing page until it gets its own path.
 */
export const purchasingLinks = {
  record: (marketId?: string) =>
    marketId === undefined
      ? `${paths.purchasing()}?view=record`
      : `${paths.purchasing()}?view=record&market=${marketId}`,
  purchasing: (marketId?: string) =>
    marketId === undefined ? paths.purchasing() : `${paths.purchasing()}?market=${marketId}`,
} as const;
