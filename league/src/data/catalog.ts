/* The dataset registry. Order here is the tab order. */
import { bracket_matches } from "./tables/bracket_matches";
import { draft_picks } from "./tables/draft_picks";
import { games } from "./tables/games";
import { h2h } from "./tables/h2h";
import { lineups } from "./tables/lineups";
import { managers } from "./tables/managers";
import { pickups } from "./tables/pickups";
import { player_weeks } from "./tables/player_weeks";
import { scoring_settings } from "./tables/scoring_settings";
import { seasons } from "./tables/seasons";
import { teams } from "./tables/teams";
import { trades } from "./tables/trades";
import { transactions } from "./tables/transactions";
import { weekly_scores } from "./tables/weekly_scores";

export type { TableDef, Preset, BuildContext } from "./tables/common";
export const TABLES = [teams, games, weekly_scores, lineups, h2h, managers, seasons, player_weeks, transactions, trades, pickups, draft_picks, bracket_matches, scoring_settings];
export const tableById = (id: string) => TABLES.find(t => t.id === id) ?? null;
