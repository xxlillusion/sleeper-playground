/* Overview, Managers, Seasons and Games pages. Each section is a ViewSpec (or a small custom computation) rendered by the shared blocks. */
import { useMemo } from "react";
import type { Row } from "../../perspective/engine";
import { pivot } from "../../view/engine";
import { emptySpec, type ViewSpec } from "../../view/spec";
import { useChartTheme } from "../shared/ChartPalette";
import { formatValue } from "../shared/format";
import { axisStyle, Chart, gridStyle, pivotOption, tooltipStyle } from "./Chart";
import { Avatar, KpiTile, Leaderboard, MiniTable, PercentileBars, RecordCard, Section, type RecordCardProps } from "./components";
import { f, fmt, globalFilters, isFiltered, m, num, topRows, useSite, withGlobal, type GlobalFilters } from "./lib";

const FINAL = [f("week_final", "==", true), f("points", ">", 0)];
const SCORE_COLS = ["season", "week", "manager", "team", "points", "opp_manager", "opp_points", "result", "week_rank"];
const GAME_COLS = ["season", "week", "label", "manager", "points", "opp_manager", "opp_points", "margin"];

/* ---------- specs shared by pages ---------- */
const S = {
  points: { ...emptySpec("teams"), rows: ["manager"], measures: [m("sum", "pf", "Points for"), m("sum", "pa", "Points against")], sort: [{ key: "sum_pf", dir: "desc" }], chart: "bar" } as ViewSpec,
  wins: { ...emptySpec("teams"), rows: ["manager"], measures: [m("sum", "wins", "Wins"), m("sum", "losses", "Losses")], sort: [{ key: "sum_wins", dir: "desc" }], chart: "bar" } as ViewSpec,
  titles: { ...emptySpec("managers"), rows: ["display_name"], measures: [m("sum", "titles", "Titles"), m("sum", "runner_ups", "Runner-ups"), m("sum", "last_places", "Last places")], sort: [{ key: "sum_titles", dir: "desc" }, { key: "sum_runner_ups", dir: "desc" }], chart: "bar" } as ViewSpec,
  avgScore: { ...emptySpec("weekly_scores"), rows: ["manager"], measures: [m("avg", "points", "Average score"), m("count", "points", "Weeks")], filters: FINAL, sort: [{ key: "avg_points", dir: "desc" }], chart: "bar" } as ViewSpec,
  winPct: { ...emptySpec("managers"), rows: ["display_name"], measures: [m("any", "reg_win_pct", "Win %"), m("any", "reg_record", "Record")], sort: [{ key: "any_reg_win_pct", dir: "desc" }], chart: "bar" } as ViewSpec,
  ppg: { ...emptySpec("managers"), rows: ["display_name"], measures: [m("any", "reg_ppg", "Points per game")], sort: [{ key: "any_reg_ppg", dir: "desc" }], chart: "bar" } as ViewSpec,
  playoffs: { ...emptySpec("managers"), rows: ["display_name"], measures: [m("sum", "playoff_appearances", "Playoff appearances"), m("any", "playoff_rate", "Playoff rate")], sort: [{ key: "sum_playoff_appearances", dir: "desc" }], chart: "bar" } as ViewSpec,
  luck: { ...emptySpec("teams"), rows: ["manager"], measures: [m("sum", "luck", "Luck (wins above expected)"), m("sum", "expected_wins", "Expected wins")], filters: [f("is_complete", "==", true)], sort: [{ key: "sum_luck", dir: "desc" }], chart: "bar" } as ViewSpec,
  allPlay: { ...emptySpec("teams"), rows: ["manager"], measures: [m("avg", "all_play_pct", "All-play win %")], sort: [{ key: "avg_all_play_pct", dir: "desc" }], chart: "bar" } as ViewSpec,
  bump: { ...emptySpec("teams"), rows: ["season"], columns: ["manager"], measures: [m("min", "final_rank", "Final rank")], filters: [f("is_complete", "==", true)], sort: [{ key: "season", dir: "asc" }], chart: "bump", title: "Final rank by season" } as ViewSpec,
  h2h: { ...emptySpec("h2h"), rows: ["manager"], columns: ["opponent"], measures: [m("sum", "wins", "Wins")], chart: "heatmap", title: "Head-to-head wins" } as ViewSpec,
  trend: { ...emptySpec("weekly_scores"), rows: ["season"], measures: [m("avg", "points", "Average score"), m("max", "points", "Top score"), m("min", "points", "Lowest score")], filters: FINAL, sort: [{ key: "season", dir: "asc" }], chart: "line", title: "Scoring by season" } as ViewSpec,
  standings: { ...emptySpec("teams"), sort: [{ key: "season", dir: "desc" }, { key: "final_rank", dir: "asc" }], display: ["season", "final_rank", "manager", "team", "record", "pf", "pa", "luck", "all_play_pct", "efficiency_pct", "sos_rank", "playoff_finish"] } as ViewSpec,
  highScores: { ...emptySpec("weekly_scores"), filters: FINAL, sort: [{ key: "points", dir: "desc" }], limit: 25, display: SCORE_COLS, title: "Highest scores" } as ViewSpec,
  lowScores: { ...emptySpec("weekly_scores"), filters: FINAL, sort: [{ key: "points", dir: "asc" }], limit: 25, display: SCORE_COLS, title: "Lowest scores" } as ViewSpec,
  blowouts: { ...emptySpec("games"), filters: [f("won", "==", true)], sort: [{ key: "margin", dir: "desc" }], limit: 25, display: GAME_COLS, title: "Biggest blowouts" } as ViewSpec,
  closest: { ...emptySpec("games"), filters: [f("won", "==", true), f("margin", ">", 0)], sort: [{ key: "margin", dir: "asc" }], limit: 25, display: GAME_COLS, title: "Closest games" } as ViewSpec,
  weekly: { ...emptySpec("weekly_scores"), rows: ["week"], columns: ["manager"], measures: [m("sum", "points", "Points")], filters: FINAL, sort: [{ key: "week", dir: "asc" }], chart: "line", title: "Points by week" } as ViewSpec,
};

