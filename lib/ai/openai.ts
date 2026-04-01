import { AIService, AIMessage, AIRecipeResult, AIFoodAnalysis, AIQuantityRecommendation, AIMealPlanResult } from './types';

const API_BASE = process.env.EXPO_PUBLIC_AI_API_BASE ?? 'https://api.openai.com/v1';
const API_KEY = process.env.EXPO_PUBLIC_AI_API_KEY ?? '';
const MODEL = process.env.EXPO_PUBLIC_AI_MODEL ?? 'gpt-4o';

const AI_TIMEOUT_MS = 90_000; // reasoning models can take longer to respond

function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

async function callAPI(messages: AIMessage[]): Promise<string> {
  if (!API_KEY) {
    throw new Error('AI API key is not configured. Check your .env file for EXPO_PUBLIC_AI_API_KEY.');
  }

  console.log('[AI] Calling', API_BASE, 'model:', MODEL);

  // #region agent log
  const _dbgStart = Date.now();
  const _dbgBodyLen = JSON.stringify(messages).length;
  fetch('http://127.0.0.1:7940/ingest/ae36240b-e3cc-4d35-bffd-8b7ab31fcc2a',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'a856e8'},body:JSON.stringify({sessionId:'a856e8',location:'openai.ts:callAPI',message:'AI call started',data:{apiBase:API_BASE,model:MODEL,hasKey:!!API_KEY,keyPrefix:API_KEY?.slice(0,8),msgCount:messages.length,bodyLen:_dbgBodyLen,timeoutMs:AI_TIMEOUT_MS},timestamp:Date.now(),hypothesisId:'H1,H3,H4'})}).catch(()=>{});
  // #endregion

  let response: Response;
  try {
    response = await fetchWithTimeout(
      `${API_BASE}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({
          model: MODEL,
          messages,
          temperature: 0.7,
          max_tokens: 8000,
        }),
      },
      AI_TIMEOUT_MS,
    );
  } catch (err: any) {
    // #region agent log
    const _dbgElapsed = Date.now() - _dbgStart;
    fetch('http://127.0.0.1:7940/ingest/ae36240b-e3cc-4d35-bffd-8b7ab31fcc2a',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'a856e8'},body:JSON.stringify({sessionId:'a856e8',location:'openai.ts:callAPI:catch',message:'AI call FAILED',data:{errName:err.name,errMsg:err.message,elapsedMs:_dbgElapsed,bodyLen:_dbgBodyLen,isAbort:err.name==='AbortError'},timestamp:Date.now(),hypothesisId:'H1,H2,H5'})}).catch(()=>{});
    // #endregion
    if (err.name === 'AbortError') {
      throw new Error('The AI took too long to respond. Please try again.');
    }
    throw new Error(`Could not reach the AI service. Check your internet connection.`);
  }

  // #region agent log
  const _dbgResElapsed = Date.now() - _dbgStart;
  fetch('http://127.0.0.1:7940/ingest/ae36240b-e3cc-4d35-bffd-8b7ab31fcc2a',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'a856e8'},body:JSON.stringify({sessionId:'a856e8',location:'openai.ts:callAPI:response',message:'AI call got response',data:{status:response.status,ok:response.ok,elapsedMs:_dbgResElapsed},timestamp:Date.now(),hypothesisId:'H1,H3'})}).catch(()=>{});
  // #endregion

  // #region agent log
  console.log('[DEBUG-8fb698] openai callAPI response status=' + response.status + ' ok=' + response.ok);
  // #endregion

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    console.warn('[AI] Error response:', response.status, body);
    throw new Error(`AI request failed (${response.status}). Try again in a moment.`);
  }

  let rawBody: string;
  try {
    rawBody = await response.text();
  } catch (textErr: any) {
    // #region agent log
    console.log('[DEBUG-8fb698] openai callAPI FAILED to read body: ' + textErr.message);
    // #endregion
    throw textErr;
  }

  // #region agent log
  console.log('[DEBUG-8fb698] openai callAPI rawBody length=' + rawBody.length + ' first200=' + rawBody.slice(0, 200));
  console.log('[DEBUG-8fb698] openai callAPI rawBody last200=' + rawBody.slice(-200));
  // #endregion

  let data: any;
  try {
    data = JSON.parse(rawBody);
  } catch (jsonErr: any) {
    // #region agent log
    console.log('[DEBUG-8fb698] openai callAPI JSON.parse FAILED: ' + jsonErr.message + ' bodyLen=' + rawBody.length);
    // #endregion
    throw jsonErr;
  }

  const message = data.choices?.[0]?.message;
  const content = message?.content ?? message?.reasoning ?? null;

  // #region agent log
  console.log('[DEBUG-8fb698] openai callAPI extracted hasContent=' + !!content + ' contentLen=' + content?.length + ' finishReason=' + data.choices?.[0]?.finish_reason);
  // #endregion

  if (!content) {
    console.warn('[AI] Unexpected response shape:', JSON.stringify(data).slice(0, 500));
    throw new Error('The AI returned an empty response. Please try again.');
  }

  return content;
}

/**
 * Extracts a JSON object from text that might contain markdown fences
 * or extra prose around the JSON.
 */
function parseJSON<T>(text: string): T {
  // #region agent log
  console.log('[DEBUG-8fb698] openai parseJSON entry textLen=' + text?.length + ' first200=' + text?.slice(0, 200));
  // #endregion

  const stripped = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  try {
    return JSON.parse(stripped);
  } catch (e1: any) {
    // #region agent log
    console.log('[DEBUG-8fb698] openai parseJSON first parse FAILED: ' + e1.message + ' strippedLen=' + stripped.length);
    // #endregion

    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch (e2: any) {
        // #region agent log
        console.log('[DEBUG-8fb698] openai parseJSON second parse FAILED: ' + e2.message + ' sliceLen=' + (end + 1 - start));
        // #endregion
        throw e2;
      }
    }
    throw new Error('Could not find valid JSON in the AI response. Please try again.');
  }
}

export class OpenAIService implements AIService {
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

  async generateMealPlan(params: {
    recipes: { id: string; title: string; calories: number | null; protein: number | null; carbs: number | null; fat: number | null; tags: string[] }[];
    dailyCalories: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
    dietaryRestrictions: string[];
    daysToGenerate: number;
    lockedMeals?: { day: string; meal_type: string; recipe_id: string }[];
  }): Promise<AIMealPlanResult> {
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].slice(0, params.daysToGenerate);
    const messages: AIMessage[] = [
      {
        role: 'system',
        content: `You are a meal planning assistant. Create a meal plan using ONLY the provided recipes. Target approximately ${params.dailyCalories} calories/day with macros: ${params.proteinG}g protein, ${params.carbsG}g carbs, ${params.fatG}g fat. Respect dietary restrictions: ${params.dietaryRestrictions.join(', ') || 'none'}. Return JSON with a "days" array, each containing "day" (string) and "meals" array with {meal_type, recipe_id, servings}. Vary recipes across days. Each day should have breakfast, lunch, dinner, and optionally a snack.`,
      },
      {
        role: 'user',
        content: `Available recipes:\n${JSON.stringify(params.recipes)}\n\nGenerate a plan for: ${days.join(', ')}\n${params.lockedMeals?.length ? `Keep these meals locked: ${JSON.stringify(params.lockedMeals)}` : ''}`,
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
