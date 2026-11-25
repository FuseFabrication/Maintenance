/* Mike Lamarca 25Nov2026 mike@acramal.com
   Fuse Fabrication – Maintenance Log
   Plain JavaScript, no build step. Talks to Supabase (see config.js). */
(function () {
'use strict';

const CFG = window.FUSE_CONFIG || {};
const TZ = CFG.timeZone || 'America/New_York';
const IDLE_MS = (CFG.idleMinutes || 10) * 60000;
const sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey);
const app = document.getElementById('app');

// ------------------------------------------------------------------ helpers
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const FREQ = { daily: 'Daily', semiweekly: 'Twice weekly', weekly: 'Weekly', biweekly: 'Every 2 weeks', monthly: 'Monthly', quarterly: 'Quarterly', semiannual: 'Semi-annual', annual: 'Annual', triennial: 'Every 3 years' };
const FREQ_ORDER = ['daily', 'semiweekly', 'weekly', 'biweekly', 'monthly', 'quarterly', 'semiannual', 'annual', 'triennial'];
const STATUS = { running: 'Running', limited: 'Limited', down: 'Down', retired: 'Inactive' };
const STATUS_CHIP = { running: 'c-ok', limited: 'c-warn', down: 'c-bad', retired: 'c-grey' };
const SKIP_REASONS = { machine_down: 'Machine is down', not_in_use: "Machine isn't being used", no_time: 'No time / short staffed', missing_parts: 'Missing parts or tools', other: 'Other' };
const KIND = { missed: 'Missed', skipped: 'Skipped', failed: 'Failed item' };
const KIND_CHIP = { missed: 'c-bad', skipped: 'c-warn', failed: 'c-info' };
const REVIEW = { needs_review: 'Needs review', reviewed: 'Reviewed', auto_closed: 'Auto-closed' };
const REVIEW_CHIP = { needs_review: 'c-acc', reviewed: 'c-grey', auto_closed: 'c-grey' };
const ACTIONS = { acknowledged: 'Acknowledged', made_up: 'Made up / done later', corrective_action: 'Corrective action taken' };
const LOG_KIND = { repair: 'Repair', pm: 'Preventive maintenance', inspection: 'Inspection', calibration: 'Calibration', other: 'Other work' };
const PROBLEM_CATS = ['Leak (oil, coolant, air)', 'Electrical / controls', 'Safety device not working', 'Noise or vibration', 'Quality – parts out of spec', 'Other'];
const ICON = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"/></svg>';

const chip = (text, cls) => `<span class="chip ${cls}">${esc(text)}</span>`;
const CLIP = '<svg class="clip" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m21.4 11.1-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5"/></svg>';
const clipIcon = (a) => (a.hasManual ? `<span class="clipwrap" title="Manual uploaded">${CLIP}<span class="sr">Manual uploaded</span></span>` : '');
const statusChip = (s) => chip(STATUS[s] || s, STATUS_CHIP[s] || 'c-grey');

function shopToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
function fmtDate(d) { // 'YYYY-MM-DD' -> 'Nov 20, 2026'
  if (!d) return '';
  const [y, m, dd] = String(d).slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, dd)).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' });
}
function fmtShort(d) {
  if (!d) return '';
  const [y, m, dd] = String(d).slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, dd)).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' });
}
function fmtTime(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleString('en-US', { timeZone: TZ, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
function fmtClock(ts) {
  return ts ? new Date(ts).toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }) : '';
}
function initials(name) { return String(name).trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase(); }

async function q(builder) {
  const { data, error } = await builder;
  if (error) throw error;
  return data;
}

function toast(msg, bad) {
  const t = document.createElement('div');
  t.className = 'toast' + (bad ? ' bad' : '');
  t.setAttribute('role', 'status');
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), bad ? 6000 : 3000);
}
function errMsg(e) { return (e && (e.message || e.error_description)) || String(e); }

function csvDownload(filename, rows) {
  const text = rows.map((r) => r.map((v) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }).join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function qrSvg(text, cell) {
  if (!window.qrcode) return '<div class="muted small">[QR code unavailable]</div>';
  const qr = window.qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: cell || 4, margin: 2, scalable: true });
}
function machineLink(id) { return location.origin + location.pathname + '#/m/' + encodeURIComponent(id); }

// Form helper: returns {name: value}
function formData(form) {
  const o = {};
  new FormData(form).forEach((v, k) => { o[k] = typeof v === 'string' ? v.trim() : v; });
  return o;
}
// Prevent double submits
async function busy(btn, fn) {
  if (btn.disabled) return;
  const label = btn.textContent;
  btn.disabled = true; btn.textContent = 'Saving…';
  try { await fn(); } catch (e) { toast(errMsg(e), true); } finally { btn.disabled = false; btn.textContent = label; }
}

// ------------------------------------------------------------------ session / roles
let session = null;
let profile = null; // {user_id, role, display_name, login_id}
let person = null;  // the people row whose employee number matches this login
const isSup = () => profile && (profile.role === 'supervisor' || profile.role === 'admin');
const isAdmin = () => profile && profile.role === 'admin';

async function loadProfile() {
  profile = null;
  if (!session) return;
  const uid = session.user.id;
  const loginId = String(session.user.email || '').split('@')[0];
  let rows = await q(sb.from('profiles').select('*').eq('user_id', uid));
  if (!rows.length) {
    await q(sb.from('profiles').insert({ user_id: uid, role: 'tablet', display_name: '', login_id: loginId }));
    rows = await q(sb.from('profiles').select('*').eq('user_id', uid));
  }
  profile = rows[0];
  // The employee number is the login id. The admin People tab holds the name that goes with it.
  person = null;
  try {
    const ps = await q(sb.from('people').select('id,name,active,employee_number').ilike('employee_number', loginId));
    person = ps[0] || null;
  } catch (e) { person = null; }
}
// Inactive employees keep their history but can no longer sign in.
async function blockIfInactive() {
  if (person && person.active === false) {
    await sb.auth.signOut();
    session = null; profile = null; person = null;
    renderLogin('This employee number is inactive. See a supervisor.');
    return true;
  }
  return false;
}

// ------------------------------------------------------------------ who is working (the person who signed in)
const DKEY = 'fuse.tabletDept', PKEY = 'fuse.pendingRoute';
let lastActivity = Date.now();
// Everything logged is recorded under the signed-in person's display name (set by an admin on Admin > Logins).
function getWorker() {
  if (!profile || !session) return null;
  const name = (person && person.name) || (profile.display_name || '').trim() || String(session.user.email || '').split('@')[0];
  return name ? { name } : null;
}
function query() { return new URLSearchParams((location.hash.split('?')[1]) || ''); }
function isFloorRoute(p) { p = p || currentPath(); return p.startsWith('/floor') || p.startsWith('/m/'); }
// Tablet logins can only use the tablet screens (checks, machine list, shop map).
const tabletAllowed = (p) => isFloorRoute(p) || p === '/map';

function touch() { lastActivity = Date.now(); }
['pointerdown', 'keydown', 'touchstart'].forEach((ev) => window.addEventListener(ev, touch, { passive: true }));
// Tablet logins sign themselves out after a period with no use, so the next person signs in as themselves.
setInterval(async () => {
  if (session && profile && profile.role === 'tablet' && Date.now() - lastActivity > IDLE_MS) {
    await sb.auth.signOut();
    session = null; profile = null; location.hash = '#/'; render();
    toast('Signed out for inactivity.');
  }
}, 20000);
const tabletDept = () => localStorage.getItem(DKEY) || '';

// ------------------------------------------------------------------ data
let core = null; // { depts, assets, assetById, shared, status }
async function loadCore() {
  const [depts, assets, shared, status, mans, links] = await Promise.all([
    q(sb.from('departments').select('*').order('sort')),
    q(sb.from('assets').select('*').order('id')),
    q(sb.from('asset_departments').select('*')),
    q(sb.from('v_checklist_status').select('*')),
    q(sb.from('asset_manuals').select('id,asset_id,storage_path')),
    q(sb.from('asset_manual_links').select('asset_id,manual_id')),
  ]);
  const assetById = {};
  assets.forEach((a) => { assetById[a.id] = a; a.shared = []; a.checks = []; a.hasManual = false; });
  // Paperclip: a machine has a manual when an uploaded PDF is its own or is shared to it.
  const uploaded = new Set(mans.filter((m) => m.storage_path).map((m) => m.id));
  mans.forEach((m) => { if (uploaded.has(m.id) && assetById[m.asset_id]) assetById[m.asset_id].hasManual = true; });
  links.forEach((l) => { if (uploaded.has(l.manual_id) && assetById[l.asset_id]) assetById[l.asset_id].hasManual = true; });
  shared.forEach((s) => { if (assetById[s.asset_id]) assetById[s.asset_id].shared.push(s.department); });
  status.forEach((s) => { if (assetById[s.asset_id]) assetById[s.asset_id].checks.push(s); });
  assets.forEach((a) => a.checks.sort((x, y) => FREQ_ORDER.indexOf(x.frequency) - FREQ_ORDER.indexOf(y.frequency)));
  core = { depts: depts.map((d) => d.name), assets, assetById, status };
  return core;
}
const activeAssets = () => core.assets.filter((a) => a.status !== 'retired');
const deptAssets = (dept) => activeAssets().filter((a) => a.department === dept || a.shared.includes(dept))
  .sort((x, y) => (x.department === dept ? 0 : 1) - (y.department === dept ? 0 : 1) || (x.id < y.id ? -1 : 1));
function dailyState(a) {
  const d = a.checks.find((c) => c.frequency === 'daily');
  if (!d) return { text: 'No daily checklist', cls: '', st: 'none' };
  if (d.state === 'done') return { text: `Done${d.done_result === 'fail' ? ' – item failed' : ''} · ${d.done_by}, ${fmtClock(d.done_at)}`, cls: d.done_result === 'fail' ? 't-bad' : 't-ok', st: 'done' };
  if (d.state === 'skipped') return { text: `Skipped · ${d.skipped_by}`, cls: 'muted', st: 'skipped' };
  if (d.state === 'not_due') return { text: 'Not due today', cls: 'muted', st: 'not_due' };
  return { text: 'Daily check due', cls: 't-warn', st: 'due' };
}
function checkStateChip(c) {
  if (c.state === 'done') return chip(c.done_result === 'fail' ? 'Done – item failed' : 'Done', c.done_result === 'fail' ? 'c-info' : 'c-ok');
  if (c.state === 'skipped') return chip('Skipped', 'c-warn');
  if (c.state === 'not_due') return chip('Not due today', 'c-grey');
  return chip('Due by ' + fmtShort(c.due_by), 'c-acc');
}

// ------------------------------------------------------------------ router
const routes = [];
function route(pattern, fn, opts) { routes.push({ re: new RegExp('^' + pattern + '$'), fn, opts: opts || {} }); }
function currentPath() { return (location.hash || '#/').slice(1).split('?')[0] || '/'; }
function query() { return new URLSearchParams((location.hash.split('?')[1]) || ''); }
function isFloorRoute(p) { p = p || currentPath(); return p.startsWith('/floor') || p.startsWith('/m/'); }

async function render() {
  if (!session) return renderLogin();
  if (!profile) {
    try { await loadProfile(); } catch (e) { app.innerHTML = `<div class="main"><div class="err">${esc(errMsg(e))}</div></div>`; return; }
  }
  if (await blockIfInactive()) return;
  let path = currentPath();
  if (path === '/') { location.replace('#' + (profile.role === 'tablet' ? '/floor' : '/dash')); return; }
  if (profile.role === 'tablet' && !tabletAllowed(path)) { location.replace('#/floor'); return; }
  for (const r of routes) {
    const m = path.match(r.re);
    if (!m) continue;
    if (r.opts.sup && !isSup()) { app.innerHTML = officeShell('', '<div class="err">Only supervisors can open this page.</div>'); return; }
    window.scrollTo(0, 0);
    try { await r.fn(...m.slice(1).map((x) => (x == null ? x : decodeURIComponent(x)))); }
    catch (e) { console.error(e); app.innerHTML = (isFloorRoute(path) ? floorShell('', '') : officeShell('', '')).replace('<!--BODY-->', `<div class="err">Something went wrong: ${esc(errMsg(e))}</div><a class="btn" href="#/">Start over</a>`); }
    return;
  }
  location.replace('#/');
}
window.addEventListener('hashchange', render);

// ------------------------------------------------------------------ shells
function officeShell(active, body, badge) {
  const nav = [
    ['/dash', 'Dashboard'], ['/machines', 'Machines'], ['/departments', 'Departments'],
    ['/exceptions', 'Exceptions'], ['/map', 'Shop floor map'], ['/floor', 'Tablet check-in'],
  ];
  if (isSup()) nav.push(['/reports', 'Reports']);
  if (isSup()) nav.push(['/manual-pages', 'Manual pages']);
  if (isSup()) nav.push(['/outside', 'Outside inspections']);
  if (isSup()) nav.push(['/admin', 'Admin']);
  return `<div class="office">
  <nav class="side" aria-label="Main">
    <div class="brand"><a href="#/dash" class="homelogo" aria-label="Fuse Fabrication &amp; Machine – home"><img src="logo-fuse.png" alt="Fuse Fabrication &amp; Machine"></a><span>Asset Maintenance</span></div>
    ${nav.map(([h, t]) => `<a href="#${h}" class="${active === h ? 'on' : ''}">${t}${h === '/exceptions' && badge ? `<span class="chip c-warn">${badge}</span>` : ''}</a>`).join('')}
    <div class="foot"><span>${esc(session.user.email)} · ${esc(profile.role)}</span><button type="button" data-signout>Sign out</button></div>
  </nav>
  <main class="main">${body || '<!--BODY-->'}</main></div>`;
}
function floorShell(back, body) {
  const w = getWorker();
  return `<div class="floor">
  <header class="fhead">
    <div class="row" style="gap:14px">
      <a href="#/floor" class="homelogo" aria-label="Fuse Fabrication &amp; Machine – home"><img src="logo-fuse.png" alt="Fuse Fabrication &amp; Machine"></a>
      <div class="tiny" style="color:#D6D3D1">${esc(tabletDept() ? tabletDept() + ' tablet' : 'Shop floor')}</div>
    </div>
    <div class="row" style="gap:16px">
      ${w ? `<span class="who">Signed in as <b>${esc(w.name)}</b></span>` : ''}
      ${currentPath() !== '/map' ? '<a href="#/map">Shop map</a>' : '<a href="#/floor/pick">Machine list</a>'}
      ${isSup() || profile.role !== 'tablet' ? '<a href="#/dash">Office view</a>' : ''}
      <button type="button" class="link" data-signout>Sign out</button>
    </div>
  </header>
  <main class="fmain">${back ? `<a href="${back}" style="font-weight:600;text-decoration:none">← Back</a>` : ''}${body || '<!--BODY-->'}</main></div>`;
}
document.addEventListener('click', async (e) => {
  if (e.target.closest('[data-signout]')) {
    await sb.auth.signOut();
    session = null; profile = null; location.hash = '#/'; render();
  }
});
async function exceptionBadge() {
  try {
    const { count } = await sb.from('v_exceptions').select('exception_key', { count: 'exact', head: true }).eq('review_status', 'needs_review');
    return count || '';
  } catch (e) { return ''; }
}

// ------------------------------------------------------------------ login
function renderLogin(notice) {
  app.innerHTML = `<div class="floor"><header class="fhead"><div class="row"><div class="logo">${ICON}</div>
    <div style="font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:17px">Fuse Fabrication · Asset Maintenance</div></div></header>
  <main class="fmain" style="max-width:440px"><h1>Sign in</h1>
  <form id="login" class="card stack">
    ${notice ? `<div class="err" role="alert">${esc(notice)}</div>` : ''}
    <label>Employee number<input name="email" type="text" inputmode="text" autocomplete="username" autocapitalize="off" required></label>
    <label>Password<input name="password" type="password" autocomplete="current-password" required></label>
    <button class="btn primary" type="submit">Sign in</button>
    <p class="muted small" style="margin:0">Sign in with your employee number. Your name is recorded on everything you log.</p>
  </form></main></div>`;
  $('#login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = formData(e.target);
    const btn = $('button[type=submit]', e.target);
    await busy(btn, async () => {
      const { data, error } = await sb.auth.signInWithPassword({ email: String(f.email).trim().includes('@') ? String(f.email).trim() : String(f.email).trim().toLowerCase() + '@' + (window.FUSE_CONFIG.loginDomain || 'fuse.example.com'), password: f.password });
      if (error) throw error;
      session = data.session; profile = null;
      await render();
    });
  });
}

