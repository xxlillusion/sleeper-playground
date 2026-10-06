import type { Row } from "../../perspective/engine";
import { avatarUrl } from "../teams";
import { r2 } from "../weeks";
import { div, draftInfo, pct, rec, sosFor, txStats, view, type TableDef } from "./common";
import { lineupAgg } from "./lineups";
import { pickupAgg } from "./pickups";

interface Agg {
  uid: string; name: string; avatar: string | null; seasons: number[]; coSeasons: number[]; commish: number;
  titles: number; runnerUps: number; thirds: number; lasts: number; playoffs: number; finishes: number[];
  reg: { w: number; l: number; t: number; pf: number; pa: number; g: number }; ap: { w: number; l: number; t: number }; exp: number; med: { w: number; l: number };
  highs: number; lows: number; po: { w: number; l: number }; co: { w: number; l: number }; official: { w: number; l: number; t: number }; moves: number;
  tx: { trades: number; waivers: number; fa: number; faab: number; bid: number } | null; dr: { picks: number; auction: number; keepers: number } | null;
  bestW: { n: number; span: string }; bestL: { n: number; span: string }; cur: { r: string; n: number } | null; start?: string;
  lu: { actual: number; optimal: number; left: number; lost: number } | null; sos: { p: number; d: number; n: number };
}

