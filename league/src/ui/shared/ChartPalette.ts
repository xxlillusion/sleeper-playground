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
/** Diverging ramp: bad for negative, good for positive, x in [-1, 1] */
export function diverging(t: ChartTheme, x: number): string {
  const k = Math.max(-1, Math.min(1, x));
  return `color-mix(in srgb, ${k >= 0 ? t.good : t.bad} ${Math.round(Math.abs(k) * 80)}%, ${t.surface})`;
}
