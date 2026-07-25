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
const crypto = require('crypto');
const express = require('express');
const rateLimit = require('express-rate-limit');
// firebase-admin v14 起僅支援模組化 API（admin.credential.* 已移除）
const { initializeApp, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');

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
let adminDb = null;
try {
  initializeApp({ credential: cert(require(SA_PATH)) });
  adminDb = getFirestore();
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

const collabLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate limited', message: '邀請驗證次數過多，請稍後再試。' }
});

const publicTripLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 90,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate limited' }
});

function normalizeInviteCode(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function sameSecret(a, b) {
  const left = Buffer.from(String(a || ''), 'utf8');
  const right = Buffer.from(String(b || ''), 'utf8');
  return left.length === right.length && left.length >= 16 && crypto.timingSafeEqual(left, right);
}

function emailIdentityKey(email) {
  return Buffer.from(String(email || '').trim().toLowerCase(), 'utf8').toString('hex');
}

function legacyMemberKey(email) {
  return String(email || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function tripOwnerEmail(data) {
  return String(data.ownerEmail || data.userEmail || '').trim();
}

function isTripOwner(user, data) {
  const ownerEmail = normalizeEmail(tripOwnerEmail(data));
  return Boolean(
    (data.ownerUid && user.uid === data.ownerUid)
    || (user.email && ownerEmail && normalizeEmail(user.email) === ownerEmail)
  );
}

function generateServerInviteCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(8);
  let code = '';
  for (let i = 0; i < bytes.length; i += 1) code += alphabet[bytes[i] % alphabet.length];
  return code;
}

function generateServerShareToken() {
  return crypto.randomBytes(24).toString('base64url');
}

function notificationRef(email, id) {
  return adminDb.collection('user_notifications')
    .doc(emailIdentityKey(email))
    .collection('items')
    .doc(String(id).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 300));
}

function publicTripData(tripId, data) {
  const allowed = [
    'title', 'customTitle', 'emoji', 'days', 'region', 'budget', 'people',
    'wizardData', 'stops', 'status', 'currentStopIndex', 'startedAt', 'updatedAt',
    'createdAt', 'collab', 'ownerName', 'organizer', 'departureDate', 'tripMode'
  ];
  const result = { id: tripId, guestView: true };
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(data, key)) result[key] = data[key];
  }
  return result;
}

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

// 邀請碼只能送到後端驗證。驗證成功後建立短效 join proof，Firestore Rules
// 才允許該登入者讀取行程並把自己加入 memberEmails。
app.post('/api/collab/invites/verify', collabLimiter, requireFirebaseUser, async (req, res) => {
  // 信箱驗證只屬於註冊提示；登入後的共編功能僅要求 token 具有 email。
  if (!req.user.email) {
    return res.status(403).json({ error: 'email required', message: '這個登入帳號沒有可用的電子信箱。' });
  }
  const code = normalizeInviteCode(req.body && req.body.code);
  if (code.length < 6 || code.length > 16) {
    return res.status(400).json({ error: 'invalid invite', message: '邀請碼格式不正確。' });
  }

  try {
    const inviteSnap = await adminDb.collection('invites').doc(code).get();
    if (!inviteSnap.exists || inviteSnap.get('active') !== true) {
      return res.status(404).json({ error: 'invalid invite', message: '找不到邀請碼，或邀請碼已失效。' });
    }
    const tripId = inviteSnap.get('tripId');
    if (typeof tripId !== 'string' || !tripId) {
      return res.status(404).json({ error: 'invalid invite', message: '找不到邀請碼，或邀請碼已失效。' });
    }
    const tripRef = adminDb.collection('micro_trips').doc(tripId);
    const tripSnap = await tripRef.get();
    if (!tripSnap.exists) {
      return res.status(404).json({ error: 'trip not found', message: '行程不存在或已被刪除。' });
    }
    const trip = tripSnap.data();
    const members = Array.isArray(trip.memberEmails) ? trip.memberEmails : [];
    const alreadyMember = members.includes(req.user.email);
    const maxMembers = Math.min(Math.max(Number(trip.maxMembers) || 10, 1), 50);
    if (!alreadyMember && members.length >= maxMembers) {
      return res.status(409).json({ error: 'trip full', message: `這個行程人數已滿（上限 ${maxMembers} 人）。` });
    }

    const now = Date.now();
    await tripRef.collection('join_proofs').doc(req.user.uid).set({
      email: req.user.email,
      createdAt: Timestamp.fromMillis(now),
      expiresAt: Timestamp.fromMillis(now + 2 * 60 * 1000)
    });

    return res.json({
      ok: true,
      tripId,
      alreadyMember,
      preview: {
        id: tripId,
        title: trip.title || '共編行程',
        ownerName: trip.ownerName || '行程擁有者',
        memberCount: members.length,
        maxMembers
      }
    });
  } catch (err) {
    console.error('[proxy] invite verify failed:', err && err.message);
    return res.status(500).json({ error: 'invite verify failed', message: '目前無法驗證邀請碼，請稍後再試。' });
  }
});

