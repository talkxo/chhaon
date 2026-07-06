// Chhaon heat model — synthetic but physically-motivated microclimate data
// for Gurugram. Every block's land-surface temperature (LST) is derived from
// proxy signals a real pipeline would pull from satellite + GIS sources:
// built density, vegetation (NDVI), surface albedo, tree canopy, traffic.
// The generator is fully seeded so the city is identical on every load.

export type Block = {
  id: string;
  name: string;
  area: string;
  center: [number, number]; // [lng, lat]
  polygon: [number, number][];
  density: number; // built-up density 0..1
  ndvi: number; // vegetation index 0..1
  albedo: number; // surface reflectivity 0..1
  canopy: number; // tree canopy cover 0..1
  traffic: number; // anthropogenic heat proxy 0..1
  lst: number; // afternoon land-surface temp °C
  score: number; // heat-risk score 0..100
};

export type Interventions = {
  roof: number; // rooftop garden coverage 0..1
  pave: number; // reflective pavement coverage 0..1
  tree: number; // added tree canopy 0..1
};

export const NO_INTERVENTIONS: Interventions = { roof: 0, pave: 0, tree: 0 };

// Approximate locality anchors with land-use profiles. Weights blend by
// gaussian distance so profiles bleed into each other like a real city.
type Locality = {
  name: string;
  lng: number;
  lat: number;
  sigma: number;
  density: number;
  ndvi: number;
  albedo: number;
  canopy: number;
  traffic: number;
};

const LOCALITIES: Locality[] = [
  { name: "Cyber City", lng: 77.089, lat: 28.495, sigma: 0.014, density: 0.95, ndvi: 0.12, albedo: 0.18, canopy: 0.08, traffic: 0.95 },
  { name: "Udyog Vihar", lng: 77.075, lat: 28.505, sigma: 0.013, density: 0.85, ndvi: 0.1, albedo: 0.22, canopy: 0.05, traffic: 0.8 },
  { name: "MG Road", lng: 77.08, lat: 28.4795, sigma: 0.011, density: 0.85, ndvi: 0.15, albedo: 0.2, canopy: 0.12, traffic: 0.9 },
  { name: "Sector 29", lng: 77.064, lat: 28.462, sigma: 0.012, density: 0.6, ndvi: 0.35, albedo: 0.22, canopy: 0.3, traffic: 0.7 },
  { name: "Golf Course Road", lng: 77.1, lat: 28.47, sigma: 0.013, density: 0.7, ndvi: 0.3, albedo: 0.25, canopy: 0.35, traffic: 0.75 },
  { name: "Sushant Lok", lng: 77.085, lat: 28.465, sigma: 0.011, density: 0.65, ndvi: 0.28, albedo: 0.24, canopy: 0.3, traffic: 0.6 },
  { name: "Old Gurugram", lng: 77.023, lat: 28.452, sigma: 0.013, density: 0.92, ndvi: 0.08, albedo: 0.15, canopy: 0.05, traffic: 0.85 },
  { name: "Sector 14", lng: 77.043, lat: 28.468, sigma: 0.011, density: 0.7, ndvi: 0.2, albedo: 0.2, canopy: 0.2, traffic: 0.65 },
  { name: "Palam Vihar", lng: 77.035, lat: 28.51, sigma: 0.013, density: 0.6, ndvi: 0.3, albedo: 0.25, canopy: 0.3, traffic: 0.5 },
  { name: "Sohna Road", lng: 77.03, lat: 28.40, sigma: 0.014, density: 0.7, ndvi: 0.2, albedo: 0.22, canopy: 0.15, traffic: 0.8 },
  { name: "Aravalli Park", lng: 77.105, lat: 28.493, sigma: 0.01, density: 0.05, ndvi: 0.85, albedo: 0.28, canopy: 0.8, traffic: 0.1 },
  { name: "Sector 56", lng: 77.103, lat: 28.423, sigma: 0.012, density: 0.6, ndvi: 0.3, albedo: 0.24, canopy: 0.25, traffic: 0.55 },
  { name: "GC Extension", lng: 77.065, lat: 28.41, sigma: 0.013, density: 0.55, ndvi: 0.18, albedo: 0.3, canopy: 0.1, traffic: 0.6 },
  { name: "Sultanpur Fringe", lng: 76.99, lat: 28.46, sigma: 0.016, density: 0.25, ndvi: 0.5, albedo: 0.26, canopy: 0.35, traffic: 0.3 },
  { name: "Manesar Core", lng: 76.935, lat: 28.36, sigma: 0.018, density: 0.82, ndvi: 0.12, albedo: 0.19, canopy: 0.07, traffic: 0.88 },
  { name: "Dwarka Expressway", lng: 76.995, lat: 28.495, sigma: 0.016, density: 0.62, ndvi: 0.22, albedo: 0.24, canopy: 0.18, traffic: 0.68 },
  { name: "Sector 82 (Vatika)", lng: 76.97, lat: 28.39, sigma: 0.014, density: 0.68, ndvi: 0.25, albedo: 0.22, canopy: 0.22, traffic: 0.58 },
  { name: "Sector 45/46", lng: 77.068, lat: 28.442, sigma: 0.012, density: 0.72, ndvi: 0.24, albedo: 0.23, canopy: 0.25, traffic: 0.62 },
  { name: "Gwal Pahari", lng: 77.135, lat: 28.435, sigma: 0.015, density: 0.52, ndvi: 0.45, albedo: 0.25, canopy: 0.42, traffic: 0.48 },
  { name: "Sohna South", lng: 77.02, lat: 28.30, sigma: 0.02, density: 0.65, ndvi: 0.35, albedo: 0.22, canopy: 0.25, traffic: 0.58 }
];