/* ---------- Overview ---------- */
export function Overview() {
  const { rowsById, g, gk, chip, pending } = useSite();
  const teams = rowsById.teams ?? [], weekly = rowsById.weekly_scores ?? [], games = rowsById.games ?? [], seasons = rowsById.seasons ?? [];
  const kpi = useMemo(() => {
    const score: ViewSpec = { ...emptySpec("weekly_scores"), measures: [m("avg", "points"), m("max", "points"), m("count", "points")], filters: FINAL };
    const base = pivot(weekly, score).grand.values, cur = pivot(weekly, withGlobal(score, g)).grand.values;
    const n = (ds: string, rows: Row[], col: string) => pivot(rows, withGlobal({ ...emptySpec(ds), measures: [m("distinct", col)] }, g)).grand.values[`distinct_${col}`];
    return { base, cur, seasons: n("teams", teams, "season"), games: n("games", games, "game_id"), managers: n("teams", teams, "manager") };
  }, [weekly, teams, games, gk]); // eslint-disable-line react-hooks/exhaustive-deps
  const champs = useMemo(() => [...seasons].filter(r => r.champion).sort((a, b) => Number(a.season) - Number(b.season)), [seasons]);
  const records = useRecords(g, gk);
  const filtered = isFiltered(g);
  return (
    <div className="site-page">
      <div className="page-head"><span className="eyebrow">League overview</span><h1>Every season, one page.</h1><p className="hint">Headline numbers, the champions, all-time leaderboards and the record book. Click a name to filter everything; press “Pivot this” on any section to make it your own.</p></div>
      <div className="grid tiles">
        <KpiTile label="Seasons" value={kpi.seasons} />
        <KpiTile label="Games" value={kpi.games} />
        <KpiTile label="Managers" value={kpi.managers} />
        <KpiTile label="Average score" value={kpi.cur.avg_points} digits={1} delta={filtered && kpi.cur.avg_points != null && kpi.base.avg_points != null ? kpi.cur.avg_points - kpi.base.avg_points : undefined} deltaLabel="vs league" />
        <KpiTile label="Highest score" value={kpi.cur.max_points} digits={2} />
        <KpiTile label="Team-weeks" value={kpi.cur.count_points} />
      </div>
      <Section title="Champions" hint="One card per season. Click a season to filter the page to it.">
        <div className="timeline">
          {champs.map(r => { const s = Number(r.season), who = String(r.champion); const on = g.season === s, dim = (g.manager && g.manager !== who) || (g.season != null && !on); return (
            <div key={s} className={`tile champ ${on ? "on" : ""} ${dim ? "dim" : ""}`} onClick={() => chip({ season: on ? undefined : s })} title={`Filter to ${s}`}>
              <div className="yr">{s}{r.is_complete === false && <span className="pill amber" style={{ marginLeft: 6 }}>live</span>}</div>
              <div className="who"><Avatar name={who} /><span>{who}</span></div>
              <div className="sub">{String(r.champion_record ?? "")}{r.runner_up ? ` · over ${r.runner_up}` : ""}</div>
            </div>); })}
          {!champs.length && <div className="tile empty">No finished seasons yet.</div>}
        </div>
      </Section>
      <div className="grid two">
        <Section title="All-time points" hint="Points for, every season added up." spec={S.points}><Leaderboard spec={S.points} digits={2} /></Section>
        <Section title="All-time wins" hint="Regular season and playoffs, as Sleeper counts them." spec={S.wins}><Leaderboard spec={S.wins} subKey="sum_losses" subLabel="Losses" /></Section>
        <Section title="Titles" hint="Championships per manager (all seasons)." spec={S.titles}><Leaderboard spec={S.titles} dropZero subKey="sum_runner_ups" subLabel="Runner-ups" /></Section>
        <Section title="Average score" hint="Per week, final weeks only." spec={S.avgScore}><Leaderboard spec={S.avgScore} digits={1} subKey="count_points" subLabel="Weeks" /></Section>
      </div>
      <Section title="Record book" hint={filtered ? "Records within the current filters." : "All-time records. “See it” opens the rows behind each one."}>
        <div className="grid records">{records.map(r => <RecordCard key={r.title} {...r} />)}</div>
        {pending.trades && <p className="hint">Trade and pickup records appear once transactions finish loading.</p>}
      </Section>
    </div>
  );
}

