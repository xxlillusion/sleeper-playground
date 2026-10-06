/* Lineups, Trades & waivers, Drafts and Raw data pages. */
import { useMemo, useState } from "react";
import type { Row } from "../../perspective/engine";
import { allDatasets, datasetInfo } from "../../view/catalog";
import { pivot } from "../../view/engine";
import { emptySpec, type ViewSpec } from "../../view/spec";
import { useChartTheme } from "../shared/ChartPalette";
import { DataGrid } from "../shared/DataGrid";
import { formatValue } from "../shared/format";
import { DatasetPicker, Popover } from "../shared/Pickers";
import { Chart, pivotOption } from "./Chart";
import { KpiTile, Leaderboard, MiniTable, Pending, Section } from "./components";
import { f, globalFilters, isFiltered, m, topRows, useMedia, useSite, withGlobal, type GlobalFilters } from "./lib";

const L = {
  eff: { ...emptySpec("lineups"), rows: ["manager"], measures: [m("avg", "efficiency_pct", "Lineup efficiency %"), m("count", "week", "Weeks")], filters: [f("week_final", "==", true)], sort: [{ key: "avg_efficiency_pct", dir: "desc" }], chart: "bar" } as ViewSpec,
  lost: { ...emptySpec("lineups"), rows: ["manager"], measures: [m("sum", "would_have_won", "Games lost to lineup"), m("count", "week", "Weeks")], filters: [f("week_final", "==", true)], sort: [{ key: "sum_would_have_won", dir: "desc" }], chart: "bar" } as ViewSpec,
  bench: { ...emptySpec("lineups"), rows: ["manager"], measures: [m("sum", "points_left_on_bench", "Points left on bench"), m("avg", "points_left_on_bench", "Per week")], filters: [f("week_final", "==", true)], sort: [{ key: "sum_points_left_on_bench", dir: "desc" }], chart: "bar" } as ViewSpec,
  perfect: { ...emptySpec("lineups"), rows: ["manager"], measures: [m("sum", "is_perfect", "Perfect lineups"), m("count", "week", "Weeks")], filters: [f("week_final", "==", true)], sort: [{ key: "sum_is_perfect", dir: "desc" }], chart: "bar" } as ViewSpec,
  worst: { ...emptySpec("lineups"), filters: [f("week_final", "==", true)], sort: [{ key: "points_left_on_bench", dir: "desc" }], limit: 25, display: ["season", "week", "manager", "points_left_on_bench", "best_benched_player", "best_benched_points", "worst_started_player", "worst_started_points", "would_have_won"], title: "Worst benchings" } as ViewSpec,
};
const T = {
  grades: { ...emptySpec("trades"), rows: ["manager"], measures: [m("sum", "net_starter_points", "Net starter points"), m("count", "transaction_id", "Trades"), m("avg", "net_starter_points", "Average per trade")], sort: [{ key: "sum_net_starter_points", dir: "desc" }], chart: "bar" } as ViewSpec,
  gradeMix: { ...emptySpec("trades"), rows: ["grade"], measures: [m("count", "transaction_id", "Trades")], sort: [{ key: "grade", dir: "asc" }], chart: "bar", title: "Trade grades" } as ViewSpec,
  best: { ...emptySpec("trades"), sort: [{ key: "net_starter_points", dir: "desc" }], limit: 25, display: ["season", "week", "manager", "partners", "received", "sent", "net_starter_points", "grade"], title: "Best trades" } as ViewSpec,
  worst: { ...emptySpec("trades"), sort: [{ key: "net_starter_points", dir: "asc" }], limit: 25, display: ["season", "week", "manager", "partners", "received", "sent", "net_starter_points", "grade"], title: "Worst trades" } as ViewSpec,
  pickups: { ...emptySpec("pickups"), sort: [{ key: "points_as_starter", dir: "desc" }], limit: 25, display: ["season", "week", "manager", "player_name", "position", "type", "faab_bid", "points_as_starter", "games_started", "points_per_dollar"], title: "Best pickups" } as ViewSpec,
  faab: { ...emptySpec("pickups"), rows: ["manager"], measures: [m("sum", "faab_bid", "FAAB spent"), m("sum", "points_as_starter", "Starter points"), { id: "ppd", agg: "avg", formula: "sum(points_as_starter) / sum(faab_bid)", label: "Points per dollar" }], filters: [f("type", "==", "waiver"), f("faab_bid", ">", 0)], sort: [{ key: "ppd", dir: "desc" }], chart: "scatter" } as ViewSpec,
  overpays: { ...emptySpec("pickups"), filters: [f("overpaid_by", ">", 0)], sort: [{ key: "overpaid_by", dir: "desc" }], limit: 25, display: ["season", "week", "manager", "player_name", "faab_bid", "next_best_bid", "overpaid_by", "competing_bids", "points_as_starter"], title: "Biggest overpays" } as ViewSpec,
};
const D = {
  rounds: { ...emptySpec("draft_picks"), rows: ["round"], measures: [m("avg", "season_points", "Average season points"), m("count", "player_id", "Picks")], filters: [f("is_keeper", "==", false)], sort: [{ key: "round", dir: "asc" }], chart: "bar", title: "Points per round" } as ViewSpec,
  byManager: { ...emptySpec("draft_picks"), rows: ["manager"], measures: [m("avg", "season_points", "Average season points per pick"), m("sum", "season_points_as_starter", "Starter points from draft")], sort: [{ key: "avg_season_points", dir: "desc" }], chart: "bar" } as ViewSpec,
  value: { ...emptySpec("draft_picks"), filters: [f("round", ">=", 5), f("is_keeper", "==", false)], sort: [{ key: "season_points", dir: "desc" }], limit: 25, display: ["season", "round", "pick_no", "manager", "player_name", "position", "season_points", "games_started"], title: "Best value picks (round 5+)" } as ViewSpec,
  busts: { ...emptySpec("draft_picks"), filters: [f("round", "<=", 2), f("season_points", "is not null")], sort: [{ key: "season_points", dir: "asc" }], limit: 25, display: ["season", "round", "pick_no", "manager", "player_name", "position", "season_points", "games_started"], title: "Biggest busts (rounds 1–2)" } as ViewSpec,
  posRound: { ...emptySpec("draft_picks"), rows: ["round"], columns: ["position"], measures: [m("avg", "season_points", "Average season points")], filters: [f("is_keeper", "==", false), f("round", "<=", 10)], sort: [{ key: "round", dir: "asc" }], chart: "heatmap", title: "Points by round and position" } as ViewSpec,
};

