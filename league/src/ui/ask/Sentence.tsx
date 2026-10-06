/* The sentence: "from Teams show [Total points] for each [Manager] across [Season] where [...] sorted by [...]".
   Every bracket is a chip that opens a searchable picker; every pick edits the ViewSpec. */
import { Command } from "cmdk";
import { useCallback, useState, type ReactNode } from "react";
import type { Row } from "../../perspective/engine";
import { columnLabel, datasetInfo, type ColumnInfo } from "../../view/catalog";
import { AGG_LABEL, measureId, type Agg, type Filter, type FilterOp, type Scalar, type ViewSpec } from "../../view/spec";
import { formatValue } from "../shared/format";
import { ColumnPicker, DatasetPicker, Popover } from "../shared/Pickers";
import { COUNT_ROWS, MEASURE_AGGS, OP_TEXT, colType, defaultAgg, distinctValues, filterChip, isNumericCol, makeMeasure, measureChip, measureLabel, opsFor, startSpec } from "./model";

export type Edit = (fn: (s: ViewSpec) => ViewSpec, opts?: { reshape?: boolean }) => void;

export interface SentenceProps {
  spec: ViewSpec;
  rows: Row[];
  counts: Record<string, number>;
  edit: Edit;
  /** Open the custom-metric form for a formula measure (or a new one) */
  onFormula: (index: number | null) => void;
}