function useRecords(g: GlobalFilters, gk: string): RecordCardProps[] {
  const { rowsById, pending } = useSite();
  return useMemo(() => {
    const out: RecordCardProps[] = [];
    const weekly = rowsById.weekly_scores ?? [], games = rowsById.games ?? [], teams = rowsById.teams ?? [], lineups = rowsById.lineups ?? [], pw = rowsById.player_weeks ?? [];
    const gf = (d: string) => globalFilters(d, g);
    const one = (rows: Row[], ds: string, key: string, dir: "asc" | "desc", extra = [] as ReturnType<typeof f>[]) => topRows(rows, ds, key, dir, [...gf(ds), ...extra], 1)[0];
    const weekOf = (r: Row) => `${r.season} · Week ${r.week}`;
    const sameWeek = (rows: Row[], r: Row) => rows.filter(x => x.season === r.season && x.week === r.week);
    const hi = one(weekly, "weekly_scores", "points", "desc", FINAL);
    if (hi) out.push({ title: "Highest score", value: fmt(hi.points, 2), who: String(hi.manager), when: weekOf(hi), sub: `vs ${hi.opp_manager ?? "—"} (${fmt(hi.opp_points, 2)})`, rows: topRows(sameWeek(weekly, hi), "weekly_scores", "points", "desc", [], 0), columns: SCORE_COLS, drillTitle: `Week ${hi.week}, ${hi.season}: every score` });
    const lo = one(weekly, "weekly_scores", "points", "asc", FINAL);
    if (lo) out.push({ title: "Lowest score", value: fmt(lo.points, 2), who: String(lo.manager), when: weekOf(lo), sub: `vs ${lo.opp_manager ?? "—"} (${fmt(lo.opp_points, 2)})`, rows: topRows(sameWeek(weekly, lo), "weekly_scores", "points", "asc", [], 0), columns: SCORE_COLS, drillTitle: `Week ${lo.week}, ${lo.season}: every score` });
    const blow = one(games, "games", "margin", "desc", [f("won", "==", true)]);
    if (blow) out.push({ title: "Biggest blowout", value: `+${fmt(blow.margin, 2)}`, who: String(blow.manager), when: `${blow.season} · ${blow.label || `Week ${blow.week}`}`, sub: `${fmt(blow.points, 2)}–${fmt(blow.opp_points, 2)} over ${blow.opp_manager}`, rows: games.filter(x => x.game_id === blow.game_id), columns: GAME_COLS });
    const close = one(games, "games", "margin", "asc", [f("won", "==", true), f("margin", ">", 0)]);
    if (close) out.push({ title: "Closest game", value: `+${fmt(close.margin, 2)}`, who: String(close.manager), when: `${close.season} · ${close.label || `Week ${close.week}`}`, sub: `${fmt(close.points, 2)}–${fmt(close.opp_points, 2)} over ${close.opp_manager}`, rows: games.filter(x => x.game_id === close.game_id), columns: GAME_COLS });
    const streak = one(teams, "teams", "longest_win_streak", "desc");
    if (streak && num(streak.longest_win_streak)) out.push({ title: "Longest win streak", value: `${streak.longest_win_streak} wins`, who: String(streak.manager), when: `${streak.season} · ${streak.record}`, rows: topRows(games.filter(x => x.season === streak.season && x.manager === streak.manager), "games", "week", "asc", [], 0), columns: ["week", "label", "result", "points", "opp_manager", "opp_points", "streak"] });
    const best = one(teams, "teams", "pf", "desc");
    if (best) out.push({ title: "Most points in a season", value: fmt(best.pf, 2), who: String(best.manager), when: `${best.season} · ${best.record}`, sub: `${fmt(best.all_play_pct, 1)}% all-play`, rows: topRows(weekly.filter(x => x.season === best.season && x.manager === best.manager), "weekly_scores", "week", "asc", [], 0), columns: SCORE_COLS });
    const lucky = one(teams, "teams", "luck", "desc", [f("is_complete", "==", true)]);
    if (lucky && num(lucky.luck)) out.push({ title: "Luckiest season", value: `+${fmt(lucky.luck, 2)} wins`, who: String(lucky.manager), when: `${lucky.season} · ${lucky.record}`, sub: `expected ${fmt(lucky.expected_wins, 1)} wins`, rows: topRows(weekly.filter(x => x.season === lucky.season && x.manager === lucky.manager), "weekly_scores", "week", "asc", [], 0), columns: [...SCORE_COLS, "all_play_wins", "all_play_losses"] });
    const bench = one(lineups, "lineups", "points_left_on_bench", "desc");
    if (bench) out.push({ title: "Worst benching", value: `${fmt(bench.points_left_on_bench, 2)} left`, who: String(bench.manager), when: weekOf(bench), sub: `${bench.best_benched_player} (${fmt(bench.best_benched_points, 1)}) sat${bench.would_have_won ? "; would have won" : ""}`, rows: topRows(pw.filter(x => x.season === bench.season && x.week === bench.week && x.manager === bench.manager), "player_weeks", "points", "desc", [], 0), columns: ["slot", "player_name", "position", "started", "points", "pct_of_team"], drillTitle: `${bench.manager}, week ${bench.week} ${bench.season}: the lineup` });
    if (!pending.trades) {
      const trades = rowsById.trades ?? [], pickups = rowsById.pickups ?? [];
      const tr = one(trades, "trades", "net_starter_points", "desc");
      if (tr) out.push({ title: "Best trade", value: `+${fmt(tr.net_starter_points, 1)}`, who: String(tr.manager), when: `${tr.season} · Week ${tr.week}`, sub: `got ${tr.received}`, rows: trades.filter(x => x.transaction_id === tr.transaction_id), columns: ["season", "week", "manager", "received", "sent", "net_starter_points", "grade"], drillTitle: "Both sides of the trade" });
      const pk = one(pickups, "pickups", "points_as_starter", "desc");
      if (pk) out.push({ title: "Best pickup", value: `${fmt(pk.points_as_starter, 1)} pts`, who: String(pk.manager), when: `${pk.season} · Week ${pk.week}`, sub: `${pk.player_name} for $${pk.faab_bid ?? 0}`, rows: [pk], columns: ["season", "week", "manager", "player_name", "position", "faab_bid", "points_as_starter", "games_started", "points_per_dollar"] });
    }
    return out;
  }, [rowsById, gk, pending.trades]); // eslint-disable-line react-hooks/exhaustive-deps
}

