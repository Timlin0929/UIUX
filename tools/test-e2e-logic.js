/*
 * E2E 修正的純邏輯測試（不需 Firebase／Maps／瀏覽器／登入）。
 *
 * 為什麼要有這支：先前修 E2E issue 時只跑 `node --check`（僅驗語法），
 * 行為錯誤全靠事後審查才發現。這支把「可以在 Node 跑」的那部分邏輯抽出來實測：
 *   1. 營業時間／公休判斷（含多日第 N 天）——用 app/restaurant-data.js 真實資料
 *   2. 生成末端的公休過濾會不會造成「空白天」與「時間空檔」
 *   3. 本機行程帳號鍵與訪客搬移（含換帳號、無 Firebase 情境）
 *
 * 用法：node tools/test-e2e-logic.js
 * 退出碼非 0 代表有測試失敗。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const APP = path.join(__dirname, '..', 'app');
const SRC = fs.readFileSync(path.join(APP, 'ai-travel-explore-final.js'), 'utf8');

// ── 從原始檔抽出具名函式（大括號配對，忽略字串/註解中的括號）──────────────
function extractFunction(src, name) {
  const re = new RegExp('(?:^|\\n)\\s*function\\s+' + name + '\\s*\\(', 'g');
  const m = re.exec(src);
  if (!m) throw new Error('找不到函式：' + name);
  const start = src.indexOf('function', m.index);
  let i = src.indexOf('{', start);
  if (i < 0) throw new Error('函式無主體：' + name);
  let depth = 0, inStr = null, inLine = false, inBlock = false, prev = '';
  for (; i < src.length; i++) {
    const c = src[i];
    if (inLine) { if (c === '\n') inLine = false; prev = c; continue; }
    if (inBlock) { if (prev === '*' && c === '/') inBlock = false; prev = c; continue; }
    if (inStr) {
      if (c === '\\') { i++; prev = ''; continue; }
      if (c === inStr) inStr = null;
      prev = c; continue;
    }
    if (c === '/' && src[i + 1] === '/') { inLine = true; i++; prev = ''; continue; }
    if (c === '/' && src[i + 1] === '*') { inBlock = true; i++; prev = ''; continue; }
    if (c === '"' || c === "'" || c === '`') { inStr = c; prev = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
    prev = c;
  }
  throw new Error('大括號未配對：' + name);
}

// ── 沙箱：提供最小 stub，讓抽出來的函式能跑 ────────────────────────────
function makeSandbox(extra) {
  const store = Object.create(null);
  const localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    _dump: () => JSON.parse(JSON.stringify(store)),
    _reset: () => { for (const k of Object.keys(store)) delete store[k]; }
  };
  const ctx = Object.assign({
    localStorage,
    currentUser: null,
    console,
    JSON, Math, Number, String, Boolean, Array, Object, Date, RegExp, Set, Map, isNaN, parseInt, parseFloat,
    serializeTripForStorage: (t) => t,   // 測試用：不改形狀
    // 真實依賴：解析器必須是 app 內同一支，否則測到的是 fallback 而不是實際路徑
    WAI_HOURS: require(path.join(__dirname, '..', 'app', 'business-hours.js')),
    escapeHtml: (s) => String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
  }, extra || {});
  vm.createContext(ctx);
  return ctx;
}

// 這些函式依賴的模組級常數，必須一併注入沙箱，否則呼叫時 ReferenceError
const CONSTS = ['FOOD_EMOJI_SET', 'FOOD_NAME_RE', 'LODGING_NAME_RE'];
const FNS = ['parseBusinessHoursWindow', 'stopServiceDate', 'extractDayHoursWindow', 'isFoodStop', 'isLodgingStop',
  'myTripsStorageKey', 'migrateGuestTripsToUser'];
const ctx = makeSandbox();
CONSTS.forEach((n) => {
  const m = new RegExp('^const\\s+' + n + '\\s*=[^;]+;', 'm').exec(SRC);
  if (!m) throw new Error('找不到常數：' + n);
  vm.runInContext(m[0], ctx);
});
FNS.forEach((n) => vm.runInContext(extractFunction(SRC, n), ctx));

// ── 迷你測試框架 ───────────────────────────────────────────────
let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; failures.push(name + (detail ? ' → ' + detail : '')); console.log('  ✗ ' + name + (detail ? ' → ' + detail : '')); }
}
function section(t) { console.log('\n── ' + t + ' ─────────────────────────'); }

// ── 真實餐廳資料 ──────────────────────────────────────────────
function loadRestaurants() {
  const c = { window: {} };
  vm.createContext(c);
  vm.runInContext(fs.readFileSync(path.join(APP, 'restaurant-data.js'), 'utf8'), c);
  const d = c.window.WAI_RESTAURANT_DATA || {};
  let all = [];
  Object.keys(d).filter((k) => Array.isArray(d[k])).forEach((k) => { all = all.concat(d[k]); });
  return all;
}
const RESTAURANTS = loadRestaurants();
const dow = (iso) => ['日', '一', '二', '三', '四', '五', '六'][new Date(iso + 'T00:00:00').getDay()];
// 以「本地時間」格式化，不能用 toISOString（UTC+8 會倒退一天，造成假不一致）
const isoLocal = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

// ══════════════════════════════════════════════════════════════
section('1. 公休判斷（真實 restaurant-data.js）');

const withHours = RESTAURANTS.filter((r) => r.businessHours);
check('真實資料皆為 7 段', withHours.every((r) => r.businessHours.split(/\r?\n|；|;/).map(s => s.trim()).filter(Boolean).length === 7),
  '段數不一致');

// 針對每一筆有公休的餐廳，逐日檢查「函式判定」與「資料字面」是否一致
let mismatch = 0, checkedDays = 0;
const base = '2026-08-31'; // 星期一
withHours.forEach((r) => {
  const lines = r.businessHours.split('\n');
  for (let i = 0; i < 7; i++) {
    const d = new Date(base + 'T00:00:00'); d.setDate(d.getDate() + i);
    const iso = isoLocal(d);
    const win = ctx.extractDayHoursWindow(r.businessHours, iso);
    const lineSaysClosed = /休息|closed|不營業/i.test(lines[i]);
    const fnSaysClosed = !!(win && win.closed);
    checkedDays++;
    if (lineSaysClosed !== fnSaysClosed) { mismatch++; if (mismatch <= 3) console.log('    mismatch:', r.name, iso, 'line=', lines[i], 'fn=', JSON.stringify(win)); }
  }
});
check('逐日公休判定與資料字面一致（' + checkedDays + ' 天次）', mismatch === 0, mismatch + ' 筆不一致');

// 報告點名的個案
const onlySea = RESTAURANTS.find((r) => /只有海/.test(r.name || ''));
check('找得到報告點名的「只有海」', !!onlySea);
if (onlySea) {
  const testDate = '2026-09-01';
  const w = ctx.extractDayHoursWindow(onlySea.businessHours, testDate);
  console.log('    2026-09-01 是星期' + dow(testDate) + '；資料公休日=星期三');
  check('2026-09-01（星期' + dow(testDate) + '）判定為「未公休」符合資料', !(w && w.closed),
    '函式判定 closed=' + !!(w && w.closed));
  const wed = ctx.extractDayHoursWindow(onlySea.businessHours, '2026-09-02');
  check('2026-09-02（星期' + dow('2026-09-02') + '）判定為公休', !!(wed && wed.closed));
}

// ══════════════════════════════════════════════════════════════
section('2. stopServiceDate：多日第 N 天');
check('第 1 天 = 出發日', ctx.stopServiceDate({ dayIndex: 1 }, { departureDate: '2026-09-01' }) === '2026-09-01');
check('第 2 天 = 出發日+1', ctx.stopServiceDate({ dayIndex: 2 }, { departureDate: '2026-09-01' }) === '2026-09-02');
check('第 3 天 = 出發日+2', ctx.stopServiceDate({ dayIndex: 3 }, { departureDate: '2026-09-01' }) === '2026-09-03');
check('跨月 2026-08-31 第 2 天 = 2026-09-01', ctx.stopServiceDate({ dayIndex: 2 }, { departureDate: '2026-08-31' }) === '2026-09-01');
check('缺 dayIndex → 退回第 1 天', ctx.stopServiceDate({}, { departureDate: '2026-09-01' }) === '2026-09-01');
check('缺 departureDate → 空字串', ctx.stopServiceDate({ dayIndex: 2 }, {}) === '');

// ══════════════════════════════════════════════════════════════
section('3. 生成末端公休過濾：空白天 / 時間空檔 / 刪過頭');

// 注意：這是 app 末端公休處理的鏡像。它與 app 本尊分歧時測試會失去意義，
// 因此下方 section 6 有一致性守門（比對 app 原始碼仍是「標記」而非「刪站」）。
function markClosed(finalStops, wizardData) {
  finalStops.forEach((s) => {
    if (!s || s.type === 'start' || s.type === 'end' || !s.businessHours) return;
    if (ctx.isLodgingStop(s)) return;
    const win = ctx.extractDayHoursWindow(s.businessHours, ctx.stopServiceDate(s, wizardData));
    if (win && win.closed) { s.scheduleWarning = 'closed_today'; s.closedOnDate = ctx.stopServiceDate(s, wizardData); }
  });
  return finalStops;
}
const CLOSED_WED = '星期一: 09:00 – 17:00\n星期二: 09:00 – 17:00\n星期三: 休息\n星期四: 09:00 – 17:00\n星期五: 09:00 – 17:00\n星期六: 09:00 – 17:00\n星期日: 09:00 – 17:00';

// 情境：2 天行程，第 2 天（2026-09-02 星期三）只有一個景點，且該景點週三公休
const twoDay = [
  { type: 'start', name: '出發', dayIndex: 1, time: '09:00' },
  { name: 'A景點', dayIndex: 1, time: '09:30', businessHours: CLOSED_WED },
  { name: 'B景點', dayIndex: 2, time: '10:00', businessHours: CLOSED_WED },
  { type: 'end', name: '返回', dayIndex: 2, time: '17:00' }
];
const wd = { departureDate: '2026-09-01' };
const after = markClosed(twoDay, wd);
const midAfter = after.filter((s) => s.type !== 'start' && s.type !== 'end');
const day2After = midAfter.filter((s) => s.dayIndex === 2);
check('第 2 天不會變成空白天（改標記後站數不變）', day2After.length > 0,
  '第 2 天剩 ' + day2After.length + ' 站');
check('當天公休的站有被標記', after.find((s) => s.name === 'B景點').scheduleWarning === 'closed_today');
check('非公休日的站不標記', !after.find((s) => s.name === 'A景點').scheduleWarning);

// 時間軸不被破壞（不刪站就不會有空檔）
const gapCase = [
  { type: 'start', name: '出發', dayIndex: 1, time: '09:00' },
  { name: '公休站', dayIndex: 1, time: '10:00', businessHours: CLOSED_WED },
  { name: '後面站', dayIndex: 1, time: '13:00' },
  { type: 'end', name: '返回', dayIndex: 1, time: '17:00' }
];
const gapAfter = markClosed(gapCase, { departureDate: '2026-09-02' }); // 星期三
check('站數不變、時間軸完整', gapAfter.length === 4 && gapAfter.find((s) => s.name === '後面站').time === '13:00');
check('公休站被標記而非移除', !!gapAfter.find((s) => s.name === '公休站' && s.scheduleWarning === 'closed_today'));

// 保護條件（不標記）
check('start/end 不標記', !markClosed([{ type: 'start', businessHours: CLOSED_WED }], { departureDate: '2026-09-02' })[0].scheduleWarning);
check('住宿站不標記', !markClosed([{ name: '綠島海景民宿', businessHours: CLOSED_WED }], { departureDate: '2026-09-02' })[0].scheduleWarning);
// 非「週一起 7 行」但 ≥5 段 → 以固定索引取行會對錯日子（雙向皆錯）
// 這筆只有「星期日」公休；2026-08-31 是星期一（應營業）、2026-09-06 是星期日（應公休）
const SUNDAY_FIRST = '星期日: 休息\n星期一: 09:00 – 17:00\n星期二: 09:00 – 17:00\n星期三: 09:00 – 17:00\n星期四: 09:00 – 17:00\n星期五: 09:00 – 17:00\n星期六: 09:00 – 17:00';
const monWin = ctx.extractDayHoursWindow(SUNDAY_FIRST, '2026-08-31'); // 星期一 → 應營業
check('週日起格式：星期一不得誤判為公休', !(monWin && monWin.closed),
  '取到 lines[0]=星期日:休息 → 星期一被誤判公休（會誤刪正常店）');
const sunWin = ctx.extractDayHoursWindow(SUNDAY_FIRST, '2026-09-06'); // 星期日 → 應公休
check('週日起格式：星期日應判為公休', !!(sunWin && sunWin.closed),
  '取到 lines[6]=星期六 → 真正公休日沒被抓到（漏掉公休店）');

// ══════════════════════════════════════════════════════════════
section('4. 本機行程帳號鍵與訪客搬移');
const L = ctx.localStorage;

L._reset(); ctx.currentUser = null;
check('未登入 → 訪客鍵', ctx.myTripsStorageKey() === 'wai_mytrips');
ctx.currentUser = { email: 'A@Example.com' };
check('登入 → 依 email 小寫隔離', ctx.myTripsStorageKey() === 'wai_mytrips:a@example.com');

// 換帳號不得看到前一帳號資料
L._reset();
L.setItem('wai_mytrips:a@example.com', JSON.stringify([{ id: 't-A' }]));
L.setItem('wai_mytrips:b@example.com', JSON.stringify([{ id: 't-B' }]));
ctx.currentUser = { email: 'b@example.com' };
const bSees = JSON.parse(L.getItem(ctx.myTripsStorageKey()) || '[]');
check('B 只看到自己的行程', bSees.length === 1 && bSees[0].id === 't-B');

// 訪客搬移：自己的搬走、別人的留下
L._reset();
L.setItem('wai_mytrips', JSON.stringify([
  { id: 'g1' },                                   // 無 owner → 視為自己的
  { id: 'g2', ownerEmail: 'b@example.com' },      // 自己的
  { id: 'g3', ownerEmail: 'other@example.com' }   // 別人的 → 不搬
]));
ctx.currentUser = { email: 'b@example.com' };
ctx.migrateGuestTripsToUser();
const mine = JSON.parse(L.getItem('wai_mytrips:b@example.com') || '[]').map((t) => t.id).sort();
const guestLeft = JSON.parse(L.getItem('wai_mytrips') || '[]').map((t) => t.id);
check('自己的訪客行程已搬入帳號鍵', JSON.stringify(mine) === JSON.stringify(['g1', 'g2']), JSON.stringify(mine));
check('別人的行程留在訪客鍵', JSON.stringify(guestLeft) === JSON.stringify(['g3']), JSON.stringify(guestLeft));

// 冪等：重複觸發（onAuthStateChanged 可能多次）
ctx.migrateGuestTripsToUser();
const mine2 = JSON.parse(L.getItem('wai_mytrips:b@example.com') || '[]').map((t) => t.id).sort();
check('重複搬移為冪等', JSON.stringify(mine2) === JSON.stringify(['g1', 'g2']), JSON.stringify(mine2));

// 未登入時不得搬移
L._reset();
L.setItem('wai_mytrips', JSON.stringify([{ id: 'g9' }]));
ctx.currentUser = null;
ctx.migrateGuestTripsToUser();
check('未登入不搬移', JSON.parse(L.getItem('wai_mytrips')).length === 1);

// 無 Firebase 情境：不會有 auth callback，loadState 會改用快取身分搬移（否則訪客行程等於消失）
L._reset();
L.setItem('wai_mytrips', JSON.stringify([{ id: 'guest-only' }]));
ctx.currentUser = { email: 'c@example.com' };
ctx.migrateGuestTripsToUser();   // 模擬 loadState 在 firebase 不可用時的呼叫
const cSees = JSON.parse(L.getItem(ctx.myTripsStorageKey()) || '[]');
check('無 Firebase 時訪客行程仍看得到', cSees.length === 1 && cSees[0].id === 'guest-only',
  JSON.stringify(cSees));

// ══════════════════════════════════════════════════════════════
section('5. 兩端同口徑：planner 的公休顯示 vs explore 的公休判定');
// planner 用 formatDayBusinessHours 顯示「🔴 當天公休」，explore 用 extractDayHoursWindow 判定。
// 同一家店、同一天，兩邊結論必須一致，否則畫面說公休、資料卻沒標（或反過來）。
const PSRC = fs.readFileSync(path.join(APP, 'ai-travel-planner-v8.js'), 'utf8');
const pctx = makeSandbox();
vm.runInContext(extractFunction(PSRC, 'formatDayBusinessHours'), pctx);

let crossMismatch = 0, crossChecked = 0;
withHours.forEach((r) => {
  for (let i = 0; i < 7; i++) {
    const d = new Date(base + 'T00:00:00'); d.setDate(d.getDate() + i);
    const iso = isoLocal(d);
    const win = ctx.extractDayHoursWindow(r.businessHours, iso);
    const shown = pctx.formatDayBusinessHours(r.businessHours, iso);
    const exploreClosed = !!(win && win.closed);
    const plannerClosed = shown.startsWith('🔴');
    crossChecked++;
    if (exploreClosed !== plannerClosed) {
      crossMismatch++;
      if (crossMismatch <= 3) console.log('    mismatch:', r.name, iso, 'explore=', exploreClosed, 'planner=', JSON.stringify(shown));
    }
  }
});
check('兩端公休結論一致（' + crossChecked + ' 天次）', crossMismatch === 0, crossMismatch + ' 筆不一致');

// 週日起格式：兩端都必須答對
check('週日起格式：planner 星期一不顯示公休', !pctx.formatDayBusinessHours(SUNDAY_FIRST, '2026-08-31').startsWith('🔴'));
check('週日起格式：planner 星期日顯示公休', pctx.formatDayBusinessHours(SUNDAY_FIRST, '2026-09-06').startsWith('🔴'));

// ══════════════════════════════════════════════════════════════
section('6. 共用解析器 business-hours.js（全站唯一來源）');
const H = require(path.join(APP, 'business-hours.js'));

// 區間標籤
const RANGE_CLOSED = '星期一至星期五: 休息\n星期六: 09:00 – 17:00\n星期日: 09:00 – 17:00';
check('區間標籤：星期二（區間內）判為公休', H.parseDayStatus(RANGE_CLOSED, '2026-09-01').status === 'closed',
  H.parseDayStatus(RANGE_CLOSED, '2026-09-01').status);
check('區間標籤：星期六（區間外）判為營業', H.parseDayStatus(RANGE_CLOSED, '2026-09-05').status === 'open');
check('區間標籤：週一~週五 寫法也支援',
  H.parseDayStatus('週一~週五: 休息\n週六: 09:00 – 17:00\n週日: 休息', '2026-09-02').status === 'closed');
check('跨週區間：週五至週一 涵蓋星期日',
  H.parseDayStatus('星期五至星期一: 休息', '2026-09-06').status === 'closed');

// 英文與縮寫
check('英文全名', H.parseDayStatus('Monday: Closed\nTuesday: 09:00 – 17:00', '2026-08-31').status === 'closed');
check('英文縮寫 Mon/Tue', H.parseDayStatus('Mon: Closed\nTue: 09:00 – 17:00', '2026-08-31').status === 'closed');
check('英文縮寫不誤判他日', H.parseDayStatus('Mon: Closed\nTue: 09:00 – 17:00', '2026-09-01').status === 'open');

// 有標籤但缺當天 → unknown（不臆測）
check('有標籤但缺當天 → unknown', H.parseDayStatus('星期日: 休息\n星期一: 09:00 – 17:00', '2026-09-02').status === 'unknown');
// 無標籤且非 7 段 → unknown
check('無標籤單行 → unknown', H.parseDayStatus('每日 09:00-18:00，週三休息', '2026-09-02').status === 'unknown');
// 無標籤但剛好 7 段 → 允許週一起推測
check('無標籤 7 段 → 週一起推測', H.parseDayStatus('休息\n09:00-17:00\n09:00-17:00\n09:00-17:00\n09:00-17:00\n09:00-17:00\n09:00-17:00', '2026-08-31').status === 'closed');
check('缺日期 → unknown', H.parseDayStatus('星期一: 休息', '').status === 'unknown');

// 真實資料仍全對
let sharedMismatch = 0;
withHours.forEach((r) => {
  const lines = r.businessHours.split('\n');
  for (let i = 0; i < 7; i++) {
    const d = new Date(base + 'T00:00:00'); d.setDate(d.getDate() + i);
    const st = H.parseDayStatus(r.businessHours, isoLocal(d));
    const lineClosed = /休息|closed|不營業/i.test(lines[i]);
    if (lineClosed !== (st.status === 'closed')) sharedMismatch++;
  }
});
check('共用解析器對真實資料 637 天次全對', sharedMismatch === 0, sharedMismatch + ' 筆不一致');

// 三處呼叫端都已委派給共用解析器（防止有人再寫第四份）
const ESRC = SRC, PSRC2 = fs.readFileSync(path.join(APP, 'ai-travel-planner-v8.js'), 'utf8');
check('explore extractDayHoursWindow 委派共用解析器', /extractDayHoursWindow[\s\S]{0,600}?WAI_HOURS/.test(ESRC));
check('planner formatDayBusinessHours 委派共用解析器', /formatDayBusinessHours[\s\S]{0,600}?WAI_HOURS/.test(PSRC2));
check('planner getBusinessHoursWarning 委派共用解析器', /getBusinessHoursWarning[\s\S]{0,600}?WAI_HOURS/.test(PSRC2));
check('已無殘留的 lines[apiIndex] 固定索引解析', !/const apiIndex[\s\S]{0,200}?lines\[apiIndex\]/.test(PSRC2));

// 末端處理必須是「標記」不是「刪站」（避免 app 改回刪站而測試仍綠）
check('app 末端仍為標記而非刪站', /scheduleWarning = 'closed_today'/.test(ESRC) && !/dropClosed/.test(ESRC));

// 無 Firebase 時不得清空訪客鍵（改為合併顯示）
check('無 Firebase 分支不呼叫不可逆搬移',
  !/typeof firebase === 'undefined' \|\| !firebaseEnabled\) migrateGuestTripsToUser/.test(ESRC));
check('無 Firebase 時改為合併顯示訪客行程', /合併顯示|guestTrips/.test(ESRC));

// formatDayBusinessHours 輸出需 escapeHtml（會進 innerHTML）
check('formatDayBusinessHours 輸出經 escapeHtml', /formatDayBusinessHours[\s\S]{0,800}?escapeHtml/.test(PSRC2));

// ══════════════════════════════════════════════════════════════
console.log('\n══════════════════════════════════════');
console.log('通過 ' + pass + '，失敗 ' + fail);
if (failures.length) {
  console.log('\n失敗項目：');
  failures.forEach((f, i) => console.log('  ' + (i + 1) + '. ' + f));
}
process.exit(fail ? 1 : 0);
