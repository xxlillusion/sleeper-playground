/* Page building blocks: Section (with "Pivot this"), KpiTile, Leaderboard, PercentileBars, RecordCard, MiniTable, Avatar. */
import { useMemo, useState } from "react";
import type { Row } from "../../perspective/engine";
import { columnLabel } from "../../view/catalog";
import { pivot } from "../../view/engine";
import type { ViewSpec } from "../../view/spec";
import { DataGrid } from "../shared/DataGrid";
import { formatValue } from "../shared/format";
import { fmt, measureLabel, num, percentileOf, signed, useSite, withGlobal } from "./lib";

export function Avatar({ name, size }: { name: string; size?: "lg" }) {
  const { avatars } = useSite();
  const url = avatars[name];
  const cls = `avatar ${size ?? ""}`;
  return url ? <img className={cls} src={url} alt="" loading="lazy" /> : <span className={cls} aria-hidden>{name.slice(0, 2).toUpperCase()}</span>;
}

export function RankBadge({ n }: { n: number }) { return <span className={`rank ${n <= 3 ? `r${n}` : ""}`}>{n}</span>; }

export function Section({ title, hint, spec, children, actions }: { title: string; hint?: string; spec?: ViewSpec; children: React.ReactNode; actions?: React.ReactNode }) {
  const { openPivot, g } = useSite();
  return (
    <section className="sec">
      <div className="sec-head">
        <div><h2>{title}</h2>{hint && <span className="hint">{hint}</span>}</div>
        <span className="row" style={{ gap: 6 }}>{actions}{spec && <button className="pivot-btn" type="button" onClick={() => openPivot({ ...withGlobal(spec, g), title })} title="Open this table in the pivot editor">⊞ Pivot this</button>}</span>
      </div>
      {children}
    </section>
  );
}

export function KpiTile({ label, value, unit, digits = 0, delta, deltaLabel, foot }: { label: string; value: number | string | null | undefined; unit?: string; digits?: number; delta?: number | null; deltaLabel?: string; foot?: string }) {
  const cls = delta == null || Math.abs(delta) < 1e-9 ? "" : delta > 0 ? "up" : "down";
  return (
    <div className="tile kpi">
      <div className="label">{label}</div>
      <div className="value">{typeof value === "number" ? fmt(value, digits) : value ?? "—"}{unit && <small>{unit}</small>}</div>
      {(delta != null || foot) && <div className="foot">{delta != null && <span className={`delta ${cls}`}>{signed(delta, digits)}</span>}{delta != null && deltaLabel}{foot}</div>}
    </div>
  );
}

export interface LeaderboardProps {
  spec: ViewSpec;
  /** Dimension shown as the name; defaults to the first row dimension */
  nameCol?: string;
  /** Measure id shown as the value; defaults to the first measure */
  valueKey?: string;
  top?: number;
  digits?: number;
  /** Secondary text under the name, from another measure id or dimension */
  subKey?: string;
  subLabel?: string;
  /** Hide rows whose value is null or zero */
  dropZero?: boolean;
}
/** Ranked rows with avatar, inline bar and value. Clicking a manager or season row adds a global chip. */
export function Leaderboard({ spec, nameCol, valueKey, top = 10, digits, subKey, subLabel, dropZero }: LeaderboardProps) {
  const { rowsById, g, gk, chip } = useSite();
  const [all, setAll] = useState(false);
  const full = useMemo(() => withGlobal({ ...spec, limit: undefined }, g), [spec, gk]); // eslint-disable-line react-hooks/exhaustive-deps
  const res = useMemo(() => pivot(rowsById[spec.dataset] ?? [], full), [rowsById, full]);
  const name = nameCol ?? spec.rows[0];
  const key = valueKey ?? res.measures[0]?.id;
  const measure = res.measures.find(x => x.id === key);
  const rows = useMemo(() => (dropZero ? res.flat.filter(r => num(r[key])) : res.flat), [res, key, dropZero]);
  const shown = all ? rows : rows.slice(0, top);
  const max = rows.reduce((a, r) => Math.max(a, Math.abs(num(r[key]) ?? 0)), 0);
  const isManager = name === "manager" || name === "display_name";
  const isSeason = name === "season";
  const format = (v: unknown) => (digits != null && typeof v === "number" ? fmt(v, digits) : formatValue(measure?.col ?? key, v));
  const subOf = (r: Row) => { if (!subKey) return null; const v = r[subKey]; const mm = res.measures.find(x => x.id === subKey); return `${subLabel ?? (mm ? measureLabel(spec.dataset, mm) : columnLabel(spec.dataset, subKey))}: ${mm ? formatValue(mm.col ?? subKey, v) : formatValue(subKey, v)}`; };
  if (!rows.length) return <div className="tile empty">No rows for these filters.</div>;
  return (
    <div className="tile flat">
      <div className="lb">
        {shown.map((r, i) => {
          const v = num(r[key]) ?? 0;
          const label = String(r[name] ?? "—");
          const me = isManager && g.manager === label;
          return (
            <button key={i} type="button" className={`lb-row ${me ? "me" : ""}`} title={isManager ? `Filter to ${label}` : isSeason ? `Filter to ${label}` : undefined}
              onClick={() => { if (isManager) chip({ manager: me ? undefined : label }); else if (isSeason) chip({ season: g.season === r[name] ? undefined : Number(r[name]) }); }}>
              <RankBadge n={i + 1} />
              {isManager ? <Avatar name={label} /> : <span className="avatar" aria-hidden>{isSeason ? "’" + label.slice(-2) : label.slice(0, 2).toUpperCase()}</span>}
              <span className="name">{label}{subKey && <small>{subOf(r)}</small>}</span>
              <span className="bar"><i className={v < 0 ? "neg" : ""} style={{ width: `${max ? (Math.abs(v) / max) * 100 : 0}%` }} /></span>
              <span className="val">{format(r[key])}</span>
            </button>
          );
        })}
      </div>
      {rows.length > top && <button className="btn ghost sm lb-more" type="button" onClick={() => setAll(a => !a)}>{all ? "Show top " + top : `Show all ${rows.length}`}</button>}
    </div>
  );
}

