

/* ═══════════ SHARED CONSTANTS ═══════════ */
const ANTHROPIC_API_KEY = '';
const WAKE_HOUR  = 8;
const SLEEP_HOUR = 24;
const TRADE_KEY   = 'nq_trades_v4';
const BAD_DAY_KEY = 'nq_bad_days_v1';
const MOOD_EMOJI  = ['','😞','😟','😐','😑','🙂','😊','😄','😁','🔥','🚀'];
const CONF_EMOJI  = ['','😓','😬','😐','🤔','🙂','😊','💪','🎯','🔥','⚡'];

/* ═══════════ DASHBOARD STORAGE ═══════════ */
function storeGet(key) { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } }
function storeSet(key, val) {
  localStorage.setItem(key, JSON.stringify(val));
  if (key.startsWith('goals:')) window.dispatchEvent(new CustomEvent('goals-changed'));
}
function storeDelete(key) { localStorage.removeItem(key); }
function storeListKeys(prefix) {
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(prefix)) keys.push(k);
  }
  return keys;
}

/* ═══════════ TRADING STORAGE ═══════════ */
function getTrades()    { try { return JSON.parse(localStorage.getItem(TRADE_KEY))  || []; } catch { return []; } }
function saveTrades(t)  { localStorage.setItem(TRADE_KEY, JSON.stringify(t)); }
function getBadDays()   { try { return JSON.parse(localStorage.getItem(BAD_DAY_KEY)) || []; } catch { return []; } }
function saveBadDays(d) { localStorage.setItem(BAD_DAY_KEY, JSON.stringify(d)); }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

/* ═══════════ DATE HELPERS ═══════════ */
function getActiveDateString() {
  const now = new Date();
  if (now.getHours() < 6) { const d = new Date(now); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); }
  return now.toISOString().slice(0, 10);
}
function getTomorrowDateString() {
  const now = new Date();
  if (now.getHours() < 6) return now.toISOString().slice(0, 10);
  const d = new Date(now); d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}
