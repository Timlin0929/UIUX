/*
 * 營業時間解析：全站唯一來源（window.WAI_HOURS）。
 *
 * 為什麼要抽出來：原本 explore 與 planner 有「三份」各自的解析
 * （extractDayHoursWindow / formatDayBusinessHours / getBusinessHoursWarning），
 * 各自用 lines[jsDay-1] 猜「週一起 7 行」，於是同一家店在不同畫面會給出不同答案，
 * 甚至對字面寫著「休息」的行顯示營業。這裡收斂成一個函式，三處共用。
 *
 * 設計原則：寧可回 unknown，也不要猜。
 *   - 有星期標籤 → 只認標籤（含「星期一至星期五」這類區間）
 *   - 完全沒有標籤且剛好 7 段 → 才退回「週一起」索引推測
 *   - 其餘一律 unknown（呼叫端不顯示、不判公休、不刪站）
 *
 * 同時被 Node 測試載入（module.exports），故不可依賴任何瀏覽器 API。
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WAI_HOURS = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // 索引一律用 JS 的 getDay()：0=日 … 6=六
  var ZH = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  var ZH2 = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];
  var ZH3 = ['禮拜日', '禮拜一', '禮拜二', '禮拜三', '禮拜四', '禮拜五', '禮拜六'];
  var EN = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  var EN3 = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  var CLOSED_RE = /休息|公休|closed|不營業|休業/i;
  // 「24 小時營業」沒有時間區間，但語意明確＝全天營業，不可判成 unknown
  // 涵蓋「24 小時營業」「全天候開放」「全天開放」「終年開放」等（戶外景點大量使用）
  var ALLDAY_RE = /24\s*小時|全天候?(?:營業|開放)?|全年無休|終年開放|open\s*24|24\s*hours?/i;
  var RANGE_SEP = /\s*(?:至|到|~|～|-|–|—|through|to)\s*/;

  function splitSegments(str) {
    return String(str || '').split(/\r?\n|；|;/).map(function (s) { return s.trim(); }).filter(Boolean);
  }

  // 這一段文字提到的是星期幾？回傳 0-6 的陣列（可能是區間，如「星期一至星期五」→ [1,2,3,4,5]）
  function daysInSegment(seg) {
    var text = String(seg || '');
    var lower = text.toLowerCase();
    // 先切出「標籤區」：冒號前面通常是星期，避免把時間文字誤判
    var head = text.split(/[:：]/)[0] || text;
    var headLower = head.toLowerCase();

    // ★ 必須「錨定在字串開頭」：只有寫在最前面的才是這一段的日別標籤。
    //   若用非錨定的 indexOf，「非星期三休息日」這種說明文字會被當成星期三專屬 → 誤判公休。
    function indexOfDay(s) {
      var t = String(s || '').replace(/^[\s　]+/, '');   // 去前導半形/全形空白
      var tl = t.toLowerCase();
      for (var i = 0; i < 7; i++) {
        if (t.indexOf(ZH[i]) === 0 || t.indexOf(ZH2[i]) === 0 || t.indexOf(ZH3[i]) === 0) return i;
      }
      for (var j = 0; j < 7; j++) {
        if (tl.indexOf(EN[j]) === 0) return j;                       // 英文全名
        if (new RegExp('^' + EN3[j] + '\\b').test(tl)) return j;      // 三字縮寫
      }
      return -1;
    }

    // 區間：以分隔符切成兩端，兩端都能解析成星期才算區間
    var parts = head.split(RANGE_SEP).filter(Boolean);
    if (parts.length >= 2) {
      var a = indexOfDay(parts[0]);
      var b = indexOfDay(parts[parts.length - 1]);
      if (a >= 0 && b >= 0) {
        var out = [];
        for (var k = 0; k < 7; k++) {           // 允許跨週（如 週五至週一）
          var d = (a + k) % 7;
          out.push(d);
          if (d === b) return out;
        }
        return out;
      }
    }
    // indexOfDay 已錨定在開頭，因此 head（冒號前）與整段開頭都試一次即可。
    var single = indexOfDay(head);
    if (single >= 0) return [single];
    var atHead = indexOfDay(text);   // 沒有冒號的寫法，如「星期三 休息」
    void lower; void headLower;
    return atHead >= 0 ? [atHead] : [];
  }

  // 這段文字裡「有沒有出現任何星期字樣」（不限段首）。用來辨識「每日…，週三休息」這類
  // 各天不同的自由寫法——它不能被當成「每天都一樣」。
  function mentionsAnyDay(seg) {
    var t = String(seg || '');
    var tl = t.toLowerCase();
    for (var i = 0; i < 7; i++) {
      if (t.indexOf(ZH[i]) >= 0 || t.indexOf(ZH2[i]) >= 0 || t.indexOf(ZH3[i]) >= 0) return true;
      if (tl.indexOf(EN[i]) >= 0) return true;
      if (new RegExp('\\b' + EN3[i] + '\\b').test(tl)) return true;
    }
    return false;
  }

  function parseTimeWindow(seg) {
    // 分隔符含 to（英文寫法 09:00 to 17:00）
    var m = String(seg || '').match(/(\d{1,2}):(\d{2})\s*(?:[–\-~～]+|to)\s*(\d{1,2}):(\d{2})/i);
    if (!m) return null;
    var h1 = Number(m[1]), n1 = Number(m[2]), h2 = Number(m[3]), n2 = Number(m[4]);
    // 時間值必須合法：原本不檢查，「25:99-26:99」會被當成正常營業時間排進行程
    if (!(h1 >= 0 && h1 <= 23 && n1 >= 0 && n1 <= 59 && h2 >= 0 && h2 <= 23 && n2 >= 0 && n2 <= 59)) return null;
    var open = h1 * 60 + n1;
    var close = h2 * 60 + n2;
    return { open: open, close: close < open ? close + 1440 : close };   // 跨午夜 → 加一天
  }

  /**
   * 判斷某一天的營業狀態。
   * @param {string} businessHoursStr 原始營業時間字串
   * @param {string} isoDate 'YYYY-MM-DD'；缺少時回 unknown
   * @returns {{status:'open'|'closed'|'unknown', label:string, open?:number, close?:number}}
   */
  function parseDayStatus(businessHoursStr, isoDate) {
    var UNKNOWN = { status: 'unknown', label: '' };
    if (!businessHoursStr) return UNKNOWN;
    var segs = splitSegments(businessHoursStr);
    if (!segs.length) return UNKNOWN;
    if (!isoDate) return UNKNOWN;
    var dt = new Date(isoDate + 'T00:00:00');
    if (isNaN(dt.getTime())) return UNKNOWN;
    var jsDay = dt.getDay();

    // 有沒有任何一段帶星期標籤？
    var labelled = segs.map(daysInSegment);
    var hasLabels = labelled.some(function (d) { return d.length > 0; });

    var seg = null;
    if (hasLabels) {
      for (var i = 0; i < segs.length; i++) {
        if (labelled[i].indexOf(jsDay) >= 0) { seg = segs[i]; break; }
      }
      if (seg === null) return UNKNOWN;   // 有標籤卻沒有這一天 → 不臆測
    } else if (segs.length === 7) {
      seg = segs[jsDay === 0 ? 6 : jsDay - 1];   // 無標籤但剛好 7 段 → 週一起推測
    } else if (segs.length === 1) {
      // 單段且無星期標籤（如「10:00–22:00」「24 小時營業」「全天候開放」）＝每天適用。
      // 但若句中「提及」某個星期（如「每日 09:00-18:00，週三休息」），代表各天並不相同，
      // 而這種自由文字無法可靠拆出每天狀態 → 一律 unknown，不可把整句套到每一天
      //（否則星期一也會因為句中有「休息」二字被誤判公休）。
      if (mentionsAnyDay(segs[0])) return { status: 'unknown', label: segs[0] };
      seg = segs[0];
    } else {
      return UNKNOWN;
    }

    if (CLOSED_RE.test(seg)) return { status: 'closed', label: seg };
    if (ALLDAY_RE.test(seg)) return { status: 'open', label: seg, open: 0, close: 1440 };
    var win = parseTimeWindow(seg);
    if (!win) return { status: 'unknown', label: seg };
    return { status: 'open', label: seg, open: win.open, close: win.close };
  }

  return { parseDayStatus: parseDayStatus, splitSegments: splitSegments, daysInSegment: daysInSegment };
}));
