/* "Pivot this": a right-hand sheet (bottom sheet on phones) with Rows / Columns / Values / Filters zones, recommended views,
   a chart-type strip, a custom-metric formula, undo/redo, the spec in the URL, and the live result with drill-through. */
import { useEffect, useMemo, useState } from "react";
import { columnLabel, datasetInfo, type ColumnInfo } from "../../view/catalog";
import { run, SEP, validateFormula, type PivotResult } from "../../view/engine";
import { useSpecHistory } from "../../view/history";
import { defaultSpecFor, presetsFor } from "../../view/presets";
import { AGG_LABEL, AGGS, CHARTS, FILTER_OPS, cloneSpec, measureId, type Agg, type ChartType, type Filter, type FilterOp, type Scalar, type ViewSpec } from "../../view/spec";
import { shareUrl, writeSpec } from "../../view/url";
import { useChartTheme } from "../shared/ChartPalette";
import { DataGrid } from "../shared/DataGrid";
import { ColumnPicker, DatasetPicker, Popover } from "../shared/Pickers";
import { Chart, pivotOption, type ChartClick } from "./Chart";
import { measureLabel, useSite } from "./lib";

const CHART_ICON: Record<ChartType, [string, string]> = { table: ["▦", "Table"], bar: ["▮", "Bars"], line: ["⟋", "Line"], area: ["◢", "Area"], scatter: ["⁘", "Scatter"], heatmap: ["▩", "Heatmap"], bump: ["⤵", "Bump"] };
type Zone = "rows" | "columns" | "values" | "filters" | "dataset" | null;

const parseValue = (text: string, op: FilterOp): Filter["value"] => {
  const one = (s: string): Scalar => { const t = s.trim(); if (t === "") return ""; if (t === "true") return true; if (t === "false") return false; const n = Number(t); return isFinite(n) && /^-?\d+(\.\d+)?$/.test(t) ? n : t; };
  return op === "in" || op === "not in" ? text.split(",").map(one) : one(text);
};
const valueText = (v: Filter["value"]) => (Array.isArray(v) ? v.map(x => String(x ?? "")).join(", ") : v == null ? "" : String(v));
const same = (a: unknown, b: unknown) => (a == null && b == null) || String(a) === String(b);

