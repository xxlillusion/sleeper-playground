import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { UiSwitcher } from "./ui/switcher";
import { readUi, writeUi, type UiName } from "./view/url";

const PROTOTYPES = { ask: lazy(() => import("./ui/ask")), site: lazy(() => import("./ui/site")), sheet: lazy(() => import("./ui/sheet")) };
import type { Table } from "@perspective-dev/client";
import type { HTMLPerspectiveViewerElement, ViewerConfig, ViewerConfigUpdate } from "@perspective-dev/viewer";
import { cacheClear } from "./api/cache";
import { clearMemo, onStats, stats } from "./api/sleeper";
import { TABLES, tableById } from "./data/catalog";
import { loadLeague, loadPlayers, loadTransactions, type LeagueDataset, type Progress } from "./data/load";
import { DatasetTabs } from "./components/DatasetTabs";
import { PerspectiveView } from "./components/PerspectiveView";
import { ProgressBar } from "./components/Progress";
import { Toolbar } from "./components/Toolbar";
import { TopBar } from "./components/TopBar";
import { downloadText, slug } from "./lib/download";
import { useTheme } from "./lib/theme";
import { clearView, loadDataset, loadExtraIds, loadPrefs, loadView, saveDataset, saveExtraIds, saveLastId, savePrefs, saveView, type Prefs } from "./lib/viewStore";
import { putTable, tableToCsv, type Row } from "./perspective/engine";

const idFromUrl = () => new URLSearchParams(location.search).get("id")?.trim() || "";
const EXAMPLE = "1376759225572675584";

