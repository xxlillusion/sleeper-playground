import type { Row } from "../../perspective/engine";
import { optimalLineup, type Candidate } from "../lineup";
import type { LeagueDataset } from "../load";
import { isDefId, lookupPlayer } from "../players";
import { r2 } from "../weeks";
import { seasonCols, starterSlots, teamCols, view, type TableDef } from "./common";

export interface LineupWeek {
  sid: string; rid: number; week: number; kind: "regular" | "playoff"; final: boolean;
  actual: number; optimal: number; left: number; changed: number;
  bestBenched: Candidate | null; worstStarted: Candidate | null;
  result: "W" | "L" | "T" | null; oppPts: number | null; wouldHaveWon: boolean;
}

/* Computed once per dataset (and again when player names arrive, since positions come from the player list). */
const cache = new WeakMap<LeagueDataset, { players: unknown; weeks: LineupWeek[] }>();
export function lineupWeeks(ds: LeagueDataset): LineupWeek[] {
  const hit = cache.get(ds);
  if (hit && hit.players === ds.players) return hit.weeks;
  const out: LineupWeek[] = [];
  if (ds.players) for (const m of ds.models) {
    const slots = starterSlots(m.raw.league.roster_positions || []);
    const byWeek = new Map(m.weekly.map(w => [`${w.week}:${w.rid}`, w]));
    for (const [wS, ms] of Object.entries(m.raw.matchups)) {
      const w = +wS;
      if (!ms.some(x => (x.custom_points ?? x.points) > 0)) continue;
      for (const mu of ms) {
        const pp = mu.players_points; if (!pp) continue;
        const starters = (mu.starters || []).filter(p => p && p !== "0");
        const cands: Candidate[] = (mu.players || []).filter(p => pp[p] != null).map(id => {
          const [, pos] = lookupPlayer(ds.players, id);
          return { id, pos: pos || (isDefId(id) ? "DEF" : ""), pts: pp[id] || 0 };
        });
        if (!cands.length) continue;
        const opt = optimalLineup(slots, cands);
        const optIds = new Set(opt.assignment.filter(Boolean).map(c => c!.id));
        const actual = r2(starters.reduce((a, p) => a + (pp[p] || 0), 0));
        const started = new Set(starters);
        const shouldHave = cands.filter(c => optIds.has(c.id) && !started.has(c.id)).sort((a, b) => b.pts - a.pts);
        const shouldNot = cands.filter(c => started.has(c.id) && !optIds.has(c.id)).sort((a, b) => a.pts - b.pts);
        const ws = byWeek.get(`${w}:${mu.roster_id}`);
        const left = r2(Math.max(0, opt.total - actual));
        out.push({
          sid: m.sid, rid: mu.roster_id, week: w, kind: w >= m.pws ? "playoff" : "regular", final: w <= m.raw.finalThrough,
          actual, optimal: Math.max(opt.total, actual), left, changed: shouldHave.length,
          bestBenched: shouldHave[0] ?? null, worstStarted: shouldNot[0] ?? null,
          result: ws?.result ?? null, oppPts: ws?.oppPts ?? null,
          wouldHaveWon: ws?.result === "L" && ws.oppPts != null && opt.total > ws.oppPts,
        });
      }
    }
  }
  cache.set(ds, { players: ds.players, weeks: out });
  return out;
}

export interface LineupAgg { actual: number; optimal: number; left: number; lostToLineup: number; weeks: number; perfect: number }
export function lineupAgg(ds: LeagueDataset): Map<string, LineupAgg> {
  const agg = new Map<string, LineupAgg>();
  for (const lw of lineupWeeks(ds)) {
    if (!lw.final) continue;
    const k = `${lw.sid}:${lw.rid}`;
    const a = agg.get(k) ?? { actual: 0, optimal: 0, left: 0, lostToLineup: 0, weeks: 0, perfect: 0 };
    a.actual += lw.actual; a.optimal += lw.optimal; a.left += lw.left; a.weeks++;
    if (lw.wouldHaveWon) a.lostToLineup++; if (lw.left === 0) a.perfect++;
    agg.set(k, a);
  }
  return agg;
}

