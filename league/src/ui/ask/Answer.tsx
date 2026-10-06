/* The answer card: a headline, a chart, the result table, or the raw rows behind them. */
import { useCallback, useMemo, useState } from "react";
import type { Row } from "../../perspective/engine";
import { columnLabel, datasetInfo } from "../../view/catalog";
import { rawView, SEP, type PivotResult } from "../../view/engine";
import { allPresets } from "../../view/presets";
import { CHARTS, isRaw, specEquals, type ChartType, type ViewSpec } from "../../view/spec";
import type { ChartTheme } from "../shared/ChartPalette";
import { DataGrid } from "../shared/DataGrid";
import { formatValue } from "../shared/format";
import { Chart } from "./Chart";
import { chartFits, fmtMeasure, isPersonDim, keyLabel, measureFormatCol, measureLabel, rowKeyOf, sentenceText } from "./model";

const CHART_LABEL: Record<ChartType, string> = { table: "Table", bar: "Bar", line: "Line", area: "Area", scatter: "Scatter", heatmap: "Heatmap", bump: "Bump" };

export interface AnswerProps {
  spec: ViewSpec;
  rows: Row[];
  result: PivotResult | null;
  theme: ChartTheme;
  avatars: Map<string, string>;
  pendingNote: string | null;
  onChart: (c: ChartType) => void;
  onSort: (sort: { key: string; dir: "asc" | "desc" }[]) => void;
  onDrill: (rowKey: string | undefined, colKey: string | undefined, title: string) => void;
}

