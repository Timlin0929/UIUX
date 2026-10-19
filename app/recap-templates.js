/*
 * TravelLink AI recap templates — 回顧短片的「節奏樣板」（純資料）。
 * 把原本寫死在 recap-manifest.js 的時間常數、片長目標與開場方式抽成樣板，
 * manifest 依樣板產時間軸、渲染器依樣板決定開場畫面。
 * 沒有任何相依；瀏覽器 <script> 與 Node require 都可載入。
 *
 * 時間單位一律 ms。targetMs 依真實素材數分四級（計劃 6.1：素材不足就縮短影片，不用假畫面補長度）。
 * segment：站間路線的時間分配——依距離比例，但每段至少 minMs、最多佔全部路線時間的 maxShare，
 *          避免 200 公尺的短程一閃而過、一段長途吃掉整支影片。
 * cover.style：'title' ＝台灣全景俯衝＋標題卡（原本的開場）；
 *              'photoCut' ＝先放一張實景照片（photoMs），硬切到地圖、停半拍（beatMs）再開始畫路線
 *              （參考影片的結構，見 docs/travel-story/RECAP_VIDEO_TEMPLATE_HANDOFF.md）。沒有照片時退回 'title'。
 */
(function (root, factory) {
  var api = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.WAI_RECAP_TEMPLATES = api;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var DEFAULT_ID = 'standard';

  var TEMPLATES = [
    {
      id: 'standard',
      label: '標準',
      desc: '從台灣全景俯衝到路線，到站停一下看照片。',
      coverMs: 3400,
      statsMs: 3000,
      dwellMs: 200,
      photoMs: 2600,
      dayTransitionMs: 1600,
      targetMs: { '0': 14500, '1-2': 18000, '3-5': 23000, '6+': 32000 },
      minRouteMs: 6000,
      segment: { minMs: 900, maxShare: 0.45, ease: 'smooth' },
      cover: { style: 'title' }
    },
    {
      id: 'brisk',
      label: '快節奏',
      desc: '更短、更緊湊，適合 Reels 與限時動態。',
      coverMs: 2200,
      statsMs: 2200,
      dwellMs: 120,
      photoMs: 1800,
      dayTransitionMs: 1100,
      targetMs: { '0': 11000, '1-2': 13500, '3-5': 17000, '6+': 24000 },
      minRouteMs: 4500,
      segment: { minMs: 700, maxShare: 0.4, ease: 'smooth' },
      cover: { style: 'title' }
    },
    {
      id: 'leisurely',
      label: '慢遊',
      desc: '節奏放慢，照片停留更久，適合多日長途。',
      coverMs: 4200,
      statsMs: 3600,
      dwellMs: 400,
      photoMs: 3600,
      dayTransitionMs: 2200,
      targetMs: { '0': 18000, '1-2': 22000, '3-5': 29000, '6+': 40000 },
      minRouteMs: 8000,
      segment: { minMs: 1200, maxShare: 0.45, ease: 'smooth' },
      cover: { style: 'title' }
    },
    {
      id: 'cinematic',
      label: '電影感開場',
      desc: '先放一張實景照片，硬切到地圖、停半拍再開始畫路線。',
      coverMs: 2600,
      statsMs: 2800,
      dwellMs: 200,
      photoMs: 2400,
      dayTransitionMs: 1500,
      targetMs: { '0': 14000, '1-2': 17500, '3-5': 22500, '6+': 31000 },
      minRouteMs: 6000,
      segment: { minMs: 900, maxShare: 0.45, ease: 'linear' },
      cover: { style: 'photoCut', photoMs: 1430, beatMs: 320 }
    }
  ];

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  // 找不到的 id 一律退回標準樣板（前端送來的值不可信）
  function getTemplate(id) {
    var key = String(id || DEFAULT_ID);
    var i;
    for (i = 0; i < TEMPLATES.length; i += 1) {
      if (TEMPLATES[i].id === key) return clone(TEMPLATES[i]);
    }
    return getTemplate(DEFAULT_ID);
  }

  function listTemplates() {
    return TEMPLATES.map(function (t) { return { id: t.id, label: t.label, desc: t.desc }; });
  }

  function hasTemplate(id) {
    return TEMPLATES.some(function (t) { return t.id === String(id || ''); });
  }

  return {
    DEFAULT_ID: DEFAULT_ID,
    getTemplate: getTemplate,
    listTemplates: listTemplates,
    hasTemplate: hasTemplate
  };
}));
