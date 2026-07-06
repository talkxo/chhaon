import { NextRequest, NextResponse } from "next/server";

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.3-70b-versatile";

const SYSTEM_PROMPT = `You are Chhaon, an urban climatology AI analyzing a microclimate digital twin of Gurugram, India.
You receive microclimate stats for a specific city block (Land Surface Temperature, built density, tree canopy cover, traffic load, floor level) and the current live weather conditions (ambient air temperature, apparent feels-like temperature, relative humidity, wind speed).

You must explain the recommended AC setpoint. You MUST incorporate the live weather metrics:
- Humidity: If humidity is high (e.g., >55% RH), explain how humidity increases the apparent heat index and limits natural sweat evaporation, requiring dehumidification (Dry Mode) or a specific setpoint.
- Wind Speed: If wind speed is active, explain how natural cross-ventilation offsets cooling demands.
- Floor Level: Link floor level (e.g., 5+ Top floor direct solar radiation vs 1-2 Low floor canopy shade) to solar thermal gain and compressor cycles.
- Heat Islands: Discuss how concrete density traps heat and strains the AC unit compressor.

You must analyze these live inputs and return a valid JSON object matching this schema:
{
  "summary": "1-2 sentences explaining why the target setpoint is recommended under these specific microclimate and live weather conditions (directly referencing humidity, wind, or floor level).",
  "savings": "1 sentence estimating electricity savings or compressor relief (e.g., 'Saves up to X% vs standard 22°C baseline').",
  "stress": "1 sentence detailing the combined strain on grid transformers, compressor duty cycles, and home wiring load."
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
