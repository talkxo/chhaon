"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Block, generateBlocks, FloorLevel } from "@/lib/model";
import Sidebar, { type FlyTarget } from "@/components/BottomSheet";
import TopBar from "@/components/TopBar";
import AskTwin from "@/components/AskTwin";

const MapView = dynamic(() => import("@/components/MapView"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex items-center justify-center bg-[#0a0c16]">
      <motion.div
        animate={{ scale: [1, 1.15, 1], opacity: [0.5, 1, 0.5] }}
        transition={{ repeat: Infinity, duration: 2, ease: [0.45, 0, 0.55, 1] }}
        className="font-display text-sm tracking-[0.3em] text-white/60"
      >
        CHHAON · warming up the twin
      </motion.div>
    </div>
  ),
});

type Msg = { role: "user" | "assistant"; content: string };

export default function Home() {
  const [weather, setWeather] = useState({
    temperature: 40.5,
    humidity: 35,
    apparentTemp: 43.5,
    windSpeed: 10,
    weatherCode: 0,
  });
  const [weatherLoading, setWeatherLoading] = useState(true);

  // Fetch live weather baseline for Gurugram from our API
  useEffect(() => {
    let active = true;
    fetch("/api/weather")
      .then((res) => res.json())
      .then((data) => {
        if (active && typeof data.temperature === "number") {
          setWeather({
            temperature: data.temperature ?? 40.5,
            humidity: data.humidity ?? 35,
            apparentTemp: data.apparentTemp ?? data.temperature ?? 43.5,
            windSpeed: data.windSpeed ?? 10,
            weatherCode: data.weatherCode ?? 0,
          });
        }
      })
      .catch((err) => console.error("Failed to load live Gurugram weather:", err))
      .finally(() => {
        if (active) setWeatherLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const blocks = useMemo(() => generateBlocks(weather.temperature, weather.humidity), [weather.temperature, weather.humidity]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [askOpen, setAskOpen] = useState(false);
  const [seed, setSeed] = useState<Msg[] | null>(null);
  // Geocoded location from sidebar search → drives MapView camera
  const [flyToTarget, setFlyToTarget] = useState<FlyTarget | null>(null);

  // View state layers and building floors filters
  const [viewMode, setViewMode] = useState<"temp" | "ac">("temp");
  const [floorLevel, setFloorLevel] = useState<FloorLevel>("3-4");
  const [userLocation, setUserLocation] = useState<{ longitude: number; latitude: number } | null>(null);

  const selected = useMemo(
    () => blocks.find((b) => b.id === selectedId) ?? null,
    [blocks, selectedId],
  );

  const handleSelect = useCallback((b: Block | null) => {
    setSelectedId(b?.id ?? null);
  }, []);



  const handleFlyTo = useCallback((target: FlyTarget) => {
    setFlyToTarget({ ...target, _ts: Date.now() } as FlyTarget & { _ts: number });
  }, []);

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-[#0a0c16]">
      {/* Map fills the full screen */}
      <MapView
        blocks={blocks}
        selectedId={selectedId}
        flyToTarget={flyToTarget}
        onSelect={handleSelect}
        viewMode={viewMode}
        floorLevel={floorLevel}
        userLocation={userLocation}
        onUserLocationChange={setUserLocation}
      />

      {/* Sidebar — left panel, 320 px */}
      <Sidebar
        blocks={blocks}
        selected={selected}
        onSelect={handleSelect}
        onFlyTo={handleFlyTo}
        viewMode={viewMode}
        floorLevel={floorLevel}
        onFloorLevelChange={setFloorLevel}
        weather={weather}
        userLocation={userLocation}
        onUserLocationChange={setUserLocation}
      />

      {/* TopBar — floats top-right, leaves sidebar gap */}
      <TopBar 
        blocks={blocks} 
        weather={weather}
        onAsk={() => { setSeed(null); setAskOpen(true); }}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
      />

      <AskTwin
        open={askOpen}
        onClose={() => setAskOpen(false)}
        blocks={blocks}
        selected={selected}
        seed={seed}
        weather={weather}
      />
    </main>
  );
}
