/* The answer chart: one Observable Plot figure chosen from the shape of the result. Every mark carries the row/column
   keys of the cell behind it, so a click drills into the same rows as the table cell. */
import * as Plot from "@observablehq/plot";
import { useEffect, useRef, useState } from "react";
import { columnLabel } from "../../view/catalog";
import { SEP, type PivotResult } from "../../view/engine";
import type { ChartType, Measure, Scalar } from "../../view/spec";
import type { ChartTheme } from "../shared/ChartPalette";
import { fmtMeasure, isTimeDim, keyLabel } from "./model";

export interface Datum { x: Scalar; series: string; value: number | null; rowKey: string; colKey: string; label: string; [k: string]: Scalar }

export interface ChartProps {
  result: PivotResult;
  chart: ChartType;
  theme: ChartTheme;
  onDrill: (rowKey: string, colKey: string | undefined, title: string) => void;
}

export function Chart({ result, chart, theme, onDrill }: ChartProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(entries => { const w = Math.floor(entries[0].contentRect.width); if (w && w !== width) setWidth(w); });
    ro.observe(el);
    setWidth(Math.floor(el.getBoundingClientRect().width));
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const el = ref.current; if (!el || !width) return;
    el.replaceChildren();
    let plot: ReturnType<typeof Plot.plot> | null = null;
    try { plot = build(result, chart, theme, width); } catch (e) { console.error("chart", e); }
    if (!plot) { const p = document.createElement("p"); p.className = "hint"; p.textContent = "Nothing to draw for this shape. Try another chart type."; el.append(p); return; }
    const click = () => { const v = plot!.value as Datum | undefined; if (v && typeof v.rowKey === "string") onDrill(v.rowKey, v.colKey || undefined, v.title ? String(v.title).split("\n")[0] : v.label); };
    plot.addEventListener("click", click);
    el.append(plot);
    return () => { plot?.removeEventListener("click", click); plot?.remove(); };
  }, [result, chart, theme, width, onDrill]);

  return <div className="ask-chart" ref={ref} />;
}

/* ---------- data shaping ---------- */
const dimLabel = (dataset: string, dims: string[]) => dims.map(c => columnLabel(dataset, c)).join(" · ");

/** Long-format cells for the first measure: one datum per row key × column key */
function longData(r: PivotResult, m: Measure, xFrom: "rows" | "columns"): Datum[] {
  const d = r.spec.dataset;
  const out: Datum[] = [];
  const hasCols = r.spec.columns.length > 0;
  for (const rk of r.rowKeys) {
    for (const ck of hasCols ? r.colKeys : [{ key: "", values: [] as Scalar[] }]) {
      const cell = hasCols ? r.cells.get(`${rk.key}${SEP}${SEP}${ck.key}`) : r.rowTotals.get(rk.key);
      const value = cell?.values[m.id] ?? null;
      if (value == null) continue;
      const rl = keyLabel(rk.values, r.spec.rows), cl = keyLabel(ck.values, r.spec.columns);
      const x = xFrom === "rows" ? (rk.values.length === 1 ? rk.values[0] : rl) : (ck.values.length === 1 ? ck.values[0] : cl);
      const series = xFrom === "rows" ? cl : rl;
      const xName = xFrom === "rows" ? dimLabel(d, r.spec.rows) : dimLabel(d, r.spec.columns);
      const title = `${series ? series + "\n" : ""}${xName}: ${x}\n${fmtMeasure(m, value)} ${mLabel(r, m)}`;
      out.push({ x, series, value, rowKey: rk.key, colKey: ck.key, label: rl, title });
    }
  }
  return out;
}
const mLabel = (r: PivotResult, m: Measure) => m.label ?? (m.col ? columnLabel(r.spec.dataset, m.col) : "rows");
const uniq = (xs: Scalar[]) => [...new Set(xs)];
const isNum = (xs: Scalar[]) => xs.length > 0 && xs.every(x => typeof x === "number");