export const managers: TableDef = {
  id: "managers",
  label: "Managers",
  description: "One row per Sleeper account that has owned a team: tenure, titles, all-time record, luck, streaks and activity across every season.",
  grain: "manager",
  schema: {
    user_id: "string", display_name: "string", avatar_url: "string", is_current_member: "boolean", is_commissioner_now: "boolean", commissioner_seasons: "integer",
    seasons_played: "integer", first_season: "integer", last_season: "integer", seasons_list: "string", seasons_as_co_owner: "integer",
    titles: "integer", runner_ups: "integer", third_places: "integer", last_places: "integer", playoff_appearances: "integer", playoff_rate: "float",
    reg_games: "integer", reg_wins: "integer", reg_losses: "integer", reg_ties: "integer", reg_record: "string", reg_win_pct: "float", reg_pf: "float", reg_pa: "float", reg_ppg: "float",
    all_play_wins: "integer", all_play_losses: "integer", all_play_ties: "integer", all_play_pct: "float", expected_wins: "float", luck: "float",
    median_wins: "integer", median_losses: "integer", weekly_highs: "integer", weekly_lows: "integer",
    longest_win_streak: "integer", longest_win_streak_span: "string", longest_loss_streak: "integer", longest_loss_streak_span: "string", current_streak: "string",
    official_wins: "integer", official_losses: "integer", official_ties: "integer",
    playoff_wins: "integer", playoff_losses: "integer", consolation_wins: "integer", consolation_losses: "integer", best_finish: "integer", worst_finish: "integer", avg_finish: "float",
    total_moves: "integer", trades: "integer", waiver_moves: "integer", free_agent_adds: "integer", faab_spent: "integer", biggest_faab_bid: "integer", draft_picks_made: "integer", auction_dollars_spent: "integer", keepers_used: "integer",
    efficiency_pct: "float", points_left_on_bench: "float", games_lost_to_lineup: "integer",
    opp_season_ppg_avg: "float", opp_pts_vs_their_avg: "float",
    pickup_starter_points: "float", faab_points_per_dollar: "float", best_pickup: "string", best_pickup_points: "float",
  },
  build({ ds }) {
    const agg: Record<string, Agg> = {};
    const get = (uid: string, name: string, avatar: string | null): Agg => (agg[uid] ??= {
      uid, name, avatar, seasons: [], coSeasons: [], commish: 0, titles: 0, runnerUps: 0, thirds: 0, lasts: 0, playoffs: 0, finishes: [],
      reg: { w: 0, l: 0, t: 0, pf: 0, pa: 0, g: 0 }, ap: { w: 0, l: 0, t: 0 }, exp: 0, med: { w: 0, l: 0 }, highs: 0, lows: 0, po: { w: 0, l: 0 }, co: { w: 0, l: 0 },
      official: { w: 0, l: 0, t: 0 }, moves: 0, tx: null, dr: null, bestW: { n: 0, span: "" }, bestL: { n: 0, span: "" }, cur: null,
      lu: null, sos: { p: 0, d: 0, n: 0 },
    });
    const latest = ds.models[ds.models.length - 1];
    const lagg = lineupAgg(ds), pagg = pickupAgg(ds);
    for (const m of ds.models) {
      const sum = m.summary, tx = txStats(m.raw), dr = draftInfo(m.raw), sos = sosFor(m);
      for (const t of Object.values(m.teams)) {
        if (t.isOpen) continue;
        const a = get(t.uid, t.manager, avatarUrl(t.user?.avatar));
        a.name = t.manager; a.avatar = avatarUrl(t.user?.avatar) ?? a.avatar;   // newest season wins
        a.seasons.push(m.season);
        if (t.isCommish) a.commish++;
        if (sum.champ === t.rid) a.titles++;
        if (sum.runner === t.rid) a.runnerUps++;
        if (sum.third === t.rid) a.thirds++;
        if (m.complete && sum.lastBy === "toilet" && sum.last === t.rid) a.lasts++;
        if (m.complete && sum.inPlayoffs.has(t.rid)) a.playoffs++;
        if (m.complete && sum.finalRank[t.rid]) a.finishes.push(sum.finalRank[t.rid].rank);
        const st = m.teamStats[t.rid];
        a.reg.w += st.h2h.w; a.reg.l += st.h2h.l; a.reg.t += st.h2h.t; a.reg.pf += st.pf; a.reg.pa += st.pa; a.reg.g += st.g;
        a.ap.w += st.ap.w; a.ap.l += st.ap.l; a.ap.t += st.ap.t; a.exp += st.exp; a.med.w += st.med.w; a.med.l += st.med.l; a.highs += st.highs; a.lows += st.lows;
        a.po.w += st.po.w; a.po.l += st.po.l; a.co.w += st.co.w; a.co.l += st.co.l;
        const s = t.roster.settings || {}; a.official.w += s.wins || 0; a.official.l += s.losses || 0; a.official.t += s.ties || 0; a.moves += s.total_moves || 0;
        if (tx) { a.tx ??= { trades: 0, waivers: 0, fa: 0, faab: 0, bid: 0 }; const x = tx[t.rid]; if (x) { a.tx.trades += x.trades; a.tx.waivers += x.waivers; a.tx.fa += x.freeAgents; a.tx.faab += x.faab; a.tx.bid = Math.max(a.tx.bid, x.biggestBid); } }
        if (dr) { a.dr ??= { picks: 0, auction: 0, keepers: 0 }; const x = dr[t.rid]; if (x) { a.dr.picks += x.picks; a.dr.auction += x.auction; a.dr.keepers += x.keepers; } }
        const la = lagg.get(`${m.sid}:${t.rid}`);
        if (la) { a.lu ??= { actual: 0, optimal: 0, left: 0, lost: 0 }; a.lu.actual += la.actual; a.lu.optimal += la.optimal; a.lu.left += la.left; a.lu.lost += la.lostToLineup; }
        const so = sos[t.rid];
        if (so.oppPpgAvg != null) { a.sos.p += so.oppPpgAvg * so.n; a.sos.d += (so.oppVsAvg ?? 0) * so.n; a.sos.n += so.n; }
        for (const co of t.coOwners) { const c = get(co.user_id, co.display_name, avatarUrl(co.avatar)); c.coSeasons.push(m.season); }
      }
      // streaks carried across seasons, regular + playoff games in order
      for (const g of m.games) {
        if (g.kind === "consolation") continue;
        for (const [me, op] of [[g.a, g.b], [g.b, g.a]] as const) {
          const a = agg[me.uid]; if (!a) continue;
          const r = me.pts > op.pts ? "W" : me.pts < op.pts ? "L" : "T";
          const when = `${m.season} wk ${g.week}`;
          if (a.cur && a.cur.r === r) a.cur.n++; else { a.cur = { r, n: 1 }; a.start = when; }
          const span = a.cur.n === 1 ? when : `${a.start ?? when} to ${when}`;
          if (r === "W" && a.cur.n > a.bestW.n) a.bestW = { n: a.cur.n, span };
          if (r === "L" && a.cur.n > a.bestL.n) a.bestL = { n: a.cur.n, span };
        }
      }
    }
    const current = new Set(latest ? Object.values(latest.teams).map(t => t.uid) : []);
    return Object.values(agg).sort((a, b) => b.seasons.length - a.seasons.length || b.titles - a.titles || a.name.localeCompare(b.name)).map(a => {
      const seasons = [...new Set(a.seasons)].sort();
      const pk = pagg.get(a.uid) ?? null;
      return {
        user_id: a.uid, display_name: a.name, avatar_url: a.avatar, is_current_member: current.has(a.uid), is_commissioner_now: !!latest && Object.values(latest.teams).some(t => t.uid === a.uid && t.isCommish), commissioner_seasons: a.commish,
        seasons_played: seasons.length, first_season: seasons[0] ?? null, last_season: seasons[seasons.length - 1] ?? null, seasons_list: seasons.join(","), seasons_as_co_owner: new Set(a.coSeasons).size,
        titles: a.titles, runner_ups: a.runnerUps, third_places: a.thirds, last_places: a.lasts, playoff_appearances: a.playoffs,
        playoff_rate: (() => { const done = ds.models.filter(m => m.complete && Object.values(m.teams).some(t => t.uid === a.uid)).length; return done ? r2(a.playoffs / done * 100) : null; })(),
        reg_games: a.reg.g, reg_wins: a.reg.w, reg_losses: a.reg.l, reg_ties: a.reg.t, reg_record: rec(a.reg.w, a.reg.l, a.reg.t), reg_win_pct: pct(a.reg.w, a.reg.l, a.reg.t),
        reg_pf: r2(a.reg.pf), reg_pa: r2(a.reg.pa), reg_ppg: div(a.reg.pf, a.reg.g),
        all_play_wins: a.ap.w, all_play_losses: a.ap.l, all_play_ties: a.ap.t, all_play_pct: pct(a.ap.w, a.ap.l, a.ap.t), expected_wins: r2(a.exp), luck: a.reg.g ? r2(a.reg.w + a.reg.t / 2 - a.exp) : null,
        median_wins: a.med.w, median_losses: a.med.l, weekly_highs: a.highs, weekly_lows: a.lows,
        longest_win_streak: a.bestW.n, longest_win_streak_span: a.bestW.span || null, longest_loss_streak: a.bestL.n, longest_loss_streak_span: a.bestL.span || null,
        current_streak: a.cur && current.has(a.uid) ? `${a.cur.r}${a.cur.n}` : null,
        official_wins: a.official.w, official_losses: a.official.l, official_ties: a.official.t,
        playoff_wins: a.po.w, playoff_losses: a.po.l, consolation_wins: a.co.w, consolation_losses: a.co.l,
        best_finish: a.finishes.length ? Math.min(...a.finishes) : null, worst_finish: a.finishes.length ? Math.max(...a.finishes) : null, avg_finish: a.finishes.length ? r2(a.finishes.reduce((x, y) => x + y, 0) / a.finishes.length) : null,
        total_moves: a.moves, trades: a.tx?.trades ?? null, waiver_moves: a.tx?.waivers ?? null, free_agent_adds: a.tx?.fa ?? null, faab_spent: a.tx?.faab ?? null, biggest_faab_bid: a.tx?.bid ?? null,
        draft_picks_made: a.dr?.picks ?? null, auction_dollars_spent: a.dr?.auction ?? null, keepers_used: a.dr?.keepers ?? null,
        efficiency_pct: a.lu && a.lu.optimal ? r2(a.lu.actual / a.lu.optimal * 100) : null, points_left_on_bench: a.lu ? r2(a.lu.left) : null, games_lost_to_lineup: a.lu ? a.lu.lost : null,
        opp_season_ppg_avg: a.sos.n ? r2(a.sos.p / a.sos.n) : null, opp_pts_vs_their_avg: a.sos.n ? r2(a.sos.d / a.sos.n) : null,
        pickup_starter_points: pk ? r2(pk.starterPts) : null, faab_points_per_dollar: pk && pk.bids ? r2(pk.starterPts / pk.bids) : null,
        best_pickup: pk?.best?.name ?? null, best_pickup_points: pk?.best?.pts ?? null,
      } as Row;
    });
  },
  defaultView: view({ columns: ["display_name", "seasons_played", "first_season", "titles", "runner_ups", "last_places", "playoff_appearances", "reg_record", "reg_win_pct", "reg_ppg", "all_play_pct", "luck", "longest_win_streak"], sort: [["reg_win_pct", "desc"]] }),
  presets: [
    { name: "All-time standings", config: view({ columns: ["display_name", "seasons_played", "first_season", "titles", "runner_ups", "last_places", "playoff_appearances", "reg_record", "reg_win_pct", "reg_ppg", "all_play_pct", "luck", "longest_win_streak"], sort: [["reg_win_pct", "desc"]] }) },
    { name: "Titles and finishes", config: view({ plugin: "Y Bar", group_by: ["display_name"], columns: ["titles", "runner_ups", "third_places", "last_places"], aggregates: { titles: "sum", runner_ups: "sum", third_places: "sum", last_places: "sum" }, sort: [["titles", "desc"]] }) },
    { name: "Luck vs win percentage", config: view({ plugin: "X/Y Scatter", group_by: ["display_name"], columns: ["all_play_pct", "reg_win_pct", null, null, "display_name"], aggregates: { all_play_pct: "any", reg_win_pct: "any", display_name: "any" } }) },
    { name: "Tenure", config: view({ columns: ["display_name", "is_current_member", "first_season", "last_season", "seasons_played", "seasons_list", "seasons_as_co_owner", "commissioner_seasons"], sort: [["first_season", "asc"]] }) },
    { name: "Lineups, schedule and waivers", config: view({ columns: ["display_name", "efficiency_pct", "points_left_on_bench", "games_lost_to_lineup", "opp_season_ppg_avg", "opp_pts_vs_their_avg", "faab_spent", "pickup_starter_points", "faab_points_per_dollar", "best_pickup", "best_pickup_points"], sort: [["efficiency_pct", "desc"]] }) },
  ],
};
