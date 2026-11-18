/* 장기요양 본인부담금 계산기 — 화면 동작
   계산은 calc.js, 질문과 답은 faq.js에 있어요. 여기는 눌렀을 때 화면이 어떻게 바뀌는지만 적혀 있어요. */
(function () {
'use strict';

var L = window.LTC, F = window.LTC_FAQ;
var DATA = L.DATA, fmt = L.fmt, won = L.won, num = L.num, clamp = L.clamp, gradeOf = L.gradeOf, rateOf = L.rateOf;
var minLabel = L.minLabel, visitAllowed = L.visitAllowed, MODE_NAMES = L.MODE_NAMES;
var $ = function (s, r) { return (r || document).querySelector(s); };
var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
var REDUCE = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

/* ---------- 상태 (이 휴대폰 안에만 저장해서, 다시 열어도 그대로) ---------- */
var KEY = 'care-v2-state-1';
var S = L.defaults();
function merge(dst, src) {
  Object.keys(dst).forEach(function (k) {
    if (src[k] === undefined || src[k] === null) return;
    if (dst[k] && typeof dst[k] === 'object') { if (typeof src[k] === 'object') merge(dst[k], src[k]); }
    else if (typeof dst[k] === typeof src[k]) dst[k] = src[k];
  });
}
try { var raw = JSON.parse(localStorage.getItem(KEY) || 'null'); if (raw && typeof raw === 'object') merge(S, raw); } catch (e) {}
function sanitize() {
  if ([0, 1, 2].indexOf(S.mode) < 0) S.mode = 0;
  if (!DATA.rates[S.reduce]) S.reduce = 'general';
  if (!DATA.grades.some(function (g) { return g.key === S.grade; })) S.grade = '4';
  if ([0, 1, 2].indexOf(S.day.band) < 0) S.day.band = 2;
  if (['lunch', 'both'].indexOf(S.day.meal) < 0) S.day.meal = 'both';
  if (['home', 'group'].indexOf(S.fac.type) < 0) S.fac.type = 'home';
  if (['multi', 'double', 'single'].indexOf(S.fac.room) < 0) S.fac.room = 'multi';
  [S.day.visit, S.visit].forEach(function (v) { if (!DATA.visit[v.minutes]) v.minutes = 180; });
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
function getP(p) { return p.split('.').reduce(function (a, k) { return a[k]; }, S); }
function setP(p, v) { var ks = p.split('.'), last = ks.pop(); ks.reduce(function (a, k) { return a[k]; }, S)[last] = v; }

/* ---------- 칩 (눌러서 고르는 버튼) ---------- */
function setChips(el, items, isOn, onPick) {
  var sig = items.map(function (i) { return i.label + '|' + (i.sub || '') + '|' + (i.disabled ? 1 : 0); }).join('~');
  if (el.dataset.sig !== sig || el.children.length !== items.length) {
    el.dataset.sig = sig; el.innerHTML = '';
    items.forEach(function (it) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'chip';
      b.innerHTML = it.label + (it.sub ? '<small>' + it.sub + '</small>' : '');
      if (it.disabled) b.disabled = true;
      b.addEventListener('click', function () { onPick(it.value); });
      el.appendChild(b);
    });
  }
  Array.prototype.forEach.call(el.children, function (b, i) { b.setAttribute('aria-pressed', isOn(items[i].value) ? 'true' : 'false'); });
}
function minuteItems(g) {
  return [150, 180, 210, 240].map(function (m) { return { value: m, label: minLabel(m).replace(' ', '<br>'), disabled: !visitAllowed(g.key, m) }; });
}
function effMin(m, g) { return visitAllowed(g.key, m) ? m : 180; }
function renderChips() {
  var g = gradeOf(S.grade);
  setChips($('#g-grade'), DATA.grades.map(function (x) { return { value: x.key, label: x.name }; }), function (v) { return v === S.grade; }, function (v) { S.grade = v; update(); });
  setChips($('#g-reduce'), Object.keys(DATA.rates).map(function (k) { var r = DATA.rates[k]; return { value: k, label: r.label, sub: '재가 ' + r.home + '% · 시설 ' + r.fac + '%' }; }),
    function (v) { return v === S.reduce; }, function (v) { S.reduce = v; update(); });
  setChips($('#g-band'), DATA.bands.map(function (b, i) { return { value: i, label: b, sub: won(g.day[i]) }; }), function (v) { return v === S.day.band; }, function (v) { S.day.band = v; update(); });
  setChips($('#g-meal'), [{ value: 'lunch', label: '점심만' }, { value: 'both', label: '점심·저녁' }], function (v) { return v === S.day.meal; }, function (v) { S.day.meal = v; update(); });
  setChips($('#g-vmin'), minuteItems(g), function (v) { return v === effMin(S.day.visit.minutes, g); }, function (v) { S.day.visit.minutes = v; update(); });
  setChips($('#g-minutes'), minuteItems(g), function (v) { return v === effMin(S.visit.minutes, g); }, function (v) { S.visit.minutes = v; update(); });
  setChips($('#g-ftype'), [{ value: 'home', label: '요양원', sub: '노인요양시설' }, { value: 'group', label: '공동생활가정', sub: '9명 이하 소규모' }], function (v) { return v === S.fac.type; }, function (v) { S.fac.type = v; update(); });
  setChips($('#g-room'), [{ value: 'multi', label: '다인실' }, { value: 'double', label: '2인실' }, { value: 'single', label: '1인실' }], function (v) { return v === S.fac.room; }, function (v) { S.fac.room = v; update(); });
}

/* ---------- 이용일수 입력 (− 숫자 +) ---------- */
function initSteppers() {
  $$('.stepper').forEach(function (st) {
    var path = st.dataset.path, min = Number(st.dataset.min), max = Number(st.dataset.max), input = $('input', st);
    function setVal(v, keep) { setP(path, Math.max(min, Math.min(max, v))); if (!keep) input.value = getP(path); update(); }
    input.addEventListener('input', function () {
      var d = input.value.replace(/[^\d]/g, '');
      if (d === '') return;
      setVal(clamp(d, min, max), true);
    });
    input.addEventListener('focus', function () { input.select(); });
    input.addEventListener('blur', function () { input.value = getP(path); });
    $$('.step-btn', st).forEach(function (b) {
      b.addEventListener('click', function () { setVal((Number(getP(path)) || 0) + Number(b.dataset.step)); });
    });
  });
}
function initMoney() {
  $$('.money input').forEach(function (inp) {
    var path = inp.dataset.path;
    inp.addEventListener('input', function () { setP(path, clamp(inp.value, 0, 9999999)); update(); });
    inp.addEventListener('focus', function () { var v = num(getP(path)); inp.value = v ? String(v) : ''; inp.select(); });
    inp.addEventListener('blur', function () { inp.value = fmt(num(getP(path))); });
  });
}
function syncInputs() {
  $$('.stepper').forEach(function (st) { var i = $('input', st); if (document.activeElement !== i) i.value = getP(st.dataset.path); });
  $$('.money input').forEach(function (i) { if (document.activeElement !== i) i.value = fmt(num(getP(i.dataset.path))); });
}

/* 이용일수를 한 번에 넣는 버튼 */
var QUICK = {
  'q-day': { path: 'day.wk', items: L.QUICK_DAYS.map(function (q) { return { text: q.label + ' ' + q.n + '일', n: q.n }; }) },
  'q-visit': { path: 'visit.wk', items: L.QUICK_DAYS.map(function (q) { return { text: q.label + ' ' + q.n + '일', n: q.n }; }) },
  'q-fac': { path: 'fac.days', items: [{ text: '30일', n: 30 }, { text: '31일', n: 31 }, { text: '28일', n: 28 }] }
};
function initQuick() {
  Object.keys(QUICK).forEach(function (id) {
    var q = QUICK[id], el = $('#' + id);
    q.items.forEach(function (it) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'qchip'; b.textContent = it.text;
      b.addEventListener('click', function () { setP(q.path, it.n); update(); });
      el.appendChild(b);
    });
  });
}
function updateQuick() {
  Object.keys(QUICK).forEach(function (id) {
    var q = QUICK[id], cur = Number(getP(q.path));
    $$('.qchip', $('#' + id)).forEach(function (b, i) { b.setAttribute('aria-pressed', q.items[i].n === cur ? 'true' : 'false'); });
  });
}

/* ---------- 서비스 탭 ---------- */
function renderTabs() {
  for (var i = 0; i < 3; i++) {
    var sel = S.mode === i, panel = $('#panel-' + i);
    $('#tab-' + i).setAttribute('aria-selected', sel ? 'true' : 'false');
    $('#tab-' + i).tabIndex = sel ? 0 : -1;
    if (panel.hidden === sel) {
      panel.hidden = !sel;
      if (sel && !REDUCE) { panel.classList.remove('show'); void panel.offsetWidth; panel.classList.add('show'); }
    }
  }
}
function setMode(m, opt) {
  if (S.mode === m) return;
  S.mode = m; update();
  tilt();
  if (opt && opt.scroll) $('#t-service').scrollIntoView({ behavior: REDUCE ? 'auto' : 'smooth', block: 'start' });
}
function initTabs() {
  $$('.tab').forEach(function (t) {
    t.addEventListener('click', function () { setMode(Number(t.dataset.mode)); });
    t.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      var m = (S.mode + (e.key === 'ArrowRight' ? 1 : 2)) % 3; setMode(m); $('#tab-' + m).focus();
    });
  });
  $('#cmp-mode').addEventListener('click', function (e) {
    var b = e.target.closest('[data-mode]'); if (!b) return;
    setMode(Number(b.dataset.mode), { scroll: true });
  });
}
function tilt() {
  var d = $('#heroDog'); if (!d || REDUCE) return;
  d.classList.remove('tilt'); void d.getBoundingClientRect(); d.classList.add('tilt');
  setTimeout(function () { d.classList.remove('tilt'); }, 720);
}

