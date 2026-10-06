/* Per-league, per-dataset viewer configs and small UI preferences in localStorage. */
import type { ViewerConfigUpdate } from "@perspective-dev/viewer";

const get = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* quota or private mode */ } };
const del = (k: string) => { try { localStorage.removeItem(k); } catch { /* ignore */ } };

export const loadView = (root: string, ds: string): ViewerConfigUpdate | null => { try { return JSON.parse(get(`league:view:${root}:${ds}`) || "null"); } catch { return null; } };
export const saveView = (root: string, ds: string, c: ViewerConfigUpdate) => set(`league:view:${root}:${ds}`, JSON.stringify(c));
export const clearView = (root: string, ds: string) => del(`league:view:${root}:${ds}`);

export const loadDataset = (root: string) => get(`league:ds:${root}`);
export const saveDataset = (root: string, id: string) => set(`league:ds:${root}`, id);

export const loadExtraIds = (root: string): string[] => { try { return JSON.parse(get(`league:extra:${root}`) || "[]"); } catch { return []; } };
export const saveExtraIds = (root: string, ids: string[]) => set(`league:extra:${root}`, JSON.stringify(ids));

export interface Prefs { includeDrafts: boolean; includeTransactions: boolean }
export const loadPrefs = (): Prefs => { try { return { includeDrafts: true, includeTransactions: true, ...JSON.parse(get("league:prefs") || "{}") }; } catch { return { includeDrafts: true, includeTransactions: true }; } };
export const savePrefs = (p: Prefs) => set("league:prefs", JSON.stringify(p));

export const loadLastId = () => get("league:last");
export const saveLastId = (id: string) => set("league:last", id);