function formatDate(str) {
  const [y, m, d] = str.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const wd = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const mo = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${wd[dt.getDay()]}, ${mo[dt.getMonth()]} ${dt.getDate()}`;
}
function todayStr() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
}

/* ═══════════ PAGE NAVIGATION ═══════════ */
/* ═══════════ NAVIGATION ═══════════ */
function navTo(page) {
  document.querySelectorAll('.sidebar-btn, .bottom-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.page-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll(`[data-page="${page}"]`).forEach(b => b.classList.add('active'));
  const el = document.getElementById('page-' + page);
  if (el) el.classList.add('active');
  if (page === 'home')    { initHome(); }
  if (page === 'trading') { renderStats(); renderCalendar(); drawEquityCurve(); renderPmStatus(); loadEconomicCalendar(); }
  if (page === 'faith')   { initFaith(); }
  if (page === 'glitchy') { initGlitchy(); }
  if (page === 'water')   { initWater(); }
  if (page === 'stack')   { initStack(); }
  if (page === 'review')  { initWeeklyReview(); }
  if (page === 'goals')   { renderGoals(); }
  if (page === 'health')  { fetchGarminStats(); }
  // close mobile sidebar if open
  document.getElementById('sidebar')?.classList.remove('open');
  // scroll to top
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
document.getElementById('sidebarNav')?.addEventListener('click', e => {
  const btn = e.target.closest('.sidebar-btn');
  if (btn && btn.dataset.page) navTo(btn.dataset.page);
});
document.getElementById('bottomNav')?.addEventListener('click', e => {
  const btn = e.target.closest('.bottom-btn');
  if (btn && btn.dataset.page) navTo(btn.dataset.page);
});
// Legacy pageNav compat
document.getElementById('pageNav')?.addEventListener('click', e => {
  const btn = e.target.closest('.page-btn');
  if (btn && btn.dataset.page) navTo(btn.dataset.page);
});

/* ═══════════ DASHBOARD: ROLLOVER ═══════════ */
function runRollover() {
  const active = getActiveDateString();
  const todayGoals = storeGet(`goals:${active}`) || [];
  let changed = false;
  for (const key of storeListKeys('goals:').sort()) {
    const date = key.slice(6);
    if (date >= active) continue;
    const old = storeGet(key) || [];
    const undone = old.filter(g => !g.done);
    storeDelete(key);
    if (!undone.length) continue;
    const existing = new Set(todayGoals.map(g => g.text));
    for (const g of undone) {
      if (!existing.has(g.text)) { todayGoals.push({ text: g.text, done: false }); existing.add(g.text); }
    }
    changed = true;
  }
  if (changed) storeSet(`goals:${active}`, todayGoals);
}

/* ═══════════ DASHBOARD: STREAK ═══════════ */
function runStreak() {
  const active = getActiveDateString();
  const streak = storeGet('goal_streak_v1') || { count: 0, lastProcessedDate: null };
  for (const key of storeListKeys('goals:').sort()) {
    const date = key.slice(6);
    if (date >= active) continue;
    if (streak.lastProcessedDate && date <= streak.lastProcessedDate) continue;
    const goals = storeGet(key) || [];
    if (goals.length === 0) { streak.lastProcessedDate = date; continue; }
    streak.count = goals.every(g => g.done) ? streak.count + 1 : 0;
    streak.lastProcessedDate = date;
  }
  storeSet('goal_streak_v1', streak);
}

/* ═══════════ DASHBOARD: HEADER RENDERS ═══════════ */
function renderTodayHeader() {
  const active = getActiveDateString();
  const goals = storeGet(`goals:${active}`) || [];
  const total = goals.length, done = goals.filter(g => g.done).length;
  document.getElementById('todayLabel').textContent = `Today — ${formatDate(active)}`;
  document.getElementById('gmProgressNum').textContent = done;
  document.getElementById('gmProgressTotal').textContent = `/ ${total}`;
  const lbl = document.getElementById('gmProgressLabel');
  lbl.textContent = total === 0 ? 'no goals yet' : (done === total ? 'all done — solid day' : 'complete');
  const bar = document.getElementById('gmBar');
  bar.innerHTML = '';
  goals.forEach(g => {
    const s = document.createElement('div');
    s.className = 'gm-bar-seg' + (g.done ? ' gm-bar-seg-done' : '');
    bar.appendChild(s);
  });
  const card = document.getElementById('todayCard');
  if (total > 0 && done === total) card.classList.add('gm-all-done');
  else card.classList.remove('gm-all-done');
  document.getElementById('gmPushBtn').style.display = goals.some(g => !g.done) ? 'block' : 'none';
}
function renderStreak() {
  const s = storeGet('goal_streak_v1') || { count: 0 };
  document.getElementById('gmStreakNum').textContent = s.count;
  document.getElementById('gmStreak').classList.toggle('gm-streak-active', s.count > 0);
}
function renderTomorrowCount() {
  const tomorrow = getTomorrowDateString();
  const goals = storeGet(`goals:${tomorrow}`) || [];
  document.getElementById('gmTomorrowCount').textContent = `${goals.length} planned`;
  document.getElementById('tomorrowLabel').textContent = `Plan tomorrow — ${formatDate(tomorrow)}`;
}

/* ═══════════ DASHBOARD: BUILD GOAL ROW ═══════════ */
function buildGoalRow(g, idx, key, readOnly) {
  const li = document.createElement('li');
  li.className = 'gm-goal-row' + (g.done ? ' is-done' : '') + (g.queued ? ' is-queued' : '');
  li.draggable = !readOnly;
  const handle = document.createElement('span');
  handle.className = 'gm-drag-handle'; handle.textContent = '⋮⋮';
  li.appendChild(handle);
  const cbWrap = document.createElement('label');
  cbWrap.className = 'gm-checkbox-wrap';
  const cb = document.createElement('input');
  cb.type = 'checkbox'; cb.checked = g.done;
  if (readOnly) { cb.disabled = true; cb.title = 'Activates at 6 AM tomorrow'; }
  const cbCustom = document.createElement('span');
  cbCustom.className = 'gm-checkbox-custom';
  cbWrap.appendChild(cb); cbWrap.appendChild(cbCustom);
  li.appendChild(cbWrap);
  const textEl = document.createElement('span');
  textEl.className = 'gm-goal-text'; textEl.textContent = g.text;
  makeInlineEdit(textEl, idx, key);
  li.appendChild(textEl);
  const qBtn = document.createElement('button');
  qBtn.className = 'gm-queue-btn' + (g.queued ? ' is-active' : '');
  qBtn.textContent = '⚡'; qBtn.title = 'Queue for productivity window';
  if (readOnly) qBtn.disabled = true;
  li.appendChild(qBtn);
  const del = document.createElement('button');
  del.className = 'goal-delete'; del.textContent = '×'; del.title = 'Delete';
  li.appendChild(del);
  cb.addEventListener('change', () => {
    const data = storeGet(key) || [];
    if (!data[idx]) return;
    data[idx].done = cb.checked;
    if (cb.checked) data[idx].doneAt = Date.now(); else delete data[idx].doneAt;
    storeSet(key, data); reloadKey(key);
  });
  qBtn.addEventListener('click', () => {
    const data = storeGet(key) || [];
    if (!data[idx]) return;
    data[idx].queued = !data[idx].queued;
    storeSet(key, data);
    li.classList.add('is-queue-flashing');
    setTimeout(() => reloadKey(key), 480);
  });
  del.addEventListener('click', () => {
    const data = storeGet(key) || [];
    data.splice(idx, 1);
    storeSet(key, data); reloadKey(key);
  });
  return li;
}
function reloadKey(key) {
  if (key === `goals:${getActiveDateString()}`) loadToday(); else loadTomorrow();
}

/* ═══════════ DASHBOARD: INLINE EDIT ═══════════ */
function makeInlineEdit(textEl, idx, key) {
  textEl.addEventListener('click', () => {
    if (textEl.contentEditable === 'true') return;
    const orig = textEl.textContent;
    textEl.contentEditable = 'true'; textEl.focus();
    const r = document.createRange(); r.selectNodeContents(textEl); r.collapse(false);
    const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
    function commit() {
      const nxt = textEl.textContent.trim();
      textEl.contentEditable = 'false';
      if (nxt && nxt !== orig) {
        const data = storeGet(key) || [];
        if (data[idx]) { data[idx].text = nxt; storeSet(key, data); reloadKey(key); }
      } else { textEl.textContent = orig; }
    }
    function cancel() { textEl.textContent = orig; textEl.contentEditable = 'false'; }
    textEl.addEventListener('blur', commit, { once: true });
    textEl.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    });
  });
}

/* ═══════════ DASHBOARD: DRAG REORDER ═══════════ */
function wireDrag(ul, key) {
  let fromIdx = null;
  ul.addEventListener('dragstart', e => {
    const row = e.target.closest('.gm-goal-row');
    if (!row) return;
    fromIdx = [...ul.querySelectorAll('.gm-goal-row')].indexOf(row);
    e.dataTransfer.effectAllowed = 'move';
  });
  ul.addEventListener('dragover', e => {
    e.preventDefault();
    const row = e.target.closest('.gm-goal-row');
    ul.querySelectorAll('.gm-goal-row').forEach(r => r.classList.remove('drag-over'));
    if (row) row.classList.add('drag-over');
  });
  ul.addEventListener('dragleave', e => {
    if (!ul.contains(e.relatedTarget)) ul.querySelectorAll('.gm-goal-row').forEach(r => r.classList.remove('drag-over'));
  });
  ul.addEventListener('drop', e => {
    e.preventDefault();
    ul.querySelectorAll('.gm-goal-row').forEach(r => r.classList.remove('drag-over'));
    const row = e.target.closest('.gm-goal-row');
    if (!row || fromIdx === null) return;
    const toIdx = [...ul.querySelectorAll('.gm-goal-row')].indexOf(row);
    if (toIdx === fromIdx) return;
    const data = storeGet(key) || [];
    const [item] = data.splice(fromIdx, 1);
    data.splice(toIdx, 0, item);
    storeSet(key, data); reloadKey(key);
    fromIdx = null;
  });
}

/* ═══════════ DASHBOARD: RENDER LIST ═══════════ */
function renderList(goals, ulEl, emptyEl, key, readOnly) {
  const LIMIT = 5;
  let expanded = false;
  function draw() {
    ulEl.innerHTML = '';
    const vis = expanded ? goals : goals.slice(0, LIMIT);
    vis.forEach((g, i) => ulEl.appendChild(buildGoalRow(g, i, key, readOnly)));
    if (goals.length > LIMIT) {
      const btn = document.createElement('button');
      btn.className = 'gm-show-more';
      const hidden = goals.length - LIMIT;
      btn.textContent = expanded ? 'Show less ▴' : `Show ${hidden} more ▾`;
      btn.addEventListener('click', () => { expanded = !expanded; draw(); });
      ulEl.appendChild(btn);
    }
  }
  if (goals.length === 0) { emptyEl.style.display = 'block'; ulEl.style.display = 'none'; }
  else { emptyEl.style.display = 'none'; ulEl.style.display = 'block'; draw(); wireDrag(ulEl, key); }
  if (key === `goals:${getActiveDateString()}`) { renderTodayHeader(); renderStreak(); renderTomorrowCount(); }
  else renderTomorrowCount();
}
function loadToday() {
  const key = `goals:${getActiveDateString()}`;
  renderList(storeGet(key) || [], document.getElementById('goalList'), document.getElementById('emptyState'), key, false);
}
function loadTomorrow() {
  const key = `goals:${getTomorrowDateString()}`;
  renderList(storeGet(key) || [], document.getElementById('tomorrowList'), document.getElementById('tomorrowEmptyState'), key, true);
}

/* ═══════════ DASHBOARD: ADD + POLISH ═══════════ */
function makeAddHandlers(inputEl, addBtn, polishBtn, key, statusEl, reload) {
  function push(text) {
    const t = text.trim(); if (!t) return;
    const data = storeGet(key) || [];
    data.push({ text: t, done: false });
    storeSet(key, data); inputEl.value = ''; reload();
  }
  function showMsg(msg, color, ms) {
    statusEl.textContent = msg; statusEl.style.color = color || 'var(--text-tertiary)';
    setTimeout(() => { statusEl.textContent = ''; statusEl.style.color = ''; }, ms || 3500);
  }
  addBtn.addEventListener('click', () => push(inputEl.value));
  inputEl.addEventListener('keydown', e => { if (e.key === 'Enter') push(inputEl.value); });
  polishBtn.addEventListener('click', async () => {
    const text = inputEl.value.trim(); if (!text) return;
    if (!ANTHROPIC_API_KEY) { push(text); showMsg('Polish needs an Anthropic API key — added as-typed.'); return; }
    polishBtn.disabled = true; polishBtn.textContent = '…';
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify({ model: 'claude-sonnet-4-5', max_tokens: 1000, messages: [{ role: 'user', content: `Clean up this goal into a clear, actionable task. Return ONLY a one-element JSON array of strings, no preamble, no fences.\n\nGoal: "${text}"` }] })
      });
      const json = await res.json();
      const parsed = JSON.parse(json.content[0].text.trim());
      push(parsed[0]);
    } catch {
      push(text); showMsg('Polish failed — added as-typed.', 'var(--danger)');
    } finally { polishBtn.disabled = false; polishBtn.textContent = '✨ Polish'; }
  });
}

document.getElementById('gmPushBtn').addEventListener('click', () => {
  if (!confirm('Push all unchecked goals to tomorrow?')) return;
  const todayKey    = `goals:${getActiveDateString()}`;
  const tomorrowKey = `goals:${getTomorrowDateString()}`;
  const today    = storeGet(todayKey)    || [];
  const tomorrow = storeGet(tomorrowKey) || [];
  const existing = new Set(tomorrow.map(g => g.text));
  today.filter(g => !g.done).forEach(g => { if (!existing.has(g.text)) tomorrow.push({ text: g.text, done: false }); });
  storeSet(tomorrowKey, tomorrow);
  storeSet(todayKey, today.filter(g => g.done));
  loadToday(); loadTomorrow();
});

/* ═══════════ DASHBOARD: DAY RING ═══════════ */
const RING_C = 2 * Math.PI * 52;
const ringFill = document.getElementById('ringFill');
ringFill.style.strokeDasharray = RING_C;

const PALETTE = [
  [255,216,158],[255,205,121],[255,227,143],[255,183,106],
  [255,149, 89],[243,111, 79],[226, 93,122],[123, 91,176],[47,58,102]
];
function lerpColor(pct) {
  const t = Math.max(0, Math.min(100, pct)) / 100;
  const n = PALETTE.length - 1;
  const i = Math.min(Math.floor(t * n), n - 1);
  const f = t * n - i;
  const a = PALETTE[i], b = PALETTE[i+1];
  return `rgb(${Math.round(a[0]+(b[0]-a[0])*f)},${Math.round(a[1]+(b[1]-a[1])*f)},${Math.round(a[2]+(b[2]-a[2])*f)})`;
}
function fmtTime(h, m) { const p = h >= 12 ? 'PM' : 'AM', hh = h % 12 || 12; return `${hh}:${String(m).padStart(2,'0')} ${p}`; }
function fmtDur(mins) { const h = Math.floor(mins/60), m = mins%60; return h > 0 && m > 0 ? `${h}h ${m}m` : h > 0 ? `${h}h` : `${m}m`; }
function updateDayBar() {
  const now = new Date();
  const hrs = now.getHours() + now.getMinutes()/60 + now.getSeconds()/3600;
  document.getElementById('ringClock').textContent = fmtTime(now.getHours(), now.getMinutes());
  if (hrs < WAKE_HOUR) {
    ringFill.style.strokeDashoffset = RING_C; ringFill.style.stroke = '#4D4B47';
    document.getElementById('ringPct').textContent    = '—';
    document.getElementById('ringPhase').textContent  = 'SLEEPING';
    document.getElementById('ringStatus').textContent = '😴 Still sleeping';
    document.getElementById('ringRemain').textContent = `${fmtDur(Math.round((WAKE_HOUR - hrs)*60))} until wake-up`;
  } else if (hrs < SLEEP_HOUR) {
    const pct = (hrs - WAKE_HOUR) / (SLEEP_HOUR - WAKE_HOUR) * 100;
    ringFill.style.strokeDashoffset = RING_C * (1 - pct/100);
    ringFill.style.stroke = lerpColor(pct);
    document.getElementById('ringPct').textContent = Math.round(pct) + '%';
    let phase, status;
    if      (pct < 25) { phase = 'MORNING';   status = '☀️ Morning — fresh start'; }
    else if (pct < 50) { phase = 'MIDDAY';    status = '⚡ Midday — keep moving'; }
    else if (pct < 75) { phase = 'AFTERNOON'; status = '🔥 Afternoon — push it'; }
    else if (pct < 90) { phase = 'EVENING';   status = '⏳ Evening — wrap up'; }
    else               { phase = 'BEDTIME';   status = '🌙 Bedtime soon'; }
    document.getElementById('ringPhase').textContent  = phase;
    document.getElementById('ringStatus').textContent = status;
    document.getElementById('ringRemain').textContent = `${fmtDur(Math.round((SLEEP_HOUR - hrs)*60))} awake time left`;
  } else {
    ringFill.style.strokeDashoffset = 0; ringFill.style.stroke = '#E25D7A';
    document.getElementById('ringPct').textContent    = '100%';
    document.getElementById('ringPhase').textContent  = 'PAST BEDTIME';
    document.getElementById('ringStatus').textContent = '⚠️ Past bedtime';
    document.getElementById('ringRemain').textContent = 'Sleep!';
  }
}

/* ═══════════ DASHBOARD: GOAL TICKER ═══════════ */
let cycleIdx = 0, firstTick = true;
function getTickerItems() {
  const goals = storeGet(`goals:${getActiveDateString()}`) || [];
  const total = goals.length, done = goals.filter(g => g.done).length;
  document.getElementById('goalTickerMeta').textContent = `${done}/${total}`;
  if (total === 0)    return [{ status:'empty',   text:'No goals set for today — add one to get rolling.' }];
  if (done === total) return [{ status:'done',    text:'✓ All goals done — solid day.' }];
  return goals.filter(g => !g.done).map(g => ({ status:'pending', text:g.text }));
}
function makeTickerRow(item) {
  const row = document.createElement('div'); row.className = 'goal-ticker-row';
  const st = document.createElement('span'); st.className = 'goal-ticker-status'; st.dataset.status = item.status;
  st.textContent = item.status === 'done' ? '✓' : item.status === 'pending' ? '○' : '·';
  const tx = document.createElement('span'); tx.className = 'goal-ticker-text'; tx.textContent = item.text;
  row.appendChild(st); row.appendChild(tx); return row;
}
function tick() {
  const items = getTickerItems(); if (!items.length) return;
  cycleIdx = cycleIdx % items.length;
  const item = items[cycleIdx]; cycleIdx = (cycleIdx + 1) % items.length;
  const stage = document.getElementById('goalTickerStage');
  const old = stage.querySelector('.goal-ticker-row');
  const fresh = makeTickerRow(item);
  if (firstTick) { if (old) old.remove(); stage.appendChild(fresh); firstTick = false; }
  else {
    fresh.classList.add('is-entering');
    if (old) { old.classList.add('is-leaving'); setTimeout(() => old.remove(), 460); }
    stage.appendChild(fresh);
  }
}
window.addEventListener('goals-changed', () => { cycleIdx = 0; tick(); });

/* ═══════════ SHARED: GARMIN FETCH ═══════════ */
let _cachedGarminData = null;
async function fetchGarminStats() {
  function set(id, val, subId, sub) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('loading'); el.textContent = val ?? '—';
    if (subId && sub != null) { const s = document.getElementById(subId); if (s) s.textContent = sub; }
  }
  function setError(id) { const el = document.getElementById(id); if (!el) return; el.classList.remove('loading'); el.classList.add('error'); el.textContent = 'N/A'; }
  try {
    const res = await fetch('/.netlify/functions/garmin');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const d = await res.json();
    if (d.error && !d.synced && !d.fromCache) throw new Error(d.message || d.error);
    _cachedGarminData = d;
    const fetchedTime = d.fetchedAt ? new Date(d.fetchedAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : 'recently';
    const staleNote = d.stale ? ` (${d.cacheAge}m old)` : d.fromCache ? ' (cached)' : '';
    set('hcHrv',     d.hrv5MinHigh != null         ? d.hrv5MinHigh                     : null, 'hcHrvSub',     'ms overnight');
    set('hcSleep',   d.sleepScore != null           ? d.sleepScore                      : null, 'hcSleepSub',   d.sleepDurationHours ? d.sleepDurationHours + 'h' : '/100');
    set('hcBattery', d.bodyBattery != null          ? d.bodyBattery                     : null, 'hcBatterySub', 'at wake-up');
    set('hcSteps',   d.steps != null                ? d.steps.toLocaleString()          : null, 'hcStepsSub',   'today');
    set('hcHr',      d.heartRateResting != null     ? d.heartRateResting                : null, 'hcHrSub',      'bpm');
    updateRecoveryBadge('healthRecoveryBadge', 'healthRecoveryText', d);
    const statusEl = document.getElementById('healthStatus');
    if (statusEl) {
      statusEl.style.color = d.stale ? 'var(--warning)' : '';
      statusEl.textContent = d.synced ? `Synced at ${fetchedTime}${staleNote}` :
        (d.message || 'Open Garmin Connect app on your phone and sync your watch.');
    }
    if (!d.synced) ['hcHrv','hcSleep','hcBattery','hcSteps','hcHr'].forEach(setError);
  } catch (err) {
    ['hcHrv','hcSleep','hcBattery','hcSteps','hcHr'].forEach(setError);
    const statusEl = document.getElementById('healthStatus');
    if (statusEl) {
      statusEl.style.color = 'var(--danger)';
      statusEl.textContent = err.message.includes('404') || err.message.includes('Failed to fetch')
        ? 'Garmin function not reachable — deploy to Netlify first.'
        : err.message || 'Garmin error — open Garmin Connect app and sync your watch.';
    }
  }
}
async function getGarminData() {
  if (_cachedGarminData) return _cachedGarminData;
  try {
    const res = await fetch('/.netlify/functions/garmin');
    if (!res.ok) return null;
    const d = await res.json();
    if (d.synced || d.fromCache) { _cachedGarminData = d; return d; }
  } catch {}
  return null;
}

/* ═══════════ TRADING: TAB NAV ═══════════ */
document.getElementById('tabNav').addEventListener('click', e => {
  const btn = e.target.closest('.tab-btn');
  if (!btn) return;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
  if (btn.dataset.tab === 'overview')  { renderStats(); renderCalendar(); drawEquityCurve(); }
  if (btn.dataset.tab === 'journal')   { renderTradeList(); }
  if (btn.dataset.tab === 'ai')        { renderGarminCorr(); }
  if (btn.dataset.tab === 'premarket') { renderPmStatus(); loadEconomicCalendar(); }
});

/* ═══════════ TRADING: SCREENSHOT ═══════════ */
let currentScreenshot = null;
function resizeImage(file, maxPx = 600) {
  return new Promise(resolve => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      let { width: w, height: h } = img;
      if (w > maxPx || h > maxPx) { if (w > h) { h = Math.round(h * maxPx / w); w = maxPx; } else { w = Math.round(w * maxPx / h); h = maxPx; } }
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url); resolve(c.toDataURL('image/jpeg', 0.72));
    };
    img.src = url;
  });
}
document.getElementById('screenshotInput').addEventListener('change', async e => {
  const file = e.target.files[0]; if (!file) return;
  currentScreenshot = await resizeImage(file);
  const prev = document.getElementById('screenshotPreview');
  prev.src = currentScreenshot; prev.style.display = 'block';
  document.getElementById('uploadPlaceholder').style.display = 'none';
  document.getElementById('uploadClear').style.display = 'block';
  document.getElementById('uploadZone').classList.add('has-image');
});
document.getElementById('uploadClear').addEventListener('click', e => {
  e.stopPropagation(); currentScreenshot = null;
  document.getElementById('screenshotInput').value = '';
  document.getElementById('screenshotPreview').style.display = 'none';
  document.getElementById('uploadPlaceholder').style.display = 'flex';
  document.getElementById('uploadClear').style.display = 'none';
  document.getElementById('uploadZone').classList.remove('has-image');
});

/* ═══════════ TRADING: ACCOUNT TYPE TOGGLE ═══════════ */
let currentAcct = 'eval';
document.querySelectorAll('[data-acct]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-acct]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active'); currentAcct = btn.dataset.acct;
  });
});

/* ═══════════ TRADING: DIRECTION TOGGLE ═══════════ */
let currentDir = 'long';
document.querySelectorAll('.dir-btn[data-dir]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.dir-btn[data-dir]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active'); currentDir = btn.dataset.dir;
  });
});

/* ═══════════ TRADING: SLIDERS ═══════════ */
function wireSlider(sliderId, numId, emojiId, emojiArr) {
  const slider = document.getElementById(sliderId);
  const num    = document.getElementById(numId);
  const emoji  = document.getElementById(emojiId);
  function update() {
    const v = parseInt(slider.value);
    num.textContent = v; emoji.textContent = emojiArr[v]; emoji.className = 'slider-emoji mood-' + v;
    document.getElementById(sliderId === 'moodSlider' ? 'moodVal' : 'confVal').textContent = v;
  }
  slider.addEventListener('input', update); update();
}
wireSlider('moodSlider', 'moodNum', 'moodEmoji', MOOD_EMOJI);
wireSlider('confSlider', 'confNum', 'confEmoji', CONF_EMOJI);

/* ═══════════ TRADING: SAVE TRADE ═══════════ */
document.getElementById('saveTradeBtn').addEventListener('click', async () => {
  const pnl   = parseFloat(document.getElementById('pnlInput').value);
  const rrRaw = parseFloat(document.getElementById('rrInput').value);
  const statusEl = document.getElementById('formStatus');
  const confluences = [...document.querySelectorAll('#confGrid input:checked')].map(c => c.value);
  const trade = {
    id: uid(), date: todayStr(), timestamp: Date.now(), screenshot: currentScreenshot,
    direction: currentDir, accountType: currentAcct,
    rr: isNaN(rrRaw) ? null : rrRaw,
    pnl: isNaN(pnl) ? null : pnl, confluences,
    tradeOff:    document.getElementById('tradeOff').value,
    mood:        parseInt(document.getElementById('moodSlider').value),
    confidence:  parseInt(document.getElementById('confSlider').value),
    description: document.getElementById('tradeDesc').value.trim(),
    garmin: null,
  };
  const trades = getTrades(); trades.push(trade); saveTrades(trades);
  flash(statusEl, '✓ Trade saved!', 'var(--success)');
  clearForm(); renderStats(); renderCalendar(); drawEquityCurve();
  try {
    const g = await fetch('/.netlify/functions/garmin').then(r => r.ok ? r.json() : null);
    if (g && !g.error) {
      const all = getTrades(); const idx = all.findIndex(t => t.id === trade.id);
      if (idx !== -1) { all[idx].garmin = { hrv: g.hrv5MinHigh, sleepScore: g.sleepScore, bodyBattery: g.bodyBattery, restingHeartRate: g.heartRateResting }; saveTrades(all); }
    }
  } catch (_) {}
});
function clearForm() {
  ['pnlInput','rrInput','tradeDesc'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  document.getElementById('tradeOff').value = '';
  document.getElementById('moodSlider').value = '5'; document.getElementById('confSlider').value = '5';
  document.querySelectorAll('#confGrid input').forEach(c => c.checked = false);
  document.querySelectorAll('.dir-btn[data-dir]').forEach(b => b.classList.remove('active'));
  document.querySelector('.dir-btn[data-dir="long"]').classList.add('active');
  document.querySelectorAll('[data-acct]').forEach(b => b.classList.remove('active'));
  document.querySelector('[data-acct="eval"]').classList.add('active');
  currentDir = 'long'; currentAcct = 'eval'; currentScreenshot = null;
  document.getElementById('screenshotInput').value = '';
  document.getElementById('screenshotPreview').style.display = 'none';
  document.getElementById('uploadPlaceholder').style.display = 'flex';
  document.getElementById('uploadClear').style.display = 'none';
  document.getElementById('uploadZone').classList.remove('has-image');
  wireSlider('moodSlider','moodNum','moodEmoji',MOOD_EMOJI);
  wireSlider('confSlider','confNum','confEmoji',CONF_EMOJI);
}
function flash(el, msg, color, ms = 3000) {
  el.textContent = msg; el.style.color = color;
  setTimeout(() => { el.textContent = ''; el.style.color = ''; }, ms);
}

/* ═══════════ TRADING: STATS ═══════════ */
function calcStats(trades) {
  const withPnl = trades.filter(t => t.pnl != null);
  const total = withPnl.length, wins = withPnl.filter(t => t.pnl > 0);
  const winRate = total > 0 ? wins.length / total * 100 : null;
  const totalPnl = withPnl.reduce((s, t) => s + t.pnl, 0);
  const winRRs = wins.filter(t => t.rr != null);
  const avgRR = winRRs.length ? winRRs.reduce((s, t) => s + t.rr, 0) / winRRs.length : null;
  let streak = 0;
  if (withPnl.length > 0) {
    const sorted = [...withPnl].sort((a, b) => b.timestamp - a.timestamp);
    const sign = sorted[0].pnl > 0 ? 1 : -1;
    for (const t of sorted) { if ((t.pnl > 0 ? 1 : -1) === sign) streak++; else break; }
    streak *= sign;
  }
  return { winRate, totalPnl, avgRR, streak, wins: wins.length, total };
}
function renderStats() {
  const s = calcStats(getTrades());
  const wr = document.getElementById('statWinRate'), ar = document.getElementById('statAvgRR');
  const tp = document.getElementById('statPnL'),      st = document.getElementById('statStreak');
  wr.textContent = s.winRate != null ? s.winRate.toFixed(0) + '%' : '—';
  wr.className   = 'stat-value' + (s.winRate != null ? (s.winRate >= 50 ? ' win' : ' loss') : '');
  ar.textContent = s.avgRR != null ? s.avgRR.toFixed(2) + 'R' : '—';
  ar.className   = 'stat-value' + (s.avgRR != null ? (s.avgRR >= 1 ? ' win' : ' loss') : '');
  tp.textContent = s.total > 0 ? (s.totalPnl >= 0 ? '+' : '') + '$' + s.totalPnl.toFixed(0) : '—';
  tp.className   = 'stat-value' + (s.total > 0 ? (s.totalPnl >= 0 ? ' win' : ' loss') : '');
  if (s.streak === 0) { st.textContent = '—'; st.className = 'stat-value'; }
  else { st.textContent = Math.abs(s.streak) + (s.streak > 0 ? 'W' : 'L'); st.className = 'stat-value' + (s.streak > 0 ? ' win' : ' loss'); }
}

/* ═══════════ TRADING: EQUITY CURVE ═══════════ */
function drawEquityCurve() {
  const canvas = document.getElementById('equityCanvas');
  const wrap = canvas.parentElement;
  const dpr = window.devicePixelRatio || 1;
  const W = wrap.clientWidth, H = wrap.clientHeight;
  canvas.width = W * dpr; canvas.height = H * dpr;
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);
  const trades = getTrades().filter(t => t.pnl != null).sort((a, b) => a.timestamp - b.timestamp);
  const pad = { t: 16, r: 10, b: 28, l: 48 };
  const plotW = W - pad.l - pad.r, plotH = H - pad.t - pad.b;
  let cum = 0; const pts = [{ x: 0, y: 0 }];
  trades.forEach((t, i) => { cum += t.pnl; pts.push({ x: i + 1, y: cum }); });
  const maxY = Math.max(...pts.map(p => p.y), 0.01);
  const minY = Math.min(...pts.map(p => p.y), -0.01);
  const rangeY = maxY - minY || 1;
  function px(i) { return pad.l + (pts.length > 1 ? (i / (pts.length - 1)) * plotW : 0); }
  function py(v) { return pad.t + plotH - ((v - minY) / rangeY) * plotH; }
  ctx.clearRect(0, 0, W, H);
  const steps = 4;
  ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1;
  ctx.fillStyle = 'rgba(180,174,166,0.55)'; ctx.font = '9px ui-monospace,"SF Mono",Menlo,Consolas,monospace'; ctx.textAlign = 'right';
  for (let i = 0; i <= steps; i++) {
    const v = minY + (rangeY / steps) * i, y = py(v);
    ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y); ctx.stroke();
    ctx.setLineDash([]); ctx.fillText((v >= 0 ? '+' : '') + '$' + v.toFixed(0), pad.l - 4, y + 3);
  }
  if (minY < 0 && maxY > 0) {
    const zY = py(0); ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.setLineDash([5, 5]); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad.l, zY); ctx.lineTo(W - pad.r, zY); ctx.stroke(); ctx.setLineDash([]);
  }
  if (pts.length < 2) {
    ctx.fillStyle = 'rgba(118,116,110,0.5)'; ctx.font = '12px -apple-system,BlinkMacSystemFont,"Inter",sans-serif';
    ctx.textAlign = 'center'; ctx.fillText('Log trades to see your equity curve', W / 2, H / 2); return;
  }
  const isGreen = pts[pts.length - 1].y >= 0, lineColor = isGreen ? '#6BE3A4' : '#FF6B6B';
  const grad = ctx.createLinearGradient(0, pad.t, 0, H - pad.b);
  grad.addColorStop(0, isGreen ? 'rgba(107,227,164,0.25)' : 'rgba(255,107,107,0.22)');
  grad.addColorStop(1, 'rgba(5,5,6,0)');
  ctx.beginPath();
  pts.forEach((p, i) => i === 0 ? ctx.moveTo(px(i), py(p.y)) : ctx.lineTo(px(i), py(p.y)));
  ctx.lineTo(px(pts.length - 1), H - pad.b); ctx.lineTo(px(0), H - pad.b); ctx.closePath();
  ctx.fillStyle = grad; ctx.fill();
  ctx.beginPath();
  pts.forEach((p, i) => i === 0 ? ctx.moveTo(px(i), py(p.y)) : ctx.lineTo(px(i), py(p.y)));
  ctx.strokeStyle = lineColor; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke();
  const last = pts[pts.length - 1];
  ctx.beginPath(); ctx.arc(px(pts.length - 1), py(last.y), 4, 0, Math.PI * 2);
  ctx.fillStyle = lineColor; ctx.fill();

  // Overlay: discipline score trend (dashed gold line, right-axis 0-100)
  const discPts = trades.filter(t => t.disciplineScore != null);
  if (discPts.length >= 2) {
    function pyDisc(v) { return pad.t + plotH - (Math.min(100, Math.max(0, v)) / 100) * plotH; }
    ctx.save();
    ctx.beginPath();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(212,168,83,0.75)';
    ctx.lineWidth = 1.5;
    discPts.forEach((t, i) => {
      const tradeIdx = trades.indexOf(t) + 1;
      const x = pad.l + (pts.length > 1 ? (tradeIdx / (pts.length - 1)) * plotW : 0);
      if (i === 0) ctx.moveTo(x, pyDisc(t.disciplineScore)); else ctx.lineTo(x, pyDisc(t.disciplineScore));
    });
    ctx.stroke();
    ctx.setLineDash([]);
    // Right-axis label
    ctx.fillStyle = 'rgba(212,168,83,0.7)';
    ctx.font = '9px ui-monospace,"SF Mono",Menlo,Consolas,monospace';
    ctx.textAlign = 'left';
    ctx.fillText('disc%', W - pad.r + 2, pad.t + 8);
    ctx.restore();
  }
}

/* ═══════════ TRADING: CALENDAR ═══════════ */
let calYear = new Date().getFullYear(), calMonth = new Date().getMonth(), calFilterDate = null;
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
function renderCalendar() {
  const trades = getTrades(), badDays = getBadDays();
  const byDate = {};
  trades.forEach(t => { if (!t.date) return; if (!byDate[t.date]) byDate[t.date] = []; byDate[t.date].push(t); });
  const badSet = new Set(badDays.map(d => d.date));
  document.getElementById('calMonthLabel').textContent = MONTHS[calMonth] + ' ' + calYear;
  const today = todayStr(), firstDay = new Date(calYear, calMonth, 1).getDay(), daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const grid = document.getElementById('calGrid'); grid.innerHTML = '';
  for (let i = 0; i < firstDay; i++) { const cell = document.createElement('div'); cell.className = 'cal-day empty'; grid.appendChild(cell); }
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const dayTrades = byDate[dateStr] || [];
    const pnl = dayTrades.reduce((s, t) => s + (t.pnl || 0), 0), hasPnl = dayTrades.some(t => t.pnl != null);
    const badDay = badDays.find(d => d.date === dateStr);
    const displayPnl = hasPnl ? pnl : (badDay?.pnl != null ? badDay.pnl : null);
    const cell = document.createElement('div');
    let cls = 'cal-day';
    if (hasPnl || displayPnl != null) cls += (displayPnl ?? 0) > 0 ? ' win' : (displayPnl ?? 0) < 0 ? ' loss' : '';
    if (dateStr === today) cls += ' today';
    if (dateStr === calFilterDate) cls += ' selected';
    if (badDay) cls += ' bad';
    cell.className = cls;
    const numEl = document.createElement('div'); numEl.className = 'cal-day-num'; numEl.textContent = d; cell.appendChild(numEl);
    if (displayPnl != null) { const pnlEl = document.createElement('div'); pnlEl.className = 'cal-day-pnl'; pnlEl.textContent = (displayPnl >= 0 ? '+' : '') + '$' + displayPnl.toFixed(0); cell.appendChild(pnlEl); }
    if (badDay) { const bdEl = document.createElement('div'); bdEl.style.cssText='font-size:8px;color:var(--color-review);font-weight:700;margin-top:1px'; bdEl.textContent='⚠'; cell.appendChild(bdEl); }
    cell.addEventListener('click', () => {
      if (calFilterDate === dateStr) { calFilterDate = null; }
      else {
        calFilterDate = dateStr;
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        document.querySelector('[data-tab="journal"]').classList.add('active');
        document.getElementById('tab-journal').classList.add('active');
        renderTradeList();
      }
      renderCalendar();
    });
    grid.appendChild(cell);
  }
}
document.getElementById('calPrev').addEventListener('click', () => { calMonth--; if (calMonth < 0) { calMonth = 11; calYear--; } calFilterDate = null; renderCalendar(); });
document.getElementById('calNext').addEventListener('click', () => { calMonth++; if (calMonth > 11) { calMonth = 0; calYear++; } calFilterDate = null; renderCalendar(); });

/* ═══════════ TRADING: JOURNAL ═══════════ */
function renderTradeList() {
  const container = document.getElementById('tradeListEl');
  const filterEl = document.getElementById('journalFilter'), filterLbl = document.getElementById('filterDateLabel');
  let trades = getTrades().sort((a, b) => b.timestamp - a.timestamp);
  if (calFilterDate) { trades = trades.filter(t => t.date === calFilterDate); filterEl.style.display = 'flex'; filterLbl.textContent = calFilterDate; }
  else { filterEl.style.display = 'none'; }
  container.innerHTML = '';
  if (trades.length === 0) { container.innerHTML = '<div class="trade-empty">No trades logged yet.<br>Use the ➕ New Trade tab to get started.</div>'; return; }
  trades.forEach(trade => {
    const item = document.createElement('div'); item.className = 'trade-item';
    if (trade.screenshot) { const img = document.createElement('img'); img.className = 'trade-thumb'; img.src = trade.screenshot; img.alt = ''; item.appendChild(img); }
    else { const ph = document.createElement('div'); ph.className = 'trade-thumb-placeholder'; ph.textContent = '📊'; item.appendChild(ph); }
    const body = document.createElement('div'); body.className = 'trade-body';
    const meta = document.createElement('div'); meta.className = 'trade-meta';
    const date = document.createElement('span'); date.className = 'trade-date'; date.textContent = trade.date || '—'; meta.appendChild(date);
    if (trade.direction) { const dir = document.createElement('span'); dir.className = `dir-badge ${trade.direction}`; dir.textContent = trade.direction === 'long' ? '↑ Long' : '↓ Short'; meta.appendChild(dir); }
    if (trade.rr != null) { const rr = document.createElement('span'); rr.className = 'trade-rr ' + (trade.rr >= 0 ? 'pos' : 'neg'); rr.textContent = trade.rr.toFixed(2) + 'R'; meta.appendChild(rr); }
    if (trade.pnl != null) { const pnl = document.createElement('span'); pnl.className = 'trade-pnl ' + (trade.pnl >= 0 ? 'pos' : 'neg'); pnl.textContent = (trade.pnl >= 0 ? '+' : '') + '$' + trade.pnl.toFixed(2); meta.appendChild(pnl); }
    if (trade.mood) { const m = document.createElement('span'); m.style.cssText = 'font-size:13px;'; m.textContent = MOOD_EMOJI[trade.mood] || ''; meta.appendChild(m); }
    body.appendChild(meta);
    if (trade.confluences && trade.confluences.length > 0) {
      const confs = document.createElement('div'); confs.className = 'trade-confs';
      trade.confluences.forEach(c => { const chip = document.createElement('span'); chip.className = 'conf-chip'; chip.textContent = c; confs.appendChild(chip); });
      body.appendChild(confs);
    }
    if (trade.tradeOff) { const off = document.createElement('div'); off.className = 'trade-desc'; off.textContent = '→ ' + trade.tradeOff + (trade.description ? ' · ' + trade.description : ''); body.appendChild(off); }
    else if (trade.description) { const desc = document.createElement('div'); desc.className = 'trade-desc'; desc.textContent = trade.description; body.appendChild(desc); }
    item.appendChild(body);
    const del = document.createElement('button'); del.className = 'trade-del'; del.textContent = '🗑'; del.title = 'Delete trade';
    del.addEventListener('click', () => { if (!confirm('Delete this trade?')) return; saveTrades(getTrades().filter(t => t.id !== trade.id)); renderTradeList(); renderStats(); renderCalendar(); drawEquityCurve(); });
    item.appendChild(del);
    container.appendChild(item);
  });
}
document.getElementById('filterClear').addEventListener('click', () => { calFilterDate = null; renderTradeList(); renderCalendar(); });

/* ═══════════ TRADING: BAD DAY MODAL ═══════════ */
let selectedBadTags = [];
document.getElementById('badDayBtn').addEventListener('click', () => {
  document.getElementById('badDayDate').value = todayStr();
  document.getElementById('badDayReason').value = ''; selectedBadTags = [];
  document.querySelectorAll('.bad-tag').forEach(t => t.classList.remove('selected'));
  document.getElementById('badDayModal').style.display = 'flex';
});
document.getElementById('badDayCancel').addEventListener('click', () => { document.getElementById('badDayModal').style.display = 'none'; });
document.getElementById('badDayModal').addEventListener('click', e => { if (e.target === document.getElementById('badDayModal')) document.getElementById('badDayModal').style.display = 'none'; });
document.querySelectorAll('.bad-tag').forEach(tag => {
  tag.addEventListener('click', () => {
    tag.classList.toggle('selected'); const t = tag.dataset.tag;
    if (tag.classList.contains('selected')) selectedBadTags.push(t); else selectedBadTags = selectedBadTags.filter(x => x !== t);
  });
});
document.getElementById('badDaySave').addEventListener('click', () => {
  const date = document.getElementById('badDayDate').value, reason = document.getElementById('badDayReason').value.trim();
  if (!date) return;
  const all = getBadDays().filter(d => d.date !== date);
  all.push({ date, tags: [...selectedBadTags], reason, ts: Date.now() });
  saveBadDays(all); document.getElementById('badDayModal').style.display = 'none'; renderCalendar();
});

/* ═══════════ TRADING: AI ANALYSIS ═══════════ */
document.getElementById('analyseBtn').addEventListener('click', async () => {
  const btn = document.getElementById('analyseBtn'), card = document.getElementById('analysisCard'), output = document.getElementById('analysisOutput');
  const trades = getTrades().slice(-30);
  if (trades.length === 0) { card.style.display = 'block'; output.textContent = 'No trades to analyse yet.'; return; }
  btn.disabled = true; btn.textContent = '⏳ Gathering data…';
  card.style.display = 'block';
  output.innerHTML = '<div class="analysis-loading"><div class="loading-dot"></div><div class="loading-dot"></div><div class="loading-dot"></div><span>Claude is reading your data…</span></div>';
  try {
    // Auto-pull Garmin data
    const garmin = await getGarminData();
    // Pull faith stats
    const faithStats = calcFaithStats ? calcFaithStats() : null;
    // Pull gym last workout (check localStorage)
    let gymSummary = null;
    try {
      const pcRaw = localStorage.getItem('po_coach_v1');
      if (pcRaw) {
        const pcData = JSON.parse(pcRaw);
        if (pcData && pcData.days) {
          const sortedDays = Object.keys(pcData.days).sort().reverse();
          if (sortedDays.length) gymSummary = { lastWorkoutDate: sortedDays[0], dayCount: sortedDays.length };
        }
      }
    } catch {}

    const garminSummary = garmin && (garmin.synced || garmin.fromCache) ? {
      hrv: garmin.hrv5MinHigh,
      sleepScore: garmin.sleepScore,
      sleepHours: garmin.sleepDurationHours,
      bodyBattery: garmin.bodyBattery,
      restingHR: garmin.heartRateResting,
      steps: garmin.steps,
      stress: garmin.stressAvg,
      fetchedAt: garmin.fetchedAt,
    } : null;

    const systemPrompt = `You are an elite trading performance coach with expertise in psychology, health, and pattern recognition.
Analyse the trader's last ${trades.length} trades alongside their health and lifestyle data.
Look for correlations between health metrics and trading performance.
Be specific, direct, and actionable. Format with clear sections using **bold headers**.`;

    const userMessage = `Here is my trading + lifestyle data for analysis:

## Trades (last ${trades.length})
${JSON.stringify(trades.map(t => ({
  date: t.date, dir: t.direction, acct: t.accountType || 'unknown',
  rr: t.rr, pnl: t.pnl, confluences: t.confluences,
  mood: t.mood, confidence: t.confidence,
  notes: t.description?.slice(0, 100)
})), null, 2)}

## Health Data (Garmin)
${garminSummary ? JSON.stringify(garminSummary, null, 2) : 'No Garmin data available'}

## Faith / Consistency
${faithStats ? `Reading streak: ${faithStats.streak} days, Bible: ${faithStats.pct}% complete, ${faithStats.weekCount} chapters this week` : 'No faith data'}

## Gym
${gymSummary ? `Last workout: ${gymSummary.lastWorkoutDate}, Total logged days: ${gymSummary.dayCount}` : 'No gym data'}

Please provide:
1. **Trading Pattern Analysis** — win/loss patterns, confluence effectiveness, direction bias
2. **Health-Performance Correlation** — how HRV/sleep/body battery correlates with results
3. **Mental State Insights** — mood/confidence vs outcomes
4. **Cross-Tab Insights** — how gym/faith consistency shows in trading discipline
5. **3 Specific Action Items** — concrete changes to make this week`;

    const res = await fetch('/.netlify/functions/claude', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-opus-4-7',
        max_tokens: 1500,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }]
      })
    });
    const data = await res.json();
    if (data.error && !data.content) throw new Error(data.error);
    const text = (data.content && data.content[0] && data.content[0].text) || data.analysis || 'No response.';
    output.innerHTML = text
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>')
      .replace(/\n/g,'<br>');
  } catch (err) {
    output.style.color = 'var(--danger)';
    output.textContent = err.message.includes('404') || err.message.includes('Failed to fetch')
      ? 'Claude function not reachable — deploy to Netlify first and set ANTHROPIC_API_KEY.'
      : 'Error: ' + err.message;
  } finally { btn.disabled = false; btn.textContent = '✨ Analyse My Patterns (last 30 trades)'; }
});

/* ═══════════ TRADING: GARMIN CORRELATION ═══════════ */
function corrWinRate(group) { if (!group.length) return null; return group.filter(t => t.pnl > 0).length / group.length * 100; }
function corrRow(label, rate, count) {
  const r = rate != null ? rate : 0;
  const color = r >= 60 ? 'var(--success)' : r >= 40 ? 'var(--warning)' : 'var(--danger)';
  return `<div class="corr-row"><span class="corr-metric">${label}</span><div class="corr-bar-wrap"><div class="corr-bar" style="width:${r.toFixed(0)}%;background:${color}"></div></div><span class="corr-rate" style="color:${color}">${r.toFixed(0)}%</span><span class="corr-count">${count}t</span></div>`;
}
function renderGarminCorr() {
  const el = document.getElementById('garminCorr');
  const trades = getTrades().filter(t => t.garmin && t.pnl != null);
  if (trades.length < 3) {
    el.innerHTML = '<p class="corr-empty">Need at least 3 trades with Garmin data saved.<br>Each trade you log automatically captures today\'s Garmin stats.</p>';
    fetchLiveGarmin(el); return;
  }
  let html = '';
  const HRV_THRESH = 50;
  const highHrv = trades.filter(t => t.garmin.hrv != null && t.garmin.hrv >= HRV_THRESH);
  const lowHrv  = trades.filter(t => t.garmin.hrv != null && t.garmin.hrv <  HRV_THRESH);
  if (highHrv.length && lowHrv.length) { html += corrRow(`HRV ≥ ${HRV_THRESH}ms`, corrWinRate(highHrv), highHrv.length); html += corrRow(`HRV < ${HRV_THRESH}ms`, corrWinRate(lowHrv), lowHrv.length); }
  const SLEEP_THRESH = 70;
  const goodSleep = trades.filter(t => t.garmin.sleepScore != null && t.garmin.sleepScore >= SLEEP_THRESH);
  const poorSleep = trades.filter(t => t.garmin.sleepScore != null && t.garmin.sleepScore <  SLEEP_THRESH);
  if (goodSleep.length && poorSleep.length) { html += corrRow(`Sleep ≥ ${SLEEP_THRESH}`, corrWinRate(goodSleep), goodSleep.length); html += corrRow(`Sleep < ${SLEEP_THRESH}`, corrWinRate(poorSleep), poorSleep.length); }
  const BB_THRESH = 60;
  const highBB = trades.filter(t => t.garmin.bodyBattery != null && t.garmin.bodyBattery >= BB_THRESH);
  const lowBB  = trades.filter(t => t.garmin.bodyBattery != null && t.garmin.bodyBattery <  BB_THRESH);
  if (highBB.length && lowBB.length) { html += corrRow(`Body Battery ≥ ${BB_THRESH}`, corrWinRate(highBB), highBB.length); html += corrRow(`Body Battery < ${BB_THRESH}`, corrWinRate(lowBB), lowBB.length); }
  if (!html) { el.innerHTML = '<p class="corr-empty">Garmin data exists but thresholds not split enough yet — keep logging.</p>'; return; }
  el.innerHTML = `<div class="corr-grid">${html}</div><p style="font-size:10px;color:var(--text-tertiary);margin-top:10px;">Based on ${trades.length} trades with health data attached.</p>`;
}
async function fetchLiveGarmin(container) {
  try {
    const g = await fetch('/.netlify/functions/garmin').then(r => r.ok ? r.json() : null);
    if (!g || g.error) return;
    const today = `<div style="margin-top:14px;padding:12px;border-radius:10px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06)">
      <div style="font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:var(--text-tertiary);margin-bottom:8px">Today's Stats (${g.date || 'live'})</div>
      <div style="display:flex;gap:16px;flex-wrap:wrap;font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;font-size:12px;font-variant-numeric:tabular-nums">
        ${g.hrv5MinHigh != null ? `<span style="color:var(--success)">HRV <strong>${g.hrv5MinHigh}ms</strong></span>` : ''}
        ${g.sleepScore != null ? `<span style="color:#A78BFA">Sleep <strong>${g.sleepScore}/100</strong></span>` : ''}
        ${g.bodyBattery != null ? `<span style="color:var(--warning)">Battery <strong>${g.bodyBattery}</strong></span>` : ''}
        ${g.heartRateResting != null ? `<span style="color:var(--danger)">RHR <strong>${g.heartRateResting}bpm</strong></span>` : ''}
        ${g.steps != null ? `<span style="color:var(--accent)">Steps <strong>${g.steps.toLocaleString()}</strong></span>` : ''}
      </div></div>`;
    container.innerHTML += today;
  } catch (_) {}
}

/* ═══════════ INIT ═══════════ */
runRollover();
runStreak();
const _todayKey    = `goals:${getActiveDateString()}`;
const _tomorrowKey = `goals:${getTomorrowDateString()}`;
makeAddHandlers(document.getElementById('goalInput'), document.getElementById('goalAddBtn'), document.getElementById('goalPolishBtn'), _todayKey, document.getElementById('polishStatus'), loadToday);
makeAddHandlers(document.getElementById('tomorrowInput'), document.getElementById('tomorrowAddBtn'), document.getElementById('tomorrowPolishBtn'), _tomorrowKey, document.getElementById('tomorrowStatus'), loadTomorrow);
loadToday();
loadTomorrow();
renderStreak();
updateDayBar();
setInterval(updateDayBar, 60000);
tick();
setInterval(tick, 5000);
fetchGarminStats().then(() => { initHome(); });

renderStats();
renderCalendar();
window.addEventListener('resize', () => { if (document.getElementById('page-trading')?.classList.contains('active')) drawEquityCurve(); });

/* ═══════════ HOME SCREEN ═══════════ */
function initHome() {
  // Date label
  const now = new Date();
  const el = document.getElementById('homeDateLabel');
  if (el) el.textContent = now.toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' });

  // Greeting by time of day
  const hour = now.getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const greetEl = document.querySelector('#page-home .home-greeting');
  if (greetEl) greetEl.textContent = `${greet}, Ryan 👋`;

  // Recovery badge
  const g = _cachedGarminData;
  if (g) {
    updateRecoveryBadge('homeRecoveryBadge', 'homeRecoveryText', g);
    const statEl = document.getElementById('homeStatRecovery');
    if (statEl) statEl.textContent = g.recoveryScore != null ? g.recoveryScore : '—';
    const subEl = document.getElementById('homeStatRecoverySub');
    if (subEl) subEl.textContent = g.recoveryStatus === 'green' ? '✅ Trade ready' : g.recoveryStatus === 'amber' ? '⚠️ Trade with caution' : g.recoveryStatus === 'red' ? '🔴 Rest recommended' : 'HRV + Sleep';
  } else {
    fetch('/.netlify/functions/garmin').then(r => r.json()).then(g => {
      _cachedGarminData = g;
      updateRecoveryBadge('homeRecoveryBadge', 'homeRecoveryText', g);
    }).catch(() => {});
  }

  // Faith streak
  try {
    const stats = calcFaithStats();
    const fEl = document.getElementById('homeStatFaith');
    if (fEl) fEl.textContent = stats.streak;
  } catch {}

  // Goals stat
  try {
    const goals = getGoals();
    const onTrack = goals.filter(g => getGoalStatus(g) === 'on-track').length;
    const gEl = document.getElementById('homeStatGoals');
    if (gEl) gEl.textContent = onTrack + '/' + goals.length;
  } catch {}

  // Finance net worth card (read from finance localStorage)
  try {
    const nwCats = ['bank','stocks','crypto','other'];
    let nwTotal = 0;
    nwCats.forEach(cat => {
      const items = JSON.parse(localStorage.getItem('nw:' + cat) || '[]');
      items.forEach(it => { nwTotal += Number(it.amount) || 0; });
    });
    const fEl = document.getElementById('homeStatFinance');
    if (fEl) fEl.textContent = nwTotal > 0 ? 'CHF ' + nwTotal.toLocaleString('en-US', {maximumFractionDigits:0}) : '—';
  } catch {}

  // Daily verse (share faith coach verse if cached)
  try {
    const cacheKey = 'faith_coach_' + new Date().toISOString().slice(0, 10);
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const c = JSON.parse(cached);
      const homeVerse = document.getElementById('homeVerseText');
      const homeRef = document.querySelector('#homeVerseBox .home-verse-ref');
      if (homeVerse) homeVerse.textContent = c.verse || '';
      if (homeRef) homeRef.textContent = c.ref || '';
    }
  } catch {}

  // Completion ring — based on today's goal completion
  try {
    const todayGoals = storeGet(`goals:${getActiveDateString()}`) || [];
    const done = todayGoals.filter(g => g.done).length;
    const total = todayGoals.length;
    const pct = total > 0 ? Math.round(done / total * 100) : 0;
    const ringEl = document.getElementById('homeRingFill');
    const pctEl = document.getElementById('homeRingPct');
    if (ringEl) {
      const circ = 2 * Math.PI * 42;
      ringEl.style.strokeDasharray = circ;
      ringEl.style.strokeDashoffset = circ - (circ * pct / 100);
    }
    if (pctEl) pctEl.textContent = pct + '%';
  } catch {}

  // Calendar + todo
  homeCalRender();
  homeTodoRender();
}

/* ═══════════ HOME: CALENDAR ═══════════ */
const CAL_KEY = 'home_calendar_events';
let _homeCalOffset = 0; // days from today's Monday
let _homeCalSelected = null; // selected date ISO string

function homeCalGetEvents() {
  try { return JSON.parse(localStorage.getItem(CAL_KEY) || '[]'); } catch { return []; }
}
function homeCalSaveEvents(arr) {
  localStorage.setItem(CAL_KEY, JSON.stringify(arr));
}
function homeCalShift(days) {
  if (days === 0) { _homeCalOffset = 0; _homeCalSelected = null; }
  else _homeCalOffset += days;
  homeCalRender();
}
function homeCalRender() {
  const weekEl = document.getElementById('homeCalWeek');
  const evtsEl = document.getElementById('homeCalEvents');
  const lblEl  = document.getElementById('homeCalMonthLabel');
  const appleEl = document.getElementById('homeCalAppleLink');
  if (!weekEl) return;
  const today = new Date();
  today.setHours(0,0,0,0);
  // Find Monday of the displayed week
  const anchor = new Date(today);
  anchor.setDate(today.getDate() - ((today.getDay() + 6) % 7) + _homeCalOffset);
  if (lblEl) {
    const opts = { month: 'long', year: 'numeric' };
    lblEl.textContent = anchor.toLocaleDateString('en-US', opts);
  }
  const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const events = homeCalGetEvents();
  weekEl.innerHTML = '';
  for (let i = 0; i < 7; i++) {
    const d = new Date(anchor); d.setDate(anchor.getDate() + i);
    const iso = d.toISOString().slice(0,10);
    const isToday = d.getTime() === today.getTime();
    const isSel = iso === _homeCalSelected;
    const hasEvt = events.some(e => e.date === iso);
    const div = document.createElement('div');
    div.className = 'home-cal-day' + (isToday ? ' today' : '') + (isSel ? ' selected' : '');
    div.innerHTML = `<span class="home-cal-day-name">${days[i]}</span><span class="home-cal-day-num">${d.getDate()}</span>${hasEvt ? '<span class="home-cal-day-dot"></span>' : '<span></span>'}`;
    div.addEventListener('click', () => {
      _homeCalSelected = iso;
      // pre-fill the date input
      const dateIn = document.getElementById('homeCalEvtDate');
      if (dateIn) dateIn.value = iso;
      homeCalRender();
    });
    weekEl.appendChild(div);
  }
  // Show events for selected (or today) date
  const showDate = _homeCalSelected || today.toISOString().slice(0,10);
  const dayEvts = events.filter(e => e.date === showDate).sort((a,b) => (a.time||'').localeCompare(b.time||''));
  if (evtsEl) {
    if (!dayEvts.length) {
      evtsEl.innerHTML = `<div style="font-size:12px;color:var(--text-tertiary);padding:4px 0">No events on ${showDate === today.toISOString().slice(0,10) ? 'today' : showDate}</div>`;
    } else {
      evtsEl.innerHTML = dayEvts.map(e => {
        const icsHref = `data:text/calendar;charset=utf-8,BEGIN:VCALENDAR%0AVERSION:2.0%0ABEGIN:VEVENT%0ASUMMARY:${encodeURIComponent(e.title)}%0ADTSTART:${(e.date||'').replace(/-/g,'')}${e.time ? 'T' + e.time.replace(':','') + '00' : ''}%0AEND:VEVENT%0AEND:VCALENDAR`;
        return `<div class="home-cal-evt">
          <span class="home-cal-evt-dot"></span>
          <span class="home-cal-evt-title">${e.title}</span>
          ${e.time ? `<span class="home-cal-evt-time">${e.time}</span>` : ''}
          <a class="home-cal-evt-ical" href="${icsHref}" download="${e.title.replace(/\s/g,'_')}.ics" title="Add to Apple Calendar">🍎</a>
          <button class="home-cal-evt-del" onclick="homeCalDeleteEvent('${e.id}')">✕</button>
        </div>`;
      }).join('');
    }
  }
  // Apple Calendar webcal link (opens current month in Apple Calendar on iOS/macOS)
  if (appleEl) {
    appleEl.href = 'webcal://p34-caldav.icloud.com';
    appleEl.title = 'Open Apple Calendar';
  }
}
function homeCalAddEvent() {
  const titleEl = document.getElementById('homeCalEvtTitle');
  const dateEl  = document.getElementById('homeCalEvtDate');
  const timeEl  = document.getElementById('homeCalEvtTime');
  const title = (titleEl?.value || '').trim();
  const date  = dateEl?.value || new Date().toISOString().slice(0,10);
  const time  = timeEl?.value || '';
  if (!title) { titleEl?.focus(); return; }
  const events = homeCalGetEvents();
  events.push({ id: Date.now().toString(36), title, date, time });
  homeCalSaveEvents(events);
  if (titleEl) titleEl.value = '';
  _homeCalSelected = date;
  homeCalRender();
}
function homeCalDeleteEvent(id) {
  homeCalSaveEvents(homeCalGetEvents().filter(e => e.id !== id));
  homeCalRender();
}
// Enter key support
document.addEventListener('DOMContentLoaded', () => {
  const inp = document.getElementById('homeCalEvtTitle');
  if (inp) inp.addEventListener('keydown', e => { if (e.key === 'Enter') homeCalAddEvent(); });
  const todoInp = document.getElementById('homeTodoInput');
  if (todoInp) todoInp.addEventListener('keydown', e => { if (e.key === 'Enter') homeTodoAdd(); });
});

/* ═══════════ HOME: TODO (today's tasks) ═══════════ */
function homeTodoRender() {
  const el = document.getElementById('homeTodoList');
  const countEl = document.getElementById('homeTodoCount');
  if (!el) return;
  const key = `goals:${getActiveDateString ? getActiveDateString() : new Date().toISOString().slice(0,10)}`;
  const goals = storeGet ? (storeGet(key) || []) : (JSON.parse(localStorage.getItem(key) || '[]'));
  const done = goals.filter(g => g.done).length;
  if (countEl) countEl.textContent = `${done} / ${goals.length}`;
  if (!goals.length) {
    el.innerHTML = '<div style="font-size:12px;color:var(--text-tertiary);padding:4px 0">No tasks yet — add one below</div>';
    return;
  }
  el.innerHTML = goals.map((g, i) => `
    <div class="home-todo-row">
      <div class="home-todo-cb${g.done ? ' done' : ''}" onclick="homeTodoToggle(${i})"></div>
      <span class="home-todo-text${g.done ? ' done' : ''}">${g.text}</span>
      <button class="home-todo-del" onclick="homeTodoDel(${i})">✕</button>
    </div>`).join('');
}
function homeTodoToggle(idx) {
  const key = `goals:${getActiveDateString()}`;
  const goals = storeGet(key) || [];
  if (goals[idx]) { goals[idx].done = !goals[idx].done; storeSet(key, goals); homeTodoRender(); }
}
function homeTodoDel(idx) {
  const key = `goals:${getActiveDateString()}`;
  const goals = storeGet(key) || [];
  goals.splice(idx, 1); storeSet(key, goals); homeTodoRender();
}
function homeTodoAdd() {
  const inp = document.getElementById('homeTodoInput');
  const text = (inp?.value || '').trim();
  if (!text) { inp?.focus(); return; }
  const key = `goals:${getActiveDateString()}`;
  const goals = storeGet(key) || [];
  goals.push({ text, done: false });
  storeSet(key, goals);
  if (inp) inp.value = '';
  homeTodoRender();
}

function updateRecoveryBadge(badgeId, textId, g) {
  const badge = document.getElementById(badgeId);
  const text  = document.getElementById(textId);
  if (!badge || !text) return;
  badge.className = 'recovery-badge ' + (g?.recoveryStatus || 'unknown');
  if (g?.synced || g?.fromCache) {
    const score = g.recoveryScore != null ? g.recoveryScore : '—';
    const status = g.recoveryStatus === 'green' ? 'Green — Trade Ready' : g.recoveryStatus === 'amber' ? 'Amber — Trade with Caution' : g.recoveryStatus === 'red' ? 'Red — Rest Day' : 'Recovery Unknown';
    text.textContent = `Recovery ${score} · ${status}`;
  } else {
    text.textContent = 'Garmin not synced — open app to sync';
  }
}

/* ═══════════ PRE-MARKET CHECKLIST ═══════════ */
const PM_KEY = 'pm_checklist_';
function pmTodayKey() { return PM_KEY + todayStr(); }

function pmGetState() {
  try { return JSON.parse(localStorage.getItem(pmTodayKey()) || '{}'); } catch { return {}; }
}
function pmSaveState(s) { localStorage.setItem(pmTodayKey(), JSON.stringify(s)); }

function pmToggle(el) {
  const id = el.dataset.pmid;
  const state = pmGetState();
  state[id] = !state[id];
  pmSaveState(state);
  el.classList.toggle('checked', !!state[id]);
  if (state[id]) el.classList.add('anim-pop');
  setTimeout(() => el.classList.remove('anim-pop'), 300);
  renderPmStatus();
}

function renderPmStatus() {
  const state = pmGetState();
  const items = document.querySelectorAll('#pmChecklistItems .premarket-item');
  const total = items.length;
  let checked = 0;
  items.forEach(item => {
    const id = item.dataset.pmid;
    const on = !!state[id];
    item.classList.toggle('checked', on);
    if (on) checked++;
  });
  const allDone = checked === total;
  const lockMsg = document.getElementById('pmLockMsg');
  if (lockMsg) lockMsg.textContent = allDone ? '✅ All checks passed — you\'re cleared to trade!' : `Complete all items above to unlock the New Trade form (${checked}/${total})`;
  // Update home screen pre-market status
  const homeStatus = document.getElementById('homePremarketStatus');
  if (homeStatus) {
    homeStatus.textContent = allDone ? 'Ready ✅' : `${checked}/${total}`;
    homeStatus.className = 'home-premarket-status ' + (allDone ? 'ready' : 'not-ready');
  }
  // Update garmin recovery badge in pre-market
  if (_cachedGarminData) {
    updateRecoveryBadge('pmRecoveryBadge', 'pmRecoveryText', _cachedGarminData);
    const sub = document.getElementById('pmRecoverySub');
    if (sub && _cachedGarminData.fetchedAt) {
      const t = new Date(_cachedGarminData.fetchedAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
      sub.textContent = `HRV: ${_cachedGarminData.hrv5MinHigh ?? '—'}ms · Sleep: ${_cachedGarminData.sleepScore ?? '—'} · Battery: ${_cachedGarminData.bodyBattery ?? '—'} · as of ${t}`;
    }
  }
}

/* ═══════════ ECONOMIC CALENDAR ═══════════ */
function loadEconomicCalendar() {
  const el = document.getElementById('pmNewsItems');
  if (!el) return;
  const today = new Date().toISOString().slice(0, 10);
  el.innerHTML = `<div style="font-size:12px;color:var(--text-tertiary);padding:6px 0;display:flex;gap:12px;flex-wrap:wrap">
    <a href="https://www.forexfactory.com/calendar?day=${today}" target="_blank" rel="noopener" style="color:var(--color-trading);font-weight:600">📅 ForexFactory Calendar</a>
    <a href="https://www.investing.com/economic-calendar/" target="_blank" rel="noopener" style="color:var(--color-trading);font-weight:600">📊 Investing.com Calendar</a>
    <a href="https://www.marketwatch.com/economy-politics/calendar" target="_blank" rel="noopener" style="color:var(--color-trading);font-weight:600">📰 MarketWatch</a>
  </div>`;
}

/* ═══════════ DISCIPLINE SCORE ═══════════ */
function drToggle(el) {
  el.classList.toggle('on');
  el.classList.add('anim-pop');
  setTimeout(() => el.classList.remove('anim-pop'), 300);
  updateDisciplineDisplay();
}

function updateDisciplineDisplay() {
  const rules = document.querySelectorAll('.discipline-rule');
  const total = rules.length;
  const on = [...rules].filter(r => r.classList.contains('on')).length;
  const pct = total > 0 ? Math.round(on / total * 100) : 0;
  const el = document.getElementById('disciplineScoreDisplay');
  if (el) {
    el.textContent = pct + '%';
    el.style.color = pct >= 80 ? 'var(--success)' : pct >= 60 ? 'var(--warning)' : 'var(--danger)';
  }
}

function getDisciplineScore() {
  const rules = document.querySelectorAll('.discipline-rule');
  const total = rules.length;
  const on = [...rules].filter(r => r.classList.contains('on')).length;
  return total > 0 ? Math.round(on / total * 100) : null;
}

function clearDisciplineRules() {
  document.querySelectorAll('.discipline-rule').forEach(r => r.classList.remove('on'));
  updateDisciplineDisplay();
}

// Update saveTradeBtn to include discipline score
const _origSaveTrade = document.getElementById('saveTradeBtn')?.onclick;
document.getElementById('saveTradeBtn')?.addEventListener('click', () => {
  // The discipline score is now added inside the existing save handler via _getDisciplineForSave
}, false);
window._getDisciplineForSave = getDisciplineScore;

/* ═══════════ TRADE RENDERING (colour-coded + replay) ═══════════ */
function renderTradeCard(trade) {
  const hasBadDay = getBadDays().find(d => d.date === trade.date);
  const pnlVal = trade.pnl;
  const cls = hasBadDay ? 'bad-day' : (pnlVal > 0 ? 'win' : pnlVal < 0 ? 'loss' : 'breakeven');
  const pnlStr = pnlVal != null ? (pnlVal >= 0 ? '+$' : '-$') + Math.abs(pnlVal).toFixed(0) : '—';
  const pnlCls = pnlVal != null ? (pnlVal >= 0 ? 'pos' : 'neg') : '';
  const disc = trade.disciplineScore != null ? `<span class="trade-card-disc">${trade.disciplineScore}%</span>` : '';
  const acct = trade.accountType ? `<span class="trade-card-rr" style="margin-left:4px">${trade.accountType}</span>` : '';
  return `<div class="trade-card ${cls}" onclick="openReplayModal('${trade.id}')">
    <div class="trade-card-header">
      <span class="trade-card-date">${trade.date} ${trade.timeOfDay ? trade.timeOfDay : ''}</span>
      <span class="trade-card-dir ${trade.direction}">${trade.direction === 'long' ? '↑ Long' : '↓ Short'}</span>
      ${acct}
      ${trade.rr != null ? `<span class="trade-card-rr">${parseFloat(trade.rr).toFixed(1)}R</span>` : ''}
      ${disc}
      <span class="trade-card-pnl ${pnlCls}">${pnlStr}</span>
    </div>
    ${trade.confluences?.length ? `<div style="padding:0 14px 10px;display:flex;gap:4px;flex-wrap:wrap">${trade.confluences.map(c=>`<span style="font-size:10px;padding:2px 6px;border-radius:4px;background:rgba(255,255,255,0.06);color:var(--text-tertiary)">${c}</span>`).join('')}</div>` : ''}
  </div>`;
}

function openReplayModal(tradeId) {
  const trade = getTrades().find(t => t.id === tradeId);
  if (!trade) return;
  const modal = document.getElementById('replayModal');
  if (!modal) return;
  // Screenshot
  const img = document.getElementById('replayScreenshot');
  if (img) { img.src = trade.screenshot || ''; img.style.display = trade.screenshot ? 'block' : 'none'; }
  // Meta grid
  const metaGrid = document.getElementById('replayMetaGrid');
  if (metaGrid) {
    const items = [
      { label: 'Date', val: trade.date },
      { label: 'Time', val: trade.timeOfDay || '—' },
      { label: 'Direction', val: trade.direction?.toUpperCase() || '—' },
      { label: 'Account', val: trade.accountType || '—' },
      { label: 'R:R', val: trade.rr != null ? parseFloat(trade.rr).toFixed(2) + 'R' : '—' },
      { label: 'PnL', val: trade.pnl != null ? (trade.pnl >= 0 ? '+$' : '-$') + Math.abs(trade.pnl).toFixed(0) : '—' },
      { label: 'Mood', val: trade.mood ? trade.mood + '/10' : '—' },
      { label: 'Confidence', val: trade.confidence ? trade.confidence + '/10' : '—' },
      { label: 'Discipline', val: trade.disciplineScore != null ? trade.disciplineScore + '%' : '—' },
    ];
    metaGrid.innerHTML = items.map(i => `<div class="replay-meta-item"><div class="replay-meta-label">${i.label}</div><div class="replay-meta-val">${i.val}</div></div>`).join('');
  }
  const notes = document.getElementById('replayNotes');
  if (notes) notes.textContent = trade.description || '';
  const disc = document.getElementById('replayDiscipline');
  if (disc && trade.disciplineRules) {
    disc.innerHTML = '<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-tertiary);margin-bottom:6px">Rules</div>' +
      Object.entries(trade.disciplineRules).map(([k,v]) =>
        `<div style="display:flex;align-items:center;gap:8px;font-size:12px;padding:3px 0"><span style="color:${v?'var(--success)':'var(--danger)'}">${v?'✓':'✗'}</span><span style="color:var(--text-secondary)">${k.replace(/_/g,' ')}</span></div>`
      ).join('');
  }
  modal.classList.add('open');
}
window.closeReplayModal = function() { document.getElementById('replayModal')?.classList.remove('open'); };
document.getElementById('replayModal')?.addEventListener('click', e => { if (e.target === document.getElementById('replayModal')) closeReplayModal(); });

/* ═══════════ BAD DAY CALENDAR: PURPLE ═══════════ */
// Patch existing renderCalendar to highlight bad days in purple
const _origRenderCalendar = typeof renderCalendar === 'function' ? renderCalendar : null;

/* ═══════════ CSV IMPORT ═══════════ */
let _csvParsed = [];
window.openCsvModal = function() { document.getElementById('csvModal')?.classList.add('open'); };
window.closeCsvModal = function() { document.getElementById('csvModal')?.classList.remove('open'); _csvParsed = []; const p = document.getElementById('csvPreview'); if (p) p.innerHTML = ''; const btn = document.getElementById('csvImportBtn'); if (btn) btn.style.display = 'none'; };

function parseCsvLine(line) {
  const result = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') { inQ = !inQ; }
    else if (line[i] === ',' && !inQ) { result.push(cur.trim()); cur = ''; }
    else cur += line[i];
  }
  result.push(cur.trim());
  return result;
}

function processCsvFile(file) {
  const reader = new FileReader();
  reader.onload = e => {
    const text = e.target.result;
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) { document.getElementById('csvPreview').textContent = 'File appears empty.'; return; }
    const headers = parseCsvLine(lines[0]).map(h => h.toLowerCase().trim());
    const trades = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = parseCsvLine(lines[i]);
      const row = {};
      headers.forEach((h, idx) => { row[h] = cols[idx] || ''; });
      const dateVal = row['date'] || row['trade date'] || '';
      const timeVal = row['time'] || row['trade time'] || '';
      const dirVal = (row['direction'] || row['side'] || row['type'] || '').toLowerCase();
      const pnlVal = parseFloat(row['pnl'] || row['profit'] || row['p&l'] || '0');
      const rrVal = parseFloat(row['rr'] || row['r:r'] || row['reward risk'] || '');
      if (!dateVal) continue;
      trades.push({
        id: uid(), date: dateVal, timeOfDay: timeVal,
        direction: dirVal.includes('short') ? 'short' : 'long',
        pnl: isNaN(pnlVal) ? null : pnlVal,
        rr: isNaN(rrVal) ? null : rrVal,
        confluences: (row['confluences'] || row['confluence'] || '').split(';').map(s=>s.trim()).filter(Boolean),
        description: row['notes'] || row['description'] || row['comments'] || '',
        accountType: row['account'] || row['type'] || 'eval',
        screenshot: null, garmin: null,
        timestamp: Date.now(),
      });
    }
    _csvParsed = trades;
    const prev = document.getElementById('csvPreview');
    if (prev) prev.textContent = `Found ${trades.length} trades. Click Import to add them.`;
    const btn = document.getElementById('csvImportBtn');
    if (btn) btn.style.display = 'block';
  };
  reader.readAsText(file);
}

window.importCsv = function() {
  if (!_csvParsed.length) return;
  const existing = getTrades();
  const allTrades = [...existing, ..._csvParsed];
  saveTrades(allTrades);
  closeCsvModal();
  renderStats(); renderCalendar(); renderTradeList();
  const prev = document.getElementById('csvPreview');
  if (prev) prev.textContent = `✓ ${_csvParsed.length} trades imported.`;
};

const csvInput = document.getElementById('csvFileInput');
if (csvInput) csvInput.addEventListener('change', e => { if (e.target.files[0]) processCsvFile(e.target.files[0]); });
const csvDrop = document.getElementById('csvDropZone');
if (csvDrop) {
  csvDrop.addEventListener('dragover', e => { e.preventDefault(); csvDrop.classList.add('drag-over'); });
  csvDrop.addEventListener('dragleave', () => csvDrop.classList.remove('drag-over'));
  csvDrop.addEventListener('drop', e => { e.preventDefault(); csvDrop.classList.remove('drag-over'); if (e.dataTransfer.files[0]) processCsvFile(e.dataTransfer.files[0]); });
}

/* ═══════════ FAITH: GRATITUDE LOG ═══════════ */
const GRATITUDE_KEY = 'faith_gratitude';

function getGratitude() {
  try { return JSON.parse(localStorage.getItem(GRATITUDE_KEY) || '{}'); } catch { return {}; }
}
function saveGratitudeData(d) { localStorage.setItem(GRATITUDE_KEY, JSON.stringify(d)); }

function loadGratitude() {
  const today = todayStr();
  const data = getGratitude();
  const todayEntry = data[today] || {};
  for (let i = 1; i <= 3; i++) {
    const el = document.getElementById('gratitude' + i);
    if (el) el.value = todayEntry['g' + i] || '';
  }
}

window.saveGratitude = function() {
  const today = todayStr();
  const data = getGratitude();
  data[today] = {};
  for (let i = 1; i <= 3; i++) {
    const el = document.getElementById('gratitude' + i);
    if (el) data[today]['g' + i] = el.value.trim();
  }
  saveGratitudeData(data);
  // Prune old entries (keep 30 days)
  const keys = Object.keys(data).sort().slice(-30);
  const pruned = {};
  keys.forEach(k => { pruned[k] = data[k]; });
  saveGratitudeData(pruned);
  const btns = document.querySelectorAll('.gratitude-card .faith-btn');
  btns.forEach(b => { b.textContent = '✓ Saved!'; setTimeout(() => { b.textContent = 'Save'; }, 2000); });
};

/* ═══════════ FAITH: SUNDAY REFLECTION ═══════════ */
const FAITH_REFLECTIONS_KEY = 'faith_reflections';

function getFaithReflections() {
  try { return JSON.parse(localStorage.getItem(FAITH_REFLECTIONS_KEY) || '[]'); } catch { return []; }
}

function showSundayReflection() {
  const card = document.getElementById('sundayReflectionCard');
  const today = new Date();
  const isSunday = today.getDay() === 0;
  const todayKey = today.toISOString().slice(0, 10);
  const existing = getFaithReflections().find(r => r.date === todayKey);
  if (!card) return;
  if (isSunday || true) { // always show for now (user can close)
    card.style.display = 'block';
    if (!existing && !card.dataset.prompted) {
      card.dataset.prompted = '1';
      generateSundayPrompt();
    } else if (existing) {
      const el = document.getElementById('sundayReflectionInput');
      if (el) el.value = existing.response || '';
      const promptEl = document.getElementById('sundayPromptText');
      if (promptEl) promptEl.textContent = existing.prompt || '';
    }
  }
}

async function generateSundayPrompt() {
  const promptEl = document.getElementById('sundayPromptText');
  if (!promptEl) return;
  promptEl.textContent = 'Generating your reflection question…';
  const stats = calcFaithStats();
  const d = getFaithBible();
  const weekAgo = new Date(Date.now() - 7*86400000).toISOString().slice(0,10);
  const recentBooks = [];
  BIBLE_BOOKS.forEach((book, bi) => {
    for (let ci = 1; ci <= book.c; ci++) {
      const rd = d[bibleKey(bi, ci)];
      if (rd && rd >= weekAgo) { recentBooks.push(book.n); break; }
    }
  });
  const systemMsg = 'You are a thoughtful Christian spiritual director generating a personal Sunday reflection question.';
  const userMsg = `Generate ONE deep, personalised reflection question for someone who:
- Has a ${stats.streak}-day Bible reading streak
- Read ${stats.weekCount} chapters this week (books: ${recentBooks.join(', ') || 'none yet'})
- Has ${stats.pct}% of the Bible completed
The question should connect their readings to their daily life. Respond with ONLY the question itself, nothing else.`;
  try {
    const res = await fetch('/.netlify/functions/claude', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ system: systemMsg, messages: [{ role: 'user', content: userMsg }], max_tokens: 200 })
    });
    const data = await res.json();
    const q = (data.content?.[0]?.text || data.result || '').trim();
    if (q) { promptEl.textContent = q; promptEl.dataset.prompt = q; }
    else promptEl.textContent = 'What is God teaching you this week through His Word?';
  } catch { promptEl.textContent = 'What is God teaching you this week through His Word?'; }
}

window.saveSundayReflection = function() {
  const promptEl = document.getElementById('sundayPromptText');
  const inputEl  = document.getElementById('sundayReflectionInput');
  if (!inputEl) return;
  const reflections = getFaithReflections();
  const today = todayStr();
  const existing = reflections.findIndex(r => r.date === today);
  const entry = { date: today, prompt: promptEl?.textContent || '', response: inputEl.value.trim() };
  if (existing >= 0) reflections[existing] = entry; else reflections.push(entry);
  localStorage.setItem(FAITH_REFLECTIONS_KEY, JSON.stringify(reflections.slice(-52)));
  const btn = document.querySelector('#sundayReflectionCard .faith-btn');
  if (btn) { btn.textContent = '✓ Saved!'; setTimeout(() => { btn.textContent = 'Save Reflection'; }, 2000); }
};

/* ═══════════ BIBLE TESTAMENT RINGS ═══════════ */
function updateBibleRings() {
  const d = getFaithBible();
  const circ = 2 * Math.PI * 38;
  let otRead = 0, otTotal = 0, ntRead = 0, ntTotal = 0;
  BIBLE_BOOKS.forEach((book, bi) => {
    for (let ci = 1; ci <= book.c; ci++) {
      if (book.t === 'OT') { otTotal++; if (d[bibleKey(bi, ci)]) otRead++; }
      else { ntTotal++; if (d[bibleKey(bi, ci)]) ntRead++; }
    }
  });
  function setRing(fillId, pctId, read, total) {
    const pct = total > 0 ? Math.round(read / total * 100) : 0;
    const fill = document.getElementById(fillId);
    const pctEl = document.getElementById(pctId);
    if (fill) { fill.style.strokeDasharray = circ; fill.style.strokeDashoffset = circ - (circ * pct / 100); }
    if (pctEl) pctEl.textContent = pct + '%';
  }
  setRing('otRingFill', 'otRingPct', otRead, otTotal);
  setRing('ntRingFill', 'ntRingPct', ntRead, ntTotal);
  setRing('allRingFill', 'allRingPct', otRead + ntRead, otTotal + ntTotal);
}


/* ═══════════ WEEKLY REVIEW ═══════════ */
const REVIEWS_KEY = 'hub_weekly_reviews';

function getReviews() { try { return JSON.parse(localStorage.getItem(REVIEWS_KEY) || '[]'); } catch { return []; } }
function saveReview(r) {
  const reviews = getReviews();
  reviews.unshift(r);
  localStorage.setItem(REVIEWS_KEY, JSON.stringify(reviews.slice(0, 52)));
}

function getWeekLabel() {
  const now = new Date();
  const start = new Date(now); start.setDate(now.getDate() - now.getDay());
  const end   = new Date(start); end.setDate(start.getDate() + 6);
  return `Week of ${start.toLocaleDateString('en-GB',{month:'short',day:'numeric'})} – ${end.toLocaleDateString('en-GB',{month:'short',day:'numeric'})}`;
}

function initWeeklyReview() {
  const sub = document.getElementById('reviewWeekLabel');
  if (sub) sub.textContent = getWeekLabel();
  renderReviewHistory();
  // Restore saved best moment
  const weekKey = 'review_best_' + new Date().toISOString().slice(0,7);
  const saved = localStorage.getItem(weekKey);
  const bm = document.getElementById('reviewBestMoment');
  if (bm && saved) bm.value = saved;
  if (bm) bm.addEventListener('input', () => localStorage.setItem(weekKey, bm.value));
}

function renderReviewHistory() {
  const el = document.getElementById('reviewHistory');
  if (!el) return;
  const reviews = getReviews();
  if (!reviews.length) { el.innerHTML = '<div style="font-size:13px;color:var(--text-tertiary);text-align:center;padding:20px">No weekly reports yet</div>'; return; }
  el.innerHTML = reviews.slice(0, 10).map(r => `
    <div class="review-history-item" onclick="showStoredReview(${JSON.stringify(r).replace(/"/g,'&quot;')})">
      <div class="review-history-date">${r.weekLabel || r.date || ''}</div>
      <div class="review-history-snippet">${(r.summary || '').slice(0, 100)}…</div>
    </div>`).join('');
}

window.showStoredReview = function(r) {
  if (typeof r === 'string') try { r = JSON.parse(r); } catch { return; }
  displayReviewReport(r);
};

function displayReviewReport(report) {
  const out = document.getElementById('reviewReportOutput');
  if (out) out.style.display = 'block';
  // Scores
  const scoresEl = document.getElementById('reviewScoreRows');
  if (scoresEl && report.scores) {
    const cols = { trading: 'var(--color-trading)', faith: 'var(--color-faith)', health: 'var(--color-health)', gym: 'var(--color-gym)', overall: 'var(--color-review)' };
    scoresEl.innerHTML = Object.entries(report.scores).map(([k, v]) => {
      const color = cols[k] || 'var(--text-primary)';
      return `<div class="review-score-row">
        <span class="review-score-label">${k.charAt(0).toUpperCase()+k.slice(1)}</span>
        <div class="review-score-bar"><div class="review-score-fill" style="width:${v*10}%;background:${color}"></div></div>
        <span class="review-score-num" style="color:${color}">${v}/10</span>
      </div>`;
    }).join('');
  }
  const sumEl = document.getElementById('reviewSummaryPara');
  if (sumEl) sumEl.textContent = report.summary || '';
  const impEl = document.getElementById('reviewImprove');
  if (impEl) impEl.textContent = '🔧 Improve: ' + (report.improve || '');
  const celEl = document.getElementById('reviewCelebrate');
  if (celEl) celEl.textContent = '🎉 Celebrate: ' + (report.celebrate || '');
}

window.generateWeeklyReview = async function() {
  const btn = document.getElementById('reviewGenerateBtn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Generating…'; }

  // Gather all data
  const trades = getTrades().filter(t => {
    const now = new Date(); const weekAgo = new Date(); weekAgo.setDate(now.getDate() - 7);
    return new Date(t.date) >= weekAgo;
  });
  const garmin = _cachedGarminData;
  const faithStats = calcFaithStats ? calcFaithStats() : null;
  let gymSummary = null;
  try {
    const pc = JSON.parse(localStorage.getItem('po_coach_v1') || '{}');
    if (pc.days) { const days = Object.keys(pc.days).sort().reverse(); gymSummary = { sessions: days.length, lastDate: days[0] }; }
  } catch {}

  const tradePnl = trades.reduce((s, t) => s + (t.pnl || 0), 0);
  const avgDisc = trades.filter(t => t.disciplineScore != null).length
    ? Math.round(trades.filter(t => t.disciplineScore != null).reduce((s, t) => s + t.disciplineScore, 0) / trades.filter(t => t.disciplineScore != null).length)
    : null;
  const bestMoment = (document.getElementById('reviewBestMoment')?.value || '').trim();

  const prompt = `Generate a concise weekly performance review for a trader/athlete. Return ONLY a JSON object with no markdown.