/* ---------- 결과 ---------- */
var current = null, shown = 0, rollRaf = 0, rollTimer = 0, lastTotal = null;
function roll(to) {
  cancelAnimationFrame(rollRaf); clearTimeout(rollTimer);
  var el = $('#totalNum'), from = shown;
  if (REDUCE || from === to) { shown = to; el.textContent = fmt(to); return; }
  var t0 = performance.now(), dur = 1100;
  // 화면 갱신이 멈추는 기기에서도 숫자가 틀린 채 남지 않게, 끝나는 시각에 맞는 값으로 고쳐 놔요.
  rollTimer = setTimeout(function () { cancelAnimationFrame(rollRaf); shown = to; el.textContent = fmt(to); }, dur + 150);
  var step = function (t) {
    var k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 4);
    shown = Math.round(from + (to - from) * e);
    el.textContent = fmt(shown);
    if (k < 1) rollRaf = requestAnimationFrame(step); else { shown = to; el.textContent = fmt(to); }
  };
  rollRaf = requestAnimationFrame(step);
}
function bump() {
  if (REDUCE) return;
  var a = $('#hero-amount'); a.classList.remove('bump'); void a.offsetWidth; a.classList.add('bump');
}
function sayText(R) {
  if (R.unavailable) return R.unavailable + '. 주야간보호로 계산해 보세요.';
  if (R.mode === 2) return R.low35 ? '요양원은 한도 없이 하루 비용으로 계산해요. 3~5등급은 판정위원회가 인정한 경우만 입소해요.' : '요양원은 한도 없이 하루 비용으로 계산해요.';
  if (R.empty) return '이용일수를 넣어 주세요.';
  if (R.fixed) return '3시간 30분 이상 방문은 1·2등급만 가능해서 3시간으로 계산했어요.';
  if (R.excess > 0) return '월 한도를 ' + won(R.excess) + ' 넘었어요. 넘은 금액은 전부 본인이 내요. 시간이나 일수를 줄여 보세요.';
  var pct = R.G / R.L;
  if (pct >= .9) return '한도의 ' + Math.round(pct * 100) + '%를 써요. 한도까지 ' + won(R.L - R.G) + ' 남았어요.';
  if (R.boost) return '월 15일 이상 이용해서 한도가 ' + won(R.boost) + ' 늘었어요. 한도까지 ' + won(R.L - R.G) + ' 남았어요.';
  return '한도까지 ' + won(R.L - R.G) + ' 남았어요.';
}
function renderResult() {
  var R = L.calc(S, S.mode);
  current = R;
  var mode = MODE_NAMES[S.mode];
  $('#hero-mode').textContent = mode;
  var say = $('#hero-say');
  $('#say-text').textContent = sayText(R);
  say.classList.toggle('over', !!(R.excess > 0));
  if (R.unavailable) {
    $('#hero-body').hidden = true; $('#hero-na').hidden = false;
    $('#hero-na-text').textContent = R.unavailable;
    $('#ledger').innerHTML = '<p class="hint">' + R.unavailable + '.</p>';
    $('#dock-amount').textContent = '이용 불가'; $('#dock-cond').textContent = mode;
    $('#srTotal').textContent = R.unavailable;
    shown = 0; lastTotal = null;
    return;
  }
  $('#hero-body').hidden = false; $('#hero-na').hidden = true;
  if (lastTotal !== R.total) { if (lastTotal !== null) bump(); roll(R.total); lastTotal = R.total; }
  $('#hero-parts').textContent = R.parts;
  $('#hero-cond').textContent = R.cond;
  var gauge = $('#gauge');
  if (R.L) {
    gauge.hidden = false;
    var pct = R.G / R.L * 100;
    $('#gauge-fill').style.width = Math.min(100, pct) + '%';
    $('#gauge-fill').className = 'gauge-fill' + (pct > 100 ? ' over' : '');
    $('#gauge-bar').setAttribute('aria-valuenow', String(Math.round(Math.min(100, pct))));
    $('#gauge-used').textContent = '한도 ' + Math.round(pct) + '% 사용 · ' + won(R.G);
    $('#gauge-limit').textContent = '한도 ' + won(R.L);
  } else gauge.hidden = true;
  $('#ledger').innerHTML = R.rows.map(rowHtml).join('');
  $('#dock-amount').textContent = won(R.total);
  $('#dock-cond').textContent = mode + ' · ' + R.cond.split(' · ').slice(0, 3).join(' · ');
  $('#srTotal').textContent = '이번 달 내실 금액 ' + won(R.total);
}
function rowHtml(r) {
  var cls = 'row' + (r.k ? ' ' + r.k : '') + (r.cls ? ' ' + r.cls : '');
  return '<div class="' + cls + '"><div class="l"><b>' + r.label + '</b>' + (r.sub ? '<span>' + r.sub + '</span>' : '') + '</div>' + (r.amt != null ? '<div class="r">' + won(r.amt) + '</div>' : '') + '</div>';
}

