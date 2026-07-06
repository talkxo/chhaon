"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Block,
  diurnalCurve,
  heatColor,
  NO_INTERVENTIONS,
  getNoonAC,
  getNightAC,
  getNoonACScore,
  getNightACScore,
  FloorLevel,
} from "@/lib/model";
import TempCurve from "./TempCurve";

const EASE = [0.22, 1, 0.36, 1] as const;

export type FlyTarget = {
  lng: number;
  lat: number;
  zoom?: number;
  label?: string;
  _ts?: number; // internal: force re-trigger when same location picked twice
};

type Props = {
  blocks: Block[];
  selected: Block | null;
  onSelect: (b: Block | null) => void;
  onBrief: (b: Block) => void;
  briefLoading: boolean;
  onFlyTo: (target: FlyTarget) => void;
  viewMode: 'temp' | 'ac_noon' | 'ac_night';
  floorLevel: FloorLevel;
  onFloorLevelChange: (f: FloorLevel) => void;
  weather: {
    temperature: number;
    humidity: number;
    apparentTemp: number;
    windSpeed: number;
    weatherCode: number;
  };
};

// ── Nominatim geocoding ───────────────────────────────────────────────────────
type GeoResult = {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  type: string;
  class: string;
};

async function geocode(q: string): Promise<GeoResult[]> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", q);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "6");
  url.searchParams.set("countrycodes", "in");
  // Bias results toward Gurugram / Delhi NCR
  url.searchParams.set("viewbox", "76.7,28.2,77.5,28.8");
  url.searchParams.set("bounded", "0");
  const res = await fetch(url.toString(), {
    headers: { "Accept-Language": "en", "User-Agent": "Chhaon/1.0" },
  });
  if (!res.ok) throw new Error("Geocoding failed");
  return res.json();
}

// ── Sub-components ────────────────────────────────────────────────────────────
function HeatBadge({ score, lst, viewMode, b, floorLevel }: { score: number; lst: number; viewMode: 'temp' | 'ac_noon' | 'ac_night'; b: Block; floorLevel: FloorLevel }) {
  let displayScore = score;
  let displayVal = `${lst.toFixed(1)}°C`;
  let title = "LST";
  if (viewMode === 'ac_noon') {
    displayScore = getNoonACScore(b, floorLevel);
    displayVal = `${getNoonAC(b, floorLevel)}°C`;
    title = "AC SETPOINT";
  } else if (viewMode === 'ac_night') {
    displayScore = getNightACScore(b, floorLevel);
    displayVal = `${getNightAC(b, floorLevel)}°C`;
    title = "AC SETPOINT";
  }
  const c = heatColor(displayScore);
  const color = `rgb(${c.join(",")})`;
  return (
    <div
      className="flex flex-col items-end gap-0.5 rounded-xl px-3 py-2"
      style={{
        background: `rgba(${c.join(",")},0.15)`,
        border: `1px solid rgba(${c.join(",")},0.35)`,
      }}
    >
      <span className="font-display text-xl font-bold leading-none" style={{ color }}>
        {displayVal}
      </span>
      <span className="text-[9px] font-semibold tracking-wider opacity-70" style={{ color }}>
        {title}
      </span>
    </div>
  );
}

function Vital({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-white/[0.06] px-2.5 py-2">
      <div className="text-[10px] uppercase tracking-wider text-white/45">{label}</div>
      <div className="font-display text-sm font-semibold text-white">{value}</div>
      {sub && <div className="text-[10px] text-white/40 mt-0.5">{sub}</div>}
    </div>
  );
}

