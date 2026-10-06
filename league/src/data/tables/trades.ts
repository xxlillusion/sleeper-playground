import type { Row } from "../../perspective/engine";
import { lookupPlayer } from "../players";
import { lastWeek, playerPointsFor } from "../value";
import { r2 } from "../weeks";
import { nameOf, seasonCols, teamCols, view, type TableDef } from "./common";

function grade(netPerWeek: number | null): string | null {
  if (netPerWeek == null) return null;
  return netPerWeek >= 6 ? "A" : netPerWeek >= 2 ? "B" : netPerWeek >= -2 ? "C" : netPerWeek >= -6 ? "D" : "F";
}

export const trades: TableDef = {
  id: "trades",
  label: "Trades",
  description: "One row per team per completed trade, graded by what the players received and sent went on to score for their new teams over the rest of that season.",
  grain: "team-trade",
  requires: "transactions",
  schema: {
    league_id: "string", season: "integer", league_name: "string", week: "integer", transaction_id: "string", created: "datetime",
    roster_id: "integer", user_id: "string", manager: "string", team: "string", partners: "string", team_count: "integer",
    received: "string", sent: "string", received_count: "integer", sent_count: "integer", picks_received: "integer", picks_sent: "integer", faab_received: "integer", faab_sent: "integer",
    received_points: "float", sent_points: "float", net_points: "float",
    received_starter_points: "float", sent_starter_points: "float", net_starter_points: "float",
    received_points_4wk: "float", sent_points_4wk: "float", net_points_4wk: "float",
    weeks_remaining: "integer", net_starter_points_per_week: "float", grade: "string",
  },
  build({ ds }) {
    const rows: Row[] = [];
    for (const m of ds.models) {
      if (!m.raw.transactions) continue;
      const end = lastWeek(m.raw);
      const T = (rid: number) => m.teams[rid];
      const M = (rid: number) => (T(rid) ? nameOf(ds, T(rid).uid, T(rid).manager) : `Team ${rid}`);
      for (const list of Object.values(m.raw.transactions)) for (const t of list) {
        if (t.type !== "trade" || t.status !== "complete") continue;
        const ids = t.roster_ids || [];
        const adds = Object.entries(t.adds || {}), drops = Object.entries(t.drops || {});
        for (const rid of ids) {
          const got = adds.filter(([, r]) => r === rid).map(([p]) => p);
          const gave = drops.filter(([, r]) => r === rid).map(([p]) => p);
          // Who ended up with each player I sent, so his value is measured on that roster
          const newOwner = (pid: string) => adds.find(([p]) => p === pid)?.[1] ?? null;
          const val = (pid: string, r: number | null, to?: number) => (r == null ? { total: 0, starter: 0, starts: 0, weeks: 0 } : playerPointsFor(m.raw, r, pid, t.leg, to));
          const sum = (arr: { total: number; starter: number }[], k: "total" | "starter") => r2(arr.reduce((a, x) => a + x[k], 0));
          const gotV = got.map(p => val(p, rid)), gaveV = gave.map(p => val(p, newOwner(p)));
          const gotV4 = got.map(p => val(p, rid, t.leg + 3)), gaveV4 = gave.map(p => val(p, newOwner(p), t.leg + 3));
          const picksIn = (t.draft_picks || []).filter(p => p.owner_id === rid).length, picksOut = (t.draft_picks || []).filter(p => p.previous_owner_id === rid).length;
          const faabIn = (t.waiver_budget || []).filter(w => w.receiver === rid).reduce((a, w) => a + w.amount, 0), faabOut = (t.waiver_budget || []).filter(w => w.sender === rid).reduce((a, w) => a + w.amount, 0);
          const weeksLeft = Math.max(0, end - t.leg + 1);
          const netStarter = r2(sum(gotV, "starter") - sum(gaveV, "starter"));
          const perWeek = weeksLeft >= 2 ? r2(netStarter / weeksLeft) : null;
          rows.push({
            ...seasonCols(m), week: t.leg, transaction_id: t.transaction_id, created: t.created,
            ...teamCols(ds, T(rid), rid, m.sid), partners: ids.filter(x => x !== rid).map(M).join(", "), team_count: ids.length,
            received: got.map(p => lookupPlayer(ds.players, p)[0]).join(", ") || null, sent: gave.map(p => lookupPlayer(ds.players, p)[0]).join(", ") || null,
            received_count: got.length, sent_count: gave.length, picks_received: picksIn, picks_sent: picksOut, faab_received: faabIn, faab_sent: faabOut,
            received_points: sum(gotV, "total"), sent_points: sum(gaveV, "total"), net_points: r2(sum(gotV, "total") - sum(gaveV, "total")),
            received_starter_points: sum(gotV, "starter"), sent_starter_points: sum(gaveV, "starter"), net_starter_points: netStarter,
            received_points_4wk: sum(gotV4, "total"), sent_points_4wk: sum(gaveV4, "total"), net_points_4wk: r2(sum(gotV4, "total") - sum(gaveV4, "total")),
            weeks_remaining: weeksLeft, net_starter_points_per_week: perWeek, grade: grade(perWeek),
          });
        }
      }
    }
    return rows;
  },
  defaultView: view({ columns: ["season", "week", "manager", "partners", "received", "sent", "net_starter_points", "net_points", "grade", "weeks_remaining"], sort: [["season", "desc"], ["week", "desc"]] }),
  presets: [
    { name: "All trades", config: view({ columns: ["season", "week", "manager", "partners", "received", "sent", "net_starter_points", "net_points", "grade", "weeks_remaining"], sort: [["season", "desc"], ["week", "desc"]] }) },
    { name: "Best and worst trades", config: view({ columns: ["net_starter_points", "grade", "manager", "partners", "received", "sent", "season", "week", "weeks_remaining"], sort: [["net_starter_points", "desc"]], filter: [["weeks_remaining", ">=", 3]] }) },
    { name: "Trade record by manager", config: view({ plugin: "Datagrid", group_by: ["manager"], columns: ["transaction_id", "net_starter_points", "net_points", "picks_received", "picks_sent"], aggregates: { transaction_id: "count", net_starter_points: "sum", net_points: "sum", picks_received: "sum", picks_sent: "sum" }, sort: [["net_starter_points", "desc"]] }) },
    { name: "Grades by manager", config: view({ plugin: "Y Bar", group_by: ["manager"], split_by: ["grade"], columns: ["transaction_id"], aggregates: { transaction_id: "count" } }) },
  ],
};
