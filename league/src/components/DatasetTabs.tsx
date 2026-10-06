import type { TableDef } from "../data/catalog";

interface Props {
  tables: TableDef[];
  selected: string;
  counts: Record<string, number>;
  pending: Record<string, string | null>;   // dataset id -> reason it is not complete yet
  onSelect: (id: string) => void;
}

export function DatasetTabs({ tables, selected, counts, pending, onSelect }: Props) {
  return (
    <div className="tabs" role="tablist" aria-label="Datasets">
      {tables.map(t => (
        <button key={t.id} className="tab" role="tab" aria-selected={selected === t.id} onClick={() => onSelect(t.id)} title={t.description}>
          {t.label}
          {pending[t.id] ? <span className="pill amber" title={pending[t.id]!}>{pending[t.id]}</span> : <span className="n">{(counts[t.id] ?? 0).toLocaleString()}</span>}
        </button>
      ))}
    </div>
  );
}
