"use client";

import { AnimatePresence, motion, type PanInfo } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Block,
  diurnalCurve,
  heatColor,
  acColor,
  aqiColor,
  aqiCategory,
  NO_INTERVENTIONS,
  getAC,
  getACScore,
  FloorLevel,
  Weather,
  ViewMode,
} from "@/lib/model";
import TempCurve from "./TempCurve";
import { AssistantCard } from "./AskTwin";
import {
  BHKConfig,
  areaRentStats,
  areaHasRentData,
  areaSamplePins,
  areaMatchesRentFilter,
  areaRentForMode,
  rentColor,
  RENT_BHK_OPTIONS,
} from "@/lib/rentData";

function formatRent(rent: number) {
  return rent >= 100000 ? `₹${(rent / 100000).toFixed(1)}L` : `₹${Math.round(rent / 1000)}k`;
}

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
  onFlyTo: (target: FlyTarget) => void;
  viewMode: ViewMode;
  floorLevel: FloorLevel;
  onFloorLevelChange: (f: FloorLevel) => void;
  weather: Weather;
  userLocation: { longitude: number; latitude: number } | null;
  onUserLocationChange: (loc: { longitude: number; latitude: number } | null) => void;
  rentBudget: string;
  onRentBudgetChange: (v: string) => void;
  rentBHK: BHKConfig | null;
  onRentBHKChange: (v: BHKConfig | null) => void;
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
function HeatBadge({
  score,
  lst,
  viewMode,
  b,
  floorLevel,
  rentBHK,
}: {
  score: number;
  lst: number;
  viewMode: ViewMode;
  b: Block;
  floorLevel: FloorLevel;
  rentBHK: BHKConfig | null;
}) {
  let displayVal = `${lst.toFixed(1)}°C`;
  let title = "LST";
  let c: [number, number, number] = heatColor(score);
  if (viewMode === 'ac') {
    displayVal = `${getAC(b, floorLevel)}°C`;
    title = "AC SETPOINT";
    c = acColor(getACScore(b, floorLevel));
  } else if (viewMode === 'aqi') {
    displayVal = `${Math.round(b.aqi)}`;
    title = aqiCategory(b.aqi);
    c = aqiColor(b.aqi);
  } else if (viewMode === 'rent') {
    const rent = areaRentForMode(b.area, rentBHK) ?? 40000;
    displayVal = `${formatRent(rent)}/mo`;
    title = rentBHK ?? "TYPICAL RENT";
    c = rentColor(rent);
  }
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

function BlockRow({
  b,
  index,
  onSelect,
  viewMode,
  floorLevel,
  rentBHK,
}: {
  b: Block;
  index: number;
  onSelect: (b: Block) => void;
  viewMode: ViewMode;
  floorLevel: FloorLevel;
  rentBHK: BHKConfig | null;
}) {
  const score = b.score;
  const label = `${b.lst.toFixed(1)}°`;

  if (viewMode === 'rent') {
    const rent = areaRentForMode(b.area, rentBHK) ?? 40000;
    const rgb = rentColor(rent);
    const cssRgb = `rgb(${rgb.join(",")})`;
    const pct = Math.min(100, Math.max(4, (rent / 100000) * 100));
    return (
      <motion.button
        key={b.id}
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.25, ease: EASE, delay: Math.min(index * 0.02, 0.35) }}
        onClick={() => onSelect(b)}
        className="flex w-full items-center gap-2.5 rounded-xl bg-white/[0.04] px-2.5 py-2 text-left transition hover:bg-white/[0.09] active:scale-[0.99]"
      >
        <span className="h-7 w-1 flex-none rounded-full" style={{ backgroundColor: cssRgb }} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-medium text-white leading-tight">{b.name}</span>
          <div className="flex items-center gap-2 mt-1">
            <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: cssRgb }} />
            </div>
            <span className="text-[10px] text-white/40 flex-none">{rentBHK ?? "blended"}</span>
          </div>
        </span>
        <span className="font-display text-sm font-bold flex-none" style={{ color: cssRgb }}>
          {formatRent(rent)}
        </span>
      </motion.button>
    );
  }

  if (viewMode === 'aqi') {
    const rgb = aqiColor(b.aqi);
    const cssRgb = `rgb(${rgb.join(",")})`;
    return (
      <motion.button
        key={b.id}
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.25, ease: EASE, delay: Math.min(index * 0.02, 0.35) }}
        onClick={() => onSelect(b)}
        className="flex w-full items-center gap-2.5 rounded-xl bg-white/[0.04] px-2.5 py-2 text-left transition hover:bg-white/[0.09] active:scale-[0.99]"
      >
        <span className="h-7 w-1 flex-none rounded-full" style={{ backgroundColor: cssRgb }} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-medium text-white leading-tight">{b.name}</span>
          <div className="flex items-center gap-2 mt-1">
            <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, (b.aqi / 300) * 100)}%`, backgroundColor: cssRgb }} />
            </div>
            <span className="text-[10px] text-white/40 flex-none">{b.pm25.toFixed(0)} µg/m³</span>
          </div>
        </span>
        <span className="font-display text-sm font-bold flex-none" style={{ color: cssRgb }}>
          {Math.round(b.aqi)}
        </span>
      </motion.button>
    );
  }

  if (viewMode === 'ac') {
    const acScore = getACScore(b, floorLevel);
    const rgb = acColor(acScore);
    const cssRgb = `rgb(${rgb.join(",")})`;
    return (
      <motion.button
        key={b.id}
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.25, ease: EASE, delay: Math.min(index * 0.02, 0.35) }}
        onClick={() => onSelect(b)}
        className="flex w-full items-center gap-2.5 rounded-xl bg-white/[0.04] px-2.5 py-2 text-left transition hover:bg-white/[0.09] active:scale-[0.99]"
      >
        <span className="h-7 w-1 flex-none rounded-full" style={{ backgroundColor: cssRgb }} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-medium text-white leading-tight">{b.name}</span>
          <div className="flex items-center gap-2 mt-1">
            <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${acScore}%`, backgroundColor: cssRgb }} />
            </div>
            <span className="text-[10px] text-white/40 w-7 text-right">{Math.round(acScore)}%</span>
          </div>
        </span>
        <span className="font-display text-sm font-bold flex-none text-white">
          {getAC(b, floorLevel)}°C
        </span>
      </motion.button>
    );
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
function MapSearch({
  onFlyTo,
  blockSearch,
  onBlockSearch,
  userLocation,
  onUserLocationChange,
  blocks,
  onSelect
}: {
  onFlyTo: (t: FlyTarget) => void;
  blockSearch: string;
  onBlockSearch: (q: string) => void;
  userLocation: { longitude: number; latitude: number } | null;
  onUserLocationChange: (loc: { longitude: number; latitude: number } | null) => void;
  blocks: Block[];
  onSelect: (b: Block) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeoResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectClosestBlock = (lng: number, lat: number) => {
    let closest = blocks[0];
    let minD = Infinity;
    for (const b of blocks) {
      const d = Math.hypot(b.center[0] - lng, b.center[1] - lat);
      if (d < minD) {
        minD = d;
        closest = b;
      }
    }
    if (closest) onSelect(closest);
  };

  const handleLocateClick = () => {
    if (userLocation) {
      onFlyTo({
        lng: userLocation.longitude,
        lat: userLocation.latitude,
        zoom: 14.5
      });
      selectClosestBlock(userLocation.longitude, userLocation.latitude);
    } else {
      setLocating(true);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLocating(false);
          const coords = {
            longitude: pos.coords.longitude,
            latitude: pos.coords.latitude,
          };
          onUserLocationChange(coords);
          onFlyTo({
            lng: coords.longitude,
            lat: coords.latitude,
            zoom: 14.5
          });
          selectClosestBlock(coords.longitude, coords.latitude);
        },
        (err) => {
          setLocating(false);
          console.warn("Geolocation failed", err);
          // Fallback to Gurugram city center
          onFlyTo({ lng: 77.035, lat: 28.435, zoom: 13.5 });
        },
        { enableHighAccuracy: false, timeout: 8000 }
      );
    }
  };

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
        {query ? (
          <button
            onClick={clear}
            className="flex-none text-white/40 hover:text-white/70 transition text-sm leading-none p-1"
            aria-label="Clear search"
          >
            ✕
          </button>
        ) : (
          <button
            onClick={handleLocateClick}
            type="button"
            title="Locate me"
            className="flex-none text-white/45 hover:text-emerald-400 active:text-emerald-300 transition p-1 cursor-pointer hover:scale-105 active:scale-95"
            aria-label="Center map on my location"
          >
            {locating ? (
              <motion.span
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                className="block text-[12px] leading-none"
              >
                ↻
              </motion.span>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <circle cx="12" cy="12" r="3" fill="currentColor" />
                <line x1="12" y1="1" x2="12" y2="3" />
                <line x1="12" y1="21" x2="12" y2="23" />
                <line x1="1" y1="12" x2="3" y2="12" />
                <line x1="21" y1="12" x2="23" y2="12" />
              </svg>
            )}
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

function BlockAIIntervention({ b, floorLevel }: { b: Block; floorLevel: FloorLevel }) {
  const [loading, setLoading] = useState(true);
  const [jsonStr, setJsonStr] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setJsonStr(null);
    
    const floorLabel = { "1-2": "1st-2nd floor (shaded level)", "3-4": "3rd-4th floor (mid level)", "5+": "5th+ top floor (roof solar radiation exposure)" }[floorLevel];
    const prompt = `Write a full intervention brief for ${b.name}. Cover: why this block runs hot (density ${Math.round(b.density * 100)}%, NDVI ${b.ndvi.toFixed(2)}, albedo ${b.albedo.toFixed(2)}, canopy ${Math.round(b.canopy * 100)}%), calculations for ${floorLabel}, the recommended indoor AC setpoint & intervention mix with expected relief in Indian conditions, rough cost, and what to verify on the ground.`;

    const contextStr = `Block ${b.name} (${b.area}): LST ${b.lst.toFixed(1)}°C, heat score ${Math.round(b.score)}/100, density ${b.density.toFixed(2)}, NDVI ${b.ndvi.toFixed(2)}, albedo ${b.albedo.toFixed(2)}, canopy ${b.canopy.toFixed(2)}, traffic ${b.traffic.toFixed(2)}`;

    fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        messages: [{ role: "user", content: prompt }], 
        context: contextStr
      }),
    })
    .then(r => r.json())
    .then(data => {
      if (active) setJsonStr(data.reply);
    })
    .catch(err => {
      if (active) console.error("Failed to load AI intervention brief:", err);
    })
    .finally(() => {
      if (active) setLoading(false);
    });

    return () => { active = false; };
  }, [b.id, floorLevel, b.name, b.area, b.lst, b.score, b.density, b.ndvi, b.albedo, b.canopy, b.traffic]);

  return (
    <div className="mt-4 border-t border-white/5 pt-4">
      <div className="flex items-center gap-2 mb-4 text-emerald-400">
        <span className="text-sm">✦</span>
        <h3 className="font-display font-bold tracking-wide uppercase text-[11px]">AI Climate Rationale & Interventions</h3>
      </div>
      {loading ? (
        <div className="space-y-3 py-2">
          <div className="h-3 w-3/4 bg-white/5 rounded animate-pulse" />
          <div className="h-3 w-full bg-white/5 rounded animate-pulse" />
          <div className="h-3 w-5/6 bg-white/5 rounded animate-pulse" />
          <div className="h-16 w-full bg-white/5 rounded-xl animate-pulse mt-4" />
        </div>
      ) : jsonStr ? (
        <div className="[&_p]:text-[13px]">
          <AssistantCard jsonStr={jsonStr} />
        </div>
      ) : (
        <p className="text-white/50 text-sm">Failed to generate AI brief.</p>
      )}
    </div>
  );
}

