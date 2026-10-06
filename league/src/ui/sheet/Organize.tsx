/* The Organize panel: Numbers-style field list plus Rows / Columns / Values / Filters / Sort / Chart / Formula editors over a SheetSpec. */
import type { Table } from "@perspective-dev/client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Row } from "../../perspective/engine";
import type { ColumnInfo, DatasetInfo } from "../../view/catalog";
import type { PresetView } from "../../view/presets";
import { AGGS, AGG_LABEL, CHARTS, FILTER_OPS, measureId, specEquals, type Agg, type ChartType, type Filter, type FilterOp, type Measure, type Scalar, type Sort } from "../../view/spec";
import { ColumnPicker, Popover } from "../shared/Pickers";
import { KIND_ICON, KIND_NAME, columnsOf, defaultAggFor, distinctValues, formulaExamples, isGroupable, type SheetSpec } from "./model";

export interface OrganizeProps {
  spec: SheetSpec;
  info: DatasetInfo;
  rows: Row[];
  table: Table | null;
  presets: PresetView[];
  onChange: (fn: (s: SheetSpec) => SheetSpec) => void;
  onPreset: (p: PresetView) => void;
}

const CHART_LABEL: Record<ChartType, string> = { table: "Table", bar: "Bar", line: "Line", area: "Area", scatter: "Scatter", heatmap: "Heatmap", bump: "Bump" };
const CHART_ICON: Record<ChartType, React.ReactNode> = {
  table: <svg viewBox="0 0 16 16"><rect x="1.5" y="2.5" width="13" height="11" rx="1.5" /><path d="M1.5 6h13M1.5 9.5h13M6 2.5v11" /></svg>,
  bar: <svg viewBox="0 0 16 16"><path d="M2 14V7M6 14V3M10 14V9M14 14V5" /></svg>,
  line: <svg viewBox="0 0 16 16"><path d="M1.5 12l4-5 3 3 6-7" /></svg>,
  area: <svg viewBox="0 0 16 16"><path d="M1.5 13V10l4-5 3 3 6-6v11z" fill="currentColor" fillOpacity=".25" /></svg>,
  scatter: <svg viewBox="0 0 16 16"><circle cx="4" cy="11" r="1.6" /><circle cx="7" cy="5" r="1.6" /><circle cx="11" cy="8" r="1.6" /><circle cx="13" cy="3" r="1.6" /></svg>,
  heatmap: <svg viewBox="0 0 16 16"><rect x="2" y="2" width="4" height="4" fill="currentColor" fillOpacity=".3" /><rect x="6" y="2" width="4" height="4" fill="currentColor" fillOpacity=".7" /><rect x="10" y="2" width="4" height="4" fill="currentColor" /><rect x="2" y="6" width="4" height="4" fill="currentColor" fillOpacity=".6" /><rect x="6" y="6" width="4" height="4" fill="currentColor" fillOpacity=".2" /><rect x="10" y="6" width="4" height="4" fill="currentColor" fillOpacity=".5" /><rect x="2" y="10" width="4" height="4" fill="currentColor" /><rect x="6" y="10" width="4" height="4" fill="currentColor" fillOpacity=".4" /><rect x="10" y="10" width="4" height="4" fill="currentColor" fillOpacity=".15" /></svg>,
  bump: <svg viewBox="0 0 16 16"><path d="M1.5 4h4l5 8h4M1.5 12h4l5-8h4" /></svg>,
};
const CHART_STRIP = CHARTS.filter(c => c !== "bump");

/* ---------- small pieces ---------- */
function Section({ title, hint, add, children }: { title: string; hint?: string; add?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="sh-sec">
      <header className="sh-sec-h"><h4>{title}</h4>{hint && <span className="hint">{hint}</span>}<span className="sh-grow" />{add}</header>
      {children}
    </section>
  );
}