const list = (rows: Row[], spec: ViewSpec, g: GlobalFilters, n = 10) =>
  topRows(rows, spec.dataset, spec.sort[0].key, spec.sort[0].dir, [...spec.filters, ...globalFilters(spec.dataset, g)], n);

/* ---------- Lineups ---------- */
export function Lineups() {
  const { rowsById, g, gk, chip } = useSite();
  const lineups = rowsById.lineups ?? [];
  const kpi = useMemo(() => {
    const spec: ViewSpec = { ...emptySpec("lineups"), measures: [m("avg", "efficiency_pct"), m("sum", "is_perfect"), m("sum", "would_have_won"), m("sum", "points_left_on_bench"), m("count", "week")], filters: [f("week_final", "==", true)] };
    return { base: pivot(lineups, spec).grand.values, cur: pivot(lineups, withGlobal(spec, g)).grand.values };
  }, [lineups, gk]); // eslint-disable-line react-hooks/exhaustive-deps
  const worst = useMemo(() => list(lineups, L.worst, g), [lineups, gk]); // eslint-disable-line react-hooks/exhaustive-deps
  const filtered = isFiltered(g);
  return (
    <div className="site-page">
      <div className="page-head"><span className="eyebrow">Lineups</span><h1>Points left on the bench.</h1><p className="hint">Actual points against the best possible lineup each week, and the games that a better lineup would have won.</p></div>
      <div className="grid tiles">
        <KpiTile label="Lineup efficiency" value={kpi.cur.avg_efficiency_pct} unit="%" digits={1} delta={filtered && kpi.cur.avg_efficiency_pct != null && kpi.base.avg_efficiency_pct != null ? kpi.cur.avg_efficiency_pct - kpi.base.avg_efficiency_pct : undefined} deltaLabel="vs league" />
        <KpiTile label="Perfect lineups" value={kpi.cur.sum_is_perfect} foot={kpi.cur.count_week ? `of ${kpi.cur.count_week} weeks` : undefined} />
        <KpiTile label="Games lost to lineup" value={kpi.cur.sum_would_have_won} />
        <KpiTile label="Bench points" value={kpi.cur.sum_points_left_on_bench} />
      </div>
      <div className="grid two">
        <Section title="Lineup efficiency" hint="Actual points as a share of the optimal lineup, averaged per week." spec={L.eff}><Leaderboard spec={L.eff} digits={1} subKey="count_week" subLabel="Weeks" /></Section>
        <Section title="Games lost to lineup" hint="Lost, but the optimal lineup would have won." spec={L.lost}><Leaderboard spec={L.lost} dropZero /></Section>
        <Section title="Points left on bench" spec={L.bench}><Leaderboard spec={L.bench} digits={0} subKey="avg_points_left_on_bench" subLabel="Per week" /></Section>
        <Section title="Perfect lineups" spec={L.perfect}><Leaderboard spec={L.perfect} dropZero subKey="count_week" subLabel="Weeks" /></Section>
      </div>
      <Section title="Worst benchings" hint="The single weeks with the most points left on the bench." spec={L.worst}>
        <MiniTable rows={worst} dataset="lineups" columns={L.worst.display!} bars={["points_left_on_bench"]} onRowClick={r => chip({ manager: g.manager === r.manager ? undefined : String(r.manager) })} />
      </Section>
    </div>
  );
}

