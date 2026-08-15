/*
 * TravelLink AI recap manifest builder.
 * This file intentionally has no runtime dependencies so it can be loaded by
 * a plain browser <script> tag as well as by Node.js.
 */
(function (root, factory) {
  var api = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.WAI_RECAP_MANIFEST = api;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

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

  function getAdaptiveSettings(mediaCount, coverMs, statsMs) {
    var targetMs;
    var tier;

    if (mediaCount === 0) {
      tier = '0';
      targetMs = 11000;
    } else if (mediaCount <= 2) {
      tier = '1-2';
      targetMs = 13500;
    } else if (mediaCount <= 5) {
      tier = '3-5';
      targetMs = 17500;
    } else {
      tier = '6+';
      targetMs = 25000;
    }

    return {
      tier: tier,
      routeMs: Math.max(4000, targetMs - coverMs - statsMs)
    };
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

  function buildRecapManifest(trip, opts) {
    var options = opts || {};
    var sourceStops = Array.isArray(trip.stops) ? trip.stops : [];
    var coverMs = optionOrDefault(options, 'coverMs', 2200);
    var statsMs = optionOrDefault(options, 'statsMs', 3000);
    var dwellMs = optionOrDefault(options, 'dwellMs', 200);
    var mediaCount = optionOrDefault(options, 'mediaCount', 0);
    var adaptive = getAdaptiveSettings(mediaCount, coverMs, statsMs);
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

    for (i = 0; i < distances.length; i += 1) {
      travelMs = totalDistance === 0
        ? routeMs / distances.length
        : routeMs * (distances[i] / totalDistance);
      segments.push({
        fromIndex: i,
        toIndex: i + 1,
        mode: sourceStops[i + 1].mode || sourceStops[i].mode || trip.transportMode,
        geoDistanceKm: distances[i],
        travelMs: travelMs,
        points: null
      });
    }

    // 媒體站：有照片的站在到站時多停留 photoMs 顯示照片（含 Ken Burns）。
    var photoMs = optionOrDefault(options, 'photoMs', 2600);
    var mediaSet = {};
    (Array.isArray(options.mediaStopIndices) ? options.mediaStopIndices : [])
      .forEach(function (idx) { mediaSet[idx] = true; });
    var holdMs = [];
    for (i = 0; i < sourceStops.length; i += 1) {
      var isMiddle = i > 0 && i < lastStopIndex;
      holdMs.push(mediaSet[i] ? photoMs : (isMiddle ? dwellMs : 0));
    }

    var media = [];
    if (sourceStops.length > 0) {
      arriveMs.push(coverMs);
      currentMs = coverMs;
      if (mediaSet[0]) media.push({ kind: 'photo', stopIndex: 0, atMs: coverMs, durationMs: holdMs[0], src: null });
      currentMs += holdMs[0];

      for (i = 0; i < segments.length; i += 1) {
        currentMs += segments[i].travelMs;
        arriveMs.push(currentMs);
        subtitles.push({ atMs: currentMs, stopIndex: i + 1, text: sourceStops[i + 1].name });
        var si = i + 1;
        if (mediaSet[si]) media.push({ kind: 'photo', stopIndex: si, atMs: currentMs, durationMs: holdMs[si], src: null });
        currentMs += holdMs[si];
      }
    }
    var totalHold = holdMs.reduce(function (a, b) { return a + b; }, 0);

    return {
      version: 1,
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
        totalMs: coverMs + routeMs + totalHold + statsMs,
        arriveMs: arriveMs
      },
      adaptiveTier: adaptive.tier,
      media: media,
      subtitles: subtitles
    };
  }

  return {
    buildRecapManifest: buildRecapManifest
  };
}));
