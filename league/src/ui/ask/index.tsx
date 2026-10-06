/* Prototype A: "Ask the League". A sentence builder that maps one-to-one onto a pivot, with an answer card under it. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Row } from "../../perspective/engine";
import { datasetInfo } from "../../view/catalog";
import { pivot, type PivotResult } from "../../view/engine";
import { useSpecHistory } from "../../view/history";
import { allPresets, type PresetView } from "../../view/presets";
import { isRaw, specEquals, type ChartType, type Measure, type ViewSpec } from "../../view/spec";
import { readSpec, shareUrl, writeSpec } from "../../view/url";
import { useChartTheme } from "../shared/ChartPalette";
import { DrillSheet } from "../shared/DrillSheet";
import { ColumnPicker, Popover, PresetPicker } from "../shared/Pickers";
import type { PrototypeProps } from "../types";
import { Answer } from "./Answer";
import { QUESTION_PRESETS, autoChart, avatarMap, keyLabel, startSpec } from "./model";
import { AdvancedJson, MetricForm } from "./Power";
import { Sentence, type Edit } from "./Sentence";
import "./ask.css";

const storageKey = (root: string) => `league:ask:last:${root}`;
const valid = (s: ViewSpec | null | undefined): s is ViewSpec => !!s && typeof s === "object" && !!datasetInfo(s.dataset) && Array.isArray(s.rows) && Array.isArray(s.measures);

function initialSpec(root: string): ViewSpec {
  const fromUrl = readSpec(); if (valid(fromUrl)) return fromUrl;
  try { const s = JSON.parse(localStorage.getItem(storageKey(root)) || "null"); if (valid(s)) return s; } catch { /* ignore */ }
  return QUESTION_PRESETS()[0].spec;
}

