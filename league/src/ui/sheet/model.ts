/* Sheet prototype helpers: the spec it edits (a ViewSpec plus Perspective expressions), the viewer config built from it,
   the normalised form used to tell our own restores apart from edits made inside Perspective, and saved views. */
import type { ViewerConfig, ViewerConfigUpdate } from "@perspective-dev/viewer";
import type { Row } from "../../perspective/engine";
import { datasetInfo, type ColKind, type ColumnInfo } from "../../view/catalog";
import { toPerspective } from "../../view/perspective";
import type { Agg, Scalar, ViewSpec } from "../../view/spec";

/** Formula columns are Perspective expressions keyed by their display name. They ride along in the URL and in saved views. */
export type SheetSpec = ViewSpec & { expressions?: Record<string, string> };

export const exprNames = (s: SheetSpec) => Object.keys(s.expressions ?? {});

/** Every column the viewer can show: the dataset's schema plus formula columns. */
export const allColumnsOf = (s: SheetSpec): string[] => {
  const base = (datasetInfo(s.dataset)?.columns ?? []).map(c => c.name);
  return [...base, ...exprNames(s).filter(n => !base.includes(n))];
};

/** Drop sorts that stopped making sense after an edit: raw-column sorts once the view is pivoted, pivot sorts once it is raw again. */
export function normalizeSpec(s: SheetSpec): SheetSpec {
  const pivoted = s.rows.length > 0 || s.columns.length > 0 || s.measures.length > 0;
  const keys = new Set(pivoted ? [...s.rows, ...s.measures.map(m => m.id)] : allColumnsOf(s));
  const sort = s.sort.filter(x => keys.has(x.key));
  return sort.length === s.sort.length ? s : { ...s, sort };
}

export function buildConfig(s: SheetSpec): ViewerConfigUpdate {
  const c = toPerspective(s, allColumnsOf(s));
  return { ...c, expressions: { ...(s.expressions ?? {}) } };
}

/** The parts of a viewer config that the Organize panel owns. Two configs with the same normal form show the same view. */
export function normConfig(c: ViewerConfigUpdate | ViewerConfig): string {
  const columns = (c.columns ?? []).map(x => x ?? null);
  const aggregates: Record<string, string> = {};
  for (const k of columns) if (k && c.aggregates?.[k] != null) aggregates[k] = String(c.aggregates[k]);
  const sort = (c.sort ?? []).map(s => [String((s as unknown as string[])[0]), String((s as unknown as string[])[1])]);
  const filter = (c.filter ?? []).map(f => { const [col, op, v] = f as unknown as [string, string, unknown]; return [col, op, v === undefined ? null : v]; });
  return JSON.stringify({ plugin: c.plugin ?? "Datagrid", group_by: c.group_by ?? [], split_by: c.split_by ?? [], columns, aggregates, filter, sort, expressions: c.expressions ?? {} });
}

/* ---------- column helpers ---------- */
export const KIND_ICON: Record<ColKind, string> = { measure: "Σ", dimension: "≡", flag: "✓", date: "📅", id: "#" };
export const KIND_NAME: Record<ColKind, string> = { measure: "Number", dimension: "Text", flag: "Yes / no", date: "Date", id: "ID" };

/** Columns of a dataset plus its formula columns, so pickers and the Fields list treat formulas like real columns. */
export function columnsOf(s: SheetSpec, exprTypes: Record<string, string> = {}): ColumnInfo[] {
  const base = datasetInfo(s.dataset)?.columns ?? [];
  const extra: ColumnInfo[] = exprNames(s).filter(n => !base.some(c => c.name === n)).map(n => {
    const t = exprTypes[n]; const kind: ColKind = t === "string" ? "dimension" : t === "boolean" ? "flag" : t === "date" || t === "datetime" ? "date" : "measure";
    return { name: n, label: n, kind, type: (t as ColumnInfo["type"]) ?? "float", description: s.expressions?.[n] };
  });
  return [...base, ...extra];
}
export const defaultAggFor = (c: ColumnInfo | undefined): Agg => (!c ? "sum" : c.kind === "measure" ? "sum" : c.kind === "flag" ? "sum" : "count");
export const isGroupable = (c: ColumnInfo) => c.kind === "dimension" || c.kind === "flag" || c.kind === "date" || c.kind === "id";

export function labelsFor(dataset: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of datasetInfo(dataset)?.columns ?? []) out[c.name] = c.label;
  return out;
}

/** Distinct values of a column, in natural order, capped so pickers stay small. */
export function distinctValues(rows: Row[], col: string, max = 400): Scalar[] | null {
  const set = new Set<Scalar>();
  for (const r of rows) { set.add(r[col] ?? null); if (set.size > max) return null; }
  const vals = [...set].filter(v => v != null);
  vals.sort((a, b) => (typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b), undefined, { numeric: true })));
  return vals;
}

/* ---------- saved views ---------- */
export interface SavedView { id: string; name: string; spec: SheetSpec }
const viewsKey = (root: string) => `league:sheet:views:${root}`;
export function loadViews(root: string): SavedView[] {
  try { const v = JSON.parse(localStorage.getItem(viewsKey(root)) || "[]"); return Array.isArray(v) ? v.filter(x => x && x.spec && x.spec.dataset) : []; } catch { return []; }
}
export function saveViews(root: string, views: SavedView[]) { try { localStorage.setItem(viewsKey(root), JSON.stringify(views)); } catch { /* quota */ } }

export const panelKey = "league:sheet:panel";
export function loadPanelOpen(): boolean { try { return localStorage.getItem(panelKey) !== "closed"; } catch { return true; } }
export function savePanelOpen(open: boolean) { try { localStorage.setItem(panelKey, open ? "open" : "closed"); } catch { /* ignore */ } }

/** Five example formulas built from the dataset's real column names. */
export function formulaExamples(dataset: string): { name: string; expr: string; note: string }[] {
  const cols = datasetInfo(dataset)?.columns ?? [];
  const nums = cols.filter(c => c.kind === "measure").map(c => c.name);
  const dims = cols.filter(c => c.kind === "dimension").map(c => c.name);
  const has = (n: string) => cols.some(c => c.name === n);
  const a = has("pf") ? "pf" : has("points") ? "points" : nums[0] ?? "x";
  const b = has("games_played") ? "games_played" : has("pa") ? "pa" : nums[1] ?? nums[0] ?? "y";
  const c = has("wins") ? "wins" : has("points") ? "points" : nums[2] ?? a;
  const s = has("manager") ? "manager" : dims[0] ?? "manager";
  const t = has("season") ? "season" : dims[1] ?? dims[0] ?? "season";
  return [
    { name: `${a} per ${b}`, expr: `"${a}" / "${b}"`, note: "Divide one number by another" },
    { name: `${a} minus ${b}`, expr: `"${a}" - "${b}"`, note: "Difference between two columns" },
    { name: `${a} bucket`, expr: `floor("${a}" / 10) * 10`, note: "Round down to the nearest 10 for grouping" },
    { name: `${c} tier`, expr: `if ("${c}" >= 100) { 'High' } else { 'Low' }`, note: "A label from a condition" },
    { name: `${s} ${t}`, expr: `concat("${s}", ' ', string("${t}"))`, note: "Join text and numbers into one label" },
  ];
}
