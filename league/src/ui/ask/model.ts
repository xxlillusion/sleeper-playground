/* Helpers for the sentence builder: how a ViewSpec reads as prose, sensible defaults, and the automatic chart choice. */
import type { LeagueDataset } from "../../data/load";
import type { Row } from "../../perspective/engine";
import { columnLabel, datasetInfo, type ColumnInfo } from "../../view/catalog";
import { cmp, type PivotResult } from "../../view/engine";
import { allPresets, type PresetView } from "../../view/presets";
import { AGG_LABEL, emptySpec, measureId, type Agg, type ChartType, type Filter, type FilterOp, type Measure, type Scalar, type ViewSpec } from "../../view/spec";
import { formatValue } from "../shared/format";

export const QUESTION_PRESETS = (): PresetView[] => allPresets().filter(p => p.group === "Questions");

/* ---------- column roles ---------- */
const TIME = /^(season|week|week_end|round|season_game_no|pick_no|pick_round|first_season|last_season)$/;
const PERSON = /^(manager|display_name|opponent|opp_manager|drafted_by|counterparty|manager_name_that_season|team|opp_team)$/;
export const isTimeDim = (c: string, kind?: ColumnInfo["kind"]) => TIME.test(c) || kind === "date";
export const isPersonDim = (c: string) => PERSON.test(c);
export const isRankCol = (c: string) => /rank|seed|place|finish/.test(c);

export function managerDim(dataset: string): string | null {
  const cols = datasetInfo(dataset)?.columns ?? [];
  for (const n of ["manager", "display_name"]) if (cols.some(c => c.name === n && c.kind === "dimension")) return n;
  return null;
}

/** The sentence a fresh dataset starts with: "Show … for each Manager" when the table has a manager column. */
export function startSpec(dataset: string): ViewSpec {
  const s = emptySpec(dataset);
  const md = managerDim(dataset);
  if (md) s.rows = [md];
  return s;
}

export function defaultAgg(col: ColumnInfo): Agg {
  if (col.kind === "flag") return "sum";
  if (isRankCol(col.name)) return "min";
  if (/pct|avg|ppg|efficiency|luck|_pg$|rate|margin|per_/.test(col.name)) return "avg";
  return "sum";
}
export const MEASURE_AGGS: Agg[] = ["sum", "avg", "count", "max", "min", "median"];

export function makeMeasure(col: ColumnInfo, agg: Agg): Measure {
  return { id: measureId(agg, col.name), col: col.name, agg };
}
export const COUNT_ROWS: Measure = { id: "count", agg: "count" };

/* ---------- labels ---------- */
export function measureLabel(dataset: string, m: Measure): string {
  if (m.label) return m.label;
  if (m.formula && !m.col) return m.formula;
  if (!m.col) return "Rows";
  return `${AGG_LABEL[m.agg]} ${columnLabel(dataset, m.col).toLowerCase()}`;
}
/** Chip text always spells out the aggregate, even when the preset gave the measure a short label */
export function measureChip(dataset: string, m: Measure): string {
  if (m.formula && !m.col) return m.label ?? m.formula;
  if (!m.col) return "Count of rows";
  return `${AGG_LABEL[m.agg]} ${columnLabel(dataset, m.col).toLowerCase()}`;
}
/** Column used for number formatting of a measure */
export const measureFormatCol = (m: Measure) => (m.agg === "count" || m.agg === "distinct" ? "count" : m.col ?? m.id);
export const fmtMeasure = (m: Measure, v: unknown) => (v == null ? "–" : formatValue(measureFormatCol(m), v));

export function colType(dataset: string, col: string): ColumnInfo | null {
  return datasetInfo(dataset)?.columns.find(c => c.name === col) ?? null;
}
export const isNumericCol = (dataset: string, col: string) => { const t = colType(dataset, col)?.type; return t === "integer" || t === "float"; };

