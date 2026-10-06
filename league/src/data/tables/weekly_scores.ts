import type { Row } from "../../perspective/engine";
import { r2 } from "../weeks";
import { nameOf, seasonCols, view, type TableDef } from "./common";

export const weekly_scores: TableDef = {
  id: "weekly_scores",
  label: "Weekly scores",
  description: "One row per team per week, including byes and each playoff week on its own. Carries the week's rank, median, all-play record and the in-progress week.",
  grain: "team-week",
  schema: {
    league_id: "string", season: "integer", league_name: "string", week: "integer", week_kind: "string", week_final: "boolean",
    roster_id: "integer", user_id: "string", manager: "string", team: "string",
    matchup_id: "integer", has_matchup: "boolean", in_winners_bracket: "boolean", in_losers_bracket: "boolean",
    points: "float", points_raw: "float", bench_points: "float", total_roster_points: "float", starters_count: "integer", empty_starter_slots: "integer",
    week_rank: "integer", teams_scoring: "integer", is_week_high: "boolean", is_week_low: "boolean",
    league_median: "float", vs_median: "string", above_median: "boolean", league_avg: "float", pts_vs_avg: "float",
    all_play_wins: "integer", all_play_losses: "integer", all_play_ties: "integer", expected_win: "float",
    opp_roster_id: "integer", opp_manager: "string", opp_points: "float", result: "string",
  },
  build({ ds }) {
    const rows: Row[] = [];
    for (const m of ds.models) for (const w of m.weekly) {
      rows.push({
        ...seasonCols(m), week: w.week, week_kind: w.kind, week_final: w.final,
        roster_id: w.rid, user_id: w.uid, manager: nameOf(ds, w.uid, w.manager), team: w.team,
        matchup_id: w.matchupId, has_matchup: w.matchupId != null, in_winners_bracket: w.inWb, in_losers_bracket: w.inLb,
        points: r2(w.pts), points_raw: r2(w.ptsRaw), bench_points: w.bench, total_roster_points: w.total, starters_count: w.startersCount, empty_starter_slots: w.emptySlots,
        week_rank: w.rank, teams_scoring: w.n, is_week_high: w.rank === 1, is_week_low: w.rank != null && w.rank === w.n && w.n > 1,
        league_median: w.median != null ? r2(w.median) : null, vs_median: w.median == null || w.pts <= 0 ? null : w.pts > w.median ? "W" : w.pts < w.median ? "L" : "T",
        above_median: w.median != null && w.pts > 0 ? w.pts > w.median : null, league_avg: w.avg != null ? r2(w.avg) : null, pts_vs_avg: w.avg != null && w.pts > 0 ? r2(w.pts - w.avg) : null,
        all_play_wins: w.apW, all_play_losses: w.apL, all_play_ties: w.apT, expected_win: r2(w.exp),
        opp_roster_id: w.oppRid, opp_manager: w.oppRid != null ? nameOf(ds, m.teams[w.oppRid]?.uid, m.teams[w.oppRid]?.manager ?? "Open slot") : null, opp_points: w.oppPts != null ? r2(w.oppPts) : null, result: w.result,
      });
    }
    return rows;
  },
  defaultView: view({ columns: ["season", "week", "manager", "team", "points", "week_rank", "league_median", "vs_median", "opp_manager", "opp_points", "result", "bench_points"], sort: [["season", "desc"], ["week", "desc"], ["points", "desc"]] }),
  presets: [
    { name: "Score trend by manager", config: view({ plugin: "Y Line", group_by: ["season", "week"], split_by: ["manager"], columns: ["points"], aggregates: { points: "sum" }, filter: [["week_kind", "==", "regular"]] }) },
    { name: "Points by week heatmap", config: view({ plugin: "Datagrid", group_by: ["manager"], split_by: ["week"], columns: ["points"], aggregates: { points: "sum" }, columns_config: { points: { number_color_mode: "gradient" } } }) },
    { name: "Consistency: avg and spread", config: view({ plugin: "Datagrid", group_by: ["manager"], columns: ["points", "points", "points", "points"], aggregates: { points: "avg" }, filter: [["week_kind", "==", "regular"]], sort: [["points", "desc"]] }) },
    { name: "Weeks above the median", config: view({ plugin: "Y Bar", group_by: ["manager"], split_by: ["vs_median"], columns: ["week"], aggregates: { week: "count" }, filter: [["week_kind", "==", "regular"]] }) },
  ],
};
