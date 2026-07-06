"use client";

import { motion, useSpring, useTransform } from "framer-motion";
import { useEffect } from "react";
import { Block, cityStats } from "@/lib/model";

const EASE = [0.22, 1, 0.36, 1] as const;

function AnimatedNumber({ value, decimals = 1 }: { value: number; decimals?: number }) {
  const spring = useSpring(0, { stiffness: 60, damping: 18 });
  const display = useTransform(spring, (v) => v.toFixed(decimals));
  useEffect(() => {
    spring.set(value);
  }, [value, spring]);
  return <motion.span>{display}</motion.span>;
}

export default function TopBar({
  blocks,
  onAsk,
  viewMode,
  onViewModeChange,
}: {
  blocks: Block[];
  onAsk: () => void;
  viewMode: "temp" | "ac_noon" | "ac_night";
  onViewModeChange: (m: "temp" | "ac_noon" | "ac_night") => void;
}) {
  const stats = cityStats(blocks);
  
  const modes: { id: typeof viewMode; label: string }[] = [
    { id: "temp", label: "🌡 Temperature" },
    { id: "ac_noon", label: "☀️ Noon AC" },
    { id: "ac_night", label: "🌙 Night AC" },
  ];

  return (
    <motion.header
      initial={{ y: -70, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.7, ease: EASE }}
      className="pointer-events-auto fixed top-0 right-0 z-20 px-3 pt-3"
      style={{ left: 320 }}
    >
      <div className="glass flex items-center justify-between gap-4 rounded-2xl px-4 py-2.5">
        {/* City Stats */}
        <div className="min-w-0 flex gap-4 text-[10px] text-white/55 font-medium">
          <span>
            AVG{" "}
            <span className="font-semibold text-amber-300">
              <AnimatedNumber value={stats.avg} />°
            </span>
          </span>
          <span>
            PEAK{" "}
            <span className="font-semibold text-rose-400">
              <AnimatedNumber value={stats.hottest.lst} />°
            </span>
          </span>
        </div>

        {/* Dynamic Layer Switcher Pills */}
        <div className="flex bg-black/35 rounded-xl p-1 border border-white/5">
          {modes.map((m) => {
            const active = viewMode === m.id;
            return (
              <button
                key={m.id}
                onClick={() => onViewModeChange(m.id)}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-bold tracking-wider uppercase transition-all duration-300 cursor-pointer ${
                  active
                    ? "bg-white/10 text-white shadow-md border border-white/10"
                    : "text-white/45 hover:text-white/80 border border-transparent"
                }`}
              >
                {m.label}
              </button>
            );
          })}
        </div>

        {/* Ask AI Button */}
        <button
          onClick={onAsk}
          className="flex-none rounded-xl bg-gradient-to-r from-[#1d4ed8] to-[#22c55e] px-3.5 py-2 font-display text-xs font-bold text-white shadow-lg shadow-blue-900/40 transition active:scale-95 hover:brightness-110 cursor-pointer"
        >
          ✦ Ask AI
        </button>
      </div>
    </motion.header>
  );
}