/* ---------- Trades & waivers ---------- */
export function Trades() {
  const { rowsById, g, gk, theme, chip } = useSite();
  const t = useChartTheme(theme);
  const trades = rowsById.trades ?? [], pickups = rowsById.pickups ?? [];
  const mix = useMemo(() => pivot(trades, withGlobal(T.gradeMix, g)), [trades, gk]); // eslint-disable-line react-hooks/exhaustive-deps
  const mixOpt = useMemo(() => pivotOption(mix, "bar", t), [mix, t]);
  const best = useMemo(() => list(trades, T.best, g), [trades, gk]); // eslint-disable-line react-hooks/exhaustive-deps
  const worst = useMemo(() => list(trades, T.worst, g), [trades, gk]); // eslint-disable-line react-hooks/exhaustive-deps
  const picks = useMemo(() => list(pickups, T.pickups, g), [pickups, gk]); // eslint-disable-line react-hooks/exhaustive-deps
  const over = useMemo(() => list(pickups, T.overpays, g), [pickups, gk]); // eslint-disable-line react-hooks/exhaustive-deps
  const onRow = (r: Row) => chip({ manager: g.manager === r.manager ? undefined : String(r.manager) });
  return (
    <div className="site-page">
      <div className="page-head"><span className="eyebrow">Trades & waivers</span><h1>Who wins the deals?</h1><p className="hint">Trades are graded by the starter points each side got afterwards. Pickups by what the player scored as a starter for the new team.</p></div>
      <Pending dataset="trades">
        <div className="grid two">
          <Section title="Trade results" hint="Net starter points gained across all trades." spec={T.grades}><Leaderboard spec={T.grades} digits={1} subKey="count_transaction_id" subLabel="Trades" /></Section>
          <Section title="Grade mix" hint="How every trade side was graded." spec={T.gradeMix}><div className="tile flat"><Chart option={mixOpt} theme={t} height={260} /></div></Section>
          <Section title="Best trades" spec={T.best}><MiniTable rows={best} dataset="trades" columns={T.best.display!} bars={["net_starter_points"]} onRowClick={onRow} /></Section>
          <Section title="Worst trades" spec={T.worst}><MiniTable rows={worst} dataset="trades" columns={T.worst.display!} heat={["net_starter_points"]} onRowClick={onRow} /></Section>
        </div>
      </Pending>
      <Pending dataset="pickups">
        <div className="grid two">
          <Section title="Best pickups" hint="Waiver claims and free-agent adds by starter points for the new team." spec={T.pickups}><MiniTable rows={picks} dataset="pickups" columns={T.pickups.display!} bars={["points_as_starter"]} onRowClick={onRow} /></Section>
          <Section title="FAAB efficiency" hint="Starter points per FAAB dollar, waiver claims only." spec={T.faab}><Leaderboard spec={T.faab} valueKey="ppd" digits={2} subKey="sum_faab_bid" subLabel="FAAB spent" /></Section>
          <Section title="Biggest overpays" hint="Winning bid minus the next best bid." spec={T.overpays}><MiniTable rows={over} dataset="pickups" columns={T.overpays.display!} bars={["overpaid_by"]} onRowClick={onRow} /></Section>
        </div>
      </Pending>
    </div>
  );
}

