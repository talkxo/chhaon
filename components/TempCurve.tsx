"use client";

import { motion } from "framer-motion";
import { useMemo } from "react";

// 24-hour temperature projection drawn as a smooth cubic-bezier path.
// When interventions change, the cooled curve morphs via path interpolation —
// the bezier motif is literal here, not just an easing function.

const W = 340;
const H = 130;
const PAD = { l: 30, r: 10, t: 14, b: 20 };

function toPath(values: number[], yOf: (v: number) => number): string {
  const n = values.length;
  const xOf = (i: number) => PAD.l + (i / (n - 1)) * (W - PAD.l - PAD.r);
  const pts = values.map((v, i) => [xOf(i), yOf(v)] as const);
  let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    // Catmull-Rom → cubic bezier control points for a smooth curve
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(n - 1, i + 2)];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}

export default function TempCurve({ base, cooled }: { base: number[]; cooled: number[] }) {
  const { basePath, cooledPath, areaPath, ticks, peakDrop } = useMemo(() => {
    const all = [...base, ...cooled];
    const lo = Math.floor(Math.min(...all) - 1);
    const hi = Math.ceil(Math.max(...all) + 1);
    const yOf = (v: number) => PAD.t + (1 - (v - lo) / (hi - lo)) * (H - PAD.t - PAD.b);
    const cooledD = toPath(cooled, yOf);
    const area = `${cooledD} L ${W - PAD.r} ${H - PAD.b} L ${PAD.l} ${H - PAD.b} Z`;
    const tickVals = [lo + 1, Math.round((lo + hi) / 2), hi - 1];
    const peakIdx = base.indexOf(Math.max(...base));
    return {
      basePath: toPath(base, yOf),
      cooledPath: cooledD,
      areaPath: area,
      ticks: tickVals.map((v) => ({ v, y: yOf(v) })),
      peakDrop: base[peakIdx] - cooled[peakIdx],
    };
  }, [base, cooled]);

  const ease = [0.22, 1, 0.36, 1] as const;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        <defs>
          <linearGradient id="thermal" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%"   stopColor="#22c55e" />
            <stop offset="33%"  stopColor="#3b82f6" />
            <stop offset="66%"  stopColor="#facc15" />
            <stop offset="100%" stopColor="#dc2626" />
          </linearGradient>
          <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#3b82f6" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((t) => (
          <g key={t.v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={t.y} y2={t.y} stroke="rgba(255,255,255,0.07)" strokeDasharray="2 4" />
            <text x={PAD.l - 6} y={t.y + 3} textAnchor="end" fontSize="8.5" fill="rgba(255,255,255,0.45)">
              {t.v}°
            </text>
          </g>
        ))}
        {[0, 6, 12, 18, 23].map((h) => (
          <text
            key={h}
            x={PAD.l + (h / 23) * (W - PAD.l - PAD.r)}
            y={H - 6}
            textAnchor="middle"
            fontSize="8.5"
            fill="rgba(255,255,255,0.45)"
          >
            {h}h
          </text>
        ))}
        <motion.path animate={{ d: areaPath }} transition={{ duration: 0.7, ease }} fill="url(#areaFill)" initial={false} />
        <path d={basePath} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1.4" strokeDasharray="4 4" />
        <motion.path
          animate={{ d: cooledPath }}
          transition={{ duration: 0.7, ease }}
          fill="none"
          stroke="url(#thermal)"
          strokeWidth="2.4"
          strokeLinecap="round"
          initial={false}
        />
      </svg>
      <div className="flex items-center justify-between px-1 text-[10px] text-white/50">
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-4 border-t border-dashed border-white/40" /> baseline
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-4 rounded bg-gradient-to-r from-[#6b5bd2] via-[#e85d8a] to-[#f9a03f]" /> with plan
          </span>
        </span>
        {peakDrop > 0.05 && (
          <motion.span
            key={peakDrop.toFixed(1)}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease }}
            className="font-semibold text-emerald-300"
          >
            −{peakDrop.toFixed(1)}°C at peak
          </motion.span>
        )}
      </div>
    </div>
  );
}
