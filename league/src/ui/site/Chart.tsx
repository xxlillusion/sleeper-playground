/* One ECharts wrapper for the whole prototype: tree-shaken, themed from CSS tokens, resized by ResizeObserver, re-created on theme change. */
import { BarChart, HeatmapChart, LineChart, ScatterChart } from "echarts/charts";
import { DataZoomComponent, GridComponent, LegendComponent, TitleComponent, TooltipComponent, VisualMapComponent } from "echarts/components";
import * as echarts from "echarts/core";
import type { ECharts, EChartsCoreOption } from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import { useEffect, useRef } from "react";
import { columnLabel } from "../../view/catalog";
import { SEP, type PivotResult } from "../../view/engine";
import type { ChartType } from "../../view/spec";
import type { ChartTheme } from "../shared/ChartPalette";
import { measureLabel } from "./lib";

echarts.use([BarChart, LineChart, ScatterChart, HeatmapChart, GridComponent, TooltipComponent, LegendComponent, VisualMapComponent, TitleComponent, DataZoomComponent, CanvasRenderer]);

export interface ChartClick { seriesName?: string; name?: string; value?: unknown; dataIndex: number; seriesIndex: number }
interface ChartProps { option: EChartsCoreOption; theme: ChartTheme; height?: number | string; onClick?: (e: ChartClick) => void; className?: string }

export function Chart({ option, theme, height = 280, onClick, className }: ChartProps) {
  const ref = useRef<HTMLDivElement>(null);
  const chart = useRef<ECharts | null>(null);
  const click = useRef(onClick); click.current = onClick;
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const c = echarts.init(el, undefined, { renderer: "canvas" });
    chart.current = c;
    c.on("click", (p: unknown) => { const e = p as ChartClick; click.current?.({ seriesName: e.seriesName, name: e.name, value: e.value, dataIndex: e.dataIndex, seriesIndex: e.seriesIndex }); });
    const ro = new ResizeObserver(() => c.resize());
    ro.observe(el);
    return () => { ro.disconnect(); c.dispose(); chart.current = null; };
  }, [theme.dark]);
  useEffect(() => { chart.current?.setOption(withBase(option, theme), { notMerge: true }); }, [option, theme]);
  return <div ref={ref} className={`chart ${className ?? ""}`} style={{ height, width: "100%", minWidth: 0 }} />;
}

function withBase(o: EChartsCoreOption, t: ChartTheme): EChartsCoreOption {
  return { backgroundColor: "transparent", color: t.categorical, textStyle: { fontFamily: t.fontBody, color: t.ink }, animationDuration: 500, animationDurationUpdate: 400, ...o };
}

export const axisStyle = (t: ChartTheme, opts: Record<string, unknown> = {}) => ({
  axisLine: { show: false }, axisTick: { show: false },
  axisLabel: { color: t.muted, fontFamily: t.fontBody, fontSize: 11, hideOverlap: true },
  splitLine: { lineStyle: { color: t.line } },
  ...opts,
});
export const tooltipStyle = (t: ChartTheme, trigger: "axis" | "item" = "axis") => ({
  trigger, backgroundColor: t.surface, borderColor: t.line, textStyle: { color: t.ink, fontFamily: t.fontBody, fontSize: 12 },
  axisPointer: { type: "shadow", shadowStyle: { color: `${t.ink}10` } }, confine: true,
});
export const gridStyle = (legend: boolean, extra: Record<string, unknown> = {}) => ({ left: 8, right: 16, top: legend ? 36 : 14, bottom: 8, outerBoundsMode: "same", ...extra });

const label = (values: unknown[]) => values.map(v => (v == null ? "—" : String(v))).join(" · ");