Data:
- Trading: ${trades.length} trades, PnL $${tradePnl.toFixed(0)}, avg discipline ${avgDisc != null ? avgDisc + '%' : 'unknown'}
- Garmin: HRV ${garmin?.hrv5MinHigh ?? '—'}ms, Sleep ${garmin?.sleepScore ?? '—'}/100, Body Battery ${garmin?.bodyBattery ?? '—'}, Recovery ${garmin?.recoveryScore ?? '—'}
- Faith: ${faithStats?.streak ?? 0}-day streak, ${faithStats?.weekCount ?? 0} chapters this week
- Gym: ${gymSummary ? gymSummary.sessions + ' sessions this week' : 'no data'}
- Best moment: ${bestMoment || '(not provided)'}

Return JSON: {"scores":{"trading":0-10,"faith":0-10,"health":0-10,"gym":0-10,"overall":0-10},"summary":"3-4 sentences","improve":"one specific thing","celebrate":"one specific win"}`;

  try {
    const res = await fetch('/.netlify/functions/claude', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ system: 'You are an elite performance coach. Be honest, direct and specific.', messages: [{ role:'user', content: prompt }], max_tokens: 600 })
    });
    const data = await res.json();
    const raw = data.content?.[0]?.text || data.result || '';
    const match = raw.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(match ? match[0] : raw);
    const review = {
      date: todayStr(), weekLabel: getWeekLabel(),
      scores: parsed.scores || {}, summary: parsed.summary || '',
      improve: parsed.improve || '', celebrate: parsed.celebrate || '',
      bestMoment, tradingData: { pnl: tradePnl, trades: trades.length, discipline: avgDisc },
    };
    saveReview(review);
    displayReviewReport(review);
    renderReviewHistory();
  } catch (err) {
    const out = document.getElementById('reviewReportOutput');
    if (out) { out.style.display = 'block'; out.innerHTML = `<div class="review-card"><div style="color:var(--danger)">Error: ${err.message}</div></div>`; }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '✦ Generate AI Weekly Report'; }
  }
};

/* ═══════════ GOALS TAB ═══════════ */
const GOALS_KEY = 'hub_goals';

function getGoals() { try { return JSON.parse(localStorage.getItem(GOALS_KEY) || '[]'); } catch { return []; } }
function saveGoals(g) { localStorage.setItem(GOALS_KEY, JSON.stringify(g)); }

function getGoalStatus(g) {
  const pct = g.target > 0 ? g.current / g.target : 0;
  if (!g.deadline) return pct >= 0.8 ? 'on-track' : pct >= 0.5 ? 'at-risk' : 'behind';
  const now = Date.now(); const deadline = new Date(g.deadline).getTime();
  const total = deadline - new Date(g.created || now).getTime();
  const elapsed = now - new Date(g.created || now).getTime();
  const timeUsed = total > 0 ? elapsed / total : 1;
  if (pct >= timeUsed * 0.9) return 'on-track';
  if (pct >= timeUsed * 0.6) return 'at-risk';
  return 'behind';
}

function renderGoals() {
  const el = document.getElementById('goalsList');
  if (!el) return;
  const goals = getGoals();
  if (!goals.length) { el.innerHTML = '<div style="text-align:center;color:var(--text-tertiary);font-size:13px;padding:24px">No goals yet — add one above</div>'; return; }
  el.innerHTML = goals.map((g, i) => {
    const pct = g.target > 0 ? Math.min(100, Math.round(g.current / g.target * 100)) : 0;
    const status = getGoalStatus(g);
    const statusLabel = status === 'on-track' ? '✅ On Track' : status === 'at-risk' ? '⚠️ At Risk' : '🔴 Behind';
    const deadline = g.deadline ? `Due ${new Date(g.deadline).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}` : '';
    return `<div class="goals-card">
      <button class="goals-del-btn" onclick="deleteGoal(${i})">✕</button>
      <div class="goals-card-title">${g.title}</div>
      <div class="goals-card-deadline">${deadline}</div>
      <div class="goals-bar-wrap"><div class="goals-bar-fill ${status}" style="width:${pct}%"></div></div>
      <div class="goals-meta-row">
        <span class="goals-value">${g.current} / ${g.target} ${g.unit || ''} (${pct}%)</span>
        <span class="goals-status-badge ${status}">${statusLabel}</span>
      </div>
    </div>`;
  }).join('');
}

window.addGoal = function() {
  const title    = document.getElementById('goalTitle')?.value.trim();
  const target   = parseFloat(document.getElementById('goalTarget')?.value);
  const current  = parseFloat(document.getElementById('goalCurrent')?.value || '0');
  const deadline = document.getElementById('goalDeadline')?.value;
  const unit     = document.getElementById('goalUnit')?.value.trim();
  if (!title || isNaN(target)) return;
  const goals = getGoals();
  goals.push({ id: uid(), title, target, current: isNaN(current) ? 0 : current, deadline, unit, created: todayStr() });
  saveGoals(goals);
  ['goalTitle','goalTarget','goalCurrent','goalDeadline','goalUnit'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  renderGoals();
};

window.deleteGoal = function(idx) {
  const goals = getGoals();
  goals.splice(idx, 1);
  saveGoals(goals);
  renderGoals();
};

/* ═══════════ TRADE LIST OVERRIDE (colour-coded) ═══════════ */
// Override the existing renderTradeList to use new coloured cards
const _origRenderTradeList = typeof renderTradeList === 'function' ? renderTradeList : null;
if (_origRenderTradeList) {
  window.renderTradeList = function(filterDate) {
    const el = document.getElementById('tradeListEl');
    if (!el) return;
    let trades = getTrades().slice().reverse();
    const journalFilter = document.getElementById('journalFilter');
    if (filterDate) {
      trades = trades.filter(t => t.date === filterDate);
      if (journalFilter) { journalFilter.style.display = 'flex'; document.getElementById('filterDateLabel').textContent = filterDate; }
    } else {
      if (journalFilter) journalFilter.style.display = 'none';
    }
    if (!trades.length) { el.innerHTML = '<div class="empty-state">No trades logged yet</div>'; return; }
    el.innerHTML = trades.map(t => renderTradeCard(t)).join('');
  };
}

/* ═══════════ SAVE TRADE PATCH (add discipline score + time) ═══════════ */
// Patch saveTradeBtn to inject disciplineScore before saving
const _origSaveHandler = document.getElementById('saveTradeBtn');
if (_origSaveHandler) {
  const newBtn = _origSaveHandler.cloneNode(true);
  _origSaveHandler.parentNode.replaceChild(newBtn, _origSaveHandler);
  newBtn.addEventListener('click', async () => {
    const pnl   = parseFloat(document.getElementById('pnlInput').value);
    const rrRaw = parseFloat(document.getElementById('rrInput').value);
    const statusEl = document.getElementById('formStatus');
    const confluences = [...document.querySelectorAll('#confGrid input:checked')].map(c => c.value);
    const disciplineScore = getDisciplineScore();
    const disciplineRules = {};
    document.querySelectorAll('.discipline-rule').forEach(r => { disciplineRules[r.dataset.rule] = r.classList.contains('on'); });
    const timeOfDay = new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
    const trade = {
      id: uid(), date: todayStr(), timestamp: Date.now(), screenshot: currentScreenshot,
      direction: currentDir, accountType: currentAcct,
      rr: isNaN(rrRaw) ? null : rrRaw,
      pnl: isNaN(pnl) ? null : pnl, confluences,
      disciplineScore, disciplineRules, timeOfDay,
      tradeOff:    document.getElementById('tradeOff').value,
      mood:        parseInt(document.getElementById('moodSlider').value),
      confidence:  parseInt(document.getElementById('confSlider').value),
      description: document.getElementById('tradeDesc').value.trim(),
      garmin: null,
    };
    const trades = getTrades(); trades.push(trade); saveTrades(trades);
    const flash = (el, msg, color, ms=3000) => { el.textContent=msg; el.style.color=color; setTimeout(()=>{el.textContent='';el.style.color=''},ms); };
    flash(statusEl, '✓ Trade saved!', 'var(--success)');
    clearForm(); clearDisciplineRules(); renderStats(); renderCalendar(); drawEquityCurve();
    try {
      const g = await fetch('/.netlify/functions/garmin').then(r=>r.ok?r.json():null);
      if (g && (g.synced||g.fromCache)) {
        const all = getTrades(); const idx = all.findIndex(t=>t.id===trade.id);
        if (idx!==-1) { all[idx].garmin = { hrv: g.hrv5MinHigh, sleepScore: g.sleepScore, bodyBattery: g.bodyBattery, restingHeartRate: g.heartRateResting }; saveTrades(all); }
      }
    } catch {}
  });
}

/* ═══════════ BAD DAY: PNL UPDATE ═══════════ */
// Patch bad day save to include PnL
const _origBadDaySave = document.getElementById('badDaySave');
if (_origBadDaySave) {
  const newBadSave = _origBadDaySave.cloneNode(true);
  _origBadDaySave.parentNode.replaceChild(newBadSave, _origBadDaySave);
  newBadSave.addEventListener('click', () => {
    const date = document.getElementById('badDayDate').value || todayStr();
    const reason = document.getElementById('badDayReason').value.trim();
    const pnlEl = document.getElementById('badDayPnl');
    const pnlVal = pnlEl ? parseFloat(pnlEl.value) : NaN;
    const all = getBadDays().filter(d => d.date !== date);
    all.push({ date, tags: [...selectedBadTags], reason, pnl: isNaN(pnlVal) ? null : pnlVal, ts: Date.now() });
    saveBadDays(all);
    document.getElementById('badDayModal').style.display = 'none';
    renderCalendar();
    renderStats();
  });
}

/* ═══════════ INIT HOME ON LOAD ═══════════ */
setTimeout(() => initHome(), 500);

/* ═══════════ FAITH DASHBOARD ═══════════ */
const BIBLE_BOOKS = [
  {t:'OT',n:'Genesis',c:50},{t:'OT',n:'Exodus',c:40},{t:'OT',n:'Leviticus',c:27},
  {t:'OT',n:'Numbers',c:36},{t:'OT',n:'Deuteronomy',c:34},{t:'OT',n:'Joshua',c:24},
  {t:'OT',n:'Judges',c:21},{t:'OT',n:'Ruth',c:4},{t:'OT',n:'1 Samuel',c:31},
  {t:'OT',n:'2 Samuel',c:24},{t:'OT',n:'1 Kings',c:22},{t:'OT',n:'2 Kings',c:25},
  {t:'OT',n:'1 Chronicles',c:29},{t:'OT',n:'2 Chronicles',c:36},{t:'OT',n:'Ezra',c:10},
  {t:'OT',n:'Nehemiah',c:13},{t:'OT',n:'Esther',c:10},{t:'OT',n:'Job',c:42},
  {t:'OT',n:'Psalms',c:150},{t:'OT',n:'Proverbs',c:31},{t:'OT',n:'Ecclesiastes',c:12},
  {t:'OT',n:'Song of Solomon',c:8},{t:'OT',n:'Isaiah',c:66},{t:'OT',n:'Jeremiah',c:52},
  {t:'OT',n:'Lamentations',c:5},{t:'OT',n:'Ezekiel',c:48},{t:'OT',n:'Daniel',c:12},
  {t:'OT',n:'Hosea',c:14},{t:'OT',n:'Joel',c:3},{t:'OT',n:'Amos',c:9},
  {t:'OT',n:'Obadiah',c:1},{t:'OT',n:'Jonah',c:4},{t:'OT',n:'Micah',c:7},
  {t:'OT',n:'Nahum',c:3},{t:'OT',n:'Habakkuk',c:3},{t:'OT',n:'Zephaniah',c:3},
  {t:'OT',n:'Haggai',c:2},{t:'OT',n:'Zechariah',c:14},{t:'OT',n:'Malachi',c:4},
  {t:'NT',n:'Matthew',c:28},{t:'NT',n:'Mark',c:16},{t:'NT',n:'Luke',c:24},
  {t:'NT',n:'John',c:21},{t:'NT',n:'Acts',c:28},{t:'NT',n:'Romans',c:16},
  {t:'NT',n:'1 Corinthians',c:16},{t:'NT',n:'2 Corinthians',c:13},{t:'NT',n:'Galatians',c:6},
  {t:'NT',n:'Ephesians',c:6},{t:'NT',n:'Philippians',c:4},{t:'NT',n:'Colossians',c:4},
  {t:'NT',n:'1 Thessalonians',c:5},{t:'NT',n:'2 Thessalonians',c:3},{t:'NT',n:'1 Timothy',c:6},
  {t:'NT',n:'2 Timothy',c:4},{t:'NT',n:'Titus',c:3},{t:'NT',n:'Philemon',c:1},
  {t:'NT',n:'Hebrews',c:13},{t:'NT',n:'James',c:5},{t:'NT',n:'1 Peter',c:5},
  {t:'NT',n:'2 Peter',c:3},{t:'NT',n:'1 John',c:5},{t:'NT',n:'2 John',c:1},
  {t:'NT',n:'3 John',c:1},{t:'NT',n:'Jude',c:1},{t:'NT',n:'Revelation',c:22}
];
const TOTAL_CHAPTERS = BIBLE_BOOKS.reduce((s, b) => s + b.c, 0);

function getFaithBible() {
  try { return JSON.parse(localStorage.getItem('faith_bible') || '{}'); } catch { return {}; }
}
function saveFaithBible(d) { localStorage.setItem('faith_bible', JSON.stringify(d)); }

function getFaithPrayers() {
  try { return JSON.parse(localStorage.getItem('faith_prayers') || '[]'); } catch { return []; }
}
function saveFaithPrayers(p) { localStorage.setItem('faith_prayers', JSON.stringify(p)); }

function bibleKey(bi, ci) { return bi + '_' + ci; }

function toggleChapter(bi, ci) {
  const d = getFaithBible();
  const k = bibleKey(bi, ci);
  if (d[k]) { delete d[k]; } else { d[k] = new Date().toISOString().slice(0, 10); }
  saveFaithBible(d);
  renderBible();
}

function calcFaithStats() {
  const d = getFaithBible();
  const prayers = getFaithPrayers();
  const allKeys = Object.keys(d);
  const totalRead = allKeys.length;
  const pct = Math.round(totalRead / TOTAL_CHAPTERS * 100);
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  let weekCount = 0;
  allKeys.forEach(k => { if (d[k] && d[k] >= weekAgo) weekCount++; });
  const daySet = new Set(Object.values(d).filter(Boolean));
  let streak = 0;
  const check = new Date();
  check.setHours(0, 0, 0, 0);
  while (true) {
    const ds = check.toISOString().slice(0, 10);
    if (daySet.has(ds)) { streak++; check.setDate(check.getDate() - 1); } else break;
  }
  return { weekCount, streak, pct, totalRead };
}

function updateFaithStats() {
  const s = calcFaithStats();
  const el = id => document.getElementById(id);
  if (el('fStatWeek')) el('fStatWeek').textContent = s.weekCount;
  if (el('fStatStreak')) el('fStatStreak').textContent = s.streak;
  if (el('fStatPct')) el('fStatPct').textContent = s.pct + '%';
  if (el('bibleProgressPct')) el('bibleProgressPct').textContent = s.pct + '%';
  if (el('bibleProgressFill')) el('bibleProgressFill').style.width = s.pct + '%';
}

function renderBible() {
  const d = getFaithBible();
  const container = document.getElementById('bibleBookList');
  if (!container) return;
  let lastTestament = null;
  let html = '';
  BIBLE_BOOKS.forEach((book, bi) => {
    if (book.t !== lastTestament) {
      lastTestament = book.t;
      html += `<div class="bible-testament">${book.t === 'OT' ? 'Old Testament' : 'New Testament'}</div>`;
    }
    let readCount = 0;
    for (let ci = 1; ci <= book.c; ci++) { if (d[bibleKey(bi, ci)]) readCount++; }
    const pct = book.c === 1 ? (readCount ? 100 : 0) : Math.round(readCount / book.c * 100);
    const chipsHtml = Array.from({ length: book.c }, (_, i) => {
      const ci = i + 1;
      const done = d[bibleKey(bi, ci)] ? ' done' : '';
      return `<div class="bible-ch${done}" onclick="toggleChapter(${bi},${ci})">${ci}</div>`;
    }).join('');
    html += `<div class="bible-book" id="bbook-${bi}">
      <div class="bible-book-header" onclick="toggleBook(${bi})">
        <span class="bible-book-name">${book.n}</span>
        <span class="bible-book-count">${readCount}/${book.c}</span>
        <div class="bible-book-bar-wrap"><div class="bible-book-bar" style="width:${pct}%"></div></div>
        <span class="bible-book-chevron">▼</span>
      </div>
      <div class="bible-chapters">${chipsHtml}</div>
    </div>`;
  });
  container.innerHTML = html;
  updateFaithStats();
  updateBibleRings();
}

function toggleBook(bi) {
  const el = document.getElementById('bbook-' + bi);
  if (el) el.classList.toggle('open');
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function renderPrayers() {
  const prayers = getFaithPrayers();
  const active = prayers.filter(p => !p.answered);
  const el = document.getElementById('activePrayerList');
  if (el) {
    if (!active.length) { el.innerHTML = '<div class="prayers-empty">None yet</div>'; }
    else {
      el.innerHTML = active.map(p => `
        <div class="prayer-item">
          <div class="prayer-body">
            <div class="prayer-title">${escHtml(p.title)}</div>
            ${p.desc ? `<div class="prayer-desc">${escHtml(p.desc)}</div>` : ''}
            <div class="prayer-date">Added ${p.date}</div>
          </div>
          <div class="prayer-actions">
            <button class="prayer-check" onclick="markAnswered('${p.id}')" title="Mark answered">&#x2713;</button>
            <button class="prayer-del" onclick="deletePrayer('${p.id}')" title="Delete">&#x2715;</button>
          </div>
        </div>`).join('');
    }
  }
  updateFaithStats();
}

function renderFaithDailyTasks() {
  const el = document.getElementById('faithDailyTasks');
  if (!el) return;
  const stats = calcFaithStats();
  const streak = stats.streak;
  const today = new Date().toISOString().slice(0, 10);
  const taskKey = 'faith_daily_' + today;
  let done = {};
  try { done = JSON.parse(localStorage.getItem(taskKey) || '{}'); } catch {}

  // Reading task scales with streak
  const readTarget = Math.min(1 + Math.floor(streak / 7), 5);
  // Prayer task scales with streak
  const prayerMin = Math.min(5 + streak * 2, 30);

  const tasks = [
    { id: 'read', label: `Read ${readTarget} Bible chapter${readTarget > 1 ? 's' : ''} today`, hint: streak >= 7 ? `+${streak} day streak — keep pushing!` : '' },
    { id: 'prayer', label: `Spend ${prayerMin} min in prayer`, hint: streak < 3 ? 'Start small — consistency wins' : '' },
  ];

  el.innerHTML = tasks.map(t => `
    <div class="faith-task${done[t.id] ? ' done' : ''}" data-task-id="${t.id}" data-task-key="${taskKey}">
      <span class="faith-task-check">${done[t.id] ? '✓' : '○'}</span>
      <div class="faith-task-body">
        <div class="faith-task-label">${t.label}</div>
        ${t.hint ? `<div class="faith-task-hint">${t.hint}</div>` : ''}
      </div>
    </div>`).join('');

  el.querySelectorAll('.faith-task').forEach(card => {
    const taskId = card.dataset.taskId, key = card.dataset.taskKey;
    let sx = 0, dragging = false;
    card.addEventListener('click', () => { if (!dragging) toggleFaithTask(taskId, key); });
    card.addEventListener('touchstart', e => { sx = e.touches[0].clientX; dragging = false; }, { passive: true });
    card.addEventListener('touchmove', e => {
      const dx = e.touches[0].clientX - sx;
      if (Math.abs(dx) > 8) { dragging = true; card.classList.add('swiping'); card.style.transform = `translateX(${Math.max(0, dx)}px)`; }
    }, { passive: true });
    card.addEventListener('touchend', e => {
      const dx = e.changedTouches[0].clientX - sx;
      card.classList.remove('swiping'); card.style.transform = '';
      if (dx > 80) {
        card.classList.add('swipe-done');
        setTimeout(() => toggleFaithTask(taskId, key), 300);
      }
    });
  });
}

function toggleFaithTask(taskId, taskKey) {
  let done = {};
  try { done = JSON.parse(localStorage.getItem(taskKey) || '{}'); } catch {}
  done[taskId] = !done[taskId];
  localStorage.setItem(taskKey, JSON.stringify(done));
  renderFaithDailyTasks();
}

function addPrayer() {
  const titleEl = document.getElementById('prayerTitle');
  const descEl = document.getElementById('prayerDesc');
  const title = (titleEl.value || '').trim();
  if (!title) { titleEl.focus(); return; }
  const prayers = getFaithPrayers();
  prayers.unshift({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    title,
    desc: (descEl.value || '').trim(),
    date: new Date().toISOString().slice(0, 10),
    answered: false
  });
  saveFaithPrayers(prayers);
  titleEl.value = ''; descEl.value = '';
  renderPrayers();
}

function markAnswered(id) {
  const prayers = getFaithPrayers();
  const p = prayers.find(x => x.id === id);
  if (p) { p.answered = true; p.answeredDate = new Date().toISOString().slice(0, 10); }
  saveFaithPrayers(prayers);
  renderPrayers();
}

function deletePrayer(id) {
  saveFaithPrayers(getFaithPrayers().filter(p => p.id !== id));
  renderPrayers();
}

async function loadFaithCoach(refresh) {
  const cacheKey = 'faith_coach_' + new Date().toISOString().slice(0, 10);
  const cached = !refresh && localStorage.getItem(cacheKey);
  const verseEl = document.getElementById('faithVerseText');
  const challengeEl = document.getElementById('faithChallenge');
  if (!verseEl) return;
  if (cached) {
    try {
      const c = JSON.parse(cached);
      verseEl.innerHTML = `<em>${escHtml(c.verse)}</em><div class="faith-verse-ref">${escHtml(c.ref)}</div>`;
      if (challengeEl) challengeEl.textContent = c.challenge || '—';
      return;
    } catch {}
  }
  verseEl.textContent = 'Loading…';
  const stats = calcFaithStats();
  const d = getFaithBible();
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const recentBooks = [];
  BIBLE_BOOKS.forEach((book, bi) => {
    for (let ci = 1; ci <= book.c; ci++) {
      const rd = d[bibleKey(bi, ci)];
      if (rd && rd >= weekAgo) { recentBooks.push(book.n); break; }
    }
  });
  const prompt = `You are a warm, encouraging Christian faith coach. The user has read ${stats.totalRead} chapters of the Bible (${stats.pct}% complete) with a ${stats.streak}-day reading streak. Recent books read this week: ${recentBooks.join(', ') || 'none yet'}.