/* 일수 합계, 방문요양 합산 안내 */
function renderSums() {
  var wk = clamp(S.day.wk, 0, 31), hol = clamp(S.day.hol, 0, 31), days = wk + hol;
  var g = gradeOf(S.grade), pct = DATA.limitBoost.pct[g.key] || 0, ds = $('#d-sum');
  var over31 = days > 31;
  ds.className = 'sum-row num' + (over31 ? ' warn' : '');
  if (over31) ds.innerHTML = '<span>한 달은 31일을 넘을 수 없어요</span><span>' + days + '일</span>';
  else {
    var note = '';
    if (pct && S.day.band >= DATA.limitBoost.minBand) note = days >= DATA.limitBoost.minDays ? '한도 증액 적용 (+' + pct + '%)' : '15일 이상이면 한도가 늘어요';
    ds.innerHTML = '<span>한 달 <b>' + days + '일</b></span><span>' + note + '</span>';
  }
  var vs = clamp(S.visit.wk, 0, 31) + clamp(S.visit.sun, 0, 31) + clamp(S.visit.hol, 0, 31), vEl = $('#v-sum');
  vEl.className = 'sum-row num' + (vs > 31 ? ' warn' : '');
  vEl.innerHTML = vs > 31 ? '<span>한 달은 31일을 넘을 수 없어요</span><span>' + vs + '일</span>' : '<span>한 달 <b>' + vs + '일</b> 방문</span><span>' + minLabel(effMin(S.visit.minutes, g)) + '씩</span>';

  // 주야간보호 + 방문요양
  var withRow = $('#v-row'), cog = g.key === 'c';
  withRow.hidden = cog;
  var on = S.day.withVisit && !cog;
  $('#v-with').setAttribute('aria-checked', on ? 'true' : 'false');
  $('#d-visit').hidden = !on;
  var rm = $('#remain'), info = cog ? null : L.remain(S);
  if (!info) { rm.hidden = true; }
  else {
    rm.hidden = false;
    var R = current && current.mode === 0 ? current : L.calcDay(S);
    if (on) {
      var pc = Math.round(R.G / R.L * 100);
      rm.innerHTML = '한도 ' + fmt(R.L) + '원 중 <b>' + pc + '%</b> 사용 · ' + (R.excess > 0 ? '<b class="bad">한도를 ' + won(R.excess) + ' 넘었어요</b>' : '남는 한도 <b>' + won(R.L - R.G) + '</b>');
    } else if (info.rem <= 0) rm.innerHTML = '주야간보호만으로 한도를 다 썼어요. 방문요양을 더하면 그 금액은 <b>전액 본인</b>이 내요.';
    else rm.innerHTML = '남는 한도 <b>' + won(info.rem) + '</b>으로 방문요양 ' + minLabel(info.minutes) + '을 <b>한 달 약 ' + info.count + '회</b>' + (info.perWeek ? '(주 ' + info.perWeek + '회 정도)' : '') + '까지 더 이용할 수 있어요.';
  }
  $('#f-room-wrap').hidden = S.fac.room === 'multi';
}