export function Answer({ spec, rows, result, theme, avatars, pendingNote, onChart, onSort, onDrill }: AnswerProps) {
  const [raw, setRaw] = useState(false);
  const d = spec.dataset;
  const info = datasetInfo(d);
  const rawRows = useMemo(() => (raw || isRaw(spec) ? rawView(rows, { ...spec, limit: isRaw(spec) ? spec.limit : undefined }) : []), [raw, rows, spec]);
  const rawCols = useMemo(() => (spec.display?.length ? spec.display : info?.columns.map(c => c.name) ?? []), [spec.display, info]);
  const labels = useMemo(() => {
    const out: Record<string, string> = {};
    for (const c of info?.columns ?? []) out[c.name] = c.label;
    if (result) {
      for (const m of result.measures) { out[m.id] = measureLabel(d, m); for (const ck of result.colKeys) if (ck.key) out[`${m.id}${SEP}${ck.key}`] = `${measureLabel(d, m)} · ${keyLabel(ck.values, spec.columns)}`; }
    }
    return out;
  }, [info, result, d, spec.columns]);

  const shown = useMemo(() => (result ? spec.measures.map(s => result.measures.find(m => m.id === s.id)).filter((m): m is NonNullable<typeof m> => !!m) : []), [result, spec.measures]);
  const gridCols = useMemo(() => {
    if (!result) return [];
    const cols = [...spec.rows, ...shown.map(m => m.id)];
    if (spec.columns.length) for (const ck of result.colKeys) for (const m of shown) cols.push(`${m.id}${SEP}${ck.key}`);
    return cols;
  }, [result, spec.rows, spec.columns, shown]);
  const bars = useMemo(() => (shown[0] ? [shown[0].id] : []), [shown]);
  const heat = useMemo(() => (result ? [...shown.slice(1).map(m => m.id), ...(spec.columns.length ? result.colKeys.flatMap(ck => shown.map(m => `${m.id}${SEP}${ck.key}`)) : [])] : []), [result, shown, spec.columns]);

  const render = useCallback((row: Row, col: string) => {
    const v = row[col];
    if (typeof v === "string" && isPersonDim(col)) { const url = avatars.get(v); if (url) return <span className="ask-person"><img src={url} alt="" loading="lazy" />{v}</span>; }
    return undefined;
  }, [avatars]);

  const onCell = useCallback((row: Row, col: string) => {
    if (!result) return;
    const rk = rowKeyOf(result, row);
    const i = col.indexOf(SEP);
    const ck = i >= 0 ? col.slice(i + 1) : undefined;
    const rowTitle = spec.rows.length ? keyLabel(spec.rows.map(r => row[r] as string | number | boolean | null), spec.rows) : "All rows";
    const colTitle = ck != null ? " · " + keyLabel(result.colKeys.find(k => k.key === ck)?.values ?? [], spec.columns) : "";
    onDrill(rk, ck, `${rowTitle}${colTitle}`);
  }, [result, spec.rows, spec.columns, onDrill]);

  const onChartDrill = useCallback((rowKey: string, colKey: string | undefined, title: string) => onDrill(rowKey, colKey, title), [onDrill]);

  /* ---- headline ---- */
  const headline = useMemo(() => {
    if (!result || !shown.length || !result.flat.length) return null;
    const m = shown[0];
    const top = result.flat[0];
    const label = spec.rows.length ? keyLabel(spec.rows.map(r => top[r] as string | number | boolean | null), spec.rows) : null;
    const value = top[m.id];
    const vals = result.flat.map(r => r[m.id]).filter((x): x is number => typeof x === "number");
    const mean = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    const grand = result.grand.values[m.id];
    const n = result.rowKeys.length;
    const dimName = spec.rows.length ? columnLabel(d, spec.rows[0]).toLowerCase() : "row";
    const sub: string[] = [];
    if (n > 1 && mean != null) sub.push(`${m.agg === "sum" || m.agg === "count" ? "Average" : "Mean"} across ${n} ${dimName}${n === 1 ? "" : "s"}: ${fmtMeasure(m, Math.round(mean * 100) / 100)}`);
    if (grand != null && (m.agg === "sum" || m.agg === "count")) sub.push(`Total: ${fmtMeasure(m, grand)}`);
    else if (grand != null && n > 1) sub.push(`League-wide: ${fmtMeasure(m, grand)}`);
    sub.push(`${result.filteredCount.toLocaleString()} ${info?.grain ?? "row"}${result.filteredCount === 1 ? "" : "s"}`);
    const avatar = label && spec.rows.length === 1 && isPersonDim(spec.rows[0]) ? avatars.get(String(top[spec.rows[0]])) : undefined;
    const lead = spec.sort[0]?.key === m.id ? (spec.sort[0].dir === "desc" ? "leads with" : "has the lowest at") : "·";
    return { label, value: value == null ? "–" : formatValue(measureFormatCol(m), value), unit: measureLabel(d, m), sub: sub.join("  ·  "), avatar, lead };
  }, [result, shown, spec.rows, spec.sort, d, info, avatars]);

  const rawMode = raw || isRaw(spec);
  const preset = useMemo(() => allPresets().find(p => specEquals(p.spec, spec)), [spec]);
  const title = spec.title ?? (preset ? preset.question ?? preset.name : isRaw(spec) ? `All ${info?.label?.toLowerCase() ?? d}` : sentenceText(spec));
  return (
    <section className="ask-card">
      <header className="ask-card-head">
        <div className="ask-card-title">
          <span className="eyebrow">{info?.label ?? d}</span>
          <h2>{title}</h2>
        </div>
        <div className="ask-card-tools">
          {!isRaw(spec) && <button type="button" className={`btn ghost sm ${raw ? "on" : ""}`} onClick={() => setRaw(x => !x)} aria-pressed={raw}>{raw ? "Back to answer" : "Raw rows"}</button>}
        </div>
      </header>
      {pendingNote && <p className="msg">{pendingNote}</p>}

      {!rawMode && result && (
        <>
          {headline ? (
            <div className="ask-headline">
              {headline.avatar && <img className="ask-avatar" src={headline.avatar} alt="" />}
              <div>
                {headline.label && <div className="ask-head-label">{headline.label} <span className="hint">{headline.lead}</span></div>}
                <div className="ask-head-value">{headline.value} <span className="ask-head-unit">{headline.unit}</span></div>
                <div className="hint">{headline.sub}</div>
              </div>
            </div>
          ) : (
            <p className="ask-empty">{!spec.measures.length ? "Pick a number to show (click “+ number…” in the sentence) or choose a question." : "No rows match these filters."}</p>
          )}
          {spec.measures.length > 0 && result.rowKeys.length > 0 && (
            <>
              <div className="ask-strip" role="radiogroup" aria-label="Chart type">
                {CHARTS.map(c => <button type="button" key={c} role="radio" aria-checked={spec.chart === c} className={spec.chart === c ? "on" : ""} disabled={!chartFits(c, spec)} onClick={() => onChart(c)}>{CHART_LABEL[c]}</button>)}
              </div>
              {spec.chart !== "table" && <Chart result={result} chart={spec.chart} theme={theme} onDrill={onChartDrill} />}
              <DataGrid key={gridCols.join("|")} rows={result.flat} columns={gridCols} labels={labels} bars={bars} heat={heat} sort={spec.sort} onSortChange={onSort} onCellClick={onCell} render={render} pinFirst height={Math.min(560, 44 + result.flat.length * 34 + 2)} emptyText="No rows" />
              <p className="hint ask-foot">Click any number or chart mark to see the {info?.grain ?? "row"}s behind it.</p>
            </>
          )}
        </>
      )}
      {rawMode && (
        <>
          <p className="hint">{rawRows.length.toLocaleString()} {info?.grain ?? "row"}{rawRows.length === 1 ? "" : "s"}{spec.filters.length ? " matching the filters" : ""}. One row per {info?.grain ?? "row"}.</p>
          <DataGrid key={`raw:${d}`} rows={rawRows} columns={rawCols} labels={labels} columnChooser pinFirst height={Math.min(600, 80 + rawRows.length * 34)} render={render} sort={isRaw(spec) ? spec.sort : undefined} />
        </>
      )}
    </section>
  );
}
