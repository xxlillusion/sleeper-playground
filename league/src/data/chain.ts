/* Every season of a league, newest first, by following previous_league_id. */
import { api } from "../api/sleeper";
import type { League } from "../api/types";

export async function walkChain(rootId: string, extraIds: string[] = [], onStep?: (n: number) => void): Promise<League[]> {
  const seen = new Map<string, League>();
  const walk = async (startId: string) => {
    let id: string | null = startId;
    while (id && id !== "0" && !seen.has(id) && seen.size < 40) {
      const lg: League | null = await api<League | null>(`/league/${id}`);
      if (!lg) break;
      seen.set(lg.league_id, lg);
      onStep?.(seen.size);
      id = lg.previous_league_id;
    }
  };
  await walk(rootId);
  for (const extra of extraIds) { try { await walk(extra); } catch { /* a bad id just contributes nothing */ } }
  return [...seen.values()].sort((a, b) => +b.season - +a.season || b.league_id.localeCompare(a.league_id));
}
