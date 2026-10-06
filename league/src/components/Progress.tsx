import type { Progress as P } from "../data/load";

export function ProgressBar({ p, label }: { p: P | null; label?: string }) {
  if (!p) return null;
  const pctDone = p.total ? Math.min(100, Math.round((p.done / p.total) * 100)) : 0;
  const busy = p.phase !== "done";
  return (
    <div className="progress" role="status" aria-live="polite">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="hint">{busy && <span className="spin" />}{label ? `${label}: ` : ""}{p.message}{busy && p.total > 1 ? ` (${p.done} of ${p.total} requests)` : ""}</span>
        <span className="hint mono">{busy ? `${pctDone}%` : ""}</span>
      </div>
      {busy && <div className="track"><div className="fill" style={{ width: `${pctDone}%` }} /></div>}
    </div>
  );
}
