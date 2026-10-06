/* View state in the URL: ?ui=<prototype>&v=<compressed spec>. Everything else in the query string is left alone. */
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from "lz-string";
import type { ViewSpec } from "./spec";

export type UiName = "classic" | "ask" | "site" | "sheet";
export const UI_NAMES: UiName[] = ["classic", "ask", "site", "sheet"];
export const UI_LABEL: Record<UiName, string> = { classic: "Classic", ask: "Ask", site: "Stat site", sheet: "Sheet" };

export function readUi(): UiName {
  const q = new URLSearchParams(location.search).get("ui") as UiName | null;
  if (q && UI_NAMES.includes(q)) return q;
  try { const s = localStorage.getItem("league:ui") as UiName | null; if (s && UI_NAMES.includes(s)) return s; } catch { /* ignore */ }
  return "classic";
}
export function writeUi(ui: UiName) {
  const url = new URL(location.href); url.searchParams.set("ui", ui); url.searchParams.delete("v"); history.replaceState(null, "", url);
  try { localStorage.setItem("league:ui", ui); } catch { /* ignore */ }
}

export function readSpec(): ViewSpec | null {
  const v = new URLSearchParams(location.search).get("v"); if (!v) return null;
  try { const s = JSON.parse(decompressFromEncodedURIComponent(v) || "null"); return s && typeof s === "object" && s.dataset ? (s as ViewSpec) : null; } catch { return null; }
}
export function writeSpec(spec: ViewSpec | null) {
  const url = new URL(location.href);
  if (spec) url.searchParams.set("v", compressToEncodedURIComponent(JSON.stringify(spec))); else url.searchParams.delete("v");
  history.replaceState(null, "", url);
}
export const shareUrl = (spec: ViewSpec) => { const url = new URL(location.href); url.searchParams.set("v", compressToEncodedURIComponent(JSON.stringify(spec))); return url.toString(); };
