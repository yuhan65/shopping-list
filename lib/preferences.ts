import type {
  Recipe,
  UserPreferenceSignal,
  UserTasteProfile,
  CookingEffort,
  SpiceTolerance,
  RepeatTolerance,
} from '@/types/database';

const SIGNAL_BASE_WEIGHT: Record<UserPreferenceSignal['signal_type'], number> = {
  onboarding_like: 1.5,
  recipe_like: 1.8,
  recipe_dislike: -2.2,
  meal_swapped_out: -1.5,
  meal_swapped_in: 1.2,
  meal_cooked: 1.4,
  meal_skipped: -1.6,
  recipe_saved: 2,
  manual_recipe_import: 1.3,
};

function daysAgo(isoDate: string): number {
  const diffMs = Date.now() - new Date(isoDate).getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

function recencyMultiplier(createdAt: string): number {
  // Half-life-ish curve: recent events dominate, older events still contribute.
  const d = daysAgo(createdAt);
  return 1 / (1 + d / 14);
}

function pushScore(map: Record<string, number>, key: string, score: number) {
  if (!key) return;
  const normalized = key.trim().toLowerCase();
  if (!normalized) return;
  map[normalized] = (map[normalized] ?? 0) + score;
}

export function buildTasteProfileFromSignals(
  signals: UserPreferenceSignal[],
  seed?: Partial<UserTasteProfile>
): Pick<UserTasteProfile, 'ingredient_scores' | 'cuisine_scores' | 'tag_scores'> {
  const ingredientScores: Record<string, number> = { ...(seed?.ingredient_scores ?? {}) };
  const cuisineScores: Record<string, number> = { ...(seed?.cuisine_scores ?? {}) };
  const tagScores: Record<string, number> = { ...(seed?.tag_scores ?? {}) };

  for (const signal of signals) {
    const base = SIGNAL_BASE_WEIGHT[signal.signal_type] ?? 0;
    const score = base * (signal.weight || 1) * recencyMultiplier(signal.created_at);

    if (signal.entity_type === 'ingredient') pushScore(ingredientScores, signal.entity_key, score);
    if (signal.entity_type === 'cuisine') pushScore(cuisineScores, signal.entity_key, score);
    if (signal.entity_type === 'tag') pushScore(tagScores, signal.entity_key, score);
  }

  return { ingredient_scores: ingredientScores, cuisine_scores: cuisineScores, tag_scores: tagScores };
}

export function scoreRecipeWithPreferences(
  recipe: Recipe,
  params: {
    pantryNames: string[];
    dietaryTags: string[];
    tasteProfile?: Partial<UserTasteProfile> | null;
    effortPreference?: CookingEffort;
    prepTimePreferenceMinutes?: number;
  }
): number {
  const pantrySet = new Set(params.pantryNames.map((x) => x.toLowerCase()));
  const dietSet = new Set(params.dietaryTags.map((x) => x.toLowerCase()));
  const tags = (recipe.tags || []).map((x) => x.toLowerCase());

  const ingredientHits = (recipe.ingredients || []).filter((ing) =>
    pantrySet.has(String(ing.name || '').toLowerCase())
  ).length;
  const dietTagHits = tags.filter((tag) => dietSet.has(tag)).length;

  const tasteProfile = params.tasteProfile;
  const ingredientBias = (recipe.ingredients || []).reduce(
    (acc, ing) => acc + (tasteProfile?.ingredient_scores?.[String(ing.name || '').toLowerCase()] ?? 0),
    0
  );
  const tagBias = tags.reduce((acc, tag) => acc + (tasteProfile?.tag_scores?.[tag] ?? 0), 0);

  let effortBias = 0;
  const prep = recipe.prep_time_minutes ?? 0;
  const effort = params.effortPreference ?? 'medium';
  const prepTarget = params.prepTimePreferenceMinutes ?? 30;
  if (effort === 'low') effortBias = prep <= prepTarget ? 2 : -2;
  if (effort === 'high') effortBias = prep >= prepTarget ? 1 : -0.5;

  const macroCoverage =
    recipe.calories_per_serving != null &&
    recipe.protein_per_serving != null &&
    recipe.carbs_per_serving != null &&
    recipe.fat_per_serving != null
      ? 1
      : 0;

  // Preferences are intentionally highest weight.
  return ingredientBias * 3 + tagBias * 2.4 + ingredientHits * 1.4 + dietTagHits * 1.2 + effortBias + macroCoverage;
}

export function profileFromOnboarding(input: {
  cookingEffort: CookingEffort;
  spiceTolerance: SpiceTolerance;
  repeatTolerance: RepeatTolerance;
}): Pick<UserTasteProfile, 'effort_preference' | 'spice_preference' | 'variety_preference'> {
  return {
    effort_preference: input.cookingEffort,
    spice_preference: input.spiceTolerance,
    variety_preference: input.repeatTolerance,
  };
}
