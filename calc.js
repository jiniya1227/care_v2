/* 부모님 장기요양 본인부담 계산 — 순수 계산 (화면과 상관없음)
   ★ 매년 1월 새 고시가 나오면 아래 DATA 숫자만 바꾸세요. ★
   이용일수(숫자)를 넣으면 그대로 계산해요. 요일을 고르는 방식은 쓰지 않아요. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LTC = api;
})(typeof self !== 'undefined' ? self : this, function () {
'use strict';

var DATA = {
  year: 2026,
  weeksPerMonth: 4.35,
  // 주야간보호를 월 15일 이상(하루 8시간 이상) 이용하면 월 한도액을 아래 비율(%) 범위에서 더 산정 (고시 제13조).
  // 1·2등급 10%, 3~5등급 20% (판본마다 달라 확인 필요). 인지지원등급은 규정을 확인하지 못해 0(적용 안 함).
  limitBoost: { minDays: 15, minBand: 2, pct: { '1': 10, '2': 10, '3': 20, '4': 20, '5': 20, 'c': 0 } },
  // 등급별 재가급여 월 한도액 · 주야간보호 1일 급여비용(3~6 / 6~8 / 8~10 시간)
  grades: [
    { key: '1', name: '1등급',        limit: 2512900, fac: '1', day: [41820, 56060, 69730] },
    { key: '2', name: '2등급',        limit: 2331200, fac: '2', day: [38720, 51930, 64590] },
    { key: '3', name: '3등급',        limit: 1528200, fac: '3', day: [35740, 47940, 59640] },
    { key: '4', name: '4등급',        limit: 1409700, fac: '3', day: [34120, 46300, 58010] },
    { key: '5', name: '5등급',        limit: 1208900, fac: '3', day: [32490, 44650, 56360] },
    { key: 'c', name: '인지지원등급', limit: 676320,  fac: null, day: [32490, 44650, 56360] }
  ],
  bands: ['3~6시간', '6~8시간', '8~10시간'],
  // 방문요양 1회 급여비용 (분 → 원). 150·180분은 모든 등급, 210·240분은 1·2등급만 선택할 수 있어요.
  visit: { 150: 50640, 180: 57020, 210: 63530, 240: 70080 },
  visitLongFrom: 210, visitLongGrades: ['1', '2'],
  // 시설급여 1일 비용 ('3'은 3~5등급)
  facility: {
    home:  { '1': 93070, '2': 86340, '3': 81540 },
    group: { '1': 74590, '2': 69210, '3': 63800 }
  },
  // 본인부담률(%) — home: 재가(주야간보호·방문요양), fac: 시설(요양원)
  rates: {
    general: { label: '일반',          home: 15, fac: 20 },
    r40:     { label: '감경 40%',      home: 9,  fac: 12 },
    r60:     { label: '감경 60%',      home: 6,  fac: 8 },
    free:    { label: '의료급여 면제', home: 0,  fac: 0 }
  },
  surcharge: { dayHoliday: 30, visitSun: 30, visitHoliday: 50 },   // 가산율(%)
  defaults: { meal: 3500, snack: 1500 }
};

var MODE_NAMES = ['주야간보호', '방문요양', '요양원'];
var ROOM_NAMES = { multi: '다인실', double: '2인실', single: '1인실' };
var FTYPE_NAMES = { home: '요양원', group: '노인요양공동생활가정' };
// 이용일수를 한 번에 넣는 버튼 (월~금은 22일, 월~토는 25일로 고정, 나머지는 주 횟수 × 4.35 반올림)
var QUICK_DAYS = [{ label: '월~금', n: 22 }, { label: '월~토', n: 25 }, { label: '주 3회', n: 13 }, { label: '주 2회', n: 9 }, { label: '주 1회', n: 4 }];

function fmt(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
function won(n) { return fmt(n) + '원'; }
function num(v) { v = Math.floor(Number(String(v).replace(/[^\d]/g, '')) || 0); return v > 0 ? v : 0; }
function clamp(v, lo, hi) { v = num(v); return Math.max(lo, Math.min(hi, v)); }
function monthCount(n, D) { return Math.round(n * (D || DATA).weeksPerMonth); }
function gradeOf(k, D) { D = D || DATA; for (var i = 0; i < D.grades.length; i++) if (D.grades[i].key === String(k)) return D.grades[i]; return D.grades[3]; }
function rateOf(k, D) { D = D || DATA; return D.rates[k] || D.rates.general; }
function minLabel(m) { return m < 60 ? m + '분' : Math.floor(m / 60) + '시간' + (m % 60 ? ' ' + (m % 60) + '분' : ''); }
function surUnit(unit, pct) { return Math.floor(unit * (100 + pct) / 100); }
function copy(o) { return JSON.parse(JSON.stringify(o)); }
function visitAllowed(gKey, m, D) { D = D || DATA; return m < D.visitLongFrom || D.visitLongGrades.indexOf(String(gKey)) >= 0; }

function defaults() {
  return {
    mode: 0, grade: '4', reduce: 'general',
    day: {
      band: 2, wk: 25, hol: 0, meal: 'both', mealPrice: DATA.defaults.meal, snack: DATA.defaults.snack, boost: true,
      withVisit: false, visit: { minutes: 180, wk: 8, sun: 0, hol: 0 }
    },
    visit: { minutes: 180, wk: 22, sun: 0, hol: 0 },
    fac: { type: 'home', days: 30, room: 'multi', roomExtra: 0, meal: DATA.defaults.meal, snack: DATA.defaults.snack, beauty: 0 }
  };
}

/* 재가 공통 마무리: 한도 안 금액에 본인부담률을 곱하고(10원 미만 버림), 한도를 넘은 금액은 전부 본인 */
function finishHome(G, L, ratePct) {
  var covered = Math.min(G, L);
  return { burden: Math.floor(covered * ratePct / 1000) * 10, excess: Math.max(0, G - L), covered: covered };
}