/* 비교 */
function renderCompare() {
  var rc = '';
  Object.keys(DATA.rates).forEach(function (k) {
    var x = L.calcWith(S, S.mode, k), r = DATA.rates[k], pct = S.mode === 2 ? r.fac : r.home;
    rc += '<div class="cmp' + (k === S.reduce ? ' on' : '') + '"><span class="tag">' + (k === 'free' ? '면제' : pct + '%') + '</span><span class="name">' + r.label + (k === S.reduce ? '<span>지금 선택</span>' : '') + '</span><span class="amt">' + (x.unavailable ? '—' : won(x.total)) + '</span></div>';
  });
  $('#cmp-reduce').innerHTML = rc;
  var mc = '';
  [0, 1, 2].forEach(function (m) {
    var x = L.calc(S, m);
    mc += '<button type="button" class="cmp' + (m === S.mode ? ' on' : '') + '" data-mode="' + m + '"><span class="tag">' + ['주간', '방문', '시설'][m] + '</span><span class="name">' + MODE_NAMES[m] + '<span>' + (x.unavailable ? '이용 불가' : x.cond) + '</span></span><span class="amt">' + (x.unavailable ? '—' : won(x.total)) + '</span></button>';
  });
  $('#cmp-mode').innerHTML = mc;
}