function HeatBar({ score }: { score: number }) {
  const c = heatColor(score);
  return (
    <div className="flex items-center gap-2 mt-1">
      <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${score}%`, background: `rgb(${c.join(",")})` }}
        />
      </div>
      <span className="text-[10px] text-white/40 w-7 text-right">{Math.round(score)}%</span>
    </div>
  );
}

function BlockRow({ b, index, onSelect, viewMode, floorLevel }: { b: Block; index: number; onSelect: (b: Block) => void; viewMode: 'temp' | 'ac_noon' | 'ac_night'; floorLevel: FloorLevel }) {
  let score = b.score;
  let label = `${b.lst.toFixed(1)}°`;
  if (viewMode === 'ac_noon') {
    score = getNoonACScore(b, floorLevel);
    label = `${getNoonAC(b, floorLevel)}°C`;
  } else if (viewMode === 'ac_night') {
    score = getNightACScore(b, floorLevel);
    label = `${getNightAC(b, floorLevel)}°C`;
  }
  const c = heatColor(score);
  return (
    <motion.button
      key={b.id}
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.25, ease: EASE, delay: Math.min(index * 0.02, 0.35) }}
      onClick={() => onSelect(b)}
      className="flex w-full items-center gap-2.5 rounded-xl bg-white/[0.04] px-2.5 py-2 text-left transition hover:bg-white/[0.09] active:scale-[0.99]"
    >
      <span
        className="h-7 w-1 flex-none rounded-full"
        style={{ background: `rgb(${c.join(",")})` }}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium text-white leading-tight">{b.name}</span>
        <HeatBar score={score} />
      </span>
      <span
        className="font-display text-sm font-bold flex-none"
        style={{ color: `rgb(${c.join(",")})` }}
      >
        {label}
      </span>
    </motion.button>
  );
}

function riskLabel(score: number) {
  if (score >= 75) return "Critical";
  if (score >= 50) return "High";
  if (score >= 25) return "Moderate";
  return "Low";
}

// ── MapSearch ─────────────────────────────────────────────────────────────────
function MapSearch({ onFlyTo, blockSearch, onBlockSearch }: {
  onFlyTo: (t: FlyTarget) => void;
  blockSearch: string;
  onBlockSearch: (q: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeoResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = (val: string) => {
    setQuery(val);
    // Also update block filter
    onBlockSearch(val);
    if (debounce.current) clearTimeout(debounce.current);
    if (val.trim().length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    debounce.current = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await geocode(val);
        setResults(r);
        setOpen(r.length > 0);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 450);
  };

  const pick = (r: GeoResult) => {
    setQuery(r.display_name.split(",")[0]);
    setOpen(false);
    onFlyTo({
      lng: parseFloat(r.lon),
      lat: parseFloat(r.lat),
      zoom: 14,
      label: r.display_name.split(",")[0],
    });
  };

  const clear = () => {
    setQuery("");
    setResults([]);
    setOpen(false);
    onBlockSearch("");
    inputRef.current?.focus();
  };

  return (
    <div className="relative">
      {/* Search input */}
      <div
        className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.08] px-3 py-2.5 focus-within:border-white/25 focus-within:bg-white/[0.11] transition-all"
      >
        {loading ? (
          <motion.span
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
            className="flex-none text-white/40 text-base leading-none"
          >
            ↻
          </motion.span>
        ) : (
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="flex-none text-white/40">
            <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M10.5 10.5L14.5 14.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        )}
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Search map or block…"
          className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/30"
          aria-label="Search map location or block"
          autoComplete="off"
        />
        {query && (
          <button
            onClick={clear}
            className="flex-none text-white/40 hover:text-white/70 transition text-sm leading-none"
            aria-label="Clear search"
          >
            ✕
          </button>
        )}
      </div>

      {/* Geocoding results dropdown */}
      <AnimatePresence>
        {open && results.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.18, ease: EASE }}
            className="absolute left-0 right-0 top-full mt-1.5 z-50 rounded-xl border border-white/10 bg-[#0e1120]/95 backdrop-blur-xl shadow-2xl overflow-hidden"
          >
            <p className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider text-white/35 font-semibold">
              Map results
            </p>
            {results.map((r) => (
              <button
                key={r.place_id}
                onClick={() => pick(r)}
                className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left hover:bg-white/[0.07] transition group"
              >
                <span className="mt-0.5 flex-none text-white/40 group-hover:text-blue-400 transition">
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                    <path d="M8 1.5C5.51 1.5 3.5 3.51 3.5 6c0 3.75 4.5 8.5 4.5 8.5S12.5 9.75 12.5 6c0-2.49-2.01-4.5-4.5-4.5zM8 7.5a1.5 1.5 0 110-3 1.5 1.5 0 010 3z" fill="currentColor"/>
                  </svg>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-white">
                    {r.display_name.split(",")[0]}
                  </span>
                  <span className="block truncate text-[11px] text-white/40">
                    {r.display_name.split(",").slice(1, 3).join(",")}
                  </span>
                </span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function Sidebar({ blocks, selected, onSelect, onBrief, briefLoading, onFlyTo, viewMode, floorLevel, onFloorLevelChange, weather }: Props) {
  const [blockSearch, setBlockSearch] = useState("");

  // ── All blocks grouped by area, sorted by heat ───────────────────────────
  const groupedBlocks = useMemo(() => {
    const q = blockSearch.trim().toLowerCase();
    const filtered = q
      ? blocks.filter(
          (b) => b.name.toLowerCase().includes(q) || b.area.toLowerCase().includes(q),
        )
      : blocks;
    const sorted = [...filtered].sort((a, b) => b.lst - a.lst);
    const map = new Map<string, Block[]>();
    for (const b of sorted) {
      if (!map.has(b.area)) map.set(b.area, []);
      map.get(b.area)!.push(b);
    }
    return [...map.entries()].sort((a, b) => b[1][0].lst - a[1][0].lst);
  }, [blocks, blockSearch]);

  const totalShown = useMemo(
    () => groupedBlocks.reduce((s, [, bs]) => s + bs.length, 0),
    [groupedBlocks],
  );

  // ── Diurnal curve for selected block ─────────────────────────────────────
  const curve = useMemo(
    () => (selected ? diurnalCurve(selected, NO_INTERVENTIONS) : null),
    [selected],
  );

  // ── AI Rationale generator for the inline explanation box ─────────────────
  type AIRationale = { summary: string; savings?: string; stress?: string };
  const [rationale, setRationale] = useState<AIRationale | null>(null);
  const [rationaleLoading, setRationaleLoading] = useState(false);

  useEffect(() => {
    if (!selected || viewMode === 'temp') {
      setRationale(null);
      return;
    }

    let active = true;
    setRationaleLoading(true);
    setRationale(null);

    const timeOfDay = viewMode === 'ac_noon' ? 'Noon' : 'Night';
    const setpoint = viewMode === 'ac_noon' ? getNoonAC(selected, floorLevel) : getNightAC(selected, floorLevel);

    const context = `Block ${selected.name} (${selected.area}): LST ${selected.lst.toFixed(1)}°C, density ${Math.round(selected.density * 100)}%, canopy ${Math.round(selected.canopy * 100)}%, traffic ${Math.round(selected.traffic * 100)}%, floor level ${floorLevel}. Live City Weather: Air Temp ${weather.temperature.toFixed(1)}°C, Feels-like ${weather.apparentTemp.toFixed(1)}°C, Humidity ${weather.humidity}%, Wind ${weather.windSpeed} km/h.`;
    const prompt = `Analyze this block. Return a JSON object with keys:
    - "summary": 1-2 sentence explanation of why the recommended AC temperature is ${setpoint}°C at ${timeOfDay}. Take into account the live conditions: air temp ${weather.temperature.toFixed(1)}°C, feels-like ${weather.apparentTemp.toFixed(1)}°C, relative humidity ${weather.humidity}%, and wind speed ${weather.windSpeed} km/h (specifically explaining how the humidity of ${weather.humidity}% or wind speed of ${weather.windSpeed} km/h changes the comfort or AC strain in this block).
    - "savings": Energy savings calculation (1 sentence, e.g. "Saves up to X% electricity compared to a baseline of 22°C").
    - "stress": Localized stress description (1 sentence, detailing combined load on grid capacity, compressor strain, and home electrical wiring safety).
    Do not wrap in markdown tags.`;

    fetch("/api/rationale", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        context
      })
    })
    .then(res => res.json())
    .then(data => {
      if (!active) return;
      try {
        const parsed = JSON.parse(data.reply) as AIRationale;
        setRationale(parsed);
      } catch {
        setRationale({
          summary: data.reply,
          savings: "Calculated based on microclimate properties.",
          stress: `Moderate pressure on local grid and compressor cooling cycles.`
        });
      }
    })
    .catch(() => {
      if (active) setRationale({
        summary: "Failed to generate microclimate context from the digital twin.",
        savings: "Unable to calculate.",
        stress: "Unable to calculate."
      });
    })
    .finally(() => {
      if (active) setRationaleLoading(false);
    });

    return () => {
      active = false;
    };
  }, [selected?.id, viewMode, floorLevel, weather.temperature, weather.humidity, weather.apparentTemp, weather.windSpeed]);

  return (
    <motion.aside
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="pointer-events-auto fixed left-0 right-0 bottom-0 md:top-0 md:right-auto md:w-[320px] z-20 flex flex-col h-[42dvh] md:h-screen transition-all duration-300"
    >
      {/* Glass panel */}
      <div
        className="flex flex-col h-full border-t md:border-t-0 md:border-r border-white/10 rounded-t-2xl md:rounded-t-0 overflow-hidden"
        style={{
          background: "linear-gradient(180deg, rgba(12,15,30,0.93) 0%, rgba(8,10,22,0.97) 100%)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          boxShadow: "0 -4px 32px rgba(0,0,0,0.4), 4px 0 32px rgba(0,0,0,0.55)",
        }}
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex-none px-4 pt-5 pb-3">
          <h1 className="font-display text-sm font-bold tracking-wide text-white">
            CHHAON{" "}
            <span className="font-normal text-white/35">छांव</span>
          </h1>
          <p className="text-[11px] text-white/40 mt-0.5">Gurugram heat twin</p>

          {/* Search — both geocoding + block filter */}
          <div className="mt-3">
            <MapSearch
              onFlyTo={onFlyTo}
              blockSearch={blockSearch}
              onBlockSearch={setBlockSearch}
            />
          </div>

          {/* Floor level selector segment */}
          <div className="mt-3">
            <div className="text-[10px] font-bold text-white/40 tracking-wider uppercase mb-1.5 px-0.5">Floor Level</div>
            <div className="grid grid-cols-3 bg-black/40 rounded-xl p-0.5 border border-white/5">
              {(['1-2', '3-4', '5+'] as FloorLevel[]).map((f) => {
                const active = floorLevel === f;
                const labels = { '1-2': '1-2 Low', '3-4': '3-4 Avg', '5+': '5+ Top' };
                return (
                  <button
                    key={f}
                    onClick={() => onFloorLevelChange(f)}
                    className={`px-1 py-1.5 rounded-lg text-[9px] font-bold tracking-wider uppercase transition-all duration-200 cursor-pointer ${
                      active
                        ? "bg-white/10 text-white shadow border border-white/10"
                        : "text-white/40 hover:text-white/70"
                    }`}
                  >
                    {labels[f]}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="flex-none h-px bg-white/[0.06] mx-4" />

        {/* ── Scrollable content ──────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">
          <AnimatePresence mode="wait">
            {selected ? (
              /* ────── BLOCK DETAIL ────── */
              <motion.div
                key={selected.id}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 12 }}
                transition={{ duration: 0.3, ease: EASE }}
                className="px-4 py-4"
              >
                {/* Header */}
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <h2 className="font-display text-sm font-bold leading-snug text-white">
                      {selected.name}
                    </h2>
                    <p className="text-xs text-white/50 mt-0.5">
                      {selected.area} ·{" "}
                      <span style={{ color: `rgb(${heatColor(selected.score).join(",")})` }}>
                        {riskLabel(selected.score)}
                      </span>
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-none">
                    <HeatBadge score={selected.score} lst={selected.lst} viewMode={viewMode} b={selected} floorLevel={floorLevel} />
                    <button
                      onClick={() => onSelect(null)}
                      className="rounded-full bg-white/10 p-1.5 text-white/50 hover:bg-white/20 hover:text-white transition"
                      aria-label="Back to list"
                    >
                      <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                        <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Vitals grid */}
                <div className="mb-3 grid grid-cols-4 gap-1.5">
                  <Vital label="Density" value={`${Math.round(selected.density * 100)}%`} />
                  <Vital label="NDVI" value={selected.ndvi.toFixed(2)} sub="veg" />
                  <Vital label="Albedo" value={selected.albedo.toFixed(2)} sub="refl" />
                  <Vital label="Canopy" value={`${Math.round(selected.canopy * 100)}%`} />
                </div>

                {/* Micro-explanation for AC recommendation logic (AI Generated) */}
                {viewMode !== 'temp' && (() => {
                  const setpoint = viewMode === 'ac_noon' ? getNoonAC(selected, floorLevel) : getNightAC(selected, floorLevel);
                  // Dynamic savings: 6% per degree saved vs 22°C baseline
                  const pctSaved = (setpoint - 22) * 6;

                  return (
                    <div className="rounded-xl bg-blue-500/5 border border-blue-500/10 p-3 mb-3 text-[10.5px] leading-relaxed text-blue-200">
                      <div className="font-semibold mb-1.5 flex items-center justify-between text-xs text-blue-300">
                        <span className="flex items-center gap-1.5 font-display tracking-wide uppercase text-[10px]">
                          <span>✦</span> AI Climate Rationale
                        </span>
                        {rationaleLoading && (
                          <span className="animate-pulse text-[9px] text-blue-400 font-normal">Analyzing twin...</span>
                        )}
                      </div>

                      <div className="space-y-2">
                        {rationaleLoading ? (
                          <div className="space-y-1.5 py-1">
                            <div className="h-3 w-full bg-blue-500/10 rounded animate-pulse" />
                            <div className="h-3 w-5/6 bg-blue-500/10 rounded animate-pulse" />
                          </div>
                        ) : rationale ? (
                          <p className="text-white/85 bg-white/[0.02] p-2 rounded-lg border border-white/5 font-medium leading-normal">
                            {rationale.summary}
                          </p>
                        ) : (
                          <p className="text-white/60">Failed to load real-time microclimate rationale.</p>
                        )}

                        {/* Visual Widgets Grid */}
                        <div className="grid grid-cols-2 gap-2 mt-2 pt-1.5 border-t border-white/5">
                          {/* Energy Saving Widget */}
                          <div className="rounded-lg bg-white/[0.02] p-2 border border-white/5 flex flex-col justify-between">
                            <div>
                              <span className="text-[8.5px] uppercase tracking-wider text-white/35 block mb-0.5">Energy Saving</span>
                              <span className="text-sm font-bold text-green-400">+{pctSaved}%</span>
                              <span className="text-[8px] text-white/40 block">vs 22°C baseline</span>
                            </div>
                            <div className="w-full bg-white/10 h-1 rounded-full overflow-hidden mt-1.5">
                              <div 
                                className="bg-green-400 h-full rounded-full transition-all duration-300"
                                style={{ width: `${Math.min(100, (pctSaved / 30) * 100)}%` }}
                              />
                            </div>
                          </div>

                          {/* Stress Level Widget */}
                          <div className="rounded-lg bg-white/[0.02] p-2 border border-white/5 flex flex-col justify-between">
                            {(() => {
                              // Dynamic Stress Score calculation: 
                              // Built Density, Shading Canopy cover, Traffic and Floor Level directly drive the score
                              const stressVal = Math.min(100, Math.round(
                                (selected.lst - 30) * 3.5 + 
                                selected.density * 22 + 
                                selected.traffic * 16 + 
                                (floorLevel === '5+' ? 15 : 0)
                              ));
                              let stressLabel = "Low";
                              let stressColor = "text-green-400 bg-green-500/10 border-green-500/20";
                              let barColor = "bg-green-400";
                              
                              if (stressVal >= 80) {
                                stressLabel = "Critical";
                                stressColor = "text-red-400 bg-red-500/10 border-red-500/20";
                                barColor = "bg-red-500";
                              } else if (stressVal >= 55) {
                                stressLabel = "High";
                                stressColor = "text-amber-400 bg-amber-500/10 border-amber-500/20";
                                barColor = "bg-amber-500";
                              } else if (stressVal >= 30) {
                                stressLabel = "Moderate";
                                stressColor = "text-blue-400 bg-blue-500/10 border-blue-500/20";
                                barColor = "bg-blue-400";
                              }

                              return (
                                <>
                                  <div>
                                    <span className="text-[8.5px] uppercase tracking-wider text-white/35 block mb-0.5">AC & Grid Stress</span>
                                    <div className="flex items-center gap-1">
                                      <span className={`text-[8.5px] font-bold px-1 py-0.2 rounded border ${stressColor}`}>
                                        {stressLabel}
                                      </span>
                                      <span className="text-[10px] text-white/60 font-semibold">{stressVal}/100</span>
                                    </div>
                                  </div>
                                  <div className="w-full bg-white/10 h-1 rounded-full overflow-hidden mt-1.5">
                                    <div 
                                      className={`${barColor} h-full rounded-full transition-all duration-300`}
                                      style={{ width: `${stressVal}%` }}
                                    />
                                  </div>
                                </>
                              );
                            })()}
                          </div>
                        </div>

                      </div>
                    </div>
                  );
                })()}

                {/* Temp curve */}
                {curve && (
                  <div className="rounded-xl bg-white/[0.04] px-3 py-2.5 mb-3">
                    <p className="text-[10px] uppercase tracking-wider text-white/35 mb-1.5">
                      24 h surface temperature
                    </p>
                    <TempCurve base={curve.base} cooled={curve.cooled} />
                  </div>
                )}

                {/* AI Brief */}
                <button
                  onClick={() => onBrief(selected)}
                  disabled={briefLoading}
                  className="w-full rounded-xl bg-gradient-to-r from-[#1d4ed8] via-[#0ea5e9] to-[#22c55e] px-4 py-2.5 font-display text-sm font-bold text-white shadow-lg shadow-blue-900/40 transition active:scale-[0.98] disabled:opacity-50 hover:brightness-110"
                >
                  {briefLoading ? "Thinking…" : "✦ AI intervention brief"}
                </button>

                {/* Back to list */}
                <button
                  onClick={() => onSelect(null)}
                  className="mt-2 w-full rounded-xl border border-white/10 px-4 py-2 text-xs text-white/50 hover:text-white/80 hover:bg-white/[0.05] transition"
                >
                  ← Back to all areas
                </button>
              </motion.div>
            ) : (
              /* ────── AREA / BLOCK LIST ────── */
              <motion.div
                key="list"
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 12 }}
                transition={{ duration: 0.3, ease: EASE }}
                className="px-4 py-3"
              >
                {/* List header */}
                <div className="mb-2 flex items-baseline justify-between">
                  <h2 className="font-display text-sm font-bold text-white">All areas</h2>
                  <span className="text-[11px] text-white/35">
                    {totalShown} block{totalShown !== 1 ? "s" : ""}
                  </span>
                </div>

                {/* List Legend Info */}
                {viewMode !== 'temp' && (
                  <div className="rounded-lg bg-white/[0.03] border border-white/[0.05] px-2.5 py-1.5 mb-3 text-[10px] text-white/50 leading-normal">
                    🟢 Green = Eco Setpoint (24-25°C) · 🔴 Red = High Stress Setpoint (26-27°C)
                  </div>
                )}

                {groupedBlocks.length === 0 ? (
                  <p className="py-10 text-center text-sm text-white/35">
                    No blocks match &ldquo;{blockSearch}&rdquo;
                  </p>
                ) : (
                  <div className="space-y-4">
                    {groupedBlocks.map(([area, areaBlocks], gi) => {
                      const areaScore = areaBlocks[0].score;
                      const ac = heatColor(areaScore);
                      const baseIndex = groupedBlocks
                        .slice(0, gi)
                        .reduce((s, [, bs]) => s + bs.length, 0);

                      return (
                        <div key={area}>
                          {/* Area heading */}
                          <div className="mb-1.5 flex items-center gap-2 sticky top-0 py-0.5">
                            <span
                              className="h-2 w-2 rounded-full flex-none"
                              style={{ background: `rgb(${ac.join(",")})` }}
                            />
                            <span className="text-[10px] font-bold uppercase tracking-widest text-white/55">
                              {area}
                            </span>
                            <span className="text-[10px] text-white/25 ml-auto">
                              {areaBlocks.length}
                            </span>
                          </div>
                          <div className="space-y-1">
                            {areaBlocks.map((b, i) => (
                              <BlockRow
                                key={b.id}
                                b={b}
                                index={baseIndex + i}
                                onSelect={onSelect}
                                viewMode={viewMode}
                                floorLevel={floorLevel}
                              />
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.aside>
  );
}
