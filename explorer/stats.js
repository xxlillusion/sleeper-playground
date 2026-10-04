/* Stats & records tab: league-wide numbers built from every season's weekly matchups.
   Shares globals with index.html (S, api, seasonSummary, ensureChain, avatar, esc, ...). */
const ST = { scope: "all", kinds: "playoff", data: null, dataFor: null, pair: null, tx: {}, model: null };
const r2 = n => Math.round(n * 100) / 100;

async function pool(items, n, fn) {
  const res = []; let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; res[k] = await fn(items[k], k); }
  }));
  return res;
}

/* ---------- loading ---------- */
// One compact record per season, rebuilt on each load. For past seasons api() answers from its cache; the live season is always refetched.
async function loadSeason(lg, progress) {
  const complete = lg.status === "complete";
  const sum = await seasonSummary(lg);
  let last = 18;
  if (!complete) last = S.nfl && String(S.nfl.season) === String(lg.season) ? Math.min(18, Math.max(0, (S.nfl.week || 1) - 1)) : 0;
  let done = 0;
  const raw = await pool(Array.from({ length: last }, (_, i) => i + 1), 6, async w => {
    const d = await api(`/league/${lg.league_id}/matchups/${w}`).catch(() => null);
    progress(`Loading ${lg.season}: week ${++done} of ${last}`);
    return d;
  });
  const weeks = {}, feats = [], ptot = {};
  raw.forEach((ms, i) => {
    if (!ms?.length || !ms.some(m => m.points > 0)) return;
    const w = i + 1;
    weeks[w] = ms.map(m => {
      const pp = m.players_points || null, st = m.starters || [];
      const sp = m.starters_points || (pp ? st.map(p => pp[p] ?? 0) : null);
      let bench = null;
      if (pp) { bench = 0; for (const [pid, v] of Object.entries(pp)) if (!st.includes(pid)) bench += v || 0; }
      if (sp && m.matchup_id != null) st.forEach((pid, k) => {
        if (!pid || pid === "0") return;
        const v = sp[k] || 0;
        feats.push([pid, r2(v), m.roster_id, w]);
        const t = ptot[pid] ||= { pts: 0, by: {} };
        t.pts += v; t.by[m.roster_id] = (t.by[m.roster_id] || 0) + 1;
      });
      return [m.roster_id, m.matchup_id, m.points || 0, bench == null ? null : r2(bench)];
    });
  });
  feats.sort((a, b) => b[1] - a[1]);
  const topPlayers = Object.entries(ptot).sort((a, b) => b[1].pts - a[1].pts).slice(0, 5)
    .map(([pid, t]) => [pid, r2(t.pts), +Object.entries(t.by).sort((a, b) => b[1] - a[1])[0][0]]);
  const s = {
    id: lg.league_id, season: lg.season, name: lg.name, status: lg.status,
    pws: lg.settings?.playoff_week_start || 99, prt: lg.settings?.playoff_round_type || 0,
    teams: Object.fromEntries(Object.values(sum.teams).map(t => [t.rid, {
      uid: t.u?.user_id || null, name: t.name, manager: t.manager, av: t.avatar, uav: avUrl(t.u?.avatar),
      rec: [t.r.settings?.wins || 0, t.r.settings?.losses || 0, t.r.settings?.ties || 0] }])),
    weeks, feats: feats.slice(0, 15), topPlayers, wb: sum.wb || [], lb: sum.lb || [],
    champ: sum.champ ?? null, runner: sum.runner ?? null, last: sum.lastBy === "toilet" ? sum.last : null,
  };
  return s;
}

async function loadTx(s) {
  const lists = await pool(Array.from({ length: 18 }, (_, i) => i + 1), 6, w => api(`/league/${s.id}/transactions/${w}`).catch(() => []));
  const uidOf = rid => s.teams[rid]?.uid || `open:${s.id}:${rid}`;
  const out = { trades: {}, pairs: {}, moves: {}, faab: {}, bid: null };
  const inc = (o, k, n = 1) => { o[k] = (o[k] || 0) + n; };
  for (const t of lists.flat().filter(Boolean)) {
    if (t.status !== "complete") continue;
    const ids = (t.roster_ids || []).map(uidOf);
    if (t.type === "trade") {
      ids.forEach(u => inc(out.trades, u));
      for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) inc(out.pairs, [ids[i], ids[j]].sort().join("|"));
    } else if (t.type === "waiver" || t.type === "free_agent") {
      ids.forEach(u => inc(out.moves, u));
      const bid = t.settings?.waiver_bid;
      if (bid && ids[0]) { inc(out.faab, ids[0], bid); if (!out.bid || bid > out.bid[1]) out.bid = [ids[0], bid, Object.keys(t.adds || {})[0] || null, t.leg]; }
    }
  }
  return out;
}