/* ---------- 2027년 의결 수가 미리보기 ---------- */
var P27 = {
  visit: [[60, 25320, 26280], [90, 34120, 35420], [120, 43430, 45080]],
  bath: [['차량 이용 (차량 내 목욕)', 88990, 92140], ['차량 이용 (가정 내 목욕)', 80230, 83070], ['차량 미이용', 50100, 51870]],
  short: [['1등급', 74060, 76700], ['2등급', 68580, 71030], ['3등급', 63350, 65610], ['4등급', 61680, 63880], ['5등급', 60000, 62140]],
  day68: [['1등급', 8706], ['2등급', 8064], ['3등급', 7445], ['4등급', 7190], ['5등급·인지지원', 6935]]
};
function pct1(a, b) { return (b >= a ? '+' : '−') + (Math.abs(b / a - 1) * 100).toFixed(1) + '%'; }
function render2027() {
  var g = gradeOf(S.grade), mode = S.mode, d27 = L.D2027, g27 = gradeOf(S.grade, d27);
  var R26 = L.calc(S, mode), R27 = L.calc2027(S, mode), h;
  if (R26.unavailable) h = '<p class="hint">' + R26.unavailable + '.</p>';
  else if (!R27) h = '<p class="hint">이 조건은 2027년 자료가 아직 없어서 비교하지 못해요. (주야간보호 8~10시간, 방문요양 3시간·4시간, 요양원만 비교해요.)</p>';
  else {
    var diff = R27.total - R26.total;
    h = '<div class="p27-row"><span>2026년 (지금 적용)</span><b>' + won(R26.total) + '</b></div>' +
      '<div class="p27-row new"><span>2027년 (의결안)</span><b>' + won(R27.total) + '</b></div>' +
      '<p class="p27-diff">' + g.name + ' · ' + MODE_NAMES[mode] + ' 기준, 한 달에 <strong>' + (diff >= 0 ? '+' : '−') + won(Math.abs(diff)) + '</strong> ' + (diff >= 0 ? '늘어나요' : '줄어들어요') + '.</p>';
  }
  $('#p27Cmp').innerHTML = h;
  var rows = [['재가 월 한도액', g.limit, g27.limit], ['주야간보호 1일 (8~10시간)', g.day[2], g27.day[2]]];
  if (g.key !== 'c') {
    rows.push(['방문요양 3시간 (1회)', DATA.visit[180], d27.visit[180]]);
    if (visitAllowed(g.key, 240)) rows.push(['방문요양 4시간 (1회)', DATA.visit[240], d27.visit[240]]);
  }
  if (g.fac) rows.push(['요양원 1일', DATA.facility.home[g.fac], d27.facility.home[g.fac]]);
  $('#p27Rows').innerHTML = rows.map(function (r) {
    return '<div class="row"><div class="l"><b>' + r[0] + '</b><span>2026년 ' + won(r[1]) + '</span></div><div class="r">' + won(r[2]) + '<br><small>' + pct1(r[1], r[2]) + '</small></div></div>';
  }).join('');
  if (!$('#p27More').dataset.done) {
    $('#p27More').dataset.done = '1';
    $('#p27More').innerHTML =
      '<p><b>보험료율</b> 0.9448% → <b>0.9994%</b> (세대당 월평균 19,029원 → 20,129원, 1,100원 증가)</p>' +
      '<p><b>방문요양 1회</b> ' + P27.visit.map(function (v) { return v[0] + '분 ' + won(v[1]) + ' → ' + won(v[2]); }).join(' · ') + '</p>' +
      '<p><b>방문목욕</b></p><ul>' + P27.bath.map(function (b) { return '<li>' + b[0] + ': ' + won(b[1]) + ' → ' + won(b[2]) + '</li>'; }).join('') + '</ul>' +
      '<p><b>단기보호 1일</b></p><ul>' + P27.short.map(function (s) { return '<li>' + s[0] + ': ' + won(s[1]) + ' → ' + won(s[2]) + '</li>'; }).join('') + '</ul>' +
      '<p><b>주야간보호 6~8시간, 하루 본인부담 15% (2027 의결)</b></p><ul>' + P27.day68.map(function (s) { return '<li>' + s[0] + ': ' + won(s[1]) + '</li>'; }).join('') + '</ul>' +
      '<p class="hint">식사비 같은 비급여는 위 금액에 들어 있지 않아요. 감경 대상(40%·60%)의 2027년 금액은 발표 자료에 없어서, 이 계산기가 같은 비율로 계산한 값이에요. 2027년 수가는 보건복지부 고시로 공포돼야 최종 적용돼요. (2026년 11월 16일 현재 고시와 행정예고는 확인되지 않았어요.)</p>';
  }
}

