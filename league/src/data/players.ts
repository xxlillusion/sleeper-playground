/* NFL player list, reduced to id -> [name, position, team] and kept for a day in localStorage under the same key the explorer uses. */
import { api } from "../api/sleeper";

export type PlayerMap = Record<string, [name: string, pos: string, team: string]>;
const KEY = "sleeper_players";

let cached: PlayerMap | null = null;
let pending: Promise<PlayerMap> | null = null;

export function ensurePlayers(): Promise<PlayerMap> {
  if (cached) return Promise.resolve(cached);
  if (pending) return pending;
  const today = new Date().toISOString().slice(0, 10);
  try {
    const c = JSON.parse(localStorage.getItem(KEY) || "null");
    if (c && c.date === today && c.map) return Promise.resolve((cached = c.map as PlayerMap));
  } catch { /* ignore */ }
  pending = api<Record<string, { first_name?: string; last_name?: string; full_name?: string; position?: string; team?: string }>>("/players/nfl")
    .then(raw => {
      const map: PlayerMap = {};
      for (const [id, p] of Object.entries(raw || {})) {
        const name = p.position === "DEF" ? `${p.first_name} ${p.last_name}` : (p.full_name || `${p.first_name || ""} ${p.last_name || ""}`.trim());
        map[id] = [name, p.position || "", p.team || ""];
      }
      cached = map;
      try { localStorage.setItem(KEY, JSON.stringify({ date: today, map })); } catch { /* quota */ }
      return map;
    })
    .finally(() => { pending = null; });
  return pending;
}

export const isDefId = (id: string) => isNaN(+id);

export function lookupPlayer(map: PlayerMap | null, id: string): [string, string, string] {
  const hit = map?.[id];
  if (hit) return hit;
  return isDefId(id) ? [`${id} defense`, "DEF", id] : [`Player ${id}`, "", ""];
}
