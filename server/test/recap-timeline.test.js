// 回顧短片：節奏樣板（app/recap-templates.js）、manifest 依樣板產時間軸（app/recap-manifest.js）、
// 推薦版時間軸（app/recap-timeline.js）與後端驗證（recap-jobs.js）的離線測試。
//   node test/recap-timeline.test.js
'use strict';
const path = require('path');
const TEMPLATES = require(path.join(__dirname, '..', '..', 'app', 'recap-templates.js'));
const MANIFEST = require(path.join(__dirname, '..', '..', 'app', 'recap-manifest.js'));
const TIMELINE = require(path.join(__dirname, '..', '..', 'app', 'recap-timeline.js'));
const JOBS = require(path.join(__dirname, '..', 'recap-jobs.js'))._internals;

let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (detail ? '\n      ' + detail : '')); }
};
const near = (a, b, tol = 2) => Math.abs(a - b) <= tol;

// 台東兩天：第 1 段只有 20 公尺（短程），第 3 段跨天
const trip = {
  title: '台東兩天', transportMode: 'car', distanceKm: 40,
  stops: [
    { stopId: 'a', name: '台東車站', lat: 22.7500, lng: 121.1400, dayIndex: 1 },
    { stopId: 'b', name: '鐵花村', lat: 22.7502, lng: 121.1401, dayIndex: 1 },
    { stopId: 'c', name: '森林公園', lat: 22.7700, lng: 121.1600, dayIndex: 1 },
    { stopId: 'd', name: '三仙台', lat: 23.1200, lng: 121.4000, dayIndex: 2 },
    { stopId: 'e', name: '都蘭', lat: 22.8800, lng: 121.2300, dayIndex: 2 }
  ]
};
const photos = [{ stopIndex: 1, url: 'https://x/1.jpg' }, { stopIndex: 3, url: 'https://x/3.jpg' }];
const mediaStopIndices = photos.map((p) => p.stopIndex);

// ── 樣板 ──
ok('四種樣板都在', ['standard', 'brisk', 'leisurely', 'cinematic'].every((id) => TEMPLATES.hasTemplate(id)));
ok('未知樣板退回標準', TEMPLATES.getTemplate('nope').id === 'standard');
ok('getTemplate 回傳副本（改了不影響下次）', (() => { const t = TEMPLATES.getTemplate('brisk'); t.coverMs = 1; return TEMPLATES.getTemplate('brisk').coverMs !== 1; })());

// ── manifest 依樣板 ──
const lengths = {};
['standard', 'brisk', 'leisurely', 'cinematic'].forEach((id) => {
  const m = MANIFEST.buildRecapManifest(trip, { template: id, mediaCount: 2, mediaStopIndices });
  const tpl = TEMPLATES.getTemplate(id);
  const driving = m.segments.filter((s) => !s.dayBreak).reduce((a, s) => a + s.travelMs, 0);
  const breaks = m.segments.filter((s) => s.dayBreak).reduce((a, s) => a + s.travelMs, 0);
  lengths[id] = m.timeline.totalMs;
  ok(`${id}：路線時間等於樣板目標（開車＋換日）`, near(driving + breaks, m.timeline.routeMs), `${driving}+${breaks} vs ${m.timeline.routeMs}`);
  ok(`${id}：每段開車至少 ${tpl.segment.minMs}ms`, m.segments.filter((s) => !s.dayBreak).every((s) => s.travelMs >= tpl.segment.minMs - 1));
  ok(`${id}：manifest 帶樣板 id`, m.template.id === id);
});
ok('快節奏 < 標準 < 慢遊', lengths.brisk < lengths.standard && lengths.standard < lengths.leisurely, JSON.stringify(lengths));

const cine = MANIFEST.buildRecapManifest(trip, { template: 'cinematic', mediaCount: 2, mediaStopIndices });
ok('電影感開場：有照片 → photoCut，用第一張有照片的站', cine.cover.style === 'photoCut' && cine.cover.photoStopIndex === 1);
ok('電影感開場：開場長度＝照片＋停半拍', cine.timeline.coverMs === cine.cover.photoMs + cine.cover.beatMs);
ok('電影感開場：路線等速（linear）', cine.template.segmentEase === 'linear');
const cineNoPhoto = MANIFEST.buildRecapManifest(trip, { template: 'cinematic', mediaCount: 0, mediaStopIndices: [] });
ok('電影感開場：沒有照片 → 退回標題卡開場', cineNoPhoto.cover.style === 'title');

// 站很多、路線時間不夠每段都給下限時，仍要依距離分配（不能每段一樣長）
const manyKm = [2.6, 0.8, 1, 0.6, 6.1, 6, 6.9, 0.9, 7.7, 2.9];
let lat = 22.04;
const manyStops = [{ stopId: 'm0', name: 'm0', lat, lng: 121.55 }];
manyKm.forEach((km, i) => { lat += km / 111; manyStops.push({ stopId: 'm' + (i + 1), name: 'm' + (i + 1), lat, lng: 121.55 }); });
const many = MANIFEST.buildRecapManifest({ title: 'many', stops: manyStops }, { template: 'standard' });
const longest = many.segments[8].travelMs, shortest = many.segments[3].travelMs;
ok('10 段：7.7 km 明顯比 0.6 km 長', longest > shortest * 2, `${longest} vs ${shortest}`);
ok('10 段：路線總時間仍等於目標', near(many.segments.reduce((a, s) => a + s.travelMs, 0), many.timeline.routeMs));

