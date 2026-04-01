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
    const { url } = await req.json();
    if (!url) {
      return new Response(JSON.stringify({ error: 'URL is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch the page content
    const pageResponse = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MealMate/1.0)',
      },
    });
    const html = await pageResponse.text();

    // Strip HTML tags for cleaner AI input
    const textContent = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 8000);

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
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `Extract a structured recipe from the web page content. Return JSON: { title, description, ingredients: [{name, quantity, unit, category}], instructions: [string], servings, prep_time_minutes, cook_time_minutes, calories_per_serving, protein_per_serving, carbs_per_serving, fat_per_serving, tags: [string] }. Category should be: produce, dairy, meat, seafood, bakery, frozen, canned, dry_goods, condiments, beverages, snacks, or other. Estimate nutrition if not provided. Use metric units.`,
          },
          {
            role: 'user',
            content: `Extract recipe from (URL: ${url}):\n\n${textContent}`,
          },
        ],
        temperature: 0.7,
        max_tokens: 4096,
      }),
    });

    const aiData = await aiResponse.json();
    const recipe = JSON.parse(aiData.choices[0].message.content);

    return new Response(JSON.stringify(recipe), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
