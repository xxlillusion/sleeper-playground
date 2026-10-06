/* Shared pieces for the table builders. */
import type { ViewerConfigUpdate } from "@perspective-dev/viewer";
import type { Draft } from "../../api/types";
import type { Row, Schema } from "../../perspective/engine";
import type { LeagueDataset } from "../load";
import type { SeasonModel } from "../model";
import type { SeasonRaw } from "../season";
import type { Team } from "../teams";
import { r2 } from "../weeks";

export interface Preset { name: string; config: ViewerConfigUpdate }
export interface BuildContext { ds: LeagueDataset }
export interface TableDef {
  id: string;
  label: string;
  description: string;
  grain: string;
  /** Data this table cannot be built without. The UI shows a badge until it arrives. */
  requires?: "transactions" | "drafts" | "players";
  schema: Schema;
  build(ctx: BuildContext): Row[];
  defaultView: ViewerConfigUpdate;
  presets: Preset[];
}

/* A complete viewer config, so restoring a preset replaces every field of whatever was there before. */
export function view(p: Partial<ViewerConfigUpdate> & { columns: Array<string | null> }): ViewerConfigUpdate {
  return { plugin: "Datagrid", group_by: [], split_by: [], filter: [], sort: [], expressions: {}, aggregates: {}, plugin_config: {}, columns_config: {}, title: null, ...p };
}

export const pct = (w: number, l: number, t = 0) => (w + l + t ? r2(((w + t / 2) / (w + l + t)) * 100) : null);
export const div = (a: number, b: number) => (b ? r2(a / b) : null);
export const rec = (w: number, l: number, t = 0) => `${w}-${l}${t ? "-" + t : ""}`;

export function seasonCols(m: SeasonModel): Row {
  return { league_id: m.sid, season: m.season, league_name: m.name };
}
/* The newest display name for an account, so pivots by manager never split a renamed person */
export const nameOf = (ds: LeagueDataset, uid: string | null | undefined, fallback = "Open slot") => (uid ? ds.names[uid] ?? fallback : fallback);

export function teamCols(ds: LeagueDataset, t: Team | undefined, rid: number, sid: string): Row {
  const uid = t?.uid ?? `open:${sid}:${rid}`;
  return { roster_id: rid, user_id: uid, manager: t?.isOpen === false ? nameOf(ds, uid, t.manager) : "Open slot", team: t?.name ?? `Team ${rid}` };
}

/* Per-roster activity totals from a season's transactions */
export interface TxStats { trades: number; waivers: number; freeAgents: number; faab: number; faabIn: number; failed: number; biggestBid: number }
export function txStats(raw: SeasonRaw): Record<number, TxStats> | null {
  if (!raw.transactions) return null;
  const out: Record<number, TxStats> = {};
  const get = (rid: number) => (out[rid] ??= { trades: 0, waivers: 0, freeAgents: 0, faab: 0, faabIn: 0, failed: 0, biggestBid: 0 });
  for (const list of Object.values(raw.transactions)) for (const t of list) {
    const ids = t.roster_ids || [];
    if (t.status !== "complete") { if (t.type === "waiver") ids.forEach(r => get(r).failed++); continue; }
    if (t.type === "trade") ids.forEach(r => get(r).trades++);
    else if (t.type === "waiver") { ids.forEach(r => get(r).waivers++); const bid = t.settings?.waiver_bid || 0; if (ids[0] != null && bid) { get(ids[0]).faab += bid; get(ids[0]).biggestBid = Math.max(get(ids[0]).biggestBid, bid); } }
    else if (t.type === "free_agent") ids.forEach(r => get(r).freeAgents++);
    for (const wb of t.waiver_budget || []) { get(wb.receiver).faabIn += wb.amount; }
  }
  return out;
}

/* Per-roster draft facts: slot, auction spend, keepers, who drafted the roster */
export interface DraftInfo { slot: number | null; auction: number; keepers: number; picks: number; draftedByUid: string | null }
export function draftInfo(raw: SeasonRaw): Record<number, DraftInfo> | null {
  if (!raw.drafts) return null;
  const out: Record<number, DraftInfo> = {};
  const get = (rid: number) => (out[rid] ??= { slot: null, auction: 0, keepers: 0, picks: 0, draftedByUid: null });
  const ownerByRid = new Map(raw.rosters.map(r => [r.roster_id, r.owner_id]));
  for (const d of raw.drafts) {
    const s2r = slotToRoster(raw, d);
    const slotOfUser = d.draft_order || {};
    for (const [slot, rid] of Object.entries(s2r)) {
      const info = get(rid); info.slot = +slot;
      const uid = Object.entries(slotOfUser).find(([, s]) => s === +slot)?.[0] ?? null;
      if (uid) info.draftedByUid = uid; else if (ownerByRid.get(rid)) info.draftedByUid = ownerByRid.get(rid)!;
    }
    for (const p of raw.picks[d.draft_id] || []) {
      const rid = p.roster_id ?? s2r[p.draft_slot]; if (rid == null) continue;
      const info = get(rid); info.picks++;
      if (p.is_keeper) info.keepers++;
      if (d.type === "auction") info.auction += +(p.metadata?.amount || 0);
    }
  }
  return out;
}

/* Draft slot -> roster id, with the explorer's fallbacks: draft_order (user -> slot) joined to roster owners, then round-1 picks */
export function slotToRoster(raw: SeasonRaw, d: Draft): Record<number, number> {
  const s2r: Record<number, number> = {};
  for (const [slot, rid] of Object.entries(d.slot_to_roster_id || {})) if (rid != null) s2r[+slot] = rid;
  for (const [uid, slot] of Object.entries(d.draft_order || {})) {
    const r = raw.rosters.find(x => x.owner_id === uid);
    if (r && s2r[slot] == null) s2r[slot] = r.roster_id;
  }
  for (const p of raw.picks[d.draft_id] || []) if (p.round === 1 && p.roster_id != null && s2r[p.draft_slot] == null) s2r[p.draft_slot] = p.roster_id;
  return s2r;
}

export const SLOT_NAMES = new Set(["BN", "IR", "TAXI"]);
export const starterSlots = (positions: string[]) => positions.filter(p => !SLOT_NAMES.has(p));
