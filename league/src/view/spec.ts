/* The one view description every prototype reads and writes. Presets, saved views and URLs are all ViewSpecs. */

export type Agg = "count" | "sum" | "avg" | "min" | "max" | "median" | "distinct" | "any";
export const AGGS: Agg[] = ["sum", "avg", "count", "min", "max", "median", "distinct", "any"];
export const AGG_LABEL: Record<Agg, string> = { sum: "Total", avg: "Average", count: "Count", min: "Lowest", max: "Highest", median: "Median", distinct: "Distinct", any: "Value" };

export interface Measure {
  /** Stable id used as the key in results, sort and formulas, e.g. "sum_points" */
  id: string;
  /** Column aggregated; omitted for formula measures */
  col?: string;
  agg: Agg;
  label?: string;
  /** Expression over other measures, e.g. "sum_points / count_game_id" or "sum(points) / count(game_id)" */
  formula?: string;
}

export type FilterOp = "==" | "!=" | ">" | ">=" | "<" | "<=" | "in" | "not in" | "contains" | "is null" | "is not null";
export const FILTER_OPS: FilterOp[] = ["==", "!=", ">", ">=", "<", "<=", "in", "not in", "contains", "is null", "is not null"];
export type Scalar = string | number | boolean | null;
export interface Filter { col: string; op: FilterOp; value?: Scalar | Scalar[] }

export interface Sort { key: string; dir: "asc" | "desc" }

export type ChartType = "table" | "bar" | "line" | "area" | "scatter" | "heatmap" | "bump";
export const CHARTS: ChartType[] = ["table", "bar", "line", "area", "scatter", "heatmap", "bump"];

export interface ViewSpec {
  dataset: string;
  /** Group-by dimensions, one row per combination */
  rows: string[];
  /** Split-by dimensions, one column group per combination */
  columns: string[];
  measures: Measure[];
  filters: Filter[];
  sort: Sort[];
  chart: ChartType;
  limit?: number;
  title?: string;
  /** For raw (un-pivoted) views: which columns to show. Ignored when rows, columns or measures are set. */
  display?: string[];
}

export const emptySpec = (dataset: string): ViewSpec => ({ dataset, rows: [], columns: [], measures: [], filters: [], sort: [], chart: "table" });
export const isRaw = (s: ViewSpec) => !s.rows.length && !s.columns.length && !s.measures.length;
export const measureId = (agg: Agg, col: string) => `${agg}_${col}`;
export const cloneSpec = (s: ViewSpec): ViewSpec => JSON.parse(JSON.stringify(s));
export const specEquals = (a: ViewSpec, b: ViewSpec) => JSON.stringify(a) === JSON.stringify(b);
