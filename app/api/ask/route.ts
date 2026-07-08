import { NextRequest, NextResponse } from "next/server";

const GROQ_API_KEY = process.env.GROQ_API_KEY;

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.3-70b-versatile"; // standard, fast, free-tier model

const SYSTEM_PROMPT = `You are Chhaon, the reasoning layer of a microclimate digital twin of Gurugram, India.
You receive land-surface temperature (LST), air quality (PM2.5 and US AQI derived from real EPA breakpoints), and land-use proxies (built density, NDVI vegetation index, albedo, tree canopy, traffic) for city blocks, plus the cooling physics the twin uses:
- Rooftop gardens: up to -1.6°C at full coverage, scaled by built density.
- Reflective (high-albedo) pavement: up to -1.3°C, scaled by how dark current surfaces are.
- Tree canopy: up to -2.4°C, scaled by canopy headroom; canopy and low traffic also reduce local PM2.5.
- Traffic and built density are the dominant drivers of local PM2.5/AQI — trees and greenery only lightly scrub particulates compared to their heat-cooling effect.

IMPORTANT (Anti-Bias Rules):
- The user may be currently selecting/inspecting a specific block (shown in context as "User is inspecting: Block X").
- If the user's question is general, asks about other areas, or requests a comparison, DO NOT bias the entire response to the selected block.
- Treat the selected block as optional local context. Compare multiple areas or discuss the whole city neutrally when appropriate.
- Only focus exclusively on the selected block if the user's query explicitly targets it.

You must analyze the microclimate context and return a valid JSON object matching this schema:
{
  "summary": "A sharp, action-first advisory summary (1-2 sentences max). Use exact °C and ₹ figures when comparing or planning.",
  "vitals": [
    { "label": "Vital name", "value": "Value (e.g. 46.2°C or 12%)", "level": "success | warning | danger | info" }
  ],
  "chart": {
    "title": "Chart Title describing the visual data",
    "series": [
      { "label": "Label", "value": 45.2, "color": "hex color e.g. #dc2626 (red) or #22c55e (green) or #3b82f6 (blue)" }
    ]
  },
  "actions": [
    "Specific actionable recommendation 1",
    "Specific actionable recommendation 2"
  ],
  "notes": "Advisory note regarding ground-level validation, satellite data or implementation caveat (under 30 words)."
}

Respond strictly with this JSON object. No other text, no markdown codeblocks wrapping the JSON.`;

export async function POST(req: NextRequest) {
  try {
    const { messages, context } = await req.json();

    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json", 
        Authorization: `Bearer ${GROQ_API_KEY}` 
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.2,
        max_tokens: 800,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...(context ? [{ role: "system", content: `Live twin context:\n${context}` }] : []),
          ...messages,
        ],
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      return NextResponse.json({ error: "groq_error", message: detail.slice(0, 400) }, { status: res.status });
    }
    const data = await res.json();
    return NextResponse.json({ reply: data.choices?.[0]?.message?.content ?? "{}" });
  } catch (err: any) {
    return NextResponse.json({ error: "server_error", message: err.message }, { status: 500 });
  }
}