Respond ONLY with a JSON object (no markdown, no backticks, no extra text):
{"verse":"the verse text","ref":"Book Chapter:Verse","challenge":"A short weekly spiritual discipline challenge (1-2 sentences)"}

Choose a verse relevant to their recent reading or encouraging for their journey.`;
  try {
    const res = await fetch('/.netlify/functions/claude', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt })
    });
    const data = await res.json();
    let parsed;
    try {
      const raw = data.analysis || data.result || '{}';
      const match = raw.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(match ? match[0] : raw);
    } catch { parsed = {}; }
    const verse = parsed.verse || 'Trust in the LORD with all your heart and lean not on your own understanding.';
    const ref = parsed.ref || 'Proverbs 3:5';
    const challenge = parsed.challenge || 'Spend 10 minutes in quiet prayer each morning this week.';
    verseEl.innerHTML = `<em>${escHtml(verse)}</em><div class="faith-verse-ref">${escHtml(ref)}</div>`;
    if (challengeEl) challengeEl.textContent = challenge;
    localStorage.setItem(cacheKey, JSON.stringify({ verse, ref, challenge }));
  } catch {
    verseEl.textContent = 'Could not load verse. Check your connection.';
  }
}

async function fetchReflection() {
  const btn = document.getElementById('reflectBtn');
  const out = document.getElementById('faithReflectOutput');
  if (!btn || !out) return;
  btn.disabled = true;
  btn.textContent = 'Reflecting…';
  out.classList.remove('visible');
  const stats = calcFaithStats();
  const prayers = getFaithPrayers().filter(p => !p.answered).slice(0, 10);
  const d = getFaithBible();
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const recentChapters = [];
  BIBLE_BOOKS.forEach((book, bi) => {
    for (let ci = 1; ci <= book.c; ci++) {
      const rd = d[bibleKey(bi, ci)];
      if (rd && rd >= weekAgo) recentChapters.push(`${book.n} ${ci}`);
    }
  });
  const prompt = `You are a warm Christian faith coach. Here is my week:

