/* One palette for every chart library, read from the CSS tokens so light and dark stay consistent. */
import { useEffect, useMemo, useState } from "react";
import type { ThemeName } from "../../components/PerspectiveView";

export interface ChartTheme {
  dark: boolean;
  bg: string; surface: string; ink: string; muted: string; line: string; accent: string; good: string; bad: string;
  categorical: string[];
  fontBody: string; fontMono: string;
}

const read = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export function readChartTheme(theme: ThemeName): ChartTheme {
  const categorical = Array.from({ length: 10 }, (_, i) => read(`--chart-${i + 1}`)).filter(Boolean);
  return {
    dark: theme === "Pro Dark",
    bg: read("--bg"), surface: read("--surface"), ink: read("--ink"), muted: read("--muted"), line: read("--line"), accent: read("--turf"), good: read("--good"), bad: read("--bad"),
    categorical: categorical.length ? categorical : ["#1f6b45", "#2a6fb5", "#c47a12", "#c0392b", "#7a5bb5", "#1f8a5b", "#b7791f", "#5d6b74", "#d29be6", "#6fa8e6"],
    fontBody: read("--font-body") || "system-ui, sans-serif", fontMono: read("--font-mono") || "monospace",
  };
}

export function useChartTheme(theme: ThemeName): ChartTheme {
  const [tick, setTick] = useState(0);
  useEffect(() => { const id = requestAnimationFrame(() => setTick(t => t + 1)); return () => cancelAnimationFrame(id); }, [theme]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => readChartTheme(theme), [theme, tick]);
}

/** Colour for the i-th series */
export const seriesColor = (t: ChartTheme, i: number) => t.categorical[i % t.categorical.length];

/** Sequential ramp from surface to accent for t in [0,1]; use for heatmaps and colour-scaled cells */
export function sequential(t: ChartTheme, x: number): string {
  const k = Math.max(0, Math.min(1, x));
  return `color-mix(in srgb, ${t.accent} ${Math.round(k * 85)}%, ${t.surface})`;
}
/* Hex ramps for canvas renderers (ECharts, Plot's SVG is fine with color-mix but canvas is not) */
function hexToRgb(h: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(h.trim()); if (!m) return null;
  const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mix(a: string, b: string, k: number): string {
  const x = hexToRgb(a), y = hexToRgb(b); if (!x || !y) return k >= 0.5 ? b : a;
  const c = x.map((v, i) => Math.round(v + (y[i] - v) * k));
  return `#${c.map(v => v.toString(16).padStart(2, "0")).join("")}`;
}
/** Hex sequential ramp from surface to accent, x in [0,1] */
export const sequentialHex = (t: ChartTheme, x: number) => mix(t.surface, t.accent, Math.max(0, Math.min(1, x)) * 0.85 + 0.05);
/** Hex diverging ramp, x in [-1,1]: bad -> surface -> good */
export const divergingHex = (t: ChartTheme, x: number) => { const k = Math.max(-1, Math.min(1, x)); return mix(t.surface, k >= 0 ? t.good : t.bad, Math.abs(k) * 0.8); };
/** n evenly spaced hex stops of the sequential ramp, handy for ECharts visualMap.inRange.color */
export const sequentialStops = (t: ChartTheme, n = 6) => Array.from({ length: n }, (_, i) => sequentialHex(t, i / (n - 1)));

/** Diverging ramp: bad for negative, good for positive, x in [-1, 1] */
export function diverging(t: ChartTheme, x: number): string {
  const k = Math.max(-1, Math.min(1, x));
  return `color-mix(in srgb, ${k >= 0 ? t.good : t.bad} ${Math.round(Math.abs(k) * 80)}%, ${t.surface})`;
}
