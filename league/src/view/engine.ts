/* Plain-TypeScript pivot engine. ~25k rows aggregate in a few milliseconds, so there is no need for WebAssembly here.
   Results keep the indices of the raw rows behind every cell, which is what drill-through uses. */
import { Parser } from "expr-eval";
import type { Row } from "../perspective/engine";
import { isRaw, measureId, type Agg, type Filter, type Measure, type Scalar, type ViewSpec } from "./spec";

export const SEP = "\u0001";
export const keyOf = (values: Scalar[]) => values.map(v => (v === null || v === undefined ? "\u0000" : String(v))).join(SEP);

export interface Key { key: string; values: Scalar[] }
export interface Cell { count: number; values: Record<string, number | null>; indices: number[] }
export interface PivotResult {
  spec: ViewSpec;
  measures: Measure[];
  rowKeys: Key[];
  colKeys: Key[];                      // one entry with key "" when the spec has no columns
  cells: Map<string, Cell>;            // `${rowKey}${SEP}${SEP}${colKey}`
  rowTotals: Map<string, Cell>;        // per row across all columns
  colTotals: Map<string, Cell>;
  grand: Cell;
  /** One object per row key: dimension columns, then each measure id (and `${id}${SEP}${colKey}` per split column) */
  flat: Row[];
  filteredCount: number;
  filteredIndices: number[];
  drill(rowKey?: string, colKey?: string): Row[];
}

const num = (v: unknown): number | null => (typeof v === "number" && !isNaN(v) ? v : typeof v === "boolean" ? (v ? 1 : 0) : null);

export function aggregate(agg: Agg, rows: Row[], col: string, indices: number[]): number | null {
  if (agg === "count") return indices.length;
  if (agg === "any") { for (const i of indices) { const v = rows[i][col]; if (v != null) return typeof v === "number" ? v : num(v); } return null; }
  if (agg === "distinct") { const s = new Set<Scalar>(); for (const i of indices) s.add(rows[i][col]); return s.size; }
  const xs: number[] = [];
  for (const i of indices) { const v = num(rows[i][col]); if (v != null) xs.push(v); }
  if (!xs.length) return null;
  switch (agg) {
    case "sum": return r2(xs.reduce((a, b) => a + b, 0));
    case "avg": return r2(xs.reduce((a, b) => a + b, 0) / xs.length);
    case "min": return Math.min(...xs);
    case "max": return Math.max(...xs);
    case "median": { xs.sort((a, b) => a - b); const m = xs.length >> 1; return xs.length % 2 ? xs[m] : r2((xs[m - 1] + xs[m]) / 2); }
  }
}
const r2 = (n: number) => Math.round(n * 100) / 100;

/* ---------- filters ---------- */
export function matches(row: Row, f: Filter): boolean {
  const v = row[f.col];
  const fv = f.value;
  switch (f.op) {
    case "is null": return v == null;
    case "is not null": return v != null;
    case "==": return v == fv || String(v) === String(fv);
    case "!=": return !(v == fv || String(v) === String(fv));
    case ">": return v != null && fv != null && (v as number) > (fv as number);
    case ">=": return v != null && fv != null && (v as number) >= (fv as number);
    case "<": return v != null && fv != null && (v as number) < (fv as number);
    case "<=": return v != null && fv != null && (v as number) <= (fv as number);
    case "in": return Array.isArray(fv) && fv.some(x => x == v || String(x) === String(v));
    case "not in": return !(Array.isArray(fv) && fv.some(x => x == v || String(x) === String(v)));
    case "contains": return v != null && String(v).toLowerCase().includes(String(fv ?? "").toLowerCase());
  }
}
export const filterIndices = (rows: Row[], filters: Filter[]): number[] => {
  const out: number[] = [];
  for (let i = 0; i < rows.length; i++) if (filters.every(f => matches(rows[i], f))) out.push(i);
  return out;
};

/* ---------- formulas ---------- */
const parser = new Parser({ operators: { logical: false, comparison: true, conditional: true } });
const FN = /\b(sum|avg|count|min|max|median|distinct|any)\(\s*([A-Za-z_][\w]*)\s*\)/g;

/** Expand `sum(points) / count(game_id)` into hidden measures and an expression over measure ids. */
export function expandFormula(formula: string, into: Measure[]): string {
  return formula.replace(FN, (_m, agg: Agg, col: string) => {
    const id = measureId(agg, col);
    if (!into.some(x => x.id === id)) into.push({ id, col, agg, label: `${agg}(${col})` });
    return id;
  });
}
export function validateFormula(formula: string): string | null {
  try { parser.parse(expandFormula(formula, [])); return null; } catch (e) { return e instanceof Error ? e.message : String(e); }
}

