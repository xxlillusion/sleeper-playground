/* One season turned into games, weekly scores and per-team stats. Pure: the same raw data always gives the same model. */
import type { Matchup } from "../api/types";
import type { SeasonRaw } from "./season";
import { seasonSummary, type SeasonSummary } from "./summary";
import { buildTeams, type Team } from "./teams";
import { r2, roundWeeks } from "./weeks";

export interface Side { rid: number; uid: string; manager: string; team: string; pts: number }
export type GameKind = "regular" | "playoff" | "consolation";
export interface Game {
  id: string; sid: string; season: number;
  week: number; weekEnd: number; weeks: number[]; multi: boolean;
  kind: GameKind; label: string; bracket: "winners" | "losers" | null;
  round: number | null; match: number | null; place: number | null; matchupId: number | null;
  a: Side; b: Side;
}
export interface WeekScore {
  sid: string; season: number; week: number; kind: "regular" | "playoff"; final: boolean;
  rid: number; uid: string; manager: string; team: string;
  pts: number; ptsRaw: number; bench: number | null; total: number | null;
  startersCount: number; emptySlots: number;
  matchupId: number | null; oppRid: number | null; oppPts: number | null; result: "W" | "L" | "T" | null;
  rank: number | null; n: number; median: number | null; avg: number | null;
  apW: number; apL: number; apT: number; exp: number;
  inWb: boolean; inLb: boolean;
}
export interface WL { w: number; l: number; t: number }
export interface TeamSeasonStats {
  rid: number; uid: string;
  h2h: WL; pf: number; pa: number; g: number;
  ap: WL; exp: number; med: WL; highs: number; lows: number; high: number | null; low: number | null;
  bench: number | null; po: WL; co: WL; wStreak: number; lStreak: number;
}
export interface SeasonModel {
  raw: SeasonRaw; sid: string; season: number; name: string;
  teams: Record<number, Team>; summary: SeasonSummary;
  games: Game[]; weekly: WeekScore[]; teamStats: Record<number, TeamSeasonStats>;
  pws: number; complete: boolean;
}

const score = (m: Matchup) => (m.custom_points ?? m.points) || 0;
const wl = (): WL => ({ w: 0, l: 0, t: 0 });

