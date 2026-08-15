/*
 * recap-jobs.js — 回顧短片後端渲染 job（M8）
 * 掛在既有代理上：POST 建立 job → 序列化渲染（無頭 Chrome＋ffmpeg）→ 輪詢狀態 → 下載 mp4。
 * 產物存本機暫存目錄、限時清除；不進 Firebase Storage（P3 才上雲，屆時需部署 Storage Rules）。
 *
 * 安全考量：
 *  - 渲染很重（開 Chrome＋逐幀截圖）：全域序列化（同時只跑一支），佇列上限，避免被灌爆。
 *  - 需登入（requireFirebaseUser），且 job 只有建立者 uid 能查詢/下載。
 *  - manifest 一律由伺服器用 trip 重算時間軸；只信任 stops 與（可選的）路線點，其餘欄位不吃前端的。
 *  - 幀數上限，杜絕「請求一支 10 小時影片」的 DoS。
 */
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

const MANIFEST = require(path.join(__dirname, '..', 'app', 'recap-manifest.js'));
const { renderRecapVideo } = require('./recap-renderer.js');

const OUT_DIR = path.join(os.tmpdir(), 'wai-recap-jobs');
const JOB_TTL_MS = 30 * 60 * 1000;      // 產物與 job 記錄保留 30 分鐘
const MAX_QUEUE = 4;                     // 佇列上限（含正在跑的那支）
const MAX_STOPS = 40;
const MAX_TOTAL_MS = 60 * 1000;          // 影片長度硬上限 60s
const FPS = 30;

try { fs.mkdirSync(OUT_DIR, { recursive: true }); } catch (e) {}

const jobs = new Map();                  // jobId → { id, uid, status, progress, outPath, error, createdAt }
const queue = [];
let running = false;

function finite(v) { return typeof v === 'number' && Number.isFinite(v) ? v : null; }
function str(v, max) { return String(v == null ? '' : v).slice(0, max || 200); }

// 只吃 stops 與可選路線點；其餘欄位淨化後交給 manifest builder 重算時間軸
function sanitizeTrip(raw) {
  if (!raw || typeof raw !== 'object') throw badReq('invalid trip');
  const srcStops = Array.isArray(raw.stops) ? raw.stops : [];
  if (srcStops.length < 2) throw badReq('need at least 2 stops');
  if (srcStops.length > MAX_STOPS) throw badReq('too many stops');
  const stops = srcStops.map((s, i) => {
    const lat = finite(s && s.lat), lng = finite(s && s.lng);
    if (lat === null || lng === null || lat < -90 || lat > 90 || lng < -180 || lng > 180) throw badReq('bad stop coordinates at ' + i);
    return {
      stopId: str(s.stopId || ('s' + i), 120),
      name: str(s.name || ('景點 ' + (i + 1)), 200),
      lat: lat, lng: lng,
      mode: str(s.mode || raw.transportMode || 'car', 32),
      stayMin: Math.max(0, Math.min(1440, finite(s.stayMin) || 0)),
      dayIndex: Math.max(1, Math.min(60, finite(s.dayIndex) || 1))
    };
  });
  return {
    title: str(raw.title || '旅程', 80),
    region: str(raw.region || '', 60),
    dateLabel: str(raw.dateLabel || '', 60),
    people: str(raw.people || '', 40),
    distanceKm: finite(raw.distanceKm) || 0,
    days: str(raw.days || '', 120),
    transportMode: str(raw.transportMode || 'car', 32),
    stops: stops
  };
}

// 可選的真實道路點：長度需為 stops-1，每段是 [[lat,lng],...]，數量與範圍設上限
function sanitizeRoutePoints(raw, segCount) {
  if (raw == null) return null;
  if (!Array.isArray(raw) || raw.length !== segCount) throw badReq('routePoints length mismatch');
  return raw.map((seg) => {
    if (!Array.isArray(seg)) throw badReq('bad segment points');
    if (seg.length > 2000) throw badReq('segment too many points');
    return seg.map((p) => {
      const lat = finite(Array.isArray(p) ? p[0] : null), lng = finite(Array.isArray(p) ? p[1] : null);
      if (lat === null || lng === null || lat < -90 || lat > 90 || lng < -180 || lng > 180) throw badReq('bad route point');
      return [lat, lng];
    });
  });
}

function badReq(msg) { const e = new Error(msg); e.status = 400; return e; }

function buildManifest(trip, mediaCount, routePoints, mediaStopIndices) {
  const manifest = MANIFEST.buildRecapManifest(trip, {
    mediaCount: Math.max(0, Math.min(12, finite(mediaCount) || 0)),
    mediaStopIndices: Array.isArray(mediaStopIndices) ? mediaStopIndices : []
  });
  if (manifest.timeline.totalMs > MAX_TOTAL_MS) throw badReq('video too long');
  if (routePoints) {
    const pts = sanitizeRoutePoints(routePoints, manifest.segments.length);
    manifest.segments.forEach((seg, i) => { seg.points = pts[i]; });
  }
  return manifest;
}