/* ---------- Managers ---------- */
export function Managers() {
  const { rowsById, g, gk, theme, chip } = useSite();
  const t = useChartTheme(theme);
  const bump = useMemo(() => pivot(rowsById.teams ?? [], withGlobal(S.bump, g)), [rowsById, gk]); // eslint-disable-line react-hooks/exhaustive-deps
  const bumpOpt = useMemo(() => pivotOption(bump, "bump", t), [bump, t]);
  const h2h = useMemo(() => pivot(rowsById.h2h ?? [], withGlobal(S.h2h, g)), [rowsById, gk]); // eslint-disable-line react-hooks/exhaustive-deps
  const h2hOpt = useMemo(() => pivotOption(h2h, "heatmap", t), [h2h, t]);
  return (
    <div className="site-page">
      <div className="page-head"><span className="eyebrow">Managers</span><h1>Who is actually good?</h1><p className="hint">Percentiles against the rest of the league, all-time leaderboards, how everyone's finish moved year to year, and who owns whom.</p></div>
      <Section title="Percentiles" hint="Where each manager sits among all managers: 100 is the best in the league, 0 the worst. All-time, regular season.">
        <PercentileBars metrics={[{ col: "reg_win_pct", label: "Win %", digits: 1, unit: "%" }, { col: "reg_ppg", label: "Points / game", digits: 1 }, { col: "all_play_pct", label: "All-play %", digits: 1, unit: "%" }, { col: "efficiency_pct", label: "Lineup efficiency", digits: 1, unit: "%" }, { col: "luck", label: "Luck", digits: 1 }, { col: "playoff_rate", label: "Playoff rate", digits: 0, unit: "%" }, { col: "avg_finish", label: "Average finish", digits: 1, higherBetter: false }]} />
      </Section>
      <div className="grid two">
        <Section title="Win %" hint="Regular season, all time." spec={S.winPct}><Leaderboard spec={S.winPct} digits={1} subKey="any_reg_record" subLabel="Record" /></Section>
        <Section title="Points per game" hint="Regular season, all time." spec={S.ppg}><Leaderboard spec={S.ppg} digits={1} /></Section>
        <Section title="All-play win %" hint="If you played everyone every week. Averaged over seasons." spec={S.allPlay}><Leaderboard spec={S.allPlay} digits={1} /></Section>
        <Section title="Luck" hint="Actual wins minus expected wins from all-play. Positive is lucky." spec={S.luck}><Leaderboard spec={S.luck} digits={1} subKey="sum_expected_wins" subLabel="Expected wins" /></Section>
        <Section title="Playoff appearances" spec={S.playoffs}><Leaderboard spec={S.playoffs} dropZero subKey="any_playoff_rate" subLabel="Rate %" /></Section>
        <Section title="Titles" spec={S.titles}><Leaderboard spec={S.titles} dropZero subKey="sum_last_places" subLabel="Last places" /></Section>
      </div>
      <Section title="Final rank by season" hint="Lower is better. Click a line to filter to that manager." spec={S.bump}>
        <div className="tile flat">{bump.rowKeys.length ? <Chart option={bumpOpt} theme={t} height={360} onClick={e => { if (e.seriesName) chip({ manager: g.manager === e.seriesName ? undefined : e.seriesName }); }} /> : <div className="empty">No finished seasons.</div>}</div>
      </Section>
      <Section title="Head-to-head" hint="Wins by the row manager over the column opponent, all games. Click a cell to filter to that manager." spec={S.h2h}>
        <div className="tile flat">{h2h.rowKeys.length ? <Chart option={h2hOpt} theme={t} height={Math.max(260, 36 * h2h.rowKeys.length + 90)} onClick={e => { const v = e.value as number[] | undefined; const name = v ? h2h.rowKeys[v[1]]?.values[0] : null; if (name != null) chip({ manager: g.manager === String(name) ? undefined : String(name) }); }} /> : <div className="empty">No games yet.</div>}</div>
      </Section>
    </div>
  );
}

