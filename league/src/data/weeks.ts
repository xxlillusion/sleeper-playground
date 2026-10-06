import type { BracketMatch, League, NflState, Roster } from "../api/types";

export const r2 = (n: number) => Math.round(n * 100) / 100;
export const ord = (n: number) => n + (["th", "st", "nd", "rd"][(n % 100 - 20) % 10] || ["th", "st", "nd", "rd"][n % 100] || "th");

/* The NFL regular season grew to 18 weeks in 2021. */
export const maxWeekFor = (season: string | number) => (+season >= 2021 ? 18 : 17);

export const pfOf = (r: Roster | null | undefined) => (r?.settings?.fpts || 0) + (r?.settings?.fpts_decimal || 0) / 100;
export const paOf = (r: Roster | null | undefined) => (r?.settings?.fpts_against || 0) + (r?.settings?.fpts_against_decimal || 0) / 100;
export const ppOf = (r: Roster | null | undefined) => (r?.settings?.ppts || 0) + (r?.settings?.ppts_decimal || 0) / 100;

/* Which NFL weeks a playoff round covers. playoff_round_type: 0 = one week per round, 1 = two-week championship, 2 = two weeks per round */
export function roundWeeks(lg: League, r: number, lastRound: number): number[] {
  const s = lg.settings || {}, st = s.playoff_week_start;
  if (!st) return [];
  const t = s.playoff_round_type || 0;
  if (t === 2) { const w = st + 2 * (r - 1); return [w, w + 1]; }
  const w = st + (r - 1);
  return t === 1 && r === lastRound ? [w, w + 1] : [w];
}

export interface WeekPlan { weeks: number[]; finalThrough: number; isLive: boolean; isAbandoned: boolean }

/* Which weeks to fetch for a season and which of them are final. */
export function weekPlan(lg: League, nfl: NflState, wb: BracketMatch[], lb: BracketMatch[]): WeekPlan {
  const max = maxWeekFor(lg.season);
  const complete = lg.status === "complete";
  const isCurrent = String(lg.season) === String(nfl.season);
  if (complete) {
    const rounds = [...wb, ...lb].map(m => m.r);
    let last = max;
    if (rounds.length) {
      const lastRound = Math.max(...rounds);
      const ws = roundWeeks(lg, lastRound, lastRound);
      if (ws.length) last = Math.min(max, Math.max(...ws));
    }
    return { weeks: range(last), finalThrough: last, isLive: false, isAbandoned: false };
  }
  if (isCurrent) {
    if (lg.status !== "in_season") return { weeks: [], finalThrough: 0, isLive: true, isAbandoned: false };
    const leg = Math.min(max, Math.max(1, lg.settings?.leg ?? nfl.week ?? 1));
    const scored = Math.min(max, Math.max(0, lg.settings?.last_scored_leg ?? leg - 1));
    return { weeks: range(leg), finalThrough: scored, isLive: true, isAbandoned: false };
  }
  // An older season that never reached "complete": load everything, trust nothing enough to cache.
  const abandoned = +lg.season < +nfl.season;
  return { weeks: lg.status === "in_season" || abandoned ? range(max) : [], finalThrough: max, isLive: false, isAbandoned: abandoned };
}

const range = (n: number) => Array.from({ length: Math.max(0, n) }, (_, i) => i + 1);
