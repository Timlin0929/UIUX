// 景點配對稽核：用實際的判斷函式跑完 poi-data 所有景點，列出會被當成同一處的配對。
// 不呼叫任何 API。更新景點資料或調整合併規則後重跑，比對新增的配對是否合理。
//
//   node tools/pair-audit.js [輸出.csv]
//
// 不確定的配對請查證後，把結果寫進 app/big-attraction-config.js。
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const app = path.resolve(__dirname, '..', 'app');
const output = process.argv[2] || path.resolve(process.cwd(), 'pair-audit.csv');

const stub = () => new Proxy(function () {}, {
  get: (t, k) => (k === Symbol.toPrimitive ? () => '' : stub()),
  apply: () => stub(),
  construct: () => stub()
});
const quiet = { info() {}, warn() {}, log() {}, error: console.error };
const ctx = {
  console: quiet, setTimeout, clearTimeout, Math, Date, JSON, Promise, Map, Set, URLSearchParams,
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  sessionStorage: { getItem: () => null, setItem() {} },
  document: stub(), navigator: { userAgent: '' }, location: { search: '', hostname: 'x', href: '' },
  addEventListener() {}, fetch: () => Promise.reject(new Error('offline'))
};
ctx.window = ctx;
vm.createContext(ctx);
for (const file of ['restaurant-data.js', 'poi-data.js', 'business-hours.js', 'osm-boundary-data.js', 'big-attraction-config.js', 'ai-travel-explore-final.js']) {
  vm.runInContext(fs.readFileSync(path.join(app, file), 'utf8'), ctx);
}
const cluster = vm.runInContext('shouldClusterStops', ctx);
const family = vm.runInContext('isSameAttractionFamily', ctx);
const visitorCenter = vm.runInContext('isVisitorCenterOf', ctx);
const list = ctx.window.WAI_BIG_ATTRACTIONS;

const seen = new Map();
Object.keys(ctx.window.WAI_POI_DATA).forEach((key) => {
  const bucket = ctx.window.WAI_POI_DATA[key];
  if (!Array.isArray(bucket)) return;
  bucket.forEach((p) => {
    if (p && p.name && Number.isFinite(Number(p.lat)) && !seen.has(p.name)) {
      seen.set(p.name, { name: p.name, lat: Number(p.lat), lng: Number(p.lng), area: p.district || key, emoji: p.emoji, tag: p.tag });
    }
  });
});
const pois = [...seen.values()];

const km = (a, b) => {
  const rad = (x) => (x * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
};

const rows = [['規則', '依據', '鄉鎮', 'A', 'B', '距離km', '需要人工看']];
const tally = {};
const add = (rule, reason, a, b, d, check) => {
  rows.push([rule, reason, a.area, a.name, b.name, d.toFixed(2), check ? '是' : '']);
  tally[rule] = tally[rule] || { 總數: 0, 需要人工看: 0 };
  tally[rule].總數 += 1;
  if (check) tally[rule].需要人工看 += 1;
};

for (let i = 0; i < pois.length; i++) {
  for (let j = i + 1; j < pois.length; j++) {
    const a = pois[i], b = pois[j];
    const d = km(a, b);
    if (visitorCenter(a.name, b.name) || visitorCenter(b.name, a.name)) add('遊客中心', '名稱', a, b, d, d > 2);
    if (cluster(a, b, true)) {
      const byFamily = family(a, b);
      // 名稱相關卻相距超過 1 公里，或清單判定卻距離很遠，都可能是座標或名稱有問題
      add('生成合併', byFamily ? '名稱相關' : '人工清單', a, b, d, d > 1);
    } else if (d <= 0.05) {
      add('座標幾乎重疊但不合併', '只提醒', a, b, d, true);
    }
  }
}
pois.forEach((p) => {
  const hit = list.classify(p.name, p);
  if (hit && !hit.isSelf) add('導向大景點', hit.parent.name, p, { name: hit.parent.name }, 0, false);
});

fs.writeFileSync(output, '﻿' + rows.map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\r\n'));
process.stdout.write(`景點 ${pois.length} 個\n${JSON.stringify(tally, null, 2)}\n已輸出 ${output}\n`);
