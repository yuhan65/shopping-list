/**
 * Safe recipe title for <Text> — API or bad data can store non-strings in `title`
 * (e.g. URL objects), which React cannot render as text children.
 */
import type { Recipe } from '@/types/database';

export function mealTitle(recipe: Recipe | undefined): string {
  const t = recipe?.title;
  if (typeof t === 'string' && t.trim().length > 0) return t;
  return 'Recipe';
}
