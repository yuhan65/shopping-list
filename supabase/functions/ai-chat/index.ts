import "https://deno.land/x/xhr@0.3.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { messages, json_mode = true } = await req.json();

    const aiApiBase = Deno.env.get('AI_API_BASE') ?? 'https://api.openai.com/v1';
    const aiApiKey = Deno.env.get('AI_API_KEY') ?? '';
    const aiModel = Deno.env.get('AI_MODEL') ?? 'gpt-4o';

    const aiResponse = await fetch(`${aiApiBase}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${aiApiKey}`,
      },
      body: JSON.stringify({
        model: aiModel,
        messages,
        ...(json_mode ? { response_format: { type: 'json_object' } } : {}),
        temperature: 0.7,
        max_tokens: 4096,
      }),
    });

    const data = await aiResponse.json();

    return new Response(JSON.stringify({ content: data.choices[0].message.content }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
