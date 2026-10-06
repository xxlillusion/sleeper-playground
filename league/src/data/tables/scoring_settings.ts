import type { Row } from "../../perspective/engine";
import { seasonCols, view, type TableDef } from "./common";

function category(key: string): string {
  if (/^pass/.test(key)) return "passing";
  if (/^rush/.test(key)) return "rushing";
  if (/^rec|^bonus_rec/.test(key)) return "receiving";
  if (/^fg|^xp|^kick/.test(key)) return "kicking";
  if (/^def|^pts_allow|^yds_allow|^sack|^int$|^ff$|^fum_rec|^safe|^blk/.test(key)) return "defense";
  if (/^idp|^tkl|^qb_hit|^tkl_loss/.test(key)) return "idp";
  if (/^fum/.test(key)) return "fumbles";
  if (/^bonus/.test(key)) return "bonus";
  if (/^st_|^kr|^pr/.test(key)) return "special teams";
  return "misc";
}

export const scoring_settings: TableDef = {
  id: "scoring_settings",
  label: "Scoring rules",
  description: "Every scoring setting for every season in long format, with the previous season's value next to it so rule changes stand out.",
  grain: "setting-season",
  schema: { league_id: "string", season: "integer", league_name: "string", setting: "string", category: "string", value: "float", prev_value: "float", changed_from_prev: "boolean" },
  build({ ds }) {
    const rows: Row[] = [];
    let prev: Record<string, number> | null = null;
    for (const m of ds.models) {
      const sc = m.raw.league.scoring_settings || {};
      const keys = new Set([...Object.keys(sc), ...Object.keys(prev || {})]);
      for (const k of [...keys].sort()) {
        const v = sc[k] ?? null, pv = prev ? prev[k] ?? null : null;
        rows.push({ ...seasonCols(m), setting: k, category: category(k), value: v, prev_value: pv, changed_from_prev: prev ? v !== pv : null });
      }
      prev = sc;
    }
    return rows;
  },
  defaultView: view({ plugin: "Datagrid", group_by: ["category", "setting"], split_by: ["season"], columns: ["value"], aggregates: { value: "any" } }),
  presets: [
    { name: "Settings by season", config: view({ plugin: "Datagrid", group_by: ["category", "setting"], split_by: ["season"], columns: ["value"], aggregates: { value: "any" } }) },
    { name: "What changed", config: view({ columns: ["season", "category", "setting", "prev_value", "value"], filter: [["changed_from_prev", "==", true]], sort: [["season", "desc"], ["setting", "asc"]] }) },
  ],
};