// ================================================================== OFFICE PAGES
route('/dash', async () => {
  app.innerHTML = officeShell('/dash', '<div class="loading">Loading…</div>');
  await loadCore();
  const [exc, insp, skips, probs, logs, outPlans] = await Promise.all([
    q(sb.from('v_exceptions').select('*').eq('review_status', 'needs_review').order('occurred_at', { ascending: false })),
    q(sb.from('inspections').select('id,asset_id,performed_by,performed_at,result,frequency').order('performed_at', { ascending: false }).limit(10)),
    q(sb.from('skips').select('id,asset_id,reported_by,created_at,reason,frequency').order('created_at', { ascending: false }).limit(6)),
    q(sb.from('problems').select('id,asset_id,reported_by,created_at,new_status,description').order('created_at', { ascending: false }).limit(6)),
    q(sb.from('maintenance_logs').select('id,asset_id,done_by,created_at,kind,title').order('created_at', { ascending: false }).limit(6)),
    q(sb.from('outside_service_plans').select('id,asset_id,service,next_due').eq('active', true)),
  ]);
  const outLate = outPlans.filter((x) => outsideStatus(x.next_due).rank === 0);
  const outSoon = outPlans.filter((x) => outsideStatus(x.next_due).rank === 2);
  const outNoDate = outPlans.filter((x) => outsideStatus(x.next_due).rank === 1);
  const act = activeAssets();
  const down = act.filter((a) => a.status === 'down'), limited = act.filter((a) => a.status === 'limited');
  const dailyDue = core.status.filter((s) => s.frequency === 'daily' && s.due_this_period);
  const dailyLeft = dailyDue.filter((s) => s.state === 'due').length;
  const byFreq = FREQ_ORDER.map((f) => {
    const rows = core.status.filter((s) => s.frequency === f && s.due_this_period);
    const done = rows.filter((s) => s.state === 'done').length;
    return { f, done, total: rows.length, pct: rows.length ? Math.round(done / rows.length * 100) : 0, start: rows[0] && rows[0].period_start, end: rows[0] && rows[0].due_by };
  });
  const name = (id) => (core.assetById[id] ? core.assetById[id].name : id);
  const activity = [
    ...insp.map((r) => ({ at: r.performed_at, who: r.performed_by, what: `completed the ${(FREQ[r.frequency] || '').toLowerCase()} check on ${r.asset_id} ${name(r.asset_id)}${r.result === 'fail' ? ' – item failed' : ''}`, id: r.asset_id })),
    ...skips.map((r) => ({ at: r.created_at, who: r.reported_by, what: `skipped the ${(FREQ[r.frequency] || '').toLowerCase()} check on ${r.asset_id} (${SKIP_REASONS[r.reason]})`, id: r.asset_id })),
    ...probs.map((r) => ({ at: r.created_at, who: r.reported_by, what: `reported a problem on ${r.asset_id}: ${r.description} (set ${STATUS[r.new_status]})`, id: r.asset_id })),
    ...logs.map((r) => ({ at: r.created_at, who: r.done_by, what: `logged ${LOG_KIND[r.kind].toLowerCase()} on ${r.asset_id}: ${r.title}`, id: r.asset_id })),
  ].sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 12);

  const deptRows = core.depts.map((d) => {
    const as = deptAssets(d);
    if (!as.length) return '';
    const own = as.filter((a) => a.department === d).length;
    const dl = as.filter((a) => a.status !== 'running');
    const dd = as.map((a) => a.checks.find((c) => c.frequency === 'daily' && c.due_this_period)).filter(Boolean);
    const ex = exc.filter((x) => x.department === d).length;
    return `<tr><td><a href="#/machines?dept=${encodeURIComponent(d)}" style="font-weight:600;text-decoration:none">${esc(d)}</a></td>
      <td>${own}${as.length > own ? ` <span class="muted small">+ ${as.length - own} shared</span>` : ''}</td>
      <td class="${dl.length ? 't-bad' : 'muted'}" style="font-weight:600">${dl.length ? dl.map((a) => esc(a.id)).join(', ') : '—'}</td>
      <td>${dd.length ? `${dd.filter((c) => c.state === 'done').length} / ${dd.length}` : '<span class="muted">—</span>'}</td>
      <td class="${ex ? 't-warn' : 'muted'}" style="font-weight:600">${ex || '—'}</td></tr>`;
  }).join('');

  const body = `
  <div class="head"><div><h1>Dashboard</h1><p class="muted" style="margin:4px 0 0">${fmtDate(shopToday())}</p></div>
    <div class="row"><a class="btn" href="#/exceptions">Exceptions</a><a class="btn" href="#/floor">Tablet check-in</a><a class="btn primary" href="#/map">Shop floor map</a></div></div>
  ${outLate.length || outSoon.length || outNoDate.length ? `<div class="notice"><b>Outside inspections:</b> ${[outLate.length ? `<span class="t-bad" style="font-weight:700">${outLate.length} overdue</span>` : '', outSoon.length ? `${outSoon.length} due within 60 days` : '', outNoDate.length ? `${outNoDate.length} with no due date set` : ''].filter(Boolean).join(' · ')}${isSup() ? ` · <a href="#/outside">Open</a>` : ''}</div>` : ''}
  <section class="grid g4" aria-label="Today at a glance">
    <div class="card tile"><span class="small muted">Machines down</span><span class="n t-bad">${down.length}</span><span class="small muted">${limited.length} more running limited</span></div>
    <div class="card tile"><span class="small muted">Daily checks left today</span><span class="n">${dailyLeft}</span><span class="small muted">of ${dailyDue.length} due today</span></div>
    <div class="card tile"><span class="small muted">Exceptions needing review</span><span class="n t-warn">${exc.length}</span><span class="small muted"><a href="#/exceptions">Review now</a></span></div>
    <div class="card tile"><span class="small muted">Machines with no checklist</span><span class="n">${act.filter((a) => !a.checks.length).length}</span><span class="small muted">of ${act.length} active machines</span></div>
  </section>
  <section class="card" aria-labelledby="pmh"><h2 id="pmh">Checks done this period</h2>
    <div class="grid g5">${byFreq.map((f) => `<div class="stack" style="gap:6px">
      <div class="row" style="justify-content:space-between"><b>${FREQ[f.f]}</b><span class="small muted">${f.done} / ${f.total}</span></div>
      <div class="bar"><div style="width:${f.pct}%"></div></div>
      <span class="tiny muted">${f.total ? (f.f === 'daily' ? 'Today' : fmtShort(f.start) + ' – ' + fmtShort(f.end)) : 'No checklists yet'}</span></div>`).join('')}</div>
  </section>
  <section class="card flush" aria-labelledby="dh"><div style="padding:18px 22px 6px"><h2 id="dh">By department</h2></div>
    <div class="tablewrap"><table><thead><tr><th>Department</th><th>Machines</th><th>Down / limited</th><th>Daily checks today</th><th>Exceptions to review</th></tr></thead><tbody>${deptRows}</tbody></table></div></section>
  <div class="grid g2">
    <section class="card" aria-labelledby="dlh"><h2 id="dlh">Down or limited</h2>
      ${[...down, ...limited].map((a) => `<a class="list-item" href="#/machine/${encodeURIComponent(a.id)}" style="text-decoration:none;color:inherit">
        ${statusChip(a.status)}<div style="flex:1"><b>${esc(a.id)}</b> · ${esc(a.name)}<div class="small muted">${esc(a.department || '')}</div></div></a>`).join('') || '<p class="muted">Everything is running.</p>'}
    </section>
    <section class="card" aria-labelledby="eh"><h2 id="eh">Exceptions needing review</h2>
      ${exc.slice(0, 8).map((x) => `<a class="list-item" href="#/exceptions" style="text-decoration:none;color:inherit">${chip(KIND[x.kind], KIND_CHIP[x.kind])}
        <div style="flex:1"><b>${esc(x.asset_id)}</b> · ${esc(FREQ[x.frequency])} · ${fmtShort(x.period_start)}<div class="small muted">${esc(x.detail || '')}</div></div></a>`).join('') || '<p class="muted">Nothing waiting.</p>'}
      ${exc.length > 8 ? `<p class="small"><a href="#/exceptions">See all ${exc.length}</a></p>` : ''}
    </section>
  </div>
  <section class="card" aria-labelledby="ah"><h2 id="ah">Recent activity</h2>
    ${activity.map((r) => `<div class="list-item small"><span class="muted" style="width:120px;flex-shrink:0">${fmtTime(r.at)}</span><span><b>${esc(r.who)}</b> ${esc(r.what)}</span></div>`).join('') || '<p class="muted">Nothing logged yet.</p>'}
  </section>`;
  app.innerHTML = officeShell('/dash', body, exc.length);
});

// ---------------------------------------------------------------- outside inspections
const REPORT_BUCKET = 'service-reports';
function dayDiff(a, b) {
  const t = (x) => { const [y, m, d] = String(x).slice(0, 10).split('-').map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((t(a) - t(b)) / 864e5);
}
function outsideStatus(nextDue) {
  if (!nextDue) return { text: 'No date set', cls: 'c-grey', rank: 1 };
  const n = dayDiff(nextDue, shopToday());
  if (n < 0) return { text: `Overdue ${-n} day${n === -1 ? '' : 's'}`, cls: 'c-bad', rank: 0 };
  if (n <= 60) return { text: n === 0 ? 'Due today' : `Due in ${n} day${n === 1 ? '' : 's'}`, cls: 'c-warn', rank: 2 };
  return { text: 'OK', cls: 'c-ok', rank: 3 };
}
async function openReport(path) {
  const { data, error } = await sb.storage.from(REPORT_BUCKET).createSignedUrl(path, 3600);
  if (error) { toast(errMsg(error), true); return; }
  const w = window.open('about:blank', '_blank');
  if (w) { w.opener = null; w.location.href = data.signedUrl; } else { location.href = data.signedUrl; }
}
function wireReportLinks() {
  $$('[data-report]').forEach((b) => b.addEventListener('click', () => openReport(b.dataset.report)));
}

route('/outside', async () => {
  app.innerHTML = officeShell('/outside', '<div class="loading">Loading…</div>');
  await loadCore();
  const [plans, recs] = await Promise.all([
    q(sb.from('outside_service_plans').select('*').eq('active', true).order('asset_id')),
    q(sb.from('outside_service_records').select('*').order('performed_on', { ascending: false })),
  ]);
  const last = {};
  recs.forEach((r) => { if (!last[r.plan_id]) last[r.plan_id] = r; });
  const rows = plans.map((p) => ({ p, l: last[p.id], st: outsideStatus(p.next_due) }))
    .sort((a, b) => a.st.rank - b.st.rank || String(a.p.next_due || '9').localeCompare(String(b.p.next_due || '9')) || (a.p.asset_id < b.p.asset_id ? -1 : 1));
  const nm = (id) => (core.assetById[id] ? core.assetById[id].name : '');
  const opts = core.assets.filter((a) => a.status !== 'retired').map((a) => `<option value="${esc(a.id)}">${esc(a.id)} · ${esc(a.name)}</option>`).join('');
  app.innerHTML = officeShell('/outside', `
  <div class="head"><div><h1>Outside inspections</h1><p class="muted" style="margin:4px 0 0">Inspections done by an outside company. Log each visit and attach the vendor's report.</p></div>
    <div class="row"><a class="btn primary" href="#/outside/log">Log a visit</a></div></div>
  <section class="card flush"><div class="tablewrap"><table><thead><tr><th>Machine</th><th>Service</th><th>Vendor</th><th>Last done</th><th>Next due</th><th></th></tr></thead><tbody>
  ${rows.map(({ p, l, st }) => `<tr>
    <td><span class="tag">${esc(p.asset_id)}</span><div class="small muted">${esc(nm(p.asset_id))}</div></td>
    <td>${esc(p.service)}</td>
    <td>${p.vendor ? esc(p.vendor) : '<span class="muted">Not set</span>'}</td>
    <td>${l ? `${fmtDate(l.performed_on)}${l.result === 'fail' ? ' ' + chip('Failed', 'c-bad') : ''}${l.report_path ? `<div><button type="button" class="btn sm" data-report="${esc(l.report_path)}">Open report</button></div>` : '<div class="small muted">No report attached</div>'}` : '<span class="muted">Never logged</span>'}</td>
    <td>${p.next_due ? fmtDate(p.next_due) : '<span class="muted">—</span>'}<div>${chip(st.text, st.cls)}</div></td>
    <td><div class="row" style="gap:8px"><a class="btn sm primary" href="#/outside/log?plan=${p.id}">Log visit</a><a class="btn sm" href="#/outside/plan/${p.id}">Details</a></div></td></tr>`).join('') || '<tr><td colspan="6" class="muted">Nothing set up yet.</td></tr>'}
  </tbody></table></div></section>
  <section class="card"><h2>Add an outside service</h2>
    <form id="np" class="row" style="align-items:flex-end">
      <label style="flex:1 1 260px">Machine<select name="asset_id" required><option value="">Choose…</option>${opts}</select></label>
      <label style="flex:1 1 260px">Service<input name="service" required placeholder="e.g. Annual inspection (outside company)"></label>
      <label style="flex:1 1 160px">Vendor<input name="vendor"></label>
      <label style="width:130px">Every (months)<input name="interval_months" type="number" min="1" value="12" required></label>
      <label>Next due<input name="next_due" type="date"></label>
      <button class="btn primary" type="submit">Add</button></form></section>`);
  wireReportLinks();
  $('#np').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = formData(e.target);
    busy($('button', e.target), async () => {
      await q(sb.from('outside_service_plans').insert({ asset_id: f.asset_id, service: f.service, vendor: f.vendor || '', interval_months: Number(f.interval_months) || 12, next_due: f.next_due || null }));
      toast('Added');
      render();
    });
  });
}, { sup: true });

route('/outside/log', async () => {
  app.innerHTML = officeShell('/outside', '<div class="loading">Loading…</div>');
  await loadCore();
  const plans = await q(sb.from('outside_service_plans').select('*').eq('active', true).order('asset_id'));
  const pre = query().get('plan') || '';
  const first = plans.find((p) => p.id === pre);
  const nm = (id) => (core.assetById[id] ? core.assetById[id].name : '');
  app.innerHTML = officeShell('/outside', `
  <div class="head"><div><h1>Log an outside inspection</h1><p class="muted" style="margin:4px 0 0">One report can cover several machines. Tick each one the visit covered and the report is attached to all of them.</p></div>
    <div class="row"><a class="btn" href="#/outside">Cancel</a></div></div>
  <form id="lf" class="card stack">
    <fieldset class="stack" style="border:0;padding:0;margin:0"><legend style="font-weight:600;font-size:14px;margin-bottom:6px">Machines covered</legend>
    ${plans.map((p) => `<label style="flex-direction:row;align-items:center;gap:10px;font-weight:500"><input type="checkbox" name="plan" value="${p.id}" ${p.id === pre ? 'checked' : ''} style="height:20px;width:20px"><span><b>${esc(p.asset_id)}</b> · ${esc(nm(p.asset_id))} <span class="muted small">· ${esc(p.service)}</span></span></label>`).join('') || '<p class="muted">No outside services set up yet.</p>'}
    </fieldset>
    <div class="grid g3">
      <label>Date of inspection<input type="date" name="performed_on" value="${shopToday()}" max="${shopToday()}" required></label>
      <label>Vendor<input name="vendor" value="${esc(first ? first.vendor : '')}" placeholder="Company that did the inspection"></label>
      <label>Result<select name="result"><option value="pass">Passed</option><option value="fail">Failed / needs repair</option></select></label>
    </div>
    <label>Vendor's report (PDF or photo, up to 25 MB)<input type="file" name="report" accept="application/pdf,image/jpeg,image/png"></label>
    <label>Notes<textarea name="notes" rows="3" placeholder="Anything the report found, repairs needed, certificate numbers…"></textarea></label>
    <label>Recorded by<input name="recorded_by" required value="${esc(profile.display_name)}"></label>
    <p class="small muted" style="margin:0">Saving a passed inspection sets the next due date automatically. A failed inspection keeps the current due date until a passing one is logged.</p>
    <div class="row"><button class="btn primary big" type="submit">Save</button></div>
  </form>`);
  $('#lf').addEventListener('submit', (e) => {
    e.preventDefault();
    const form = e.target;
    const f = formData(form);
    const ids = $$('input[name="plan"]:checked', form).map((x) => x.value);
    if (!ids.length) { toast('Tick at least one machine', true); return; }
    const file = form.report.files[0];
    if (file && file.size > 25 * 1024 * 1024) { toast('That file is over 25 MB', true); return; }
    busy($('button[type="submit"]', form), async () => {
      let path = null, fname = null;
      if (file) {
        fname = file.name;
        const safe = file.name.replace(/[^A-Za-z0-9._-]+/g, '_').slice(-80);
        path = `${f.performed_on.slice(0, 4)}/${crypto.randomUUID()}-${safe}`;
        const { error } = await sb.storage.from(REPORT_BUCKET).upload(path, file, { contentType: file.type || undefined, upsert: false });
        if (error) throw error;
      }
      await q(sb.from('outside_service_records').insert(ids.map((id) => ({ plan_id: id, performed_on: f.performed_on, vendor: f.vendor || '', report_path: path, report_name: fname, result: f.result, notes: f.notes || '', recorded_by: f.recorded_by }))));
      toast(`Saved for ${ids.length} machine${ids.length > 1 ? 's' : ''}`);
      location.hash = '#/outside';
    });
  });
}, { sup: true });

