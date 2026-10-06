/* Orchestrates a full league load: NFL state -> chain -> every season in parallel -> models. Transactions and player names follow in the background. */
import { api, setNflState } from "../api/sleeper";
import type { NflState, League } from "../api/types";
import { walkChain } from "./chain";
import { buildSeasonModel, type SeasonModel } from "./model";
import { ensurePlayers, type PlayerMap } from "./players";
import { loadSeasonRaw, loadSeasonTransactions, type LoadOptions, type LoadWarning, type SeasonRaw } from "./season";
import { maxWeekFor } from "./weeks";

export interface Progress { phase: "state" | "chain" | "seasons" | "build" | "transactions" | "done"; message: string; done: number; total: number }

export interface LeagueDataset {
  rootId: string;
  nfl: NflState;
  chain: League[];
  raws: SeasonRaw[];
  models: SeasonModel[];      // oldest season first
  /** Canonical display name per Sleeper account: the newest one seen, so a renamed account stays one person in every table */
  names: Record<string, string>;
  players: PlayerMap | null;
  txLoaded: boolean;
  draftsLoaded: boolean;
  warnings: LoadWarning[];
  loadedAt: number;
}

export const defaultOptions: LoadOptions = { includeDrafts: true, includeTransactions: true, extraLeagueIds: [] };

export async function loadLeague(rootId: string, opts: LoadOptions, onProgress: (p: Progress) => void): Promise<LeagueDataset> {
  onProgress({ phase: "state", message: "Checking the NFL calendar", done: 0, total: 1 });
  const nfl = await api<NflState>("/state/nfl", { fresh: true });
  setNflState(nfl);

  onProgress({ phase: "chain", message: "Following previous_league_id back through time", done: 0, total: 1 });
  const chain = await walkChain(rootId, opts.extraLeagueIds, n => onProgress({ phase: "chain", message: `Found ${n} season${n === 1 ? "" : "s"}`, done: n, total: n + 1 }));
  if (!chain.length) throw new Error(`No league found with id ${rootId}`);

  // Progress: 4 core calls per season up front; weeks and drafts are added once each season's brackets are known
  let done = 0, total = chain.length * 4;
  const tick = () => { done++; onProgress({ phase: "seasons", message: `Loading ${chain.length} seasons`, done, total }); };
  // Estimate the per-season week count now so the bar does not jump: assume every week plus the draft calls
  total += chain.reduce((a, lg) => a + (lg.status === "pre_draft" || lg.status === "drafting" ? 0 : maxWeekFor(lg.season)) + (opts.includeDrafts ? 2 : 0), 0);
  const raws = await Promise.all(chain.map((lg: League) => loadSeasonRaw(lg, nfl, opts, tick)));

  onProgress({ phase: "build", message: "Building tables", done: total, total });
  const models = raws.map(buildSeasonModel).sort((a, b) => a.season - b.season);
  const names: Record<string, string> = {};
  for (const m of models) for (const t of Object.values(m.teams)) { names[t.uid] = t.manager; for (const co of t.coOwners) names[co.user_id] = co.display_name; }
  const ds: LeagueDataset = {
    rootId, nfl, chain, raws, models, names, players: null, txLoaded: false, draftsLoaded: opts.includeDrafts,
    warnings: raws.flatMap(r => r.warnings), loadedAt: Date.now(),
  };
  onProgress({ phase: "done", message: "Ready", done: total, total });
  return ds;
}

export async function loadTransactions(ds: LeagueDataset, onProgress: (p: Progress) => void): Promise<void> {
  const total = ds.raws.reduce((a, r) => a + maxWeekFor(r.league.season), 0);
  let done = 0;
  await Promise.all(ds.raws.map(r => loadSeasonTransactions(r, () => { done++; onProgress({ phase: "transactions", message: "Loading trades and waivers", done, total }); })));
  ds.txLoaded = true;
  ds.warnings = ds.raws.flatMap(r => r.warnings);
}

export async function loadPlayers(ds: LeagueDataset): Promise<void> {
  try { ds.players = await ensurePlayers(); } catch { ds.players = {}; }
}