/* ---------- Drafts ---------- */
export function Drafts() {
  const { rowsById, g, gk, theme, chip } = useSite();
  const t = useChartTheme(theme);
  const picks = rowsById.draft_picks ?? [];
  const rounds = useMemo(() => pivot(picks, withGlobal(D.rounds, g)), [picks, gk]); // eslint-disable-line react-hooks/exhaustive-deps
  const roundsOpt = useMemo(() => pivotOption(rounds, "bar", t), [rounds, t]);
  const pos = useMemo(() => pivot(picks, withGlobal(D.posRound, g)), [picks, gk]); // eslint-disable-line react-hooks/exhaustive-deps
  const posOpt = useMemo(() => pivotOption(pos, "heatmap", t), [pos, t]);
  const value = useMemo(() => list(picks, D.value, g), [picks, gk]); // eslint-disable-line react-hooks/exhaustive-deps
  const busts = useMemo(() => list(picks, D.busts, g), [picks, gk]); // eslint-disable-line react-hooks/exhaustive-deps
  const onRow = (r: Row) => chip({ manager: g.manager === r.manager ? undefined : String(r.manager) });
  return (
    <div className="site-page">
      <div className="page-head"><span className="eyebrow">Drafts</span><h1>Where the value was.</h1><p className="hint">Season points per draft round, who drafts best, and the steals and busts.</p></div>
      <Pending dataset="draft_picks">
        <div className="grid two">
          <Section title="Points per round" hint="Average season points of the players taken in each round (keepers excluded)." spec={D.rounds}><div className="tile flat"><Chart option={roundsOpt} theme={t} height={260} /></div></Section>
          <Section title="Best drafters" hint="Average season points per pick." spec={D.byManager}><Leaderboard spec={D.byManager} digits={1} subKey="sum_season_points_as_starter" subLabel="Starter points" /></Section>
          <Section title="Best value picks" hint="Round 5 or later, by season points." spec={D.value}><MiniTable rows={value} dataset="draft_picks" columns={D.value.display!} bars={["season_points"]} onRowClick={onRow} /></Section>
          <Section title="Biggest busts" hint="First two rounds, fewest season points." spec={D.busts}><MiniTable rows={busts} dataset="draft_picks" columns={D.busts.display!} bars={["season_points"]} onRowClick={onRow} /></Section>
        </div>
        <Section title="Round × position" hint="Average season points by round and position, first ten rounds." spec={D.posRound}><div className="tile flat"><Chart option={posOpt} theme={t} height={Math.max(260, 32 * pos.rowKeys.length + 90)} /></div></Section>
      </Pending>
    </div>
  );
}

