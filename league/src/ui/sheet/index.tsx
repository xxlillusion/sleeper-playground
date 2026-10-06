/* Prototype C: "Sheet". Perspective stays the engine, grid and charts; a React Organize panel drives it, Numbers-style. */
import type { Table } from "@perspective-dev/client";
import type { HTMLPerspectiveViewerElement, PerspectiveClickEventDetail, ViewerConfig } from "@perspective-dev/viewer";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PerspectiveView } from "../../components/PerspectiveView";
import { TABLES, tableById } from "../../data/catalog";
import { downloadText, slug } from "../../lib/download";
import { putTable, tableToCsv, type Row } from "../../perspective/engine";
import { allDatasets, columnLabel, datasetInfo } from "../../view/catalog";
import { filterIndices } from "../../view/engine";
import { useSpecHistory } from "../../view/history";
import { fromPerspective } from "../../view/perspective";
import { allPresets, defaultSpecFor, presetsFor, type PresetView } from "../../view/presets";
import { cloneSpec, specEquals, type Filter, type FilterOp, type Scalar } from "../../view/spec";
import { readSpec, shareUrl, writeSpec } from "../../view/url";
import { DrillSheet } from "../shared/DrillSheet";
import { Popover, PresetPicker } from "../shared/Pickers";
import type { PrototypeProps } from "../types";
import { Organize } from "./Organize";
import { allColumnsOf, buildConfig, labelsFor, loadPanelOpen, loadViews, normConfig, normalizeSpec, savePanelOpen, saveViews, type SavedView, type SheetSpec } from "./model";
import "./sheet.css";

const initialSpec = (): SheetSpec => {
  const s = readSpec() as SheetSpec | null;
  return s && tableById(s.dataset) ? s : defaultSpecFor(TABLES[0].id);
};
const inEditable = (t: EventTarget | null) => { const el = t as HTMLElement | null; return !!el && (el.closest?.("input, textarea, select, [contenteditable], perspective-viewer") != null); };

