import type { Row } from "../../perspective/engine";
import type { Game } from "../model";
import { r2 } from "../weeks";
import { nameOf, pct, rec, view, type TableDef } from "./common";

interface Pair {
  a: string; b: string; w: number; l: number; t: number; pf: number; pa: number;
  reg: number; regW: number; po: number; poW: number;
  bigWin: { m: number; when: string } | null; bigLoss: { m: number; when: string } | null;
  streak: { r: string; n: number }; first: string; last: string; lastRes: string; seasons: Set<number>;
}

export const h2h: TableDef = {
  id: "h2h",
  label: "Head-to-head",
  description: "One row per manager against each opponent they have played, both directions, so grouping by manager and splitting by opponent gives the matrix. Regular season and playoff games; consolation games left out.",
  grain: "manager-opponent pair",
  schema: {
    manager: "string", opponent: "string", manager_id: "string", opponent_id: "string",
    games: "integer", wins: "integer", losses: "integer", ties: "integer", record: "string", win_pct: "float", pf: "float", pa: "float", avg_margin: "float",
    regular_games: "integer", regular_wins: "integer", playoff_games: "integer", playoff_wins: "integer",
    biggest_win_margin: "float", biggest_win_when: "string", worst_loss_margin: "float", worst_loss_when: "string",
    current_streak: "string", first_meeting: "string", last_meeting: "string", last_result: "string", seasons_met: "integer",
    is_nemesis: "boolean", is_favorite_opponent: "boolean",
  },
  build({ ds }) {
    const pairs = new Map<string, Pair>();
    const games: (Game & { season: number })[] = ds.models.flatMap(m => m.games.filter(g => g.kind !== "consolation"));
    for (const g of games) for (const [me, op] of [[g.a, g.b], [g.b, g.a]] as const) {
      if (me.uid.startsWith("open:") || op.uid.startsWith("open:")) continue;
      const k = `${me.uid}|${op.uid}`;
      const when = `${g.season} wk ${g.week}${g.label ? " " + g.label : ""}`;
      const p = pairs.get(k) ?? { a: me.uid, b: op.uid, w: 0, l: 0, t: 0, pf: 0, pa: 0, reg: 0, regW: 0, po: 0, poW: 0, bigWin: null, bigLoss: null, streak: { r: "", n: 0 }, first: when, last: when, lastRes: "", seasons: new Set() };
      const r = me.pts > op.pts ? "W" : me.pts < op.pts ? "L" : "T", margin = r2(me.pts - op.pts);
      if (r === "W") p.w++; else if (r === "L") p.l++; else p.t++;
      p.pf += me.pts; p.pa += op.pts;
      if (g.kind === "regular") { p.reg++; if (r === "W") p.regW++; } else { p.po++; if (r === "W") p.poW++; }
      if (margin > 0 && (!p.bigWin || margin > p.bigWin.m)) p.bigWin = { m: margin, when };
      if (margin < 0 && (!p.bigLoss || margin < p.bigLoss.m)) p.bigLoss = { m: margin, when };
      p.streak = p.streak.r === r ? { r, n: p.streak.n + 1 } : { r, n: 1 };
      p.last = when; p.lastRes = r; p.seasons.add(g.season);
      pairs.set(k, p);
    }
    // nemesis = lowest win % against (min 3 games); favourite = highest
    const byA = new Map<string, Pair[]>();
    for (const p of pairs.values()) { const l = byA.get(p.a) ?? []; l.push(p); byA.set(p.a, l); }
    const nemesis = new Set<string>(), fav = new Set<string>();
    for (const [a, list] of byA) {
      const elig = list.filter(p => p.w + p.l + p.t >= 3);
      if (!elig.length) continue;
      const w = (p: Pair) => (p.w + p.t / 2) / (p.w + p.l + p.t);
      const worst = [...elig].sort((x, y) => w(x) - w(y) || y.w + y.l - (x.w + x.l))[0], best = [...elig].sort((x, y) => w(y) - w(x) || y.w + y.l - (x.w + x.l))[0];
      if (w(worst) < 0.5) nemesis.add(`${a}|${worst.b}`);
      if (w(best) > 0.5) fav.add(`${a}|${best.b}`);
    }
    return [...pairs.values()].sort((x, y) => nameOf(ds, x.a).localeCompare(nameOf(ds, y.a)) || y.w + y.l + y.t - (x.w + x.l + x.t)).map(p => {
      const n = p.w + p.l + p.t;
      return {
        manager: nameOf(ds, p.a), opponent: nameOf(ds, p.b), manager_id: p.a, opponent_id: p.b,
        games: n, wins: p.w, losses: p.l, ties: p.t, record: rec(p.w, p.l, p.t), win_pct: pct(p.w, p.l, p.t), pf: r2(p.pf), pa: r2(p.pa), avg_margin: r2((p.pf - p.pa) / n),
        regular_games: p.reg, regular_wins: p.regW, playoff_games: p.po, playoff_wins: p.poW,
        biggest_win_margin: p.bigWin?.m ?? null, biggest_win_when: p.bigWin?.when ?? null, worst_loss_margin: p.bigLoss?.m ?? null, worst_loss_when: p.bigLoss?.when ?? null,
        current_streak: `${p.streak.r}${p.streak.n}`, first_meeting: p.first, last_meeting: p.last, last_result: p.lastRes, seasons_met: p.seasons.size,
        is_nemesis: nemesis.has(`${p.a}|${p.b}`), is_favorite_opponent: fav.has(`${p.a}|${p.b}`),
      } as Row;
    });
  },
  defaultView: view({ plugin: "Datagrid", group_by: ["manager"], split_by: ["opponent"], columns: ["record"], aggregates: { record: "any" } }),
  presets: [
    { name: "Matrix: records", config: view({ plugin: "Datagrid", group_by: ["manager"], split_by: ["opponent"], columns: ["record"], aggregates: { record: "any" } }) },
    { name: "Matrix: win %", config: view({ plugin: "Datagrid", group_by: ["manager"], split_by: ["opponent"], columns: ["win_pct"], aggregates: { win_pct: "any" }, columns_config: { win_pct: { number_color_mode: "gradient" } } }) },
    { name: "Rivalries list", config: view({ columns: ["manager", "opponent", "games", "record", "win_pct", "avg_margin", "playoff_games", "current_streak", "last_meeting", "last_result"], sort: [["games", "desc"]] }) },
    { name: "Nemesis and favourite opponent", config: view({ columns: ["manager", "opponent", "is_nemesis", "is_favorite_opponent", "record", "win_pct", "games", "avg_margin"], filter: [["is_nemesis", "==", true]], sort: [["manager", "asc"]] }) },
    { name: "Biggest beatdowns", config: view({ columns: ["biggest_win_margin", "manager", "opponent", "biggest_win_when", "record"], sort: [["biggest_win_margin", "desc"]] }) },
  ],
};
