/* Bottom sheet listing the raw rows behind a number, with CSV export. */
import { useEffect } from "react";
import type { Row } from "../../perspective/engine";
import { downloadText } from "../../lib/download";
import { DataGrid } from "./DataGrid";
import { toCsv } from "./format";

export interface DrillSheetProps {
  title: string;
  rows: Row[];
  columns?: string[];
  labels?: Record<string, string>;
  onClose: () => void;
  /** Extra actions rendered in the header, e.g. "Filter to this" */
  actions?: React.ReactNode;
}

export function DrillSheet({ title, rows, columns, labels, onClose, actions }: DrillSheetProps) {
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; addEventListener("keydown", k); return () => removeEventListener("keydown", k); }, [onClose]);
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <section className="sheet" role="dialog" aria-label={title} onClick={e => e.stopPropagation()}>
        <header className="row" style={{ justifyContent: "space-between" }}>
          <div><h3>{title}</h3><span className="hint">{rows.length.toLocaleString()} row{rows.length === 1 ? "" : "s"}</span></div>
          <span className="row">
            {actions}
            <button className="btn ghost sm" type="button" onClick={() => downloadText(toCsv(rows, columns), "rows.csv", "text/csv")}>CSV</button>
            <button className="btn ghost sm" type="button" onClick={onClose}>Close</button>
          </span>
        </header>
        <div className="sheet-body"><DataGrid rows={rows} columns={columns} labels={labels} columnChooser pinFirst /></div>
      </section>
    </div>
  );
}