// Semi-rural baseline the city fades into at the edges.
const RURAL = { density: 0.15, ndvi: 0.55, albedo: 0.27, canopy: 0.3, traffic: 0.15 };

// Deterministic PRNG (mulberry32)
function rng(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// LST from proxies. Calibrated to a hot Gurugram afternoon (April–June):
// dense concrete cores push past 45°C while the Aravalli edge sits near 34°C.
function computeLST(
  b: Pick<Block, "density" | "ndvi" | "albedo" | "canopy" | "traffic">, 
  baseTemp: number, 
  humidity: number,
  noise: number
) {
  const cleanTemp = typeof baseTemp === "number" && !isNaN(baseTemp) ? baseTemp : 40.5;
  const cleanHum = typeof humidity === "number" && !isNaN(humidity) ? humidity : 35;

  // Evapotranspiration cooling limits: higher relative humidity blocks plants/trees from 
  // transpiring moisture effectively, reducing their natural cooling capabilities.
  const evapFactor = Math.max(0.3, 1.0 - Math.max(0, cleanHum - 25) / 90);

  const uhi = (
    8.5 * b.density +
    3.2 * b.traffic -
    (6.2 * evapFactor) * b.ndvi -
    9.0 * (b.albedo - 0.2) -
    (3.8 * evapFactor) * b.canopy
  );
  return cleanTemp + uhi + noise;
}

export const scoreFromLST = (lst: number, baseTemp = 40.5) => {
  const cleanBase = typeof baseTemp === "number" && !isNaN(baseTemp) ? baseTemp : 40.5;
  const min = cleanBase - 7.5;
  const max = cleanBase + 6.5;
  const cleanLst = typeof lst === "number" && !isNaN(lst) ? lst : cleanBase;
  return clamp(((cleanLst - min) / (max - min)) * 100, 0, 100);
};

// ---- Hex grid generation ----

const CENTER = { lng: 77.035, lat: 28.435 };
const LNG_SPAN = 0.12; 
const LAT_SPAN = 0.15; 
const R_LAT = 0.0028; // hex radius in degrees latitude (~315 m)
const R_LNG = R_LAT / Math.cos((28.435 * Math.PI) / 180);

function hexPolygon(cx: number, cy: number): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 30);
    pts.push([cx + R_LNG * Math.cos(a), cy + R_LAT * Math.sin(a)]);
  }
  return pts;
}

let cachedBlocks: Block[] | null = null;
let cachedBaseTemp: number | null = null;
let cachedHumidity: number | null = null;

