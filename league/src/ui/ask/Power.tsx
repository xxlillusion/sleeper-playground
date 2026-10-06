/* Power features: a custom metric form with live validation, and the full spec as editable JSON. */
import { useEffect, useState } from "react";
import { measuresOf } from "../../view/catalog";
import { validateFormula } from "../../view/engine";
import type { Measure, ViewSpec } from "../../view/spec";

export interface MetricFormProps {
  dataset: string;
  initial?: Measure | null;
  onSave: (m: Measure) => void;
  onCancel: () => void;
}
export function MetricForm({ dataset, initial, onSave, onCancel }: MetricFormProps) {
  const [name, setName] = useState(initial?.label ?? "");
  const [formula, setFormula] = useState(initial?.formula ?? "");
  const err = formula.trim() ? validateFormula(formula) : null;
  const cols = measuresOf(dataset);
  const ok = !!formula.trim() && !err;
  const id = initial?.id ?? `f_${(name || "metric").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "metric"}_${Date.now().toString(36)}`;
  return (
    <div className="ask-metric" role="dialog" aria-label="Custom metric">
      <h3>{initial ? "Edit metric" : "Custom metric"}</h3>
      <label>Name<input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Points per game" autoFocus /></label>
      <label>Formula<textarea value={formula} onChange={e => setFormula(e.target.value)} rows={2} placeholder="sum(points) / count(game_id)" spellCheck={false} /></label>
      {formula.trim() && <p className={`hint ${err ? "bad" : "good"}`}>{err ? `Not valid yet: ${err}` : "Looks good."}</p>}
      <p className="hint">Combine aggregates with + − × ÷ and parentheses: <code>sum(col)</code>, <code>avg(col)</code>, <code>count(col)</code>, <code>min(col)</code>, <code>max(col)</code>, <code>median(col)</code>, <code>distinct(col)</code>. Each is worked out per row of the answer.</p>
      <div className="ask-cols">{cols.map(c => <button type="button" key={c.name} className="chip-btn muted" title={c.label} onClick={() => setFormula(f => (f.trim() ? `${f.trim()} ` : "") + `sum(${c.name})`)}>{c.name}</button>)}</div>
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button type="button" className="btn ghost sm" onClick={onCancel}>Cancel</button>
        <button type="button" className="btn sm" disabled={!ok} onClick={() => onSave({ id, agg: "avg", formula: formula.trim(), label: name.trim() || formula.trim() })}>{initial ? "Save" : "Add to the sentence"}</button>
      </div>
    </div>
  );
}

export function AdvancedJson({ spec, onApply }: { spec: ViewSpec; onApply: (s: ViewSpec) => void }) {
  const [text, setText] = useState(() => JSON.stringify(spec, null, 2));
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { setText(JSON.stringify(spec, null, 2)); setErr(null); }, [spec]);
  const apply = () => {
    try {
      const s = JSON.parse(text);
      if (!s || typeof s !== "object" || typeof s.dataset !== "string") throw new Error("A view needs a dataset");
      const next: ViewSpec = { dataset: s.dataset, rows: s.rows ?? [], columns: s.columns ?? [], measures: s.measures ?? [], filters: s.filters ?? [], sort: s.sort ?? [], chart: s.chart ?? "table", limit: s.limit, title: s.title, display: s.display };
      setErr(null); onApply(next);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  };
  return (
    <div className="ask-json">
      <p className="hint">The whole view as JSON. Edits apply when you click away, if they parse.</p>
      <textarea value={text} onChange={e => setText(e.target.value)} onBlur={apply} rows={Math.min(24, text.split("\n").length + 1)} spellCheck={false} />
      {err && <p className="hint bad">{err}</p>}
    </div>
  );
}
