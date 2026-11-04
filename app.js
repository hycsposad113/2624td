/* 2624TD 生活板 — 前端主程式 */
(function () {
  'use strict';

  // ---------- 基本設定 ----------
  const CONFIG = window.APP_CONFIG || {};
  const DEMO = !CONFIG.APPS_SCRIPT_URL;
  const MEMBERS = ['Jack', 'Monica', 'Ryan', 'Jerry'];
  // 值班安排：from 是週一，從那週起照 order 循環。有人長期不在時，加一段就好。
  const AWAY_NOTE = '每週一換人。Jerry 回台灣期間由 Jack → Monica → Ryan 輪流，12/21 那週起 Jerry 回到輪值。';
  const DUTY_PLAN = [
    { from: '2026-11-02', order: ['Jerry'], note: AWAY_NOTE },
    { from: '2026-11-09', order: ['Jack', 'Monica', 'Ryan'], note: AWAY_NOTE },
    { from: '2026-12-21', order: ['Jerry', 'Jack', 'Monica', 'Ryan'], note: '每週一換人，順序是 Jerry → Jack → Monica → Ryan。' }
  ];
  const EVENT_TYPES = ['外出', '訪客用餐', '訪客住宿', '其他'];
  const TYPE_CLASS = { '外出': 't-out', '訪客用餐': 't-meal', '訪客住宿': 't-stay', '其他': 't-other' };
  const SHEET_KEY = { events: 'id', consumables: 'id', utilities: 'id', duty: 'week', settlements: 'quarter' };
  const TABS = ['duty', 'calendar', 'consumables', 'utilities', 'settle', 'rules'];
  const DUTY_TASKS = ['倒垃圾（太多時可以找人一起）', '清理客廳等公共空間', '清理廁所排水孔'];
  const HOUSE_RULES = [
    { title: '作息', items: [
      '週日到週四隔天要上班，晚上 10 點後大家一起把音量放輕。',
      '週五、週六可以放鬆一點，有人在休息時留意一下音量就好。'
    ] },
    { title: '朋友來訪', items: [
      '歡迎朋友來玩！先標在行事曆上，大家就知道那天家裡有客人。',
      '週日到週四晚上，朋友盡量 10 點前回家。',
      '朋友要住超過 2 晚，先在群組說一聲。'
    ] },
    { title: '公共空間', items: [
      '廚房和浴室用完順手恢復原樣，下一個人用起來也舒服。',
      '倒垃圾、清客廳和排水孔，照家事頁的輪值來。'
    ] },
    { title: '消耗品與費用', items: [
      '洗手乳、洗碗精、菜瓜布、垃圾袋、水管疏通劑這些公共消耗品，買了就記在網站上，4 人平分。',
      '偶爾要換的廚具也可以記，例如不沾鍋的塗層沒了要買新鍋子。',
      '水電和暖氣的帳單由 Jerry 統一計算。'
    ] },
    { title: '互相幫忙', items: [
      '有困難、想換班或需要幫忙，都可以直接在群組說。',
      '要出門或有朋友來，記得更新行事曆。'
    ] }
  ];
  const CATEGORY_HINTS = ['清潔用品', '廚房', '食物', '衛生用品'];
  const UTILITY_HINTS = ['電費', '水費', '暖氣', '瓦斯', '網路'];
  const PW_KEY = '2624td-pw';
  const DEMO_KEY = '2624td-demo-v2';
  const PERSON_KEY = '2624td-last-person';
  const WEEKDAY = ['日', '一', '二', '三', '四', '五', '六'];

  const ICON = {
    left: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
    right: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
    arrow: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h15M13 6l6 6-6 6"/></svg>',
    grip: '<svg class="grip" viewBox="0 0 10 16" aria-hidden="true"><circle cx="2.5" cy="3" r="1.3"/><circle cx="7.5" cy="3" r="1.3"/><circle cx="2.5" cy="8" r="1.3"/><circle cx="7.5" cy="8" r="1.3"/><circle cx="2.5" cy="13" r="1.3"/><circle cx="7.5" cy="13" r="1.3"/></svg>'
  };

  // ---------- 小工具 ----------
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }
  function pad(n) { return String(n).padStart(2, '0'); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  const moneyFormat = new Intl.NumberFormat('en-IE', { style: 'currency', currency: CONFIG.CURRENCY || 'EUR' });
  function money(n) { return moneyFormat.format(Number(n) || 0); }
  function cents(n) { return Math.round((Number(n) || 0) * 100); }
  function uid() {
    return (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseYmd(s) { const p = String(s).split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }
  function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
  function shiftKey(key, n) { return ymd(addDays(parseYmd(key), n)); }
  function diffDays(a, b) { return Math.round((Date.parse(b) - Date.parse(a)) / 86400000); }
  function mondayOf(d) { return addDays(d, -((d.getDay() + 6) % 7)); }
  function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
  function addMonths(d, n) { return new Date(d.getFullYear(), d.getMonth() + n, 1); }
  function todayKey() { return ymd(new Date()); }
  function quarterKey(s) { const d = parseYmd(s); return d.getFullYear() + '-Q' + (Math.floor(d.getMonth() / 3) + 1); }
  function quarterEnd(k) { const p = k.split('-Q'); return ymd(new Date(Number(p[0]), Number(p[1]) * 3, 0)); }
  function quarterLabel(k) {
    const p = k.split('-Q');
    const m1 = (Number(p[1]) - 1) * 3 + 1;
    return p[0] + ' 年第 ' + p[1] + ' 季（' + m1 + '–' + (m1 + 2) + ' 月）';
  }
  function fmtDay(s) { const d = parseYmd(s); return (d.getMonth() + 1) + '/' + d.getDate() + '（' + WEEKDAY[d.getDay()] + '）'; }
  function fmtShort(s) { const d = parseYmd(s); return (d.getMonth() + 1) + '/' + d.getDate(); }
  function fmtWeek(key) { return fmtShort(key) + ' – ' + fmtShort(shiftKey(key, 6)); }
  function fmtSpan(a, b) { return a === b ? fmtDay(a) : fmtDay(a) + ' – ' + fmtDay(b); }
  function monthTitle(m) { return m.getFullYear() + ' 年 ' + (m.getMonth() + 1) + ' 月'; }
  function nowrap(s) { return '<span class="nw">' + esc(s) + '</span>'; }

  function pref(key, value) {
    try {
      if (value === undefined) return localStorage.getItem(key) || '';
      localStorage.setItem(key, value);
    } catch (e) { /* 無痕模式等情況，不記也沒關係 */ }
    return '';
  }

  // ---------- 狀態 ----------
  const mqWide = window.matchMedia('(min-width: 700px)');
  const state = {
    data: null,
    loadError: '',
    lastLoad: 0,
    pw: '',
    tab: 'duty',
    dutyMonth: startOfMonth(new Date()),
    calMonth: startOfMonth(new Date()),
    settleQ: null
  };

  // ---------- 排班 ----------
  function dutyPeriod(weekKey) {
    return DUTY_PLAN.filter((p) => p.from <= weekKey).pop() || DUTY_PLAN[0];
  }
  // 排班是接著往下輪的：沒指定的週 = 上一週的下一位；指定某人後，後面從他接著輪。
  // 不在這段順序裡的人（例如 Jerry 不在時臨時代班）只算那一週，不影響後面。
  function dutyWalk(target, ignoreTarget) {
    const p = dutyPeriod(target);
    if (target < p.from) return p.order[0];
    const picked = {};
    state.data.duty.forEach((r) => { if (r.person) picked[r.week] = r.person; });
    let i = -1, person = p.order[0];
    for (let wk = p.from; wk <= target; wk = shiftKey(wk, 7)) {
      const chosen = ignoreTarget && wk === target ? '' : picked[wk];
      if (chosen) {
        person = chosen;
        if (p.order.indexOf(chosen) !== -1) i = p.order.indexOf(chosen);
      } else {
        i = (i + 1) % p.order.length;
        person = p.order[i];
      }
    }
    return person;
  }
  function baseDuty(weekKey) { return dutyWalk(weekKey, true); } // 這週沒指定時會輪到誰
  function dutyRow(weekKey) { return state.data.duty.find((r) => r.week === weekKey && r.person); }
  function dutyFor(weekKey) { return dutyWalk(weekKey, false); }
  // 改回原本輪到的人時就清掉調整紀錄，「已調整」標籤才會準
  function dutyItem(week, person) { return { week: week, person: person === baseDuty(week) ? '' : person }; }

  // ---------- 資料存取 ----------
  function applyLocal(d, action, b) {
    if (action === 'upsert') {
      const key = SHEET_KEY[b.sheet];
      const i = d[b.sheet].findIndex((r) => r[key] === b.item[key]);
      if (i === -1) d[b.sheet].push(b.item); else d[b.sheet][i] = b.item;
    } else if (action === 'delete') {
      d[b.sheet] = d[b.sheet].filter((r) => String(r[b.key]) !== String(b.value));
    } else if (action === 'setDuty') {
      b.items.forEach((it) => {
        d.duty = d.duty.filter((r) => r.week !== it.week);
        if (it.person) d.duty.push({ week: it.week, person: it.person });
      });
    } else if (action === 'setSettled') {
      d.settlements = d.settlements.filter((r) => r.quarter !== b.quarter);
      if (b.cleared) d.settlements.push({ quarter: b.quarter, clearedAt: b.clearedAt, snapshot: b.snapshot });
    }
  }

  let demoMem = null;
  function seedDemo() {
    const mon = mondayOf(new Date());
    const day = (n) => ymd(addDays(mon, n));
    return {
      events: [
        { id: 'e1', type: '外出', owner: 'Jack', title: 'Jack 去巴黎', startDate: day(4), endDate: day(6), startTime: '', endTime: '', note: '週日晚上回來' },
        { id: 'e2', type: '訪客用餐', owner: 'Monica', title: '朋友來吃火鍋', startDate: day(9), endDate: day(9), startTime: '18:30', endTime: '21:00', note: '' },
        { id: 'e3', type: '訪客住宿', owner: 'Ryan', title: 'Ryan 的同學來住', startDate: day(12), endDate: day(15), startTime: '', endTime: '', note: '睡客廳沙發' }
      ],
      consumables: [
        { id: 'c1', date: '2026-10-03', category: '清潔用品', item: '洗衣精', amount: 12.5, payer: 'Jerry', split: 'Y', note: '' },
        { id: 'c2', date: '2026-10-18', category: '廚房', item: '保鮮膜、垃圾袋', amount: 6.8, payer: 'Jack', split: 'Y', note: '' },
        { id: 'c3', date: '2026-11-02', category: '衛生用品', item: '衛生紙 12 捲', amount: 9.95, payer: 'Monica', split: 'Y', note: '' },
        { id: 'c4', date: '2026-11-03', category: '衛生用品', item: '牙線', amount: 4.2, payer: 'Ryan', split: 'N', note: '個人物品' }
      ],
      utilities: [
        { id: 'u1', category: '暖氣', period: '2026 Q4', amount: 310.4, note: '開始開暖氣了' },
        { id: 'u2', category: '電費', period: '2026 Q4', amount: 148.2, note: '' },
        { id: 'u3', category: '水費', period: '2026 Q4', amount: 62, note: '' },
        { id: 'u4', category: '暖氣', period: '2026 Q3', amount: 84.1, note: '' },
        { id: 'u5', category: '電費', period: '2026 Q3', amount: 139.6, note: '' },
        { id: 'u6', category: '水費', period: '2026 Q3', amount: 65.5, note: '' }
      ],
      duty: [],
      settlements: []
    };
  }
  function demoStore() {
    if (demoMem) return demoMem;
    try {
      const raw = localStorage.getItem(DEMO_KEY);
      demoMem = raw ? JSON.parse(raw) : seedDemo();
    } catch (e) {
      demoMem = seedDemo();
    }
    return demoMem;
  }
  function demoApi(action, body) {
    const d = demoStore();
    if (action === 'load') return { ok: true, data: JSON.parse(JSON.stringify(d)) };
    applyLocal(d, action, body);
    try { localStorage.setItem(DEMO_KEY, JSON.stringify(d)); } catch (e) { /* 只留在記憶體 */ }
    return { ok: true };
  }

  async function api(action, body) {
    if (DEMO) return demoApi(action, body || {});
    let json;
    try {
      const res = await fetch(CONFIG.APPS_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(Object.assign({ action: action, pw: state.pw }, body || {}))
      });
      json = await res.json();
    } catch (e) {
      throw new Error('連不上試算表。請檢查網路，或確認 Apps Script 的存取權是「所有人」。');
    }
    if (!json.ok) {
      if (json.error === 'PASSWORD') {
        forgetPassword();
        throw new Error('PASSWORD');
      }
      throw new Error(json.error || '連線失敗');
    }
    return json;
  }

  function handleError(err) {
    if (err.message === 'PASSWORD') {
      showGate('密碼不對，或密碼已被更改。');
      return;
    }
    toast(err.message, true);
  }

  async function loadData() {
    const res = await api('load');
    state.data = res.data;
    state.loadError = '';
    state.lastLoad = Date.now();
    if (!state.settleQ) state.settleQ = defaultQuarter();
    renderAll();
  }

  async function firstLoad() {
    state.loadError = '';
    renderAll();
    try {
      await loadData();
    } catch (err) {
      if (err.message === 'PASSWORD') { handleError(err); return; }
      state.loadError = err.message;
      renderAll();
    }
  }

  // 寫入先更新畫面，再排隊送到試算表；Apps Script 要等一兩秒，這樣操作不會卡。
  let queue = Promise.resolve();
  let pending = 0;
  function setSaving() { $('#saving').hidden = pending === 0; }
  function mutate(action, body, okMsg) {
    applyLocal(state.data, action, body);
    renderAll();
    pending++;
    setSaving();
    queue = queue
      .then(() => api(action, body))
      .then(async () => {
        pending--;
        if (okMsg) toast(okMsg);
        if (!pending) await loadData();
      })
      .catch(async (err) => {
        pending--;
        handleError(err);
        if (err.message !== 'PASSWORD') { try { await loadData(); } catch (e) { /* 下次再同步 */ } }
      })
      .finally(setSaving);
  }

  // ---------- 密碼（只存在這個分頁，關掉就清掉） ----------
  function savePassword(pw) { try { sessionStorage.setItem(PW_KEY, pw); } catch (e) { /* 忽略 */ } }
  function readPassword() { try { return sessionStorage.getItem(PW_KEY) || ''; } catch (e) { return ''; } }
  function forgetPassword() { state.pw = ''; try { sessionStorage.removeItem(PW_KEY); } catch (e) { /* 忽略 */ } }

  // ---------- 外框 ----------
  function showGate(msg) {
    $('#app').hidden = true;
    $('#gate').hidden = false;
    const err = $('#gateError');
    err.hidden = !msg;
    err.textContent = msg || '';
    $('#gatePw').value = '';
    $('#gatePw').focus();
  }
  function showApp() {
    $('#gate').hidden = true;
    $('#app').hidden = false;
    $('#demoBanner').hidden = !DEMO;
    $('#logout').hidden = DEMO;
  }
  function setTab(name) {
    state.tab = name;
    $$('.tabs [data-tab]').forEach((b) => {
      const on = b.dataset.tab === name;
      b.setAttribute('aria-selected', on ? 'true' : 'false');
      b.tabIndex = on ? 0 : -1;
    });
    $$('.panel').forEach((p) => { p.hidden = p.id !== 'tab-' + name; });
    try { history.replaceState(null, '', '?tab=' + name); } catch (e) { /* file:// 不支援時略過 */ }
  }
  function toast(msg, isError, sticky) {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'toast show' + (isError ? ' error' : '');
    clearTimeout(toast.timer);
    if (!sticky) toast.timer = setTimeout(hideToast, isError ? 5000 : 2400);
  }
  function hideToast() { $('#toast').className = 'toast'; }

  // ---------- 渲染 ----------
  function renderAll() {
    const pages = { duty: renderDuty, calendar: renderCalendar, consumables: renderConsumables, utilities: renderUtilities, settle: renderSettle, rules: renderRules };
    if (!state.data) {
      const html = state.loadError
        ? '<div class="load-state"><p>' + esc(state.loadError) + '</p><button type="button" class="btn primary" data-action="reload">重新連線</button></div>'
        : '<div class="load-state"><p class="muted">讀取中</p></div>';
      TABS.forEach((t) => { $('#tab-' + t).innerHTML = html; });
      return;
    }
    TABS.forEach((t) => pages[t]());
  }

  // ---------- 家事 ----------
  function renderDuty() {
    const m = state.dutyMonth;
    const thisWeek = ymd(mondayOf(new Date()));
    const person = dutyFor(thisWeek);
    const nextPerson = dutyFor(shiftKey(thisWeek, 7));

    const weeks = [];
    const end = addMonths(m, 1);
    let w = mondayOf(m);
    if (w < m) w = addDays(w, 7);
    for (; w < end; w = addDays(w, 7)) weeks.push(ymd(w));

    const rows = weeks.map((wk) => {
      const name = dutyFor(wk);
      const adjusted = !!dutyRow(wk);
      const repeat = (wk > DUTY_PLAN[0].from && name === dutyFor(shiftKey(wk, -7))) || name === dutyFor(shiftKey(wk, 7));
      return '<li class="duty-row' + (wk === thisWeek ? ' current' : '') + '" data-week="' + wk + '">' +
        ICON.grip +
        '<div class="duty-hit">' +
          '<span class="duty-range">' + fmtWeek(wk) + '</span>' +
          (wk === thisWeek ? '<span class="tag">本週</span>' : '') +
          (adjusted ? '<span class="tag soft">已調整</span>' : '') +
          (repeat ? '<span class="tag alert">連續兩週</span>' : '') +
        '</div>' +
        (adjusted ? '<button type="button" class="link-btn" data-action="restore-week" data-week="' + wk + '">還原</button>' : '') +
        '<select class="duty-select" data-week="' + wk + '" aria-label="' + fmtWeek(wk) + ' 由誰值班">' +
          MEMBERS.map((p) => '<option value="' + p + '"' + (p === name ? ' selected' : '') + '>' + p + '</option>').join('') +
        '</select>' +
        '</li>';
    }).join('');

    const canPrev = addMonths(m, -1).getTime() >= startOfMonth(parseYmd(DUTY_PLAN[0].from)).getTime();

    $('#tab-duty').innerHTML =
      '<section class="now">' +
        '<h2>本週由 ' + esc(person) + ' 值班</h2>' +
        '<p class="muted">' + fmtWeek(thisWeek) + '，下週換 ' + esc(nextPerson) + '</p>' +
        '<ul class="tasks">' + DUTY_TASKS.map((t) => '<li>' + esc(t) + '</li>').join('') + '</ul>' +
      '</section>' +
      '<div class="month-nav">' +
        '<h3>' + monthTitle(m) + '排班</h3>' +
        '<div class="nav-btns">' +
          '<button type="button" class="btn ghost icon" data-action="duty-prev" aria-label="上個月"' + (canPrev ? '' : ' disabled') + '>' + ICON.left + '</button>' +
          '<button type="button" class="btn ghost icon" data-action="duty-next" aria-label="下個月">' + ICON.right + '</button>' +
        '</div>' +
      '</div>' +
      '<p class="hint">排班會自動輪，沒問題就不用動。改某一週的人，後面會從他接著輪；只想兩週對調，就按住一週拖到另一週。</p>' +
      '<ul class="duty-list">' + rows + '</ul>' +
      '<p class="hint">' + esc(dutyPeriod(thisWeek).note) + '</p>';
  }

  function swapWeeks(a, b) {
    const pa = dutyFor(a), pb = dutyFor(b);
    if (pa === pb) { toast('這兩週是同一個人'); renderDuty(); return; }
    // 互換只動這兩週：把它們的下一週固定住，其他週不會跟著位移
    const items = [{ week: a, person: pb }, { week: b, person: pa }];
    [a, b].forEach((wk) => {
      const next = shiftKey(wk, 7);
      if (next !== a && next !== b) items.push({ week: next, person: dutyFor(next) });
    });
    mutate('setDuty', { items: items }, '已互換 ' + fmtWeek(a) + ' 和 ' + fmtWeek(b));
  }

  // ---------- 拖拉 ----------
  // 滑鼠：移動超過 6px 就算拖拉。
  // 手機：按住 0.3 秒，或（行事曆上）直接橫向滑動；直向滑動則維持捲動頁面。
  let gestureActive = false;
  let suppressClickUntil = 0;
  function gesture(root, cfg) {
    root.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || gestureActive) return;
      const ctx = cfg.begin(e);
      if (!ctx) return;
      const touch = e.pointerType !== 'mouse';
      const x0 = e.clientX, y0 = e.clientY;
      let active = false;
      let timer = null;
      const go = () => {
        active = true;
        gestureActive = true;
        clearTimeout(timer);
        document.documentElement.classList.add('is-dragging');
        if (touch && navigator.vibrate) navigator.vibrate(10);
        cfg.start(ctx);
      };
      const stop = () => {
        clearTimeout(timer);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onCancel);
        gestureActive = false;
        document.documentElement.classList.remove('is-dragging');
      };
      function onMove(ev) {
        if (ev.pointerId !== e.pointerId) return;
        if (!active) {
          const dx = ev.clientX - x0, dy = ev.clientY - y0;
          if (Math.hypot(dx, dy) < 6) return;
          if (!touch || (cfg.horizontal && Math.abs(dx) > Math.abs(dy) * 1.5)) go();
          else { stop(); return; }
        }
        cfg.move(ctx, ev.clientX, ev.clientY);
      }
      function onUp(ev) {
        if (ev.pointerId !== e.pointerId) return;
        const was = active;
        stop();
        if (was) {
          suppressClickUntil = Date.now() + 300;
          cfg.end(ctx);
        }
      }
      function onCancel(ev) {
        if (ev.pointerId !== e.pointerId) return;
        const was = active;
        stop();
        if (was) cfg.cancel(ctx);
      }
      if (touch) timer = setTimeout(go, 300);
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onCancel);
    });
  }

  function bindDutyDrag() {
    const rowAt = (x, y) => document.elementsFromPoint(x, y).find((el) => el.classList && el.classList.contains('duty-row'));
    const clear = () => $$('.duty-row.over, .duty-row.dragging').forEach((r) => r.classList.remove('over', 'dragging'));
    gesture($('#tab-duty'), {
      begin(e) {
        if (e.target.closest('.link-btn, select')) return null;
        const row = e.target.closest('.duty-row');
        return row ? { row: row, week: row.dataset.week, target: null } : null;
      },
      start(c) { c.row.classList.add('dragging'); },
      move(c, x, y) {
        const row = rowAt(x, y);
        $$('.duty-row.over').forEach((r) => { if (r !== row) r.classList.remove('over'); });
        c.target = row && row !== c.row ? row.dataset.week : null;
        if (c.target) row.classList.add('over');
      },
      end(c) {
        clear();
        if (c.target) swapWeeks(c.week, c.target);
      },
      cancel: clear
    });
  }

  function bindCalendarDrag() {
    const dayAt = (x, y) => {
      const el = document.elementsFromPoint(x, y).find((n) => n.classList && n.classList.contains('day'));
      return el ? el.dataset.day : null;
    };
    const rangeOf = (c) => {
      if (c.mode === 'create') return c.cur < c.anchor ? [c.cur, c.anchor] : [c.anchor, c.cur];
      if (c.mode === 'move') {
        const n = diffDays(c.anchor, c.cur);
        return [shiftKey(c.ev.startDate, n), shiftKey(c.ev.endDate || c.ev.startDate, n)];
      }
      const start = c.ev.startDate, end = c.ev.endDate || c.ev.startDate;
      if (c.mode === 'start') return [c.cur > end ? end : c.cur, end];
      return [start, c.cur < start ? start : c.cur];
    };
    const paint = (c) => {
      const r = rangeOf(c);
      $$('#tab-calendar .day').forEach((d) => d.classList.toggle('in-range', d.dataset.day >= r[0] && d.dataset.day <= r[1]));
      const n = diffDays(r[0], r[1]) + 1;
      toast(fmtSpan(r[0], r[1]) + (n > 1 ? '，共 ' + n + ' 天' : ''), false, true);
    };
    const clear = () => {
      $$('#tab-calendar .in-range').forEach((d) => d.classList.remove('in-range'));
      $$('#tab-calendar .bar.lifted').forEach((b) => b.classList.remove('lifted'));
      hideToast();
    };
    gesture($('#tab-calendar'), {
      horizontal: true,
      begin(e) {
        const day = dayAt(e.clientX, e.clientY);
        if (!day) return null;
        const bar = e.target.closest('.bar');
        if (bar) {
          const ev = state.data.events.find((x) => x.id === bar.dataset.id);
          if (!ev) return null;
          const handle = e.target.closest('.h');
          const mode = handle ? (handle.classList.contains('h-l') ? 'start' : 'end') : 'move';
          return { mode: mode, ev: ev, anchor: day, cur: day };
        }
        return e.target.closest('.day') ? { mode: 'create', anchor: day, cur: day } : null;
      },
      start(c) {
        if (c.ev) $$('#tab-calendar .bar').forEach((b) => { if (b.dataset.id === c.ev.id) b.classList.add('lifted'); });
        paint(c);
      },
      move(c, x, y) {
        const day = dayAt(x, y);
        if (day && day !== c.cur) { c.cur = day; paint(c); }
      },
      end(c) {
        const r = rangeOf(c);
        clear();
        if (c.mode === 'create') { openNewEvent(r[0], r[1]); return; }
        if (r[0] === c.ev.startDate && r[1] === (c.ev.endDate || c.ev.startDate)) return;
        const item = Object.assign({}, c.ev, { startDate: r[0], endDate: r[1] });
        mutate('upsert', { sheet: 'events', item: item }, '已改到 ' + fmtSpan(r[0], r[1]));
      },
      cancel: clear
    });
  }

  // ---------- 行事曆 ----------
  function maxLanes() { return mqWide.matches ? 3 : 2; }

  function layoutWeek(days) {
    const first = days[0], last = days[6];
    const segs = state.data.events
      .filter((e) => e.startDate <= last && (e.endDate || e.startDate) >= first)
      .map((e) => {
        const end = e.endDate || e.startDate;
        return {
          e: e,
          from: Math.max(0, diffDays(first, e.startDate)),
          to: Math.min(6, diffDays(first, end)),
          contL: e.startDate < first,
          contR: end > last
        };
      })
      .sort((a, b) => a.from - b.from || (b.to - b.from) - (a.to - a.from));
    const lanes = [];
    segs.forEach((s) => {
      let i = lanes.findIndex((end) => end < s.from);
      if (i === -1) i = lanes.length;
      lanes[i] = s.to;
      s.lane = i;
    });
    return segs;
  }

  function barLabel(e) { return (mqWide.matches && e.startTime ? e.startTime + ' ' : '') + e.title; }

  function renderWeek(mon, month, today) {
    const days = [];
    for (let i = 0; i < 7; i++) days.push(ymd(addDays(mon, i)));
    const weekKey = days[0];
    const max = maxLanes();
    const segs = layoutWeek(days);
    const hidden = [0, 0, 0, 0, 0, 0, 0];

    const bars = segs.map((s) => {
      if (s.lane >= max) {
        for (let d = s.from; d <= s.to; d++) hidden[d]++;
        return '';
      }
      const e = s.e;
      return '<button type="button" class="bar ' + (TYPE_CLASS[e.type] || 't-other') + (s.contL ? ' cont-l' : '') + (s.contR ? ' cont-r' : '') + '"' +
        ' data-action="edit-event" data-id="' + esc(e.id) + '"' +
        ' style="grid-column:' + (s.from + 1) + ' / span ' + (s.to - s.from + 1) + ';grid-row:' + (s.lane + 1) + '"' +
        ' title="' + esc(e.title + '，' + fmtSpan(e.startDate, e.endDate || e.startDate)) + '">' +
        (s.contL ? '' : '<span class="h h-l"></span>') +
        '<span class="bar-text">' + esc(barLabel(e)) + '</span>' +
        (s.contR ? '' : '<span class="h h-r"></span>') +
        '</button>';
    }).join('');
    const more = hidden.map((n, i) => n
      ? '<button type="button" class="more" data-action="open-day" data-day="' + days[i] + '" style="grid-column:' + (i + 1) + ';grid-row:' + (max + 1) + '">還有 ' + n + ' 筆</button>'
      : '').join('');

    const cells = days.map((key) => {
      const d = parseYmd(key);
      const cls = 'day' + (d.getMonth() === month ? '' : ' out') + (key === today ? ' today' : '');
      return '<button type="button" class="' + cls + '" data-action="new-event" data-day="' + key + '" aria-label="在 ' + (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日新增行程"><span class="day-num">' + d.getDate() + '</span></button>';
    }).join('');

    const person = dutyFor(weekKey);
    const isNow = today >= days[0] && today <= days[6];
    return '<div class="cal-week' + (isNow ? ' this-week' : '') + '">' +
      '<button type="button" class="week-duty" data-action="edit-duty" data-week="' + weekKey + '" aria-label="' + fmtWeek(weekKey) + ' 由 ' + esc(person) + ' 值班，點一下更改">值班 ' + esc(person) + '</button>' +
      '<div class="week-body"><div class="week-days">' + cells + '</div><div class="week-bars">' + bars + more + '</div></div>' +
      '</div>';
  }

  function renderCalendar() {
    const m = state.calMonth;
    const today = todayKey();
    const weeks = [];
    const lastDay = new Date(m.getFullYear(), m.getMonth() + 1, 0);
    for (let w = mondayOf(m); w <= lastDay; w = addDays(w, 7)) weeks.push(w);
    const isThisMonth = m.getTime() === startOfMonth(new Date()).getTime();

    const upcoming = state.data.events
      .filter((e) => (e.endDate || e.startDate) >= today)
      .sort((a, b) => a.startDate.localeCompare(b.startDate))
      .slice(0, 8);

    $('#tab-calendar').innerHTML =
      '<div class="month-nav">' +
        '<h2>' + monthTitle(m) + '</h2>' +
        '<div class="nav-btns">' +
          (isThisMonth ? '' : '<button type="button" class="btn ghost small" data-action="cal-today">今天</button>') +
          '<button type="button" class="btn ghost icon" data-action="cal-prev" aria-label="上個月">' + ICON.left + '</button>' +
          '<button type="button" class="btn ghost icon" data-action="cal-next" aria-label="下個月">' + ICON.right + '</button>' +
          '<button type="button" class="btn primary" data-action="new-event" data-day="' + today + '">新增行程</button>' +
        '</div>' +
      '</div>' +
      '<p class="hint">點日期新增。按住拖過好幾天可以標出住宿或外出；拖長條改日期，拖兩端改長短。</p>' +
      '<div class="legend">' + EVENT_TYPES.map((t) => '<span><i class="swatch ' + TYPE_CLASS[t] + '"></i>' + t + '</span>').join('') + '</div>' +
      '<div class="cal" style="--rows:' + (maxLanes() + 1) + '">' +
        '<div class="cal-dow" aria-hidden="true">' + ['一', '二', '三', '四', '五', '六', '日'].map((x) => '<span>' + x + '</span>').join('') + '</div>' +
        weeks.map((w) => renderWeek(w, m.getMonth(), today)).join('') +
      '</div>' +
      '<h3 class="sub">接下來</h3>' +
      (upcoming.length ? '<div class="rows">' + upcoming.map(eventRow).join('') + '</div>' : '<p class="empty">接下來沒有行程。</p>');
  }

  function eventRow(e) {
    const time = e.startTime ? e.startTime + (e.endTime ? '–' + e.endTime : '') : '';
    const meta = [nowrap(fmtSpan(e.startDate, e.endDate || e.startDate)), esc(e.type), esc(e.owner), nowrap(time)].filter((x) => x && x !== '<span class="nw"></span>').join(' · ');
    return '<button type="button" class="row" data-action="edit-event" data-id="' + esc(e.id) + '">' +
      '<i class="swatch ' + (TYPE_CLASS[e.type] || 't-other') + '"></i>' +
      '<span class="row-main"><strong>' + esc(e.title) + '</strong><span class="muted small">' + meta + '</span>' +
      (e.note ? '<span class="muted small">' + esc(e.note) + '</span>' : '') + '</span>' +
      '</button>';
  }

  function openDay(day) {
    const list = state.data.events
      .filter((e) => e.startDate <= day && day <= (e.endDate || e.startDate));
    const dlg = $('#dlg');
    dlg.innerHTML = '<div class="dlg-form"><h2>' + fmtDay(day) + '</h2><div class="rows">' + list.map(eventRow).join('') + '</div>' +
      '<div class="dlg-actions"><span class="spacer"></span><button type="button" class="btn ghost" data-action="close-dlg">關閉</button>' +
      '<button type="button" class="btn primary" data-action="new-event" data-day="' + day + '">新增行程</button></div></div>';
    if (!dlg.open) dlg.showModal();
  }

  // ---------- 消耗品 ----------
  function settlementOf(q) { return state.data.settlements.find((s) => s.quarter === q); }

  function renderConsumables() {
    const groups = {};
    state.data.consumables.slice().sort((a, b) => b.date.localeCompare(a.date)).forEach((c) => {
      const q = quarterKey(c.date);
      (groups[q] = groups[q] || []).push(c);
    });
    const body = Object.keys(groups).sort().reverse().map((q) => {
      const items = groups[q];
      const total = items.filter((c) => c.split !== 'N').reduce((s, c) => s + cents(c.amount), 0);
      return '<section class="group"><div class="group-head"><h3>' + quarterLabel(q) + '</h3>' +
        (settlementOf(q) ? '<span class="tag soft">已結清</span>' : '') +
        '<span class="muted small group-total">平分合計 ' + money(total / 100) + '</span></div>' +
        '<div class="rows">' + items.map((c) =>
          '<button type="button" class="row" data-action="edit-consumable" data-id="' + esc(c.id) + '">' +
            '<span class="row-main"><strong>' + esc(c.item) + '</strong>' +
              '<span class="muted small">' + [nowrap(fmtDay(c.date)), esc(c.category), esc(c.payer) + ' 付'].filter(Boolean).join(' · ') + '</span>' +
              (c.note ? '<span class="muted small">' + esc(c.note) + '</span>' : '') +
            '</span>' +
            '<span class="row-side"><span class="amount">' + money(c.amount) + '</span>' +
              (c.split === 'N' ? '<span class="tag soft">不分攤</span>' : '') + '</span>' +
          '</button>').join('') + '</div></section>';
    }).join('');
    $('#tab-consumables').innerHTML =
      '<div class="panel-head"><div><h2>消耗品</h2><p class="hint">預設 4 人平分，每季結算一次。</p></div>' +
      '<button type="button" class="btn primary" data-action="new-consumable">記一筆</button></div>' +
      (body || '<p class="empty">還沒有紀錄。買了大家要用的東西，就記一筆。</p>');
  }

  // ---------- 雜費（只記錄，不分攤） ----------
  function periodSuggestions() {
    const out = [];
    let d = startOfMonth(new Date());
    for (let i = 0; i < 4; i++) {
      out.push(quarterKey(ymd(d)).replace('-', ' '));
      d = addMonths(d, -3);
    }
    state.data.utilities.forEach((u) => { if (out.indexOf(u.period) === -1) out.push(u.period); });
    return out;
  }

  function renderUtilities() {
    const groups = {};
    state.data.utilities.forEach((u) => { (groups[u.period] = groups[u.period] || []).push(u); });
    const periods = Object.keys(groups).sort().reverse();
    const sumBy = (list, cat) => list.filter((u) => u.category === cat).reduce((s, u) => s + cents(u.amount), 0);

    const body = periods.map((p, i) => {
      const list = groups[p].slice().sort((a, b) => b.amount - a.amount);
      const prev = groups[periods[i + 1]];
      const total = list.reduce((s, u) => s + cents(u.amount), 0);
      return '<section class="group"><div class="group-head"><h3>' + esc(p) + '</h3><span class="muted small group-total">合計 ' + money(total / 100) + '</span></div>' +
        '<div class="rows">' + list.map((u) => {
          let change = '';
          if (prev && prev.some((x) => x.category === u.category)) {
            const d = sumBy(list, u.category) - sumBy(prev, u.category);
            if (d !== 0) change = '<span class="change ' + (d > 0 ? 'up' : 'down') + '">比 ' + esc(periods[i + 1]) + (d > 0 ? ' 多 ' : ' 少 ') + money(Math.abs(d) / 100) + '</span>';
          }
          return '<button type="button" class="row" data-action="edit-utility" data-id="' + esc(u.id) + '">' +
            '<span class="row-main"><strong>' + esc(u.category) + '</strong>' + change +
              (u.note ? '<span class="muted small">' + esc(u.note) + '</span>' : '') + '</span>' +
            '<span class="row-side"><span class="amount">' + money(u.amount) + '</span></span></button>';
        }).join('') + '</div></section>';
    }).join('');

    $('#tab-utilities').innerHTML =
      '<div class="panel-head"><div><h2>雜費</h2><p class="hint">水電、暖氣等只做記錄，讓大家知道用了多少，由 Jerry 分配。</p></div>' +
      '<button type="button" class="btn primary" data-action="new-utility">記一筆</button></div>' +
      (body || '<p class="empty">還沒有紀錄。</p>');
  }

  // ---------- 結算（全部用「分」計算，加總不會有誤差） ----------
  function settleCalc(q) {
    const items = state.data.consumables.filter((c) => quarterKey(c.date) === q);
    const split = items.filter((c) => c.split !== 'N');
    const total = split.reduce((s, c) => s + cents(c.amount), 0);
    const base = Math.floor(total / MEMBERS.length);
    const extra = total - base * MEMBERS.length; // 除不盡的幾分錢，依序多分給前面的人
    const balance = MEMBERS.map((name, i) => {
      const paid = split.filter((c) => c.payer === name).reduce((s, c) => s + cents(c.amount), 0);
      return { name: name, paid: paid, diff: paid - base - (i < extra ? 1 : 0) };
    });
    return {
      total: total,
      share: total / MEMBERS.length,
      balance: balance,
      transfers: suggestTransfers(balance),
      notSplit: items.filter((c) => c.split === 'N').reduce((s, c) => s + cents(c.amount), 0)
    };
  }

  function suggestTransfers(balance) {
    const owe = balance.filter((b) => b.diff < 0).map((b) => ({ name: b.name, amt: -b.diff })).sort((a, b) => b.amt - a.amt);
    const get = balance.filter((b) => b.diff > 0).map((b) => ({ name: b.name, amt: b.diff })).sort((a, b) => b.amt - a.amt);
    const out = [];
    let i = 0, j = 0;
    while (i < owe.length && j < get.length) {
      const pay = Math.min(owe[i].amt, get[j].amt);
      out.push({ from: owe[i].name, to: get[j].name, amt: pay });
      owe[i].amt -= pay;
      get[j].amt -= pay;
      if (!owe[i].amt) i++;
      if (!get[j].amt) j++;
    }
    return out;
  }

  function quarterOptions() {
    const set = {};
    state.data.consumables.forEach((c) => { set[quarterKey(c.date)] = true; });
    state.data.settlements.forEach((s) => { set[s.quarter] = true; });
    set[quarterKey(todayKey())] = true;
    return Object.keys(set).sort().reverse();
  }

  // 預設打開最早一個「已過完但還沒結清」的季度，沒有就是本季
  function defaultQuarter() {
    const today = todayKey();
    const due = quarterOptions().reverse().find((q) => quarterEnd(q) < today && !settlementOf(q) && settleCalc(q).total > 0);
    return due || quarterKey(today);
  }

  function parseSnapshot(s) {
    if (!s || !s.snapshot) return null;
    try { return typeof s.snapshot === 'string' ? JSON.parse(s.snapshot) : s.snapshot; } catch (e) { return null; }
  }

  function renderSettle() {
    const q = state.settleQ;
    const now = settleCalc(q);
    const done = settlementOf(q);
    const snap = parseSnapshot(done);
    const c = snap || now; // 結清過的季度顯示當時存下的數字
    const opts = quarterOptions().map((k) => '<option value="' + k + '"' + (k === q ? ' selected' : '') + '>' + quarterLabel(k) + '</option>').join('');
    const rows = c.balance.map((b) => {
      const cls = b.diff > 0 ? 'plus' : b.diff < 0 ? 'minus' : '';
      const label = b.diff > 0 ? '應收' : b.diff < 0 ? '應付' : '不用動';
      return '<li class="bal-row"><span class="bal-name">' + esc(b.name) + '</span>' +
        '<span class="muted small bal-paid">付了 ' + money(b.paid / 100) + '</span>' +
        '<span class="bal ' + cls + '">' + label + (b.diff ? ' ' + money(Math.abs(b.diff) / 100) : '') + '</span></li>';
    }).join('');
    const transfers = c.transfers.length
      ? '<ul class="transfers">' + c.transfers.map((t) => '<li><strong>' + esc(t.from) + '</strong>' + ICON.arrow + '<strong>' + esc(t.to) + '</strong><span class="amount">' + money(t.amt / 100) + '</span></li>').join('') + '</ul>'
      : '<p class="muted">這一季沒有需要轉帳的金額。</p>';
    const inProgress = quarterEnd(q) >= todayKey();
    const changed = done && snap && snap.total !== now.total;

    $('#tab-settle').innerHTML =
      '<div class="panel-head"><div><h2>季度結算</h2><p class="hint">只算平分的消耗品，雜費和房租由 Jerry 另外算。</p></div>' +
      '<select id="settleQ" aria-label="選擇季度">' + opts + '</select></div>' +
      '<div class="summary">' +
        '<div><span class="muted small">平分合計</span><strong>' + money(c.total / 100) + '</strong></div>' +
        '<div><span class="muted small">每人應分攤</span><strong>' + money(c.share / 100) + '</strong></div>' +
      '</div>' +
      '<ul class="bal-list">' + rows + '</ul>' +
      '<h3 class="sub">誰付給誰</h3>' + transfers +
      (changed ? '<p class="warn">結清後這一季的消耗品有變動，目前平分合計是 ' + money(now.total / 100) + '。下面的數字仍是結清當時的；要重算請先取消結清。</p>' : '') +
      '<div class="settle-status' + (done ? ' done' : '') + '">' +
        (done
          ? '<span>已在 ' + nowrap(fmtDay(done.clearedAt)) + ' 結清</span><button type="button" class="btn ghost small" data-action="unsettle" data-q="' + q + '">取消結清</button>'
          : '<span>' + (inProgress ? '這一季還沒結束' : '這一季還沒結清') + '</span><button type="button" class="btn ' + (inProgress ? 'ghost' : 'primary') + ' small" data-action="settle" data-q="' + q + '">標記結清</button>') +
      '</div>' +
      (now.notSplit ? '<p class="muted small note">另有 ' + money(now.notSplit / 100) + ' 的「不分攤」項目，沒有算進來。</p>' : '');
  }

  // ---------- 生活公約 ----------
  function renderRules() {
    $('#tab-rules').innerHTML =
      '<div class="panel-head"><div><h2>生活公約</h2><p class="hint">一起住得舒服的幾個小約定。</p></div></div>' +
      '<div class="rules-page">' + HOUSE_RULES.map((g) =>
        '<section class="rule-group"><h3>' + esc(g.title) + '</h3><ul>' +
        g.items.map((t) => '<li>' + esc(t).replace(/(\d) (點|晚|人)/g, '$1\u00a0$2') + '</li>').join('') + '</ul></section>').join('') +
      '</div>';
  }

  // ---------- 表單 ----------
  function fieldHtml(f, val) {
    const id = 'f-' + f.name;
    const req = f.required ? ' required' : '';
    const v = (val === undefined || val === null || val === '') ? (f.default === undefined ? '' : f.default) : val;
    const wrapAttrs = ' data-f="' + f.name + '"';
    const hint = f.hint ? '<span class="field-hint">' + esc(f.hint) + '</span>' : '';
    if (f.type === 'checkbox') {
      return '<div class="field"' + wrapAttrs + '><label class="check"><input type="checkbox" id="' + id + '" name="' + f.name + '"' + (v === 'N' ? '' : ' checked') + '><span>' + esc(f.label) + '</span></label>' + hint + '</div>';
    }
    if (f.type === 'segmented') {
      const list = f.options.map((o) => (Array.isArray(o) ? o : [o, o]));
      const cur = list.some((o) => o[0] === String(v)) ? String(v) : list[0][0];
      return '<fieldset class="seg-field"' + wrapAttrs + '><legend class="field-label">' + esc(f.label) + '</legend><div class="seg">' +
        list.map((o) => '<label><input type="radio" name="' + f.name + '" value="' + esc(o[0]) + '"' + (o[0] === cur ? ' checked' : '') + '><span>' + esc(o[1]) + '</span></label>').join('') +
        '</div></fieldset>';
    }
    let input;
    if (f.type === 'textarea') {
      input = '<textarea id="' + id + '" name="' + f.name + '" rows="2" placeholder="' + esc(f.placeholder || '') + '">' + esc(v) + '</textarea>';
    } else if (f.type === 'datalist') {
      input = '<input id="' + id + '" name="' + f.name + '" list="dl-' + f.name + '" value="' + esc(v) + '"' + req + ' autocomplete="off" placeholder="' + esc(f.placeholder || '') + '">' +
        '<datalist id="dl-' + f.name + '">' + f.list.map((x) => '<option value="' + esc(x) + '">').join('') + '</datalist>';
    } else {
      const attrs = f.type === 'number' ? ' inputmode="decimal" min="0" step="0.01"' : '';
      input = '<input id="' + id + '" type="' + (f.type || 'text') + '" name="' + f.name + '" value="' + esc(v) + '"' + req + attrs + ' placeholder="' + esc(f.placeholder || '') + '">';
    }
    return '<div class="field' + (f.half ? ' half' : '') + '"' + wrapAttrs + '><label for="' + id + '"><span class="field-label">' + esc(f.label) + '</span></label>' + input + hint + '</div>';
  }

  function openForm(opts) {
    const dlg = $('#dlg');
    const fields = opts.fields;
    const v = opts.values || {};
    dlg.innerHTML =
      '<form class="dlg-form">' +
        '<h2>' + esc(opts.title) + '</h2>' +
        (opts.intro ? '<p class="hint">' + esc(opts.intro) + '</p>' : '') +
        fields.map((f) => fieldHtml(f, v[f.name])).join('') +
        '<p class="form-error" role="alert" hidden></p>' +
        '<div class="dlg-actions">' +
          (opts.onDelete ? '<button type="button" class="btn danger" data-kind="delete">刪除</button>' : '') +
          (opts.extra ? '<button type="button" class="btn ghost" data-kind="extra">' + esc(opts.extra.label) + '</button>' : '') +
          '<span class="spacer"></span>' +
          '<button type="button" class="btn ghost" data-kind="cancel">取消</button>' +
          '<button type="submit" class="btn primary">' + esc(opts.submitLabel || '儲存') + '</button>' +
        '</div>' +
      '</form>';
    const form = $('form', dlg);
    const errorEl = $('.form-error', form);

    const visible = (f, cur) => !f.when || f.when(cur);
    const syncFields = () => {
      const cur = Object.fromEntries(new FormData(form));
      fields.forEach((f) => { $('[data-f="' + f.name + '"]', form).hidden = !visible(f, cur); });
    };
    form.addEventListener('change', syncFields);
    syncFields();

    form.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-kind]');
      if (!btn) return;
      const kind = btn.dataset.kind;
      if (kind === 'cancel') dlg.close();
      if (kind === 'extra') { dlg.close(); opts.extra.run(); }
      if (kind === 'delete') {
        if (btn.dataset.armed) { dlg.close(); opts.onDelete(); return; }
        btn.dataset.armed = '1';
        btn.textContent = '再按一次確認刪除';
        setTimeout(() => {
          if (btn.isConnected) { delete btn.dataset.armed; btn.textContent = '刪除'; }
        }, 3000);
      }
    });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const cur = Object.fromEntries(new FormData(form));
      const out = {};
      fields.forEach((f) => {
        const el = form.elements.namedItem(f.name); // 不能用 elements[name]：欄位叫 item 時會拿到內建方法
        if (!visible(f, cur)) out[f.name] = '';
        else if (f.type === 'checkbox') out[f.name] = el.checked ? 'Y' : 'N';
        else if (f.type === 'number') out[f.name] = Number(el.value) || 0;
        else out[f.name] = String(el.value).trim();
      });
      const problem = opts.validate ? opts.validate(out) : '';
      if (problem) {
        errorEl.textContent = problem;
        errorEl.hidden = false;
        return;
      }
      dlg.close();
      opts.onSubmit(out);
    });
    if (!dlg.open) dlg.showModal();
  }

  // ---------- 行程表單 ----------
  function eventFields() {
    const withTime = (cur) => cur.type === '訪客用餐' || cur.type === '其他';
    return [
      { name: 'type', label: '種類', type: 'segmented', options: EVENT_TYPES },
      { name: 'owner', label: '誰的', type: 'segmented', options: [['', '大家']].concat(MEMBERS.map((m) => [m, m])) },
      { name: 'title', label: '說明', placeholder: '可不填，例如：朋友來吃火鍋' },
      { name: 'startDate', label: '開始', type: 'date', required: true, half: true },
      { name: 'endDate', label: '結束', type: 'date', required: true, half: true },
      { name: 'startTime', label: '幾點開始', type: 'time', half: true, when: withTime },
      { name: 'endTime', label: '幾點結束', type: 'time', half: true, when: withTime },
      { name: 'note', label: '備註', type: 'textarea' }
    ];
  }
  function checkEvent(v) {
    if (v.endDate < v.startDate) return '結束日期不能早於開始日期。';
    if (v.startDate === v.endDate && v.startTime && v.endTime && v.endTime < v.startTime) return '結束時間不能早於開始時間。';
    return '';
  }
  function eventToSave(id, v) {
    const title = v.title || ((v.owner ? v.owner + ' ' : '') + v.type);
    if (v.owner) pref(PERSON_KEY, v.owner);
    return Object.assign({}, v, { id: id, title: title });
  }
  function openNewEvent(start, end) {
    const multi = !!end && end !== start;
    openForm({
      title: '新增行程',
      fields: eventFields(),
      values: { type: multi ? '訪客住宿' : '訪客用餐', owner: pref(PERSON_KEY), startDate: start, endDate: end || start },
      validate: checkEvent,
      onSubmit: (v) => mutate('upsert', { sheet: 'events', item: eventToSave(uid(), v) }, '已新增行程')
    });
  }
  function openEditEvent(id) {
    const e = state.data.events.find((x) => x.id === id);
    if (!e) return;
    openForm({
      title: '編輯行程',
      fields: eventFields(),
      values: Object.assign({}, e, { endDate: e.endDate || e.startDate }),
      validate: checkEvent,
      onDelete: () => mutate('delete', { sheet: 'events', key: 'id', value: e.id }, '已刪除行程'),
      onSubmit: (v) => mutate('upsert', { sheet: 'events', item: eventToSave(e.id, v) }, '已儲存')
    });
  }

  // ---------- 消耗品表單 ----------
  function usedValues(list, key, hints) {
    const out = hints.slice();
    list.forEach((r) => { if (r[key] && out.indexOf(r[key]) === -1) out.push(r[key]); });
    return out;
  }
  function checkAmount(v) { return v.amount > 0 ? '' : '金額要大於 0。'; }
  function consumableFields() {
    return [
      { name: 'item', label: '買了什麼', required: true, placeholder: '例如：衛生紙 12 捲' },
      { name: 'amount', label: '金額', type: 'number', required: true, half: true, placeholder: '0.00' },
      { name: 'date', label: '日期', type: 'date', required: true, half: true, default: todayKey() },
      { name: 'payer', label: '誰付的', type: 'segmented', options: MEMBERS },
      { name: 'category', label: '類別', type: 'datalist', list: usedValues(state.data.consumables, 'category', CATEGORY_HINTS), placeholder: '自由輸入，例如：廚房' },
      { name: 'split', label: '4 人平分', type: 'checkbox', hint: '個人物品就取消勾選，不會算進結算。' },
      { name: 'note', label: '備註', type: 'textarea' }
    ];
  }
  function saveConsumable(id, v, msg) {
    pref(PERSON_KEY, v.payer);
    mutate('upsert', { sheet: 'consumables', item: Object.assign({ id: id }, v) }, msg);
  }
  function openNewConsumable() {
    openForm({
      title: '記一筆消耗品', fields: consumableFields(), values: { payer: pref(PERSON_KEY) || MEMBERS[0], split: 'Y' },
      validate: checkAmount,
      onSubmit: (v) => saveConsumable(uid(), v, '已記下')
    });
  }
  function openEditConsumable(id) {
    const c = state.data.consumables.find((x) => x.id === id);
    if (!c) return;
    openForm({
      title: '編輯消耗品', fields: consumableFields(), values: c,
      intro: settlementOf(quarterKey(c.date)) ? '這一季已經結清，修改後結算頁會提醒數字有變動。' : '',
      validate: checkAmount,
      onDelete: () => mutate('delete', { sheet: 'consumables', key: 'id', value: c.id }, '已刪除'),
      onSubmit: (v) => saveConsumable(c.id, v, '已儲存')
    });
  }

  // ---------- 雜費表單 ----------
  function utilityFields() {
    return [
      { name: 'category', label: '類別', type: 'datalist', list: usedValues(state.data.utilities, 'category', UTILITY_HINTS), required: true, placeholder: '例如：電費' },
      { name: 'period', label: '該期', type: 'datalist', list: periodSuggestions(), required: true, half: true, default: periodSuggestions()[0] },
      { name: 'amount', label: '金額', type: 'number', required: true, half: true, placeholder: '0.00' },
      { name: 'note', label: '備註', type: 'textarea', placeholder: '例如：開始開暖氣了' }
    ];
  }
  function openNewUtility() {
    openForm({
      title: '記一筆雜費', fields: utilityFields(), validate: checkAmount,
      onSubmit: (v) => mutate('upsert', { sheet: 'utilities', item: Object.assign({ id: uid() }, v) }, '已記下')
    });
  }
  function openEditUtility(id) {
    const u = state.data.utilities.find((x) => x.id === id);
    if (!u) return;
    openForm({
      title: '編輯雜費', fields: utilityFields(), values: u, validate: checkAmount,
      onDelete: () => mutate('delete', { sheet: 'utilities', key: 'id', value: u.id }, '已刪除'),
      onSubmit: (v) => mutate('upsert', { sheet: 'utilities', item: Object.assign({ id: u.id }, v) }, '已儲存')
    });
  }

  // ---------- 值班表單（行事曆上點「值班」） ----------
  function openEditDuty(week) {
    const current = dutyFor(week);
    openForm({
      title: fmtWeek(week) + ' 由誰值班？',
      intro: '這裡改的會同步到家事頁。',
      fields: [{ name: 'person', label: '值班的人', type: 'segmented', options: MEMBERS }],
      values: { person: current },
      extra: dutyRow(week) ? {
        label: '還原',
        run: () => mutate('setDuty', { items: [{ week: week, person: '' }] }, '已還原成固定順序')
      } : null,
      submitLabel: '更改',
      onSubmit: (v) => mutate('setDuty', { items: [dutyItem(week, v.person)] }, '已更改值班')
    });
  }

  // ---------- 事件 ----------
  function bindActions() {
    const actions = {
      'reload': () => firstLoad(),
      'restore-week': (el) => mutate('setDuty', { items: [{ week: el.dataset.week, person: '' }] }, '已還原成固定順序'),
      'duty-prev': () => { state.dutyMonth = addMonths(state.dutyMonth, -1); renderDuty(); },
      'duty-next': () => { state.dutyMonth = addMonths(state.dutyMonth, 1); renderDuty(); },
      'cal-prev': () => { state.calMonth = addMonths(state.calMonth, -1); renderCalendar(); },
      'cal-next': () => { state.calMonth = addMonths(state.calMonth, 1); renderCalendar(); },
      'cal-today': () => { state.calMonth = startOfMonth(new Date()); renderCalendar(); },
      'edit-duty': (el) => openEditDuty(el.dataset.week),
      'new-event': (el) => openNewEvent(el.dataset.day),
      'edit-event': (el) => openEditEvent(el.dataset.id),
      'open-day': (el) => openDay(el.dataset.day),
      'close-dlg': () => $('#dlg').close(),
      'new-consumable': openNewConsumable,
      'edit-consumable': (el) => openEditConsumable(el.dataset.id),
      'new-utility': openNewUtility,
      'edit-utility': (el) => openEditUtility(el.dataset.id),
      'settle': (el) => {
        const q = el.dataset.q;
        const c = settleCalc(q);
        mutate('setSettled', { quarter: q, cleared: true, clearedAt: todayKey(), snapshot: JSON.stringify(c) }, '已標記結清');
      },
      'unsettle': (el) => mutate('setSettled', { quarter: el.dataset.q, cleared: false }, '已取消結清')
    };
    // 拖拉放開後瀏覽器還會補一個 click，要吃掉，不然會多開一個表單
    document.addEventListener('click', (e) => {
      if (Date.now() < suppressClickUntil) { suppressClickUntil = 0; e.stopPropagation(); e.preventDefault(); }
    }, true);
    document.addEventListener('click', (e) => {
      const el = e.target.closest('[data-action]');
      if (el && actions[el.dataset.action]) actions[el.dataset.action](el);
    });
    document.addEventListener('change', (e) => {
      if (e.target.id === 'settleQ') { state.settleQ = e.target.value; renderSettle(); }
      if (e.target.classList.contains('duty-select')) {
        const week = e.target.dataset.week;
        mutate('setDuty', { items: [dutyItem(week, e.target.value)] }, fmtWeek(week) + ' 改由 ' + e.target.value + ' 值班');
      }
    });
    // 拖拉中不要讓頁面跟著捲動；手機長按也不要跳出選單
    document.addEventListener('touchmove', (e) => { if (gestureActive) e.preventDefault(); }, { passive: false });
    document.addEventListener('contextmenu', (e) => {
      if (e.target.closest && e.target.closest('.cal, .duty-list') && !mqWide.matches) e.preventDefault();
    });
    // 點對話框外面就關閉
    $('#dlg').addEventListener('click', (e) => { if (e.target === e.currentTarget) e.currentTarget.close(); });

    const tabs = $$('.tabs [data-tab]');
    tabs.forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));
    $('.tabs').addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const i = TABS.indexOf(state.tab);
      const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length];
      next.focus();
      next.click();
    });

    mqWide.addEventListener('change', () => { if (state.data) renderCalendar(); });

    // 別人可能改過資料：回到這個分頁時，隔一分鐘以上就重新讀取
    document.addEventListener('visibilitychange', () => {
      const idle = !pending && !gestureActive && !$('#dlg').open;
      if (document.visibilityState === 'visible' && state.data && idle && Date.now() - state.lastLoad > 60000) {
        loadData().catch(() => { /* 下次再試 */ });
      }
    });
  }

  // ---------- 啟動 ----------
  function init() {
    bindActions();
    bindDutyDrag();
    bindCalendarDrag();
    const wanted = new URLSearchParams(location.search).get('tab');
    setTab(TABS.indexOf(wanted) !== -1 ? wanted : 'duty');

    $('#gateForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const pw = $('#gatePw').value;
      const btn = e.target.querySelector('button[type="submit"]');
      btn.disabled = true;
      state.pw = pw;
      try {
        await loadData();
        savePassword(pw);
        showApp();
      } catch (err) {
        forgetPassword();
        showGate(err.message === 'PASSWORD' ? '密碼不對，再試一次。' : err.message);
      } finally {
        btn.disabled = false;
      }
    });
    $('#logout').addEventListener('click', () => {
      forgetPassword();
      showGate('');
    });

    if (DEMO) {
      showApp();
      firstLoad();
      return;
    }
    const saved = readPassword();
    if (saved) {
      state.pw = saved;
      showApp();
      firstLoad();
    } else {
      showGate('');
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
