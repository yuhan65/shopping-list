/**
 * Purpose: send AI requests from the app to Supabase Edge Functions,
 * so API keys stay on the server and never ship in the app bundle.
 */
import { supabase } from '@/lib/supabase';
import type { AIMessage } from './types';

interface EdgeAIOptions {
  provider?: string;
  model?: string;
  apiBase?: string;
  jsonMode?: boolean;
}

export async function callAIThroughEdge(
  messages: AIMessage[],
  options: EdgeAIOptions = {}
): Promise<string> {
  const provider = options.provider ?? process.env.EXPO_PUBLIC_AI_PROVIDER ?? 'openai';
  const model = options.model ?? process.env.EXPO_PUBLIC_AI_MODEL;
  const apiBase = options.apiBase ?? process.env.EXPO_PUBLIC_AI_API_BASE;

  const { data, error } = await supabase.functions.invoke('ai-chat', {
    body: {
      provider,
      model,
      api_base: apiBase,
      json_mode: options.jsonMode ?? false,
      messages,
    },
  });

  if (error) {
    throw new Error(`AI function call failed: ${error.message}`);
  }

  if (!data?.content || typeof data.content !== 'string') {
    throw new Error('The AI function returned an empty response.');
  }

  return data.content;
}
