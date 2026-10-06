import type { Row } from "../../perspective/engine";
import { paOf, pfOf, ppOf, r2 } from "../weeks";
import { div, draftInfo, nameOf, pct, rec, seasonCols, teamCols, txStats, view, type TableDef } from "./common";

export const teams: TableDef = {
  id: "teams",
  label: "Teams",
  description: "One row per team per season: the official record, points, luck, playoff result and final rank. This is the standings table.",
  grain: "team-season",
  schema: {
    league_id: "string", season: "integer", league_name: "string", roster_id: "integer", user_id: "string", manager: "string", manager_name_that_season: "string", team: "string",
    is_open_slot: "boolean", is_commissioner: "boolean", co_owners: "string", co_owner_count: "integer", division: "integer", division_name: "string",
    is_complete: "boolean", is_live: "boolean",
    wins: "integer", losses: "integer", ties: "integer", record: "string", win_pct: "float", record_string: "string", streak: "string",
    pf: "float", pa: "float", max_pf: "float", lineup_efficiency: "float", total_moves: "integer", waiver_budget_used: "integer", waiver_position: "integer",
    reg_rank: "integer", points_rank: "integer",
    h2h_wins: "integer", h2h_losses: "integer", h2h_ties: "integer", games_played: "integer", ppg: "float", pa_pg: "float",
    all_play_wins: "integer", all_play_losses: "integer", all_play_ties: "integer", all_play_pct: "float", expected_wins: "float", luck: "float",
    median_wins: "integer", median_losses: "integer", weekly_highs: "integer", weekly_lows: "integer", high_score: "float", low_score: "float",
    bench_points_total: "float", longest_win_streak: "integer", longest_loss_streak: "integer",
    made_playoffs: "boolean", playoff_seed: "integer", in_consolation: "boolean", playoff_wins: "integer", playoff_losses: "integer",
    consolation_wins: "integer", consolation_losses: "integer", playoff_points: "float", eliminated_round: "integer",
    playoff_finish: "string", final_rank: "integer", final_rank_source: "string", is_champion: "boolean", is_runner_up: "boolean", is_last_place: "boolean",
    trades: "integer", waiver_claims: "integer", free_agent_adds: "integer", faab_spent: "integer", faab_received: "integer", failed_waivers: "integer",
    draft_slot: "integer", draft_picks: "integer", auction_spent: "integer", keepers: "integer", drafted_by: "string", owner_changed_since_draft: "boolean",
  },
  build({ ds }) {
    const rows: Row[] = [];
    for (const m of ds.models) {
      const sum = m.summary, tx = txStats(m.raw), dr = draftInfo(m.raw);
      const seeds = Object.values(m.teams).filter(t => sum.inPlayoffs.has(t.rid)).sort((a, b) => sum.regRank[a.rid] - sum.regRank[b.rid]);
      const userName = (uid: string | null) => (uid ? nameOf(ds, uid, m.raw.users.find(u => u.user_id === uid)?.display_name ?? uid) : null);
      for (const t of Object.values(m.teams)) {
        const r = t.roster, s = r.settings || {}, st = m.teamStats[t.rid], fr = sum.finalRank[t.rid];
        const pf = pfOf(r), pa = paOf(r), mx = ppOf(r);
        const w = s.wins || 0, l = s.losses || 0, ti = s.ties || 0;
        const txs = tx?.[t.rid], di = dr?.[t.rid];
        const draftedBy = di?.draftedByUid ?? null;
        rows.push({
          ...seasonCols(m), ...teamCols(ds, t, t.rid, m.sid), manager_name_that_season: t.isOpen ? null : t.manager,
          is_open_slot: t.isOpen, is_commissioner: t.isCommish, co_owners: t.coOwners.map(u => u.display_name).join(", "), co_owner_count: t.coOwners.length,
          division: s.division ?? null, division_name: s.division != null ? m.raw.league.metadata?.[`division_${s.division}`] ?? null : null,
          is_complete: m.complete, is_live: m.raw.isLive,
          wins: w, losses: l, ties: ti, record: rec(w, l, ti), win_pct: pct(w, l, ti), record_string: r.metadata?.record ?? null, streak: r.metadata?.streak ?? null,
          pf: r2(pf), pa: r2(pa), max_pf: mx ? r2(mx) : null, lineup_efficiency: mx ? r2(pf / mx * 100) : null,
          total_moves: s.total_moves ?? 0, waiver_budget_used: s.waiver_budget_used ?? null, waiver_position: s.waiver_position ?? null,
          reg_rank: sum.regRank[t.rid] ?? null, points_rank: sum.pointsRank[t.rid] ?? null,
          h2h_wins: st.h2h.w, h2h_losses: st.h2h.l, h2h_ties: st.h2h.t, games_played: st.g, ppg: div(st.pf, st.g), pa_pg: div(st.pa, st.g),
          all_play_wins: st.ap.w, all_play_losses: st.ap.l, all_play_ties: st.ap.t, all_play_pct: pct(st.ap.w, st.ap.l, st.ap.t),
          expected_wins: r2(st.exp), luck: st.g ? r2(st.h2h.w + st.h2h.t / 2 - st.exp) : null,
          median_wins: st.med.w, median_losses: st.med.l, weekly_highs: st.highs, weekly_lows: st.lows, high_score: st.high, low_score: st.low,
          bench_points_total: st.bench, longest_win_streak: st.wStreak, longest_loss_streak: st.lStreak,
          made_playoffs: sum.inPlayoffs.has(t.rid), playoff_seed: sum.inPlayoffs.has(t.rid) ? seeds.findIndex(x => x.rid === t.rid) + 1 : null,
          in_consolation: sum.inConsolation.has(t.rid), playoff_wins: st.po.w, playoff_losses: st.po.l, consolation_wins: st.co.w, consolation_losses: st.co.l,
          playoff_points: sum.playoffPoints[t.rid] != null ? r2(sum.playoffPoints[t.rid]) : null, eliminated_round: sum.eliminatedRound[t.rid] ?? null,
          playoff_finish: !m.complete ? null : fr?.source === "bracket" ? fr.finish : sum.inPlayoffs.has(t.rid) ? `Lost in round ${sum.eliminatedRound[t.rid] ?? "?"}` : "Missed playoffs",
          final_rank: m.complete ? fr?.rank ?? null : null, final_rank_source: m.complete ? fr?.source ?? null : null,
          is_champion: sum.champ === t.rid, is_runner_up: sum.runner === t.rid, is_last_place: m.complete && sum.last === t.rid,
          trades: txs ? txs.trades : tx ? 0 : null, waiver_claims: txs ? txs.waivers : tx ? 0 : null, free_agent_adds: txs ? txs.freeAgents : tx ? 0 : null,
          faab_spent: txs ? txs.faab : tx ? 0 : null, faab_received: txs ? txs.faabIn : tx ? 0 : null, failed_waivers: txs ? txs.failed : tx ? 0 : null,
          draft_slot: di?.slot ?? null, draft_picks: di ? di.picks : dr ? 0 : null, auction_spent: di ? di.auction : dr ? 0 : null, keepers: di ? di.keepers : dr ? 0 : null,
          drafted_by: userName(draftedBy), owner_changed_since_draft: draftedBy ? draftedBy !== (t.user?.user_id ?? null) : null,
        });
      }
    }
    return rows;
  },
  defaultView: view({ columns: ["season", "final_rank", "manager", "team", "record", "pf", "pa", "all_play_pct", "luck", "playoff_finish"], sort: [["season", "desc"], ["final_rank", "asc"]] }),
  presets: [
    { name: "Standings by season", config: view({ columns: ["season", "final_rank", "manager", "team", "record", "pf", "pa", "all_play_pct", "luck", "playoff_finish"], sort: [["season", "desc"], ["final_rank", "asc"]] }) },
    { name: "Points for by manager and season", config: view({ plugin: "Y Bar", group_by: ["manager"], split_by: ["season"], columns: ["pf"], aggregates: { pf: "sum" }, sort: [["pf", "desc"]] }) },
    { name: "Luck: real wins vs expected", config: view({ plugin: "X/Y Scatter", group_by: ["manager", "season"], columns: ["expected_wins", "wins", null, null, "manager"], aggregates: { expected_wins: "sum", wins: "sum", manager: "any" } }) },
    { name: "Final rank heatmap", config: view({ plugin: "Datagrid", group_by: ["manager"], split_by: ["season"], columns: ["final_rank"], aggregates: { final_rank: "any" }, plugin_config: {}, columns_config: { final_rank: { number_color_mode: "gradient" } } }) },
  ],
};
