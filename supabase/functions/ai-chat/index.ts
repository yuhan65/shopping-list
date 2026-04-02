import "https://deno.land/x/xhr@0.3.0/mod.ts";
// Purpose: secure AI proxy that keeps provider API keys server-side.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type AIMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>;
};

function getDefaultModel(provider: string): string {
  if (provider === 'gemini') return 'gemini-2.5-flash-lite';
  if (provider === 'anthropic') return 'claude-sonnet-4-20250514';
  return 'gpt-4o';
}

function toAnthropicMessages(messages: AIMessage[]) {
  let system = '';
  const mapped: Array<{ role: 'user' | 'assistant'; content: any }> = [];

  for (const message of messages) {
    if (message.role === 'system') {
      if (typeof message.content === 'string') {
        system = message.content;
      }
      continue;
    }

    if (typeof message.content === 'string') {
      mapped.push({ role: message.role, content: message.content });
      continue;
    }

    const parts: any[] = [];
    for (const part of message.content) {
      if (part.type === 'text') {
        parts.push({ type: 'text', text: part.text });
        continue;
      }

      const match = part.image_url.url.match(/^data:(image\/\w+);base64,(.+)$/);
      if (match) {
        parts.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: match[1],
            data: match[2],
          },
        });
      }
    }

    mapped.push({ role: message.role, content: parts });
  }

  return { system, messages: mapped };
}

function toGeminiPayload(messages: AIMessage[]) {
  let systemInstruction: { parts: Array<{ text: string }> } | undefined;
  const contents: Array<{ role: 'user' | 'model'; parts: any[] }> = [];

  for (const message of messages) {
    if (message.role === 'system') {
      if (typeof message.content === 'string') {
        systemInstruction = { parts: [{ text: message.content }] };
      }
      continue;
    }

    const role = message.role === 'assistant' ? 'model' : 'user';
    if (typeof message.content === 'string') {
      contents.push({ role, parts: [{ text: message.content }] });
      continue;
    }

    const parts: any[] = [];
    for (const part of message.content) {
      if (part.type === 'text') {
        parts.push({ text: part.text });
        continue;
      }

      const match = part.image_url.url.match(/^data:(image\/\w+);base64,(.+)$/);
      if (match) {
        parts.push({
          inlineData: {
            mimeType: match[1],
            data: match[2],
          },
        });
      }
    }

    contents.push({ role, parts });
  }

  return { systemInstruction, contents };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { provider = 'openai', messages, json_mode = false, model, api_base } = await req.json();
    if (!Array.isArray(messages)) {
      throw new Error('messages must be an array');
    }

    const normalizedProvider = String(provider);
    const selectedModel = String(model ?? Deno.env.get('AI_MODEL') ?? getDefaultModel(normalizedProvider));
    const normalizedMessages = messages as AIMessage[];
    let content = '';

    if (normalizedProvider === 'anthropic') {
      const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY') ?? Deno.env.get('AI_API_KEY') ?? '';
      if (!anthropicApiKey) throw new Error('Missing ANTHROPIC_API_KEY secret');

      const converted = toAnthropicMessages(normalizedMessages);
      const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicApiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: selectedModel,
          system: converted.system || undefined,
          messages: converted.messages,
          max_tokens: 8000,
        }),
      });

      if (!anthropicResponse.ok) {
        const errorText = await anthropicResponse.text().catch(() => '');
        throw new Error(`Anthropic request failed (${anthropicResponse.status}): ${errorText}`);
      }

      const data = await anthropicResponse.json();
      const textBlock = data.content?.find((block: any) => block.type === 'text');
      content = textBlock?.text ?? '';
    } else if (normalizedProvider === 'gemini') {
      const geminiApiKey = Deno.env.get('GEMINI_API_KEY') ?? Deno.env.get('AI_API_KEY') ?? '';
      if (!geminiApiKey) throw new Error('Missing GEMINI_API_KEY secret');

      const converted = toGeminiPayload(normalizedMessages);
      const geminiResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${geminiApiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: converted.contents,
            systemInstruction: converted.systemInstruction,
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 40_000,
            },
          }),
        }
      );

      if (!geminiResponse.ok) {
        const errorText = await geminiResponse.text().catch(() => '');
        throw new Error(`Gemini request failed (${geminiResponse.status}): ${errorText}`);
      }

      const data = await geminiResponse.json();
      content = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    } else {
      const openAIKey = Deno.env.get('OPENAI_API_KEY') ?? Deno.env.get('AI_API_KEY') ?? '';
      if (!openAIKey) throw new Error('Missing OPENAI_API_KEY or AI_API_KEY secret');

      const aiApiBase = String(api_base ?? Deno.env.get('AI_API_BASE') ?? 'https://api.openai.com/v1');
      const openAIResponse = await fetch(`${aiApiBase}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openAIKey}`,
        },
        body: JSON.stringify({
          model: selectedModel,
          messages: normalizedMessages,
          ...(json_mode ? { response_format: { type: 'json_object' } } : {}),
          temperature: 0.7,
          max_tokens: 8000,
        }),
      });

      if (!openAIResponse.ok) {
        const errorText = await openAIResponse.text().catch(() => '');
        throw new Error(`OpenAI-compatible request failed (${openAIResponse.status}): ${errorText}`);
      }

      const data = await openAIResponse.json();
      const message = data.choices?.[0]?.message;
      content = message?.content ?? message?.reasoning ?? '';
    }

    if (!content) {
      throw new Error('AI provider returned an empty response');
    }

    return new Response(JSON.stringify({ content }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error?.message ?? 'Unknown server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