export const OP_TEXT: Record<FilterOp, string> = { "==": "is", "!=": "is not", ">": ">", ">=": "≥", "<": "<", "<=": "≤", in: "is one of", "not in": "is not", contains: "contains", "is null": "is empty", "is not null": "is set" };
export const NUM_OPS: FilterOp[] = ["==", "!=", ">", ">=", "<", "<=", "in", "not in", "is null", "is not null"];
export const STR_OPS: FilterOp[] = ["==", "!=", "in", "not in", "contains", "is null", "is not null"];
export const FLAG_OPS: FilterOp[] = ["==", "is null", "is not null"];
export function opsFor(dataset: string, col: string): FilterOp[] {
  const c = colType(dataset, col);
  if (c?.kind === "flag") return FLAG_OPS;
  return isNumericCol(dataset, col) ? NUM_OPS : STR_OPS;
}
export function filterChip(dataset: string, f: Filter): string {
  const label = columnLabel(dataset, f.col);
  const numeric = isNumericCol(dataset, f.col);
  const op = numeric && f.op === "==" ? "=" : numeric && f.op === "!=" ? "≠" : OP_TEXT[f.op];
  if (f.op === "is null" || f.op === "is not null") return `${label} ${op}`;
  const v = Array.isArray(f.value) ? (f.value.length > 3 ? `${f.value.length} values` : f.value.map(x => fmtScalar(f.col, x)).join(", ")) : fmtScalar(f.col, f.value ?? null);
  return `${label} ${op} ${v}`;
}
const fmtScalar = (col: string, v: Scalar) => (typeof v === "number" && /season|week|year|rank|round|pick/.test(col) ? String(v) : formatValue(col, v));

export function distinctValues(rows: Row[], col: string, max = 400): Scalar[] {
  const seen = new Set<Scalar>();
  for (const r of rows) { const v = r[col] ?? null; if (!seen.has(v)) { seen.add(v); if (seen.size > max) break; } }
  return [...seen].sort(cmp);
}

/* ---------- chart choice ---------- */
export function autoChart(spec: ViewSpec): ChartType {
  const rows = spec.rows, cols = spec.columns, ms = spec.measures;
  if (!ms.length || (!rows.length && !cols.length)) return "table";
  if (rows.length === 1 && cols.length === 0) {
    if (ms.length === 2 && !isTimeDim(rows[0])) return "scatter";
    return isTimeDim(rows[0]) ? "line" : "bar";
  }
  if (rows.length === 1 && cols.length === 1) {
    const t = isTimeDim(rows[0]) || isTimeDim(cols[0]);
    if (t) return ms[0].col && isRankCol(ms[0].col) ? "bump" : "line";
    return "heatmap";
  }
  if (rows.length === 2 && cols.length === 0) return "heatmap";
  return "bar";
}
/** Which charts make sense for a result shape; the strip greys out the rest. */
export function chartFits(chart: ChartType, spec: ViewSpec): boolean {
  const r = spec.rows.length, c = spec.columns.length, m = spec.measures.length;
  if (chart === "table") return true;
  if (!m || !r) return false;
  switch (chart) {
    case "bar": return true;
    case "line": case "area": case "bump": return (r === 1 && c <= 1) || (r === 2 && c === 0);
    case "scatter": return m >= 2;
    case "heatmap": return (r === 1 && c === 1) || (r === 2 && c === 0);
  }
}

/* ---------- prose ---------- */
export function sentenceText(spec: ViewSpec): string {
  const d = spec.dataset;
  const info = datasetInfo(d);
  if (!spec.measures.length && !spec.rows.length) return `All ${info?.label ?? d}`;
  const parts: string[] = [];
  parts.push(spec.measures.map(m => measureChip(d, m)).join(", ") || "rows");
  if (spec.rows.length) parts.push(`by ${spec.rows.map(c => columnLabel(d, c).toLowerCase()).join(" and ")}`);
  if (spec.columns.length) parts.push(`across ${spec.columns.map(c => columnLabel(d, c).toLowerCase()).join(" and ")}`);
  if (spec.filters.length) parts.push(`where ${spec.filters.map(f => filterChip(d, f)).join(" and ")}`);
  return parts.join(" ");
}

/* ---------- avatars ---------- */
export function avatarMap(ds: LeagueDataset): Map<string, string> {
  const map = new Map<string, string>();
  for (let i = ds.models.length - 1; i >= 0; i--) {
    for (const t of Object.values(ds.models[i].teams)) {
      if (t.isOpen) continue;
      const name = ds.names[t.uid] ?? t.manager;
      const url = t.avatar ?? (t.user?.avatar ? `https://sleepercdn.com/avatars/thumbs/${t.user.avatar}` : null);
      if (url && !map.has(name)) map.set(name, url);
    }
  }
  return map;
}

/* ---------- row keys ---------- */
/** Find the pivot row key behind a flat result row */
export function rowKeyOf(result: PivotResult, row: Row): string | undefined {
  const dims = result.spec.rows;
  return result.rowKeys.find(k => dims.every((d, i) => String(k.values[i] ?? "\u0000") === String(row[d] ?? "\u0000")))?.key;
}
export const keyLabel = (values: Scalar[], cols: string[]) => values.map((v, i) => (v == null ? "(empty)" : fmtScalar(cols[i] ?? "", v))).join(" · ");
