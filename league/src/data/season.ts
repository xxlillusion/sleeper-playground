/* Everything Sleeper knows about one league season, fetched with per-call error tolerance. */
import { api } from "../api/sleeper";
import type { BracketMatch, Draft, DraftPick, League, Matchup, NflState, Roster, Transaction, User } from "../api/types";
import { weekPlan, maxWeekFor } from "./weeks";

export interface LoadWarning { season: string; endpoint: string; message: string }

export interface SeasonRaw {
  league: League;
  users: User[];
  rosters: Roster[];
  wb: BracketMatch[];
  lb: BracketMatch[];
  matchups: Record<number, Matchup[]>;
  weeksRequested: number[];
  finalThrough: number;
  isLive: boolean;
  isAbandoned: boolean;
  drafts: Draft[] | null;
  picks: Record<string, DraftPick[]>;
  transactions: Record<number, Transaction[]> | null;
  warnings: LoadWarning[];
}

export interface LoadOptions { includeDrafts: boolean; includeTransactions: boolean; extraLeagueIds: string[] }

export type Tick = (label: string) => void;

export async function loadSeasonRaw(league: League, nfl: NflState, opts: LoadOptions, tick: Tick): Promise<SeasonRaw> {
  const id = league.league_id, season = league.season;
  const warnings: LoadWarning[] = [];
  const warn = (endpoint: string, e: unknown) => warnings.push({ season, endpoint, message: e instanceof Error ? e.message : String(e) });
  const get = async <T>(path: string, fallback: T): Promise<T> => {
    try { const d = await api<T | null>(path); tick(path); return d ?? fallback; }
    catch (e) { warn(path, e); tick(path); return fallback; }
  };

  const [users, rosters, wb, lb] = await Promise.all([
    get<User[]>(`/league/${id}/users`, []), get<Roster[]>(`/league/${id}/rosters`, []),
    get<BracketMatch[]>(`/league/${id}/winners_bracket`, []), get<BracketMatch[]>(`/league/${id}/losers_bracket`, []),
  ]);
  const plan = weekPlan(league, nfl, wb, lb);
  const raw: SeasonRaw = {
    league, users, rosters, wb, lb, matchups: {}, weeksRequested: plan.weeks, finalThrough: plan.finalThrough,
    isLive: plan.isLive, isAbandoned: plan.isAbandoned, drafts: null, picks: {}, transactions: null, warnings,
  };
  await Promise.all(plan.weeks.map(async w => {
    const ms = await get<Matchup[]>(`/league/${id}/matchups/${w}`, []);
    if (ms.length) raw.matchups[w] = ms;
  }));
  if (opts.includeDrafts) {
    const drafts = await get<Draft[]>(`/league/${id}/drafts`, []);
    raw.drafts = drafts;
    await Promise.all(drafts.map(async d => { raw.picks[d.draft_id] = await get<DraftPick[]>(`/draft/${d.draft_id}/picks`, []); }));
  }
  return raw;
}

/* Transactions cost one call per week, so they load after the page is already usable. */
export async function loadSeasonTransactions(raw: SeasonRaw, tick: Tick): Promise<void> {
  const id = raw.league.league_id;
  const weeks = Array.from({ length: maxWeekFor(raw.league.season) }, (_, i) => i + 1);
  const out: Record<number, Transaction[]> = {};
  await Promise.all(weeks.map(async w => {
    const path = `/league/${id}/transactions/${w}`;
    try { const d = await api<Transaction[] | null>(path); if (d?.length) out[w] = d; }
    catch (e) { raw.warnings.push({ season: raw.league.season, endpoint: path, message: e instanceof Error ? e.message : String(e) }); }
    tick(path);
  }));
  raw.transactions = out;
}

/** Number of requests loadSeasonRaw will make for a season once its brackets are known. Used for the progress bar. */
export const seasonCallCount = (league: League, nfl: NflState, wb: BracketMatch[], lb: BracketMatch[], opts: LoadOptions) =>
  weekPlan(league, nfl, wb, lb).weeks.length + (opts.includeDrafts ? 2 : 0);