Bible reading: ${stats.weekCount} chapters this week, ${stats.streak}-day streak, ${stats.pct}% of the Bible complete.
Recent chapters: ${recentChapters.slice(0, 15).join(', ') || 'none'}

Active prayers (${prayers.length}):
${prayers.map(p => `- ${p.title}${p.desc ? ': ' + p.desc : ''}`).join('\n') || '(none logged)'}

Please write a brief, personal, encouraging reflection on my week (3-5 sentences). Tie the Bible readings to my prayers if possible. End with one specific encouragement or insight.`;
  try {
    const res = await fetch('/.netlify/functions/claude', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt })
    });
    const data = await res.json();
    out.textContent = data.analysis || data.result || 'Could not generate reflection.';
    out.classList.add('visible');
  } catch {
    out.textContent = 'Could not connect to Faith Coach. Try again later.';
    out.classList.add('visible');
  }
  btn.disabled = false;
  btn.textContent = '❆ Reflect on my week';
}

let _faithInited = false;
function initFaith() {
  if (_faithInited) return;
  renderBible();
  renderPrayers();
  renderFaithDailyTasks();
  loadFaithCoach(false);
  loadGratitude();
  updateBibleRings();
  showSundayReflection();
  _faithInited = true;
}

/* ═══════════ GLITCHY DASHBOARD ═══════════ */
const GLITCHY_TASKS = [
  { id: 'check_all',    label: 'Check all accounts' },
  { id: 'post_active',  label: 'Post on all active accounts' },
  { id: 'vouch_new',    label: 'Vouch on new accounts' },
  { id: 'review_dead',  label: 'Review dead accounts' },
  { id: 'check_deals',  label: 'Check ', link: 'https://godealflash.com', linkText: 'godealflash.com', labelSuffix: ' for new deals' },
];

const GLITCHY_DEFAULT_US = [
  'Holly.claire5','kaley.girlz','lialio18girlz','Jazaria.mccuske',
  'jessica.crossingto','ky.cardinal','claire.caine','alice.caine5'
];

function getGlitchyData() {
  try {
    const raw = localStorage.getItem('glitchy_accounts');
    if (!raw) {
      const seeded = {
        accounts: GLITCHY_DEFAULT_US.map(u => ({
          id: u + '_seed',
          region: 'US',
          username: u,
          health: 'good',
          tutorial: false,
          vouch: false,
          post: false,
        })),
        checkinsDate: ''
      };
      localStorage.setItem('glitchy_accounts', JSON.stringify(seeded));
      return seeded;
    }
    return JSON.parse(raw);
  }
  catch { return { accounts: [], checkinsDate: '' }; }
}
function saveGlitchyData(d) { localStorage.setItem('glitchy_accounts', JSON.stringify(d)); }

function getGlitchyChecklist() {
  try { return JSON.parse(localStorage.getItem('glitchy_checklist') || '{"date":"","tasks":{}}'); }
  catch { return { date: '', tasks: {} }; }
}
function saveGlitchyChecklist(d) { localStorage.setItem('glitchy_checklist', JSON.stringify(d)); }

function getWatchList() {
  try { return JSON.parse(localStorage.getItem('glitchy_watch') || '[]'); }
  catch { return []; }
}
function saveWatchList(w) { localStorage.setItem('glitchy_watch', JSON.stringify(w)); }

function glitchyToday() { return new Date().toISOString().slice(0, 10); }

function maybeResetCheckIns() {
  const d = getGlitchyData();
  const today = glitchyToday();
  if (d.checkinsDate !== today) {
    d.accounts.forEach(a => { a.tutorial = false; a.vouch = false; a.post = false; });
    d.checkinsDate = today;
    saveGlitchyData(d);
  }
}

function resetCheckIns() {
  const d = getGlitchyData();
  d.accounts.forEach(a => { a.tutorial = false; a.vouch = false; a.post = false; });
  d.checkinsDate = glitchyToday();
  saveGlitchyData(d);
  renderGlitchyAccounts();
}

function calcGlitchyStats() {
  const { accounts } = getGlitchyData();
  return {
    total: accounts.length,
    posted: accounts.filter(a => a.post).length,
    great: accounts.filter(a => a.health === 'good').length,
    replacing: accounts.filter(a => a.health === 'dead').length,
  };
}

function updateGlitchyStats() {
  const s = calcGlitchyStats();
  const el = id => document.getElementById(id);
  if (el('gStatTotal')) el('gStatTotal').textContent = s.total;
  if (el('gStatPosted')) el('gStatPosted').textContent = s.posted;
  if (el('gStatGreat')) el('gStatGreat').textContent = s.great;
  if (el('gStatReplacing')) el('gStatReplacing').textContent = s.replacing;
}

function renderAccountTable(accounts, tbodyId) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  if (!accounts.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-tertiary);padding:20px;font-size:13px">No accounts yet</td></tr>`;
    return;
  }
  tbody.innerHTML = accounts.map(a => `
    <tr>
      <td class="acct-username">${escHtml(a.username)}</td>
      <td style="text-align:center"><input type="checkbox" class="acct-cb" ${a.tutorial ? 'checked' : ''} onchange="toggleAccountField('${a.id}','tutorial',this.checked)"></td>
      <td style="text-align:center"><input type="checkbox" class="acct-cb" ${a.vouch ? 'checked' : ''} onchange="toggleAccountField('${a.id}','vouch',this.checked)"></td>
      <td style="text-align:center"><input type="checkbox" class="acct-cb" ${a.post ? 'checked' : ''} onchange="toggleAccountField('${a.id}','post',this.checked)"></td>
      <td>
        <select class="health-select" data-health="${a.health}" onchange="setHealth('${a.id}',this.value);this.dataset.health=this.value">
          <option value="good" ${a.health==='good'?'selected':''}>Good</option>
          <option value="warn" ${a.health==='warn'?'selected':''}>Almost Dead</option>
          <option value="dead" ${a.health==='dead'?'selected':''}>Dead</option>
        </select>
      </td>
      <td><button class="acct-del-btn" onclick="deleteAccount('${a.id}')" title="Delete">&#x2715;</button></td>
    </tr>`).join('');
}

function renderGlitchyAccounts() {
  const { accounts } = getGlitchyData();
  renderAccountTable(accounts.filter(a => a.region === 'US'), 'usAccountsBody');
  renderAccountTable(accounts.filter(a => a.region === 'UK'), 'ukAccountsBody');
  updateGlitchyStats();
}

function addAccount() {
  const usernameEl = document.getElementById('newAcctUsername');
  const regionEl = document.getElementById('newAcctRegion');
  const healthEl = document.getElementById('newAcctHealth');
  const username = (usernameEl.value || '').trim();
  if (!username) { usernameEl.focus(); return; }
  const d = getGlitchyData();
  d.accounts.push({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    region: regionEl.value,
    username,
    health: healthEl.value,
    tutorial: false,
    vouch: false,
    post: false,
  });
  saveGlitchyData(d);
  usernameEl.value = '';
  renderGlitchyAccounts();
}

function deleteAccount(id) {
  const d = getGlitchyData();
  d.accounts = d.accounts.filter(a => a.id !== id);
  saveGlitchyData(d);
  renderGlitchyAccounts();
}

function toggleAccountField(id, field, val) {
  const d = getGlitchyData();
  const a = d.accounts.find(x => x.id === id);
  if (a) a[field] = val;
  saveGlitchyData(d);
  updateGlitchyStats();
}

function setHealth(id, val) {
  const d = getGlitchyData();
  const a = d.accounts.find(x => x.id === id);
  if (a) a.health = val;
  saveGlitchyData(d);
  updateGlitchyStats();
}

function maybeResetChecklist() {
  const cl = getGlitchyChecklist();
  const today = glitchyToday();
  if (cl.date !== today) {
    const fresh = { date: today, tasks: {} };
    saveGlitchyChecklist(fresh);
    return fresh;
  }
  return cl;
}

function renderChecklist() {
  const cl = maybeResetChecklist();
  const container = document.getElementById('glitchyChecklistItems');
  if (!container) return;
  container.innerHTML = GLITCHY_TASKS.map(t => {
    const done = !!cl.tasks[t.id];
    const labelHtml = t.link
      ? `<span class="checklist-label">${escHtml(t.label)}<a href="${t.link}" target="_blank" rel="noopener" class="checklist-link" onclick="event.stopPropagation()">${escHtml(t.linkText)}</a>${escHtml(t.labelSuffix)}</span>`
      : `<span class="checklist-label">${escHtml(t.label)}</span>`;
    return `<div class="checklist-item${done ? ' done' : ''}" onclick="toggleTask('${t.id}')">
      <input type="checkbox" class="checklist-cb" ${done ? 'checked' : ''} onclick="event.stopPropagation()">
      ${labelHtml}
    </div>`;
  }).join('');
}

function toggleTask(taskId) {
  const cl = getGlitchyChecklist();
  const today = glitchyToday();
  if (cl.date !== today) { cl.date = today; cl.tasks = {}; }
  cl.tasks[taskId] = !cl.tasks[taskId];
  saveGlitchyChecklist(cl);
  renderChecklist();
}

function renderWatchList() {
  const list = getWatchList();
  const container = document.getElementById('watchListContainer');
  if (!container) return;
  if (!list.length) {
    container.innerHTML = '<div class="watch-empty">No accounts being watched</div>';
    return;
  }
  container.innerHTML = list.map(w => {
    const badgeClass = w.status === 'watching' ? 'watch-watching' : w.status === 'escalated' ? 'watch-escalated' : 'watch-resolved';
    const badgeLabel = w.status === 'watching' ? 'Watching' : w.status === 'escalated' ? 'Escalated' : 'Resolved';
    return `<div class="watch-item">
      <div class="watch-item-top">
        <div class="watch-username">${escHtml(w.username)}</div>
        <span class="watch-badge ${badgeClass}">${badgeLabel}</span>
      </div>
      ${w.reason ? `<div class="watch-reason">${escHtml(w.reason)}</div>` : ''}
      <div class="watch-date">Added ${w.dateAdded}</div>
      <textarea class="watch-notes" rows="2" placeholder="Notes…" onblur="saveWatchNotes('${w.id}',this.value)">${escHtml(w.notes || '')}</textarea>
      <div class="watch-actions">
        <button class="glitchy-btn glitchy-btn-sm${w.status==='watching'?' active':''}" onclick="setWatchStatus('${w.id}','watching')">Watching</button>
        <button class="glitchy-btn glitchy-btn-sm glitchy-btn-danger" onclick="setWatchStatus('${w.id}','escalated')">Escalate</button>
        <button class="glitchy-btn glitchy-btn-sm glitchy-btn-success" onclick="setWatchStatus('${w.id}','resolved')">Resolve</button>
        <button class="glitchy-btn glitchy-btn-sm glitchy-btn-danger" style="margin-left:auto" onclick="deleteWatch('${w.id}')">&#x2715; Delete</button>
      </div>
    </div>`;
  }).join('');
}

function addWatch() {
  const usernameEl = document.getElementById('watchUsername');
  const reasonEl = document.getElementById('watchReason');
  const username = (usernameEl.value || '').trim();
  if (!username) { usernameEl.focus(); return; }
  const list = getWatchList();
  list.unshift({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    username,
    reason: (reasonEl.value || '').trim(),
    dateAdded: glitchyToday(),
    status: 'watching',
    notes: '',
  });
  saveWatchList(list);
  usernameEl.value = ''; reasonEl.value = '';
  renderWatchList();
}

function deleteWatch(id) {
  saveWatchList(getWatchList().filter(w => w.id !== id));
  renderWatchList();
}

function setWatchStatus(id, status) {
  const list = getWatchList();
  const w = list.find(x => x.id === id);
  if (w) w.status = status;
  saveWatchList(list);
  renderWatchList();
}

function saveWatchNotes(id, notes) {
  const list = getWatchList();
  const w = list.find(x => x.id === id);
  if (w && w.notes !== notes) { w.notes = notes; saveWatchList(list); }
}

function initGlitchy() {
  maybeResetCheckIns();
  renderGlitchyAccounts();
  renderChecklist();
  renderWatchList();
}

document.getElementById('page-glitchy').addEventListener('click', e => {
  const btn = e.target.closest('[data-gtab]');
  if (!btn) return;
  document.querySelectorAll('#page-glitchy [data-gtab]').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('#page-glitchy .glitchy-tab-panel').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  const panel = document.getElementById('gtab-' + btn.dataset.gtab);
  if (panel) panel.classList.add('active');
});


/* ═══════════════════════════════════════════════════════════
   GYM TAB — Progressive Overload Coach
   ═══════════════════════════════════════════════════════════ */

const CONFIG = {
  appTitle: "Progressive Overload Coach",

  // Weight unit shown everywhere. "kg" or "lb".
  units: "kg",

  // Gyms you train at. Add as many as you want.
  // `id` must be a short unique slug (no spaces). `name` is what people see.
  gyms: [
    { id: "home",  name: "Home Gym" },
    { id: "comm",  name: "Commercial Gym" }
  ],

  // Training split. Most people use Push/Pull/Legs but you can rename
  // these to "Upper", "Lower", "Full Body", "Day A", anything.
  days: [
    { id: "push", name: "Push" },
    { id: "pull", name: "Pull" },
    { id: "legs", name: "Legs" }
  ],

  // Split rotation — the order your training days cycle through. Use day
  // ids from `days` above, plus "rest" for off-days. The pill at the top
  // of the app reads this + splitAnchor to compute "what day is today".
  splitRotation: ["push", "pull", "legs", "rest"],

  // Anchor: pair a real calendar date with which split day fell on it.
  // The rotation advances from this point. Set `date` to a recent day
  // when you knew what split you were on, and `splitId` to that day.
  // Edit this if your split drifts.
  splitAnchor: {
    date: "2026-05-12",
    splitId: "rest"
  },

  // Progression rule: hit this many reps on the top set → coach tells you
  // to add weight next session. Lower this to be more aggressive (e.g. 6),
  // raise it for more volume bias (e.g. 10).
  upgradeAtReps: 8,

  // Composition estimate (optional, for the weight chart).
  // Estimates how much of recent weight change is muscle vs fat by
  // cross-referencing the strength trend. Set yearsTraining to scale
  // expected muscle gain rate.
  composition: {
    enabled: true,
    yearsTraining: 1,        // 1 = beginner, 2 = intermediate, 3+ = advanced
    windowDays: 30           // window to compute weight + strength change
  },

  // Starter exercise list. Each one needs:
  //   name        — what shows in the dropdown
  //   gym         — one of the gym ids above, or "both"
  //   day         — one of the day ids above
  //   repMin      — bottom of your target rep range
  //   repMax      — top of your target rep range
  //   step        — how much weight you add when progressing (kg/lb)
  //   startWeight — starting weight (ignored when bw: true)
  //   bw          — true for bodyweight movements (logs reps only)
  //
  // First-run defaults. Once a user logs anything, they edit through
  // the in-app + / gear buttons; this block stays as the seed.
  defaultExercises: [
    { name: "Bench press",     gym: "comm", day: "push", repMin: 5, repMax: 8,  step: 2.5, startWeight: 60 },
    { name: "Overhead press",  gym: "comm", day: "push", repMin: 5, repMax: 8,  step: 2.5, startWeight: 35 },
    { name: "Tricep pushdown", gym: "comm", day: "push", repMin: 8, repMax: 12, step: 2.5, startWeight: 25 },
    { name: "Pull-ups",        gym: "both", day: "pull", repMin: 5, repMax: 10, step: 1,   startWeight: 0, bw: true },
    { name: "Barbell row",     gym: "comm", day: "pull", repMin: 6, repMax: 10, step: 2.5, startWeight: 50 },
    { name: "Bicep curl",      gym: "comm", day: "pull", repMin: 8, repMax: 12, step: 1.25,startWeight: 15 },
    { name: "Back squat",      gym: "comm", day: "legs", repMin: 5, repMax: 8,  step: 5,   startWeight: 80 },
    { name: "Romanian deadlift", gym: "comm", day: "legs", repMin: 6, repMax: 10, step: 5, startWeight: 60 },
    { name: "Leg press",       gym: "comm", day: "legs", repMin: 8, repMax: 12, step: 5,   startWeight: 100 }
  ]
};


