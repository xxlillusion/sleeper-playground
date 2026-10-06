import type { ThemeName } from "../components/PerspectiveView";
import type { LeagueDataset } from "../data/load";
import type { Row } from "../perspective/engine";

/** What every prototype receives from App. Data is loaded and built once; prototypes only render and pivot. */
export interface PrototypeProps {
  ds: LeagueDataset;
  /** Every dataset's rows, keyed by dataset id (see data/catalog.ts TABLES) */
  rowsById: Record<string, Row[]>;
  counts: Record<string, number>;
  /** Dataset id -> why it is not complete yet ("loading", "names loading", "off"), or null when ready */
  pending: Record<string, string | null>;
  theme: ThemeName;
}
