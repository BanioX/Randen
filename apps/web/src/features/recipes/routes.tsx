import type { RouteObject } from 'react-router';

/** Pages of «Rezepte» inside the app frame, loaded when first opened. */
export const recipesRoutes: RouteObject[] = [
  {
    path: 'recipes',
    lazy: async () => ({ Component: (await import('./RecipesPage')).RecipesPage }),
  },
  {
    path: 'recipes/new',
    lazy: async () => ({ Component: (await import('./RecipeFormPage')).RecipeNewPage }),
  },
  {
    path: 'recipes/:recipeId',
    lazy: async () => ({ Component: (await import('./RecipeDetailPage')).RecipeDetailPage }),
  },
  {
    path: 'recipes/:recipeId/edit',
    lazy: async () => ({ Component: (await import('./RecipeFormPage')).RecipeEditPage }),
  },
  {
    path: 'recipes/:recipeId/cook',
    lazy: async () => ({ Component: (await import('./RecipeCookPage')).RecipeCookPage }),
  },
];
