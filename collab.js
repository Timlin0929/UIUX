/**
 * collab.js — WanderAI 多人共同建立行程模組（window.WAI_COLLAB）
 *
 * 範圍（依產品決策）：
 *   - 同看一份 + 團體生成 + 成員清單（暫不做即時逐欄共編）。
 *   - 加入者預設 viewer；owner 可調整每人角色。
 *   - 彙整：節奏「多數決」、預算「平均」、興趣「聯集（票數排序）」、禁忌「聯集」。
 *   - 生成：owner 隨時可生成。
 *   - 每團上限 10 人；提供訪客（不登入）唯讀分享連結。
 *
 * 資料模型（沿用既有 micro_trips，加上協作欄位）：
 *   micro_trips/{tripId}
 *     collab:true, ownerUid, ownerEmail, ownerName,
 *     inviteCode, shareToken, guestReadable:true, maxMembers:10,
 *     memberEmails:[...]            // 供 array-contains 查「我加入的」
 *     members:{ <ekey>:{ email,name,role,ready,prefs{interests,pace,avoid,avoidTags,budget,desiredSpots},joinedAt } }
 *     userEmail: ownerEmail         // 保留既有欄位，owner 既有查詢仍找得到
 *   invites/{CODE} -> { tripId, active:true, createdBy, createdAt }
 *
 * 純函式（彙整 / 產碼）不碰 Firestore，可用 node 單元測試。
 * 需要 Firestore 的函式在呼叫時才讀全域 firebaseDb / firebaseAuth / firebase（CDN）。
 */