export function PivotSheet({ initial, onClose }: { initial: ViewSpec; onClose: () => void }) {
  const { rowsById, theme, openDrill, counts } = useSite();
  const h = useSpecHistory(initial);
  const { spec, set, reset } = h;
  useEffect(() => { reset(initial); }, [initial, reset]);
  useEffect(() => { writeSpec(spec); }, [spec]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !(e.target instanceof HTMLInputElement)) { e.preventDefault(); if (e.shiftKey) h.redo(); else h.undo(); } };
    addEventListener("keydown", k); return () => removeEventListener("keydown", k);
  }, [h]);
  const t = useChartTheme(theme);
  const [open, setOpen] = useState<Zone>(null);
  const [copied, setCopied] = useState(false);
  const [formula, setFormula] = useState<{ on: boolean; text: string; label: string }>({ on: false, text: "", label: "" });
  const info = datasetInfo(spec.dataset);
  const rows = rowsById[spec.dataset] ?? [];
  const ds = spec.dataset;
  const close = () => setOpen(null);

  /* ---- edits ---- */
  const addDim = (zone: "rows" | "columns", c: ColumnInfo) => { set(s => ({ ...s, [zone]: [...s[zone], c.name] })); close(); };
  const removeDim = (zone: "rows" | "columns", name: string) => set(s => ({ ...s, [zone]: s[zone].filter(x => x !== name), sort: s.sort.filter(x => x.key !== name) }));
  const addMeasure = (c: ColumnInfo) => {
    set(s => { const agg: Agg = c.kind === "measure" || c.kind === "flag" ? "sum" : "distinct"; const id = measureId(agg, c.name); return s.measures.some(x => x.id === id) ? s : { ...s, measures: [...s.measures, { id, col: c.name, agg }] }; });
    close();
  };
  const setAgg = (i: number, agg: Agg) => set(s => {
    const old = s.measures[i]; if (!old || old.formula) return s;
    const id = measureId(agg, old.col!);
    return { ...s, measures: s.measures.map((x, j) => (j === i ? { ...x, agg, id, label: undefined } : x)), sort: s.sort.map(x => (x.key === old.id ? { ...x, key: id } : x)) };
  });
  const removeMeasure = (i: number) => set(s => { const id = s.measures[i]?.id; return { ...s, measures: s.measures.filter((_, j) => j !== i), sort: s.sort.filter(x => x.key !== id) }; });
  const addFilter = (c: ColumnInfo) => { set(s => ({ ...s, filters: [...s.filters, c.kind === "measure" ? { col: c.name, op: ">=", value: 0 } : { col: c.name, op: "==", value: "" }] })); close(); };
  const setFilter = (i: number, patch: Partial<Filter>) => set(s => ({ ...s, filters: s.filters.map((x, j) => (j === i ? { ...x, ...patch } : x)) }));
  const removeFilter = (i: number) => set(s => ({ ...s, filters: s.filters.filter((_, j) => j !== i) }));
  const formulaErr = formula.text.trim() ? validateFormula(formula.text) : null;
  const addFormula = () => {
    if (!formula.text.trim() || formulaErr) return;
    set(s => ({ ...s, measures: [...s.measures, { id: `f${s.measures.length + 1}_${Date.now().toString(36)}`, agg: "avg", formula: formula.text.trim(), label: formula.label.trim() || formula.text.trim() }] }));
    setFormula({ on: false, text: "", label: "" });
  };
  const copy = () => { navigator.clipboard?.writeText(shareUrl(spec)).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {}); };

  /* ---- result ---- */
  const out = useMemo(() => { try { return { res: run(rows, spec), err: null as string | null }; } catch (e) { return { res: null, err: e instanceof Error ? e.message : String(e) }; } }, [rows, spec]);
  const pv: PivotResult | null = out.res?.kind === "pivot" ? out.res.result : null;
  const raw = out.res?.kind === "raw" ? out.res.rows : null;
  const split = !!pv && (pv.colKeys.length > 1 || (pv.colKeys[0] && pv.colKeys[0].key !== ""));
  const grid = useMemo(() => {
    if (!pv) return { columns: [] as string[], labels: {} as Record<string, string>, bars: [] as string[], heat: [] as string[] };
    const columns = [...spec.rows], labels: Record<string, string> = {}, bars: string[] = [], heat: string[] = [];
    for (const d of spec.rows) labels[d] = columnLabel(ds, d);
    const ml = (id: string) => { const mm = pv.measures.find(x => x.id === id)!; return measureLabel(ds, mm); };
    if (split) {
      for (const ck of pv.colKeys) for (const mm of pv.measures) { const k = `${mm.id}${SEP}${ck.key}`; columns.push(k); labels[k] = `${ck.values.map(v => v ?? "—").join(" · ")}${pv.measures.length > 1 ? ` · ${ml(mm.id)}` : ""}`; heat.push(k); }
      for (const mm of pv.measures) { columns.push(mm.id); labels[mm.id] = `Total ${ml(mm.id)}`; }
    } else pv.measures.forEach((mm, i) => { columns.push(mm.id); labels[mm.id] = ml(mm.id); (i === 0 ? bars : heat).push(mm.id); });
    return { columns, labels, bars, heat };
  }, [pv, spec.rows, ds, split]);
  const option = useMemo(() => (pv && spec.chart !== "table" ? pivotOption(pv, spec.chart, t) : null), [pv, spec.chart, t]);

  const drillCell = (rowKey: string | undefined, colKey: string | undefined, what: string) => {
    if (!pv) return;
    const drilled = pv.drill(rowKey, colKey);
    openDrill({ title: `${what} · ${drilled.length} ${info?.grain ?? "row"}${drilled.length === 1 ? "" : "s"}`, rows: drilled });
  };
  const onCell = (row: Record<string, unknown>, col: string) => {
    if (!pv) return;
    const rk = pv.rowKeys.find(k => k.values.every((v, i) => same(v, row[spec.rows[i]])));
    const i = col.indexOf(SEP);
    const ck = i >= 0 ? col.slice(i + 1) : undefined;
    const label = [rk?.values.map(v => v ?? "—").join(" · "), ck != null ? pv.colKeys.find(k => k.key === ck)?.values.map(v => v ?? "—").join(" · ") : null].filter(Boolean).join(" × ");
    drillCell(rk?.key, ck, label || "All rows");
  };
  const onChartClick = (e: ChartClick) => {
    if (!pv) return;
    if (spec.chart === "heatmap" && Array.isArray(e.value)) { const [xi, yi] = e.value as number[]; const rk = pv.rowKeys[yi], ck = split ? pv.colKeys[xi] : undefined; drillCell(rk?.key, ck?.key, `${rk?.values.join(" · ")}${ck ? ` × ${ck.values.join(" · ")}` : ""}`); return; }
    const rk = pv.rowKeys[e.dataIndex];
    const ck = split ? pv.colKeys.find(k => k.values.map(v => v ?? "—").join(" · ") === e.seriesName || (e.seriesName ?? "").startsWith(k.values.map(v => v ?? "—").join(" · ") + " · ")) : undefined;
    drillCell(rk?.key, ck?.key, [rk?.values.join(" · "), ck?.values.join(" · ")].filter(Boolean).join(" × ") || "All rows");
  };

  const presets = presetsFor(ds);
  const dimKinds: ColumnInfo["kind"][] = ["dimension", "flag", "date", "id"];
  return (
    <>
      <div className="pivot-backdrop" onClick={onClose} />
      <aside className="pivot-sheet" role="dialog" aria-label="Pivot editor">
        <header className="pivot-head">
          <span className="pop-anchor">
            <button className="chip-btn" type="button" onClick={() => setOpen(o => (o === "dataset" ? null : "dataset"))} title="Change dataset">{info?.label ?? ds} ▾</button>
            <Popover open={open === "dataset"} onClose={close}><DatasetPicker counts={counts} onPick={id => { set({ ...defaultSpecFor(id), title: undefined }); close(); }} /></Popover>
          </span>
          <input className="title-in" type="text" value={spec.title ?? ""} placeholder={info?.label ?? "Untitled view"} onChange={e => set(s => ({ ...s, title: e.target.value || undefined }), { record: false })} aria-label="View title" />
          <button className="icon-btn" type="button" onClick={h.undo} disabled={!h.canUndo} title="Undo (Ctrl+Z)">↶</button>
          <button className="icon-btn" type="button" onClick={h.redo} disabled={!h.canRedo} title="Redo (Ctrl+Shift+Z)">↷</button>
          <button className="btn ghost sm" type="button" onClick={copy}>{copied ? "Copied" : "Copy link"}</button>
          <button className="btn sm" type="button" onClick={onClose}>Done</button>
        </header>
        <div className="pivot-body">
          {presets.length > 0 && (
            <div className="strip"><span className="lbl">Recommended</span>{presets.slice(0, 14).map(p => <button key={p.id} className="chip-btn muted" type="button" title={p.question ?? p.name} onClick={() => set({ ...cloneSpec(p.spec), title: p.name })}>{p.name}</button>)}</div>
          )}
          <div className="zones">
            <div className="zone">
              <div className="zone-head"><b>Rows</b><span className="pop-anchor"><button className="chip-btn muted" type="button" onClick={() => setOpen(o => (o === "rows" ? null : "rows"))}>Add ▾</button><Popover open={open === "rows"} onClose={close}><ColumnPicker dataset={ds} kinds={dimKinds} exclude={[...spec.rows, ...spec.columns]} onPick={c => addDim("rows", c)} /></Popover></span></div>
              <div className="zone-chips">{spec.rows.length ? spec.rows.map(c => <span className="zchip" key={c}><span>{columnLabel(ds, c)}</span><button className="x" type="button" onClick={() => removeDim("rows", c)} aria-label="Remove">×</button></span>) : <span className="hint">One row per…</span>}</div>
            </div>
            <div className="zone">
              <div className="zone-head"><b>Columns</b><span className="pop-anchor"><button className="chip-btn muted" type="button" onClick={() => setOpen(o => (o === "columns" ? null : "columns"))}>Add ▾</button><Popover open={open === "columns"} onClose={close} anchorClass="right"><ColumnPicker dataset={ds} kinds={dimKinds} exclude={[...spec.rows, ...spec.columns]} onPick={c => addDim("columns", c)} /></Popover></span></div>
              <div className="zone-chips">{spec.columns.length ? spec.columns.map(c => <span className="zchip" key={c}><span>{columnLabel(ds, c)}</span><button className="x" type="button" onClick={() => removeDim("columns", c)} aria-label="Remove">×</button></span>) : <span className="hint">Split each value by…</span>}</div>
            </div>
            <div className="zone">
              <div className="zone-head"><b>Values</b><span className="row" style={{ gap: 4 }}><button className="chip-btn muted" type="button" onClick={() => setFormula(f => ({ ...f, on: !f.on }))} title="Custom metric from a formula">ƒ</button><span className="pop-anchor"><button className="chip-btn muted" type="button" onClick={() => setOpen(o => (o === "values" ? null : "values"))}>Add ▾</button><Popover open={open === "values"} onClose={close}><ColumnPicker dataset={ds} onPick={addMeasure} /></Popover></span></span></div>
              <div className="zone-chips">{spec.measures.length ? spec.measures.map((mm, i) => (
                <span className="zchip" key={mm.id}>
                  {mm.formula ? <span className="mono" title={mm.formula}>{mm.label ?? mm.formula}</span> : <><select value={mm.agg} onChange={e => setAgg(i, e.target.value as Agg)} aria-label="Aggregate">{AGGS.map(a => <option key={a} value={a}>{AGG_LABEL[a]}</option>)}</select><span>{columnLabel(ds, mm.col!)}</span></>}
                  <button className="x" type="button" onClick={() => removeMeasure(i)} aria-label="Remove">×</button>
                </span>)) : <span className="hint">Count, total, average…</span>}</div>
              {formula.on && (
                <div className="formula">
                  <div className="row"><input type="text" placeholder="sum(pf) / count(season)" value={formula.text} onChange={e => setFormula(f => ({ ...f, text: e.target.value }))} /><input type="text" placeholder="Label" value={formula.label} style={{ maxWidth: 140 }} onChange={e => setFormula(f => ({ ...f, label: e.target.value }))} /><button className="btn sm" type="button" disabled={!formula.text.trim() || !!formulaErr} onClick={addFormula}>Add metric</button></div>
                  {formulaErr ? <span className="err">{formulaErr}</span> : <span className="hint">Use agg(column), e.g. <span className="mono">sum(pf) / sum(pa)</span> or measure ids like <span className="mono">sum_wins</span>.</span>}
                </div>
              )}
            </div>
            <div className="zone">
              <div className="zone-head"><b>Filters</b><span className="pop-anchor"><button className="chip-btn muted" type="button" onClick={() => setOpen(o => (o === "filters" ? null : "filters"))}>Add ▾</button><Popover open={open === "filters"} onClose={close} anchorClass="right"><ColumnPicker dataset={ds} onPick={addFilter} /></Popover></span></div>
              <div className="zone-chips">{spec.filters.length ? spec.filters.map((fl, i) => (
                <span className="zchip" key={i}>
                  <span>{columnLabel(ds, fl.col)}</span>
                  <select value={fl.op} onChange={e => setFilter(i, { op: e.target.value as FilterOp })} aria-label="Operator">{FILTER_OPS.map(o => <option key={o} value={o}>{o}</option>)}</select>
                  {fl.op !== "is null" && fl.op !== "is not null" && <input type="text" value={valueText(fl.value)} onChange={e => setFilter(i, { value: parseValue(e.target.value, fl.op) })} aria-label="Value" />}
                  <button className="x" type="button" onClick={() => removeFilter(i)} aria-label="Remove">×</button>
                </span>)) : <span className="hint">Only rows where…</span>}</div>
            </div>
          </div>

          <div className="pivot-result">
            <div className="meta">
              <span className="chart-strip" role="radiogroup" aria-label="Chart type">{CHARTS.map(c => <button key={c} type="button" role="radio" aria-checked={spec.chart === c} className={spec.chart === c ? "on" : ""} onClick={() => set(s => ({ ...s, chart: c }))}><span className="g">{CHART_ICON[c][0]}</span>{CHART_ICON[c][1]}</button>)}</span>
              {pv && <span>{pv.rowKeys.length.toLocaleString()} row{pv.rowKeys.length === 1 ? "" : "s"}{split ? ` × ${pv.colKeys.length} columns` : ""} from {pv.filteredCount.toLocaleString()} {info?.grain ?? "row"}{pv.filteredCount === 1 ? "" : "s"}</span>}
              {raw && <span>{raw.length.toLocaleString()} {info?.grain ?? "row"}{raw.length === 1 ? "" : "s"}</span>}
              <label>Limit <input type="number" min={0} value={spec.limit ?? ""} placeholder="all" onChange={e => set(s => ({ ...s, limit: e.target.value ? Number(e.target.value) : undefined }))} /></label>
              {spec.sort.length > 0 && <span>Sorted by {spec.sort.map(s => `${grid.labels[s.key] ?? columnLabel(ds, s.key)} ${s.dir === "desc" ? "↓" : "↑"}`).join(", ")}</span>}
            </div>
            {out.err && <div className="msg err">{out.err}</div>}
            {option && <div className="tile flat"><Chart option={option} theme={t} height={320} onClick={onChartClick} /></div>}
            {pv && <DataGrid rows={pv.flat} columns={grid.columns} labels={grid.labels} bars={grid.bars} heat={grid.heat} height={Math.min(Math.max(pv.flat.length, 3) * 34 + 40, 520)} sort={spec.sort} onSortChange={sort => set(s => ({ ...s, sort }))} onCellClick={onCell} pinFirst emptyText="Add a row dimension or a value to start." />}
            {raw && <DataGrid rows={raw} columns={spec.display?.length ? spec.display : info?.columns.slice(0, 12).map(c => c.name)} labels={Object.fromEntries((info?.columns ?? []).map(c => [c.name, c.label]))} height={Math.min(Math.max(raw.length, 3) * 34 + 72, 520)} sort={spec.sort} onSortChange={sort => set(s => ({ ...s, sort }))} columnChooser pinFirst emptyText="No rows match these filters." />}
            {pv && <p className="hint">Click any cell to see the {info?.grain ?? "row"}s behind it. Click a column header to sort.</p>}
          </div>
        </div>
      </aside>
    </>
  );
}