/* ---------- model ---------- */
function rWeeks(s, r, lastRound) {
  const st = s.pws; if (!st || st > 30) return [];
  if (s.prt === 2) { const w = st + 2 * (r - 1); return [w, w + 1]; }
  const w = st + (r - 1);
  return s.prt === 1 && r === lastRound ? [w, w + 1] : [w];
}
// kinds: "regular" | "playoff" (regular + winners bracket) | "all" (plus consolation games)
function buildModel(seasons, kinds) {
  const mgr = {}, all = [], weekly = [], benches = [];
  const sorted = [...seasons].sort((a, b) => a.season - b.season);
  for (const s of sorted) {
    const uidOf = rid => s.teams[rid]?.uid || `open:${s.id}:${rid}`;
    const inPlayoffs = new Set();
    for (const m of s.wb) for (const k of ["t1", "t2"]) if (typeof m[k] === "number") inPlayoffs.add(m[k]);
    for (const [ridS, t] of Object.entries(s.teams)) {
      const rid = +ridS, uid = uidOf(rid);
      const m = mgr[uid] ||= { uid, seasons: [], titles: 0, runnerups: 0, toilets: 0, playoffs: 0,
        reg: { w: 0, l: 0, t: 0, pf: 0, pa: 0, g: 0 }, po: { w: 0, l: 0 }, exp: 0, ap: { w: 0, l: 0 }, med: { w: 0, l: 0 }, highs: 0, lows: 0 };
      Object.assign(m, { name: t.manager, av: t.uav || t.av, team: t.name, teamAv: t.av });
      m.seasons.push(s.season);
      if (s.champ === rid) m.titles++;
      if (s.runner === rid) m.runnerups++;
      if (s.last === rid) m.toilets++;
      if (s.status === "complete" && inPlayoffs.has(rid)) m.playoffs++;
    }
    const side = (rid, pts) => ({ uid: uidOf(rid), rid, pts, team: s.teams[rid]?.name || `Team ${rid}` });
    const mk = (week, kind, label, multi, r1, p1, r2_, p2) => all.push({ sid: s.id, season: s.season, week, kind, label, multi, a: side(r1, p1), b: side(r2_, p2) });
    for (const [w, rows] of Object.entries(s.weeks)) {
      const wk = +w;
      for (const r of rows) if (r[1] != null && r[3] != null) benches.push({ uid: uidOf(r[0]), team: s.teams[r[0]]?.name, season: s.season, week: wk, pts: r[3], scored: r[2] });
      if (wk >= s.pws) continue;
      const by = {};
      for (const r of rows) if (r[1] != null) (by[r[1]] ||= []).push(r);
      const played = [];
      for (const pair of Object.values(by)) {
        if (pair.length !== 2 || (!pair[0][2] && !pair[1][2])) continue;
        mk(wk, "regular", "", false, pair[0][0], pair[0][2], pair[1][0], pair[1][2]);
        played.push(pair[0], pair[1]);
      }
      if (played.length > 1) weekly.push({ sid: s.id, season: s.season, week: wk, scores: played.map(r => ({ uid: uidOf(r[0]), pts: r[2], team: s.teams[r[0]]?.name })) });
    }
    const bracket = (br, winners) => {
      if (!br.length) return;
      const maxR = Math.max(...br.map(m => m.r));
      for (const m of br) {
        if (typeof m.t1 !== "number" || typeof m.t2 !== "number") continue;
        const wks = rWeeks(s, m.r, maxR).filter(w => s.weeks[w]);
        if (!wks.length) continue;
        const pts = rid => r2(wks.reduce((a, w) => a + (s.weeks[w].find(x => x[0] === rid)?.[2] || 0), 0));
        const pa = pts(m.t1), pb = pts(m.t2);
        if (!pa && !pb) continue;
        const real = winners && (!m.p || m.p === 1 || m.p === 3);
        const label = winners ? (m.p === 1 ? "Championship" : m.p === 3 ? "3rd place game" : m.p ? `${ord(m.p)} place game` : "Playoffs") : (m.p === 1 ? "Toilet bowl" : "Consolation");
        mk(wks[0], real ? "playoff" : "consolation", label, wks.length > 1, m.t1, pa, m.t2, pb);
      }
    };
    bracket(s.wb, true); bracket(s.lb, false);
  }
  all.sort((x, y) => x.season - y.season || x.week - y.week);
  const games = all.filter(g => g.kind === "regular" || kinds === "all" || (kinds === "playoff" && g.kind === "playoff"));

  // standings (regular season and playoffs are always kept separate here)
  const msKey = (uid, season) => uid + "@" + season, ms = {};
  for (const g of all) for (const [me, op] of [[g.a, g.b], [g.b, g.a]]) {
    const m = mgr[me.uid]; if (!m) continue;
    if (g.kind === "regular") {
      const x = ms[msKey(me.uid, g.season)] ||= { uid: me.uid, season: g.season, sid: g.sid, team: me.team, w: 0, l: 0, t: 0, pf: 0, g: 0, exp: 0 };
      for (const o of [m.reg, x]) { o.g++; o.pf += me.pts; if (o.pa != null) o.pa += op.pts; me.pts > op.pts ? o.w++ : me.pts < op.pts ? o.l++ : o.t++; }
    } else if (g.kind === "playoff") me.pts > op.pts ? m.po.w++ : me.pts < op.pts && m.po.l++;
  }
  // luck: all-play and median, regular season only
  for (const wk of weekly) {
    const n = wk.scores.length, sortedPts = wk.scores.map(x => x.pts).sort((a, b) => a - b);
    const median = n % 2 ? sortedPts[(n - 1) / 2] : (sortedPts[n / 2 - 1] + sortedPts[n / 2]) / 2;
    const hi = sortedPts[n - 1], lo = sortedPts[0];
    for (const x of wk.scores) {
      const m = mgr[x.uid]; if (!m) continue;
      const beat = wk.scores.filter(y => y.pts < x.pts).length, tied = wk.scores.filter(y => y.pts === x.pts).length - 1;
      const e = (beat + tied / 2) / (n - 1);
      m.exp += e; m.ap.w += beat; m.ap.l += n - 1 - beat - tied;
      const row = ms[msKey(x.uid, wk.season)]; if (row) row.exp += e;
      x.pts > median ? m.med.w++ : x.pts < median && m.med.l++;
      if (x.pts === hi) m.highs++;
      if (x.pts === lo) m.lows++;
    }
  }
  // head-to-head
  const h2h = {};
  for (const g of games) for (const [me, op] of [[g.a, g.b], [g.b, g.a]]) {
    const c = (h2h[me.uid] ||= {})[op.uid] ||= { w: 0, l: 0, t: 0, pf: 0, pa: 0, games: [] };
    me.pts > op.pts ? c.w++ : me.pts < op.pts ? c.l++ : c.t++;
    c.pf += me.pts; c.pa += op.pts; c.games.push(g);
  }
  const pairs = [], seen = new Set();
  for (const a of Object.keys(h2h)) for (const b of Object.keys(h2h[a])) {
    const k = [a, b].sort().join("|"); if (seen.has(k) || a === b) continue; seen.add(k);
    const c = h2h[a][b], flip = c.l > c.w;
    pairs.push({ a: flip ? b : a, b: flip ? a : b, w: Math.max(c.w, c.l), l: Math.min(c.w, c.l), t: c.t, g: c.games.length,
      po: c.games.filter(g => g.kind === "playoff").length });
  }
  // streaks
  for (const m of Object.values(mgr)) {
    const best = { W: { n: 0 }, L: { n: 0 } }; let cur = null;
    for (const g of games) {
      const me = g.a.uid === m.uid ? g.a : g.b.uid === m.uid ? g.b : null; if (!me) continue;
      const op = me === g.a ? g.b : g.a, r = me.pts > op.pts ? "W" : me.pts < op.pts ? "L" : "T";
      cur = cur && cur.r === r ? { ...cur, n: cur.n + 1, end: g } : { r, n: 1, start: g, end: g };
      if (r !== "T" && cur.n > best[r].n) best[r] = cur;
    }
    m.streak = { W: best.W, L: best.L, cur };
  }
  const list = Object.values(mgr).filter(m => m.reg.g || h2h[m.uid])
    .sort((a, b) => b.seasons.length - a.seasons.length || b.reg.w - a.reg.w || a.name.localeCompare(b.name));
  return { mgr, list, all, games, h2h, pairs, weekly, benches, ms: Object.values(ms), seasons: sorted };
}

