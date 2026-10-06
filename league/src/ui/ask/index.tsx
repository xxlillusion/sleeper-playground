import { useMemo, useState } from "react";
import { pivot } from "../../view/engine";
import { allPresets } from "../../view/presets";
import { DataGrid } from "../shared/DataGrid";
import { DrillSheet } from "../shared/DrillSheet";
import { ColumnPicker, Popover, PresetPicker } from "../shared/Pickers";
import type { PrototypeProps } from "../types";

/* Prototype A: "Ask the League". This is a scaffold smoke test of the shared pieces; replace it. */
export default function Ask({ rowsById }: PrototypeProps) {
  const preset = allPresets()[1];
  const result = useMemo(() => pivot(rowsById[preset.dataset] ?? [], preset.spec), [rowsById, preset]);
  const [open, setOpen] = useState<"col" | "preset" | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [drill, setDrill] = useState<{ title: string; rows: typeof result.flat } | null>(null);
  return (
    <section style={{ padding: 16, display: "grid", gap: 12 }}>
      <div className="row">
        <span className="pop-anchor"><button className="chip-btn" type="button" onClick={() => setOpen("col")}>+ column</button><Popover open={open === "col"} onClose={() => setOpen(null)}><ColumnPicker dataset="teams" onPick={c => { setPicked(p => [...p, c.label]); setOpen(null); }} /></Popover></span>
        <span className="pop-anchor"><button className="chip-btn muted" type="button" onClick={() => setOpen("preset")}>Views…</button><Popover open={open === "preset"} onClose={() => setOpen(null)}><PresetPicker presets={allPresets()} onPick={p => { setPicked(x => [...x, p.name]); setOpen(null); }} /></Popover></span>
        <span className="hint">{picked.join(" · ")}</span>
      </div>
      <p className="hint">{preset.name}: {result.rowKeys.length} rows × {result.colKeys.length} columns, {result.filteredCount} source rows</p>
      <DataGrid rows={result.flat} columns={["manager", "sum_pf"]} labels={{ sum_pf: "Points for" }} bars={["sum_pf"]} height={360} onCellClick={(row, col) => { const rk = result.rowKeys.find(k => k.values[0] === row.manager); setDrill({ title: `${row.manager} · ${col}`, rows: rk ? result.drill(rk.key) : [] }); }} />
      {drill && <DrillSheet title={drill.title} rows={drill.rows} onClose={() => setDrill(null)} />}
    </section>
  );
}