route('/outside/plan/([0-9a-f-]{36})', async (pid) => {
  app.innerHTML = officeShell('/outside', '<div class="loading">Loading…</div>');
  await loadCore();
  const [p] = await q(sb.from('outside_service_plans').select('*').eq('id', pid));
  if (!p) { app.innerHTML = officeShell('/outside', '<div class="err">Not found.</div>'); return; }
  const recs = await q(sb.from('outside_service_records').select('*').eq('plan_id', pid).order('performed_on', { ascending: false }));
  const a = core.assetById[p.asset_id];
  const st = outsideStatus(p.next_due);
  app.innerHTML = officeShell('/outside', `
  <div class="head"><div><h1>${esc(p.asset_id)} · ${esc(p.service)}</h1><p class="muted" style="margin:4px 0 0">${esc(a ? a.name : '')} ${chip(st.text, st.cls)}</p></div>
    <div class="row"><a class="btn" href="#/outside">Back</a><a class="btn primary" href="#/outside/log?plan=${p.id}">Log visit</a></div></div>
  <form id="pf" class="card stack">
    <div class="grid g3">
      <label>Vendor<input name="vendor" value="${esc(p.vendor)}"></label>
      <label>Every (months)<input name="interval_months" type="number" min="1" value="${p.interval_months}" required></label>
      <label>Next due<input name="next_due" type="date" value="${esc(p.next_due || '')}"></label>
    </div>
    <label>Notes<textarea name="notes" rows="2">${esc(p.notes)}</textarea></label>
    <label style="flex-direction:row;align-items:center;gap:10px;font-weight:500"><input type="checkbox" name="active" ${p.active ? 'checked' : ''} style="height:20px;width:20px">Active (untick if this service is no longer needed)</label>
    <div class="row"><button class="btn primary" type="submit">Save changes</button></div>
  </form>
  <section class="card flush"><div style="padding:18px 22px 6px"><h2>History</h2></div><div class="tablewrap"><table><thead><tr><th>Date</th><th>Vendor</th><th>Result</th><th>Report</th><th>Notes</th><th>Logged by</th></tr></thead><tbody>
  ${recs.map((r) => `<tr><td>${fmtDate(r.performed_on)}</td><td>${esc(r.vendor)}</td><td>${chip(r.result === 'fail' ? 'Failed' : 'Passed', r.result === 'fail' ? 'c-bad' : 'c-ok')}</td>
    <td>${r.report_path ? `<button type="button" class="btn sm" data-report="${esc(r.report_path)}">Open ${esc(r.report_name || 'report')}</button>` : '<span class="muted">None</span>'}</td>
    <td class="small">${esc(r.notes)}</td><td class="small">${esc(r.recorded_by)}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">No visits logged yet.</td></tr>'}
  </tbody></table></div></section>`);
  wireReportLinks();
  $('#pf').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = formData(e.target);
    busy($('button', e.target), async () => {
      await q(sb.from('outside_service_plans').update({ vendor: f.vendor || '', interval_months: Number(f.interval_months) || 12, next_due: f.next_due || null, notes: f.notes || '', active: e.target.active.checked }).eq('id', pid));
      toast('Saved');
      render();
    });
  });
}, { sup: true });

// ---------------------------------------------------------------- departments
route('/departments', async () => {
  app.innerHTML = officeShell('/departments', '<div class="loading">Loading…</div>');
  await loadCore();
  const exc = await q(sb.from('v_exceptions').select('department,review_status').eq('review_status', 'needs_review'));
  const cards = core.depts.map((d) => {
    const as = deptAssets(d);
    const own = as.filter((a) => a.department === d);
    const sharedIn = as.filter((a) => a.department !== d);
    const bad = as.filter((a) => a.status !== 'running');
    const dd = as.map((a) => a.checks.find((c) => c.frequency === 'daily' && c.due_this_period)).filter(Boolean);
    const done = dd.filter((c) => c.state === 'done').length;
    return `<section class="card stack" style="gap:12px">
      <div class="row" style="justify-content:space-between;align-items:flex-start"><div><h2 style="margin:0">${esc(d)}</h2>
        <span class="small muted">${own.length} machines${sharedIn.length ? ` · ${sharedIn.length} shared from other departments` : ''}</span></div>
        ${bad.length ? chip(bad.length + ' down / limited', 'c-bad') : as.length ? chip('All running', 'c-ok') : ''}</div>
      <div class="stack" style="gap:6px"><div class="row small" style="justify-content:space-between"><span class="muted">Daily checks today</span><b>${dd.length ? done + ' / ' + dd.length : '—'}</b></div>
        <div class="bar"><div style="width:${dd.length ? Math.round(done / dd.length * 100) : 0}%"></div></div></div>
      <div class="small"><span class="muted">Exceptions to review:</span> <b>${exc.filter((x) => x.department === d).length}</b></div>
      ${sharedIn.length ? `<div class="small muted">Shared: ${sharedIn.map((a) => esc(a.name)).join(', ')}</div>` : ''}
      <a href="#/machines?dept=${encodeURIComponent(d)}" style="font-weight:600;text-decoration:none">View machines →</a></section>`;
  }).join('');
  app.innerHTML = officeShell('/departments', `<div class="head"><div><h1>Departments</h1><p class="muted" style="margin:4px 0 0">Shared machines show under every department that uses them but are checked once.</p></div></div>
    <div class="grid g3">${cards}</div>`, exc.length);
});

// ---------------------------------------------------------------- machines
route('/machines', async () => {
  app.innerHTML = officeShell('/machines', '<div class="loading">Loading…</div>');
  await loadCore();
  const qs = query();
  const dept = qs.get('dept') || '';
  const st = qs.get('status') || '';
  const text = (qs.get('q') || '').toLowerCase();
  const act = activeAssets();
  const counts = { running: 0, limited: 0, down: 0 };
  act.forEach((a) => { counts[a.status] = (counts[a.status] || 0) + 1; });
  const match = (a) => (!st || a.status === st || (st === 'nochecklist' && !a.checks.length))
    && (!text || [a.id, a.name, a.model, a.serial, a.manufacturer, a.cpa_id].join(' ').toLowerCase().includes(text));
  const inactiveView = st === 'retired';
  const groups = (dept ? [dept] : core.depts).map((d) => {
    const rows = (inactiveView ? core.assets.filter((a) => a.status === 'retired' && a.department === d) : dept ? deptAssets(d) : act.filter((a) => a.department === d)).filter(match);
    if (!rows.length) return '';
    return `<section class="card flush"><div class="row" style="padding:14px 20px;background:#F9F9F7;justify-content:space-between">
      <h2 style="font-size:18px">${esc(d)}</h2><span class="small muted">${rows.length} machines</span></div>
      <div class="tablewrap"><table><thead><tr><th>Tag</th><th>Machine</th><th>Status</th><th>Today's daily</th><th>Other checks</th></tr></thead><tbody>
      ${rows.map((a) => {
        const ds = dailyState(a);
        const other = a.checks.filter((c) => c.frequency !== 'daily');
        const due = other.filter((c) => c.state === 'due');
        return `<tr><td class="tag"><a href="#/machine/${encodeURIComponent(a.id)}" style="text-decoration:none">${esc(a.id)}</a></td>
        <td><div style="font-weight:600">${esc(a.name)}${clipIcon(a)}</div><div class="tiny muted">${esc([a.manufacturer, a.model].filter(Boolean).join(' · '))}</div>
          ${a.department !== d ? `<div style="margin-top:4px">${chip('Shared', 'c-info')} <span class="tiny muted">owned by ${esc(a.department)}</span></div>` : a.shared.length ? `<div class="tiny muted" style="margin-top:4px">Also used by ${esc(a.shared.join(', '))}</div>` : ''}</td>
        <td>${statusChip(a.status)}</td>
        <td class="${ds.cls}" style="font-weight:600">${inactiveView ? '—' : esc(ds.text)}</td>
        <td>${inactiveView ? '<span class="muted">Inactive – no checks due</span>' : other.length ? (due.length ? `<span class="t-warn" style="font-weight:600">${due.map((c) => FREQ[c.frequency]).join(', ')} due</span>` : '<span class="t-ok">Up to date</span>') : '<span class="muted">None set up</span>'}</td></tr>`;
      }).join('')}</tbody></table></div></section>`;
  }).join('');
  const body = `<div class="head"><div><h1>Machines</h1><p class="muted" style="margin:4px 0 0">${act.length} machines · ${counts.running} running · ${counts.limited} limited · ${counts.down} down · <span class="clipwrap" style="margin:0">${CLIP}</span> manual uploaded</p></div>
    ${isSup() ? '<a class="btn primary" href="#/admin/asset/new">+ Add machine</a>' : ''}</div>
  <form id="mf" class="row">
    <label class="sr" for="mq">Search</label><input id="mq" name="q" type="search" placeholder="Search tag, name, model or serial" value="${esc(qs.get('q') || '')}" style="flex:1 1 260px;max-width:380px">
    <label class="sr" for="md">Department</label><select id="md" name="dept"><option value="">All departments</option>${core.depts.map((d) => `<option ${d === dept ? 'selected' : ''}>${esc(d)}</option>`).join('')}</select>
    <label class="sr" for="ms">Status</label><select id="ms" name="status"><option value="">Any status</option>${['running', 'limited', 'down', 'retired'].map((s) => `<option value="${s}" ${s === st ? 'selected' : ''}>${STATUS[s]}</option>`).join('')}<option value="nochecklist" ${st === 'nochecklist' ? 'selected' : ''}>No checklist yet</option></select>
    <button class="btn" type="submit">Filter</button></form>
  ${groups || '<p class="muted">No machines match.</p>'}`;
  app.innerHTML = officeShell('/machines', body, await exceptionBadge());
  $('#mf').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = formData(e.target);
    const p = new URLSearchParams(Object.entries(f).filter(([, v]) => v));
    location.hash = '#/machines' + (p.toString() ? '?' + p : '');
  });
  ['#md', '#ms'].forEach((s) => $(s).addEventListener('change', () => $('#mf').requestSubmit()));
});

// ---------------------------------------------------------------- machine detail (office)
route('/machine/([^/?]+)', async (id) => {
  app.innerHTML = officeShell('/machines', '<div class="loading">Loading…</div>');
  await loadCore();
  const a = core.assetById[id];
  if (!a) { app.innerHTML = officeShell('/machines', `<div class="err">No machine with tag ${esc(id)}.</div>`); return; }
  const [allCl, insp, skips, probs, chg, logs, corr, revs, mans] = await Promise.all([
    q(sb.from('checklists').select('*, checklist_items(count)').eq('asset_id', id).order('created_at')),
    q(sb.from('inspections').select('*').eq('asset_id', id).order('performed_at', { ascending: false }).limit(60)),
    q(sb.from('skips').select('*').eq('asset_id', id).order('created_at', { ascending: false }).limit(60)),
    q(sb.from('problems').select('*').eq('asset_id', id).order('created_at', { ascending: false }).limit(60)),
    q(sb.from('status_changes').select('*').eq('asset_id', id).order('created_at', { ascending: false }).limit(60)),
    q(sb.from('maintenance_logs').select('*').eq('asset_id', id).order('created_at', { ascending: false }).limit(60)),
    q(sb.from('corrections').select('*').eq('asset_id', id).order('created_at', { ascending: false })),
    q(sb.from('checklist_revisions').select('checklist_id,revision,change_note,approved_by,effective_date,created_at').order('revision', { ascending: false })),
    Promise.all([q(sb.from('asset_manuals').select('*').eq('asset_id', id)), q(sb.from('asset_manual_links').select('manual:asset_manuals(*)').eq('asset_id', id))]).then(([own, lk]) => [...own, ...lk.map((x) => ({ ...x.manual, sharedFrom: x.manual.asset_id }))].sort((x, y) => (x.doc_type + x.title).localeCompare(y.doc_type + y.title))),
  ]);
  const corrFor = (type, rid) => corr.filter((c) => c.target_type === type && c.target_id === rid);
  const corrHtml = (type, rid) => corrFor(type, rid).map((c) => `<div class="small" style="margin-top:6px;padding:8px 10px;background:var(--warn-bg);border-radius:6px"><b>Correction</b> by ${esc(c.corrected_by)}, ${fmtTime(c.created_at)}: ${esc(c.reason)}</div>`).join('');
  const corrBtn = (type, rid) => isSup() ? `<button type="button" class="btn sm" data-correct="${type}:${rid}">Add correction</button>` : '';
  const hist = [
    ...insp.map((r) => ({ at: r.performed_at, html: `${chip(FREQ[r.frequency] + ' check', r.result === 'fail' ? 'c-info' : 'c-ok')} <b>${r.result === 'fail' ? 'Done – item failed' : 'Done – all passed'}</b> · Rev ${r.revision}
      <details style="margin-top:6px"><summary class="small">${r.answers.length} item${r.answers.length === 1 ? '' : 's'} · show answers</summary><table style="margin-top:6px"><tbody>${r.answers.map((x) => `<tr><td style="width:36px">${x.seq}</td><td>${esc(x.prompt)}${x.note ? `<div class="small t-bad">${esc(x.note)}</div>` : ''}</td><td style="width:60px;font-weight:700" class="${x.answer === 'no' ? 't-bad' : 't-ok'}">${x.response ? (x.response === 'no' ? 'No' : 'Yes') : x.value != null ? esc(x.value) : (x.answer === 'no' ? 'No' : 'Yes')}</td></tr>`).join('')}</tbody></table>${r.notes ? `<p class="small">Notes: ${esc(r.notes)}</p>` : ''}</details>${corrHtml('inspection', r.id)}`, who: r.performed_by, type: 'inspection', id: r.id })),
    ...skips.map((r) => ({ at: r.created_at, html: `${chip(FREQ[r.frequency] + ' check skipped', 'c-warn')} <b>${esc(SKIP_REASONS[r.reason])}</b><div class="small muted">${esc(r.note)}${r.makeup ? ' · make-up: ' + esc(r.makeup) : ''}</div>${corrHtml('skip', r.id)}`, who: r.reported_by, type: 'skip', id: r.id })),
    ...probs.map((r) => ({ at: r.created_at, html: `${chip('Problem', 'c-bad')} <b>${esc(r.category)}</b>${r.loto ? ' · LOTO applied' : ''}<div class="small">${esc(r.description)}</div>${corrHtml('problem', r.id)}`, who: r.reported_by, type: 'problem', id: r.id })),
    ...chg.map((r) => ({ at: r.created_at, html: `${chip('Status', 'c-grey')} ${esc(STATUS[r.old_status] || r.old_status || '—')} → <b>${esc(STATUS[r.new_status] || r.new_status)}</b>${r.note ? `<div class="small muted">${esc(r.note)}</div>` : ''}${corrHtml('status_change', r.id)}`, who: r.changed_by, type: 'status_change', id: r.id })),
    ...logs.map((r) => ({ at: r.created_at, html: `${chip(LOG_KIND[r.kind], 'c-grey')} <b>${esc(r.title)}</b> <span class="small muted">· done ${fmtDate(r.done_on)}</span>${r.notes ? `<div class="small">${esc(r.notes)}</div>` : ''}${corrHtml('maintenance_log', r.id)}`, who: r.done_by, type: 'maintenance_log', id: r.id })),
  ].sort((x, y) => (x.at < y.at ? 1 : -1));

  const link = machineLink(id);
  const yn = (v) => (v === true ? 'Yes' : v === false ? 'No' : '—');
  const body = `
  <nav aria-label="Breadcrumb" class="small" style="font-weight:600"><a href="#/machines?dept=${encodeURIComponent(a.department || '')}" style="text-decoration:none">${esc(a.department || 'Machines')}</a> / ${esc(a.id)}</nav>
  <div class="head"><div class="stack" style="gap:6px"><div class="row"><h1>${esc(a.id)} · ${esc(a.name)}</h1>${statusChip(a.status)}</div>
    <span class="muted">${esc([a.department ? a.department + ' department' : '', a.manufacturer, a.model, a.serial ? 'Serial ' + a.serial : ''].filter(Boolean).join(' · '))}</span></div>
    <div class="row">${isSup() ? `<a class="btn" href="#/admin/asset/${encodeURIComponent(id)}">Edit machine</a>` : ''}<a class="btn primary" href="#/m/${encodeURIComponent(id)}">Open on shop floor</a></div></div>
  ${a.needs_review ? `<div class="notice small"><b>Needs review:</b> ${esc(a.notes || 'Some details are missing.')}</div>` : ''}

  <section class="card flush" aria-labelledby="clh"><div class="row" style="justify-content:space-between;padding:18px 22px 6px"><h2 id="clh" style="margin:0">Checklists</h2>
    ${isSup() ? `<a class="btn sm" href="#/admin/checklist/new?asset=${encodeURIComponent(id)}">+ Add checklist</a>` : ''}</div>
    ${allCl.length ? `<div class="tablewrap"><table><thead><tr><th>Frequency</th><th>Checklist</th><th>Revision</th><th>This period</th><th>Last done</th>${isSup() ? '<th></th>' : ''}</tr></thead><tbody>
    ${allCl.sort((x, y) => FREQ_ORDER.indexOf(x.frequency) - FREQ_ORDER.indexOf(y.frequency)).map((c) => {
      const s = a.checks.find((x) => x.checklist_id === c.id);
      const rv = revs.filter((r) => r.checklist_id === c.id);
      return `<tr><td style="font-weight:700">${FREQ[c.frequency]}</td>
      <td><div style="font-weight:600">${esc(c.title)}</div><div class="tiny muted">${esc(c.doc_id)} · ${c.checklist_items[0] ? c.checklist_items[0].count : 0} items${c.active ? '' : ' · <b>inactive</b>'}</div></td>
      <td>Rev ${c.revision} · ${fmtShort(c.effective_date)}<div class="tiny">${c.approved_by ? 'Approved by ' + esc(c.approved_by) : '<span class="t-bad" style="font-weight:600">Not approved</span>'}</div>
        ${rv.length > 1 ? `<details class="tiny"><summary>History</summary>${rv.map((r) => `<div>Rev ${r.revision} · ${fmtShort(r.effective_date)} · ${esc(r.change_note)}</div>`).join('')}</details>` : ''}</td>
      <td>${s ? checkStateChip(s) : chip('Inactive', 'c-grey')}</td>
      <td class="small">${s && s.last_done_at ? `${fmtTime(s.last_done_at)}<div class="muted">${esc(s.last_done_by)}</div>` : '<span class="muted">Never</span>'}</td>
      ${isSup() ? `<td><a class="btn sm" href="#/admin/checklist/${c.id}">Edit</a></td>` : ''}</tr>`;
    }).join('')}</tbody></table></div>` : '<p class="muted" style="padding:0 22px 18px">No checklists yet.</p>'}
  </section>

  <section class="card flush" aria-labelledby="mnh"><div class="row" style="justify-content:space-between;padding:18px 22px 6px"><h2 id="mnh" style="margin:0">Manuals</h2>
    ${isAdmin() ? '<button type="button" class="btn sm" id="addman">+ Add manual</button>' : ''}</div>
    ${isAdmin() ? `<form id="manf" hidden class="row" style="padding:6px 22px 14px;gap:10px;align-items:flex-end"><label style="flex:1 1 220px">Title<input name="title" required></label>
      <label>Type<select name="doc_type">${['operator', 'maintenance', 'service', 'parts', 'safety', 'electrical', 'programming', 'other'].map((t) => `<option>${t}</option>`).join('')}</select></label>
      <label>Manual no.<input name="manual_no"></label><label>PDF (max 50 MB)<input name="file" type="file" accept="application/pdf"></label>
      <button class="btn primary" type="submit">Save manual</button></form>` : ''}
    <div id="sharebox" hidden class="card stack" style="margin:6px 22px 14px"></div>
    <div id="editbox" hidden class="card stack" style="margin:6px 22px 14px"></div>
    ${mans.length ? `<div class="tablewrap"><table><thead><tr><th>Manual</th><th>Type</th><th>Status</th><th></th></tr></thead><tbody>${mans.map((m) => `<tr><td><div style="font-weight:600">${esc(m.title)}${m.sharedFrom ? ' ' + chip('Shared from ' + m.sharedFrom, 'c-info') : ''}</div><div class="tiny muted">${esc([m.manual_no, m.notes].filter(Boolean).join(' · '))}</div></td>
      <td class="small">${esc(m.doc_type)}</td><td>${m.storage_path ? chip('PDF on file', 'c-ok') : chip(({ on_file: 'Paper/other copy on file', link_found: 'Link found', purchase_needed: 'Purchase needed', request_from_oem: 'Request from maker', need_make_model: 'Need make/model', not_searched: 'Not searched' })[m.status] || m.status, 'c-grey')}</td>
      <td><div class="row" style="gap:8px">${m.storage_path ? `<button type="button" class="btn sm" data-open="${esc(m.storage_path)}">Open PDF</button>` : /^https?:\/\//.test(m.url || '') ? `<a class="btn sm" href="${esc(m.url)}" target="_blank" rel="noopener">Open link</a>` : ''}
        ${isAdmin() && !m.sharedFrom ? `<button type="button" class="btn sm" data-share="${esc(m.id)}">Share with machines…</button>` : ''}
        ${isAdmin() ? `<label class="btn sm" style="cursor:pointer">${m.storage_path ? 'Replace PDF' : 'Upload PDF'}<input type="file" accept="application/pdf" data-up="${esc(m.id)}" hidden></label>` : ''}
        ${isAdmin() && !m.sharedFrom ? `<button type="button" class="btn sm" data-edit="${esc(m.id)}">Edit</button><button type="button" class="btn sm danger" data-delman="${esc(m.id)}">Delete</button>` : ''}</div></td></tr>`).join('')}</tbody></table></div>` : '<p class="muted" style="padding:0 22px 18px">No manuals listed yet.</p>'}
  </section>

  <div class="grid" style="grid-template-columns:minmax(0,2fr) minmax(0,1fr);align-items:start">
    <section class="card" aria-labelledby="hh"><div class="row" style="justify-content:space-between;margin-bottom:8px"><h2 id="hh" style="margin:0">History</h2>
      <button type="button" class="btn sm" id="exp">Export CSV</button></div>
      ${hist.map((h) => `<div class="list-item"><span class="small muted" style="width:110px;flex-shrink:0">${fmtTime(h.at)}</span>
        <div style="flex:1;min-width:0">${h.html}<div class="tiny muted" style="margin-top:4px">by ${esc(h.who)}</div>
        <div data-corr-slot="${h.type}:${h.id}"></div></div>${corrBtn(h.type, h.id)}</div>`).join('') || '<p class="muted">Nothing logged yet.</p>'}
    </section>
    <div class="stack" style="gap:16px">
      <section class="card stack" aria-labelledby="sth"><h2 id="sth" style="margin:0">Change status</h2>
        <form id="stf" class="stack">
          <label>New status<select name="status">${['running', 'limited', 'down'].concat(isSup() ? ['retired'] : []).map((s) => `<option value="${s}" ${s === a.status ? 'selected' : ''}>${STATUS[s]}</option>`).join('')}</select></label>
          <label>Note<input name="note" placeholder="Why?"></label>
          <label>Your name<input name="by" required value="${esc(profile.display_name)}"></label>
          <button class="btn dark" type="submit">Save status</button></form></section>
      <section class="card stack" aria-labelledby="lgh"><h2 id="lgh" style="margin:0">Log maintenance</h2>
        <form id="lgf" class="stack">
          <label>Type<select name="kind">${Object.entries(LOG_KIND).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
          <label>What was done<input name="title" required></label>
          <label>Details<textarea name="notes" rows="3"></textarea></label>
          <div class="grid g2" style="gap:10px"><label>Done by<input name="done_by" required value="${esc(profile.display_name)}"></label><label>Date<input name="done_on" type="date" value="${shopToday()}" max="${shopToday()}" required></label></div>
          <button class="btn dark" type="submit">Add to history</button></form></section>
      <section class="card stack small" aria-labelledby="dth"><h2 id="dth" style="margin:0">Details</h2>
        ${[['Fuse ID', a.id], ['CPA ID', a.cpa_id], ['Type', a.asset_type], ['Owner department', a.department], ['Also used by', a.shared.join(', ') || 'None'], ['Location', a.location], ['Parent', a.parent_id], ['Criticality', a.criticality], ['OSHA regulated', yn(a.osha)], ['Lockout/tagout', yn(a.loto)], ['Certification', yn(a.cert_required)], ['In service', a.in_service]]
          .map(([k, v]) => `<div class="row" style="justify-content:space-between;gap:10px"><span class="muted">${k}</span><b style="text-align:right">${esc(v || '—')}</b></div>`).join('')}
        ${a.notes && !a.needs_review ? `<p class="muted" style="margin:0">${esc(a.notes)}</p>` : ''}</section>
      <section class="card stack" aria-labelledby="lkh"><h2 id="lkh" style="margin:0">Shop-floor link</h2>
        <p class="small muted" style="margin:0">Opens this machine on any tablet. The QR code is optional: typing the tag or picking the machine on the tablet works too.</p>
        <div class="row" style="align-items:flex-start;flex-wrap:nowrap"><div style="width:110px;flex-shrink:0">${qrSvg(link, 3)}</div>
          <div class="stack" style="gap:8px;min-width:0"><span class="tiny" style="word-break:break-all;font-weight:600">${esc(link)}</span>
          <div class="row" style="gap:8px"><button class="btn sm" type="button" id="cpy">Copy link</button><button class="btn sm" type="button" id="prt">Print label</button></div></div></div></section>
    </div>
  </div>`;
  app.innerHTML = officeShell('/machines', body, await exceptionBadge());

  const uploadManual = async (manualId, file) => {
    if (file.size > 50 * 1024 * 1024) throw new Error('That file is over 50 MB');
    const safe = file.name.replace(/[^A-Za-z0-9._-]+/g, '_').slice(-80);
    const path = `${id}/${manualId}-${safe}`;
    const { error } = await sb.storage.from(MANUAL_BUCKET).upload(path, file, { contentType: 'application/pdf', upsert: true });
    if (error) throw error;
    await q(sb.from('asset_manuals').update({ storage_path: path, status: 'on_file', source: 'fuse_file', updated_at: new Date().toISOString() }).eq('id', manualId));
  };
  $$('[data-open]').forEach((b) => b.addEventListener('click', async () => {
    const { data, error } = await sb.storage.from(MANUAL_BUCKET).createSignedUrl(b.dataset.open, 3600);
    if (error) { toast(errMsg(error), true); return; }
    const w = window.open('about:blank', '_blank');
    if (w) { w.opener = null; w.location.href = data.signedUrl; } else { location.href = data.signedUrl; }
  }));
  $$('[data-share]').forEach((b) => b.addEventListener('click', async () => {
    const m = mans.find((x) => x.id === b.dataset.share);
    const cur = new Set((await q(sb.from('asset_manual_links').select('asset_id').eq('manual_id', m.id))).map((r) => r.asset_id));
    const sameModel = (x) => a.model && x.model === a.model && x.manufacturer === a.manufacturer;
    const list = core.assets.filter((x) => x.id !== id).sort((x, y) => (sameModel(y) - sameModel(x)) || x.id.localeCompare(y.id));
    const box = $('#sharebox'); box.hidden = false;
    box.innerHTML = `<div class="row" style="justify-content:space-between"><b>Machines that also use: ${esc(m.title)}</b><span class="small muted">One PDF is kept; these machines will show it too.</span></div>
      <div class="row"><button type="button" class="btn sm" id="shsame">Tick all ${esc([a.manufacturer, a.model].filter(Boolean).join(' '))} machines</button><button type="button" class="btn sm" id="shnone">Clear</button></div>
      <div style="max-height:260px;overflow:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:6px">${list.map((x) => `<label style="flex-direction:row;align-items:center;gap:8px;font-weight:500"><input type="checkbox" data-sh="${esc(x.id)}" ${cur.has(x.id) ? 'checked' : ''} style="width:20px;height:20px"> <span>${esc(x.id.replace(/^FUSE-/, ''))} · ${esc(x.name)}</span></label>`).join('')}</div>
      <div class="row"><button type="button" class="btn primary" id="shsave">Save</button><button type="button" class="btn" id="shcancel">Cancel</button></div>`;
    $('#shsame', box).addEventListener('click', () => list.filter(sameModel).forEach((x) => { box.querySelector(`[data-sh="${CSS.escape(x.id)}"]`).checked = true; }));
    $('#shnone', box).addEventListener('click', () => $$('[data-sh]', box).forEach((c) => { c.checked = false; }));
    $('#shcancel', box).addEventListener('click', () => { box.hidden = true; });
    $('#shsave', box).addEventListener('click', (ev) => busy(ev.target, async () => {
      const ids = $$('[data-sh]', box).filter((c) => c.checked).map((c) => c.dataset.sh);
      await q(sb.from('asset_manual_links').delete().eq('manual_id', m.id));
      if (ids.length) await q(sb.from('asset_manual_links').insert(ids.map((aid) => ({ manual_id: m.id, asset_id: aid }))));
      toast(`Shared with ${ids.length} machine${ids.length === 1 ? '' : 's'}`); render();
    }));
  }));
  const DOC_TYPES = ['operator', 'maintenance', 'service', 'parts', 'safety', 'electrical', 'programming', 'other'];
  const MAN_STATUS = { on_file: 'Paper/other copy on file', link_found: 'Link found', purchase_needed: 'Purchase needed', request_from_oem: 'Request from maker', need_make_model: 'Need make/model', not_searched: 'Not searched' };
  $$('[data-edit]').forEach((b) => b.addEventListener('click', () => {
    const m = mans.find((x) => x.id === b.dataset.edit);
    const box = $('#editbox'); box.hidden = false;
    const types = DOC_TYPES.includes(m.doc_type) ? DOC_TYPES : DOC_TYPES.concat(m.doc_type ? [m.doc_type] : []);
    box.innerHTML = `<form id="edf" class="stack"><b>Edit manual</b>
      <div class="row" style="gap:10px;align-items:flex-end"><label style="flex:1 1 260px">Title<input name="title" required value="${esc(m.title)}"></label>
        <label>Type<select name="doc_type">${types.map((t) => `<option ${t === m.doc_type ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
        <label>Manual no.<input name="manual_no" value="${esc(m.manual_no || '')}"></label></div>
      <div class="row" style="gap:10px;align-items:flex-end"><label style="flex:1 1 260px">Link (optional)<input name="url" value="${esc(m.url || '')}" placeholder="https://"></label>
        ${m.storage_path ? '' : `<label>Status<select name="status">${Object.entries(MAN_STATUS).map(([k, v]) => `<option value="${k}" ${k === m.status ? 'selected' : ''}>${v}</option>`).join('')}</select></label>`}</div>
      <label>Notes<textarea name="notes" rows="2">${esc(m.notes || '')}</textarea></label>
      <div class="row"><button class="btn primary" type="submit">Save changes</button><button type="button" class="btn" id="edcancel">Cancel</button></div></form>`;
    box.scrollIntoView({ block: 'nearest' });
    $('#edcancel', box).addEventListener('click', () => { box.hidden = true; });
    $('#edf', box).addEventListener('submit', (e) => {
      e.preventDefault(); const f = formData(e.target);
      const upd = { title: f.title.trim(), doc_type: f.doc_type, manual_no: (f.manual_no || '').trim(), url: (f.url || '').trim(), notes: f.notes || '', updated_at: new Date().toISOString() };
      if (f.status) upd.status = f.status;
      busy($('button[type="submit"]', e.target), async () => { await q(sb.from('asset_manuals').update(upd).eq('id', m.id)); toast('Manual updated'); render(); });
    });
  }));
  $$('[data-delman]').forEach((b) => b.addEventListener('click', () => {
    const m = mans.find((x) => x.id === b.dataset.delman);
    if (!confirm(`Delete "${m.title}"?${m.storage_path ? ' The uploaded PDF will be deleted too.' : ''}\n\nIf this manual is shared with other machines, it is removed from them as well. This cannot be undone.`)) return;
    busy(b, async () => {
      if (m.storage_path) { const { error } = await sb.storage.from(MANUAL_BUCKET).remove([m.storage_path]); if (error) throw error; }
      await q(sb.from('asset_manual_links').delete().eq('manual_id', m.id));
      await q(sb.from('asset_manuals').delete().eq('id', m.id));
      toast('Manual deleted'); render();
    });
  }));
  $$('[data-up]').forEach((inp) => inp.addEventListener('change', () => {
    const file = inp.files[0]; if (!file) return;
    busy({ disabled: false, textContent: '' }, async () => { await uploadManual(inp.dataset.up, file); toast('PDF saved'); render(); });
  }));
  if ($('#addman')) {
    $('#addman').addEventListener('click', () => { $('#manf').hidden = !$('#manf').hidden; });
    $('#manf').addEventListener('submit', (e) => {
      e.preventDefault(); const f = formData(e.target); const file = e.target.file.files[0];
      busy($('button[type="submit"]', e.target), async () => {
        const rows = await q(sb.from('asset_manuals').insert({ asset_id: id, title: f.title, doc_type: f.doc_type, manual_no: f.manual_no || '', source: 'fuse_file', status: file ? 'on_file' : 'not_searched' }).select());
        if (file) await uploadManual(rows[0].id, file);
        toast('Manual added'); render();
      });
    });
  }
  $('#cpy').addEventListener('click', async () => { try { await navigator.clipboard.writeText(link); toast('Link copied'); } catch (e) { toast('Copy failed – select the link and copy it', true); } });
  $('#prt').addEventListener('click', () => printLabel(a));
  $('#stf').addEventListener('submit', (e) => {
    e.preventDefault(); const f = formData(e.target);
    busy($('button', e.target), async () => {
      await q(sb.rpc('set_asset_status', { p_asset: id, p_status: f.status, p_note: f.note, p_by: f.by }));
      toast('Status saved'); render();
    });
  });
  $('#lgf').addEventListener('submit', (e) => {
    e.preventDefault(); const f = formData(e.target);
    busy($('button', e.target), async () => {
      await q(sb.from('maintenance_logs').insert({ asset_id: id, kind: f.kind, title: f.title, notes: f.notes, done_by: f.done_by, done_on: f.done_on }));
      toast('Added to history'); render();
    });
  });
  $('#exp').addEventListener('click', () => {
    csvDownload(`${id}-history.csv`, [['When', 'Type', 'By', 'Details'], ...hist.map((h) => {
      const d = document.createElement('div'); d.innerHTML = h.html;
      return [fmtTime(h.at), h.type, h.who, d.textContent.replace(/\s+/g, ' ').trim()];
    })]);
  });
  $$('[data-correct]').forEach((b) => b.addEventListener('click', () => {
    const [type, rid] = b.dataset.correct.split(':');
    const slot = $(`[data-corr-slot="${b.dataset.correct}"]`);
    if (slot.innerHTML) { slot.innerHTML = ''; return; }
    slot.innerHTML = `<form class="stack" style="margin-top:8px;gap:8px"><label>What's wrong with this record, and what's correct?<textarea name="reason" rows="2" required></textarea></label>
      <div class="row"><input name="by" required placeholder="Your name" value="${esc(profile.display_name)}"><button class="btn sm dark" type="submit">Save correction</button></div>
      <span class="tiny muted">The original record stays as it is. The correction is added beside it.</span></form>`;
    $('form', slot).addEventListener('submit', (e) => {
      e.preventDefault(); const f = formData(e.target);
      busy($('button', e.target), async () => {
        await q(sb.from('corrections').insert({ target_type: type, target_id: rid, asset_id: id, reason: f.reason, corrected_by: f.by }));
        toast('Correction saved'); render();
      });
    });
  }));
});

function printLabel(a) {
  const area = document.getElementById('print-area');
  area.innerHTML = `<div style="width:3.5in;border:2px solid #000;border-radius:10px;padding:14px;font-family:Inter,sans-serif;display:flex;gap:14px;align-items:center">
    <div style="width:1.3in">${qrSvg(machineLink(a.id), 4)}</div>
    <div><div style="font-family:'Space Grotesk',sans-serif;font-size:26px;font-weight:700">${esc(a.id)}</div>
    <div style="font-size:13px;font-weight:600">${esc(a.name)}</div>
    <div style="font-size:11px;margin-top:6px">Scan or type the tag on the shop tablet to log maintenance.</div></div></div>`;
  window.print();
}

// ---------------------------------------------------------------- exceptions
route('/exceptions', async () => {
  app.innerHTML = officeShell('/exceptions', '<div class="loading">Loading…</div>');
  await loadCore();
  const qs = query();
  const f = { status: qs.get('status') ?? 'needs_review', kind: qs.get('kind') || '', dept: qs.get('dept') || '', freq: qs.get('freq') || '', days: Number(qs.get('days') || 30) };
  const since = new Date(Date.now() - f.days * 86400000).toISOString();
  let b = sb.from('v_exceptions').select('*').gte('occurred_at', since).order('occurred_at', { ascending: false });
  if (f.status) b = b.eq('review_status', f.status);
  if (f.kind) b = b.eq('kind', f.kind);
  if (f.dept) b = b.eq('department', f.dept);
  if (f.freq) b = b.eq('frequency', f.freq);
  const [rows, all] = await Promise.all([b, q(sb.from('v_exceptions').select('kind,review_status,asset_id,asset_name,department,detail').gte('occurred_at', since))]).then(([r, a]) => { if (r.error) throw r.error; return [r.data, a]; });
  const needs = all.filter((x) => x.review_status === 'needs_review');
  const repeat = {};
  all.filter((x) => x.review_status !== 'auto_closed').forEach((x) => { repeat[x.asset_id] = repeat[x.asset_id] || { id: x.asset_id, name: x.asset_name, dept: x.department, n: 0 }; repeat[x.asset_id].n++; });
  const repeats = Object.values(repeat).filter((r) => r.n >= 3).sort((a, b2) => b2.n - a.n);
  const reasons = {};
  all.filter((x) => x.kind === 'skipped').forEach((x) => { const k = (x.detail || '').split(':')[0]; reasons[k] = (reasons[k] || 0) + 1; });
  const skipTotal = Object.values(reasons).reduce((s, n) => s + n, 0);
  const sel = (name, opts, val, label) => `<label class="sr" for="f-${name}">${label}</label><select id="f-${name}" name="${name}">${opts.map(([v, t]) => `<option value="${v}" ${String(v) === String(val) ? 'selected' : ''}>${t}</option>`).join('')}</select>`;
  const body = `
  <div class="head"><div><h1>Exceptions</h1><p class="muted" style="margin:4px 0 0">Checks that were skipped, missed, or done with a failed item. Machine down and not-in-use skips close automatically; the rest need a supervisor's review.</p></div>
    <button class="btn" type="button" id="csv">Export CSV</button></div>
  <section class="grid g4">
    <div class="card tile"><span class="small muted">Needs review</span><span class="n t-warn">${needs.length}</span><span class="small muted">last ${f.days} days</span></div>
    <div class="card tile"><span class="small muted">Missed</span><span class="n t-bad">${all.filter((x) => x.kind === 'missed').length}</span><span class="small muted">period ended with nothing logged</span></div>
    <div class="card tile"><span class="small muted">Skipped</span><span class="n">${skipTotal}</span><span class="small muted">with a reason</span></div>
    <div class="card tile"><span class="small muted">Failed items</span><span class="n">${all.filter((x) => x.kind === 'failed').length}</span><span class="small muted">check done, something answered No</span></div>
  </section>
  <form id="ef" class="row">
    ${sel('status', [['needs_review', 'Needs review'], ['', 'Any review status'], ['reviewed', 'Reviewed'], ['auto_closed', 'Auto-closed']], f.status, 'Review status')}
    ${sel('kind', [['', 'All types'], ['missed', 'Missed'], ['skipped', 'Skipped'], ['failed', 'Failed item']], f.kind, 'Type')}
    ${sel('dept', [['', 'All departments'], ...core.depts.map((d) => [d, d])], f.dept, 'Department')}
    ${sel('freq', [['', 'All frequencies'], ...FREQ_ORDER.map((x) => [x, FREQ[x]])], f.freq, 'Frequency')}
    ${sel('days', [[7, 'Last 7 days'], [30, 'Last 30 days'], [90, 'Last 90 days'], [180, 'Last 180 days']], f.days, 'Period')}
  </form>
  <section class="card flush"><div class="tablewrap"><table><thead><tr><th>Period</th><th>Machine</th><th>Check</th><th>Type</th><th>Details</th><th>By</th><th>Status</th><th></th></tr></thead><tbody>
  ${rows.map((x, i) => `<tr><td style="white-space:nowrap">${fmtShort(x.period_start)}${x.frequency !== 'daily' ? `<div class="tiny muted">${FREQ[x.frequency]}</div>` : ''}</td>
    <td><a class="tag" href="#/machine/${encodeURIComponent(x.asset_id)}" style="text-decoration:none">${esc(x.asset_id)}</a><div class="tiny muted">${esc(x.department || '')}</div></td>
    <td>${esc(x.title)}</td><td>${chip(KIND[x.kind], KIND_CHIP[x.kind])}</td>
    <td style="max-width:300px">${esc(x.detail || '')}${x.review_note ? `<div class="small" style="margin-top:6px"><b>${esc(ACTIONS[x.review_action])}</b> by ${esc(x.reviewed_by)} · ${fmtShort(x.reviewed_at)}: ${esc(x.review_note)}</div>` : ''}</td>
    <td class="small">${esc(x.by_name || '—')}</td><td>${chip(REVIEW[x.review_status], REVIEW_CHIP[x.review_status])}</td>
    <td>${x.review_status === 'needs_review' && isSup() ? `<button class="btn sm" type="button" data-rev="${i}">Review</button>` : ''}</td></tr>
    <tr data-rev-row="${i}" hidden><td colspan="8" style="background:var(--accent-soft)"></td></tr>`).join('') || '<tr><td colspan="8" class="muted" style="padding:28px;text-align:center">No exceptions match these filters.</td></tr>'}
  </tbody></table></div></section>
  <div class="grid g2">
    <section class="card"><h2>Why checks get skipped</h2>${Object.entries(reasons).sort((a2, b2) => b2[1] - a2[1]).map(([k, n]) => `<div class="stack" style="gap:6px;margin-bottom:12px"><div class="row small" style="justify-content:space-between"><b>${esc(k)}</b><span class="muted">${n}</span></div><div class="bar"><div style="width:${Math.round(n / skipTotal * 100)}%"></div></div></div>`).join('') || '<p class="muted">No skips in this period.</p>'}</section>
    <section class="card"><h2>Repeat exceptions</h2><p class="small muted" style="margin-top:0">Machines with 3 or more exceptions in the period (not counting auto-closed).</p>
      ${repeats.map((r) => `<a class="list-item" href="#/machine/${encodeURIComponent(r.id)}" style="text-decoration:none;color:inherit"><div style="flex:1"><b>${esc(r.id)}</b> · ${esc(r.name)}<div class="small muted">${esc(r.dept || '')}</div></div><span class="tile"><span class="n t-warn" style="font-size:24px">${r.n}×</span></span></a>`).join('') || '<p class="muted">None.</p>'}</section>
  </div>`;
  app.innerHTML = officeShell('/exceptions', body, needs.length);
  $$('#ef select').forEach((s) => s.addEventListener('change', () => {
    const p = new URLSearchParams(formData($('#ef')));
    location.hash = '#/exceptions?' + p;
  }));
  $('#csv').addEventListener('click', () => csvDownload('exceptions.csv', [['Period start', 'Frequency', 'Machine', 'Department', 'Checklist', 'Type', 'Details', 'By', 'Review status', 'Review action', 'Review note', 'Reviewed by', 'Reviewed at'],
    ...rows.map((x) => [x.period_start, FREQ[x.frequency], x.asset_id, x.department, x.title, KIND[x.kind], x.detail, x.by_name, REVIEW[x.review_status], ACTIONS[x.review_action] || '', x.review_note || '', x.reviewed_by || '', x.reviewed_at ? fmtTime(x.reviewed_at) : ''])]));
  $$('[data-rev]').forEach((btn) => btn.addEventListener('click', () => {
    const i = btn.dataset.rev, x = rows[i];
    const tr = $(`[data-rev-row="${i}"]`);
    tr.hidden = !tr.hidden;
    const cell = $('td', tr);
    cell.innerHTML = `<form class="row" style="align-items:flex-end">
      <label>Action<select name="action">${Object.entries(ACTIONS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
      <label style="flex:1 1 300px">Note (required)<input name="note" required placeholder="What was done about it?"></label>
      <label>Reviewed by<input name="by" required value="${esc(profile.display_name)}"></label>
      <button class="btn dark" type="submit">Save review</button></form>`;
    $('form', cell).addEventListener('submit', (e) => {
      e.preventDefault(); const f2 = formData(e.target);
      busy($('button', e.target), async () => {
        await q(sb.from('exception_reviews').insert({ exception_key: x.exception_key, action: f2.action, note: f2.note, reviewed_by: f2.by }));
        toast('Review saved'); render();
      });
    });
  }));
});



// ---------------------------------------------------------------- manual pages
const MANUAL_BUCKET = 'manuals';
let manualPageRows = null;
async function loadManualPages(force) {
  if (!manualPageRows || force) manualPageRows = await q(sb.from('manual_pages').select('*').order('manual_key').order('page'));
  return manualPageRows;
}
async function showManualPages(refs, heading) {
  const rows = await loadManualPages();
  const pages = refs.map((r) => rows.find((x) => x.manual_key === r.manual && x.page === r.page) || { manual_key: r.manual, page: r.page, manual_title: r.manual, label: '', storage_path: null });
  let i = 0;
  const dlg = document.createElement('dialog');
  dlg.className = 'mpdlg';
  dlg.setAttribute('aria-label', 'Manual page');
  document.body.appendChild(dlg);
  const urls = {};
  const draw = async () => {
    const pg = pages[i];
    dlg.innerHTML = `<div class="mphead"><div><b>${esc(pg.manual_title)}</b><div class="small muted">${esc(pg.label || '')} · PDF page ${pg.page}</div><div class="small muted">For: ${esc(heading || '')}</div></div><button type="button" class="btn" data-close>Close</button></div>
      <div class="mpbody">${pg.storage_path ? '<div class="loading">Loading page…</div>' : `<p class="notice">This page picture has not been uploaded yet. Find it in ${esc(pg.manual_title)}, PDF page ${pg.page}.</p>`}</div>
      <div class="mpfoot"><button type="button" class="btn" data-prev ${i === 0 ? 'disabled' : ''}>Previous</button><span class="small muted">Page ${i + 1} of ${pages.length} · tap the page to zoom</span><button type="button" class="btn" data-next ${i === pages.length - 1 ? 'disabled' : ''}>Next</button></div>`;
    $('[data-close]', dlg).addEventListener('click', () => dlg.close());
    $('[data-prev]', dlg).addEventListener('click', () => { i--; draw(); });
    $('[data-next]', dlg).addEventListener('click', () => { i++; draw(); });
    if (!pg.storage_path) return;
    const k = pg.storage_path;
    if (!urls[k]) {
      const { data, error } = await sb.storage.from(MANUAL_BUCKET).createSignedUrl(k, 3600);
      if (error) { $('.mpbody', dlg).innerHTML = `<p class="notice">${esc(errMsg(error))}</p>`; return; }
      urls[k] = data.signedUrl;
    }
    const body = $('.mpbody', dlg);
    body.innerHTML = `<img src="${urls[k]}" alt="${esc(pg.manual_title)}, page ${pg.page}">`;
    $('img', body).addEventListener('click', (e) => e.target.classList.toggle('zoom'));
  };
  dlg.addEventListener('close', () => dlg.remove());
  dlg.showModal();
  draw();
}

route('/manual-pages', async () => {
  app.innerHTML = officeShell('/manual-pages', '<div class="loading">Loading…</div>');
  await loadCore();
  const rows = await loadManualPages(true);
  const body = `
  <div class="head"><div><h1>Manual pages</h1><p class="muted" style="margin:4px 0 0">Pictures of the manual pages behind the checklist items. They show on the check screen under each item. Only signed-in people can see them.</p></div></div>
  <section class="card stack">
    <h2>Upload page pictures</h2>
    <p class="small muted" style="margin:0">Pick all the picture files at once. Each file name tells the site which page it is (for example <b>accurpress-ed5__p151.jpg</b>), so there is nothing to type.</p>
    <form id="mpf" class="row"><input type="file" name="files" accept="image/jpeg,image/png" multiple required><button class="btn primary" type="submit">Upload</button></form>
    <div id="mpres" class="stack small"></div>
  </section>
  <section class="card flush"><div class="tablewrap"><table><thead><tr><th>Manual</th><th>PDF page</th><th>What's on it</th><th>File name</th><th>Status</th></tr></thead><tbody>
  ${rows.map((r) => `<tr><td>${esc(r.manual_title)}</td><td>${r.page}</td><td class="small">${esc(r.label)}</td><td class="tiny muted">${esc(r.manual_key)}__p${String(r.page).padStart(3, '0')}.jpg</td><td>${r.storage_path ? chip('Uploaded', 'c-ok') : chip('Missing', 'c-warn')}</td></tr>`).join('')}
  </tbody></table></div></section>`;
  app.innerHTML = officeShell('/manual-pages', body);
  $('#mpf').addEventListener('submit', (e) => {
    e.preventDefault();
    const files = [...$('input[type=file]', e.target).files];
    busy($('button', e.target), async () => {
      const out = $('#mpres');
      out.innerHTML = '';
      let ok = 0;
      for (const f of files) {
        const m = /^(.+)__p0*(\d+)\.(jpe?g|png)$/i.exec(f.name);
        const row = m && rows.find((r) => r.manual_key === m[1] && r.page === Number(m[2]));
        const line = document.createElement('div');
        if (!row) { line.className = 't-bad'; line.textContent = `${f.name}: not a recognised page file name, skipped`; out.appendChild(line); continue; }
        const ext = m[3].toLowerCase() === 'png' ? 'png' : 'jpg';
        const path = `pages/${row.manual_key}__p${String(row.page).padStart(3, '0')}.${ext}`;
        const { error } = await sb.storage.from(MANUAL_BUCKET).upload(path, f, { upsert: true, contentType: ext === 'png' ? 'image/png' : 'image/jpeg' });
        if (error) { line.className = 't-bad'; line.textContent = `${f.name}: ${errMsg(error)}`; out.appendChild(line); continue; }
        const { error: e2 } = await sb.from('manual_pages').update({ storage_path: path, uploaded_at: new Date().toISOString() }).eq('manual_key', row.manual_key).eq('page', row.page);
        if (e2) { line.className = 't-bad'; line.textContent = `${f.name}: ${errMsg(e2)}`; out.appendChild(line); continue; }
        ok++;
        line.className = 't-ok'; line.textContent = `${f.name}: uploaded`; out.appendChild(line);
      }
      toast(`${ok} of ${files.length} uploaded`, ok < files.length);
      manualPageRows = null;
      if (ok) setTimeout(() => render(), 1500);
    });
  });
}, { sup: true });

// ---------------------------------------------------------------- reports
route('/reports', async () => {
  app.innerHTML = officeShell('/reports', '<div class="loading">Loading…</div>');
  await loadCore();
  const qs = query();
  const today = shopToday();
  const monthAgo = new Date(Date.now() - 30 * 86400000).toLocaleDateString('en-CA');
  const f = { from: qs.get('from') || monthAgo, to: qs.get('to') || today, dept: qs.get('dept') || '', asset: qs.get('asset') || '', freq: qs.get('freq') || '', group: qs.get('group') || '', result: qs.get('result') || '' };
  const LIMIT = 5000;
  let b = sb.from('inspections').select('id,checklist_id,asset_id,frequency,revision,period_start,performed_by,performed_at,result,notes')
    .gte('performed_at', f.from + 'T00:00:00').lte('performed_at', f.to + 'T23:59:59.999')
    .order('performed_at', { ascending: false }).limit(LIMIT);
  if (f.freq) b = b.eq('frequency', f.freq);
  if (f.asset) b = b.eq('asset_id', f.asset);
  if (f.result) b = b.eq('result', f.result);
  const [r, cls] = await Promise.all([b, q(sb.from('checklists').select('id,doc_id,title,assigned_group'))]);
  if (r.error) throw r.error;
  const clById = {}; cls.forEach((c) => { clById[c.id] = c; });
  let rows = r.data.map((x) => ({ ...x, a: core.assetById[x.asset_id] || {}, c: clById[x.checklist_id] || {} }));
  if (f.dept) rows = rows.filter((x) => x.a.department === f.dept || (x.a.shared || []).includes(f.dept));
  if (f.group) rows = rows.filter((x) => x.c.assigned_group === f.group);
  const fails = rows.filter((x) => x.result === 'fail').length;
  const people = {}; rows.forEach((x) => { people[x.performed_by] = (people[x.performed_by] || 0) + 1; });
  const machines = new Set(rows.map((x) => x.asset_id)).size;
  const sel = (name, opts, val, label) => `<label class="sr" for="r-${name}">${label}</label><select id="r-${name}" name="${name}">${opts.map(([v, t]) => `<option value="${esc(v)}" ${String(v) === String(val) ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
  const body = `
  <div class="head"><div><h1>Reports</h1><p class="muted" style="margin:4px 0 0">Every completed check: what was done, when, and by whom. Skipped and missed checks are on the Exceptions page.</p></div>
    <button class="btn" type="button" id="csv">Export CSV</button></div>
  <section class="grid g4">
    <div class="card tile"><span class="small muted">Checks completed</span><span class="n">${rows.length}</span><span class="small muted">${fmtShort(f.from)} to ${fmtShort(f.to)}</span></div>
    <div class="card tile"><span class="small muted">Machines covered</span><span class="n">${machines}</span></div>
    <div class="card tile"><span class="small muted">With a failed item</span><span class="n ${fails ? 't-bad' : ''}">${fails}</span></div>
    <div class="card tile"><span class="small muted">People</span><span class="n">${Object.keys(people).length}</span></div>
  </section>
  <form id="rf" class="row">
    <label>From<input type="date" name="from" value="${f.from}"></label>
    <label>To<input type="date" name="to" value="${f.to}"></label>
    ${sel('dept', [['', 'All departments'], ...core.depts.map((d) => [d, d])], f.dept, 'Department')}
    ${sel('asset', [['', 'All machines'], ...core.assets.map((a) => [a.id, a.id + ' · ' + a.name])], f.asset, 'Machine')}
    ${sel('freq', [['', 'All frequencies'], ...FREQ_ORDER.map((x) => [x, FREQ[x]])], f.freq, 'Frequency')}
    ${sel('group', [['', 'Floor and maintenance'], ['floor', 'Floor'], ['maintenance', 'Maintenance']], f.group, 'Done by group')}
    ${sel('result', [['', 'Any result'], ['pass', 'Pass'], ['fail', 'Failed item']], f.result, 'Result')}
  </form>
  ${r.data.length >= LIMIT ? `<p class="notice">Showing the most recent ${LIMIT} records. Narrow the dates to see the rest.</p>` : ''}
  <section class="card flush"><div class="tablewrap"><table><thead><tr><th>Done</th><th>Machine</th><th>Check</th><th>Frequency</th><th>By</th><th>Result</th><th>Notes</th></tr></thead><tbody>
  ${rows.map((x) => `<tr><td style="white-space:nowrap">${esc(fmtTime(x.performed_at))}</td>
    <td><a class="tag" href="#/machine/${encodeURIComponent(x.asset_id)}" style="text-decoration:none">${esc(x.asset_id)}</a><div class="tiny muted">${esc(x.a.name || '')}</div></td>
    <td>${esc(x.c.title || '')}<div class="tiny muted">${esc(x.c.doc_id || '')} · rev ${esc(x.revision ?? '')}</div></td>
    <td>${esc(FREQ[x.frequency] || x.frequency)}</td><td class="small">${esc(x.performed_by)}</td>
    <td>${chip(x.result === 'fail' ? 'Failed item' : 'Pass', x.result === 'fail' ? 'c-bad' : 'c-ok')}</td>
    <td class="small" style="max-width:260px">${esc(x.notes || '')}</td></tr>`).join('') || '<tr><td colspan="7" class="muted" style="padding:28px;text-align:center">No completed checks match these filters.</td></tr>'}
  </tbody></table></div></section>`;
  app.innerHTML = officeShell('/reports', body);
  $$('#rf select, #rf input').forEach((s) => s.addEventListener('change', () => {
    location.hash = '#/reports?' + new URLSearchParams(formData($('#rf')));
  }));
  $('#csv').addEventListener('click', () => csvDownload(`completed-checks-${f.from}-to-${f.to}.csv`, [['Done at', 'Machine ID', 'Machine', 'Department', 'Checklist', 'Document', 'Revision', 'Frequency', 'Done by group', 'Done by', 'Period start', 'Result', 'Notes'],
    ...rows.map((x) => [fmtTime(x.performed_at), x.asset_id, x.a.name || '', x.a.department || '', x.c.title || '', x.c.doc_id || '', x.revision ?? '', FREQ[x.frequency] || x.frequency, x.c.assigned_group || '', x.performed_by, x.period_start, x.result === 'fail' ? 'Failed item' : 'Pass', x.notes || ''])]));
}, { sup: true });

// ---------------------------------------------------------------- admin
route('/admin(?:/(people|checklists|machines|holidays|logins))?', async (tab) => {
  tab = tab || 'checklists';
  app.innerHTML = officeShell('/admin', '<div class="loading">Loading…</div>');
  await loadCore();
  const tabs = [['checklists', 'Checklists'], ['machines', 'Machines'], ['people', 'People'], ['holidays', 'Holidays']].concat(isAdmin() ? [['logins', 'Logins']] : []);
  let content = '';
  if (tab === 'checklists') {
    const cls = await q(sb.from('checklists').select('*, checklist_items(count)').order('asset_id'));
    const withList = new Set(cls.map((c) => c.asset_id));
    content = `<div class="row" style="justify-content:space-between"><p class="muted" style="margin:0">${cls.length} checklists. ${activeAssets().filter((a) => !withList.has(a.id)).length} machines have none yet.</p><a class="btn primary" href="#/admin/checklist/new">+ New checklist</a></div>
    <section class="card flush"><div class="tablewrap"><table><thead><tr><th>Machine</th><th>Frequency</th><th>Checklist</th><th>Revision</th><th>Approved</th><th></th></tr></thead><tbody>
    ${cls.map((c) => `<tr><td class="tag">${esc(c.asset_id)}<div class="tiny muted" style="font-family:Inter;font-weight:400">${esc(core.assetById[c.asset_id] ? core.assetById[c.asset_id].name : '')}</div></td><td>${FREQ[c.frequency]}</td>
      <td>${esc(c.title)}<div class="tiny muted">${esc(c.doc_id)} · ${c.checklist_items[0] ? c.checklist_items[0].count : 0} items${c.active ? '' : ' · inactive'}</div></td><td>Rev ${c.revision}<div class="tiny muted">${fmtShort(c.effective_date)}</div></td>
      <td>${c.approved_by ? esc(c.approved_by) : '<span class="t-bad" style="font-weight:600">Not approved</span>'}</td><td><a class="btn sm" href="#/admin/checklist/${c.id}">Edit</a></td></tr>`).join('') || '<tr><td colspan="6" class="muted">None yet.</td></tr>'}
    </tbody></table></div></section>`;
  } else if (tab === 'machines') {
    content = `<div class="row" style="justify-content:space-between"><p class="muted" style="margin:0">${core.assets.length} machines (${core.assets.filter((a) => a.needs_review).length} flagged needs review).</p><a class="btn primary" href="#/admin/asset/new">+ Add machine</a></div>
    <section class="card flush"><div class="tablewrap"><table><thead><tr><th>Tag</th><th>Name</th><th>Department</th><th>Also used by</th><th>Status</th><th></th></tr></thead><tbody>
    ${core.assets.map((a) => `<tr><td class="tag">${esc(a.id)}</td><td>${esc(a.name)}${a.needs_review ? ' ' + chip('Needs review', 'c-acc') : ''}</td><td>${esc(a.department || '—')}</td><td class="small">${esc(a.shared.join(', '))}</td><td>${statusChip(a.status)}</td><td><a class="btn sm" href="#/admin/asset/${encodeURIComponent(a.id)}">Edit</a></td></tr>`).join('')}
    </tbody></table></div></section>`;
  } else if (tab === 'people') {
    const people = await q(sb.from('people').select('*').order('name'));
    content = `<section class="card"><h2>Add a person</h2><form id="pf" class="row" style="align-items:flex-end">
      <label>Employee #<input name="employee_number" required autocapitalize="off" style="max-width:120px"></label>
      <label style="flex:1 1 220px">Full name<input name="name" required></label>
      <label>Department<select name="department"><option value="">—</option>${core.depts.map((d) => `<option>${esc(d)}</option>`).join('')}</select></label>
      <label>Role<input name="role_label" value="Operator"></label><button class="btn primary" type="submit">Add</button></form></section>
    <section class="card flush"><div class="tablewrap"><table><thead><tr><th>Employee #</th><th>Name</th><th>Department</th><th>Role</th><th>Status</th><th></th></tr></thead><tbody>
    ${people.map((p) => `<tr><td><input data-pnum="${p.id}" value="${esc(p.employee_number || '')}" aria-label="Employee number for ${esc(p.name)}" style="max-width:110px"></td><td style="font-weight:600">${esc(p.name)}</td>
      <td><select data-pdept="${p.id}" aria-label="Department for ${esc(p.name)}"><option value="">—</option>${core.depts.map((d) => `<option ${d === p.department ? 'selected' : ''}>${esc(d)}</option>`).join('')}</select></td>
      <td>${esc(p.role_label)}</td>
      <td>${!p.confirmed ? chip('Added on a tablet – confirm', 'c-acc') : p.active ? chip('Active', 'c-ok') : chip('Inactive', 'c-grey')}</td>
      <td class="row" style="gap:6px">${!p.confirmed ? `<button class="btn sm" data-pconf="${p.id}">Confirm</button>` : ''}<button class="btn sm" data-pact="${p.id}" data-on="${p.active ? 0 : 1}">${p.active ? 'Deactivate' : 'Activate'}</button></td></tr>`).join('') || '<tr><td colspan="6" class="muted">No people yet. Add each employee with their employee number. Deactivate (never delete) anyone who leaves: they cannot sign in, and their history stays.</td></tr>'}
    </tbody></table></div></section>`;
  } else if (tab === 'holidays') {
    const hol = await q(sb.from('holidays').select('*').order('day', { ascending: false }));
    content = `<section class="card"><h2>Shop holidays</h2><p class="small muted">Daily checks aren't due on weekends or these days, so they won't show up as missed.</p>
      <form id="hf" class="row" style="align-items:flex-end"><label>Date<input type="date" name="day" required></label><label style="flex:1 1 220px">Name<input name="name" required placeholder="e.g. Thanksgiving"></label><button class="btn primary" type="submit">Add</button></form></section>
    <section class="card flush"><div class="tablewrap"><table><thead><tr><th>Date</th><th>Holiday</th><th></th></tr></thead><tbody>
    ${hol.map((h) => `<tr><td>${fmtDate(h.day)}</td><td>${esc(h.name)}</td><td><button class="btn sm danger" data-hdel="${h.day}">Remove</button></td></tr>`).join('') || '<tr><td colspan="3" class="muted">None yet.</td></tr>'}</tbody></table></div></section>`;
  } else if (tab === 'logins') {
    const profs = await q(sb.from('profiles').select('*').order('created_at'));
    const ppl = await q(sb.from('people').select('name,employee_number,active'));
    const byNum = {}; ppl.forEach((x) => { if (x.employee_number) byNum[x.employee_number.toLowerCase()] = x; });
    content = `<section class="card"><p class="small muted" style="margin-top:0">Create each login in Supabase (Authentication → Users → Add user) with the email <b>employee number@fuse.example.com</b> (for example 1042@fuse.example.com) and a password. It shows up here after the first sign-in. Add the same employee number on the People tab with the person's name; that name is recorded on everything they log. Set the role here (tablet logins can only use the tablet screens). To stop someone signing in, deactivate them on People.</p></section>
    <section class="card flush"><div class="tablewrap"><table><thead><tr><th>Login</th><th>Display name</th><th>Role</th><th></th></tr></thead><tbody>
    ${profs.map((p) => `<tr><td class="small">${p.user_id === session.user.id ? esc(session.user.email) + ' (you)' : '<b>' + esc(p.login_id || '—') + '</b>'}${p.user_id === session.user.id ? '' : ''}</td>
      <td>${esc((byNum[String(p.login_id || '').toLowerCase()] || {}).name || '— no matching employee number in People —')}<input type="hidden" data-pname="${p.user_id}" value="${esc(p.display_name)}"></td>
      <td><select data-prole="${p.user_id}" aria-label="Role">${['tablet', 'supervisor', 'admin'].map((r) => `<option ${r === p.role ? 'selected' : ''}>${r}</option>`).join('')}</select></td>
      <td><button class="btn sm" data-psave="${p.user_id}">Save</button></td></tr>`).join('')}</tbody></table></div></section>`;
  }
  app.innerHTML = officeShell('/admin', `<div class="head"><h1>Admin</h1></div>
    <div class="row" role="tablist">${tabs.map(([k, t]) => `<a role="tab" aria-selected="${k === tab}" class="pill" aria-pressed="${k === tab}" href="#/admin/${k}" style="display:inline-flex;align-items:center">${t}</a>`).join('')}</div>${content}`, await exceptionBadge());

  if (tab === 'people') {
    $('#pf').addEventListener('submit', (e) => {
      e.preventDefault(); const f = formData(e.target);
      busy($('button', e.target), async () => { await q(sb.from('people').insert({ employee_number: f.employee_number.trim(), name: f.name, department: f.department || null, role_label: f.role_label || 'Operator', confirmed: true })); toast('Added'); render(); });
    });
    $$('[data-pdept]').forEach((s) => s.addEventListener('change', async () => { try { await q(sb.from('people').update({ department: s.value || null }).eq('id', s.dataset.pdept)); toast('Saved'); } catch (e) { toast(errMsg(e), true); } }));
    $$('[data-pnum]').forEach((i) => i.addEventListener('change', async () => { try { await q(sb.from('people').update({ employee_number: i.value.trim() || null }).eq('id', i.dataset.pnum)); toast('Saved'); } catch (e) { toast(errMsg(e), true); } }));
    $$('[data-pconf]').forEach((b) => b.addEventListener('click', () => busy(b, async () => { await q(sb.from('people').update({ confirmed: true }).eq('id', b.dataset.pconf)); render(); })));
    $$('[data-pact]').forEach((b) => b.addEventListener('click', () => busy(b, async () => { await q(sb.from('people').update({ active: b.dataset.on === '1', confirmed: true }).eq('id', b.dataset.pact)); render(); })));
  }
  if (tab === 'holidays') {
    $('#hf').addEventListener('submit', (e) => {
      e.preventDefault(); const f = formData(e.target);
      busy($('button', e.target), async () => { await q(sb.from('holidays').upsert({ day: f.day, name: f.name })); toast('Added'); render(); });
    });
    $$('[data-hdel]').forEach((b) => b.addEventListener('click', () => busy(b, async () => { await q(sb.from('holidays').delete().eq('day', b.dataset.hdel)); render(); })));
  }
  if (tab === 'logins') {
    $$('[data-psave]').forEach((b) => b.addEventListener('click', () => busy(b, async () => {
      const uid = b.dataset.psave;
      await q(sb.from('profiles').update({ role: $(`[data-prole="${uid}"]`).value, display_name: $(`[data-pname="${uid}"]`).value.trim() }).eq('user_id', uid));
      if (uid === session.user.id) profile = null;
      toast('Saved');
    })));
  }
}, { sup: true });

// ---------------------------------------------------------------- checklist editor
route('/admin/checklist/(new|[0-9a-f-]{36})', async (cid) => {
  app.innerHTML = officeShell('/admin', '<div class="loading">Loading…</div>');
  await loadCore();
  const isNew = cid === 'new';
  let c = { asset_id: query().get('asset') || '', frequency: 'daily', title: '', doc_id: '', revision: 0, est_minutes: '', active: true, approved_by: '' };
  let items = [{ area: '', prompt: '', criteria: '' }];
  if (!isNew) {
    c = (await q(sb.from('checklists').select('*').eq('id', cid)))[0];
    if (!c) throw new Error('Checklist not found');
    items = await q(sb.from('checklist_items').select('*').eq('checklist_id', cid).order('seq'));
  }
  const draw = () => {
    $('#items').innerHTML = items.map((it, i) => `<div class="qitem" style="gap:8px"><div class="row" style="justify-content:space-between"><b>Item ${i + 1}</b>
      <div class="row" style="gap:6px"><button type="button" class="btn sm" data-up="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Move item ${i + 1} up">↑</button><button type="button" class="btn sm" data-down="${i}" ${i === items.length - 1 ? 'disabled' : ''} aria-label="Move item ${i + 1} down">↓</button><button type="button" class="btn sm danger" data-del="${i}" aria-label="Remove item ${i + 1}">Remove</button></div></div>
      <div class="grid" style="grid-template-columns:minmax(0,1fr) minmax(0,3fr) minmax(0,1.3fr);gap:10px">
      <label>Area<input data-f="area" data-i="${i}" value="${esc(it.area)}" placeholder="e.g. Chiller"></label>
      <label>Check<input data-f="prompt" data-i="${i}" value="${esc(it.prompt)}" required></label>
      <label>Pass if<input data-f="criteria" data-i="${i}" value="${esc(it.criteria)}" placeholder="e.g. Above 100 psi"></label></div>
      <div class="grid" style="grid-template-columns:minmax(0,1.2fr) repeat(3,minmax(0,1fr));gap:10px">
      <label>Answer type<select data-f="input_type" data-i="${i}"><option value="yesno" ${it.input_type !== 'number' ? 'selected' : ''}>Yes / No</option><option value="number" ${it.input_type === 'number' ? 'selected' : ''}>Number (type a reading)</option></select></label>
      ${it.input_type === 'number' ? `<label>Lowest OK<input type="number" step="any" data-f="min_value" data-i="${i}" value="${esc(it.min_value ?? '')}" placeholder="optional"></label>
      <label>Highest OK<input type="number" step="any" data-f="max_value" data-i="${i}" value="${esc(it.max_value ?? '')}" placeholder="optional"></label>
      <label>Unit<input data-f="unit" data-i="${i}" value="${esc(it.unit || '')}" placeholder="e.g. psi"></label>` : `<label>Passing answer<select data-f="pass_answer" data-i="${i}"><option value="yes" ${it.pass_answer !== 'no' ? 'selected' : ''}>Yes passes</option><option value="no" ${it.pass_answer === 'no' ? 'selected' : ''}>No passes</option></select></label>`}</div></div>`).join('');
    $$('#items [data-f]').forEach((inp) => inp.addEventListener('input', () => { items[inp.dataset.i][inp.dataset.f] = inp.value; }));
    $$('#items select[data-f="input_type"]').forEach((sel2) => sel2.addEventListener('change', () => { draw(); }));
    $$('#items [data-del]').forEach((b) => b.addEventListener('click', () => { items.splice(+b.dataset.del, 1); if (!items.length) items.push({ area: '', prompt: '', criteria: '' }); draw(); }));
    $$('#items [data-up]').forEach((b) => b.addEventListener('click', () => { const i = +b.dataset.up; [items[i - 1], items[i]] = [items[i], items[i - 1]]; draw(); }));
    $$('#items [data-down]').forEach((b) => b.addEventListener('click', () => { const i = +b.dataset.down; [items[i + 1], items[i]] = [items[i], items[i + 1]]; draw(); }));
  };
  app.innerHTML = officeShell('/admin', `<a href="#/admin/checklists" style="font-weight:600;text-decoration:none">← Checklists</a>
  <div class="head"><div><h1>${isNew ? 'New checklist' : 'Edit checklist'}</h1>${isNew ? '' : `<p class="muted" style="margin:4px 0 0">Currently Rev ${c.revision}, effective ${fmtDate(c.effective_date)}. Saving creates Rev ${c.revision + 1}; past records keep the wording they were answered against.</p>`}</div></div>
  <form id="clf" class="stack" style="gap:18px">
    <section class="card grid g3">
      <label>Machine<select name="asset_id" required ${isNew ? '' : 'disabled'}><option value="">Pick a machine</option>${core.assets.map((a) => `<option value="${esc(a.id)}" ${a.id === c.asset_id ? 'selected' : ''}>${esc(a.id)} – ${esc(a.name)}</option>`).join('')}</select></label>
      <label>Frequency<select name="frequency">${FREQ_ORDER.map((f) => `<option value="${f}" ${f === c.frequency ? 'selected' : ''}>${FREQ[f]}</option>`).join('')}</select></label>
      <label>Title<input name="title" required value="${esc(c.title)}" placeholder="e.g. Daily pre-shift check"></label>
      <label>Document ID<input name="doc_id" value="${esc(c.doc_id)}" placeholder="e.g. CL-PB-001-D"></label>
      <label>Minutes (about)<input name="est_minutes" type="number" min="1" value="${esc(c.est_minutes ?? '')}"></label>
      <label style="flex-direction:row;align-items:center;gap:10px;margin-top:24px"><input type="checkbox" name="active" ${c.active ? 'checked' : ''} style="width:22px;height:22px"> Active (shows on the shop floor)</label>
    </section>
    <section class="stack"><h2>Items</h2><div id="items" class="stack"></div><button type="button" class="btn" id="add" style="align-self:flex-start">+ Add item</button></section>
    <section class="card grid g2">
      <label>What changed and why${isNew ? '' : ' (required)'}<input name="change_note" ${isNew ? '' : 'required'} placeholder="${isNew ? 'First issue' : 'e.g. Added chiller temperature check'}"></label>
      <label>Approved by<input name="approved_by" value="" placeholder="Leave blank to save as a draft"></label>
      <p class="small muted" style="grid-column:1/-1;margin:0">ISO 9001: a checklist without an approver shows as "Not approved". Each save is kept as a revision with today's date.</p>
    </section>
    <div class="row"><button class="btn primary" type="submit">Save ${isNew ? 'checklist' : 'as Rev ' + (c.revision + 1)}</button><a class="btn" href="#/admin/checklists">Cancel</a></div>
  </form>`, await exceptionBadge());
  draw();
  $('#add').addEventListener('click', () => { items.push({ area: '', prompt: '', criteria: '' }); draw(); const ins = $$('#items [data-f="prompt"]'); ins[ins.length - 1].focus(); });
  $('#clf').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = formData(e.target);
    const clean = items.map((it) => {
      const num = it.input_type === 'number';
      const nv = (v) => (v === '' || v == null || !Number.isFinite(Number(v)) ? null : Number(v));
      return { area: (it.area || '').trim(), prompt: (it.prompt || '').trim(), criteria: (it.criteria || '').trim(), manual_refs: it.manual_refs || [], input_type: num ? 'number' : 'yesno', unit: num ? ((it.unit || '').trim() || null) : null, min_value: num ? nv(it.min_value) : null, max_value: num ? nv(it.max_value) : null, pass_answer: !num && it.pass_answer === 'no' ? 'no' : 'yes' };
    }).filter((it) => it.prompt);
    if (!clean.length) { toast('Add at least one item', true); return; }
    busy($('button[type=submit]', e.target), async () => {
      const rev = isNew ? 1 : c.revision + 1;
      const row = { frequency: f.frequency, title: f.title, doc_id: f.doc_id, est_minutes: f.est_minutes ? Number(f.est_minutes) : null, active: !!f.active, revision: rev, effective_date: shopToday(), approved_by: f.approved_by || '' };
      let id = cid;
      if (isNew) {
        row.asset_id = f.asset_id;
        id = (await q(sb.from('checklists').insert(row).select('id')))[0].id;
      } else {
        await q(sb.from('checklists').update(row).eq('id', cid));
        await q(sb.from('checklist_items').delete().eq('checklist_id', cid));
      }
      const withSeq = clean.map((it, i) => ({ ...it, seq: i + 1, checklist_id: id }));
      await q(sb.from('checklist_items').insert(withSeq));
      await q(sb.from('checklist_revisions').insert({ checklist_id: id, revision: rev, title: f.title, items: withSeq.map(({ checklist_id, ...x }) => x), change_note: f.change_note || 'First issue', approved_by: f.approved_by || '', effective_date: shopToday() }));
      toast(`Saved as Rev ${rev}`);
      location.hash = '#/machine/' + encodeURIComponent(isNew ? f.asset_id : c.asset_id);
    });
  });
}, { sup: true });

// ---------------------------------------------------------------- machine editor
route('/admin/asset/([^/?]+)', async (aid) => {
  app.innerHTML = officeShell('/admin', '<div class="loading">Loading…</div>');
  await loadCore();
  const isNew = aid === 'new';
  const a = isNew ? { id: '', name: '', department: '', shared: [], criticality: 'Medium', status: 'running' } : core.assetById[aid];
  if (!a) throw new Error('Machine not found');
  const tri = (name, v) => `<select name="${name}"><option value="" ${v == null ? 'selected' : ''}>—</option><option value="true" ${v === true ? 'selected' : ''}>Yes</option><option value="false" ${v === false ? 'selected' : ''}>No</option></select>`;
  const inp = (label, name, v, extra) => `<label>${label}<input name="${name}" value="${esc(v ?? '')}" ${extra || ''}></label>`;
  app.innerHTML = officeShell('/admin', `<a href="#/admin/machines" style="font-weight:600;text-decoration:none">← Machines</a>
  <h1>${isNew ? 'Add machine' : 'Edit ' + esc(a.id)}</h1>
  <form id="af" class="stack" style="gap:18px"><section class="card grid g3">
    ${inp('Fuse Asset ID', 'id', a.id, isNew ? 'required placeholder="FUSE-XXX-001" pattern="[A-Za-z0-9-]+"' : 'disabled')}
    ${inp('Name', 'name', a.name, 'required')}
    <label>Owner department<select name="department" required><option value="">Pick one</option>${core.depts.map((d) => `<option ${d === a.department ? 'selected' : ''}>${esc(d)}</option>`).join('')}</select></label>
    ${inp('CPA ID', 'cpa_id', a.cpa_id)}${inp('Type', 'asset_type', a.asset_type)}${inp('Location / bay', 'location', a.location)}
    ${inp('Manufacturer', 'manufacturer', a.manufacturer)}${inp('Model', 'model', a.model)}${inp('Serial number', 'serial', a.serial)}
    <label>Parent machine<select name="parent_id"><option value="">None</option>${core.assets.filter((x) => x.id !== a.id).map((x) => `<option value="${esc(x.id)}" ${x.id === a.parent_id ? 'selected' : ''}>${esc(x.id)}</option>`).join('')}</select></label>
    <label>Criticality<select name="criticality">${['High', 'Medium', 'Low'].map((x) => `<option ${x === a.criticality ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
    ${inp('In service', 'in_service', a.in_service)}
    <label>OSHA regulated${tri('osha', a.osha)}</label><label>Lockout/tagout required${tri('loto', a.loto)}</label><label>Certification required${tri('cert_required', a.cert_required)}</label>
  </section>
  <section class="card"><fieldset style="border:0;padding:0;margin:0"><legend style="font-weight:700;margin-bottom:10px">Also used by (shared machine)</legend>
    <div class="row">${core.depts.map((d) => `<label style="flex-direction:row;align-items:center;font-weight:500"><input type="checkbox" name="shared" value="${esc(d)}" ${a.shared.includes(d) ? 'checked' : ''} style="width:20px;height:20px"> ${esc(d)}</label>`).join('')}</div></fieldset></section>
  <section class="card stack">${isNew ? '' : `<label>Active / Inactive<select name="active"><option value="1" ${a.status !== 'retired' ? 'selected' : ''}>Active – checks come due</option><option value="0" ${a.status === 'retired' ? 'selected' : ''}>Inactive – keep the record, no checks due</option></select></label>`}<label>Notes<textarea name="notes" rows="3">${esc(a.notes || '')}</textarea></label>
    <label style="flex-direction:row;align-items:center;gap:10px;font-weight:500"><input type="checkbox" name="needs_review" ${a.needs_review ? 'checked' : ''} style="width:20px;height:20px"> Needs review (missing details)</label></section>
  <div class="row"><button class="btn primary" type="submit">Save</button><a class="btn" href="#/admin/machines">Cancel</a></div></form>`, await exceptionBadge());
  $('#af').addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const g = (k) => (fd.get(k) || '').toString().trim();
    const triV = (k) => (g(k) === '' ? null : g(k) === 'true');
    const id = isNew ? g('id').toUpperCase() : a.id;
    const row = { name: g('name'), department: g('department'), cpa_id: g('cpa_id') || null, asset_type: g('asset_type'), location: g('location'), manufacturer: g('manufacturer'), model: g('model'), serial: g('serial'), parent_id: g('parent_id') || null, criticality: g('criticality'), in_service: g('in_service'), osha: triV('osha'), loto: triV('loto'), cert_required: triV('cert_required'), notes: g('notes'), needs_review: fd.get('needs_review') === 'on' };
    const shared = fd.getAll('shared').filter((d) => d !== row.department);
    busy($('button[type=submit]', e.target), async () => {
      if (isNew) await q(sb.from('assets').insert({ id, ...row }));
      else await q(sb.from('assets').update(row).eq('id', id));
      if (!isNew) {
        const wantInactive = g('active') === '0', isInactive = a.status === 'retired';
        if (wantInactive !== isInactive) await q(sb.rpc('set_asset_status', { p_asset: id, p_status: wantInactive ? 'retired' : 'running', p_note: wantInactive ? 'Marked inactive in the machine editor' : 'Marked active in the machine editor', p_by: profile.display_name }));
      }
      await q(sb.from('asset_departments').delete().eq('asset_id', id));
      if (shared.length) await q(sb.from('asset_departments').insert(shared.map((d) => ({ asset_id: id, department: d }))));
      toast('Saved');
      location.hash = '#/machine/' + encodeURIComponent(id);
    });
  });
}, { sup: true });

// ---------------------------------------------------------------- shop floor map
// Zoomable, clickable layout (shop-layout.svg, 1 unit = 1 ft). Pins come from assets.map_x / map_y.
let layoutSvgText = null;
const PIN = {
  down: { fill: '#991B1B', label: 'Down' },
  limited: { fill: '#EAB308', label: 'Limited' },
  due: { fill: '#2563EB', label: 'Daily check due' },
  done: { fill: '#166534', label: 'Checked today' },
  none: { fill: '#94A3B8', label: 'No daily check due' },
};
function pinState(a) {
  if (a.status === 'down') return 'down';
  if (a.status === 'limited') return 'limited';
  const st = dailyState(a).st;
  if (st === 'due') return 'due';
  if (st === 'done') return 'done';
  return 'none';
}

route('/map', async () => {
  app.innerHTML = floorShell('', '<div class="loading">Loading map…</div>');
  await loadCore();
  if (!layoutSvgText) {
    const r = await fetch('shop-layout.svg', { cache: 'no-cache' });
    if (!r.ok) throw new Error('Could not load shop-layout.svg');
    layoutSvgText = await r.text();
  }
  const hasCols = core.assets.length && 'map_x' in core.assets[0];
  const qs = query();
  let dept = qs.has('dept') ? qs.get('dept') : tabletDept();
  let editing = qs.get('edit') === '1' && isSup();
  let selected = qs.get('focus') || null;   // machine id shown in the card
  let placing = null;                        // machine id being placed (edit mode)
  const placed = () => activeAssets().filter((a) => a.map_x != null && a.map_y != null);

  const body = `
  <div class="row" style="justify-content:space-between;align-items:flex-end">
    <div><h1>Shop floor</h1><p class="muted" style="margin:6px 0 0">Tap a machine to log maintenance. Pinch or scroll to zoom, drag to move.</p></div>
    <div class="row">
      <label class="small">Department<select id="mdept"><option value="">All</option>${core.depts.map((d) => `<option ${d === dept ? 'selected' : ''}>${esc(d)}</option>`).join('')}</select></label>
      <form id="mfind" class="row" style="gap:6px;align-items:flex-end"><label class="small">Find<input name="t" placeholder="Tag, e.g. PB-001" style="width:150px;text-transform:uppercase"></label><button class="btn" type="submit">Go</button></form>
      ${isSup() ? `<button class="btn ${editing ? 'dark' : ''}" type="button" id="medit">${editing ? 'Done placing' : 'Place machines'}</button>` : ''}
    </div>
  </div>
  ${hasCols ? '' : '<div class="err">The map positions aren\'t set up in the database yet. Run <b>supabase/shop_map.sql</b> in the Supabase SQL Editor.</div>'}
  <div style="position:relative">
    <div id="mapbox" style="aspect-ratio:2.2/1;max-height:74vh;min-height:340px;background:#fff;border:1px solid var(--line);border-radius:12px;overflow:hidden;touch-action:none;cursor:grab;user-select:none"></div>
    <div class="row" style="position:absolute;right:12px;top:12px;gap:6px;flex-direction:column">
      <button class="btn" type="button" id="zin" aria-label="Zoom in" style="width:48px;padding:0;font-size:22px">+</button>
      <button class="btn" type="button" id="zout" aria-label="Zoom out" style="width:48px;padding:0;font-size:22px">−</button>
      <button class="btn" type="button" id="zfit" aria-label="Show whole shop" style="width:48px;padding:0;font-size:12px">Fit</button>
    </div>
  </div>
  <div class="row small" style="gap:16px;margin-top:-8px">
      ${Object.values(PIN).map((p) => `<span class="row" style="gap:6px"><span style="width:14px;height:14px;border-radius:999px;background:${p.fill};border:2px solid #fff;box-shadow:0 0 0 1px #94A3B8;display:inline-block"></span>${p.label}</span>`).join('')}
  </div>
  <div id="mcard"></div>
  <div id="medpanel"></div>`;
  app.innerHTML = floorShell('', body);
  $('.fmain').style.maxWidth = '1600px';

  const box = $('#mapbox');
  box.innerHTML = layoutSvgText;
  const svg = $('svg', box);
  svg.removeAttribute('style');
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  svg.setAttribute('preserveAspectRatio', 'xMinYMin meet');
  const base = svg.getAttribute('viewBox').split(/\s+/).map(Number);
  const NS = 'http://www.w3.org/2000/svg';
  const pinLayer = document.createElementNS(NS, 'g');
  pinLayer.id = 'pins';
  svg.appendChild(pinLayer);
  const ghost = document.createElementNS(NS, 'circle');   // preview while placing
  ghost.setAttribute('fill', 'none'); ghost.setAttribute('stroke', '#C2410C'); ghost.setAttribute('stroke-dasharray', '2 2'); ghost.style.display = 'none';
  svg.appendChild(ghost);

  // --- view box (keeps the box's aspect ratio so 1 ft is square)
  let vb = { x: base[0], y: base[1], w: base[2], h: base[3] };
  const scale = () => box.clientWidth / vb.w;           // pixels per foot
  function apply() {
    if (!box.isConnected || !box.clientWidth || !box.clientHeight) return;   // page changed or hidden
    vb.h = vb.w * (box.clientHeight / box.clientWidth);
    svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
    drawPins();
  }
  function fit() {
    if (!box.clientWidth) return;
    const r = box.clientHeight / box.clientWidth;
    vb.w = Math.max(base[2], base[3] / r);
    vb.x = base[0] - (vb.w - base[2]) / 2;
    vb.y = base[1] - (vb.w * r - base[3]) / 2;
    apply();
  }
  function zoomAt(f, px, py) {   // f < 1 zooms in; (px, py) = screen point that stays put
    const s = scale();
    const fx = vb.x + px / s, fy = vb.y + py / s;
    vb.w = Math.min(Math.max(vb.w * f, 20), base[2] * 1.6);
    const s2 = box.clientWidth / vb.w;
    vb.x = fx - px / s2; vb.y = fy - py / s2;
    apply();
  }
  function centerOn(a, w) {
    vb.w = w || 70;
    const r = box.clientHeight / box.clientWidth;
    vb.x = a.map_x - vb.w / 2; vb.y = a.map_y - (vb.w * r) / 2;
    apply();
  }
  const toFt = (cx, cy) => { const b = box.getBoundingClientRect(); const s = scale(); return { x: vb.x + (cx - b.left) / s, y: vb.y + (cy - b.top) / s }; };

  // --- pins
  function drawPins() {
    const s = scale();
    const r = Math.max(7 / s, 1.2), showLabels = s >= 4.5;
    const fs = 11 / s;
    pinLayer.innerHTML = '';
    placed().forEach((a) => {
      const inDept = !dept || a.department === dept || a.shared.includes(dept);
      const st = PIN[pinState(a)];
      const g = document.createElementNS(NS, 'g');
      g.setAttribute('transform', `translate(${a.map_x} ${a.map_y})`);
      g.setAttribute('opacity', inDept ? '1' : '0.25');
      const sel = a.id === selected || a.id === placing;
      g.innerHTML = `${sel ? `<circle r="${r * 1.9}" fill="none" stroke="#1C1F23" stroke-width="${2.5 / s}"/>` : ''}
        <circle r="${r}" fill="${st.fill}" stroke="#1C1F23" stroke-opacity=".35" stroke-width="${1.5 / s}"/>
        ${showLabels || sel ? `<text y="${-r - 4 / s}" text-anchor="middle" font-size="${fs}" style="font-family:Inter,Arial,sans-serif;font-weight:700;fill:#1C1F23;paint-order:stroke;stroke:#fff;stroke-width:${3 / s}px">${esc(a.id.replace(/^FUSE-/, ''))}</text>` : ''}`;
      pinLayer.appendChild(g);
    });
  }
  function nearestPin(pt) {
    const s = scale(); let best = null, bd = Infinity;
    placed().forEach((a) => { const d = Math.hypot(a.map_x - pt.x, a.map_y - pt.y) * s; if (d < bd) { bd = d; best = a; } });
    return bd <= 26 ? best : null;   // within 26 px of the finger
  }

  // --- card for the tapped machine
  function showCard() {
    const a = selected && core.assetById[selected];
    if (!a) { $('#mcard').innerHTML = ''; return; }
    const ds = dailyState(a);
    const other = a.checks.filter((c) => c.frequency !== 'daily' && c.state === 'due');
    $('#mcard').innerHTML = `<div class="card row" style="justify-content:space-between;gap:16px">
      <div class="stack" style="gap:4px"><div class="row" style="gap:10px"><b style="font-size:19px">${esc(a.id)} · ${esc(a.name)}</b>${statusChip(a.status)}</div>
        <span class="small muted">${esc([a.department, a.shared.length ? 'shared with ' + a.shared.join(', ') : ''].filter(Boolean).join(' · '))}</span>
        <span class="small ${ds.cls}" style="font-weight:600">${esc(ds.text)}${other.length ? ' · ' + other.map((c) => FREQ[c.frequency]).join(', ') + ' due' : ''}</span></div>
      <div class="row"><a class="btn primary big" href="#/m/${encodeURIComponent(a.id)}">Log maintenance</a>
        ${profile.role !== 'tablet' ? `<a class="btn big" href="#/machine/${encodeURIComponent(a.id)}">Details</a>` : ''}</div></div>`;
  }

  // --- placing (supervisors)
  function drawEditPanel() {
    if (!editing) { $('#medpanel').innerHTML = ''; ghost.style.display = 'none'; return; }
    const list = activeAssets().slice().sort((x, y) => (x.map_x == null ? 0 : 1) - (y.map_x == null ? 0 : 1) || (x.id < y.id ? -1 : 1));
    const un = list.filter((a) => a.map_x == null).length;
    $('#medpanel').innerHTML = `<section class="card stack"><h2 style="margin:0">Place machines</h2>
      <p class="small muted" style="margin:0">${placing ? `Tap the map where <b>${esc(placing)}</b> goes.` : 'Pick a machine, then tap the map where it sits. Tapping a pin picks that machine so you can move it.'} ${un} not placed yet.</p>
      ${placing && core.assetById[placing].map_x != null ? `<button class="btn sm danger" type="button" id="munplace" style="align-self:flex-start">Take ${esc(placing)} off the map</button>` : ''}
      <div class="row" style="gap:8px">${list.map((a) => `<button type="button" class="pill" data-place="${esc(a.id)}" aria-pressed="${a.id === placing}" title="${esc(a.name)}">${a.map_x == null ? '● ' : ''}${esc(a.id.replace(/^FUSE-/, ''))}</button>`).join('')}</div>
      <span class="tiny muted">● = not on the map yet</span></section>`;
    $$('[data-place]').forEach((b) => b.addEventListener('click', () => { placing = b.dataset.place; selected = null; showCard(); drawEditPanel(); drawPins(); const a = core.assetById[placing]; if (a.map_x != null) centerOn(a, Math.min(vb.w, 120)); }));
    const un2 = $('#munplace');
    if (un2) un2.addEventListener('click', () => busy(un2, async () => {
      await q(sb.from('assets').update({ map_x: null, map_y: null }).eq('id', placing));
      core.assetById[placing].map_x = null; core.assetById[placing].map_y = null;
      toast(placing + ' taken off the map'); placing = null; drawEditPanel(); drawPins();
    }));
  }
  async function placeAt(pt) {
    const id = placing;
    const x = Math.round(pt.x * 10) / 10, y = Math.round(pt.y * 10) / 10;
    try {
      await q(sb.from('assets').update({ map_x: x, map_y: y }).eq('id', id));
      core.assetById[id].map_x = x; core.assetById[id].map_y = y;
      toast(`${id} placed`);
      placing = null; drawEditPanel(); drawPins();
    } catch (e) { toast(errMsg(e), true); }
  }

  // --- pointer: drag to pan, pinch / wheel to zoom, tap to pick
  const pts = new Map(); let drag = null, pinch = null, moved = false;
  box.addEventListener('pointerdown', (e) => {
    box.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 1) { drag = { x: e.clientX, y: e.clientY, vx: vb.x, vy: vb.y }; moved = false; box.style.cursor = 'grabbing'; }
    if (pts.size === 2) {
      const [p1, p2] = [...pts.values()];
      const b = box.getBoundingClientRect();
      pinch = { d: Math.hypot(p1.x - p2.x, p1.y - p2.y), w: vb.w, cx: (p1.x + p2.x) / 2 - b.left, cy: (p1.y + p2.y) / 2 - b.top, f: toFt((p1.x + p2.x) / 2, (p1.y + p2.y) / 2) };
      moved = true;
    }
  });
  box.addEventListener('pointermove', (e) => {
    if (editing && placing && pts.size === 0) {
      const pt = toFt(e.clientX, e.clientY), s = scale();
      ghost.setAttribute('cx', pt.x); ghost.setAttribute('cy', pt.y); ghost.setAttribute('r', 10 / s); ghost.setAttribute('stroke-width', 2 / s); ghost.style.display = '';
    }
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size >= 2 && pinch) {
      const [p1, p2] = [...pts.values()];
      const d = Math.hypot(p1.x - p2.x, p1.y - p2.y);
      vb.w = Math.min(Math.max(pinch.w * pinch.d / d, 20), base[2] * 1.6);
      const s2 = box.clientWidth / vb.w;
      vb.x = pinch.f.x - pinch.cx / s2; vb.y = pinch.f.y - pinch.cy / s2;
      apply();
    } else if (drag) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 6) moved = true;
      if (moved) { const s = scale(); vb.x = drag.vx - dx / s; vb.y = drag.vy - dy / s; apply(); }
    }
  });
  const end = (e) => {
    const wasTap = pts.size === 1 && !moved && pts.has(e.pointerId);
    pts.delete(e.pointerId);
    if (pts.size < 2) pinch = null;
    if (pts.size === 0) { drag = null; box.style.cursor = 'grab'; }
    if (!wasTap) return;
    const pt = toFt(e.clientX, e.clientY);
    const hit = nearestPin(pt);
    if (editing) {
      if (placing && (!hit || hit.id === placing)) { placeAt(pt); return; }
      if (hit) { placing = hit.id; drawEditPanel(); drawPins(); }
      return;
    }
    selected = hit ? hit.id : null;
    showCard(); drawPins();
    if (hit) $('#mcard').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };
  box.addEventListener('pointerup', end);
  box.addEventListener('pointercancel', (e) => { pts.delete(e.pointerId); pinch = null; drag = null; });
  box.addEventListener('pointerleave', () => { ghost.style.display = 'none'; });
  box.addEventListener('wheel', (e) => { e.preventDefault(); const b = box.getBoundingClientRect(); zoomAt(e.deltaY > 0 ? 1.15 : 1 / 1.15, e.clientX - b.left, e.clientY - b.top); }, { passive: false });
  $('#zin').addEventListener('click', () => zoomAt(1 / 1.5, box.clientWidth / 2, box.clientHeight / 2));
  $('#zout').addEventListener('click', () => zoomAt(1.5, box.clientWidth / 2, box.clientHeight / 2));
  $('#zfit').addEventListener('click', fit);
  $('#mdept').addEventListener('change', (e) => { dept = e.target.value; drawPins(); });
  $('#mfind').addEventListener('submit', (e) => {
    e.preventDefault();
    const t = formData(e.target).t.toUpperCase().replace(/\s+/g, '');
    const a = core.assetById[t] || core.assetById['FUSE-' + t] || core.assets.find((x) => (x.cpa_id || '').toUpperCase() === t);
    if (!a) { toast(`No machine with tag ${t}`, true); return; }
    if (a.map_x == null) { toast(`${a.id} isn't on the map yet`, true); return; }
    selected = a.id; showCard(); centerOn(a, 70);
  });
  const eb = $('#medit');
  if (eb) eb.addEventListener('click', () => { editing = !editing; placing = null; eb.textContent = editing ? 'Done placing' : 'Place machines'; eb.classList.toggle('dark', editing); drawEditPanel(); drawPins(); });
  if (window.__mapResize) window.removeEventListener('resize', window.__mapResize);
  window.__mapResize = () => { if (box.isConnected) apply(); };
  window.addEventListener('resize', window.__mapResize);

  fit();
  if (selected && core.assetById[selected] && core.assetById[selected].map_x != null) centerOn(core.assetById[selected], 70);
  showCard(); drawEditPanel();
});

// ================================================================== SHOP FLOOR (tablet)

// Landing: no name picker any more. The person is whoever signed in.
route('/floor', async () => {
  const next = sessionStorage.getItem(PKEY);
  sessionStorage.removeItem(PKEY);
  location.replace(next || '#/floor/pick');
});

// Scan a machine's QR label with the tablet camera
function scanQr(onText) {
  const ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;inset:0;z-index:50;background:#000;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:12px';
  ov.innerHTML = '<video playsinline muted style="max-width:100%;max-height:70vh;border-radius:12px"></video><div style="color:#fff;font-size:18px;text-align:center" id="scanmsg">Point the camera at the QR label on the machine</div><button class="btn big" type="button" id="scanx">Cancel</button>';
  document.body.appendChild(ov);
  const video = ov.querySelector('video');
  let stream = null, stopped = false;
  const stop = () => { stopped = true; if (stream) stream.getTracks().forEach((t) => t.stop()); ov.remove(); window.removeEventListener('hashchange', stop); };
  window.addEventListener('hashchange', stop);
  ov.querySelector('#scanx').addEventListener('click', stop);
  (async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('This browser cannot use the camera here.');
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      video.srcObject = stream; await video.play();
      const det = window.BarcodeDetector ? new window.BarcodeDetector({ formats: ['qr_code'] }) : null;
      if (!det && !window.jsQR) throw new Error('QR scanning is not available in this browser. Type the tag instead.');
      const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d', { willReadFrequently: true });
      let last = 0;
      const tick = async (now) => {
        if (stopped) return;
        if (now - last > 200 && video.videoWidth) {
          last = now; let text = '';
          try {
            if (det) { const r = await det.detect(video); if (r.length) text = r[0].rawValue; }
            else { canvas.width = video.videoWidth; canvas.height = video.videoHeight; ctx.drawImage(video, 0, 0); const img = ctx.getImageData(0, 0, canvas.width, canvas.height); const r = window.jsQR(img.data, img.width, img.height); if (r) text = r.data; }
          } catch (e) { /* keep scanning */ }
          if (text) { if (onText(text)) { stop(); return; } ov.querySelector('#scanmsg').textContent = 'That code is not a machine. Try another label.'; last = now + 1500; }
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    } catch (e) {
      ov.querySelector('#scanmsg').textContent = (e && e.name === 'NotAllowedError') ? 'Camera access was blocked. Allow the camera for this site in the browser settings.' : (e.message || 'Could not start the camera.');
    }
  })();
}

// Pick a department, then a machine
route('/floor/dept', async () => {
  app.innerHTML = floorShell('', '<div class="loading">Loading…</div>');
  await loadCore();
  app.innerHTML = floorShell('', `<h1>Which department?</h1>
  <div class="tiles">${core.depts.map((d) => { const n = deptAssets(d).length; return `<a class="mtile" href="#/floor/pick?dept=${encodeURIComponent(d)}" style="min-height:96px;justify-content:center"><span class="t">${esc(d)}</span><span class="small muted">${n} machine${n === 1 ? '' : 's'}</span></a>`; }).join('')}
    <a class="mtile" href="#/floor/pick?dept=" style="min-height:96px;justify-content:center"><span class="t">All machines</span><span class="small muted">${activeAssets().length} machines</span></a></div>`);
});

// Pick a machine
route('/floor/pick', async () => {
  app.innerHTML = floorShell('', '<div class="loading">Loading…</div>');
  await loadCore();
  const qd = query().get('dept');
  const dept = qd !== null ? qd : tabletDept();
  const list = dept ? deptAssets(dept) : activeAssets();
  const doneN = list.filter((a) => dailyState(a).st === 'done').length;
  const dueN = list.filter((a) => ['done', 'due', 'skipped'].includes(dailyState(a).st)).length;
  const body = `
  <div style="text-align:center"><h1>What are you checking?</h1><p class="muted" style="margin:6px auto 0;max-width:640px">Scan the QR label on the machine, pick a department, find it on the shop map, or type the machine tag.</p></div>
  <div class="row" style="gap:10px;flex-wrap:wrap;justify-content:center"><button type="button" class="btn primary big" id="scanbtn">Scan QR code</button><a class="btn primary big" href="#/floor/dept">Pick by department</a><a class="btn primary big" href="#/map">Pick on the shop map</a></div>
  <form id="tagf" class="card row" style="justify-content:center;width:100%;max-width:560px;margin-left:auto;margin-right:auto"><label for="tag" style="flex:1 1 260px">Machine tag<input id="tag" name="tag" placeholder="e.g. PB-001 or FUSE-PB-001" autocomplete="off" style="height:56px;font-size:19px;text-transform:uppercase"></label><button class="btn dark big" type="submit" style="align-self:flex-end;height:56px">Go</button></form>
  <div class="row" style="justify-content:center;gap:16px"><h2>${esc(dept || 'All machines')}</h2><span class="small muted">${dueN ? `${doneN} of ${dueN} daily checks done today` : ''}</span></div>
  <div class="tiles">${list.map((a) => {
    const ds = dailyState(a);
    const otherDue = a.checks.filter((c) => c.frequency !== 'daily' && c.state === 'due');
    return `<a class="mtile ${ds.st === 'due' ? 'due' : ''}" href="#/m/${encodeURIComponent(a.id)}">
      <div class="row" style="justify-content:space-between;gap:8px"><span class="t">${esc(a.id.replace(/^FUSE-/, ''))}</span>${statusChip(a.status)}</div>
      <span style="font-weight:500">${esc(a.name)}</span>
      ${dept && a.department !== dept ? `<span class="row" style="gap:6px">${chip('Shared', 'c-info')}<span class="tiny muted">owned by ${esc(a.department)}</span></span>` : ''}
      <span style="margin-top:auto;font-weight:700;font-size:14px" class="${ds.cls}">${esc(ds.text)}</span>
      ${otherDue.length ? `<span class="tiny t-warn" style="font-weight:600">${otherDue.map((c) => FREQ[c.frequency]).join(', ')} due</span>` : ''}</a>`;
  }).join('') || '<p class="muted">No machines in this department.</p>'}</div>
  <p class="small muted" style="margin:0;text-align:center">Shared machines like cranes and forklifts show in every department that uses them. They only need one check, so if someone already did it, it shows as done for everyone.</p>
  <div class="row" style="padding-top:8px;border-top:1px solid var(--line);justify-content:center"><span class="small muted">Different department?</span>
    ${['', ...core.depts].map((d) => `<a class="pill" aria-pressed="${d === dept}" href="#/floor/pick?dept=${encodeURIComponent(d)}" style="display:inline-flex;align-items:center;height:44px">${esc(d || 'All')}</a>`).join('')}</div>`;
  app.innerHTML = floorShell('', body);
  $('#scanbtn').addEventListener('click', () => scanQr((text) => {
    const m = /#\/m\/([^/?#]+)/.exec(text);
    const t = decodeURIComponent(m ? m[1] : text.trim()).toUpperCase().replace(/\s+/g, '');
    const found = core.assetById[t] || core.assetById['FUSE-' + t] || core.assets.find((a) => (a.cpa_id || '').toUpperCase() === t);
    if (!found) { toast(`No machine matches that code (${t})`, true); return false; }
    location.hash = '#/m/' + encodeURIComponent(found.id);
    return true;
  }));
  $('#tagf').addEventListener('submit', (e) => {
    e.preventDefault();
    let t = formData(e.target).tag.toUpperCase().replace(/\s+/g, '');
    if (!t) return;
    const found = core.assetById[t] || core.assetById['FUSE-' + t] || core.assets.find((a) => (a.cpa_id || '').toUpperCase() === t);
    if (!found) { toast(`No machine with tag ${t}`, true); return; }
    location.hash = '#/m/' + encodeURIComponent(found.id);
  });
}, { worker: true });

// Machine (floor)
route('/m/([^/?]+)', async (id) => {
  app.innerHTML = floorShell('#/floor/pick', '<div class="loading">Loading…</div>');
  await loadCore();
  const a = core.assetById[id];
  if (!a) { app.innerHTML = floorShell('#/floor/pick', `<div class="err">No machine with tag ${esc(id)}.</div>`); return; }
  const recent = await Promise.all([
    q(sb.from('inspections').select('performed_at,performed_by,frequency,result').eq('asset_id', id).order('performed_at', { ascending: false }).limit(3)),
    q(sb.from('problems').select('created_at,reported_by,description,new_status').eq('asset_id', id).order('created_at', { ascending: false }).limit(2)),
  ]);
  const hist = [...recent[0].map((r) => ({ at: r.performed_at, t: `${FREQ[r.frequency]} check${r.result === 'fail' ? ' – item failed' : ''} · ${r.performed_by}` })),
    ...recent[1].map((r) => ({ at: r.created_at, t: `Problem: ${r.description} · ${r.reported_by}` }))].sort((x, y) => (x.at < y.at ? 1 : -1));
  const body = `
  <div class="stack" style="gap:6px"><div class="row"><h1>${esc(a.id)} · ${esc(a.name)}</h1>${statusChip(a.status)}</div>
    <span class="muted">${esc([a.department, ...(a.shared.length ? ['shared with ' + a.shared.join(', ')] : [])].filter(Boolean).join(' · '))}</span></div>
  ${a.status === 'down' ? '<div class="err"><b>This machine is marked Down.</b> Checks can still be logged, or skipped with "Machine is down".</div>' : ''}
  <section class="stack"><h2>Checklists</h2>
  ${a.checks.length ? a.checks.map((c) => `<div class="qitem"><div class="row" style="justify-content:space-between">
      <div class="stack" style="gap:4px"><div class="row" style="gap:10px"><b style="font-size:17px">${FREQ[c.frequency]}</b>${checkStateChip(c)}${c.approved_by ? '' : chip('Draft – not approved', 'c-grey')}</div>
        <span class="small muted">${esc(c.title)} · Rev ${c.revision}${c.state === 'done' ? ` · done by ${esc(c.done_by)} at ${fmtClock(c.done_at)}` : c.state === 'skipped' ? ` · skipped by ${esc(c.skipped_by)}` : c.last_done_at ? ` · last done ${fmtTime(c.last_done_at)}` : ''}</span></div>
      <div class="row" style="gap:8px">
        ${c.state === 'done' ? `<a class="btn" href="#/m/${encodeURIComponent(id)}/check/${c.checklist_id}">Do it again</a>` : `<a class="btn primary" href="#/m/${encodeURIComponent(id)}/check/${c.checklist_id}" style="height:52px;padding:0 22px">Start check</a>${c.state === 'due' ? `<a class="btn" href="#/m/${encodeURIComponent(id)}/skip/${c.checklist_id}" style="height:52px">Can't do it? Skip</a>` : ''}`}
      </div></div></div>`).join('') : '<div class="card muted">No checklists have been set up for this machine yet. You can still report a problem or log work.</div>'}
  </section>
  <div class="grid g2"><a class="btn big" href="#/m/${encodeURIComponent(id)}/problem" style="border-color:var(--accent);color:var(--accent)">Report a problem</a><a class="btn big" href="#/m/${encodeURIComponent(id)}/log">Log other work</a></div>
  ${hist.length ? `<section class="card"><h2>Recent</h2>${hist.map((h) => `<div class="list-item small"><span class="muted" style="width:120px;flex-shrink:0">${fmtTime(h.at)}</span><span>${esc(h.t)}</span></div>`).join('')}</section>` : ''}`;
  app.innerHTML = floorShell('#/floor/pick', body);
}, { worker: true });

// Run a checklist
route('/m/([^/?]+)/check/([0-9a-f-]{36})', async (id, cid) => {
  app.innerHTML = floorShell('#/m/' + encodeURIComponent(id), '<div class="loading">Loading…</div>');
  await loadCore();
  const a = core.assetById[id];
  const [cl] = await q(sb.from('checklists').select('*').eq('id', cid));
  const items = await q(sb.from('checklist_items').select('*').eq('checklist_id', cid).order('seq'));
  if (!a || !cl) throw new Error('Checklist not found');
  const ans = {}; // seq -> {answer, note}
  const w = getWorker();
  const body = `
  <div class="stack" style="gap:6px"><span class="small muted">${esc(a.id)} · ${esc(a.name)}</span><h1>${esc(cl.title)}</h1>
    <span class="small muted">${FREQ[cl.frequency]} · ${esc(cl.doc_id)} Rev ${cl.revision}${cl.est_minutes ? ` · about ${cl.est_minutes} minutes` : ''}${cl.approved_by ? '' : ' · <b>draft – not approved</b>'}</span></div>
  <div class="row" style="justify-content:space-between"><span class="small muted">Answer every item. If something doesn't pass, say what you found.</span><b id="prog" class="small"></b></div>
  <form id="ckf" class="stack">
    ${items.map((it) => `<div class="qitem" data-item="${it.seq}"><div class="q"><div class="txt"><span class="muted" style="font-weight:700;width:24px;flex-shrink:0">${it.seq}</span>
      <div><div style="font-size:17px;font-weight:500">${esc(it.prompt)}</div><div class="small muted">${esc([it.area, it.criteria ? 'Pass if: ' + it.criteria : ''].filter(Boolean).join(' · '))}</div>${(it.manual_refs || []).length ? `<button type="button" class="btn sm mpbtn" data-mp="${it.seq}">Manual page${it.manual_refs.length > 1 ? 's' : ''}</button>` : ''}</div></div>
      ${it.input_type === 'number'
        ? `<div class="numin"><input type="number" inputmode="decimal" step="any" data-num aria-label="Item ${it.seq} reading"><span class="unit">${esc(it.unit || '')}</span></div>`
        : `<div class="yn" role="group" aria-label="Item ${it.seq}"><button type="button" class="yes" data-a="yes" aria-pressed="false">Yes</button><button type="button" class="no" data-a="no" aria-pressed="false">No</button></div>`}</div>
      <label class="t-bad" data-note hidden style="padding-left:36px">${it.input_type === 'number' ? 'Reading is outside the range. What did you find? (required)' : 'What did you find? (required)'}<textarea rows="2" style="font-weight:400;color:var(--ink)"></textarea></label></div>`).join('')}
    <label>Other notes (optional)<textarea name="notes" rows="2"></textarea></label>
    <p class="small muted" style="margin:0">Submitting as <b>${esc(w.name)}</b></p>
    <button class="btn primary big" type="submit" id="sub" disabled>Submit check</button>
  </form>`;
  app.innerHTML = floorShell('#/m/' + encodeURIComponent(id), body);
  const update = () => {
    const n = Object.keys(ans).length;
    $('#prog').textContent = `${n} of ${items.length} answered`;
    $('#sub').disabled = n < items.length;
  };
  update();
  $$('[data-mp]').forEach((b) => b.addEventListener('click', () => {
    const it = items.find((x) => x.seq === Number(b.dataset.mp));
    showManualPages(it.manual_refs, it.prompt).catch((err) => toast(errMsg(err), true));
  }));
  $$('[data-item]').forEach((box) => {
    const seq = Number(box.dataset.item);
    $$('[data-a]', box).forEach((b) => b.addEventListener('click', () => {
      const v = b.dataset.a;
      $$('[data-a]', box).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      const itx = items.find((x) => x.seq === seq);
      const fail = v !== (itx && itx.pass_answer === 'no' ? 'no' : 'yes');
      ans[seq] = { answer: fail ? 'no' : 'yes', response: v, note: (ans[seq] && ans[seq].note) || '' };
      $$('[data-a]', box).forEach((x) => { x.classList.toggle('ok', x === b && !fail); x.classList.toggle('bad', x === b && fail); });
      box.classList.toggle('no', fail);
      const nl = $('[data-note]', box);
      nl.hidden = !fail;
      if (fail) $('textarea', nl).focus();
      update();
    }));
    const numEl = $('[data-num]', box);
    if (numEl) {
      const it = items.find((x) => x.seq === seq);
      numEl.addEventListener('input', () => {
        const raw = numEl.value.trim();
        const v = Number(raw);
        const nl = $('[data-note]', box);
        if (raw === '' || !Number.isFinite(v)) { delete ans[seq]; box.classList.remove('no'); nl.hidden = true; update(); return; }
        const ok = (it.min_value == null || v >= Number(it.min_value)) && (it.max_value == null || v <= Number(it.max_value));
        ans[seq] = { answer: ok ? 'yes' : 'no', value: v, note: (ans[seq] && ans[seq].note) || '' };
        box.classList.toggle('no', !ok);
        nl.hidden = ok;
        update();
      });
    }
    $('[data-note] textarea', box).addEventListener('input', (e) => { if (ans[seq]) ans[seq].note = e.target.value; });
  });
  $('#ckf').addEventListener('submit', (e) => {
    e.preventDefault();
    const missingNote = items.find((it) => ans[it.seq] && ans[it.seq].answer === 'no' && !ans[it.seq].note.trim());
    if (missingNote) { toast(`Item ${missingNote.seq}: say what you found`, true); $(`[data-item="${missingNote.seq}"] textarea`).focus(); return; }
    const answers = items.map((it) => ({ seq: it.seq, area: it.area, prompt: it.prompt, criteria: it.criteria, answer: ans[it.seq].answer, ...(ans[it.seq].response ? { response: ans[it.seq].response } : {}), note: (ans[it.seq].note || '').trim(), ...(it.input_type === 'number' ? { value: ans[it.seq].value, unit: it.unit || '' } : {}) }));
    const failed = answers.filter((x) => x.answer === 'no');
    busy($('#sub'), async () => {
      const worker = getWorker();
      if (!worker) { location.hash = '#/floor'; return; }
      await q(sb.from('inspections').insert({ checklist_id: cid, performed_by: worker.name, result: failed.length ? 'fail' : 'pass', answers, notes: formData(e.target).notes || '' }));
      if (!failed.length) { doneScreen(id, `${FREQ[cl.frequency]} check saved. All ${answers.length} items passed.`); return; }
      // Something failed: ask if the machine can still run
      app.innerHTML = floorShell('', `<div class="notice"><b>Check saved with ${failed.length} failed item${failed.length > 1 ? 's' : ''}.</b> It's on the Exceptions report for the ${esc(a.department)} lead.</div>
        <h1>Can ${esc(a.id)} still run?</h1>
        <div class="statusbtns">${['running', 'limited', 'down'].map((s) => `<button type="button" class="s-${s}" data-s="${s}" aria-pressed="${s === a.status}">${s === 'running' ? 'Yes, fine' : STATUS[s]}</button>`).join('')}</div>
        <button class="btn primary big" id="stok">Continue</button>`);
      let chosen = a.status;
      $$('[data-s]').forEach((b) => b.addEventListener('click', () => { chosen = b.dataset.s; $$('[data-s]').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); }));
      $('#stok').addEventListener('click', (ev) => busy(ev.target, async () => {
        if (chosen !== a.status) await q(sb.rpc('set_asset_status', { p_asset: id, p_status: chosen, p_note: 'After failed check: ' + failed.map((x) => '#' + x.seq + ' ' + x.prompt).join('; '), p_by: worker.name }));
        doneScreen(id, `Saved. ${a.id} is marked ${STATUS[chosen]}.`);
      }));
    });
  });
}, { worker: true });

function doneScreen(id, msg) {
  app.innerHTML = floorShell('', `<div class="card stack" style="align-items:flex-start"><h1 class="t-ok">Done</h1><p style="margin:0;font-size:17px">${esc(msg)}</p>
    <div class="row"><a class="btn primary big" href="#/floor">Main screen</a><a class="btn big" href="#/m/${encodeURIComponent(id)}">Back to ${esc(id)}</a></div></div>`);
}

// Skip a check
route('/m/([^/?]+)/skip/([0-9a-f-]{36})', async (id, cid) => {
  app.innerHTML = floorShell('#/m/' + encodeURIComponent(id), '<div class="loading">Loading…</div>');
  await loadCore();
  const a = core.assetById[id];
  const [cl] = await q(sb.from('checklists').select('*').eq('id', cid));
  if (!a || !cl) throw new Error('Checklist not found');
  const w = getWorker();
  app.innerHTML = floorShell('#/m/' + encodeURIComponent(id), `
  <div class="stack" style="gap:6px"><span class="small muted">${esc(a.id)} · ${esc(a.name)} · ${FREQ[cl.frequency]}</span><h1>Skip this check</h1></div>
  <div class="notice">Skipped checks show on the Exceptions report. "Machine is down" and "Machine isn't being used" close automatically; other reasons go to the ${esc(a.department || 'department')} lead.</div>
  <form id="skf" class="stack">
    <fieldset class="stack" style="border:0;padding:0;margin:0;gap:10px"><legend style="font-weight:700;margin-bottom:10px">Why can't you do it?</legend>
      ${Object.entries(SKIP_REASONS).map(([k, v]) => `<label class="choice"><input type="radio" name="reason" value="${k}" required ${k === 'machine_down' && a.status === 'down' ? 'checked' : ''}> ${v}</label>`).join('')}</fieldset>
    <label>Add a note (required)<textarea name="note" rows="3" required></textarea></label>
    <label>Will it be made up?<select name="makeup" style="height:56px"><option>Yes, later today</option><option>Yes, next shift</option><option>Yes, tomorrow</option><option>No</option><option value="">Not sure</option></select></label>
    <p class="small muted" style="margin:0">Skipping as <b>${esc(w.name)}</b></p>
    <div class="row"><button class="btn primary big" type="submit">Submit skip</button><a class="btn big" href="#/m/${encodeURIComponent(id)}/check/${cid}">Do the check instead</a></div>
  </form>`);
  $('#skf').addEventListener('submit', (e) => {
    e.preventDefault(); const f = formData(e.target);
    busy($('button[type=submit]', e.target), async () => {
      const worker = getWorker(); if (!worker) { location.hash = '#/floor'; return; }
      await q(sb.from('skips').insert({ checklist_id: cid, reason: f.reason, note: f.note, makeup: f.makeup || '', reported_by: worker.name }));
      doneScreen(id, `Skip recorded for the ${FREQ[cl.frequency].toLowerCase()} check.`);
    });
  });
}, { worker: true });

// Report a problem
route('/m/([^/?]+)/problem', async (id) => {
  app.innerHTML = floorShell('#/m/' + encodeURIComponent(id), '<div class="loading">Loading…</div>');
  await loadCore();
  const a = core.assetById[id];
  if (!a) throw new Error('Machine not found');
  const w = getWorker();
  let st = a.status === 'running' ? '' : a.status;
  app.innerHTML = floorShell('#/m/' + encodeURIComponent(id), `
  <div class="stack" style="gap:6px"><span class="small muted">${esc(a.id)} · ${esc(a.name)}</span><h1>Report a problem</h1></div>
  <form id="prf" class="stack" style="gap:20px">
    <fieldset style="border:0;padding:0;margin:0"><legend style="font-weight:700;margin-bottom:10px">Can the machine still run?</legend>
      <div class="statusbtns">${[['running', 'Yes, fine'], ['limited', 'Limited'], ['down', 'Down']].map(([s, t]) => `<button type="button" class="s-${s}" data-s="${s}" aria-pressed="${s === st}">${t}</button>`).join('')}</div></fieldset>
    <label>What kind of problem?<select name="category" style="height:56px">${PROBLEM_CATS.map((c) => `<option>${c}</option>`).join('')}</select></label>
    <label>What happened? (required)<textarea name="description" rows="4" required></textarea></label>
    <label class="choice"><input type="checkbox" name="loto"> Machine is locked out / tagged out</label>
    <p class="small muted" style="margin:0">Reporting as <b>${esc(w.name)}</b></p>
    <button class="btn primary big" type="submit">Send report</button>
  </form>`);
  $$('[data-s]').forEach((b) => b.addEventListener('click', () => { st = b.dataset.s; $$('[data-s]').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); }));
  $('#prf').addEventListener('submit', (e) => {
    e.preventDefault();
    if (!st) { toast('Tap whether the machine can still run', true); return; }
    const f = formData(e.target);
    busy($('button[type=submit]', e.target), async () => {
      const worker = getWorker(); if (!worker) { location.hash = '#/floor'; return; }
      await q(sb.rpc('report_problem', { p_asset: id, p_status: st, p_category: f.category, p_description: f.description, p_loto: f.loto === 'on', p_by: worker.name }));
      doneScreen(id, `Problem reported. ${a.id} is marked ${STATUS[st]}.`);
    });
  });
}, { worker: true });