/* 방문요양 금액 (일요일 30%, 공휴일 50% 가산) */
function visitPart(gKey, v, D) {
  var m = visitAllowed(gKey, v.minutes, D) ? v.minutes : 180;       // 3시간 30분 이상은 1·2등급만
  var unit = D.visit[m];
  var sunU = surUnit(unit, D.surcharge.visitSun), holU = surUnit(unit, D.surcharge.visitHoliday);
  var wk = clamp(v.wk, 0, 31), sun = clamp(v.sun, 0, 31), hol = clamp(v.hol, 0, 31);
  return { minutes: m, fixed: m !== v.minutes, unit: unit, sunU: sunU, holU: holU, wk: wk, sun: sun, hol: hol,
    G: wk * unit + sun * sunU + hol * holU, count: wk + sun + hol };
}

function calcDay(S, D) {
  D = D || DATA;
  var g = gradeOf(S.grade, D), d = S.day, rate = rateOf(S.reduce, D);
  var wk = clamp(d.wk, 0, 31), hol = clamp(d.hol, 0, 31), days = wk + hol;
  var wkU = g.day[d.band], holU = surUnit(wkU, D.surcharge.dayHoliday);
  var dayG = wk * wkU + hol * holU, G = dayG;
  var rows = [];
  rows.push({ label: '평일·토요일 ' + wk + '일', sub: D.bands[d.band] + ' · 하루 ' + won(wkU), amt: wk * wkU, cls: wk ? '' : 'zero' });
  if (hol) rows.push({ label: '일요일·공휴일 ' + hol + '일', sub: '30% 가산 · 하루 ' + won(holU), amt: hol * holU });
  var vis = null;
  if (d.withVisit && g.key !== 'c') {
    vis = visitPart(g.key, d.visit, D);
    G += vis.G;
    rows.push({ k: 'sub', label: '주야간보호 소계', amt: dayG });
    rows.push({ label: '+ 방문요양 ' + vis.count + '회', sub: minLabel(vis.minutes) + ' · 1회 ' + won(vis.unit) + ' (일요일·공휴일 가산 포함)', amt: vis.G, cls: vis.count ? '' : 'zero' });
  }
  var boostPct = D.limitBoost.pct[g.key] || 0;
  var longDays = d.band >= D.limitBoost.minBand ? days : 0;
  var boost = (d.boost !== false && boostPct && longDays >= D.limitBoost.minDays) ? Math.floor(g.limit * boostPct / 100) : 0;
  var L = g.limit + boost;
  var fin = finishHome(G, L, rate.home);
  var mealN = d.meal === 'both' ? 2 : 1;
  var mealCost = num(d.mealPrice) * mealN * days, snackCost = num(d.snack) * days, nonCov = mealCost + snackCost;
  rows.push({ k: 'sum', label: '급여비용 합계', amt: G });
  rows.push({ label: '월 한도액 (' + g.name + ')', amt: g.limit });
  if (boost) rows.push({ label: '한도액 증액 (' + boostPct + '% 범위)', sub: '월 15일 이상 · 하루 8시간 이상 이용', amt: boost });
  rows.push({ label: '급여 본인부담 (' + rate.home + '%)', sub: '한도 안 금액 × ' + rate.home + '%, 10원 미만 버림', amt: fin.burden, cls: fin.burden ? '' : 'zero' });
  rows.push({ label: '한도 초과분', sub: '한도를 넘은 부분은 전액 본인', amt: fin.excess, cls: fin.excess ? 'over' : 'zero' });
  rows.push({ k: 'head', label: '공단 지원이 없는 항목' });
  rows.push({ label: (mealN === 2 ? '점심·저녁 ' : '점심 ') + won(num(d.mealPrice)) + ' × ' + mealN + '끼 × ' + days + '일', amt: mealCost, cls: mealCost ? '' : 'zero' });
  rows.push({ label: '간식비 ' + won(num(d.snack)) + ' × ' + days + '일', amt: snackCost, cls: snackCost ? '' : 'zero' });
  var total = fin.burden + fin.excess + nonCov;
  rows.push({ k: 'total', label: '이번 달 내실 금액', amt: total });
  return {
    mode: 0, g: g, G: G, L: L, boost: boost, boostPct: boostPct, dayG: dayG, vis: vis, rate: rate,
    burden: fin.burden, excess: fin.excess, nonCov: nonCov, other: 0, total: total, rows: rows, days: days, empty: days === 0,
    cond: g.name + ' · ' + rate.label + ' · ' + D.bands[d.band] + ' · ' + days + '일' + (vis ? ' + 방문요양 ' + vis.count + '회' : ''),
    parts: '급여 본인부담 ' + won(fin.burden) + (fin.excess ? ' + 한도 초과 ' + won(fin.excess) : '') + ' + 식비·간식 ' + won(nonCov)
  };
}

