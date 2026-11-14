import type { RouteObject } from 'react-router';

/**
 * Pages of «Wo ist was?» inside the app frame, each loaded when it is first opened. The path
 * patterns are those of `app/paths.ts`; the fixed ones (`where`, `tour`) win over an area id.
 */
export const areasRoutes: RouteObject[] = [
  {
    path: 'areas',
    lazy: async () => ({ Component: (await import('./AreasPage')).AreasPage }),
  },
  {
    path: 'areas/where',
    lazy: async () => ({ Component: (await import('./WherePage')).WherePage }),
  },
  {
    path: 'areas/tour',
    lazy: async () => ({ Component: (await import('./TourPage')).TourPage }),
  },
  {
    path: 'areas/:areaId',
    lazy: async () => ({ Component: (await import('./AreaDetailPage')).AreaDetailPage }),
  },
];