// Log other work (floor)
route('/m/([^/?]+)/log', async (id) => {
  app.innerHTML = floorShell('#/m/' + encodeURIComponent(id), '<div class="loading">Loading…</div>');
  await loadCore();
  const a = core.assetById[id];
  if (!a) throw new Error('Machine not found');
  const w = getWorker();
  app.innerHTML = floorShell('#/m/' + encodeURIComponent(id), `
  <div class="stack" style="gap:6px"><span class="small muted">${esc(a.id)} · ${esc(a.name)}</span><h1>Log other work</h1></div>
  <form id="lwf" class="stack" style="gap:18px">
    <label>Type<select name="kind" style="height:56px">${Object.entries(LOG_KIND).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
    <label>What was done (required)<input name="title" required style="height:56px"></label>
    <label>Details<textarea name="notes" rows="3"></textarea></label>
    <label>Date<input type="date" name="done_on" value="${shopToday()}" max="${shopToday()}" required style="height:56px"></label>
    ${a.status !== 'running' ? `<label class="choice"><input type="checkbox" name="back"> ${esc(a.id)} is fixed – mark it Running</label>` : ''}
    <p class="small muted" style="margin:0">Logging as <b>${esc(w.name)}</b></p>
    <button class="btn primary big" type="submit">Save</button>
  </form>`);
  $('#lwf').addEventListener('submit', (e) => {
    e.preventDefault(); const f = formData(e.target);
    busy($('button[type=submit]', e.target), async () => {
      const worker = getWorker(); if (!worker) { location.hash = '#/floor'; return; }
      await q(sb.from('maintenance_logs').insert({ asset_id: id, kind: f.kind, title: f.title, notes: f.notes, done_by: worker.name, done_on: f.done_on }));
      if (f.back === 'on') await q(sb.rpc('set_asset_status', { p_asset: id, p_status: 'running', p_note: 'Fixed: ' + f.title, p_by: worker.name }));
      doneScreen(id, 'Work logged' + (f.back === 'on' ? ` and ${a.id} is back to Running.` : '.'));
    });
  });
}, { worker: true });

// ------------------------------------------------------------------ start
(async function start() {
  const { data } = await sb.auth.getSession();
  session = data.session;
  sb.auth.onAuthStateChange((_ev, s) => {
    const had = !!session;
    session = s;
    if (!s) { profile = null; if (had) render(); }
  });
  render();
})();

})();
