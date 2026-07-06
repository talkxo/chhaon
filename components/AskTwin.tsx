"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Block, priorityBlocks } from "@/lib/model";

const EASE = [0.22, 1, 0.36, 1] as const;

type Msg = { role: "user" | "assistant"; content: string };

export function blockContext(b: Block) {
  return `Block ${b.name} (${b.area}): LST ${b.lst.toFixed(1)}°C, heat score ${Math.round(b.score)}/100, density ${b.density.toFixed(2)}, NDVI ${b.ndvi.toFixed(2)}, albedo ${b.albedo.toFixed(2)}, canopy ${b.canopy.toFixed(2)}, traffic ${b.traffic.toFixed(2)}`;
}

export function cityContext(blocks: Block[]) {
  const top = priorityBlocks(blocks, 5).map(blockContext).join("\n");
  const avg = blocks.reduce((s, b) => s + b.lst, 0) / blocks.length;
  return `Gurugram twin: ${blocks.length} blocks, city-average LST ${avg.toFixed(1)}°C.\nFive hottest blocks:\n${top}`;
}

export async function askGroq(messages: Msg[], context: string): Promise<string> {
  const key = typeof window !== "undefined" ? localStorage.getItem("groq_key") : null;
  const res = await fetch("/api/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(key ? { "x-groq-key": key } : {}) },
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
  const [keyDraft, setKeyDraft] = useState("");
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

  // A "seed" conversation is pushed in when the user taps "AI brief" on a
  // block — if it ends on a user turn, fire the completion immediately.
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

  const needsKey = error?.includes("console.groq.com");

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
                <p className="text-[11px] text-white/45">
                  Groq · llama-3.3-70b {selected ? `· focused on ${selected.name}` : "· city-wide"}
                </p>
              </div>
              <button onClick={onClose} className="rounded-full bg-white/10 px-3 py-1.5 text-xs text-white/70">
                ✕
              </button>
            </div>

            <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-5 py-3">
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
                      ? "ml-8 rounded-2xl rounded-br-md bg-gradient-to-r from-[#6b5bd2] to-[#8a5bd2] px-4 py-2.5 text-sm text-white"
                      : "mr-4 whitespace-pre-wrap rounded-2xl rounded-bl-md bg-white/[0.07] px-4 py-2.5 text-sm leading-relaxed text-white/90"
                  }
                >
                  {m.content}
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
              {error && !needsKey && <p className="text-xs text-rose-300">{error}</p>}
              {needsKey && (
                <div className="rounded-xl border border-amber-300/25 bg-amber-300/10 p-3 text-xs text-amber-100">
                  <p className="mb-2">
                    No Groq key found. Grab a free one at{" "}
                    <a href="https://console.groq.com" target="_blank" rel="noreferrer" className="underline">
                      console.groq.com
                    </a>{" "}
                    and paste it here (stored only in your browser):
                  </p>
                  <div className="flex gap-2">
                    <input
                      value={keyDraft}
                      onChange={(e) => setKeyDraft(e.target.value)}
                      placeholder="gsk_…"
                      className="min-w-0 flex-1 rounded-lg bg-black/30 px-3 py-2 text-white outline-none placeholder:text-white/30"
                    />
                    <button
                      onClick={() => {
                        localStorage.setItem("groq_key", keyDraft.trim());
                        setError(null);
                        setKeyDraft("");
                      }}
                      className="rounded-lg bg-amber-300/20 px-3 py-2 font-semibold text-amber-100"
                    >
                      Save
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-2 px-5 pb-6 pt-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send(input)}
                placeholder="Ask the twin…"
                className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-white/25"
              />
              <button
                onClick={() => send(input)}
                disabled={busy || !input.trim()}
                className="rounded-2xl bg-gradient-to-r from-[#e85d8a] to-[#f9a03f] px-4 py-3 text-sm font-bold text-white disabled:opacity-40"
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
