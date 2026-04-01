/**
 * Google Gemini AI service. Translates our app's AI calls into
 * Google's Generative Language API format.
 * Endpoint: POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}
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

const API_KEY = process.env.EXPO_PUBLIC_AI_API_KEY ?? '';
// Default: Flash-Lite — Google’s fastest / most budget-friendly 2.5 model (use gemini-2.5-flash for heavier reasoning).
const MODEL = process.env.EXPO_PUBLIC_AI_MODEL ?? 'gemini-2.5-flash-lite';
const AI_TIMEOUT_MS = 90_000;
// Gemini 2.5 "thinking" models count both thinking + response tokens against
// maxOutputTokens. 8 000 was too low — the model would spend most of the budget
// thinking and truncate the actual JSON. 40 000 gives plenty of headroom while
// staying within the 65 536 model cap.
const MAX_OUTPUT_TOKENS = 40_000; 

function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

/**
 * Convert our generic AIMessage format into Gemini's format.
 * Key differences:
 *   - system message goes in a top-level "systemInstruction" field
 *   - "assistant" role is called "model" in Gemini
 *   - images use { inlineData: { mimeType, data } } instead of image_url
 */
function convertMessages(messages: AIMessage[]): {
  systemInstruction: { parts: { text: string }[] } | undefined;
  contents: { role: string; parts: any[] }[];
} {
  let systemInstruction: { parts: { text: string }[] } | undefined;
  const contents: { role: string; parts: any[] }[] = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      const text = typeof msg.content === 'string' ? msg.content : '';
      systemInstruction = { parts: [{ text }] };
      continue;
    }

    const role = msg.role === 'assistant' ? 'model' : 'user';

    if (typeof msg.content === 'string') {
      contents.push({ role, parts: [{ text: msg.content }] });
      continue;
    }

    // Convert multimodal content parts
    const parts: any[] = [];
    for (const part of msg.content) {
      if (part.type === 'text') {
        parts.push({ text: part.text });
      } else if (part.type === 'image_url') {
        const url = part.image_url.url;
        const match = url.match(/^data:(image\/\w+);base64,(.+)$/);
        if (match) {
          parts.push({
            inlineData: {
              mimeType: match[1],
              data: match[2],
            },
          });
        }
      }
    }
    contents.push({ role, parts });
  }

  return { systemInstruction, contents };
}