/* ---------- rendering ---------- */
const mName = u => esc(ST.model.mgr[u]?.name || "Unknown");
const bName = u => `<b>${mName(u)}</b>`;
const mWho = (m, sub) => `<div class="who">${avatar(m.av, m.name, "sm")}<div><div class="n">${esc(m.name)}</div>${sub ? `<div class="s">${sub}</div>` : ""}</div></div>`;
const rec = o => `${o.w}-${o.l}${o.t ? "-" + o.t : ""}`;
const pct = o => o.w + o.l + (o.t || 0) ? (o.w + (o.t || 0) / 2) / (o.w + o.l + (o.t || 0)) : 0;
const when = g => `${g.season}, week ${g.week}${g.kind !== "regular" ? " · " + g.label : ""}`;
const signed = n => (n > 0 ? "+" : "") + n.toFixed(1);
const sec = (title, hint, html) => `<section class="sec"><h3>${title}</h3>${hint ? `<p class="hint">${hint}</p>` : ""}${html}</section>`;

async function tabStats() {
  const body = $("#tabBody");
  body.innerHTML = tabHead("Steps 5–7", "/league/{every season}/matchups/{1…18}") + `<div id="stBody" class="stbody"></div>`;
  const el = $("#stBody");
  const progress = t => { const e = $("#stBody"); if (e && S.tab === "stats") e.innerHTML = `<p class="hint"><span class="spin"></span> ${esc(t)}</p>`; };
  progress("Finding every season of this league");
  try {
    const chain = await ensureChain();
    if (ST.dataFor !== chain) {
      ST.loading ||= (async () => {
        const out = [];
        for (const lg of chain) { progress(`Loading ${lg.season}`); out.push(await loadSeason(lg, progress)); }
        ST.data = out; ST.dataFor = chain; ST.tx = {}; ST.pair = null;
      })().finally(() => { ST.loading = null; });
      await ST.loading;
    }
    renderStats();
  } catch (e) { if ($("#stBody")) fail($("#stBody"), e); }
}

