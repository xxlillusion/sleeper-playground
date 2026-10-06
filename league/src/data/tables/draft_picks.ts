import type { Row } from "../../perspective/engine";
import { r2 } from "../weeks";
import { nameOf, seasonCols, slotToRoster, teamCols, view, type TableDef } from "./common";

export const draft_picks: TableDef = {
  id: "draft_picks",
  label: "Draft picks",
  description: "One row per draft pick in every season's draft (rookie and startup drafts both appear), with the points that player went on to score that season.",
  grain: "pick",
  requires: "drafts",
  schema: {
    league_id: "string", season: "integer", league_name: "string", draft_id: "string", draft_type: "string", draft_status: "string", draft_date: "datetime", rounds: "integer",
    round: "integer", pick_no: "integer", pick_in_round: "integer", draft_slot: "integer",
    roster_id: "integer", user_id: "string", manager: "string", team: "string", picked_by: "string",
    player_id: "string", player_name: "string", position: "string", nfl_team_at_draft: "string", years_exp: "integer", is_rookie: "boolean",
    amount: "integer", is_keeper: "boolean", is_traded_pick: "boolean", original_roster_id: "integer", original_manager: "string",
    position_rank: "integer", season_points: "float", season_points_as_starter: "float", games_started: "integer",
  },
  build({ ds }) {
    const rows: Row[] = [];
    for (const m of ds.models) {
      if (!m.raw.drafts) continue;
      const userName = (uid: string | null) => (uid ? nameOf(ds, uid, m.raw.users.find(u => u.user_id === uid)?.display_name ?? uid) : null);
      // Points each player scored that season across any roster, from the weekly matchups
      const pts = new Map<string, { total: number; started: number; starts: number }>();
      for (const ms of Object.values(m.raw.matchups)) for (const mu of ms) {
        const st = new Set(mu.starters || []);
        for (const [pid, v] of Object.entries(mu.players_points || {})) {
          const e = pts.get(pid) ?? { total: 0, started: 0, starts: 0 }; pts.set(pid, e);
          e.total += v || 0; if (st.has(pid)) { e.started += v || 0; e.starts++; }
        }
      }
      for (const d of m.raw.drafts) {
        const picks = m.raw.picks[d.draft_id] || [];
        const s2r = slotToRoster(m.raw, d);
        const teamsN = d.settings?.teams || Object.keys(m.teams).length || 1;
        const posCount: Record<string, number> = {};
        for (const p of [...picks].sort((a, b) => a.pick_no - b.pick_no)) {
          const md = p.metadata || {};
          const rid = p.roster_id ?? s2r[p.draft_slot] ?? null;
          const orig = s2r[p.draft_slot] ?? null;
          const pos = md.position || null;
          const rank = pos ? (posCount[pos] = (posCount[pos] || 0) + 1) : null;
          const pp = pts.get(p.player_id);
          rows.push({
            ...seasonCols(m), draft_id: d.draft_id, draft_type: d.type, draft_status: d.status, draft_date: d.start_time, rounds: d.settings?.rounds ?? null,
            round: p.round, pick_no: p.pick_no, pick_in_round: p.pick_no - (p.round - 1) * teamsN, draft_slot: p.draft_slot,
            ...(rid != null ? teamCols(ds, m.teams[rid], rid, m.sid) : { roster_id: null, user_id: null, manager: null, team: null }), picked_by: userName(p.picked_by),
            player_id: p.player_id, player_name: `${md.first_name || ""} ${md.last_name || ""}`.trim() || p.player_id, position: pos, nfl_team_at_draft: md.team || null,
            years_exp: md.years_exp != null ? +md.years_exp : null, is_rookie: md.years_exp != null ? +md.years_exp === 0 : null,
            amount: md.amount != null ? +md.amount : null, is_keeper: !!p.is_keeper, is_traded_pick: orig != null && rid != null && orig !== rid,
            original_roster_id: orig, original_manager: orig != null && m.teams[orig] ? nameOf(ds, m.teams[orig].uid, m.teams[orig].manager) : null,
            position_rank: rank, season_points: pp ? r2(pp.total) : null, season_points_as_starter: pp ? r2(pp.started) : null, games_started: pp ? pp.starts : null,
          });
        }
      }
    }
    return rows;
  },
  defaultView: view({ columns: ["season", "round", "pick_no", "manager", "player_name", "position", "nfl_team_at_draft", "amount", "season_points", "is_keeper"], sort: [["season", "desc"], ["pick_no", "asc"]] }),
  presets: [
    { name: "Draft board", config: view({ columns: ["season", "round", "pick_no", "manager", "player_name", "position", "nfl_team_at_draft", "amount", "season_points", "is_keeper"], sort: [["season", "desc"], ["pick_no", "asc"]] }) },
    { name: "Points per pick by round", config: view({ plugin: "Y Bar", group_by: ["round"], columns: ["season_points"], aggregates: { season_points: "avg" } }) },
    { name: "Best value picks", config: view({ columns: ["season_points", "player_name", "position", "round", "pick_no", "manager", "season"], sort: [["season_points", "desc"]], filter: [["round", ">", 5]] }) },
    { name: "Positions taken by round", config: view({ plugin: "Datagrid", group_by: ["round"], split_by: ["position"], columns: ["player_id"], aggregates: { player_id: "count" } }) },
    { name: "Draft spend per manager", config: view({ plugin: "Datagrid", group_by: ["manager"], split_by: ["season"], columns: ["amount"], aggregates: { amount: "sum" } }) },
  ],
};
