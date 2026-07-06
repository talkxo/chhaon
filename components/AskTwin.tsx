"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { Block, priorityBlocks } from "@/lib/model";

const EASE = [0.22, 1, 0.36, 1] as const;

type Msg = { role: "user" | "assistant"; content: string };

type AssistantJSON = {
  summary: string;
  vitals?: { label: string; value: string; level?: "success" | "warning" | "danger" | "info" }[];
  chart?: {
    title: string;
    series: { label: string; value: number; color?: string }[];
  };
  actions?: string[];
  notes?: string;
};

export function blockContext(b: Block) {
  return `Block ${b.name} (${b.area}): LST ${b.lst.toFixed(1)}°C, heat score ${Math.round(b.score)}/100, density ${b.density.toFixed(2)}, NDVI ${b.ndvi.toFixed(2)}, albedo ${b.albedo.toFixed(2)}, canopy ${b.canopy.toFixed(2)}, traffic ${b.traffic.toFixed(2)}`;
}

export function cityContext(blocks: Block[]) {
  const top = priorityBlocks(blocks, 5).map(blockContext).join("\n");
  const avg = blocks.reduce((s, b) => s + b.lst, 0) / blocks.length;
  return `Gurugram twin: ${blocks.length} blocks, city-average LST ${avg.toFixed(1)}°C.\nFive hottest blocks:\n${top}`;
}

export async function askGroq(messages: Msg[], context: string): Promise<string> {
  const res = await fetch("/api/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, context }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Groq request failed");
  return data.reply;
}

const SUGGESTIONS = [
  "Which block should get trees first?",
  "Cheapest way to cool Old Gurugram?",
  "What happens on a +1°C heatwave day?",
];

