/* What a player was worth to a roster after a given week: points scored while on that roster, and how often he started. */
import type { SeasonRaw } from "./season";

export interface PlayerValue { total: number; starter: number; starts: number; weeks: number }

const r2 = (n: number) => Math.round(n * 100) / 100;

export function playerPointsFor(raw: SeasonRaw, rid: number, pid: string, fromWeek: number, toWeek = 99): PlayerValue {
  let total = 0, starter = 0, starts = 0, weeks = 0;
  for (const [wS, ms] of Object.entries(raw.matchups)) {
    const w = +wS;
    if (w < fromWeek || w > toWeek || w > raw.finalThrough) continue;
    const m = ms.find(x => x.roster_id === rid);
    if (!m || !(m.players || []).includes(pid)) continue;
    weeks++;
    const pts = m.players_points?.[pid] ?? 0;
    total += pts;
    if ((m.starters || []).includes(pid)) { starter += pts; starts++; }
  }
  return { total: r2(total), starter: r2(starter), starts, weeks };
}

/** Last week of the season that has final scores. */
export const lastWeek = (raw: SeasonRaw) => Math.min(raw.finalThrough, Math.max(0, ...Object.keys(raw.matchups).map(Number)));
