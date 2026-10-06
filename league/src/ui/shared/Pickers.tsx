/* Searchable pickers built on cmdk: columns of a dataset (grouped by kind), datasets, and ready-made views. */
import { Command } from "cmdk";
import { useEffect, useRef } from "react";
import { allDatasets, datasetInfo, type ColKind, type ColumnInfo } from "../../view/catalog";
import type { PresetView } from "../../view/presets";

const KIND_LABEL: Record<ColKind, string> = { dimension: "Group by", measure: "Numbers", flag: "Yes / no", date: "Dates", id: "IDs" };
const KIND_ORDER: ColKind[] = ["dimension", "measure", "flag", "date", "id"];

interface PopoverProps { open: boolean; onClose: () => void; children: React.ReactNode; anchorClass?: string }
/** A small floating panel that closes on outside click or Escape. Position it with CSS relative to a wrapper with class "pop-anchor". */
export function Popover({ open, onClose, children, anchorClass }: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const click = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", click); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", click); document.removeEventListener("keydown", key); };
  }, [open, onClose]);
  if (!open) return null;
  return <div className={`pop ${anchorClass ?? ""}`} ref={ref}>{children}</div>;
}

export interface ColumnPickerProps {
  dataset: string;
  /** Limit to these kinds; default all */
  kinds?: ColKind[];
  exclude?: string[];
  onPick: (col: ColumnInfo) => void;
  placeholder?: string;
  autoFocus?: boolean;
}
export function ColumnPicker({ dataset, kinds, exclude = [], onPick, placeholder = "Search columns…", autoFocus = true }: ColumnPickerProps) {
  const info = datasetInfo(dataset);
  const groups = KIND_ORDER.filter(k => !kinds || kinds.includes(k)).map(k => ({ k, cols: (info?.columns ?? []).filter(c => c.kind === k && !exclude.includes(c.name)) })).filter(g => g.cols.length);
  return (
    <Command className="cmd" label="Pick a column">
      <Command.Input placeholder={placeholder} autoFocus={autoFocus} className="cmd-input" />
      <Command.List className="cmd-list">
        <Command.Empty className="cmd-empty">Nothing matches.</Command.Empty>
        {groups.map(g => (
          <Command.Group key={g.k} heading={KIND_LABEL[g.k]} className="cmd-group">
            {g.cols.map(c => <Command.Item key={c.name} value={`${c.label} ${c.name}`} onSelect={() => onPick(c)} className="cmd-item"><span>{c.label}</span><span className="mono hint">{c.name}</span></Command.Item>)}
          </Command.Group>
        ))}
      </Command.List>
    </Command>
  );
}

export function DatasetPicker({ onPick, counts }: { onPick: (id: string) => void; counts?: Record<string, number> }) {
  return (
    <Command className="cmd" label="Pick a dataset">
      <Command.Input placeholder="Search datasets…" autoFocus className="cmd-input" />
      <Command.List className="cmd-list">
        <Command.Empty className="cmd-empty">Nothing matches.</Command.Empty>
        {allDatasets().map(d => <Command.Item key={d.id} value={`${d.label} ${d.description}`} onSelect={() => onPick(d.id)} className="cmd-item"><span><b>{d.label}</b> <span className="hint">{d.description}</span></span>{counts && <span className="mono hint">{(counts[d.id] ?? 0).toLocaleString()}</span>}</Command.Item>)}
      </Command.List>
    </Command>
  );
}

export function PresetPicker({ presets, onPick }: { presets: PresetView[]; onPick: (p: PresetView) => void }) {
  const groups = [...new Set(presets.map(p => p.group))];
  return (
    <Command className="cmd" label="Pick a view">
      <Command.Input placeholder="Search views and questions…" autoFocus className="cmd-input" />
      <Command.List className="cmd-list">
        <Command.Empty className="cmd-empty">Nothing matches.</Command.Empty>
        {groups.map(g => (
          <Command.Group key={g} heading={g} className="cmd-group">
            {presets.filter(p => p.group === g).map(p => <Command.Item key={p.id} value={`${p.name} ${p.question ?? ""} ${g}`} onSelect={() => onPick(p)} className="cmd-item"><span>{p.name}</span>{p.question && <span className="hint">{p.question}</span>}</Command.Item>)}
          </Command.Group>
        ))}
      </Command.List>
    </Command>
  );
}
