/* Sleeper API response shapes, limited to the fields the league page reads. */

export interface NflState {
  season: string;
  league_season?: string;
  previous_season?: string;
  week: number;
  display_week?: number;
  leg?: number;
  season_type: string;
}

export interface LeagueSettings {
  num_teams?: number;
  type?: number;              // 0 redraft, 1 keeper, 2 dynasty
  best_ball?: number;
  max_keepers?: number;
  divisions?: number;
  league_average_match?: number;
  trade_deadline?: number;
  taxi_slots?: number;
  reserve_slots?: number;
  playoff_week_start?: number;
  playoff_teams?: number;
  playoff_round_type?: number; // 0 one week per round, 1 two-week final, 2 two weeks per round
  playoff_type?: number;
  playoff_seed_type?: number;
  waiver_type?: number;        // 0 rolling, 1 reverse standings, 2 FAAB
  waiver_budget?: number;
  waiver_clear_days?: number;
  daily_waivers?: number;
  leg?: number;
  last_scored_leg?: number;
  [key: string]: number | undefined;
}

export interface League {
  league_id: string;
  name: string;
  season: string;
  status: string;              // pre_draft | drafting | in_season | complete
  previous_league_id: string | null;
  total_rosters: number;
  roster_positions: string[];
  scoring_settings: Record<string, number>;
  settings: LeagueSettings;
  metadata?: Record<string, string> | null;
  avatar?: string | null;
  draft_id?: string | null;
}

export interface User {
  user_id: string;
  display_name: string;
  username?: string;
  avatar: string | null;
  is_owner?: boolean | null;
  metadata?: { team_name?: string; avatar?: string; [k: string]: unknown } | null;
}

export interface RosterSettings {
  wins?: number; losses?: number; ties?: number;
  fpts?: number; fpts_decimal?: number;
  fpts_against?: number; fpts_against_decimal?: number;
  ppts?: number; ppts_decimal?: number;
  total_moves?: number; waiver_budget_used?: number; waiver_position?: number;
  division?: number;
}

export interface Roster {
  roster_id: number;
  owner_id: string | null;
  co_owners: string[] | null;
  players: string[] | null;
  starters: string[] | null;
  reserve: string[] | null;
  taxi: string[] | null;
  settings: RosterSettings;
  metadata?: { streak?: string; record?: string; [k: string]: unknown } | null;
}

export interface Matchup {
  roster_id: number;
  matchup_id: number | null;
  points: number;
  custom_points: number | null;
  starters: string[] | null;
  starters_points: number[] | null;
  players: string[] | null;
  players_points: Record<string, number> | null;
}

export interface BracketFrom { w?: number; l?: number }
export interface BracketMatch {
  r: number;
  m: number;
  t1: number | null;
  t2: number | null;
  w: number | null;
  l: number | null;
  p?: number | null;
  t1_from?: BracketFrom | null;
  t2_from?: BracketFrom | null;
}

export interface TransactionPick { season: string; round: number; roster_id: number; previous_owner_id: number; owner_id: number }
export interface Transaction {
  transaction_id: string;
  type: string;                // trade | waiver | free_agent | commissioner
  status: string;              // complete | failed
  created: number;
  status_updated?: number | null;
  creator?: string | null;
  roster_ids: number[] | null;
  adds: Record<string, number> | null;
  drops: Record<string, number> | null;
  draft_picks: TransactionPick[] | null;
  waiver_budget: { sender: number; receiver: number; amount: number }[] | null;
  settings?: { waiver_bid?: number; seq?: number } | null;
  leg: number;
  metadata?: { notes?: string } | null;
  consenter_ids?: number[] | null;
}

export interface Draft {
  draft_id: string;
  type: string;                // snake | linear | auction
  status: string;
  start_time: number | null;
  season: string;
  settings: { teams?: number; rounds?: number; [k: string]: number | undefined };
  draft_order: Record<string, number> | null;
  slot_to_roster_id: Record<string, number> | null;
}

export interface DraftPick {
  round: number;
  pick_no: number;
  draft_slot: number;
  roster_id: number | null;
  player_id: string;
  picked_by: string | null;
  is_keeper: boolean | null;
  metadata: { first_name?: string; last_name?: string; position?: string; team?: string; amount?: string; years_exp?: string; [k: string]: string | undefined } | null;
}
