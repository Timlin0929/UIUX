/**
 * WanderAI 後端代理（Vertex AI / Gemini + TDX）
 *
 * 目的：把伺服器端金鑰留在後端，前端只呼叫同源的 /api/*：
 *  - /api/vertex/*：注入 VERTEX_API_KEY 轉發 Vertex AI（文字/串流/圖片）。
 *  - /api/tdx/*   ：以 TDX client_credentials 取 token 後轉發（TDX 憑證不再進前端）。
 *
 * 安全：
 *  - /api/vertex 需要 Firebase 登入（Authorization: Bearer <idToken>，firebase-admin 驗證），
 *    未登入一律 401 —— 否則任何人都能燒 Vertex 額度（帳單風險）。
 *  - 速率限制（express-rate-limit）：vertex 每 IP 10 分鐘 20 次；tdx 每 IP 10 分鐘 60 次。
 *  - 路徑白名單：vertex 只放行實際使用的 model 與端點；tdx 只放行景點/停車場兩個資料路徑。
 *  - 只監聽 127.0.0.1：外部一律經 nginx 反向代理進來（nginx 需帶 X-Forwarded-For 供限流辨識來源 IP）。
 *
 * 需 Node 18+（內建 fetch）。
 */
'use strict';
require('dotenv').config();
// 強制對外連線優先走 IPv4：本機為雙棧，Node 預設偏好 IPv6，但本機 IPv6 是會輪換的
// 臨時隱私位址；Vertex 金鑰的 IP 白名單填的是固定 IPv4（210.240.160.150）。
// 不設這行會被 Google 以 API_KEY_IP_ADDRESS_BLOCKED 擋下（403）。
require('dns').setDefaultResultOrder('ipv4first');
const path = require('path');
const express = require('express');
const rateLimit = require('express-rate-limit');
// firebase-admin v14 起僅支援模組化 API（admin.credential.* 已移除）
const { initializeApp, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

const PORT = Number(process.env.PORT) || 3001;
const VERTEX_API_KEY = (process.env.VERTEX_API_KEY || '').trim();
const TDX_APP_ID = (process.env.TDX_APP_ID || '').trim();
const TDX_APP_KEY = (process.env.TDX_APP_KEY || '').trim();
const VERTEX_UPSTREAM = 'https://aiplatform.googleapis.com';
const TDX_UPSTREAM = 'https://tdx.transportdata.tw';

if (!VERTEX_API_KEY) {
  console.error('[proxy] 缺少 VERTEX_API_KEY，請在 server/.env 設定後再啟動。');
  process.exit(1);
}
if (typeof fetch !== 'function') {
  console.error('[proxy] 需要 Node 18 以上（內建 fetch）。目前版本：' + process.version);
  process.exit(1);
}

// ── Firebase Admin（驗證前端帶來的 ID token）──
// 服務帳戶沿用 crawler 的那份；路徑可用 FIREBASE_SERVICE_ACCOUNT_PATH 覆蓋。
const SA_PATH = process.env.FIREBASE_SERVICE_ACCOUNT_PATH
  || path.join(__dirname, '..', 'crawler', 'serviceAccount.json');
let adminReady = false;
try {
  initializeApp({ credential: cert(require(SA_PATH)) });
  adminReady = true;
  console.log('[proxy] firebase-admin 已初始化（' + SA_PATH + '）');
} catch (e) {
  console.error('[proxy] firebase-admin 初始化失敗，/api/vertex 將一律回 503：', e.message);
}

const app = express();
app.disable('x-powered-by'); // 不洩漏後端框架
// 只信任 nginx 這一層代理（proxy 僅監聽 127.0.0.1，XFF 只可能由 nginx 設定，可信）
app.set('trust proxy', 1);
app.use(express.json({ limit: '5mb' })); // 行程 prompt 可能較大

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'wanderai-proxy' }));

// ══════════════ Vertex AI（需登入 + 限流 + model 白名單）══════════════

// 只放行實際用到的 model 與端點（過度寬鬆的白名單＝幫全網代付其他 model 的費用）
const VERTEX_ALLOWED_PATH = new RegExp(
  '^/(?:' +
  'v1/publishers/google/models/(?:gemini-3-flash-preview|gemini-3\\.1-flash-image):(?:generateContent|streamGenerateContent)' +
  '|v1beta1/projects/[^/]+/locations/global/publishers/google/models/(?:gemini-3-flash-preview|gemini-3\\.1-flash-image):generateContent' +
  ')$'
);

const vertexLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20, // 每 IP 10 分鐘 20 次（一次行程生成含重試/補站約 3–6 次呼叫）
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate limited', message: '請求過於頻繁，請稍後再試。' }
});

// 驗證 Firebase ID token（前端登入後由 SDK 取得，隨請求帶在 Authorization 標頭）
async function requireFirebaseUser(req, res, next) {
  if (!adminReady) return res.status(503).json({ error: 'auth unavailable', message: '伺服器驗證模組未就緒。' });
  const m = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i);
  if (!m) return res.status(401).json({ error: 'login required', message: '請先登入後再使用 AI 功能。' });
  try {
    req.user = await getAuth().verifyIdToken(m[1]);
    return next();
  } catch (_e) {
    return res.status(401).json({ error: 'invalid token', message: '登入狀態已失效，請重新登入。' });
  }
}

app.post('/api/vertex/*', vertexLimiter, requireFirebaseUser, async (req, res) => {
  const upstreamPath = '/' + (req.params[0] || '');
  if (!VERTEX_ALLOWED_PATH.test(upstreamPath)) {
    return res.status(403).json({ error: 'path not allowed' });
  }

  const url = new URL(VERTEX_UPSTREAM + upstreamPath);
  // 保留前端帶來的 query（例如 alt=sse），但一律用伺服器端金鑰覆蓋 key
  for (const [k, v] of Object.entries(req.query)) {
    if (k !== 'key') url.searchParams.set(k, String(v));
  }
  url.searchParams.set('key', VERTEX_API_KEY);

  let upstream;
  try {
    upstream = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body || {})
    });
  } catch (err) {
    console.error('[proxy] vertex upstream fetch 失敗：', err && err.message);
    return res.status(502).json({ error: 'upstream fetch failed' });
  }

  res.status(upstream.status);
  res.set('Content-Type', upstream.headers.get('content-type') || 'application/json');
  res.set('X-Accel-Buffering', 'no'); // 提示 nginx 對 SSE 不要緩衝

  if (!upstream.body) { return res.end(); }
  try {
    const reader = upstream.body.getReader();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
  } catch (err) {
    console.error('[proxy] vertex 串流轉發中斷：', err && err.message);
  }
  res.end();
});

// ══════════════ TDX（client_credentials 留在伺服器；限流；路徑白名單）══════════════

// 只放行前端實際用的兩個唯讀資料端點；兩者在 TDX 上游的 base 不同：
//  - 停車場（basic API）  ：/api/basic/v1/Parking/...
//  - 景點（新版 odata API）：/api/tourism/service/odata/V2/Tourism/Attraction
//    （舊 basic 的 v2/Tourism/ScenicSpot 已退役回 404，2026-07 一併換到新端點）
function tdxUpstreamUrl(rest) {
  if (/^\/v1\/Parking\/OffStreet\/CarPark\/City\/[A-Za-z]+(?:\/|$)?/.test(rest)) {
    return TDX_UPSTREAM + '/api/basic' + rest;
  }
  if (/^\/V2\/Tourism\/Attraction(?:\/|$)?$/.test(rest)) {
    return TDX_UPSTREAM + '/api/tourism/service/odata' + rest;
  }
  return null;
}

const tdxLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate limited' }
});

// TDX token 快取 + in-flight 去重（跟前端原本的邏輯相同，搬到伺服器）
let _tdxToken = null;
let _tdxTokenExp = 0;
let _tdxTokenPromise = null;
async function getTdxToken() {
  if (!TDX_APP_ID || !TDX_APP_KEY) return null;
  if (_tdxToken && Date.now() < _tdxTokenExp) return _tdxToken;
  if (_tdxTokenPromise) return _tdxTokenPromise;
  _tdxTokenPromise = (async () => {
    try {
      const r = await fetch(TDX_UPSTREAM + '/auth/realms/TDXConnect/protocol/openid-connect/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'grant_type=client_credentials'
          + '&client_id=' + encodeURIComponent(TDX_APP_ID)
          + '&client_secret=' + encodeURIComponent(TDX_APP_KEY)
      });
      if (!r.ok) return null;
      const data = await r.json();
      _tdxToken = data.access_token || null;
      const ttl = Number(data.expires_in) || 86400;
      _tdxTokenExp = Date.now() + Math.max(0, ttl - 60) * 1000;
      return _tdxToken;
    } catch (e) {
      console.warn('[proxy] TDX token 失敗：', e && e.message);
      return null;
    } finally {
      _tdxTokenPromise = null;
    }
  })();
  return _tdxTokenPromise;
}

