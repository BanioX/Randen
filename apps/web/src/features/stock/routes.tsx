import type { RouteObject } from 'react-router';

/**
 * Pages of «Lager» inside the app frame, each loaded when it is first opened. «Bestand» and
 * «Ablauf» are two views of one page; the path patterns are those of `app/paths.ts`.
 */
export const stockRoutes: RouteObject[] = [
  {
    path: 'stock',
    lazy: async () => ({ Component: (await import('./StockPage')).StockPage }),
  },
  {
    path: 'stock/expiring',
    lazy: async () => ({ Component: (await import('./StockPage')).StockPage }),
  },
  {
    path: 'stock/articles/:articleId',
    lazy: async () => ({ Component: (await import('./StockArticlePage')).StockArticlePage }),
  },
  {
    path: 'stock/receive',
    lazy: async () => ({ Component: (await import('./ReceivePage')).ReceivePage }),
  },
  {
    path: 'stock/waste',
    lazy: async () => ({ Component: (await import('./WastePage')).WastePage }),
  },
  {
    path: 'stock/count',
    lazy: async () => ({ Component: (await import('./CountPage')).CountPage }),
  },
  {
    path: 'stock/journal',
    lazy: async () => ({ Component: (await import('./JournalPage')).JournalPage }),
  },
];