function AddButton({ label = "Add", dataset, columns, exclude, kinds, onPick }: { label?: string; dataset: string; columns: ColumnInfo[]; exclude: string[]; kinds?: ColumnInfo["kind"][]; onPick: (c: ColumnInfo) => void }) {
  const [open, setOpen] = useState(false);
  const formulas = columns.filter(c => c.description !== undefined && !exclude.includes(c.name) && !(kinds && !kinds.includes(c.kind)));
  return (
    <span className="pop-anchor">
      <button type="button" className="btn ghost sm sh-add" onClick={() => setOpen(o => !o)} aria-expanded={open}>{label} ▾</button>
      <Popover open={open} onClose={() => setOpen(false)} anchorClass="right">
        {formulas.length > 0 && (
          <div className="sh-pop-formulas">
            <span className="hint">Formulas</span>
            {formulas.map(c => <button key={c.name} type="button" className="chip-btn" onClick={() => { onPick(c); setOpen(false); }}>ƒ {c.name}</button>)}
          </div>
        )}
        <ColumnPicker dataset={dataset} kinds={kinds} exclude={exclude} onPick={c => { onPick(c); setOpen(false); }} />
      </Popover>
    </span>
  );
}

function Chip({ icon, label, title, onRemove, children }: { icon?: string; label: string; title?: string; onRemove: () => void; children?: React.ReactNode }) {
  return (
    <span className="sh-chip" title={title}>
      {icon && <i className="sh-ic">{icon}</i>}
      <span className="sh-chip-l">{label}</span>
      {children}
      <button type="button" className="sh-x" aria-label={`Remove ${label}`} onClick={onRemove}>×</button>
    </span>
  );
}

