/* Prototype B: "Stat site". A fantasy stat site first (left nav by subject, KPI tiles, leaderboards, record book, charts);
   pivoting is a mode entered from any section with "Pivot this". Global filter chips apply to every section. */
import { useCallback, useEffect, useMemo, useState } from "react";
import { readSpec, writeSpec } from "../../view/url";
import type { ViewSpec } from "../../view/spec";
import { DrillSheet } from "../shared/DrillSheet";
import type { PrototypeProps } from "../types";
import { FilterBar } from "./FilterBar";
import { PivotSheet } from "./PivotSheet";
import { Games, Managers, Overview, Seasons } from "./pagesLeague";
import { Drafts, Lineups, RawData, Trades } from "./pagesActivity";
import { avatarIndex, PAGES, readPage, SiteContext, writePage, type DrillRequest, type GlobalFilters, type PageId, type SiteCtx } from "./lib";
import "./site.css";

const PAGE: Record<PageId, () => React.JSX.Element> = { overview: Overview, managers: Managers, seasons: Seasons, games: Games, lineups: Lineups, trades: Trades, drafts: Drafts, raw: RawData };

export default function Site({ ds, rowsById, counts, pending, theme }: PrototypeProps) {
  const [page, setPage] = useState<PageId>(readPage);
  const [g, setG] = useState<GlobalFilters>({});
  const [pivot, setPivot] = useState<ViewSpec | null>(readSpec);
  const [drill, setDrill] = useState<DrillRequest | null>(null);
  const avatars = useMemo(() => avatarIndex(ds), [ds]);
  const go = useCallback((p: PageId) => { setPage(p); writePage(p); scrollTo({ top: 0 }); }, []);
  const chip = useCallback((patch: GlobalFilters) => setG(cur => { const next = { ...cur, ...patch }; (Object.keys(next) as (keyof GlobalFilters)[]).forEach(k => { if (next[k] == null) delete next[k]; }); return next; }), []);
  const openPivot = useCallback((spec: ViewSpec) => setPivot(spec), []);
  const closePivot = useCallback(() => { setPivot(null); writeSpec(null); }, []);
  const openDrill = useCallback((d: DrillRequest) => setDrill(d), []);
  const closeDrill = useCallback(() => setDrill(null), []);
  useEffect(() => { document.body.style.overflow = pivot ? "hidden" : ""; return () => { document.body.style.overflow = ""; }; }, [pivot]);

  const ctx: SiteCtx = useMemo(() => ({ ds, rowsById, counts, pending, theme, g, gk: JSON.stringify(g), setG, chip, avatars, openPivot, openDrill, go }), [ds, rowsById, counts, pending, theme, g, chip, avatars, openPivot, openDrill, go]);
  const Page = PAGE[page];
  return (
    <SiteContext.Provider value={ctx}>
      <div className="site">
        <nav className="site-nav" aria-label="Sections">
          <span className="eyebrow">{ds.models[ds.models.length - 1]?.name ?? "League"}</span>
          {PAGES.map(p => <button key={p.id} type="button" className={page === p.id ? "on" : ""} aria-current={page === p.id ? "page" : undefined} onClick={() => go(p.id)}><span className="ic" aria-hidden>{p.icon}</span>{p.label}</button>)}
        </nav>
        <div className="site-main">
          <FilterBar />
          <Page />
        </div>
      </div>
      {pivot && <PivotSheet initial={pivot} onClose={closePivot} />}
      {drill && <DrillSheet title={drill.title} rows={drill.rows} columns={drill.columns} labels={drill.labels} onClose={closeDrill} />}
    </SiteContext.Provider>
  );
}