export function generateBlocks(baseTemp = 40.5, humidity = 35): Block[] {
  const cleanTemp = typeof baseTemp === "number" && !isNaN(baseTemp) ? baseTemp : 40.5;
  const cleanHum = typeof humidity === "number" && !isNaN(humidity) ? humidity : 35;

  if (cachedBlocks && cachedBaseTemp === cleanTemp && cachedHumidity === cleanHum) return cachedBlocks;
  
  const blocks: Block[] = [];
  const dx = 1.5 * R_LNG;
  const dy = Math.sqrt(3) * R_LAT;
  const cols = Math.floor((2 * LNG_SPAN) / dx);
  const rows = Math.floor((2 * LAT_SPAN) / dy);
  const rand = rng(20260706);

  let idx = 0;
  for (let c = 0; c <= cols; c++) {
    for (let r = 0; r <= rows; r++) {
      const lng = CENTER.lng - LNG_SPAN + c * dx;
      const lat = CENTER.lat - LAT_SPAN + r * dy + (c % 2 ? dy / 2 : 0);

      // Blend locality profiles by gaussian weight
      let w = 0;
      let density = 0, ndvi = 0, albedo = 0, canopy = 0, traffic = 0;
      let nearest = LOCALITIES[0];
      let nearestD = Infinity;
      for (const L of LOCALITIES) {
        const d2 = (lng - L.lng) ** 2 + (lat - L.lat) ** 2;
        const wi = Math.exp(-d2 / (2 * L.sigma * L.sigma));
        w += wi;
        density += wi * L.density;
        ndvi += wi * L.ndvi;
        albedo += wi * L.albedo;
        canopy += wi * L.canopy;
        traffic += wi * L.traffic;
        if (d2 < nearestD) { nearestD = d2; nearest = L; }
      }
      // Fade to rural baseline where locality influence is weak
      const urban = clamp(w, 0, 1);
      const mix = (v: number, ruralV: number) => urban * (v / Math.max(w, 1e-9)) + (1 - urban) * ruralV;
      const n1 = (rand() - 0.5) * 0.12;
      const n2 = (rand() - 0.5) * 0.1;
      const block = {
        density: clamp(mix(density, RURAL.density) + n1, 0.02, 1),
        ndvi: clamp(mix(ndvi, RURAL.ndvi) + n2, 0.03, 0.95),
        albedo: clamp(mix(albedo, RURAL.albedo) + (rand() - 0.5) * 0.06, 0.1, 0.4),
        canopy: clamp(mix(canopy, RURAL.canopy) + (rand() - 0.5) * 0.08, 0.02, 0.9),
        traffic: clamp(mix(traffic, RURAL.traffic) + (rand() - 0.5) * 0.1, 0.02, 1),
      };
      const lst = clamp(computeLST(block, cleanTemp, cleanHum, (rand() - 0.5) * 1.2), cleanTemp - 8, cleanTemp + 8);

      // Skip far-fringe hexes to give the city an organic footprint
      if (urban < 0.12 && rand() < 0.75) continue;

      idx++;
      blocks.push({
        id: `blk-${idx}`,
        name: `${nearest.name} · ${String.fromCharCode(65 + (c % 20))}${r}`,
        area: nearest.name,
        center: [lng, lat],
        polygon: hexPolygon(lng, lat),
        ...block,
        lst,
        score: scoreFromLST(lst, cleanTemp),
      });
    }
  }
  cachedBlocks = blocks;
  cachedBaseTemp = cleanTemp;
  cachedHumidity = cleanHum;
  return blocks;
}

// ---- Intervention physics ----
// Peak-afternoon cooling potential in °C at 100% coverage, scaled by how much
// headroom the block has (a leafy block gains little from more trees).
export function coolingBreakdown(b: Block, iv: Interventions) {
  const roof = 1.6 * iv.roof * b.density;
  const pave = 1.3 * iv.pave * (1 - b.albedo);
  const tree = 2.4 * iv.tree * (1 - b.canopy);
  return { roof, pave, tree, total: roof + pave + tree };
}

// Rough capex for the hex (~0.14 km² ≈ 140,000 m²) at Indian unit rates.
const HEX_AREA_M2 = 140000;
const RATES = { roof: 1900, pave: 650, tree: 350 }; // ₹/m² of treated surface
const TREATABLE = { roof: 0.35, pave: 0.25, tree: 0.2 }; // fraction of hex area each can touch

export function costEstimate(b: Block, iv: Interventions) {
  const cost = (k: keyof typeof RATES) => RATES[k] * TREATABLE[k] * HEX_AREA_M2 * iv[k];
  const roof = cost("roof");
  const pave = cost("pave");
  const tree = cost("tree");
  return { roof, pave, tree, total: roof + pave + tree };
}

export function formatCrore(rupees: number) {
  if (rupees <= 0) return "₹0";
  const cr = rupees / 1e7;
  return cr >= 1 ? `₹${cr.toFixed(1)} Cr` : `₹${(rupees / 1e5).toFixed(0)} L`;
}

