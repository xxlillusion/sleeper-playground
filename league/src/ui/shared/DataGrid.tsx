/* Virtualized table for raw rows and pivot results: sticky header, click-to-sort, inline bars, colour-scaled cells, optional column chooser. */
import { flexRender, getCoreRowModel, getSortedRowModel, useReactTable, type ColumnDef, type SortingState } from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Row } from "../../perspective/engine";
import { formatValue } from "./format";

export interface DataGridProps {
  rows: Row[];
  /** Columns to show, in order. Defaults to the keys of the first row. */
  columns?: string[];
  /** Header labels per column; defaults to the column name */
  labels?: Record<string, string>;
  /** Columns that get an inline bar sized to the column max (numeric) */
  bars?: string[];
  /** Columns whose cells get a colour scale from min to max (numeric); negative-to-positive uses a diverging scale */
  heat?: string[];
  height?: number | string;
  /** Default sort */
  sort?: { key: string; dir: "asc" | "desc" }[];
  onSortChange?: (sort: { key: string; dir: "asc" | "desc" }[]) => void;
  onCellClick?: (row: Row, col: string, rowIndex: number) => void;
  onRowClick?: (row: Row, rowIndex: number) => void;
  /** Column names that are right-aligned numbers; defaults to "typeof number" on the first row */
  numeric?: string[];
  /** Show a column chooser popover */
  columnChooser?: boolean;
  /** Keep the first column visible while scrolling horizontally */
  pinFirst?: boolean;
  /** Cell renderer override */
  render?: (row: Row, col: string) => React.ReactNode | undefined;
  className?: string;
  emptyText?: string;
}