function renderStats() {
  const el = $("#stBody"); if (!el || S.tab !== "stats") return;
  const data = ST.data;
  if (ST.scope !== "all" && !data.some(s => s.id === ST.scope)) ST.scope = "all";
  const single = ST.scope !== "all";
  const scoped = single ? data.filter(s => s.id === ST.scope) : data;
  const M = ST.model = buildModel(scoped, ST.kinds);
  const span = single ? `in ${scoped[0].season}` : "in league history";
  const controls = `<div class="row stctl">
    <label class="row" for="stScope"><span class="hint">Show</span><select id="stScope"><option value="all">All-time (${data.length} season${data.length > 1 ? "s" : ""})</option>${data.map(s => `<option value="${esc(s.id)}">${esc(s.season)} · ${esc(s.name)}</option>`).join("")}</select></label>
    <label class="row" for="stKinds"><span class="hint">Count</span><select id="stKinds"><option value="regular">Regular season only</option><option value="playoff">Regular season + playoffs</option><option value="all">Everything, consolation games too</option></select></label></div>`;
  if (!M.games.length) {
    el.innerHTML = controls + `<div class="msg">No finished games ${span} yet. Stats appear after the first week is complete.</div>`;
  } else {
    el.innerHTML = controls + secGlance(M, single) + secFacts(M, single, span) + secH2H(M, single) + secStandings(M, single)
      + secRecords(M, single, span) + secRivals(M, single) + secLuck(M, single) + secStreaks(M, single)
      + sec("Player feats", "Points scored as a starter for a team in this league.", `<div id="stPlayers"><p class="hint"><span class="spin"></span> Loading player names…</p></div>`)
      + sec("Wheeling and dealing", "Trades, waiver claims and free-agent pickups. Loads on request because it takes 18 calls per season.", `<div id="stTx"><button class="btn ghost" type="button" id="stTxBtn">Load trades and waivers</button></div>`)
      + (single ? "" : secScoring(M))
      + `<p class="hint">Managers are matched by Sleeper account, so a renamed team stays one person. Sleeper only reports who owned each roster at season's end, so a team that changed hands mid-season is credited to its final manager. Luck and weekly high or low scores always use the regular season. Playoff rounds that last two weeks count as one game. Wins and losses are worked out from the final scores Sleeper reports, so a record can differ by a game from Sleeper's own standings when a score was corrected after the week closed.</p>`;
  }
  $("#stScope").value = ST.scope; $("#stKinds").value = ST.kinds;
  $("#stScope").onchange = e => { ST.scope = e.target.value; ST.pair = null; renderStats(); };
  $("#stKinds").onchange = e => { ST.kinds = e.target.value; renderStats(); };
  if (!M.games.length) return;
  el.querySelectorAll("td.cell[data-a]").forEach(td => td.onclick = () => { ST.pair = [td.dataset.a, td.dataset.b]; drawPair(single); });
  for (const id of ["stA", "stB"]) $("#" + id).onchange = () => { ST.pair = [$("#stA").value, $("#stB").value]; drawPair(single); };
  drawPair(single);
  ensurePlayers().then(() => { const p = $("#stPlayers"); if (p && ST.model === M) p.innerHTML = playersHtml(M, single); });
  const txKey = scoped.map(s => s.id).join(",");
  if (ST.tx[txKey]) $("#stTx").innerHTML = txHtml(ST.tx[txKey]);
  else $("#stTxBtn").onclick = async () => {
    const box = $("#stTx");
    try {
      const parts = [];
      for (const s of scoped) { box.innerHTML = `<p class="hint"><span class="spin"></span> Loading ${esc(s.season)} transactions</p>`; parts.push(await loadTx(s)); }
      ST.tx[txKey] = parts;
      await ensurePlayers();
      if ($("#stTx") && ST.model === M) $("#stTx").innerHTML = txHtml(parts);
    } catch (e) { fail(box, e); }
  };
}

function secGlance(M, single) {
  const pts = M.games.reduce((a, g) => a + g.a.pts + g.b.pts, 0);
  const champs = new Set(M.seasons.filter(s => s.champ != null).map(s => s.teams[s.champ]?.uid));
  return `<div class="stats">
    ${single ? "" : `<div><b>${M.seasons.length}</b><span>Seasons</span></div>`}
    <div><b>${M.games.length}</b><span>Games counted</span></div>
    <div><b>${M.list.length}</b><span>Managers</span></div>
    <div><b>${Math.round(pts).toLocaleString()}</b><span>Points scored</span></div>
    <div><b>${fmtPts(pts / (M.games.length * 2))}</b><span>Average score</span></div>
    ${single ? "" : `<div><b>${champs.size}</b><span>Different champions</span></div>`}</div>`;
}

function scoreSides(M) {
  return M.games.filter(g => !g.multi).flatMap(g => [[g.a, g.b], [g.b, g.a]].map(([me, op]) => ({ uid: me.uid, pts: me.pts, opp: op.uid, oppPts: op.pts, g, won: me.pts > op.pts, lost: me.pts < op.pts })));
}