/** A chart option for any pivot result: bars, lines, areas, scatter, heatmap and bump (rank) charts. */
export function pivotOption(r: PivotResult, chart: ChartType, t: ChartTheme): EChartsCoreOption {
  const ds = r.spec.dataset;
  const xs = r.rowKeys.length ? r.rowKeys.map(k => label(k.values)) : ["All"];
  const split = r.colKeys.length > 1 || (r.colKeys[0] && r.colKeys[0].key !== "");
  const measures = r.measures;
  const mlabel = (id: string) => { const mm = measures.find(x => x.id === id); return mm ? measureLabel(ds, mm) : id; };
  const value = (rk: string | null, ck: string | null, id: string) => {
    if (rk == null) return r.grand.values[id] ?? null;
    if (ck == null) return r.rowTotals.get(rk)?.values[id] ?? null;
    return r.cells.get(`${rk}${SEP}${SEP}${ck}`)?.values[id] ?? null;
  };
  const rowOf = (i: number) => (r.rowKeys[i]?.key ?? null);

  if (chart === "heatmap") {
    const mid = measures[0]?.id; if (!mid) return {};
    const cols = split ? r.colKeys : [{ key: "", values: [mlabel(mid)] }];
    const data: [number, number, number | null][] = [];
    let min = Infinity, max = -Infinity;
    r.rowKeys.forEach((rk, yi) => cols.forEach((ck, xi) => { const v = split ? value(rk.key, ck.key, mid) : value(rk.key, null, mid); data.push([xi, yi, v]); if (v != null) { min = Math.min(min, v); max = Math.max(max, v); } }));
    if (!isFinite(min)) { min = 0; max = 1; }
    const diverging = min < 0 && max > 0;
    return {
      tooltip: { ...tooltipStyle(t, "item"), formatter: (p: { value: [number, number, number | null] }) => `${xs[p.value[1]]} × ${label(cols[p.value[0]].values)}<br/><b>${p.value[2] ?? "—"}</b>` },
      grid: gridStyle(false, { bottom: 48 }),
      xAxis: { type: "category", data: cols.map(c => label(c.values)), position: "top", ...axisStyle(t, { splitArea: { show: false } }) },
      yAxis: { type: "category", data: xs, inverse: true, ...axisStyle(t) },
      visualMap: { min: diverging ? -Math.max(-min, max) : min, max: diverging ? Math.max(-min, max) : max, calculable: false, orient: "horizontal", left: "center", bottom: 0, itemHeight: 120, textStyle: { color: t.muted, fontSize: 11 }, inRange: { color: diverging ? [t.bad, t.surface, t.good] : [t.surface, t.accent] } },
      series: [{ type: "heatmap", data, label: { show: xs.length * cols.length <= 400, color: t.ink, fontSize: 11 }, itemStyle: { borderColor: t.bg, borderWidth: 1 }, emphasis: { itemStyle: { shadowBlur: 6, shadowColor: `${t.ink}40` } } }],
    };
  }
  if (chart === "scatter") {
    const [mx, my] = measures; if (!mx) return {};
    const yId = my?.id ?? mx.id;
    const data = r.rowKeys.map(rk => ({ name: label(rk.values), value: [value(rk.key, null, mx.id), value(rk.key, null, yId)] }));
    return {
      tooltip: { ...tooltipStyle(t, "item"), formatter: (p: { name: string; value: [number, number] }) => `<b>${p.name}</b><br/>${mlabel(mx.id)}: ${p.value[0] ?? "—"}<br/>${mlabel(yId)}: ${p.value[1] ?? "—"}` },
      grid: gridStyle(false, { right: 24 }),
      xAxis: { type: "value", name: mlabel(mx.id), nameLocation: "middle", nameGap: 26, nameTextStyle: { color: t.muted, fontSize: 11 }, scale: true, ...axisStyle(t) },
      yAxis: { type: "value", name: mlabel(yId), nameTextStyle: { color: t.muted, fontSize: 11, align: "left" }, scale: true, ...axisStyle(t) },
      series: [{ type: "scatter", data, symbolSize: 12, itemStyle: { color: t.accent, opacity: .85 }, label: { show: data.length <= 40, position: "right", formatter: "{b}", color: t.muted, fontSize: 11 }, emphasis: { focus: "self", scale: 1.4 } }],
    };
  }
  // bar / line / area / bump: one series per (column key × measure), or per measure when there is no split
  const seriesDefs = split
    ? r.colKeys.flatMap(ck => measures.map(mm => ({ name: measures.length > 1 ? `${label(ck.values)} · ${mlabel(mm.id)}` : label(ck.values), data: r.rowKeys.map((_, i) => value(rowOf(i), ck.key, mm.id)) })))
    : measures.map(mm => ({ name: mlabel(mm.id), data: r.rowKeys.length ? r.rowKeys.map((_, i) => value(rowOf(i), null, mm.id)) : [value(null, null, mm.id)] }));
  const bump = chart === "bump", line = chart === "line" || chart === "area" || bump;
  const legend = seriesDefs.length > 1;
  const series = seriesDefs.map((s, i) => ({
    name: s.name, type: line ? "line" : "bar", data: s.data, smooth: bump ? .3 : line ? .2 : undefined,
    showSymbol: true, symbolSize: bump ? 9 : 6, lineStyle: { width: bump ? 3 : 2 }, connectNulls: false,
    areaStyle: chart === "area" ? { opacity: .18 } : undefined,
    barMaxWidth: 36, itemStyle: { borderRadius: line ? 0 : [4, 4, 0, 0], color: !legend && !line ? t.accent : undefined },
    emphasis: { focus: legend ? "series" : "none" },
    endLabel: bump ? { show: true, formatter: "{a}", color: t.muted, fontSize: 11, distance: 6 } : undefined,
    z: 2 + (i % 3),
  }));
  const rowLabel = r.spec.rows.map(c => columnLabel(ds, c)).join(" · ");
  return {
    tooltip: tooltipStyle(t, "axis"),
    legend: legend ? { type: "scroll", top: 0, left: 0, icon: "circle", itemWidth: 10, itemHeight: 10, textStyle: { color: t.muted, fontSize: 11 }, pageTextStyle: { color: t.muted }, pageIconColor: t.accent, pageIconInactiveColor: t.line } : undefined,
    grid: gridStyle(legend, { right: bump ? 90 : 16 }),
    xAxis: { type: "category", data: xs, name: rowLabel, nameLocation: "middle", nameGap: 28, nameTextStyle: { color: t.muted, fontSize: 11 }, boundaryGap: !line, ...axisStyle(t, { splitLine: { show: false } }) },
    yAxis: { type: "value", inverse: bump, minInterval: bump ? 1 : undefined, min: bump ? 1 : undefined, scale: line && !bump, ...axisStyle(t) },
    dataZoom: xs.length > 40 ? [{ type: "inside" }] : undefined,
    series,
  };
}
