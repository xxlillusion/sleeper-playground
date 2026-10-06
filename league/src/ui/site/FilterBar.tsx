/* Global filter chips: season, manager, week kind. Every section applies them where the column exists. */
import { useMemo, useState } from "react";
import { Popover } from "../shared/Pickers";
import { isFiltered, useSite, type WeekKind } from "./lib";
import { Avatar } from "./components";

const KINDS: { id: WeekKind; label: string }[] = [{ id: "regular", label: "Regular season" }, { id: "playoff", label: "Playoffs" }, { id: "consolation", label: "Consolation" }];

export function FilterBar() {
  const { g, setG, chip, rowsById } = useSite();
  const [open, setOpen] = useState<null | "season" | "manager" | "kind">(null);
  const seasons = useMemo(() => [...new Set((rowsById.teams ?? []).map(r => Number(r.season)))].sort((a, b) => b - a), [rowsById]);
  const managers = useMemo(() => (rowsById.managers ?? []).map(r => String(r.display_name)).sort((a, b) => a.localeCompare(b)), [rowsById]);
  const close = () => setOpen(null);
  return (
    <div className="site-filters">
      <span className="lbl">Filters</span>
      {g.season != null && <button className="chip-btn" type="button" onClick={() => chip({ season: undefined })} title="Remove">Season {g.season} <span className="x">×</span></button>}
      {g.manager && <button className="chip-btn" type="button" onClick={() => chip({ manager: undefined })} title="Remove">{g.manager} <span className="x">×</span></button>}
      {g.weekKind && <button className="chip-btn" type="button" onClick={() => chip({ weekKind: undefined })} title="Remove">{KINDS.find(k => k.id === g.weekKind)?.label} <span className="x">×</span></button>}
      <span className="pop-anchor">
        <button className="chip-btn muted" type="button" onClick={() => setOpen(o => (o === "season" ? null : "season"))}>{g.season != null ? "Change season" : "+ Season"} ▾</button>
        <Popover open={open === "season"} onClose={close}><div className="site-menu">{seasons.map(s => <button key={s} type="button" onClick={() => { chip({ season: s }); close(); }}>{s}</button>)}</div></Popover>
      </span>
      <span className="pop-anchor">
        <button className="chip-btn muted" type="button" onClick={() => setOpen(o => (o === "manager" ? null : "manager"))}>{g.manager ? "Change manager" : "+ Manager"} ▾</button>
        <Popover open={open === "manager"} onClose={close}><div className="site-menu">{managers.map(mn => <button key={mn} type="button" onClick={() => { chip({ manager: mn }); close(); }}><Avatar name={mn} />{mn}</button>)}</div></Popover>
      </span>
      <span className="pop-anchor">
        <button className="chip-btn muted" type="button" onClick={() => setOpen(o => (o === "kind" ? null : "kind"))}>{g.weekKind ? "Change week kind" : "+ Week kind"} ▾</button>
        <Popover open={open === "kind"} onClose={close}><div className="site-menu">{KINDS.map(k => <button key={k.id} type="button" onClick={() => { chip({ weekKind: k.id }); close(); }}>{k.label}</button>)}</div></Popover>
      </span>
      {isFiltered(g) && <button className="btn ghost sm" type="button" onClick={() => setG({})}>Clear</button>}
      {!isFiltered(g) && <span className="hint">Click any manager, season or chart point to filter the whole page.</span>}
    </div>
  );
}
