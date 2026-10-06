/* Who won, who finished last, and every team's final rank for one season, worked out from the brackets and weekly points. */
import type { BracketMatch } from "../api/types";
import type { SeasonRaw } from "./season";
import type { Team } from "./teams";
import { ord, pfOf, r2, roundWeeks } from "./weeks";

export interface BracketResult {
  match: BracketMatch;
  bracket: "winners" | "losers";
  weeks: number[];          // NFL weeks the round covers that are loaded and final
  pts: Record<number, number> | null;
  winner: number | null;    // the team that scored more (or Sleeper's call when points are missing)
  loser: number | null;
  winnerBy: "points" | "sleeper" | null;
  label: string;
}

export interface SeasonSummary {
  champ: number | null; runner: number | null; third: number | null;
  last: number | null; lastBy: "toilet" | "record" | null; toiletOpp: number | null;
  finalScore: [number, number] | null; finalWeeks: number[];
  toiletScore: [number, number] | null; toiletWeeks: number[];
  inPlayoffs: Set<number>; inConsolation: Set<number>;
  regRank: Record<number, number>; pointsRank: Record<number, number>;
  finalRank: Record<number, { rank: number; source: "bracket" | "record"; finish: string }>;
  results: BracketResult[];
  playoffWins: Record<number, number>; playoffLosses: Record<number, number>;
  consolationWins: Record<number, number>; consolationLosses: Record<number, number>;
  playoffPoints: Record<number, number>;
  eliminatedRound: Record<number, number>;
}

const score = (m: { points: number; custom_points: number | null }) => (m.custom_points ?? m.points) || 0;

/* Points each team scored in a bracket game, summed across the weeks of that round. */
function bracketPoints(raw: SeasonRaw, m: BracketMatch, lastRound: number): { weeks: number[]; pts: Record<number, number> } | null {
  const weeks = roundWeeks(raw.league, m.r, lastRound).filter(w => raw.matchups[w] && w <= raw.finalThrough);
  if (!weeks.length || typeof m.t1 !== "number" || typeof m.t2 !== "number") return null;
  const sum = (rid: number) => r2(weeks.reduce((a, w) => a + (raw.matchups[w].find(x => x.roster_id === rid) ? score(raw.matchups[w].find(x => x.roster_id === rid)!) : 0), 0));
  const pts = { [m.t1]: sum(m.t1), [m.t2]: sum(m.t2) };
  return pts[m.t1] || pts[m.t2] ? { weeks, pts } : null;
}

function resolve(raw: SeasonRaw, br: BracketMatch[], bracket: "winners" | "losers"): BracketResult[] {
  if (!br.length) return [];
  const lastRound = Math.max(...br.map(m => m.r));
  return br.map(m => {
    const sc = bracketPoints(raw, m, lastRound);
    let winner: number | null = null, loser: number | null = null, winnerBy: BracketResult["winnerBy"] = null;
    if (sc && typeof m.t1 === "number" && typeof m.t2 === "number" && sc.pts[m.t1] !== sc.pts[m.t2]) {
      winner = sc.pts[m.t1] > sc.pts[m.t2] ? m.t1 : m.t2; loser = winner === m.t1 ? m.t2 : m.t1; winnerBy = "points";
    } else if (m.w != null && m.l != null) {
      // Sleeper's winners bracket marks the winner as w. Its losers bracket marks the team that LOST (and so advances toward last place) as w.
      winner = bracket === "winners" ? m.w : m.l; loser = bracket === "winners" ? m.l : m.w; winnerBy = "sleeper";
    }
    const p = m.p ?? null;
    const label = bracket === "winners"
      ? (p === 1 ? "Championship" : p === 3 ? "3rd place game" : p ? `${ord(p)} place game` : `Playoffs round ${m.r}`)
      : (p === 1 ? "Toilet bowl" : p ? `${ord(p)} place (consolation)` : `Consolation round ${m.r}`);
    return { match: m, bracket, weeks: sc?.weeks ?? [], pts: sc?.pts ?? null, winner, loser, winnerBy, label };
  });
}