/* ---------- Raw data ---------- */
export function RawData() {
  const { rowsById, counts, pending, g, gk, openPivot } = useSite();
  const [dataset, setDataset] = useState("teams");
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const narrow = useMedia("(max-width: 640px)");
  const [cards, setCards] = useState<boolean | null>(null);
  const useCards = cards ?? narrow;
  const info = datasetInfo(dataset);
  const base = rowsById[dataset] ?? [];
  const rows = useMemo(() => {
    const flt = globalFilters(dataset, g);
    let out = flt.length ? base.filter(r => flt.every(x => String(r[x.col]) === String(x.value))) : base;
    const needle = q.trim().toLowerCase();
    if (needle) out = out.filter(r => Object.values(r).some(v => v != null && String(v).toLowerCase().includes(needle)));
    return out;
  }, [base, dataset, gk, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const columns = useMemo(() => info?.columns.map(c => c.name) ?? [], [info]);
  const labels = useMemo(() => Object.fromEntries((info?.columns ?? []).map(c => [c.name, c.label])), [info]);
  const [shown, setShown] = useState(100);
  return (
    <div className="site-page">
      <div className="page-head"><span className="eyebrow">Raw data</span><h1>Every table, every row.</h1><p className="hint">{allDatasets().length} datasets built from the league. Pick one, search it, hide columns, or open it in the pivot editor.</p></div>
      <div className="raw-tools">
        <span className="pop-anchor">
          <button className="chip-btn" type="button" onClick={() => setOpen(o => !o)}>{info?.label ?? dataset} · {(counts[dataset] ?? 0).toLocaleString()} ▾</button>
          <Popover open={open} onClose={() => setOpen(false)}><DatasetPicker counts={counts} onPick={id => { setDataset(id); setOpen(false); setShown(100); }} /></Popover>
        </span>
        <input type="text" placeholder="Quick filter…" value={q} onChange={e => { setQ(e.target.value); setShown(100); }} aria-label="Quick filter" />
        <span className="seg"><button type="button" className={!useCards ? "on" : ""} onClick={() => setCards(false)}>Table</button><button type="button" className={useCards ? "on" : ""} onClick={() => setCards(true)}>Cards</button></span>
        <button className="pivot-btn" type="button" onClick={() => openPivot({ ...emptySpec(dataset), filters: globalFilters(dataset, g), display: columns.slice(0, 12), title: info?.label })}>⊞ Pivot this</button>
        <span className="hint">{rows.length.toLocaleString()} of {base.length.toLocaleString()} {info?.grain ?? "row"}s{info ? ` · one row per ${info.grain}` : ""}</span>
      </div>
      {pending[dataset] && <div className="msg">{pending[dataset] === "off" ? "This dataset is switched off in the loader settings." : `Not ready yet: ${pending[dataset]}.`}</div>}
      {useCards ? (
        <div className="cards">
          {rows.slice(0, shown).map((r, i) => <div className="tile card" key={i}><dl>{columns.slice(0, 6).map(c => <span key={c} style={{ display: "contents" }}><dt>{labels[c]}</dt><dd>{formatValue(c, r[c]) || "—"}</dd></span>)}</dl></div>)}
          {rows.length > shown && <button className="btn ghost sm" type="button" onClick={() => setShown(s => s + 100)}>Show {Math.min(100, rows.length - shown)} more</button>}
          {!rows.length && <div className="tile empty">No rows match.</div>}
        </div>
      ) : (
        <DataGrid rows={rows} columns={columns} labels={labels} height="min(70vh, 760px)" columnChooser pinFirst emptyText="No rows match." />
      )}
    </div>
  );
}