async function callAPI(messages: AIMessage[]): Promise<string> {
  if (!API_KEY) {
    throw new Error('AI API key is not configured. Check your .env file for EXPO_PUBLIC_AI_API_KEY.');
  }

  const { systemInstruction, contents } = convertMessages(messages);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;

  console.log('[AI] Calling Gemini API, model:', MODEL);

  // #region agent log
  const _dbgStart = Date.now();
  const _dbgBodyLen = JSON.stringify(messages).length;
  fetch('http://127.0.0.1:7940/ingest/ae36240b-e3cc-4d35-bffd-8b7ab31fcc2a',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'a856e8'},body:JSON.stringify({sessionId:'a856e8',location:'gemini.ts:callAPI',message:'AI call started',data:{model:MODEL,hasKey:!!API_KEY,keyPrefix:API_KEY?.slice(0,8),msgCount:messages.length,bodyLen:_dbgBodyLen,timeoutMs:AI_TIMEOUT_MS},timestamp:Date.now(),hypothesisId:'H1,H3,H4'})}).catch(()=>{});
  // #endregion

  let response: Response;
  try {
    const body: any = {
      contents,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
      },
    };
    if (systemInstruction) {
      body.systemInstruction = systemInstruction;
    }

    response = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
      AI_TIMEOUT_MS,
    );
  } catch (err: any) {
    // #region agent log
    const _dbgElapsed = Date.now() - _dbgStart;
    fetch('http://127.0.0.1:7940/ingest/ae36240b-e3cc-4d35-bffd-8b7ab31fcc2a',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'a856e8'},body:JSON.stringify({sessionId:'a856e8',location:'gemini.ts:callAPI:catch',message:'AI call FAILED',data:{errName:err.name,errMsg:err.message,elapsedMs:_dbgElapsed,bodyLen:_dbgBodyLen,isAbort:err.name==='AbortError'},timestamp:Date.now(),hypothesisId:'H1,H2,H5'})}).catch(()=>{});
    // #endregion
    if (err.name === 'AbortError') {
      throw new Error('The AI took too long to respond. Please try again.');
    }
    throw new Error('Could not reach the AI service. Check your internet connection.');
  }

  // #region agent log
  const _dbgResElapsed = Date.now() - _dbgStart;
  fetch('http://127.0.0.1:7940/ingest/ae36240b-e3cc-4d35-bffd-8b7ab31fcc2a',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'a856e8'},body:JSON.stringify({sessionId:'a856e8',location:'gemini.ts:callAPI:response',message:'AI call got response',data:{status:response.status,ok:response.ok,elapsedMs:_dbgResElapsed},timestamp:Date.now(),hypothesisId:'H1,H3'})}).catch(()=>{});
  // #endregion

  // #region agent log
  console.log('[DEBUG-8fb698] gemini callAPI response status=' + response.status + ' ok=' + response.ok);
  // #endregion

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    console.warn('[AI] Error response:', response.status, errorBody);
    throw new Error(`AI request failed (${response.status}). Try again in a moment.`);
  }

  let rawBody: string;
  try {
    rawBody = await response.text();
  } catch (textErr: any) {
    // #region agent log
    console.log('[DEBUG-8fb698] gemini callAPI FAILED to read body: ' + textErr.message);
    // #endregion
    throw textErr;
  }

  // #region agent log
  console.log('[DEBUG-8fb698] gemini callAPI rawBody length=' + rawBody.length + ' first200=' + rawBody.slice(0, 200));
  console.log('[DEBUG-8fb698] gemini callAPI rawBody last200=' + rawBody.slice(-200));
  // #endregion

  let data: any;
  try {
    data = JSON.parse(rawBody);
  } catch (jsonErr: any) {
    // #region agent log
    console.log('[DEBUG-8fb698] gemini callAPI JSON.parse FAILED: ' + jsonErr.message + ' bodyLen=' + rawBody.length);
    // #endregion
    throw jsonErr;
  }

  // Gemini returns: { candidates: [{ content: { parts: [{ text: "..." }] } }] }
  const allParts = data.candidates?.[0]?.content?.parts;
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

  // #region agent log
  console.log('[DEBUG-8fb698] gemini callAPI extracted hasText=' + !!text + ' textLen=' + (text?.length) + ' partsCount=' + allParts?.length + ' finishReason=' + data.candidates?.[0]?.finishReason);
  if (allParts) { console.log('[DEBUG-8fb698] gemini parts keys=' + JSON.stringify(allParts.map((p: any) => Object.keys(p)))); }
  // #endregion

  if (!text) {
    console.warn('[AI] Unexpected response shape:', JSON.stringify(data).slice(0, 500));
    throw new Error('The AI returned an empty response. Please try again.');
  }

  return text;
}

function parseJSON<T>(text: string): T {
  // #region agent log
  console.log('[DEBUG-8fb698] gemini parseJSON entry textLen=' + text?.length + ' first200=' + text?.slice(0, 200));
  // #endregion

  const stripped = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  try {
    return JSON.parse(stripped);
  } catch (e1: any) {
    // #region agent log
    console.log('[DEBUG-8fb698] gemini parseJSON first parse FAILED: ' + e1.message + ' strippedLen=' + stripped.length);
    // #endregion

    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch (e2: any) {
        // #region agent log
        console.log('[DEBUG-8fb698] gemini parseJSON second parse FAILED: ' + e2.message + ' sliceLen=' + (end + 1 - start));
        // #endregion
        throw e2;
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
    const messages: AIMessage[] = [
      {
        role: 'system',
        content: `You are a meal planning assistant. Create a weekly plan that can mix saved recipes and new generated meals.

Target approximately ${params.dailyCalories} calories/day with macros: ${params.proteinG}g protein, ${params.carbsG}g carbs, ${params.fatG}g fat.
Dietary restrictions (must obey): ${params.dietaryRestrictions.join(', ') || 'none'}.
Dietary preferences (try to favor): ${dietaryPreferences}.
Pantry ingredients to prioritize where possible: ${pantryIngredients}.

IMPORTANT PRIORITY RULES:
1) Prefer saved database recipes when they are a good fit.
2) Use generated meals only when they better fit constraints, pantry usage, or variety.
3) If recipes include priority_score, treat higher scores as stronger preference.

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
