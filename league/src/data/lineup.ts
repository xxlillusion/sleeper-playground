/* Best possible lineup for a week: an exact maximum-weight assignment of rostered players to starting slots. */

const ELIGIBLE: Record<string, string[]> = {
  QB: ["QB"], RB: ["RB"], WR: ["WR"], TE: ["TE"], K: ["K"], DEF: ["DEF"],
  FLEX: ["RB", "WR", "TE"], SUPER_FLEX: ["QB", "RB", "WR", "TE"], REC_FLEX: ["WR", "TE"], WRRB_FLEX: ["WR", "RB"],
  DL: ["DL"], LB: ["LB"], DB: ["DB"], IDP_FLEX: ["DL", "LB", "DB"],
};
// An unfamiliar slot name accepts anyone, so an unusual league never scores zero
export const canFill = (slot: string, pos: string) => { const e = ELIGIBLE[slot]; return !e || e.includes(pos); };

export interface Candidate { id: string; pos: string; pts: number }
export interface Optimal { total: number; assignment: (Candidate | null)[] }   // one entry per slot

const NEG = -1e9;

/* Hungarian algorithm (Kuhn-Munkres) on a square cost matrix; returns the column chosen for each row. */
function hungarian(cost: number[][]): number[] {
  const n = cost.length;
  const u = new Array(n + 1).fill(0), v = new Array(n + 1).fill(0), p = new Array(n + 1).fill(0), way = new Array(n + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array(n + 1).fill(Infinity), used = new Array(n + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0]; let delta = Infinity, j1 = 0;
      for (let j = 1; j <= n; j++) if (!used[j]) {
        const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
        if (minv[j] < delta) { delta = minv[j]; j1 = j; }
      }
      for (let j = 0; j <= n; j++) if (used[j]) { u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta;
      j0 = j1;
    } while (p[j0] !== 0);
    do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
  }
  const out = new Array(n).fill(-1);
  for (let j = 1; j <= n; j++) if (p[j]) out[p[j] - 1] = j - 1;
  return out;
}

export function optimalLineup(slots: string[], candidates: Candidate[]): Optimal {
  const n = Math.max(slots.length, candidates.length);
  if (!n) return { total: 0, assignment: [] };
  // Minimise cost = -points; padded rows/columns cost 0; ineligible pairs are prohibitively expensive
  const cost: number[][] = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => {
    if (i >= slots.length || j >= candidates.length) return 0;
    return canFill(slots[i], candidates[j].pos) ? -candidates[j].pts : -NEG;
  }));
  const pick = hungarian(cost);
  const assignment: (Candidate | null)[] = slots.map((s, i) => {
    const j = pick[i];
    const c = j >= 0 && j < candidates.length ? candidates[j] : null;
    return c && canFill(s, c.pos) ? c : null;
  });
  const total = Math.round(assignment.reduce((a, c) => a + (c?.pts ?? 0), 0) * 100) / 100;
  return { total, assignment };
}
