/**
 * friends.js — WanderAI 好友模組（window.WAI_FRIENDS）
 *
 * 範圍（Week4 D1；群組功能已於 UIUX 調整時移除）：
 *   - 好友：邀請(pending)→接受(accepted)；單方刪除=拒絕/取消/解除三合一。
 *   - 公開檔案 user_profiles：好友 email 搜尋用的最小鏡像（users/{uid} 僅本人可讀）。
 *
 * 資料模型（★schema 需與 Android 對齊，週會確認）：
 *   user_profiles/{uid}    -> { uid, email, emailLower, name, emoji, updatedAt }
 *   friendships/{docId}    -> { emails:[a,b], fromEmail, toEmail, names:{<ekey>:name},
 *                               status:'pending'|'accepted', createdAt, acceptedAt }
 *                              docId = 兩個 emailKey 排序後以 '__' 相接（防重複邀請）
 *
 * 慣例比照 collab.js：IIFE、呼叫時才讀全域 firebaseDb；emailKey 直接複用 WAI_COLLAB.emailKey
 * （index.html 的 <script> 順序保證 collab.js 先載入）。
 */
window.WAI_FRIENDS = (function () {
  'use strict';

  function db() {
    if (typeof firebaseDb === 'undefined' || !firebaseDb) {
      throw new Error('Firebase 尚未初始化，無法使用好友功能。');
    }
    return firebaseDb;
  }
  function serverTs() { return firebase.firestore.FieldValue.serverTimestamp(); }
  function ekey(email) { return window.WAI_COLLAB.emailKey(email); }

  // ── 純函式 ──
  // 好友關係文件 id：兩端 emailKey 排序後相接，A→B 與 B→A 天生撞同一 doc（防重複邀請）
  function friendshipId(emailA, emailB) {
    return [ekey(emailA), ekey(emailB)].sort().join('__');
  }

  // ── user_profiles：最小公開檔案 ──
  // 登入/註冊時同步自己的公開檔案（好友搜尋靠它）。安全規則驗 email==token，只能寫自己的。
  async function syncMyProfile(me) {
    if (!me || !me.uid || !me.email) return;
    await db().collection('user_profiles').doc(me.uid).set({
      uid: me.uid,
      email: me.email,
      emailLower: String(me.email).trim().toLowerCase(), // 搜尋鍵：等式查詢免大小寫問題
      name: me.name || me.email,
      emoji: me.emoji || '🌟',
      updatedAt: serverTs()
    }, { merge: true });
  }

  // 以 email 精確查公開檔案（找不到回 null——對方需登入過 WanderAI 才有檔案）
  async function findProfileByEmail(email) {
    var q = String(email || '').trim().toLowerCase();
    if (!q) return null;
    var snap = await db().collection('user_profiles').where('emailLower', '==', q).limit(1).get();
    return snap.empty ? null : snap.docs[0].data();
  }

  // ── friendships：邀請 → 接受 ──
  // 送出邀請。先查重：pending→「已有待確認邀請」、accepted→「已是好友」。
  // me/target = { email, name }；createdAt 必須 serverTimestamp（規則驗 ==request.time）。
  async function sendInvite(me, target) {
    if (!me || !me.email) throw new Error('請先登入。');
    if (!target || !target.email) throw new Error('找不到對方資料。');
    if (ekey(me.email) === ekey(target.email)) throw new Error('不能加自己為好友。');
    var id = friendshipId(me.email, target.email);
    var ref = db().collection('friendships').doc(id);
    var existing = await ref.get();
    if (existing.exists) {
      var st = existing.data().status;
      if (st === 'accepted') throw new Error('你們已經是好友了。');
      var from = existing.data().fromEmail;
      throw new Error(from === me.email
        ? '已送出過邀請，等待對方確認中。'
        : '對方已邀請過你，請到「待確認邀請」接受。');
    }
    var names = {};
    names[ekey(me.email)] = me.name || me.email;
    names[ekey(target.email)] = target.name || target.email;
    await ref.set({
      emails: [me.email, target.email],
      fromEmail: me.email,
      toEmail: target.email,
      names: names,
      status: 'pending',
      createdAt: serverTs()
    });
    return id;
  }

  // 接受邀請（只有 toEmail 本人可呼叫；規則限 pending→accepted 且只動 status/acceptedAt）
  async function acceptInvite(friendshipDocId) {
    await db().collection('friendships').doc(friendshipDocId).update({
      status: 'accepted',
      acceptedAt: serverTs()
    });
  }

  // 刪除好友關係：拒絕邀請／取消已送邀請／解除好友（規則允許任一當事人）
  async function removeFriendship(friendshipDocId) {
    await db().collection('friendships').doc(friendshipDocId).delete();
  }

  // 訂閱與我有關的所有好友關係（array-contains 我的 email → 規則查詢可證明）。
  // cb 收 [{id, ...data}]，呼叫端自行分三堆：accepted／收到的 pending／送出的 pending。
  function subscribeFriendships(myEmail, onChange, onError) {
    if (!myEmail) return function () {};
    return db().collection('friendships').where('emails', 'array-contains', myEmail)
      .onSnapshot(function (snap) {
        onChange(snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }));
      }, function (err) { if (onError) onError(err); });
  }

  return {
    friendshipId: friendshipId,
    syncMyProfile: syncMyProfile,
    findProfileByEmail: findProfileByEmail,
    sendInvite: sendInvite,
    acceptInvite: acceptInvite,
    removeFriendship: removeFriendship,
    subscribeFriendships: subscribeFriendships
  };
})();