export interface PctMetric { col: string; label: string; digits?: number; higherBetter?: boolean; unit?: string }
/** Baseball-Savant style sliders: where each manager sits among all managers on several metrics. */
export function PercentileBars({ metrics, minSeasons = 1 }: { metrics: PctMetric[]; minSeasons?: number }) {
  const { rowsById, g, chip } = useSite();
  const managers = useMemo(() => (rowsById.managers ?? []).filter(r => (num(r.seasons_played) ?? 0) >= minSeasons), [rowsById, minSeasons]);
  const pools = useMemo(() => Object.fromEntries(metrics.map(mt => [mt.col, managers.map(r => num(r[mt.col])).filter((x): x is number => x != null)])), [managers, metrics]);
  const shown = useMemo(() => {
    const list = g.manager ? managers.filter(r => r.display_name === g.manager) : managers;
    return [...list].sort((a, b) => (num(b.reg_win_pct) ?? 0) - (num(a.reg_win_pct) ?? 0));
  }, [managers, g.manager]);
  if (!shown.length) return <div className="tile empty">No managers match.</div>;
  return (
    <div className="pct-grid">
      {shown.map(r => {
        const name = String(r.display_name);
        return (
          <div className="tile pct-card" key={name}>
            <header onClick={() => chip({ manager: g.manager === name ? undefined : name })} title={`Filter to ${name}`}>
              <Avatar name={name} size="lg" />
              <div><b>{name}</b><small>{r.seasons_played} season{r.seasons_played === 1 ? "" : "s"} · {String(r.reg_record)} · {r.titles ? `${r.titles} title${r.titles === 1 ? "" : "s"}` : "no titles"}</small></div>
            </header>
            {metrics.map(mt => {
              const v = num(r[mt.col]);
              let p = v == null ? null : percentileOf(pools[mt.col], v);
              if (p != null && mt.higherBetter === false) p = 100 - p;
              const color = p == null ? "var(--muted)" : `color-mix(in srgb, var(--good) ${p}%, var(--bad))`;
              return (
                <div className="pct-row" key={mt.col}>
                  <span>{mt.label}</span>
                  <span className="pct-track" title={p == null ? "No data" : `${p}th percentile`}><i style={{ left: `${p ?? 0}%`, background: color, opacity: p == null ? .3 : 1 }}>{p ?? ""}</i></span>
                  <span className="v">{v == null ? "—" : fmt(v, mt.digits ?? 0)}{mt.unit ?? ""}</span>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

export interface RecordCardProps { title: string; value: string; who?: string | null; when?: string | null; sub?: string; rows: Row[]; columns?: string[]; drillTitle?: string }
export function RecordCard({ title, value, who, when, sub, rows, columns, drillTitle }: RecordCardProps) {
  const { openDrill } = useSite();
  return (
    <div className="tile rec">
      <div className="title">{title}</div>
      <div className="value">{value}</div>
      {who && <div className="who"><Avatar name={who} /><span>{who}</span></div>}
      {(when || sub) && <div className="when">{[when, sub].filter(Boolean).join(" · ")}</div>}
      {rows.length > 0 && <button className="btn ghost sm see" type="button" onClick={() => openDrill({ title: drillTitle ?? `${title}: ${value}`, rows, columns })}>See it →</button>}
    </div>
  );
}

/** A short DataGrid sized to its rows (for "worst benchings", standings and similar lists). */
export function MiniTable({ rows, columns, dataset, bars, heat, max = 12, onRowClick }: { rows: Row[]; columns: string[]; dataset: string; bars?: string[]; heat?: string[]; max?: number; onRowClick?: (r: Row) => void }) {
  const labels = useMemo(() => Object.fromEntries(columns.map(c => [c, columnLabel(dataset, c)])), [columns, dataset]);
  if (!rows.length) return <div className="tile empty">No rows for these filters.</div>;
  return <div className="mini-table"><DataGrid rows={rows} columns={columns} labels={labels} bars={bars} heat={heat} height={Math.min(rows.length, max) * 34 + 38} onRowClick={onRowClick} pinFirst /></div>;
}

export function Pending({ dataset, children }: { dataset: string; children: React.ReactNode }) {
  const { pending } = useSite();
  const why = pending[dataset];
  if (!why) return <>{children}</>;
  return <div className="tile empty">{why === "off" ? "This data is switched off in the loader settings." : why === "loading" ? "Still loading transactions…" : `Waiting for ${why}.`}</div>;
}