export function App() {
  const theme = useTheme();
  const [id, setId] = useState(idFromUrl);
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const [extraIds, setExtraIds] = useState<string[]>(() => loadExtraIds(idFromUrl()));
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [progress, setProgress] = useState<Progress | null>(null);
  const [bg, setBg] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ds, setDs] = useState<LeagueDataset | null>(null);
  const [version, setVersion] = useState(0);                  // bumps when ds gains transactions or player names
  const [datasetId, setDatasetId] = useState<string>(() => loadDataset(idFromUrl()) || TABLES[0].id);
  // The table on screen and the config for it always change together, so the viewer never restores a config against the wrong table.
  const [view, setView] = useState<{ table: Table; name: string; datasetId: string; config: ViewerConfigUpdate } | null>(null);
  const [requests, setRequests] = useState({ network: 0, cached: 0 });
  const [schemaOpen, setSchemaOpen] = useState(false);
  const [ui, setUi] = useState<UiName>(readUi);
  const switchUi = (u: UiName) => { writeUi(u); setUi(u); };
  const viewer = useRef<HTMLPerspectiveViewerElement | null>(null);
  const loadToken = useRef(0);

  useEffect(() => onStats(() => setRequests({ network: stats.network, cached: stats.cached })), []);

  /* ---- loading ---- */
  const load = useCallback(async (leagueId: string, fresh = false) => {
    const token = ++loadToken.current;
    if (fresh) clearMemo();
    setStatus("loading"); setError(null); setBg(null); setDs(null); setView(null);
    setProgress({ phase: "state", message: "Starting", done: 0, total: 1 });
    try {
      const data = await loadLeague(leagueId, { ...prefs, extraLeagueIds: loadExtraIds(leagueId) }, p => { if (token === loadToken.current) setProgress(p); });
      if (token !== loadToken.current) return;
      setDs(data); setVersion(v => v + 1); setStatus("ready");
      loadPlayers(data).then(() => { if (token === loadToken.current) setVersion(v => v + 1); });
      if (prefs.includeTransactions) {
        loadTransactions(data, p => { if (token === loadToken.current) setBg(p); })
          .then(() => { if (token === loadToken.current) { setVersion(v => v + 1); setBg({ phase: "done", message: "Transactions loaded", done: 1, total: 1 }); } })
          .catch(e => setBg({ phase: "done", message: `Transactions failed: ${e instanceof Error ? e.message : e}`, done: 1, total: 1 }));
      }
    } catch (e) {
      if (token !== loadToken.current) return;
      setStatus("error"); setError(e instanceof Error ? e.message : String(e));
    }
  }, [prefs]);

  useEffect(() => { if (id) load(id); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  const go = (leagueId: string) => {
    const url = new URL(location.href); url.searchParams.set("id", leagueId); history.pushState(null, "", url);
    saveLastId(leagueId);
    setExtraIds(loadExtraIds(leagueId));
    setDatasetId(loadDataset(leagueId) || TABLES[0].id);
    if (leagueId === id) load(leagueId, true); else setId(leagueId);
  };
  useEffect(() => {
    const onPop = () => { const next = idFromUrl(); if (next !== id) setId(next); };
    addEventListener("popstate", onPop);
    return () => removeEventListener("popstate", onPop);
  }, [id]);

  /* ---- rows for every dataset, rebuilt when the dataset gains data ---- */
  const rowsById = useMemo(() => {
    const out: Record<string, Row[]> = {};
    if (!ds) return out;
    for (const t of TABLES) { try { out[t.id] = t.build({ ds }); } catch (e) { console.error(`build ${t.id}`, e); out[t.id] = []; } }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ds, version]);
  const counts = useMemo(() => Object.fromEntries(Object.entries(rowsById).map(([k, v]) => [k, v.length])), [rowsById]);
  // Handy for poking at the data from the console
  useEffect(() => { (window as unknown as { __league?: unknown }).__league = ds ? { ds, rows: rowsById } : undefined; }, [ds, rowsById]);
  const pending = useMemo(() => {
    const p: Record<string, string | null> = {};
    for (const t of TABLES) p[t.id] = !ds ? null : t.requires === "transactions" && !ds.txLoaded ? (prefs.includeTransactions ? "loading" : "off") : t.requires === "drafts" && !ds.draftsLoaded ? "off" : t.requires === "players" && !ds.players ? "names loading" : null;
    return p;
  }, [ds, version, prefs.includeTransactions]);

  /* ---- the Perspective table for the selected dataset ---- */
  const def = tableById(datasetId) ?? TABLES[0];
  useEffect(() => {
    if (!ds) return;
    let live = true;
    const rows = rowsById[def.id] ?? [];
    const root = ds.rootId;
    saveDataset(root, def.id);
    putTable(def.id, def.schema, rows).then(({ table: t, tableName, old }) => {
      if (!live) { t.delete({ lazy: true }).catch(() => {}); return; }
      // The saved config is always current because every change is written as it happens
      setView({ table: t, name: tableName, datasetId: def.id, config: loadView(root, def.id) ?? { ...def.defaultView } });
      if (old) setTimeout(() => old.delete({ lazy: true }).catch(() => {}), 1500);
    }).catch(e => { console.error("table", e); setError(`Perspective could not load ${def.label}: ${e instanceof Error ? e.message : e}`); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowsById, def.id]);

  // Save under the dataset the viewer is showing (the table name carries it), not whichever tab is selected by the time the debounce fires
  const onConfigChange = useCallback((c: ViewerConfig) => {
    if (!ds) return;
    const { group_by_depth, version: _v, settings: _s, table: tableName, ...rest } = c;
    const datasetId = tableName?.split("#")[0];
    if (!datasetId || !tableById(datasetId)) return;
    saveView(ds.rootId, datasetId, { ...rest, group_by_depth: group_by_depth ?? undefined });
  }, [ds]);
  const applyPreset = (i: number) => {
    const p = def.presets[i]; if (!p || !view || view.datasetId !== def.id) return;
    const c = { ...p.config }; setView({ ...view, config: c }); if (ds) saveView(ds.rootId, def.id, c);
  };
  const resetView = () => { if (!view || view.datasetId !== def.id) return; if (ds) clearView(ds.rootId, def.id); setView({ ...view, config: { ...def.defaultView } }); };

  const exportIt = async (what: "dataset-csv" | "dataset-json" | "view-csv" | "view-json") => {
    const base = `${slug(ds?.models[ds.models.length - 1]?.name || "league")}-${def.id}`;
    try {
      if (what === "dataset-json") downloadText(JSON.stringify(rowsById[def.id] ?? [], null, 0), `${base}.json`, "application/json");
      else if (what === "dataset-csv" && view) downloadText(await tableToCsv(view.table), `${base}.csv`, "text/csv");
      else if (what === "view-csv" && viewer.current) await viewer.current.download({ method: "csv" });
      else if (what === "view-json" && viewer.current) await viewer.current.download({ method: "json" });
    } catch (e) { setError(`Export failed: ${e instanceof Error ? e.message : e}`); }
  };

  const updatePrefs = (p: Prefs) => { setPrefs(p); savePrefs(p); };
  const updateExtra = (ids: string[]) => { setExtraIds(ids); if (id) saveExtraIds(id, ids); };

  const busy = status === "loading";
  return (
    <div className="app">
      <TopBar id={id} ds={ds} busy={busy} prefs={prefs} extraIds={extraIds} requests={requests}
        onLoad={go} onRefresh={() => load(id, true)} onClearCache={() => { cacheClear(); }} onPrefs={updatePrefs} onExtraIds={updateExtra} />
      {(busy || (progress && progress.phase !== "done")) && <div className="bar"><ProgressBar p={progress} /></div>}
      {bg && bg.phase !== "done" && <div className="bar"><ProgressBar p={bg} label="Background" /></div>}
      {error && <div className="bar"><div className="msg err">{error}</div></div>}
      {!id && status === "idle" && (
        <section className="land">
          <h2>Every number from every season of one league, ready to pivot.</h2>
          <p className="hint">Paste a Sleeper league id above. The page follows <span className="mono">previous_league_id</span> back through every renewed season and turns the results into flat tables you can group, filter, chart and export.</p>
          <ul>
            <li><b>Teams</b>: the standings for every season, with luck, all-play record and final rank.</li>
            <li><b>Games</b> and <b>Weekly scores</b>: every matchup and every weekly score, including bracket games.</li>
            <li><b>Managers</b>: all-time records, titles, tenure and streaks per Sleeper account.</li>
            <li><b>Player weeks</b>: who each team started and benched each week and what they scored.</li>
            <li><b>Transactions</b>, <b>Draft picks</b>, <b>Brackets</b>, <b>Seasons</b> and <b>Scoring rules</b>.</li>
          </ul>
          <p className="hint">Try it: <a href={`?id=${EXAMPLE}`} onClick={e => { e.preventDefault(); go(EXAMPLE); }}>{EXAMPLE}</a>. Where do I find my league id? Open the league in Sleeper's web app; it is the long number in the address bar. The <a href="/">explorer</a> also shows it once you pick a league.</p>
        </section>
      )}
      {ds && <div className="bar"><UiSwitcher value={ui} onChange={switchUi} /></div>}
      {ds && ui === "classic" && (
        <>
          <DatasetTabs tables={TABLES} selected={def.id} counts={counts} pending={pending} onSelect={setDatasetId} />
          <Toolbar def={def} rows={counts[def.id] ?? 0} onPreset={applyPreset} onReset={resetView} onExport={exportIt} onSchema={() => setSchemaOpen(true)} />
        </>
      )}
      {ui === "classic" && (
        <div className="viewer" hidden={!ds}>
          <PerspectiveView tableName={view?.name ?? null} config={view?.config ?? null} theme={theme} onConfigChange={onConfigChange} onReady={el => { viewer.current = el; }} />
        </div>
      )}
      {ds && ui !== "classic" && (() => { const Proto = PROTOTYPES[ui]; return (
        <Suspense fallback={<div className="bar"><span className="hint"><span className="spin" />Loading the {ui} prototype…</span></div>}>
          <Proto ds={ds} rowsById={rowsById} counts={counts} pending={pending} theme={theme} />
        </Suspense>
      ); })()}
      {ds && ds.warnings.length > 0 && (
        <details className="warn">
          <summary>{ds.warnings.length} request{ds.warnings.length === 1 ? "" : "s"} failed and {ds.warnings.length === 1 ? "was" : "were"} skipped</summary>
          <ul>{ds.warnings.map((w, i) => <li key={i}><span className="mono">{w.endpoint}</span>: {w.message}</li>)}</ul>
        </details>
      )}
      {ds && ui === "classic" && (
        <p className="foot hint">
          Managers are matched by Sleeper account, so a renamed team stays one person. Sleeper only reports who owned each roster at season's end. Wins and losses in Games are worked out from final scores, so they can differ by a game from Sleeper's own standings (shown in Teams) when a score was corrected after the week closed, or in leagues with a median game. Past seasons are cached in this browser; the current season is refetched on every load.
        </p>
      )}
      {schemaOpen && (
        <dialog open className="schema" onClose={() => setSchemaOpen(false)}>
          <div className="row" style={{ justifyContent: "space-between" }}><h3>{def.label}: columns</h3><button className="btn ghost sm" onClick={() => setSchemaOpen(false)}>Close</button></div>
          <p className="hint">One row per {def.grain}.</p>
          <div className="cols">{Object.entries(def.schema).map(([k, t]) => <span key={k}><span className="mono">{k}</span> <span className="pill">{t}</span></span>)}</div>
        </dialog>
      )}
    </div>
  );
}
