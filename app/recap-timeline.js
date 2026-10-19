/*
 * TravelLink AI recap timeline — 回顧短片的「推薦版時間軸」（clips）。
 * 格式照 docs/travel-story/TRAVEL_STORY_MEDIA_AI_PLAN.md 6.3：
 *   { schemaVersion, locale, revision, templateId, clips: [{ clipId, order, type, ... durationMs }] }
 * type：cover（開場）、route（站間路線）、photo（到站照片）、timeline（換日轉場）、outro（旅程數據）。
 *
 * 推薦版用「規則」產生，不呼叫 AI；時長由 recap-manifest.js 依樣板計算，
 * 所以清單上的秒數就是實際渲染的秒數。compileTimeline 把（之後可被使用者編輯的）時間軸
 * 轉回 manifest 的參數，後端一律重新驗證、夾住每段時長，不信任前端數字。
 * 相依：recap-manifest.js（Node 自動 require；瀏覽器需先載入 recap-templates.js、recap-manifest.js）。
 */
(function (root, factory) {
  var manifest = null;
  if (typeof module === 'object' && module.exports) {
    manifest = require('./recap-manifest.js');
    module.exports = factory(manifest);
  } else {
    root.WAI_RECAP_TIMELINE = factory(root.WAI_RECAP_MANIFEST || null);
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function (MANIFEST) {
  'use strict';

  var SCHEMA_VERSION = 1;

  // 每種片段可接受的時長範圍（ms）：編輯器與後端共用同一組限制
  var LIMITS = {
    cover: [1000, 6000],
    route: [300, 15000],
    photo: [800, 8000],
    timeline: [600, 4000],
    outro: [1000, 6000]
  };

  function clampMs(type, value) {
    var range = LIMITS[type] || [0, 60000];
    var n = Math.round(Number(value) || 0);
    return Math.max(range[0], Math.min(range[1], n));
  }

  function photoStopIndices(photos, stopCount) {
    var seen = {};
    var out = [];
    (Array.isArray(photos) ? photos : []).forEach(function (p) {
      var idx = Number(p && p.stopIndex);
      if (!isFinite(idx) || idx < 0 || idx >= stopCount || seen[idx]) return;
      seen[idx] = true;
      out.push(idx);
    });
    return out.sort(function (a, b) { return a - b; });
  }

  // 依行程＋實際照片排出推薦版。opts：{ templateId, photos: [{ stopIndex, url?, photoId? }] }
  function buildRecommendedTimeline(trip, opts) {
    if (!MANIFEST) throw new Error('recap-manifest.js not loaded');
    var options = opts || {};
    var stops = Array.isArray(trip && trip.stops) ? trip.stops : [];
    var photos = Array.isArray(options.photos) ? options.photos : [];
    var mediaIdx = photoStopIndices(photos, stops.length);
    var m = MANIFEST.buildRecapManifest(trip, {
      template: options.templateId,
      mediaCount: mediaIdx.length,
      mediaStopIndices: mediaIdx
    });
    var tl = m.timeline;
    var photoByStop = {};
    photos.forEach(function (p) { if (p && photoByStop[p.stopIndex] === undefined) photoByStop[p.stopIndex] = p; });
    var clips = [];
    function push(clip) { clip.order = clips.length; clips.push(clip); }
    function photoClip(stopIndex) {
      var p = photoByStop[stopIndex] || {};
      var stop = stops[stopIndex] || {};
      var ref = { kind: 'memory_photo', stopId: String(stop.stopId || '') };
      if (p.photoId) ref.photoId = String(p.photoId);
      push({ clipId: 'photo-' + stopIndex, type: 'photo', stopIndex: stopIndex, label: stop.name || '', assetRef: ref, durationMs: Math.round(tl.holdMs[stopIndex]) });
    }

    push({ clipId: 'cover', type: 'cover', style: m.cover.style, durationMs: Math.round(tl.coverMs) });
    if (tl.holdMs[0] > 0 && mediaIdx.indexOf(0) >= 0) photoClip(0);
    m.segments.forEach(function (seg, i) {
      var to = stops[seg.toIndex] || {};
      if (seg.dayBreak) {
        push({ clipId: 'day-' + seg.toDay, type: 'timeline', day: seg.toDay, durationMs: Math.round(seg.travelMs) });
      } else {
        var from = stops[seg.fromIndex] || {};
        push({
          clipId: 'route-' + i, type: 'route', segmentIndex: i,
          fromStopId: String(from.stopId || ''), toStopId: String(to.stopId || ''),
          label: (from.name || '') + ' → ' + (to.name || ''),
          distanceKm: Math.round(seg.geoDistanceKm * 10) / 10,
          durationMs: Math.round(seg.travelMs)
        });
      }
      if (mediaIdx.indexOf(seg.toIndex) >= 0) photoClip(seg.toIndex);
    });
    push({
      clipId: 'outro', type: 'outro',
      stats: { stops: Math.max(0, stops.length - 1), distanceKm: Number(trip && trip.distanceKm) || 0, days: m.trip.dayCount },
      durationMs: Math.round(tl.statsMs)
    });

    return {
      schemaVersion: SCHEMA_VERSION,
      locale: 'zh-TW',
      revision: 0,
      templateId: m.template.id,
      adaptiveTier: m.adaptiveTier,
      totalMs: Math.round(tl.totalMs),
      clips: clips
    };
  }

  // 時間軸 → buildRecapManifest 的參數。只採用能對回這趟行程的片段，時長一律夾在 LIMITS 內；
  // 站與站的順序以行程為準（之後的編輯器只能改時長、刪照片片段，不能讓路線跳站）。
  function compileTimeline(trip, timeline, photos) {
    var stops = Array.isArray(trip && trip.stops) ? trip.stops : [];
    var clips = Array.isArray(timeline && timeline.clips) ? timeline.clips : [];
    var available = photoStopIndices(photos, stops.length);
    var segmentMs = [];
    var holdMsByStop = [];
    var mediaStopIndices = [];
    var coverMs;
    var statsMs;
    var idIndex = {};
    stops.forEach(function (s, i) { idIndex[String(s.stopId || '')] = i; });

    clips.forEach(function (c) {
      if (!c || typeof c !== 'object') return;
      if (c.type === 'cover') coverMs = clampMs('cover', c.durationMs);
      else if (c.type === 'outro') statsMs = clampMs('outro', c.durationMs);
      else if (c.type === 'route') {
        var from = idIndex[String(c.fromStopId || '')];
        var to = idIndex[String(c.toStopId || '')];
        if (from === undefined || to !== from + 1) return;
        segmentMs[from] = clampMs('route', c.durationMs);
      } else if (c.type === 'photo') {
        var stopIdx = idIndex[String(c.assetRef && c.assetRef.stopId || '')];
        if (stopIdx === undefined || available.indexOf(stopIdx) < 0 || mediaStopIndices.indexOf(stopIdx) >= 0) return;
        mediaStopIndices.push(stopIdx);
        holdMsByStop[stopIdx] = clampMs('photo', c.durationMs);
      }
    });
    mediaStopIndices.sort(function (a, b) { return a - b; });
    var out = {
      template: timeline && timeline.templateId,
      mediaCount: mediaStopIndices.length,
      mediaStopIndices: mediaStopIndices,
      segmentMs: segmentMs,
      holdMsByStop: holdMsByStop
    };
    if (coverMs !== undefined) out.coverMs = coverMs;
    if (statsMs !== undefined) out.statsMs = statsMs;
    return out;
  }

  // 給畫面顯示的片段清單：[{ icon, text, seconds }]
  function summarizeTimeline(timeline) {
    var ICON = { cover: '🎬', route: '🚗', photo: '📷', timeline: '🌙', outro: '📊' };
    var rows = (timeline && timeline.clips || []).map(function (c) {
      var text = c.type === 'cover' ? (c.style === 'photoCut' ? '開場：實景照片硬切到地圖' : '開場：台灣全景俯衝到路線')
        : c.type === 'route' ? c.label + (c.distanceKm ? '（' + c.distanceKm + ' km）' : '')
        : c.type === 'photo' ? '照片：' + c.label
        : c.type === 'timeline' ? '換日：第 ' + c.day + ' 天'
        : '結尾：旅程數據';
      return { type: c.type, icon: ICON[c.type] || '•', text: text, seconds: Math.round(c.durationMs / 100) / 10 };
    });
    return { rows: rows, totalSeconds: Math.round((timeline && timeline.totalMs || 0) / 100) / 10 };
  }

  return {
    SCHEMA_VERSION: SCHEMA_VERSION,
    LIMITS: LIMITS,
    buildRecommendedTimeline: buildRecommendedTimeline,
    compileTimeline: compileTimeline,
    summarizeTimeline: summarizeTimeline
  };
}));
