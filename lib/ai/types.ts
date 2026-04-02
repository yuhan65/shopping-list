export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | AIContentPart[];
}

export type AIContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export interface AIRecipeResult {
  title: string;
  description: string;
  ingredients: { name: string; quantity: number; unit: string; category?: string }[];
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

export interface AIFoodAnalysis {
  product_name: string;
  brand: string | null;
  package_size: string;
  package_weight_g: number | null;
  calories_per_serving: number | null;
  protein_per_serving: number | null;
  carbs_per_serving: number | null;
  fat_per_serving: number | null;
  servings_per_package: number | null;
}

export interface AIQuantityRecommendation {
  product_name: string;
  recommended_quantity: number;
  reasoning: string;
  total_needed: string;
  package_coverage: string;
}

export interface AIMealPlanResult {
  days: {
    day: string;
    meals: AIMealPlanMeal[];
  }[];
}

export interface AIMealPlanGeneratedRecipe {
  title: string;
  description: string;
  ingredients: { name: string; quantity: number; unit: string; category?: string }[];
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

export type AIMealPlanMeal =
  | {
      meal_type: 'breakfast' | 'lunch' | 'dinner' | 'snack';
      source_type: 'db';
      recipe_id: string;
      servings: number;
    }
  | {
      meal_type: 'breakfast' | 'lunch' | 'dinner' | 'snack';
      source_type: 'generated';
      servings: number;
      generated_recipe: AIMealPlanGeneratedRecipe;
    };

export interface AIMealPlanParams {
  recipes: {
    id: string;
    title: string;
    calories: number | null;
    protein: number | null;
    carbs: number | null;
    fat: number | null;
    tags: string[];
    priority_score?: number;
  }[];
  dailyCalories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  dietaryRestrictions: string[];
  dietaryPreferences?: string[];
  preferredCuisines?: string[];
  dislikedIngredients?: string[];
  favoriteProteins?: string[];
  cookingEffort?: 'low' | 'medium' | 'high';
  prepTimeTargetMinutes?: number;
  spiceTolerance?: 'mild' | 'medium' | 'hot';
  repeatTolerance?: 'low' | 'medium' | 'high';
  budgetSensitivity?: 'low' | 'medium' | 'high';
  pantryIngredients?: string[];
  daysToGenerate: number;
  lockedMeals?: { day: string; meal_type: string; recipe_id: string }[];
}

export interface AIService {
  parseRecipeFromImage(imageBase64: string): Promise<AIRecipeResult>;
  parseRecipeFromDescription(description: string): Promise<AIRecipeResult>;
  analyzeFoodProduct(imageBase64: string): Promise<AIFoodAnalysis>;
  recommendQuantity(
    analysis: AIFoodAnalysis,
    shoppingListItem: { name: string; quantity: number; unit: string }
  ): Promise<AIQuantityRecommendation>;
  generateMealPlan(params: AIMealPlanParams): Promise<AIMealPlanResult>;
  suggestSubstitution(params: {
    ingredient: string;
    reason: string;
    dietaryRestrictions: string[];
  }): Promise<{ substitutes: { name: string; ratio: string; notes: string }[] }>;
  chat(messages: AIMessage[]): Promise<string>;
}