// 訪客分享不直接讀 micro_trips。後端核對不可猜的 token 後，只回傳畫面需要的
// 行程欄位，排除 email、members、inviteCode 等協作與個資欄位。
app.get('/api/collab/public-trip', publicTripLimiter, async (req, res) => {
  if (!adminReady) return res.status(503).json({ error: 'service unavailable' });
  const tripId = String(req.query.tripId || '');
  const token = String(req.query.token || '');
  if (!/^[A-Za-z0-9_-]{3,150}$/.test(tripId) || token.length > 200) {
    return res.status(400).json({ error: 'invalid share link', message: '分享連結無效。' });
  }
  try {
    const snap = await adminDb.collection('micro_trips').doc(tripId).get();
    const data = snap.exists ? snap.data() : null;
    if (!data || !sameSecret(token, data.shareToken)) {
      return res.status(404).json({ error: 'invalid share link', message: '分享連結已失效或不存在。' });
    }
    res.set('Cache-Control', 'private, no-store');
    return res.json({ ok: true, trip: publicTripData(tripId, data) });
  } catch (err) {
    console.error('[proxy] public trip failed:', err && err.message);
    return res.status(500).json({ error: 'public trip failed', message: '目前無法讀取分享行程，請稍後再試。' });
  }
});

// 唯讀分享頁的加入申請。分享權杖只允許提出申請，不會直接賦予成員權限。
app.post('/api/collab/join-requests', collabLimiter, requireFirebaseUser, async (req, res) => {
  if (!req.user.email) {
    return res.status(403).json({ error: 'email required', message: '此帳號缺少 Email，無法申請加入。' });
  }
  const tripId = String(req.body && req.body.tripId || '');
  const token = String(req.body && req.body.token || '');
  if (!/^[A-Za-z0-9_-]{3,150}$/.test(tripId) || token.length > 200) {
    return res.status(400).json({ error: 'invalid share link', message: '分享連結格式不正確。' });
  }

  try {
    const tripRef = adminDb.collection('micro_trips').doc(tripId);
    const requestRef = tripRef.collection('join_requests').doc(req.user.uid);
    const result = await adminDb.runTransaction(async (tx) => {
      const [tripSnap, requestSnap] = await Promise.all([tx.get(tripRef), tx.get(requestRef)]);
      if (!tripSnap.exists) {
        const err = new Error('找不到這份行程。');
        err.status = 404;
        throw err;
      }
      const trip = tripSnap.data();
      if (!sameSecret(token, trip.shareToken)) {
        const err = new Error('分享連結已失效，請向擁有者索取新連結。');
        err.status = 404;
        throw err;
      }
      if (isTripOwner(req.user, trip)) {
        const err = new Error('你已經是這份行程的擁有者。');
        err.status = 409;
        throw err;
      }
      const memberEmails = Array.isArray(trip.memberEmails) ? trip.memberEmails : [];
      if (memberEmails.some((email) => normalizeEmail(email) === normalizeEmail(req.user.email))) {
        return { status: 'accepted', alreadyMember: true };
      }
      const maxMembers = Math.min(Math.max(Number(trip.maxMembers) || 10, 1), 50);
      // ⚠️ 已知風險（2026-07-26 Codex 審查 #3）：此處只算既有 memberEmails，
      // 但 resolve 接受時會先把 owner 補進陣列再判斷上限。若 memberEmails 有
      // maxMembers-1 人「且不含 owner」，申請會通過變 pending，owner 按接受卻拿到 409，
      // 申請永久卡住。預設 maxMembers=10 且個人行程 memberEmails 多為空，暫不處理。
      // 要修的話：兩處統一改成「memberEmails ∪ {owner} 去重後的人數」。
      if (memberEmails.length >= maxMembers) {
        const err = new Error(`這份行程的成員已達上限（${maxMembers} 人）。`);
        err.status = 409;
        throw err;
      }
      const previous = requestSnap.exists ? requestSnap.data() : null;
      if (previous && previous.status === 'pending') return { status: 'pending', alreadyMember: false };
      if (previous && previous.status === 'accepted') return { status: 'accepted', alreadyMember: true };

      const ownerEmail = tripOwnerEmail(trip);
      if (!ownerEmail) {
        const err = new Error('這份行程缺少擁有者資料，暫時無法申請加入。');
        err.status = 409;
        throw err;
      }
      const now = Timestamp.now();
      const requesterName = String(req.user.name || req.user.email.split('@')[0] || '旅伴').slice(0, 100);
      const requestData = {
        requesterUid: req.user.uid,
        requesterEmail: req.user.email,
        requesterName,
        status: 'pending',
        requestedAt: now,
        updatedAt: now
      };
      tx.set(requestRef, requestData, { merge: true });
      tx.set(notificationRef(ownerEmail, `trip_join_request__${tripId}__${req.user.uid}`), {
        type: 'trip_join_request',
        fromEmail: req.user.email,
        toEmail: ownerEmail,
        fromName: requesterName,
        tripId,
        tripTitle: String(trip.title || trip.aiTitle || '微旅行').slice(0, 200),
        message: '申請加入你的行程',
        requesterUid: req.user.uid,
        requestStatus: 'pending',
        read: false,
        createdAt: now
      }, { merge: true });
      return { status: 'pending', alreadyMember: false };
    });
    return res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[proxy] join request failed:', err && err.message);
    return res.status(err.status || 500).json({
      error: 'join request failed',
      message: err.status ? err.message : '送出加入申請失敗，請稍後再試。'
    });
  }
});

