/* Column metadata for pickers: what each column is for, in plain English. Derived from each table's schema plus overrides. */
import { TABLES, tableById, type TableDef } from "../data/catalog";
import type { Schema } from "../perspective/engine";

export type ColKind = "dimension" | "measure" | "id" | "date" | "flag";
export interface ColumnInfo { name: string; label: string; kind: ColKind; type: Schema[string]; description?: string }
export interface DatasetInfo { id: string; label: string; description: string; grain: string; columns: ColumnInfo[]; def: TableDef }

const DIMENSION_INTS = new Set(["season", "week", "week_end", "round", "pick_no", "pick_in_round", "draft_slot", "matchup_id", "match", "place", "slot_index", "division", "roster_id", "opp_roster_id", "t1_roster_id", "t2_roster_id", "winner_roster_id", "counterparty_roster_id", "original_roster_id", "team_count", "trade_team_count", "pick_season", "pick_round", "first_season", "last_season", "num_teams", "playoff_week_start", "playoff_teams", "playoff_round_type", "waiver_type", "total_weeks", "regular_season_weeks", "last_week_loaded", "last_scored_week", "draft_rounds", "rounds", "years_exp", "final_rank", "reg_rank", "points_rank", "playoff_seed", "sos_rank", "week_rank", "opp_week_rank", "rank_on_roster", "eliminated_round", "season_game_no", "best_finish", "worst_finish", "starters_count", "high_score_week", "low_score_week", "waiver_position"]);
const LABELS: Record<string, string> = {
  pf: "Points for", pa: "Points against", ppg: "Points per game", pa_pg: "Points against per game", h2h_wins: "Head-to-head wins", h2h_losses: "Head-to-head losses", h2h_ties: "Head-to-head ties",
  all_play_pct: "All-play win %", win_pct: "Win %", reg_win_pct: "Regular-season win %", faab_bid: "FAAB bid", faab_spent: "FAAB spent", sos_rank: "Schedule difficulty rank",
  opp_season_ppg_avg: "Opponents' average score", opp_pts_vs_their_avg: "Opponents vs their average", nfl_team_current: "NFL team (now)", nfl_team_at_draft: "NFL team (at draft)",
  user_id: "Manager id", display_name: "Manager", pct_of_team: "% of team points", is_week_high: "Week's top score", is_week_low: "Week's bottom score", vs_median: "vs weekly median",
};
const humanize = (s: string) => LABELS[s] ?? s.replace(/_/g, " ").replace(/\bpct\b/g, "%").replace(/\bid\b/g, "ID").replace(/^./, c => c.toUpperCase());

export function columnInfo(name: string, type: Schema[string]): ColumnInfo {
  let kind: ColKind;
  if (type === "datetime" || type === "date") kind = "date";
  else if (type === "boolean") kind = "flag";
  else if (/(^|_)id$/.test(name) || name === "transaction_id" || name === "game_id") kind = "id";
  else if (type === "string") kind = "dimension";
  else if (type === "integer" && DIMENSION_INTS.has(name)) kind = "dimension";
  else kind = "measure";
  return { name, label: humanize(name), kind, type };
}

const cache = new Map<string, DatasetInfo>();
export function datasetInfo(id: string): DatasetInfo | null {
  const hit = cache.get(id); if (hit) return hit;
  const def = tableById(id); if (!def) return null;
  const info: DatasetInfo = { id, label: def.label, description: def.description, grain: def.grain, def, columns: Object.entries(def.schema).map(([n, t]) => columnInfo(n, t)) };
  cache.set(id, info);
  return info;
}
export const allDatasets = (): DatasetInfo[] => TABLES.map(t => datasetInfo(t.id)!).filter(Boolean);
export const columnLabel = (dataset: string, col: string) => datasetInfo(dataset)?.columns.find(c => c.name === col)?.label ?? humanize(col);
export const dimensionsOf = (dataset: string) => (datasetInfo(dataset)?.columns ?? []).filter(c => c.kind === "dimension" || c.kind === "flag" || c.kind === "date");
export const measuresOf = (dataset: string) => (datasetInfo(dataset)?.columns ?? []).filter(c => c.kind === "measure" || c.kind === "flag");
