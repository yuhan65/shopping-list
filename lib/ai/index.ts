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