/* ---------- Seasons ---------- */
export function Seasons() {
  const { rowsById, g, gk, theme, chip } = useSite();
  const t = useChartTheme(theme);
  const trend = useMemo(() => pivot(rowsById.weekly_scores ?? [], withGlobal({ ...S.trend, filters: S.trend.filters }, { ...g, season: undefined })), [rowsById, gk]); // eslint-disable-line react-hooks/exhaustive-deps
  const trendOpt = useMemo(() => pivotOption(trend, "line", t), [trend, t]);
  const seasons = useMemo(() => [...(rowsById.seasons ?? [])].filter(r => g.season == null || r.season === g.season).sort((a, b) => Number(b.season) - Number(a.season)), [rowsById, g.season]);
  const latest = seasons[0]?.season;
  const standingsSeason = g.season ?? (rowsById.seasons ?? []).map(r => Number(r.season)).sort((a, b) => b - a)[0];
  const standings = useMemo(() => topRows(rowsById.teams ?? [], "teams", "final_rank", "asc", [f("season", "==", standingsSeason ?? null), ...(g.manager ? [f("manager", "==", g.manager)] : [])], 0), [rowsById, standingsSeason, g.manager]);
  return (
    <div className="site-page">
      <div className="page-head"><span className="eyebrow">Seasons</span><h1>Year by year.</h1><p className="hint">Scoring trends, a card for every season and the standings. Click a season or a point on the chart to filter the whole site.</p></div>
      <Section title="Scoring trend" hint="Average, top and lowest weekly score per season (final weeks only). Click a season to filter." spec={S.trend}>
        <div className="tile flat"><Chart option={trendOpt} theme={t} height={280} onClick={e => { const s = Number(e.name); if (s) chip({ season: g.season === s ? undefined : s }); }} /></div>
      </Section>
      <Section title={`Standings${standingsSeason ? ` · ${standingsSeason}` : ""}${g.season == null && latest ? " (latest)" : ""}`} hint="Final rank, record, points and luck for the season." spec={{ ...S.standings, filters: standingsSeason ? [f("season", "==", standingsSeason)] : [] }}>
        <MiniTable rows={standings} dataset="teams" columns={S.standings.display!.slice(1)} bars={["pf"]} heat={["luck", "all_play_pct", "efficiency_pct"]} max={14} onRowClick={r => chip({ manager: g.manager === r.manager ? undefined : String(r.manager) })} />
      </Section>
      <Section title="Season cards" hint="Champion, runner-up, last place and the high score of each season.">
        <div className="season-cards">
          {seasons.map(r => { const s = Number(r.season); return (
            <div key={s} className="tile season-card" onClick={() => chip({ season: g.season === s ? undefined : s })} title={`Filter to ${s}`}>
              <div className="yr"><b>{s}</b><span className="hint">{r.num_teams} teams · {r.games_played ?? 0} games{r.is_complete ? "" : " · in progress"}</span></div>
              <dl>
                <dt>Champion</dt><dd>{r.champion ? <><Avatar name={String(r.champion)} /><span>{r.champion}</span></> : "—"}</dd>
                <dt>Runner-up</dt><dd>{r.runner_up ? <><Avatar name={String(r.runner_up)} /><span>{r.runner_up}</span></> : "—"}</dd>
                <dt>Last place</dt><dd>{r.last_place ? <><Avatar name={String(r.last_place)} /><span>{r.last_place}</span></> : "—"}</dd>
                <dt>Best record</dt><dd><span>{r.best_record ? `${r.best_record} (${r.best_record_wlt})` : "—"}</span></dd>
                <dt>Most points</dt><dd><span>{r.most_points ? `${r.most_points} (${fmt(r.most_points_pf, 1)})` : "—"}</span></dd>
                <dt>High score</dt><dd><span>{r.high_score != null ? `${fmt(r.high_score, 2)} · ${r.high_score_manager}, wk ${r.high_score_week}` : "—"}</span></dd>
                <dt>Avg score</dt><dd><span>{fmt(r.avg_team_score, 1)}</span></dd>
                {r.trades_count != null && <><dt>Trades</dt><dd><span>{String(r.trades_count)}</span></dd></>}
              </dl>
            </div>); })}
        </div>
      </Section>
    </div>
  );
}

