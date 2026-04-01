import { AIService } from './types';
import { OpenAIService } from './openai';
import { AnthropicService } from './anthropic';
import { GeminiService } from './gemini';

/**
 * Creates the right AI service based on the EXPO_PUBLIC_AI_PROVIDER
 * env variable. Supported values:
 *   "gemini"    — Google Gemini (default)
 *   "anthropic" — Anthropic Claude
 *   "openai"    — OpenAI / OpenRouter / any OpenAI-compatible API
 */
export function createAIService(): AIService {
  const provider = process.env.EXPO_PUBLIC_AI_PROVIDER ?? 'openai';

  // #region agent log
  console.log('[DEBUG-8fb698] createAIService provider=' + provider + ' hasKey=' + !!process.env.EXPO_PUBLIC_AI_API_KEY + ' model=' + process.env.EXPO_PUBLIC_AI_MODEL);
  fetch('http://127.0.0.1:7940/ingest/ae36240b-e3cc-4d35-bffd-8b7ab31fcc2a',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'a856e8'},body:JSON.stringify({sessionId:'a856e8',location:'ai/index.ts:createAIService',message:'Provider selected',data:{provider,hasKey:!!process.env.EXPO_PUBLIC_AI_API_KEY,model:process.env.EXPO_PUBLIC_AI_MODEL,apiBase:process.env.EXPO_PUBLIC_AI_API_BASE},timestamp:Date.now(),hypothesisId:'H4'})}).catch(()=>{});
  // #endregion

  if (provider === 'gemini') {
    return new GeminiService();
  }

  if (provider === 'anthropic') {
    return new AnthropicService();
  }

  return new OpenAIService();
}

export type { AIService } from './types';
export type {
  AIRecipeResult,
  AIFoodAnalysis,
  AIQuantityRecommendation,
  AIMealPlanResult,
  AIMealPlanParams,
  AIMealPlanMeal,
} from './types';
