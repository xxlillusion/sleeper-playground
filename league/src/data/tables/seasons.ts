import type { Row } from "../../perspective/engine";
import { r2 } from "../weeks";
import { nameOf, rec, seasonCols, starterSlots, txStats, view, type TableDef } from "./common";

const leagueType = (t?: number) => ({ 0: "Redraft", 1: "Keeper", 2: "Dynasty" } as Record<number, string>)[t ?? 0] ?? "Redraft";
const scoringLabel = (sc: Record<string, number> = {}) => { const r = sc.rec ?? 0; return r >= 1 ? "PPR" : r >= 0.5 ? "Half PPR" : r > 0 ? `${r} PPR` : "Standard"; };
const waiverLabel = (t?: number) => ({ 0: "Rolling", 1: "Reverse standings", 2: "FAAB" } as Record<number, string>)[t ?? 0] ?? "Rolling";
const roundTypeLabel = (t?: number) => ({ 0: "1 week per round", 1: "2-week final", 2: "2 weeks per round" } as Record<number, string>)[t ?? 0] ?? "1 week per round";

export const seasons: TableDef = {
  id: "seasons",
  label: "Seasons",
  description: "One row per season: format, scoring, roster slots, playoff setup, waivers, draft, and who won, finished second and last.",
  grain: "season",
  schema: {
    league_id: "string", season: "integer", league_name: "string", previous_league_id: "string", status: "string", is_live: "boolean", is_complete: "boolean", is_abandoned: "boolean",
    num_teams: "integer", open_slots: "integer", commissioner: "string",
    league_type: "string", best_ball: "boolean", max_keepers: "integer", divisions: "integer", median_games: "boolean", trade_deadline: "integer", taxi_slots: "integer", reserve_slots: "integer",
    scoring_label: "string", rec: "float", pass_td: "float", pass_yd: "float", pass_int: "float", rush_yd: "float", rush_td: "float", rec_yd: "float", rec_td: "float", fum_lost: "float", bonus_rec_te: "float",
    roster_positions: "string", starter_slots: "integer", bench_slots: "integer", slot_qb: "integer", slot_rb: "integer", slot_wr: "integer", slot_te: "integer", slot_flex: "integer", slot_super_flex: "integer", slot_rec_flex: "integer", slot_k: "integer", slot_def: "integer", slot_idp: "integer",
    total_weeks: "integer", regular_season_weeks: "integer", playoff_week_start: "integer", playoff_teams: "integer", playoff_round_type: "integer", playoff_round_type_label: "string", last_week_loaded: "integer", last_scored_week: "integer", weeks_with_scores: "integer",
    waiver_type: "integer", waiver_type_label: "string", waiver_budget: "integer", waiver_clear_days: "integer", daily_waivers: "boolean",
    draft_id: "string", draft_type: "string", draft_status: "string", draft_rounds: "integer", draft_date: "datetime", draft_picks_made: "integer",
    champion_user_id: "string", champion: "string", champion_team: "string", champion_record: "string", runner_up_user_id: "string", runner_up: "string", runner_up_team: "string", third_place: "string",
    final_weeks: "string", final_score_champion: "float", final_score_runner_up: "float",
    last_place_user_id: "string", last_place: "string", last_place_team: "string", last_place_source: "string", toilet_bowl_weeks: "string",
    best_record: "string", best_record_wlt: "string", most_points: "string", most_points_pf: "float",
    games_played: "integer", avg_team_score: "float", high_score: "float", high_score_manager: "string", high_score_week: "integer", low_score: "float", low_score_manager: "string", low_score_week: "integer",
    transactions_count: "integer", trades_count: "integer", waiver_claims: "integer", faab_spent_total: "integer",
  },
  build({ ds }) {
    return ds.models.map(m => {
      const lg = m.raw.league, s = lg.settings || {}, sc = lg.scoring_settings || {}, sum = m.summary;
      const pos = lg.roster_positions || [], starters = starterSlots(pos);
      const count = (p: string) => pos.filter(x => x === p).length;
      const t = (rid: number | null) => { const x = rid != null ? m.teams[rid] : undefined; return x ? { ...x, manager: nameOf(ds, x.uid, x.manager) } : undefined; };
      const byRecord = Object.values(m.teams).sort((a, b) => sum.regRank[a.rid] - sum.regRank[b.rid])[0];
      const byPts = Object.values(m.teams).sort((a, b) => sum.pointsRank[a.rid] - sum.pointsRank[b.rid])[0];
      const reg = m.weekly.filter(w => w.kind === "regular" && w.final && w.pts > 0);
      const hi = reg.length ? reg.reduce((a, b) => (b.pts > a.pts ? b : a)) : null, lo = reg.length ? reg.reduce((a, b) => (b.pts < a.pts ? b : a)) : null;
      const draft = m.raw.drafts?.slice().sort((a, b) => (a.start_time || 0) - (b.start_time || 0))[0] ?? null;
      const tx = txStats(m.raw);
      const txAll = m.raw.transactions ? Object.values(m.raw.transactions).flat() : null;
      const champ = t(sum.champ), run = t(sum.runner), last = t(sum.last);
      return {
        ...seasonCols(m), previous_league_id: lg.previous_league_id ?? null, status: lg.status, is_live: m.raw.isLive, is_complete: m.complete, is_abandoned: m.raw.isAbandoned,
        num_teams: s.num_teams ?? lg.total_rosters, open_slots: Object.values(m.teams).filter(x => x.isOpen).length,
        commissioner: nameOf(ds, m.raw.users.find(u => u.is_owner)?.user_id, "") || null,
        league_type: leagueType(s.type), best_ball: s.best_ball === 1, max_keepers: s.max_keepers ?? null, divisions: s.divisions ?? null, median_games: s.league_average_match === 1,
        trade_deadline: s.trade_deadline ?? null, taxi_slots: s.taxi_slots ?? null, reserve_slots: s.reserve_slots ?? null,
        scoring_label: scoringLabel(sc), rec: sc.rec ?? null, pass_td: sc.pass_td ?? null, pass_yd: sc.pass_yd ?? null, pass_int: sc.pass_int ?? null, rush_yd: sc.rush_yd ?? null, rush_td: sc.rush_td ?? null,
        rec_yd: sc.rec_yd ?? null, rec_td: sc.rec_td ?? null, fum_lost: sc.fum_lost ?? null, bonus_rec_te: sc.bonus_rec_te ?? null,
        roster_positions: pos.join(","), starter_slots: starters.length, bench_slots: count("BN"),
        slot_qb: count("QB"), slot_rb: count("RB"), slot_wr: count("WR"), slot_te: count("TE"), slot_flex: count("FLEX"), slot_super_flex: count("SUPER_FLEX"), slot_rec_flex: count("REC_FLEX"),
        slot_k: count("K"), slot_def: count("DEF"), slot_idp: pos.filter(x => ["DL", "LB", "DB", "IDP_FLEX"].includes(x)).length,
        total_weeks: m.raw.weeksRequested.length ? Math.max(...m.raw.weeksRequested) : null, regular_season_weeks: s.playoff_week_start ? s.playoff_week_start - 1 : null,
        playoff_week_start: s.playoff_week_start ?? null, playoff_teams: s.playoff_teams ?? null, playoff_round_type: s.playoff_round_type ?? 0, playoff_round_type_label: roundTypeLabel(s.playoff_round_type),
        last_week_loaded: m.raw.weeksRequested.length ? Math.max(...m.raw.weeksRequested) : null, last_scored_week: m.raw.finalThrough || null, weeks_with_scores: new Set(m.weekly.map(w => w.week)).size,
        waiver_type: s.waiver_type ?? 0, waiver_type_label: waiverLabel(s.waiver_type), waiver_budget: s.waiver_type === 2 ? s.waiver_budget ?? 100 : null, waiver_clear_days: s.waiver_clear_days ?? null, daily_waivers: s.daily_waivers === 1,
        draft_id: draft?.draft_id ?? null, draft_type: draft?.type ?? null, draft_status: draft?.status ?? null, draft_rounds: draft?.settings?.rounds ?? null, draft_date: draft?.start_time ?? null,
        draft_picks_made: draft ? (m.raw.picks[draft.draft_id] || []).length : null,
        champion_user_id: champ?.uid ?? null, champion: champ?.manager ?? null, champion_team: champ?.name ?? null, champion_record: champ ? rec(champ.roster.settings.wins || 0, champ.roster.settings.losses || 0, champ.roster.settings.ties || 0) : null,
        runner_up_user_id: run?.uid ?? null, runner_up: run?.manager ?? null, runner_up_team: run?.name ?? null, third_place: t(sum.third)?.manager ?? null,
        final_weeks: sum.finalWeeks.join("-") || null, final_score_champion: sum.finalScore?.[0] ?? null, final_score_runner_up: sum.finalScore?.[1] ?? null,
        last_place_user_id: last?.uid ?? null, last_place: last?.manager ?? null, last_place_team: last?.name ?? null, last_place_source: sum.lastBy, toilet_bowl_weeks: sum.toiletWeeks.join("-") || null,
        best_record: byRecord ? nameOf(ds, byRecord.uid, byRecord.manager) : null, best_record_wlt: byRecord ? rec(byRecord.roster.settings.wins || 0, byRecord.roster.settings.losses || 0, byRecord.roster.settings.ties || 0) : null,
        most_points: byPts ? nameOf(ds, byPts.uid, byPts.manager) : null, most_points_pf: byPts ? r2((byPts.roster.settings.fpts || 0) + (byPts.roster.settings.fpts_decimal || 0) / 100) : null,
        games_played: m.games.filter(g => g.kind !== "consolation").length, avg_team_score: reg.length ? r2(reg.reduce((a, w) => a + w.pts, 0) / reg.length) : null,
        high_score: hi?.pts ?? null, high_score_manager: hi ? nameOf(ds, hi.uid, hi.manager) : null, high_score_week: hi?.week ?? null, low_score: lo?.pts ?? null, low_score_manager: lo ? nameOf(ds, lo.uid, lo.manager) : null, low_score_week: lo?.week ?? null,
        transactions_count: txAll ? txAll.filter(x => x.status === "complete").length : null, trades_count: txAll ? txAll.filter(x => x.status === "complete" && x.type === "trade").length : null,
        waiver_claims: txAll ? txAll.filter(x => x.status === "complete" && x.type === "waiver").length : null, faab_spent_total: tx ? Object.values(tx).reduce((a, x) => a + x.faab, 0) : null,
      } as Row;
    });
  },
  defaultView: view({ columns: ["season", "league_name", "num_teams", "champion", "champion_team", "runner_up", "last_place", "avg_team_score", "high_score", "high_score_manager", "scoring_label", "playoff_teams"], sort: [["season", "desc"]] }),
  presets: [
    { name: "Season results", config: view({ columns: ["season", "league_name", "num_teams", "champion", "champion_team", "runner_up", "last_place", "avg_team_score", "high_score", "high_score_manager", "scoring_label", "playoff_teams"], sort: [["season", "desc"]] }) },
    { name: "Rule changes", config: view({ columns: ["season", "league_type", "scoring_label", "rec", "pass_td", "roster_positions", "playoff_teams", "playoff_week_start", "playoff_round_type_label", "waiver_type_label", "waiver_budget", "draft_type"], sort: [["season", "asc"]] }) },
    { name: "Scoring by season", config: view({ plugin: "Y Bar", group_by: ["season"], columns: ["avg_team_score"], aggregates: { avg_team_score: "any" } }) },
  ],
};
