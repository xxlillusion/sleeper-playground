/* Ready-made views: the per-table Perspective presets converted to ViewSpecs, plus natural-language ones. */
import { TABLES } from "../data/catalog";
import { fromPerspective } from "./perspective";
import { measureId, type ViewSpec } from "./spec";

export interface PresetView { id: string; name: string; dataset: string; group: string; question?: string; spec: ViewSpec }

const m = (agg: "sum" | "avg" | "count" | "max" | "min" | "distinct", col: string, label?: string) => ({ id: measureId(agg, col), col, agg, label });

const QUESTIONS: PresetView[] = [
  { id: "q-titles", name: "Who has the most titles?", question: "Who has the most titles?", dataset: "managers", group: "Questions",
    spec: { dataset: "managers", rows: ["display_name"], columns: [], measures: [m("sum", "titles", "Titles"), m("sum", "runner_ups", "Runner-ups"), m("sum", "last_places", "Last places")], filters: [], sort: [{ key: "sum_titles", dir: "desc" }], chart: "bar" } },
  { id: "q-points-by-season", name: "Points by manager each season", question: "How many points has each manager scored per season?", dataset: "teams", group: "Questions",
    spec: { dataset: "teams", rows: ["manager"], columns: ["season"], measures: [m("sum", "pf", "Points for")], filters: [], sort: [{ key: "sum_pf", dir: "desc" }], chart: "bar" } },
  { id: "q-luckiest", name: "Luckiest seasons ever", question: "Which seasons were the luckiest?", dataset: "teams", group: "Questions",
    spec: { dataset: "teams", rows: ["season", "manager"], columns: [], measures: [m("sum", "luck", "Luck (wins)"), m("sum", "wins", "Wins"), m("sum", "expected_wins", "Expected wins")], filters: [["is_complete", "==", true]].map(([col, op, value]) => ({ col: col as string, op: op as "==", value: value as boolean })), sort: [{ key: "sum_luck", dir: "desc" }], chart: "table", limit: 15 } },
  { id: "q-h2h", name: "Head-to-head matrix", question: "Who owns whom?", dataset: "h2h", group: "Questions",
    spec: { dataset: "h2h", rows: ["manager"], columns: ["opponent"], measures: [m("sum", "wins", "Wins")], filters: [], sort: [], chart: "heatmap" } },
  { id: "q-highest", name: "Highest weekly scores", question: "What are the highest scores ever?", dataset: "weekly_scores", group: "Questions",
    spec: { dataset: "weekly_scores", rows: [], columns: [], measures: [], filters: [{ col: "week_final", op: "==", value: true }], sort: [{ key: "points", dir: "desc" }], chart: "table", limit: 25, display: ["season", "week", "manager", "team", "points", "opp_manager", "opp_points", "result"] } },
  { id: "q-bench", name: "Points left on the bench", question: "Who leaves the most points on the bench?", dataset: "lineups", group: "Questions",
    spec: { dataset: "lineups", rows: ["manager"], columns: [], measures: [m("sum", "points_left_on_bench", "Bench points"), m("avg", "efficiency_pct", "Efficiency %"), m("sum", "would_have_won", "Games lost to lineup")], filters: [], sort: [{ key: "sum_points_left_on_bench", dir: "desc" }], chart: "bar" } },
  { id: "q-rank-bump", name: "Final rank by season", question: "How has everyone's finish changed over the years?", dataset: "teams", group: "Questions",
    spec: { dataset: "teams", rows: ["season"], columns: ["manager"], measures: [m("min", "final_rank", "Final rank")], filters: [{ col: "is_complete", op: "==", value: true }], sort: [{ key: "season", dir: "asc" }], chart: "bump" } },
  { id: "q-score-trend", name: "Average score by season", question: "Is scoring going up?", dataset: "weekly_scores", group: "Questions",
    spec: { dataset: "weekly_scores", rows: ["season"], columns: [], measures: [m("avg", "points", "Average score"), m("max", "points", "Top score")], filters: [{ col: "week_kind", op: "==", value: "regular" }], sort: [{ key: "season", dir: "asc" }], chart: "line" } },
  { id: "q-trades", name: "Best trades", question: "Who won their trades?", dataset: "trades", group: "Questions",
    spec: { dataset: "trades", rows: ["manager"], columns: [], measures: [m("count", "transaction_id", "Trades"), m("sum", "net_starter_points", "Net starter points"), m("avg", "net_starter_points", "Average net")], filters: [], sort: [{ key: "sum_net_starter_points", dir: "desc" }], chart: "bar" } },
  { id: "q-faab", name: "FAAB spent vs points gained", question: "Who spends FAAB best?", dataset: "pickups", group: "Questions",
    spec: { dataset: "pickups", rows: ["manager"], columns: [], measures: [m("sum", "faab_bid", "FAAB spent"), m("sum", "points_as_starter", "Starter points"), { id: "ppd", agg: "avg", formula: "sum(points_as_starter) / sum(faab_bid)", label: "Points per dollar" }], filters: [{ col: "type", op: "==", value: "waiver" }], sort: [{ key: "ppd", dir: "desc" }], chart: "scatter" } },
];

let cached: PresetView[] | null = null;
export function allPresets(): PresetView[] {
  if (cached) return cached;
  const fromTables = TABLES.flatMap(t => t.presets.map((p, i) => ({ id: `${t.id}-${i}`, name: p.name, dataset: t.id, group: t.label, spec: fromPerspective(t.id, p.config, t.schema) })));
  return (cached = [...QUESTIONS.map(q => ({ ...q, spec: { ...q.spec, title: q.spec.title ?? q.name } })), ...fromTables]);
}
export const presetsFor = (dataset: string) => allPresets().filter(p => p.dataset === dataset);
export const defaultSpecFor = (dataset: string): ViewSpec => { const t = TABLES.find(x => x.id === dataset)!; return fromPerspective(dataset, t.defaultView, t.schema); };
