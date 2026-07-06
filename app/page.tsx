"use client";

import dynamic from "next/dynamic";
import { useCallback, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Block, generateBlocks } from "@/lib/model";
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
  const blocks = useMemo(() => generateBlocks(), []);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [askOpen, setAskOpen] = useState(false);
  const [seed, setSeed] = useState<Msg[] | null>(null);
  // Geocoded location from sidebar search → drives MapView camera
  const [flyToTarget, setFlyToTarget] = useState<FlyTarget | null>(null);

  const selected = useMemo(
    () => blocks.find((b) => b.id === selectedId) ?? null,
    [blocks, selectedId],
  );

  const handleSelect = useCallback((b: Block | null) => {
    setSelectedId(b?.id ?? null);
  }, []);

  const handleBrief = useCallback((b: Block) => {
    setSeed([
      {
        role: "user",
        content: `Write a full intervention brief for ${b.name}. Cover: why this block runs hot (density ${Math.round(b.density * 100)}%, NDVI ${b.ndvi.toFixed(2)}, albedo ${b.albedo.toFixed(2)}, canopy ${Math.round(b.canopy * 100)}%), the recommended intervention mix with expected °C relief, rough cost in Indian Rupees, and what to verify on the ground before committing budget.`,
      },
    ]);
    setAskOpen(true);
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
      />

      {/* Sidebar — left panel, 320 px */}
      <Sidebar
        blocks={blocks}
        selected={selected}
        onSelect={handleSelect}
        onBrief={handleBrief}
        briefLoading={false}
        onFlyTo={handleFlyTo}
      />

      {/* TopBar — floats top-right, leaves sidebar gap */}
      <TopBar blocks={blocks} onAsk={() => { setSeed(null); setAskOpen(true); }} />

      <AskTwin
        open={askOpen}
        onClose={() => setAskOpen(false)}
        blocks={blocks}
        selected={selected}
        seed={seed}
      />
    </main>
  );
}
