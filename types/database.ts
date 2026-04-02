export type GoalType = 'lose' | 'maintain' | 'gain';
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export type DayOfWeek = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
export type RecipeSource = 'image' | 'manual' | 'ai';
export type MealPlanStatus = 'draft' | 'active' | 'completed';
export type ShoppingListStatus = 'active' | 'completed';
export type Difficulty = 'easy' | 'medium' | 'hard';
export type HealthObjective =
  | 'longevity'
  | 'cognitive_focus'
  | 'muscle_hypertrophy'
  | 'metabolic_health'
  | 'inflammation_reduction'
  | 'performance';

export type CookingEffort = 'low' | 'medium' | 'high';
export type SpiceTolerance = 'mild' | 'medium' | 'hot';
export type RepeatTolerance = 'low' | 'medium' | 'high';
export type BudgetSensitivity = 'low' | 'medium' | 'high';
export type MeasurementSystem = 'metric' | 'imperial';

export type PreferenceSignalType =
  | 'onboarding_like'
  | 'recipe_like'
  | 'recipe_dislike'
  | 'meal_swapped_out'
  | 'meal_swapped_in'
  | 'meal_cooked'
  | 'meal_skipped'
  | 'recipe_saved'
  | 'manual_recipe_import';

export interface Profile {
  id: string;
  user_id: string;
  display_name: string | null;
  height_cm: number | null;
  activity_level: 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
  dietary_restrictions: string[];
  health_objectives: HealthObjective[];
  preferred_cuisines: string[];
  disliked_ingredients: string[];
  favorite_proteins: string[];
  cooking_effort: CookingEffort;
  prep_time_preference_minutes: number;
  weekday_cooking_time: string;
  spice_tolerance: SpiceTolerance;
  repeat_tolerance: RepeatTolerance;
  budget_sensitivity: BudgetSensitivity;
  equipment_constraints: string[];
  location: string | null;
  household_size: number;
  measurement_system: MeasurementSystem;
  created_at: string;
  updated_at: string;
}

export interface BodyLog {
  id: string;
  user_id: string;
  date: string;
  weight_kg: number;
  notes: string | null;
  created_at: string;
}

export interface BodyGoal {
  id: string;
  user_id: string;
  goal_type: GoalType;
  target_weight_kg: number | null;
  target_date: string | null;
  daily_calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number | null;
  hydration_ml: number | null;
  created_at: string;
  updated_at: string;
}

export interface Ingredient {
  name: string;
  quantity: number;
  unit: string;
  category?: string;
}

export interface GeneratedRecipeDraft {
  title: string;
  description: string | null;
  ingredients: Ingredient[];
  instructions: string[];
  servings: number;
  prep_time_minutes: number | null;
  cook_time_minutes: number | null;
  calories_per_serving: number | null;
  protein_per_serving: number | null;
  carbs_per_serving: number | null;
  fat_per_serving: number | null;
  tags: string[];
}

export interface Recipe {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  source_url: string | null;
  source_type: RecipeSource;
  image_url: string | null;
  ingredients: Ingredient[];
  instructions: string[];
  servings: number;
  prep_time_minutes: number | null;
  cook_time_minutes: number | null;
  calories_per_serving: number | null;
  protein_per_serving: number | null;
  carbs_per_serving: number | null;
  fat_per_serving: number | null;
  difficulty: Difficulty | null;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface MealPlan {
  id: string;
  user_id: string;
  week_start_date: string;
  status: MealPlanStatus;
  created_at: string;
  updated_at: string;
}

export interface MealPlanItem {
  id: string;
  meal_plan_id: string;
  recipe_id: string | null;
  day_of_week: DayOfWeek;
  meal_type: MealType;
  servings: number;
  source_type: 'db' | 'generated';
  generated_recipe: GeneratedRecipeDraft | null;
  generated_title: string | null;
  recipe?: Recipe;
}

export interface ShoppingList {
  id: string;
  user_id: string;
  meal_plan_id: string | null;
  name: string;
  status: ShoppingListStatus;
  created_at: string;
  updated_at: string;
}

export interface ShoppingListItem {
  id: string;
  shopping_list_id: string;
  name: string;
  quantity: number;
  unit: string;
  category: string;
  is_purchased: boolean;
  recipe_source_ids: string[];
  notes: string | null;
  estimated_price: number | null;
}

export interface PantryItem {
  id: string;
  user_id: string;
  name: string;
  quantity: number;
  unit: string;
  expiry_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExerciseLog {
  id: string;
  user_id: string;
  date: string;
  activity_type: string;
  duration_minutes: number;
  calories_burned: number | null;
  created_at: string;
}

export interface HydrationLog {
  id: string;
  user_id: string;
  date: string;
  amount_ml: number;
  created_at: string;
}

export type FoodLogStatus = 'on_track' | 'deviated' | 'skipped';

/** Tracks what the user actually ate for a given meal slot */
export interface FoodLog {
  id: string;
  user_id: string;
  date: string;
  meal_type: MealType;
  meal_plan_item_id: string | null;
  image_url: string | null;
  actual_recipe_id: string | null;
  description: string | null;
  status: FoodLogStatus;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  ai_notes: string | null;
  created_at: string;
}

/** AI-generated suggestion to adjust a meal after a deviation was logged */
export interface PlanAdjustment {
  id: string;
  user_id: string;
  meal_plan_id: string;
  food_log_id: string;
  affected_meal_plan_item_id: string;
  original_recipe_id: string;
  suggested_recipe_id: string;
  reason: string;
  status: 'pending' | 'accepted' | 'dismissed';
  created_at: string;
}

export interface UserPreferenceSignal {
  id: string;
  user_id: string;
  signal_type: PreferenceSignalType;
  entity_type: 'recipe' | 'ingredient' | 'cuisine' | 'tag' | 'meal_plan_item' | 'cooking_effort';
  entity_key: string;
  weight: number;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface UserTasteProfile {
  id: string;
  user_id: string;
  ingredient_scores: Record<string, number>;
  cuisine_scores: Record<string, number>;
  tag_scores: Record<string, number>;
  effort_preference: CookingEffort;
  spice_preference: SpiceTolerance;
  variety_preference: RepeatTolerance;
  created_at: string;
  updated_at: string;
}

export interface MealFeedback {
  id: string;
  meal_plan_item_id: string;
  user_id: string;
  feedback_type: 'liked' | 'disliked' | 'swapped' | 'cooked' | 'skipped';
  reason: string | null;
  created_at: string;
}