window.WAI_COLLAB = (function () {
  'use strict';

  var MAX_MEMBERS = 10;
  // base32，去掉易混字 0/O/1/I
  var CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  // ── 產碼 / 正規化 ──
  function randFrom(alphabet, n) {
    var s = '';
    for (var i = 0; i < n; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
    return s;
  }
  function generateInviteCode() {
    var raw = randFrom(CODE_ALPHABET, 8);
    return raw.slice(0, 4) + '-' + raw.slice(4); // 例：AB3D-7K9P
  }
  function generateShareToken() {
    return randFrom(CODE_ALPHABET, 20);
  }
  function normalizeCode(code) {
    return String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  }
  function emailKey(email) {
    return String(email || '').toLowerCase().replace(/[^a-z0-9]/g, '_');
  }

  // ── 預算解析 / 格式化 ──
  function parseBudgetNumber(b) {
    if (typeof b === 'number') return b > 0 ? b : 0;
    var m = String(b || '').replace(/[,\s]/g, '').match(/(\d+)/);
    return m ? parseInt(m[1], 10) : 0;
  }
  function formatBudget(n) {
    return '$' + Math.round(n).toLocaleString('en-US');
  }

  // ── 節奏多數決（平手取較放鬆者）──
  // 越前面越放鬆；平手時 index 小者（較放鬆）優先。
  var PACE_ORDER = ['悠閒', '平衡', '輕快'];
  function majorityPace(paces) {
    var counts = {};
    (paces || []).filter(Boolean).forEach(function (p) { counts[p] = (counts[p] || 0) + 1; });
    var best = null, bestN = -1;
    // 先掃已知節奏（保證平手偏放鬆）
    PACE_ORDER.forEach(function (p) {
      var n = counts[p] || 0;
      if (n > bestN) { bestN = n; best = p; }
    });
    // 再掃自訂節奏（嚴格大於才取代，維持平手偏放鬆）
    Object.keys(counts).forEach(function (p) {
      if (PACE_ORDER.indexOf(p) === -1 && counts[p] > bestN) { bestN = counts[p]; best = p; }
    });
    return (bestN > 0 && best) ? best : '平衡';
  }

  // ── 團體 profile 彙整（純函式）──
  function aggregateGroupProfile(members) {
    var list = Array.isArray(members) ? members : Object.keys(members || {}).map(function (k) { return members[k]; });
    var interestVotes = {};
    var paces = [];
    var budgets = [];
    var avoidMap = {};   // term -> [names]
    var desired = [];
    list.forEach(function (m) {
      if (!m) return;
      var pf = m.prefs || m.preferences || {};
      var who = m.name || m.email || '';
      (pf.interests || []).forEach(function (i) { if (i) interestVotes[i] = (interestVotes[i] || 0) + 1; });
      if (pf.pace) paces.push(pf.pace);
      var bn = parseBudgetNumber(pf.budget);
      if (bn > 0) budgets.push(bn);
      (pf.avoidTags || []).forEach(function (t) {
        if (!t) return;
        if (!avoidMap[t]) avoidMap[t] = [];
        if (who) avoidMap[t].push(who);
      });
      if (pf.avoid) {
        String(pf.avoid).split(/[、,，;；\n]+/).map(function (s) { return s.trim(); }).filter(Boolean).forEach(function (a) {
          if (!avoidMap[a]) avoidMap[a] = [];
          if (who) avoidMap[a].push(who);
        });
      }
      if (pf.desiredSpots && String(pf.desiredSpots).trim()) {
        desired.push({ by: who, text: String(pf.desiredSpots).trim() });
      }
    });
    var interests = Object.keys(interestVotes).sort(function (a, b) { return interestVotes[b] - interestVotes[a]; });
    var avoid = Object.keys(avoidMap).map(function (term) {
      var uniq = [];
      avoidMap[term].forEach(function (w) { if (uniq.indexOf(w) === -1) uniq.push(w); });
      return { term: term, by: uniq };
    });
    return {
      memberCount: list.length,
      interests: interests,
      interestVotes: interestVotes,
      pace: majorityPace(paces),
      budget: budgets.length ? formatBudget(budgets.reduce(function (a, b) { return a + b; }, 0) / budgets.length) : '',
      avoid: avoid,
      desired: desired
    };
  }

  // 把團體 profile 轉成 prompt 用的偏好行（取代單人 buildPreferenceLines）。
  function buildGroupPreferenceLines(profile) {
    var lines = [];
    lines.push('行程節奏：' + profile.pace + '（團體多數決）');
    lines.push('團體興趣方向：' + (profile.interests.join('、') || '多元體驗') +
      '（綜合 ' + profile.memberCount + ' 位成員，依被選票數排序，越前面越多人想去）');
    if (profile.budget) {
      lines.push('團體預算：每人約 ' + profile.budget + '（取全員平均，盡量不讓預算低的人超支）');
    }
    if (profile.avoid && profile.avoid.length) {
      var txt = profile.avoid.map(function (a) {
        var t = a.term.replace(/^#/, '');
        return a.by.length ? (t + '(' + a.by.join('、') + ')') : t;
      }).join('；');
      lines.push('⚠️ 個人禁忌／需避免（任一成員提出即為全團硬性限制，務必全程遵守，含餐廳與景點挑選）：' + txt);
    }
    if (profile.desired && profile.desired.length) {
      lines.push('成員希望景點：' + profile.desired.map(function (d) {
        return d.by ? (d.text + '(' + d.by + ')') : d.text;
      }).join('；') + '（盡量都安排到；若與上方禁忌衝突，一律以禁忌為最高優先，改以鄰近不衝突替代並於 reply 說明）');
    }
    return lines;
  }

  // ── 角色 / 共用工具（純）──
  function roleLabel(role) {
    return ({ owner: '擁有者', editor: '可編輯', viewer: '唯讀', guest: '訪客' })[role] || '唯讀';
  }
  function canEdit(role) { return role === 'owner' || role === 'editor'; }
  function isFull(memberEmails) { return (memberEmails || []).length >= MAX_MEMBERS; }

  // ════════════════════════════════════════════════════
  // 以下為需要 Firestore 的函式（呼叫時才讀全域 firebaseDb）
  // ════════════════════════════════════════════════════
  function db() {
    if (typeof firebaseDb === 'undefined' || !firebaseDb) {
      throw new Error('Firebase 尚未初始化，無法使用多人協作功能。');
    }
    return firebaseDb;
  }
  function serverTs() { return firebase.firestore.FieldValue.serverTimestamp(); }

  // 產生不重複的邀請碼（最多重試數次）
  async function reserveUniqueCode() {
    for (var attempt = 0; attempt < 6; attempt++) {
      var code = generateInviteCode();
      var ref = db().collection('invites').doc(normalizeCode(code));
      var snap = await ref.get();
      if (!snap.exists) return { code: code, ref: ref };
    }
    throw new Error('邀請碼產生失敗，請再試一次。');
  }

  // owner 建立共用行程：寫 micro_trips 協作欄位 + invites/{code}。
  // trip：既有 newTrip 物件；owner：{ uid,email,name,prefs }
  async function createSharedTrip(trip, owner) {
    var reserved = await reserveUniqueCode();
    var code = reserved.code;
    var shareToken = generateShareToken();
    var ekey = emailKey(owner.email);
    var members = {};
    members[ekey] = {
      email: owner.email,
      name: owner.name || (owner.email || '擁有者'),
      role: 'owner',
      ready: true,
      prefs: normalizePrefs(owner.prefs),
      joinedAt: Date.now()
    };
    var tripRef = db().collection('micro_trips').doc(trip.id);
    await tripRef.set({
      id: trip.id,
      // lobby 顯示用的基本欄位（行程內容稍後由 owner 從精靈以 updateSharedTripParams 補上）
      title: trip.title || '未命名共編行程',
      emoji: trip.emoji || '👥',
      days: trip.days || '',
      region: trip.region || '',
      collab: true,
      ownerUid: owner.uid || null,
      ownerEmail: owner.email || null,
      ownerName: owner.name || null,
      inviteCode: code,
      shareToken: shareToken,
      guestReadable: true,
      maxMembers: MAX_MEMBERS,
      memberEmails: [owner.email],
      members: members,
      userEmail: owner.email || 'unknown',
      collabCreatedAt: serverTs()
    }, { merge: true });
    await reserved.ref.set({
      tripId: trip.id,
      active: true,
      createdBy: owner.email || null,
      createdAt: serverTs()
    });
    return { code: code, shareToken: shareToken };
  }

  // 以邀請碼加入：讀 invites → 驗證 → 加 member（預設 viewer）。
  // user：{ uid,email,name,prefs }；回傳該共用行程 doc data（含 id）。
  async function joinByCode(code, user) {
    var norm = normalizeCode(code);
    if (!norm) throw new Error('請輸入邀請碼。');
    var invSnap = await db().collection('invites').doc(norm).get();
    if (!invSnap.exists) throw new Error('找不到這組邀請碼，請確認後重試。');
    var inv = invSnap.data();
    if (inv.active === false) throw new Error('這組邀請碼已被停用。');
    var tripRef = db().collection('micro_trips').doc(inv.tripId);
    var tripSnap = await tripRef.get();
    if (!tripSnap.exists) throw new Error('行程不存在或已被刪除。');
    var data = tripSnap.data();
    var emails = data.memberEmails || [];
    var ekey = emailKey(user.email);
    var already = emails.indexOf(user.email) !== -1;
    if (!already && isFull(emails)) throw new Error('這個行程人數已滿（上限 ' + MAX_MEMBERS + ' 人）。');
    if (!already) {
      // 注意：set(merge) 不支援「點號路徑 key」（會被當字面欄位名），必須用巢狀物件才能寫進 members map。
      var membersPatch = {};
      membersPatch[ekey] = {
        email: user.email,
        name: user.name || (user.email || '旅伴'),
        role: 'viewer', // 預設唯讀
        ready: false,
        prefs: normalizePrefs(user.prefs),
        joinedAt: Date.now()
      };
      await tripRef.set({
        memberEmails: firebase.firestore.FieldValue.arrayUnion(user.email),
        members: membersPatch
      }, { merge: true });
    }
    var fresh = await tripRef.get();
    // alreadyMember 為暫態旗標（不寫進 Firestore），供前端區分「重新加入」與「首次加入」
    return Object.assign({ id: inv.tripId, alreadyMember: already }, fresh.data());
  }

  // 更新共用行程的「行程參數」（title/region/days/budget/people/wizardData…）。
  // 只合併傳入欄位，絕不碰 members / memberEmails / inviteCode 等協作欄位。
  async function updateSharedTripParams(tripId, patch) {
    await db().collection('micro_trips').doc(tripId).set(patch || {}, { merge: true });
  }

  // owner 調整成員角色（巢狀物件 + merge：深合併，只改 role 不動其他欄位）
  async function setMemberRole(tripId, memberEmail, role) {
    var allowed = ['owner', 'editor', 'viewer'];
    if (allowed.indexOf(role) === -1) throw new Error('未知角色：' + role);
    var membersPatch = {};
    membersPatch[emailKey(memberEmail)] = { role: role };
    await db().collection('micro_trips').doc(tripId).set({ members: membersPatch }, { merge: true });
  }

  // 成員更新自己的偏好（興趣/節奏/預算/希望景點；avoid 來自帳號設定）
  async function setMemberPrefs(tripId, memberEmail, prefs) {
    var membersPatch = {};
    membersPatch[emailKey(memberEmail)] = { prefs: normalizePrefs(prefs), ready: true };
    await db().collection('micro_trips').doc(tripId).set({ members: membersPatch }, { merge: true });
  }

  // owner 撤銷整個行程的邀請碼（不再可加入新成員）
  async function revokeInvite(tripId, code) {
    if (code) await db().collection('invites').doc(normalizeCode(code)).set({ active: false }, { merge: true });
  }

  // owner 刪除整個共用行程：清 micro_trips doc（規則允許 owner 刪）+ 停用邀請碼。
  // 用於使用者在「我的微旅行」刪除 collab 行程時連遠端一起清，避免孤兒佔 Firestore。
  async function deleteSharedTrip(tripId, inviteCode) {
    if (inviteCode) {
      try { await db().collection('invites').doc(normalizeCode(inviteCode)).set({ active: false }, { merge: true }); }
      catch (e) { /* 規則禁刪 invites，停用失敗就略過 */ }
    }
    await db().collection('micro_trips').doc(tripId).delete();
  }

  // 訂閱共用行程（成員清單 / 內容即時更新；用於「同看一份」）
  function subscribeSharedTrip(tripId, onChange, onError) {
    return db().collection('micro_trips').doc(tripId).onSnapshot(function (snap) {
      if (!snap.exists) { if (onError) onError(new Error('行程已不存在')); return; }
      onChange(Object.assign({ id: tripId }, snap.data()));
    }, function (err) { if (onError) onError(err); });
  }

  // 單次讀取一份共用行程（含最新 members），供生成前彙整成員偏好用
  async function getSharedTrip(tripId) {
    var snap = await db().collection('micro_trips').doc(tripId).get();
    if (!snap.exists) return null;
    return Object.assign({ id: tripId }, snap.data());
  }

  // 載入「我以成員身分加入」的共用行程（array-contains 我的 email）
  async function fetchMyCollabTrips(email) {
    if (!email) return [];
    var snap = await db().collection('micro_trips').where('memberEmails', 'array-contains', email).get();
    return snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
  }

  // 訪客唯讀：用 tripId（不可猜的 share 連結帶 token）讀整份行程。
  // 需搭配安全規則：guestReadable==true 才允許讀。
  async function loadGuestTrip(tripId, token) {
    var snap = await db().collection('micro_trips').doc(tripId).get();
    if (!snap.exists) throw new Error('分享的行程不存在或已被刪除。');
    var data = snap.data();
    if (!data.guestReadable) throw new Error('這個行程未開放分享。');
    if (token && data.shareToken && normalizeCode(token) !== normalizeCode(data.shareToken)) {
      throw new Error('分享連結無效。');
    }
    return Object.assign({ id: tripId }, data);
  }

  function buildShareLink(tripId, shareToken, baseHref) {
    var base = baseHref || 'ai-travel-planner-v8.html';
    return base + '?sharedId=' + encodeURIComponent(tripId) + '&token=' + encodeURIComponent(shareToken || '') + '&guest=1';
  }

  // 把任意偏好物件正規化成固定形狀（避免 undefined 寫進 Firestore）
  function normalizePrefs(p) {
    p = p || {};
    return {
      interests: Array.isArray(p.interests) ? p.interests.filter(Boolean) : [],
      pace: p.pace || '平衡',
      avoid: typeof p.avoid === 'string' ? p.avoid : '',
      avoidTags: Array.isArray(p.avoidTags) ? p.avoidTags.filter(Boolean) : [],
      budget: p.budget || '',
      desiredSpots: typeof p.desiredSpots === 'string' ? p.desiredSpots : ''
    };
  }

  return {
    MAX_MEMBERS: MAX_MEMBERS,
    // 純函式（可測）
    generateInviteCode: generateInviteCode,
    generateShareToken: generateShareToken,
    normalizeCode: normalizeCode,
    emailKey: emailKey,
    parseBudgetNumber: parseBudgetNumber,
    formatBudget: formatBudget,
    majorityPace: majorityPace,
    aggregateGroupProfile: aggregateGroupProfile,
    buildGroupPreferenceLines: buildGroupPreferenceLines,
    normalizePrefs: normalizePrefs,
    roleLabel: roleLabel,
    canEdit: canEdit,
    isFull: isFull,
    buildShareLink: buildShareLink,
    // Firestore
    createSharedTrip: createSharedTrip,
    updateSharedTripParams: updateSharedTripParams,
    joinByCode: joinByCode,
    setMemberRole: setMemberRole,
    deleteSharedTrip: deleteSharedTrip,
    setMemberPrefs: setMemberPrefs,
    revokeInvite: revokeInvite,
    subscribeSharedTrip: subscribeSharedTrip,
    getSharedTrip: getSharedTrip,
    fetchMyCollabTrips: fetchMyCollabTrips,
    loadGuestTrip: loadGuestTrip
  };
})();
