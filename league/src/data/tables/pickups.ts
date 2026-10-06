import type { Row } from "../../perspective/engine";
import type { LeagueDataset } from "../load";
import { lookupPlayer } from "../players";
import { lastWeek, playerPointsFor } from "../value";
import { r2 } from "../weeks";
import { seasonCols, teamCols, view, type TableDef } from "./common";

export interface PickupAgg { bids: number; starterPts: number; totalPts: number; adds: number; best: { name: string; pts: number } | null }

interface Pick { sid: string; rid: number; uid: string; row: Row; bid: number; starter: number; total: number; name: string }

const cache = new WeakMap<LeagueDataset, { key: string; picks: Pick[] }>();
function pickups_(ds: LeagueDataset): Pick[] {
  const key = `${ds.txLoaded}|${!!ds.players}`;
  const hit = cache.get(ds); if (hit && hit.key === key) return hit.picks;
  const out: Pick[] = [];
  for (const m of ds.models) {
    if (!m.raw.transactions) continue;
    const end = lastWeek(m.raw);
    const all = Object.values(m.raw.transactions).flat();
    const lastRoster = (rid: number) => new Set(m.raw.matchups[end]?.find(x => x.roster_id === rid)?.players || []);
    for (const t of all) {
      if ((t.type !== "waiver" && t.type !== "free_agent") || t.status !== "complete") continue;
      for (const [pid, rid] of Object.entries(t.adds || {})) {
        const bid = t.type === "waiver" ? t.settings?.waiver_bid ?? 0 : 0;
        const rivals = t.type === "waiver" ? all.filter(x => x.type === "waiver" && x.status !== "complete" && x.leg === t.leg && x.adds?.[pid] != null && x.transaction_id !== t.transaction_id) : [];
        const nextBest = rivals.length ? Math.max(...rivals.map(x => x.settings?.waiver_bid ?? 0)) : null;
        const v = playerPointsFor(m.raw, rid, pid, t.leg), v4 = playerPointsFor(m.raw, rid, pid, t.leg, t.leg + 3);
        const droppedLater = all.some(x => x.status === "complete" && x.drops?.[pid] === rid && x.created > t.created);
        const [name, pos] = lookupPlayer(ds.players, pid);
        const dropped = Object.entries(t.drops || {}).find(([, r]) => r === rid)?.[0] ?? null;
        const t_ = m.teams[rid];
        out.push({ sid: m.sid, rid, uid: t_?.uid ?? `open:${m.sid}:${rid}`, bid, starter: v.starter, total: v.total, name, row: {
          ...seasonCols(m), week: t.leg, transaction_id: t.transaction_id, created: t.created, type: t.type,
          ...teamCols(ds, t_, rid, m.sid),
          player_id: pid, player_name: name, position: pos || null, dropped_player: dropped ? lookupPlayer(ds.players, dropped)[0] : null,
          faab_bid: t.type === "waiver" ? bid : null, competing_bids: t.type === "waiver" ? rivals.length : null, next_best_bid: nextBest,
          overpaid_by: nextBest != null ? bid - nextBest : null,
          weeks_on_roster: v.weeks, points_total: v.total, points_as_starter: v.starter, games_started: v.starts, points_4wk: v4.total,
          points_per_dollar: bid > 0 ? r2(v.starter / bid) : null,
          was_dropped_later: droppedLater, kept_through_season: lastRoster(rid).has(pid),
        } });
      }
    }
  }
  cache.set(ds, { key, picks: out });
  return out;
}

export function pickupAgg(ds: LeagueDataset): Map<string, PickupAgg> {
  const agg = new Map<string, PickupAgg>();
  for (const p of pickups_(ds)) {
    const a = agg.get(p.uid) ?? { bids: 0, starterPts: 0, totalPts: 0, adds: 0, best: null };
    a.bids += p.bid; a.starterPts += p.starter; a.totalPts += p.total; a.adds++;
    if (!a.best || p.starter > a.best.pts) a.best = { name: p.name, pts: p.starter };
    agg.set(p.uid, a);
  }
  return agg;
}

export const pickups: TableDef = {
  id: "pickups",
  label: "Pickups",
  description: "One row per completed waiver claim or free-agent add, with the FAAB paid, who else bid, and what the player scored for that team afterwards.",
  grain: "pickup",
  requires: "transactions",
  schema: {
    league_id: "string", season: "integer", league_name: "string", week: "integer", transaction_id: "string", created: "datetime", type: "string",
    roster_id: "integer", user_id: "string", manager: "string", team: "string",
    player_id: "string", player_name: "string", position: "string", dropped_player: "string",
    faab_bid: "integer", competing_bids: "integer", next_best_bid: "integer", overpaid_by: "integer",
    weeks_on_roster: "integer", points_total: "float", points_as_starter: "float", games_started: "integer", points_4wk: "float", points_per_dollar: "float",
    was_dropped_later: "boolean", kept_through_season: "boolean",
  },
  build({ ds }) { return pickups_(ds).map(p => p.row); },
  defaultView: view({ columns: ["season", "week", "type", "manager", "player_name", "position", "faab_bid", "competing_bids", "points_as_starter", "games_started", "points_per_dollar", "kept_through_season"], sort: [["season", "desc"], ["week", "desc"], ["faab_bid", "desc"]] }),
  presets: [
    { name: "All pickups", config: view({ columns: ["season", "week", "type", "manager", "player_name", "position", "faab_bid", "competing_bids", "points_as_starter", "games_started", "points_per_dollar", "kept_through_season"], sort: [["season", "desc"], ["week", "desc"], ["faab_bid", "desc"]] }) },
    { name: "Best pickups", config: view({ columns: ["points_as_starter", "player_name", "position", "manager", "season", "week", "faab_bid", "games_started", "weeks_on_roster"], sort: [["points_as_starter", "desc"]] }) },
    { name: "FAAB efficiency by manager", config: view({ plugin: "Datagrid", group_by: ["manager"], columns: ["faab_bid", "points_as_starter", "points_per_dollar", "transaction_id"], aggregates: { faab_bid: "sum", points_as_starter: "sum", points_per_dollar: "avg", transaction_id: "count" }, filter: [["type", "==", "waiver"]], sort: [["points_as_starter", "desc"]] }) },
    { name: "Overpays", config: view({ columns: ["overpaid_by", "faab_bid", "next_best_bid", "competing_bids", "player_name", "manager", "season", "week", "points_as_starter"], sort: [["overpaid_by", "desc"]], filter: [["competing_bids", ">", 0]] }) },
    { name: "Bids by week", config: view({ plugin: "Y Line", group_by: ["week"], split_by: ["season"], columns: ["faab_bid"], aggregates: { faab_bid: "sum" }, filter: [["type", "==", "waiver"]] }) },
    { name: "Busts: paid and dropped", config: view({ columns: ["faab_bid", "player_name", "manager", "season", "week", "points_as_starter", "weeks_on_roster", "was_dropped_later"], filter: [["was_dropped_later", "==", true], ["faab_bid", ">", 0]], sort: [["faab_bid", "desc"]] }) },
  ],
};
