import type { Row } from "../../perspective/engine";
import { isDefId, lookupPlayer } from "../players";
import { r2 } from "../weeks";
import { seasonCols, starterSlots, teamCols, view, type TableDef } from "./common";

export const player_weeks: TableDef = {
  id: "player_weeks",
  label: "Player weeks",
  description: "One row per rostered player per team per week: who started in which slot, who sat, and what each scored. Player names arrive once the NFL player list loads.",
  grain: "player-team-week",
  requires: "players",
  schema: {
    league_id: "string", season: "integer", league_name: "string", week: "integer", week_kind: "string", week_final: "boolean",
    roster_id: "integer", user_id: "string", manager: "string", team: "string", matchup_id: "integer",
    player_id: "string", player_name: "string", position: "string", nfl_team_current: "string",
    slot: "string", slot_index: "integer", started: "boolean", is_empty_slot: "boolean",
    points: "float", team_points: "float", pct_of_team: "float", rank_on_roster: "integer", is_top_scorer_on_team: "boolean",
  },
  build({ ds }) {
    const rows: Row[] = [];
    for (const m of ds.models) {
      const slots = starterSlots(m.raw.league.roster_positions || []);
      const pws = m.pws;
      for (const [wS, ms] of Object.entries(m.raw.matchups)) {
        const w = +wS;
        if (!ms.some(x => (x.custom_points ?? x.points) > 0)) continue;
        for (const mu of ms) {
          const t = m.teams[mu.roster_id];
          const teamPts = r2((mu.custom_points ?? mu.points) || 0);
          const starters = mu.starters || [], pp = mu.players_points, sp = mu.starters_points;
          const seen = new Set<string>();
          const entries: { pid: string; slot: string; idx: number; started: boolean; pts: number | null; empty: boolean }[] = [];
          starters.forEach((pid, i) => {
            const empty = !pid || pid === "0";
            const pts = empty ? 0 : pp?.[pid] ?? sp?.[i] ?? null;
            if (!empty) seen.add(pid);
            entries.push({ pid: empty ? "0" : pid, slot: slots[i] ?? `S${i + 1}`, idx: i, started: true, pts, empty });
          });
          for (const pid of mu.players || []) {
            if (seen.has(pid)) continue;
            seen.add(pid);
            entries.push({ pid, slot: "BN", idx: -1, started: false, pts: pp?.[pid] ?? null, empty: false });
          }
          const scored = entries.filter(e => e.pts != null && !e.empty).sort((a, b) => b.pts! - a.pts!);
          const rankOf = new Map(scored.map((e, i) => [e.pid, i + 1]));
          for (const e of entries) {
            const [name, pos, nflTeam] = e.empty ? ["Empty slot", "", ""] : lookupPlayer(ds.players, e.pid);
            rows.push({
              ...seasonCols(m), week: w, week_kind: w >= pws ? "playoff" : "regular", week_final: w <= m.raw.finalThrough,
              ...teamCols(ds, t, mu.roster_id, m.sid), matchup_id: mu.matchup_id,
              player_id: e.pid, player_name: name, position: e.empty ? null : pos || (isDefId(e.pid) ? "DEF" : null), nfl_team_current: e.empty ? null : nflTeam || null,
              slot: e.slot, slot_index: e.started ? e.idx + 1 : null, started: e.started, is_empty_slot: e.empty,
              points: e.pts != null ? r2(e.pts) : null, team_points: teamPts, pct_of_team: e.pts != null && teamPts ? r2(e.pts / teamPts * 100) : null,
              rank_on_roster: rankOf.get(e.pid) ?? null, is_top_scorer_on_team: rankOf.get(e.pid) === 1,
            });
          }
        }
      }
    }
    return rows;
  },
  defaultView: view({ columns: ["season", "week", "manager", "slot", "player_name", "position", "points", "started", "team_points"], sort: [["season", "desc"], ["week", "desc"], ["points", "desc"]] }),
  presets: [
    { name: "Lineups", config: view({ columns: ["season", "week", "manager", "slot", "player_name", "position", "points", "started", "team_points"], sort: [["season", "desc"], ["week", "desc"], ["points", "desc"]] }) },
    { name: "Points by position by manager", config: view({ plugin: "Datagrid", group_by: ["manager"], split_by: ["position"], columns: ["points"], aggregates: { points: "sum" }, filter: [["started", "==", true]], columns_config: { points: { number_color_mode: "gradient" } } }) },
    { name: "Best single games", config: view({ columns: ["points", "player_name", "position", "manager", "season", "week", "started", "slot"], sort: [["points", "desc"]], filter: [["is_empty_slot", "==", false]] }) },
    { name: "Points left on the bench", config: view({ plugin: "Y Bar", group_by: ["manager"], columns: ["points"], aggregates: { points: "sum" }, filter: [["started", "==", false]], sort: [["points", "desc"]] }) },
    { name: "Top scorers for each team", config: view({ group_by: ["season", "manager", "player_name"], columns: ["points", "started"], aggregates: { points: "sum", started: "sum" }, sort: [["points", "desc"]] }) },
  ],
};