(function() {
  // ============================================================
  // STATE — all logs + edits live in browser localStorage. Each
  // device has its own copy. Export JSON from settings if you
  // want to back up or move to another device.
  // ============================================================
  const LS_KEY = 'po_coach_v1';

  function buildDefaultExercises() {
    return CONFIG.defaultExercises.map((e, i) => Object.assign({
      id: 'seed_' + i + '_' + Date.now()
    }, e));
  }
  function loadState() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) return normalize(JSON.parse(raw));
    } catch (e) {}
    return normalize({});
  }
  function normalize(s) {
    s = s || {};
    s.units = s.units || CONFIG.units || 'kg';
    s.gyms  = (Array.isArray(s.gyms)  && s.gyms.length)  ? s.gyms  : CONFIG.gyms.slice();
    s.days  = (Array.isArray(s.days)  && s.days.length)  ? s.days  : CONFIG.days.slice();
    s.exercises = Array.isArray(s.exercises) ? s.exercises : buildDefaultExercises();
    s.logs = (s.logs && typeof s.logs === 'object') ? s.logs : {};
    s.filterGym = s.filterGym || s.gyms[0].id;
    s.filterDay = s.filterDay || s.days[0].id;
    // Split rotation lives in state so the user can edit it via the pill modal.
    // Stored as a plain array of names (e.g. ["Push", "Pull", "Legs", "Rest"]).
    if (!Array.isArray(s.splitRotation) || !s.splitRotation.length) {
      s.splitRotation = (CONFIG.splitRotation || ['Push', 'Pull', 'Legs', 'Rest']).map(x =>
        // CONFIG used ids — map id → display name where possible
        (CONFIG.days || []).find(d => d.id === x) ? (CONFIG.days.find(d => d.id === x).name) :
        (x === 'rest' ? 'Rest' : x.charAt(0).toUpperCase() + x.slice(1))
      );
    }
    if (!s.splitAnchor || !s.splitAnchor.date || s.splitAnchor.index == null) {
      // Map old anchor-by-id to new anchor-by-index, or default to today=index 0.
      const oldId = (CONFIG.splitAnchor && CONFIG.splitAnchor.splitId) || null;
      let idx = 0;
      if (oldId) {
        const oldName = (CONFIG.days || []).find(d => d.id === oldId);
        const targetName = oldName ? oldName.name : (oldId === 'rest' ? 'Rest' : oldId);
        const found = s.splitRotation.findIndex(n => n.toLowerCase() === targetName.toLowerCase());
        if (found >= 0) idx = found;
      }
      s.splitAnchor = {
        date: (CONFIG.splitAnchor && CONFIG.splitAnchor.date) || new Date().toISOString().slice(0, 10),
        index: idx
      };
    }
    return s;
  }
  function saveState() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) {}
  }
  let state = loadState();
  document.getElementById('appTitle').textContent = CONFIG.appTitle || 'Progressive Overload Coach';

  // ============================================================
  // HELPERS
  // ============================================================
  const $ = (id) => document.getElementById(id);
  function unit() { return state.units; }
  function uid() { return 'ex_' + Date.now() + '_' + Math.floor(Math.random() * 9999); }
  function gymName(id) { const g = state.gyms.find(x => x.id === id); return g ? g.name : id; }
  function dayName(id) { const d = state.days.find(x => x.id === id); return d ? d.name : id; }
  function estimate1RM(w, r) { if (r < 2) return w; return w * (1 + r / 30); }
  function roundToStep(v, s) { return Math.round(v / s) * s; }
  function getFiltered() {
    return state.exercises.filter(e =>
      (e.gym === state.filterGym || e.gym === 'both') && e.day === state.filterDay);
  }
  function getCurrentEx() {
    const f = getFiltered();
    if (!f.length) return null;
    let ex = f.find(e => e.id === state.currentEx);
    if (!ex) { ex = f[0]; state.currentEx = ex.id; saveState(); }
    return ex;
  }
  function getLogs() { return (state.logs[state.currentEx] || []).slice(); }

  // Prescription engine — "what should I do next session?"
  // Upgrade trigger: hits CONFIG.upgradeAtReps (default 8) OR the
  // exercise's repMax, whichever fires first. So a 5-8 lifter hits
  // upgrade at 8; a 6-12 lifter ALSO hits it at 8 instead of grinding
  // out 12 reps before adding weight.
  function getRx(ex, logs) {
    if (!logs.length) return null;
    const last = logs[logs.length - 1];
    const { weight, reps } = last;
    const { repMin, repMax, step, bw } = ex;
    const upgradeAt = Math.min(CONFIG.upgradeAtReps || 8, repMax);
    let stuck = 0;
    for (let i = logs.length - 1; i >= 0; i--) {
      if (logs[i].weight === weight) stuck++; else break;
    }
    if (bw) {
      if (reps >= upgradeAt) return { type: 'up', weight: 0, reps: reps + 1, tag: 'Push for more', reason: reps + ' reps — strong. Push for ' + (reps + 1) + ' next time.', bw: true };
      if (reps >= repMin) return { type: 'hold', weight: 0, reps: reps + 1, tag: 'Add a rep', reason: reps + ' reps. Push for ' + (reps + 1) + ' next session.', bw: true };
      return { type: 'hold', weight: 0, reps: repMin, tag: 'Repeat', reason: reps + ' reps fell short. Repeat until you hit ' + repMin + '+.', bw: true };
    }
    if (stuck >= 3 && reps < repMin) {
      const dl = roundToStep(weight * 0.9, step);
      return { type: 'down', weight: dl, reps: repMax, tag: 'Deload', reason: 'Stuck at ' + weight + unit() + ' for ' + stuck + ' sessions. Drop 10%, reset, build back cleaner.' };
    }
    if (reps >= upgradeAt) return { type: 'up', weight: weight + step, reps: repMin, tag: 'Add weight', reason: 'You hit ' + reps + ' reps — time to add ' + step + unit() + '. Expect ' + repMin + '-' + (repMin + 1) + ' next session.' };
    if (reps >= repMin && reps < upgradeAt) return { type: 'hold', weight: weight, reps: reps + 1, tag: 'Add a rep', reason: reps + ' reps in target. Stay at ' + weight + unit() + ', push for ' + (reps + 1) + '.' };
    return { type: 'hold', weight: weight, reps: repMin, tag: 'Repeat', reason: reps + ' reps short of ' + repMin + '-' + upgradeAt + '. Repeat ' + weight + unit() + ' until you hit ' + repMin + '+ clean.' };
  }

  // ============================================================
  // RENDER
  // ============================================================
  function renderFilters() {
    $('gymSeg').innerHTML = state.gyms.map(g =>
      '<button class="po-seg-btn ' + (g.id === state.filterGym ? 'active' : '') + '" data-gym="' + g.id + '">' + escape(g.name) + '</button>'
    ).join('');
    $('daySeg').innerHTML = state.days.map(d =>
      '<button class="po-seg-btn ' + (d.id === state.filterDay ? 'active' : '') + '" data-day="' + d.id + '">' + escape(d.name) + '</button>'
    ).join('');
    $('gymSeg').querySelectorAll('.po-seg-btn').forEach(b => {
      b.addEventListener('click', () => { state.filterGym = b.dataset.gym; state.currentEx = null; saveState(); renderAll(); });
    });
    $('daySeg').querySelectorAll('.po-seg-btn').forEach(b => {
      b.addEventListener('click', () => {
        state.filterDay = b.dataset.day;
        state.currentEx = null;
        // User has now manually picked a day — stop auto-overriding to today's split.
        state._userPickedDay = true;
        saveState(); renderAll();
      });
    });
  }
  function renderSelect() {
    const sel = $('exSelect');
    const f = getFiltered();
    const noMsg = $('noExMsg');
    const editBtn = $('editExBtn');
    const logBtn = $('logBtn');
    if (!f.length) {
      sel.innerHTML = '<option>—</option>';
      sel.disabled = true; editBtn.disabled = true; logBtn.disabled = true;
      noMsg.style.display = 'block'; state.currentEx = null;
      return;
    }
    sel.disabled = false; editBtn.disabled = false; logBtn.disabled = false;
    noMsg.style.display = 'none';
    if (!f.find(e => e.id === state.currentEx)) state.currentEx = f[0].id;
    sel.innerHTML = f.map(e => {
      const wLbl = e.bw ? ' · BW' : (e.startWeight ? ' · ' + e.startWeight + unit() : '');
      const sh = e.gym === 'both' ? ' ★' : '';
      return '<option value="' + e.id + '"' + (e.id === state.currentEx ? ' selected' : '') + '>' + escape(e.name) + wLbl + sh + '</option>';
    }).join('');
  }
  function renderForm() {
    const ex = getCurrentEx();
    const banner = $('bwBanner');
    const wField = $('weightField');
    const oneRmLbl = $('oneRmLabel');
    const grid = $('logGrid');
    $('weightLabel').textContent = 'Weight (' + unit() + ')';
    if (ex && ex.bw) {
      banner.classList.add('show');
      wField.style.display = 'none';
      grid.classList.add('po-bw-mode');
      oneRmLbl.textContent = 'Best reps';
    } else {
      banner.classList.remove('show');
      wField.style.display = '';
      grid.classList.remove('po-bw-mode');
      oneRmLbl.textContent = 'Est. 1RM';
    }
  }
  function renderLastSet() {
    const wrap = $('lastSet');
    const v = $('lastSetValue');
    const m = $('lastSetMeta');
    const ex = getCurrentEx();
    const logs = ex ? getLogs() : [];
    if (!ex || !logs.length) { wrap.classList.remove('show'); return; }
    const last = logs[logs.length - 1];
    const setStr = ex.bw ? (last.reps + ' reps') : (last.weight + unit() + ' × ' + last.reps);
    const d = new Date(last.date);
    const da = Math.floor((Date.now() - d.getTime()) / 86400000);
    const ago = da === 0 ? 'today' : da === 1 ? 'yesterday' : da + ' days ago';
    v.textContent = setStr;
    m.textContent = ago;
    wrap.classList.add('show');
  }
  function renderRx() {
    const wrap = $('rxWrap');
    const ex = getCurrentEx();
    if (!ex) { wrap.innerHTML = '<div class="po-rx-empty">Pick a gym and day above.</div>'; return; }
    const logs = getLogs();
    const rx = getRx(ex, logs);
    if (!rx) {
      const sw = ex.startWeight, sr = ex.repMin;
      const head = ex.bw
        ? '<span class="po-accent">' + sr + '</span> reps'
        : '<span class="po-accent">' + (sw || 0) + unit() + '</span> × ' + sr + ' reps';
      const reason = ex.bw
        ? 'Aim for ' + ex.repMin + '-' + ex.repMax + ' clean reps. Once you hit ' + ex.repMax + '+, push for more.'
        : 'Hit ' + ex.repMin + '-' + ex.repMax + ' reps. Once logged, the coach will start prescribing.';
      wrap.innerHTML = '<div class="po-rx-card"><div class="po-rx-label">' + escape(ex.name) + ' · starting point</div><div class="po-rx-headline">' + head + '</div><span class="po-rx-tag hold">Start here</span><p class="po-rx-reason">' + reason + '</p></div>';
      return;
    }
    const head = rx.bw
      ? '<span class="po-accent">' + rx.reps + '</span> reps'
      : '<span class="po-accent">' + rx.weight + unit() + '</span> × ' + rx.reps + ' reps';
    wrap.innerHTML = '<div class="po-rx-card po-rx-' + rx.type + '"><div class="po-rx-label">' + escape(ex.name) + '</div><div class="po-rx-headline">' + head + '</div><span class="po-rx-tag ' + rx.type + '">' + rx.tag + '</span><p class="po-rx-reason">' + rx.reason + '</p></div>';
  }
  function renderStats() {
    const ex = getCurrentEx();
    const logs = ex ? getLogs() : [];
    if (!logs.length) {
      $('oneRm').innerHTML = '—<span class="po-unit">' + unit() + '</span>';
      $('bestSet').textContent = '—';
      $('sessionCount').textContent = '—';
      return;
    }
    if (ex.bw) {
      const br = Math.max.apply(null, logs.map(l => l.reps));
      $('oneRm').innerHTML = br + '<span class="po-unit">reps</span>';
    } else {
      const orm = Math.max.apply(null, logs.map(l => estimate1RM(l.weight, l.reps)));
      $('oneRm').innerHTML = Math.round(orm) + '<span class="po-unit">' + unit() + '</span>';
    }
    let best = logs[0];
    logs.forEach(l => {
      const cur = ex.bw ? l.reps : estimate1RM(l.weight, l.reps);
      const bestVal = ex.bw ? best.reps : estimate1RM(best.weight, best.reps);
      if (cur > bestVal) best = l;
    });
    $('bestSet').textContent = ex.bw ? (best.reps + 'r') : (best.weight + '×' + best.reps);
    $('sessionCount').textContent = logs.length;
  }
  function renderSparkline() {
    const svg = $('sparkline');
    const empty = $('sparkEmpty');
    const ex = getCurrentEx();
    const logs = ex ? getLogs().slice(-10) : [];
    if (logs.length < 2) {
      svg.style.display = 'none'; empty.style.display = 'block';
      return;
    }
    svg.style.display = 'block'; empty.style.display = 'none';
    const vals = logs.map(l => ex.bw ? l.reps : estimate1RM(l.weight, l.reps));
    const min = Math.min.apply(null, vals);
    const max = Math.max.apply(null, vals);
    const range = max - min || 1;
    const W = 300, H = 60, pad = 4;
    const pts = vals.map((v, i) => {
      const x = pad + (W - pad * 2) * (i / (vals.length - 1));
      const y = H - pad - (H - pad * 2) * ((v - min) / range);
      return [x, y];
    });
    const linePath = pts.map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    const fillPath = linePath + ' L' + pts[pts.length - 1][0].toFixed(1) + ' ' + H + ' L' + pts[0][0].toFixed(1) + ' ' + H + ' Z';
    // Keep <defs> in place; replace any prior paths
    const defsHTML = '<defs><linearGradient id="sparkGrad" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="rgba(255,255,255,0.18)"/><stop offset="100%" stop-color="rgba(255,255,255,0)"/></linearGradient></defs>';
    svg.innerHTML = defsHTML
      + '<path class="po-spark-fill" d="' + fillPath + '"/>'
      + '<path class="po-spark-line" d="' + linePath + '"/>';
  }
  function renderHistory() {
    const wrap = $('historyCard');
    const ex = getCurrentEx();
    const logs = ex ? getLogs().slice().reverse() : [];
    if (!logs.length) {
      wrap.innerHTML = '<div class="po-empty">No logs yet.</div>';
      return;
    }
    wrap.innerHTML = logs.slice(0, 12).map((l, i) => {
      const d = new Date(l.date);
      const dStr = (d.getMonth() + 1) + '/' + d.getDate();
      const setStr = ex.bw ? (l.reps + ' reps') : (l.weight + unit() + ' × ' + l.reps);
      const realIdx = logs.length - 1 - i; // since we reversed
      return '<div class="po-hist-row">'
        + '<div class="po-hist-date">' + dStr + '</div>'
        + '<div class="po-hist-set">' + setStr + '</div>'
        + '<button class="po-hist-del" data-idx="' + realIdx + '" aria-label="Delete">×</button>'
        + '</div>';
    }).join('');
    wrap.querySelectorAll('.po-hist-del').forEach(b => {
      b.addEventListener('click', () => {
        if (!confirm('Delete this log?')) return;
        const realIdx = parseInt(b.dataset.idx, 10);
        const arr = state.logs[state.currentEx] || [];
        // realIdx is index in REVERSED list; map back to original
        const origIdx = arr.length - 1 - realIdx;
        arr.splice(origIdx, 1);
        if (!arr.length) delete state.logs[state.currentEx];
        else state.logs[state.currentEx] = arr;
        saveState(); renderAll();
      });
    });
  }
  // Compute today's split from state.splitRotation + state.splitAnchor.
  // Returns the rotation entry name (e.g. "Push" or "Rest") AND the index.
  function todaySplit() {
    try {
      const rot = state.splitRotation;
      if (!rot || !rot.length) return { name: '—', index: 0 };
      const a = new Date(state.splitAnchor.date);
      const t = new Date();
      a.setHours(0,0,0,0); t.setHours(0,0,0,0);
      const diffDays = Math.round((t - a) / 86400000);
      const idx = ((state.splitAnchor.index + diffDays) % rot.length + rot.length) % rot.length;
      return { name: rot[idx], index: idx };
    } catch (e) {
      return { name: (state.splitRotation && state.splitRotation[0]) || '—', index: 0 };
    }
  }
  function todayDateLabel() {
    const d = new Date();
    const dows = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
    const mons = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    return dows[d.getDay()] + ', ' + mons[d.getMonth()] + ' ' + d.getDate();
  }
  function isRestName(name) { return /^rest\b/i.test(name || ''); }
  function splitLabel(name) {
    if (!name) return '—';
    return (isRestName(name) ? 'REST DAY' : (name + ' DAY')).toUpperCase();
  }
  function renderDayPill() {
    const split = todaySplit();
    $('dayPillDate').textContent = todayDateLabel();
    const splitEl = $('dayPillSplit');
    splitEl.textContent = splitLabel(split.name);
    splitEl.classList.toggle('is-rest', isRestName(split.name));
  }

  // Build the rep buttons based on the current exercise's repMin/repMax.
  // Always spans repMin → repMax + 2 (a small buffer for over-performing
  // sets that trigger the upgrade signal), capped at 16 buttons total so
  // wide ranges don't break the mobile layout.
  function renderRepsRow() {
    const row = document.getElementById('repsRow');
    if (!row) return;
    const ex = getCurrentEx();
    let repMin, repMax;
    if (ex) {
      repMin = Math.max(1, parseInt(ex.repMin, 10) || 1);
      repMax = Math.max(repMin, parseInt(ex.repMax, 10) || repMin);
    } else {
      repMin = 4; repMax = 12;
    }
    const upper = Math.max(repMax + 2, repMin + 5);
    const end = Math.min(upper, repMin + 15);

    // Preserve the previously-selected rep if it still fits in the new
    // range; otherwise default to the target (repMax).
    const prev = parseInt(row.dataset.value, 10);
    const active = (prev >= repMin && prev <= end) ? prev : repMax;

    let html = '';
    for (let i = repMin; i <= end; i++) {
      html += '<button type="button" class="po-reps-pill' +
        (i === active ? ' active' : '') +
        '" data-v="' + i + '">' + i + '</button>';
    }
    row.innerHTML = html;
    row.dataset.value = String(active);
  }

  function renderAll() {
    renderDayPill();
    renderFilters(); renderSelect(); renderForm(); renderLastSet();
    renderRepsRow();
    renderRx(); renderStats(); renderSparkline(); renderHistory();
    renderTodaysWorkout();
    renderPastWorkouts();
    // Pre-fill weight input with last logged weight (or starting weight)
    const ex = getCurrentEx();
    if (ex && !ex.bw) {
      const logs = getLogs();
      const w = logs.length ? logs[logs.length - 1].weight : (ex.startWeight || 0);
      $('weightInput').value = w;
    }
  }

  // ============================================================
  // TODAY'S WORKOUT + PAST WORKOUTS
  //
  // Reads state.logs, groups by date, surfaces:
  //  - Today: every set logged today, per exercise, with set count + total
  //    volume (kg lifted = sum of weight × reps across all working sets).
  //  - Past: every previous workout day, sorted newest-first, with the
  //    same summary numbers + a DONE badge if the user marked that day.
  //
  // The total volume here is what the composition-estimate uses (combined
  // with the 1RM trend) — more weekly volume + strength gain = more of
  // recent body-weight delta gets attributed to muscle.
  // ============================================================
  const WORKOUT_DONE_KEY = 'po_coach_workout_done';
  function loadDoneDays() {
    try { const raw = localStorage.getItem(WORKOUT_DONE_KEY); return raw ? JSON.parse(raw) : {}; }
    catch (e) { return {}; }
  }
  function saveDoneDays(d) {
    try { localStorage.setItem(WORKOUT_DONE_KEY, JSON.stringify(d)); } catch (e) {}
  }
  let doneDays = loadDoneDays();

  function logsByDay() {
    const byDay = {};
    state.exercises.forEach(ex => {
      (state.logs[ex.id] || []).forEach(l => {
        const dk = l.date.slice(0, 10);
        if (!byDay[dk]) byDay[dk] = [];
        byDay[dk].push({ ex, log: l });
      });
    });
    return byDay;
  }

  function fmtPastDate(dk) {
    const [y, m, d] = dk.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    const dows = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
    const mons = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    return dows[dt.getDay()] + ' ' + mons[dt.getMonth()] + ' ' + dt.getDate();
  }

  function summarizeDay(daySets) {
    // daySets: [{ex, log}]. Group by exercise, return {sets: N, vol: kg, perEx: [...]}.
    const byEx = {};
    daySets.forEach(({ex, log}) => {
      if (!byEx[ex.id]) byEx[ex.id] = { ex, sets: [], vol: 0 };
      byEx[ex.id].sets.push(log);
      byEx[ex.id].vol += (log.weight || 0) * (log.reps || 0);
    });
    const perEx = Object.values(byEx);
    const totalSets = perEx.reduce((s, e) => s + e.sets.length, 0);
    const totalVol = perEx.reduce((s, e) => s + e.vol, 0);
    return { perEx, totalSets, totalVol };
  }

  function renderTodaysWorkout() {
    const todayKey = wtDateKey(new Date());
    const all = logsByDay();
    const todaySets = all[todayKey] || [];
    const sum = summarizeDay(todaySets);
    const u = state.units;

    const eyebrow = $('poTwDateLabel');
    const dows = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
    const mons = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    const d = new Date();
    eyebrow.textContent = 'TODAY · ' + dows[d.getDay()] + ', ' + mons[d.getMonth()] + ' ' + d.getDate();

    $('poTwSetCount').textContent = sum.totalSets;
    $('poTwTotalVol').textContent = Math.round(sum.totalVol).toLocaleString() + ' ' + u + ' lifted';

    const list = $('poTwList');
    const empty = $('poTwEmpty');
    if (sum.totalSets === 0) {
      list.innerHTML = '';
      empty.classList.remove('hidden');
    } else {
      empty.classList.add('hidden');
      list.innerHTML = sum.perEx.map(e => {
        const top = e.ex.bw
          ? 'top ' + Math.max.apply(null, e.sets.map(s => s.reps)) + ' reps'
          : 'top ' + Math.max.apply(null, e.sets.map(s => s.weight)) + u;
        const meta = e.ex.bw
          ? (e.sets.length + ' set' + (e.sets.length === 1 ? '' : 's') + ' · ' + top)
          : (e.sets.length + ' set' + (e.sets.length === 1 ? '' : 's') + ' · ' + top + ' · ' + Math.round(e.vol) + u + ' total');
        return '<li class="po-tw-row">'
          + '<span class="po-tw-row-name">' + escape(e.ex.name) + '</span>'
          + '<span class="po-tw-row-meta">' + meta + '</span>'
          + '</li>';
      }).join('');
    }

    // Done button state
    const btn = $('poTwDoneBtn');
    const isDone = !!doneDays[todayKey];
    btn.textContent = isDone ? '✓ Done' : 'Mark workout done';
    btn.classList.toggle('is-done', isDone);
    btn.disabled = sum.totalSets === 0 && !isDone;
    btn.style.opacity = btn.disabled ? '0.4' : '';
  }

  function renderPastWorkouts() {
    const todayKey = wtDateKey(new Date());
    const all = logsByDay();
    const past = Object.entries(all)
      .filter(([dk]) => dk !== todayKey)
      .sort((a, b) => b[0].localeCompare(a[0]));
    $('poTwPastCount').textContent = past.length;
    const body = $('poTwPastBody');
    if (!past.length) {
      body.innerHTML = '<div class="po-tw-past-empty">No past workouts yet.</div>';
      return;
    }
    const u = state.units;
    body.innerHTML = past.slice(0, 30).map(([dk, sets]) => {
      const sum = summarizeDay(sets);
      const isDone = !!doneDays[dk];
      const exNames = sum.perEx.map(e => e.ex.name).slice(0, 3).join(', ')
        + (sum.perEx.length > 3 ? '…' : '');
      return '<div class="po-tw-past-day">'
        + '<div class="po-tw-past-day-h">'
        +   '<span class="po-tw-past-day-date">' + fmtPastDate(dk) + '</span>'
        +   '<span class="po-tw-past-day-summary">'
        +     sum.totalSets + ' sets · ' + Math.round(sum.totalVol).toLocaleString() + ' ' + u
        +     (isDone ? ' <span class="po-tw-past-day-done">DONE</span>' : '')
        +   '</span>'
        + '</div>'
        + '<div class="po-tw-past-day-summary" style="margin-top:6px; font-size:11px; color:var(--text-3);">'
        +   escape(exNames)
        + '</div>'
        + '</div>';
    }).join('');
  }

  $('poTwDoneBtn').addEventListener('click', () => {
    const todayKey = wtDateKey(new Date());
    if (doneDays[todayKey]) {
      delete doneDays[todayKey];
    } else {
      doneDays[todayKey] = new Date().toISOString();
    }
    saveDoneDays(doneDays);
    renderTodaysWorkout();
    renderPastWorkouts();
  });
  $('poTwPastToggle').addEventListener('click', () => {
    const body = $('poTwPastBody');
    const toggle = $('poTwPastToggle');
    const open = body.style.display !== 'none';
    body.style.display = open ? 'none' : 'flex';
    body.style.flexDirection = 'column';
    toggle.setAttribute('aria-expanded', open ? 'false' : 'true');
  });

  // ============================================================
  // EVENT WIRING
  // ============================================================
  // Tap the day pill → opens the rotation editor so you can rename /
  // reorder / add / delete entries (e.g. switch Push/Pull/Legs/Rest to
  // Legs/Arms/Back/Chest). Long-press isn't a thing on web reliably so
  // this is the only action — the day filter still auto-snaps on load.
  $('dayPill').addEventListener('click', () => openRotationModal());

  // First-load nicety: if today's split matches one of the day filters
  // by name (case-insensitive) and the user hasn't manually picked one,
  // pre-select that day.
  (function autoSelectTodaySplit() {
    const s = todaySplit();
    if (!s.name || isRestName(s.name) || state._userPickedDay) return;
    const match = state.days.find(d => d.name.toLowerCase() === s.name.toLowerCase());
    if (match) state.filterDay = match.id;
  })();

  $('exSelect').addEventListener('change', e => {
    state.currentEx = e.target.value; saveState(); renderAll();
  });
  $('weightDownBtn').addEventListener('click', () => {
    const ex = getCurrentEx(); if (!ex || ex.bw) return;
    const w = parseFloat($('weightInput').value) || 0;
    $('weightInput').value = Math.max(0, w - (ex.step || 2.5));
  });
  $('weightUpBtn').addEventListener('click', () => {
    const ex = getCurrentEx(); if (!ex || ex.bw) return;
    const w = parseFloat($('weightInput').value) || 0;
    $('weightInput').value = w + (ex.step || 2.5);
  });
  // Delegated click handler — reps row is regenerated per exercise via
  // renderRepsRow(), so we listen on the container rather than the
  // individual buttons.
  $('repsRow').addEventListener('click', (e) => {
    const p = e.target.closest('.po-reps-pill');
    if (!p) return;
    $('repsRow').querySelectorAll('.po-reps-pill').forEach(x => x.classList.remove('active'));
    p.classList.add('active');
    $('repsRow').dataset.value = p.dataset.v;
  });
  $('logBtn').addEventListener('click', () => {
    const ex = getCurrentEx();
    if (!ex) return;
    const reps = parseInt($('repsRow').dataset.value, 10) || 0;
    if (reps <= 0) { alert('Pick a rep count.'); return; }
    const w = ex.bw ? 0 : (parseFloat($('weightInput').value) || 0);
    if (!ex.bw && w <= 0) { alert('Enter a weight.'); return; }
    const arr = state.logs[ex.id] || [];
    arr.push({ weight: w, reps: reps, date: new Date().toISOString() });
    state.logs[ex.id] = arr;
    saveState(); renderAll();
    // Strength changed → composition estimate may shift
    if (typeof wtRender === 'function') wtRender();
    // Tiny pulse on the button so the user feels the save
    const btn = $('logBtn');
    btn.style.transition = 'transform 0.15s';
    btn.style.transform = 'scale(0.96)';
    setTimeout(() => { btn.style.transform = ''; }, 160);
  });

  // ============================================================
  // EXERCISE MODAL (add / edit)
  // ============================================================
  let editingExId = null;
  let modalGym = null, modalDay = null;
  function renderModalSegs() {
    $('exGymSeg').innerHTML = state.gyms.map(g =>
      '<button data-gym="' + g.id + '" class="' + (modalGym === g.id ? 'active' : '') + '">' + escape(g.name) + '</button>'
    ).join('') + '<button data-gym="both" class="' + (modalGym === 'both' ? 'active' : '') + '">Both</button>';
    $('exDaySeg').innerHTML = state.days.map(d =>
      '<button data-day="' + d.id + '" class="' + (modalDay === d.id ? 'active' : '') + '">' + escape(d.name) + '</button>'
    ).join('');
    $('exGymSeg').querySelectorAll('button').forEach(b => {
      b.addEventListener('click', () => {
        modalGym = b.dataset.gym;
        $('exGymSeg').querySelectorAll('button').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
      });
    });
    $('exDaySeg').querySelectorAll('button').forEach(b => {
      b.addEventListener('click', () => {
        modalDay = b.dataset.day;
        $('exDaySeg').querySelectorAll('button').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
      });
    });
  }
  function openExModal(mode, ex) {
    editingExId = mode === 'edit' ? ex.id : null;
    $('exModalTitle').textContent = mode === 'edit' ? 'Edit exercise' : 'Add exercise';
    $('exDelete').style.display = mode === 'edit' ? 'block' : 'none';
    if (mode === 'edit') {
      $('exName').value = ex.name;
      modalGym = ex.gym;
      modalDay = ex.day;
      $('exBw').checked = !!ex.bw;
      $('exStartWeight').value = ex.startWeight || 0;
      $('exRepMin').value = ex.repMin;
      $('exRepMax').value = ex.repMax;
      $('exStep').value = ex.step;
    } else {
      $('exName').value = '';
      modalGym = state.filterGym;
      modalDay = state.filterDay;
      $('exBw').checked = false;
      $('exStartWeight').value = 20;
      $('exRepMin').value = 6;
      $('exRepMax').value = 8;
      $('exStep').value = 2.5;
    }
    renderModalSegs();
    toggleBwFields();
    $('exModalBg').classList.add('show');
    setTimeout(() => $('exName').focus(), 60);
  }
  function toggleBwFields() {
    const isBw = $('exBw').checked;
    $('exStartWeightField').style.display = isBw ? 'none' : '';
    $('exStepField').style.display = isBw ? 'none' : '';
  }
  $('exBw').addEventListener('change', toggleBwFields);
  $('addExBtn').addEventListener('click', () => openExModal('add'));
  $('editExBtn').addEventListener('click', () => {
    const ex = getCurrentEx();
    if (ex) openExModal('edit', ex);
  });
  $('exModalCancel').addEventListener('click', () => $('exModalBg').classList.remove('show'));
  $('exModalSave').addEventListener('click', () => {
    const name = $('exName').value.trim();
    if (!name) { alert('Name is required.'); return; }
    if (!modalGym) { alert('Pick a gym.'); return; }
    if (!modalDay) { alert('Pick a day.'); return; }
    const isBw = $('exBw').checked;
    const repMin = parseInt($('exRepMin').value, 10) || 6;
    const repMax = parseInt($('exRepMax').value, 10) || 8;
    const data = {
      name, gym: modalGym, day: modalDay,
      bw: isBw,
      startWeight: isBw ? 0 : (parseFloat($('exStartWeight').value) || 0),
      repMin, repMax,
      step: isBw ? 1 : (parseFloat($('exStep').value) || 2.5)
    };
    if (editingExId) {
      const ex = state.exercises.find(e => e.id === editingExId);
      if (ex) Object.assign(ex, data);
    } else {
      const ex = Object.assign({ id: uid() }, data);
      state.exercises.push(ex);
      state.currentEx = ex.id;
      state.filterGym = (modalGym === 'both') ? state.filterGym : modalGym;
      state.filterDay = modalDay;
    }
    saveState();
    $('exModalBg').classList.remove('show');
    renderAll();
  });
  $('exDelete').addEventListener('click', () => {
    if (!editingExId) return;
    if (!confirm('Delete this exercise and all its logs?')) return;
    state.exercises = state.exercises.filter(e => e.id !== editingExId);
    delete state.logs[editingExId];
    if (state.currentEx === editingExId) state.currentEx = null;
    editingExId = null;
    saveState();
    $('exModalBg').classList.remove('show');
    renderAll();
  });

  // ============================================================
  // ROTATION EDITOR (tap the day pill)
  // Edit the split cycle in place: rename, reorder, add, delete.
  // "Today is →" jumps the cycle anchor to any entry, so you can change
  // both the order AND which day in that order is "today".
  // ============================================================
  let rotDraft = null;          // working copy while modal is open
  let rotDraftTodayIdx = 0;     // which entry IS today in the draft

  function openRotationModal() {
    rotDraft = (state.splitRotation || []).slice();
    if (!rotDraft.length) rotDraft = ['Push', 'Pull', 'Legs', 'Rest'];
    rotDraftTodayIdx = todaySplit().index;
    if (rotDraftTodayIdx >= rotDraft.length) rotDraftTodayIdx = 0;
    renderRotList();
    $('rotModalBg').classList.add('show');
  }

  function renderRotList() {
    const list = $('rotList');
    list.innerHTML = rotDraft.map((name, i) => {
      const isToday = (i === rotDraftTodayIdx);
      return '<div class="rot-row ' + (isToday ? 'is-today' : '') + '" data-i="' + i + '">'
        + '<span class="rot-row-num">' + (i + 1) + '</span>'
        + '<input type="text" value="' + escape(name) + '" placeholder="e.g. Arms" maxlength="30">'
        + (isToday
            ? '<span class="rot-today-tag">TODAY</span>'
            : '<button type="button" class="rot-today-btn" data-action="today">Today is →</button>')
        + '<button type="button" class="rot-mini" data-action="up"   aria-label="Move up">↑</button>'
        + '<button type="button" class="rot-mini" data-action="down" aria-label="Move down">↓</button>'
        + '<button type="button" class="rot-mini rot-mini-del" data-action="del" aria-label="Delete">×</button>'
        + '</div>';
    }).join('');
    list.querySelectorAll('.rot-row').forEach(row => {
      const i = parseInt(row.dataset.i, 10);
      row.querySelector('input').addEventListener('input', e => { rotDraft[i] = e.target.value; });
      const upBtn = row.querySelector('[data-action="up"]');
      const dnBtn = row.querySelector('[data-action="down"]');
      const delBtn = row.querySelector('[data-action="del"]');
      const todayBtn = row.querySelector('[data-action="today"]');
      if (upBtn) upBtn.addEventListener('click', () => {
        if (i === 0) return;
        [rotDraft[i-1], rotDraft[i]] = [rotDraft[i], rotDraft[i-1]];
        if (rotDraftTodayIdx === i)   rotDraftTodayIdx = i - 1;
        else if (rotDraftTodayIdx === i - 1) rotDraftTodayIdx = i;
        renderRotList();
      });
      if (dnBtn) dnBtn.addEventListener('click', () => {
        if (i >= rotDraft.length - 1) return;
        [rotDraft[i+1], rotDraft[i]] = [rotDraft[i], rotDraft[i+1]];
        if (rotDraftTodayIdx === i)   rotDraftTodayIdx = i + 1;
        else if (rotDraftTodayIdx === i + 1) rotDraftTodayIdx = i;
        renderRotList();
      });
      if (delBtn) delBtn.addEventListener('click', () => {
        if (rotDraft.length <= 1) { alert('Need at least one day in the cycle.'); return; }
        rotDraft.splice(i, 1);
        if (rotDraftTodayIdx >= rotDraft.length) rotDraftTodayIdx = rotDraft.length - 1;
        else if (i < rotDraftTodayIdx) rotDraftTodayIdx--;
        renderRotList();
      });
      if (todayBtn) todayBtn.addEventListener('click', () => {
        rotDraftTodayIdx = i;
        renderRotList();
      });
    });
  }

  $('rotAddBtn').addEventListener('click', () => {
    rotDraft.push('New day');
    renderRotList();
    // Focus the newly added input
    setTimeout(() => {
      const inputs = $('rotList').querySelectorAll('input');
      const last = inputs[inputs.length - 1];
      if (last) { last.focus(); last.select(); }
    }, 30);
  });
  $('rotCancel').addEventListener('click', () => {
    $('rotModalBg').classList.remove('show');
    rotDraft = null;
  });
  $('rotSave').addEventListener('click', () => {
    // Trim + drop empty entries
    const cleaned = rotDraft.map(s => (s || '').trim()).filter(Boolean);
    if (!cleaned.length) { alert('Need at least one day in the cycle.'); return; }
    let newTodayIdx = rotDraftTodayIdx;
    if (newTodayIdx >= cleaned.length) newTodayIdx = 0;
    state.splitRotation = cleaned;
    state.splitAnchor = {
      date: new Date().toISOString().slice(0, 10),
      index: newTodayIdx
    };
    saveState();
    $('rotModalBg').classList.remove('show');
    rotDraft = null;
    renderAll();
  });

  // ============================================================
  // SETTINGS MODAL (gyms, days, units, data)
  // ============================================================
  function renderSettings() {
    $('setUnitsSeg').querySelectorAll('button').forEach(b => {
      b.classList.toggle('active', b.dataset.u === state.units);
    });
    $('setGyms').innerHTML = state.gyms.map((g, i) =>
      '<div class="po-set-row" data-i="' + i + '">'
      + '<input type="text" value="' + escape(g.name) + '" data-field="name" placeholder="Gym name">'
      + '<button class="po-mini-btn" data-action="del" aria-label="Delete">×</button>'
      + '</div>'
    ).join('');
    $('setDays').innerHTML = state.days.map((d, i) =>
      '<div class="po-set-row" data-i="' + i + '">'
      + '<input type="text" value="' + escape(d.name) + '" data-field="name" placeholder="Day name">'
      + '<button class="po-mini-btn" data-action="del" aria-label="Delete">×</button>'
      + '</div>'
    ).join('');
    $('setGyms').querySelectorAll('.po-set-row').forEach(row => {
      const i = parseInt(row.dataset.i, 10);
      row.querySelector('input').addEventListener('input', e => {
        state.gyms[i].name = e.target.value;
        saveState();
      });
      row.querySelector('[data-action="del"]').addEventListener('click', () => {
        if (state.gyms.length <= 1) { alert('You need at least one gym.'); return; }
        if (!confirm('Remove "' + state.gyms[i].name + '"? Exercises tagged to this gym will become invisible until you reassign them.')) return;
        state.gyms.splice(i, 1);
        if (!state.gyms.find(g => g.id === state.filterGym)) state.filterGym = state.gyms[0].id;
        saveState(); renderSettings(); renderAll();
      });
    });
    $('setDays').querySelectorAll('.po-set-row').forEach(row => {
      const i = parseInt(row.dataset.i, 10);
      row.querySelector('input').addEventListener('input', e => {
        state.days[i].name = e.target.value;
        saveState();
      });
      row.querySelector('[data-action="del"]').addEventListener('click', () => {
        if (state.days.length <= 1) { alert('You need at least one day.'); return; }
        if (!confirm('Remove "' + state.days[i].name + '"?')) return;
        state.days.splice(i, 1);
        if (!state.days.find(d => d.id === state.filterDay)) state.filterDay = state.days[0].id;
        saveState(); renderSettings(); renderAll();
      });
    });
  }
  $('settingsBtn').addEventListener('click', () => {
    renderSettings();
    $('setModalBg').classList.add('show');
  });
  $('setModalClose').addEventListener('click', () => {
    $('setModalBg').classList.remove('show');
    renderAll();
  });
  $('setUnitsSeg').querySelectorAll('button').forEach(b => {
    b.addEventListener('click', () => {
      state.units = b.dataset.u; saveState();
      $('setUnitsSeg').querySelectorAll('button').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      if (typeof wtRender === 'function') wtRender();
    });
  });
  $('setAddGym').addEventListener('click', () => {
    const name = (prompt('New gym name:') || '').trim();
    if (!name) return;
    const id = 'g_' + Date.now();
    state.gyms.push({ id, name });
    saveState(); renderSettings(); renderAll();
  });
  $('setAddDay').addEventListener('click', () => {
    const name = (prompt('New day name:') || '').trim();
    if (!name) return;
    const id = 'd_' + Date.now();
    state.days.push({ id, name });
    saveState(); renderSettings(); renderAll();
  });

  // Export / Import / Reset
  $('setExport').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'po-coach-data-' + new Date().toISOString().slice(0,10) + '.json';
    a.click(); URL.revokeObjectURL(url);
  });
  $('setImport').addEventListener('click', () => $('setImportFile').click());
  $('setImportFile').addEventListener('change', e => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!confirm('Replace ALL current data with the imported file? This cannot be undone.')) return;
        state = normalize(parsed);
        saveState(); renderSettings(); renderAll();
      } catch (err) { alert('Import failed: ' + err.message); }
    };
    reader.readAsText(file);
  });
  $('setReset').addEventListener('click', () => {
    if (!confirm('Delete EVERYTHING (logs, edits, gyms, days)? This cannot be undone.')) return;
    localStorage.removeItem(LS_KEY);
    state = loadState();
    $('setModalBg').classList.remove('show');
    renderAll();
  });

  function escape(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  // ============================================================
  // WEIGHT TRACKER + COMPOSITION ESTIMATE + PROGRESS PHOTOS
  // All persisted to localStorage:
  //   po_coach_weights : [{ dateKey:'YYYY-MM-DD', weight:Number }]
  //   po_coach_photos  : [{ id, dataUrl, dateKey, weight }]
  // ============================================================
  const WT_KEY = 'po_coach_weights';
  const PHOTO_KEY = 'po_coach_photos';

  function wtLoad() {
    try {
      const raw = localStorage.getItem(WT_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr.sort((a,b) => a.dateKey.localeCompare(b.dateKey)) : [];
    } catch (e) { return []; }
  }
  function wtSave(arr) {
    try { localStorage.setItem(WT_KEY, JSON.stringify(arr)); } catch (e) {}
  }
  function wtDateKey(d) {
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  }
  function wtParseKey(key) {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  function wtSmoothPath(points) {
    if (!points.length) return '';
    if (points.length === 1) return 'M ' + points[0].x + ' ' + points[0].y;
    let d = 'M ' + points[0].x.toFixed(2) + ' ' + points[0].y.toFixed(2);
    for (let i = 1; i < points.length; i++) {
      const prev = points[i-1], curr = points[i];
      const cx = (prev.x + curr.x) / 2;
      d += ' Q ' + cx.toFixed(2) + ' ' + prev.y.toFixed(2) + ', ' + cx.toFixed(2) + ' ' + ((prev.y + curr.y)/2).toFixed(2);
      d += ' T ' + curr.x.toFixed(2) + ' ' + curr.y.toFixed(2);
    }
    return d;
  }

  let wtEntries = wtLoad();

  function wtSaveEntry(weight) {
    const key = wtDateKey(new Date());
    const existing = wtEntries.find(e => e.dateKey === key);
    if (existing) existing.weight = weight;
    else { wtEntries.push({ dateKey: key, weight }); wtEntries.sort((a,b) => a.dateKey.localeCompare(b.dateKey)); }
    wtSave(wtEntries);
    wtRender();
  }

  function wtRender() {
    const last = wtEntries[wtEntries.length - 1] || null;
    const todayKey = wtDateKey(new Date());
    const todayEntry = wtEntries.find(e => e.dateKey === todayKey);
    const u = state.units;

    // Sync unit labels everywhere
    $('wtUnit').textContent = u;
    $('wtUnitStatic').textContent = u;
    $('wtNum').textContent = last ? last.weight.toFixed(1) : '—';

    // Locked vs input
    if (todayEntry) {
      $('wtEmpty').classList.add('hidden');
      $('wtLockedValue').textContent = todayEntry.weight.toFixed(1) + ' ' + u;
      $('wtLocked').classList.remove('hidden');
      $('wtInputRow').classList.add('hidden');
    } else {
      if (wtEntries.length === 0) $('wtEmpty').classList.remove('hidden');
      else $('wtEmpty').classList.add('hidden');
      $('wtLocked').classList.add('hidden');
      $('wtInputRow').classList.remove('hidden');
      if (last && !$('wtInput').value) $('wtInput').value = last.weight.toFixed(1);
    }

    // Chart, delta, composition need 2+ entries
    if (wtEntries.length >= 2) {
      $('wtChartWrap').classList.remove('hidden');
      $('wtLegend').classList.remove('hidden');
      wtRenderChart();
      wtRenderDelta();
      wtRenderComposition();
    } else {
      $('wtChartWrap').classList.add('hidden');
      $('wtLegend').classList.add('hidden');
      $('wtDelta').classList.add('hidden');
      $('wtComp').classList.add('hidden');
    }
    wtRenderStreak();
  }

  // Streak — consecutive days ending at today (or yesterday if today
  // hasn't been logged yet) with at least one weight entry.
  function wtRenderStreak() {
    const el = $('wtStreak');
    let streak = 0;
    let cursor = new Date(new Date());
    if (!wtEntries.find(e => e.dateKey === wtDateKey(cursor))) {
      cursor.setDate(cursor.getDate() - 1);
    }
    while (wtEntries.find(e => e.dateKey === wtDateKey(cursor))) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    }
    if (streak >= 2) {
      $('wtStreakNum').textContent = streak + ' day streak';
      el.classList.remove('hidden');
    } else {
      el.classList.add('hidden');
    }
  }

  function wtRenderChart() {
    const recent = wtEntries.slice(-30);
    const weights = recent.map(e => e.weight);
    const min = Math.min.apply(null, weights);
    const max = Math.max.apply(null, weights);
    const pad = Math.max((max - min) * 0.15, 0.5);
    const yMin = min - pad, yMax = max + pad;
    const xLeft = 8, xRight = 312, yTop = 20, yBot = 110;
    const xRange = xRight - xLeft, yRange = yBot - yTop;
    const xFor = (i) => recent.length === 1 ? xRight : xLeft + (i / (recent.length - 1)) * xRange;
    const yFor = (w) => yBot - ((w - yMin) / (yMax - yMin)) * yRange;
    const points = recent.map((e, i) => ({ x: xFor(i), y: yFor(e.weight) }));
    const linePath = wtSmoothPath(points);
    const areaPath = linePath + ' L ' + points[points.length - 1].x.toFixed(2) + ' ' + yBot + ' L ' + points[0].x.toFixed(2) + ' ' + yBot + ' Z';
    // 7d moving avg
    const avgPoints = recent.map((_, i) => {
      const start = Math.max(0, i - 6);
      const win = recent.slice(start, i + 1);
      const avg = win.reduce((s, p) => s + p.weight, 0) / win.length;
      return { x: xFor(i), y: yFor(avg) };
    });
    const avgPath = wtSmoothPath(avgPoints);
    let html = '<path class="wt-avg-line" d="' + avgPath + '"></path>'
             + '<path class="wt-area" d="' + areaPath + '"></path>'
             + '<path class="wt-line" filter="url(#wtGlow)" d="' + linePath + '"></path>';
    points.forEach((p, i) => {
      const cls = (i === points.length - 1) ? 'wt-dot-today' : 'wt-dot';
      const r = (i === points.length - 1) ? 5 : 3;
      html += '<circle class="' + cls + '" cx="' + p.x.toFixed(2) + '" cy="' + p.y.toFixed(2) + '" r="' + r + '"/>';
    });
    $('wtChartContent').innerHTML = html;
    $('wtYAxisMax').textContent = yMax.toFixed(1);
    $('wtYAxisMin').textContent = yMin.toFixed(1);
    $('wtMeta').textContent = wtEntries.length + ' ' + (wtEntries.length === 1 ? 'entry' : 'entries') + ' · last ' + recent.length + ' days';
  }

  function wtRenderDelta() {
    const last = wtEntries[wtEntries.length - 1];
    const lastDate = wtParseKey(last.dateKey);
    const cutoff = new Date(lastDate); cutoff.setDate(cutoff.getDate() - 7);
    const baseline = wtEntries.find(e => wtParseKey(e.dateKey) >= cutoff) || wtEntries[0];
    const diff = last.weight - baseline.weight;
    const el = $('wtDelta');
    if (Math.abs(diff) < 0.05) { el.classList.add('hidden'); return; }
    const arrow = diff > 0 ? '↑' : '↓';
    const sign = diff > 0 ? '+' : '−';
    el.textContent = arrow + ' ' + sign + Math.abs(diff).toFixed(1) + ' ' + state.units + ' · last 7d';
    el.classList.toggle('up',   diff > 0);
    el.classList.toggle('down', diff < 0);
    el.classList.remove('hidden');
  }

  // ============================================================
  // COMPOSITION ESTIMATE — muscle vs fat from weight + strength trend
  //
  // Math:
  //   weightDelta   = current weight − weight ~30 days ago
  //   strengthDelta = avg of (current 1RM / 1RM 30 days ago across all
  //                   exercises with logs in BOTH windows)
  //   yearsTraining → max muscle gain rate per week:
  //     1y → 0.45 kg, 2y → 0.23 kg, 3y+ → 0.11 kg (Lyle McDonald's
  //     model — cited intermediate intermediate values are real ceilings)
  //   estimated muscle gain = max muscle rate × weeks × (1 + strengthDelta)
  //                           clipped to [0, weightDelta]
  //   estimated fat gain    = weightDelta − estimated muscle gain
  //
  // If you LOSE weight: any positive strength delta means you're keeping
  // (or building) muscle, so the loss is mostly fat.
  // ============================================================
  function wtRenderComposition() {
    const compEl = $('wtComp');
    if (!CONFIG.composition || !CONFIG.composition.enabled) {
      compEl.classList.add('hidden'); return;
    }
    const window = CONFIG.composition.windowDays || 30;
    if (wtEntries.length < 2) { compEl.classList.add('hidden'); return; }

    const now = wtParseKey(wtEntries[wtEntries.length - 1].dateKey);
    const start = new Date(now); start.setDate(start.getDate() - window);

    // Find weight at start of window (closest entry on or after start)
    const startEntry = wtEntries.find(e => wtParseKey(e.dateKey) >= start);
    const endEntry = wtEntries[wtEntries.length - 1];
    if (!startEntry || startEntry === endEntry) { compEl.classList.add('hidden'); return; }
    const weightDelta = endEntry.weight - startEntry.weight;
    const actualDays = Math.max(1, Math.round((wtParseKey(endEntry.dateKey) - wtParseKey(startEntry.dateKey)) / 86400000));
    const weeks = actualDays / 7;

    // Strength delta — for each exercise, take the AVG 1RM of logs inside
    // the window vs AVG of logs of equal count just before the window.
    let strengthRatios = [];
    let workoutDays = new Set();
    let totalVolumeInWindow = 0;
    state.exercises.forEach(ex => {
      const logs = (state.logs[ex.id] || []).slice();
      if (logs.length < 2 || ex.bw) {
        // Still count volume / sessions even for bodyweight + sparse exercises
        logs.forEach(l => {
          if (new Date(l.date) >= start) {
            workoutDays.add(l.date.slice(0, 10));
            totalVolumeInWindow += (l.weight || 0) * (l.reps || 0);
          }
        });
        return;
      }
      const inWin  = logs.filter(l => new Date(l.date) >= start);
      const before = logs.filter(l => new Date(l.date) < start);
      inWin.forEach(l => {
        workoutDays.add(l.date.slice(0, 10));
        totalVolumeInWindow += (l.weight || 0) * (l.reps || 0);
      });
      if (!inWin.length || !before.length) return;
      const avg = arr => arr.reduce((s, l) => s + estimate1RM(l.weight, l.reps), 0) / arr.length;
      const a = avg(before), b = avg(inWin);
      if (a <= 0) return;
      strengthRatios.push(b / a);
    });
    const strengthDelta = strengthRatios.length
      ? (strengthRatios.reduce((s, r) => s + r, 0) / strengthRatios.length) - 1
      : 0;
    // Frequency factor: 4+ training days/week = full credit, fewer = penalty.
    // Volume factor: moderate cap so a single huge day doesn't game the score.
    const sessionsPerWeek = (workoutDays.size / actualDays) * 7;
    const frequencyFactor = Math.max(0.4, Math.min(1.2, sessionsPerWeek / 4));

    // Max muscle gain rate per week (kg). Convert to lb if user's units are lb.
    const yt = CONFIG.composition.yearsTraining || 1;
    let maxMuscleKgPerWeek;
    if (yt <= 1) maxMuscleKgPerWeek = 0.45;
    else if (yt === 2) maxMuscleKgPerWeek = 0.23;
    else maxMuscleKgPerWeek = 0.11;
    const unitConv = (state.units === 'lb') ? 2.20462 : 1;
    const maxMusclePerWeek = maxMuscleKgPerWeek * unitConv;

    // Estimated muscle: scale by strength gain (capped between 0.5x and 1.5x)
    // AND by training frequency (you can't build muscle you didn't stimulate).
    const strengthBoost = Math.max(0.5, Math.min(1.5, 1 + strengthDelta * 4));
    let estMuscle = maxMusclePerWeek * weeks * strengthBoost * frequencyFactor;

    let estFat;
    let headlineCls = '';
    let headline = '';
    if (weightDelta > 0) {
      // Surplus: split between muscle and fat. Cap muscle at the weight gained.
      estMuscle = Math.min(estMuscle, weightDelta);
      estFat = Math.max(0, weightDelta - estMuscle);
      const musclePct = estMuscle / weightDelta;
      if (musclePct >= 0.6 && strengthDelta > 0) {
        headlineCls = 'good';
        headline = '+' + weightDelta.toFixed(1) + ' ' + state.units + ' — mostly muscle, strength up.';
      } else if (musclePct >= 0.35) {
        headlineCls = 'warn';
        headline = '+' + weightDelta.toFixed(1) + ' ' + state.units + ' — mixed. Tighten kcal or push lifts harder.';
      } else {
        headlineCls = 'bad';
        headline = '+' + weightDelta.toFixed(1) + ' ' + state.units + ' — mostly fat. Strength flat. Cut kcal.';
      }
    } else {
      // Deficit: assume fat first, only credit muscle loss if strength dropped.
      const wDown = Math.abs(weightDelta);
      if (strengthDelta >= 0) {
        // Strength preserved or up → all fat lost, slight muscle gain
        estMuscle = Math.min(maxMusclePerWeek * weeks * 0.3, 0.5);
        estFat = wDown + estMuscle;
        headlineCls = 'good';
        headline = '−' + wDown.toFixed(1) + ' ' + state.units + ' — strength holding, fat dropping.';
      } else {
        // Strength dropped → some muscle loss
        const lossPct = Math.min(0.4, Math.abs(strengthDelta) * 2);
        estMuscle = -wDown * lossPct;
        estFat = -(wDown + estMuscle);
        headlineCls = 'warn';
        headline = '−' + wDown.toFixed(1) + ' ' + state.units + ' — strength slipping. You may be losing muscle.';
      }
    }

    // Render
    compEl.classList.remove('hidden');
    $('wtCompWindow').textContent = 'last ' + actualDays + 'd';
    const headlineEl = $('wtCompHeadline');
    headlineEl.textContent = headline;
    headlineEl.className = 'wt-comp-headline ' + headlineCls;

    // Bars
    const totalAbs = Math.abs(estMuscle) + Math.abs(estFat) || 1;
    const musclePct = (Math.abs(estMuscle) / totalAbs) * 100;
    const fatPct = (Math.abs(estFat) / totalAbs) * 100;
    $('wtCompBars').innerHTML =
      '<div class="wt-comp-bar muscle" style="width:' + musclePct.toFixed(1) + '%"></div>' +
      '<div class="wt-comp-bar fat" style="width:' + fatPct.toFixed(1) + '%"></div>';

    // Foot line — strength + training frequency (so you can see why the
    // muscle estimate is what it is).
    const sd = strengthDelta * 100;
    const sdStr = (sd >= 0 ? '+' : '') + sd.toFixed(1) + '%';
    const muscleSign = estMuscle >= 0 ? '+' : '';
    const fatSign = estFat >= 0 ? '+' : '';
    const freqStr = sessionsPerWeek.toFixed(1) + ' sessions/wk';
    $('wtCompFoot').textContent =
      '~' + muscleSign + estMuscle.toFixed(1) + ' ' + state.units + ' muscle · '
      + '~' + fatSign + estFat.toFixed(1) + ' ' + state.units + ' fat · '
      + 'strength ' + sdStr
      + ' · ' + freqStr
      + (strengthRatios.length ? '' : ' (no lift data)');
  }

  // Wire weight UI
  $('wtSaveBtn').addEventListener('click', () => {
    const v = parseFloat($('wtInput').value);
    if (isNaN(v) || v <= 0) return;
    wtSaveEntry(v);
  });
  $('wtInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $('wtSaveBtn').click();
  });
  $('wtEditBtn').addEventListener('click', () => {
    $('wtLocked').classList.add('hidden');
    $('wtInputRow').classList.remove('hidden');
    const todayEntry = wtEntries.find(e => e.dateKey === wtDateKey(new Date()));
    if (todayEntry) $('wtInput').value = todayEntry.weight.toFixed(1);
    $('wtInput').focus(); $('wtInput').select();
  });

  // ============================================================
  // PROGRESS PHOTOS
  // ============================================================
  let photos = [];
  try {
    const raw = localStorage.getItem(PHOTO_KEY);
    if (raw) photos = JSON.parse(raw);
  } catch (e) { photos = []; }

  function photosSave() {
    try {
      localStorage.setItem(PHOTO_KEY, JSON.stringify(photos));
      return true;
    } catch (e) {
      return false;
    }
  }
  // Downscale a dataURL to a max longest-side dimension and re-encode as
  // JPEG. Phone camera photos are often 2–5MB which blows the ~5MB
  // localStorage quota after one or two saves. Compressing to ~1080px /
  // q=0.75 typically drops each photo to <100KB.
  function compressPhotoDataUrl(dataUrl, maxDim, quality) {
    maxDim = maxDim || 1080;
    quality = quality == null ? 0.75 : quality;
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        let w = img.naturalWidth || img.width;
        let h = img.naturalHeight || img.height;
        if (w > maxDim || h > maxDim) {
          if (w >= h) { h = Math.round(h * (maxDim / w)); w = maxDim; }
          else { w = Math.round(w * (maxDim / h)); h = maxDim; }
        }
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        try { resolve(c.toDataURL('image/jpeg', quality)); }
        catch { resolve(dataUrl); }
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  }
  function photoFmtDate(key) {
    const d = wtParseKey(key);
    const mons = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return mons[d.getMonth()] + ' ' + d.getDate();
  }
  function photoCurrentWeight() {
    const last = wtEntries[wtEntries.length - 1];
    return last ? (last.weight.toFixed(1) + ' ' + state.units) : '—';
  }
  function photosRender() {
    const grid = $('wtPhotoGrid');
    if (!photos.length) {
      grid.innerHTML = '<div class="wt-photo-empty">No photos yet · tap Take Photo to start</div>';
    } else {
      grid.innerHTML = photos.map(p =>
        '<button class="wt-photo-card" data-id="' + p.id + '" type="button">' +
          '<img src="' + p.dataUrl + '" alt="">' +
          '<div class="wt-photo-overlay"></div>' +
          '<div class="wt-photo-meta">' +
            '<span class="wt-photo-date">' + photoFmtDate(p.dateKey) + '</span>' +
            '<span class="wt-photo-weight">' + (p.weight || '—') + '</span>' +
          '</div>' +
        '</button>'
      ).join('');
      grid.querySelectorAll('.wt-photo-card').forEach(card => {
        card.addEventListener('click', () => openPhoto(card.dataset.id));
      });
    }
    // Update count on the link
    if (!photos.length) $('wtProgressCount').textContent = '0 photos';
    else if (photos.length === 1) $('wtProgressCount').textContent = '1 photo · latest ' + photoFmtDate(photos[0].dateKey);
    else $('wtProgressCount').textContent = photos.length + ' photos · latest ' + photoFmtDate(photos[0].dateKey);
  }
  async function photosAdd(dataUrl) {
    let compressed = dataUrl;
    try { compressed = await compressPhotoDataUrl(dataUrl); } catch {}
    const id = 'p' + Date.now() + '_' + Math.floor(Math.random() * 999);
    const entry = {
      id,
      dataUrl: compressed,
      dateKey: wtDateKey(new Date()),
      weight: photoCurrentWeight()
    };
    photos.unshift(entry);
    if (!photosSave()) {
      // Storage was full even after compression — try once more at lower
      // quality before giving up.
      try {
        entry.dataUrl = await compressPhotoDataUrl(dataUrl, 800, 0.6);
      } catch {}
      if (!photosSave()) {
        photos.shift();
        alert('Phone storage is full — delete some older progress photos before adding a new one.');
        return;
      }
    }
    photosRender();
  }
  function fileToPhoto(file) {
    const r = new FileReader();
    r.onload = (e) => photosAdd(e.target.result);
    r.readAsDataURL(file);
  }

  $('wtProgressLink').addEventListener('click', () => {
    photosRender();
    $('wtOverlay').classList.add('is-open');
    document.body.style.overflow = 'hidden';
  });
  $('wtBack').addEventListener('click', () => {
    $('wtOverlay').classList.remove('is-open');
    document.body.style.overflow = '';
  });

  // Take Photo: try in-browser camera, fall back to file input
  let camStream = null;
  let camFacing = 'environment';
  async function openCam() {
    $('wtCam').classList.add('is-open');
    try {
      camStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: camFacing } }, audio: false
      });
      $('wtCamVideo').srcObject = camStream;
    } catch (e) {
      try {
        camStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        $('wtCamVideo').srcObject = camStream;
      } catch (e2) {
        closeCam();
        alert('Camera unavailable. Use "From Library" instead.');
        throw e2;
      }
    }
  }
  function closeCam() {
    if (camStream) { camStream.getTracks().forEach(t => t.stop()); camStream = null; }
    $('wtCamVideo').srcObject = null;
    $('wtCam').classList.remove('is-open');
  }
  $('wtTakePhotoBtn').addEventListener('click', async () => {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      try { await openCam(); return; } catch (e) {}
    }
    $('wtFileCamera').click();
  });
  $('wtFileCamera').addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0];
    if (f) fileToPhoto(f);
    e.target.value = '';
  });
  $('wtFromLibraryBtn').addEventListener('click', () => $('wtFileLibrary').click());
  $('wtFileLibrary').addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0];
    if (f) fileToPhoto(f);
    e.target.value = '';
  });
  $('wtCamCancel').addEventListener('click', closeCam);
  $('wtCamFlip').addEventListener('click', async () => {
    camFacing = camFacing === 'environment' ? 'user' : 'environment';
    if (camStream) camStream.getTracks().forEach(t => t.stop());
    try { await openCam(); } catch (e) {}
  });
  $('wtCamShutter').addEventListener('click', () => {
    const video = $('wtCamVideo'), canvas = $('wtCamCanvas');
    if (!video.videoWidth) return;
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    closeCam();
    photosAdd(dataUrl);
  });

  // Photo viewer
  let activePhotoId = null;
  let comparePhotoId = null;       // the OTHER photo being compared to
  let pvDeleteConfirm = false;
  function openPhoto(id) {
    const p = photos.find(x => x.id === id);
    if (!p) return;
    activePhotoId = id;
    $('wtViewerImg').src = p.dataUrl;
    $('wtViewerDate').textContent = photoFmtDate(p.dateKey).toUpperCase();
    $('wtViewerWeight').textContent = p.weight || '—';
    $('wtViewer').dataset.mode = 'single';
    $('wtViewer').classList.add('is-open');
    pvDeleteConfirm = false;
    $('wtViewerDelete').textContent = 'Delete';
    $('wtViewerDelete').classList.remove('is-confirm');
    // Disable Compare button if there's no other photo to compare against
    $('wtViewerCompare').disabled = photos.length < 2;
    $('wtViewerCompare').style.opacity = photos.length < 2 ? '0.4' : '';
  }
  function closePhoto() {
    $('wtViewer').classList.remove('is-open');
    $('wtViewer').dataset.mode = 'single';
    activePhotoId = null;
    comparePhotoId = null;
  }

  // Pull a number out of "162.0 lbs" / "73.5 kg" / "—"
  function parseWeightStr(w) {
    if (!w) return null;
    const m = String(w).match(/-?\d+(\.\d+)?/);
    return m ? parseFloat(m[0]) : null;
  }
  // Format a delta with arrow + sign
  function fmtDelta(diff, units) {
    if (diff == null) return '';
    if (Math.abs(diff) < 0.05) return '· no change';
    const sign = diff > 0 ? '+' : '−';
    return '· ' + sign + Math.abs(diff).toFixed(1) + ' ' + units;
  }

  // Pick the "compare to" photo for a given active id. Default: the most
  // recent photo BEFORE the active one (older → time-progress comparison).
  // Falls back to the most recent newer photo if active is the oldest.
  function defaultCompareFor(activeId) {
    const idx = photos.findIndex(p => p.id === activeId);
    if (idx === -1) return null;
    if (photos[idx + 1]) return photos[idx + 1].id;        // photos are stored newest-first
    if (photos[idx - 1]) return photos[idx - 1].id;
    return null;
  }

  function openCompare(activeId, otherId) {
    const A = photos.find(p => p.id === activeId);
    const B = photos.find(p => p.id === otherId);
    if (!A || !B) return;
    activePhotoId = activeId;
    comparePhotoId = otherId;
    $('wtCmpImgA').src = A.dataUrl;
    $('wtCmpImgB').src = B.dataUrl;
    $('wtCmpMetaA').textContent = photoFmtDate(A.dateKey) + ' · ' + (A.weight || '—');
    $('wtCmpMetaB').textContent = photoFmtDate(B.dateKey) + ' · ' + (B.weight || '—');
    // Headline — date arrow + weight delta
    const wA = parseWeightStr(A.weight);
    const wB = parseWeightStr(B.weight);
    const headEl = $('wtCompareHeadline');
    let cls = 'flat', headline = photoFmtDate(A.dateKey) + ' → ' + photoFmtDate(B.dateKey);
    if (wA != null && wB != null) {
      const diff = wA - wB; // active vs comparison
      headline += ' ' + fmtDelta(diff, state.units);
      if (Math.abs(diff) < 0.05) cls = 'flat';
      else if (diff > 0) cls = 'up';
      else cls = 'down';
    }
    headEl.textContent = headline;
    headEl.className = 'wt-compare-headline ' + cls;
    $('wtViewer').dataset.mode = 'compare';
    $('wtViewer').classList.add('is-open');
    pvDeleteConfirm = false;
    $('wtCompareDelete').textContent = 'Delete';
    $('wtCompareDelete').classList.remove('is-confirm');
  }

  function cycleCompareTarget() {
    if (!activePhotoId) return;
    const others = photos.filter(p => p.id !== activePhotoId);
    if (!others.length) return;
    const curIdx = others.findIndex(p => p.id === comparePhotoId);
    const nextIdx = (curIdx + 1) % others.length;
    openCompare(activePhotoId, others[nextIdx].id);
  }

  function deleteActivePhoto(deleteBtn) {
    if (!activePhotoId) return;
    if (!pvDeleteConfirm) {
      pvDeleteConfirm = true;
      deleteBtn.textContent = 'Confirm delete?';
      deleteBtn.classList.add('is-confirm');
      setTimeout(() => {
        pvDeleteConfirm = false;
        deleteBtn.textContent = 'Delete';
        deleteBtn.classList.remove('is-confirm');
      }, 3000);
      return;
    }
    photos = photos.filter(p => p.id !== activePhotoId);
    photosSave();
    photosRender();
    closePhoto();
  }

  $('wtViewerClose').addEventListener('click', closePhoto);
  $('wtCompareClose').addEventListener('click', closePhoto);
  $('wtViewerDelete').addEventListener('click', () => deleteActivePhoto($('wtViewerDelete')));
  $('wtCompareDelete').addEventListener('click', () => deleteActivePhoto($('wtCompareDelete')));
  $('wtViewerCompare').addEventListener('click', () => {
    if (!activePhotoId) return;
    const otherId = defaultCompareFor(activePhotoId);
    if (!otherId) { alert('Need at least one other photo to compare.'); return; }
    openCompare(activePhotoId, otherId);
  });
  $('wtCompareBack').addEventListener('click', () => {
    if (activePhotoId) {
      $('wtViewer').dataset.mode = 'single';
    } else {
      closePhoto();
    }
  });
  // Tap the right-hand "other" photo to cycle through different comparison targets
  $('wtCmpSideB').addEventListener('click', cycleCompareTarget);

  // ============================================================
  // BOOT
  // ============================================================
  renderAll();
  wtRender();
  photosRender();

  // ============================================================
  // CLOUD SYNC via Supabase  (OPTIONAL — leave blank for local-only)
  // ------------------------------------------------------------
  // Stores your gym state as one JSONB row in the public.app_state
  // table, keyed by APP_KEY. Supabase's realtime channel pushes
  // changes to every device the instant they happen.
  //
  // SETUP (5 minutes, all in a browser):
  //   1. Make a free account at https://supabase.com
  //   2. Create a new project
  //   3. In your project: Settings → API → copy your Project URL +
  //      "Publishable" key (the one starting with `sb_publishable_`)
  //   4. Paste them below, replacing the two placeholder strings
  //   5. Open the SQL Editor and run the SQL block from README.md
  //
  // If you leave the placeholders unchanged the app still works,
  // just only on this device (data stays in your browser).
  // ============================================================
  // Shared Supabase singleton — prevents GoTrueClient double-init warning
  if (!window._supa && window.supabase) {
    window._supa = window.supabase.createClient(
      'https://jxwhpnzbtgszlggfumow.supabase.co',
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp4d2hwbnpidGdzemxnZ2Z1bW93Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxODc1MjcsImV4cCI6MjA5NDc2MzUyN30.TVm6nPYhqrEWjo5-wCWHWIDPy0bctfHvPpdyXJG4vPs'
    );
  }
  const SUPABASE_URL = 'https://jxwhpnzbtgszlggfumow.supabase.co';
  const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp4d2hwbnpidGdzemxnZ2Z1bW93Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxODc1MjcsImV4cCI6MjA5NDc2MzUyN30.TVm6nPYhqrEWjo5-wCWHWIDPy0bctfHvPpdyXJG4vPs';
  const APP_KEY = 'po-coach';
  const PC_SYNCED_KEYS = ['po_coach_v1', 'po_coach_workout_done', 'po_coach_weights', 'po_coach_photos'];

  let pcSupa = null;
  let pcPushTimer = null;
  let pcSuppressSync = false;
  let pcPendingRemote = null;
  // JSON of the last state we sent or received — used to ignore
  // realtime echoes of our own pushes so we don't infinite-loop.
  let pcLastSyncedJson = null;

  const _pcOrigSet = localStorage.setItem.bind(localStorage);
  const _pcOrigRemove = localStorage.removeItem.bind(localStorage);
  // Wrap setItem/removeItem so a sync-side error can NEVER prevent the
  // underlying write from happening. The original call always runs;
  // any error in the sync scheduling is swallowed.
  localStorage.setItem = function(k, v) {
    _pcOrigSet(k, v);
    try {
      if (!pcSuppressSync && PC_SYNCED_KEYS.indexOf(k) !== -1) pcSchedulePush();
    } catch (e) {}
  };
  localStorage.removeItem = function(k) {
    _pcOrigRemove(k);
    try {
      if (!pcSuppressSync && PC_SYNCED_KEYS.indexOf(k) !== -1) pcSchedulePush();
    } catch (e) {}
  };

  function pcCollectState() {
    const out = {};
    for (const k of PC_SYNCED_KEYS) {
      const v = localStorage.getItem(k);
      if (v == null) continue;
      try { out[k] = JSON.parse(v); } catch {}
    }
    return out;
  }

  function pcIsUserEditing() {
    const ae = document.activeElement;
    if (!ae) return false;
    const tag = ae.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (ae.getAttribute && ae.getAttribute('contenteditable') === 'true') return true;
    return false;
  }

  function pcRerender() {
    // Reload every closure variable that mirrors a synced localStorage
    // key — otherwise renderAll/wtRender/photosRender would read stale
    // in-memory copies from before the remote pull.
    try { state = loadState(); } catch {}
    try { wtEntries = wtLoad(); } catch {}
    try {
      const raw = localStorage.getItem(PHOTO_KEY);
      photos = raw ? JSON.parse(raw) : [];
    } catch { photos = []; }
    try { renderAll(); } catch {}
    try { wtRender(); } catch {}
    try { photosRender(); } catch {}
  }

  function pcApplyRemoteState(remote) {
    if (!remote || typeof remote !== 'object') return false;
    pcSuppressSync = true;
    let changed = false;
    try {
      for (const k of PC_SYNCED_KEYS) {
        if (k in remote) {
          const incoming = JSON.stringify(remote[k]);
          const local = localStorage.getItem(k);
          if (local !== incoming) { try { _pcOrigSet(k, incoming); changed = true; } catch {} }
        } else if (localStorage.getItem(k) != null) {
          try { _pcOrigRemove(k); changed = true; } catch {}
        }
      }
    } finally {
      pcSuppressSync = false;
    }
    if (changed) { try { pcRerender(); } catch (e) {} }
    return changed;
  }

  function pcMaybeApplyRemote(remote) {
    if (pcIsUserEditing()) { pcPendingRemote = remote; return; }
    pcApplyRemoteState(remote);
  }

  function pcApplyPendingIfReady() {
    if (pcPendingRemote && !pcIsUserEditing()) {
      const r = pcPendingRemote;
      pcPendingRemote = null;
      pcApplyRemoteState(r);
    }
  }

  async function pcPushNow() {
    if (!pcSupa) return;
    const state = pcCollectState();
    const json = JSON.stringify(state);
    if (json === pcLastSyncedJson) return;
    try {
      const { error } = await pcSupa
        .from('app_state')
        .upsert(
          { key: APP_KEY, value: state, updated_at: new Date().toISOString() },
          { onConflict: 'key' }
        );
      if (!error) pcLastSyncedJson = json;
    } catch (_) {}
  }

  function pcSchedulePush() {
    if (pcSuppressSync) return;
    clearTimeout(pcPushTimer);
    pcPushTimer = setTimeout(pcPushNow, 250);
  }

  // Backup push on unload via fetch keepalive so a fast refresh
  // doesn't lose the latest change before the debounced push fires.
  function pcFlushPushOnUnload() {
    if (!pcSupa) return;
    const state = pcCollectState();
    const json = JSON.stringify(state);
    if (json === pcLastSyncedJson) return;
    try {
      fetch(SUPABASE_URL + '/rest/v1/app_state?on_conflict=key', {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': 'Bearer ' + SUPABASE_KEY,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates',
        },
        body: JSON.stringify({ key: APP_KEY, value: state, updated_at: new Date().toISOString() }),
        keepalive: true,
      }).catch(() => {});
      pcLastSyncedJson = json;
    } catch (_) {}
  }

  // Initial sync: connect Supabase, pull current state, subscribe to
  // realtime updates so other devices' changes appear instantly.
  (async function pcInitCloudSync() {
    if (!window.supabase || !SUPABASE_URL || !SUPABASE_KEY) return;
    // Skip if the placeholder values are still in place (local-only mode)
    if (SUPABASE_URL.indexOf('PASTE-') === 0 || SUPABASE_KEY.indexOf('PASTE-') === 0) return;
    pcSupa = window._supa || window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    try {
      const { data, error } = await pcSupa
        .from('app_state').select('value').eq('key', APP_KEY).maybeSingle();
      if (!error && data && data.value && Object.keys(data.value).length > 0) {
        pcLastSyncedJson = JSON.stringify(data.value);
        pcMaybeApplyRemote(data.value);
      } else if (Object.keys(pcCollectState()).length > 0) {
        pcSchedulePush();
      }
    } catch (_) {}
    pcSupa.channel('app_state_' + APP_KEY)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'app_state',
        filter: 'key=eq.' + APP_KEY,
      }, (payload) => {
        if (!payload.new || !payload.new.value) return;
        const incoming = JSON.stringify(payload.new.value);
        if (incoming === pcLastSyncedJson) return; // echo of our own push
        pcLastSyncedJson = incoming;
        pcMaybeApplyRemote(payload.new.value);
      })
      .subscribe();
  })();

  document.addEventListener('focusout', () => {
    setTimeout(pcApplyPendingIfReady, 0);
  }, true);
  window.addEventListener('pagehide', pcFlushPushOnUnload);
  window.addEventListener('beforeunload', pcFlushPushOnUnload);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pcFlushPushOnUnload();
  });
})();