export function buildSeasonModel(raw: SeasonRaw): SeasonModel {
  const lg = raw.league, sid = lg.league_id, season = +lg.season;
  const teams = buildTeams(raw.users, raw.rosters, sid);
  const summary = seasonSummary(raw, teams);
  const pws = lg.settings?.playoff_week_start || 99;
  const side = (rid: number, pts: number): Side => {
    const t = teams[rid];
    return { rid, uid: t?.uid ?? `open:${sid}:${rid}`, manager: t?.manager ?? "Open slot", team: t?.name ?? `Team ${rid}`, pts };
  };

  // Which bracket games touch which weeks, for the in-bracket flags
  const wbWeeks = new Map<number, Set<number>>(), lbWeeks = new Map<number, Set<number>>();
  const mark = (br: typeof raw.wb, into: Map<number, Set<number>>) => {
    if (!br.length) return;
    const last = Math.max(...br.map(m => m.r));
    for (const m of br) for (const w of roundWeeks(lg, m.r, last)) {
      const s = into.get(w) ?? new Set<number>(); into.set(w, s);
      if (typeof m.t1 === "number") s.add(m.t1); if (typeof m.t2 === "number") s.add(m.t2);
    }
  };
  mark(raw.wb, wbWeeks); mark(raw.lb, lbWeeks);

  const weekly: WeekScore[] = [], games: Game[] = [];
  const weeks = Object.keys(raw.matchups).map(Number).sort((a, b) => a - b);
  for (const w of weeks) {
    const rows = raw.matchups[w];
    if (!rows.some(m => score(m) > 0)) continue;
    const final = w <= raw.finalThrough;
    const kind = w >= pws ? "playoff" : "regular";
    const byMatch = new Map<number, Matchup[]>();
    for (const m of rows) if (m.matchup_id != null) { const l = byMatch.get(m.matchup_id) ?? []; l.push(m); byMatch.set(m.matchup_id, l); }
    const scorers = rows.filter(m => score(m) > 0).map(score).sort((a, b) => a - b);
    const n = scorers.length;
    const median = n ? (n % 2 ? scorers[(n - 1) / 2] : (scorers[n / 2 - 1] + scorers[n / 2]) / 2) : null;
    const avg = n ? scorers.reduce((a, b) => a + b, 0) / n : null;
    const ranked = rows.filter(m => score(m) > 0).sort((a, b) => score(b) - score(a));
    for (const m of rows) {
      const pts = score(m), rid = m.roster_id, s = side(rid, pts);
      const st = m.starters || [], pp = m.players_points;
      let bench: number | null = null, total: number | null = null;
      if (pp) { bench = 0; total = 0; for (const [pid, v] of Object.entries(pp)) { total += v || 0; if (!st.includes(pid)) bench += v || 0; } bench = r2(bench); total = r2(total); }
      const pair = m.matchup_id != null ? byMatch.get(m.matchup_id) ?? [] : [];
      const opp = pair.find(x => x.roster_id !== rid) ?? null;
      const oppPts = opp ? score(opp) : null;
      const played = pts > 0 || (oppPts ?? 0) > 0;
      const beat = pts > 0 ? scorers.filter(x => x < pts).length : 0, tied = pts > 0 ? scorers.filter(x => x === pts).length - 1 : 0;
      weekly.push({
        sid, season, week: w, kind, final, rid, uid: s.uid, manager: s.manager, team: s.team,
        pts, ptsRaw: m.points || 0, bench, total, startersCount: st.filter(p => p && p !== "0").length, emptySlots: st.filter(p => !p || p === "0").length,
        matchupId: m.matchup_id, oppRid: opp?.roster_id ?? null, oppPts,
        result: opp && played ? (pts > oppPts! ? "W" : pts < oppPts! ? "L" : "T") : null,
        rank: pts > 0 ? ranked.findIndex(x => x.roster_id === rid) + 1 : null, n, median, avg,
        apW: pts > 0 ? beat : 0, apL: pts > 0 ? n - 1 - beat - tied : 0, apT: pts > 0 ? tied : 0, exp: pts > 0 && n > 1 ? (beat + tied / 2) / (n - 1) : 0,
        inWb: wbWeeks.get(w)?.has(rid) ?? false, inLb: lbWeeks.get(w)?.has(rid) ?? false,
      });
    }
    if (final && kind === "regular") {
      for (const [mid, pair] of byMatch) {
        if (pair.length !== 2) continue;
        const [a, b] = pair; const pa = score(a), pb = score(b);
        if (!pa && !pb) continue;
        games.push({ id: `${sid}:${w}:${mid}`, sid, season, week: w, weekEnd: w, weeks: [w], multi: false, kind: "regular", label: "", bracket: null,
          round: null, match: null, place: null, matchupId: mid, a: side(a.roster_id, pa), b: side(b.roster_id, pb) });
      }
    }
  }
  // Bracket games, one per match, points summed across a multi-week round
  for (const r of summary.results) {
    const m = r.match;
    if (!r.pts || typeof m.t1 !== "number" || typeof m.t2 !== "number") continue;
    const p = m.p ?? null;
    const kind: GameKind = r.bracket === "winners" && (!p || p === 1 || p === 3) ? "playoff" : "consolation";
    games.push({ id: `${sid}:${r.bracket === "winners" ? "wb" : "lb"}:${m.m}`, sid, season, week: r.weeks[0], weekEnd: r.weeks[r.weeks.length - 1], weeks: r.weeks,
      multi: r.weeks.length > 1, kind, label: r.label, bracket: r.bracket, round: m.r, match: m.m, place: p, matchupId: null,
      a: side(m.t1, r.pts[m.t1]), b: side(m.t2, r.pts[m.t2]) });
  }
  games.sort((x, y) => x.week - y.week || (x.kind === "regular" ? 0 : 1) - (y.kind === "regular" ? 0 : 1) || (x.matchupId ?? 0) - (y.matchupId ?? 0));

  // Per-team season stats
  const teamStats: Record<number, TeamSeasonStats> = {};
  for (const t of Object.values(teams)) teamStats[t.rid] = { rid: t.rid, uid: t.uid, h2h: wl(), pf: 0, pa: 0, g: 0, ap: wl(), exp: 0, med: wl(), highs: 0, lows: 0, high: null, low: null, bench: null, po: wl(), co: wl(), wStreak: 0, lStreak: 0 };
  for (const g of games) for (const [me, op] of [[g.a, g.b], [g.b, g.a]] as const) {
    const ts = teamStats[me.rid]; if (!ts) continue;
    const res = me.pts > op.pts ? "w" : me.pts < op.pts ? "l" : "t";
    if (g.kind === "regular") { ts.h2h[res]++; ts.pf += me.pts; ts.pa += op.pts; ts.g++; }
    else if (g.kind === "playoff") { if (res !== "t") ts.po[res]++; }
    else if (res !== "t") ts.co[res]++;
  }
  for (const ws of weekly) {
    const ts = teamStats[ws.rid]; if (!ts || !ws.final) continue;
    if (ws.bench != null) ts.bench = r2((ts.bench ?? 0) + ws.bench);
    if (ws.kind !== "regular" || ws.pts <= 0) continue;
    ts.ap.w += ws.apW; ts.ap.l += ws.apL; ts.ap.t += ws.apT; ts.exp += ws.exp;
    if (ws.median != null) ws.pts > ws.median ? ts.med.w++ : ws.pts < ws.median ? ts.med.l++ : ts.med.t++;
    if (ws.rank === 1) ts.highs++; if (ws.rank === ws.n && ws.n > 1) ts.lows++;
    ts.high = ts.high == null ? ws.pts : Math.max(ts.high, ws.pts); ts.low = ts.low == null ? ws.pts : Math.min(ts.low, ws.pts);
  }
  for (const ts of Object.values(teamStats)) {
    let cur = 0, curR = "";
    for (const g of games) {
      if (g.kind === "consolation") continue;
      const me = g.a.rid === ts.rid ? g.a : g.b.rid === ts.rid ? g.b : null; if (!me) continue;
      const op = me === g.a ? g.b : g.a, r = me.pts > op.pts ? "W" : me.pts < op.pts ? "L" : "T";
      cur = r === curR ? cur + 1 : 1; curR = r;
      if (r === "W") ts.wStreak = Math.max(ts.wStreak, cur); if (r === "L") ts.lStreak = Math.max(ts.lStreak, cur);
    }
  }
  return { raw, sid, season, name: lg.name, teams, summary, games, weekly, teamStats, pws, complete: lg.status === "complete" };
}
