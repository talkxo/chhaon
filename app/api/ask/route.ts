import { NextRequest, NextResponse } from "next/server";

// Proxy to Groq's OpenAI-compatible chat API. The key comes from
// GROQ_API_KEY in .env.local, or a per-user key sent by the client
// (stored in localStorage, never persisted server-side).
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

const SYSTEM_PROMPT = `You are Chhaon, the reasoning layer of a microclimate digital twin of Gurugram, India.
You receive land-surface temperature (LST) and land-use proxies (built density, NDVI vegetation index, surface albedo, tree canopy, traffic) for city blocks, plus the cooling physics the twin uses:
- Rooftop gardens: up to -1.6°C at full coverage, scaled by built density.
- Reflective (high-albedo) pavement: up to -1.3°C, scaled by how dark current surfaces are.
- Tree canopy: up to -2.4°C, scaled by canopy headroom.
Answer like a sharp urban-climate advisor briefing a municipal officer: concrete, quantitative, action-first. Use °C deltas and ₹ figures from the context when available. Keep answers under 180 words unless asked for a full brief. Never invent data not implied by the context; say when a real deployment would need ground sensors or satellite passes to confirm.`;

export async function POST(req: NextRequest) {
  const { messages, context } = await req.json();
  const key = req.headers.get("x-groq-key") || process.env.GROQ_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "no_key", message: "Add a free Groq API key in settings (console.groq.com) or set GROQ_API_KEY in .env.local." },
      { status: 401 },
    );
  }

  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.4,
      max_tokens: 700,
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
  return NextResponse.json({ reply: data.choices?.[0]?.message?.content ?? "" });
}