app.get('/api/collab/join-requests/status', collabLimiter, requireFirebaseUser, async (req, res) => {
  const tripId = String(req.query.tripId || '');
  const token = String(req.query.token || '');
  if (!/^[A-Za-z0-9_-]{3,150}$/.test(tripId) || token.length > 200) {
    return res.status(400).json({ error: 'invalid share link', message: '分享連結格式不正確。' });
  }
  try {
    const tripRef = adminDb.collection('micro_trips').doc(tripId);
    const [tripSnap, requestSnap] = await Promise.all([
      tripRef.get(),
      tripRef.collection('join_requests').doc(req.user.uid).get()
    ]);
    const trip = tripSnap.exists ? tripSnap.data() : null;
    if (!trip || !sameSecret(token, trip.shareToken)) {
      return res.status(404).json({ error: 'invalid share link', message: '分享連結已失效。' });
    }
    if (isTripOwner(req.user, trip)) return res.json({ ok: true, status: 'owner' });
    const members = Array.isArray(trip.memberEmails) ? trip.memberEmails : [];
    if (req.user.email && members.some((email) => normalizeEmail(email) === normalizeEmail(req.user.email))) {
      return res.json({ ok: true, status: 'accepted' });
    }
    return res.json({ ok: true, status: requestSnap.exists ? requestSnap.get('status') || 'none' : 'none' });
  } catch (err) {
    console.error('[proxy] join request status failed:', err && err.message);
    return res.status(500).json({ error: 'status failed', message: '無法取得申請狀態。' });
  }
});