export function DataGrid(p: DataGridProps) {
  const all = useMemo(() => p.columns?.length ? p.columns : p.rows.length ? Object.keys(p.rows[0]) : [], [p.columns, p.rows]);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [chooser, setChooser] = useState(false);
  const cols = useMemo(() => all.filter(c => !hidden.has(c)), [all, hidden]);
  const numeric = useMemo(() => new Set(p.numeric ?? cols.filter(c => p.rows.some(r => typeof r[c] === "number"))), [p.numeric, cols, p.rows]);
  const stats = useMemo(() => {
    const out: Record<string, { min: number; max: number }> = {};
    for (const c of [...(p.bars ?? []), ...(p.heat ?? [])]) {
      let min = Infinity, max = -Infinity;
      for (const r of p.rows) { const v = r[c]; if (typeof v === "number") { if (v < min) min = v; if (v > max) max = v; } }
      out[c] = { min: isFinite(min) ? min : 0, max: isFinite(max) ? max : 0 };
    }
    return out;
  }, [p.rows, p.bars, p.heat]);

  const [sorting, setSorting] = useState<SortingState>(() => (p.sort ?? []).map(s => ({ id: s.key, desc: s.dir === "desc" })));
  useEffect(() => { setSorting((p.sort ?? []).map(s => ({ id: s.key, desc: s.dir === "desc" }))); }, [p.sort]);

  const columnDefs = useMemo<ColumnDef<Row>[]>(() => cols.map(c => ({
    id: c, accessorFn: r => r[c], header: p.labels?.[c] ?? c, sortUndefined: "last",
    sortingFn: (a, b) => { const x = a.getValue(c) as unknown, y = b.getValue(c) as unknown; if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1; return typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true }); },
  })), [cols, p.labels]);

  const table = useReactTable({
    data: p.rows, columns: columnDefs, state: { sorting }, getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel(),
    onSortingChange: u => { const next = typeof u === "function" ? u(sorting) : u; setSorting(next); p.onSortChange?.(next.map(s => ({ key: s.id, dir: s.desc ? "desc" : "asc" }))); },
  });
  const tableRows = table.getRowModel().rows;
  const scroller = useRef<HTMLDivElement>(null);
  const virt = useVirtualizer({ count: tableRows.length, getScrollElement: () => scroller.current, estimateSize: () => 34, overscan: 12 });
  const items = virt.getVirtualItems();
  const padTop = items.length ? items[0].start : 0, padBottom = items.length ? virt.getTotalSize() - items[items.length - 1].end : 0;

  const cell = (row: Row, c: string) => {
    const custom = p.render?.(row, c); if (custom !== undefined) return custom;
    const v = row[c];
    const text = formatValue(c, v);
    const st = stats[c];
    if (p.bars?.includes(c) && typeof v === "number" && st && st.max > 0) {
      return <span className="dg-bar"><i style={{ width: `${Math.max(1, (v / st.max) * 100)}%` }} /><b>{text}</b></span>;
    }
    return text;
  };
  const cellStyle = (row: Row, c: string): React.CSSProperties | undefined => {
    const v = row[c]; const st = stats[c];
    if (!p.heat?.includes(c) || typeof v !== "number" || !st || st.max === st.min) return undefined;
    if (st.min < 0 && st.max > 0) { const k = v / Math.max(Math.abs(st.min), st.max); return { background: `color-mix(in srgb, ${k >= 0 ? "var(--good)" : "var(--bad)"} ${Math.round(Math.abs(k) * 70)}%, transparent)` }; }
    const k = (v - st.min) / (st.max - st.min); return { background: `color-mix(in srgb, var(--turf) ${Math.round(k * 70)}%, transparent)` };
  };

  return (
    <div className={`dg ${p.className ?? ""}`} style={{ height: p.height ?? "100%" }}>
      {p.columnChooser && (
        <div className="dg-tools">
          <button className="btn ghost sm" type="button" onClick={() => setChooser(o => !o)}>Columns ({cols.length}/{all.length})</button>
          {chooser && <div className="dg-chooser">{all.map(c => <label key={c}><input type="checkbox" checked={!hidden.has(c)} onChange={e => setHidden(h => { const n = new Set(h); if (e.target.checked) n.delete(c); else n.add(c); return n; })} /> {p.labels?.[c] ?? c}</label>)}</div>}
        </div>
      )}
      <div className="dg-scroll" ref={scroller}>
        <table className={`dg-table ${p.pinFirst ? "pin" : ""}`}>
          <thead>
            {table.getHeaderGroups().map(hg => (
              <tr key={hg.id}>{hg.headers.map(h => (
                <th key={h.id} className={numeric.has(h.column.id) ? "num" : ""} onClick={h.column.getToggleSortingHandler()} title="Click to sort" aria-sort={h.column.getIsSorted() === "asc" ? "ascending" : h.column.getIsSorted() === "desc" ? "descending" : "none"}>
                  {flexRender(h.column.columnDef.header, h.getContext())}{h.column.getIsSorted() === "asc" ? " ▲" : h.column.getIsSorted() === "desc" ? " ▼" : ""}
                </th>))}</tr>
            ))}
          </thead>
          <tbody>
            {padTop > 0 && <tr style={{ height: padTop }}><td colSpan={cols.length} /></tr>}
            {items.map(vi => { const r = tableRows[vi.index]; const row = r.original; return (
              <tr key={r.id} data-index={vi.index} ref={virt.measureElement} onClick={p.onRowClick ? () => p.onRowClick!(row, r.index) : undefined} className={p.onRowClick ? "click" : ""}>
                {cols.map(c => <td key={c} className={numeric.has(c) ? "num" : ""} style={cellStyle(row, c)} onClick={p.onCellClick ? e => { e.stopPropagation(); p.onCellClick!(row, c, r.index); } : undefined}>{cell(row, c)}</td>)}
              </tr>); })}
            {padBottom > 0 && <tr style={{ height: padBottom }}><td colSpan={cols.length} /></tr>}
            {!tableRows.length && <tr><td colSpan={Math.max(1, cols.length)} className="dg-empty">{p.emptyText ?? "No rows"}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
