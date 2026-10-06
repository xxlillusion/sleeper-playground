import type { Roster, User } from "../api/types";

export interface Team {
  rid: number;
  roster: Roster;
  user: User | null;
  /** Sleeper user_id, or a synthetic id for a roster nobody owns */
  uid: string;
  name: string;
  manager: string;
  avatar: string | null;
  isOpen: boolean;
  coOwners: User[];
  isCommish: boolean;
}

export const avatarUrl = (id: string | null | undefined) => (id ? `https://sleepercdn.com/avatars/thumbs/${id}` : null);
export const openUid = (leagueId: string, rid: number) => `open:${leagueId}:${rid}`;

/* Rosters link to members through owner_id -> user_id. Team name and logo live on the user's league metadata. */
export function buildTeams(users: User[], rosters: Roster[], leagueId: string): Record<number, Team> {
  const byId = new Map(users.map(u => [u.user_id, u]));
  const out: Record<number, Team> = {};
  for (const r of rosters) {
    const u = r.owner_id ? byId.get(r.owner_id) ?? null : null;
    out[r.roster_id] = {
      rid: r.roster_id, roster: r, user: u,
      uid: u?.user_id ?? openUid(leagueId, r.roster_id),
      name: u?.metadata?.team_name || u?.display_name || `Team ${r.roster_id}`,
      manager: u?.display_name || "Open slot",
      avatar: u?.metadata?.avatar || avatarUrl(u?.avatar),
      isOpen: !u,
      coOwners: (r.co_owners || []).map(id => byId.get(id)).filter((x): x is User => !!x),
      isCommish: !!u?.is_owner,
    };
  }
  return out;
}