function secFacts(M, single, span) {
  const f = [], min = single ? 2 : 3, tag = single ? "this season" : "all-time";
  const lop = M.pairs.filter(p => p.g >= min && p.w > p.l).sort((x, y) => (y.w - y.l) - (x.w - x.l) || y.g - x.g)[0];
  if (lop) f.push(["Lopsided", `${bName(lop.a)} is <b>${lop.w}-${lop.l}${lop.t ? "-" + lop.t : ""}</b> ${tag} against ${bName(lop.b)}.`]);
  const never = M.pairs.filter(p => p.l === 0 && !p.t && p.g >= min && p !== lop).sort((x, y) => y.g - x.g)[0];
  if (never) f.push(["Still waiting", `${bName(never.b)} has never beaten ${bName(never.a)} in <b>${never.g}</b> tries.`]);
  const even = M.pairs.filter(p => p.g >= 4 && p.w - p.l <= 1).sort((x, y) => y.g - x.g)[0];
  if (even) f.push(["Dead even", `${bName(even.a)} and ${bName(even.b)} have split <b>${even.g}</b> games ${even.w}-${even.l}${even.t ? "-" + even.t : ""}.`]);
  const sides = scoreSides(M);
  const hi = [...sides].sort((a, b) => b.pts - a.pts)[0];
  if (hi) f.push(["Record score", `${bName(hi.uid)} scored <b>${fmtPts(hi.pts)}</b> in ${when(hi.g)}, the most ${span}.`]);
  const heart = sides.filter(x => x.lost).sort((a, b) => b.pts - a.pts)[0];
  if (heart) f.push(["Heartbreak", `${bName(heart.uid)} scored <b>${fmtPts(heart.pts)}</b> in ${when(heart.g)} and still lost to ${bName(heart.opp)}.`]);
  const thief = sides.filter(x => x.won).sort((a, b) => a.pts - b.pts)[0];
  if (thief) f.push(["Daylight robbery", `${bName(thief.uid)} won with just <b>${fmtPts(thief.pts)}</b> in ${when(thief.g)}.`]);
  const luck = M.ms.filter(x => x.g >= 3).map(x => ({ ...x, luck: x.w + x.t / 2 - x.exp })).sort((a, b) => b.luck - a.luck);
  if (luck.length > 1) {
    const top = luck[0], bot = luck[luck.length - 1];
    if (top.luck > .5) f.push(["Horseshoe", `${bName(top.uid)} went ${rec(top)} in ${top.season} with a schedule-neutral <b>${top.exp.toFixed(1)}</b> expected wins. That's ${signed(top.luck)} wins of luck.`]);
    if (bot.luck < -.5) f.push(["Robbed", `${bName(bot.uid)} went ${rec(bot)} in ${bot.season} but deserved about <b>${bot.exp.toFixed(1)}</b> wins.`]);
  }
  const ws = M.list.map(m => m.streak.W).filter(s => s.n > 2).sort((a, b) => b.n - a.n)[0];
  if (ws) { const u = M.list.find(m => m.streak.W === ws); f.push(["Heater", `${bName(u.uid)} won <b>${ws.n} in a row</b>, from ${when(ws.start)} to ${when(ws.end)}.`]); }
  if (!single) {
    const t = [...M.list].sort((a, b) => b.titles - a.titles)[0];
    if (t?.titles > 1) f.push(["Dynasty", `${bName(t.uid)} has <b>${t.titles} titles</b>, the most in the league.`]);
    const tb = [...M.list].sort((a, b) => b.toilets - a.toilets)[0];
    if (tb?.toilets > 1) f.push(["Toilet bowl regular", `${bName(tb.uid)} has finished last <b>${tb.toilets} times</b>.`]);
    const dry = M.list.filter(m => m.seasons.length >= 3 && !m.titles).sort((a, b) => b.seasons.length - a.seasons.length)[0];
    if (dry) f.push(["Drought", `${bName(dry.uid)} has played <b>${dry.seasons.length} seasons</b> without a title.`]);
  }
  const hs = [...M.list].sort((a, b) => b.highs - a.highs)[0];
  if (hs?.highs > 1) f.push(["Weekly high scorer", `${bName(hs.uid)} has topped the league's weekly scoring <b>${hs.highs} times</b>.`]);
  return f.length ? sec("Headlines", "", `<div class="facts">${f.map(([k, t]) => `<div class="fact"><span class="lab gold">${k}</span><p>${t}</p></div>`).join("")}</div>`) : "";
}