/* ---------- Games ---------- */
export function Games() {
  const { rowsById, g, gk, theme, chip } = useSite();
  const t = useChartTheme(theme);
  const weekly = rowsById.weekly_scores ?? [], games = rowsById.games ?? [];
  const list = (spec: ViewSpec, n = 10) => topRows(rowsById[spec.dataset] ?? [], spec.dataset, spec.sort[0].key, spec.sort[0].dir, [...spec.filters, ...globalFilters(spec.dataset, g)], n);
  const hi = useMemo(() => list(S.highScores), [weekly, gk]); // eslint-disable-line react-hooks/exhaustive-deps
  const lo = useMemo(() => list(S.lowScores), [weekly, gk]); // eslint-disable-line react-hooks/exhaustive-deps
  const blow = useMemo(() => list(S.blowouts), [games, gk]); // eslint-disable-line react-hooks/exhaustive-deps
  const close = useMemo(() => list(S.closest), [games, gk]); // eslint-disable-line react-hooks/exhaustive-deps
  const season = g.season ?? Math.max(...weekly.map(r => Number(r.season)), 0);
  const multiples = useMemo(() => {
    const rows = weekly.filter(r => r.season === season && r.week_final === true && Number(r.points) > 0 && (!g.weekKind || r.week_kind === (g.weekKind === "regular" ? "regular" : "playoff")));
    const weeks = [...new Set(rows.map(r => Number(r.week)))].sort((a, b) => a - b);
    const avg = weeks.map(w => { const xs = rows.filter(r => r.week === w).map(r => Number(r.points)); return xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null; });
    const names = [...new Set(rows.map(r => String(r.manager)))].filter(n => !g.manager || n === g.manager);
    const per = names.map(name => { const mine = rows.filter(r => r.manager === name); const pts = weeks.map(w => num(mine.find(r => r.week === w)?.points)); const vals = pts.filter((x): x is number => x != null); return { name, pts, avg: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0, wins: mine.filter(r => r.result === "W").length, losses: mine.filter(r => r.result === "L").length }; }).sort((a, b) => b.avg - a.avg);
    const max = Math.max(...rows.map(r => Number(r.points)), 0);
    return { weeks, avg, per, max };
  }, [weekly, season, g.manager, g.weekKind]);
  const onRow = (r: Row) => chip({ manager: g.manager === r.manager ? undefined : String(r.manager) });
  return (
    <div className="site-page">
      <div className="page-head"><span className="eyebrow">Games</span><h1>Every matchup, every score.</h1><p className="hint">The extremes, then one small chart per manager showing their points by week against the league average.</p></div>
      <div className="grid two">
        <Section title="Highest scores" hint="Final weeks only." spec={S.highScores}><MiniTable rows={hi} dataset="weekly_scores" columns={SCORE_COLS} bars={["points"]} onRowClick={onRow} /></Section>
        <Section title="Lowest scores" spec={S.lowScores}><MiniTable rows={lo} dataset="weekly_scores" columns={SCORE_COLS} bars={["points"]} onRowClick={onRow} /></Section>
        <Section title="Biggest blowouts" hint="Winner's margin, all games including brackets." spec={S.blowouts}><MiniTable rows={blow} dataset="games" columns={GAME_COLS} bars={["margin"]} onRowClick={onRow} /></Section>
        <Section title="Closest games" spec={S.closest}><MiniTable rows={close} dataset="games" columns={GAME_COLS} bars={["margin"]} onRowClick={onRow} /></Section>
      </div>
      <Section title={`Points by week · ${season || "—"}`} hint={`${g.season == null ? "Latest season. " : ""}Solid line is the manager, dashed is the league average that week. Click a chart to filter to that manager.`} spec={{ ...S.weekly, filters: [...S.weekly.filters, f("season", "==", season)] }}>
        <div className="multiples">
          {multiples.per.map(p => (
            <div key={p.name} className="tile flat mini" onClick={() => chip({ manager: g.manager === p.name ? undefined : p.name })} title={`Filter to ${p.name}`}>
              <header><Avatar name={p.name} />{p.name}<small>{p.wins}-{p.losses} · {fmt(p.avg, 1)}</small></header>
              <Chart theme={t} height={multiples.per.length === 1 ? 240 : 96} option={{
                tooltip: { ...tooltipStyle(t, "axis"), formatter: (ps: { axisValue: string; seriesName: string; value: number | null; marker: string }[]) => `Week ${ps[0]?.axisValue}<br/>${ps.map(x => `${x.marker}${x.seriesName}: ${x.value == null ? "—" : formatValue("points", x.value)}`).join("<br/>")}` },
                grid: gridStyle(false, { left: 2, right: 6, top: 8, bottom: 2 }),
                xAxis: { type: "category", data: multiples.weeks, ...axisStyle(t, { axisLabel: { show: multiples.per.length === 1, color: t.muted, fontSize: 10 } }) },
                yAxis: { type: "value", min: 0, max: Math.ceil(multiples.max / 10) * 10, ...axisStyle(t, { axisLabel: { show: multiples.per.length === 1, color: t.muted, fontSize: 10 }, splitLine: { show: multiples.per.length === 1, lineStyle: { color: t.line } } }) },
                series: [
                  { name: "League avg", type: "line", data: multiples.avg, showSymbol: false, lineStyle: { type: "dashed", width: 1, color: t.muted }, itemStyle: { color: t.muted }, silent: true },
                  { name: p.name, type: "line", data: p.pts, showSymbol: multiples.per.length === 1, symbolSize: 6, smooth: .2, lineStyle: { width: 2, color: t.accent }, itemStyle: { color: t.accent }, areaStyle: { color: t.accent, opacity: .12 } },
                ],
              }} />
            </div>
          ))}
          {!multiples.per.length && <div className="tile empty">No scores for these filters.</div>}
        </div>
      </Section>
    </div>
  );
}