export function Sentence({ spec, rows, counts, edit, onFormula }: SentenceProps) {
  const [open, setOpen] = useState<string | null>(null);
  const [draftFilter, setDraftFilter] = useState<Filter | null>(null);
  const close = useCallback(() => { setOpen(null); setDraftFilter(null); }, []);
  const d = spec.dataset;
  const info = datasetInfo(d);
  const raw = !spec.measures.length && !spec.rows.length && !spec.columns.length;

  const chip = (id: string, label: ReactNode, pop: ReactNode, opts: { muted?: boolean; onRemove?: () => void; title?: string } = {}) => (
    <span className="pop-anchor" key={id}>
      <button type="button" className={`chip-btn ${opts.muted ? "muted" : ""}`} onClick={() => setOpen(id)} title={opts.title} aria-expanded={open === id}>
        {label}{opts.onRemove && <span className="x" role="button" aria-label="Remove" onClick={e => { e.stopPropagation(); opts.onRemove!(); }}>×</span>}
      </button>
      <Popover open={open === id} onClose={close}>{pop}</Popover>
    </span>
  );

  /* ---- measures ---- */
  const addMeasure = (c: ColumnInfo) => {
    const m = makeMeasure(c, defaultAgg(c));
    edit(s => (s.measures.some(x => x.id === m.id) ? s : { ...s, measures: [...s.measures, m], sort: s.sort.length ? s.sort : [{ key: m.id, dir: "desc" }] }), { reshape: true });
    setOpen(`m${spec.measures.length}`);
  };
  const setAgg = (i: number, agg: Agg) => edit(s => {
    const m = s.measures[i]; if (!m?.col) return s;
    const next = { ...m, id: measureId(agg, m.col), agg, label: undefined };
    return { ...s, measures: s.measures.map((x, j) => (j === i ? next : x)), sort: s.sort.map(x => (x.key === m.id ? { ...x, key: next.id } : x)) };
  });
  const removeMeasure = (i: number) => edit(s => { const m = s.measures[i]; return { ...s, measures: s.measures.filter((_, j) => j !== i), sort: s.sort.filter(x => x.key !== m.id) }; }, { reshape: true });

  const measurePop = (i: number) => {
    const m = spec.measures[i];
    if (!m) return null;
    if (m.formula) return <div className="ask-menu"><button type="button" onClick={() => { close(); onFormula(i); }}>Edit formula…</button><button type="button" className="danger" onClick={() => { close(); removeMeasure(i); }}>Remove</button></div>;
    return (
      <div className="ask-menu">
        {m.col && <>
          <div className="ask-menu-h">{columnLabel(d, m.col)}</div>
          {MEASURE_AGGS.map(a => <button type="button" key={a} className={a === m.agg ? "on" : ""} onClick={() => { setAgg(i, a); close(); }}>{AGG_LABEL[a]}{a === m.agg && <span className="hint">current</span>}</button>)}
        </>}
        <button type="button" className="danger" onClick={() => { close(); removeMeasure(i); }}>Remove</button>
      </div>
    );
  };
  const addMeasurePop = (
    <div>
      <div className="ask-menu slim"><button type="button" onClick={() => { edit(s => (s.measures.some(x => x.id === "count") ? s : { ...s, measures: [...s.measures, COUNT_ROWS] }), { reshape: true }); close(); }}>Count of rows</button><button type="button" onClick={() => { close(); onFormula(null); }}>Custom metric…</button></div>
      <ColumnPicker dataset={d} kinds={["measure", "flag"]} onPick={addMeasure} placeholder="Which number?" />
    </div>
  );

  /* ---- dimensions ---- */
  const dimPop = (which: "rows" | "columns", i: number | null) => (
    <div>
      {i != null && <div className="ask-menu slim"><button type="button" className="danger" onClick={() => { close(); edit(s => ({ ...s, [which]: s[which].filter((_, j) => j !== i), sort: s.sort.filter(x => x.key !== s[which][i]) }), { reshape: true }); }}>Remove {columnLabel(d, spec[which][i])}</button></div>}
      <ColumnPicker dataset={d} kinds={["dimension", "flag", "date"]} exclude={[...spec.rows, ...spec.columns]} placeholder={i != null ? "Replace with…" : which === "rows" ? "Group by what?" : "Split across what?"}
        onPick={c => { close(); edit(s => ({ ...s, [which]: i == null ? [...s[which], c.name] : s[which].map((x, j) => (j === i ? c.name : x)) }), { reshape: true }); }} />
    </div>
  );

  /* ---- filters ---- */
  const commitFilter = (i: number | null, f: Filter) => {
    if (i == null) { setDraftFilter(f); if (filterReady(f)) { edit(s => ({ ...s, filters: [...s.filters, f] })); setOpen(`f${spec.filters.length}`); setDraftFilter(null); } }
    else edit(s => ({ ...s, filters: s.filters.map((x, j) => (j === i ? f : x)) }));
  };
  const removeFilter = (i: number) => edit(s => ({ ...s, filters: s.filters.filter((_, j) => j !== i) }));
  const addFilterPop = draftFilter
    ? <FilterEditor dataset={d} rows={rows} filter={draftFilter} onChange={f => commitFilter(null, f)} onBack={() => setDraftFilter(null)} />
    : <ColumnPicker dataset={d} kinds={["dimension", "measure", "flag", "date"]} placeholder="Filter on which column?" onPick={c => setDraftFilter({ col: c.name, op: c.kind === "flag" ? "==" : "==", value: c.kind === "flag" ? true : undefined })} />;

  /* ---- sort & limit ---- */
  const sortKeys: { key: string; label: string }[] = [...spec.rows.map(r => ({ key: r, label: columnLabel(d, r) })), ...spec.measures.map(m => ({ key: m.id, label: measureLabel(d, m) }))];
  const sort0 = spec.sort[0];
  const sortLabel = sort0 ? `${sortKeys.find(k => k.key === sort0.key)?.label ?? sort0.key} ${sort0.dir === "desc" ? "↓" : "↑"}` : "natural order";
  const sortPop = (
    <div className="ask-menu">
      <div className="ask-menu-h">Sort by</div>
      {sortKeys.map(k => <button type="button" key={k.key} className={sort0?.key === k.key ? "on" : ""} onClick={() => { edit(s => ({ ...s, sort: [{ key: k.key, dir: s.sort[0]?.key === k.key && s.sort[0].dir === "desc" ? "asc" : "desc" }] })); }}>{k.label}{sort0?.key === k.key && <span className="hint">{sort0.dir === "desc" ? "high → low" : "low → high"}</span>}</button>)}
      <button type="button" className={!sort0 ? "on" : ""} onClick={() => { edit(s => ({ ...s, sort: [] })); close(); }}>Natural order</button>
      <div className="ask-menu-h">Show</div>
      <div className="ask-seg">{[0, 5, 10, 15, 25].map(n => <button type="button" key={n} className={(spec.limit ?? 0) === n ? "on" : ""} onClick={() => edit(s => ({ ...s, limit: n || undefined }))}>{n ? `Top ${n}` : "All"}</button>)}</div>
    </div>
  );

  return (
    <div className="ask-sentence">
      <span className="w">from</span>
      {chip("ds", info?.label ?? d, <DatasetPicker counts={counts} onPick={id => { close(); if (id !== d) edit(() => startSpec(id), { reshape: true }); }} />, { title: info?.description })}
      <span className="w">show</span>
      {spec.measures.map((m, i) => chip(`m${i}`, measureChip(d, m), measurePop(i), { onRemove: () => removeMeasure(i) }))}
      {chip("m+", spec.measures.length ? "+" : "+ number…", addMeasurePop, { muted: true, title: "Add a number" })}
      <span className="w">for each</span>
      {spec.rows.map((r, i) => chip(`r${i}`, columnLabel(d, r), dimPop("rows", i), { onRemove: () => edit(s => ({ ...s, rows: s.rows.filter((_, j) => j !== i), sort: s.sort.filter(x => x.key !== r) }), { reshape: true }) }))}
      {chip("r+", spec.rows.length ? "+" : "+ group…", dimPop("rows", null), { muted: true, title: "Add a grouping" })}
      {spec.columns.length > 0 && <span className="w">across</span>}
      {spec.columns.map((c, i) => chip(`c${i}`, columnLabel(d, c), dimPop("columns", i), { onRemove: () => edit(s => ({ ...s, columns: s.columns.filter((_, j) => j !== i) }), { reshape: true }) }))}
      {!spec.columns.length && chip("c+", "+ across…", dimPop("columns", null), { muted: true, title: "Split the numbers across a second dimension (one column per value)" })}
      {spec.filters.length > 0 && <span className="w">where</span>}
      {spec.filters.map((f, i) => chip(`f${i}`, filterChip(d, f), <FilterEditor dataset={d} rows={rows} filter={f} onChange={x => commitFilter(i, x)} onRemove={() => { close(); removeFilter(i); }} />, { onRemove: () => removeFilter(i) }))}
      {chip("f+", spec.filters.length ? "+ and…" : "+ where…", addFilterPop, { muted: true, title: "Add a filter" })}
      {!raw && <><span className="w">sorted by</span>{chip("sort", sortLabel + (spec.limit ? `, top ${spec.limit}` : ""), sortPop)}</>}
    </div>
  );
}