// 照片：每站最多一張，url 需為 https 或 data:image；stopIndex 需在範圍內。
function sanitizePhotos(raw, stopCount) {
  if (raw == null) return [];
  if (!Array.isArray(raw)) throw badReq('photos must be array');
  const out = [];
  const seen = {};
  raw.slice(0, 12).forEach((p) => {
    if (!p || typeof p !== 'object') return;
    const idx = finite(p.stopIndex);
    if (idx === null || idx < 0 || idx >= stopCount) return;
    const url = String(p.url || '');
    if (!/^https?:\/\//i.test(url) && !/^data:image\//i.test(url)) return;
    if (url.length > 6 * 1024 * 1024) return;
    if (seen[idx]) return;
    seen[idx] = true;
    out.push({ stopIndex: idx, url });
  });
  return out;
}

// 伺服器端抓照片 → data URL（避開瀏覽器 file:// 的跨源污染）。失敗回 null。
async function fetchPhotoDataUrl(url) {
  if (/^data:image\//i.test(url)) return url.length <= 6 * 1024 * 1024 ? url : null;
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 10000);
    const r = await fetch(url, { signal: ctrl.signal });
    clearTimeout(to);
    if (!r.ok) return null;
    const ct = (r.headers.get('content-type') || '').toLowerCase();
    if (!/^image\/(jpe?g|png|webp)/.test(ct)) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 8 * 1024 * 1024) return null;
    return 'data:' + ct.split(';')[0].trim() + ';base64,' + buf.toString('base64');
  } catch (e) { return null; }
}

function cleanupOld() {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (now - job.createdAt > JOB_TTL_MS) {
      if (job.outPath) fs.promises.unlink(job.outPath).catch(() => {});
      jobs.delete(id);
    }
  }
}

async function runNext() {
  if (running) return;
  const job = queue.shift();
  if (!job) return;
  running = true;
  job.status = 'rendering';
  try {
    // 到站照片：伺服器端抓成 data URL 填進 manifest.media（抓不到就略過該站照片）
    if (job.photos && job.photos.length && Array.isArray(job.manifest.media)) {
      const byStop = {};
      await Promise.all(job.photos.map(async (p) => { byStop[p.stopIndex] = await fetchPhotoDataUrl(p.url); }));
      job.manifest.media.forEach((mm) => { const src = byStop[mm.stopIndex]; if (src) mm.src = src; });
    }
    const outPath = path.join(OUT_DIR, job.id + '.mp4');
    await renderRecapVideo(job.manifest, {
      outPath, fps: FPS, width: 1080, height: 1920,
      onProgress: (f) => { job.progress = Math.round(f * 100); }
    });
    job.outPath = outPath;
    job.status = 'done';
    job.progress = 100;
  } catch (err) {
    job.status = 'error';
    job.error = String(err && err.message || err).slice(0, 300);
    console.error('[recap] 渲染失敗 job=' + job.id + '：', job.error);
  } finally {
    job.manifest = null;                 // 釋放
    running = false;
    setImmediate(runNext);               // 接著跑佇列下一支
  }
}

function mountRecapJobs(app, deps) {
  const requireFirebaseUser = deps.requireFirebaseUser;
  const rateLimit = deps.rateLimit;
  const ipKeyGenerator = deps.ipKeyGenerator;

  // 渲染很重：每人每小時上限 5 次
  const renderLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, max: 5, standardHeaders: true, legacyHeaders: false,
    keyGenerator: (req, res) => (req.user && req.user.uid) || ipKeyGenerator(req, res),
    message: { error: 'rate limited', message: '產生回顧短片次數過多，請稍後再試。' }
  });

  app.post('/api/recap/render', renderLimiter, requireFirebaseUser, (req, res) => {
    cleanupOld();
    if (queue.length >= MAX_QUEUE) return res.status(429).json({ error: 'busy', message: '目前排隊中，請稍後再試。' });
    let manifest, photos;
    try {
      const trip = sanitizeTrip(req.body && req.body.trip);
      photos = sanitizePhotos(req.body && req.body.photos, trip.stops.length);
      const mediaStopIndices = photos.map((p) => p.stopIndex);
      manifest = buildManifest(trip, photos.length, req.body && req.body.routePoints, mediaStopIndices);
    } catch (err) {
      return res.status(err.status || 400).json({ error: 'invalid input', message: err.message });
    }
    const id = crypto.randomBytes(12).toString('hex');
    const job = { id, uid: req.user.uid, status: 'queued', progress: 0, outPath: null, error: null, createdAt: Date.now(), manifest, photos };
    jobs.set(id, job);
    queue.push(job);
    setImmediate(runNext);
    return res.json({ ok: true, jobId: id, totalMs: manifest.timeline.totalMs, queuePos: queue.length });
  });

  app.get('/api/recap/jobs/:jobId', requireFirebaseUser, (req, res) => {
    const job = jobs.get(String(req.params.jobId || ''));
    if (!job || job.uid !== req.user.uid) return res.status(404).json({ error: 'job not found' });
    return res.json({ ok: true, jobId: job.id, status: job.status, progress: job.progress, error: job.error || null });
  });

  app.get('/api/recap/jobs/:jobId/download', requireFirebaseUser, (req, res) => {
    const job = jobs.get(String(req.params.jobId || ''));
    if (!job || job.uid !== req.user.uid) return res.status(404).json({ error: 'job not found' });
    if (job.status !== 'done' || !job.outPath || !fs.existsSync(job.outPath)) return res.status(409).json({ error: 'not ready', status: job.status });
    res.set('Content-Type', 'video/mp4');
    res.set('Content-Disposition', 'attachment; filename="travel-recap.mp4"');
    res.set('Cache-Control', 'private, no-store');
    fs.createReadStream(job.outPath).pipe(res);
  });

  console.log('[recap] job 端點已掛載：POST /api/recap/render、GET /api/recap/jobs/:id[/download]');
}

module.exports = { mountRecapJobs: mountRecapJobs, _internals: { sanitizeTrip, buildManifest } };
