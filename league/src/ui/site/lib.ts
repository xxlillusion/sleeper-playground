/* Shared helpers for Prototype B ("Stat site"): global filter chips, context, avatars, formatting. */
import { createContext, useContext, useEffect, useState } from "react";
import type { ThemeName } from "../../components/PerspectiveView";
import type { LeagueDataset } from "../../data/load";
import type { Row } from "../../perspective/engine";
import { columnLabel, datasetInfo } from "../../view/catalog";
import { rawView } from "../../view/engine";
import { AGG_LABEL, emptySpec, type Filter, type Measure, type ViewSpec } from "../../view/spec";

export type WeekKind = "regular" | "playoff" | "consolation";
export interface GlobalFilters { season?: number; manager?: string; weekKind?: WeekKind }
export type PageId = "overview" | "managers" | "seasons" | "games" | "lineups" | "trades" | "drafts" | "raw";
export const PAGES: { id: PageId; label: string; icon: string }[] = [
  { id: "overview", label: "Overview", icon: "◎" }, { id: "managers", label: "Managers", icon: "☺" }, { id: "seasons", label: "Seasons", icon: "▤" },
  { id: "games", label: "Games", icon: "⚔" }, { id: "lineups", label: "Lineups", icon: "☰" }, { id: "trades", label: "Trades & waivers", icon: "⇄" },
  { id: "drafts", label: "Drafts", icon: "✎" }, { id: "raw", label: "Raw data", icon: "⌗" },
];

export const hasCol = (dataset: string, col: string) => !!datasetInfo(dataset)?.columns.some(c => c.name === col);

/** The global chips as filters on one dataset: only the columns that exist there. */
export function globalFilters(dataset: string, g: GlobalFilters): Filter[] {
  const out: Filter[] = [];
  if (g.season != null && hasCol(dataset, "season")) out.push({ col: "season", op: "==", value: g.season });
  if (g.manager) { const col = hasCol(dataset, "manager") ? "manager" : hasCol(dataset, "display_name") ? "display_name" : null; if (col) out.push({ col, op: "==", value: g.manager }); }
  if (g.weekKind) {
    if (hasCol(dataset, "week_kind")) out.push({ col: "week_kind", op: "==", value: g.weekKind === "regular" ? "regular" : "playoff" });
    else if (hasCol(dataset, "kind")) out.push({ col: "kind", op: "==", value: g.weekKind });
  }
  return out;
}
export function withGlobal(spec: ViewSpec, g: GlobalFilters): ViewSpec {
  const extra = globalFilters(spec.dataset, g).filter(f => !spec.filters.some(x => x.col === f.col));
  return extra.length ? { ...spec, filters: [...spec.filters, ...extra] } : spec;
}
export const isFiltered = (g: GlobalFilters) => g.season != null || !!g.manager || !!g.weekKind;

export const m = (agg: Measure["agg"], col: string, label?: string): Measure => ({ id: `${agg}_${col}`, col, agg, label });
export const measureLabel = (dataset: string, x: Measure) => x.label ?? (x.col ? `${AGG_LABEL[x.agg]} ${columnLabel(dataset, x.col).toLowerCase()}` : x.formula ?? x.id);
export const f = (col: string, op: Filter["op"], value?: Filter["value"]): Filter => ({ col, op, value });

/** Top rows of a dataset by one column, as a raw view. */
export const topRows = (rows: Row[], dataset: string, key: string, dir: "asc" | "desc", filters: Filter[] = [], limit = 10, display?: string[]) =>
  rawView(rows, { ...emptySpec(dataset), filters, sort: [{ key, dir }], limit, display });

export const num = (v: unknown): number | null => (typeof v === "number" && isFinite(v) ? v : null);
export const fmt = (v: unknown, digits = 0): string => (typeof v === "number" ? v.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits }) : v == null ? "—" : String(v));
export const signed = (v: number, digits = 1) => `${v > 0 ? "+" : ""}${fmt(v, digits)}`;

/** 0..100: share of other values that this one beats */
export function percentileOf(values: number[], v: number): number {
  if (values.length < 2) return 50;
  let below = 0, equal = 0;
  for (const x of values) { if (x < v) below++; else if (x === v) equal++; }
  return Math.round(((below + Math.max(0, equal - 1) / 2) / (values.length - 1)) * 100);
}

/** Avatar URL per canonical manager name, newest season wins. */
export function avatarIndex(ds: LeagueDataset): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (let i = ds.models.length - 1; i >= 0; i--) {
    for (const t of Object.values(ds.models[i].teams)) {
      if (t.isOpen) continue;
      const name = ds.names[t.uid] ?? t.manager;
      if (out[name] == null) out[name] = t.avatar ?? null;
    }
  }
  return out;
}

export function useMedia(query: string): boolean {
  const [on, setOn] = useState(() => matchMedia(query).matches);
  useEffect(() => { const mq = matchMedia(query); const h = () => setOn(mq.matches); mq.addEventListener("change", h); return () => mq.removeEventListener("change", h); }, [query]);
  return on;
}

export interface DrillRequest { title: string; rows: Row[]; columns?: string[]; labels?: Record<string, string> }
export interface SiteCtx {
  ds: LeagueDataset;
  rowsById: Record<string, Row[]>;
  counts: Record<string, number>;
  pending: Record<string, string | null>;
  theme: ThemeName;
  g: GlobalFilters;
  gk: string;
  setG: (g: GlobalFilters) => void;
  /** Add or replace one chip */
  chip: (patch: GlobalFilters) => void;
  avatars: Record<string, string | null>;
  openPivot: (spec: ViewSpec) => void;
  openDrill: (d: DrillRequest) => void;
  go: (page: PageId) => void;
}
export const SiteContext = createContext<SiteCtx>(null!);
export const useSite = () => useContext(SiteContext);

/** Page id in the URL (?page=), alongside ?v= for the pivot */
export function readPage(): PageId { const p = new URLSearchParams(location.search).get("page") as PageId | null; return p && PAGES.some(x => x.id === p) ? p : "overview"; }
export function writePage(p: PageId) { const url = new URL(location.href); if (p === "overview") url.searchParams.delete("page"); else url.searchParams.set("page", p); history.replaceState(null, "", url); }
