import { useEffect, useRef, useState } from "react";
import type { TableDef } from "../data/catalog";

interface Props {
  def: TableDef;
  rows: number;
  onPreset: (i: number) => void;
  onReset: () => void;
  onExport: (what: "dataset-csv" | "dataset-json" | "view-csv" | "view-json") => void;
  onSchema: () => void;
}

export function Toolbar({ def, rows, onPreset, onReset, onExport, onSchema }: Props) {
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!menu.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const pick = (what: Parameters<Props["onExport"]>[0]) => { setOpen(false); onExport(what); };
  return (
    <div className="toolbar">
      <span className="desc"><b>{def.label}</b> · {def.description} <button className="linkbtn" type="button" onClick={onSchema}>Columns</button></span>
      <label className="row" style={{ gap: 6 }}>
        <span className="hint">Quick view</span>
        <select value="" onChange={e => { if (e.target.value !== "") onPreset(+e.target.value); e.target.value = ""; }} aria-label="Quick views">
          <option value="">Choose…</option>
          {def.presets.map((p, i) => <option key={p.name} value={i}>{p.name}</option>)}
        </select>
      </label>
      <button className="btn ghost sm" type="button" onClick={onReset} title="Back to this dataset's default columns">Reset view</button>
      <div className="menu" ref={menu}>
        <button className="btn ghost sm" type="button" onClick={() => setOpen(o => !o)} aria-haspopup="menu" aria-expanded={open}>Export ▾</button>
        {open && (
          <div className="menu-list" role="menu">
            <button role="menuitem" onClick={() => pick("view-csv")}>Current view as CSV</button>
            <button role="menuitem" onClick={() => pick("view-json")}>Current view as JSON</button>
            <button role="menuitem" onClick={() => pick("dataset-csv")}>Whole dataset as CSV ({rows.toLocaleString()} rows)</button>
            <button role="menuitem" onClick={() => pick("dataset-json")}>Whole dataset as JSON</button>
          </div>
        )}
      </div>
    </div>
  );
}