// 24h diurnal temperature curve. Cooling interventions bite hardest at the
// mid-afternoon peak, which is exactly what the bezier chart shows.
export function diurnalCurve(b: Block, iv: Interventions): { base: number[]; cooled: number[] } {
  const dT = coolingBreakdown(b, iv).total;
  const base: number[] = [];
  const cooled: number[] = [];
  for (let h = 0; h < 24; h++) {
    const peak = Math.exp(-((h - 14.5) ** 2) / (2 * 4.3 ** 2));
    const t = b.lst - 7.5 + 8.2 * peak + 0.6 * Math.sin((h / 24) * Math.PI * 2);
    const relief = dT * (0.35 + 0.65 * peak);
    base.push(t);
    cooled.push(t - relief);
  }
  return { base, cooled };
}

// ---- Color ramp (thermal): Green → Blue → Yellow → Red ----
const STOPS: [number, [number, number, number]][] = [
  [0.0,  [34,  197,  94]],   // green  — cool / vegetated
  [0.33, [59,  130, 246]],   // blue   — moderate heat
  [0.66, [250, 204,  21]],   // yellow — warm
  [1.0,  [220,  38,  38]],   // red    — critical
];

export function heatColor(score: number): [number, number, number] {
  const t = clamp(score / 100, 0, 1);
  for (let i = 1; i < STOPS.length; i++) {
    if (t <= STOPS[i][0]) {
      const [t0, c0] = STOPS[i - 1];
      const [t1, c1] = STOPS[i];
      const f = (t - t0) / (t1 - t0);
      return [
        Math.round(c0[0] + f * (c1[0] - c0[0])),
        Math.round(c0[1] + f * (c1[1] - c0[1])),
        Math.round(c0[2] + f * (c1[2] - c0[2])),
      ];
    }
  }
  return STOPS[STOPS.length - 1][1];
}

const AC_STOPS: [number, [number, number, number]][] = [
  [0.0,  [56, 189, 248]],   // 23°C: Solid Blue
  [0.25, [186, 230, 253]],  // 24°C: Light Blue
  [0.50, [248, 250, 252]],  // 25°C: Off-White
  [0.75, [254, 240, 138]],  // 26°C: Light Yellow
  [1.0,  [250, 204, 21]],   // 27°C: Solid Yellow
];

export function acColor(score: number): [number, number, number] {
  const t = clamp(score / 100, 0, 1);
  for (let i = 1; i < AC_STOPS.length; i++) {
    if (t <= AC_STOPS[i][0]) {
      const [t0, c0] = AC_STOPS[i - 1];
      const [t1, c1] = AC_STOPS[i];
      const f = (t - t0) / (t1 - t0);
      return [
        Math.round(c0[0] + f * (c1[0] - c0[0])),
        Math.round(c0[1] + f * (c1[1] - c0[1])),
        Math.round(c0[2] + f * (c1[2] - c0[2])),
      ];
    }
  }
  return AC_STOPS[AC_STOPS.length - 1][1];
}

export function cityStats(blocks: Block[]) {
  const avg = blocks.reduce((s, b) => s + b.lst, 0) / blocks.length;
  const hottest = blocks.reduce((a, b) => (b.lst > a.lst ? b : a));
  const critical = blocks.filter((b) => b.lst >= 43).length;
  return { avg, hottest, critical };
}

export function priorityBlocks(blocks: Block[], n = 8) {
  return [...blocks].sort((a, b) => b.lst - a.lst).slice(0, n);
}

// ---- Recommended AC settings (BEE India-aligned energy saving logic) ----
export type FloorLevel = '1-2' | '3-4' | '5+';

export function getFloorOffset(floor: FloorLevel): number {
  if (floor === '1-2') return -1.2;
  if (floor === '5+') return 1.8;
  return 0.0;
}

export function getAC(b: Block, floor: FloorLevel = '3-4'): number {
  const score = b.score;
  
  let target = 23; 
  if (score > 20) target = 24;
  if (score > 40) target = 25;
  if (score > 60) target = 26;
  if (score > 80) target = 27;

  if (floor === '1-2') target -= 1;
  if (floor === '5+') target += 1;

  return Math.max(23, Math.min(27, target));
}

export function getACScore(b: Block, floor: FloorLevel = '3-4'): number {
  const ac = getAC(b, floor);
  // Map scores: 27°C (high load/hot block) -> 100, 26°C -> 75, 25°C -> 50, 24°C -> 25, 23°C -> 0
  if (ac >= 27) return 100;
  if (ac === 26) return 75;
  if (ac === 25) return 50;
  if (ac === 24) return 25;
  return 0;
}