// Rich interactive assistant card to render structured microclimate briefs
function AssistantCard({ jsonStr }: { jsonStr: string }) {
  const parsed = useMemo(() => {
    try {
      // Find the first '{' and last '}' to strip any potential markdown wraps
      const start = jsonStr.indexOf("{");
      const end = jsonStr.lastIndexOf("}");
      if (start !== -1 && end !== -1) {
        const clean = jsonStr.substring(start, end + 1);
        return JSON.parse(clean) as AssistantJSON;
      }
      return JSON.parse(jsonStr) as AssistantJSON;
    } catch {
      return null;
    }
  }, [jsonStr]);

  // Fallback to raw text if parsing fails
  if (!parsed) {
    return <div className="text-white/95 text-sm leading-relaxed whitespace-pre-wrap">{jsonStr}</div>;
  }

  const { summary, vitals, chart, actions, notes } = parsed;

  return (
    <div className="space-y-4">
      {/* Narrative summary */}
      <p className="text-sm leading-relaxed text-white/90 font-medium">
        {summary}
      </p>

      {/* Interactive Vitals Grid */}
      {vitals && vitals.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {vitals.map((v, idx) => {
            let badgeBg = "bg-blue-500/10 border-blue-500/20 text-blue-300";
            if (v.level === "danger") badgeBg = "bg-red-500/10 border-red-500/20 text-red-300";
            if (v.level === "warning") badgeBg = "bg-yellow-500/10 border-yellow-500/20 text-yellow-300";
            if (v.level === "success") badgeBg = "bg-emerald-500/10 border-emerald-500/20 text-emerald-300";

            return (
              <div key={idx} className={`rounded-xl border px-3 py-2.5 ${badgeBg}`}>
                <div className="text-[10px] uppercase tracking-wider opacity-60">{v.label}</div>
                <div className="font-display text-sm font-bold mt-0.5">{v.value}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* Styled Interactive Chart */}
      {chart && chart.series && chart.series.length > 0 && (
        <div className="rounded-xl bg-white/[0.04] border border-white/[0.08] p-3">
          <h4 className="text-[10px] uppercase tracking-wider text-white/40 mb-3 font-semibold">
            📊 {chart.title}
          </h4>
          <div className="space-y-2">
            {chart.series.map((s, idx) => {
              const maxVal = Math.max(...chart.series.map((item) => item.value), 1);
              const percentage = (s.value / maxVal) * 100;
              const barColor = s.color || "#3b82f6";

              return (
                <div key={idx} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-white/60">{s.label}</span>
                    <span className="font-semibold" style={{ color: barColor }}>{s.value}</span>
                  </div>
                  <div className="h-2 rounded-full bg-white/10 overflow-hidden relative">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${percentage}%` }}
                      transition={{ duration: 0.8, ease: EASE, delay: idx * 0.1 }}
                      className="h-full rounded-full"
                      style={{ backgroundColor: barColor }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Actions Checklist */}
      {actions && actions.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-[10px] uppercase tracking-wider text-white/40 font-semibold">
            ⚡ Recommended Actions
          </h4>
          <div className="space-y-1.5">
            {actions.map((act, idx) => (
              <div key={idx} className="flex gap-2.5 items-start text-xs text-white/80">
                <span className="flex-none text-emerald-400 mt-0.5 font-bold">✓</span>
                <span className="leading-normal">{act}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Notes footer */}
      {notes && (
        <p className="text-[10px] text-white/35 italic leading-normal border-t border-white/[0.05] pt-2">
          💡 {notes}
        </p>
      )}
    </div>
  );
}

// Simple wrapper to run on assistant messages

export default function AskTwin({
  open,
  onClose,
  blocks,
  selected,
  seed,
}: {
  open: boolean;
  onClose: () => void;
  blocks: Block[];
  selected: Block | null;
  seed: Msg[] | null;
}) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const seenSeed = useRef<Msg[] | null>(null);

  const complete = async (next: Msg[]) => {
    setMsgs(next);
    setError(null);
    setBusy(true);
    try {
      const context = selected ? `${cityContext(blocks)}\n\nUser is inspecting:\n${blockContext(selected)}` : cityContext(blocks);
      const reply = await askGroq(next, context);
      setMsgs([...next, { role: "assistant", content: reply }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!seed || seenSeed.current === seed) return;
    seenSeed.current = seed;
    if (seed[seed.length - 1]?.role === "user") complete(seed);
    else setMsgs(seed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, busy]);

  const send = async (text: string) => {
    if (!text.trim() || busy) return;
    setInput("");
    await complete([...msgs, { role: "user", content: text.trim() }]);
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm"
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ duration: 0.5, ease: EASE }}
            className="glass fixed inset-x-0 bottom-0 z-40 mx-auto flex h-[82dvh] w-full max-w-md flex-col rounded-t-3xl"
          >
            <div className="flex items-center justify-between px-5 pb-2 pt-4">
              <div>
                <h2 className="font-display text-lg font-bold text-white">Ask the Twin</h2>
                <p className="text-[11px] text-white/45 font-medium">
                  {selected ? `Focused on ${selected.name}` : "City-wide search active"}
                </p>
              </div>
              <button 
                onClick={onClose} 
                className="rounded-full bg-white/10 px-3 py-1.5 text-xs text-white/70 hover:bg-white/20 transition"
              >
                ✕
              </button>
            </div>

            <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-5 py-3">
              {msgs.length === 0 && (
                <div className="space-y-2 pt-6">
                  <p className="text-center text-sm text-white/40">Ask anything about Gurugram&apos;s heat map</p>
                  {SUGGESTIONS.map((s, i) => (
                    <motion.button
                      key={s}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.08 * i, duration: 0.4, ease: EASE }}
                      onClick={() => send(s)}
                      className="block w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-left text-sm text-white/75 transition hover:bg-white/[0.1]"
                    >
                      {s}
                    </motion.button>
                  ))}
                </div>
              )}
              {msgs.map((m, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, ease: EASE }}
                  className={
                    m.role === "user"
                      ? "ml-8 rounded-2xl rounded-br-md bg-gradient-to-r from-[#1d4ed8] to-[#1e40af] px-4 py-2.5 text-sm text-white border border-blue-500/20"
                      : "mr-4 rounded-2xl rounded-bl-md bg-white/[0.06] border border-white/[0.07] px-4 py-3.5 text-sm leading-relaxed text-white/95"
                  }
                >
                  {m.role === "user" ? (
                    m.content
                  ) : (
                    <AssistantCard jsonStr={m.content} />
                  )}
                </motion.div>
              ))}
              {busy && (
                <div className="mr-4 flex gap-1.5 rounded-2xl bg-white/[0.07] px-4 py-3.5 w-fit">
                  {[0, 1, 2].map((i) => (
                    <motion.span
                      key={i}
                      animate={{ opacity: [0.25, 1, 0.25] }}
                      transition={{ repeat: Infinity, duration: 1.2, delay: i * 0.18 }}
                      className="h-1.5 w-1.5 rounded-full bg-white/70"
                    />
                  ))}
                </div>
              )}
              {error && <p className="text-xs text-rose-300">{error}</p>}
            </div>

            <div className="flex gap-2 px-5 pb-6 pt-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send(input)}
                placeholder="Ask the twin…"
                className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-white/25 focus:bg-white/[0.09] transition-all"
              />
              <button
                onClick={() => send(input)}
                disabled={busy || !input.trim()}
                className="rounded-2xl bg-gradient-to-r from-[#1d4ed8] to-[#22c55e] px-4 py-3 text-sm font-bold text-white disabled:opacity-40 hover:brightness-110 active:scale-95 transition-all"
              >
                ↑
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