/** Text or number input that commits on blur or Enter, so typing does not record an undo step per keystroke. */
function CommitInput({ value, type = "text", placeholder, onCommit }: { value: string; type?: "text" | "number"; placeholder?: string; onCommit: (v: string) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return <input type={type} className="sh-in" value={v} placeholder={placeholder} onChange={e => setV(e.target.value)} onBlur={() => { if (v !== value) onCommit(v); }} onKeyDown={e => { if (e.key === "Enter") { (e.target as HTMLInputElement).blur(); } }} />;
}

/* ---------- the panel ---------- */
export function Organize({ spec, info, rows, table, presets, onChange, onPreset }: OrganizeProps) {
  const [q, setQ] = useState("");
  const [exprTypes, setExprTypes] = useState<Record<string, string>>({});
  const columns = useMemo(() => columnsOf(spec, exprTypes), [spec, exprTypes]);
  const byName = useMemo(() => Object.fromEntries(columns.map(c => [c.name, c])), [columns]);
  const label = (n: string) => byName[n]?.label ?? n;
  const measureLabel = (m: Measure) => m.label ?? (m.col ? `${AGG_LABEL[m.agg]} of ${label(m.col)}` : AGG_LABEL[m.agg]);
  const pivoted = spec.rows.length > 0 || spec.columns.length > 0 || spec.measures.length > 0;

  const distinct = useMemo(() => { const cache = new Map<string, Scalar[] | null>(); return (col: string) => { if (!cache.has(col)) cache.set(col, distinctValues(rows, col)); return cache.get(col)!; }; }, [rows]);

  /* --- field toggles (Numbers-style) --- */
  const used = (n: string) => spec.rows.includes(n) || spec.columns.includes(n) || spec.measures.some(m => m.col === n);
  const removeEverywhere = (s: SheetSpec, n: string): SheetSpec => {
    const ids = s.measures.filter(m => m.col === n).map(m => m.id);
    return { ...s, rows: s.rows.filter(r => r !== n), columns: s.columns.filter(c => c !== n), measures: s.measures.filter(m => m.col !== n), sort: s.sort.filter(x => x.key !== n && !ids.includes(x.key)) };
  };
  const addMeasure = (s: SheetSpec, c: ColumnInfo, agg = defaultAggFor(c)): SheetSpec => {
    if (s.measures.some(m => m.col === c.name && m.agg === agg)) return s;
    return { ...s, measures: [...s.measures, { id: measureId(agg, c.name), col: c.name, agg }], display: undefined };
  };
  const toggleField = (c: ColumnInfo) => onChange(s => {
    if (used(c.name)) return removeEverywhere(s, c.name);
    if (isGroupable(c) && c.kind !== "flag") return { ...s, rows: [...s.rows, c.name], display: undefined };
    return addMeasure(s, c);
  });

  const fields = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return columns.filter(c => !needle || c.label.toLowerCase().includes(needle) || c.name.toLowerCase().includes(needle));
  }, [columns, q]);

  /* --- sort options --- */
  const sortOptions: { key: string; label: string }[] = pivoted
    ? [...spec.rows.map(r => ({ key: r, label: label(r) })), ...spec.measures.map(m => ({ key: m.id, label: measureLabel(m) }))]
    : columns.map(c => ({ key: c.name, label: c.label }));

  /* --- formula editor --- */
  const [fOpen, setFOpen] = useState(false);
  const [fName, setFName] = useState("");
  const [fExpr, setFExpr] = useState("");
  const [fState, setFState] = useState<{ error: string | null; type: string | null }>({ error: null, type: null });
  const examples = useMemo(() => formulaExamples(spec.dataset), [spec.dataset]);
  const fTimer = useRef(0);
  useEffect(() => {
    clearTimeout(fTimer.current);
    if (!fExpr.trim()) { setFState({ error: null, type: null }); return; }
    if (!table) { setFState({ error: "The table is still loading", type: null }); return; }
    const name = fName.trim() || "__formula";
    fTimer.current = window.setTimeout(async () => {
      try {
        const res = (await table.validate_expressions({ [name]: fExpr })) as { expression_schema?: Record<string, string>; errors?: Record<string, { error_message?: string; line?: number; column?: number } | string> };
        const err = res.errors?.[name];
        if (err) { const msg = typeof err === "string" ? err : err.error_message ?? "Invalid expression"; setFState({ error: msg.replace(/\s+/g, " ").trim(), type: null }); }
        else setFState({ error: null, type: res.expression_schema?.[name] ?? "unknown" });
      } catch (e) { setFState({ error: e instanceof Error ? e.message : String(e), type: null }); }
    }, 250);
    return () => clearTimeout(fTimer.current);
  }, [fExpr, fName, table]);
  const fNameTaken = !!fName.trim() && (!!spec.expressions?.[fName.trim()] || info.columns.some(c => c.name === fName.trim()));
  const canAdd = !!fName.trim() && !fNameTaken && !!fExpr.trim() && !fState.error && !!fState.type;
  const addFormula = () => {
    if (!canAdd) return;
    const name = fName.trim(), t = fState.type!;
    setExprTypes(x => ({ ...x, [name]: t }));
    onChange(s => {
      const next: SheetSpec = { ...s, expressions: { ...(s.expressions ?? {}), [name]: fExpr } };
      const numeric = t === "float" || t === "integer";
      const p = s.rows.length > 0 || s.columns.length > 0 || s.measures.length > 0;
      // A ratio summed over rows is rarely what anyone wants, so formulas that divide default to Average
      if (p) { const agg: Agg = !numeric ? "count" : /\//.test(fExpr) ? "avg" : "sum"; next.measures = [...s.measures, { id: measureId(agg, name), col: name, agg }]; }
      else if (s.display?.length) next.display = [...s.display, name];
      return next;
    });
    setFName(""); setFExpr(""); setFOpen(false);
  };
  const removeFormula = (name: string) => onChange(s => {
    const exprs = { ...(s.expressions ?? {}) }; delete exprs[name];
    const r = removeEverywhere(s, name);
    return { ...r, expressions: Object.keys(exprs).length ? exprs : undefined, display: r.display?.filter(d => d !== name), filters: r.filters.filter(f => f.col !== name) };
  });

  /* --- filters --- */
  const setFilter = (i: number, patch: Partial<Filter>) => onChange(s => ({ ...s, filters: s.filters.map((f, j) => (j === i ? { ...f, ...patch } : f)) }));
  const filterValueEditor = (f: Filter, i: number) => {
    if (f.op === "is null" || f.op === "is not null") return null;
    const c = byName[f.col];
    const kind = c?.kind ?? "dimension";
    if (f.op === "in" || f.op === "not in") {
      const text = Array.isArray(f.value) ? f.value.join(", ") : f.value == null ? "" : String(f.value);
      return <CommitInput value={text} placeholder="a, b, c" onCommit={v => setFilter(i, { value: v.split(",").map(x => x.trim()).filter(Boolean).map(x => (kind === "measure" && x !== "" && !isNaN(+x) ? +x : x)) })} />;
    }
    if (f.op === "contains") return <CommitInput value={f.value == null ? "" : String(f.value)} placeholder="text" onCommit={v => setFilter(i, { value: v })} />;
    if (kind === "flag") return <select className="sh-sel" value={f.value === true ? "yes" : f.value === false ? "no" : ""} onChange={e => setFilter(i, { value: e.target.value === "yes" ? true : e.target.value === "no" ? false : null })}><option value="">…</option><option value="yes">Yes</option><option value="no">No</option></select>;
    if (kind === "measure") return <CommitInput type="number" value={f.value == null ? "" : String(f.value)} placeholder="number" onCommit={v => setFilter(i, { value: v === "" ? null : +v })} />;
    const vals = distinct(f.col);
    if (vals && (f.op === "==" || f.op === "!=")) {
      const cur = f.value == null ? "" : String(f.value);
      return (
        <select className="sh-sel" value={cur} onChange={e => { const raw = e.target.value; const m = vals.find(v => String(v) === raw); setFilter(i, { value: raw === "" ? null : m ?? raw }); }}>
          <option value="">…</option>
          {!vals.some(v => String(v) === cur) && cur !== "" && <option value={cur}>{cur}</option>}
          {vals.map(v => <option key={String(v)} value={String(v)}>{String(v)}</option>)}
        </select>
      );
    }
    return <CommitInput value={f.value == null ? "" : String(f.value)} placeholder="value" onCommit={v => setFilter(i, { value: v === "" ? null : c?.type === "integer" || c?.type === "float" ? (isNaN(+v) ? v : +v) : v })} />;
  };

  const activePreset = presets.find(p => specEquals(p.spec, { ...spec, expressions: undefined } as SheetSpec) || specEquals(p.spec, spec));

  return (
    <div className="sh-organize">
      {presets.length > 0 && (
        <section className="sh-sec sh-reco">
          <header className="sh-sec-h"><h4>Recommended</h4></header>
          <div className="sh-reco-strip">
            {presets.map(p => <button key={p.id} type="button" className={`chip-btn ${activePreset?.id === p.id ? "on" : "muted"}`} title={p.question ?? p.name} onClick={() => onPreset(p)}>{p.name}</button>)}
          </div>
        </section>
      )}

      <Section title="Fields" hint={`${columns.length}`}>
        <input type="search" className="sh-search" placeholder="Search fields…" value={q} onChange={e => setQ(e.target.value)} aria-label="Search fields" />
        <ul className="sh-fields" role="list">
          {fields.map(c => (
            <li key={c.name}>
              <label title={c.description ?? `${KIND_NAME[c.kind]} · ${c.name}`}>
                <input type="checkbox" checked={used(c.name)} onChange={() => toggleField(c)} />
                <i className={`sh-ic k-${c.kind}`} aria-hidden>{c.description !== undefined ? "ƒ" : KIND_ICON[c.kind]}</i>
                <span className="sh-field-l">{c.label}</span>
                {c.description !== undefined && <button type="button" className="sh-x" aria-label={`Delete formula ${c.name}`} onClick={e => { e.preventDefault(); removeFormula(c.name); }}>×</button>}
              </label>
            </li>
          ))}
          {!fields.length && <li className="hint sh-empty">Nothing matches.</li>}
        </ul>
      </Section>

      <Section title="Rows" hint="group by" add={<AddButton dataset={spec.dataset} columns={columns} exclude={[...spec.rows, ...spec.columns]} onPick={c => onChange(s => ({ ...s, rows: [...s.rows, c.name], display: undefined }))} />}>
        <div className="sh-chips">
          {spec.rows.map(r => <Chip key={r} icon={KIND_ICON[byName[r]?.kind ?? "dimension"]} label={label(r)} onRemove={() => onChange(s => ({ ...s, rows: s.rows.filter(x => x !== r), sort: s.sort.filter(x => x.key !== r) }))} />)}
          {!spec.rows.length && <span className="hint sh-empty">One row per…</span>}
        </div>
      </Section>

      <Section title="Columns" hint="split by" add={<AddButton dataset={spec.dataset} columns={columns} exclude={[...spec.rows, ...spec.columns]} onPick={c => onChange(s => ({ ...s, columns: [...s.columns, c.name], display: undefined }))} />}>
        <div className="sh-chips">
          {spec.columns.map(r => <Chip key={r} icon={KIND_ICON[byName[r]?.kind ?? "dimension"]} label={label(r)} onRemove={() => onChange(s => ({ ...s, columns: s.columns.filter(x => x !== r) }))} />)}
          {!spec.columns.length && <span className="hint sh-empty">One column per…</span>}
        </div>
      </Section>

      <Section title="Values" hint={pivoted ? "aggregated" : "raw rows"} add={<AddButton dataset={spec.dataset} columns={columns} exclude={[]} onPick={c => onChange(s => addMeasure(s, c))} />}>
        <div className="sh-chips sh-values">
          {spec.measures.map((m, i) => (
            <Chip key={m.id} icon="Σ" label={m.col ? label(m.col) : m.label ?? "Count"} title={m.formula} onRemove={() => onChange(s => ({ ...s, measures: s.measures.filter(x => x.id !== m.id), sort: s.sort.filter(x => x.key !== m.id) }))}>
              {m.col && (
                <select className="sh-sel sh-agg" value={m.agg} aria-label={`Aggregate for ${label(m.col)}`} onChange={e => { const agg = e.target.value as Agg; onChange(s => { const id = measureId(agg, m.col!); return { ...s, measures: s.measures.map((x, j) => (j === i ? { ...x, agg, id } : x)), sort: s.sort.map(x => (x.key === m.id ? { ...x, key: id } : x)) }; }); }}>
                  {AGGS.map(a => <option key={a} value={a}>{AGG_LABEL[a]}</option>)}
                </select>
              )}
            </Chip>
          ))}
          {!spec.measures.length && <span className="hint sh-empty">{pivoted ? "Add a number to aggregate" : "Showing every row; tick a field to pivot"}</span>}
        </div>
      </Section>

      <Section title="Filters" add={<AddButton dataset={spec.dataset} columns={columns} exclude={[]} onPick={c => onChange(s => ({ ...s, filters: [...s.filters, { col: c.name, op: c.kind === "measure" ? ">=" : "==", value: null }] }))} />}>
        <div className="sh-filters">
          {spec.filters.map((f, i) => (
            <div key={`${f.col}-${i}`} className="sh-filter">
              <span className="sh-filter-col" title={f.col}><i className={`sh-ic k-${byName[f.col]?.kind ?? "dimension"}`}>{KIND_ICON[byName[f.col]?.kind ?? "dimension"]}</i>{label(f.col)}</span>
              <select className="sh-sel sh-op" value={f.op} aria-label="Operator" onChange={e => { const op = e.target.value as FilterOp; setFilter(i, { op, value: op === "in" || op === "not in" ? (Array.isArray(f.value) ? f.value : f.value == null ? [] : [f.value]) : Array.isArray(f.value) ? f.value[0] ?? null : f.value }); }}>
                {FILTER_OPS.map(op => <option key={op} value={op}>{OP_LABEL[op]}</option>)}
              </select>
              {filterValueEditor(f, i)}
              <button type="button" className="sh-x" aria-label="Remove filter" onClick={() => onChange(s => ({ ...s, filters: s.filters.filter((_, j) => j !== i) }))}>×</button>
            </div>
          ))}
          {!spec.filters.length && <span className="hint sh-empty">All rows</span>}
        </div>
      </Section>

      <Section title="Sort" add={sortOptions.length > 0 ? <button type="button" className="btn ghost sm sh-add" onClick={() => onChange(s => ({ ...s, sort: [...s.sort, { key: sortOptions.find(o => !s.sort.some(x => x.key === o.key))?.key ?? sortOptions[0].key, dir: "desc" }] }))}>Add</button> : undefined}>
        <div className="sh-sorts">
          {spec.sort.map((srt: Sort, i) => (
            <div key={i} className="sh-sort">
              <select className="sh-sel" value={srt.key} aria-label="Sort by" onChange={e => onChange(s => ({ ...s, sort: s.sort.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)) }))}>
                {!sortOptions.some(o => o.key === srt.key) && <option value={srt.key}>{srt.key}</option>}
                {sortOptions.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
              <button type="button" className="btn ghost sm" title={srt.dir === "desc" ? "Highest first" : "Lowest first"} onClick={() => onChange(s => ({ ...s, sort: s.sort.map((x, j) => (j === i ? { ...x, dir: x.dir === "desc" ? "asc" : "desc" } : x)) }))}>{srt.dir === "desc" ? "↓ 9→1" : "↑ 1→9"}</button>
              <button type="button" className="sh-x" aria-label="Remove sort" onClick={() => onChange(s => ({ ...s, sort: s.sort.filter((_, j) => j !== i) }))}>×</button>
            </div>
          ))}
          {!spec.sort.length && <span className="hint sh-empty">Natural order</span>}
        </div>
      </Section>

      <Section title="Chart">
        <div className="sh-charts" role="radiogroup" aria-label="Chart type">
          {CHART_STRIP.map(c => <button key={c} type="button" role="radio" aria-checked={spec.chart === c} className={`sh-chart ${spec.chart === c ? "on" : ""}`} title={CHART_LABEL[c]} onClick={() => onChange(s => ({ ...s, chart: c }))}>{CHART_ICON[c]}<span>{CHART_LABEL[c]}</span></button>)}
        </div>
      </Section>

      <Section title="Formulas" hint={exprNamesOf(spec).length ? `${exprNamesOf(spec).length}` : undefined} add={<button type="button" className="btn ghost sm sh-add" onClick={() => setFOpen(o => !o)} aria-expanded={fOpen}>ƒ Formula</button>}>
        {exprNamesOf(spec).length > 0 && (
          <div className="sh-chips">
            {exprNamesOf(spec).map(n => <Chip key={n} icon="ƒ" label={n} title={spec.expressions?.[n]} onRemove={() => removeFormula(n)} />)}
          </div>
        )}
        {fOpen && (
          <form className="sh-formula" onSubmit={e => { e.preventDefault(); addFormula(); }}>
            <input type="text" className="sh-in" placeholder="Name, e.g. Points per game" value={fName} onChange={e => setFName(e.target.value)} aria-label="Formula name" />
            <textarea className="sh-in sh-expr mono" rows={3} placeholder={'"pf" / "games_played"'} value={fExpr} onChange={e => setFExpr(e.target.value)} aria-label="Expression" spellCheck={false} />
            <div className={`sh-fstate ${fState.error || fNameTaken ? "err" : fState.type ? "ok" : ""}`}>
              {fNameTaken ? "That name is already a column" : fState.error ? fState.error : fState.type ? `✓ ${fState.type}` : "Column names go in double quotes, text in single quotes."}
            </div>
            <div className="row">
              <button type="submit" className="btn sm" disabled={!canAdd}>Add column</button>
              <button type="button" className="btn ghost sm" onClick={() => { setFOpen(false); setFName(""); setFExpr(""); }}>Cancel</button>
            </div>
            <details className="sh-cheats" open={!fExpr}>
              <summary>Examples</summary>
              <ul>{examples.map(x => <li key={x.name}><button type="button" className="linkbtn" onClick={() => { setFName(x.name); setFExpr(x.expr); }}>{x.name}</button><code>{x.expr}</code><span className="hint">{x.note}</span></li>)}</ul>
            </details>
          </form>
        )}
      </Section>
    </div>
  );
}

const exprNamesOf = (s: SheetSpec) => Object.keys(s.expressions ?? {});
const OP_LABEL: Record<FilterOp, string> = { "==": "is", "!=": "is not", ">": "more than", ">=": "at least", "<": "less than", "<=": "at most", in: "is any of", "not in": "is none of", contains: "contains", "is null": "is empty", "is not null": "is not empty" };
