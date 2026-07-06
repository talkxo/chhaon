import { NextRequest, NextResponse } from "next/server";

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.3-70b-versatile";

const SYSTEM_PROMPT = `You are Chhaon, an urban climatology AI analyzing a highly localized microclimate digital twin block.
DO NOT use generic city-level statements (e.g., "In Gurugram's climate..."). Your analysis MUST strictly focus on the specific block's physical parameters provided to you (built density, canopy, albedo, LST) combined with the exact live weather conditions (humidity, wind, apparent temp).

You must explain the recommended AC setpoint by synthesizing the inputs:
- If the block has high density and low canopy, explain how the urban heat island effect traps heat locally, forcing the compressor to work harder.
- Intersect this with live humidity: How does the current humidity level combined with the block's heat trapping change the apparent heat and dehumidification needs?
- Intersect with wind: Does the block's density block the current live wind speed, or does the wind provide relief?
- Intersect with floor level: Explain how the requested floor level alters solar radiation absorption.

Your output must be hyper-specific to the block data provided, not generic advice.

Return a JSON object matching this schema:
{
  "summary": "1-3 sentences explaining exactly why the target setpoint is recommended by directly connecting the block's density/canopy/floor level to the live humidity/wind conditions.",
  "savings": "1 sentence estimating electricity savings or compressor relief.",
  "stress": "1 sentence detailing the combined strain on grid transformers and compressor duty cycles caused by this specific block's heat retention."
}
Respond strictly with this JSON object. No markdown wrappers, no other text.`;

export async function POST(req: NextRequest) {
  if (!GROQ_API_KEY) {
    return NextResponse.json({ error: "no_key", message: "Groq API key not configured" }, { status: 401 });
  }

  try {
    const { context, prompt } = await req.json();

    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.35,
        max_tokens: 300,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `Live Twin Context:\n${context}\n\nTask:\n${prompt}` }
        ]
      })
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