function secH2H(M, single) {
  const ms = M.list.filter(m => M.h2h[m.uid]);
  const opts = ms.map(m => `<option value="${esc(m.uid)}">${esc(m.name)}</option>`).join("");
  const cell = (a, b) => {
    if (a.uid === b.uid) return `<td class="self"></td>`;
    const c = M.h2h[a.uid]?.[b.uid];
    if (!c) return `<td class="none">–</td>`;
    const p = pct(c), amt = Math.round(Math.abs(p - .5) * 2 * 45);
    return `<td class="cell" data-a="${esc(a.uid)}" data-b="${esc(b.uid)}" title="${esc(a.name)} vs ${esc(b.name)}" style="background:color-mix(in srgb, var(${p >= .5 ? "--good" : "--bad"}) ${amt}%, transparent)">${rec(c)}</td>`;
  };
  return sec("Head-to-head", `Read across: each row is that manager's record against the manager in the column. Click a cell for every game between the two.`,
    `<div class="tablebox"><table class="h2h"><thead><tr><th></th>${ms.map(m => `<th><div class="colhead">${avatar(m.av, m.name, "sm")}<span>${esc(m.name)}</span></div></th>`).join("")}</tr></thead>
      <tbody>${ms.map(a => `<tr><th>${mWho(a)}</th>${ms.map(b => cell(a, b)).join("")}</tr>`).join("")}</tbody></table></div>
    <div class="row"><select id="stA" aria-label="First manager">${opts}</select><span class="hint">against</span><select id="stB" aria-label="Second manager">${opts}</select></div>
    <div id="stPair"></div>`);
}
function drawPair(single) {
  const M = ST.model, box = $("#stPair"); if (!box) return;
  if (!ST.pair || !M.mgr[ST.pair[0]] || !M.mgr[ST.pair[1]]) {
    const p = [...M.pairs].sort((x, y) => y.g - x.g)[0];
    ST.pair = p ? [p.a, p.b] : null;
  }
  if (!ST.pair) { box.innerHTML = ""; return; }
  const [a, b] = ST.pair; $("#stA").value = a; $("#stB").value = b;
  const c = M.h2h[a]?.[b];
  if (a === b) { box.innerHTML = `<div class="msg">Pick two different managers.</div>`; return; }
  if (!c) { box.innerHTML = `<div class="msg">${mName(a)} and ${mName(b)} haven't played each other ${single ? "this season" : "yet"}.</div>`; return; }
  const verdict = c.w === c.l ? `${bName(a)} and ${bName(b)} are tied <b>${rec(c)}</b>` : `${bName(a)} is <b>${rec(c)}</b> ${single ? "this season" : "all-time"} against ${bName(b)}`;
  const side = (g, u) => g.a.uid === u ? g.a : g.b;
  const margin = g => side(g, a).pts - side(g, b).pts;
  const bigA = [...c.games].sort((x, y) => margin(y) - margin(x))[0], bigB = [...c.games].sort((x, y) => margin(x) - margin(y))[0];
  box.innerHTML = `<div class="pairbox">
    <p class="verdict">${verdict}.</p>
    <div class="stats">
      <div><b>${fmtPts(c.pf / c.games.length)}</b><span>${mName(a)} average</span></div>
      <div><b>${fmtPts(c.pa / c.games.length)}</b><span>${mName(b)} average</span></div>
      ${margin(bigA) > 0 ? `<div><b>+${fmtPts(margin(bigA))}</b><span>${mName(a)}'s biggest win (${bigA.season} wk ${bigA.week})</span></div>` : ""}
      ${margin(bigB) < 0 ? `<div><b>+${fmtPts(-margin(bigB))}</b><span>${mName(b)}'s biggest win (${bigB.season} wk ${bigB.week})</span></div>` : ""}
    </div>
    <div class="tablebox"><table><thead><tr><th>When</th><th>${mName(a)}</th><th class="num">Score</th><th class="num">Score</th><th>${mName(b)}</th></tr></thead>
      <tbody>${[...c.games].reverse().map(g => { const x = side(g, a), y = side(g, b); return `<tr>
        <td>${g.season} · Wk ${g.week}${g.kind !== "regular" ? ` <span class="pill amber">${esc(g.label)}</span>` : ""}</td>
        <td class="${x.pts > y.pts ? "wn" : ""}">${esc(x.team)}</td><td class="num ${x.pts > y.pts ? "wn" : ""}">${fmtPts(x.pts)}</td>
        <td class="num ${y.pts > x.pts ? "wn" : ""}">${fmtPts(y.pts)}</td><td class="${y.pts > x.pts ? "wn" : ""}">${esc(y.team)}</td></tr>`; }).join("")}</tbody></table></div></div>`;
}

function secStandings(M, single) {
  const rows = M.list.filter(m => m.reg.g).sort((a, b) => pct(b.reg) - pct(a.reg) || b.reg.pf - a.reg.pf);
  return sec(single ? "Season standings" : "All-time standings", "Regular season record, with playoff games counted separately.",
    `<div class="tablebox"><table><thead><tr><th>#</th><th>Manager</th>${single ? "" : `<th class="num">Seasons</th>`}<th class="num">W-L</th><th class="num">Win %</th><th class="num">Points for</th><th class="num">Points against</th><th class="num">Avg</th><th class="num">Playoff W-L</th>${single ? "" : `<th class="num">Playoffs</th><th class="num">Titles</th><th class="num">2nd</th><th class="num">Last</th>`}</tr></thead>
    <tbody>${rows.map((m, i) => `<tr><td>${i + 1}</td><td>${mWho(m, single ? esc(m.team) : "")}</td>${single ? "" : `<td class="num">${m.seasons.length}</td>`}
      <td class="num">${rec(m.reg)}</td><td class="num">${(pct(m.reg) * 100).toFixed(1)}</td><td class="num">${fmtPts(m.reg.pf)}</td><td class="num">${fmtPts(m.reg.pa)}</td><td class="num">${fmtPts(m.reg.pf / m.reg.g)}</td>
      <td class="num">${m.po.w || m.po.l ? rec(m.po) : "–"}</td>${single ? "" : `<td class="num">${m.playoffs || "–"}</td><td class="num">${m.titles ? `<b class="gold">${m.titles}</b>` : "–"}</td><td class="num">${m.runnerups || "–"}</td><td class="num">${m.toilets ? `<span class="redtxt">${m.toilets}</span>` : "–"}</td>`}</tr>`).join("")}</tbody></table></div>`);
}

function secRecords(M, single, span) {
  const sides = scoreSides(M), single1 = M.games.filter(g => !g.multi);
  const card = (title, rows) => rows.length ? `<div class="rec"><h4>${title}</h4><div class="big">${rows[0].big}</div><div class="rw">${rows[0].who}</div><div class="hint">${rows[0].when}</div>
    ${rows.slice(1, 3).map(r => `<div class="also"><b>${r.big}</b> ${r.who} <span>${r.when}</span></div>`).join("")}</div>` : "";
  const sRow = x => ({ big: fmtPts(x.pts), who: `${mName(x.uid)} vs ${mName(x.opp)}`, when: when(x.g) });
  const gRow = (g, val) => { const [w, l] = g.a.pts >= g.b.pts ? [g.a, g.b] : [g.b, g.a]; return { big: val, who: `${mName(w.uid)} ${fmtPts(w.pts)}, ${mName(l.uid)} ${fmtPts(l.pts)}`, when: when(g) }; };
  const margin = g => Math.abs(g.a.pts - g.b.pts);
  const top = (arr, cmp) => [...arr].sort(cmp).slice(0, 3);
  const done = new Set(M.seasons.filter(s => s.status === "complete").map(s => s.id));
  const seasonsRows = M.ms.filter(x => single || done.has(x.sid));
  const yRow = (x, big) => ({ big, who: mName(x.uid), when: `${x.season} · ${esc(x.team)}` });
  const cards = [
    card("Highest score", top(sides, (a, b) => b.pts - a.pts).map(sRow)),
    card("Lowest score", top(sides, (a, b) => a.pts - b.pts).map(sRow)),
    card("Biggest blowout", top(single1, (a, b) => margin(b) - margin(a)).map(g => gRow(g, "+" + fmtPts(margin(g))))),
    card("Closest game", top(single1, (a, b) => margin(a) - margin(b)).map(g => gRow(g, fmtPts(margin(g))))),
    card("Most points in a loss", top(sides.filter(x => x.lost), (a, b) => b.pts - a.pts).map(sRow)),
    card("Fewest points in a win", top(sides.filter(x => x.won), (a, b) => a.pts - b.pts).map(sRow)),
    card("Highest-scoring game", top(single1, (a, b) => (b.a.pts + b.b.pts) - (a.a.pts + a.b.pts)).map(g => gRow(g, fmtPts(g.a.pts + g.b.pts)))),
    card("Lowest-scoring game", top(single1, (a, b) => (a.a.pts + a.b.pts) - (b.a.pts + b.b.pts)).map(g => gRow(g, fmtPts(g.a.pts + g.b.pts)))),
    ...(single ? [] : [
      card("Best regular season", top(seasonsRows, (a, b) => pct(b) - pct(a) || b.pf - a.pf).map(x => yRow(x, rec(x)))),
      card("Worst regular season", top(seasonsRows, (a, b) => pct(a) - pct(b) || a.pf - b.pf).map(x => yRow(x, rec(x)))),
      card("Most points in a season", top(seasonsRows, (a, b) => b.pf - a.pf).map(x => yRow(x, fmtPts(x.pf)))),
      card("Fewest points in a season", top(seasonsRows, (a, b) => a.pf - b.pf).map(x => yRow(x, fmtPts(x.pf)))),
    ]),
  ].join("");
  return sec("Record book", `The top three for each record ${span}. Season records use completed regular seasons.`, `<div class="recs">${cards}</div>`);
}

function secRivals(M, single) {
  const min = single ? 1 : 2;
  const rows = M.list.filter(m => M.h2h[m.uid]).map(m => {
    const opp = Object.entries(M.h2h[m.uid]).map(([uid, c]) => ({ uid, c, p: pct(c), g: c.games.length })).filter(o => o.g >= min);
    const nem = [...opp].sort((a, b) => a.p - b.p || b.g - a.g)[0], fav = [...opp].sort((a, b) => b.p - a.p || b.g - a.g)[0];
    const most = [...opp].sort((a, b) => b.g - a.g)[0];
    const c = o => o ? `${mName(o.uid)} <span class="hint">${rec(o.c)}</span>` : "–";
    return `<tr><td>${mWho(m)}</td><td>${nem && nem.p < .5 ? c(nem) : "–"}</td><td>${fav && fav.p > .5 ? c(fav) : "–"}</td><td>${c(most)}</td></tr>`;
  }).join("");
  const po = M.pairs.filter(p => p.po > 0).sort((a, b) => b.po - a.po).slice(0, 3);
  return sec("Rivalries", `Nemesis is the opponent each manager has the worst record against; favourite opponent is the best${single ? "" : " (at least two meetings)"}.`,
    `<div class="tablebox"><table><thead><tr><th>Manager</th><th>Nemesis</th><th>Favourite opponent</th><th>Most played</th></tr></thead><tbody>${rows}</tbody></table></div>
    ${po.length ? `<p class="hint">Most playoff meetings: ${po.map(p => `${mName(p.a)} and ${mName(p.b)} (${p.po})`).join(", ")}.</p>` : ""}`);
}

function secLuck(M, single) {
  const rows = M.list.filter(m => m.reg.g).map(m => ({ m, luck: m.reg.w + m.reg.t / 2 - m.exp })).sort((a, b) => pct(b.m.ap) - pct(a.m.ap));
  const cls = n => n > .25 ? "goodtxt" : n < -.25 ? "redtxt" : "";
  return sec(single ? "Power rankings and luck" : "Luck index", `All-play is the record a manager would have if they played every team every week, so it removes the schedule. Luck is real wins minus the wins that scoring deserved. Regular season only.`,
    `<div class="tablebox"><table><thead><tr><th>#</th><th>Manager</th><th class="num">Real W-L</th><th class="num">All-play W-L</th><th class="num">All-play %</th><th class="num">Deserved wins</th><th class="num">Luck</th><th class="num">vs. weekly median</th></tr></thead>
    <tbody>${rows.map(({ m, luck }, i) => `<tr><td>${i + 1}</td><td>${mWho(m)}</td><td class="num">${rec(m.reg)}</td><td class="num">${rec(m.ap)}</td><td class="num">${(pct(m.ap) * 100).toFixed(1)}</td>
      <td class="num">${m.exp.toFixed(1)}</td><td class="num ${cls(luck)}"><b>${signed(luck)}</b></td><td class="num">${rec(m.med)}</td></tr>`).join("")}</tbody></table></div>`);
}

function secStreaks(M, single) {
  const sp = s => s.n ? `<b>${s.n}</b> <span class="hint">${s.start.season} wk ${s.start.week}${s.n > 1 ? ` to ${s.end.season === s.start.season ? "" : s.end.season + " "}wk ${s.end.week}` : ""}</span>` : "–";
  const cur = c => c ? `<span class="pill ${c.r === "W" ? "green" : c.r === "L" ? "red" : ""}">${c.r}${c.n}</span>` : "–";
  const latest = M.seasons[M.seasons.length - 1]?.season;
  const rows = M.list.filter(m => m.streak.cur).sort((a, b) => b.streak.W.n - a.streak.W.n).map(m => `<tr><td>${mWho(m)}</td><td>${sp(m.streak.W)}</td><td>${sp(m.streak.L)}</td>
    <td>${m.seasons.includes(latest) ? cur(m.streak.cur) : `<span class="hint">Left the league</span>`}</td><td class="num">${m.highs || "–"}</td><td class="num">${m.lows || "–"}</td></tr>`).join("");
  return sec("Streaks", `Longest runs of wins and losses${single ? "" : ", carried across seasons"}. Weekly highs and lows count how often each manager had the league's best or worst score in a regular-season week.`,
    `<div class="tablebox"><table><thead><tr><th>Manager</th><th>Longest win streak</th><th>Longest losing streak</th><th>Current</th><th class="num">Weekly highs</th><th class="num">Weekly lows</th></tr></thead><tbody>${rows}</tbody></table></div>`);
}

