/*
 * TravelLink AI recap manifest builder.
 * This file intentionally has no runtime dependencies so it can be loaded by
 * a plain browser <script> tag as well as by Node.js.
 */
(function (root, factory) {
  var templates = null;
  if (typeof module === 'object' && module.exports) {
    try { templates = require('./recap-templates.js'); } catch (e) { templates = null; }
    module.exports = factory(templates);
  } else {
    root.WAI_RECAP_MANIFEST = factory(root.WAI_RECAP_TEMPLATES || null);
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function (TEMPLATES) {
  'use strict';

  // 沒載入 recap-templates.js 時（例如舊的無頭渲染頁）用這組，數值等於「標準」樣板
  var FALLBACK_TEMPLATE = {
    id: 'standard', label: '標準',
    coverMs: 3400, statsMs: 3000, dwellMs: 200, photoMs: 2600, dayTransitionMs: 1600,
    targetMs: { '0': 14500, '1-2': 18000, '3-5': 23000, '6+': 32000 },
    minRouteMs: 6000,
    segment: { minMs: 900, maxShare: 0.45, ease: 'smooth' },
    cover: { style: 'title' }
  };

  function resolveTemplate(value) {
    if (value && typeof value === 'object') return value;
    if (TEMPLATES && typeof TEMPLATES.getTemplate === 'function') return TEMPLATES.getTemplate(value);
    return FALLBACK_TEMPLATE;
  }

  var EARTH_RADIUS_KM = 6371;

  function haversineKm(lat1, lng1, lat2, lng2) {
    var toRadians = Math.PI / 180;
    var deltaLat = (Number(lat2) - Number(lat1)) * toRadians;
    var deltaLng = (Number(lng2) - Number(lng1)) * toRadians;
    var startLat = Number(lat1) * toRadians;
    var endLat = Number(lat2) * toRadians;
    var sinLat = Math.sin(deltaLat / 2);
    var sinLng = Math.sin(deltaLng / 2);
    var a = sinLat * sinLat + Math.cos(startLat) * Math.cos(endLat) * sinLng * sinLng;
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return EARTH_RADIUS_KM * c;
  }

  function optionOrDefault(options, key, defaultValue) {
    return options[key] === undefined ? defaultValue : options[key];
  }

  // 片長目標依真實素材數分四級（樣板決定每級的秒數）；素材不足就縮短，不用假畫面補長度
  function getAdaptiveSettings(mediaCount, coverMs, statsMs, template) {
    var tier = mediaCount === 0 ? '0' : (mediaCount <= 2 ? '1-2' : (mediaCount <= 5 ? '3-5' : '6+'));
    var targets = (template && template.targetMs) || FALLBACK_TEMPLATE.targetMs;
    var targetMs = Number(targets[tier]) || FALLBACK_TEMPLATE.targetMs[tier];
    var minRouteMs = Number(template && template.minRouteMs) || FALLBACK_TEMPLATE.minRouteMs;

    return {
      tier: tier,
      routeMs: Math.max(minRouteMs, targetMs - coverMs - statsMs)
    };
  }

  // 站間路線時間：依距離比例分配，但每段至少 minMs、最多 maxMs（再把多出／不足的時間分給其他段）。
  // 純依距離時，200 公尺的短程只有幾十毫秒、看不清楚，一段長途又會吃掉整支影片。
  function allocateSegmentMs(distances, indices, totalMs, segmentCfg) {
    var out = {};
    var count = indices.length;
    if (!count) return out;
    // 站多時（例如 10 段只有 8 秒）下限會吃光全部時間、每段變成一樣長 → 下限最多取平均的 60%，仍依距離分配
    var minMs = Math.min(Math.max(0, Number(segmentCfg && segmentCfg.minMs) || 0), (totalMs / count) * 0.6);
    var maxShare = Number(segmentCfg && segmentCfg.maxShare) || 1;
    var maxMs = Math.max(minMs, totalMs * maxShare, totalMs / count);
    var fixed = {};
    var round;
    for (round = 0; round <= count; round += 1) {
      var remaining = totalMs;
      var free = [];
      var freeDist = 0;
      indices.forEach(function (i) {
        if (fixed[i] !== undefined) remaining -= fixed[i];
        else { free.push(i); freeDist += distances[i]; }
      });
      if (!free.length) break;
      var changed = false;
      free.forEach(function (i) {
        var v = freeDist > 0 ? remaining * (distances[i] / freeDist) : remaining / free.length;
        if (v < minMs) { fixed[i] = minMs; changed = true; }
        else if (v > maxMs) { fixed[i] = maxMs; changed = true; }
        else out[i] = v;
      });
      if (!changed) break;
      free.forEach(function (i) { delete out[i]; });
    }
    indices.forEach(function (i) { if (fixed[i] !== undefined) out[i] = fixed[i]; });
    // 每段都卡在下限或上限時，總和可能不到 totalMs → 剩下的時間按比例加回各段，片長才符合樣板
    var sum = indices.reduce(function (acc, i) { return acc + out[i]; }, 0);
    if (sum > 0 && sum < totalMs - 1) {
      var scale = totalMs / sum;
      indices.forEach(function (i) { out[i] *= scale; });
    }
    return out;
  }

  function calculateDayCount(stops) {
    var dayCount = 1;
    var i;
    var value;

    for (i = 0; i < stops.length; i += 1) {
      value = Number(stops[i].dayIndex);
      if (isFinite(value)) {
        dayCount = Math.max(dayCount, value);
      }
    }

    return dayCount;
  }

  function copyStop(stop, index) {
    return {
      index: index,
      stopId: stop.stopId,
      name: stop.name,
      lat: stop.lat,
      lng: stop.lng,
      mode: stop.mode,
      stayMin: stop.stayMin,
      dayIndex: stop.dayIndex
    };
  }

  // opts.template：樣板 id 或樣板物件；opts 裡明確給的時間值（coverMs、photoMs…）優先於樣板。
  // opts.segmentMs[i]：第 i 段路線的時長（由推薦時間軸 compile 而來，覆蓋距離分配）
  // opts.holdMsByStop[i]：第 i 站的停留時長（照片片段的秒數）
  function buildRecapManifest(trip, opts) {
    var options = opts || {};
    var template = resolveTemplate(options.template);
    var sourceStops = Array.isArray(trip.stops) ? trip.stops : [];
    var mediaIndicesIn = Array.isArray(options.mediaStopIndices) ? options.mediaStopIndices : [];
    // 電影感開場需要一張實景照片；沒有照片就退回標題卡開場
    var coverCfg = template.cover || { style: 'title' };
    var usePhotoCut = coverCfg.style === 'photoCut' && mediaIndicesIn.length > 0;
    var coverMs = optionOrDefault(options, 'coverMs',
      usePhotoCut ? (Number(coverCfg.photoMs) || 1430) + (Number(coverCfg.beatMs) || 320) : template.coverMs);
    var statsMs = optionOrDefault(options, 'statsMs', template.statsMs);
    var dwellMs = optionOrDefault(options, 'dwellMs', template.dwellMs);
    var mediaCount = optionOrDefault(options, 'mediaCount', 0);
    var adaptive = getAdaptiveSettings(mediaCount, coverMs, statsMs, template);
    var routeMs = options.routeMs === null || options.routeMs === undefined
      ? adaptive.routeMs
      : options.routeMs;
    var stops = [];
    var segments = [];
    var distances = [];
    var totalDistance = 0;
    var arriveMs = [];
    var subtitles = [];
    var currentMs;
    var i;
    var distance;
    var travelMs;
    var lastStopIndex = sourceStops.length - 1;

    for (i = 0; i < sourceStops.length; i += 1) {
      stops.push(copyStop(sourceStops[i], i));
    }

    for (i = 0; i < sourceStops.length - 1; i += 1) {
      distance = haversineKm(
        sourceStops[i].lat,
        sourceStops[i].lng,
        sourceStops[i + 1].lat,
        sourceStops[i + 1].lng
      );
      distances.push(distance);
      totalDistance += distance;
    }

    // 多日行程：跨天段（前後站 dayIndex 不同）不算「開車」，改成固定時長的「換日轉場」，
    // 且不參與 routeMs 的距離分配 —— 否則跨天長跳會吃掉全片最長動畫、還畫出一條沒開過的連線。
    var dayTransitionMs = optionOrDefault(options, 'dayTransitionMs', template.dayTransitionMs);
    var breakFlags = [];
    var drivingDistance = 0;
    for (i = 0; i < distances.length; i += 1) {
      var isBreak = Number(sourceStops[i].dayIndex || 1) !== Number(sourceStops[i + 1].dayIndex || 1);
      breakFlags.push(isBreak);
      if (!isBreak) drivingDistance += distances[i];
    }
    var breakCount = breakFlags.filter(function (b) { return b; }).length;
    var drivingMs = Math.max(3000, routeMs - breakCount * dayTransitionMs);
    var drivingIndices = [];
    for (i = 0; i < distances.length; i += 1) { if (!breakFlags[i]) drivingIndices.push(i); }
    var allocated = allocateSegmentMs(distances, drivingIndices, drivingMs, template.segment);
    var segmentMsIn = Array.isArray(options.segmentMs) ? options.segmentMs : null;

    for (i = 0; i < distances.length; i += 1) {
      if (breakFlags[i]) {
        travelMs = dayTransitionMs;
      } else {
        travelMs = allocated[i] !== undefined ? allocated[i] : drivingMs / Math.max(1, drivingIndices.length);
      }
      if (segmentMsIn && isFinite(Number(segmentMsIn[i])) && Number(segmentMsIn[i]) > 0) travelMs = Number(segmentMsIn[i]);
      segments.push({
        fromIndex: i,
        toIndex: i + 1,
        mode: sourceStops[i + 1].mode || sourceStops[i].mode || trip.transportMode,
        geoDistanceKm: distances[i],
        travelMs: travelMs,
        dayBreak: breakFlags[i],
        toDay: Number(sourceStops[i + 1].dayIndex || 1),
        points: null
      });
    }

    // 媒體站：有照片的站在到站時多停留 photoMs 顯示照片（含 Ken Burns）。
    var photoMs = optionOrDefault(options, 'photoMs', template.photoMs);
    var mediaSet = {};
    mediaIndicesIn.forEach(function (idx) { mediaSet[idx] = true; });
    var holdIn = Array.isArray(options.holdMsByStop) ? options.holdMsByStop : null;
    var holdMs = [];
    for (i = 0; i < sourceStops.length; i += 1) {
      var isMiddle = i > 0 && i < lastStopIndex;
      var h = mediaSet[i] ? photoMs : (isMiddle ? dwellMs : 0);
      if (mediaSet[i] && holdIn && isFinite(Number(holdIn[i])) && Number(holdIn[i]) > 0) h = Number(holdIn[i]);
      holdMs.push(h);
    }

    var media = [];
    var dayBreaks = [];
    if (sourceStops.length > 0) {
      arriveMs.push(coverMs);
      currentMs = coverMs;
      if (mediaSet[0]) media.push({ kind: 'photo', stopIndex: 0, atMs: coverMs, durationMs: holdMs[0], src: null });
      currentMs += holdMs[0];

      for (i = 0; i < segments.length; i += 1) {
        if (segments[i].dayBreak) {
          // 換日轉場窗：從出發（currentMs）到抵達隔天第一站
          dayBreaks.push({ startMs: currentMs, endMs: currentMs + segments[i].travelMs, day: segments[i].toDay, toStopIndex: i + 1 });
        }
        currentMs += segments[i].travelMs;
        arriveMs.push(currentMs);
        subtitles.push({ atMs: currentMs, stopIndex: i + 1, text: sourceStops[i + 1].name });
        var si = i + 1;
        if (mediaSet[si]) media.push({ kind: 'photo', stopIndex: si, atMs: currentMs, durationMs: holdMs[si], src: null });
        currentMs += holdMs[si];
      }
    }
    var totalHold = holdMs.reduce(function (a, b) { return a + b; }, 0);
    // 實際路線動畫時間（開車段＋換日轉場），可能與 routeMs 略有出入
    var actualRouteMs = segments.reduce(function (a, s) { return a + s.travelMs; }, 0);

    var segmentCfg = template.segment || {};
    return {
      version: 2,
      template: { id: template.id, label: template.label, segmentEase: segmentCfg.ease === 'linear' ? 'linear' : 'smooth' },
      // 開場：photoCut 時前 photoMs 放實景照片（取第一張有照片的站），硬切到地圖再停 beatMs
      cover: usePhotoCut
        ? { style: 'photoCut', photoStopIndex: mediaIndicesIn[0], photoMs: Number(coverCfg.photoMs) || 1430, beatMs: Number(coverCfg.beatMs) || 320 }
        : { style: 'title' },
      trip: {
        title: trip.title,
        region: trip.region,
        dateLabel: trip.dateLabel,
        people: trip.people,
        distanceKm: trip.distanceKm,
        days: trip.days,
        dayCount: calculateDayCount(sourceStops)
      },
      transportMode: trip.transportMode,
      stops: stops,
      segments: segments,
      timeline: {
        coverMs: coverMs,
        routeMs: routeMs,
        statsMs: statsMs,
        dwellMs: dwellMs,
        photoMs: photoMs,
        holdMs: holdMs,
        totalMs: coverMs + actualRouteMs + totalHold + statsMs,
        arriveMs: arriveMs,
        dayBreaks: dayBreaks
      },
      adaptiveTier: adaptive.tier,
      media: media,
      subtitles: subtitles
    };
  }

  return {
    buildRecapManifest: buildRecapManifest,
    resolveTemplate: resolveTemplate,
    allocateSegmentMs: allocateSegmentMs
  };
}));