const filterReady = (f: Filter) => f.op === "is null" || f.op === "is not null" || (Array.isArray(f.value) ? f.value.length > 0 : f.value !== undefined && f.value !== "");

/* Operator + value editor for one filter */
function FilterEditor({ dataset, rows, filter, onChange, onRemove, onBack }: { dataset: string; rows: Row[]; filter: Filter; onChange: (f: Filter) => void; onRemove?: () => void; onBack?: () => void }) {
  const c = colType(dataset, filter.col);
  const ops = opsFor(dataset, filter.col);
  const numeric = isNumericCol(dataset, filter.col);
  const needsValue = filter.op !== "is null" && filter.op !== "is not null";
  const listy = filter.op === "==" || filter.op === "!=" || filter.op === "in" || filter.op === "not in";
  const multi = filter.op === "in" || filter.op === "not in";
  const values = listy && c?.kind !== "flag" ? distinctValues(rows, filter.col) : [];
  const useList = listy && c?.kind !== "flag" && (c?.kind !== "measure" || values.length <= 60);
  const setOp = (op: FilterOp) => {
    const m = op === "in" || op === "not in";
    let value = filter.value;
    if (m && !Array.isArray(value)) value = value == null ? [] : [value];
    if (!m && Array.isArray(value)) value = value[0];
    if (op === "contains" && typeof value !== "string") value = "";
    onChange({ col: filter.col, op, value });
  };
  const selected = new Set<string>((Array.isArray(filter.value) ? filter.value : filter.value == null ? [] : [filter.value]).map(String));
  const toggle = (v: Scalar) => {
    if (!multi) { onChange({ ...filter, value: v }); return; }
    const cur = Array.isArray(filter.value) ? filter.value : [];
    onChange({ ...filter, value: cur.some(x => String(x) === String(v)) ? cur.filter(x => String(x) !== String(v)) : [...cur, v] });
  };
  return (
    <div className="ask-filter">
      <div className="ask-menu-h row" style={{ justifyContent: "space-between" }}><span>{onBack && <button type="button" className="linkbtn" onClick={onBack}>‹</button>} {columnLabel(dataset, filter.col)}</span>{onRemove && <button type="button" className="linkbtn danger" onClick={onRemove}>Remove</button>}</div>
      <div className="ask-seg wrap">{ops.map(op => <button type="button" key={op} className={op === filter.op ? "on" : ""} onClick={() => setOp(op)}>{numeric && op === "==" ? "=" : numeric && op === "!=" ? "≠" : OP_TEXT[op]}</button>)}</div>
      {needsValue && c?.kind === "flag" && <div className="ask-seg">{[true, false].map(b => <button type="button" key={String(b)} className={filter.value === b ? "on" : ""} onClick={() => onChange({ ...filter, value: b })}>{b ? "Yes" : "No"}</button>)}</div>}
      {needsValue && c?.kind !== "flag" && useList && (
        <Command className="cmd" label="Pick a value">
          <Command.Input placeholder={multi ? "Pick one or more…" : "Pick a value…"} autoFocus className="cmd-input" />
          <Command.List className="cmd-list">
            <Command.Empty className="cmd-empty">Nothing matches.</Command.Empty>
            {values.map(v => { const on = selected.has(String(v)); return <Command.Item key={String(v)} value={String(v)} onSelect={() => toggle(v)} className={`cmd-item ${on ? "on" : ""}`}><span>{v == null ? "(empty)" : numeric ? String(v) : formatValue(filter.col, v)}</span>{on && <span className="hint">✓</span>}</Command.Item>; })}
          </Command.List>
        </Command>
      )}
      {needsValue && c?.kind !== "flag" && !useList && (
        <input type={numeric && filter.op !== "contains" ? "number" : "text"} className="ask-input" autoFocus placeholder={numeric ? "Number" : "Text"} value={Array.isArray(filter.value) ? "" : filter.value == null ? "" : String(filter.value)}
          onChange={e => { const t = e.target.value; const v: Scalar = numeric && filter.op !== "contains" ? (t === "" ? null : Number(t)) : t; onChange({ ...filter, value: multi ? [v] : v }); }}
          onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
      )}
    </div>
  );
}