function playersHtml(M, single) {
  const pl = id => { const [n, pos, tm] = P(id); return `<span class="pos ${esc(pos)}">${esc(pos || "?")}</span> ${esc(n)}`; };
  const feats = M.seasons.flatMap(s => s.feats.map(([pid, pts, rid, w]) => ({ pid, pts, w, season: s.season, team: s.teams[rid] }))).sort((a, b) => b.pts - a.pts).slice(0, 10);
  const mvps = [...M.seasons].reverse().filter(s => s.topPlayers.length);
  const bench = [...M.benches].sort((a, b) => b.pts - a.pts).slice(0, 5);
  if (!feats.length && !bench.length) return `<div class="msg">Sleeper didn't record per-player points for these seasons.</div>`;
  return `<div class="pgrid">
    <div><h4>Best single games</h4><div class="tablebox"><table><tbody>${feats.map((f, i) => `<tr><td>${i + 1}</td><td>${pl(f.pid)}<div class="hint">${esc(f.team?.manager || "")} · ${f.season} wk ${f.w}</div></td><td class="num"><b>${fmtPts(f.pts)}</b></td></tr>`).join("")}</tbody></table></div></div>
    <div><h4>${single ? "Top scorers this season" : "Top scorer each season"}</h4><div class="tablebox"><table><tbody>${(single ? mvps.flatMap(s => s.topPlayers.map(p => [s, p])) : mvps.map(s => [s, s.topPlayers[0]])).map(([s, [pid, pts, rid]]) => `<tr><td>${single ? "" : s.season}</td><td>${pl(pid)}<div class="hint">mostly for ${esc(s.teams[rid]?.manager || "?")}</div></td><td class="num"><b>${fmtPts(pts)}</b></td></tr>`).join("")}</tbody></table></div></div>
    <div><h4>Most points left on the bench</h4><div class="tablebox"><table><tbody>${bench.map((b, i) => `<tr><td>${i + 1}</td><td>${mName(b.uid)}<div class="hint">${b.season} wk ${b.week} · scored ${fmtPts(b.scored)} with starters</div></td><td class="num"><b>${fmtPts(b.pts)}</b></td></tr>`).join("") || `<tr><td class="hint">Not recorded</td></tr>`}</tbody></table></div></div>
  </div>`;
}

