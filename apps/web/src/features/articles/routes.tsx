import type { RouteObject } from 'react-router';

/**
 * Pages of «Artikel» and «Lieferanten» inside the app frame. Suppliers have no entry of their
 * own in the navigation: the article list leads to them and they lead back.
 */
export const articlesRoutes: RouteObject[] = [
  {
    path: 'articles',
    lazy: async () => ({ Component: (await import('./ArticlesPage')).ArticlesPage }),
  },
  {
    path: 'articles/new',
    lazy: async () => ({ Component: (await import('./ArticleFormPage')).ArticleNewPage }),
  },
  {
    path: 'articles/import',
    lazy: async () => ({ Component: (await import('./ArticlesImportPage')).ArticlesImportPage }),
  },
  {
    path: 'articles/:articleId',
    lazy: async () => ({ Component: (await import('./ArticleDetailPage')).ArticleDetailPage }),
  },
  {
    path: 'articles/:articleId/edit',
    lazy: async () => ({ Component: (await import('./ArticleFormPage')).ArticleEditPage }),
  },
  {
    path: 'suppliers',
    lazy: async () => ({ Component: (await import('./SuppliersPage')).SuppliersPage }),
  },
  {
    path: 'suppliers/new',
    lazy: async () => ({ Component: (await import('./SupplierNewPage')).SupplierNewPage }),
  },
  {
    path: 'suppliers/:supplierId',
    lazy: async () => ({ Component: (await import('./SupplierDetailPage')).SupplierDetailPage }),
  },
];