export default function Sidebar({
  blocks,
  selected,
  onSelect,
  onFlyTo,
  viewMode,
  floorLevel,
  onFloorLevelChange,
  weather,
  userLocation,
  onUserLocationChange,
  rentBudget,
  onRentBudgetChange,
  rentBHK,
  onRentBHKChange,
}: Props) {
  const [blockSearch, setBlockSearch] = useState("");
  const isSearching = blockSearch.trim() !== "";

  // Areas render collapsed by default — only mount their blocks when expanded,
  // which keeps the list to ~19 rows at rest instead of ~1800+.
  const [expandedAreas, setExpandedAreas] = useState<Set<string>>(new Set());
  const toggleArea = useCallback((area: string) => {
    setExpandedAreas((prev) => {
      const next = new Set(prev);
      if (next.has(area)) next.delete(area);
      else next.add(area);
      return next;
    });
  }, []);

  const areaMatchesRent = useCallback(
    (area: string) => areaMatchesRentFilter(area, rentBudget, rentBHK),
    [rentBudget, rentBHK],
  );

  // ── All blocks grouped by area, sorted by heat ───────────────────────────
  const groupedBlocks = useMemo(() => {
    const q = blockSearch.trim().toLowerCase();
    const filtered = q
      ? blocks.filter(
          (b) => b.name.toLowerCase().includes(q) || b.area.toLowerCase().includes(q),
        )
      : blocks;
    const rank = (b: Block) =>
      viewMode === 'aqi'
        ? b.aqi
        : viewMode === 'ac'
          ? getACScore(b, floorLevel)
          : viewMode === 'rent'
            ? (areaRentForMode(b.area, rentBHK) ?? 0)
            : b.lst;
    const sorted = [...filtered].sort((a, b) => rank(b) - rank(a));
    const map = new Map<string, Block[]>();
    for (const b of sorted) {
      if (!map.has(b.area)) map.set(b.area, []);
      map.get(b.area)!.push(b);
    }
    return [...map.entries()]
      .filter(([area]) => areaMatchesRent(area))
      .sort((a, b) => rank(b[1][0]) - rank(a[1][0]));
  }, [blocks, blockSearch, viewMode, floorLevel, rentBHK, areaMatchesRent]);

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
    if (!selected || viewMode !== 'ac') {
      setRationale(null);
      return;
    }

    let active = true;
    setRationaleLoading(true);
    setRationale(null);

    const setpoint = getAC(selected, floorLevel);

    const context = `Block ${selected.name} (${selected.area}):
- Microclimate: LST ${selected.lst.toFixed(1)}°C, Built Density ${Math.round(selected.density * 100)}%, Tree Canopy ${Math.round(selected.canopy * 100)}%, Traffic ${Math.round(selected.traffic * 100)}%.
- Target Floor: ${floorLevel}
- Live Weather: Air Temp ${weather.temperature.toFixed(1)}°C, Feels-like ${weather.apparentTemp.toFixed(1)}°C, Humidity ${weather.humidity}%, Wind ${weather.windSpeed} km/h.`;

    const prompt = `Explain why the AC target is exactly ${setpoint}°C for this specific block. Synthesize the block's microclimate (density, canopy, LST) with the live weather (especially the ${weather.humidity}% humidity and ${weather.windSpeed} km/h wind) and floor level. Do not give generic city-wide advice.`;

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

  // ── Mobile draggable sheet: peek / half / full snap points (vh) ───────────
  const SNAP_POINTS = [13, 58, 92];
  const [isMobile, setIsMobile] = useState(false);
  const [sheetVh, setSheetVh] = useState(SNAP_POINTS[1]);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    setIsMobile(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Auto-expand from peek when a block is opened so detail isn't hidden
  useEffect(() => {
    if (selected && sheetVh < SNAP_POINTS[1]) setSheetVh(SNAP_POINTS[1]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  const handlePanStart = useCallback(() => {
    setIsDragging(true);
  }, []);

  const handlePan = useCallback((_: unknown, info: PanInfo) => {
    setSheetVh((v) => Math.min(94, Math.max(10, v - (info.delta.y / window.innerHeight) * 100)));
  }, []);

  const handlePanEnd = useCallback((_: unknown, info: PanInfo) => {
    setIsDragging(false);
    setSheetVh((v) => {
      let nearest = SNAP_POINTS[0];
      for (const p of SNAP_POINTS) if (Math.abs(p - v) < Math.abs(nearest - v)) nearest = p;
      let idx = SNAP_POINTS.indexOf(nearest);
      if (info.velocity.y < -650 && idx < SNAP_POINTS.length - 1) idx += 1;
      else if (info.velocity.y > 650 && idx > 0) idx -= 1;
      return SNAP_POINTS[idx];
    });
  }, []);

  return (
    <motion.aside
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      style={isMobile ? { height: `${sheetVh}dvh`, transition: isDragging ? "none" : "height 0.4s cubic-bezier(0.22,1,0.36,1)" } : undefined}
      className="pointer-events-auto fixed left-0 right-0 bottom-0 md:top-0 md:right-auto md:w-[320px] z-20 flex flex-col h-[58dvh] md:h-screen"
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
        {/* Drag handle — mobile only, grab anywhere on this row to resize */}
        <motion.div
          onPanStart={handlePanStart}
          onPan={handlePan}
          onPanEnd={handlePanEnd}
          className="md:hidden flex-none flex justify-center pt-2.5 pb-1.5 cursor-grab active:cursor-grabbing touch-none"
        >
          <span className="h-1.5 w-10 rounded-full bg-white/25" />
        </motion.div>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex-none px-4 pt-1 pb-2 md:pt-5 md:pb-3">
          <h1 className="font-display text-sm font-bold tracking-wide text-white">
            CHHAON{" "}
            <span className="font-normal text-white/35">छांव</span>
          </h1>
          <p className="hidden md:block text-[11px] text-white/40 mt-0.5">
            The biggest, most unorganized dataset — visualized for God&apos;s favorite city, Gurugram
          </p>

          {/* Search — both geocoding + block filter */}
          <div className="mt-2 md:mt-3">
            <MapSearch
              onFlyTo={onFlyTo}
              blockSearch={blockSearch}
              onBlockSearch={setBlockSearch}
              userLocation={userLocation}
              onUserLocationChange={onUserLocationChange}
              blocks={blocks}
              onSelect={onSelect}
            />
          </div>

          {/* Master rent filter — optional budget + BHK requirement */}
          <div className="mt-2 md:mt-3">
            <div className="text-[10px] font-bold text-white/40 tracking-wider uppercase mb-1.5 px-0.5">
              💰 Rent filter <span className="normal-case font-normal text-white/25">(optional)</span>
            </div>
            <div className="flex gap-1.5">
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={rentBudget}
                onChange={(e) => onRentBudgetChange(e.target.value)}
                placeholder="Max ₹/mo"
                className="w-24 min-w-0 flex-none rounded-lg border border-white/5 bg-black/40 px-2.5 py-1.5 text-xs text-white outline-none placeholder:text-white/30 focus:border-white/20"
                aria-label="Maximum monthly rent budget"
              />
              <div className="grid flex-1 grid-cols-4 gap-1 rounded-lg border border-white/5 bg-black/40 p-0.5">
                {(["Any", ...RENT_BHK_OPTIONS] as const).map((opt) => {
                  const active = opt === "Any" ? rentBHK === null : rentBHK === opt;
                  return (
                    <button
                      key={opt}
                      onClick={() => onRentBHKChange(opt === "Any" ? null : (opt as BHKConfig))}
                      className={`rounded-md px-1 py-1 text-[9px] font-bold tracking-wide uppercase transition-all ${
                        active ? "bg-white/10 text-white shadow border border-white/10" : "text-white/40 hover:text-white/70"
                      }`}
                    >
                      {opt === "Any" ? "Any" : opt.replace(" BHK", "")}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Floor level selector segment */}
          <div className="mt-2 md:mt-3">
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
                    <HeatBadge score={selected.score} lst={selected.lst} viewMode={viewMode} b={selected} floorLevel={floorLevel} rentBHK={rentBHK} />
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

                {/* Rent panel — real crowdsourced pins near this area, not a map layer */}
                {areaHasRentData(selected.area) ? (
                  (() => {
                    const stats = areaRentStats(selected.area);
                    const configs = (Object.keys(stats) as BHKConfig[]).sort(
                      (a, b) => (stats[a]?.median ?? 0) - (stats[b]?.median ?? 0),
                    );
                    return (
                      <div className="rounded-xl bg-white/[0.04] px-3 py-2.5 mb-3">
                        <p className="text-[10px] uppercase tracking-wider text-white/35 mb-2">
                          💰 Rent in {selected.area}{" "}
                          <span className="normal-case text-white/25">(average, indicative — ± ₹5,000)</span>
                        </p>
                        <div className="grid grid-cols-2 gap-1.5">
                          {configs.map((c) => {
                            const s = stats[c]!;
                            const isFilterMatch = rentBHK === c;
                            return (
                              <div
                                key={c}
                                className={`rounded-lg px-2 py-1.5 border ${
                                  isFilterMatch ? "border-emerald-400/40 bg-emerald-400/10" : "border-white/5 bg-white/[0.02]"
                                }`}
                              >
                                <div className="text-[9px] uppercase tracking-wider text-white/40">{c}</div>
                                <div className="text-sm font-bold text-white">
                                  ₹{s.median.toLocaleString("en-IN")}
                                  <span className="text-[9px] font-normal text-white/35"> /mo</span>
                                </div>
                                <div className="text-[9px] text-white/30">{s.n} listing{s.n !== 1 ? "s" : ""}</div>
                              </div>
                            );
                          })}
                        </div>
                        {(() => {
                          const sample = areaSamplePins(selected.area, rentBHK ?? undefined, 2);
                          return sample.length > 0 ? (
                            <p className="mt-2 text-[10px] text-white/30">
                              e.g. {sample.map((p) => p.society).join(", ")}
                            </p>
                          ) : null;
                        })()}
                      </div>
                    );
                  })()
                ) : (
                  <div className="rounded-xl bg-white/[0.03] px-3 py-2.5 mb-3 text-[10.5px] text-white/40">
                    💰 No rent submissions near {selected.area} yet.
                  </div>
                )}

                {/* AQI panel: local PM2.5/AQI reading + dominant contributor */}
                {viewMode === 'aqi' && (() => {
                  const rgb = aqiColor(selected.aqi);
                  const cssRgb = `rgb(${rgb.join(",")})`;
                  const trafficShare = selected.traffic * 0.9 + selected.density * 0.35;
                  const vegShare = selected.ndvi * 0.28 + selected.canopy * 0.15;
                  const dominant = trafficShare > vegShare * 1.3 ? "traffic & built density" : "mixed sources";
                  return (
                    <div
                      className="rounded-xl p-3 mb-3 text-[10.5px] leading-relaxed"
                      style={{ background: `rgba(${rgb.join(",")},0.08)`, border: `1px solid rgba(${rgb.join(",")},0.2)` }}
                    >
                      <div className="font-semibold mb-1.5 flex items-center justify-between text-xs" style={{ color: cssRgb }}>
                        <span className="flex items-center gap-1.5 font-display tracking-wide uppercase text-[10px]">
                          <span>💨</span> Air Quality
                        </span>
                        <span className="font-bold">{aqiCategory(selected.aqi)}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-lg bg-white/[0.02] p-2 border border-white/5">
                          <span className="text-[8.5px] uppercase tracking-wider text-white/35 block mb-0.5">PM2.5</span>
                          <span className="text-sm font-bold text-white">{selected.pm25.toFixed(1)} µg/m³</span>
                        </div>
                        <div className="rounded-lg bg-white/[0.02] p-2 border border-white/5">
                          <span className="text-[8.5px] uppercase tracking-wider text-white/35 block mb-0.5">US AQI</span>
                          <span className="text-sm font-bold" style={{ color: cssRgb }}>{Math.round(selected.aqi)}</span>
                        </div>
                      </div>
                      <p className="text-white/70 mt-2">
                        Dominant local driver: <span className="text-white/90 font-medium">{dominant}</span>. Tree canopy and
                        vegetation lightly scrub particulates here, but do far less for PM2.5 than for surface heat.
                      </p>
                    </div>
                  );
                })()}

                {/* Micro-explanation for AC recommendation logic (AI Generated) */}
                {viewMode === 'ac' && (() => {
                  const setpoint = getAC(selected, floorLevel);
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

                {/* AI Interventions Widget */}
                {viewMode === 'temp' && (
                  <BlockAIIntervention b={selected} floorLevel={floorLevel} />
                )}

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
                {viewMode === 'ac' && (
                  <div className="rounded-lg bg-white/[0.03] border border-white/[0.05] px-2.5 py-1.5 mb-3 text-[10px] text-white/50 leading-normal">
                    🟢 Green = Eco Setpoint (24-25°C) · 🔴 Red = High Stress Setpoint (26-27°C)
                  </div>
                )}
                {viewMode === 'aqi' && (
                  <div className="rounded-lg bg-white/[0.03] border border-white/[0.05] px-2.5 py-1.5 mb-3 text-[10px] text-white/50 leading-normal">
                    🟢 Good · 🟡 Moderate · 🟠 Unhealthy (Sensitive) · 🔴 Unhealthy · 🟣 Very Unhealthy
                  </div>
                )}
                {viewMode === 'rent' && (
                  <div className="rounded-lg bg-white/[0.03] border border-white/[0.05] px-2.5 py-1.5 mb-3 text-[10px] text-white/50 leading-normal">
                    🟢 ≤ ₹20k · 🟡 ~₹40k · 🔴 ≥ ₹80k — {rentBHK ?? "blended across configs"}
                  </div>
                )}

                {groupedBlocks.length === 0 ? (
                  <p className="py-10 text-center text-sm text-white/35">
                    {blockSearch
                      ? <>No blocks match &ldquo;{blockSearch}&rdquo;</>
                      : "No areas match this rent filter"}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {groupedBlocks.map(([area, areaBlocks]) => {
                      const top = areaBlocks[0];
                      const areaRent = areaRentForMode(area, rentBHK);
                      const ac =
                        viewMode === 'aqi'
                          ? aqiColor(top.aqi)
                          : viewMode === 'ac'
                            ? acColor(getACScore(top, floorLevel))
                            : viewMode === 'rent'
                              ? rentColor(areaRent ?? 40000)
                              : heatColor(top.score);
                      const cssRgb = `rgb(${ac.join(",")})`;
                      const topLabel =
                        viewMode === 'aqi'
                          ? `${Math.round(top.aqi)}`
                          : viewMode === 'ac'
                            ? `${getAC(top, floorLevel)}°C`
                            : viewMode === 'rent'
                              ? `${formatRent(areaRent ?? 40000)}/mo`
                              : `${top.lst.toFixed(1)}°`;
                      const expanded = isSearching || expandedAreas.has(area);

                      return (
                        <div key={area}>
                          {/* Area heading — collapsed by default, tap to expand its blocks */}
                          <button
                            onClick={() => toggleArea(area)}
                            className="flex w-full items-center gap-2 rounded-lg py-1.5 px-0.5 transition hover:bg-white/[0.04]"
                          >
                            <span className="h-2 w-2 rounded-full flex-none" style={{ background: cssRgb }} />
                            <span className="text-[10px] font-bold uppercase tracking-widest text-white/55">
                              {area}
                            </span>
                            <span className="ml-auto flex items-center gap-2">
                              <span className="font-display text-xs font-bold" style={{ color: cssRgb }}>
                                {topLabel}
                              </span>
                              <span className="text-[10px] text-white/25">{areaBlocks.length}</span>
                              <motion.svg
                                animate={{ rotate: expanded ? 180 : 0 }}
                                transition={{ duration: 0.25, ease: EASE }}
                                width="10"
                                height="10"
                                viewBox="0 0 10 10"
                                fill="none"
                                className="text-white/35"
                              >
                                <path d="M1.5 3.5L5 7l3.5-3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                              </motion.svg>
                            </span>
                          </button>
                          <AnimatePresence initial={false}>
                            {expanded && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.25, ease: EASE }}
                                className="overflow-hidden"
                              >
                                <div className="space-y-1 pb-1 pt-1">
                                  {areaBlocks.map((b, i) => (
                                    <BlockRow
                                      key={b.id}
                                      b={b}
                                      index={i}
                                      onSelect={onSelect}
                                      viewMode={viewMode}
                                      floorLevel={floorLevel}
                                      rentBHK={rentBHK}
                                    />
                                  ))}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
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