/* ═══════════════════════════════════════════════════════════
   WATER COACH
   ═══════════════════════════════════════════════════════════ */
(function(){
  const WK = 'po_water_v1';
  const SUBSTANCE_DB = [
    {n:'Coffee',mg:95},{n:'Espresso',mg:63},{n:'Black Tea',mg:47},{n:'Green Tea',mg:28},
    {n:'Matcha',mg:70},{n:'Energy Drink (250ml)',mg:80},{n:'Red Bull (250ml)',mg:80},
    {n:'Monster (500ml)',mg:160},{n:'Pre-workout',mg:200},{n:'Diet Coke (355ml)',mg:46},
    {n:'Coke (355ml)',mg:34},{n:'Dark Chocolate (30g)',mg:20},{n:'White Tea',mg:15},
    {n:'Chai Latte',mg:50},{n:'Cold Brew (355ml)',mg:200},{n:'Decaf Coffee',mg:3},
  ];
  let wConfig = { goalMl: 2500, unit: 'ml' };
  let _wInited = false;

  function wGet() {
    try { return JSON.parse(localStorage.getItem(WK) || '{}'); } catch { return {}; }
  }
  function wSave(d) { localStorage.setItem(WK, JSON.stringify(d)); }
  function wToday() { return new Date().toISOString().slice(0,10); }

  function wGetConfig() {
    const d = wGet();
    return d.config || { goalMl: 2500, unit: 'ml' };
  }
  function wSaveConfig(cfg) {
    const d = wGet(); d.config = cfg; wSave(d);
  }

  function wTodayLog() {
    const d = wGet();
    if (!d.logs) d.logs = {};
    return d.logs[wToday()] || { water: [], substances: [] };
  }
  function wSaveTodayLog(log) {
    const d = wGet();
    if (!d.logs) d.logs = {};
    d.logs[wToday()] = log;
    // keep only last 14 days
    const keys = Object.keys(d.logs).sort().slice(-14);
    const pruned = {};
    keys.forEach(k => { pruned[k] = d.logs[k]; });
    d.logs = pruned;
    wSave(d);
  }

  window.wAddWater = function(ml) {
    const log = wTodayLog();
    log.water.push({ ml, ts: Date.now() });
    wSaveTodayLog(log);
    wRender();
  };

  window.wAddCustom = function() {
    const ml = parseInt(prompt('Enter amount in ml:'));
    if (!ml || isNaN(ml) || ml <= 0) return;
    wAddWater(ml);
  };

  window.wDeleteWater = function(ts) {
    const log = wTodayLog();
    log.water = log.water.filter(e => e.ts !== ts);
    wSaveTodayLog(log);
    wRender();
  };

  window.wDeleteSub = function(ts) {
    const log = wTodayLog();
    log.substances = log.substances.filter(e => e.ts !== ts);
    wSaveTodayLog(log);
    wRender();
  };

  function wCalcStreak() {
    const d = wGet();
    const cfg = wGetConfig();
    if (!d.logs) return 0;
    let streak = 0;
    const check = new Date(); check.setHours(0,0,0,0);
    // Don't count today if goal not reached yet
    const todayLog = d.logs[check.toISOString().slice(0,10)];
    const todayMl = todayLog ? todayLog.water.reduce((s,e) => s + e.ml, 0) : 0;
    if (todayMl < cfg.goalMl) check.setDate(check.getDate() - 1);
    while (true) {
      const ds = check.toISOString().slice(0,10);
      const dayLog = d.logs[ds];
      const dayMl = dayLog ? dayLog.water.reduce((s,e) => s + e.ml, 0) : 0;
      if (dayMl >= cfg.goalMl) { streak++; check.setDate(check.getDate() - 1); } else break;
    }
    return streak;
  }

  function wRender() {
    const cfg = wGetConfig();
    const log = wTodayLog();
    const total = log.water.reduce((s,e) => s + e.ml, 0);
    const goal = cfg.goalMl;
    const pct = Math.min(100, Math.round(total / goal * 100));
    const remaining = Math.max(0, goal - total);

    // Ring
    const circ = 2 * Math.PI * 52;
    const fill = document.getElementById('wRingFill');
    if (fill) {
      fill.style.strokeDasharray = circ;
      fill.style.strokeDashoffset = circ - (circ * pct / 100);
    }
    const pctEl = document.getElementById('wRingPct');
    const goalEl = document.getElementById('wRingGoal');
    const consEl = document.getElementById('wStatConsumed');
    const remEl  = document.getElementById('wStatRemaining');
    const strEl  = document.getElementById('wStatStreak');
    if (pctEl) pctEl.textContent = pct + '%';
    if (goalEl) goalEl.textContent = goal + 'ml goal';
    if (consEl) consEl.textContent = total + 'ml';
    if (remEl) remEl.textContent = remaining + 'ml';
    if (strEl) strEl.textContent = wCalcStreak() + 'd';

    // Log
    const logEl = document.getElementById('wLog');
    if (logEl) {
      if (!log.water.length) { logEl.innerHTML = '<div class="w-empty">No water logged yet today</div>'; }
      else {
        logEl.innerHTML = [...log.water].reverse().map(e => {
          const t = new Date(e.ts).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
          return `<div class="w-log-entry">
            <span class="w-log-amount">💧 ${e.ml}ml</span>
            <span class="w-log-time">${t}</span>
            <button class="w-log-del" onclick="wDeleteWater(${e.ts})">✕</button>
          </div>`;
        }).join('');
      }
    }

    // Substances
    const subLogEl = document.getElementById('wSubLog');
    if (subLogEl) {
      if (!log.substances || !log.substances.length) { subLogEl.innerHTML = '<div class="w-empty">None logged</div>'; }
      else {
        const totalMg = log.substances.reduce((s,e) => s + (e.mg||0), 0);
        subLogEl.innerHTML = log.substances.map(e => {
          const t = new Date(e.ts).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
          return `<div class="w-sub-item">
            <span class="w-sub-name">${e.name}</span>
            <span class="w-sub-mg">${e.mg}mg</span>
            <span class="w-log-time">${t}</span>
            <button class="w-log-del" onclick="wDeleteSub(${e.ts})">✕</button>
          </div>`;
        }).join('') + `<div style="padding-top:8px;font-size:12px;color:var(--w-text2)">Total caffeine: <strong>${totalMg}mg</strong>${totalMg > 400 ? ' ⚠️ high' : ''}</div>`;
      }
    }

    // Sparkline
    renderWSparkline();
  }

  function renderWSparkline() {
    const el = document.getElementById('wSparkline');
    if (!el) return;
    const cfg = wGetConfig();
    const d = wGet();
    if (!d.logs) { el.innerHTML = ''; return; }
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const dt = new Date(); dt.setDate(dt.getDate() - i);
      const ds = dt.toISOString().slice(0,10);
      const log = d.logs[ds];
      const ml = log ? log.water.reduce((s,e) => s + e.ml, 0) : 0;
      const lbl = dt.toLocaleDateString([],{weekday:'short'}).slice(0,1);
      days.push({ ml, lbl, ds });
    }
    const max = Math.max(cfg.goalMl, ...days.map(d => d.ml));
    el.innerHTML = days.map(day => {
      const h = max > 0 ? Math.round((day.ml / max) * 50) : 0;
      const color = day.ml >= cfg.goalMl ? '#34D399' : day.ml > 0 ? '#38BDF8' : 'rgba(255,255,255,0.1)';
      return `<div class="w-spark-col">
        <div class="w-spark-bar-wrap">
          <div class="w-spark-bar" style="height:${h}px;background:${color}"></div>
        </div>
        <div class="w-spark-lbl">${day.lbl}</div>
      </div>`;
    }).join('');
  }

  function wInitSearch() {
    const input = document.getElementById('wSubSearch');
    const drop  = document.getElementById('wSubDropdown');
    if (!input || !drop) return;
    input.addEventListener('input', () => {
      const q = input.value.toLowerCase().trim();
      if (!q) { drop.style.display = 'none'; return; }
      const matches = SUBSTANCE_DB.filter(s => s.n.toLowerCase().includes(q));
      if (!matches.length) { drop.style.display = 'none'; return; }
      drop.style.display = 'block';
      drop.innerHTML = matches.map(s =>
        `<div class="w-sub-opt" onclick="wLogSub('${s.n}',${s.mg})">
          <span>${s.n}</span><span style="color:var(--w-text2)">${s.mg}mg</span>
        </div>`).join('');
    });
    document.addEventListener('click', e => {
      if (!input.contains(e.target) && !drop.contains(e.target)) drop.style.display = 'none';
    });
  }

  window.wLogSub = function(name, mg) {
    const log = wTodayLog();
    if (!log.substances) log.substances = [];
    log.substances.push({ name, mg, ts: Date.now() });
    wSaveTodayLog(log);
    document.getElementById('wSubSearch').value = '';
    document.getElementById('wSubDropdown').style.display = 'none';
    wRender();
  };

  window.initWater = function() {
    if (_wInited) { wRender(); return; }
    _wInited = true;
    wInitSearch();
    // Settings button
    const settingsBtn = document.getElementById('wSettingsBtn');
    if (settingsBtn) settingsBtn.addEventListener('click', () => {
      const cfg = wGetConfig();
      const goal = prompt('Daily water goal (ml):', cfg.goalMl);
      if (goal && !isNaN(parseInt(goal))) {
        wSaveConfig({ ...cfg, goalMl: parseInt(goal) });
        wRender();
      }
    });
    wRender();
  };
})();