function txHtml(parts) {
  const M = ST.model, tot = { trades: {}, pairs: {}, moves: {}, faab: {} }; let bid = null;
  for (const p of parts) {
    for (const k of Object.keys(tot)) for (const [u, n] of Object.entries(p[k] || {})) tot[k][u] = (tot[k][u] || 0) + n;
    if (p.bid && (!bid || p.bid[1] > bid[1])) bid = p.bid;
  }
  const rows = M.list.map(m => ({ m, tr: tot.trades[m.uid] || 0, mv: tot.moves[m.uid] || 0, fa: tot.faab[m.uid] || 0 })).filter(r => r.tr || r.mv).sort((a, b) => b.tr - a.tr || b.mv - a.mv);
  if (!rows.length) return `<div class="msg">No completed trades or pickups found.</div>`;
  const partners = Object.entries(tot.pairs).sort((a, b) => b[1] - a[1]).slice(0, 5).filter(([k]) => k.split("|").every(u => M.mgr[u]));
  const maxT = Math.max(1, ...rows.map(r => r.tr)), maxM = Math.max(1, ...rows.map(r => r.mv));
  return `<div class="tablebox"><table><thead><tr><th>Manager</th><th class="num">Trades</th><th style="width:16%"></th><th class="num">Waiver and free-agent moves</th><th style="width:16%"></th><th class="num">FAAB spent</th></tr></thead>
    <tbody>${rows.map(r => `<tr><td>${mWho(r.m)}</td><td class="num">${r.tr}</td><td><div class="bar" style="width:${r.tr / maxT * 100}%"></div></td><td class="num">${r.mv}</td><td><div class="bar" style="width:${r.mv / maxM * 100}%"></div></td><td class="num">${r.fa ? "$" + r.fa : "–"}</td></tr>`).join("")}</tbody></table></div>
    ${partners.length ? `<p class="hint">Favourite trade partners: ${partners.map(([k, n]) => { const [a, b] = k.split("|"); return `${mName(a)} and ${mName(b)} (${n})`; }).join(", ")}.</p>` : ""}
    ${bid && M.mgr[bid[0]] ? `<p class="hint">Biggest waiver bid: ${mName(bid[0])} spent $${bid[1]}${bid[2] ? " on " + esc(P(bid[2])[0]) : ""}.</p>` : ""}`;
}

function secScoring(M) {
  const rows = [...M.seasons].reverse().map(s => {
    const wk = M.weekly.filter(w => w.sid === s.id), pts = wk.flatMap(w => w.scores.map(x => x.pts));
    return pts.length ? { s, avg: pts.reduce((a, b) => a + b, 0) / pts.length, hi: Math.max(...pts) } : null;
  }).filter(Boolean);
  if (rows.length < 2) return "";
  const max = Math.max(...rows.map(r => r.avg));
  return sec("Scoring by season", "Average team score per regular-season week, with each year's champion.",
    `<div class="sbars">${rows.map(r => { const c = r.s.champ != null ? r.s.teams[r.s.champ] : null; return `<div class="sbar"><span class="yr">${esc(r.s.season)}</span>
      <div class="track"><div class="fill" style="width:${(r.avg / max * 100).toFixed(1)}%"></div></div><b>${fmtPts(r.avg)}</b>
      <span class="hint">${c ? "Champion: " + esc(c.manager) : esc(r.s.status === "complete" ? "No champion recorded" : "In progress")}</span></div>`; }).join("")}</div>`);
}
