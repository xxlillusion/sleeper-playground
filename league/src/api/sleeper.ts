/* Sleeper API client: in-memory memo, shared IndexedDB cache for frozen responses, a 6-wide request limiter and one retry. */
import { cacheGet, cachePut } from "./cache";
import type { NflState } from "./types";

export const API = "https://api.sleeper.app/v1";

let nfl: NflState | null = null;
export const setNflState = (s: NflState) => { nfl = s; };

/* Frozen rule, identical to the explorer: a league is frozen once it is complete AND its season is behind the NFL's current one
   (so late stat corrections stay out of the cache). A completed draft's picks are frozen whatever the league is doing. */
const CACHEABLE = /^\/(league|draft)\/(\d+)(\/.*)?$/;
const DONE = new Set<string>(), DRAFTS = new Set<string>();
function noteFrozen(path: string, data: unknown) {
  const drafts = /^\/league\/\d+\/drafts$/.test(path);
  if (!drafts && !/^\/league\/\d+$|^\/user\/[^/]+\/leagues\//.test(path)) return;
  for (const x of (Array.isArray(data) ? data : [data]) as Array<Record<string, unknown> | null>) {
    if (x?.status !== "complete") continue;
    if (drafts) DRAFTS.add(String(x.draft_id));
    else if (nfl && +(x.season as string) < +nfl.season) DONE.add(String(x.league_id));
  }
}
function frozen(path: string, data: unknown): boolean {
  const m = CACHEABLE.exec(path);
  if (!m || data == null) return false;
  return m[1] === "draft" ? m[3] === "/picks" && DRAFTS.has(m[2]) : DONE.has(m[2]);
}

/* Request accounting for the UI */
export const stats = { network: 0, cached: 0, errors: 0, bytes: 0 };
const listeners = new Set<() => void>();
export const onStats = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
const notify = () => listeners.forEach(fn => fn());

/* Limiter */
const MAX = 6;
let active = 0;
const queue: Array<() => void> = [];
function acquire(): Promise<void> {
  if (active < MAX) { active++; return Promise.resolve(); }
  return new Promise(res => queue.push(() => { active++; res(); }));
}
function release() { active--; queue.shift()?.(); }

const memo = new Map<string, Promise<unknown>>();
export const clearMemo = () => memo.clear();

export interface ApiOptions { fresh?: boolean }

export function api<T = unknown>(path: string, opts: ApiOptions = {}): Promise<T> {
  if (!opts.fresh && memo.has(path)) return memo.get(path) as Promise<T>;
  const p = (async () => {
    if (CACHEABLE.test(path)) {
      const hit = await cacheGet(path);
      if (hit) { noteFrozen(path, hit.data); stats.cached++; notify(); return hit.data as T; }
    }
    await acquire();
    try {
      let r: Response | null = null, text = "";
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          r = await fetch(API + path);
          text = await r.text();
          if (r.status === 429) { await new Promise(res => setTimeout(res, 2000)); continue; }
          if (r.status >= 500) { await new Promise(res => setTimeout(res, 500)); continue; }
          break;
        } catch (e) {
          if (attempt) throw e;
          await new Promise(res => setTimeout(res, 500));
        }
      }
      if (!r) throw new Error(`No response for ${path}`);
      stats.network++; stats.bytes += text.length;
      if (!r.ok) { stats.errors++; notify(); throw new Error(`Sleeper returned ${r.status} for ${path}`); }
      notify();
      const data = text ? (JSON.parse(text) as T) : (null as T);
      noteFrozen(path, data);
      if (frozen(path, data)) await cachePut({ path, data, bytes: text.length, at: Date.now() });
      return data;
    } finally { release(); }
  })();
  memo.set(path, p);
  p.catch(() => memo.delete(path));
  return p;
}