/* ═══════════════════════════════════════════════════════════
   DAILY STACK
   ═══════════════════════════════════════════════════════════ */
(function(){
  const SK_ITEMS    = 'stack:items';
  const SK_TAKEN    = d => 'stack:taken:' + d;
  const SK_VERSION  = 'stack:version';
  const VERSION     = 5;
  const WINDOWS     = ['morning','lunch','evening','anytime'];
  const SUPPLEMENT_DB = [
    'Vitamin D3','Vitamin K2','Magnesium Glycinate','Magnesium L-Threonate','Zinc',
    'Omega-3 Fish Oil','Vitamin C','B Complex','B12','Folate','Iron','Calcium',
    'Ashwagandha','Rhodiola Rosea','Lion\'s Mane','Bacopa Monnieri','Ginkgo Biloba',
    'CoQ10','Alpha Lipoic Acid','NAC (N-Acetyl Cysteine)','NMN','NR (Nicotinamide Riboside)',
    'Creatine','L-Theanine','L-Tyrosine','GABA','5-HTP','Melatonin',
    'Probiotics','Prebiotics','Collagen Peptides','Turmeric / Curcumin','Berberine',
    'Metformin','Taurine','Carnitine','Inositol','Choline','Alpha-GPC',
    'CDP-Choline','Phosphatidylserine','Resveratrol','Quercetin','Fisetin',
    'Spermidine','Astaxanthin','Lutein','Zeaxanthin','Selenium',
    'Iodine','Copper','Manganese','Chromium','Boron',
    'Bromelain','Digestive Enzymes','Bile Salts','Betaine HCl',
    'Vitamin A','Vitamin E','Vitamin B1 (Thiamine)','Vitamin B6','Biotin',
    'DHEA','Pregnenolone','Tongkat Ali','Fadogia Agrestis','Apigenin',
    'Myo-Inositol','D-Chiro Inositol','Saw Palmetto','Pumpkin Seed',
    'Garlic','Elderberry','Echinacea','Spirulina','Chlorella',
  ];
  let _sInited = false;

  function sGet(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }
  function sSave(k, v) { localStorage.setItem(k, JSON.stringify(v)); }
  function sToday() { return new Date().toISOString().slice(0,10); }

  function sGetItems() {
    const v = sGet(SK_VERSION);
    if (v !== VERSION) { sSave(SK_ITEMS, []); sSave(SK_VERSION, VERSION); return []; }
    return sGet(SK_ITEMS) || [];
  }
  function sSaveItems(items) { sSave(SK_ITEMS, items); sSave(SK_VERSION, VERSION); }

  function sGetTaken() { return sGet(SK_TAKEN(sToday())) || {}; }
  function sSaveTaken(t) { sSave(SK_TAKEN(sToday()), t); }

  window.sAddSupplement = function() {
    const nameEl  = document.getElementById('sSupSearch');
    const winEl   = document.getElementById('sSupWindow');
    const doseEl  = document.getElementById('sSupDose');
    const name = (nameEl.value || '').trim();
    if (!name) { nameEl.focus(); return; }
    const items = sGetItems();
    items.push({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2,5),
      name,
      window: winEl.value,
      dose: (doseEl.value || '').trim(),
    });
    sSaveItems(items);
    nameEl.value = ''; doseEl.value = '';
    document.getElementById('sSupDropdown').style.display = 'none';
    sRender();
  };

  window.sToggleTaken = function(id) {
    const taken = sGetTaken();
    taken[id] = !taken[id];
    sSaveTaken(taken);
    sRender();
  };

  window.sDeleteItem = function(id) {
    sSaveItems(sGetItems().filter(i => i.id !== id));
    sRender();
  };

  function sRender() {
    const items  = sGetItems();
    const taken  = sGetTaken();

    // Date label
    const dateEl = document.getElementById('sDateLabel');
    if (dateEl) dateEl.textContent = new Date().toLocaleDateString([],{weekday:'long',month:'long',day:'numeric'});

    // Stats
    const takenCount = items.filter(i => taken[i.id]).length;
    const lowEl = document.getElementById('sStatLow');
    const takenEl = document.getElementById('sStatTaken');
    const totEl  = document.getElementById('sStatTotal');
    if (takenEl) takenEl.textContent = takenCount;
    if (totEl)   totEl.textContent   = items.length;
    if (lowEl)   lowEl.textContent   = sGet('stack:low') ? JSON.parse(localStorage.getItem('stack:low') || '[]').length : 0;

    // Windows
    WINDOWS.forEach(win => {
      const el = document.getElementById('sWinBody-' + win);
      if (!el) return;
      const winItems = items.filter(i => i.window === win);
      if (!winItems.length) { el.innerHTML = '<div class="s-empty">Nothing added</div>'; return; }
      el.innerHTML = winItems.map(item => `
        <div class="s-item${taken[item.id] ? ' done-item' : ''}">
          <div class="s-item-check${taken[item.id] ? ' done' : ''}" onclick="sToggleTaken('${item.id}')"></div>
          <div style="flex:1">
            <div class="s-item-name">${item.name}</div>
            ${item.dose ? `<div class="s-item-dose">${item.dose}</div>` : ''}
          </div>
          <button class="s-item-del" onclick="sDeleteItem('${item.id}')">✕</button>
        </div>`).join('');
    });
  }

  function sInitSearch() {
    const input = document.getElementById('sSupSearch');
    const drop  = document.getElementById('sSupDropdown');
    if (!input || !drop) return;
    input.addEventListener('input', () => {
      const q = input.value.toLowerCase().trim();
      if (!q) { drop.style.display = 'none'; return; }
      const matches = SUPPLEMENT_DB.filter(s => s.toLowerCase().includes(q)).slice(0, 10);
      if (!matches.length) { drop.style.display = 'none'; return; }
      drop.style.display = 'block';
      drop.innerHTML = matches.map(s =>
        `<div class="s-sup-opt" onclick="sPickSupplement('${s}')">${s}</div>`).join('');
    });
    document.addEventListener('click', e => {
      if (!input.contains(e.target) && !drop.contains(e.target)) drop.style.display = 'none';
    });
  }

  window.sPickSupplement = function(name) {
    const input = document.getElementById('sSupSearch');
    if (input) input.value = name;
    document.getElementById('sSupDropdown').style.display = 'none';
  };

  window.initStack = function() {
    if (_sInited) { sRender(); return; }
    _sInited = true;
    sInitSearch();
    sRender();
  };
})();

// ═══════════ SUPABASE SYNC ═══════════
(function(){
  const SUPABASE_URL = 'https://jxwhpnzbtgszlggfumow.supabase.co';
  const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp4d2hwbnpidGdzemxnZ2Z1bW93Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxODc1MjcsImV4cCI6MjA5NDc2MzUyN30.TVm6nPYhqrEWjo5-wCWHWIDPy0bctfHvPpdyXJG4vPs';
  const APP_KEY = 'life-hub';
  const STATIC_KEYS = ['goal_streak_v1','nq_trades_v4','nq_bad_days_v1','faith_bible','faith_prayers','glitchy_accounts','glitchy_checklist','glitchy_watch'];
  const DYN_PREFIXES = ['goals:','faith_coach_'];
  const DEBOUNCE_MS = 250;

  function isSynced(k) {
    return STATIC_KEYS.includes(k) || DYN_PREFIXES.some(p => k.startsWith(p));
  }

  const sb = window._supa || supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  let lastSyncedJson = null;
  let pushTimer = null;
  let pendingRemote = null;

  const _origSetItem    = localStorage.setItem.bind(localStorage);
  const _origRemoveItem = localStorage.removeItem.bind(localStorage);

  function gatherState() {
    const obj = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!isSynced(k)) continue;
      const v = localStorage.getItem(k);
      if (v !== null) { try { obj[k] = JSON.parse(v); } catch(e) { obj[k] = v; } }
    }
    return obj;
  }

  function applyRemote(data) {
    let goalsChanged = false;
    for (const k of Object.keys(data)) {
      if (!isSynced(k)) continue;
      const val = typeof data[k] === 'string' ? data[k] : JSON.stringify(data[k]);
      _origSetItem(k, val);
      if (k.startsWith('goals:')) goalsChanged = true;
    }
    if (goalsChanged) window.dispatchEvent(new CustomEvent('goals-changed'));
    try {
      if (typeof loadToday === 'function') loadToday();
      if (typeof loadTomorrow === 'function') loadTomorrow();
      if (typeof renderStreak === 'function') renderStreak();
      if (typeof renderStats === 'function') renderStats();
      if (typeof renderTradeList === 'function') renderTradeList();
      if (typeof renderBible === 'function') renderBible();
      if (typeof renderPrayers === 'function') renderPrayers();
      if (typeof renderGlitchyAccounts === 'function') renderGlitchyAccounts();
      if (typeof renderChecklist === 'function') renderChecklist();
      if (typeof renderWatchList === 'function') renderWatchList();
    } catch(e) { console.warn('[sync] re-render error:', e); }
  }

  function isUserTyping() {
    const el = document.activeElement;
    return !!(el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable));
  }

  function doPush() {
    const state = gatherState();
    const json = JSON.stringify(state);
    if (json === lastSyncedJson) return;
    lastSyncedJson = json;
    sb.from('app_state')
      .upsert({ key: APP_KEY, value: state, updated_at: new Date().toISOString() }, { onConflict: 'key' })
      .catch(function(e) { console.warn('[sync] push error:', e); });
  }

  function schedulePush() {
    clearTimeout(pushTimer);
    pushTimer = setTimeout(doPush, DEBOUNCE_MS);
  }

  function flushNow() {
    const state = gatherState();
    const json = JSON.stringify(state);
    if (json === lastSyncedJson) return;
    try {
      fetch(SUPABASE_URL + '/rest/v1/app_state?key=eq.' + APP_KEY, {
        method: 'POST',
        keepalive: true,
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': 'Bearer ' + SUPABASE_KEY,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates',
        },
        body: JSON.stringify({ key: APP_KEY, value: state, updated_at: new Date().toISOString() }),
      });
    } catch(e) {}
  }

  localStorage.setItem = function(k, v) {
    try { _origSetItem(k, v); } catch(e) {}
    try { if (isSynced(k)) schedulePush(); } catch(e) {}
  };
  localStorage.removeItem = function(k) {
    try { _origRemoveItem(k); } catch(e) {}
    try { if (isSynced(k)) schedulePush(); } catch(e) {}
  };

  ['pagehide', 'beforeunload'].forEach(function(ev) { window.addEventListener(ev, flushNow); });
  document.addEventListener('visibilitychange', function() { if (document.visibilityState === 'hidden') flushNow(); });
  document.addEventListener('focusout', function() {
    if (pendingRemote) { var d = pendingRemote; pendingRemote = null; applyRemote(d); }
  });

  async function syncBoot() {
    try {
      const { data, error } = await sb.from('app_state').select('value').eq('key', APP_KEY).single();
      if (error && error.code !== 'PGRST116') throw error;
      if (data && data.value && Object.keys(data.value).length > 0) {
        lastSyncedJson = JSON.stringify(data.value);
        applyRemote(data.value);
      } else {
        const local = gatherState();
        if (Object.keys(local).length > 0) {
          lastSyncedJson = JSON.stringify(local);
          await sb.from('app_state')
            .upsert({ key: APP_KEY, value: local, updated_at: new Date().toISOString() }, { onConflict: 'key' });
        }
      }
    } catch(e) {
      console.warn('[sync] init error:', e);
    }

    sb.channel('app_state_' + APP_KEY)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'app_state',
        filter: 'key=eq.' + APP_KEY
      }, function(payload) {
        const remote = payload.new && payload.new.value;
        if (!remote) return;
        const json = JSON.stringify(remote);
        if (json === lastSyncedJson) return;
        lastSyncedJson = json;
        if (isUserTyping()) { pendingRemote = remote; } else { applyRemote(remote); }
      })
      .subscribe();
  }

  syncBoot();
})();