function calcVisit(S, D) {
  D = D || DATA;
  var g = gradeOf(S.grade, D), rate = rateOf(S.reduce, D);
  if (g.key === 'c') return { mode: 1, unavailable: '인지지원등급은 방문요양을 이용할 수 없어요' };
  var vc = visitPart(g.key, S.visit, D), G = vc.G;
  var fin = finishHome(G, g.limit, rate.home);
  var rows = [];
  rows.push({ label: '평일·토요일 ' + vc.wk + '일', sub: minLabel(vc.minutes) + ' · 1회 ' + won(vc.unit), amt: vc.wk * vc.unit, cls: vc.wk ? '' : 'zero' });
  if (vc.sun) rows.push({ label: '일요일 ' + vc.sun + '일', sub: '30% 가산 · 1회 ' + won(vc.sunU), amt: vc.sun * vc.sunU });
  if (vc.hol) rows.push({ label: '공휴일 ' + vc.hol + '일', sub: '50% 가산 · 1회 ' + won(vc.holU), amt: vc.hol * vc.holU });
  rows.push({ k: 'sum', label: '급여비용 합계', amt: G });
  rows.push({ label: '월 한도액 (' + g.name + ')', amt: g.limit });
  rows.push({ label: '급여 본인부담 (' + rate.home + '%)', sub: '한도 안 금액 × ' + rate.home + '%, 10원 미만 버림', amt: fin.burden, cls: fin.burden ? '' : 'zero' });
  rows.push({ label: '한도 초과분', sub: '한도를 넘은 부분은 전액 본인', amt: fin.excess, cls: fin.excess ? 'over' : 'zero' });
  var total = fin.burden + fin.excess;
  rows.push({ k: 'total', label: '이번 달 내실 금액', amt: total });
  return {
    mode: 1, g: g, G: G, L: g.limit, boost: 0, rate: rate, burden: fin.burden, excess: fin.excess, nonCov: 0, other: 0, total: total,
    rows: rows, days: vc.count, empty: vc.count === 0, fixed: vc.fixed,
    cond: g.name + ' · ' + rate.label + ' · ' + minLabel(vc.minutes) + ' · ' + vc.count + '일',
    parts: '급여 본인부담 ' + won(fin.burden) + (fin.excess ? ' + 한도 초과 ' + won(fin.excess) : '')
  };
}

