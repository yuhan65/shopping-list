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
    meals: {
      meal_type: 'breakfast' | 'lunch' | 'dinner' | 'snack';
      recipe_id: string;
      servings: number;
    }[];
  }[];
}

export interface AIService {
  parseRecipeFromImage(imageBase64: string): Promise<AIRecipeResult>;
  parseRecipeFromDescription(description: string): Promise<AIRecipeResult>;
  analyzeFoodProduct(imageBase64: string): Promise<AIFoodAnalysis>;
  recommendQuantity(
    analysis: AIFoodAnalysis,
    shoppingListItem: { name: string; quantity: number; unit: string }
  ): Promise<AIQuantityRecommendation>;
  generateMealPlan(params: {
    recipes: { id: string; title: string; calories: number | null; protein: number | null; carbs: number | null; fat: number | null; tags: string[] }[];
    dailyCalories: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
    dietaryRestrictions: string[];
    daysToGenerate: number;
    lockedMeals?: { day: string; meal_type: string; recipe_id: string }[];
  }): Promise<AIMealPlanResult>;
  suggestSubstitution(params: {
    ingredient: string;
    reason: string;
    dietaryRestrictions: string[];
  }): Promise<{ substitutes: { name: string; ratio: string; notes: string }[] }>;
  chat(messages: AIMessage[]): Promise<string>;
}
