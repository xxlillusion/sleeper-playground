import type { Row } from "../../perspective/engine";

const DATE_COLS = new Set(["created", "draft_date", "status_updated"]);

export function formatValue(col: string, v: unknown): string {
  if (v == null) return "";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "number") {
    if (DATE_COLS.has(col) && v > 1e11) return new Date(v).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
    if (Number.isInteger(v)) return /season|week|year|_id$|rank|round|pick|slot|match|place|count|games|wins|losses|ties/.test(col) ? String(v) : v.toLocaleString();
    return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return String(v);
}

export function toCsv(rows: Row[], columns?: string[]): string {
  const cols = columns?.length ? columns : rows.length ? Object.keys(rows[0]) : [];
  const esc = (v: unknown) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [cols.join(","), ...rows.map(r => cols.map(c => esc(r[c])).join(","))].join("\n");
}