function build(r: PivotResult, chart: ChartType, t: ChartTheme, width: number): ReturnType<typeof Plot.plot> | null {
  // Only the measures the sentence names; formulas also add hidden helper measures to r.measures
  const ms = r.spec.measures.map(s => r.measures.find(x => x.id === s.id)).filter((x): x is Measure => !!x);
  const m = ms[0] ?? r.measures[0];
  if (!m || !r.rowKeys.length) return null;
  const spec = r.spec, dataset = spec.dataset;
  const hasCols = spec.columns.length > 0;
  const base: Plot.PlotOptions = {
    width, style: { background: "transparent", color: t.ink, fontFamily: t.fontBody, fontSize: "12px", overflow: "visible" },
    color: { range: t.categorical }, marginTop: 16,
  };
  const fmt = (v: unknown) => fmtMeasure(m, v);
  const rowLabel = dimLabel(dataset, spec.rows);

  if (chart === "bar") {
    const data = longData(r, m, "rows");
    const order = uniq(data.map(d => d.x));
    const n = order.length;
    const longest = Math.max(...order.map(o => String(o).length), 4);
    const marginLeft = Math.min(220, longest * 7 + 12);
    const height = Math.min(900, Math.max(160, n * (hasCols ? 28 : 24) + 50));
    const stacked = hasCols;
    const allInt = data.every(d => Number.isInteger(d.value));
    const maxV = Math.max(...data.map(d => Math.abs(d.value ?? 0)));
    return Plot.plot({
      ...base, height, marginLeft, marginRight: 60,
      x: { label: mLabel(r, m), grid: true, nice: true, tickFormat: v => fmt(v), labelArrow: "none", interval: allInt && maxV <= 12 ? 1 : undefined },
      y: { domain: order, label: null, tickFormat: v => String(v), tickSize: 0 },
      color: stacked ? { range: t.categorical, legend: n <= 60, label: dimLabel(dataset, spec.columns), type: "ordinal" } : undefined,
      marks: [
        stacked
          ? Plot.barX(data, Plot.stackX({ x: "value", y: "x", fill: "series", order: null, rx: 2, insetTop: 1, insetBottom: 1, title: "title" }))
          : Plot.barX(data, { x: "value", y: "x", fill: (d: Datum) => (d.value != null && d.value < 0 ? t.bad : t.accent), rx: 3, insetTop: 2, insetBottom: 2, title: "title" }),
        !stacked ? Plot.text(data, { x: "value", y: "x", text: (d: Datum) => fmt(d.value), dx: 6, textAnchor: "start", fill: t.muted, fontSize: 11 }) : null,
        Plot.ruleX([0], { stroke: t.line }),
        stacked ? Plot.tip(data, Plot.pointer(Plot.stackX({ x: "value", y: "x", fill: "series", title: "title" }))) : Plot.tip(data, Plot.pointerY({ x: "value", y: "x", title: "title" })),
      ],
    });
  }

  if (chart === "line" || chart === "area" || chart === "bump") {
    // The time-like dimension is x; the other becomes the series. Without a split, each measure is a series.
    let data: Datum[]; let xName: string; let seriesName: string | null;
    if (hasCols || spec.rows.length === 2) {
      if (spec.rows.length === 2 && !hasCols) {
        // two row dims: first is series, second is x (or the reverse when the first is time-like)
        const rowsAreXFirst = isTimeDim(spec.rows[0]) && !isTimeDim(spec.rows[1]);
        const xi = rowsAreXFirst ? 0 : 1, si = 1 - xi;
        data = r.rowKeys.map(rk => { const v = r.rowTotals.get(rk.key)?.values[m.id] ?? null; const x = rk.values[xi], s = String(rk.values[si] ?? ""); return { x, series: s, value: v, rowKey: rk.key, colKey: "", label: keyLabel(rk.values, spec.rows), title: `${s}\n${columnLabel(dataset, spec.rows[xi])}: ${x}\n${fmt(v)} ${mLabel(r, m)}` }; }).filter(d => d.value != null);
        xName = columnLabel(dataset, spec.rows[xi]); seriesName = columnLabel(dataset, spec.rows[si]);
      } else {
        const xFrom: "rows" | "columns" = isTimeDim(spec.columns[0]) || !isTimeDim(spec.rows[0]) ? "columns" : "rows";
        data = longData(r, m, xFrom);
        xName = xFrom === "rows" ? rowLabel : dimLabel(dataset, spec.columns);
        seriesName = xFrom === "rows" ? dimLabel(dataset, spec.columns) : rowLabel;
      }
    } else {
      data = [];
      for (const mm of ms) for (const rk of r.rowKeys) {
        const v = r.rowTotals.get(rk.key)?.values[mm.id] ?? null; if (v == null) continue;
        const x = rk.values[0];
        data.push({ x, series: mLabel(r, mm), value: v, rowKey: rk.key, colKey: "", label: keyLabel(rk.values, spec.rows), title: `${mLabel(r, mm)}\n${rowLabel}: ${x}\n${fmtMeasure(mm, v)}` });
      }
      xName = rowLabel; seriesName = ms.length > 1 ? "Measure" : null;
    }
    if (!data.length) return null;
    const xs = uniq(data.map(d => d.x)).sort((a, b) => (typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b), undefined, { numeric: true })));
    const numericX = isNum(xs);
    const series = uniq(data.map(d => d.series)).map(String);
    const last = new Map<string, Datum>(); for (const d of data) { const p = last.get(d.series); if (!p || cmpX(d.x, p.x) > 0) last.set(d.series, d); }
    const bump = chart === "bump";
    const labelW = Math.min(140, Math.max(...series.map(s => s.length), 3) * 6.5 + 10);
    const height = Math.max(240, Math.min(460, 180 + series.length * 8));
    return Plot.plot({
      ...base, height, marginRight: series.length > 1 || bump ? labelW + 12 : 30, marginLeft: 48,
      x: { label: xName, type: numericX ? "linear" : "point", ticks: numericX && xs.length <= 24 ? (xs as number[]) : undefined, tickFormat: numericX ? (v: number) => String(v) : undefined, domain: numericX ? undefined : xs, labelArrow: "none", grid: false },
      y: bump ? { label: mLabel(r, m), reverse: true, grid: true, ticks: Math.min(12, Math.max(...data.map(d => d.value ?? 0))), tickFormat: (v: number) => String(v), labelArrow: "none" } : { label: mLabel(r, m), grid: true, nice: true, tickFormat: (v: number) => fmt(v), labelArrow: "none", zero: chart === "area" },
      color: { range: t.categorical, domain: series, legend: false, label: seriesName ?? undefined },
      marks: [
        chart === "area" ? Plot.areaY(data, { x: "x", y: "value", fill: "series", fillOpacity: series.length > 1 ? 0.25 : 0.35, curve: "monotone-x" }) : null,
        Plot.line(data, { x: "x", y: "value", stroke: "series", strokeWidth: bump ? 2.5 : 2, curve: bump ? "bump-x" : "monotone-x" }),
        Plot.dot(data, { x: "x", y: "value", fill: "series", r: bump ? 4 : 3, stroke: t.surface, strokeWidth: 1 }),
        (series.length > 1 || bump) ? Plot.text([...last.values()], { x: "x", y: "value", text: "series", dx: 8, textAnchor: "start", fill: "series", fontSize: 11, fontWeight: 600 }) : null,
        Plot.tip(data, Plot.pointer({ x: "x", y: "value", title: "title" })),
      ],
    });
  }

  if (chart === "heatmap") {
    let data: Datum[]; let xName: string; let yName: string;
    if (hasCols) { data = longData(r, m, "columns"); xName = dimLabel(dataset, spec.columns); yName = rowLabel; }
    else if (spec.rows.length >= 2) {
      data = r.rowKeys.map(rk => { const v = r.rowTotals.get(rk.key)?.values[m.id] ?? null; return { x: rk.values[1], series: String(rk.values[0] ?? ""), value: v, rowKey: rk.key, colKey: "", label: keyLabel(rk.values, spec.rows), title: `${keyLabel(rk.values, spec.rows)}\n${fmt(v)} ${mLabel(r, m)}` }; }).filter(d => d.value != null);
      xName = columnLabel(dataset, spec.rows[1]); yName = columnLabel(dataset, spec.rows[0]);
    } else return null;
    if (!data.length) return null;
    const xs = uniq(data.map(d => d.x)), ys = uniq(data.map(d => d.series));
    // rows keep the sorted order; columns keep the natural order
    const yOrder: string[] = hasCols ? r.rowKeys.map(k => keyLabel(k.values, spec.rows)) : uniq(r.rowKeys.map(k => String(k.values[0] ?? ""))).map(String);
    const yDomain = yOrder.filter(y => ys.includes(y));
    const vals = data.map(d => d.value as number);
    const lo = Math.min(...vals), hi = Math.max(...vals);
    const diverging = lo < 0 && hi > 0;
    const amp = Math.max(Math.abs(lo), Math.abs(hi));
    const cellW = Math.max(28, (width - 150) / Math.max(1, xs.length));
    const height = Math.max(160, Math.min(900, yDomain.length * Math.min(34, Math.max(22, cellW * 0.8)) + 60));
    const norm = (v: number) => (diverging ? Math.abs(v) / amp : hi === lo ? 1 : (v - lo) / (hi - lo));
    return Plot.plot({
      ...base, height, marginLeft: Math.min(200, Math.max(...yDomain.map(y => y.length), 4) * 7 + 12), marginBottom: 36,
      x: { domain: xs, label: xName, tickFormat: (v: Scalar) => String(v), tickSize: 0, labelArrow: "none" },
      y: { domain: yDomain, label: yName, tickSize: 0, labelArrow: "none" },
      color: diverging ? { type: "linear", domain: [-amp, 0, amp], range: [t.bad, t.surface, t.good], legend: false } : { type: "linear", domain: [lo, hi], range: [t.surface, t.accent], legend: false },
      marks: [
        Plot.cell(data, { x: "x", y: "series", fill: "value", rx: 3, inset: 1, title: "title" }),
        xs.length <= 30 ? Plot.text(data, { x: "x", y: "series", text: (d: Datum) => fmt(d.value), fill: (d: Datum) => (norm(d.value as number) > 0.55 ? (t.dark ? t.bg : "#fff") : t.ink), fontSize: xs.length > 16 ? 10 : 11 }) : null,
        Plot.tip(data, Plot.pointer({ x: "x", y: "series", title: "title" })),
      ],
    });
  }

  if (chart === "scatter") {
    const m2 = ms[1]; if (!m2) return null;
    const data: Datum[] = r.rowKeys.map(rk => { const c = r.rowTotals.get(rk.key); const a = c?.values[m.id] ?? null, b = c?.values[m2.id] ?? null; const label = keyLabel(rk.values, spec.rows); return { x: a, y: b, series: label, value: a, rowKey: rk.key, colKey: "", label, title: `${label}\n${mLabel(r, m)}: ${fmt(a)}\n${mLabel(r, m2)}: ${fmtMeasure(m2, b)}` }; }).filter(d => d.x != null && d.y != null);
    if (!data.length) return null;
    return Plot.plot({
      ...base, height: Math.max(280, Math.min(460, width * 0.55)), marginLeft: 56, marginRight: 30,
      x: { label: mLabel(r, m), grid: true, nice: true, tickFormat: (v: number) => fmt(v), labelArrow: "none" },
      y: { label: mLabel(r, m2), grid: true, nice: true, tickFormat: (v: number) => fmtMeasure(m2, v), labelArrow: "none" },
      marks: [
        Plot.dot(data, { x: "x", y: "y", r: 6, fill: t.accent, fillOpacity: 0.85, stroke: t.surface }),
        data.length <= 40 ? Plot.text(data, { x: "x", y: "y", text: "label", dy: -11, fontSize: 11, fill: t.ink }) : null,
        Plot.tip(data, Plot.pointer({ x: "x", y: "y", title: "title" })),
      ],
    });
  }
  return null;
}
const cmpX = (a: Scalar, b: Scalar) => (typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b), undefined, { numeric: true }));
