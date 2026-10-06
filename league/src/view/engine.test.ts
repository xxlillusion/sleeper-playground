import { describe, expect, it } from "vitest";
import { pivot, rawView, validateFormula } from "./engine";
import { emptySpec, type ViewSpec } from "./spec";

const rows = [
  { season: 2024, manager: "A", week: 1, points: 100, won: true, game_id: "g1" },
  { season: 2024, manager: "A", week: 2, points: 120, won: false, game_id: "g2" },
  { season: 2024, manager: "B", week: 1, points: 90, won: false, game_id: "g1" },
  { season: 2025, manager: "A", week: 1, points: 80, won: true, game_id: "g3" },
  { season: 2025, manager: "B", week: 1, points: 130, won: true, game_id: "g3" },
  { season: 2025, manager: "B", week: 2, points: null, won: false, game_id: "g4" },
];
const base: ViewSpec = { ...emptySpec("games"), rows: ["manager"], measures: [{ id: "sum_points", col: "points", agg: "sum" }, { id: "count", agg: "count" }] };

describe("pivot", () => {
  it("groups and sums", () => {
    const r = pivot(rows, base);
    expect(r.flat).toEqual([{ manager: "A", sum_points: 300, count: 3 }, { manager: "B", sum_points: 220, count: 3 }]);
  });
  it("splits by columns and keeps totals", () => {
    const r = pivot(rows, { ...base, columns: ["season"] });
    expect(r.colKeys.map(k => k.values[0])).toEqual([2024, 2025]);
    const a = r.flat[0];
    expect(a["sum_points\u00012024"]).toBe(220); expect(a["sum_points\u00012025"]).toBe(80); expect(a.sum_points).toBe(300);
  });
  it("filters, sorts and limits", () => {
    const r = pivot(rows, { ...base, filters: [["season", "==", 2025]].map(([col, op, value]) => ({ col: col as string, op: op as "==", value: value as number })), sort: [{ key: "sum_points", dir: "desc" }], limit: 1 });
    expect(r.flat).toEqual([{ manager: "B", sum_points: 130, count: 2 }]);
  });
  it("averages ignore nulls and booleans count as 0/1", () => {
    const r = pivot(rows, { ...base, rows: [], measures: [{ id: "avg_points", col: "points", agg: "avg" }, { id: "wins", col: "won", agg: "sum" }] });
    expect(r.flat[0].avg_points).toBe(104); expect(r.flat[0].wins).toBe(3);
  });
  it("evaluates formulas over hidden measures", () => {
    const r = pivot(rows, { ...base, measures: [{ id: "ppg", agg: "avg", formula: "sum(points) / count(game_id)" }] });
    expect(r.flat[0].ppg).toBe(100); // A: 300 / 3
    expect(r.measures.map(m => m.id)).toContain("sum_points");
    expect(validateFormula("sum(points) /")).not.toBeNull();
    expect(validateFormula("sum(points) / count(game_id)")).toBeNull();
  });
  it("drills to the rows behind a cell", () => {
    const r = pivot(rows, { ...base, columns: ["season"] });
    const b = r.rowKeys.find(k => k.values[0] === "B")!, s25 = r.colKeys.find(k => k.values[0] === 2025)!;
    expect(r.drill(b.key, s25.key)).toHaveLength(2);
    expect(r.drill(b.key)).toHaveLength(3);
    expect(r.drill()).toHaveLength(6);
  });
  it("raw view sorts and filters", () => {
    const out = rawView(rows, { ...emptySpec("games"), filters: [{ col: "manager", op: "==", value: "A" }], sort: [{ key: "points", dir: "desc" }] });
    expect(out.map(r => r.points)).toEqual([120, 100, 80]);
  });
});
