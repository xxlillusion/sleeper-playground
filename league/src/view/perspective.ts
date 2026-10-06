/* Adapters between ViewSpec and Perspective's viewer config, so the existing presets become specs and the Sheet prototype can keep Perspective as its engine. */
import type { ViewerConfigUpdate } from "@perspective-dev/viewer";
import type { Schema } from "../perspective/engine";
import { measureId, type Agg, type ChartType, type Filter, type FilterOp, type Measure, type Scalar, type ViewSpec } from "./spec";

const PLUGIN_TO_CHART: Record<string, ChartType> = { Datagrid: "table", "Y Bar": "bar", "X Bar": "bar", "Y Line": "line", "X/Y Line": "line", "Y Area": "area", "X/Y Scatter": "scatter", "Y Scatter": "scatter", Heatmap: "heatmap", Treemap: "bar", Sunburst: "bar" };
const CHART_TO_PLUGIN: Record<ChartType, string> = { table: "Datagrid", bar: "Y Bar", line: "Y Line", area: "Y Area", scatter: "X/Y Scatter", heatmap: "Heatmap", bump: "Y Line" };
const AGG_FROM: Record<string, Agg> = { sum: "sum", avg: "avg", mean: "avg", count: "count", min: "min", max: "max", median: "median", "distinct count": "distinct", any: "any", first: "any", last: "any", "sum abs": "sum", unique: "any" };
const AGG_TO: Record<Agg, string> = { sum: "sum", avg: "avg", count: "count", min: "min", max: "max", median: "median", distinct: "distinct count", any: "any" };
const OPS = new Set<string>(["==", "!=", ">", ">=", "<", "<=", "in", "not in", "contains", "is null", "is not null"]);

const defaultAgg = (schema: Schema | undefined, col: string): Agg => (schema?.[col] === "float" || schema?.[col] === "integer" ? "sum" : "count");

export function fromPerspective(dataset: string, cfg: ViewerConfigUpdate, schema?: Schema): ViewSpec {
  const rows = cfg.group_by ?? [], columns = cfg.split_by ?? [];
  const cols = (cfg.columns ?? []).filter((c): c is string => !!c);
  const pivoted = rows.length > 0 || columns.length > 0;
  const measures: Measure[] = pivoted ? cols.map(c => { const agg = AGG_FROM[String(cfg.aggregates?.[c] ?? "")] ?? defaultAgg(schema, c); return { id: measureId(agg, c), col: c, agg }; }) : [];
  const filters: Filter[] = (cfg.filter ?? []).flatMap(f => {
    const [col, op, value] = f as unknown as [string, string, Scalar | Scalar[]];
    return OPS.has(op) ? [{ col, op: op as FilterOp, value }] : [];
  });
  const sort = (cfg.sort ?? []).flatMap(s => {
    const [col, dir] = s as unknown as [string, string];
    const d = dir.includes("desc") ? "desc" : "asc";
    const m = measures.find(x => x.col === col);
    return [{ key: m ? m.id : col, dir: d as "asc" | "desc" }];
  });
  return { dataset, rows, columns, measures, filters, sort, chart: PLUGIN_TO_CHART[cfg.plugin ?? "Datagrid"] ?? "table", title: cfg.title ?? undefined, display: pivoted ? undefined : cols };
}

export function toPerspective(spec: ViewSpec, allColumns: string[]): ViewerConfigUpdate {
  const pivoted = spec.rows.length > 0 || spec.columns.length > 0 || spec.measures.length > 0;
  const measures = spec.measures.filter(m => m.col);
  const columns = pivoted ? measures.map(m => m.col!) : (spec.display?.length ? spec.display : allColumns);
  const aggregates: Record<string, string> = {}; for (const m of measures) aggregates[m.col!] = AGG_TO[m.agg];
  const sort = spec.sort.map(s => { const m = spec.measures.find(x => x.id === s.key); return [m?.col ?? s.key, s.dir] as [string, "asc" | "desc"]; });
  return {
    plugin: CHART_TO_PLUGIN[spec.chart] ?? "Datagrid", group_by: spec.rows, split_by: spec.columns, columns, aggregates, filter: spec.filters.map(f => [f.col, f.op, f.value ?? null]) as unknown as ViewerConfigUpdate["filter"],
    sort: sort as unknown as ViewerConfigUpdate["sort"], expressions: {}, plugin_config: {}, columns_config: {}, title: spec.title ?? null,
  };
}