export function seasonSummary(raw: SeasonRaw, teams: Record<number, Team>): SeasonSummary {
  const list = Object.values(teams);
  const n = list.length;
  const byRecord = [...list].sort((a, b) => (b.roster.settings?.wins || 0) - (a.roster.settings?.wins || 0) || pfOf(b.roster) - pfOf(a.roster));
  const regRank: Record<number, number> = {}; byRecord.forEach((t, i) => { regRank[t.rid] = i + 1; });
  const pointsRank: Record<number, number> = {}; [...list].sort((a, b) => pfOf(b.roster) - pfOf(a.roster)).forEach((t, i) => { pointsRank[t.rid] = i + 1; });

  const results = [...resolve(raw, raw.wb, "winners"), ...resolve(raw, raw.lb, "losers")];
  const inPlayoffs = new Set<number>(), inConsolation = new Set<number>();
  for (const m of raw.wb) for (const k of ["t1", "t2"] as const) if (typeof m[k] === "number") inPlayoffs.add(m[k] as number);
  for (const m of raw.lb) for (const k of ["t1", "t2"] as const) if (typeof m[k] === "number") inConsolation.add(m[k] as number);

  const out: SeasonSummary = {
    champ: null, runner: null, third: null, last: null, lastBy: null, toiletOpp: null,
    finalScore: null, finalWeeks: [], toiletScore: null, toiletWeeks: [],
    inPlayoffs, inConsolation, regRank, pointsRank, finalRank: {}, results,
    playoffWins: {}, playoffLosses: {}, consolationWins: {}, consolationLosses: {}, playoffPoints: {}, eliminatedRound: {},
  };
  const inc = (o: Record<number, number>, k: number, v = 1) => { o[k] = (o[k] || 0) + v; };

  const taken = new Set<number>();
  const place = (rid: number, rank: number, finish: string) => {
    if (rank < 1 || rank > n || taken.has(rank) || out.finalRank[rid]) return;
    taken.add(rank); out.finalRank[rid] = { rank, source: "bracket", finish };
  };
  for (const r of results) {
    if (r.winner == null || r.loser == null) continue;
    const p = r.match.p ?? null;
    if (r.bracket === "winners") {
      const real = !p || p === 1 || p === 3;
      if (real) { inc(out.playoffWins, r.winner); inc(out.playoffLosses, r.loser); }
      else { inc(out.consolationWins, r.winner); inc(out.consolationLosses, r.loser); }
      if (r.pts) { inc(out.playoffPoints, r.winner, r.pts[r.winner]); inc(out.playoffPoints, r.loser, r.pts[r.loser]); }
      if (!p) out.eliminatedRound[r.loser] = r.match.r;
      if (p === 1) { out.champ = r.winner; out.runner = r.loser; if (r.pts) out.finalScore = [r.pts[r.winner], r.pts[r.loser]]; out.finalWeeks = r.weeks; }
      if (p === 3) out.third = r.winner;
      if (p) { place(r.winner, p, p === 1 ? "Champion" : p === 3 ? "3rd place" : ord(p)); place(r.loser, p + 1, p === 1 ? "Runner-up" : ord(p + 1)); }
    } else {
      inc(out.consolationWins, r.winner); inc(out.consolationLosses, r.loser);
      if (p === 1) {
        out.last = r.loser; out.lastBy = "toilet"; out.toiletOpp = r.winner;
        if (r.pts) out.toiletScore = [r.pts[r.loser], r.pts[r.winner]]; out.toiletWeeks = r.weeks;
      }
      if (p) { place(r.loser, n - p + 1, p === 1 ? "Last place" : ord(n - p + 1)); place(r.winner, n - p, ord(n - p)); }
    }
  }
  // Everyone the brackets did not place is ordered by regular-season record into the remaining ranks
  let next = 1;
  for (const t of byRecord) {
    if (out.finalRank[t.rid]) continue;
    while (taken.has(next)) next++;
    taken.add(next);
    out.finalRank[t.rid] = { rank: next, source: "record", finish: ord(next) };
  }
  if (out.last == null && raw.league.status === "complete" && n > 1) { out.last = byRecord[n - 1].rid; out.lastBy = "record"; }
  return out;
}
