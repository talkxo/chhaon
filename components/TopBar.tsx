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
  weather,
  onAsk,
  viewMode,
  onViewModeChange,
}: {
  blocks: Block[];
  weather: {
    temperature: number;
    humidity: number;
    apparentTemp: number;
    windSpeed: number;
    weatherCode: number;
  };
  onAsk: () => void;
  viewMode: "temp" | "ac";
  onViewModeChange: (m: "temp" | "ac") => void;
}) {
  const stats = cityStats(blocks);
  
  return (
    <motion.header
      initial={{ y: -70, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.7, ease: EASE }}
      className="pointer-events-auto fixed top-0 right-0 z-20 px-2 pt-2 md:px-3 md:pt-3 left-0 md:left-[320px] transition-all duration-300"
    >
      <div className="glass flex items-center justify-between gap-2 md:gap-4 rounded-2xl px-3 py-2 md:px-4 md:py-2.5">
        {/* City Stats */}
        <div className="min-w-0 flex items-center gap-2 md:gap-3 text-[9px] md:text-[10px] text-white/55 font-medium">
          <div className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded-lg text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-bold">LIVE: {weather.temperature.toFixed(0)}°</span>
            <span className="hidden sm:inline opacity-75">| Feels {weather.apparentTemp.toFixed(0)}°</span>
            <span className="hidden md:inline opacity-75">| 💧 {weather.humidity}%</span>
          </div>
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
        <div className="flex items-center gap-1.5 md:gap-2">
          {/* Scientific LST heat map button */}
          <button
            onClick={() => onViewModeChange("temp")}
            className={`px-2 py-1 md:px-2.5 md:py-1.5 rounded-xl text-[9px] md:text-[10px] font-bold tracking-wider uppercase transition-all duration-300 border flex items-center gap-1 cursor-pointer ${
              viewMode === "temp"
                ? "bg-white/10 text-white shadow border-white/10"
                : "bg-black/25 text-white/45 hover:text-white/80 border-transparent"
            }`}
          >
            <span>🌡 LST Map</span>
          </button>

          {/* AC Setpoint advisory button */}
          <button
            onClick={() => onViewModeChange("ac")}
            className={`px-2 py-1 md:px-2.5 md:py-1.5 rounded-xl text-[9px] md:text-[10px] font-bold tracking-wider uppercase transition-all duration-300 border flex items-center gap-1 cursor-pointer ${
              viewMode === "ac"
                ? "bg-white/10 text-white shadow border-white/10"
                : "bg-black/25 text-white/45 hover:text-white/80 border-transparent"
            }`}
          >
            <span>❄️ AC Target</span>
          </button>
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