/* ---------- pivot ---------- */
export function pivot(rows: Row[], spec: ViewSpec): PivotResult {
  const filtered = filterIndices(rows, spec.filters || []);
  // Resolve measures: formula measures may introduce hidden column measures
  const base: Measure[] = [];
  const formulas: { m: Measure; expr: ReturnType<Parser["parse"]> }[] = [];
  for (const m of spec.measures) {
    if (m.formula) { const expr = parser.parse(expandFormula(m.formula, base)); formulas.push({ m, expr }); }
    else if (m.col) base.push(m);
    else base.push({ ...m, agg: "count", col: m.col });
  }
  const allMeasures: Measure[] = [...base, ...formulas.map(f => f.m)];
  const evalCell = (indices: number[]): Cell => {
    const values: Record<string, number | null> = {};
    for (const m of base) values[m.id] = m.agg === "count" && !m.col ? indices.length : aggregate(m.agg, rows, m.col!, indices);
    for (const f of formulas) {
      try { const v = f.expr.evaluate(Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v ?? 0]))); values[f.m.id] = typeof v === "number" && isFinite(v) ? r2(v) : null; }
      catch { values[f.m.id] = null; }
    }
    return { count: indices.length, values, indices };
  };

  const rowDims = spec.rows || [], colDims = spec.columns || [];
  const rowMap = new Map<string, Key>(), colMap = new Map<string, Key>();
  const cellIdx = new Map<string, number[]>(), rowIdx = new Map<string, number[]>(), colIdx = new Map<string, number[]>();
  for (const i of filtered) {
    const r = rows[i];
    const rv = rowDims.map(d => (r[d] ?? null) as Scalar), cv = colDims.map(d => (r[d] ?? null) as Scalar);
    const rk = keyOf(rv), ck = keyOf(cv);
    if (!rowMap.has(rk)) rowMap.set(rk, { key: rk, values: rv });
    if (!colMap.has(ck)) colMap.set(ck, { key: ck, values: cv });
    push(cellIdx, `${rk}${SEP}${SEP}${ck}`, i); push(rowIdx, rk, i); push(colIdx, ck, i);
  }
  const cells = new Map<string, Cell>(); for (const [k, idx] of cellIdx) cells.set(k, evalCell(idx));
  const rowTotals = new Map<string, Cell>(); for (const [k, idx] of rowIdx) rowTotals.set(k, evalCell(idx));
  const colTotals = new Map<string, Cell>(); for (const [k, idx] of colIdx) colTotals.set(k, evalCell(idx));
  const grand = evalCell(filtered);

  // Column keys in natural order (numbers ascending, strings alphabetical)
  const colKeys = [...colMap.values()].sort((a, b) => cmpKeys(a.values, b.values));
  let rowKeys = [...rowMap.values()];
  // Sort rows: by measure id (on row totals) or by dimension column
  const sorts = (spec.sort || []).filter(s => allMeasures.some(m => m.id === s.key) || rowDims.includes(s.key));
  if (sorts.length) rowKeys.sort((a, b) => {
    for (const s of sorts) {
      const mi = allMeasures.findIndex(m => m.id === s.key);
      let c: number;
      if (mi >= 0) c = cmp(rowTotals.get(a.key)!.values[s.key], rowTotals.get(b.key)!.values[s.key]);
      else { const di = rowDims.indexOf(s.key); c = cmp(a.values[di], b.values[di]); }
      if (c) return s.dir === "desc" ? -c : c;
    }
    return 0;
  });
  else rowKeys.sort((a, b) => cmpKeys(a.values, b.values));
  if (spec.limit && spec.limit > 0) rowKeys = rowKeys.slice(0, spec.limit);

  const flat: Row[] = rowKeys.map(rk => {
    const o: Row = {};
    rowDims.forEach((d, i) => { o[d] = rk.values[i]; });
    const tot = rowTotals.get(rk.key)!;
    for (const m of allMeasures) o[m.id] = tot.values[m.id] ?? null;
    if (colDims.length) for (const ck of colKeys) for (const m of allMeasures) o[`${m.id}${SEP}${ck.key}`] = cells.get(`${rk.key}${SEP}${SEP}${ck.key}`)?.values[m.id] ?? null;
    return o;
  });

  return {
    spec, measures: allMeasures, rowKeys, colKeys, cells, rowTotals, colTotals, grand, flat,
    filteredCount: filtered.length, filteredIndices: filtered,
    drill(rowKey?: string, colKey?: string) {
      const idx = rowKey != null && colKey != null ? cellIdx.get(`${rowKey}${SEP}${SEP}${colKey}`) : rowKey != null ? rowIdx.get(rowKey) : colKey != null ? colIdx.get(colKey) : filtered;
      return (idx || []).map(i => rows[i]);
    },
  };
}

/** Raw view: filtered rows, sorted by spec.sort on raw columns, limited. */
export function rawView(rows: Row[], spec: ViewSpec): Row[] {
  let out = filterIndices(rows, spec.filters || []).map(i => rows[i]);
  const sorts = (spec.sort || []);
  if (sorts.length) out = [...out].sort((a, b) => { for (const s of sorts) { const c = cmp(a[s.key] as Scalar, b[s.key] as Scalar); if (c) return s.dir === "desc" ? -c : c; } return 0; });
  return spec.limit ? out.slice(0, spec.limit) : out;
}

export const run = (rows: Row[], spec: ViewSpec) => (isRaw(spec) ? { kind: "raw" as const, rows: rawView(rows, spec) } : { kind: "pivot" as const, result: pivot(rows, spec) });

function push(m: Map<string, number[]>, k: string, i: number) { const l = m.get(k); if (l) l.push(i); else m.set(k, [i]); }
export function cmp(a: Scalar | undefined, b: Scalar | undefined): number {
  if (a == null && b == null) return 0; if (a == null) return 1; if (b == null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" && typeof b === "boolean") return (a ? 1 : 0) - (b ? 1 : 0);
  return String(a).localeCompare(String(b), undefined, { numeric: true });
}
const cmpKeys = (a: Scalar[], b: Scalar[]) => { for (let i = 0; i < a.length; i++) { const c = cmp(a[i], b[i]); if (c) return c; } return 0; };