function calcFac(S, D) {
  D = D || DATA;
  var g = gradeOf(S.grade, D), f = S.fac, rate = rateOf(S.reduce, D);
  if (!g.fac) return { mode: 2, unavailable: '인지지원등급은 요양원에 입소할 수 없어요' };
  var days = clamp(f.days, 1, 31);
  var daily = D.facility[f.type][g.fac], base = daily * days;
  var burden = Math.floor(base * rate.fac / 1000) * 10;
  var mealCost = num(f.meal) * 3 * days, snackCost = num(f.snack) * days;
  var roomCost = f.room === 'multi' ? 0 : num(f.roomExtra) * days, beauty = num(f.beauty);
  var nonCov = mealCost + snackCost, other = roomCost + beauty;
  var rows = [
    { label: '급여비용 ' + won(daily) + ' × ' + days + '일', sub: FTYPE_NAMES[f.type] + ' · ' + g.name, amt: base },
    { label: '급여 본인부담 (' + rate.fac + '%)', sub: '급여비용 × ' + rate.fac + '%, 10원 미만 버림', amt: burden, cls: burden ? '' : 'zero' },
    { k: 'head', label: '공단 지원이 없는 항목' },
    { label: '식재료비 ' + won(num(f.meal)) + ' × 3끼 × ' + days + '일', amt: mealCost, cls: mealCost ? '' : 'zero' },
    { label: '간식비 ' + won(num(f.snack)) + ' × ' + days + '일', amt: snackCost, cls: snackCost ? '' : 'zero' }
  ];
  if (roomCost) rows.push({ label: ROOM_NAMES[f.room] + ' 추가 ' + won(num(f.roomExtra)) + ' × ' + days + '일', amt: roomCost });
  if (beauty) rows.push({ label: '이·미용비 (한 달)', amt: beauty });
  var total = burden + nonCov + other;
  rows.push({ k: 'total', label: '이번 달 내실 금액', amt: total });
  return {
    mode: 2, g: g, G: base, L: 0, boost: 0, rate: rate, burden: burden, excess: 0, nonCov: nonCov, other: other, total: total,
    rows: rows, days: days, empty: false, low35: g.fac === '3',
    cond: g.name + ' · ' + rate.label + ' · ' + FTYPE_NAMES[f.type] + ' ' + ROOM_NAMES[f.room] + ' · ' + days + '일',
    parts: '급여 본인부담 ' + won(burden) + ' + 식비·간식 ' + won(nonCov) + (other ? ' + 방 추가·이미용비 ' + won(other) : '')
  };
}

function calc(S, mode, D) { return mode === 0 ? calcDay(S, D) : mode === 1 ? calcVisit(S, D) : calcFac(S, D); }
/* 본인부담 구분(감경)만 바꿔서 계산 */
function calcWith(S, mode, reduceKey) { var T = {}; for (var k in S) T[k] = S[k]; T.reduce = reduceKey; return calc(T, mode); }

/* ---- 주야간보호 + 방문요양 합산: 남는 한도로 방문요양을 몇 회까지 쓸 수 있나 ---- */
function weekHint(maxN, D) {
  for (var k = 7; k >= 1; k--) if (monthCount(k, D) <= maxN) return k;
  return 0;
}
function remain(S, D) {
  D = D || DATA;
  var g = gradeOf(S.grade, D);
  if (g.key === 'c') return null;
  var R = calcDay(S, D);
  if (R.empty) return null;
  var m = visitAllowed(g.key, S.day.visit.minutes, D) ? S.day.visit.minutes : 180;
  var unit = D.visit[m], rem = R.L - R.dayG;
  var count = rem > 0 ? Math.floor(rem / unit) : 0;
  return { rem: rem, unit: unit, minutes: m, count: count, perWeek: weekHint(count, D) };
}

/* ---------- 2027년 의결 수가 미리보기 (고시 공포 전) ----------
   2026년 10월 장기요양위원회에서 의결된 2027년 수가예요. 보건복지부 고시가 나오기 전이라 달라질 수 있어요.
   자료가 있는 조건(주야간보호 8~10시간, 방문요양 3시간·4시간, 요양원)만 비교해요. */
function makeData2027() {
  var d = copy(DATA);
  var lim = { '1': 2891400, '2': 2682300, '3': 1586300, '4': 1462000, '5': 1254900, 'c': 700200 };
  var day8 = { '1': 72190, '2': 66870, '3': 61750, '4': 60060, '5': 58350, 'c': 58350 };
  d.grades.forEach(function (g) { g.limit = lim[g.key]; g.day[2] = day8[g.key]; });
  d.visit[180] = 59190; d.visit[240] = 72740;
  d.facility.home = { '1': 96380, '2': 89410, '3': 84440 };
  return d;
}
var D2027 = makeData2027();
function supports2027(S, mode) {
  if (mode === 0) return S.day.band === 2 && (!S.day.withVisit || [180, 240].indexOf(S.day.visit.minutes) >= 0);
  if (mode === 1) return [180, 240].indexOf(S.visit.minutes) >= 0;
  return S.fac.type === 'home';
}
function calc2027(S, mode) {
  if (!supports2027(S, mode)) return null;
  var R = calc(S, mode, D2027);
  return R.unavailable ? null : R;
}

return {
  DATA: DATA, D2027: D2027, MODE_NAMES: MODE_NAMES, ROOM_NAMES: ROOM_NAMES, FTYPE_NAMES: FTYPE_NAMES, QUICK_DAYS: QUICK_DAYS,
  fmt: fmt, won: won, num: num, clamp: clamp, monthCount: monthCount, gradeOf: gradeOf, rateOf: rateOf, minLabel: minLabel,
  surUnit: surUnit, copy: copy, visitAllowed: visitAllowed, defaults: defaults,
  calc: calc, calcWith: calcWith, calcDay: calcDay, calcVisit: calcVisit, calcFac: calcFac, remain: remain, weekHint: weekHint,
  supports2027: supports2027, calc2027: calc2027
};
});
