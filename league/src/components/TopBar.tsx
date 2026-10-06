import { useState, type FormEvent } from "react";
import type { LeagueDataset } from "../data/load";
import type { Prefs } from "../lib/viewStore";

interface Props {
  id: string;
  ds: LeagueDataset | null;
  busy: boolean;
  prefs: Prefs;
  extraIds: string[];
  requests: { network: number; cached: number };
  onLoad: (id: string) => void;
  onRefresh: () => void;
  onClearCache: () => void;
  onPrefs: (p: Prefs) => void;
  onExtraIds: (ids: string[]) => void;
}

export function TopBar({ id, ds, busy, prefs, extraIds, requests, onLoad, onRefresh, onClearCache, onPrefs, onExtraIds }: Props) {
  const [draft, setDraft] = useState(id);
  const [extra, setExtra] = useState("");
  const [cleared, setCleared] = useState(false);
  const submit = (e: FormEvent) => { e.preventDefault(); const v = draft.trim(); if (/^\d{6,}$/.test(v)) onLoad(v); };
  const addExtra = (e: FormEvent) => { e.preventDefault(); const v = extra.trim(); if (/^\d{6,}$/.test(v) && !extraIds.includes(v)) { onExtraIds([...extraIds, v]); setExtra(""); } };
  const latest = ds?.models[ds.models.length - 1];
  const managers = ds ? new Set(ds.models.flatMap(m => Object.values(m.teams).filter(t => !t.isOpen).map(t => t.uid))).size : 0;
  return (
    <header className="top">
      <div className="title">
        <div>
          <span className="eyebrow">Sleeper · League Data</span>
          <h1>{latest ? latest.name : "League Data"}</h1>
        </div>
        <a href="/">← League Explorer</a>
        <a href="/guide.html">API guide</a>
      </div>
      <form className="row" onSubmit={submit}>
        <label className="hint" htmlFor="lid">League ID</label>
        <input id="lid" type="text" value={draft} onChange={e => setDraft(e.target.value)} placeholder="e.g. 1376759225572675584" spellCheck={false} inputMode="numeric" />
        <button className="btn" type="submit" disabled={busy}>Load</button>
        {ds && <button className="btn ghost" type="button" onClick={onRefresh} disabled={busy} title="Refetch the live season and rebuild">Refresh</button>}
        <button className="btn ghost" type="button" onClick={() => { onClearCache(); setCleared(true); setTimeout(() => setCleared(false), 1400); }} title="Forget cached past seasons (shared with the explorer page)">{cleared ? "Cleared" : "Clear cache"}</button>
        <span className="hint mono" title="Requests this page made">{requests.network} fetched · {requests.cached} from cache</span>
      </form>
      {ds && (
        <div className="chips" aria-label="Seasons">
          {[...ds.models].reverse().map(m => {
            const champT = m.summary.champ != null ? m.teams[m.summary.champ] : null;
            const champ = champT ? ds.names[champT.uid] ?? champT.manager : null;
            return (
              <span key={m.sid} className={`chip ${m.raw.isLive ? "live" : ""}`} title={`${m.name} · league_id ${m.sid} · ${m.raw.league.status}`}>
                <b>{m.season}</b>
                {champ ? <span className="c">🏆 {champ}</span> : <span className="hint">{m.raw.isLive ? "in progress" : m.complete ? "no final" : m.raw.league.status.replace("_", " ")}</span>}
              </span>
            );
          })}
          <span className="chip" title="Distinct Sleeper accounts that have owned a team">{managers} managers</span>
        </div>
      )}
      <details className="opts">
        <summary className="hint">Options</summary>
        <div className="row" style={{ paddingTop: 8 }}>
          <label className="row" style={{ gap: 6 }}><input type="checkbox" checked={prefs.includeTransactions} onChange={e => onPrefs({ ...prefs, includeTransactions: e.target.checked })} /> Load transactions (18 calls per season, in the background)</label>
          <label className="row" style={{ gap: 6 }}><input type="checkbox" checked={prefs.includeDrafts} onChange={e => onPrefs({ ...prefs, includeDrafts: e.target.checked })} /> Load drafts</label>
        </div>
        <form className="row" onSubmit={addExtra} style={{ paddingTop: 8 }}>
          <span className="hint">History looks short? Sleeper only links seasons the commissioner renewed. Add an older season's league id to stitch it on:</span>
          <input type="text" value={extra} onChange={e => setExtra(e.target.value)} placeholder="older league_id" spellCheck={false} inputMode="numeric" />
          <button className="btn ghost sm" type="submit">Add</button>
          {extraIds.map(x => <span key={x} className="chip">{x} <button type="button" className="linkbtn" onClick={() => onExtraIds(extraIds.filter(y => y !== x))} aria-label={`Remove ${x}`}>×</button></span>)}
        </form>
      </details>
    </header>
  );
}