app.get('/api/tdx/*', tdxLimiter, async (req, res) => {
  const rest = '/' + (req.params[0] || '');
  const upstreamBase = tdxUpstreamUrl(rest);
  if (!upstreamBase) {
    return res.status(403).json({ error: 'path not allowed' });
  }
  const token = await getTdxToken();
  if (!token) return res.status(503).json({ error: 'tdx unavailable' });

  const url = new URL(upstreamBase);
  for (const [k, v] of Object.entries(req.query)) url.searchParams.set(k, String(v));

  try {
    const upstream = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
    const body = await upstream.text();
    res.status(upstream.status);
    res.set('Content-Type', upstream.headers.get('content-type') || 'application/json');
    res.send(body);
  } catch (err) {
    console.error('[proxy] tdx upstream fetch 失敗：', err && err.message);
    res.status(502).json({ error: 'upstream fetch failed' });
  }
});

// ══════════════ CWA 中央氣象署（金鑰留在伺服器；dataset 白名單；限流＋快取）══════════════

const CWA_API_KEY = (process.env.CWA_API_KEY || '').trim();
const CWA_UPSTREAM = 'https://opendata.cwa.gov.tw';
// 只放行實際使用的資料集：
//  - F-D0047-091：縣市未來一週天氣預報（主來源，12 小時間隔約 7 天，取臺東縣）
//  - F-C0032-001：36 小時縣市天氣預報（一週抓不到時的 fallback）
//  - F-D0047-089：臺東縣鄉鎮逐 12 小時預報（保留備用）
const CWA_ALLOWED_DATASET = /^(?:F-D0047-091|F-C0032-001|F-D0047-089)$/;

const cwaLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate limited' }
});

// 天氣資料變動慢：伺服器端快取 10 分鐘，全站共用同一份，省 CWA 配額
const _cwaCache = new Map(); // url → { exp, status, contentType, body }
app.get('/api/cwa/v1/rest/datastore/:dataset', cwaLimiter, async (req, res) => {
  // 金鑰未設時回 200＋標記（不回 503）：瀏覽器對非 2xx 會在 console 印紅色錯誤，
  // 違反前端「F12 零紅字」驗收標準；前端看到沒有 records 就靜默保留原內容。
  if (!CWA_API_KEY) return res.json({ ok: false, error: 'cwa key not set', message: 'CWA 金鑰未設定。' });
  const dataset = String(req.params.dataset || '');
  if (!CWA_ALLOWED_DATASET.test(dataset)) return res.status(403).json({ error: 'dataset not allowed' });

  const url = new URL(CWA_UPSTREAM + '/api/v1/rest/datastore/' + dataset);
  for (const [k, v] of Object.entries(req.query)) {
    if (k !== 'Authorization') url.searchParams.set(k, String(v)); // 金鑰一律用伺服器端的
  }
  url.searchParams.set('Authorization', CWA_API_KEY);

  const cacheKey = url.href;
  const hit = _cwaCache.get(cacheKey);
  if (hit && Date.now() < hit.exp) {
    res.status(hit.status).set('Content-Type', hit.contentType);
    return res.send(hit.body);
  }

  try {
    const upstream = await fetch(url);
    const body = await upstream.text();
    const contentType = upstream.headers.get('content-type') || 'application/json';
    if (upstream.ok) {
      _cwaCache.set(cacheKey, { exp: Date.now() + 10 * 60 * 1000, status: upstream.status, contentType, body });
    }
    res.status(upstream.status).set('Content-Type', contentType).send(body);
  } catch (err) {
    console.error('[proxy] cwa upstream fetch 失敗：', err && err.message);
    res.status(502).json({ error: 'upstream fetch failed' });
  }
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`[proxy] 代理已啟動 http://127.0.0.1:${PORT}（僅本機；對外請經 nginx /api/）`);
  console.log('[proxy] /api/vertex：需登入 + 20req/10min/IP；/api/tdx：60req/10min/IP；/api/cwa：60req/10min/IP＋10min 快取');
});
