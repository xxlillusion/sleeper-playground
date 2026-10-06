import type { Row } from "../../perspective/engine";
import { lookupPlayer } from "../players";
import { nameOf, seasonCols, teamCols, view, type TableDef } from "./common";

export const transactions: TableDef = {
  id: "transactions",
  label: "Transactions",
  description: "One row per asset that moved, per team, per transaction. A one-for-one trade is four rows (two adds, two drops). Filter action = add to count each asset once.",
  grain: "asset movement",
  requires: "transactions",
  schema: {
    league_id: "string", season: "integer", league_name: "string", week: "integer", transaction_id: "string", type: "string", status: "string", is_complete: "boolean",
    created: "datetime", created_ms: "integer", creator: "string",
    roster_id: "integer", user_id: "string", manager: "string", team: "string",
    action: "string", asset_type: "string", player_id: "string", player_name: "string", position: "string", nfl_team_current: "string",
    faab_bid: "integer", faab_amount: "integer", pick_season: "integer", pick_round: "integer", pick_original_manager: "string", pick_label: "string",
    counterparty_roster_id: "integer", counterparty_manager: "string", trade_team_count: "integer", trade_partners: "string", is_trade: "boolean", notes: "string", waiver_seq: "integer",
  },
  build({ ds }) {
    const rows: Row[] = [];
    for (const m of ds.models) {
      if (!m.raw.transactions) continue;
      const T = (rid: number) => m.teams[rid];
      const M = (rid: number) => (T(rid) ? nameOf(ds, T(rid).uid, T(rid).manager) : `Team ${rid}`);
      const userName = (uid: string | null | undefined) => (uid ? nameOf(ds, uid, m.raw.users.find(u => u.user_id === uid)?.display_name ?? uid) : null);
      for (const list of Object.values(m.raw.transactions)) for (const t of list) {
        const ids = t.roster_ids || [];
        const base = {
          ...seasonCols(m), week: t.leg, transaction_id: t.transaction_id, type: t.type, status: t.status, is_complete: t.status === "complete",
          created: t.created, created_ms: t.created, creator: userName(t.creator),
          faab_bid: t.settings?.waiver_bid ?? null, trade_team_count: t.type === "trade" ? ids.length : null, is_trade: t.type === "trade",
          notes: t.metadata?.notes ?? null, waiver_seq: t.settings?.seq ?? null,
        };
        const partners = (rid: number) => ids.filter(x => x !== rid).map(M).join(", ") || null;
        const counterparty = (rid: number, other: number | null) => ({
          counterparty_roster_id: other ?? (ids.length === 2 ? ids.find(x => x !== rid) ?? null : null),
          counterparty_manager: other != null ? M(other) : ids.length === 2 ? M(ids.find(x => x !== rid)!) : null,
          trade_partners: t.type === "trade" ? partners(rid) : null,
        });
        const playerRow = (pid: string, rid: number, action: "add" | "drop", other: number | null): Row => {
          const [name, pos, nfl] = lookupPlayer(ds.players, pid);
          return { ...base, ...teamCols(ds, T(rid), rid, m.sid), action, asset_type: "player", player_id: pid, player_name: name, position: pos || null, nfl_team_current: nfl || null,
            faab_amount: null, pick_season: null, pick_round: null, pick_original_manager: null, pick_label: null, ...counterparty(rid, other) };
        };
        const adds = Object.entries(t.adds || {}), drops = Object.entries(t.drops || {});
        for (const [pid, rid] of adds) rows.push(playerRow(pid, rid, "add", t.type === "trade" ? drops.find(([p]) => p === pid)?.[1] ?? null : null));
        for (const [pid, rid] of drops) rows.push(playerRow(pid, rid, "drop", t.type === "trade" ? adds.find(([p]) => p === pid)?.[1] ?? null : null));
        for (const p of t.draft_picks || []) {
          const label = `${p.season} R${p.round} (${M(p.roster_id)}'s)`;
          const pickRow = (rid: number, action: "pick_in" | "pick_out", other: number): Row => ({
            ...base, ...teamCols(ds, T(rid), rid, m.sid), action, asset_type: "pick", player_id: null, player_name: label, position: null, nfl_team_current: null,
            faab_amount: null, pick_season: +p.season, pick_round: p.round, pick_original_manager: M(p.roster_id), pick_label: label, ...counterparty(rid, other),
          });
          rows.push(pickRow(p.owner_id, "pick_in", p.previous_owner_id), pickRow(p.previous_owner_id, "pick_out", p.owner_id));
        }
        for (const wb of t.waiver_budget || []) {
          const faabRow = (rid: number, action: "faab_in" | "faab_out", other: number): Row => ({
            ...base, ...teamCols(ds, T(rid), rid, m.sid), action, asset_type: "faab", player_id: null, player_name: `$${wb.amount} FAAB`, position: null, nfl_team_current: null,
            faab_amount: wb.amount, pick_season: null, pick_round: null, pick_original_manager: null, pick_label: null, ...counterparty(rid, other),
          });
          rows.push(faabRow(wb.receiver, "faab_in", wb.sender), faabRow(wb.sender, "faab_out", wb.receiver));
        }
        if (!adds.length && !drops.length && !(t.draft_picks || []).length && !(t.waiver_budget || []).length) {
          for (const rid of ids) rows.push({ ...base, ...teamCols(ds, T(rid), rid, m.sid), action: "none", asset_type: null, player_id: null, player_name: null, position: null, nfl_team_current: null,
            faab_amount: null, pick_season: null, pick_round: null, pick_original_manager: null, pick_label: null, ...counterparty(rid, null) });
        }
      }
    }
    return rows;
  },
  defaultView: view({ columns: ["season", "week", "created", "type", "status", "manager", "action", "player_name", "position", "faab_bid", "counterparty_manager"], sort: [["created", "desc"]] }),
  presets: [
    { name: "Feed", config: view({ columns: ["season", "week", "created", "type", "status", "manager", "action", "player_name", "position", "faab_bid", "counterparty_manager"], sort: [["created", "desc"]] }) },
    { name: "Moves by manager and type", config: view({ plugin: "Y Bar", group_by: ["manager"], split_by: ["type"], columns: ["transaction_id"], aggregates: { transaction_id: "distinct count" }, filter: [["is_complete", "==", true], ["action", "==", "add"]] }) },
    { name: "FAAB spent by manager and season", config: view({ plugin: "Datagrid", group_by: ["manager"], split_by: ["season"], columns: ["faab_bid"], aggregates: { faab_bid: "sum" }, filter: [["type", "==", "waiver"], ["is_complete", "==", true], ["action", "==", "add"]] }) },
    { name: "Trade partners", config: view({ plugin: "Datagrid", group_by: ["manager"], split_by: ["counterparty_manager"], columns: ["transaction_id"], aggregates: { transaction_id: "distinct count" }, filter: [["is_trade", "==", true], ["is_complete", "==", true]] }) },
    { name: "Most added players", config: view({ group_by: ["player_name"], columns: ["transaction_id", "position"], aggregates: { transaction_id: "distinct count", position: "any" }, filter: [["action", "==", "add"], ["is_complete", "==", true]], sort: [["transaction_id", "desc"]] }) },
  ],
};