export default function Ask({ ds, rowsById, counts, pending, theme }: PrototypeProps) {
  const h = useSpecHistory(useMemo(() => initialSpec(ds.rootId), [ds.rootId]));
  const spec = h.spec;
  const chartTheme = useChartTheme(theme);
  const rows: Row[] = useMemo(() => rowsById[spec.dataset] ?? [], [rowsById, spec.dataset]);
  const avatars = useMemo(() => avatarMap(ds), [ds]);
  const questions = useMemo(() => QUESTION_PRESETS(), []);

  // Share and remember every change
  useEffect(() => { writeSpec(spec); try { localStorage.setItem(storageKey(ds.rootId), JSON.stringify(spec)); } catch { /* ignore */ } }, [spec, ds.rootId]);

  const [error, setError] = useState<string | null>(null);
  const result = useMemo<PivotResult | null>(() => {
    if (isRaw(spec)) { setError(null); return null; }
    try { const r = pivot(rows, spec); setError(null); return r; } catch (e) { setError(e instanceof Error ? e.message : String(e)); return null; }
  }, [rows, spec]);

  /* ---- editing ---- */
  const edit = useCallback<Edit>((fn, opts) => {
    h.set(s => {
      const n = fn(s);
      if (n === s) return s;
      const next: ViewSpec = { ...n, title: undefined };
      if (opts?.reshape) { next.chart = autoChart(next); next.display = undefined; if (!next.measures.length && !next.rows.length && !next.columns.length) next.sort = next.sort.filter(x => datasetInfo(next.dataset)?.columns.some(c => c.name === x.key)); }
      return next;
    });
  }, [h]);
  const applyPreset = (p: PresetView) => { h.set(p.spec); setPresetsOpen(false); };
  const setChart = (chart: ChartType) => h.set(s => ({ ...s, chart }));
  const setSort = useCallback((sort: { key: string; dir: "asc" | "desc" }[]) => h.set(s => (JSON.stringify(s.sort) === JSON.stringify(sort) ? s : { ...s, sort }), { record: false }), [h]);

  /* ---- questions (presets) ---- */
  const [presetsOpen, setPresetsOpen] = useState(false);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      const typing = tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement | null)?.isContentEditable;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPresetsOpen(o => !o); }
      else if (!typing && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) h.redo(); else h.undo(); }
    };
    addEventListener("keydown", k); return () => removeEventListener("keydown", k);
  }, [h]);
  const isDefault = specEquals(spec, questions[0].spec) || !spec.measures.length;
  const suggestions = isDefault ? questions.filter(q => !specEquals(q.spec, spec)).slice(0, 5) : [];

  /* ---- custom metric & advanced ---- */
  const [metric, setMetric] = useState<{ index: number | null } | null>(null);
  const [advanced, setAdvanced] = useState(false);
  const saveMetric = (m: Measure) => {
    const i = metric?.index ?? null;
    edit(s => ({ ...s, measures: i == null ? [...s.measures, m] : s.measures.map((x, j) => (j === i ? { ...m, id: x.id } : x)), sort: s.sort.length || i != null ? s.sort : [{ key: m.id, dir: "desc" }] }), { reshape: i == null });
    setMetric(null);
  };

  /* ---- copy link ---- */
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<number | undefined>(undefined);
  const copy = async () => {
    const url = shareUrl(spec);
    try { await navigator.clipboard.writeText(url); } catch { prompt("Copy this link", url); }
    setCopied(true); clearTimeout(copyTimer.current); copyTimer.current = setTimeout(() => setCopied(false), 1600);
  };

  /* ---- drill-through ---- */
  const [drill, setDrill] = useState<{ title: string; rows: Row[]; rowKey?: string; colKey?: string } | null>(null);
  const [breakOpen, setBreakOpen] = useState(false);
  const onDrill = useCallback((rowKey: string | undefined, colKey: string | undefined, title: string) => {
    if (!result) return;
    setDrill({ title, rows: result.drill(rowKey, colKey), rowKey, colKey });
  }, [result]);
  const closeDrill = useCallback(() => { setDrill(null); setBreakOpen(false); }, []);
  /** Filters that pin the drilled cell: every row dim and column dim of the cell becomes an equality filter */
  const pinFilters = (s: ViewSpec): ViewSpec => {
    if (!result || !drill) return s;
    const filters = [...s.filters];
    const rk = drill.rowKey != null ? result.rowKeys.find(k => k.key === drill.rowKey) : undefined;
    const ck = drill.colKey != null ? result.colKeys.find(k => k.key === drill.colKey) : undefined;
    const fixedRows: string[] = [], fixedCols: string[] = [];
    if (rk) s.rows.forEach((col, i) => { const v = rk.values[i]; filters.push(v == null ? { col, op: "is null" } : { col, op: "==", value: v }); fixedRows.push(col); });
    if (ck) s.columns.forEach((col, i) => { const v = ck.values[i]; filters.push(v == null ? { col, op: "is null" } : { col, op: "==", value: v }); fixedCols.push(col); });
    return { ...s, filters, rows: s.rows.filter(r => !fixedRows.includes(r)), columns: s.columns.filter(c => !fixedCols.includes(c)) };
  };
  const filterToThis = () => { edit(pinFilters, { reshape: true }); closeDrill(); };
  const breakOutBy = (col: string) => { edit(s => ({ ...pinFilters(s), rows: [col], columns: [] }), { reshape: true }); closeDrill(); };

  const pendingNote = pending[spec.dataset] ? (pending[spec.dataset] === "off" ? `${datasetInfo(spec.dataset)?.label} is switched off in the loading options, so this table is empty.` : `${datasetInfo(spec.dataset)?.label}: ${pending[spec.dataset]}…`) : null;
  const drillLabel = drill && result && drill.rowKey != null ? keyLabel(result.rowKeys.find(k => k.key === drill.rowKey)?.values ?? [], spec.rows) : "";

  return (
    <div className="ask">
      <div className="ask-top">
        <div className="ask-bar">
          <span className="pop-anchor">
            <button type="button" className="btn sm" onClick={() => setPresetsOpen(o => !o)} aria-expanded={presetsOpen}>Questions <kbd>⌘K</kbd></button>
            <Popover open={presetsOpen} onClose={() => setPresetsOpen(false)}><PresetPicker presets={allPresets()} onPick={applyPreset} /></Popover>
          </span>
          <span className="ask-bar-group">
            <button type="button" className="btn ghost sm" onClick={h.undo} disabled={!h.canUndo} title="Undo (Ctrl+Z)">↶ Undo</button>
            <button type="button" className="btn ghost sm" onClick={h.redo} disabled={!h.canRedo} title="Redo (Ctrl+Shift+Z)">↷ Redo</button>
          </span>
          <span className="ask-bar-group">
            <button type="button" className={`btn ghost sm ${metric ? "on" : ""}`} onClick={() => setMetric(m => (m ? null : { index: null }))}>Custom metric</button>
            <button type="button" className={`btn ghost sm ${advanced ? "on" : ""}`} onClick={() => setAdvanced(a => !a)} aria-pressed={advanced}>Advanced</button>
            <button type="button" className="btn ghost sm" onClick={copy}>{copied ? "Copied ✓" : "Copy link"}</button>
            <button type="button" className="btn ghost sm" onClick={() => edit(s => startSpec(s.dataset), { reshape: true })} title="Clear the sentence">Start over</button>
          </span>
        </div>
        <Sentence spec={spec} rows={rows} counts={counts} edit={edit} onFormula={i => setMetric({ index: i })} />
        {suggestions.length > 0 && (
          <div className="ask-suggest">
            <span className="hint">Try asking</span>
            {suggestions.map(q => <button type="button" key={q.id} onClick={() => applyPreset(q)}>{q.question ?? q.name}</button>)}
          </div>
        )}
        {metric && <MetricForm dataset={spec.dataset} initial={metric.index != null ? spec.measures[metric.index] : null} onSave={saveMetric} onCancel={() => setMetric(null)} />}
        {advanced && <AdvancedJson spec={spec} onApply={s => h.set(s)} />}
        {error && <p className="msg err">{error}</p>}
      </div>

      <Answer spec={spec} rows={rows} result={result} theme={chartTheme} avatars={avatars} pendingNote={pendingNote} onChart={setChart} onSort={setSort} onDrill={onDrill} />

      {drill && (
        <DrillSheet title={drill.title} rows={drill.rows} onClose={closeDrill} actions={
          <>
            {(drill.rowKey != null || drill.colKey != null) && <button type="button" className="btn ghost sm" onClick={filterToThis} title={`Keep only ${drillLabel || "these rows"} and drop the grouping`}>Filter to this</button>}
            <span className="pop-anchor">
              <button type="button" className="btn ghost sm" onClick={() => setBreakOpen(o => !o)}>Break out by…</button>
              <Popover open={breakOpen} onClose={() => setBreakOpen(false)} anchorClass="right"><ColumnPicker dataset={spec.dataset} kinds={["dimension", "flag", "date"]} exclude={[...spec.rows, ...spec.columns]} placeholder="Break these rows out by…" onPick={c => breakOutBy(c.name)} /></Popover>
            </span>
          </>
        } />
      )}
    </div>
  );
}
