import type { Row } from "../../perspective/engine";
import type { Game } from "../model";
import { r2 } from "../weeks";
import { nameOf, seasonCols, view, type TableDef } from "./common";

export const games: TableDef = {
  id: "games",
  label: "Games",
  description: "One row per team per game, so every matchup appears twice (once from each side). Regular season plus playoff and consolation bracket games.",
  grain: "team-game",
  schema: {
    game_id: "string", league_id: "string", season: "integer", league_name: "string",
    week: "integer", week_end: "integer", weeks: "string", is_multi_week: "boolean",
    kind: "string", label: "string", bracket: "string", round: "integer", match: "integer", place: "integer", matchup_id: "integer", counts_for_record: "boolean",
    roster_id: "integer", user_id: "string", manager: "string", team: "string",
    opp_roster_id: "integer", opp_user_id: "string", opp_manager: "string", opp_team: "string",
    points: "float", opp_points: "float", margin: "float", total_points: "float", result: "string", won: "boolean",
    bench_points: "float", week_rank: "integer", teams_scoring: "integer", is_week_high: "boolean", is_week_low: "boolean", opp_week_rank: "integer",
    season_game_no: "integer", cum_wins: "integer", cum_losses: "integer", streak: "string",
  },
  build({ ds }) {
    const rows: Row[] = [];
    for (const m of ds.models) {
      const wk = new Map<string, (typeof m.weekly)[number]>();
      for (const w of m.weekly) wk.set(`${w.week}:${w.rid}`, w);
      const tally: Record<number, { n: number; w: number; l: number; run: number; r: string }> = {};
      const sorted = [...m.games].sort((x, y) => x.week - y.week || (x.kind === "regular" ? 0 : 1) - (y.kind === "regular" ? 0 : 1));
      for (const g of sorted) for (const [me, op] of [[g.a, g.b], [g.b, g.a]] as const) {
        const res = me.pts > op.pts ? "W" : me.pts < op.pts ? "L" : "T";
        const t = (tally[me.rid] ??= { n: 0, w: 0, l: 0, run: 0, r: "" });
        if (g.kind !== "consolation") { t.n++; if (res === "W") t.w++; if (res === "L") t.l++; t.run = t.r === res ? t.run + 1 : 1; t.r = res; }
        const ws = g.multi ? null : wk.get(`${g.week}:${me.rid}`), ows = g.multi ? null : wk.get(`${g.week}:${op.rid}`);
        rows.push({
          game_id: `${g.id}:${me.rid}`, ...seasonCols(m),
          week: g.week, week_end: g.weekEnd, weeks: g.weeks.join("-"), is_multi_week: g.multi,
          kind: g.kind, label: g.label, bracket: g.bracket, round: g.round, match: g.match, place: g.place, matchup_id: g.matchupId, counts_for_record: g.kind === "regular",
          roster_id: me.rid, user_id: me.uid, manager: nameOf(ds, me.uid, me.manager), team: me.team,
          opp_roster_id: op.rid, opp_user_id: op.uid, opp_manager: nameOf(ds, op.uid, op.manager), opp_team: op.team,
          points: r2(me.pts), opp_points: r2(op.pts), margin: r2(me.pts - op.pts), total_points: r2(me.pts + op.pts), result: res, won: res === "W",
          bench_points: ws?.bench ?? null, week_rank: ws?.rank ?? null, teams_scoring: ws?.n ?? null,
          is_week_high: ws ? ws.rank === 1 : null, is_week_low: ws ? ws.rank === ws.n && ws.n > 1 : null, opp_week_rank: ows?.rank ?? null,
          season_game_no: g.kind === "consolation" ? null : t.n, cum_wins: g.kind === "consolation" ? null : t.w, cum_losses: g.kind === "consolation" ? null : t.l,
          streak: g.kind === "consolation" ? null : `${t.r}${t.run}`,
        });
      }
    }
    return rows;
  },
  defaultView: view({ columns: ["season", "week", "kind", "label", "manager", "team", "points", "opp_points", "opp_manager", "result", "margin"], sort: [["season", "desc"], ["week", "desc"]] }),
  presets: [
    { name: "All games", config: view({ columns: ["season", "week", "kind", "label", "manager", "team", "points", "opp_points", "opp_manager", "result", "margin"], sort: [["season", "desc"], ["week", "desc"]] }) },
    { name: "Head-to-head record", config: view({ plugin: "Datagrid", group_by: ["manager"], split_by: ["opp_manager"], columns: ["won"], aggregates: { won: "sum" }, filter: [["kind", "!=", "consolation"]] }) },
    { name: "Average score by manager and season", config: view({ plugin: "Y Line", group_by: ["season"], split_by: ["manager"], columns: ["points"], aggregates: { points: "avg" }, filter: [["kind", "==", "regular"]] }) },
    { name: "Highest scores", config: view({ columns: ["points", "manager", "team", "season", "week", "opp_manager", "opp_points", "result"], sort: [["points", "desc"]] }) },
    { name: "Closest games", config: view({ columns: ["margin", "manager", "opp_manager", "points", "opp_points", "season", "week", "label"], sort: [["margin", "asc"]], filter: [["won", "==", true]] }) },
    { name: "Wins by manager", config: view({ plugin: "Y Bar", group_by: ["manager"], columns: ["won"], aggregates: { won: "sum" }, sort: [["won", "desc"]], filter: [["kind", "==", "regular"]] }) },
  ],
};

export type { Game };
