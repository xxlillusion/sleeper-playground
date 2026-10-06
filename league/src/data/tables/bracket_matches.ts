import type { Row } from "../../perspective/engine";
import { nameOf, seasonCols, view, type TableDef } from "./common";

const from = (f: { w?: number; l?: number } | null | undefined) => (f ? (f.w != null ? `Winner of match ${f.w}` : f.l != null ? `Loser of match ${f.l}` : null) : null);

export const bracket_matches: TableDef = {
  id: "bracket_matches",
  label: "Brackets",
  description: "One row per playoff or consolation bracket match, including ones never played. Winners are decided by points; Sleeper's own call is kept alongside.",
  grain: "bracket match",
  schema: {
    league_id: "string", season: "integer", league_name: "string", bracket: "string", round: "integer", match: "integer", place: "integer", label: "string", weeks: "string",
    t1_roster_id: "integer", t1_manager: "string", t1_team: "string", t1_points: "float", t1_from: "string",
    t2_roster_id: "integer", t2_manager: "string", t2_team: "string", t2_points: "float", t2_from: "string",
    winner_roster_id: "integer", winner_manager: "string", loser_manager: "string", winner_by: "string", sleeper_w: "integer", sleeper_l: "integer", margin: "float",
    is_final: "boolean", is_toilet_bowl: "boolean", is_played: "boolean",
  },
  build({ ds }) {
    const rows: Row[] = [];
    for (const m of ds.models) for (const r of m.summary.results) {
      const mt = r.match, T = (rid: number | null) => { const t = rid != null ? m.teams[rid] : undefined; return t ? { ...t, manager: nameOf(ds, t.uid, t.manager) } : undefined; };
      const t1 = typeof mt.t1 === "number" ? mt.t1 : null, t2 = typeof mt.t2 === "number" ? mt.t2 : null;
      rows.push({
        ...seasonCols(m), bracket: r.bracket, round: mt.r, match: mt.m, place: mt.p ?? null, label: r.label, weeks: r.weeks.join("-") || null,
        t1_roster_id: t1, t1_manager: T(t1)?.manager ?? null, t1_team: T(t1)?.name ?? null, t1_points: t1 != null && r.pts ? r.pts[t1] : null, t1_from: from(mt.t1_from),
        t2_roster_id: t2, t2_manager: T(t2)?.manager ?? null, t2_team: T(t2)?.name ?? null, t2_points: t2 != null && r.pts ? r.pts[t2] : null, t2_from: from(mt.t2_from),
        winner_roster_id: r.winner, winner_manager: T(r.winner)?.manager ?? null, loser_manager: T(r.loser)?.manager ?? null, winner_by: r.winnerBy, sleeper_w: mt.w, sleeper_l: mt.l,
        margin: r.pts && r.winner != null && r.loser != null ? Math.round((r.pts[r.winner] - r.pts[r.loser]) * 100) / 100 : null,
        is_final: r.bracket === "winners" && mt.p === 1, is_toilet_bowl: r.bracket === "losers" && mt.p === 1, is_played: r.winner != null,
      });
    }
    return rows;
  },
  defaultView: view({ columns: ["season", "bracket", "round", "label", "t1_manager", "t1_points", "t2_manager", "t2_points", "winner_manager", "margin"], sort: [["season", "desc"], ["bracket", "desc"], ["round", "asc"]] }),
  presets: [
    { name: "All bracket games", config: view({ columns: ["season", "bracket", "round", "label", "t1_manager", "t1_points", "t2_manager", "t2_points", "winner_manager", "margin"], sort: [["season", "desc"], ["bracket", "desc"], ["round", "asc"]] }) },
    { name: "Championship games", config: view({ columns: ["season", "t1_manager", "t1_points", "t2_manager", "t2_points", "winner_manager", "margin", "weeks"], filter: [["is_final", "==", true]], sort: [["season", "desc"]] }) },
    { name: "Playoff wins by manager", config: view({ plugin: "Y Bar", group_by: ["winner_manager"], columns: ["match"], aggregates: { match: "count" }, filter: [["bracket", "==", "winners"], ["is_played", "==", true]], sort: [["match", "desc"]] }) },
  ],
};