/* ---------- 자주 묻는 질문 ---------- */
var QA = { items: [], cat: 'all', q: '' };
function qaNorm(s) { return String(s).toLowerCase().replace(/\s+/g, ''); }
function initFaq() {
  QA.items = F.items().map(function (it) {
    var text = it.a.join(' ').replace(/<[^>]+>/g, ' ');
    return { it: it, hay: qaNorm(it.q + ' ' + (it.kw || '') + ' ' + text) };
  });
  $('#qaList').innerHTML = QA.items.map(function (o, i) {
    var it = o.it;
    return '<details class="qa" data-i="' + i + '"><summary><span>' + it.q + '</span><em class="tagc">' + (F.tag[it.cat] || '') + '</em></summary><div class="ans">' + it.a.join('') +
      (it.go ? '<button type="button" class="qa-go" data-href="' + it.go.href + '">' + it.go.label + '</button>' : '') + '</div></details>';
  }).join('') + '<p class="qa-empty" id="qaEmpty" hidden>찾는 질문이 없어요. 다른 단어로 찾아 보세요.</p>';
  $('#qaCats').innerHTML = F.cats.map(function (c) {
    var n = c.k === 'all' ? QA.items.length : QA.items.filter(function (o) { return o.it.cat === c.k; }).length;
    return '<button type="button" class="chip" data-k="' + c.k + '" aria-pressed="' + (c.k === 'all') + '">' + c.t + '<small>' + n + '</small></button>';
  }).join('');
  $('#qaQuick').innerHTML = F.words.map(function (w) { return '<button type="button" class="kw" data-w="' + w + '" aria-pressed="false">' + w + '</button>'; }).join('');

  $('#qaCats').addEventListener('click', function (e) { var b = e.target.closest('.chip'); if (!b) return; QA.cat = b.dataset.k; qaFilter(); });
  $('#qaQuick').addEventListener('click', function (e) {
    var b = e.target.closest('.kw'); if (!b) return;
    QA.q = QA.q === b.dataset.w ? '' : b.dataset.w; $('#qaSearch').value = QA.q; qaFilter();
  });
  $('#qaSearch').addEventListener('input', function () { QA.q = this.value; qaFilter(); });
  $('#qaList').addEventListener('click', function (e) {
    var go = e.target.closest('.qa-go');
    if (go) { var t = $(go.dataset.href); if (t) t.scrollIntoView({ behavior: REDUCE ? 'auto' : 'smooth', block: 'start' }); }
  });
  $('#qaList').addEventListener('toggle', function (e) {
    var d = e.target; if (!d.open) return;
    $$('details.qa[open]', $('#qaList')).forEach(function (x) { if (x !== d) x.open = false; });
  }, true);
}
function qaFilter() {
  var tokens = QA.q.split(/\s+/).map(qaNorm).filter(Boolean), shown = 0;
  $$('details.qa').forEach(function (d, i) {
    var o = QA.items[i];
    var ok = (QA.cat === 'all' || o.it.cat === QA.cat) && tokens.every(function (t) { return o.hay.indexOf(t) >= 0; });
    d.hidden = !ok; if (ok) shown++; else d.open = false;
  });
  $$('#qaCats .chip').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.k === QA.cat ? 'true' : 'false'); });
  $$('#qaQuick .kw').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.w === QA.q ? 'true' : 'false'); });
  $('#qaEmpty').hidden = shown > 0;
  $('#qaCount').textContent = (tokens.length || QA.cat !== 'all') ? QA.items.length + '개 중 ' + shown + '개를 찾았어요.' : '';
}