export default function Sheet({ ds, rowsById, counts, pending, theme }: PrototypeProps) {
  const h = useSpecHistory(initialSpec());
  const spec = h.spec as SheetSpec;
  const setSpec = h.set;
  const specRef = useRef(spec); specRef.current = spec;
  const info = datasetInfo(spec.dataset) ?? datasetInfo(TABLES[0].id)!;
  const rows = rowsById[spec.dataset] ?? [];

  const [view, setView] = useState<{ table: Table; name: string; datasetId: string } | null>(null);
  const viewRef = useRef(view); viewRef.current = view;
  const viewer = useRef<HTMLPerspectiveViewerElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(loadPanelOpen);
  const [palette, setPalette] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [views, setViews] = useState<SavedView[]>(() => loadViews(ds.rootId));
  const [drill, setDrill] = useState<{ title: string; rows: Row[]; filters: Filter[] } | null>(null);
  const lastByDataset = useRef<Record<string, SheetSpec>>({});

  /* ---- URL and per-dataset memory ---- */
  useEffect(() => { writeSpec(spec); lastByDataset.current[spec.dataset] = spec; }, [spec]);
  useEffect(() => { savePanelOpen(panelOpen); }, [panelOpen]);

  /* ---- one Perspective Table per dataset, rebuilt when the rows change ---- */
  useEffect(() => {
    const def = tableById(spec.dataset); if (!def) return;
    let live = true;
    putTable(def.id, def.schema, rowsById[def.id] ?? []).then(({ table, tableName, old }) => {
      if (!live) { table.delete({ lazy: true }).catch(() => {}); return; }
      setView({ table, name: tableName, datasetId: def.id }); setError(null);
      if (old) setTimeout(() => old.delete({ lazy: true }).catch(() => {}), 1500);
    }).catch(e => { console.error("table", e); setError(`Perspective could not load ${def.label}: ${e instanceof Error ? e.message : e}`); });
    return () => { live = false; };
  }, [rowsById, spec.dataset]);

  /* ---- spec -> viewer config; remember what we sent so echoes are not mistaken for user edits ---- */
  const lastSent = useRef("");
  const config = useMemo(() => {
    if (!view || view.datasetId !== spec.dataset) return null;
    const c = buildConfig(spec); lastSent.current = normConfig(c); return c;
  }, [spec, view]);

  /* ---- viewer -> spec, when the user edits inside Perspective (sort click, settings drawer, …) ---- */
  const onConfigChange = useCallback((c: ViewerConfig) => {
    const v = viewRef.current; if (!v || c.table !== v.name) return;
    if (normConfig(c) === lastSent.current) return;
    const cur = specRef.current;
    const next = fromPerspective(v.datasetId, { ...c, group_by_depth: c.group_by_depth ?? undefined }, tableById(v.datasetId)?.schema) as SheetSpec;
    const exprs = Object.fromEntries(Object.entries(c.expressions ?? {}).filter((e): e is [string, string] => typeof e[1] === "string"));
    if (Object.keys(exprs).length) next.expressions = exprs;
    if (cur.limit) next.limit = cur.limit;
    if (cur.title && !next.title) next.title = cur.title;
    for (const m of next.measures) { const o = cur.measures.find(x => x.id === m.id); if (o?.label) m.label = o.label; }
    if (next.display && !cur.display && next.display.join() === allColumnsOf(cur).join()) next.display = undefined;
    if (specEquals(next, cur)) return;
    setSpec(next, { record: true });
  }, [setSpec]);

  /* ---- drill-through: a click on a pivot cell shows the raw rows behind it ---- */
  const onClick = useCallback((e: Event) => {
    const d = (e as CustomEvent<PerspectiveClickEventDetail>).detail;
    const cur = specRef.current, v = viewRef.current; if (!d || !v || v.datasetId !== cur.dataset) return;
    const schema = tableById(cur.dataset)?.schema ?? {};
    const coerce = (col: string, value: unknown): Scalar => {
      const t = schema[col];
      if (value == null) return null;
      if (t === "integer" || t === "float") return typeof value === "number" ? value : Number(value);
      if (t === "boolean") return typeof value === "boolean" ? value : String(value) === "true";
      return value as Scalar;
    };
    let fs: Filter[] = [];
    if (cur.rows.length || cur.columns.length) {
      const seen = new Set<string>();
      for (const f of (d.config?.filter ?? []) as unknown as [string, string, unknown][]) {
        const [col, op, value] = f;
        if (!(cur.rows.includes(col) || cur.columns.includes(col)) || seen.has(col)) continue;
        if (op === "==") { seen.add(col); fs.push({ col, op: "==", value: coerce(col, value) }); }
        else if (op === "is null") { seen.add(col); fs.push({ col, op: "is null" }); }
      }
      if (!fs.length && Array.isArray(d.row?.__ROW_PATH__)) fs = (d.row.__ROW_PATH__ as unknown[]).map((value, i) => ({ col: cur.rows[i], op: (value == null ? "is null" : "==") as FilterOp, value: coerce(cur.rows[i], value) })).filter(f => f.col);
    } else {
      fs = Object.entries(d.row ?? {}).filter(([k]) => schema[k] !== undefined).map(([col, value]) => (value == null ? { col, op: "is null" as FilterOp } : { col, op: "==" as FilterOp, value: coerce(col, value) }));
    }
    if (!fs.length) return;
    const all = rowsById[cur.dataset] ?? [];
    const idx = filterIndices(all, [...cur.filters, ...fs]);
    const part = (f: Filter) => `${columnLabel(cur.dataset, f.col)}: ${f.op === "is null" ? "empty" : String(f.value)}`;
    const title = cur.rows.length || cur.columns.length ? fs.map(part).join(" · ") : `Row · ${fs.slice(0, 3).map(part).join(" · ")}`;
    setDrill({ title, rows: idx.map(i => all[i]), filters: fs });
  }, [rowsById]);
  const onClickRef = useRef(onClick); onClickRef.current = onClick;

  const onReady = useCallback((el: HTMLPerspectiveViewerElement) => {
    viewer.current = el;
    el.toggleConfig(false).catch(() => {});
    el.addEventListener("perspective-click", e => onClickRef.current(e));
  }, []);

  /* ---- actions ---- */
  const selectDataset = (id: string) => { if (id === spec.dataset) return; setSpec(lastByDataset.current[id] ?? defaultSpecFor(id)); };
  const applyPreset = (p: PresetView) => { setSpec(cloneSpec(p.spec)); setPalette(false); };
  const saveView = () => {
    const name = prompt("Name this view", spec.title ?? `${info.label} view`)?.trim(); if (!name) return;
    const s: SheetSpec = { ...spec, title: name };
    const next = [...views.filter(v => v.name !== name), { id: `${Date.now().toString(36)}`, name, spec: s }];
    setViews(next); saveViews(ds.rootId, next); setSpec(s);
  };
  const deleteView = (id: string) => { const next = views.filter(v => v.id !== id); setViews(next); saveViews(ds.rootId, next); };
  const copyLink = async () => { try { await navigator.clipboard.writeText(shareUrl(spec)); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { prompt("Copy this link", shareUrl(spec)); } };
  const exportIt = async (what: "view-csv" | "view-json" | "dataset-csv" | "dataset-json") => {
    setExportOpen(false);
    const base = `${slug(ds.models[ds.models.length - 1]?.name || "league")}-${spec.dataset}`;
    try {
      if (what === "view-csv" && viewer.current) await viewer.current.download({ method: "csv" });
      else if (what === "view-json" && viewer.current) await viewer.current.download({ method: "json" });
      else if (what === "dataset-csv" && view) downloadText(await tableToCsv(view.table), `${base}.csv`, "text/csv");
      else if (what === "dataset-json") downloadText(JSON.stringify(rows), `${base}.json`, "application/json");
    } catch (e) { setError(`Export failed: ${e instanceof Error ? e.message : e}`); }
  };
  const toggleSettings = () => { const next = !settingsOpen; setSettingsOpen(next); viewer.current?.toggleConfig(next).catch(() => {}); };
  const filterToDrill = () => { if (!drill) return; const fs = drill.filters; setSpec(s => ({ ...s, filters: [...s.filters.filter(f => !fs.some(x => x.col === f.col)), ...fs] })); setDrill(null); };

  /* ---- keyboard: ⌘K views, ⌘Z / ⌘⇧Z undo and redo ---- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") { e.preventDefault(); setPalette(p => !p); return; }
      if (e.key === "Escape") { setPalette(false); setExportOpen(false); return; }
      if (!mod || inEditable(e.target)) return;
      if (e.key.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) h.redo(); else h.undo(); }
      else if (e.key.toLowerCase() === "y") { e.preventDefault(); h.redo(); }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [h]);

  const presets = useMemo(() => presetsFor(spec.dataset), [spec.dataset]);
  const labels = useMemo(() => labelsFor(spec.dataset), [spec.dataset]);
  const activeView = views.find(v => specEquals(v.spec, spec));
  const panelProps = { spec, info, rows, table: view?.datasetId === spec.dataset ? view.table : null, presets, onChange: (fn: (s: SheetSpec) => SheetSpec) => setSpec(s => normalizeSpec(fn(s as SheetSpec))), onPreset: applyPreset };

  return (
    <div className="sh-root">
      <div className="sh-tabs" role="tablist" aria-label="Datasets and saved views">
        {allDatasets().map(d => (
          <button key={d.id} type="button" role="tab" className="sh-tab" aria-selected={d.id === spec.dataset && !activeView} onClick={() => selectDataset(d.id)} title={d.description}>
            {d.label}<span className="n">{(counts[d.id] ?? 0).toLocaleString()}</span>{pending[d.id] && <span className="pill amber">{pending[d.id]}</span>}
          </button>
        ))}
        {views.length > 0 && <span className="sh-tab-sep" aria-hidden />}
        {views.map(v => (
          <span key={v.id} className={`sh-tab sh-pinned ${activeView?.id === v.id ? "on" : ""}`} role="tab" aria-selected={activeView?.id === v.id} tabIndex={0} onClick={() => setSpec(cloneSpec(v.spec))} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSpec(cloneSpec(v.spec)); } }} title={`${datasetInfo(v.spec.dataset)?.label ?? v.spec.dataset} · saved view`}>
            <i aria-hidden>📌</i>{v.name}
            <button type="button" className="sh-x" aria-label={`Delete saved view ${v.name}`} onClick={e => { e.stopPropagation(); if (confirm(`Delete the saved view "${v.name}"?`)) deleteView(v.id); }}>×</button>
          </span>
        ))}
      </div>

      <div className="sh-toolbar">
        <div className="sh-title">
          <h3>{spec.title ?? info.label}</h3>
          <span className="hint">{info.label} · one row per {info.grain} · {rows.length.toLocaleString()} rows</span>
        </div>
        <span className="sh-grow" />
        <button type="button" className="btn ghost sm" onClick={h.undo} disabled={!h.canUndo} title="Undo (Ctrl+Z)">↶ Undo</button>
        <button type="button" className="btn ghost sm" onClick={h.redo} disabled={!h.canRedo} title="Redo (Ctrl+Shift+Z)">↷ Redo</button>
        <button type="button" className="btn ghost sm" onClick={() => setPalette(true)} title="Ready-made views and questions (Ctrl+K)">Views <kbd>⌘K</kbd></button>
        <button type="button" className="btn ghost sm" onClick={saveView}>Save view</button>
        <button type="button" className="btn ghost sm" onClick={copyLink}>{copied ? "Copied!" : "Copy link"}</button>
        <span className="pop-anchor">
          <button type="button" className="btn ghost sm" onClick={() => setExportOpen(o => !o)} aria-expanded={exportOpen}>Export ▾</button>
          <Popover open={exportOpen} onClose={() => setExportOpen(false)} anchorClass="right">
            <div className="sh-menu">
              <button type="button" onClick={() => exportIt("view-csv")}>This view as CSV</button>
              <button type="button" onClick={() => exportIt("view-json")}>This view as JSON</button>
              <button type="button" onClick={() => exportIt("dataset-csv")}>Whole {info.label} dataset as CSV</button>
              <button type="button" onClick={() => exportIt("dataset-json")}>Whole {info.label} dataset as JSON</button>
            </div>
          </Popover>
        </span>
        <button type="button" className={`btn ghost sm ${settingsOpen ? "on" : ""}`} onClick={toggleSettings} title="Perspective's own settings drawer, for power users">{settingsOpen ? "Hide" : "Show"} Perspective settings</button>
        <button type="button" className={`btn sm ${panelOpen ? "" : "ghost"}`} onClick={() => setPanelOpen(o => !o)} aria-pressed={panelOpen} aria-controls="sh-panel">Organize</button>
      </div>

      {error && <div className="sh-error msg err">{error}</div>}

      <div className={`sh-body ${panelOpen ? "with-panel" : ""}`}>
        <div className="sh-canvas">
          <PerspectiveView tableName={view?.name ?? null} config={config} theme={theme} onConfigChange={onConfigChange} onReady={onReady} />
          {!view && <div className="sh-loading hint"><span className="spin" />Building {info.label}…</div>}
        </div>
        <aside id="sh-panel" className="sh-panel" hidden={!panelOpen} aria-label="Organize">
          <header className="sh-panel-h"><h3>Organize</h3><span className="hint">{info.label}</span><span className="sh-grow" /><button type="button" className="sh-x" aria-label="Close Organize panel" onClick={() => setPanelOpen(false)}>×</button></header>
          <Organize {...panelProps} />
        </aside>
        {!panelOpen && <button type="button" className="sh-fab btn" onClick={() => setPanelOpen(true)}>Organize</button>}
      </div>

      {palette && (
        <div className="sh-palette-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setPalette(false); }}>
          <div className="sh-palette" role="dialog" aria-label="Views">
            <PresetPicker presets={allPresets()} onPick={applyPreset} />
          </div>
        </div>
      )}

      {drill && (
        <DrillSheet title={drill.title} rows={drill.rows} columns={Object.keys(info.def.schema)} labels={labels} onClose={() => setDrill(null)}
          actions={<button type="button" className="btn sm" onClick={filterToDrill}>Filter to this</button>} />
      )}
    </div>
  );
}