const legacy = MANIFEST.buildRecapManifest(trip, { coverMs: 1234, mediaCount: 0 });
ok('明確給的時間值優先於樣板', legacy.timeline.coverMs === 1234);

// ── 推薦版時間軸 ──
const tl = TIMELINE.buildRecommendedTimeline(trip, { templateId: 'standard', photos });
const types = tl.clips.map((c) => c.type).join(',');
ok('片段順序：開場 → 路線 → 照片 → … → 換日 → … → 結尾', types === 'cover,route,photo,route,timeline,photo,route,outro', types);
ok('片段 order 連號', tl.clips.every((c, i) => c.order === i));
ok('照片片段指到對的站', tl.clips.filter((c) => c.type === 'photo').map((c) => c.assetRef.stopId).join() === 'b,d');
ok('路線片段的起訖是相鄰兩站', tl.clips.filter((c) => c.type === 'route').every((c) => {
  const i = trip.stops.findIndex((s) => s.stopId === c.fromStopId);
  return trip.stops[i + 1] && trip.stops[i + 1].stopId === c.toStopId;
}));
const compiled = MANIFEST.buildRecapManifest(trip, TIMELINE.compileTimeline(trip, tl, photos));
ok('推薦版 compile 回 manifest，總長一致', near(compiled.timeline.totalMs, tl.totalMs), `${compiled.timeline.totalMs} vs ${tl.totalMs}`);
const sum = TIMELINE.summarizeTimeline(tl);
ok('清單總秒數＝時間軸總長', near(sum.totalSeconds * 1000, tl.totalMs, 60));

// 編輯過的時間軸：拉長一段路線、刪掉一張照片
const edited = JSON.parse(JSON.stringify(tl));
edited.clips.find((c) => c.type === 'route' && c.toStopId === 'c').durationMs = 4000;
edited.clips = edited.clips.filter((c) => !(c.type === 'photo' && c.assetRef.stopId === 'd'));
const eo = TIMELINE.compileTimeline(trip, edited, photos);
ok('編輯：指定的路線時長被採用', eo.segmentMs[1] === 4000);
ok('編輯：刪掉的照片不再出現', eo.mediaStopIndices.join() === '1');

// 不可信的輸入
const bad = TIMELINE.compileTimeline(trip, {
  templateId: 'nope',
  clips: [
    { type: 'route', fromStopId: 'a', toStopId: 'c', durationMs: 3000 },   // 跳站
    { type: 'route', fromStopId: 'a', toStopId: 'b', durationMs: 999999 }, // 超長
    { type: 'photo', assetRef: { stopId: 'c' }, durationMs: 3000 },         // 這站沒有照片
    { type: 'photo', assetRef: { stopId: 'b' }, durationMs: 1 },            // 太短
    { type: 'cover', durationMs: -5 }
  ]
}, photos);
ok('跳站的路線片段被忽略', bad.segmentMs[0] === TIMELINE.LIMITS.route[1] && bad.segmentMs.length === 1);
ok('沒有照片的站不能放照片片段', bad.mediaStopIndices.join() === '1');
ok('時長被夾在範圍內', bad.holdMsByStop[1] === TIMELINE.LIMITS.photo[0] && bad.coverMs === TIMELINE.LIMITS.cover[0]);

// ── 後端 ──
const sTrip = JOBS.sanitizeTrip(trip);
const sPhotos = JOBS.sanitizePhotos(photos, sTrip.stops.length);
const viaTimeline = JOBS.buildManifest(sTrip, JOBS.resolveManifestOptions(sTrip, sPhotos, 'brisk', TIMELINE.buildRecommendedTimeline(sTrip, { templateId: 'brisk', photos: sPhotos })));
const direct = JOBS.buildManifest(sTrip, JOBS.resolveManifestOptions(sTrip, sPhotos, 'brisk', null));
ok('後端：送時間軸與只送樣板，結果相同', near(viaTimeline.timeline.totalMs, direct.timeline.totalMs));
ok('後端：舊版請求（沒有樣板欄位）用標準樣板', JOBS.buildManifest(sTrip, JOBS.resolveManifestOptions(sTrip, sPhotos)).template.id === 'standard');
ok('後端：不認得的樣板 id 改用標準', JOBS.resolveManifestOptions(sTrip, sPhotos, '<script>', null).template === 'standard');
let rejected = false;
try { JOBS.resolveManifestOptions(sTrip, sPhotos, 'standard', { clips: 'x' }); } catch (e) { rejected = e.status === 400; }
ok('後端：格式錯誤的時間軸回 400', rejected);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