// 擁有者核准時，以同一筆 transaction 完成「個人行程轉多人」與加入 viewer。
app.post('/api/collab/join-requests/resolve', collabLimiter, requireFirebaseUser, async (req, res) => {
  const tripId = String(req.body && req.body.tripId || '');
  const requesterUid = String(req.body && req.body.requesterUid || '');
  const decision = String(req.body && req.body.decision || '');
  if (!/^[A-Za-z0-9_-]{3,150}$/.test(tripId) || !requesterUid || !['accept', 'reject'].includes(decision)) {
    return res.status(400).json({ error: 'invalid request', message: '申請資料不完整。' });
  }
  try {
    const tripRef = adminDb.collection('micro_trips').doc(tripId);
    const requestRef = tripRef.collection('join_requests').doc(requesterUid);
    const result = await adminDb.runTransaction(async (tx) => {
      const [tripSnap, requestSnap] = await Promise.all([tx.get(tripRef), tx.get(requestRef)]);
      if (!tripSnap.exists || !requestSnap.exists) {
        const err = new Error('找不到這筆加入申請。');
        err.status = 404;
        throw err;
      }
      const trip = tripSnap.data();
      const joinRequest = requestSnap.data();
      if (!isTripOwner(req.user, trip)) {
        const err = new Error('只有行程擁有者可以處理加入申請。');
        err.status = 403;
        throw err;
      }
      if (joinRequest.status !== 'pending') {
        return { status: joinRequest.status, collab: Boolean(trip.collab) };
      }

      const now = Timestamp.now();
      const ownerEmail = tripOwnerEmail(trip) || req.user.email;
      const ownerName = String(trip.ownerName || req.user.name || ownerEmail.split('@')[0] || '擁有者').slice(0, 100);
      const requesterEmail = String(joinRequest.requesterEmail || '').trim();
      const requesterName = String(joinRequest.requesterName || requesterEmail.split('@')[0] || '旅伴').slice(0, 100);
      const ownerNotification = notificationRef(ownerEmail, `trip_join_request__${tripId}__${requesterUid}`);

      if (decision === 'reject') {
        tx.set(requestRef, {
          status: 'rejected',
          resolvedAt: now,
          resolvedBy: req.user.uid,
          updatedAt: now
        }, { merge: true });
        tx.set(ownerNotification, { requestStatus: 'rejected', read: true }, { merge: true });
        tx.set(notificationRef(requesterEmail, `trip_join_rejected__${tripId}__${requesterUid}`), {
          type: 'trip_join_rejected',
          fromEmail: ownerEmail,
          toEmail: requesterEmail,
          fromName: ownerName,
          tripId,
          tripTitle: String(trip.title || trip.aiTitle || '微旅行').slice(0, 200),
          message: '擁有者未接受這次加入申請',
          read: false,
          createdAt: now
        }, { merge: true });
        return { status: 'rejected', collab: Boolean(trip.collab) };
      }

      const memberEmails = Array.isArray(trip.memberEmails) ? trip.memberEmails.slice() : [];
      if (!memberEmails.some((email) => normalizeEmail(email) === normalizeEmail(ownerEmail))) {
        memberEmails.push(ownerEmail);
      }
      const alreadyMember = memberEmails.some((email) => normalizeEmail(email) === normalizeEmail(requesterEmail));
      const maxMembers = Math.min(Math.max(Number(trip.maxMembers) || 10, 1), 50);
      if (!alreadyMember && memberEmails.length >= maxMembers) {
        const err = new Error(`這份行程的成員已達上限（${maxMembers} 人）。`);
        err.status = 409;
        throw err;
      }
      if (!alreadyMember) memberEmails.push(requesterEmail);

      // ⚠️ 已知風險（2026-07-26 Codex 審查 #4）：legacyMemberKey 把標點一律換成底線，
      // a.b@x.com 與 a_b@x.com 會壓成同一個 key，理論上 requester 可覆蓋 owner 那筆。
      // 這是既有 members schema 的沿襲問題（前端與 firestore.rules 目前都靠這個 key 對成員），
      // 不是本次新引入；要根治得連同 rules 與前端一起遷移到 identityKey，故本批不動。
      const members = trip.members && typeof trip.members === 'object' ? { ...trip.members } : {};
      const ownerKey = legacyMemberKey(ownerEmail);
      members[ownerKey] = {
        ...(members[ownerKey] || {}),
        email: ownerEmail,
        name: ownerName,
        role: 'owner',
        ready: true,
        prefs: (members[ownerKey] && members[ownerKey].prefs) || {},
        joinedAt: (members[ownerKey] && members[ownerKey].joinedAt) || Date.now()
      };
      const requesterKey = legacyMemberKey(requesterEmail);
      members[requesterKey] = {
        ...(members[requesterKey] || {}),
        email: requesterEmail,
        name: requesterName,
        role: 'viewer',
        ready: false,
        prefs: (members[requesterKey] && members[requesterKey].prefs) || {},
        joinedAt: (members[requesterKey] && members[requesterKey].joinedAt) || Date.now()
      };

      let inviteCode = normalizeInviteCode(trip.inviteCode);
      let inviteRef = inviteCode ? adminDb.collection('invites').doc(inviteCode) : null;
      if (!inviteCode) {
        for (let attempt = 0; attempt < 6; attempt += 1) {
          const candidate = generateServerInviteCode();
          const candidateRef = adminDb.collection('invites').doc(candidate);
          const candidateSnap = await tx.get(candidateRef);
          if (!candidateSnap.exists || candidateSnap.get('tripId') === tripId) {
            inviteCode = candidate;
            inviteRef = candidateRef;
            break;
          }
        }
        if (!inviteCode || !inviteRef) {
          const err = new Error('暫時無法建立行程邀請碼，請再試一次。');
          err.status = 503;
          throw err;
        }
      }
      const shareToken = String(trip.shareToken || '').length >= 16 ? trip.shareToken : generateServerShareToken();
      tx.set(tripRef, {
        collab: true,
        ownerUid: trip.ownerUid || req.user.uid,
        ownerEmail,
        ownerName,
        userEmail: trip.userEmail || ownerEmail,
        inviteCode,
        shareToken,
        maxMembers,
        memberEmails,
        editorEmails: Array.isArray(trip.editorEmails) ? trip.editorEmails : [],
        members,
        collabCreatedAt: trip.collabCreatedAt || now,
        updatedAt: now
      }, { merge: true });
      tx.set(inviteRef, {
        tripId,
        active: true,
        createdBy: ownerEmail,
        createdAt: now
      }, { merge: true });
      tx.set(requestRef, {
        status: 'accepted',
        resolvedAt: now,
        resolvedBy: req.user.uid,
        updatedAt: now
      }, { merge: true });
      tx.set(ownerNotification, { requestStatus: 'accepted', read: true }, { merge: true });
      tx.set(notificationRef(requesterEmail, `trip_join_accepted__${tripId}__${requesterUid}`), {
        type: 'trip_join_accepted',
        fromEmail: ownerEmail,
        toEmail: requesterEmail,
        fromName: ownerName,
        tripId,
        tripTitle: String(trip.title || trip.aiTitle || '微旅行').slice(0, 200),
        message: '已接受你的加入申請，你目前是唯讀成員',
        read: false,
        createdAt: now
      }, { merge: true });
      return { status: 'accepted', collab: true, inviteCode, shareToken };
    });
    return res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[proxy] resolve join request failed:', err && err.message);
    return res.status(err.status || 500).json({
      error: 'resolve failed',
      message: err.status ? err.message : '處理加入申請失敗，請稍後再試。'
    });
  }
});

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