/* ---------- 결과 보내기 · 처음부터 ---------- */
function toast(msg) {
  var t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove('show'); }, 2600);
}
function resultText() {
  var R = L.calc(S, S.mode), g = gradeOf(S.grade);
  if (R.unavailable) return '[부모님 장기요양 한 달 예상 비용]\n' + g.name + ': ' + R.unavailable;
  var lines = ['[부모님 장기요양 한 달 예상 비용]', g.name + ', ' + R.rate.label, MODE_NAMES[S.mode] + ' · ' + R.cond, '예상 금액: ' + won(R.total), '(' + R.parts + ')'];
  if (S.mode === 0 && !R.empty) {
    var a = L.copy(S), b = L.copy(S); a.day.meal = 'lunch'; b.day.meal = 'both';
    lines.push('식사: 점심만 ' + won(L.calcDay(a).total) + ', 점심·저녁 ' + won(L.calcDay(b).total));
  }
  if (S.mode !== 1) lines.push('※ 식비·간식비 등 공단 지원이 없는 항목은 센터마다 달라요.');
  lines.push('※ ' + DATA.year + '년 국민건강보험공단 수가로 계산한 예상액이에요.');
  if (/^https?:/.test(location.protocol)) lines.push('계산해 보기: ' + location.origin + location.pathname);
  return lines.join('\n');
}
function copyText(t) {
  return new Promise(function (resolve) {
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = t; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;left:-9999px;top:0;font-size:16px';
      document.body.appendChild(ta); ta.select();
      try { ta.setSelectionRange(0, t.length); } catch (e) {}
      var ok = false; try { ok = document.execCommand('copy'); } catch (e) {}
      document.body.removeChild(ta); resolve(ok);
    }
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(t).then(function () { resolve(true); }, fallback);
    else fallback();
  });
}
function copyOrShow(t) {
  copyText(t).then(function (ok) {
    var box = $('#copyBox');
    if (ok) { box.hidden = true; toast('결과 글을 복사했어요. 카카오톡에 붙여 넣어 보내세요.'); }
    else { box.hidden = false; $('#copyTa').value = t; $('#copyTa').focus(); $('#copyTa').select(); toast('자동 복사가 안 돼요. 아래 글을 길게 눌러 복사해 주세요.'); }
  });
}
function shareResult() {
  var t = resultText();
  if (navigator.share) navigator.share({ text: t }).catch(function (e) { if (!e || e.name !== 'AbortError') copyOrShow(t); });
  else copyOrShow(t);
}
function resetAll() {
  S = L.defaults(); lastTotal = null; shown = 0;
  $('#copyBox').hidden = true;
  update();
  window.scrollTo({ top: 0, behavior: REDUCE ? 'auto' : 'smooth' });
  toast('처음 값으로 돌렸어요.');
}

/* ---------- 아래 떠 있는 금액 바 ---------- */
function initDock() {
  var dock = $('#dock');
  $('#dock-btn').addEventListener('click', function () { $('#detail').scrollIntoView({ behavior: REDUCE ? 'auto' : 'smooth', block: 'start' }); });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) {
      var vis = es[0].isIntersecting;
      dock.classList.toggle('hide', vis); dock.setAttribute('aria-hidden', vis ? 'true' : 'false');
      $('#dock-btn').tabIndex = vis ? -1 : 0;
    }).observe($('#hero'));
  } else { dock.classList.remove('hide'); dock.setAttribute('aria-hidden', 'false'); $('#dock-btn').tabIndex = 0; }
}

