/**
 * Every address of the app in one place. Features link to each other only through these
 * builders, so a path can change without a search through the code. Path segments are English
 * (like the code), what people read is German.
 */
export const paths = {
  cockpit: () => '/',
  /** The hub behind «＋ Erfassen» on the phone: goods receipt, write-off, production … */
  add: () => '/add',

  // Lager
  stock: () => '/stock',
  stockExpiring: () => '/stock/expiring',
  stockArticle: (articleId: string) => `/stock/articles/${articleId}`,
  receive: (orderId?: string) => (orderId ? `/stock/receive?order=${orderId}` : '/stock/receive'),
  waste: (lotId?: string) => (lotId ? `/stock/waste?lot=${lotId}` : '/stock/waste'),
  count: () => '/stock/count',
  journal: () => '/stock/journal',

  // Artikel und Lieferanten
  articles: () => '/articles',
  articleNew: () => '/articles/new',
  /** «Mehrere auf einmal»: paste one article per line. */
  articlesImport: () => '/articles/import',
  article: (articleId: string) => `/articles/${articleId}`,
  articleEdit: (articleId: string) => `/articles/${articleId}/edit`,
  suppliers: () => '/suppliers',
  supplierNew: () => '/suppliers/new',
  supplier: (supplierId: string) => `/suppliers/${supplierId}`,

  // Wo ist was?
  areas: () => '/areas',
  area: (areaId: string) => `/areas/${areaId}`,
  where: () => '/areas/where',
  tour: () => '/areas/tour',

  // Rezepte
  recipes: () => '/recipes',
  recipeNew: () => '/recipes/new',
  recipe: (recipeId: string) => `/recipes/${recipeId}`,
  recipeEdit: (recipeId: string) => `/recipes/${recipeId}/edit`,
  /** The recipe card for the pass: large type, steps, scaled quantities. */
  recipeCook: (recipeId: string) => `/recipes/${recipeId}/cook`,

  // Produktion und Menüplan
  production: () => '/production',
  productionNew: (recipeId?: string) =>
    recipeId ? `/production/new?recipe=${recipeId}` : '/production/new',
  /** One production run: what went in (traceability) and the label of what came out. */
  productionRun: (productionId: string) => `/production/${productionId}`,
  plan: () => '/plan',

  // Speisekarte
  menu: () => '/menu',
  menuCard: (cardId: string) => `/menu/${cardId}`,
  /** The list of allergens per dish, for the staff. */
  menuAllergens: (cardId: string) => `/menu/${cardId}/allergens`,
  /** The guest view: full screen, without the app around it. */
  guest: (cardId: string) => `/guest/${cardId}`,

  // Einkauf
  purchasing: () => '/purchasing',
  orders: () => '/purchasing/orders',
  order: (orderId: string) => `/purchasing/orders/${orderId}`,

  // Zahlen
  numbers: () => '/numbers',
  sales: () => '/numbers/sales',
  budget: () => '/numbers/budget',
  margins: () => '/numbers/margins',
  menuEngineering: () => '/numbers/menu-engineering',
  breakEven: () => '/numbers/break-even',
  wasteReport: () => '/numbers/waste',
  monthReport: () => '/numbers/report',

  // HACCP
  haccp: () => '/haccp',
  temperatures: () => '/haccp/temperatures',
  hygieneTasks: () => '/haccp/tasks',
  haccpReport: () => '/haccp/report',

  // Betrieb
  more: () => '/more',
  business: () => '/more/business',
  team: () => '/more/team',
  data: () => '/more/data',
  demo: () => '/more/demo',
  about: () => '/more/about',
  styleguide: () => '/styleguide',
} as const;