export const lineups: TableDef = {
  id: "lineups",
  label: "Lineups",
  description: "One row per team per week comparing the lineup that was started with the best one available from that roster. Needs per-player points, which Sleeper records from 2019 onward.",
  grain: "team-week",
  requires: "players",
  schema: {
    league_id: "string", season: "integer", league_name: "string", week: "integer", week_kind: "string", week_final: "boolean",
    roster_id: "integer", user_id: "string", manager: "string", team: "string",
    actual_points: "float", optimal_points: "float", points_left_on_bench: "float", efficiency_pct: "float", is_perfect: "boolean", slots_changed: "integer",
    best_benched_player: "string", best_benched_position: "string", best_benched_points: "float",
    worst_started_player: "string", worst_started_position: "string", worst_started_points: "float",
    result: "string", opp_points: "float", would_have_won: "boolean",
  },
  build({ ds }) {
    const rows: Row[] = [];
    const bySid = new Map(ds.models.map(m => [m.sid, m]));
    for (const lw of lineupWeeks(ds)) {
      const m = bySid.get(lw.sid)!;
      const name = (c: Candidate | null) => (c ? lookupPlayer(ds.players, c.id)[0] : null);
      rows.push({
        ...seasonCols(m), week: lw.week, week_kind: lw.kind, week_final: lw.final, ...teamCols(ds, m.teams[lw.rid], lw.rid, m.sid),
        actual_points: lw.actual, optimal_points: lw.optimal, points_left_on_bench: lw.left,
        efficiency_pct: lw.optimal ? r2(lw.actual / lw.optimal * 100) : null, is_perfect: lw.left === 0, slots_changed: lw.changed,
        best_benched_player: name(lw.bestBenched), best_benched_position: lw.bestBenched?.pos ?? null, best_benched_points: lw.bestBenched?.pts ?? null,
        worst_started_player: name(lw.worstStarted), worst_started_position: lw.worstStarted?.pos ?? null, worst_started_points: lw.worstStarted?.pts ?? null,
        result: lw.result, opp_points: lw.oppPts, would_have_won: lw.wouldHaveWon,
      });
    }
    return rows;
  },
  defaultView: view({ columns: ["season", "week", "manager", "actual_points", "optimal_points", "points_left_on_bench", "efficiency_pct", "best_benched_player", "best_benched_points", "result", "would_have_won"], sort: [["season", "desc"], ["week", "desc"], ["points_left_on_bench", "desc"]] }),
  presets: [
    { name: "Week by week", config: view({ columns: ["season", "week", "manager", "actual_points", "optimal_points", "points_left_on_bench", "efficiency_pct", "best_benched_player", "best_benched_points", "result", "would_have_won"], sort: [["season", "desc"], ["week", "desc"], ["points_left_on_bench", "desc"]] }) },
    { name: "Efficiency by manager", config: view({ plugin: "Y Bar", group_by: ["manager"], columns: ["efficiency_pct"], aggregates: { efficiency_pct: "avg" }, sort: [["efficiency_pct", "desc"]], filter: [["week_kind", "==", "regular"]] }) },
    { name: "Points left on bench by season", config: view({ plugin: "Datagrid", group_by: ["manager"], split_by: ["season"], columns: ["points_left_on_bench"], aggregates: { points_left_on_bench: "sum" }, columns_config: { points_left_on_bench: { number_color_mode: "gradient" } } }) },
    { name: "Games lost to lineup calls", config: view({ columns: ["season", "week", "manager", "actual_points", "opp_points", "optimal_points", "best_benched_player", "best_benched_points", "worst_started_player", "worst_started_points"], filter: [["would_have_won", "==", true]], sort: [["season", "desc"], ["week", "desc"]] }) },
    { name: "Worst benchings", config: view({ columns: ["best_benched_points", "best_benched_player", "best_benched_position", "manager", "season", "week", "worst_started_player", "worst_started_points", "result"], sort: [["best_benched_points", "desc"]] }) },
  ],
};
