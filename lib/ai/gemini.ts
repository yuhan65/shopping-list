/**
 * Purpose: Gemini AI service facade for app screens.
 * Actual provider requests are sent through the ai-chat edge function.
 */
import {
  AIService,
  AIMessage,
  AIRecipeResult,
  AIFoodAnalysis,
  AIQuantityRecommendation,
  AIMealPlanResult,
  AIMealPlanParams,
} from './types';
import { callAIThroughEdge } from './edgeClient';

async function callAPI(messages: AIMessage[]): Promise<string> {
  return callAIThroughEdge(messages, { provider: 'gemini' });
}

function parseJSON<T>(text: string): T {
  const stripped = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  try {
    return JSON.parse(stripped);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        throw new Error('Could not find valid JSON in the AI response. Please try again.');
      }
    }
    throw new Error('Could not find valid JSON in the AI response. Please try again.');
  }
}

export class GeminiService implements AIService {
  async parseRecipeFromImage(imageBase64: string): Promise<AIRecipeResult> {
    const messages: AIMessage[] = [
      {
        role: 'system',
        content: `You are a recipe extraction assistant. Look at the provided image (a screenshot or photo of a recipe) and extract the recipe into structured data. Return JSON with these fields: title, description, ingredients (array of {name, quantity, unit, category}), instructions (array of strings), servings, prep_time_minutes, cook_time_minutes, calories_per_serving, protein_per_serving, carbs_per_serving, fat_per_serving, tags. Estimate nutrition if not explicitly shown. Use metric units. The category for each ingredient should be one of: produce, dairy, meat, seafood, bakery, frozen, canned, dry_goods, condiments, beverages, snacks, other. If the image contains text in any language, translate the recipe to English.`,
      },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Extract the recipe from this image:' },
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
        ],
      },
    ];
    const result = await callAPI(messages);
    return parseJSON<AIRecipeResult>(result);
  }

  async parseRecipeFromDescription(description: string): Promise<AIRecipeResult> {
    const messages: AIMessage[] = [
      {
        role: 'system',
        content: `You are a recipe creation assistant. Create a structured recipe based on the user's description. Return JSON with: title, description, ingredients (array of {name, quantity, unit, category}), instructions (array of strings), servings, prep_time_minutes, cook_time_minutes, calories_per_serving, protein_per_serving, carbs_per_serving, fat_per_serving, tags. Provide realistic nutrition estimates. Use metric units. The category for each ingredient should be one of: produce, dairy, meat, seafood, bakery, frozen, canned, dry_goods, condiments, beverages, snacks, other.`,
      },
      {
        role: 'user',
        content: description,
      },
    ];
    const result = await callAPI(messages);
    return parseJSON<AIRecipeResult>(result);
  }

  async analyzeFoodProduct(imageBase64: string): Promise<AIFoodAnalysis> {
    const messages: AIMessage[] = [
      {
        role: 'system',
        content: `You are a food product analysis assistant. Analyze the food product image and extract: product_name, brand, package_size (human readable string), package_weight_g, calories_per_serving, protein_per_serving, carbs_per_serving, fat_per_serving, servings_per_package. Return JSON. If you can read a nutrition label, use those values. Otherwise estimate.`,
      },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Analyze this food product:' },
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
        ],
      },
    ];
    const result = await callAPI(messages);
    return parseJSON<AIFoodAnalysis>(result);
  }

  async recommendQuantity(
    analysis: AIFoodAnalysis,
    shoppingListItem: { name: string; quantity: number; unit: string }
  ): Promise<AIQuantityRecommendation> {
    const messages: AIMessage[] = [
      {
        role: 'system',
        content: `You are a shopping assistant. Based on the food product analysis and the shopping list requirement, recommend how many packages the user should buy. Return JSON with: product_name, recommended_quantity (integer), reasoning, total_needed (human-readable), package_coverage (human-readable explanation of how much each package provides).`,
      },
      {
        role: 'user',
        content: `Product: ${JSON.stringify(analysis)}\nShopping list need: ${shoppingListItem.quantity} ${shoppingListItem.unit} of ${shoppingListItem.name}`,
      },
    ];
    const result = await callAPI(messages);
    return parseJSON<AIQuantityRecommendation>(result);
  }

  async generateMealPlan(params: AIMealPlanParams): Promise<AIMealPlanResult> {
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].slice(0, params.daysToGenerate);
    const dietaryPreferences = params.dietaryPreferences?.join(', ') || 'none';
    const pantryIngredients = params.pantryIngredients?.join(', ') || 'none';
    const preferredCuisines = params.preferredCuisines?.join(', ') || 'none';
    const dislikedIngredients = params.dislikedIngredients?.join(', ') || 'none';
    const favoriteProteins = params.favoriteProteins?.join(', ') || 'none';
    const messages: AIMessage[] = [
      {
        role: 'system',
        content: `You are a meal planning assistant. Create a weekly plan that can mix saved recipes and new generated meals.

Target approximately ${params.dailyCalories} calories/day with macros: ${params.proteinG}g protein, ${params.carbsG}g carbs, ${params.fatG}g fat.
Dietary restrictions (must obey): ${params.dietaryRestrictions.join(', ') || 'none'}.
Dietary preferences (try to favor): ${dietaryPreferences}.
Preferred cuisines (high priority): ${preferredCuisines}.
Favorite proteins (high priority): ${favoriteProteins}.
Disliked ingredients (avoid unless impossible): ${dislikedIngredients}.
Pantry ingredients to prioritize where possible: ${pantryIngredients}.
Cooking effort preference: ${params.cookingEffort || 'medium'}.
Prep time target per meal: ${params.prepTimeTargetMinutes || 30} minutes.
Spice tolerance: ${params.spiceTolerance || 'medium'}.
Repeat tolerance: ${params.repeatTolerance || 'medium'}.
Budget sensitivity: ${params.budgetSensitivity || 'medium'}.

IMPORTANT PRIORITY RULES:
1) Respect hard restrictions and dislikes first.
2) Taste preference is the highest ranking factor.
3) Prefer saved database recipes when fit is close.
4) Use generated meals only when they better fit preferences, pantry usage, or variety.
5) If recipes include priority_score, treat higher scores as stronger preference.

Return strict JSON with this shape:
{
  "days": [
    {
      "day": "monday",
      "meals": [
        {
          "meal_type": "breakfast|lunch|dinner|snack",
          "source_type": "db",
          "recipe_id": "uuid",
          "servings": 1
        },
        {
          "meal_type": "breakfast|lunch|dinner|snack",
          "source_type": "generated",
          "servings": 1,
          "generated_recipe": {
            "title": "string",
            "description": "string",
            "ingredients": [{"name":"string","quantity":1,"unit":"string","category":"other"}],
            "instructions": ["step 1", "step 2"],
            "servings": 1,
            "prep_time_minutes": 15,
            "cook_time_minutes": 20,
            "calories_per_serving": 500,
            "protein_per_serving": 30,
            "carbs_per_serving": 50,
            "fat_per_serving": 15,
            "tags": ["high protein"]
          }
        }
      ]
    }
  ]
}

Each day should have breakfast, lunch, dinner, and optionally a snack. Keep variety across the week.`,
      },
      {
        role: 'user',
        content: `Saved DB recipes:\n${JSON.stringify(params.recipes)}\n\nGenerate a plan for: ${days.join(', ')}\n${params.lockedMeals?.length ? `Keep these meals locked: ${JSON.stringify(params.lockedMeals)}` : ''}`,
      },
    ];
    const result = await callAPI(messages);
    return parseJSON<AIMealPlanResult>(result);
  }

  async suggestSubstitution(params: {
    ingredient: string;
    reason: string;
    dietaryRestrictions: string[];
  }): Promise<{ substitutes: { name: string; ratio: string; notes: string }[] }> {
    const messages: AIMessage[] = [
      {
        role: 'system',
        content: `You are a cooking substitution assistant. Suggest ingredient substitutions that maintain similar nutritional profile and taste. Consider dietary restrictions: ${params.dietaryRestrictions.join(', ') || 'none'}. Return JSON with "substitutes" array containing {name, ratio (e.g. "1:1"), notes}.`,
      },
      {
        role: 'user',
        content: `Suggest substitutes for "${params.ingredient}". Reason: ${params.reason}`,
      },
    ];
    const result = await callAPI(messages);
    return parseJSON(result);
  }

  async chat(messages: AIMessage[]): Promise<string> {
    return callAPI(messages);
  }
}
