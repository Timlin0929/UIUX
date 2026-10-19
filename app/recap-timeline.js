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

  // 字幕：每則最多 14 個字（計劃 6.4），去掉換行與控制字元；空字串＝沒有字幕
  var CAPTION_MAX = 14;
  var CAPTION_TYPES = { cover: true, route: true, photo: true, outro: true };

  function sanitizeCaption(value) {
    var text = String(value == null ? '' : value)
      .replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return Array.from(text).slice(0, CAPTION_MAX).join('');
  }

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
      return { clipId: c.clipId, type: c.type, icon: ICON[c.type] || '•', text: text, caption: c.caption || '', seconds: Math.round(c.durationMs / 100) / 10 };
    });
    return { rows: rows, totalSeconds: Math.round((timeline && timeline.totalMs || 0) / 100) / 10 };
  }

  // 時間軸 → manifest.captions（字幕軌：[{ startMs, endMs, text }]）。時間依 manifest 實際排出的時間軸計算，
  // 不信任片段上的任何時間值；只接受能對回這趟行程的片段與 CAPTION_TYPES 裡的類型。
  function attachCaptions(manifest, timeline) {
    var clips = Array.isArray(timeline && timeline.clips) ? timeline.clips : [];
    var tl = manifest.timeline;
    var stops = manifest.stops || [];
    var idIndex = {};
    stops.forEach(function (st, i) { idIndex[String(st.stopId || '')] = i; });
    var depart = tl.arriveMs.map(function (a, i) { return a + (tl.holdMs[i] || 0); });
    var out = [];
    clips.forEach(function (c) {
      if (!c || !CAPTION_TYPES[c.type]) return;
      var text = sanitizeCaption(c.caption);
      if (!text) return;
      var start, end;
      if (c.type === 'cover') { start = 0; end = tl.coverMs; }
      else if (c.type === 'outro') { start = tl.totalMs - tl.statsMs; end = tl.totalMs; }
      else if (c.type === 'route') {
        var from = idIndex[String(c.fromStopId || '')];
        var to = idIndex[String(c.toStopId || '')];
        if (from === undefined || to !== from + 1) return;
        start = depart[from]; end = tl.arriveMs[to];
      } else {
        var s = idIndex[String(c.assetRef && c.assetRef.stopId || '')];
        if (s === undefined || !(tl.holdMs[s] > 0)) return;
        if (!(manifest.media || []).some(function (m) { return m.stopIndex === s; })) return;
        start = tl.arriveMs[s]; end = start + tl.holdMs[s];
      }
      if (end - start >= 300) out.push({ startMs: Math.round(start), endMs: Math.round(end), text: text });
    });
    out.sort(function (a, b) { return a.startMs - b.startMs; });
    manifest.captions = out.slice(0, 80);
    return manifest;
  }

  // ── 編輯器用的純函式（都回傳新的時間軸，不改原物件，方便「一步復原」）──
  function cloneTimeline(timeline) { return JSON.parse(JSON.stringify(timeline)); }

  function setClipDuration(timeline, clipId, durationMs) {
    var next = cloneTimeline(timeline);
    next.clips.forEach(function (c) { if (c.clipId === clipId) c.durationMs = clampMs(c.type, durationMs); });
    next.edited = true;
    return next;
  }

  function setClipCaption(timeline, clipId, caption) {
    var next = cloneTimeline(timeline);
    next.clips.forEach(function (c) {
      if (c.clipId !== clipId || !CAPTION_TYPES[c.type]) return;
      var text = sanitizeCaption(caption);
      if (text) c.caption = text; else delete c.caption;
    });
    next.edited = true;
    return next;
  }

  // 只能移除照片片段（路線與開場結尾是影片骨架，拿掉會讓地圖跳站）
  function removePhotoClip(timeline, clipId) {
    var next = cloneTimeline(timeline);
    next.clips = next.clips.filter(function (c) { return !(c.clipId === clipId && c.type === 'photo'); });
    next.clips.forEach(function (c, i) { c.order = i; });
    next.edited = true;
    return next;
  }

  // AI 劇本建議 → 新時間軸：只填字幕、調整照片片段的長短；不新增片段、不改順序。
  // suggestion：{ cover, outro, clips: { [clipId]: { caption, emphasis: 'long'|'normal'|'short' } } }
  // opts.keepExisting：使用者已經打好的字幕不覆蓋（只填空白的）
  function applyScriptSuggestion(timeline, suggestion, opts) {
    var keepExisting = !!(opts && opts.keepExisting);
    var next = cloneTimeline(timeline);
    var s = suggestion && typeof suggestion === 'object' ? suggestion : {};
    var byClip = s.clips && typeof s.clips === 'object' ? s.clips : {};
    var FACTOR = { long: 1.35, normal: 1, short: 0.75 };
    next.clips.forEach(function (c) {
      var sug = c.type === 'cover' ? { caption: s.cover } : c.type === 'outro' ? { caption: s.outro } : byClip[c.clipId];
      if (!sug || typeof sug !== 'object') return;
      if (CAPTION_TYPES[c.type] && !(keepExisting && c.caption)) {
        var text = sanitizeCaption(sug.caption);
        if (text) c.caption = text;
      }
      if (c.type === 'photo' && FACTOR[sug.emphasis]) c.durationMs = clampMs('photo', c.durationMs * FACTOR[sug.emphasis]);
    });
    next.edited = true;
    next.scriptSource = 'ai';
    return next;
  }

  // 依目前片段重新算總長（與後端同一套 manifest 計算）
  function timelineTotalMs(trip, timeline, photos) {
    if (!MANIFEST) return Number(timeline && timeline.totalMs) || 0;
    return Math.round(MANIFEST.buildRecapManifest(trip, compileTimeline(trip, timeline, photos)).timeline.totalMs);
  }

  return {
    SCHEMA_VERSION: SCHEMA_VERSION,
    LIMITS: LIMITS,
    CAPTION_MAX: CAPTION_MAX,
    sanitizeCaption: sanitizeCaption,
    attachCaptions: attachCaptions,
    setClipDuration: setClipDuration,
    setClipCaption: setClipCaption,
    removePhotoClip: removePhotoClip,
    applyScriptSuggestion: applyScriptSuggestion,
    timelineTotalMs: timelineTotalMs,
    buildRecommendedTimeline: buildRecommendedTimeline,
    compileTimeline: compileTimeline,
    summarizeTimeline: summarizeTimeline
  };
}));
