/* The dataset registry. Order here is the tab order. */
import { bracket_matches } from "./tables/bracket_matches";
import { draft_picks } from "./tables/draft_picks";
import { games } from "./tables/games";
import { managers } from "./tables/managers";
import { player_weeks } from "./tables/player_weeks";
import { scoring_settings } from "./tables/scoring_settings";
import { seasons } from "./tables/seasons";
import { teams } from "./tables/teams";
import { transactions } from "./tables/transactions";
import { weekly_scores } from "./tables/weekly_scores";

export type { TableDef, Preset, BuildContext } from "./tables/common";
export const TABLES = [teams, games, weekly_scores, managers, seasons, player_weeks, transactions, draft_picks, bracket_matches, scoring_settings];
export const tableById = (id: string) => TABLES.find(t => t.id === id) ?? null;
