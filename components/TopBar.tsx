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

export default function TopBar({ blocks, onAsk }: { blocks: Block[]; onAsk: () => void }) {
  const stats = cityStats(blocks);
  return (
    <motion.header
      initial={{ y: -70, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.7, ease: EASE }}
      className="pointer-events-auto fixed top-0 right-0 z-20 px-3 pt-3"
      style={{ left: 320 }}
    >
      <div className="glass flex items-center gap-3 rounded-2xl px-4 py-3">
        <div className="min-w-0 flex-1 flex gap-5 text-[11px] text-white/55">
          <span>
            avg{" "}
            <span className="font-semibold text-amber-300">
              <AnimatedNumber value={stats.avg} />°
            </span>
          </span>
          <span>
            peak{" "}
            <span className="font-semibold text-rose-400">
              <AnimatedNumber value={stats.hottest.lst} />°
            </span>
          </span>
          <span>
            <span className="font-semibold text-rose-300">
              <AnimatedNumber value={stats.critical} decimals={0} />
            </span>{" "}
            critical
          </span>
        </div>
        <button
          onClick={onAsk}
          className="flex-none rounded-xl bg-gradient-to-r from-[#1d4ed8] to-[#22c55e] px-3.5 py-2 font-display text-xs font-bold text-white shadow-lg shadow-blue-900/40 transition active:scale-95 hover:brightness-110"
        >
          ✦ Ask AI
        </button>
      </div>
    </motion.header>
  );
}