/* ---------- 홈 화면에 앱으로 추가 ---------- */
function initInstall() {
  var standalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
  if (standalone) return;
  var box = $('#installBox'), btn = $('#installBtn'), txt = $('#installTxt'), ua = navigator.userAgent || '', deferred = null;
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferred = e; box.hidden = false; btn.hidden = false; });
  btn.addEventListener('click', function () {
    if (!deferred) return;
    deferred.prompt();
    deferred.userChoice.then(function () { deferred = null; btn.hidden = true; box.hidden = true; });
  });
  window.addEventListener('appinstalled', function () { box.hidden = true; toast('홈 화면에 추가했어요.'); });
  if (/KAKAOTALK/i.test(ua)) { box.hidden = false; txt.textContent = '카카오톡 안에서는 홈 화면 추가가 안 돼요. 크롬이나 사파리로 다시 열어 주세요.'; }
  else if (/iPad|iPhone|iPod/.test(ua)) { box.hidden = false; txt.textContent = '사파리 아래 공유 버튼을 누르고 “홈 화면에 추가”를 고르면 앱처럼 쓸 수 있어요.'; }
}

/* ---------- 배경음악 (외부 음원 없이 직접 연주, 기본 꺼짐) ---------- */
var Music = (function () {
  var ctx = null, master = null, on = false, timer = 0, step = 0, nextT = 0;
  var EIGHTH = 0.62;
  var CHORDS = [[48, 55, 60, 64, 71], [45, 52, 57, 60, 67], [41, 48, 53, 57, 64], [43, 50, 55, 59, 62]];
  var MELODY = [76, 0, 74, 0, 72, 0, 74, 0, 79, 0, 76, 0, 72, 0, 71, 0, 69, 0, 72, 0, 76, 0, 74, 0, 67, 0, 71, 0, 74, 0, 72, 0];
  var ARP = [0, 1, 2, 3, 2, 1, 4, 1];
  function hz(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function note(m, t, dur, vol) {
    var o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), g2 = ctx.createGain();
    o1.type = 'triangle'; o2.type = 'sine';
    o1.frequency.value = hz(m); o2.frequency.value = hz(m) * 2;
    g2.gain.value = 0.22;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o1.connect(g); o2.connect(g2); g2.connect(g); g.connect(master);
    o1.start(t); o2.start(t); o1.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
  }
  function playStep(s, t) {
    var bar = Math.floor(s / 8) % CHORDS.length, ch = CHORDS[bar], i = s % 8;
    note(ch[ARP[i]], t, 2.4, i === 0 ? 0.2 : 0.12);
    var mel = MELODY[s % MELODY.length];
    if (mel) note(mel, t, 2.2, 0.1);
  }
  function sched() {
    while (nextT < ctx.currentTime + 1.6) { playStep(step, nextT); nextT += EIGHTH; step++; }
    timer = setTimeout(sched, 300);
  }
  function start() {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { toast('이 휴대폰에서는 음악을 켤 수 없어요.'); return false; }
    if (!ctx) { ctx = new AC(); master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination); }
    ctx.resume(); step = 0; nextT = ctx.currentTime + 0.15; on = true; sched(); return true;
  }
  function stop() { on = false; clearTimeout(timer); if (ctx) ctx.suspend(); }
  function pauseHidden() { if (on && ctx) { clearTimeout(timer); ctx.suspend(); } }
  function resumeVisible() { if (on && ctx) { ctx.resume(); nextT = ctx.currentTime + 0.15; clearTimeout(timer); sched(); } }
  document.addEventListener('visibilitychange', function () { if (document.hidden) pauseHidden(); else resumeVisible(); });
  window.addEventListener('pagehide', pauseHidden);
  return { toggle: function () { if (on) stop(); else if (!start()) return false; return on; } };
})();
function initMusic() {
  var btn = $('#musicBtn');
  btn.addEventListener('click', function () {
    var on = Music.toggle();
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    var label = on ? '배경음악 끄기' : '배경음악 켜기';
    btn.setAttribute('aria-label', label); btn.title = label;
    toast(on ? '배경음악을 켰어요.' : '배경음악을 껐어요.');
  });
}

/* ---------- 한 번에 다시 그리기 ---------- */
function update() {
  sanitize();
  renderChips(); renderTabs(); syncInputs(); updateQuick();
  renderResult(); renderSums(); renderCompare(); render2027();
  save();
}

/* ---------- 시작 ---------- */
initSteppers(); initMoney(); initQuick(); initTabs(); initFaq(); initDock(); initInstall(); initMusic();
$('#v-with').addEventListener('click', function () { S.day.withVisit = !S.day.withVisit; update(); });
$('#btn-reset').addEventListener('click', resetAll);
$('#btn-share').addEventListener('click', shareResult);
update();

/* 오프라인에서도 열리게 저장해 두는 서비스 워커 */
if ('serviceWorker' in navigator && /^https?:/.test(location.protocol)) {
  window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
}
window.__care = { S: function () { return S; }, update: update };
})();
