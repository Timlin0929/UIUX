
  let currentItineraryId = 'TRIP-EMPTY';
  let currentTripTitle = '';
  let currentTripWindow = { start: '', end: '' };
  let currentTripRegion = '';
  let currentInviteCode = '';
  let collabReadOnly = false; // 多人共作：viewer / 訪客唯讀模式（變更不寫回共用行程）
  let collabRole = '';
  let currentTripIsCollab = false;
  let currentTripStatus = 'planning'; // 'planning' | 'ongoing' | 'completed'
  let currentStopIndex = -1;
  let currentTripStartedAt = null;
  let currentTripMembers = null;   // 共編成員 map（members[ekey]）
  let currentTripOwnerName = '';
  let currentTripShareToken = '';
  let currentTripDepartureDate = '';
  const isPrototypeMode = true;
  let isReplanning = false;
  let draggingStopId = null;
  let activeStopMenuId = null;
  let isModifyWindowOpen = false;
  let modifyTargetStopId = null;
  let modifySource = 'wall';
  let selectedModifySpotId = null;
  let selectedModifyStartTime = '';
  let selectedModifyEndTime = '';
  let activeTravelToolTab = 'import';
  let importedTravelResult = null;
  let importedTravelPinId = null;
  let importedTravelDraft = '';
  let posterCharacterDraft = '';
  let posterGeneratedImageBase64 = null;
  let posterImageGenerating = false;
  let posterImageUploadUrl = null;
  let posterImageUploading = false;
  let posterImageUploadPromise = null;
  let importedTravelPinSerial = 0;
  let replanStopSerial = 0;
  const GEMINI_MODEL = 'gemini-3-flash-preview';
  const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
  const GEMINI_LOCAL_KEY = 'TRAVEL_GEMINI_API_KEY';
  // 後端代理模式：API_PROXY_BASE 設了就走同源代理（/api/vertex），金鑰由伺服器注入、不進前端。
  // 未設則回退直連 Google（需前端自帶 VERTEX_API_KEY，僅本機開發用）。
  const VERTEX_PROXY_BASE = ((window.TRAVEL_APP_CONFIG && window.TRAVEL_APP_CONFIG.API_PROXY_BASE) || '').replace(/\/$/, '');
  const VERTEX_HOST = VERTEX_PROXY_BASE ? (VERTEX_PROXY_BASE + '/vertex') : 'https://aiplatform.googleapis.com';
  const VERTEX_API_BASE = `${VERTEX_HOST}/v1`;
  const VERTEX_LOCAL_KEY = 'TRAVEL_VERTEX_API_KEY';
  const VERTEX_LOCAL_PROJECT = 'TRAVEL_VERTEX_PROJECT_ID';
  const ACTIVE_TRIP_LOCAL_KEY = 'wai_active_trip_id';
  const aiConversationHistory = [];
  let isAiResponding = false;
  let currentTripPreferences = {};
  let aiWelcomeSignature = '';
  let tripSessionId = `${currentItineraryId || 'prototype-empty'}-${Date.now()}`;
  let firebaseDb = null;
  let firebaseStorage = null;
  let firebaseAuth = null;
  let firebaseEnabled = false;
  const geocodeCache = new Map();
  const scenicPointCache = new Map();
  const placeSearchCache = new Map();
  const tdxSpotsCache = new Map();
  const tdxParkingCache = new Map();
  const TDX_AUTH_URL = 'https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token';
  // TDX 走後端代理：client_credentials 已移到 server/.env（不可進前端），token 由代理處理。
  // 未設 API_PROXY_BASE（本機直連開發）才會走 tdx.transportdata.tw 並需要前端憑證。
  const TDX_PROXIED = !!VERTEX_PROXY_BASE;
  // 景點改用新版 odata Attraction（舊 basic 的 v2/Tourism/ScenicSpot 已退役回 404）；
  // 縣市過濾用 PostalAddress/City（LocatedCities 多為空、City eq 過濾一律 0 筆，2026-07 實測）。
  const TDX_SCENIC_BASE = TDX_PROXIED
    ? `${VERTEX_PROXY_BASE}/tdx/V2/Tourism/Attraction`
    : 'https://tdx.transportdata.tw/api/tourism/service/odata/V2/Tourism/Attraction';
  const TDX_PARKING_BASE = TDX_PROXIED
    ? `${VERTEX_PROXY_BASE}/tdx/v1/Parking/OffStreet/CarPark/City`
    : 'https://tdx.transportdata.tw/api/basic/v1/Parking/OffStreet/CarPark/City';
  const TDX_COUNTY_ZH = { Taitung: '臺東縣', Hualien: '花蓮縣', Pingtung: '屏東縣', Tainan: '臺南市', Kaohsiung: '高雄市' };
  // TDX 停車 City enum：縣級用 …County 後綴（TaitungCounty…），直轄市/市用裸名。帶錯（如 Taitung）→ 400。
  const TDX_PARKING_CITY = { Taitung: 'TaitungCounty', Hualien: 'HualienCounty', Pingtung: 'PingtungCounty', Tainan: 'Tainan', Kaohsiung: 'Kaohsiung' };
  let _tdxToken = null, _tdxTokenExp = 0, _tdxTokenPromise = null;
  const replanStartMinutes = 14 * 60;
  let replanStops = [];
  let persistTripDebounceTimer = null;
  let persistTripMaxWaitTimer = null;
  // 本次工作階段內使用者是否實際改過行程。載入路徑一律「只讀不寫」——
  // 開頁自動流程（超時壓縮、enrichment、路線繪製回填 transitMin）只改記憶體，
  // 不寫回 Firestore，否則會用重算值覆寫 App 端剛寫入的共編資料。
  let tripUserDirty = false;

  // 路線回填 transitMin 後的「顯示端」補壓縮：載入時先用估算交通做超時壓縮，
  // Google 實測交通通常更長，會把剛好壓進時限的行程再推回超時（橫幅顯示「超出規劃時間 N 分」）。
  // 這裡在路線全部回填後補跑一次壓縮——只改記憶體不存檔；使用者互動過就不再自動壓（避免蓋手動時間）。
  let routeRefitTimer = null;
  function scheduleDisplayRefit() {
    if (tripUserDirty) return;
    clearTimeout(routeRefitTimer);
    routeRefitTimer = setTimeout(() => {
      routeRefitTimer = null;
      if (tripUserDirty) return;
      try {
        const fit = fitScheduleToTimeLimit();
        if (fit.changed) {
          renderItineraryDisplay(); // 內部會依新排程更新時間橫幅與 hero 時間
          try { syncRouteStageScheduleTimes(buildReplanSchedule()); } catch (_e) {}
        }
      } catch (e) { console.warn('[route refit] 略過：', e); }
    }, 900);
  }

  // 「停車後步行」時間寫入後的排程重繪：與 scheduleDisplayRefit 不同，這裡一定要
  // 重繪（時間軸要顯示步行段），使用者互動過也照樣重繪；只有「顯示端補壓縮」維持
  // 未互動才做（避免蓋掉手動時間）。
  let parkWalkRefreshTimer = null;
  function scheduleParkWalkRefresh() {
    clearTimeout(parkWalkRefreshTimer);
    parkWalkRefreshTimer = setTimeout(() => {
      parkWalkRefreshTimer = null;
      try { if (!tripUserDirty) fitScheduleToTimeLimit(); } catch (_e) {}
      try {
        renderItineraryDisplay();
        syncRouteStageScheduleTimes(buildReplanSchedule());
      } catch (e) { console.warn('[park walk refresh] 略過：', e); }
    }, 600);
  }
  const TRANSIT_MODE_OPTIONS = [
    { value: 'taxi', label: '計程車', icon: '🚕' },
    { value: 'scooter', label: '機車', icon: '🛵' },
    { value: 'car', label: '汽車', icon: '🚗' },
    { value: 'walk', label: '走路', icon: '🚶' }
  ];

  // 離島交通設定（島內港/本島港/別名）改由資料端 ferry-config.js 提供（window.WAI_FERRY_CONFIG）。
  // 要修港口座標或新增離島，改該資料檔即可，不必動主程式邏輯。
  const ISLAND_FERRY_CONFIG = (typeof window !== 'undefined' && window.WAI_FERRY_CONFIG && typeof window.WAI_FERRY_CONFIG === 'object')
    ? window.WAI_FERRY_CONFIG
    : {};
  if (!Object.keys(ISLAND_FERRY_CONFIG).length) {
    console.warn('[ferry-config] 未載入 ferry-config.js（window.WAI_FERRY_CONFIG 為空），離島港口處理將停用。');
  }
  const REGION_MAP_PRESETS = [
    {
      keywords: ['台東', 'taitung', '三仙台', '成功', '池上', '關山', '鹿野', '太麻里', '東河', '長濱', '海端', '卑南', '土坂', '達仁', '金峰', '富岡', '比西里岸'],
      center: { lat: 22.7583, lng: 121.1444 },
      spots: [
        { keywords: ['台東車站', 'taitung station'], lat: 22.79323, lng: 121.12373, isHub: true },
        { keywords: ['鐵花', '鐵花村', '音樂聚落', 'tiehua', 'tiehua village'], lat: 22.75463, lng: 121.14581 },
        { keywords: ['海濱公園', '海濱', '濱海公園', 'seaside park', 'waterfront park'], lat: 22.76191, lng: 121.15756 },
        { keywords: ['森林公園', '台東森林公園', 'forest park', 'taitung forest park'], lat: 22.76773, lng: 121.15492 },
        { keywords: ['正氣路', '夜市', '觀光夜市', 'night market', 'zhengqi'], lat: 22.75268, lng: 121.14657 },
        { keywords: ['富岡', '漁港', 'fugang', 'harbor', 'harbour'], lat: 22.79088, lng: 121.18735, isHub: true },
        { keywords: ['土坂', '達仁', '撒布優', 'taban'], lat: 22.3797, lng: 120.8953 },
        { keywords: ['金峰', '歷坵', '嘉蘭', 'jinfeng'], lat: 22.5091, lng: 120.8897 },
        { keywords: ['海端', '霧鹿', '利稻', 'haiduan'], lat: 23.0583, lng: 121.0408 },
        { keywords: ['長濱', '真柄', '竹湖', 'changbin'], lat: 23.2965, lng: 121.3913 },
        { keywords: ['池上', 'chishang'], lat: 23.1111, lng: 121.2139 },
        { keywords: ['關山', 'guanshan'], lat: 23.0508, lng: 121.1694 },
        { keywords: ['鹿野', '龍田', 'luye'], lat: 22.9017, lng: 121.1483 },
        { keywords: ['卑南', '初鹿', '泰安', 'beinan'], lat: 22.7020, lng: 121.0779 },
        { keywords: ['太麻里', '多良', 'taimali'], lat: 22.6103, lng: 121.0194 },
        { keywords: ['東河', '泰源', 'donghe'], lat: 23.1057, lng: 121.3502 },
        { keywords: ['成功', '三仙台', 'chenggong'], lat: 23.0965, lng: 121.3691 },
        { keywords: ['成功車站', '成功站', 'chenggong station'], lat: 23.0992, lng: 121.3819, isHub: true },
        { keywords: ['池上車站', '池上站', 'chishang station'], lat: 23.1228, lng: 121.2153, isHub: true },
        { keywords: ['關山車站', '關山站', 'guanshan station'], lat: 23.0473, lng: 121.1659, isHub: true },
        { keywords: ['鹿野車站', '鹿野站', 'luye station'], lat: 22.9148, lng: 121.1276, isHub: true },
        { keywords: ['太麻里車站', '太麻里站', 'taimali station'], lat: 22.6113, lng: 121.0067, isHub: true },
        { keywords: ['多良車站', '多良站', 'duoliang station'], lat: 22.5575, lng: 120.9580, isHub: true },
        { keywords: ['大武車站', '大武站', 'dawu station'], lat: 22.3563, lng: 120.9028, isHub: true },
        { keywords: ['比西里岸', '比西里岸部落', 'pisirian'], lat: 23.1199, lng: 121.4136 }
      ]
    },
    {
      keywords: ['綠島', 'green island'],
      center: { lat: 22.6615, lng: 121.4926 },
      spots: [
        { keywords: ['小長城', '哈巴狗', '睡美人', '海參坪'], lat: 22.65810, lng: 121.50699 },
        { keywords: ['朝日溫泉', '朝日'], lat: 22.63703, lng: 121.50418 },
        { keywords: ['浮潛', '柴口', '潛點', '秘境浮潛'], lat: 22.677916, lng: 121.48020 },
        { keywords: ['石朗'], lat: 22.65577, lng: 121.47454 },
        { keywords: ['夕陽', '晚餐', '歸途', '南寮', '港口', '漁港'], lat: 22.65791, lng: 121.47449 },
        { keywords: ['燈塔'], lat: 22.67601, lng: 121.46758 }
      ]
    },
    {
      keywords: ['蘭嶼', 'lanyu', 'orchid island'],
      center: { lat: 22.043, lng: 121.539 }, // 島嶼地理中心；8km 門檻可涵蓋全島各景點
      spots: []
    }
  ];

  function normalizeMapText(text) {
    return String(text || '').trim().toLowerCase();
  }

  function findRegionMapPreset(region, title = '') {
    // 先以 region 單獨比對：綠島/蘭嶼隸屬台東縣，若併入 title 比對，標題含「台東/富岡」時會誤中
    // 排序在前的台東 preset，導致離島行程套到本島中心。region 命中者優先回傳。
    const regionText = String(region || '').toLowerCase();
    if (regionText) {
      const byRegion = REGION_MAP_PRESETS.find((preset) =>
        preset.keywords.some((keyword) => regionText.includes(keyword))
      );
      if (byRegion) return byRegion;
    }
    const source = `${region || ''} ${title || ''}`.toLowerCase();
    return REGION_MAP_PRESETS.find((preset) =>
      preset.keywords.some((keyword) => source.includes(keyword))
    ) || null;
  }

  // 地標型目的地 → 所屬地理區域（僅用於座標解析/範圍驗證/Places 查詢；標題與顯示仍用原目的地）。
  // 海濱公園/三仙台/知本等是台東「境內地標」，不是縣市區域，直接拿來做地理判定會查無中心而失準。
  const DESTINATION_REGION_ALIAS = { '海濱公園': '台東', '三仙台': '台東', '知本': '台東' };
  function resolveGeoRegion(dest) {
    const t = String(dest || '').trim();
    return DESTINATION_REGION_ALIAS[t] || t;
  }

  function resolveTripCenter(region, title = '') {
    const preset = findRegionMapPreset(resolveGeoRegion(region), title);
    return preset ? { ...preset.center } : { lat: 23.6978, lng: 120.9605 };
  }

  function normalizeCoordinatePair(latValue, lngValue) {
    let lat = Number(latValue);
    let lng = Number(lngValue);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

    // Some APIs and AI responses return coordinates as lng/lat or x/y.
    const looksLikeTaiwanLat = (value) => value >= 21 && value <= 26.5;
    const looksLikeTaiwanLng = (value) => value >= 118 && value <= 123.5;
    if (looksLikeTaiwanLng(lat) && looksLikeTaiwanLat(lng)) {
      [lat, lng] = [lng, lat];
    }

    if (Math.abs(lat) > 90 && Math.abs(lng) <= 90) {
      [lat, lng] = [lng, lat];
    }

    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    return { lat, lng };
  }

  function readCoordinateObject(source) {
    if (!source) return null;

    // Array form: try both orders
    if (Array.isArray(source) && source.length >= 2) {
      return normalizeCoordinatePair(source[1], source[0]) || normalizeCoordinatePair(source[0], source[1]);
    }

    // String form: allow "lat,lng" or "lng,lat" and common separators (comma, space, full-width comma)
    if (typeof source === 'string') {
      const s = source.trim();
      const m = s.match(/(-?\d+(?:\.\d+)?)[\s,，;]+(-?\d+(?:\.\d+)?)/);
      if (m) {
        const a = Number(m[1]);
        const b = Number(m[2]);
        return normalizeCoordinatePair(a, b) || normalizeCoordinatePair(b, a);
      }
      return null;
    }

    // If it's already a google.maps.LatLng-like object with methods
    if (typeof source === 'object') {
      // If object has geometry.location (Places API)
      try {
        if (source.geometry && source.geometry.location) {
          const loc = source.geometry.location;
          if (typeof loc.lat === 'function' && typeof loc.lng === 'function') {
            return normalizeCoordinatePair(loc.lat(), loc.lng());
          }
        }
      } catch (e) {
        // ignore
      }

      // If wrapper with 'position' property (some data shapes)
      if (source.position) {
        const nested = readCoordinateObject(source.position);
        if (nested) return nested;
      }

      // Direct lat/lng methods (google.maps.LatLng or similar)
      if (typeof source.lat === 'function' && typeof source.lng === 'function') {
        try {
          return normalizeCoordinatePair(source.lat(), source.lng());
        } catch (e) {
          // ignore
        }
      }

      // Common numeric properties
      const lat = source.lat ?? source.latitude ?? source.y ?? source[1];
      const lng = source.lng ?? source.longitude ?? source.x ?? source[0];
      return normalizeCoordinatePair(lat, lng);
    }

    return null;
  }

  function getRegionRadiusThreshold(region) {
    const map = {
      '台北': 20000,
      '新北': 25000,
      '桃園': 25000,
      '台中': 30000,
      '台南': 30000,
      '高雄': 30000,
      '花蓮': 60000,
      '台東': 70000,
      '宜蘭': 50000,
      '屏東': 65000,
      '澎湖': 30000,
      '金門': 25000,
      '馬祖': 25000,
      // 單一小離島：門檻收緊到島嶼尺度，外海/近岸偏移/誤抓鄰區的座標才會被判超範圍而觸發校正
      '蘭嶼': 8000,
      '綠島': 8000,
      '小琉球': 6000
    };
    const normalized = normalizeMapText(resolveGeoRegion(region));
    return map[normalized] || 50000;
  }

  function isCoordinatesOutsideRegion(coords, region, title = '') {
    if (!coords || !region) return false;
    const center = resolveTripCenter(region, title);
    const maxDistance = getRegionRadiusThreshold(region);
    const distance = measureDistanceMeters(center, coords);
    return distance > maxDistance;
  }

  function isInTaiwanBounds(coords) {
    if (!coords) return false;
    const { lat, lng } = coords;
    return Number.isFinite(lat) && Number.isFinite(lng) &&
      lat >= 21.5 && lat <= 26.5 && lng >= 118.5 && lng <= 122.5;
  }

  function buildRegionAwareSearchQueries(stop, region, title = '') {
    const name = String(stop?.name || '').trim();
    const regionName = resolveGeoRegion(region);
    const titleName = String(title || '').trim();
    const queries = new Set();
    if (name) {
      queries.add(name);
      if (regionName) queries.add(`${name} ${regionName}`);
      if (titleName) queries.add(`${name} ${titleName}`);
      if (regionName) queries.add(`${name} ${regionName} 台灣`);
      if (titleName) queries.add(`${name} ${titleName} 台灣`);
    }
    return Array.from(queries);
  }

  async function enforceRegionAwareCoordinates(stop, candidate, region, title = '', biasCenter = null) {
    if (!candidate || !region) return candidate;
    if (!isCoordinatesOutsideRegion(candidate, region, title)) return candidate;

    const centerBias = biasCenter || resolveTripCenter(region, title);
    const queries = buildRegionAwareSearchQueries(stop, region, title);
    for (const query of queries) {
      const found = await searchVerifiedPlaceCandidate(query, stop, region, title, centerBias);
      if (found && !isCoordinatesOutsideRegion(found, region, title)) {
        return found;
      }
    }
    return candidate;
  }

  function findPresetSpotMatch(stop, region, title = '') {
    const preset = findRegionMapPreset(region, title);
    if (!preset) return null;
    const stopText = normalizeMapText(stop?.name || '');
    return preset.spots.find((spot) =>
      spot.keywords.some((keyword) => stopText.includes(keyword.toLowerCase()))
    ) || null;
  }

  function resolveTdxCounty(region, title = '') {
    const text = normalizeMapText(`${region} ${title}`);
    if (text.includes('台東') || text.includes('taitung')) return 'Taitung';
    if (text.includes('花蓮') || text.includes('hualien')) return 'Hualien';
    if (text.includes('屏東') || text.includes('pingtung')) return 'Pingtung';
    if (text.includes('台南') || text.includes('tainan')) return 'Tainan';
    if (text.includes('高雄') || text.includes('kaohsiung')) return 'Kaohsiung';
    return null;
  }

  // 取得 TDX OAuth2 access token（scenic / parking 共用）。
  // 快取 token 直到過期；並用 in-flight promise 去重，避免並發呼叫各自打 auth（造成 429）。
  async function getTdxAccessToken() {
    // 代理模式：token 由後端注入，前端不需（也不該有）憑證；回傳哨兵值讓呼叫端繼續。
    if (TDX_PROXIED) return 'proxied';
    const cfg = window.TRAVEL_APP_CONFIG || {};
    const appId = cfg.TDX_APP_ID;
    const appKey = cfg.TDX_APP_KEY;
    if (!appId || !appKey) return null;
    if (_tdxToken && Date.now() < _tdxTokenExp) return _tdxToken;
    if (_tdxTokenPromise) return _tdxTokenPromise;
    _tdxTokenPromise = (async () => {
      try {
        const tokenRes = await fetch(TDX_AUTH_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `grant_type=client_credentials&client_id=${encodeURIComponent(appId)}&client_secret=${encodeURIComponent(appKey)}`
        });
        if (!tokenRes.ok) return null;
        const data = await tokenRes.json();
        _tdxToken = data.access_token || null;
        const ttl = Number(data.expires_in) || 86400;
        _tdxTokenExp = Date.now() + Math.max(0, ttl - 60) * 1000; // 留 60s buffer
        return _tdxToken;
      } catch (e) {
        console.warn('[TDX] 取得 token 失敗', e.message);
        return null;
      } finally {
        _tdxTokenPromise = null;
      }
    })();
    return _tdxTokenPromise;
  }

  // 觀光景點（V2.1 Attraction，中文縣市 $filter）。並發去重：cache 存「進行中的 Promise」。
  // 防禦式欄位對應（同時吃 V1/V2 命名）+ 失敗一律回 []（退回 Google Places 校正，不會比現在更差）。
  function fetchTdxScenicSpots(county) {
    if (!county) return Promise.resolve([]);
    if (tdxSpotsCache.has(county)) return tdxSpotsCache.get(county);
    const p = (async () => {
      try {
        const access_token = await getTdxAccessToken();
        if (!access_token) return [];
        const zh = TDX_COUNTY_ZH[county] || county;
        // 新版 Attraction 的縣市在 PostalAddress/City（值用「臺」寫法，TDX_COUNTY_ZH 已是）
        const filter = encodeURIComponent(`PostalAddress/City eq '${zh}'`);
        const dataRes = await fetch(
          `${TDX_SCENIC_BASE}?$filter=${filter}&$top=200&$format=JSON`,
          { headers: access_token === 'proxied' ? {} : { Authorization: `Bearer ${access_token}` } }
        );
        if (!dataRes.ok) return [];
        const spots = await dataRes.json();
        const rawSpots = Array.isArray(spots) ? spots : (spots && Array.isArray(spots.value) ? spots.value : []);
        const normalized = rawSpots
          .map(s => {
            const pos = s.Position || s.PositionLatLon || {};
            const lat = Number(pos.PositionLat != null ? pos.PositionLat : s.PositionLat);
            const lng = Number(pos.PositionLon != null ? pos.PositionLon : s.PositionLon);
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
            return {
              name: s.AttractionName || s.ScenicSpotName || s.Name || '',
              lat,
              lng,
              openTime: s.OpenTime || '',
              desc: (s.Description || s.DescriptionDetail || '').slice(0, 100)
            };
          })
          .filter(Boolean);
        console.info(`[TDX] 載入 ${county} 景點 ${normalized.length} 筆`);
        return normalized;
      } catch (e) {
        console.warn('[TDX] 抓取失敗，跳過 TDX 驗證', e.message);
        return [];
      }
    })();
    tdxSpotsCache.set(county, p);
    return p;
  }

  function findTdxScenicMatch(stopName, spots) {
    spots = Array.isArray(spots) ? spots : [];
    const norm = normalizeText(stopName);
    if (!norm) return null;
    return spots.find(s => {
      const sNorm = normalizeText(s.name);
      return sNorm.includes(norm) || norm.includes(sNorm);
    }) || null;
  }

  // TDX 路外停車場（依縣市快取）。並發去重：cache 存「進行中的 Promise」，同縣市只打一次（解 429）。
  function fetchTdxParking(county) {
    if (!county) return Promise.resolve([]);
    if (tdxParkingCache.has(county)) return tdxParkingCache.get(county);
    const city = TDX_PARKING_CITY[county] || county; // 縣級要 …County 後綴，否則 TDX 回 400
    const p = (async () => {
      try {
        const access_token = await getTdxAccessToken();
        if (!access_token) return [];
        const dataRes = await fetch(
          `${TDX_PARKING_BASE}/${city}?$format=JSON`,
          { headers: access_token === 'proxied' ? {} : { Authorization: `Bearer ${access_token}` } }
        );
        if (!dataRes.ok) { console.warn(`[TDX] 停車場 ${city} HTTP ${dataRes.status}`); return []; }
        const list = await dataRes.json();
        const rawList = Array.isArray(list) ? list : (list && Array.isArray(list.CarParks) ? list.CarParks : []);
        const normalized = rawList
          .map(pk => {
            const pos = pk.CarParkPosition || {};
            const lat = Number(pos.PositionLat);
            const lng = Number(pos.PositionLon);
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
            const name = (pk.CarParkName && (pk.CarParkName.Zh_tw || pk.CarParkName.En)) || '停車場';
            return { name, lat, lng };
          })
          .filter(Boolean);
        console.info(`[TDX] 載入 ${county} 停車場 ${normalized.length} 筆`);
        return normalized;
      } catch (e) {
        console.warn('[TDX] 停車場抓取失敗，跳過 TDX 停車場', e.message);
        return [];
      }
    })();
    tdxParkingCache.set(county, p);
    return p;
  }

  // 從 TDX 停車場清單挑距 center ≤ 半徑、依距離排序的前幾筆候選
  function nearbyTdxParkings(center, list, maxMeters, limit = 3) {
    if (!center || !Array.isArray(list) || !list.length) return [];
    return list
      .map((p) => ({ cand: { lat: p.lat, lng: p.lng, name: p.name }, d: measureDistanceMeters(center, p) }))
      .filter((x) => x.d <= maxMeters)
      .sort((a, b) => a.d - b.d)
      .slice(0, limit)
      .map((x) => x.cand);
  }

  function getExactCoordinateFromStop(stop = {}) {
    const coordinateSources = [
      stop.scenicCoordinates,
      stop['景點座標'],
      { lat: stop.precisionLat, lng: stop.precisionLng },
      stop.coordinates,
      stop.position,
      stop.location
    ];

    for (const source of coordinateSources) {
      const coordinates = readCoordinateObject(source);
      if (coordinates) return coordinates;
    }

    const coordinates = normalizeCoordinatePair(stop && (stop.lat ?? stop.latitude), stop && (stop.lng ?? stop.longitude));
    if (coordinates) return coordinates;

    return null;
  }

  function buildScenicPointKey(name, region = '') {
    const nameTrimmed = String(name || '').trim();
    const regionTrimmed = String(region || '').trim();
    // Strip trailing region name that AI sometimes appends to stop names (e.g. "鐵花村音樂聚落台東" with region "台東")
    let baseName = nameTrimmed;
    if (regionTrimmed && baseName.endsWith(regionTrimmed) && baseName.length > regionTrimmed.length) {
      baseName = baseName.slice(0, -regionTrimmed.length).trim();
    }
    return normalizeText(`${baseName}${regionTrimmed}`);
  }

  function getScenicPointDocRef(name, region = '') {
    if (!firebaseEnabled || !firebaseDb) return null;
    const key = buildScenicPointKey(name, region);
    if (!key) return null;
    return firebaseDb.collection('scenic_points').doc(key);
  }

  function readScenicPointCoordinates(data = {}) {
    return readCoordinateObject(data.scenicCoordinates)
      || readCoordinateObject(data.coordinates)
      || normalizeCoordinatePair(
        data.scenicLat ?? data.scenicLatitude ?? data.lat ?? data.latitude,
        data.scenicLng ?? data.scenicLongitude ?? data.lng ?? data.longitude
      );
  }

  async function fetchScenicPointRecord(name, region = '') {
    const key = buildScenicPointKey(name, region);
    if (!key) return null;
    if (scenicPointCache.has(key)) return scenicPointCache.get(key);
    const docRef = getScenicPointDocRef(name, region);
    if (!docRef) return null;

    try {
      const doc = await docRef.get();
      if (!doc.exists) return null;
      const data = doc.data() || {};
      const record = {
        id: doc.id,
        name: data.name || name,
        region: data.region || region || '',
        emoji: data.emoji || '📍',
        desc: data.desc || '',
        notice: data.notice || '',
        scenicCoordinates: readScenicPointCoordinates(data),
        sourceTripId: data.sourceTripId || ''
      };
      scenicPointCache.set(key, record);
      return record;
    } catch (error) {
      console.warn('讀取景點座標失敗：', error);
      return null;
    }
  }

  async function upsertScenicPointRecord(stop, coordinates, region = '', title = '') {
    const name = String(stop?.name || '').trim();
    if (!name || !coordinates || !Number.isFinite(coordinates.lat) || !Number.isFinite(coordinates.lng)) {
      return null;
    }

    const key = buildScenicPointKey(name, region);
    // Strip trailing region suffix from stored name (same logic as buildScenicPointKey)
    const regionTrimmed = String(region || '').trim();
    let cleanName = name;
    if (regionTrimmed && cleanName.endsWith(regionTrimmed) && cleanName.length > regionTrimmed.length) {
      cleanName = cleanName.slice(0, -regionTrimmed.length).trim();
    }
    const existingCached = scenicPointCache.get(key);
    const record = {
      id: key,
      name: cleanName,
      region: region || '',
      tripTitle: title || '',
      emoji: stop?.emoji || '📍',
      desc: hasMeaningfulSpotDescription(stop?.desc) ? stop.desc : (existingCached?.desc || ''),
      notice: stop?.notice || existingCached?.notice || '',
      scenicCoordinates: { lat: coordinates.lat, lng: coordinates.lng },
      updatedAt: firebase && firebase.firestore ? firebase.firestore.FieldValue.serverTimestamp() : Date.now(),
      ...(stop?.businessHours ? { businessHours: stop.businessHours } : (existingCached?.businessHours ? { businessHours: existingCached.businessHours } : {})),
      ...(stop?.placeId       ? { placeId: stop.placeId }             : (existingCached?.placeId       ? { placeId: existingCached.placeId }             : {}))
    };

    // 預先放入快取（暫存），但實際是否寫入 Firebase 需要經過 OpenData 驗證
    const cachedRecord = {
      ...record,
      scenicCoordinates: { lat: coordinates.lat, lng: coordinates.lng },
      verified: false
    };
    scenicPointCache.set(key, cachedRecord);

    // 不再從前端寫回 Firestore scenic_points：安全規則明定該集合僅後端 crawler（service
    // account）可寫，前端寫入永遠 permission-denied（先前每站失敗噴一條 console 錯誤）。
    // 座標只保留在本頁的記憶體快取；正式資料由 crawler verify:places → export:local 維護。
    // （順帶省下原本每站一次的 OpenData 驗證請求，加快行程載入。）
    return scenicPointCache.get(key);
  }

  async function resolveScenicPointRecord(stop, region, title = '') {
    const exactPosition = getExactCoordinateFromStop(stop);
    const name = String(stop?.name || '').trim();
    if (exactPosition && name) {
      if (!scenicPointCache.has(buildScenicPointKey(name, region))) {
        await fetchScenicPointRecord(name, region);
      }
      return upsertScenicPointRecord(stop, exactPosition, region, title);
    }

    if (name) {
      const cached = await fetchScenicPointRecord(name, region);
      if (cached && cached.scenicCoordinates) {
        return cached;
      }
    }

    const matched = findPresetSpotMatch(stop, region, title);
    if (matched && name) {
      return upsertScenicPointRecord(stop, { lat: matched.lat, lng: matched.lng }, region, title);
    }

    return null;
  }

  function hasMeaningfulSpotDescription(text) {
    const value = String(text || '').trim();
    if (!value) return false;
    return ![
      /座標已加入行程/,
      /^AI 建議的專屬景點$/,
      /^AI 建議的客製化景點$/,
      /^這裡會顯示導覽說明。$/
    ].some((pattern) => pattern.test(value));
  }

  function hasMeaningfulSpotNotice(text) {
    const value = String(text || '').trim();
    if (!value) return false;
    return ![
      /^建議預留充足時間享受當地特色。$/,
      /^請依實際狀況評估行程停留時間$/,
      /^這裡會顯示注意事項。$/
    ].some((pattern) => pattern.test(value));
  }

  function inferSpotContext(name = '', desc = '') {
    const text = normalizeMapText(`${name} ${desc}`);
    if (/車站|捷運|月台|碼頭|港口|機場|轉運|集合/.test(text)) {
      return {
        activity: '集合、轉乘或整理接下來的移動節奏',
        notice: '若這裡同時是集合或轉乘點，建議預留一些緩衝時間，方便整理物品與確認下一段路線。'
      };
    }
    if (/咖啡|甜點|茶|餐廳|小吃|夜市|市場|用餐|補給/.test(text)) {
      return {
        activity: '短暫休息、補充體力與安排輕鬆停留',
        notice: '若打算在這裡用餐或休息，建議先確認營業時間與候位狀況，避免壓縮後續行程。'
      };
    }
    if (/海|海邊|海景|漁港|燈塔|沙灘|濱海|遊憩區|觀景|步道|公園|森林|草原|瀑布|秘境|景觀/.test(text)) {
      return {
        activity: '散步、看景與拍照，慢慢感受當地環境',
        notice: '現場多半偏戶外動線，建議留意日照、風勢與停留時間，再銜接下一段移動。'
      };
    }
    if (/溫泉|泡湯/.test(text)) {
      return {
        activity: '放鬆停留與安排較從容的節奏',
        notice: '若現場有時段或入場限制，建議先確認使用方式，再安排後續行程。'
      };
    }
    return {
      activity: '停下來走逛、觀察周邊，留一點時間感受在地氛圍',
      notice: '建議先確認開放時間、現場動線與停留節奏，再安排下一個停靠點。'
    };
  }

  function buildSpotDescription(name = '', desc = '', region = '', title = '') {
    if (hasMeaningfulSpotDescription(desc)) return String(desc).trim();
    const label = String(name || '這個景點').trim() || '這個景點';
    const tripLabel = String(region || title || '').trim();
    const context = inferSpotContext(name, desc);
    const tripText = tripLabel ? `在「${tripLabel}」這趟行程中，` : '';
    return `${tripText}${label}適合安排${context.activity}。如果時間允許，建議不要只停留打卡，稍微放慢步調通常會更有體驗感。`;
  }

  function buildSpotNotice(name = '', desc = '', notice = '') {
    if (hasMeaningfulSpotNotice(notice)) return String(notice).trim();
    return inferSpotContext(name, desc).notice;
  }

  function buildSpotPinPayload({ emoji = '📍', name = '', desc = '', notice = '', region = '', title = '' } = {}) {
    const safeName = String(name || '景點').trim() || '景點';
    return {
      title: `${emoji || '📍'} ${safeName}`,
      desc: buildSpotDescription(safeName, desc, region, title),
      notice: buildSpotNotice(safeName, desc, notice)
    };
  }

  async function resolveStopCoordinates(stop, index, region, title = '') {
    const scenicRecord = await resolveScenicPointRecord(stop, region, title);
    if (scenicRecord && scenicRecord.scenicCoordinates) {
      return scenicRecord.scenicCoordinates;
    }

    const exactPosition = getExactCoordinateFromStop(stop);
    if (exactPosition) return exactPosition;

    const matched = findPresetSpotMatch(stop, region, title);
    if (matched) {
      return { lat: matched.lat, lng: matched.lng };
    }

    const center = resolveTripCenter(region, title);
    const ringOffset = [
      { lat: 0, lng: 0 },
      { lat: 0.0035, lng: 0.002 },
      { lat: -0.003, lng: 0.0034 },
      { lat: 0.0022, lng: -0.0036 },
      { lat: -0.0028, lng: -0.0022 }
    ];
    const offset = ringOffset[index % ringOffset.length];
    return {
      lat: center.lat + offset.lat,
      lng: center.lng + offset.lng
    };
  }

  function getMapFocusCenter() {
    const locations = Object.values(mapPinLocations || {});
    if (!locations.length) return resolveTripCenter(currentTripRegion, currentTripTitle);
    const sums = locations.reduce((acc, loc) => {
      acc.lat += loc.lat;
      acc.lng += loc.lng;
      return acc;
    }, { lat: 0, lng: 0 });
    return {
      lat: sums.lat / locations.length,
      lng: sums.lng / locations.length
    };
  }

  function createNearbyPosition(seedIndex = 0) {
    const center = getMapFocusCenter();
    const offsets = [
      { lat: 0.0015, lng: 0.0015 },
      { lat: -0.0012, lng: 0.0018 },
      { lat: 0.0018, lng: -0.0014 },
      { lat: -0.0016, lng: -0.0012 }
    ];
    const offset = offsets[seedIndex % offsets.length];
    return {
      lat: center.lat + offset.lat,
      lng: center.lng + offset.lng
    };
  }

  function hasGoogleGeocoder() {
    return Boolean(window.google && google.maps && google.maps.Geocoder);
  }

  function hasGooglePlacesService() {
    return Boolean(window.google && google.maps && google.maps.places && google.maps.places.PlacesService);
  }

  let placesServiceInstance = null;
  function getPlacesService() {
    if (placesServiceInstance || !hasGooglePlacesService()) return placesServiceInstance;
    placesServiceInstance = new google.maps.places.PlacesService(document.createElement('div'));
    return placesServiceInstance;
  }

  // 使用 Google Places（或其他可用 OpenData）比對座標與名稱，確認要寫入 Firebase 前的驗證
  async function verifyPlaceWithOpenData(name, coordinates, region = '', biasCenter = null) {
    try {
      const service = getPlacesService();
      if (!service || !coordinates) return false;
      if (!Number.isFinite(Number(coordinates.lat)) || !Number.isFinite(Number(coordinates.lng))) return false;

      const query = String(name || '').trim();
      if (!query) return false;

      const request = {
        location: new google.maps.LatLng(coordinates.lat, coordinates.lng),
        radius: 300,
        keyword: query
      };

      const results = await new Promise((resolve) => {
        service.nearbySearch(request, (res, status) => {
          const okStatus = hasGooglePlacesService() ? google.maps.places.PlacesServiceStatus.OK : 'OK';
          if (status !== okStatus || !Array.isArray(res) || !res.length) return resolve([]);
          resolve(res);
        });
      });

      if (!results || !results.length) {
        // 嘗試以文字搜尋做第二道比對
        const text = `${query} ${region || ''}`.trim();
        const refined = await new Promise((resolve) => {
          service.textSearch({ query: text, location: new google.maps.LatLng(coordinates.lat, coordinates.lng), radius: 500 }, (res, status) => {
            const okStatus = hasGooglePlacesService() ? google.maps.places.PlacesServiceStatus.OK : 'OK';
            if (status !== okStatus || !Array.isArray(res) || !res.length) return resolve([]);
            resolve(res);
          });
        });
        if (!refined || !refined.length) return false;
        // 如果文字搜尋有相近結果，視為驗證成功
        return true;
      }

      // 若 nearbySearch 有結果，檢查名稱相近與距離
      const candidate = results[0];
      const candName = String(candidate.name || '').toLowerCase();
      const cleanName = String(name || '').toLowerCase();
      if (candName.includes(cleanName) || cleanName.includes(candName)) return true;

      // 最後以距離作為保底判斷
      const candPos = candidate.geometry && candidate.geometry.location ? { lat: candidate.geometry.location.lat(), lng: candidate.geometry.location.lng() } : null;
      if (candPos) {
        const d = measureDistanceMeters(coordinates, candPos);
        if (d <= 250) return true;
      }

      return false;
    } catch (e) {
      console.warn('OpenData 驗證失敗：', e);
      return false;
    }
  }

  function parseBusinessHoursWindow(value) {
    const match = String(value || '').match(
      /(\d{1,2}):(\d{2})\s*(?:-|–|~|to)\s*(\d{1,2}):(\d{2})/i
    );
    if (!match) return null;
    const open  = Number(match[1]) * 60 + Number(match[2]);
    const close = Number(match[3]) * 60 + Number(match[4]);
    if (!Number.isFinite(open) || !Number.isFinite(close) || close <= open) return null;
    return { open, close };
  }

  async function fetchPlaceOpeningHours(placeId) {
    if (!placeId || !hasGooglePlacesService()) return null;
    const service = getPlacesService();
    if (!service) return null;
    return new Promise((resolve) => {
      service.getDetails(
        { placeId, fields: ['opening_hours', 'business_status'] },
        (place, status) => {
          const ok = google.maps.places.PlacesServiceStatus.OK;
          if (status !== ok || !place) return resolve(null);
          const hours = place.opening_hours;
          resolve({
            businessStatus: place.business_status || null,
            weekdayText: hours ? (hours.weekday_text || []) : [],
            isOpen24Hours: hours
              ? (Array.isArray(hours.periods) && hours.periods.length === 1
                 && hours.periods[0].open && hours.periods[0].open.time === '0000'
                 && !hours.periods[0].close)
              : false
          });
        }
      );
    });
  }

  function isTubanVillageContext(region, title) {
    const src = `${region || ''} ${title || ''}`.toLowerCase();
    return ['土坂', '達仁', 'tuban', 'taban', '撒布優'].some(kw => src.includes(kw));
  }

  const TUBAN_NAME_ALIASES = {
    '土坂部落入口意象': '土坂公園',
    '土坂入口意象': '土坂公園',
    '部落入口意象': '土坂公園',
    '土坂部落五年祭會場': 'Tjuwabar Maljeveq祭場',
    '五年祭會場': 'Tjuwabar Maljeveq祭場',
    '土坂五年祭會場': 'Tjuwabar Maljeveq祭場',
    '土坂部落祭場': 'Tjuwabar Maljeveq祭場',
    '土坂祭場': 'Tjuwabar Maljeveq祭場',
    'Maljeveq祭場': 'Tjuwabar Maljeveq祭場',
  };

  function resolveTubanAlias(name) {
    if (!name) return name;
    if (TUBAN_NAME_ALIASES[name]) return TUBAN_NAME_ALIASES[name];
    const lower = name.toLowerCase();
    for (const [key, val] of Object.entries(TUBAN_NAME_ALIASES)) {
      if (lower.includes(key.toLowerCase()) || key.toLowerCase().includes(lower)) return val;
    }
    return name;
  }

  function buildStopSearchTerms(stop, region, title = '', presetMatch = null) {
    const rawName = String(stop?.name || '').trim();
    const name = isTubanVillageContext(String(region || ''), String(title || ''))
      ? resolveTubanAlias(rawName)
      : rawName;
    const regionName = String(region || '').trim();
    const titleName = String(title || '').trim();
    const terms = new Set();
    if (name) terms.add(name);
    if (name && regionName) terms.add(`${name} ${regionName}`);
    if (name && titleName) terms.add(`${name} ${titleName}`);
    if (name && isTubanVillageContext(regionName, titleName)) {
      terms.add(`${name} 土坂達仁`);
      collectSearchTokens(name).forEach(token => {
        if (token.length >= 2 && token !== name) terms.add(`${token} 土坂`);
      });
    }
    if (!name && regionName) terms.add(regionName);
    return Array.from(terms)
      .map((item) => String(item || '').replace(/\s+/g, ' ').trim())
      .filter((item, idx, arr) => item && arr.indexOf(item) === idx);
  }

  function collectSearchTokens(...parts) {
    const tokens = new Set();
    parts.forEach((part) => {
      const normalized = normalizeMapText(part);
      if (!normalized) return;
      if (normalized.length >= 2) tokens.add(normalized);
      normalized
        .split(/[\s,，、/()（）\-]+/)
        .map((token) => token.trim())
        .filter((token) => token.length >= 2)
        .forEach((token) => tokens.add(token));
    });
    return Array.from(tokens);
  }

  function measureDistanceMeters(origin, target) {
    if (!origin || !target) return Number.POSITIVE_INFINITY;
    const toRadians = (degrees) => degrees * Math.PI / 180;
    const earthRadius = 6371000;
    const dLat = toRadians(target.lat - origin.lat);
    const dLng = toRadians(target.lng - origin.lng);
    const lat1 = toRadians(origin.lat);
    const lat2 = toRadians(target.lat);
    const a = Math.sin(dLat / 2) ** 2
      + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // ── GPS 驗證式打卡工具 ──
  // 抓一次目前定位。永不 reject（避免 unhandled rejection 紅字）：
  // 成功 resolve {ok:true, lat, lng, accuracy}；失敗 resolve {ok:false, reason}。
  function getCurrentPositionOnce(timeoutMs = 8000) {
    return new Promise((resolve) => {
      if (!navigator.geolocation || typeof navigator.geolocation.getCurrentPosition !== 'function') {
        return resolve({ ok: false, reason: 'unsupported' });
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({
          ok: true,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: Number(pos.coords.accuracy) || 0
        }),
        (err) => {
          const reason = err && err.code === 1 ? 'denied'
            : err && err.code === 2 ? 'unavailable'
            : 'timeout';
          resolve({ ok: false, reason });
        },
        { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30000 }
      );
    });
  }

  // 站點座標讀取，優先序同共編快照（鎖定座標 → 已解析座標 → 頂層 lat/lng）
  function getStopLatLng(stop) {
    if (!stop) return null;
    return readCoordinateObject(stop._lockedCoordinates)
      || readCoordinateObject(stop.scenicCoordinates)
      || readCoordinateObject(stop);
  }

  function formatDistanceZh(meters) {
    if (!Number.isFinite(meters)) return '';
    return meters < 1000 ? `${Math.round(meters)} 公尺` : `${(meters / 1000).toFixed(1)} 公里`;
  }

  // 站名短版（嵌進提示句用）：先砍掉括號附註（餐廳名常帶「(最後點餐時間…)」整串），再截長度
  function shortStopName(name, maxLen = 14) {
    let s = String(name || '').trim();
    const cut = s.search(/[(（]/);
    if (cut > 0) s = s.slice(0, cut).trim();
    return s.length > maxLen ? s.slice(0, maxLen) + '…' : s;
  }

  function scorePlaceCandidate(place, stop, region, title = '', biasCenter = null, candidatePosition = null) {
    const haystack = normalizeMapText(
      `${place?.name || ''} ${place?.formatted_address || ''} ${place?.vicinity || ''}`
    );
    const stopName = normalizeMapText(stop?.name || '');
    let score = 0;

    if (stopName && normalizeMapText(place?.name || '').includes(stopName)) {
      score += 18;
    }

    collectSearchTokens(stop?.name, stop?.desc, region, title).forEach((token) => {
      if (!haystack.includes(token)) return;
      score += token === stopName ? 12 : (token.length >= 4 ? 5 : 3);
    });

    if (place?.business_status === 'OPERATIONAL') {
      score += 1;
    }

    if (biasCenter && candidatePosition) {
      const distance = measureDistanceMeters(biasCenter, candidatePosition);
      if (distance <= 120) {
        score += 6;
      } else if (distance <= 400) {
        score += 4;
      } else if (distance <= 1200) {
        score += 2;
      } else if (distance > 3500) {
        score -= 6;
      }
    }

    return score;
  }

  async function searchPrecisePlaceCoordinates(query, stop, region, title = '', biasCenter = null) {
    const baseQuery = String(query || '').trim();
    if (!baseQuery) return null;
    const normalizedQuery = `${baseQuery}${region ? ' ' + String(region).trim() : ''}`.trim();
    const service = getPlacesService();
    if (!normalizedQuery || !service) return null;

    const biasKey = biasCenter
      ? `${biasCenter.lat.toFixed(4)},${biasCenter.lng.toFixed(4)}`
      : 'no-bias';
    const cacheKey = `${normalizedQuery}__${biasKey}`;
    if (placeSearchCache.has(cacheKey)) {
      return placeSearchCache.get(cacheKey);
    }

    const request = { query: normalizedQuery };
    if (biasCenter && Number.isFinite(Number(biasCenter.lat)) && Number.isFinite(Number(biasCenter.lng))) {
      request.location = new google.maps.LatLng(Number(biasCenter.lat), Number(biasCenter.lng));
      request.radius = 4500;
    }

    const result = await new Promise((resolve) => {
      service.textSearch(request, (results, status) => {
        const okStatus = hasGooglePlacesService()
          ? google.maps.places.PlacesServiceStatus.OK
          : 'OK';
        if (status !== okStatus || !Array.isArray(results) || !results.length) {
          resolve(null);
          return;
        }

        const ranked = results
          .filter((place) => place && place.geometry && place.geometry.location)
          .map((place) => {
            const position = {
              lat: place.geometry.location.lat(),
              lng: place.geometry.location.lng()
            };
            return {
              position,
              score: scorePlaceCandidate(place, stop, region, title, biasCenter, position)
            };
          })
          .sort((a, b) => b.score - a.score);

        resolve(ranked[0] ? ranked[0].position : null);
      });
    });

    placeSearchCache.set(cacheKey, result);
    return result;
  }

  async function searchVerifiedPlaceCandidate(query, stop, region, title = '', biasCenter = null) {
    const baseQuery = String(query || '').trim();
    const normalizedQuery = `${baseQuery}${region ? ' ' + String(region).trim() : ''}`.trim();
    const service = getPlacesService();
    if (!normalizedQuery || !service) return null;

    const request = { query: normalizedQuery };
    if (biasCenter && Number.isFinite(Number(biasCenter.lat)) && Number.isFinite(Number(biasCenter.lng))) {
      request.location = new google.maps.LatLng(Number(biasCenter.lat), Number(biasCenter.lng));
      request.radius = 4500;
    }

    const result = await new Promise((resolve) => {
      service.textSearch(request, (results, status) => {
        const okStatus = hasGooglePlacesService()
          ? google.maps.places.PlacesServiceStatus.OK
          : 'OK';
        if (status !== okStatus || !Array.isArray(results) || !results.length) {
          resolve(null);
          return;
        }

        const ranked = results
          .filter((place) => place && place.geometry && place.geometry.location)
          .map((place) => {
            const position = {
              lat: place.geometry.location.lat(),
              lng: place.geometry.location.lng()
            };
            return {
              name: place.name || '',
              position,
              score: scorePlaceCandidate(place, stop, region, title, biasCenter, position),
              placeId: place.place_id || ''
            };
          })
          .sort((a, b) => b.score - a.score);

        resolve(ranked[0] || null);
      });
    });

    return result;
  }

  // 地名通用後綴／類別詞：兩名稱只共用這些詞不算同一地點（如「成功漁港」vs「富岡漁港」只共用「漁港」）
  const GENERIC_PLACE_SUFFIXES = [
    '觀光漁港', '漁港', '港口', '碼頭', '港',
    '火車站', '高鐵站', '捷運站', '轉運站', '客運站', '車站', '站',
    '國家公園', '森林公園', '地質公園', '公園',
    '國家風景區', '風景區', '遊客中心', '文化園區', '園區',
    '部落', '老街', '夜市', '步道', '古道', '大橋', '吊橋', '橋',
    '溫泉', '瀑布', '農場', '牧場', '林場',
    '博物館', '美術館', '紀念館', '故事館', '展覽館',
    '寺', '宮', '廟', '教堂', '神社'
  ];
  function stripGenericPlaceSuffix(s) {
    let t = String(s || '');
    for (const suf of GENERIC_PLACE_SUFFIXES) {
      if (t.length > suf.length && t.endsWith(suf)) return t.slice(0, -suf.length);
    }
    return t;
  }
  // 嚴格名稱比對：去掉通用後綴後比「特徵核心」，避免只共用漁港/部落等通用詞就誤判同地點
  function placeNameMatchesStrict(displayName, queryName) {
    if (!displayName || !queryName) return false;
    const clean = s => String(s).replace(/[\s（）()[\]「」·\-_\/,.。，、！!？?～~]/g, '').toLowerCase();
    const dn = clean(displayName);
    const qn = clean(queryName);
    if (!dn || !qn) return false;
    if (dn.includes(qn) || qn.includes(dn)) return true; // 一方完整含另一方（涵蓋別名內含）
    const dCore = clean(stripGenericPlaceSuffix(displayName));
    const qCore = clean(stripGenericPlaceSuffix(queryName));
    if (dCore && qCore) {
      if (dCore.includes(qCore) || qCore.includes(dCore)) return true;
      if (dCore.length >= 2 && qCore.length >= 2 && dCore.slice(0, 2) === qCore.slice(0, 2)) return true;
    }
    return false;
  }

  // 等 Google Places 服務就緒（地圖以非 async 方式載入，初始化階段可能還沒 ready）
  function waitForPlacesService(timeoutMs = 8000) {
    return new Promise((resolve) => {
      if (hasGooglePlacesService()) { resolve(true); return; }
      const start = Date.now();
      const timer = setInterval(() => {
        if (hasGooglePlacesService()) { clearInterval(timer); resolve(true); }
        else if (Date.now() - start > timeoutMs) { clearInterval(timer); resolve(false); }
      }, 150);
    });
  }

  // 以站名做 Places textSearch，回傳「第一個名稱嚴格配對」的候選（依 scorePlaceCandidate 排序），不偏向現存座標。
  // 會嘗試多個查詢變體（原名、去括號核心），提高命中率。
  async function searchStrictPlaceCandidate(query, stop, region, title = '') {
    const service = getPlacesService();
    if (!service) return null;
    const rawName = String(query || '').trim();
    if (!rawName) return null;
    const reg = region ? ' ' + resolveGeoRegion(region) : '';
    const cleanedName = rawName.replace(/[（(][^）)]*[）)]/g, '').trim(); // 去掉括號別名
    const variants = [];
    variants.push(`${rawName}${reg}`.trim());
    if (cleanedName && cleanedName !== rawName) variants.push(`${cleanedName}${reg}`.trim());
    // 位置偏置：以區域中心 + region 半徑門檻偏置 textSearch，避免抓到同名的外地/外海 POI
    // （對小離島尤其重要，與 searchPrecisePlaceCoordinates 的偏置寫法一致）。
    const biasCenter = resolveTripCenter(region, title);
    for (const q of variants) {
      const cacheKey = `strict__${q}`;
      let cached = placeSearchCache.has(cacheKey) ? placeSearchCache.get(cacheKey) : undefined;
      if (cached === undefined) {
        const request = { query: q };
        if (biasCenter && Number.isFinite(Number(biasCenter.lat)) && Number.isFinite(Number(biasCenter.lng))) {
          request.location = new google.maps.LatLng(Number(biasCenter.lat), Number(biasCenter.lng));
          request.radius = Math.min(getRegionRadiusThreshold(region), 50000);
        }
        cached = await new Promise((resolve) => {
          service.textSearch(request, (results, status) => {
            const okStatus = hasGooglePlacesService() ? google.maps.places.PlacesServiceStatus.OK : 'OK';
            if (status !== okStatus || !Array.isArray(results) || !results.length) { resolve(null); return; }
            const ranked = results
              .filter(p => p && p.geometry && p.geometry.location)
              .map(p => {
                const position = { lat: p.geometry.location.lat(), lng: p.geometry.location.lng() };
                return { name: p.name || '', position, score: scorePlaceCandidate(p, stop, region, title, biasCenter, position) };
              })
              .sort((a, b) => b.score - a.score);
            const strict = ranked.find(r => placeNameMatchesStrict(r.name, stop && stop.name));
            resolve(strict || null);
          });
        });
        placeSearchCache.set(cacheKey, cached);
      }
      if (cached) return cached;
    }
    return null;
  }

  // 載入既有行程時重驗中段站座標：用 Places 以站名查正確位置（名稱嚴格配對且在範圍內為準），
  // 無座標或與現存座標偏移 >800m 即採用 Places 位置，修正已存檔的錯誤定位。
  async function verifyStopCoordinatesWithPlaces(stops, region, title = '') {
    if (!Array.isArray(stops) || !stops.length) return stops;
    const ready = await waitForPlacesService();
    if (!ready) { console.warn('[coord reverify] Places 服務未就緒，略過座標重驗'); return stops; }
    let snapped = 0;

    // 需要重驗的站：排除端點/鎖定座標/已驗證（各站互相獨立 → 可平行）
    const targets = stops.filter((stop) =>
      stop && stop.type !== 'start' && stop.type !== 'end'
      && !stop._lockedCoordinates && !stop.coordVerified
      && String(stop.name || '').trim());

    // 單站驗證（原本序列迴圈的每輪工作，continue 改為 return）
    const verifyOne = async (stop) => {
      const name = String(stop.name || '').trim();
      const cur = readStopCoordinates(stop);
      let cand = null;
      let renamed = false;
      try { cand = await searchStrictPlaceCandidate(name, stop, region, title); } catch (e) { return; }
      if (!cand || !cand.position) {
        // 嚴格配對失敗（多為 AI 取的別名，如「白色陋屋」實為「台東阿伯小白屋」）：
        // 信心控管的模糊退回——信任 Google 對該名稱的最佳 in-region 候選，連同名稱一起校正。
        let fuzzy = null;
        try { fuzzy = await searchVerifiedPlaceCandidate(name, stop, region, title, resolveTripCenter(region, title)); } catch (e) {}
        if (fuzzy && fuzzy.position
          && !isCoordinatesOutsideRegion(fuzzy.position, region, name)
          && Number(fuzzy.score) > 0) {
          cand = fuzzy;
          renamed = true;
        } else {
          console.info('[coord reverify] 無嚴格配對候選：', name);
          return;
        }
      }
      if (isCoordinatesOutsideRegion(cand.position, region, name)) { console.info('[coord reverify] 候選超出範圍，略過：', name, cand.name); return; }
      const dist = cur ? measureDistanceMeters(cur, cand.position) : Infinity;
      if (!cur || dist > 800 || renamed) {
        stop.lat = cand.position.lat;
        stop.lng = cand.position.lng;
        stop.scenicCoordinates = { lat: cand.position.lat, lng: cand.position.lng };
        stop.coordinateSource = renamed ? 'places_fuzzy_reverify' : 'places_reverify';
        snapped++;
        console.info(renamed ? '[coord reverify snap(fuzzy)]' : '[coord reverify snap]', name, '→', cand.name, cand.position, '(原', cur, '偏移', Number.isFinite(dist) ? Math.round(dist) + 'm' : '無座標', ')');
        // 名稱也校正成 Google 正規名（嚴格配對失敗時的別名修正）
        if (renamed && cand.name && cand.name !== stop.name) {
          console.info('[coord reverify rename]', stop.name, '→', cand.name);
          stop.name = cand.name;
          if (cand.placeId) stop.placeId = cand.placeId;
        }
      }
      // 標記此站已驗證（連同 stops 一起存檔）→ 下次載入直接跳過，不再重打 Places
      stop.coordVerified = true;
    };

    // 分批平行（每批 5 站）：整段耗時從「逐站排隊」降為「站數/5 輪」；
    // 批次上限是為了不觸發 Places QPS 限流，勿一次全開。
    const BATCH_SIZE = 5;
    for (let i = 0; i < targets.length; i += BATCH_SIZE) {
      await Promise.all(targets.slice(i, i + BATCH_SIZE).map(verifyOne));
    }
    console.info(`[coord reverify] 完成：檢查 ${targets.length} 站、校正 ${snapped} 站`);
    return stops;
  }

  async function searchNearbyWithTokens(stop, areaCenter, radius = 4000) {
    const service = getPlacesService();
    if (!service || !areaCenter) return null;
    const tokens = collectSearchTokens(stop?.name, stop?.desc)
      .filter(t => t.length >= 2)
      .slice(0, 4);

    for (const token of tokens) {
      const results = await new Promise(resolve => {
        service.nearbySearch({
          location: new google.maps.LatLng(areaCenter.lat, areaCenter.lng),
          radius,
          keyword: token
        }, (res, status) => {
          const ok = hasGooglePlacesService()
            ? google.maps.places.PlacesServiceStatus.OK : 'OK';
          if (status !== ok || !Array.isArray(res) || !res.length) return resolve([]);
          resolve(res);
        });
      });

      if (results.length) {
        const loc = results[0]?.geometry?.location;
        if (loc) return { lat: loc.lat(), lng: loc.lng() };
      }
    }
    return null;
  }

  async function refineStopCoordinatesAsync(stop, basePosition, region, title = '', presetMatch = null) {
    if (!basePosition) return null;

    const searchTerms = buildStopSearchTerms(stop, region, title, presetMatch);
    for (const term of searchTerms) {
      const refined = await searchPrecisePlaceCoordinates(term, stop, region, title, basePosition);
      if (!refined) continue;

      const distance = measureDistanceMeters(basePosition, refined);
      if (distance <= 5000) {
        return refined;
      }
    }

    return null;
  }

  async function geocodeAddress(query) {
    const normalizedQuery = String(query || '').trim();
    if (!normalizedQuery || !hasGoogleGeocoder()) return null;
    if (geocodeCache.has(normalizedQuery)) {
      return geocodeCache.get(normalizedQuery);
    }

    const geocoder = new google.maps.Geocoder();
    const result = await new Promise((resolve) => {
      geocoder.geocode(
        {
          address: normalizedQuery,
          region: 'TW'
        },
        (results, status) => {
          if (status === 'OK' && results && results[0] && results[0].geometry && results[0].geometry.location) {
            const location = results[0].geometry.location;
            resolve({
              lat: location.lat(),
              lng: location.lng()
            });
          } else {
            resolve(null);
          }
        }
      );
    });

    geocodeCache.set(normalizedQuery, result);
    return result;
  }

  async function resolveTripCenterAsync(region, title = '') {
    const geoRegion = resolveGeoRegion(region);
    const preset = findRegionMapPreset(geoRegion, title);
    if (preset) return { ...preset.center };

    const candidates = [geoRegion, title, `${geoRegion || ''} 台灣`, `${title || ''} 台灣`]
      .map((item) => String(item || '').trim())
      .filter(Boolean);

    for (const candidate of candidates) {
      const found = await geocodeAddress(candidate);
      if (found) return found;
    }

    return resolveTripCenter(region, title);
  }

  async function resolveStopCoordinatesAsync(stop, index, region, title = '') {
    if (isTubanVillageContext(region, title) && stop && stop.name) {
      const aliased = resolveTubanAlias(stop.name);
      if (aliased !== stop.name) stop = { ...stop, name: aliased };
    }

    // 若座標被鎖定（如離島返程本島港口），直接回傳，不觸發 Firebase 或地理編碼
    if (stop._lockedCoordinates) {
      const locked = readCoordinateObject(stop._lockedCoordinates);
      if (locked) return locked;
    }

    // start/end stops return stored coordinates directly without Firebase lookup
    if (stop.type === 'start' || stop.type === 'end') {
      const ownCoords = getExactCoordinateFromStop(stop) || readCoordinateObject(stop.scenicCoordinates);
      if (ownCoords) return ownCoords;
    }

    const scenicRecord = await resolveScenicPointRecord(stop, region, title);
    if (scenicRecord && scenicRecord.scenicCoordinates) {
      return scenicRecord.scenicCoordinates;
    }

    const exactPosition = getExactCoordinateFromStop(stop);
    if (exactPosition) return exactPosition;

    const presetMatch = findPresetSpotMatch(stop, region, title);
    if (presetMatch) {
      const refinedPresetPosition = await refineStopCoordinatesAsync(
        stop,
        { lat: presetMatch.lat, lng: presetMatch.lng },
        region,
        title,
        presetMatch
      );
      let resolvedPresetPosition = refinedPresetPosition || { lat: presetMatch.lat, lng: presetMatch.lng };
      resolvedPresetPosition = await enforceRegionAwareCoordinates(stop, resolvedPresetPosition, region, title, {
        lat: presetMatch.lat,
        lng: presetMatch.lng
      });
      await upsertScenicPointRecord(stop, resolvedPresetPosition, region, title);
      return resolvedPresetPosition;
    }

    const searchTerms = buildStopSearchTerms(stop, region, title);

    for (const term of searchTerms) {
      const found = await geocodeAddress(term);
      if (!found) continue;
      const refined = await refineStopCoordinatesAsync(stop, found, region, title);
      let resolvedSearchPosition = refined || found;
      resolvedSearchPosition = await enforceRegionAwareCoordinates(stop, resolvedSearchPosition, region, title, found);
      await upsertScenicPointRecord(stop, resolvedSearchPosition, region, title);
      return resolvedSearchPosition;
    }

    const TUBAN_CENTER = { lat: 22.3797, lng: 120.8953 };
    if (isTubanVillageContext(region, title)) {
      const nearbyPos = await searchNearbyWithTokens(stop, TUBAN_CENTER, 4000);
      if (nearbyPos) {
        await upsertScenicPointRecord(stop, nearbyPos, region, title);
        return nearbyPos;
      }
      await upsertScenicPointRecord(stop, TUBAN_CENTER, region, title);
      return TUBAN_CENTER;
    }

    const center = await resolveTripCenterAsync(region, title);
    const ringOffset = [
      { lat: 0, lng: 0 },
      { lat: 0.0035, lng: 0.002 },
      { lat: -0.003, lng: 0.0034 },
      { lat: 0.0022, lng: -0.0036 },
      { lat: -0.0028, lng: -0.0022 }
    ];
    const offset = ringOffset[index % ringOffset.length];
    const fallbackPosition = {
      lat: center.lat + offset.lat,
      lng: center.lng + offset.lng
    };
    const refinedFallback = await refineStopCoordinatesAsync(stop, fallbackPosition, region, title);
    return refinedFallback || fallbackPosition;
  }

  async function validateAiStopTemplate(template, region, title = '', aiCoordHint = null) {
    if (!template || !template.name) return null;

    const exactPosition = getExactCoordinateFromStop(template);
    if (exactPosition) {
      return {
        ...template,
        scenicCoordinates: exactPosition
      };
    }

    const scenicRecord = await resolveScenicPointRecord(template, region, title);
    if (scenicRecord && scenicRecord.scenicCoordinates) {
      return {
        ...template,
        name: scenicRecord.name || template.name,
        emoji: scenicRecord.emoji || template.emoji,
        scenicCoordinates: scenicRecord.scenicCoordinates,
        scenicPointId: scenicRecord.id || ''
      };
    }

    const presetMatch = findPresetSpotMatch(template, region, title);
    if (presetMatch) {
      const coordinates = { lat: presetMatch.lat, lng: presetMatch.lng };
      await upsertScenicPointRecord(template, coordinates, region, title);
      return {
        ...template,
        scenicCoordinates: coordinates
      };
    }

    // TDX 觀光 Open Data 查詢：在 Places API 之前，優先用政府資料比對
    const tdxCounty = resolveTdxCounty(region, title);
    const tdxSpots = await fetchTdxScenicSpots(tdxCounty);
    const tdxMatch = findTdxScenicMatch(String(template.name || '').trim(), tdxSpots);
    if (tdxMatch) {
      const pos = { lat: tdxMatch.lat, lng: tdxMatch.lng };
      const enriched = { ...template, businessHours: tdxMatch.openTime || template.businessHours || '' };
      await upsertScenicPointRecord(enriched, pos, region, title);
      console.info(`[TDX] 命中景點：${template.name}`);
      return { ...enriched, scenicCoordinates: pos };
    }

    const regionCenter = await resolveTripCenterAsync(region, title);
    const biasCenter = (aiCoordHint && !isCoordinatesOutsideRegion(aiCoordHint, region, title))
      ? aiCoordHint
      : regionCenter;
    const searchQuery = String(template.name || '').trim();
    let candidate = await searchVerifiedPlaceCandidate(searchQuery, template, region, title, biasCenter);
    if (candidate && isCoordinatesOutsideRegion(candidate.position, region, title)) {
      const strictQueries = buildRegionAwareSearchQueries(template, region, title);
      for (const query of strictQueries) {
        const strictCandidate = await searchVerifiedPlaceCandidate(query, template, region, title, biasCenter);
        if (strictCandidate && !isCoordinatesOutsideRegion(strictCandidate.position, region, title)) {
          candidate = strictCandidate;
          break;
        }
      }
    }
    if (!candidate || candidate.score < 10) return null;

    const distance = measureDistanceMeters(biasCenter, candidate.position);
    if (distance > 20000) return null;

    // 查詢 Google Maps 營業時間，同時強化真實性驗證
    const hoursInfo = candidate.placeId
      ? await fetchPlaceOpeningHours(candidate.placeId)
      : null;

    const openTimeStr = hoursInfo && hoursInfo.weekdayText.length
      ? (hoursInfo.isOpen24Hours ? '24小時' : hoursInfo.weekdayText.join('\n'))
      : '';

    // 永久關閉標記：Google Maps 資料可能過舊（尤其偏遠社區設施）。
    // 保留 Places API 的精確座標，僅在營業時間欄位加上提示，讓使用者自行判斷。
    const possiblyClosedNote = (hoursInfo && hoursInfo.businessStatus === 'CLOSED_PERMANENTLY')
      ? '⚠️ Google Maps 標記為已停業，出發前請再確認'
      : '';
    if (possiblyClosedNote) {
      console.info(`景點可能已停業，保留座標繼續規劃：${template.name}`);
    }

    const enrichedTemplate = {
      ...template,
      businessHours: possiblyClosedNote || openTimeStr || template.businessHours || '',
      placeId: candidate.placeId || template.placeId || ''
    };

    await upsertScenicPointRecord(enrichedTemplate, candidate.position, region, title);
    return {
      ...enrichedTemplate,
      scenicCoordinates: candidate.position
    };
  }

  async function rebuildMapPinLocationsFromStops() {
    const rebuildToken = ++mapRebuildToken;
    const nextLocations = {};
    for (let idx = 0; idx < replanStops.length; idx += 1) {
      if (rebuildToken !== mapRebuildToken) return false;
      const stop = replanStops[idx];
      const pinId = stop.mapPinId || `auto-pin-${idx + 1}`;
      stop.mapPinId = pinId;

      // 鎖定座標的站點（如離島返程港口）直接使用指定座標，不查 Firebase 或地理編碼
      if (stop._lockedCoordinates) {
        const lockedPos = readCoordinateObject(stop._lockedCoordinates);
        if (lockedPos) {
          const safePos = safeLatLng(lockedPos);
          stop.scenicCoordinates = lockedPos;
          nextLocations[pinId] = {
            lat: safePos.lat,
            lng: safePos.lng,
            title: `${stop.emoji || '📍'} ${stop.name || '景點'}`
          };
          if (typeof pinData !== 'undefined') {
            pinData[pinId] = Object.assign({}, pinData[pinId] || {}, { lat: safePos.lat, lng: safePos.lng });
          }
          continue;
        }
      }

      // start/end stops use their stored coordinates directly — skip Firebase lookup
      if (stop.type === 'start' || stop.type === 'end') {
        const ownPos = readCoordinateObject(stop.scenicCoordinates) || readCoordinateObject(stop);
        if (ownPos) {
          const safePos = safeLatLng(ownPos);
          stop.scenicCoordinates = ownPos;
          nextLocations[pinId] = { lat: safePos.lat, lng: safePos.lng, title: `${stop.emoji || '📍'} ${stop.name || '景點'}` };
          if (typeof pinData !== 'undefined') {
            pinData[pinId] = Object.assign({}, pinData[pinId] || {}, { lat: safePos.lat, lng: safePos.lng });
          }
          continue;
        }
      }
      const scenicRecord = await resolveScenicPointRecord(stop, currentTripRegion, currentTripTitle);
      const resolvedPosition = await resolveStopCoordinatesAsync(stop, idx, currentTripRegion, currentTripTitle);
      if (rebuildToken !== mapRebuildToken) return false;
      if (scenicRecord && scenicRecord.scenicCoordinates) {
        stop.scenicPointId = scenicRecord.id || stop.scenicPointId || buildScenicPointKey(stop.name, currentTripRegion);
        stop.scenicCoordinates = scenicRecord.scenicCoordinates;
      } else if (resolvedPosition) {
        stop.scenicCoordinates = resolvedPosition;
      }
      // Prefer scenicRecord coordinates, then freshly resolved position.
      // If both missing, try to reuse the existing mapPinLocations entry or current marker position
      // to avoid snapping pins to the trip center unexpectedly.
      let candidatePos = null;
      if (scenicRecord && scenicRecord.scenicCoordinates) {
        candidatePos = scenicRecord.scenicCoordinates;
      } else if (resolvedPosition) {
        candidatePos = resolvedPosition;
      } else if (mapPinLocations && mapPinLocations[pinId] && Number.isFinite(Number(mapPinLocations[pinId].lat)) && Number.isFinite(Number(mapPinLocations[pinId].lng))) {
        candidatePos = mapPinLocations[pinId];
      } else if (markers && markers[pinId] && typeof markers[pinId].getPosition === 'function') {
        try {
          const p = markers[pinId].getPosition();
          if (p && typeof p.lat === 'function' && typeof p.lng === 'function') {
            candidatePos = { lat: p.lat(), lng: p.lng() };
          }
        } catch (e) {
          // ignore
        }
      }
      const _pos = safeLatLng(candidatePos);
      nextLocations[pinId] = {
        lat: _pos.lat,
        lng: _pos.lng,
        title: `${stop.emoji || scenicRecord?.emoji || '📍'} ${stop.name || scenicRecord?.name || stop.desc || '景點'}`
      };
      if (typeof pinData !== 'undefined') {
        pinData[pinId] = {
          ...buildSpotPinPayload({
          emoji: stop.emoji || scenicRecord?.emoji || '📍',
          name: stop.name || scenicRecord?.name || stop.desc || '景點',
          desc: scenicRecord?.desc || stop.desc || '',
          notice: scenicRecord?.notice || stop.notice || '',
          region: currentTripRegion,
          title: currentTripTitle
          }),
          lat: _pos.lat,
          lng: _pos.lng,
          businessHours: stop.businessHours || scenicRecord?.businessHours || null
        };
      }
    }

    if (rebuildToken !== mapRebuildToken) return false;
    Object.keys(mapPinLocations).forEach((key) => {
      delete mapPinLocations[key];
    });
    Object.entries(nextLocations).forEach(([key, value]) => {
      mapPinLocations[key] = value;
    });
    return true;
  }

  // 端點站（起點/終點）預設停留 0；但若該端點本身是合併大景點（含子景點，如綠島起點富岡漁港
  // 一帶的富岡燈塔/地質公園），需保留停留時間才能遊覽其子景點。其餘端點維持 0。
  function resolveStopStayMin(s, fallback) {
    const isEndpoint = s && (s.type === 'start' || s.type === 'end');
    const hasMergedSubSpots = s && s.isMergedAttraction
      && Array.isArray(s.mergedSubSpots) && s.mergedSubSpots.length > 0;
    if (isEndpoint && !hasMergedSubSpots) return 0;
    return s.duration || s.stayMin || fallback;
  }

  // ── App 端（Android）共編欄位保留 ──
  // App 端在每個 stop 上寫自己的欄位（duration/time/order/stopId…，未來還會加）。
  // Firestore 的陣列無法逐元素 merge，網頁端存檔是整包覆寫 stops，
  // 所以載入時把「非網頁 schema」的欄位原樣收進 stop.__appExtras，
  // 存檔時鋪回快照，避免把他端資料剝掉。網頁 schema 欄位（含 duration，
  // 由 stayMin 同步）不進 extras，以免舊值蓋掉網頁端的編輯。
  const WEB_STOP_FIELDS = new Set([
    'name', 'emoji', 'type', 'stayMin', 'duration', 'transitMin', 'transitMode',
    'lat', 'lng', 'scenicCoordinates', '_lockedCoordinates', 'nearbyToiletLocations',
    'mapPinId', 'manualStartMin', 'manualEndMin', 'placeId', 'businessHours',
    'coordVerified', 'desc', 'isMergedAttraction', 'mergedSubSpots',
    'mergedRadiusMeters', 'mergedMemberCoords', 'checkedInAt', 'isOutdoor', 'altNearby'
  ]);
  function extractAppStopExtras(raw) {
    if (!raw || typeof raw !== 'object') return null;
    let extras = null;
    Object.keys(raw).forEach((k) => {
      if (WEB_STOP_FIELDS.has(k) || k === '__appExtras') return;
      if (raw[k] === undefined) return; // Firestore 不接受 undefined
      if (!extras) extras = {};
      extras[k] = raw[k];
    });
    return extras;
  }

  // 港口/端點站描述清理：去掉完整「（含 …）」，再移除尾端未閉合的破碎括號片段
  // （如 AI desc 末端殘留「…探索（s…」沒有對應的右括號），避免顯示亂碼。
  function sanitizeHarborDesc(desc) {
    let text = String(desc || '');
    if (!text) return text;
    text = parseIncludedSpotsFromDesc(text).clean;
    const lastOpen = Math.max(text.lastIndexOf('（'), text.lastIndexOf('('));
    if (lastOpen >= 0 && !/[）)]/.test(text.slice(lastOpen))) {
      text = text.slice(0, lastOpen);
    }
    return text.replace(/\s+/g, ' ').trim();
  }

  async function initFromUrl() {
    try {
      const params = new URLSearchParams(window.location.search);
      const explicitTripId = params.get('id') || params.get('sharedId');
      const isGuestView = params.get('guest') === '1';
      const myTrips = JSON.parse(localStorage.getItem('wai_mytrips') || '[]');
      const rememberedTripId = localStorage.getItem(ACTIVE_TRIP_LOCAL_KEY) || '';
      const fallbackTripId = rememberedTripId || (myTrips[0] && myTrips[0].id) || '';
      const tripId = explicitTripId || fallbackTripId;
      if (tripId) {
        let trip = myTrips.find(t => t.id === tripId);

        // 共編行程：本機快取可能是 join 當下的空殼（stops/members 都舊）→ 一律抓最新 Firebase 為準
        if ((!trip || trip.collab) && typeof firebase !== 'undefined' && firebaseEnabled && firebaseDb) {
           try {
             const doc = await firebaseDb.collection('micro_trips').doc(tripId).get();
             if (doc.exists) {
               const fresh = doc.data();
               if (!fresh.id) fresh.id = doc.id;
               // 訪客唯讀連結：必須帶對 shareToken 且行程開放分享，否則不得載入
               // （tripId 可被推測；token 是不可猜的門檻，前端亦需驗證，不能只依賴 Firestore 規則）
               if (isGuestView && fresh.collab) {
                 const paramToken = params.get('token') || '';
                 const tokenOk = fresh.shareToken && paramToken === fresh.shareToken;
                 if (!fresh.guestReadable || !tokenOk) {
                   document.body.innerHTML = '<div style="padding:48px 24px;text-align:center;font-family:sans-serif;color:#37506e;">'
                     + '<div style="font-size:40px;margin-bottom:12px;">🔒</div>'
                     + '<h2 style="margin:0 0 8px;">分享連結無效</h2>'
                     + '<p style="color:#8fa4b8;">這個分享連結已失效或無權限查看，請向擁有者索取新的連結。</p></div>';
                   return;
                 }
               }
               trip = trip ? { ...trip, ...fresh } : fresh;
             }
           } catch (err) {
             console.warn('Failed to fetch trip from Firebase:', err);
           }
        }

        // 多人共作：依角色決定唯讀。訪客一律唯讀；登入者非 owner/editor 也唯讀。
        if (trip && trip.collab) {
          let myEmail = '';
          try { const u = JSON.parse(localStorage.getItem('wai_user') || '{}'); myEmail = (u && u.currentUser && u.currentUser.email) || ''; } catch (_e) {}
          const ekey = String(myEmail || '').toLowerCase().replace(/[^a-z0-9]/g, '_');
          const mem = trip.members && trip.members[ekey];
          // 角色以 members[ekey] 為權威（變更 B 已確保抓到含 members 的最新文件）；
          // 本機 trip.role 僅作 Firebase 抓不到時的離線退路。
          collabRole = isGuestView ? 'guest' : ((mem && mem.role) || trip.role || 'viewer');
          collabReadOnly = isGuestView || !(collabRole === 'owner' || collabRole === 'editor');
          if (collabReadOnly) showCollabReadOnlyBanner(collabRole);
          // 旅伴頁用：存下共編成員/擁有者/邀請資訊
          currentTripIsCollab = true;
          currentTripMembers = trip.members || null;
          currentTripOwnerName = trip.ownerName || trip.organizer || '';
          currentTripShareToken = trip.shareToken || '';
          currentTripDepartureDate = (trip.wizardData && trip.wizardData.departureDate) || trip.departureDate || '';
          // 多人即時同步：訂閱這份共編行程，任一成員（owner/editor）改動後所有人立即重繪
          startCollabTripLiveSync(trip.id || tripId);
        }

        if (trip) {
          localStorage.setItem(ACTIVE_TRIP_LOCAL_KEY, trip.id);
          currentItineraryId = trip.id;
          currentTripTitle = trip.title || trip.aiTitle || '微旅行';
          currentTripStatus = trip.status || 'planning';
          currentStopIndex = Number.isInteger(trip.currentStopIndex) ? trip.currentStopIndex : -1;
          currentTripStartedAt = trip.startedAt || null;
          tripSessionId = `${currentItineraryId}-${Date.now()}`;
          if (trip.inviteCode) currentInviteCode = trip.inviteCode;
          
          // Update Titles in DOM immediately
          const heroTitleEl = document.querySelector('#view-itinerary .hero-title');
          if (heroTitleEl) {
            let statusSuffix = '';
            if (currentTripStatus === 'ongoing') {
              statusSuffix = ' <span class="hero-status-badge ongoing">⚡ 進行中</span>';
            } else if (currentTripStatus === 'completed') {
              statusSuffix = ' <span class="hero-status-badge completed">🎉 已完成</span>';
            }
            heroTitleEl.innerHTML = escapeHtml(currentTripTitle) + statusSuffix;
          }
          const bpTitleEl = document.querySelector('.boarding-pass .bp-top > div:nth-child(3)');
          if (bpTitleEl) bpTitleEl.textContent = currentTripTitle;
          
          const heroTags = document.querySelectorAll('#view-itinerary .hero-meta .hero-tag');
          if (heroTags.length >= 2) {
             heroTags[1].textContent = `📍 ${trip.region || '客製化行程'}`;
          }
          currentTripRegion = trip.region || currentTripRegion;
          currentTripPreferences = trip.wizardData || {};
          renderMembersView(); // 旅伴頁：行程載入後即填好真實成員/邀請資料
          const bpDestEl = document.querySelector('.boarding-pass .bp-dest');
          if (bpDestEl) bpDestEl.textContent = trip.region || 'TRAVEL';
          
          const weatherLocationEl = document.querySelector('.weather-card .wc-header > div > div:first-child');
          if (weatherLocationEl) weatherLocationEl.textContent = `目前 · ${trip.region || '當地'}`;

          if (trip.stops && Array.isArray(trip.stops) && trip.stops.length > 0) {
            // Clear existing default pins for a fresh map
            for (const key in mapPinLocations) {
               delete mapPinLocations[key];
            }

            // 先重驗中段站座標：修正已存檔的錯誤定位（如成功漁港→富岡漁港、比西里岸→海上）。
            // 放在合併/enrich 之前，讓後續的距離合併與附近搜尋都用校正後的座標，避免誤併或吸入別處子景點。
            await verifyStopCoordinatesWithPlaces(trip.stops, trip.region, currentTripTitle).catch(() => {});
            const dedupedStops = mergeNearbySubAttractions(deduplicateAdjacentTripStops(trip.stops));
            const islandConfig = getIslandFerryConfig(trip.region);
            const normalizedStops = islandConfig ? normalizeIslandHarborStops(dedupedStops, islandConfig) : dedupedStops;
            // 大景區以單站存檔時，重開即用 Places 附近搜尋補出子景點並標記合併（就地貼標籤，欄位於下方 map 帶入）
            await enrichBigAttractionSubSpots(normalizedStops, trip.region).catch(() => {});
            // 對齊描述「（含 …）」與 mergedSubSpots，並清掉歷次累加的重複括號（純字串，不依賴 Places）
            reconcileMergedSubSpots(normalizedStops);

            // 返程/端點港口清理：返回港不應是合併大景點（清掉 merged 欄位），desc 去掉殘留「（含…）」與破碎括號。
            // 注意：起點本島港（首站）刻意保留其子景點與停留時間（前次決策），故不清。
            const _lastStopIdx = normalizedStops.length - 1;
            normalizedStops.forEach((s, idx) => {
              if (!s) return;
              if (s.type === 'start' || idx === 0) return; // 保留起點本島港的子景點/停留
              const isMainlandHarbor = islandConfig && isMainlandHarborStop(s.name, islandConfig);
              const isIslandHarbor = islandConfig && isIslandHarborStop(s.name, islandConfig);
              const isReturnHarbor = s.type === 'end'
                || isIslandHarbor                              // 島內上船港（返程）一律純轉乘點
                || (idx === _lastStopIdx && isMainlandHarbor); // 尾站本島港＝返回本島
              if (!isReturnHarbor) return;
              if (s.isMergedAttraction || s.mergedSubSpots || s.mergedRadiusMeters || s.mergedMemberCoords) {
                s.isMergedAttraction = false;
                s.mergedSubSpots = null;
                s.mergedRadiusMeters = null;
                s.mergedMemberCoords = null;
              }
              if (typeof s.desc === 'string') s.desc = sanitizeHarborDesc(s.desc);
            });

            replanStops = await Promise.all(normalizedStops.map(async (s, idx) => {
              const assignedPinId = `ai-pin-loaded-${idx}`;

              // 座標鎖定的站點（如離島港口）：直接使用指定座標，跳過 Firebase 查詢
              if (s._lockedCoordinates) {
                const lockedPos = readCoordinateObject(s._lockedCoordinates);
                if (lockedPos) {
                  const safePos = safeLatLng(lockedPos);
                  mapPinLocations[assignedPinId] = { lat: safePos.lat, lng: safePos.lng,
                    title: `${s.emoji || '📍'} ${s.name || '景點'}` };
                  if (typeof pinData !== 'undefined') {
                    pinData[assignedPinId] = {
                      ...buildSpotPinPayload({ emoji: s.emoji || '📍', name: s.name || '景點',
                        desc: s.desc || '', notice: s.notice || '', region: trip.region || '', title: currentTripTitle }),
                      lat: safePos.lat, lng: safePos.lng
                    };
                  }
                  return {
                    id: `stop-${Date.now()}-${idx}`,
                    emoji: s.emoji || '📍', name: s.name || '景點',
                    type: s.type || null,
                    stayMin: resolveStopStayMin(s, 20),
                    transitMin: normalizeTransitMinutesValue(s.transitMin),
                    transitMode: normalizeTransitMode(s.transitMode),
                    mapPinId: assignedPinId,
                    scenicCoordinates: lockedPos, _lockedCoordinates: lockedPos,
                    placeId: s.placeId || null,
                    coordVerified: s.coordVerified || false, // 旗標必須跟著載入，否則存檔歸零、下次又全站重驗
                    businessHours: s.businessHours || null,
                    desc: s.desc || '',
                    isMergedAttraction: s.isMergedAttraction || false,
                    mergedSubSpots: s.mergedSubSpots || null,
                    mergedRadiusMeters: s.mergedRadiusMeters || null,
                    mergedMemberCoords: s.mergedMemberCoords || null,
                    lat: safePos.lat, lng: safePos.lng, nearbyToiletLocations: [],
                    manualStartMin: s.manualStartMin ?? null, manualEndMin: s.manualEndMin ?? null, // 手動調整的時間必須跟著載入，否則重載後時刻歸零、共編成員間不一致
                    checkedInAt: s.checkedInAt || null,
                    isOutdoor: s.isOutdoor || false, altNearby: s.altNearby || null, // Plan B 替代景點跟著載入
                    __appExtras: extractAppStopExtras(s) // App 端欄位（time/order/stopId…）存檔時鋪回
                  };
                }
              }

              let resolvedPosition;
              let scenicRecord = null;
              if ((s.type === 'start' || s.type === 'end') && Number.isFinite(Number(s.lat)) && Number.isFinite(Number(s.lng))) {
                const aiCoord = { lat: Number(s.lat), lng: Number(s.lng) };
                // Step 2：preset 座標校正 — AI hallucinate 出錯誤的車站座標時，用 preset 內已驗證的座標把它 snap 回正確位置
                const presetSpot = findPresetSpotMatch(s, trip.region, currentTripTitle);
                if (presetSpot && measureDistanceMeters(aiCoord, { lat: presetSpot.lat, lng: presetSpot.lng }) > 3000) {
                  console.info('[start/end coord snap]', s.name, 'AI:', aiCoord, '→ preset:', presetSpot);
                  resolvedPosition = { lat: presetSpot.lat, lng: presetSpot.lng };
                } else if (!presetSpot && isCoordinatesOutsideRegion(aiCoord, trip.region, currentTripTitle)) {
                  // 沒有 preset 比對基準，但 AI 給的座標已超出 region 範圍 → 落到下方完整解析流程
                  scenicRecord = await resolveScenicPointRecord(s, trip.region, currentTripTitle);
                  const cachedCoords = scenicRecord?.scenicCoordinates;
                  resolvedPosition = (cachedCoords && !isCoordinatesOutsideRegion(cachedCoords, trip.region, s.name))
                    ? cachedCoords
                    : await resolveStopCoordinatesAsync(s, idx, trip.region, currentTripTitle);
                } else {
                  resolvedPosition = aiCoord;
                }
              } else {
                scenicRecord = await resolveScenicPointRecord(s, trip.region, currentTripTitle);
                const cachedCoords = scenicRecord?.scenicCoordinates;
                resolvedPosition = (cachedCoords && !isCoordinatesOutsideRegion(cachedCoords, trip.region, s.name))
                  ? cachedCoords
                  : await resolveStopCoordinatesAsync(s, idx, trip.region, currentTripTitle);
              }
              const normalizedTransitMode = normalizeTransitMode(s.transitMode);
              const persistedTransitMin = normalizeTransitMinutesValue(s.transitMin);

              // Only place a pin when the stop has a real resolved position.
              // safeLatLng falls back to the trip centre when pos is null,
              // which would create a misleading marker at the wrong location.
              const _pos = resolvedPosition ? safeLatLng(resolvedPosition) : null;
              if (_pos) {
                mapPinLocations[assignedPinId] = {
                  lat: _pos.lat,
                  lng: _pos.lng,
                  title: `${s.emoji || scenicRecord?.emoji || '📍'} ${s.name || scenicRecord?.name || s.desc || '景點'}`
                };
              }

              if (typeof pinData !== 'undefined') {
                pinData[assignedPinId] = {
                  ...buildSpotPinPayload({
                  emoji: s.emoji || scenicRecord?.emoji || '📍',
                  name: s.name || scenicRecord?.name || s.desc || '景點',
                  desc: scenicRecord?.desc || s.desc || '',
                  notice: scenicRecord?.notice || s.notice || '',
                  region: trip.region || '',
                  title: currentTripTitle
                  }),
                  lat: _pos.lat,
                  lng: _pos.lng
                };
              }

              return {
                id: `stop-${Date.now()}-${idx}`,
                emoji: s.emoji || scenicRecord?.emoji || '📍',
                name: s.name || scenicRecord?.name || s.desc || '景點',
                type: s.type || null,
                stayMin: resolveStopStayMin(s, 30),
                transitMin: persistedTransitMin,
                transitMode: normalizedTransitMode,
                mapPinId: assignedPinId,
                scenicCoordinates: resolvedPosition,
                placeId: s.placeId || scenicRecord?.placeId || null,
                coordVerified: s.coordVerified || false, // 旗標必須跟著載入，否則存檔歸零、下次又全站重驗
                businessHours: s.businessHours || scenicRecord?.businessHours || null,
                desc: (scenicRecord?.desc || s.desc || ''),
                isMergedAttraction: s.isMergedAttraction || false,
                mergedSubSpots: s.mergedSubSpots || null,
                mergedRadiusMeters: s.mergedRadiusMeters || null,
                mergedMemberCoords: s.mergedMemberCoords || null,
                lat: _pos.lat,
                lng: _pos.lng,
                nearbyToiletLocations: s.nearbyToiletLocations || [],
                manualStartMin: s.manualStartMin ?? null, manualEndMin: s.manualEndMin ?? null, // 手動時間跟著載入，否則重載歸零、成員時刻不一致
                checkedInAt: s.checkedInAt || null,
                isOutdoor: s.isOutdoor || false, altNearby: s.altNearby || null, // Plan B 替代景點跟著載入
                __appExtras: extractAppStopExtras(s) // App 端欄位（time/order/stopId…）存檔時鋪回
              };
            }));
            
            // 離島行程：若最後一站不是島上港口，自動加入返回出發港口的站點
            if (islandConfig && !isIslandHarborStop(replanStops[replanStops.length - 1]?.name, islandConfig)) {
              const returnHarbor = islandConfig.islandHarbor;
              const returnPinId = `ai-pin-return-${Date.now()}`;
              const returnPos = { lat: returnHarbor.lat, lng: returnHarbor.lng };
              mapPinLocations[returnPinId] = {
                lat: returnPos.lat,
                lng: returnPos.lng,
                title: `${returnHarbor.emoji} ${returnHarbor.name}`
              };
              if (typeof pinData !== 'undefined') {
                pinData[returnPinId] = {
                  title: `${returnHarbor.emoji} ${returnHarbor.name}`,
                  desc: `結束遊覽，返回出發港口 ${returnHarbor.name}，等候交通船離島。`,
                  notice: '請提前確認船班時刻與訂票，船班可能因天候取消，建議預留彈性。',
                  lat: returnPos.lat,
                  lng: returnPos.lng
                };
              }
              const returnStop = {
                id: `stop-return-${Date.now()}`,
                emoji: returnHarbor.emoji,
                name: returnHarbor.name,
                stayMin: 20,
                transitMin: null,
                transitMode: 'car',
                mapPinId: returnPinId,
                scenicCoordinates: returnPos,
                _lockedCoordinates: returnPos,
                lat: returnPos.lat,
                lng: returnPos.lng,
                nearbyToiletLocations: []
              };
              // 若最後一站是本島港（返回本島的終點），把島內上船港插在它「之前」，
              // 得到「島上景點 → 南寮(島內上船) → 富岡(本島抵達)」的正確順序；
              // 否則（最後一站是島上景點）照舊接在最後。
              const lastStopRef = replanStops[replanStops.length - 1];
              if (isMainlandHarborStop(lastStopRef?.name, islandConfig)) {
                replanStops.splice(replanStops.length - 1, 0, returnStop);
              } else {
                replanStops.push(returnStop);
              }
            }

            // 本島行程：若行程沒有終點站、且最後一站不是出發點，補一個「返回出發點」終點
            // （比照離島返程邏輯，修正既有沒有終點的行程，一打開就補上）
            if (!islandConfig && replanStops.length > 1) {
              const firstStop = replanStops[0];
              const lastStop = replanStops[replanStops.length - 1];
              const hasEnd = replanStops.some(s => s.type === 'end');
              const firstPos = readStopCoordinates(firstStop);
              if (!hasEnd && firstStop && firstPos && lastStop && lastStop.type !== 'end'
                  && normalizeText(lastStop.name) !== normalizeText(firstStop.name)) {
                const returnPinId = `ai-pin-return-${Date.now()}`;
                mapPinLocations[returnPinId] = { lat: firstPos.lat, lng: firstPos.lng, title: `🏁 ${firstStop.name}` };
                if (typeof pinData !== 'undefined') {
                  pinData[returnPinId] = {
                    ...buildSpotPinPayload({ emoji: '🏁', name: firstStop.name,
                      desc: `返回出發點 ${firstStop.name}，結束本次行程。`, region: trip.region || '', title: currentTripTitle }),
                    lat: firstPos.lat, lng: firstPos.lng
                  };
                }
                replanStops.push({
                  id: `stop-return-${Date.now()}`, emoji: '🏁', name: firstStop.name, type: 'end',
                  stayMin: 0, transitMin: null, transitMode: normalizeTransitMode(firstStop.transitMode),
                  mapPinId: returnPinId, scenicCoordinates: firstPos,
                  lat: firstPos.lat, lng: firstPos.lng, nearbyToiletLocations: []
                });
              }
            }

            // 載入後若超出設定時長 → 平均壓縮（餐廳例外），僅作畫面顯示。
            // 注意：載入路徑不可寫回 Firestore——壓縮/enrich 的重算值一旦回寫，
            // 會把 App 端剛存的 stayMin/duration 覆蓋掉（雙端共編互洗資料）。
            // 壓縮結果留在記憶體，待使用者實際互動存檔時才一併寫回。
            currentTripWindow.start = (trip.wizardData && trip.wizardData.startTime)
              || (replanStops[0] && replanStops[0].time)
              || '09:00';
            try {
              fitScheduleToTimeLimit();
            } catch (_e) { console.warn('[load] 超時壓縮略過：', _e); }

            const durationSum = replanStops.reduce((sum, s, idx) => {
              const stay = s.stayMin || 0;
              const transit = idx < replanStops.length - 1
                ? (Number.isFinite(s.transitMin) ? s.transitMin : 15)
                : 0;
              return sum + stay + transit;
            }, 0);
            const resolvedStartTime = (trip.wizardData && trip.wizardData.startTime)
              || (replanStops[0] && replanStops[0].time)
              || '09:00';
            currentTripWindow.start = resolvedStartTime;
            const startTotalMin = clockToMinutes(resolvedStartTime) || (9 * 60);
            const endMTotal = startTotalMin + durationSum;
            currentTripWindow.end = minutesToClock(endMTotal);

            if (heroTags.length >= 1) {
               heroTags[0].textContent = `⏱️ ${currentTripWindow.start} – ${currentTripWindow.end}`;
            }
            updateMapTimeBanner(currentTripWindow.start, currentTripWindow.end, endMTotal);
          }

          if (map) {
            await syncMapToCurrentTrip();
          }

          // 載入後背景補各站「附近廁所」文字（地圖 pin 仍只在點選階段時顯示）
          prefetchAllStopToiletData();

          // 載入 + enrichment 補上的 placeId / businessHours / 座標只留在記憶體，
          // 不在載入路徑回寫（只讀不寫）：開頁即整包 set stops 會把 App 端共編欄位
          // （duration/time/order/stopId…）洗掉、stayMin 也被重算值覆蓋。
          // 這些補值會在使用者下次實際互動存檔時一併帶上。
        }
      }
    } catch(e) { console.error('Init error:', e); }

  }

  const quickAddPool = [
    { baseId: 'dessert', emoji: '🍰', name: '巷口甜點補給', stayMin: 20 },
    { baseId: 'bookstore', emoji: '📚', name: '獨立書店短停', stayMin: 20 },
    { baseId: 'tea', emoji: '🍵', name: '在地茶飲休息', stayMin: 15 }
  ];

  const aiSuggestionPool = [
    { baseId: 'viewpoint', emoji: '🌇', name: 'AI建議：河堤觀景點', stayMin: 20 },
    { baseId: 'market', emoji: '🍢', name: 'AI建議：在地小吃攤', stayMin: 25 },
    { baseId: 'gallery', emoji: '🖼️', name: 'AI建議：小型展覽空間', stayMin: 20 }
  ];

  const modifySpotCatalog = [];

  function escapeHtml(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeXml(text) {
    return escapeHtml(text).replace(/\n/g, '&#10;');
  }

  function normalizeText(text) {
    return String(text || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  }

  function normalizeInviteCode(code) {
    return String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  function extractStopKeywords(text) {
    const source = String(text || '');
    const keywords = ['咖啡', '甜點', '甜品', '小吃', '麵', '海鮮', '文創', '書店', '市場', '夜市', '行李', '車站', '海濱', '觀景', '餐酒'];
    return keywords.filter((keyword) => source.includes(keyword));
  }

  function findDuplicateStopByName(name) {
    const candidateName = normalizeText(name);
    const candidateKeywords = extractStopKeywords(name);
    return replanStops.find((stop) => {
      const stopName = normalizeText(stop.name);
      if (candidateName && stopName && (candidateName === stopName || candidateName.includes(stopName) || stopName.includes(candidateName))) {
        return true;
      }
      const stopKeywords = extractStopKeywords(stop.name);
      return candidateKeywords.some((keyword) => stopKeywords.includes(keyword));
    }) || null;
  }

  function approxDistanceMeters(lat1, lng1, lat2, lng2) {
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function shouldMergeAdjacentStops(a, b) {
    // 「火車站→車站」正規化：「台東火車站」與「台東車站」是同一地，否則會出現
    // 起點車站旁再排一個同站「景點」、之間還走 15 分鐘的荒謬行程。
    const aN = normalizeText(a.name || '').replace(/火車站/g, '車站');
    const bN = normalizeText(b.name || '').replace(/火車站/g, '車站');
    // 若較短的名稱（≥3字）是另一個名稱的子字串，視為同地點
    const shorter = aN.length <= bN.length ? aN : bN;
    if (shorter.length >= 3 && (aN.includes(bN) || bN.includes(aN))) return true;
    // 若座標幾乎重疊（< 30 公尺），也視為同地點
    const coordA = readCoordinateObject(a['景點座標'] || a.scenicCoordinates || a.coordinates);
    const coordB = readCoordinateObject(b['景點座標'] || b.scenicCoordinates || b.coordinates);
    if (coordA && coordB && approxDistanceMeters(coordA.lat, coordA.lng, coordB.lat, coordB.lng) < 30) return true;
    return false;
  }

  function deduplicateAdjacentTripStops(stops) {
    if (!Array.isArray(stops) || stops.length < 2) return stops;
    const result = [];
    let i = 0;
    while (i < stops.length) {
      const curr = stops[i];
      const next = i + 1 < stops.length ? stops[i + 1] : null;
      if (next && shouldMergeAdjacentStops(curr, next)) {
        const currIsEndpoint = curr.type === 'start' || curr.type === 'end';
        const nextIsEndpoint = next.type === 'start' || next.type === 'end';
        if (currIsEndpoint !== nextIsEndpoint) {
          // 端點旁邊排了同一地點的「景點」（如起點台東車站後又出現台東火車站）：
          // 保留端點原樣（名稱/型別/0 停留），直接丟掉重複站——端點不該被改名或加停留時間。
          result.push(currIsEndpoint ? curr : next);
          i += 2;
          continue;
        }
        const currDur = curr.duration || curr.stayMin || 30;
        const nextDur = next.duration || next.stayMin || 30;
        // 保留較具描述性（較長）的名稱，合併停留時間
        const useCurr = (curr.name || '').length >= (next.name || '').length;
        result.push(Object.assign({}, curr, {
          name: useCurr ? curr.name : next.name,
          emoji: curr.emoji || next.emoji,
          stayMin: currDur + nextDur,
          duration: currDur + nextDur
        }));
        i += 2;
      } else {
        result.push(curr);
        i++;
      }
    }
    return result;
  }

  // === 同一大景區內密集子景點合併 ===
  // 例：三仙台周邊「看見三仙台e比西里岸／三仙台觀景海堤／礫石灘／三仙台」距離 300m～1.1km，
  // 即使不同名也屬同一大景區 → 合併成單一「三仙台」站，避免景點密集擠在目的地端。
  // 以「距離為主」：同區 800m 內即合併；同名（同前綴家族）再放寬到 2km；缺座標才退回名稱判定。
  const SUB_SPOT_MERGE_RADIUS_M = 800;
  const SUB_SPOT_NAME_MERGE_RADIUS_M = 2000;
  const SUB_SPOT_SAME_SPOT_RADIUS_M = 300; // 不同名景點僅在此極近距離內才視為「同一處」而合併

  function readStopCoordinates(stop) {
    if (!stop) return null;
    if (Number.isFinite(Number(stop.lat)) && Number.isFinite(Number(stop.lng))) {
      return { lat: Number(stop.lat), lng: Number(stop.lng) };
    }
    return readCoordinateObject(stop.scenicCoordinates || stop['景點座標'] || stop.coordinates) || null;
  }

  // 計算一組名稱的最長共同前綴（以原始字串逐字比較，作為「大景點」顯示名）
  function commonNamePrefix(names) {
    const list = (names || []).map(n => String(n || '')).filter(Boolean);
    if (!list.length) return '';
    let prefix = list[0];
    for (let i = 1; i < list.length; i++) {
      const cur = list[i];
      let j = 0;
      while (j < prefix.length && j < cur.length && prefix[j] === cur[j]) j++;
      prefix = prefix.slice(0, j);
      if (!prefix) break;
    }
    return prefix.trim();
  }

  // 是否為同一大景區的兄弟子景點（名稱共享主體）
  function isSameAttractionFamily(a, b) {
    const aN = normalizeText((a && a.name) || '');
    const bN = normalizeText((b && b.name) || '');
    if (!aN || !bN) return false;
    // 名稱互為子字串（較短者 ≥3 字）
    const shorter = aN.length <= bN.length ? aN : bN;
    if (shorter.length >= 3 && (aN.includes(bN) || bN.includes(aN))) return true;
    // 正規化後共同前綴 ≥ 3 字（涵蓋「三仙台」案例，避免「台東」這類兩字地名誤判）
    if (commonNamePrefix([aN, bN]).length >= 3) return true;
    return false;
  }

  // 是否為「餐廳／用餐站」：用餐站永不參與合併（既不被景點吸收、也不吸收景點），維持獨立用餐停留。
  // AI 生成的景點無 type 欄位，故以 tag（社群範例）＋ emoji ＋ 名稱關鍵字判定。
  const FOOD_EMOJI_SET = new Set(['🍜','🍱','☕','🍽️','🍽','🍦','🍢','🐟','🍲','🍛','🍔','🍕','🍻','🍸','🧋','🍵','🥟','🍤','🍧','🍨','🥘','🍰']);
  const FOOD_NAME_RE = /餐廳|食堂|小吃|料理|美食|便當|海鮮|餐酒|甜點|冰淇淋|冰品|火鍋|燒烤|烘焙|早午餐|咖啡|茶館|茶屋|夜市|cafe|coffee|restaurant/i;
  function isFoodStop(stop) {
    if (!stop) return false;
    if (stop.tag === 'food') return true;
    if (stop.emoji && FOOD_EMOJI_SET.has(String(stop.emoji).trim())) return true;
    const name = String(stop.name || stop.title || '');
    if (!name) return false;
    if (/飯店|飯館|麵店/.test(name)) return false; // 防誤判：飯店（住宿）等含「飯/麵」但非用餐站
    return FOOD_NAME_RE.test(name);
  }

  // 是否該歸入同一大景區（以距離為主）
  function shouldClusterStops(a, b) {
    if (isFoodStop(a) || isFoodStop(b)) return false; // 餐廳閘門：用餐站不與他站合併
    const ca = readStopCoordinates(a);
    const cb = readStopCoordinates(b);
    if (ca && cb) {
      const d = approxDistanceMeters(ca.lat, ca.lng, cb.lat, cb.lng);
      // 只併「真正同一景區」：同名家族放寬到 2km；不同名僅在極近(同一入口/同一處)才併，
      // 避免市區密集但不同的景點(海濱公園/生命之樹…)被 800m 規則塌成一站、壓縮整日時數。
      if (isSameAttractionFamily(a, b)) return d <= SUB_SPOT_NAME_MERGE_RADIUS_M;
      return d <= SUB_SPOT_SAME_SPOT_RADIUS_M;
    }
    // 缺座標：退回名稱判定（保守）
    return isSameAttractionFamily(a, b);
  }

  // 從一組名稱挑出「大景點名」：有共同前綴就用前綴（如三仙台觀景台/跨海步橋→三仙台），
  // 否則取「被最多其他成員名稱包含」者（如『三仙台』被多個子景點名包含），同分取最短。
  function pickClusterName(names) {
    const prefix = commonNamePrefix(names);
    // 前綴 ≥ 3 字、去掉行政區後綴（市/縣/鄉…）後仍 ≥ 3 字、且前綴本身即某個實際成員名時才採用，
    // 避免「台東」「花蓮市」等城市名或「綠島小」這類截斷片段變成合併站名（應落在具體地標）。
    if (prefix && prefix.length >= 3
      && prefix.replace(/[市縣鄉鎮區村里]$/, '').length >= 3
      && names.some(n => String(n) === prefix)) return prefix;
    let best = '', bestScore = -1;
    for (const cand of names) {
      const cn = normalizeText(cand);
      if (!cn) continue;
      const core = String(cand || '').trim().replace(/[市縣鄉鎮區村里]$/, '');
      if (core.length < 3) continue; // 跳過「台東」「花蓮市」等純地名，避免吃掉真實地標
      const score = names.reduce((acc, other) => acc + (normalizeText(other).includes(cn) ? 1 : 0), 0);
      if (score > bestScore || (score === bestScore && (best === '' || cand.length < best.length))) {
        best = cand; bestScore = score;
      }
    }
    return best
      || names.find(n => String(n || '').trim().replace(/[市縣鄉鎮區村里]$/, '').length >= 3)
      || names[0] || '景點';
  }

  // 從描述文字解析出已嵌入的「（含 A、B…）」子景點名，並回傳去掉這些括號後的乾淨描述
  function parseIncludedSpotsFromDesc(desc) {
    const text = String(desc || '');
    const names = [];
    const groupRe = /[（(]\s*含\s*([^）)]*)[）)]/g;
    let m;
    while ((m = groupRe.exec(text))) {
      m[1].split(/[、,，·\s]+/).map(s => s.trim()).filter(Boolean).forEach(n => names.push(n));
    }
    const clean = text.replace(groupRe, '').replace(/\s+/g, ' ').trim();
    return { clean, names };
  }

  // 統一寫入合併子景點：去重、排除大景點名本身。「（含 …）」改在渲染當下由 mergedSubSpots 生成，這裡不再改寫 desc。
  function setMergedSubSpots(stop, subList) {
    const big = normalizeText(stop && stop.name);
    const seen = new Set();
    const subs = [];
    for (const n of (subList || [])) {
      const nn = normalizeText(n);
      if (!nn || nn === big || seen.has(nn)) continue;
      seen.add(nn); subs.push(String(n).trim());
    }
    stop.mergedSubSpots = subs;
    if (subs.length) stop.isMergedAttraction = true;
    return subs;
  }

  // 一次性遷移：把 desc 內歷次累加的「（含 …）」剝掉，讓描述只剩乾淨 prose（「（含 …）」改由 mergedSubSpots 渲染時生成）
  function reconcileMergedSubSpots(stops) {
    if (!Array.isArray(stops)) return stops;
    for (const stop of stops) {
      if (!stop || stop.type === 'start' || stop.type === 'end') continue;
      if (!stop.desc) continue;
      const parsed = parseIncludedSpotsFromDesc(stop.desc);
      if (parsed.names.length) stop.desc = parsed.clean; // 只在確實含「（含 …）」時改寫，避免無謂變更
    }
    return stops;
  }

  // 渲染用：把合併子景點組成「（含 A、B…）」字串（不含則回空字串）。卡片/時間軸統一由此取得，desc 永遠不含這段。
  function formatIncludedSubSpots(stop) {
    const subs = stop && Array.isArray(stop.mergedSubSpots) ? stop.mergedSubSpots.filter(Boolean) : [];
    return subs.length ? `（含 ${subs.join('、')}）` : '';
  }

  // 將多個兄弟子景點合併成一個大景點站
  function buildMergedAttraction(members) {
    const names = members.map(m => String(m.name || '')).filter(Boolean);
    const mergedName = pickClusterName(names);
    // 母景點：優先名稱等於大景點名者，否則名稱最短者（承接 id/交通等基底欄位）
    const parent = members.find(m => String(m.name || '') === mergedName)
      || [...members].sort((a, b) => String(a.name || '').length - String(b.name || '').length)[0];
    // 子景點列舉（去掉前綴後的差異部分），保留資訊於描述
    const subLabels = names
      .filter(n => n !== mergedName)
      .map(n => (n.startsWith(mergedName) ? n.slice(mergedName.length) : n))
      .map(n => n.replace(/^[\s·、,，\-]+/, '').trim())
      .filter(Boolean);
    // 合併後停留時間 = 取最長子景點停留 + 緩衝（上限 90 分，不灌水）；縮掉的時間由「補景點」補回
    const maxStay = members.reduce((mx, m) => Math.max(mx, Number(m.duration) || Number(m.stayMin) || 0), 0);
    const mergedStay = Math.min(120, (maxStay || 30) + 30 * (members.length - 1));
    // 入口/代表座標：優先名稱等於合併名者（大景點本體），否則用所有成員座標的質心
    const memberCoords = members.map(readStopCoordinates).filter(Boolean);
    const namedCoord = readStopCoordinates(members.find(m => String(m.name || '') === mergedName && readStopCoordinates(m)));
    let coord = namedCoord;
    if (!coord && memberCoords.length) {
      coord = {
        lat: memberCoords.reduce((s, c) => s + c.lat, 0) / memberCoords.length,
        lng: memberCoords.reduce((s, c) => s + c.lng, 0) / memberCoords.length
      };
    }
    // 範圍圈半徑：代表座標到各成員的最大距離 + 緩衝，clamp [150, 2500]
    let mergedRadiusMeters = 0;
    if (coord && memberCoords.length) {
      const maxDist = memberCoords.reduce((mx, c) =>
        Math.max(mx, approxDistanceMeters(coord.lat, coord.lng, c.lat, c.lng)), 0);
      mergedRadiusMeters = Math.min(2500, Math.max(150, Math.round(maxDist + 80)));
    }
    // 描述只保留乾淨 prose（去掉成員描述中既有的「（含 …）」），不再把括號接進 desc（改由渲染時用 mergedSubSpots 生成）
    const rawBaseDesc = String(parent.desc || (members.find(m => m.desc) || {}).desc || '').trim();
    const baseDesc = parseIncludedSpotsFromDesc(rawBaseDesc).clean;
    // 子景點 = 本次（地理）成員去前綴後的名稱（不從描述撈歷史名，避免把遠景點累積回來）
    const toilets = members.reduce((acc, m) =>
      acc.concat(Array.isArray(m.nearbyToiletLocations) ? m.nearbyToiletLocations : []), []);
    const merged = Object.assign({}, parent, {
      name: mergedName,
      emoji: members.map(m => m.emoji).find(Boolean) || '📍',
      desc: baseDesc,
      stayMin: mergedStay,
      duration: mergedStay,
      nearbyToiletLocations: toilets,
      businessHours: members.map(m => m.businessHours).find(Boolean) || null,
      isMergedAttraction: true,
      mergedRadiusMeters,
      mergedMemberCoords: memberCoords
    });
    setMergedSubSpots(merged, subLabels); // 只設 mergedSubSpots（地理成員），desc 維持乾淨 prose
    if (coord) {
      merged.lat = coord.lat;
      merged.lng = coord.lng;
      merged.scenicCoordinates = { lat: coord.lat, lng: coord.lng };
    }
    return merged;
  }

  // 對站點做貪婪群集（單一連結）：同一大景區（距離為主）者併成一個大景點；跳過 start/end 錨點站
  function mergeNearbySubAttractions(stops) {
    if (!Array.isArray(stops) || stops.length < 2) return stops;
    const assigned = new Array(stops.length).fill(false);
    const result = [];
    for (let i = 0; i < stops.length; i++) {
      if (assigned[i]) continue;
      const base = stops[i];
      assigned[i] = true;
      if (base && (base.type === 'start' || base.type === 'end')) { result.push(base); continue; }
      const members = [base];
      for (let j = i + 1; j < stops.length; j++) {
        if (assigned[j]) continue;
        const cand = stops[j];
        if (cand && (cand.type === 'start' || cand.type === 'end')) continue;
        if (members.some(m => shouldClusterStops(m, cand))) { members.push(cand); assigned[j] = true; }
      }
      result.push(members.length === 1 ? base : buildMergedAttraction(members));
    }
    return result;
  }

  // === 單站大景區補子景點：合併不到鄰近站時，用 Google Places 附近搜尋補出子景點並標記為合併站 ===
  const BIG_AREA_KEYWORDS = ['潭', '步道', '大道', '園區', '國家風景區', '瀑布', '山', '岬', '灣', '古道', '部落', '濕地', '牧場'];
  const _nearbySubSpotCache = new Map();

  // 用 Google Maps JS PlacesService「附近搜尋」取回某座標周邊的景點類 POI
  function fetchNearbySubSpots(coord, radius) {
    return new Promise((resolve) => {
      const service = getPlacesService();
      if (!service || !coord) { resolve([]); return; }
      const cacheKey = `${coord.lat.toFixed(4)},${coord.lng.toFixed(4)}@${radius}`;
      if (_nearbySubSpotCache.has(cacheKey)) { resolve(_nearbySubSpotCache.get(cacheKey)); return; }
      let done = false;
      const finish = (arr) => { if (done) return; done = true; _nearbySubSpotCache.set(cacheKey, arr); resolve(arr); };
      try {
        service.nearbySearch({
          location: new google.maps.LatLng(coord.lat, coord.lng),
          radius,
          type: 'tourist_attraction'
        }, (res, status) => {
          const ok = hasGooglePlacesService() ? google.maps.places.PlacesServiceStatus.OK : 'OK';
          if (status !== ok || !Array.isArray(res) || !res.length) { finish([]); return; }
          const out = res.map(p => {
            const loc = p && p.geometry && p.geometry.location;
            if (!loc) return null;
            return { name: String(p.name || '').trim(), lat: loc.lat(), lng: loc.lng() };
          }).filter(p => p && p.name);
          finish(out);
        });
      } catch (e) { finish([]); }
      setTimeout(() => finish([]), 6000); // 安全逾時，避免 callback 永不回呼卡住流程
    });
  }

  // 從成員名＋附近POI名找「主導分支共同前綴」當大景點名（如三仙台）：
  // 長度≥3、被≥2名稱共享、其後一字在這些名稱間有差異（真分支點）或前綴本身即一個POI，且來源至少有一個附近POI。
  function deriveBigAreaName(memberNames, nearbyNames) {
    const members = (memberNames || []).map(n => String(n || '').trim()).filter(Boolean);
    const nears = (nearbyNames || []).map(n => String(n || '').trim()).filter(Boolean);
    const all = [...members, ...nears];
    if (all.length < 2) return '';
    const prefixGroups = new Map(); // 前綴 -> 共享的名稱集合
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const p = commonNamePrefix([all[i], all[j]]);
        if (p.length < 3) continue;
        if (p.replace(/[市縣鄉鎮區村里]$/, '').length < 3) continue; // 過濾「台東市」「花蓮縣」等行政區名
        if (!prefixGroups.has(p)) prefixGroups.set(p, new Set());
        prefixGroups.get(p).add(all[i]); prefixGroups.get(p).add(all[j]);
      }
    }
    let best = '', bestCount = 0;
    for (const [p, set] of prefixGroups) {
      const names = [...set];
      if (names.length < 2) continue;
      const exactIsPlace = all.some(n => n === p);
      // 只採用「前綴本身即一個真實 POI（成員或附近景點）」的名稱，避免取到截斷片段
      // （如「綠島小長城」「綠島小夜市」→ 前綴「綠島小」並非真實地點）。三仙台等本身是 POI 者不受影響。
      if (!exactIsPlace) continue;
      if (!names.some(n => nears.includes(n))) continue;           // 需有附近POI佐證
      if (names.length > bestCount || (names.length === bestCount && (best === '' || p.length < best.length))) {
        best = p; bestCount = names.length;
      }
    }
    return best;
  }

  // 補子景點 + 大景點名解析：對每個非端點站（含已合併站），用 Places 附近搜尋補子景點並把顯示名換成大景點名
  async function enrichBigAttractionSubSpots(stops, region) {
    if (!Array.isArray(stops) || !stops.length || !hasGooglePlacesService()) return stops;
    const otherNorms = new Set(stops.map(s => normalizeText(s && s.name)).filter(Boolean));
    for (const stop of stops) {
      // 跳過端點與「座標已鎖定」的站（如本島港/離島返程港）：不再用 Places 補子景點或 snap，避免被搬位
      if (!stop || stop.type === 'start' || stop.type === 'end' || stop._lockedCoordinates) continue;
      if (isFoodStop(stop)) continue; // 餐廳閘門：用餐站不被標為合併大景點、不補子景點
      if (/火車站|車站|捷運|高鐵|轉運站|客運站|機場|航空站/.test(String(stop.name || ''))) continue; // 交通樞紐閘門：車站/機場等樞紐不補子景點、不搬座標
      const coord = readStopCoordinates(stop);
      if (!coord) continue;
      const parentName = String(stop.name || '');
      const parentNorm = normalizeText(parentName);
      let nearby = [];
      try { nearby = await fetchNearbySubSpots(coord, SUB_SPOT_MERGE_RADIUS_M); } catch (e) { continue; }
      if (!nearby.length) continue;
      const nearbyNames = nearby.map(n => n.name);
      const nearbyNormSet = new Set(nearby.map(n => normalizeText(n.name)).filter(Boolean));

      // 800m 內、距代表座標 60–800m 的近景點候選（地理）
      const cands = [];
      for (const p of nearby) {
        const pn = normalizeText(p.name);
        if (!pn || pn === parentNorm) continue;
        if (otherNorms.has(pn)) continue;
        if (isFoodStop({ name: p.name })) continue; // 餐廳閘門：附近餐廳 POI 不被拉進景點子景點
        const dist = approxDistanceMeters(coord.lat, coord.lng, p.lat, p.lng);
        if (dist < 60 || dist > SUB_SPOT_MERGE_RADIUS_M) continue;
        cands.push({ name: p.name, lat: p.lat, lng: p.lng, dist });
      }
      cands.sort((a, b) => a.dist - b.dist);
      const picked = cands.slice(0, 6);
      const hasPrefixChild = picked.some(c => commonNamePrefix([parentNorm, normalizeText(c.name)]).length >= 3);
      const isBigKeyword = BIG_AREA_KEYWORDS.some(k => parentName.includes(k));

      let subs;
      let changed = false;

      if (stop.isMergedAttraction) {
        // (A1) 既有合併站 → 地理再驗證：只留「800m 內附近 POI 有此名」或「與大景點名共享 ≥3 字前綴」的子景點，
        //      丟掉比西里岸部落／都歷遊客中心這類遠景點；再聯集 800m 內新採到的近景點。
        const existing = Array.isArray(stop.mergedSubSpots) ? stop.mergedSubSpots : [];
        const kept = existing.filter(n => {
          const nn = normalizeText(n);
          if (!nn) return false;
          return nearbyNormSet.has(nn) || commonNamePrefix([parentNorm, nn]).length >= 3;
        });
        subs = [...kept, ...picked.map(c => c.name)];
        changed = true;
      } else if (picked.length >= 2 && (hasPrefixChild || isBigKeyword)) {
        // (A2) 未合併單站 → 以近景點補子景點並標記合併（閘門避免誤標餐廳/漁港）
        const maxDist = picked.reduce((mx, c) => Math.max(mx, c.dist), 0);
        stop.isMergedAttraction = true;
        stop.mergedMemberCoords = [coord, ...picked.map(c => ({ lat: c.lat, lng: c.lng }))];
        stop.mergedRadiusMeters = Math.min(2500, Math.max(150, Math.round(maxDist + 80)));
        subs = picked.map(c => c.name);
        picked.forEach(c => otherNorms.add(normalizeText(c.name)));
        changed = true;
      } else {
        subs = Array.isArray(stop.mergedSubSpots) ? stop.mergedSubSpots.slice() : [];
      }

      // (B) 大景點名解析：把顯示名換成大景區名（如礫石灘＋觀景台 → 三仙台），舊名收進子景點
      const bigName = deriveBigAreaName([parentName, ...subs], nearbyNames);
      const bigNorm = normalizeText(bigName);
      const usedByOthers = stops.some(x => x !== stop && normalizeText(x.name) === bigNorm);
      if (bigName && bigNorm !== parentNorm && !usedByOthers) {
        stop.name = bigName;
        subs = [parentName, ...subs]; // 舊名收進子景點（setMergedSubSpots 會去掉等於新名者）
        stop.isMergedAttraction = true;
        const hit = nearby.find(n => normalizeText(n.name) === bigNorm);
        if (hit) { stop.lat = hit.lat; stop.lng = hit.lng; stop.scenicCoordinates = { lat: hit.lat, lng: hit.lng }; }
        otherNorms.add(bigNorm);
        changed = true;
      }

      // 合併站的代表座標應落在它的大地標上（如卑南遺址→卑南遺址公園），而非沿用 AI 給的錯位座標。
      // 用 Places 以「站名」查大地標，命中且在範圍內、偏移現座標 >300m 才校正（原本就在地標上的站不動）。
      if (stop.isMergedAttraction) {
        try {
          const landmark = await searchStrictPlaceCandidate(String(stop.name || ''), stop, region, '');
          if (landmark && landmark.position && !isCoordinatesOutsideRegion(landmark.position, region, stop.name)) {
            const curC = readStopCoordinates(stop);
            if (!curC || measureDistanceMeters(curC, landmark.position) > 300) {
              stop.lat = landmark.position.lat;
              stop.lng = landmark.position.lng;
              stop.scenicCoordinates = { lat: landmark.position.lat, lng: landmark.position.lng };
              stop.coordinateSource = 'merged_landmark';
              console.info('[merged landmark snap]', stop.name, '→', landmark.name, landmark.position, '(原', curC, ')');
            }
          }
        } catch (e) { /* Places 不可用 → 維持原座標 */ }
      }

      // 只回寫 mergedSubSpots（地理結果）；desc 維持乾淨 prose，不在此處嵌入「（含 …）」
      if (changed && (stop.isMergedAttraction || (subs && subs.length))) {
        setMergedSubSpots(stop, subs);
      }
      // 合併大景點：依子景點數加長建議停留（固定基準、冪等；只加長不縮短，含重開既有行程的補正）
      if (stop.isMergedAttraction && Array.isArray(stop.mergedSubSpots) && stop.mergedSubSpots.length) {
        const cur = Number(stop.duration) || Number(stop.stayMin) || 30;
        const target = Math.min(120, 30 + 20 * stop.mergedSubSpots.length);
        const bumped = Math.max(cur, target);
        stop.duration = bumped;
        stop.stayMin = bumped;
      }
    }
    return stops;
  }

  // 最後輸出前重排中段站，避免來回跑：保留 start 開頭/end 結尾，中段從起點座標貪婪最近鄰；離島跳過保護港口順序
  function reorderStopsAlongRoute(stops, region) {
    if (!Array.isArray(stops) || stops.length < 4) return stops;
    try { if (typeof getIslandFerryConfig === 'function' && getIslandFerryConfig(region)) return stops; } catch (e) {}
    const startStop = stops.find(s => s && s.type === 'start');
    const endStop = stops.find(s => s && s.type === 'end');
    const middles = stops.filter(s => s && s.type !== 'start' && s.type !== 'end');
    const coordMiddles = middles.filter(s => readStopCoordinates(s));
    const noCoord = middles.filter(s => !readStopCoordinates(s));
    if (coordMiddles.length < 3) return stops;
    let cur = readStopCoordinates(startStop) || readStopCoordinates(coordMiddles[0]);
    if (!cur) return stops;
    const remaining = coordMiddles.slice();
    const ordered = [];
    while (remaining.length) {
      let bi = 0, bd = Infinity;
      for (let i = 0; i < remaining.length; i++) {
        const c = readStopCoordinates(remaining[i]);
        const d = approxDistanceMeters(cur.lat, cur.lng, c.lat, c.lng);
        if (d < bd) { bd = d; bi = i; }
      }
      const nx = remaining.splice(bi, 1)[0];
      ordered.push(nx); cur = readStopCoordinates(nx);
    }
    const result = [];
    if (startStop) result.push(startStop);
    result.push(...ordered, ...noCoord);
    if (endStop) result.push(endStop);
    return result;
  }

  // === 合併後時間預算回填：估算行程總時長（含回終點交通），不足就補景點 ===
  // 單段交通估算（距離為主）：≤800m 走路 10 分；否則車程 ≈ 距離km/40*60，最低 5 分；缺座標退回 15 分
  function estimateLegMinutes(a, b) {
    const ca = readStopCoordinates(a), cb = readStopCoordinates(b);
    if (!ca || !cb) return 15;
    const m = approxDistanceMeters(ca.lat, ca.lng, cb.lat, cb.lng);
    if (m <= 800) return 10;
    return Math.max(5, Math.round((m / 1000) / 40 * 60));
  }
  // 完整站序（含起點…中段…終點）預估總分鐘 = Σ停留 + Σ路段交通（含最後一站→終點回程）
  function estimateTripMinutes(stops) {
    if (!Array.isArray(stops) || !stops.length) return 0;
    let total = 0;
    for (let i = 0; i < stops.length; i++) {
      const s = stops[i];
      const isEndpoint = s && (s.type === 'start' || s.type === 'end');
      // 端點原則不計停留；但端點為合併大景點（含子景點）時需計入，與卡片/時間軸顯示一致
      const mergedEndpoint = isEndpoint && s.isMergedAttraction
        && Array.isArray(s.mergedSubSpots) && s.mergedSubSpots.length > 0;
      if (!isEndpoint || mergedEndpoint) total += Math.max(0, Number(s.stayMin) || Number(s.duration) || 0);
      if (i < stops.length - 1) total += estimateLegMinutes(s, stops[i + 1]);
    }
    return total;
  }

  function getIslandFerryConfig(region) {
    return ISLAND_FERRY_CONFIG[String(region || '').trim()] || null;
  }

  function isMainlandHarborStop(stopName, config) {
    if (!stopName || !config) return false;
    const norm = normalizeText(stopName);
    return config.mainlandHarborAlias.some((alias) => {
      const aliasNorm = normalizeText(alias);
      return norm === aliasNorm || norm.includes(aliasNorm) || aliasNorm.includes(norm);
    });
  }

  function isIslandHarborStop(stopName, config) {
    if (!stopName || !config) return false;
    const norm = normalizeText(stopName);
    const harborNorm = normalizeText(config.islandHarbor.name);
    return norm === harborNorm || norm.includes(harborNorm) || harborNorm.includes(norm);
  }

  // 將行程中的港口站點正規化：
  //  - 島內港（南寮漁港）→ 不論位置，一律鎖定到「正確島內港座標」（config.islandHarbor），
  //    避免 AI/Places 一直抓到錯誤位置。
  //  - 起終點（出發/返回本島）的本島港 → 鎖定到「真實本島港座標」（config.mainlandHarbor），
  //    避免它落在離島 region 範圍外、被座標解析誤搬到島上（出現「島內港口」幻覺）。
  //  - 中段誤植的本島港 → 改成島內港（config.islandHarbor），修正 AI 把本島港排進島上行程的錯誤。
  function normalizeIslandHarborStops(stops, config) {
    const lastIdx = stops.length - 1;
    const mainland = config.mainlandHarbor;
    const hasMainlandCoord = mainland && Number.isFinite(Number(mainland.lat)) && Number.isFinite(Number(mainland.lng));
    const island = config.islandHarbor;
    const hasIslandCoord = island && Number.isFinite(Number(island.lat)) && Number.isFinite(Number(island.lng));
    return stops.map((stop, idx) => {
      // 島內港（南寮漁港）：不論在哪個位置，都鎖定到正確島內港座標（名稱統一），不讓 AI/Places 覆寫
      if (hasIslandCoord && stop && isIslandHarborStop(stop.name, config)) {
        const pos = { lat: Number(island.lat), lng: Number(island.lng) };
        return Object.assign({}, stop, {
          name: island.name,
          emoji: island.emoji || stop.emoji,
          scenicCoordinates: pos,
          '景點座標': pos,
          _lockedCoordinates: pos,
          lat: pos.lat,
          lng: pos.lng
        });
      }
      const isEndpoint = (stop && (stop.type === 'start' || stop.type === 'end')) || idx === 0 || idx === lastIdx;
      if (isEndpoint) {
        // 端點本島港：鎖定到真實本島港座標（名稱保留），其餘端點不動。
        if (hasMainlandCoord && isMainlandHarborStop(stop.name, config)) {
          const pos = { lat: Number(mainland.lat), lng: Number(mainland.lng) };
          return Object.assign({}, stop, {
            name: mainland.name || stop.name,
            scenicCoordinates: pos,
            '景點座標': pos,
            _lockedCoordinates: pos,
            lat: pos.lat,
            lng: pos.lng
          });
        }
        return stop;
      }
      // 中段誤植的本島港 → 正規化為島內港
      if (isMainlandHarborStop(stop.name, config)) {
        const harbor = config.islandHarbor;
        return Object.assign({}, stop, {
          name: harbor.name,
          emoji: harbor.emoji || stop.emoji,
          scenicCoordinates: { lat: harbor.lat, lng: harbor.lng },
          '景點座標': { lat: harbor.lat, lng: harbor.lng },
          _lockedCoordinates: { lat: harbor.lat, lng: harbor.lng }
        });
      }
      return stop;
    });
  }

  function getTripScheduleSummary() {
    return buildReplanSchedule().map((stop) => `${minutesToClock(stop.start)} ${stop.name}`).join(' · ');
  }

  function buildShareText() {
    const schedule = buildReplanSchedule();
    const tripTitle = currentTripTitle || '未命名行程';
    const inviteCode = currentInviteCode || '尚未建立';
    const timeRange = currentTripWindow.start && currentTripWindow.end
      ? `${currentTripWindow.start} – ${currentTripWindow.end}`
      : '待設定';
    const stopSummary = schedule.map((stop) => `${minutesToClock(stop.start)} ${stop.name}`).join('\n');
    return `嗨！我用 WanderAI 規劃了「${tripTitle}」✨\n\n邀請碼【 ${inviteCode} 】\n時間：${timeRange}\n\n行程摘要：\n${stopSummary || '目前尚未加入任何停靠點'}\n\n加入後可以一起共編、匯入網址與分享行程圖。`;
  }

  function parseImportWindow(text) {
    const match = String(text || '').match(/(\d{1,2}:\d{2})\s*[-~到－—]\s*(\d{1,2}:\d{2})/);
    if (!match) return { start: '', end: '' };
    return { start: match[1], end: match[2] };
  }

  function detectImportedTravelTheme(rawInput) {
    const text = String(rawInput || '');
    const lower = text.toLowerCase();
    const location = text.includes('台東') || lower.includes('taitung') ? '台東' : (text.includes('高雄') || lower.includes('kaohsiung') ? '高雄' : '在地');

    if (text.includes('咖啡') || lower.includes('coffee') || lower.includes('cafe')) {
      return { emoji: '☕', theme: `${location}咖啡`, menu: ['手沖咖啡', '拿鐵', '甜點'], hours: '09:30-18:00', left: 46, top: 50 };
    }
    if (text.includes('甜點') || text.includes('甜品') || lower.includes('dessert')) {
      return { emoji: '🍰', theme: `${location}甜點`, menu: ['千層蛋糕', '布丁', '冰拿鐵'], hours: '11:00-20:00', left: 52, top: 46 };
    }
    if (text.includes('海鮮') || text.includes('漁港') || lower.includes('seafood')) {
      return { emoji: '🦐', theme: `${location}海味小館`, menu: ['海鮮粥', '炒飯', '炸物'], hours: '10:30-21:00', left: 60, top: 58 };
    }
    if (text.includes('麵') || text.includes('小吃') || lower.includes('food') || lower.includes('eat')) {
      return { emoji: '🍜', theme: `${location}在地小吃`, menu: ['招牌麵線', '滷味', '湯品'], hours: '10:00-19:30', left: 56, top: 54 };
    }
    return { emoji: '🍽️', theme: `${location}食記推薦`, menu: ['招牌料理', '限定甜點', '人氣飲品'], hours: '11:00-19:00', left: 54, top: 48 };
  }

  function parseImportedTravel(rawInput) {
    const text = String(rawInput || '').trim();
    if (!text) return null;

    const embeddedUrlMatch = text.match(/https?:\/\/[^\s<>'\"]+/i);
    const urlCandidate = embeddedUrlMatch ? embeddedUrlMatch[0] : text;
    let sourceUrl = null;
    try {
      sourceUrl = new URL(urlCandidate);
    } catch (error) {
      sourceUrl = null;
    }

    let searchableText = text;
    if (sourceUrl) {
      try {
        searchableText = decodeURIComponent(sourceUrl.href);
      } catch (error) {
        searchableText = sourceUrl.href;
      }
    }

    const windowInfo = parseImportWindow(text);
    const theme = detectImportedTravelTheme(searchableText);
    const urlSlug = sourceUrl ? sourceUrl.pathname.split('/').filter(Boolean).pop() || '' : '';
    const slugBase = urlSlug.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ').trim();
    const inferredName = slugBase ? `${slugBase}` : theme.theme;
    const title = searchableText.includes('台東') || searchableText.includes('Taitung') ? `${theme.theme}｜台東食記` : inferredName;
    const duplicateStop = findDuplicateStopByName(title);
    const itineraryStart = clockToMinutes(currentTripWindow.start) || 14 * 60;
    const itineraryEnd = clockToMinutes(currentTripWindow.end) || (15 * 60 + 45);
    const parsedStart = windowInfo.start ? clockToMinutes(windowInfo.start) : 11 * 60;
    const parsedEnd = windowInfo.end ? clockToMinutes(windowInfo.end) : 20 * 60;
    const isCompatible = Boolean(parsedStart <= itineraryEnd && parsedEnd >= itineraryStart && !/公休|休息|暫停|未營業|歇業/.test(text));

    return {
      title,
      emoji: theme.emoji,
      hours: windowInfo.start && windowInfo.end ? `${windowInfo.start} - ${windowInfo.end}` : theme.hours,
      menu: theme.menu,
      sourceUrl: sourceUrl ? sourceUrl.href : text,
      domain: sourceUrl ? sourceUrl.hostname : '貼上內容',
      sourceLabel: sourceUrl ? `${sourceUrl.hostname}${sourceUrl.pathname}` : text.slice(0, 42),
      left: theme.left,
      top: theme.top,
      duplicateStopId: duplicateStop ? duplicateStop.id : null,
      duplicateStopName: duplicateStop ? duplicateStop.name : '',
      compatible: isCompatible,
      compatibilityText: duplicateStop
        ? `已找到相近節點「${duplicateStop.name}」，加入時會優先合併原項目。`
        : (isCompatible ? '目前行程時間可插入，並已為你標好地圖位置。' : '網址內容和現有行程時間不完全相容，但仍可作為備選。'),
      summary: `推薦 ${theme.theme}，主打 ${theme.menu.slice(0, 2).join('、')}。`
    };
  }

  function registerImportedTravelPin(result) {
    if (!map || !result) return null;

    if (importedTravelPinId && markers[importedTravelPinId]) {
      markers[importedTravelPinId].setMap(null);
      delete markers[importedTravelPinId];
      delete pinData[importedTravelPinId];
    }

    importedTravelPinSerial += 1;
    const pinId = `import-pin-${importedTravelPinSerial}`;
    const importedPosition = readCoordinateObject(result.scenicCoordinates)
      || readCoordinateObject(result.coordinates)
      || normalizeCoordinatePair(result.lat ?? result.latitude, result.lng ?? result.longitude)
      || createNearbyPosition(importedTravelPinSerial);
    pinData[pinId] = {
      title: `${result.emoji} ${result.title}`,
      desc: `${result.summary} 來源：${result.sourceLabel}`,
      notice: result.compatibilityText,
      lat: importedPosition.lat,
      lng: importedPosition.lng
    };
    
    const marker = new google.maps.Marker({
      position: importedPosition,
      map: map,
      title: pinData[pinId].title,
      icon: createEmojiPinIcon(result.emoji)
    });
    rememberMarkerBasePosition(marker, importedPosition);

    markers[pinId] = marker;
    layoutMapMarkers();

    marker.addListener('click', () => {
      showPinInfo(pinId);
      map.panTo(marker.getPosition());
    });

    importedTravelPinId = pinId;
    return pinId;
  }

  function buildItineraryPosterSvg() {
    const schedule = buildReplanSchedule();
    const height = 360 + (schedule.length * 92);
    const rows = schedule.map((stop, index) => {
      const y = 250 + (index * 92);
      const isFinal = index === schedule.length - 1;
      return `
        <rect x="80" y="${y - 42}" rx="20" ry="20" width="1040" height="74" fill="${isFinal ? '#fdf2ed' : '#ffffff'}" stroke="${isFinal ? '#f3c8b1' : '#e0dbd2'}"/>
        <circle cx="118" cy="${y - 5}" r="16" fill="${isFinal ? '#f07b3f' : '#2e7d6d'}"/>
        <text x="150" y="${y - 18}" font-size="18" font-weight="700" fill="#22201d">${escapeXml(minutesToClock(stop.start))} - ${escapeXml(minutesToClock(stop.end))}</text>
        <text x="150" y="${y + 8}" font-size="22" font-weight="800" fill="#22201d">${escapeXml(stop.emoji)} ${escapeXml(stop.name)}</text>
        <text x="950" y="${y + 8}" font-size="13" text-anchor="end" fill="#6b6760">停留 ${escapeXml(String(stop.computedStayMin))} 分鐘</text>`;
    }).join('');

    return `
      <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="${height}" viewBox="0 0 1200 ${height}">
        <defs>
          <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stop-color="#faf9f6"/>
            <stop offset="100%" stop-color="#f3eee6"/>
          </linearGradient>
        </defs>
        <rect width="1200" height="${height}" rx="36" fill="url(#bg)"/>
        <text x="80" y="100" font-size="30" font-weight="800" fill="#2e7d6d">WanderAI 行程圖</text>
        <text x="80" y="144" font-size="52" font-weight="700" fill="#22201d">${escapeXml(currentTripTitle)}</text>
        <text x="80" y="188" font-size="18" fill="#6b6760">${escapeXml((currentTripWindow.start && currentTripWindow.end) ? `${currentTripWindow.start} - ${currentTripWindow.end}` : '待設定')} · 邀請碼 ${escapeXml(currentInviteCode || '尚未建立')}</text>
        <rect x="84" y="208" rx="22" ry="22" width="1032" height="42" fill="#edf6f4" stroke="#cce5de"/>
        <text x="108" y="235" font-size="16" font-weight="700" fill="#225f52">${escapeXml(getTripScheduleSummary())}</text>
        ${rows}
        <rect x="80" y="${height - 92}" rx="22" ry="22" width="1040" height="52" fill="#2e7d6d"/>
        <text x="600" y="${height - 58}" text-anchor="middle" font-size="18" font-weight="700" fill="#ffffff">Scan or share with ${escapeXml(currentInviteCode || 'invite code pending')}</text>
      </svg>
    `;
  }

  function buildImagePrompt(character) {
    const schedule = buildReplanSchedule();
    const title = currentTripTitle || '我的旅遊行程';
    const dateRange = (currentTripWindow.start && currentTripWindow.end)
      ? `（行程時間：${currentTripWindow.start} ～ ${currentTripWindow.end}）` : '';
    const stopList = schedule.length
      ? schedule.map(s => `${s.emoji || ''}${s.name}`).join('、')
      : '（尚未建立行程）';

    const lines = [
      `請幫我繪製一張「${title}」旅遊地圖插畫。${dateRange}`,
      '',
      `主角是「${character}」，以可愛卡通造型出現在旅途中，扮演嚮導或旅伴角色。`,
      '',
      '行程如下：',
      stopList,
      '',
      '請根據我的行程規劃，加入適當的細節插圖。',
      '根據行程依序畫成一張日式雜誌插畫的旅遊行程圖，我提到的地點、環境、景觀、食物、餐廳，都要在圖中提到，且儘可能的擬真。插圖的比例為 16:9。',
      '整體要給人可愛、清新的氛圍，字體清晰容易閱讀、並確保內容都是「繁體中文」無錯字。'
    ];
    return lines.join('\n');
  }

  async function generateItineraryImage() {
    const input = document.getElementById('posterCharacterInput');
    const character = (input ? input.value : posterCharacterDraft).trim();
    if (!character) {
      window.alert('請先輸入卡通人物名稱。');
      return;
    }
    const apiKey = getGeminiApiKey();
    if (!apiKey) {
      window.alert('找不到 Gemini API 金鑰，請先在設定中輸入。');
      return;
    }
    posterCharacterDraft = character;
    posterImageGenerating = true;
    posterGeneratedImageBase64 = null;
    posterImageUploadUrl = null;
    posterImageUploadPromise = null;
    renderTravelTools();

    const prompt = buildImagePrompt(character);
    console.log('[行程圖 Prompt]', prompt);
    const imageModel = 'gemini-3.1-flash-image';
    const vertex = getVertexConfig();
    try {
      const endpoint = vertex.ready
        ? `${VERTEX_HOST}/v1beta1/projects/${encodeURIComponent(vertex.projectId)}/locations/global/publishers/google/models/${imageModel}:generateContent?key=${encodeURIComponent(vertex.apiKey)}`
        : `${GEMINI_API_BASE}/${imageModel}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: await vertexAuthHeaders(),
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            responseModalities: ["IMAGE"],
            imageConfig: { aspectRatio: '16:9' }
          }
        })
      });
      if (res.status === 401 || res.status === 429) throw vertexHttpError(res.status, '圖片生成失敗');
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error?.message || `HTTP ${res.status}`);
      }
      const data = await res.json();
      const part = data.candidates?.[0]?.content?.parts?.[0];
      if (!part?.inlineData?.data) { throw new Error('未收到圖片資料。回應：' + JSON.stringify(data).slice(0, 200)); }
      posterGeneratedImageBase64 = `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
      if (firebaseStorage) {
        posterImageUploadPromise = uploadPosterToStorage();
      }
    } catch (e) {
      window.alert(`圖片生成失敗：${e.message}`);
    } finally {
      posterImageGenerating = false;
      renderTravelTools();
      setTimeout(() => {
        const el = document.getElementById('posterGeneratedImg');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 80);
    }
  }

  function downloadGeneratedImage() {
    if (!posterGeneratedImageBase64) return;
    const anchor = document.createElement('a');
    anchor.href = posterGeneratedImageBase64;
    anchor.download = `${currentInviteCode || 'travel'}-poster.png`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }

  // ── Lightbox（圖片放大預覽） ──
  function openImageLightbox(src) {
    const box = document.getElementById('imgLightbox');
    const img = document.getElementById('imgLightboxImg');
    if (!box || !img) return;
    img.src = src;
    img.classList.remove('zoomed');
    box.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function closeImageLightbox(evt) {
    if (evt && evt.target !== document.getElementById('imgLightbox')) return;
    const box = document.getElementById('imgLightbox');
    if (box) box.classList.remove('open');
    document.body.style.overflow = '';
  }
  function toggleLightboxZoom(img) {
    img.classList.toggle('zoomed');
  }
  function downloadFromLightbox() {
    const img = document.getElementById('imgLightboxImg');
    if (!img || !img.src || img.src === window.location.href) return;
    const anchor = document.createElement('a');
    anchor.href = img.src;
    anchor.download = `${currentInviteCode || 'travel'}-poster.png`;
    anchor.click();
  }

  // ── 圖片分享功能 ──
  async function shareGeneratedImage() {
    if (!posterGeneratedImageBase64) { window.alert('請先生成插圖再分享。'); return; }
    try {
      const res  = await fetch(posterGeneratedImageBase64);
      const blob = await res.blob();
      const file = new File([blob], `${currentInviteCode || 'travel'}-poster.png`, { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: currentTripTitle || '旅遊行程', text: buildShareText() });
        return;
      }
    } catch (e) {
      if (e.name !== 'AbortError') console.warn('File share failed:', e);
    }
    await copyImageUrl();
  }

  async function shareImageToLine() {
    const text = buildShareText();
    if (posterGeneratedImageBase64 && navigator.canShare) {
      try {
        const res  = await fetch(posterGeneratedImageBase64);
        const blob = await res.blob();
        const file = new File([blob], `${currentInviteCode || 'travel'}-poster.png`, { type: 'image/png' });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: currentTripTitle || '旅遊行程', text });
          return;
        }
      } catch (e) { if (e.name !== 'AbortError') console.warn(e); }
    }
    window.open(`https://line.me/R/msg/text/?${encodeURIComponent(text)}`, '_blank');
  }

  function shareImageToFacebook() {
    const text = buildShareText();
    if (posterGeneratedImageBase64 && navigator.canShare) {
      fetch(posterGeneratedImageBase64).then((r) => r.blob()).then((blob) => {
        const file = new File([blob], 'poster.png', { type: 'image/png' });
        if (navigator.canShare({ files: [file] })) {
          navigator.share({ files: [file], title: currentTripTitle || '旅遊行程' }).catch(() => {});
          return;
        }
        _fbDesktopShare(text);
      }).catch(() => _fbDesktopShare(text));
    } else {
      _fbDesktopShare(text);
    }
  }
  function _fbDesktopShare(text) {
    navigator.clipboard.writeText(text).catch(() => {});
    window.open('https://www.facebook.com/', '_blank');
    window.alert('行程文字已複製！請在 Facebook 新貼文中貼上，並手動上傳圖片。');
  }

  async function uploadPosterToStorage() {
    if (!posterGeneratedImageBase64 || !firebaseStorage || posterImageUploadUrl) return;
    posterImageUploading = true;
    renderTravelTools();
    try {
      const res  = await fetch(posterGeneratedImageBase64);
      const blob = await res.blob();
      const code = currentInviteCode || 'trip';
      const path = `posters/${code}-${Date.now()}.png`;
      const ref  = firebaseStorage.ref(path);
      const snapshot = await ref.put(blob, { contentType: 'image/png' });
      posterImageUploadUrl = await snapshot.ref.getDownloadURL();
    } catch (e) {
      console.warn('背景上傳圖片失敗：', e);
    } finally {
      posterImageUploading = false;
      renderTravelTools();
    }
  }

  // ── 旅記照片（拍照 → 壓縮 → Firebase Storage → 掛回造訪紀錄）──

  // 壓縮成 JPEG（長邊 maxEdge、quality）。EXIF 方向：優先 createImageBitmap 的
  // from-image（Chrome/Android 正確轉正）；fallback 的 <img> 在 iOS 15+ drawImage
  // 也會自動套方向。decode 失敗（如 HEIC）會 throw，呼叫端負責友善提示。
  async function compressImageToJpeg(file, maxEdge = 1600, quality = 0.8) {
    let source = null;
    let objectUrl = null;
    try {
      if (typeof createImageBitmap === 'function') {
        source = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => null);
      }
      if (!source) {
        objectUrl = URL.createObjectURL(file);
        source = await new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error('image decode failed'));
          img.src = objectUrl;
        });
      }
      const w = source.width || source.naturalWidth;
      const h = source.height || source.naturalHeight;
      const scale = Math.min(1, maxEdge / Math.max(w, h));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(w * scale));
      canvas.height = Math.max(1, Math.round(h * scale));
      canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
      if (!blob) throw new Error('toBlob failed');
      return blob;
    } finally {
      if (source && typeof source.close === 'function') source.close();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    }
  }

  async function uploadTripPhoto(blob, tripId) {
    const uid = firebaseAuth.currentUser.uid;
    const ts = Date.now();
    const path = `trip-photos/${uid}/${tripId || 'no-trip'}/${ts}.jpg`;
    const snapshot = await firebaseStorage.ref(path).put(blob, { contentType: 'image/jpeg' });
    const url = await snapshot.ref.getDownloadURL();
    return { url, path, ts };
  }

  // 拍照/選圖入口（旅記卡「📷」與打卡後 snackbar 共用）。
  // input 不加 capture：iOS 加了會強制只開相機；不加則 iOS/Android 都出「拍照／相簿」選單。
  function addPhotoForVisitedPlace(name) {
    if (!firebaseAuth || !firebaseAuth.currentUser || !firebaseStorage) {
      return feedbackToast('登入後即可保存照片', 'orange');
    }
    const input = document.getElementById('tripPhotoInput');
    if (!input) return;
    if (!input.dataset.bound) {
      input.dataset.bound = '1';
      input.addEventListener('change', handleTripPhotoInputChange);
    }
    input.dataset.targetName = name || '';
    input.value = '';
    input.click();
  }

  async function handleTripPhotoInputChange(evt) {
    const input = evt.target;
    const name = input.dataset.targetName || '';
    const files = Array.from(input.files || []);
    if (!name || !files.length) return;
    const norm = name.replace(/\s/g, '').toLowerCase();
    const rec = getVisitedPlaces().find(p => (p.name || '').replace(/\s/g, '').toLowerCase() === norm);
    if (!rec) return feedbackToast('找不到這個景點的造訪紀錄', 'orange');
    feedbackToast('📤 照片上傳中…', 'blue');
    const results = [];
    for (const f of files) {
      try {
        const blob = await compressImageToJpeg(f);
        results.push(await uploadTripPhoto(blob, rec.tripId || ''));
      } catch (e) { console.warn('照片上傳失敗：', e); }
    }
    if (!results.length) return feedbackToast('照片上傳失敗，這張格式可能不支援', 'orange');
    updateVisitedPlaceByName(name, (p) => { (p.photos = p.photos || []).push(...results); });
    if (document.getElementById('travellog-list')) renderTravelLog();
    feedbackToast(`✅ 已加入 ${results.length} 張照片`, 'green');
  }

  // 打卡成功後的拍照提示：登入時給可點的 snackbar（拍照按鈕），未登入退回純文字 toast
  function showPhotoPromptSnackbar(stopName) {
    if (!firebaseAuth || !firebaseAuth.currentUser || !firebaseStorage) {
      return feedbackToast('📸 拍張照替這一站留下回憶吧！', 'blue');
    }
    const old = document.getElementById('photoPromptSnackbar');
    if (old) old.remove();
    const bar = document.createElement('div');
    bar.id = 'photoPromptSnackbar';
    bar.className = 'photo-prompt-snackbar';
    const msg = document.createElement('span');
    msg.className = 'photo-prompt-msg';
    msg.textContent = '📸 拍張照替這一站留下回憶';
    const btn = document.createElement('button');
    btn.className = 'photo-prompt-btn';
    btn.textContent = '拍照';
    btn.onclick = () => { bar.remove(); addPhotoForVisitedPlace(stopName); };
    const close = document.createElement('button');
    close.className = 'photo-prompt-close';
    close.textContent = '✕';
    close.onclick = () => bar.remove();
    bar.append(msg, btn, close);
    document.body.appendChild(bar);
    setTimeout(() => {
      if (!bar.isConnected) return;
      bar.classList.add('hide');
      setTimeout(() => bar.remove(), 400);
    }, 7000);
  }

  function deleteTripPhoto(name, ts) {
    if (!window.confirm('要刪除這張照片嗎？')) return;
    const norm = (name || '').replace(/\s/g, '').toLowerCase();
    const rec = getVisitedPlaces().find(p => (p.name || '').replace(/\s/g, '').toLowerCase() === norm);
    const photo = rec && Array.isArray(rec.photos) ? rec.photos.find(p => p && p.ts === ts) : null;
    if (photo && photo.path && firebaseStorage) {
      firebaseStorage.ref(photo.path).delete().catch(() => {}); // object-not-found 等一律靜默
    }
    // 只移除「找到的那一張」（用 path 精準比對）：ts 理論上可能撞號，filter by ts 會誤刪多張
    updateVisitedPlaceByName(name, (p) => {
      const arr = p.photos || [];
      const i = arr.findIndex(x => x && (photo ? x.path === photo.path : x.ts === ts));
      if (i >= 0) arr.splice(i, 1);
      p.photos = arr;
    });
    renderTravelLog();
    feedbackToast('照片已刪除', 'blue');
  }

  // ── 旅程拼貼（把一趟旅程的照片合成一張大圖，分享/下載）──

  function renderCollageBar() {
    const bar = document.getElementById('travellog-collage-bar');
    if (!bar) return;
    const groups = {};
    getVisitedPlaces().forEach((p) => {
      if (!Array.isArray(p.photos) || !p.photos.length) return;
      const key = p.tripId || 'no-trip';
      if (!groups[key]) groups[key] = { tripId: key, tripTitle: p.tripTitle || '我的旅程', count: 0 };
      groups[key].count += p.photos.length;
    });
    const list = Object.values(groups);
    bar.style.display = list.length ? '' : 'none';
    bar.innerHTML = list.map((g) => {
      const idEsc = escapeHtml(g.tripId).replace(/'/g, '&#39;');
      return `<button class="travellog-collage-btn" onclick="exportTripCollage('${idEsc}')">🖼 匯出拼貼 · ${escapeHtml(g.tripTitle)}（${g.count} 張）</button>`;
    }).join('');
  }

  async function exportTripCollage(tripId) {
    const records = getVisitedPlaces().filter(p => (p.tripId || 'no-trip') === tripId);
    const items = [];
    records.forEach((p) => (p.photos || []).forEach((ph) => {
      if (ph && ph.url) items.push({ spotName: p.name || '', url: ph.url, ts: ph.ts || 0 });
    }));
    if (!items.length) return;
    items.sort((a, b) => a.ts - b.ts);
    const picked = items.slice(-16); // 上限 16 張，超過取最新
    feedbackToast('🖼 拼貼製作中…', 'blue');

    // crossOrigin='anonymous' 是關鍵：少了它 canvas 會被污染，toBlob 直接 SecurityError
    const loaded = (await Promise.all(picked.map(it => new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve({ ...it, img });
      img.onerror = () => resolve(null);
      img.src = it.url;
    })))).filter(Boolean);
    if (!loaded.length) return feedbackToast('照片載入失敗，請稍後再試', 'orange');

    const title = (records[0] && records[0].tripTitle) || '我的旅程';
    const dates = records.map(p => p.visitDate).filter(Boolean).sort();
    const dateRange = !dates.length ? ''
      : dates[0] === dates[dates.length - 1] ? dates[0]
      : `${dates[0]} – ${dates[dates.length - 1]}`;

    const n = loaded.length;
    const cols = n <= 4 ? 2 : n <= 9 ? 3 : 4;
    const rows = Math.ceil(n / cols);
    const W = 1200, headerH = 140, pad = 12;
    const cell = Math.floor((W - pad * (cols + 1)) / cols);
    const H = headerH + rows * (cell + pad) + pad;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#f6f4ef'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#2c3e50';
    ctx.font = 'bold 44px "Noto Sans TC", "PingFang TC", sans-serif';
    ctx.fillText(title, pad + 12, 64);
    ctx.font = '24px "Noto Sans TC", "PingFang TC", sans-serif';
    ctx.fillStyle = '#8fa4b8';
    ctx.fillText(dateRange, pad + 12, 102);

    loaded.forEach((it, i) => {
      const cx = pad + (i % cols) * (cell + pad);
      const cy = headerH + Math.floor(i / cols) * (cell + pad);
      const iw = it.img.naturalWidth, ih = it.img.naturalHeight;
      const s = Math.max(cell / iw, cell / ih); // cover 裁切置中
      const sw = cell / s, sh = cell / s;
      ctx.drawImage(it.img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, cx, cy, cell, cell);
      const barH = 34;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(cx, cy + cell - barH, cell, barH);
      ctx.fillStyle = '#fff';
      ctx.font = '20px "Noto Sans TC", "PingFang TC", sans-serif';
      let label = it.spotName;
      while (label && ctx.measureText(label + '…').width > cell - 20) label = label.slice(0, -1);
      if (label !== it.spotName) label += '…';
      ctx.fillText(label, cx + 10, cy + cell - 11);
    });

    let blob = null;
    try {
      blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    } catch (e) { console.warn('拼貼輸出失敗（可能是圖片 CORS）：', e); }
    if (!blob) return feedbackToast('拼貼輸出失敗，請稍後再試', 'orange');

    const file = new File([blob], `${title}-拼貼.jpg`, { type: 'image/jpeg' });
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title });
        feedbackToast('✅ 拼貼已完成', 'green');
        return;
      }
    } catch (e) {
      if (e.name === 'AbortError') return; // 使用者取消分享
      console.warn('拼貼分享失敗，改為下載：', e);
    }
    const anchor = document.createElement('a');
    anchor.href = URL.createObjectURL(blob);
    anchor.download = `${title}-拼貼.jpg`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(anchor.href), 5000);
    feedbackToast('✅ 拼貼已下載', 'green');
  }

  async function copyImageUrl() {
    if (!posterGeneratedImageBase64) {
      window.alert('請先生成插圖再複製連結。'); return;
    }
    if (posterImageUploadUrl) {
      await navigator.clipboard.writeText(posterImageUploadUrl).catch(() => {});
      window.alert('圖片連結已複製！可直接貼到 LINE、Facebook 等任何地方。'); return;
    }
    if (!firebaseStorage) {
      window.alert('Firebase Storage 尚未初始化，請確認 Firebase 專案已啟用 Storage。'); return;
    }
    if (!posterImageUploadPromise) {
      posterImageUploadPromise = uploadPosterToStorage();
    }
    await posterImageUploadPromise;
    if (posterImageUploadUrl) {
      await navigator.clipboard.writeText(posterImageUploadUrl).catch(() => {});
      window.alert('圖片連結已複製！可直接貼到 LINE、Facebook 等任何地方。');
    } else {
      window.alert('上傳失敗，請稍後再試。');
    }
  }

  function openTravelTools(tab = 'import') {
    activeTravelToolTab = tab;
    const overlay = document.getElementById('travelToolsOverlay');
    if (overlay) {
      overlay.classList.add('open');
    }
    renderTravelTools();
  }

  function closeTravelTools() {
    const overlay = document.getElementById('travelToolsOverlay');
    if (overlay) {
      overlay.classList.remove('open');
    }
  }

  function setTravelToolTab(tab) {
    activeTravelToolTab = tab;
    renderTravelTools();
  }

  function renderTravelTools() {
    const titleEl = document.getElementById('travelToolsTitle');
    const subtitleEl = document.getElementById('travelToolsSubtitle');
    const bodyEl = document.getElementById('travelToolsBody');
    const importTab = document.getElementById('travelToolsTabImport');
    const exportTab = document.getElementById('travelToolsTabExport');
    if (!bodyEl || !importTab || !exportTab) return;

    importTab.classList.toggle('active', activeTravelToolTab === 'import');
    exportTab.classList.toggle('active', activeTravelToolTab === 'export');

    if (titleEl) {
      titleEl.textContent = activeTravelToolTab === 'export' ? '匯出行程圖' : (activeTravelToolTab === 'join' ? '流程碼進入' : '網址匯入');
    }
    if (subtitleEl) {
      subtitleEl.textContent = activeTravelToolTab === 'export'
        ? '把目前行程輸出成可分享的圖檔與邀請碼。'
        : (activeTravelToolTab === 'join'
          ? '手機端直接輸入流程碼，就能進入旅遊中的使用者介面。'
          : '貼上台東食記或店家網址，AI 會先做內容解析與相容性檢查。');
    }

    if (activeTravelToolTab === 'import') {
      const existingValue = importedTravelDraft || '';
      const result = importedTravelResult;
      bodyEl.innerHTML = `
        <div class="travel-panel soft">
          <div class="travel-panel-title">貼上網址</div>
          <div class="travel-panel-subtitle">支援台東食記、店家文章或直接貼上網址文字。系統會先抽出店名、營業時間與推薦菜單。</div>
          <textarea class="travel-textarea" id="travelImportInput" placeholder="貼上台東食記網址或文章內容...">${escapeHtml(existingValue)}</textarea>
          <div class="travel-action-row">
            <button class="travel-btn primary" onclick="parseImportedTravelFromInput()">解析網址</button>
            <button class="travel-btn secondary" onclick="fillTravelImportExample()">載入台東示例</button>
          </div>
        </div>
        ${result ? `
          <div class="travel-panel">
            <div class="travel-panel-title">${escapeHtml(result.emoji)} ${escapeHtml(result.title)}</div>
            <div class="travel-result-grid">
              <div class="travel-kv"><div class="travel-kv-label">營業時間</div><div class="travel-kv-value">${escapeHtml(result.hours)}</div></div>
              <div class="travel-kv"><div class="travel-kv-label">地圖標點</div><div class="travel-kv-value">${escapeHtml(result.sourceLabel)}</div></div>
              <div class="travel-kv"><div class="travel-kv-label">推薦菜單</div><div class="travel-kv-value">${escapeHtml(result.menu.join('、'))}</div></div>
              <div class="travel-kv"><div class="travel-kv-label">相容性</div><div class="travel-kv-value">${escapeHtml(result.duplicateStopName || '可嘗試加入')}</div></div>
            </div>
            <div class="travel-compat ${result.compatible ? 'ok' : 'warn'}">${escapeHtml(result.compatibilityText)}</div>
            <div class="travel-action-row">
              <button class="travel-btn primary" onclick="commitImportedTravelResult()">${result.duplicateStopId ? '合併加入行程' : '加入行程'}</button>
              <button class="travel-btn secondary" onclick="focusImportedTravelPin()">只看地圖標點</button>
            </div>
          </div>
        ` : ''}
      `;
      return;
    }

    if (activeTravelToolTab === 'export') {
      applyExportTimeFit(); // 進入匯出分頁先檢查並壓縮超時行程，摘要與後續生成皆用壓縮後排程
      bodyEl.innerHTML = `
        <div class="travel-panel soft">
          <div class="travel-panel-title">行程摘要</div>
          <div class="travel-panel-subtitle">${escapeHtml(getTripScheduleSummary())}</div>
        </div>
        <div class="travel-panel">
          <div class="travel-panel-title">AI 旅遊插圖</div>
          <div class="travel-panel-subtitle">輸入喜歡的卡通人物，AI 將根據你的行程直接生成日式插畫風格旅遊圖。</div>
          <input class="travel-input" id="posterCharacterInput"
                 placeholder="例如：哆啦A夢、皮卡丘、小熊維尼…"
                 value="${escapeHtml(posterCharacterDraft)}"
                 ${posterImageGenerating ? 'disabled' : ''}>
          <div class="travel-action-row">
            <button class="travel-btn primary" onclick="generateItineraryImage()" ${posterImageGenerating ? 'disabled' : ''}>
              ${posterImageGenerating ? '生成中…' : '生成插圖'}
            </button>
          </div>
          ${posterImageGenerating ? `<div class="travel-hint" style="text-align:center;padding:20px 0;">✨ AI 正在繪製插圖，請稍候（約 10–30 秒）…</div>` : ''}
          ${posterGeneratedImageBase64 ? `
            <img id="posterGeneratedImg"
                 src="${posterGeneratedImageBase64}"
                 alt="AI 生成旅遊插圖"
                 style="width:100%;border-radius:16px;border:1px solid var(--border);display:block;cursor:pointer;"
                 onclick="openImageLightbox(this.src)"
                 title="點擊放大預覽">
            <div style="font-size:11px;color:var(--ink3);text-align:center;margin-top:4px;">點擊圖片可放大預覽</div>
            <div class="img-share-row">
              <button class="img-share-btn line"   onclick="shareImageToLine()">💬 LINE</button>
              <button class="img-share-btn fb"     onclick="shareImageToFacebook()">📘 Facebook</button>
              <button class="img-share-btn copy"   onclick="copyImageUrl()" ${posterImageUploading ? 'disabled' : ''}>${posterImageUploading ? '上傳中…' : posterImageUploadUrl ? '📋 複製連結' : '🔗 複製連結'}</button>
            </div>
            <div class="travel-action-row">
              <button class="travel-btn secondary" onclick="downloadGeneratedImage()">↓ 下載插圖</button>
            </div>
          ` : ''}
        </div>
      `;
      return;
    }

    bodyEl.innerHTML = `
      <div class="travel-panel soft">
        <div class="travel-panel-title">輸入流程碼</div>
        <div class="travel-panel-subtitle">輸入後會直接進入旅遊中的使用者介面，適合手機端從群組訊息快速加入。</div>
        <input class="travel-input" id="travelJoinInput" inputmode="latin" autocomplete="off" placeholder="請輸入流程碼，例如 ABCD-123" value="${escapeHtml(currentInviteCode)}">
        <div class="travel-action-row">
          <button class="travel-btn primary" onclick="enterJourneyByCode(document.getElementById('travelJoinInput').value)">進入旅遊</button>
          <button class="travel-btn secondary" onclick="setTravelToolTab('export')">查看邀請碼</button>
        </div>
      </div>
      <div class="travel-panel">
        <div class="travel-panel-title">快速說明</div>
        <div class="travel-panel-subtitle">${currentInviteCode ? `目前已預先綁定 ${escapeHtml(currentInviteCode)}。輸入後會切到旅遊模式並帶你到共乘流程頁。` : '目前尚未綁定邀請碼。輸入流程碼後會切到旅遊模式並帶你到共乘流程頁。'}</div>
      </div>
    `;
  }

  function fillTravelImportExample() {
    importedTravelDraft = '台東咖啡食記 https://www.example.com/taitung-cafe-review 10:00-18:00';
    const inputEl = document.getElementById('travelImportInput');
    if (inputEl) inputEl.value = importedTravelDraft;
    parseImportedTravelFromInput();
  }

  function parseImportedTravelFromInput() {
    const inputEl = document.getElementById('travelImportInput');
    if (!inputEl) return;
    importedTravelDraft = inputEl.value.trim();
    const parsed = parseImportedTravel(importedTravelDraft);
    if (!parsed) {
      window.alert('請先貼上一個網址或網址內容。');
      return;
    }
    importedTravelResult = parsed;
    registerImportedTravelPin(parsed);
    renderTravelTools();
    if (importedTravelPinId) {
      showPinInfo(importedTravelPinId);
    }
  }

  function focusImportedTravelPin() {
    if (!importedTravelPinId) return;
    if (isMobileLayout()) {
      setMobileMode('map');
    }
    showPinInfo(importedTravelPinId);
  }

  function commitImportedTravelResult() {
    if (!importedTravelResult) return;

    const existingStop = importedTravelResult.duplicateStopId
      ? replanStops.find((stop) => stop.id === importedTravelResult.duplicateStopId)
      : findDuplicateStopByName(importedTravelResult.title);

    const targetStop = existingStop || {
      id: `imported-${Date.now()}`,
      emoji: importedTravelResult.emoji,
      name: importedTravelResult.title,
      stayMin: 30,
      transitMin: null,
      mapPinId: importedTravelPinId
    };

    if (existingStop) {
      existingStop.emoji = importedTravelResult.emoji;
      existingStop.name = importedTravelResult.title;
      existingStop.mapPinId = importedTravelPinId;
      existingStop.stayMin = Math.max(existingStop.stayMin || 30, 30);
      existingStop.transitMin = normalizeTransitMinutesValue(existingStop.transitMin);
      activeStopMenuId = existingStop.id;
    } else {
      const returnIndex = replanStops.findIndex((stop) => normalizeText(stop.name).includes('回到車站') || stop.id === 'return');
      const insertAt = returnIndex >= 0 ? returnIndex : replanStops.length;
      replanStops.splice(insertAt, 0, targetStop);
      activeStopMenuId = targetStop.id;
    }

    isReplanning = true;
    switchView('itinerary');
    updateItineraryStageUI();
    renderReplanBoard();
    closeTravelTools();
  }

  function copyJourneyCode() {
    const code = currentInviteCode;
    if (!code) {
      window.alert('目前還沒有可複製的邀請碼。');
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(code).catch(() => window.alert(`邀請碼：${code}`));
      return;
    }
    window.alert(`邀請碼：${code}`);
  }

  // 行程超出設定時長時，把需縮短的時間「平均分攤」到各景點（餐廳/用餐站例外，不扣），
  // 每站最多只縮原本的 35%（保底 65%），以水位填平方式反覆均攤直到符合或已無可縮空間。
  function fitScheduleToTimeLimit() {
    const prefs = currentTripPreferences || {};
    if (!prefs.days) return { changed: false, fits: true, limitEndMin: null };
    const limitMin = parseDurationMinutes(prefs.days);
    if (!Number.isFinite(limitMin) || limitMin <= 0) return { changed: false, fits: true, limitEndMin: null };
    const startMin = getReplanStartMinutes();
    const limitEndMin = startMin + limitMin;

    const scheduleEnd = () => {
      const sch = buildReplanSchedule();
      return { sch, end: sch.length ? sch[sch.length - 1].end : startMin };
    };
    const curStayOf = (sch, i, stop) => Math.round((sch[i] && sch[i].computedStayMin) || (stop && stop.stayMin) || 0);

    let { sch, end } = scheduleEnd();
    if (end <= limitEndMin) return { changed: false, fits: true, limitEndMin };

    // 以首次排程的有效停留為「原本」，算 35% 下限（最多減 35% → 保底 65%）；
    // 端點（起點/終點）與餐廳/用餐站皆為例外，不參與扣時。
    const MIN_RATIO = 0.65;
    const info = replanStops.map((s, i) => {
      const eligible = !(s.type === 'start' || s.type === 'end') && !isFoodStop(s);
      const orig = Math.max(0, curStayOf(sch, i, s));
      return { stop: s, i, eligible, orig, floor: Math.ceil(orig * MIN_RATIO) };
    });

    let changed = false;
    let guard = 0;
    while (guard++ < 4000) {
      const r = scheduleEnd(); sch = r.sch; end = r.end;
      const overflow = end - limitEndMin;
      if (overflow <= 0) break;
      // 候選：可扣、且目前有效停留仍高於 35% 下限
      const cands = info.filter(t => t.eligible && curStayOf(sch, t.i, t.stop) > t.floor);
      if (!cands.length) break; // 已無可縮，盡力而為
      // 平均分攤：本輪每站各扣約 overflow/N（至少 1 分），但不超過各自剩餘可縮空間；
      // 部分站碰到下限後，剩餘量在下一輪由其餘站再均攤（水位填平）。
      const share = Math.max(1, Math.floor(overflow / cands.length));
      let applied = 0;
      for (const t of cands) {
        const remain = overflow - applied;
        if (remain <= 0) break;
        const curStay = curStayOf(sch, t.i, t.stop);
        const room = curStay - t.floor;
        if (room <= 0) continue;
        const cut = Math.min(room, share, remain);
        if (cut <= 0) continue;
        t.stop.stayMin = curStay - cut;
        // 讓新的 stayMin 生效：清除手動時間覆寫
        t.stop.manualStartMin = null;
        t.stop.manualEndMin = null;
        applied += cut;
        changed = true;
      }
      if (applied <= 0) break; // 安全：本輪無法再扣則停止
    }

    // 殘量收尾（精準落點優先）：主迴圈守 35% 後若仍超出（額度用罄），允許從「停留最久」的景點
    // 再多扣（可略超過 35%，但每站至少保留 HARD_MIN 分），把剩餘分鐘扣到剛好落在設定時間。餐廳仍不扣。
    const HARD_MIN = 5;
    guard = 0;
    while (guard++ < 4000) {
      const r = scheduleEnd(); sch = r.sch; end = r.end;
      const overflow = end - limitEndMin;
      if (overflow <= 0) break;
      const cands = info.filter(t => t.eligible && curStayOf(sch, t.i, t.stop) > HARD_MIN);
      if (!cands.length) break; // 連硬下限都到了，真的無法再扣
      cands.sort((a, b) => curStayOf(sch, b.i, b.stop) - curStayOf(sch, a.i, a.stop));
      const t = cands[0];
      const curStay = curStayOf(sch, t.i, t.stop);
      const cut = Math.min(curStay - HARD_MIN, overflow);
      if (cut <= 0) break;
      t.stop.stayMin = curStay - cut;
      t.stop.manualStartMin = null;
      t.stop.manualEndMin = null;
      changed = true;
    }

    const final = scheduleEnd();
    return { changed, fits: final.end <= limitEndMin, limitEndMin };
  }

  // 套用匯出前壓縮並同步畫面/儲存/提示（回傳 fit 結果，無變動時為 no-op）
  function applyExportTimeFit() {
    const fit = fitScheduleToTimeLimit();
    if (fit.changed) {
      renderItineraryDisplay();
      if (isReplanning) renderReplanBoard();
      refreshRouteDirections();
      schedulePersistTrip();
      const endStr = fit.limitEndMin != null ? minutesToClock(fit.limitEndMin) : '';
      if (typeof showToast === 'function') {
        showToast(fit.fits
          ? `⏱ 已自動壓縮超時行程，調整至 ${endStr} 前結束再匯出`
          : `⏱ 已盡量壓縮行程（每站最多縮 35%），仍略超出 ${endStr}`,
          fit.fits ? 'green' : 'orange');
      }
    }
    return fit;
  }

  function downloadItineraryImage() {
    applyExportTimeFit(); // 匯出前先壓縮超時行程
    const svg = buildItineraryPosterSvg();
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${currentInviteCode}-itinerary.svg`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function enterJourneyByCode(code) {
    const normalizedCode = normalizeInviteCode(code);
    const inviteCode = normalizeInviteCode(currentInviteCode);
    const itineraryCode = normalizeInviteCode(currentItineraryId);

    if (!normalizedCode) {
      window.alert('請先輸入流程碼。');
      return;
    }

    if (normalizedCode !== inviteCode && normalizedCode !== itineraryCode) {
      window.alert('流程碼不正確，請再確認一次。');
      return;
    }

    closeTravelTools();
    setUserRole('passenger');
    switchView('rideflow');
    setRideMode('trip-detail');
    if (isMobileLayout()) {
      setMobileMode('functions');
    }
  }

  function maskItineraryId(itineraryId) {
    if (!itineraryId || itineraryId.length < 6) return itineraryId;
    return `${itineraryId.slice(0, 4)}••••${itineraryId.slice(-2)}`;
  }

  function renderPrototypeTripId() {
    document.body.classList.toggle('prototype-mode', isPrototypeMode);
    const chipEl = document.getElementById('prototypeTripId');
    if (!chipEl) return;
    if (!currentItineraryId || currentItineraryId === 'TRIP-EMPTY') {
      chipEl.textContent = '尚未建立';
      chipEl.title = 'Prototype only: no itinerary loaded';
      return;
    }
    chipEl.textContent = `原型 ${maskItineraryId(currentItineraryId)}`;
    chipEl.title = `Prototype only: ${currentItineraryId}`;
  }

  function minutesToClock(totalMinutes) {
    const safe = Math.max(0, totalMinutes);
    const h = Math.floor(safe / 60);
    const m = safe % 60;
    if (h >= 24) return `次日 ${String(h - 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  function updateMapTimeBanner(startStr, endStr, rawEndMin) {
    const banner = document.getElementById('mapTimeBanner');
    const rangeEl = document.getElementById('mapTimeBannerRange');
    const durEl = document.getElementById('mapTimeBannerDuration');
    const warnEl = document.getElementById('mapTimeBannerWarn');
    if (!banner || !rangeEl || !durEl) return;
    if (!startStr || !endStr) { banner.style.display = 'none'; return; }
    const startMin = clockToMinutes(startStr);
    // 優先使用傳入的原始分鐘數（不受 23:59 截斷影響），才能正確偵測溢出
    const endMin = (rawEndMin != null && Number.isFinite(rawEndMin)) ? rawEndMin : clockToMinutes(endStr);
    const diffMin = (Number.isFinite(startMin) && Number.isFinite(endMin)) ? endMin - startMin : null;
    rangeEl.textContent = `⏱ ${startStr} – ${endStr}`;
    if (diffMin && diffMin > 0) {
      const h = Math.floor(diffMin / 60);
      const m = diffMin % 60;
      durEl.textContent = m > 0 ? `共 ${h} 小時 ${m} 分` : `共 ${h} 小時`;
    } else {
      durEl.textContent = '';
    }
    if (warnEl) {
      const prefs = currentTripPreferences || {};
      const planStart = prefs.startTime || startStr;
      const planDays = prefs.days;
      const planEndStr = planDays ? calcReplanEndTime(planStart, planDays) : null;
      const planEndMin = planEndStr ? clockToMinutes(planEndStr) : null;
      const midnightOverrun = Number.isFinite(endMin) && endMin >= 24 * 60;
      const planOverrun = planEndMin != null && Number.isFinite(endMin) && endMin > planEndMin + 1;
      const overrun = planOverrun || midnightOverrun;
      warnEl.style.display = overrun ? 'block' : 'none';
      if (overrun) {
        const baseline = planEndMin != null ? planEndMin : (23 * 60 + 59);
        const overMin = Math.max(1, endMin - baseline);
        const oh = Math.floor(overMin / 60);
        const om = overMin % 60;
        const overStr = oh > 0 ? (om > 0 ? `${oh}小時${om}分` : `${oh}小時`) : `${om}分`;
        warnEl.textContent = planEndStr
          ? `⚠ 超出規劃時間 ${overStr}（預計 ${planEndStr} 結束）`
          : `⚠ 行程超出今日範圍 ${overStr}`;
      }
    }
    banner.style.display = 'flex';
  }

  function clockToMinutes(clockText) {
    if (!clockText || typeof clockText !== 'string') return null;
    let text = clockText.trim();
    let offset = 0;
    if (text.startsWith('次日 ')) { offset = 24 * 60; text = text.slice(3); }
    if (!text.includes(':')) return null;
    const [hText, mText] = text.split(':');
    const h = parseInt(hText, 10);
    const m = parseInt(mText, 10);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    if (h < 0 || h > 23 || m < 0 || m > 59) return null;
    return offset + h * 60 + m;
  }

  function normalizeTransitMode(mode) {
    const source = String(mode || '').trim().toLowerCase();
    // 「大眾交通」已移除；舊行程若存有 public，遷移為汽車（避免長程段被當成走路）
    if (source === 'public') return 'car';
    return TRANSIT_MODE_OPTIONS.some((item) => item.value === source) ? source : 'walk';
  }

  function getTransitModeMeta(mode) {
    const normalized = normalizeTransitMode(mode);
    return TRANSIT_MODE_OPTIONS.find((item) => item.value === normalized) || TRANSIT_MODE_OPTIONS[0];
  }

  // 使用者建立行程時所選的主要交通工具（計程車/機車/汽車），預設汽車
  function getPreferredVehicleMode() {
    const pref = String(currentTripPreferences?.transportMode || '').trim().toLowerCase();
    return ['taxi', 'scooter', 'car'].includes(pref) ? pref : 'car';
  }

  function hasTransitMinutesValue(value) {
    return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
  }

  function normalizeTransitMinutesValue(value) {
    return hasTransitMinutesValue(value) ? Math.max(0, Number(value)) : null;
  }

  function getDefaultTransitMinutes(mode) {
    return 15; // 預設15分鐘，若未有估算結果時使用
  }

  function getTransitDurationText(minutes) {
    const mins = Math.round(Number(minutes));
    if (mins <= 0) return '';
    if (mins >= 60) {
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      return m > 0 ? `約 ${h} 小時 ${m} 分鐘` : `約 ${h} 小時`;
    }
    return `約 ${mins} 分鐘`;
  }

  function getTransitSummaryText(mode, minutes) {
    const meta = getTransitModeMeta(mode);
    const mins = Math.round(Number(minutes));
    if (mins > 0) {
      let timeStr = `約 ${mins} 分鐘`;
      if (mins >= 60) {
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        timeStr = m > 0 ? `約 ${h} 小時 ${m} 分鐘` : `約 ${h} 小時`;
      }
      return `${meta.icon} ${meta.label}${timeStr}`;
    }
    return `${meta.icon} ${meta.label}`;
  }

  function getGoogleTravelModeByTransit(mode) {
    const normalized = normalizeTransitMode(mode);
    if (normalized === 'walk') return google.maps.TravelMode.WALKING;
    if (normalized === 'scooter') {
      return google.maps.TravelMode.TWO_WHEELER || google.maps.TravelMode.DRIVING;
    }
    // taxi 與 car 皆走一般汽車路線
    return google.maps.TravelMode.DRIVING;
  }

  function buildGoogleRouteRequest(mode, origin, destination) {
    const normalized = normalizeTransitMode(mode);
    const originLat = Number(origin && origin.lat);
    const originLng = Number(origin && origin.lng);
    const destLat = Number(destination && destination.lat);
    const destLng = Number(destination && destination.lng);
    const request = {
      origin: { lat: originLat, lng: originLng },
      destination: { lat: destLat, lng: destLng },
      travelMode: getGoogleTravelModeByTransit(normalized)
    };

    if (normalized === 'scooter' && request.travelMode === google.maps.TravelMode.DRIVING) {
      request.avoidTolls = true;
      request.avoidHighways = true;
    }

    if (request.travelMode === google.maps.TravelMode.TRANSIT && google.maps.TransitRoutePreference) {
      request.transitOptions = {
        routingPreference: google.maps.TransitRoutePreference.FEWER_TRANSFERS
      };
    }
    
    if (request.travelMode === google.maps.TravelMode.DRIVING || request.travelMode === google.maps.TravelMode.TWO_WHEELER) {
      request.drivingOptions = {
        departureTime: new Date(Date.now() + 1000),
        trafficModel: 'bestguess'
      };
    }

    // 對汽車/機車/腳踏車模式請求替代路線，讓後面可以自動選距離最短的那條
    if (
      request.travelMode === google.maps.TravelMode.DRIVING ||
      request.travelMode === google.maps.TravelMode.TWO_WHEELER ||
      request.travelMode === google.maps.TravelMode.BICYCLING
    ) {
      request.provideRouteAlternatives = true;
    }

    return request;
  }

  function getGoogleLegEstimate(leg, fallbackMinutes) {
    let durationValue = 0;
    let durationText = '';

    if (leg) {
      if (leg.duration_in_traffic) {
        durationValue = Number(leg.duration_in_traffic.value);
        durationText = leg.duration_in_traffic.text;
      } else if (leg.duration) {
        durationValue = Number(leg.duration.value);
        durationText = leg.duration.text;
      }
    }

    const durationMinutes = Number.isFinite(durationValue) && durationValue > 0
      ? Math.ceil(durationValue / 60)
      : Math.max(1, Math.round(Number(fallbackMinutes) || 0));
      
    return {
      distanceText: leg && leg.distance && leg.distance.text ? leg.distance.text : '',
      durationText: durationText ? durationText : `${durationMinutes} 分鐘`,
      durationMinutes
    };
  }

  function formatStageTimeRange(startMin, endMin) {
    if (!Number.isFinite(startMin) || !Number.isFinite(endMin)) return '';
    return `${minutesToClock(startMin)} - ${minutesToClock(endMin)}`;
  }

  function isDistanceAbnormallySmall(distanceText) {
    if (!distanceText) return false;
    const m = String(distanceText).match(/^(\d+(?:\.\d+)?)\s*公尺/);
    return !!(m && parseFloat(m[1]) < 100);
  }

  function syncRouteStageScheduleTimes(schedule = buildReplanSchedule()) {
    routeStageCache.forEach((stage, index) => {
      if (!stage) return;
      const sourceStopIndex = Number.isInteger(stage.sourceStopIndex) ? stage.sourceStopIndex : index;
      const destinationStopIndex = Number.isInteger(stage.destinationStopIndex) ? stage.destinationStopIndex : (sourceStopIndex + 1);
      const currentStop = schedule[sourceStopIndex];
      const nextStop = schedule[destinationStopIndex];
      const departMin = currentStop ? currentStop.end : getReplanStartMinutes();
      const arriveMin = nextStop ? nextStop.start : departMin;
      stage.departureMin = departMin;
      stage.arrivalMin = arriveMin;
      stage.timeRange = formatStageTimeRange(departMin, arriveMin);
    });
  }

  function getRouteStageTimeText(stage) {
    if (!stage) return '';
    return stage.timeRange || formatStageTimeRange(stage.departureMin, stage.arrivalMin);
  }

  function getRouteStageBySourceStopIndex(sourceStopIndex) {
    return routeStageCache.find((stage) => stage && stage.sourceStopIndex === sourceStopIndex) || null;
  }

  function getReplanStartMinutes() {
    return clockToMinutes(currentTripWindow.start) || replanStartMinutes;
  }

  function buildReplanSchedule() {
    let cursor = getReplanStartMinutes();
    return replanStops.map((stop, index) => {
      const transitMode = normalizeTransitMode(stop.transitMode);
      stop.transitMode = transitMode;
      const defaultDuration = Math.max(5, stop.stayMin || 0);
      const preferredStart = Number.isFinite(stop.manualStartMin) ? stop.manualStartMin : cursor;
      const preferredEnd = Number.isFinite(stop.manualEndMin) ? stop.manualEndMin : (preferredStart + defaultDuration);
      const preferredDuration = Math.max(5, preferredEnd - preferredStart);
      const start = Math.max(preferredStart, cursor);
      const end = start + preferredDuration;
      const normalizedTransitMin = normalizeTransitMinutesValue(stop.transitMin);
      stop.transitMin = normalizedTransitMin;
      
      let transit = 0;
      if (index < replanStops.length - 1) {
        transit = Number.isFinite(normalizedTransitMin) ? normalizedTransitMin : getDefaultTransitMinutes(transitMode);
        // 開車段的目的地若停在鄰近停車場，「停車後步行」也算進段落交通，
        // 下一站的開始時刻與行程總時長才會反映真實情況（暫態欄位，畫路線時寫入）。
        const nextParkWalk = Number(replanStops[index + 1] && replanStops[index + 1].parkWalkMin);
        if (Number.isFinite(nextParkWalk) && nextParkWalk > 0) transit += nextParkWalk;
        // 出發側也要算：本站當初開車抵達且停在停車場、這一段又是開車 →
        // 離開前得先從景點走回停車場（與抵達步行同一條路，時間相同）。
        const ownParkWalk = Number(stop.parkWalkMin);
        if ((transitMode === 'car' || transitMode === 'scooter')
            && Number.isFinite(ownParkWalk) && ownParkWalk > 0) transit += ownParkWalk;
      }

      cursor = end + transit;
      return {
        ...stop,
        start,
        end,
        transit,
        transitMode,
        computedStayMin: end - start
      };
    });
  }

  function reorderReplanStops(sourceId, targetId) {
    if (!sourceId || !targetId || sourceId === targetId) return;
    if (collabReadOnly) return; // 唯讀成員／訪客不可調整順序
    const sourceIndex = replanStops.findIndex((item) => item.id === sourceId);
    const targetIndex = replanStops.findIndex((item) => item.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;

    // 起點（出發）與終點（返回）是行程錨點：本身不可被搬移，其他站也不可移到起點之前
    // 或終點之後，否則會出現「先返回、後出發」這類錯亂順序（且在共編行程會被存回、推送給所有成員）。
    const isAnchor = (s) => s && (s.type === 'start' || s.type === 'end');
    if (isAnchor(replanStops[sourceIndex]) || isAnchor(replanStops[targetIndex])) return;

    const [moved] = replanStops.splice(sourceIndex, 1);
    replanStops.splice(targetIndex, 0, moved);
    refreshRouteDirections();
    schedulePersistTrip();
  }

  function createStopFromTemplate(template) {
    replanStopSerial += 1;
    let assignedPinId = template.mapPinId;
    const scenicCoordinates = template.scenicCoordinates || template['景點座標'] || null;
    const stopCoordinates = readCoordinateObject(scenicCoordinates || template);

    if (!assignedPinId) {
      assignedPinId = `ai-pin-${replanStopSerial}`;
      const markerPosition = scenicCoordinates
        ? safeLatLng(scenicCoordinates)
        : createNearbyPosition(replanStopSerial);
      if (typeof pinData !== 'undefined') {
        pinData[assignedPinId] = {
          ...buildSpotPinPayload({
          emoji: template.emoji || '📍',
          name: template.name || '景點',
          desc: template.desc || '',
          notice: template.notice || '',
          region: currentTripRegion,
          title: currentTripTitle
          }),
          lat: markerPosition.lat,
          lng: markerPosition.lng
        };
      }
      if (typeof map !== 'undefined' && map && window.google) {
        const marker = new google.maps.Marker({
          position: markerPosition,
          map: map,
          title: `${template.emoji || '📍'} ${template.name}`,
          icon: createEmojiPinIcon(template.emoji || '📍')
        });
        rememberMarkerBasePosition(marker, markerPosition);
        markers[assignedPinId] = marker;
        marker.addListener('click', () => {
          showPinInfo(assignedPinId);
          map.panTo(marker.getPosition());
        });
        if (typeof layoutMapMarkers === 'function') {
          layoutMapMarkers();
        }
      }
    }

    const normalizedMode = normalizeTransitMode(template.transitMode);
    const transitMinValue = normalizeTransitMinutesValue(template.transitMin);

    return {
      id: `${template.baseId}-${replanStopSerial}`,
      emoji: template.emoji,
      name: template.name,
      desc: template.desc || '',
      stayMin: template.stayMin,
      transitMin: transitMinValue,
      transitMode: normalizedMode,
      mapPinId: assignedPinId,
      scenicCoordinates,
      lat: stopCoordinates ? stopCoordinates.lat : null,
      lng: stopCoordinates ? stopCoordinates.lng : null,
      nearbyToiletLocations: template.toiletLocations || []
    };
  }
  function insertUniqueTemplateStop(template, preferredTargetId = activeStopMenuId) {
    const duplicate = findDuplicateStopByName(template.name);
    if (duplicate) {
      activeStopMenuId = duplicate.id;
      renderReplanBoard();
      return duplicate;
    }

    const newStop = createStopFromTemplate(template);
    const targetIndex = preferredTargetId ? replanStops.findIndex((item) => item.id === preferredTargetId) : -1;
    if (targetIndex >= 0) {
      replanStops.splice(targetIndex + 1, 0, newStop);
    } else {
      replanStops.push(newStop);
    }
    activeStopMenuId = newStop.id;
    renderReplanBoard();
    refreshRouteDirections();
    schedulePersistTrip();
    return newStop;
  }

  function addStopNear(targetStopId) {
    const targetIndex = replanStops.findIndex((item) => item.id === targetStopId);
    if (targetIndex < 0) return;
    const nextTemplate = quickAddPool[replanStopSerial % quickAddPool.length];
    const newStop = createStopFromTemplate(nextTemplate);
    replanStops.splice(targetIndex + 1, 0, newStop);
    activeStopMenuId = newStop.id;
    renderReplanBoard();
    refreshRouteDirections();
    schedulePersistTrip();
  }

  function modifyStopById(stopId) {
    openModifyWindow(stopId);
  }

  function openModifyWindow(stopId) {
    const stop = replanStops.find((item) => item.id === stopId);
    if (!stop) return;

    const schedule = buildReplanSchedule();
    const targetSchedule = schedule.find((item) => item.id === stopId);

    isModifyWindowOpen = true;
    modifyTargetStopId = stopId;
    modifySource = 'wall';

    const matched = modifySpotCatalog.find((spot) => spot.name === stop.name) || modifySpotCatalog.find((spot) => spot.pinId && spot.pinId === stop.mapPinId);
    selectedModifySpotId = matched ? matched.id : null;
    const baseStartMin = getReplanStartMinutes();
    selectedModifyStartTime = targetSchedule ? minutesToClock(targetSchedule.start) : minutesToClock(baseStartMin);
    selectedModifyEndTime = targetSchedule ? minutesToClock(targetSchedule.end) : minutesToClock(baseStartMin + Math.max(5, stop.stayMin || 15));

    const overlay = document.getElementById('modifyOverlay');
    if (overlay) {
      overlay.classList.add('open');
    }

    activeStopMenuId = stopId;
    updateModifyWindowTarget(stop.name);
    switchModifySource('wall');
    renderReplanBoard();
  }

  function closeModifyWindow() {
    isModifyWindowOpen = false;
    modifyTargetStopId = null;
    modifySource = 'wall';
    selectedModifySpotId = null;
    selectedModifyStartTime = '';
    selectedModifyEndTime = '';
    const overlay = document.getElementById('modifyOverlay');
    if (overlay) {
      overlay.classList.remove('open');
    }
    renderReplanBoard();
  }

  function updateModifyWindowTarget(targetName) {
    const targetEl = document.getElementById('modifyWindowTarget');
    if (!targetEl) return;
    targetEl.textContent = `目前修改：${targetName}`;
  }

  function switchModifySource(source) {
    modifySource = source;
    const wallTab = document.getElementById('modifyTabWall');
    const mapTab = document.getElementById('modifyTabMap');
    if (wallTab && mapTab) {
      wallTab.classList.toggle('active', source === 'wall');
      mapTab.classList.toggle('active', source === 'map');
    }
    renderModifyWindowBody();
  }

  function selectModifySpot(spotId) {
    selectedModifySpotId = spotId;
    renderModifyWindowBody();
  }

  function updateModifyTimeRange(type, value) {
    if (type === 'start') {
      selectedModifyStartTime = value;
    } else {
      selectedModifyEndTime = value;
    }
  }

  // ── 滾輪時間選擇器包裝（取代修改視窗的原生 time input；onSet 於「設定」時更新區間並重繪欄位）──
  function pickModifyTime(type, current) {
    if (!window.WAIPicker) return;
    WAIPicker.openTime({
      value: current || '09:00',
      title: type === 'start' ? '設定開始時間' : '設定結束時間',
      onSet: function (v) { updateModifyTimeRange(type, v); renderModifyWindowBody(); }
    });
  }

  function renderModifyWindowBody() {
    const body = document.getElementById('modifyWindowBody');
    if (!body) return;
    const targetStop = replanStops.find((item) => item.id === modifyTargetStopId);
    const selectedSpot = modifySpotCatalog.find((spot) => spot.id === selectedModifySpotId);
    const defaultStart = targetStop && Number.isFinite(targetStop.manualStartMin)
      ? minutesToClock(targetStop.manualStartMin)
      : selectedModifyStartTime;
    const defaultEnd = targetStop && Number.isFinite(targetStop.manualEndMin)
      ? minutesToClock(targetStop.manualEndMin)
      : selectedModifyEndTime;

    const candidateSpots = modifySpotCatalog.filter((spot) => spot.source === modifySource);
    const guideBlock = modifySource === 'map'
      ? '<div class="modify-map-guide">地圖模式：可透過膠囊按鈕切換；之後可直接接地圖 API 的地點搜尋與選點結果。</div>'
      : '';

    // 構建景點詳情區塊（當選中景點時顯示）
    const spotDetailHtml = selectedSpot ? `
      <div class="modify-spot-detail">
        <div class="modify-spot-detail-header">
          <div class="modify-spot-detail-emoji">${selectedSpot.emoji}</div>
          <div>${selectedSpot.name}</div>
        </div>
        <div class="modify-spot-detail-section">
          <div class="modify-spot-detail-section-title">景點介紹</div>
          <div class="modify-spot-detail-section-content">${selectedSpot.desc}</div>
        </div>
        ${(selectedSpot.duration || selectedSpot.stayMin) ? `
        <div class="modify-spot-detail-section">
          <div class="modify-spot-detail-section-title">⏱ 建議停留時間</div>
          <div class="modify-spot-detail-section-content">${selectedSpot.duration || selectedSpot.stayMin} 分鐘</div>
        </div>
        ` : ''}
        ${selectedSpot.notice ? `
        <div class="modify-spot-detail-notice">
          <div class="modify-spot-detail-notice-title">⚠️ 注意事項</div>
          <div class="modify-spot-detail-notice-text">${selectedSpot.notice}</div>
        </div>
        ` : ''}
      </div>
    ` : '';

    body.innerHTML = `
      ${guideBlock}
      <div class="modify-grid">
        ${candidateSpots.map((spot) => `
          <button class="modify-spot-btn ${selectedModifySpotId === spot.id ? 'active' : ''}" onclick="selectModifySpot('${spot.id}')">
            <div class="modify-spot-top">
              <div class="modify-spot-name">${spot.name}</div>
              <div style="font-size:20px;line-height:1;">${spot.emoji}</div>
            </div>
            <div class="modify-spot-desc">${spot.desc}</div>
          </button>
        `).join('')}
      </div>
      ${spotDetailHtml}
      ${selectedSpot ? `
        <div class="modify-time-apply">
          <div class="modify-time-label">時間區間（預設沿用原景點時段）</div>
          <div class="modify-time-range">
            <div class="modify-time-input" style="cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:4px;" onclick="pickModifyTime('start','${selectedModifyStartTime || defaultStart}')">${selectedModifyStartTime || defaultStart}<span style="font-size:11px;opacity:.6;">🕒</span></div>
            <span class="modify-time-sep">到</span>
            <div class="modify-time-input" style="cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:4px;" onclick="pickModifyTime('end','${selectedModifyEndTime || defaultEnd}')">${selectedModifyEndTime || defaultEnd}<span style="font-size:11px;opacity:.6;">🕒</span></div>
          </div>
          <div class="modify-time-hint">若與其他景點重疊，系統會自動把後續景點往後順延。</div>
          <button class="modify-apply-btn" onclick="applyModifySelection()">套用</button>
        </div>
      ` : ''}
    `;

    if (modifySource === 'map') {
      const selected = modifySpotCatalog.find((spot) => spot.id === selectedModifySpotId);
      if (selected && selected.pinId) {
        showPinInfo(selected.pinId);
      }
    }
  }

  function applyModifySelection() {
    if (!modifyTargetStopId) return;
    const stop = replanStops.find((item) => item.id === modifyTargetStopId);
    const selectedSpot = modifySpotCatalog.find((spot) => spot.id === selectedModifySpotId);
    const startMin = clockToMinutes(selectedModifyStartTime);
    const endMin = clockToMinutes(selectedModifyEndTime);

    if (!stop || !selectedSpot) {
      window.alert('請先選擇一個景點。');
      return;
    }
    if (!Number.isFinite(startMin) || !Number.isFinite(endMin) || endMin <= startMin) {
      window.alert('請設定有效的起訖時間（結束時間需晚於開始時間）。');
      return;
    }

    stop.name = selectedSpot.name;
    stop.emoji = selectedSpot.emoji;
    stop.mapPinId = selectedSpot.pinId || null;
    stop.manualStartMin = startMin;
    stop.manualEndMin = endMin;
    stop.stayMin = endMin - startMin;
    
    // 檢查並自動調整重疊的後續行程
    adjustOverlappingStops(stop.id);
    
    activeStopMenuId = stop.id;
    closeModifyWindow();
    renderReplanBoard();
    refreshRouteDirections();
    schedulePersistTrip();
  }

  function removeStopById(stopId) {
    if (collabReadOnly) return; // 唯讀成員／訪客不可刪除站點（變更也不會寫回共用行程）
    if (replanStops.length <= 1) {
      window.alert('至少需要保留一個景點。');
      return;
    }
    const targetIndex = replanStops.findIndex((item) => item.id === stopId);
    if (targetIndex < 0) return;
    replanStops.splice(targetIndex, 1);
    if (activeStopMenuId === stopId) {
      activeStopMenuId = null;
    }
    if (modifyTargetStopId === stopId) {
      closeModifyWindow();
    }
    renderReplanBoard();
    refreshRouteDirections();
    schedulePersistTrip();
  }

  function handleToggleVisited(stopId, btn) {
    const stop = replanStops.find(s => s.id === stopId);
    if (!stop) return;
    const nowVisited = toggleVisitedPlace(stop);
    const label = nowVisited ? '✓ 已去過' : '📌 去過了';
    // 同步更新所有 view 中同一景點的「去過了」按鈕（replan 卡片、planned timeline、pin info）
    document.querySelectorAll(`.visited-toggle-btn[data-stop-id="${stopId}"]`).forEach(b => {
      b.textContent = label;
      b.classList.toggle('visited', nowVisited);
    });
    if (btn && !btn.dataset.stopId) {
      btn.textContent = label;
      btn.classList.toggle('visited', nowVisited);
    }
    showVisitedToast(nowVisited ? `${stop.name} 已加入旅遊紀錄` : `${stop.name} 已從旅遊紀錄移除`);
    const travellogList = document.getElementById('travellog-list');
    if (travellogList) renderTravelLog();
  }

  // 給「開始行程」後續完成用的公開介面：自動將整趟行程的景點標為「去過了」
  window.markTripAsCompleted = function() {
    if (!replanStops || !replanStops.length) return feedbackToast('沒有可記錄的行程', 'orange');
    
    currentTripStatus = 'completed';
    updateLocalTripField(currentItineraryId, 'status', 'completed');

    if (typeof logTripEvent === 'function') {
      logTripEvent('trip_completed');
    }

    let addedCount = 0;
    replanStops.forEach(stop => {
      if (stop.type !== 'start' && stop.type !== 'end' && stop.name) {
        if (!isPlaceVisited(stop.name)) {
          toggleVisitedPlace(stop);
          addedCount++;
          // 更新畫面按鈕
          document.querySelectorAll(`.visited-toggle-btn[data-stop-id="${stop.id}"]`).forEach(b => {
            b.textContent = '✓ 已去過';
            b.classList.add('visited');
          });
        }
      }
    });

    // Update hero title immediately
    const heroTitleEl = document.querySelector('#view-itinerary .hero-title');
    if (heroTitleEl) {
      heroTitleEl.innerHTML = escapeHtml(currentTripTitle) + ' <span class="hero-status-badge completed">🎉 已完成</span>';
    }

    if (addedCount > 0) {
      feedbackToast(`🎉 行程已完成！自動將 ${addedCount} 個景點加入去過清單。`, 'green');
      if (document.getElementById('travellog-list')) renderTravelLog();
    } else {
      feedbackToast('此行程的景點皆已記錄過。', 'blue');
    }

    persistCurrentTripStops();
    renderItineraryDisplay();
    updateItineraryStageUI();

    // 完成行程後邀請使用者評分回饋（B1）；稍微延遲讓完成 toast 先顯示
    setTimeout(() => { if (typeof window.openTripFeedback === 'function') window.openTripFeedback(true); }, 900);
  };

  // ══════════════════════════════════════════════════
  // 行程回饋系統（B1：整體評分 + AI 準確度 + 選填意見）
  // 到訪標記沿用既有 toggleVisitedPlace / isPlaceVisited。
  // 資料寫入 micro_trips/{tripId}.feedback.{emailKey}（見 docs/FEEDBACK_SCHEMA.md）。
  // ══════════════════════════════════════════════════
  const TRIP_FEEDBACK_KEY = 'wai_trip_feedback';
  let tripFeedbackDraft = { tripRating: 0, aiAccuracy: 0, comment: '', stopRatings: {} };
  let tripFeedbackStopNames = []; // 本次評分視窗的景點名清單（index → name，onclick 用索引避免名稱跳脫問題）

  // planner 執行期沒有全域 showToast（僅 explore 有）；安全退回 showVisitedToast，避免 ReferenceError。
  function feedbackToast(msg, color) {
    if (typeof showToast === 'function') { showToast(msg, color); return; }
    if (typeof showVisitedToast === 'function') { showVisitedToast(msg); return; }
  }

  function getCurrentUserIdentity() {
    let email = '', name = '';
    try {
      const u = JSON.parse(localStorage.getItem('wai_user') || '{}');
      const cu = u && u.currentUser;
      if (cu) { email = cu.email || ''; name = cu.name || cu.displayName || ''; }
    } catch (_e) {}
    if (!name) name = email ? email.split('@')[0] : '旅人';
    return { email, name };
  }

  function feedbackEmailKey(email) {
    if (window.WAI_COLLAB && typeof WAI_COLLAB.emailKey === 'function') return WAI_COLLAB.emailKey(email);
    return String(email || '').toLowerCase().replace(/[^a-z0-9]/g, '_');
  }

  function getLocalTripFeedbackMap() {
    try { return JSON.parse(localStorage.getItem(TRIP_FEEDBACK_KEY) || '{}'); } catch { return {}; }
  }
  function getLocalTripFeedback(tripId) {
    const map = getLocalTripFeedbackMap();
    return (tripId && map[tripId]) ? map[tripId] : null;
  }

  // 計算本趟到訪數 / 總景點數（不含 start/end 節點）
  function computeVisitedSummary() {
    const stops = (replanStops || []).filter(s => s && s.type !== 'start' && s.type !== 'end' && s.name);
    const visited = stops.filter(s => isPlaceVisited(s.name)).length;
    return { visitedCount: visited, totalStops: stops.length };
  }

  window.openTripFeedback = function(auto) {
    const hasTrip = (currentItineraryId && currentItineraryId !== 'TRIP-EMPTY') || (replanStops && replanStops.length);
    if (!hasTrip) { feedbackToast('尚未載入行程，請先開啟或生成一份行程。', 'orange'); return; }
    // 預填：優先讀本機快取（離線 / 個人行程也能回填）
    const existing = getLocalTripFeedback(currentItineraryId);
    tripFeedbackDraft = existing
      ? { tripRating: existing.tripRating || 0, aiAccuracy: existing.aiAccuracy || 0, comment: existing.comment || '', stopRatings: existing.stopRatings || {} }
      : { tripRating: 0, aiAccuracy: 0, comment: '', stopRatings: {} };
    renderTripFeedbackModal(!!existing);
    const overlay = document.getElementById('tripfb-overlay');
    if (overlay) requestAnimationFrame(() => overlay.classList.add('open'));
  };

  window.closeTripFeedback = function() {
    const overlay = document.getElementById('tripfb-overlay');
    if (overlay) overlay.classList.remove('open');
  };

  window.setFeedbackStar = function(field, val) {
    if (field !== 'tripRating' && field !== 'aiAccuracy') return;
    tripFeedbackDraft[field] = val;
    // 只更新該列星星與送出按鈕狀態，不重建整個 modal（保留 textarea 焦點）
    const row = document.getElementById('tripfb-stars-' + field);
    if (row) row.querySelectorAll('.tripfb-star').forEach((b, i) => b.classList.toggle('on', i < val));
    const submitBtn = document.getElementById('tripfb-submit');
    if (submitBtn) submitBtn.disabled = !(tripFeedbackDraft.tripRating > 0 && tripFeedbackDraft.aiAccuracy > 0);
  };

  // 單一景點評分（選填）：再點同一顆星＝取消該景點評分
  window.setStopFeedbackStar = function(idx, val) {
    const name = tripFeedbackStopNames[idx];
    if (!name) return;
    const cur = tripFeedbackDraft.stopRatings[name] || 0;
    if (cur === val) delete tripFeedbackDraft.stopRatings[name];
    else tripFeedbackDraft.stopRatings[name] = val;
    const row = document.getElementById('tripfb-stopstars-' + idx);
    const now = tripFeedbackDraft.stopRatings[name] || 0;
    if (row) row.querySelectorAll('.tripfb-star').forEach((b, i) => b.classList.toggle('on', i < now));
  };

  window.submitTripFeedback = async function() {
    const commentEl = document.getElementById('tripfb-comment');
    tripFeedbackDraft.comment = commentEl ? commentEl.value.trim().slice(0, 500) : '';
    if (!(tripFeedbackDraft.tripRating > 0 && tripFeedbackDraft.aiAccuracy > 0)) {
      feedbackToast('請先為「行程整體」與「AI 準確度」評分。', 'orange');
      return;
    }
    const { email, name } = getCurrentUserIdentity();
    const { visitedCount, totalStops } = computeVisitedSummary();
    const entry = {
      email: email || '',
      name: name,
      tripRating: tripFeedbackDraft.tripRating,
      aiAccuracy: tripFeedbackDraft.aiAccuracy,
      comment: tripFeedbackDraft.comment,
      stopRatings: tripFeedbackDraft.stopRatings || {}, // 單一景點評分 {景點名: 1-5}（Android schema 對齊）
      visitedCount, totalStops,
      submittedAt: Date.now(),
      appPlatform: 'web'
    };

    // 1) 本機快取（一定成功，離線 / 個人行程也保留）
    try {
      const map = getLocalTripFeedbackMap();
      map[currentItineraryId] = {
        tripRating: entry.tripRating, aiAccuracy: entry.aiAccuracy,
        comment: entry.comment, stopRatings: entry.stopRatings, submittedAt: entry.submittedAt
      };
      localStorage.setItem(TRIP_FEEDBACK_KEY, JSON.stringify(map));
    } catch (e) { console.warn('Save feedback to localStorage failed:', e); }

    // 2) Firestore：micro_trips/{tripId}.feedback.{emailKey}（巢狀物件，避免 dot-key 陷阱）
    if (firebaseEnabled && firebaseDb && email && currentItineraryId && currentItineraryId !== 'TRIP-EMPTY') {
      try {
        const fbPatch = {};
        fbPatch[feedbackEmailKey(email)] = entry;
        await firebaseDb.collection('micro_trips').doc(currentItineraryId)
                        .set({ feedback: fbPatch }, { merge: true });
      } catch (e) {
        console.warn('Persist feedback to Firebase failed:', e);
      }
    }

    window.closeTripFeedback();
    feedbackToast('💚 感謝你的回饋！', 'green');
  };

  function renderTripFeedbackModal(isEdit) {
    let overlay = document.getElementById('tripfb-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'tripfb-overlay';
      overlay.className = 'tripfb-overlay';
      // 點擊遮罩空白處關閉
      overlay.addEventListener('click', (e) => { if (e.target === overlay) window.closeTripFeedback(); });
      document.body.appendChild(overlay);
    }
    const { visitedCount, totalStops } = computeVisitedSummary();
    const title = currentTripTitle || '這趟旅程';
    // 單一景點評分清單（不含起訖點）；用索引對應名稱，避免景點名帶引號時 onclick 壞掉
    tripFeedbackStopNames = (replanStops || [])
      .filter(s => s && s.type !== 'start' && s.type !== 'end' && s.name)
      .map(s => s.name);
    const starsRow = (field, val) => `
      <div class="tripfb-stars" id="tripfb-stars-${field}">
        ${[1,2,3,4,5].map(i => `<button type="button" class="tripfb-star ${i <= val ? 'on' : ''}" onclick="setFeedbackStar('${field}',${i})">★</button>`).join('')}
      </div>`;
    const canSubmit = tripFeedbackDraft.tripRating > 0 && tripFeedbackDraft.aiAccuracy > 0;
    overlay.innerHTML = `
      <div class="tripfb-card" role="dialog" aria-modal="true">
        <div class="tripfb-title">為「${escapeFeedbackText(title)}」評分</div>
        <div class="tripfb-sub">${isEdit ? '你已評分過，可修改後重新送出。' : '你的回饋會幫助我們讓 AI 行程更準確。'}</div>

        <div class="tripfb-field">
          <div class="tripfb-label">行程整體評分</div>
          ${starsRow('tripRating', tripFeedbackDraft.tripRating)}
        </div>

        <div class="tripfb-field">
          <div class="tripfb-label">AI 準確度<span class="tripfb-hint">行程是否合理、符合你的需求</span></div>
          ${starsRow('aiAccuracy', tripFeedbackDraft.aiAccuracy)}
          <div class="tripfb-scalehint"><span>很不準</span><span>非常準</span></div>
        </div>

        ${tripFeedbackStopNames.length ? `
        <div class="tripfb-field">
          <div class="tripfb-label">各景點評分<span class="tripfb-hint">選填，再點同一顆星可取消</span></div>
          ${tripFeedbackStopNames.map((n, idx) => {
            const v = tripFeedbackDraft.stopRatings[n] || 0;
            return `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:4px;">
              <span style="font-size:13px;color:#2b4c6b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeFeedbackText(n)}</span>
              <div class="tripfb-stars" id="tripfb-stopstars-${idx}" style="flex-shrink:0;">
                ${[1,2,3,4,5].map(i => `<button type="button" class="tripfb-star ${i <= v ? 'on' : ''}" style="font-size:17px;" onclick="setStopFeedbackStar(${idx},${i})">★</button>`).join('')}
              </div>
            </div>`;
          }).join('')}
        </div>` : ''}

        <div class="tripfb-field">
          <div class="tripfb-label">想法與建議<span class="tripfb-hint">選填</span></div>
          <textarea class="tripfb-textarea" id="tripfb-comment" maxlength="500" placeholder="例如：路線很順，但某站營業時間有誤差…">${escapeFeedbackText(tripFeedbackDraft.comment)}</textarea>
        </div>

        <div class="tripfb-summary">📍 本趟已到訪 ${visitedCount} / ${totalStops} 個景點</div>

        <div id="tripfb-others"></div>

        <div class="tripfb-actions">
          <button type="button" class="tripfb-btn ghost" onclick="closeTripFeedback()">稍後</button>
          <button type="button" class="tripfb-btn primary" id="tripfb-submit" ${canSubmit ? '' : 'disabled'} onclick="submitTripFeedback()">送出回饋</button>
        </div>
      </div>`;
    loadOthersFeedback(); // 非同步載入「大家的回饋」（個人行程＝自己的；共編行程＝所有成員的）
  }

  // 讀取此行程已收到的回饋（micro_trips/{id}.feedback map）並顯示在評分視窗內。
  // 共編行程的成員都讀得到（安全規則的成員讀取權），所以旅伴互相看得到彼此的評分與留言。
  async function loadOthersFeedback() {
    const host = document.getElementById('tripfb-others');
    if (!host) return;
    if (!(firebaseEnabled && firebaseDb && currentItineraryId && currentItineraryId !== 'TRIP-EMPTY')) { host.innerHTML = ''; return; }
    host.innerHTML = '<div class="tripfb-sub" style="margin-top:14px">載入大家的回饋中…</div>';
    try {
      const doc = await firebaseDb.collection('micro_trips').doc(currentItineraryId).get();
      const fb = (doc.exists && doc.data().feedback) || {};
      const entries = Object.values(fb).filter(Boolean).sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0));
      if (!entries.length) {
        host.innerHTML = '<div class="tripfb-sub" style="margin-top:14px">🗣 這份行程還沒有任何回饋，送出第一則吧！</div>';
        return;
      }
      const star = (n) => '★'.repeat(Math.max(0, Math.min(5, n || 0))) + '☆'.repeat(Math.max(0, 5 - (n || 0)));
      host.innerHTML = `<div class="tripfb-label" style="margin-top:14px">🗣 大家的回饋（${entries.length}）</div>`
        + entries.map((e) => `
          <div style="border:1px solid #e3ecf5;border-radius:10px;padding:8px 10px;margin-top:6px;font-size:13px;">
            <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;">
              <b>${escapeFeedbackText(e.name || e.email || '旅伴')}</b>
              <span style="color:#e8a33d;letter-spacing:1px;">${star(e.tripRating)}</span>
            </div>
            <div style="color:#8fa4b8;font-size:12px;">AI 準確度 ${star(e.aiAccuracy)}${Number.isFinite(e.visitedCount) ? ` · 到訪 ${e.visitedCount}/${e.totalStops} 站` : ''}</div>
            ${e.stopRatings && Object.keys(e.stopRatings).length ? `<div style="margin-top:3px;color:#5f7d99;font-size:12px;">${Object.entries(e.stopRatings).map(([n, r]) => `${escapeFeedbackText(n)} <span style="color:#e8a33d;">${star(r)}</span>`).join('　')}</div>` : ''}
            ${e.comment ? `<div style="margin-top:4px;color:#2b4c6b;white-space:pre-wrap;">${escapeFeedbackText(e.comment)}</div>` : ''}
          </div>`).join('');
    } catch (e) {
      host.innerHTML = '<div class="tripfb-sub" style="margin-top:14px;color:#9aa5b1;">（無法載入其他回饋）</div>';
    }
  }

  function escapeFeedbackText(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function showVisitedToast(msg) {
    let el = document.getElementById('visited-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'visited-toast';
      el.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#333;color:#fff;padding:8px 18px;border-radius:20px;font-size:13px;z-index:9999;pointer-events:none;transition:opacity 0.3s;white-space:nowrap;';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.opacity = '1';
    clearTimeout(el._timer);
    el._timer = setTimeout(() => { el.style.opacity = '0'; }, 2200);
  }

  function refreshStopVisitedButtons() {
    document.querySelectorAll('.visited-toggle-btn').forEach(btn => {
      const stopId = btn.dataset.stopId;
      const stop = replanStops.find(s => s.id === stopId);
      if (!stop) return;
      const v = isPlaceVisited(stop.name);
      btn.textContent = v ? '✓ 已去過' : '📌 去過了';
      btn.classList.toggle('visited', v);
    });
  }

  function renderTravelLog() {
    const places = getVisitedPlaces();
    const countEl = document.getElementById('travellog-count');
    const listEl = document.getElementById('travellog-list');
    const emptyEl = document.getElementById('travellog-empty');
    if (!listEl) return;

    if (countEl) countEl.textContent = `${places.length} 個景點`;

    if (places.length === 0) {
      listEl.innerHTML = '';
      if (emptyEl) emptyEl.style.display = '';
      return;
    }
    if (emptyEl) emptyEl.style.display = 'none';

    const byRegion = {};
    places.forEach(p => {
      const r = p.region || '其他';
      (byRegion[r] = byRegion[r] || []).push(p);
    });

    listEl.innerHTML = Object.entries(byRegion).map(([region, spots]) => `
      <div class="travellog-region">
        <div class="travellog-region-title">📍 ${escapeHtml(region)}（${spots.length} 個景點）</div>
        <div class="travellog-spots">
          ${spots.map(s => {
            // 紀錄欄位可能來自共編/AI 站名，全部 escapeHtml 後才進 innerHTML。
            // 進 onclick 的 JS 字串要「先 JS 跳脫再 escapeHtml」：屬性值的 HTML 實體會先被
            // 瀏覽器解碼，只做 escapeHtml 的單引號解碼後仍會破壞 JS 字面量。
            const nameEsc = escapeHtml(s.name);
            const nameJs = escapeHtml(String(s.name || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'"));
            const photos = Array.isArray(s.photos) ? s.photos.filter(p => p && p.url) : [];
            // downloadURL 帶 &token=，進 attribute 一定要 escapeHtml
            const photoRow = `
              <div class="travellog-photo-row">
                ${photos.map(p => `
                  <div class="travellog-photo-thumb">
                    <img src="${escapeHtml(p.url)}" alt="" loading="lazy" onclick="openImageLightbox(this.src)">
                    <button class="travellog-photo-del" onclick="deleteTripPhoto('${nameJs}', ${Number(p.ts) || 0})">✕</button>
                  </div>
                `).join('')}
                <button class="travellog-photo-add" onclick="addPhotoForVisitedPlace('${nameJs}')" title="新增照片">📷</button>
              </div>`;
            return `
            <div class="travellog-spot-card">
              <div class="travellog-spot-main">
                <span class="travellog-spot-emoji">${escapeHtml(s.emoji || '📍')}</span>
                <div class="travellog-spot-info">
                  <span class="travellog-spot-name">${nameEsc}</span>
                  <span class="travellog-spot-meta">${escapeHtml(s.visitDate || '')}${s.tripTitle ? ' · ' + escapeHtml(s.tripTitle) : ''}${s.gpsVerified === true ? ' <span class="travellog-gps-badge">📍 GPS</span>' : ''}</span>
                </div>
                <button class="travellog-remove-btn" onclick="removeVisitedPlaceByName('${nameJs}')">✕</button>
              </div>
              ${photoRow}
            </div>`;
          }).join('')}
        </div>
      </div>
    `).join('');

    renderCollageBar();
  }

  function removeVisitedPlaceByName(name) {
    const all = getVisitedPlaces();
    // 被移除紀錄的照片一併清 Storage（失敗靜默）
    if (typeof firebaseStorage !== 'undefined' && firebaseStorage) {
      all.filter(p => p.name === name && Array.isArray(p.photos))
        .forEach(p => p.photos.forEach(ph => { if (ph && ph.path) firebaseStorage.ref(ph.path).delete().catch(() => {}); }));
    }
    const places = all.filter(p => p.name !== name);
    saveVisitedPlaces(places); // 走統一出口，順修此處原本不同步 Firestore 的缺口
    renderTravelLog();
    refreshStopVisitedButtons();
    showVisitedToast(`${name} 已從旅遊紀錄移除`);
  }

  function toggleStopQuickActions(stopId) {
    const willClose = activeStopMenuId === stopId;
    activeStopMenuId = willClose ? null : stopId;
    if (willClose && modifyTargetStopId === stopId) {
      closeModifyWindow();
    }
    renderReplanBoard();
  }

  function addStopFromBottom() {
    const nextTemplate = quickAddPool[replanStopSerial % quickAddPool.length];
    insertUniqueTemplateStop(nextTemplate, activeStopMenuId || null);
  }

  function deleteStopFromBottom() {
    if (activeStopMenuId) {
      removeStopById(activeStopMenuId);
      return;
    }
    if (replanStops.length <= 1) {
      window.alert('至少需要保留一個景點。');
      return;
    }
    const removed = replanStops.pop();
    if (removed && removed.id === activeStopMenuId) {
      activeStopMenuId = null;
    }
    renderReplanBoard();
    refreshRouteDirections();
  }

  function addAiSuggestionStop() {
    const suggestionTemplate = aiSuggestionPool[replanStopSerial % aiSuggestionPool.length];
    insertUniqueTemplateStop(suggestionTemplate, activeStopMenuId || null);
  }

  function adjustOverlappingStops(changedStopId) {
    const changedIndex = replanStops.findIndex(stop => stop.id === changedStopId);
    if (changedIndex < 0) return;
    
    const changedStop = replanStops[changedIndex];
    let currentEndTime = changedStop.manualEndMin;
    
    // 檢查並調整所有後續停靠點
    for (let i = changedIndex + 1; i < replanStops.length; i++) {
      const nextStop = replanStops[i];
      const nextStartTime = nextStop.manualStartMin;
      
      // 如果下一個停靠點的開始時間早於或等於當前結束時間，則發生重疊
      if (nextStartTime <= currentEndTime) {
        // 計算延遲的時間量（至少延遲5分鐘）
        const overlap = currentEndTime - nextStartTime + 5;
        const newStartTime = nextStartTime + overlap;
        
        // 更新下一個停靠點的開始時間
        nextStop.manualStartMin = newStartTime;
        
        // 如果有手動設置的結束時間，也需要相應調整
        if (Number.isFinite(nextStop.manualEndMin)) {
          const duration = nextStop.manualEndMin - nextStartTime;
          nextStop.manualEndMin = newStartTime + duration;
        }
        
        // 更新當前結束時間為這個停靠點的新結束時間
        currentEndTime = nextStop.manualEndMin || (newStartTime + nextStop.stayMin);
      } else {
        // 如果沒有重疊，更新當前結束時間並繼續檢查
        currentEndTime = nextStop.manualEndMin || (nextStartTime + nextStop.stayMin);
      }
    }
  }

  // 多人共作唯讀提示橫幅（viewer / 訪客）
  function showCollabReadOnlyBanner(role) {
    if (document.getElementById('collabRoBanner')) return;
    const bar = document.createElement('div');
    bar.id = 'collabRoBanner';
    bar.textContent = role === 'guest'
      ? '👁 訪客唯讀檢視：你可以瀏覽這份共編行程，但無法編輯或儲存。'
      : '👁 唯讀模式：你目前是「唯讀」角色，變更不會被儲存。請擁有者把你調為「可編輯」。';
    bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:#37506e;color:#fff;'
      + 'font-size:13px;text-align:center;padding:8px 12px;line-height:1.5;box-shadow:0 2px 8px rgba(0,0,0,.18);';
    document.body.appendChild(bar);
    document.body.style.paddingTop = '38px';
  }

  // ── 共編行程即時同步（多人同看一份，別人改了立刻重繪）──
  // 訂閱 micro_trips/{id}：收到遠端 stops 變更時，用「已存的驗證座標」輕量重建 replanStops
  // 並重繪行程/看板/地圖，不重跑 Places 驗證管線。自己寫入的回音靠「內容簽名比對」跳過。
  let collabLiveUnsub = null;
  let collabLivePendingData = null;
  let collabLiveRetryTimer = null;

  // 行程內容簽名：涵蓋順序/站名/停留/交通/手動時間/打卡時間，用來判斷遠端資料是否與本地相同（＝自己的回音）
  function collabStopsSignature(stops) {
    return JSON.stringify((stops || []).map((s) => [
      s.name || '', s.type || '',
      Math.round(Number(s.stayMin) || 0),
      s.transitMode || '', Math.round(Number(s.transitMin) || 0),
      s.manualStartMin ?? null, s.manualEndMin ?? null,
      s.checkedInAt ?? null
    ]));
  }

  // 由 Firestore 存檔的 stops 輕量重建本地 stop 物件（座標一律用存檔值，不再查 Places）
  function buildStopsFromCollabSnapshot(stops) {
    const now = Date.now();
    return (stops || []).map((s, idx) => {
      const pos = readCoordinateObject(s._lockedCoordinates)
        || readCoordinateObject(s.scenicCoordinates)
        || readCoordinateObject(s);
      return {
        id: `stop-live-${now}-${idx}`,
        emoji: s.emoji || '📍',
        name: s.name || '景點',
        type: s.type || null,
        stayMin: resolveStopStayMin(s, 30),
        transitMin: normalizeTransitMinutesValue(s.transitMin),
        transitMode: normalizeTransitMode(s.transitMode),
        mapPinId: s.mapPinId || null,
        scenicCoordinates: s.scenicCoordinates || pos || null,
        _lockedCoordinates: s._lockedCoordinates || null,
        placeId: s.placeId || null,
        businessHours: s.businessHours || null,
        coordVerified: s.coordVerified || false,
        desc: s.desc || '',
        manualStartMin: s.manualStartMin ?? null,
        manualEndMin: s.manualEndMin ?? null,
        isMergedAttraction: s.isMergedAttraction || false,
        mergedSubSpots: s.mergedSubSpots || null,
        mergedRadiusMeters: s.mergedRadiusMeters || null,
        mergedMemberCoords: s.mergedMemberCoords || null,
        lat: pos ? Number(pos.lat) : (Number.isFinite(Number(s.lat)) ? Number(s.lat) : null),
        lng: pos ? Number(pos.lng) : (Number.isFinite(Number(s.lng)) ? Number(s.lng) : null),
        nearbyToiletLocations: s.nearbyToiletLocations || [],
        checkedInAt: s.checkedInAt || null,
        isOutdoor: s.isOutdoor || false,
        altNearby: s.altNearby || null,
        __appExtras: extractAppStopExtras(s) // App 端欄位（time/order/stopId…）存檔時鋪回
      };
    });
  }

  function applyCollabRemoteUpdate(data) {
    // 使用者正在拖曳/修改視窗開著/本地變更還沒存回 → 先擱置，稍後再套用（避免蓋掉手上的操作）
    if (draggingStopId || isModifyWindowOpen || persistTripDebounceTimer) {
      collabLivePendingData = data;
      clearTimeout(collabLiveRetryTimer);
      collabLiveRetryTimer = setTimeout(() => {
        const pending = collabLivePendingData;
        collabLivePendingData = null;
        if (pending) applyCollabRemoteUpdate(pending);
      }, 2000);
      return;
    }
    collabLivePendingData = null;

    // 標題／成員資訊即時更新（角色被擁有者調整時，唯讀狀態跟著切換）
    let hasStatusOrIndexChange = false;
    if (data.status && data.status !== currentTripStatus) {
      currentTripStatus = data.status;
      updateLocalTripField(currentItineraryId, 'status', currentTripStatus);
      hasStatusOrIndexChange = true;
    }
    if (data.currentStopIndex !== undefined && data.currentStopIndex !== currentStopIndex) {
      currentStopIndex = data.currentStopIndex;
      updateLocalTripField(currentItineraryId, 'currentStopIndex', currentStopIndex);
      hasStatusOrIndexChange = true;
    }
    if (data.startedAt !== undefined && data.startedAt !== currentTripStartedAt) {
      currentTripStartedAt = data.startedAt;
      updateLocalTripField(currentItineraryId, 'startedAt', currentTripStartedAt);
    }

    if (data.title && data.title !== currentTripTitle) {
      currentTripTitle = data.title;
    }

    // Always update hero title status badge if title or status changed
    const heroTitleEl = document.querySelector('#view-itinerary .hero-title');
    if (heroTitleEl) {
      let statusSuffix = '';
      if (currentTripStatus === 'ongoing') {
        statusSuffix = ' <span class="hero-status-badge ongoing">⚡ 進行中</span>';
      } else if (currentTripStatus === 'completed') {
        statusSuffix = ' <span class="hero-status-badge completed">🎉 已完成</span>';
      }
      heroTitleEl.innerHTML = escapeHtml(currentTripTitle) + statusSuffix;
    }

    if (data.members) {
      currentTripMembers = data.members;
      if (collabRole !== 'guest') {
        let myEmail = '';
        try { const u = JSON.parse(localStorage.getItem('wai_user') || '{}'); myEmail = (u && u.currentUser && u.currentUser.email) || ''; } catch (_e) {}
        const ekey = String(myEmail || '').toLowerCase().replace(/[^a-z0-9]/g, '_');
        const mem = data.members[ekey];
        const newRole = (mem && mem.role) || 'viewer';
        if (newRole !== collabRole) {
          collabRole = newRole;
          const wasReadOnly = collabReadOnly;
          collabReadOnly = !(newRole === 'owner' || newRole === 'editor');
          const banner = document.getElementById('collabRoBanner');
          if (!collabReadOnly && banner) { banner.remove(); document.body.style.paddingTop = ''; }
          if (collabReadOnly && !banner) showCollabReadOnlyBanner(newRole);
          if (wasReadOnly !== collabReadOnly && isReplanning) renderReplanBoard();
        }
      }
      const membersView = document.getElementById('view-members');
      if (membersView && membersView.classList.contains('active')) renderMembersView();
    }

    // stops 相同（多半是自己寫入的回音）就不重繪
    if (!Array.isArray(data.stops) || !data.stops.length) return;
    if (collabStopsSignature(data.stops) === collabStopsSignature(replanStops)) {
      if (hasStatusOrIndexChange) {
        renderItineraryDisplay();
        updateItineraryStageUI();
      }
      return;
    }

    replanStops = buildStopsFromCollabSnapshot(data.stops);
    activeStopMenuId = null;
    renderItineraryDisplay();
    if (isReplanning) renderReplanBoard();
    syncMapToCurrentTrip().catch(() => {});
    const budgetView = document.getElementById('view-budget');
    if (budgetView && budgetView.classList.contains('active')) renderBudgetTracker();
    const who = data.lastEditedByName || data.lastEditedBy || '旅伴';
    showVisitedToast(`🧑‍🤝‍🧑 ${who} 更新了行程，已同步最新內容`);
  }

  function startCollabTripLiveSync(tripId) {
    if (!tripId || !firebaseEnabled || !firebaseDb) return;
    if (collabLiveUnsub) { collabLiveUnsub(); collabLiveUnsub = null; }
    let isFirstSnapshot = true;
    collabLiveUnsub = firebaseDb.collection('micro_trips').doc(tripId).onSnapshot((snap) => {
      // 第一個快照＝訂閱當下的初始狀態，initFromUrl 正在（或已經）用它跑完整載入管線；
      // 這裡若套用會用「未後處理的原始 stops」蓋掉合併/校正後的結果，故跳過。
      if (isFirstSnapshot) { isFirstSnapshot = false; return; }
      if (snap.metadata && snap.metadata.hasPendingWrites) return; // 自己的本地寫入，等 commit
      if (!snap.exists) {
        showVisitedToast('⚠️ 這份共編行程已被擁有者刪除');
        return;
      }
      applyCollabRemoteUpdate(snap.data() || {});
    }, (err) => console.warn('共編即時同步中斷：', err));
  }

  async function persistCurrentTripStops() {
    if (collabReadOnly) return; // 唯讀成員／訪客的變更不寫回共用行程

    if (!currentItineraryId || currentItineraryId === 'TRIP-EMPTY') return;
    tripUserDirty = true; // 走到這裡＝有互動觸發的存檔，之後的自動回填（如路線 transitMin）才允許跟著存

    const stopsSnapshot = replanStops.map((stop) => ({
      // App 端（Android）的欄位（time/order/stopId…）先鋪回，整包覆寫 stops 才不會剝掉他端資料；
      // 網頁 schema 欄位在後面覆寫，以網頁當前狀態為準。
      ...(stop.__appExtras || {}),
      name: stop.name,
      emoji: stop.emoji || '📍',
      type: stop.type || null,
      stayMin: stop.stayMin,
      // App 端停留欄位與 stayMin 同步寫（App 寫入時也是 duration＋stayMin 一起），
      // 兩端讀取（duration 優先）才會一致；否則網頁改停留後重載會被舊 duration 蓋回。
      duration: stop.stayMin ?? null,
      transitMin: stop.transitMin,
      transitMode: stop.transitMode,
      lat: stop.lat,
      lng: stop.lng,
      scenicCoordinates: stop.scenicCoordinates || null,
      _lockedCoordinates: stop._lockedCoordinates || null,
      nearbyToiletLocations: stop.nearbyToiletLocations || [],
      mapPinId: stop.mapPinId || null,
      manualStartMin: stop.manualStartMin ?? null,
      manualEndMin: stop.manualEndMin ?? null,
      placeId: stop.placeId || null,
      businessHours: stop.businessHours || null,
      coordVerified: stop.coordVerified || false, // 已驗證座標的旗標，存檔後下次載入跳過重驗
      // 景點介紹（乾淨 prose，不含「（含 …）」）一併保存，避免存檔重載後描述消失、只剩括號
      desc: stop.desc || '',
      // 合併大景點欄位一併保存，避免切換交通工具等觸發存檔後，重新載入時「🧩 含…」子景點資訊消失
      isMergedAttraction: stop.isMergedAttraction || false,
      mergedSubSpots: stop.mergedSubSpots || null,
      mergedRadiusMeters: stop.mergedRadiusMeters || null,
      mergedMemberCoords: stop.mergedMemberCoords || null,
      checkedInAt: stop.checkedInAt || null,
      isOutdoor: stop.isOutdoor || false,          // Plan B：室內/戶外標記
      altNearby: stop.altNearby || null            // Plan B：附近替代景點（查看替換用）
    }));

    // 全程主要交通工具偏好（計程車/機車/汽車）一併保存，重新載入後仍生效
    const vehiclePref = String(currentTripPreferences?.transportMode || '').toLowerCase();
    const hasVehiclePref = ['taxi', 'scooter', 'car'].includes(vehiclePref);

    // 保留 localStorage 中的完整 trip 物件，供 Firebase 首次建立時補齊頂層欄位
    let localTrip = null;
    try {
      const myTrips = JSON.parse(localStorage.getItem('wai_mytrips') || '[]');
      const tripIndex = myTrips.findIndex((t) => t.id === currentItineraryId);
      if (tripIndex >= 0) {
        const patch = { 
          ...myTrips[tripIndex], 
          stops: stopsSnapshot,
          status: currentTripStatus,
          currentStopIndex: currentStopIndex,
          startedAt: currentTripStartedAt
        };
        if (hasVehiclePref) {
          patch.wizardData = { ...(myTrips[tripIndex].wizardData || {}), transportMode: vehiclePref };
        }
        myTrips[tripIndex] = patch;
        localTrip = patch;
        localStorage.setItem('wai_mytrips', JSON.stringify(myTrips));
      }
    } catch (e) {
      console.warn('Failed to persist trip stops to localStorage:', e);
    }

    // 安全規則要求登入才能寫 micro_trips：未登入只存 localStorage（上方已存），
    // 不打 Firebase，避免每次編輯都噴 permission-denied。
    const _authed = typeof firebaseAuth !== 'undefined' && firebaseAuth && firebaseAuth.currentUser;
    if (firebaseEnabled && firebaseDb && _authed) {
      try {
        // 取得登入者 email（與生成頁一致），供 loadState 的 userEmail 查詢能撈到此行程
        let userEmail = '';
        try {
          const u = JSON.parse(localStorage.getItem('wai_user') || '{}');
          if (u && u.currentUser && u.currentUser.email) userEmail = u.currentUser.email;
        } catch (_e) {}

        // 用 set(merge) 取代 update()：文件不存在時自動建立（self-heal），存在時只合併傳入欄位。
        // 若是首次建立，帶入 localStorage trip 的頂層核心欄位（id/title/region/wizardData/createdAt…），
        // 避免 Firebase 內留下殘缺文件，且確保 createdAt 存在讓 loadState 的 orderBy 查詢能撈到。
        // 共編結構欄位（成員/角色/擁有者/邀請/分享）由 collab.js 專管，改行程內容的 persist 不可寫回，
        // 否則會用本機過期副本 merge 蓋掉擁有者剛改的角色/成員（#10 加入者權限狀態）。
        const { __saving, members: _m, memberEmails: _me, ownerEmail: _oe, ownerUid: _ou, ownerName: _on,
          role: _role, guestReadable: _gr, shareToken: _stk, inviteCode: _ivc, maxMembers: _mmx,
          collabCreatedAt: _ccat, userEmail: _ue, ...cleanLocal } = localTrip || {};
        const fbPatch = localTrip
          ? { 
              ...cleanLocal, 
              stops: stopsSnapshot,
              status: currentTripStatus,
              currentStopIndex: currentStopIndex,
              startedAt: currentTripStartedAt
            }
          : { 
              id: currentItineraryId, 
              stops: stopsSnapshot,
              status: currentTripStatus,
              currentStopIndex: currentStopIndex,
              startedAt: currentTripStartedAt
            };
        // 只在拿到真實 email 時才寫，避免未登入時用空值覆蓋既有文件的正確 userEmail。
        // 共編行程不由 persist 改 userEmail：否則 editor 存檔會把擁有者 email 換成自己（連帶影響刪除權限）。
        if (userEmail && !currentTripIsCollab) fbPatch.userEmail = userEmail;
        fbPatch.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
        // 共編行程：標記這次變更是誰改的，讓其他成員的即時同步能顯示「XX 更新了行程」
        if (currentTripIsCollab && userEmail) {
          fbPatch.lastEditedBy = userEmail;
          try {
            const u2 = JSON.parse(localStorage.getItem('wai_user') || '{}');
            fbPatch.lastEditedByName = (u2 && u2.currentUser && u2.currentUser.name) || userEmail;
          } catch (_e) { fbPatch.lastEditedByName = userEmail; }
        }
        // set+merge 會把含 "." 的 key 當字面欄位名，故改用巢狀物件寫 wizardData.transportMode
        if (hasVehiclePref) {
          fbPatch.wizardData = { ...(fbPatch.wizardData || {}), transportMode: vehiclePref };
        }
        await firebaseDb.collection('micro_trips').doc(currentItineraryId).set(fbPatch, { merge: true });
      } catch (e) {
        console.warn('Failed to persist trip stops to Firebase:', e);
      }
    }
  }

  function schedulePersistTrip() {
    tripUserDirty = true;
    clearTimeout(persistTripDebounceTimer);
    persistTripDebounceTimer = setTimeout(() => {
      persistTripDebounceTimer = null;
      clearTimeout(persistTripMaxWaitTimer);
      persistTripMaxWaitTimer = null;
      persistCurrentTripStops();
    }, 1500);
    if (!persistTripMaxWaitTimer) {
      persistTripMaxWaitTimer = setTimeout(() => {
        clearTimeout(persistTripDebounceTimer);
        persistTripDebounceTimer = null;
        persistTripMaxWaitTimer = null;
        persistCurrentTripStops();
      }, 5000);
    }
  }

  function setSegmentTransitMode(stopId, modeValue) {
    const stopIndex = replanStops.findIndex((item) => item.id === stopId);
    if (stopIndex === -1) return;
    const stop = replanStops[stopIndex];
    const nextMode = normalizeTransitMode(modeValue);
    stop.transitMode = nextMode;
    stop.transitMin = null;
    if (routeStageCache[stopIndex]) {
      routeStageCache[stopIndex].mode = nextMode;
      routeStageCache[stopIndex].distance = '';
      routeStageCache[stopIndex].duration = '';
      routeStageCache[stopIndex].timeRange = '';
    }
    renderItineraryDisplay();
    if (isReplanning) renderReplanBoard();
    refreshRouteDirections();
    schedulePersistTrip();
  }

  // 同步「全程主要交通工具」下拉的顯示值與可見性
  function syncTripPrimaryVehicleSelect() {
    const wrap = document.getElementById('tripPrimaryVehicleWrap');
    const sel = document.getElementById('tripPrimaryVehicleSelect');
    if (!wrap || !sel) return;
    const hasStops = Array.isArray(replanStops) && replanStops.length > 0;
    wrap.style.display = hasStops ? '' : 'none';
    sel.value = getPreferredVehicleMode();
  }

  // 一次切換全程主要交通工具：所有「車輛類」路段改用新工具，保留走路
  function setTripPrimaryVehicle(modeValue) {
    const valid = ['taxi', 'scooter', 'car'];
    const vehicle = valid.includes(String(modeValue || '').toLowerCase()) ? String(modeValue).toLowerCase() : 'car';
    currentTripPreferences = currentTripPreferences || {};
    currentTripPreferences.transportMode = vehicle;
    if (Array.isArray(replanStops)) {
      replanStops.forEach((stop, index) => {
        const cur = normalizeTransitMode(stop.transitMode);
        if (cur === 'taxi' || cur === 'scooter' || cur === 'car') {
          stop.transitMode = vehicle;
          stop.transitMin = null;
          if (routeStageCache[index]) {
            routeStageCache[index].mode = vehicle;
            routeStageCache[index].distance = '';
            routeStageCache[index].duration = '';
            routeStageCache[index].timeRange = '';
          }
        }
      });
    }
    renderItineraryDisplay();
    if (isReplanning) renderReplanBoard();
    refreshRouteDirections();
    schedulePersistTrip();
  }

  function getBusinessHoursWarning(stop) {
    const hours = String(stop.businessHours || '').trim();
    if (!hours || hours === '24小時') return '';
    const departureDate = currentTripPreferences?.departureDate;
    let checkLine = hours.split('\n')[0] || hours;
    if (departureDate) {
      const jsDay = new Date(departureDate + 'T00:00:00').getDay();
      const apiIndex = jsDay === 0 ? 6 : jsDay - 1;
      const lines = hours.split('\n');
      if (lines[apiIndex]) checkLine = lines[apiIndex];
      if (/休息|closed|不營業/i.test(checkLine)) return '⚠️ 當天公休';
    }
    const window = parseBusinessHoursWindow(checkLine);
    if (!window) return '';
    const { open, close } = window;
    const startMin = stop.start ?? 0;
    const endMin = stop.end ?? startMin + (stop.stayMin || 0);
    if (startMin >= close || endMin <= open) {
      return `⚠️ 可能在非營業時間（${minutesToClock(open)}–${minutesToClock(close)}）`;
    }
    return '';
  }

  function renderReplanBoard() {
    const listEl = document.getElementById('replanSortableList');
    const totalEl = document.getElementById('replanTotalWindow');
    if (!listEl) return;

    const schedule = buildReplanSchedule();
    if (totalEl) {
      totalEl.textContent = schedule.length
        ? `${minutesToClock(schedule[0].start)} - ${minutesToClock(schedule[schedule.length - 1].end)}`
        : '--';
    }
    updateMapTimeBanner(
      schedule.length ? minutesToClock(schedule[0].start) : '',
      schedule.length ? minutesToClock(schedule[schedule.length - 1].end) : '',
      schedule.length ? schedule[schedule.length - 1].end : null
    );
    if (schedule.length) {
      const heroTimeTag = document.querySelector('#view-itinerary .hero-meta .hero-tag');
      if (heroTimeTag) heroTimeTag.textContent = `⏱️ ${minutesToClock(schedule[0].start)} – ${minutesToClock(schedule[schedule.length - 1].end)}`;
    }

    if (!schedule.length) {
      listEl.innerHTML = `
        <div class="replan-card selected" style="cursor: default;">
          <div class="replan-handle">＋</div>
          <div class="replan-time">尚無資料</div>
          <div class="replan-spot">
            <div>
              <div class="replan-spot-name">目前沒有任何停靠點</div>
              <div class="replan-spot-meta">先匯入行程，或使用下方功能新增第一個停靠點。</div>
            </div>
            <div class="replan-emoji">🗺️</div>
          </div>
        </div>
      `;
      return;
    }

    if (schedule.length && totalEl) {
      totalEl.textContent = `${minutesToClock(schedule[0].start)} - ${minutesToClock(schedule[schedule.length - 1].end)}`;
    }

    listEl.innerHTML = schedule.map((stop) => `
      <div class="replan-card ${activeStopMenuId === stop.id ? 'selected' : ''}" draggable="${(collabReadOnly || stop.type === 'start' || stop.type === 'end' || (isModifyWindowOpen && modifyTargetStopId === stop.id)) ? 'false' : 'true'}" data-stop-id="${stop.id}">
        <div class="replan-handle">⋮⋮</div>
        <div class="replan-time">${minutesToClock(stop.start)} - ${minutesToClock(stop.end)}</div>
        <div class="replan-spot">
          <div>
            <div class="replan-spot-name">${stop.name}</div>
            ${stop.isMergedAttraction && stop.mergedSubSpots && stop.mergedSubSpots.length ? `<div class="merged-subspots-row" style="font-size:11px;color:var(--ink3);margin:2px 0;">🧩 含 ${stop.mergedSubSpots.join('、')}</div>` : ''}
            <div class="replan-spot-meta">停留 <select class="replan-duration-select" onclick="event.stopPropagation()" ondragstart="event.stopPropagation()" onchange="event.stopPropagation(); updateStopStayTime('${stop.id}', Number(this.value))">${getSuggestedStayDurations(stop).map(m => `<option value="${m}" ${(stop.stayMin ?? stop.computedStayMin) === m ? 'selected' : ''}>${m} 分鐘</option>`).join('')}</select>${stop.transit ? ` · 後續 <select class="replan-transit-select" onclick="event.stopPropagation()" ondragstart="event.stopPropagation()" onchange="event.stopPropagation(); setSegmentTransitMode('${stop.id}', this.value)">${(() => { const cur = normalizeTransitMode(stop.transitMode); const allowed = new Set(['walk', getPreferredVehicleMode(), cur]); return TRANSIT_MODE_OPTIONS.filter(mo => allowed.has(mo.value)).map(mo => `<option value="${mo.value}" ${cur === mo.value ? 'selected' : ''}>${mo.icon} ${mo.label}</option>`).join(''); })()}</select> ${getTransitDurationText(stop.transit)}` : ''}</div>
            ${(() => { const w = getBusinessHoursWarning(stop); return w ? `<div class="replan-hours-warn">${w}</div>` : ''; })()}
          </div>
          <div class="replan-emoji">${stop.emoji}</div>
        </div>
        <div class="replan-inline-actions ${activeStopMenuId === stop.id ? 'active' : ''}">
          ${collabReadOnly ? '' : `<button class="replan-inline-btn" onclick="event.stopPropagation(); modifyStopById('${stop.id}')">✎ 修改</button>
          <button class="replan-inline-btn delete" onclick="event.stopPropagation(); removeStopById('${stop.id}')">－ 刪除</button>`}
          <button class="replan-inline-btn visited-toggle-btn ${isPlaceVisited(stop.name) ? 'visited' : ''}" data-stop-id="${stop.id}" onclick="event.stopPropagation(); handleToggleVisited('${stop.id}', this)">${isPlaceVisited(stop.name) ? '✓ 已去過' : '📌 去過了'}</button>
        </div>
      </div>
    `).join('');

    listEl.querySelectorAll('.replan-card').forEach((card) => {
      card.addEventListener('click', (event) => {
        if (event.target.closest('.replan-inline-actions')) return;
        toggleStopQuickActions(card.dataset.stopId);
      });

      card.addEventListener('dragstart', (event) => {
        draggingStopId = card.dataset.stopId;
        card.classList.add('dragging');
        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('text/plain', draggingStopId);
        }
      });

      card.addEventListener('dragend', () => {
        draggingStopId = null;
        card.classList.remove('dragging');
        listEl.querySelectorAll('.replan-card').forEach((node) => node.classList.remove('drag-over'));
      });

      card.addEventListener('dragover', (event) => {
        event.preventDefault();
        if (card.dataset.stopId !== draggingStopId) {
          card.classList.add('drag-over');
        }
      });

      card.addEventListener('dragleave', () => {
        card.classList.remove('drag-over');
      });

      card.addEventListener('drop', (event) => {
        event.preventDefault();
        const targetId = card.dataset.stopId;
        reorderReplanStops(draggingStopId, targetId);
        renderReplanBoard();
      });
    });
  }

  function updateLocalTripField(tripId, field, value) {
    try {
      const myTrips = JSON.parse(localStorage.getItem('wai_mytrips') || '[]');
      const idx = myTrips.findIndex(t => t.id === tripId);
      if (idx >= 0) {
        myTrips[idx][field] = value;
        localStorage.setItem('wai_mytrips', JSON.stringify(myTrips));
      }
    } catch (e) {
      console.warn('Failed to update local trip field:', e);
    }
  }

  window.startTripProgress = function() {
    if (collabReadOnly) return feedbackToast('訪客或唯讀成員無法開始行程', 'orange');
    if (!currentItineraryId || currentItineraryId === 'TRIP-EMPTY') return feedbackToast('無效行程', 'orange');
    if (!window.confirm('要開始這趟行程嗎？開始後進入「進行中」逐站打卡模式；若需重新編輯可用「↩ 重設進度」退回規劃中。')) return;
    currentTripStatus = 'ongoing';
    currentStopIndex = 0;
    currentTripStartedAt = Date.now();

    updateLocalTripField(currentItineraryId, 'status', 'ongoing');
    updateLocalTripField(currentItineraryId, 'currentStopIndex', 0);
    updateLocalTripField(currentItineraryId, 'startedAt', currentTripStartedAt);

    if (typeof logTripEvent === 'function') {
      logTripEvent('trip_started');
    }

    feedbackToast('🎬 行程已開始！開啟進行中模式', 'green');
    
    // Update hero title immediately
    const heroTitleEl = document.querySelector('#view-itinerary .hero-title');
    if (heroTitleEl) {
      heroTitleEl.innerHTML = escapeHtml(currentTripTitle) + ' <span class="hero-status-badge ongoing">⚡ 進行中</span>';
    }

    persistCurrentTripStops(); 
    renderItineraryDisplay();
    updateItineraryStageUI();
  };

  // GPS 等待期間（最長 8 秒）防重複點擊
  let checkInInFlight = false;

  window.checkInCurrentStop = async function(stopId, event) {
    if (event) event.stopPropagation();
    if (collabReadOnly) return feedbackToast('訪客或唯讀成員無法打卡', 'orange');
    if (checkInInFlight) return;
    const stopIdx = replanStops.findIndex(s => s.id === stopId);
    if (stopIdx === -1 || stopIdx !== currentStopIndex) return;
    const stop = replanStops[stopIdx];
    const isEndpoint = stop.type === 'start' || stop.type === 'end';

    // GPS 驗證：站點有座標才驗；拒絕權限/逾時/不支援一律照舊手動打卡（不擋人）。
    const target = getStopLatLng(stop);
    let gpsVerified = null; // true=GPS 驗證到場、false=超距強制打卡、null=無法定位（手動）
    if (target) {
      checkInInFlight = true;
      try {
        feedbackToast('📡 正在確認你的位置…', 'blue');
        const pos = await getCurrentPositionOnce(8000);
        // await 期間狀態可能被改（共編遠端打卡/重設）→ 重新驗證後再繼續
        if (replanStops.findIndex(s => s.id === stopId) !== currentStopIndex) return;
        if (pos.ok) {
          const dist = measureDistanceMeters(pos, target);
          // 低精度定位放寬門檻，避免 GPS 飄移冤枉真的到場的使用者
          const threshold = 300 + Math.min(pos.accuracy || 0, 400);
          if (dist <= threshold) {
            gpsVerified = true;
          } else {
            const go = window.confirm(`📍 你距離 ${stop.name} 還有 ${formatDistanceZh(dist)}，確定要打卡嗎？`);
            if (!go) return;
            // confirm 阻塞期間共編遠端可能已改狀態（排隊的 snapshot callback 在關閉後執行）→ 再驗一次
            if (replanStops.findIndex(s => s.id === stopId) !== currentStopIndex) return;
            gpsVerified = false;
          }
        } else if (pos.reason === 'denied') {
          feedbackToast('📡 未取得定位權限，已為你手動打卡', 'blue');
        } else if (pos.reason === 'timeout' || pos.reason === 'unavailable') {
          feedbackToast('📡 定位逾時，已為你手動打卡', 'blue');
        } // unsupported → 靜默手動
      } finally {
        checkInInFlight = false;
      }
    }

    completeCheckIn(stop, isEndpoint, gpsVerified);
  };

  function completeCheckIn(stop, isEndpoint, gpsVerified) {
    stop.checkedInAt = Date.now();
    // 打卡只「加入」造訪清單，不可用 toggle（景點若先前已造訪，toggleVisitedPlace 會反向移除）；起訖點不計入造訪紀錄
    if (!isEndpoint && !isPlaceVisited(stop.name)) {
      toggleVisitedPlace(stop, { gpsVerified });
    }

    const checkinMsg = stop.type === 'start' ? `🚗 已從 ${stop.name} 出發！`
      : stop.type === 'end' ? `🏁 抵達 ${stop.name}，行程完成！`
      : gpsVerified === true ? `✅ ${stop.name} GPS 打卡成功！`
      : `✅ ${stop.name} 到達打卡成功！`;
    feedbackToast(checkinMsg, 'green');
    // 到達景點後提醒拍照（起訖點不提醒）；延遲讓打卡 toast 先顯示完
    if (!isEndpoint) {
      const stopName = stop.name;
      setTimeout(() => showPhotoPromptSnackbar(stopName), 2400);
    }

    if (currentStopIndex === replanStops.length - 1) {
      window.markTripAsCompleted();
    } else {
      currentStopIndex++;
      updateLocalTripField(currentItineraryId, 'currentStopIndex', currentStopIndex);
      persistCurrentTripStops();
      renderItineraryDisplay();
      updateItineraryStageUI();
      syncMapToCurrentTrip().catch(() => {});
    }
  }

  // 把行程退回「規劃中」：清掉打卡進度，讓誤按「開始行程」或已完成的行程可重新編輯
  window.resetTripProgress = function() {
    if (collabReadOnly) return feedbackToast('訪客或唯讀成員無法重設行程', 'orange');
    if (currentTripStatus === 'planning') return;
    if (!window.confirm('要把行程重設回「規劃中」嗎？將清除所有打卡進度。')) return;

    currentTripStatus = 'planning';
    currentStopIndex = -1;
    currentTripStartedAt = null;
    (replanStops || []).forEach(s => { s.checkedInAt = null; });

    updateLocalTripField(currentItineraryId, 'status', 'planning');
    updateLocalTripField(currentItineraryId, 'currentStopIndex', -1);
    updateLocalTripField(currentItineraryId, 'startedAt', null);

    const heroTitleEl = document.querySelector('#view-itinerary .hero-title');
    if (heroTitleEl) heroTitleEl.innerHTML = escapeHtml(currentTripTitle);

    feedbackToast('↩ 已重設為規劃中', 'blue');
    persistCurrentTripStops();
    renderItineraryDisplay();
    updateItineraryStageUI();
  };

  function updateItineraryStageUI() {
    const plannedBlock = document.getElementById('itineraryPlannedBlock');
    const planningBlock = document.getElementById('itineraryPlanningBlock');
    const startBtn = document.getElementById('replanStartBtn');
    const editBtn = document.getElementById('replanEditOrderBtn');
    const applyBtn = document.getElementById('replanApplyBtn');
    const cancelBtn = document.getElementById('replanCancelBtn');
    const startTripBtn = document.getElementById('replanStartTripBtn');
    const completeTripBtn = document.getElementById('replanCompleteTripBtn');
    const resetTripBtn = document.getElementById('replanResetTripBtn');

    if (plannedBlock) {
      plannedBlock.style.display = isReplanning ? 'none' : '';
    }
    if (planningBlock) {
      planningBlock.classList.toggle('active', isReplanning);
    }

    if (isReplanning) {
      renderReplanBoard();
    }

    const showEditActions = !collabReadOnly && !isReplanning;
    // 規劃中或已完成都可重新規劃／調整順序；只有「進行中」鎖住編輯（專心執行）
    const canEditOrder = showEditActions && currentTripStatus !== 'ongoing';
    if (startBtn) startBtn.style.display = canEditOrder ? '' : 'none';
    if (editBtn) editBtn.style.display = canEditOrder ? '' : 'none';
    if (applyBtn) applyBtn.style.display = (isReplanning && !collabReadOnly) ? '' : 'none';
    if (cancelBtn) cancelBtn.style.display = isReplanning ? '' : 'none';

    if (startTripBtn) {
      startTripBtn.style.display = (showEditActions && currentTripStatus === 'planning') ? '' : 'none';
    }
    if (completeTripBtn) {
      completeTripBtn.style.display = (showEditActions && currentTripStatus === 'ongoing') ? '' : 'none';
    }
    if (resetTripBtn) {
      // 進行中或已完成時提供「退回規劃中」的出口
      resetTripBtn.style.display = (showEditActions && currentTripStatus !== 'planning') ? '' : 'none';
    }
  }

  function getSuggestedStayDurations(stop) {
    const current = Number.isFinite(stop.stayMin) ? stop.stayMin : (Number.isFinite(stop.computedStayMin) ? stop.computedStayMin : 30);
    const presets = current <= 20 ? [15, 20, 30, 45]
      : current <= 30 ? [20, 30, 45, 60]
      : current <= 45 ? [30, 45, 60, 75]
      : [45, 60, 75, 90];
    const options = new Set(presets);
    options.add(current);
    return Array.from(options).sort((a, b) => a - b);
  }

  function openStayTimeAdjuster(stopId) {
    const stop = replanStops.find(s => s.id === stopId);
    if (!stop) return;
    document.getElementById('stayModalTitle').textContent = '⏱ 調整停留時間';
    document.getElementById('stayModalSub').textContent = stop.name || '';
    const grid = document.getElementById('stayModalGrid');
    grid.innerHTML = '';
    [15,30,45,60,90,120,150,180].forEach(m => {
      const btn = document.createElement('button');
      btn.className = 'stay-opt-btn' + (stop.stayMin === m ? ' active' : '');
      btn.textContent = m < 60 ? m + '分' : (m % 60 === 0 ? (m/60) + '小時' : Math.floor(m/60) + '時' + (m%60) + '分');
      btn.onclick = function() { updateStopStayTime(stopId, m); closeStayModal(); };
      grid.appendChild(btn);
    });
    document.getElementById('stayModal').style.display = 'flex';
  }
  function closeStayModal() {
    document.getElementById('stayModal').style.display = 'none';
  }

  function updateStopStayTime(stopId, minutes) {
    const stop = replanStops.find(item => item.id === stopId);
    if (!stop || !Number.isFinite(minutes) || minutes < 5) return;
    stop.stayMin = minutes;
    if (Number.isFinite(stop.manualStartMin)) {
      stop.manualEndMin = stop.manualStartMin + minutes;
    } else if (Number.isFinite(stop.manualEndMin)) {
      stop.manualEndMin = undefined;
    }
    renderItineraryDisplay();
    if (isReplanning) renderReplanBoard();
    refreshRouteDirections();
    schedulePersistTrip();
  }

  function enterReplanMode() {
    isReplanning = true;
    activeStopMenuId = null;
    closeModifyWindow();
    switchView('itinerary');
    stopVoiceGuide();
    updateItineraryStageUI();
  }

  function renderItineraryDisplay() {
    const plannedBlock = document.getElementById('itineraryPlannedBlock');
    if (!plannedBlock) return;

    syncTripPrimaryVehicleSelect();

    const schedule = buildReplanSchedule();
    if (!schedule || schedule.length === 0) {
      plannedBlock.innerHTML = `
        <div class="voice-guide-card">
          <div class="voice-guide-meta">
            <div class="voice-guide-title">🗺️ 尚未載入行程</div>
            <div class="voice-guide-sub" id="voiceGuideStatus">匯入網址、加入邀請碼，或進入重新規劃後新增第一個停靠點。</div>
          </div>
          <div class="voice-guide-actions">
            <button class="voice-btn play" onclick="openTravelTools('import')">匯入行程</button>
            <button class="voice-btn stop" onclick="enterReplanMode()">新增停靠點</button>
          </div>
        </div>
      `;
      return;
    }

    const endTime = schedule[schedule.length - 1].end;
    const startTime = schedule[0].start;
    const durationMin = endTime - startTime;
    const durationHours = Math.floor(durationMin / 60);
    const durationMins = durationMin % 60;
    updateMapTimeBanner(minutesToClock(startTime), minutesToClock(endTime), endTime);
    const heroTimeTag = document.querySelector('#view-itinerary .hero-meta .hero-tag');
    if (heroTimeTag) heroTimeTag.textContent = `⏱️ ${minutesToClock(startTime)} – ${minutesToClock(endTime)}`;

    // 本地門票對照表（依目前行程目的地），供卡片顯示真實票價。
    const feeDestination = currentTripRegion || (currentTripPreferences && (currentTripPreferences.dest || currentTripPreferences.destCustom)) || '';
    const itineraryFeeMap = getLocalPoiFeeMap(feeDestination);
    const itineraryFoodCostMap = getLocalFoodCostMap(feeDestination);

    // 生成标签映射
    const tagMap = {
      'luggage': { text: '起點', style: '' },
      'cafe': { text: '放鬆休息', style: 'background:var(--accent2-light);color:var(--accent2-dark)' },
      'shop': { text: '散步', style: '' },
      'return': { text: '行程收尾', style: 'background:var(--accent2-light);color:var(--accent2-dark)' }
    };

    let html = `
      <div class="voice-guide-card">
        <div class="voice-guide-meta">
          <div class="voice-guide-title">🎧 語音導遊</div>
          <div class="voice-guide-sub" id="voiceGuideStatus">點擊播放，沿著目前行程為你導覽。</div>
        </div>
        <div class="voice-guide-actions">
          <button class="voice-btn play" onclick="playVoiceGuide()">播放導覽</button>
          <button class="voice-btn stop" onclick="stopVoiceGuide()">停止</button>
        </div>
      </div>
      <div style="font-size: 16px; font-weight: 700; color: var(--ink); margin-bottom: 12px; display: flex; align-items: center; gap: 8px;"><span>⏱</span> ${minutesToClock(startTime)} – ${minutesToClock(endTime)}・共 ${durationHours} 小時${durationMins > 0 ? durationMins + '分鐘' : ''}</div>
      <div class="stay-suggestion-note">可直接調整每個景點的建議停留時間，系統會即時重新計算後續行程。</div>
    `;

    schedule.forEach((stop, index) => {
      const timeStr = minutesToClock(stop.start);
      const tag = tagMap[stop.id] || { text: '', style: '' };
      
      // 判断是否是最后一个停靠点
      const isLast = index === schedule.length - 1;
      const useLastStyle = isLast && currentTripStatus !== 'ongoing';
      const nodeDotStyle = useLastStyle ? 'style="background: var(--accent2); box-shadow: 0 0 0 4px var(--accent2-light);"' : '';
      const spotCardStyle = useLastStyle ? 'style="border-color: var(--accent2);"' : '';
      const tagStyle = tag.style ? `style="${tag.style}"` : '';
      const isEndpointStop = stop.type === 'start' || stop.type === 'end';
      const endpointLabel = stop.type === 'start' ? '🚩 起點' : stop.type === 'end' ? '🏁 終點' : '';
      let feeRowHtml = '';
      if (!isEndpointStop) {
        const isFood = stopIsFood(stop, itineraryFoodCostMap);
        if (isFood) {
          // 用餐站：顯示餐廳人均消費（restaurant-data.js / stop 自帶）；查無則不顯示（餐廳無門票概念）
          const fc = lookupStopFoodCost(itineraryFoodCostMap, stop);
          if (fc && (Number.isFinite(fc.costPerPerson) || fc.costNote)) {
            feeRowHtml = `<div class="stop-fee-row">🍽 人均 ${Number.isFinite(fc.costPerPerson) ? (fc.costPerPerson > 0 ? '約 $' + fc.costPerPerson : '免費') : fc.costNote}</div>`;
          }
        } else {
          const feeHit = lookupStopFee(itineraryFeeMap, stop.name);
          if (feeHit && (Number.isFinite(feeHit.fee) || feeHit.feeNote)) {
            feeRowHtml = `<div class="stop-fee-row">💳 ${Number.isFinite(feeHit.fee) ? (feeHit.fee > 0 ? '門票 $' + feeHit.fee : '免費') : feeHit.feeNote}</div>`;
          } else {
            // 景點查無門票資料 → 標示「未提供」以區別「漏掉」
            feeRowHtml = `<div class="stop-fee-row stop-fee-unknown">💳 門票資訊未提供</div>`;
          }
        }
      }

      let actionButtonsHtml = '';
      let itemClasses = 'timeline-item';
      if (currentTripStatus === 'ongoing') {
        // 進行中仍以唯讀方式顯示各站預計停留時間（不提供「調整」，專心執行）
        const stayTagHtml = (!isEndpointStop && stop.stayMin > 0)
          ? `<span class="tag stay-time-tag">⏱ ${stop.stayMin < 60 ? stop.stayMin + '分' : (stop.stayMin % 60 === 0 ? (stop.stayMin/60) + '小時' : Math.floor(stop.stayMin/60) + '時' + (stop.stayMin%60) + '分')}</span>`
          : '';
        if (index < currentStopIndex) {
          itemClasses += ' visited-stop';
          actionButtonsHtml = stayTagHtml + `<span class="tag" style="background:#e0f2fe;color:#0369a1;">✓ 已打卡</span>`;
        } else if (index === currentStopIndex) {
          itemClasses += ' ongoing-active';
          if (collabReadOnly) {
            actionButtonsHtml = stayTagHtml + `<span class="tag" style="background:#fef3c7;color:#d97706;font-weight:700;">⚡ 目前站 (唯讀)</span>`;
          } else {
            const checkinLabel = stop.type === 'start' ? '🚗 出發' : stop.type === 'end' ? '🏁 抵達終點' : '✅ 到達打卡';
            actionButtonsHtml = stayTagHtml + `<button class="checkin-btn" onclick="event.stopPropagation(); checkInCurrentStop('${stop.id}', event)">${checkinLabel}</button>`;
          }
        } else {
          actionButtonsHtml = stayTagHtml + `<span class="tag" style="background:#f3f4f6;color:#6b7280;">⏳ 未到</span>`;
        }
      } else {
        // Normal planning/completed mode buttons
        actionButtonsHtml = isEndpointStop ? `<span class="tag" style="background:var(--accent2-light);color:var(--accent2-dark);">${endpointLabel}</span>` : (stop.stayMin > 0 ? `
          <span class="tag stay-time-tag">⏱ ${stop.stayMin < 60 ? stop.stayMin + '分' : (stop.stayMin % 60 === 0 ? (stop.stayMin/60) + '小時' : Math.floor(stop.stayMin/60) + '時' + (stop.stayMin%60) + '分')}</span>
          <button class="stay-edit-btn" onclick="event.stopPropagation(); openStayTimeAdjuster('${stop.id}')">調整</button>
          <button class="stay-edit-btn visited-toggle-btn ${isPlaceVisited(stop.name) ? 'visited' : ''}" data-stop-id="${stop.id}" onclick="event.stopPropagation(); handleToggleVisited('${stop.id}', this)">${isPlaceVisited(stop.name) ? '✓ 已去過' : '📌 去過了'}</button>
          ${(!collabReadOnly && stop.altNearby && stop.altNearby.length) ? `<button class="stay-edit-btn swap-btn" onclick="event.stopPropagation(); openSwapPanel('${stop.id}')">🔄 替換</button>` : ''}
        ` : '');
      }

      const endpointTagHtml = (isEndpointStop && currentTripStatus === 'ongoing') ? `<span class="tag" style="background:var(--accent2-light);color:var(--accent2-dark);margin-right:6px;">${endpointLabel}</span>` : '';

      html += `
        <div id="itinerary-stop-${stop.id}" class="${itemClasses}" onclick="openItineraryStop('${stop.id}')" onmouseenter="highlightPin('${stop.mapPinId || 'pin-' + (index + 1)}')" onmouseleave="unhighlightPin('${stop.mapPinId || 'pin-' + (index + 1)}')">
          <div class="time-box"><div class="time-val">${timeStr}</div></div>
          <div class="node"><div class="node-dot" ${nodeDotStyle}></div></div>
          <div class="content-box">
            <div class="spot-card" ${spotCardStyle}>
              <div class="spot-emoji-box">${stop.emoji}</div>
              <div class="spot-card-copy">
                <div class="spot-name">${stop.name}</div>
                ${stop.isMergedAttraction && stop.mergedSubSpots && stop.mergedSubSpots.length ? `<div class="merged-subspots-row" style="font-size:12px;color:var(--ink3);margin:2px 0;">🧩 含 ${stop.mergedSubSpots.join('、')}</div>` : ''}
                <div class="spot-tags">${endpointTagHtml}${actionButtonsHtml}${tag.text ? `<span class="tag" ${tagStyle}>${tag.text}</span>` : ''}</div>
                ${!isEndpointStop && stop.businessHours ? `<div class="stop-hours-row">${typeof formatDayBusinessHours === 'function' ? formatDayBusinessHours(stop.businessHours, currentTripPreferences?.departureDate) : ''}</div>` : ''}
                ${feeRowHtml}
                <div class="nearby-toilets-row" id="toilet-section-${stop.mapPinId}">
                  <span style="font-size:12px;color:var(--ink3);">🚻 搜尋附近廁所中…</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;

      // 添加过渡块（除了最后一个）
      if (index < schedule.length - 1) {
        const nextStop = schedule[index + 1];
        const transitMode = normalizeTransitMode(stop.transitMode);
        const transitMin = stop.transit || 0;
        // stop.transit 已含「出發走回停車場＋停車後步行」；顯示時拆回各段，避免把步行混進「汽車約 N 分鐘」
        const parkWalkMin = Number(nextStop.parkWalkMin) || 0;
        const departWalkMin = ((transitMode === 'car' || transitMode === 'scooter') && Number(stop.parkWalkMin) > 0)
          ? Number(stop.parkWalkMin) : 0;
        const driveMin = Math.max(0, transitMin - parkWalkMin - departWalkMin);
        let transitText = '';
        if (departWalkMin > 0) {
          transitText += `🚶 步行回停車場取車約 ${departWalkMin} 分鐘 ＋ `;
        }
        transitText += getTransitSummaryText(transitMode, driveMin);
        if (parkWalkMin > 0) {
          transitText += ` ＋ 🅿️ 停車後步行約 ${parkWalkMin} 分鐘`;
        }
        if (transitMin > 0) {
          // 添加停靠点间的描述
          if (stop.id === 'luggage' && nextStop.id === 'cafe') {
            transitText += '穿過站前廣場';
          } else if (stop.id === 'cafe' && nextStop.id === 'shop') {
            transitText += '，轉個彎就到';
          } else if (stop.id === 'shop') {
            transitText += '慢慢散步回車站，順便買伴手禮';
          }
        }
        // 如果有路線距離資訊，一併顯示
        const routeInfo = getRouteStageBySourceStopIndex(index);
        if (routeInfo && routeInfo.distance && !isDistanceAbnormallySmall(routeInfo.distance)) {
          transitText += ` · 距離 ${routeInfo.distance}`;
        }
        if (routeInfo && getRouteStageTimeText(routeInfo)) {
          transitText += ` · ${getRouteStageTimeText(routeInfo)}`;
        }
        // 下拉只提供：所選交通工具 + 走路（並保留目前值以相容舊行程）
        const allowedModes = new Set(['walk', getPreferredVehicleMode(), transitMode]);
        const segmentModeOptions = TRANSIT_MODE_OPTIONS.filter((modeOption) => allowedModes.has(modeOption.value));
        // 開車段但目的地找不到鄰近停車場 → 提醒使用者（停車狀態於畫路線時寫入 routeStageCache）
        const noParkingWarn = (routeInfo && routeInfo.parkingSearched && routeInfo.parkingFound === false)
          ? `<div class="transit-parking-warn" style="margin-top:6px;font-size:12px;line-height:1.45;color:#C2410C;background:#FFF4ED;border:1px solid #FED7AA;border-radius:8px;padding:6px 8px;">⚠️ 此段目的地找不到鄰近停車場，請預留路邊或付費停車的時間。</div>`
          : '';
        html += `<div class="transit-block">
          <div class="transit-block-main">${transitText}</div>
          <label class="transit-mode-wrap">交通工具
            <select class="transit-mode-select" onchange="setSegmentTransitMode('${stop.id}', this.value)" onclick="event.stopPropagation()">
              ${segmentModeOptions.map((modeOption) => `<option value="${modeOption.value}" ${transitMode === modeOption.value ? 'selected' : ''}>${modeOption.icon} ${modeOption.label}</option>`).join('')}
            </select>
          </label>
          ${noParkingWarn}
        </div>`;
      }
    });

    const endTimeStr = minutesToClock(schedule[schedule.length - 1].end);
    html += `
      <div class="timeline-item" style="pointer-events:none;">
        <div class="time-box"><div class="time-val" style="color:var(--ink2);">${endTimeStr}</div></div>
        <div class="node"><div class="node-dot" style="background:var(--ink3);box-shadow:none;width:8px;height:8px;"></div></div>
        <div class="content-box" style="padding-bottom:0;">
          <div style="font-size:13px;color:var(--ink2);padding:6px 0;">行程結束</div>
        </div>
      </div>
    `;

    plannedBlock.innerHTML = html;

    // 重繪卡片後，先用已快取的廁所資料還原每站文字（避免切換交通工具等重繪時，
    // 廁所行被重置成「搜尋中…」後因為沒有作用中階段而停在載入狀態）。
    updateToiletSectionsInDOM();

    // 自動渲染行程中的廁所標記到地圖上
    if (map && window.google && google.maps) {
      renderToiletMarkersForActiveRouteStage();
    }
  }

  function applyReplan() {
    isReplanning = false;
    activeStopMenuId = null;
    closeModifyWindow();
    // Remove only stale markers (stops no longer in replanStops) to avoid coordinate re-resolution
    const activeIds = new Set(replanStops.map(s => s.mapPinId).filter(Boolean));
    Object.entries(markers).forEach(([id, marker]) => {
      if (!activeIds.has(id)) {
        if (marker && typeof marker.setMap === 'function') marker.setMap(null);
        delete markers[id];
      }
    });
    renderItineraryDisplay();
    refreshRouteDirections();
    switchView('itinerary');
    updateItineraryStageUI();
    // 套用新規劃後補各站「附近廁所」文字
    prefetchAllStopToiletData();
  }

  function cancelReplan() {
    isReplanning = false;
    activeStopMenuId = null;
    closeModifyWindow();
    switchView('itinerary');
    updateItineraryStageUI();
  }

  // 旅伴頁：用真實共編資料填滿（成員、角色、Organizer、邀請碼、QR）；單人行程顯示個人狀態。
  function membersRoleLabel(role) {
    return ({ owner: '擁有者', editor: '可編輯', viewer: '唯讀', guest: '訪客' })[role] || '唯讀';
  }
  function renderMembersView() {
    const countEl = document.getElementById('membersCount');
    const stackEl = document.getElementById('membersAvatarStack');
    const destEl = document.getElementById('membersDest');
    const titleEl = document.getElementById('membersTripTitle');
    const dateEl = document.getElementById('membersDate');
    const orgEl = document.getElementById('membersOrganizer');
    const codeEl = document.getElementById('inviteCodeDisplay');
    const qrEl = document.getElementById('inviteQrCode');
    const hintEl = document.getElementById('inviteQrHint');

    if (destEl) destEl.textContent = currentTripRegion || '--';
    if (titleEl) titleEl.textContent = currentTripTitle || '尚未載入行程';
    if (dateEl) dateEl.textContent = currentTripDepartureDate ? String(currentTripDepartureDate).replace(/-/g, '/') : '待設定';

    if (!currentTripIsCollab || !currentTripMembers) {
      if (countEl) countEl.textContent = '👤 個人行程';
      if (stackEl) stackEl.innerHTML = '<div class="avatar">🧍</div><div class="avatar-info"><div style="font-weight:600;font-size:16px;">個人行程</div><div style="font-size:13px;color:var(--ink3);">改用「多人共作」可邀請朋友一起編輯</div></div>';
      if (orgEl) orgEl.textContent = '你';
      if (codeEl) codeEl.textContent = '--';
      if (qrEl) qrEl.innerHTML = '個人行程<br>沒有邀請碼';
      if (hintEl) hintEl.textContent = '改用「多人共作」建立行程，才會有邀請碼與分享 QR';
      return;
    }

    const members = Object.keys(currentTripMembers).map(k => currentTripMembers[k]);
    let myEmail = '';
    try { const u = JSON.parse(localStorage.getItem('wai_user') || '{}'); myEmail = (u && u.currentUser && u.currentUser.email) || ''; } catch (e) {}
    const myKey = String(myEmail).toLowerCase().replace(/[^a-z0-9]/g, '_');
    const myRole = (currentTripMembers[myKey] || {}).role || collabRole || 'viewer';

    if (countEl) countEl.textContent = `👥 ${members.length} 人`;
    if (orgEl) orgEl.textContent = currentTripOwnerName || (members.find(m => m.role === 'owner') || {}).name || '--';
    if (codeEl) codeEl.textContent = currentInviteCode || '--';

    if (stackEl) {
      const avatars = members.slice(0, 5).map(m =>
        `<div class="avatar" title="${escapeHtml((m.name || m.email || '') + ' · ' + membersRoleLabel(m.role))}">${escapeHtml(String(m.name || m.email || '?').slice(0, 1))}</div>`
      ).join('');
      const rows = members.map(m => {
        const isMe = String(m.email || '').toLowerCase().replace(/[^a-z0-9]/g, '_') === myKey;
        return `${escapeHtml(m.name || m.email)}${isMe ? '（你）' : ''}：${membersRoleLabel(m.role)}`;
      }).join('｜');
      stackEl.innerHTML = `${avatars}<div class="avatar-info"><div style="font-weight:600;font-size:16px;">你是${membersRoleLabel(myRole)}</div><div style="font-size:13px;color:var(--ink3);">${rows}</div></div>`;
    }

    if (qrEl) {
      const share = currentTripShareToken
        ? `${location.origin}${location.pathname}?sharedId=${encodeURIComponent(currentItineraryId)}&token=${encodeURIComponent(currentTripShareToken)}&guest=1`
        : (currentInviteCode || '');
      qrEl.innerHTML = share
        ? `<img alt="邀請 QR" style="width:100%;height:100%;border-radius:10px;object-fit:contain;" src="https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(share)}">`
        : '邀請碼產生中…';
      if (hintEl) hintEl.textContent = share ? '讓朋友掃描 QR，或輸入上方邀請碼即可加入' : '邀請碼產生中…';
    }
  }

  // 切換左側視圖 (Itinerary, Budget, Members, Weather)
  function switchView(viewId) {
    // 更新頂部按鈕狀態
    document.querySelectorAll('.nav-pill').forEach(btn => {
      btn.classList.remove('active');
      if(btn.getAttribute('onclick').includes(viewId)) {
        btn.classList.add('active');
      }
    });

    // 隱藏所有視圖，顯示目標視圖
    document.querySelectorAll('.view-section').forEach(section => {
      section.classList.remove('active');
    });
    document.getElementById('view-' + viewId).classList.add('active');

    if (viewId === 'travellog') renderTravelLog();
    if (viewId === 'budget') renderBudgetTracker();
    if (viewId === 'members') renderMembersView();
    if (viewId === 'weather') refreshWeatherView(); // C5：切到天氣頁時抓 CWA 真實預報（失敗保留原內容）

    // 手機上的視圖模式邏輯
    if (isMobileLayout()) {
      if (viewId === 'current-spot') {
        setMobileMode('current-spot');
      } else {
        setMobileMode(currentUserRole === 'driver' ? 'map' : 'functions');
      }
    }
  }

  // ══════════════════════════════════════════════════
  // C5 天氣預報（CWA 中央氣象署，經 /api/cwa 後端代理；金鑰不在前端）
  // F-C0032-001＝36 小時縣市預報（臺東縣），三個 12 小時時段。
  // 失敗一律靜默（保留頁面原內容，不噴紅字）；30 分鐘 localStorage 快取。
  // ══════════════════════════════════════════════════
  const CWA_CACHE_KEY = 'wai_cwa_taitung_wk';

  // 天氣時間欄位可能是 "2026-07-09 18:00:00"（F-C0032）或 ISO "2026-07-09T18:00:00+08:00"（F-D0047）
  function parseWeatherTime(s) {
    s = String(s || '');
    const d = new Date(s.includes('T') ? s : s.replace(/-/g, '/'));
    return isNaN(d.getTime()) ? null : d;
  }

  // 主來源：F-D0047-091 縣市未來一週（12 小時間隔約 7 天，取臺東縣；新版大寫 schema）
  async function fetchCwaWeekly() {
    const url = `${VERTEX_PROXY_BASE}/cwa/v1/rest/datastore/F-D0047-091?LocationName=${encodeURIComponent('臺東縣')}`;
    const r = await fetch(url);
    if (!r.ok) return null;
    const json = await r.json();
    const locs = (json.records && json.records.Locations && json.records.Locations[0] && json.records.Locations[0].Location) || [];
    const tt = locs.find((x) => x.LocationName === '臺東縣') || locs[0];
    if (!tt || !Array.isArray(tt.WeatherElement)) return null;
    const byName = {};
    tt.WeatherElement.forEach((e) => { byName[e.ElementName] = e.Time || []; });
    const wxT = byName['天氣現象'] || [];
    const valByStart = (arr, start, field) => {
      const m = (arr || []).find((x) => x.StartTime === start);
      return (m && m.ElementValue && m.ElementValue[0] && m.ElementValue[0][field]) || '';
    };
    const periods = wxT.map((t) => ({
      start: t.StartTime, end: t.EndTime,
      wx: (t.ElementValue && t.ElementValue[0] && t.ElementValue[0].Weather) || '',
      pop: Number(valByStart(byName['12小時降雨機率'], t.StartTime, 'ProbabilityOfPrecipitation')) || 0,
      maxT: valByStart(byName['最高溫度'], t.StartTime, 'MaxTemperature'),
      minT: valByStart(byName['最低溫度'], t.StartTime, 'MinTemperature'),
      ci: ''
    })).filter((p) => p.wx);
    if (!periods.length) return null;
    return { locationName: '臺東縣', periods };
  }

  // Fallback：F-C0032-001 今明 36 小時（舊版小寫 schema）
  async function fetchCwa36h() {
    const url = `${VERTEX_PROXY_BASE}/cwa/v1/rest/datastore/F-C0032-001?locationName=${encodeURIComponent('臺東縣')}`;
    const r = await fetch(url);
    if (!r.ok) return null;
    const json = await r.json();
    const loc = json && json.records && Array.isArray(json.records.location) && json.records.location[0];
    if (!loc || !Array.isArray(loc.weatherElement)) return null;
    const byName = {};
    loc.weatherElement.forEach((el) => { byName[el.elementName] = el.time || []; });
    const wx = byName.Wx || [];
    const periods = wx.map((t, i) => ({
      start: t.startTime, end: t.endTime,
      wx: (t.parameter && t.parameter.parameterName) || '',
      pop: Number((byName.PoP && byName.PoP[i] && byName.PoP[i].parameter.parameterName) || 0),
      minT: (byName.MinT && byName.MinT[i] && byName.MinT[i].parameter.parameterName) || '',
      maxT: (byName.MaxT && byName.MaxT[i] && byName.MaxT[i].parameter.parameterName) || '',
      ci: (byName.CI && byName.CI[i] && byName.CI[i].parameter.parameterName) || ''
    })).filter((p) => p.wx);
    if (!periods.length) return null;
    return { locationName: loc.locationName, periods };
  }

  async function fetchTaitungWeather() {
    if (!VERTEX_PROXY_BASE) return null; // file:// 或未設代理時測不到 /api，保留 mock
    try {
      const cached = JSON.parse(localStorage.getItem(CWA_CACHE_KEY) || 'null');
      if (cached && cached.exp > Date.now() && cached.data) return cached.data;
    } catch (_e) {}
    let data = null;
    try { data = await fetchCwaWeekly(); } catch (_e) {}            // 主：未來一週
    if (!data) { try { data = await fetchCwa36h(); } catch (_e) {} } // 退：36 小時
    if (data) { data.fetchedAt = Date.now(); try { localStorage.setItem(CWA_CACHE_KEY, JSON.stringify({ exp: Date.now() + 30 * 60 * 1000, data })); } catch (_e) {} }
    return data; // 靜默降級：F12 零紅字標準
  }

  function weatherIconFor(wxText, pop) {
    const t = String(wxText || '');
    if (t.includes('雷')) return '⛈️';
    if (t.includes('豪雨') || t.includes('大雨')) return '🌧️';
    if (t.includes('雨')) return pop >= 60 ? '🌧️' : '🌦️';
    if (t.includes('陰')) return '☁️';
    if (t.includes('多雲')) return t.includes('晴') ? '⛅' : '🌥️';
    return '☀️';
  }

  function weatherAdviceFor(p) {
    if (p.pop >= 70) return `☔ 降雨機率 ${p.pop}%，記得帶傘並優先安排室內景點。`;
    if (p.pop >= 30) return `🌂 降雨機率 ${p.pop}%，包包放把折傘比較安心。`;
    if (String(p.ci).includes('悶熱') || Number(p.maxT) >= 33) return `🧢 ${p.ci || '天氣偏熱'}，記得防曬補水，中午安排陰涼處休息。`;
    return `👕 ${p.ci || '天氣穩定'}，適合步行散策，不用擔心下雨！`;
  }

  function weatherPeriodLabel(p) {
    try {
      const s = parseWeatherTime(p.start);
      const e = parseWeatherTime(p.end);
      if (!s || !e) return '';
      const hh = (d) => String(d.getHours()).padStart(2, '0') + ':00';
      const sameDay = s.getDate() === e.getDate();
      return `${s.getMonth() + 1}/${s.getDate()} ${hh(s)}–${sameDay ? '' : `${e.getMonth() + 1}/${e.getDate()} `}${hh(e)}`;
    } catch (_e) { return ''; }
  }

  // 台東各月氣候平均（概略常態值；供超出預報範圍的行程參考）
  const TAITUNG_CLIMATE = [
    { hi: 24, lo: 16, note: '涼爽乾燥，偶有東北季風' },
    { hi: 25, lo: 17, note: '溫和少雨，適合出遊' },
    { hi: 27, lo: 19, note: '回暖舒適' },
    { hi: 29, lo: 22, note: '漸熱，偶有陣雨' },
    { hi: 31, lo: 24, note: '進入雨季，午後雷陣雨' },
    { hi: 32, lo: 25, note: '炎熱多雨，注意防曬' },
    { hi: 33, lo: 26, note: '最熱月，颱風季開始' },
    { hi: 32, lo: 26, note: '炎熱，颱風季，留意路況' },
    { hi: 31, lo: 25, note: '仍偏熱，颱風季尾聲' },
    { hi: 29, lo: 23, note: '轉涼，天氣漸穩' },
    { hi: 27, lo: 20, note: '舒適乾爽，旅遊旺季' },
    { hi: 25, lo: 17, note: '涼爽，東北季風偶雨' }
  ];
  const WEEKDAY_ZH = ['日', '一', '二', '三', '四', '五', '六'];
  function weatherDateLabel(d) { return `${d.getMonth() + 1}/${d.getDate()}（${WEEKDAY_ZH[d.getDay()]}）`; }

  // 取行程涵蓋的日期（出發→回程；無回程＝單日）；無出發日回 null
  function getTripWeatherDates() {
    const prefs = currentTripPreferences || {};
    const depStr = prefs.departureDate || currentTripDepartureDate || '';
    if (!depStr) return null;
    const start = new Date(String(depStr) + 'T00:00:00');
    if (isNaN(start.getTime())) return null;
    let end = new Date(start);
    const retStr = prefs.returnDate || '';
    if (retStr) { const e = new Date(String(retStr) + 'T00:00:00'); if (!isNaN(e.getTime()) && e >= start) end = e; }
    const dates = [];
    for (let d = new Date(start); d <= end && dates.length < 10; d.setDate(d.getDate() + 1)) dates.push(new Date(d));
    return dates;
  }

  // 36 小時預報 periods 中「起始日＝目標日」的段落
  function periodsForDate(periods, date) {
    return (periods || []).filter((p) => {
      const s = parseWeatherTime(p.start);
      return s && s.getFullYear() === date.getFullYear() && s.getMonth() === date.getMonth() && s.getDate() === date.getDate();
    });
  }

  // 把某日的預報段落聚合成一天摘要
  function aggregateForecastDay(periods) {
    if (!periods.length) return null;
    const temps = periods.flatMap((p) => [Number(p.minT), Number(p.maxT)].filter(Number.isFinite));
    const pop = Math.max(...periods.map((p) => Number(p.pop) || 0));
    const rep = periods.slice().sort((a, b) => (Number(b.pop) || 0) - (Number(a.pop) || 0))[0];
    return {
      source: 'forecast',
      minT: temps.length ? Math.min(...temps) : null,
      maxT: temps.length ? Math.max(...temps) : null,
      pop, wx: rep.wx, ci: rep.ci, periods
    };
  }

  function climateDay(date) {
    const c = TAITUNG_CLIMATE[date.getMonth()];
    const rainy = /雨/.test(c.note);
    return { source: 'climate', minT: c.lo, maxT: c.hi, pop: rainy ? 40 : 10, wx: c.note, ci: '', note: c.note };
  }

  // 某趟行程「有雨的日期」清單（供 Plan B 天氣驅動替換用）：回傳 [{date, pop, outdoorRainy:true}]
  function getRainyTripDays(days) {
    return (days || []).filter((x) => (Number(x.day.pop) || 0) >= 50);
  }

  let _weatherExpanded = {}; // dayIndex → 是否展開
  window.toggleWeatherDay = function (i) {
    _weatherExpanded[i] = !_weatherExpanded[i];
    const detail = document.getElementById('wcDetail-' + i);
    const chev = document.getElementById('wcChev-' + i);
    if (detail) detail.style.display = _weatherExpanded[i] ? 'block' : 'none';
    if (chev) chev.textContent = _weatherExpanded[i] ? '▲' : '▼';
  };

  function weatherDayCardHtml(date, day, idx, expandedDefault) {
    const rainy = (Number(day.pop) || 0) >= 30;
    const icon = day.source === 'climate' ? (rainy ? '🌧️' : '⛅') : weatherIconFor(day.wx, day.pop);
    const temp = (day.minT != null && day.maxT != null) ? `${day.minT}–${day.maxT}°` : '--';
    const expanded = expandedDefault || _weatherExpanded[idx];
    let detailHtml;
    if (day.source === 'forecast') {
      detailHtml = day.periods.map((p) => `
        <div class="wc-period">
          <span class="wc-period-time">${weatherPeriodLabel(p)}</span>
          <span>${weatherIconFor(p.wx, p.pop)} ${escapeHtml(p.wx)}</span>
          <span class="wc-period-meta">${p.minT}–${p.maxT}° · 降雨 ${p.pop}%</span>
        </div>`).join('');
    } else {
      detailHtml = `<div class="wc-climate-note">📊 ${escapeHtml(day.note)}<br><span style="color:var(--ink3)">中央氣象署預報僅到未來一週，接近出發日會自動更新為即時預報。</span></div>`;
    }
    const badge = day.source === 'climate' ? `<span class="wc-badge">氣候平均</span>` : '';
    const advice = day.source === 'forecast'
      ? escapeHtml(day.wx) + '。' + escapeHtml(weatherAdviceFor(day))
      : `此為 ${date.getMonth() + 1} 月的氣候平均值，僅供參考；接近出發日再回來看即時預報。`;
    return `
      <div class="weather-card ${rainy ? 'rainy' : 'sunny'}">
        <div class="wc-header" onclick="toggleWeatherDay(${idx})" style="cursor:pointer;">
          <div>
            <div style="font-weight:600;margin-bottom:8px;">${weatherDateLabel(date)} ${badge}</div>
            <div class="wc-temp">${temp}</div>
          </div>
          <div style="display:flex;align-items:center;gap:10px;">
            <div class="wc-icon">${icon}</div>
            <span id="wcChev-${idx}" style="color:var(--ink3);font-size:13px;">${expanded ? '▲' : '▼'}</span>
          </div>
        </div>
        <div class="wc-advice">${advice}</div>
        <div class="wc-detail" id="wcDetail-${idx}" style="display:${expanded ? 'block' : 'none'};margin-top:12px;border-top:1px dashed var(--border);padding-top:12px;">
          ${detailHtml}
        </div>
      </div>`;
  }

  // 給 Plan B 1c 用：目前天氣頁算出的每日資料（供「下雨換室內」判定）
  let currentWeatherDays = [];

  async function refreshWeatherView() {
    const container = document.querySelector('#view-weather .weather-container');
    const titleEl = document.querySelector('#view-weather .hero-title');
    const tagEl = document.querySelector('#view-weather .hero-meta .hero-tag');
    if (!container) return;

    const dates = getTripWeatherDates();
    if (!dates || !dates.length) {
      if (titleEl) titleEl.textContent = '行程天氣';
      if (tagEl) tagEl.textContent = '🌤 載入有出發日期的行程後顯示';
      currentWeatherDays = [];
      return; // 沒有行程日期就保留現況
    }

    if (titleEl) {
      const a = dates[0], b = dates[dates.length - 1];
      titleEl.textContent = dates.length === 1
        ? `行程天氣 · ${a.getMonth() + 1}/${a.getDate()}`
        : `行程天氣 · ${a.getMonth() + 1}/${a.getDate()}–${b.getMonth() + 1}/${b.getDate()}`;
    }

    const fc = await fetchTaitungWeather(); // {locationName, periods} 或 null
    const periods = (fc && fc.periods) || [];
    let anyForecast = false;
    const days = dates.map((d) => {
      const day = aggregateForecastDay(periodsForDate(periods, d)) || climateDay(d);
      if (day.source === 'forecast') anyForecast = true;
      return { date: d, day };
    });
    currentWeatherDays = days;

    if (tagEl) tagEl.textContent = anyForecast
      ? `🌤 ${(fc && fc.locationName) || '臺東縣'} 行程期間預報（中央氣象署）`
      : '🌤 行程尚遠，先看該月氣候平均值';

    _weatherExpanded = {};
    const single = days.length === 1;
    container.innerHTML = days.map((x, i) => weatherDayCardHtml(x.date, x.day, i, single)).join('');

    // Plan B 1c：行程期間任一天有雨 → 提示把戶外景點換成附近室內替代
    const rainy = getRainyTripDays(days);
    if (rainy.length && !collabReadOnly && Array.isArray(replanStops)) {
      const outdoorStops = replanStops.filter((s) => s && s.type !== 'start' && s.type !== 'end'
        && s.isOutdoor && Array.isArray(s.altNearby) && s.altNearby.some((a) => a.isOutdoor === false));
      if (outdoorStops.length) {
        const rd = rainy.map((x) => `${x.date.getMonth() + 1}/${x.date.getDate()}`).join('、');
        const items = outdoorStops.map((s) => `
          <div class="wc-rain-swap-item">
            <span>🌳 ${escapeHtml(s.name)}</span>
            <button class="wc-rain-swap-btn" onclick="openSwapPanel('${s.id}', true)">換室內</button>
          </div>`).join('');
        const div = document.createElement('div');
        div.className = 'wc-rain-swap';
        div.innerHTML = `<div class="wc-rain-swap-title">🌧 ${rd} 可能有雨，這些戶外景點可換成附近室內替代：</div>${items}`;
        container.appendChild(div);
      }
    }
  }

  // ══════════════════════════════════════════════════
  // Plan B：查看替換（用生成時保留的附近替代景點換掉某站）
  // ══════════════════════════════════════════════════
  let _swapPanelStopId = null;

  window.openSwapPanel = function (stopId, filterIndoor) {
    if (collabReadOnly) return feedbackToast('訪客或唯讀成員無法替換景點', 'orange');
    const stop = (replanStops || []).find((s) => s.id === stopId);
    if (!stop || !Array.isArray(stop.altNearby) || !stop.altNearby.length) {
      return feedbackToast('這一站沒有可用的替代景點', 'orange');
    }
    _swapPanelStopId = stopId;
    let alts = stop.altNearby.slice();
    if (filterIndoor) alts = alts.filter((a) => a.isOutdoor === false);
    let overlay = document.getElementById('swap-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'swap-overlay';
      overlay.className = 'swap-overlay';
      overlay.addEventListener('click', (e) => { if (e.target === overlay) closeSwapPanel(); });
      document.body.appendChild(overlay);
    }
    const rows = alts.map((a, i) => `
      <button class="swap-item" onclick="applySwap(${i}, ${filterIndoor ? 'true' : 'false'})">
        <div class="swap-item-main">
          <span class="swap-item-name">${escapeHtml(a.name)}</span>
          <span class="swap-badge ${a.isOutdoor ? 'out' : 'in'}">${a.isOutdoor ? '🌳 戶外' : '🏠 室內'}</span>
        </div>
        <div class="swap-item-sub">${a.distM != null ? '距離約 ' + (a.distM >= 1000 ? (a.distM / 1000).toFixed(1) + ' km' : a.distM + ' m') : ''}${a.rating ? ' · ★ ' + a.rating : ''}</div>
        ${a.desc ? `<div class="swap-item-desc">${escapeHtml(a.desc)}</div>` : ''}
      </button>`).join('');
    overlay.innerHTML = `
      <div class="swap-card" role="dialog" aria-modal="true">
        <div class="swap-title">替換「${escapeHtml(stop.name)}」</div>
        <div class="swap-sub">${filterIndoor ? '🌧 下雨天推薦的室內替代（依距離排序）' : '附近可替換的景點（依距離排序）'}</div>
        <div class="swap-list">${rows || '<div class="swap-sub">沒有符合條件的替代景點</div>'}</div>
        <button class="swap-close" onclick="closeSwapPanel()">取消</button>
      </div>`;
    requestAnimationFrame(() => overlay.classList.add('open'));
  };

  window.closeSwapPanel = function () {
    const overlay = document.getElementById('swap-overlay');
    if (overlay) overlay.classList.remove('open');
    _swapPanelStopId = null;
  };

  window.applySwap = function (altIndex, wasIndoorFilter) {
    const stop = (replanStops || []).find((s) => s.id === _swapPanelStopId);
    if (!stop || !Array.isArray(stop.altNearby)) return closeSwapPanel();
    let alts = stop.altNearby.slice();
    if (wasIndoorFilter) alts = alts.filter((a) => a.isOutdoor === false);
    const alt = alts[altIndex];
    if (alt) swapStopWithAlternative(stop, alt);
    closeSwapPanel();
  };

  function swapStopWithAlternative(stop, alt) {
    const prev = { name: stop.name, lat: stop.lat, lng: stop.lng, desc: stop.desc, isOutdoor: stop.isOutdoor };
    // 用替代景點覆蓋此站；座標鎖定跳過 Places 重驗
    stop.name = alt.name;
    stop.desc = alt.desc || '';
    stop.lat = alt.lat; stop.lng = alt.lng;
    stop.scenicCoordinates = { lat: alt.lat, lng: alt.lng };
    stop._lockedCoordinates = { lat: alt.lat, lng: alt.lng };
    stop.coordVerified = true;
    stop.isOutdoor = (alt.isOutdoor === true);
    stop.placeId = null; stop.businessHours = null; stop.checkedInAt = null;
    // 被換掉的原景點放回替代池最前（可再換回去）；移除已採用的
    if (Array.isArray(stop.altNearby)) {
      stop.altNearby = stop.altNearby.filter((a) => a.name !== alt.name);
      if (prev.name && Number.isFinite(prev.lat)) {
        stop.altNearby.unshift({ name: prev.name, lat: prev.lat, lng: prev.lng, desc: prev.desc || '', rating: null, isOutdoor: prev.isOutdoor, distM: 0 });
      }
    }
    feedbackToast(`🔄 已換成「${alt.name}」`, 'green');
    renderItineraryDisplay();
    if (isReplanning && typeof renderReplanBoard === 'function') renderReplanBoard();
    persistCurrentTripStops();
    if (typeof syncMapToCurrentTrip === 'function') syncMapToCurrentTrip().catch(() => {});
  }

  // 花費追蹤卡片：把人均預算拆成「交通（離島船票＋站間移動）」與「可動用餐飲/活動」並顯示。
  // 資料來自目前載入的行程站點（replanStops）＋偏好（currentTripPreferences）；缺費率/無行程時顯示友善提示。
  function renderBudgetTracker() {
    const host = document.getElementById('view-budget');
    if (!host) return;
    const prefs = currentTripPreferences || {};
    const budget = prefs.budget || '';
    const people = prefs.people || '';
    const mode = prefs.transportMode || '';
    const destination = prefs.dest || prefs.destCustom || currentTripRegion || '';
    const days = prefs.days || '';
    const count = getPeopleCount(people);
    const stops = Array.isArray(replanStops) ? replanStops : [];

    const money = n => '$' + Math.round(Math.max(0, Number(n) || 0)).toLocaleString('en-US');
    const cfg = getCostConfig();
    const modeKey = (cfg && cfg.modeRates && cfg.modeRates[mode]) ? mode : 'car';
    const modeLabel = (cfg && cfg.modeRates && cfg.modeRates[modeKey] && cfg.modeRates[modeKey].label) || '交通';
    const modeEmoji = ({ scooter: '🛵', car: '🚗', taxi: '🚕', walk: '🚶' })[modeKey] || '🚗';

    const hasTrip = stops.length > 0 || !!budget;
    if (!hasTrip) {
      host.innerHTML = `
        <div class="hero-section" style="padding-bottom: 24px;">
          <div class="hero-title">微旅行花費追蹤</div>
          <div class="hero-meta"><div class="hero-tag">💰 尚無可估算的行程</div></div>
        </div>
        <div class="budget-water-level">
          <div class="budget-label" style="text-align:center;">載入或生成一份行程後，這裡會依交通方式與離島船票，估算交通費與「可動用餐飲/活動」預算。</div>
        </div>`;
      return;
    }

    const tr = (stops.length >= 2)
      ? estimateTripTransport(stops, { mode, people, destination })
      : estimateTransportRough(destination, mode, people, days);
    // 各站真實門票 + 用餐站餐廳人均（每人）：從可動用預算一併扣除。
    const feesPerPerson = sumStopFeesPerPerson(stops, destination);
    const foodPerPerson = sumStopFoodPerPerson(stops, destination);
    const bd = buildBudgetBreakdown(budget, people, tr.totalPerPerson + feesPerPerson + foodPerPerson);

    // 交通占人均預算比例（無 budget 時不顯示比例）
    let pct = 0, denom = 0;
    if (bd) { denom = bd.tier.perMax || bd.tier.perMin || tr.totalPerPerson; pct = denom > 0 ? Math.min(100, Math.round(tr.totalPerPerson / denom * 100)) : 0; }

    const discMain = bd
      ? `<div class="budget-amount">每人 ${bd.label}</div><div class="budget-label">可動用餐飲 / 活動預算（${count} 人）</div>`
      : `<div class="budget-amount">${money(tr.totalPerPerson)}</div><div class="budget-label">每人交通預估（尚未選預算，無法算可動用額度）</div>`;

    const progressBlock = bd ? `
        <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
        <div style="display: flex; justify-content: space-between; margin-top: 12px; font-size: 13px; color: var(--ink2); font-weight: 500;">
          <span>交通每人 ${money(tr.totalPerPerson)}</span>
          <span>占人均預算 ${pct}%</span>
        </div>` : '';

    const items = [];
    if (tr.ferryPerPerson > 0) items.push({ emoji: '⚓', name: '離島往返船票', val: tr.ferryPerPerson });
    items.push({ emoji: modeEmoji, name: `站間移動（${modeLabel}）`, val: tr.movePerPerson });
    if (feesPerPerson > 0) items.push({ emoji: '💳', name: '景點門票', val: feesPerPerson });
    if (foodPerPerson > 0) items.push({ emoji: '🍽', name: '餐飲（餐廳人均）', val: foodPerPerson });
    const spendTotalPerPerson = tr.totalPerPerson + feesPerPerson + foodPerPerson;
    const receiptRows = items.map(it => `
          <div class="receipt-item">
            <div class="receipt-item-name"><span>${it.emoji}</span> ${it.name}</div>
            <div>每人 ${money(it.val)}</div>
          </div>`).join('');

    const perPersonBudgetText = bd
      ? (bd.tier.perMax == null ? `每人 ${money(bd.tier.perMin)} 以上` : (bd.tier.perMin > 0 ? `每人 ${money(bd.tier.perMin)}–${money(bd.tier.perMax)}` : `每人 ${money(bd.tier.perMax)} 內`))
      : '（未選預算）';

    host.innerHTML = `
      <div class="hero-section" style="padding-bottom: 24px;">
        <div class="hero-title">微旅行花費追蹤</div>
        <div class="hero-meta"><div class="hero-tag">${modeEmoji} 交通預估 每人 ${money(tr.totalPerPerson)}（${count} 人共 ${money(tr.totalPerPerson * count)}）</div></div>
      </div>
      <div class="budget-water-level">
        ${discMain}
        ${progressBlock}
      </div>
      <div class="receipt-container">
        <div class="receipt-card">
          <div class="receipt-header">
            <div class="receipt-day">${(feesPerPerson > 0 || foodPerPerson > 0) ? '花費拆解（每人）' : '交通費拆解（每人）'}</div>
            <div class="receipt-total">${money(spendTotalPerPerson)}</div>
          </div>
          ${receiptRows}
          <div class="receipt-item">
            <div class="receipt-item-name"><span>💰</span> 每人預算</div>
            <div>${perPersonBudgetText}</div>
          </div>
        </div>
        <div style="font-size:12px;color:var(--ink3);margin-top:10px;line-height:1.7;">
          交通費為估算值（離島船票＋站間移動，可在 cost-config.js 調費率）；門票為真實票價、餐飲為餐廳人均消費（Google 價格，僅計有資料者）。可動用（購物/其他）＝每人預算 − 交通${feesPerPerson > 0 ? ' − 門票' : ''}${foodPerPerson > 0 ? ' − 餐飲' : ''}。
        </div>
      </div>`;
  }

  function isMobileLayout() {
    return window.matchMedia('(max-width: 1024px)').matches;
  }

  function updateMobileViewportMetrics() {
    if (!isMobileLayout()) return;
    const header = document.querySelector('.glass-header');
    const headerHeight = header ? Math.ceil(header.getBoundingClientRect().height) : 0;
    document.documentElement.style.setProperty('--mobile-header-height', `${headerHeight || 132}px`);
  }

  function applyMobileMapHeight() {
    const mapPanel = document.getElementById('mapPanel');
    if (!mapPanel) return;

    if (!isMobileLayout()) {
      mapPanel.style.height = '';
      return;
    }

    const mobileMapActive = document.body.classList.contains('mobile-mode-map') || document.body.classList.contains('mobile-role-driver');
    if (!mobileMapActive) {
      mapPanel.style.height = '';
      return;
    }

    const header = document.querySelector('.glass-header');
    const headerHeight = header ? Math.ceil(header.getBoundingClientRect().height) : 0;
    const availableHeight = Math.max(360, window.innerHeight - headerHeight);
    mapPanel.style.setProperty('height', `${availableHeight}px`, 'important');
  }

  function updateDriverPanelState() {
    const panel = document.getElementById('mobileDriverPanel');
    const indicator = document.getElementById('driverPanelToggleIndicator');
    const sub = document.getElementById('driverPanelHandleSub');
    if (!panel) return;

    const collapsed = panel.classList.contains('collapsed');
    if (indicator) indicator.textContent = collapsed ? '▴' : '▾';

    if (sub) {
      const schedule = buildReplanSchedule();
      sub.textContent = collapsed
        ? (schedule[0] ? `下一站：${schedule[0].name} · ${minutesToClock(schedule[0].start)}` : '尚未載入停靠點')
        : (schedule.length ? '地圖導航中 · 可即時改道與掌握停靠點' : '尚未載入行程，請先匯入或新增停靠點');
    }

    updateMobileDriverPanelLayout();
  }

  function updateMobileDriverPanelLayout() {
    if (!isMobileLayout()) {
      document.documentElement.style.removeProperty('--mobile-driver-panel-clearance');
      return;
    }

    const panel = document.getElementById('mobileDriverPanel');
    const isDriverMode = document.body.classList.contains('mobile-role-driver');
    if (!panel || !isDriverMode) {
      document.documentElement.style.removeProperty('--mobile-driver-panel-clearance');
      return;
    }

    const panelRect = panel.getBoundingClientRect();
    const bottomGap = Math.max(0, window.innerHeight - panelRect.bottom);
    const clearance = Math.ceil(panelRect.height + bottomGap + 14);
    document.documentElement.style.setProperty('--mobile-driver-panel-clearance', `${clearance}px`);
  }

  let currentUserRole = 'passenger';

  function setUserRole(role) {
    currentUserRole = role;
    const isDriver = role === 'driver';

    document.body.classList.toggle('mobile-role-driver', isDriver);

    const panel = document.getElementById('mobileDriverPanel');
    if (panel) {
      if (isDriver) {
        panel.classList.add('collapsed');
      } else {
        panel.classList.remove('collapsed');
      }
      updateDriverPanelState();
    }

    const passengerBtn = document.getElementById('mobileRolePassenger');
    const driverBtn = document.getElementById('mobileRoleDriver');
    if (passengerBtn && driverBtn) {
      passengerBtn.classList.toggle('active', !isDriver);
      driverBtn.classList.toggle('active', isDriver);
    }

    if (isMobileLayout()) {
      if (isDriver) {
        setMobileMode('map');
      } else {
        setMobileMode('functions');
      }
    }

    updateMobileDriverPanelLayout();
  }

  function setMobileMode(mode) {
    const showMap = mode === 'map';
    const isCurrSpot = mode === 'current-spot';
    updateMobileViewportMetrics();
    
    if (isCurrSpot) {
      // 進入現在景點時，移除view mode classes
      document.body.classList.remove('mobile-mode-map');
      document.body.classList.remove('mobile-mode-functions');
    } else {
      document.body.classList.toggle('mobile-mode-map', showMap);
      document.body.classList.toggle('mobile-mode-functions', !showMap);
    }

    const fnBtn = document.getElementById('mobileSwitchFunctions');
    const spotBtn = document.getElementById('mobileSwitchSpot');
    const mapBtn = document.getElementById('mobileSwitchMap');
    if (fnBtn && mapBtn && spotBtn) {
      fnBtn.classList.toggle('active', !showMap && !isCurrSpot);
      spotBtn.classList.toggle('active', isCurrSpot);
      mapBtn.classList.toggle('active', showMap);
    }

    if (showMap || isCurrSpot) {
      applyMobileMapHeight();
      refreshMobileMapLayout();
    } else {
      applyMobileMapHeight();
      renderMobileRouteSheet();
    }
  }

  function syncMobileViewMode() {
    updateMobileViewportMetrics();
    if (isMobileLayout()) {
      setUserRole(currentUserRole);
      if (!document.body.classList.contains('mobile-mode-map') && !document.body.classList.contains('mobile-mode-functions')) {
        setMobileMode(currentUserRole === 'driver' ? 'map' : 'functions');
      }
    } else {
      applyMobileMapHeight();
      document.body.classList.remove('mobile-mode-map');
      document.body.classList.remove('mobile-mode-functions');
      document.body.classList.remove('mobile-role-driver');
    }
    applyMobileMapHeight();
    updateMobileDriverPanelLayout();
  }

  let currentVoiceGuide = null;

  function playVoiceGuide() {
    const statusEl = document.getElementById('voiceGuideStatus');
    if (!('speechSynthesis' in window)) {
      if (statusEl) statusEl.textContent = '目前瀏覽器不支援語音導覽。';
      return;
    }

    stopVoiceGuide();

    const stopsList = replanStops.map((s, i) => `第${i+1}站，${(s.name || '').replace('AI建議：', '')}。`).join('');
    const guideText = `歡迎來到${currentTripTitle}。${stopsList}祝你旅途愉快。`;
    const utterance = new SpeechSynthesisUtterance(guideText);
    utterance.lang = 'zh-TW';
    utterance.rate = 1;
    utterance.pitch = 1;

    utterance.onstart = () => {
      if (statusEl) statusEl.textContent = '語音導覽播放中...';
    };

    utterance.onend = () => {
      currentVoiceGuide = null;
      if (statusEl) statusEl.textContent = '導覽結束，可再次播放。';
    };

    utterance.onerror = () => {
      currentVoiceGuide = null;
      if (statusEl) statusEl.textContent = '語音播放失敗，請稍後再試。';
    };

    currentVoiceGuide = utterance;
    window.speechSynthesis.speak(utterance);
  }

  function stopVoiceGuide() {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    currentVoiceGuide = null;
    const statusEl = document.getElementById('voiceGuideStatus');
    if (statusEl) statusEl.textContent = '語音導覽已停止。';
  }

  function getGeminiApiKey() {
    const fromEnv = window.TRAVEL_APP_CONFIG && window.TRAVEL_APP_CONFIG.GEMINI_API_KEY;
    if (typeof fromEnv === 'string' && fromEnv.trim()) {
      return fromEnv.trim();
    }

    const fromStorage = window.localStorage.getItem(GEMINI_LOCAL_KEY);
    if (typeof fromStorage === 'string' && fromStorage.trim()) {
      return fromStorage.trim();
    }
    return '';
  }

  function setGeminiApiKey(apiKey) {
    const next = String(apiKey || '').trim();
    if (!next) return;
    window.localStorage.setItem(GEMINI_LOCAL_KEY, next);
  }

  function getVertexConfig() {
    const cfg = window.TRAVEL_APP_CONFIG || {};
    const apiKey = (cfg.VERTEX_API_KEY || '').trim() || (window.localStorage.getItem(VERTEX_LOCAL_KEY) || '').trim();
    const projectId = (cfg.VERTEX_PROJECT_ID || '').trim() || (window.localStorage.getItem(VERTEX_LOCAL_PROJECT) || '').trim();
    // 代理模式下前端沒有金鑰也視為 ready（金鑰在伺服器）；直連模式仍需 apiKey + projectId。
    const proxied = !!VERTEX_PROXY_BASE;
    return { apiKey, projectId, proxied, ready: proxied || !!(apiKey && projectId) };
  }

  // 代理模式的 Vertex 呼叫需要登入（後端驗 Firebase ID token，防止陌生人燒 Vertex 額度）。
  // 未登入時不帶 Authorization（後端回 401，由呼叫端顯示友善訊息）。
  async function vertexAuthHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    try {
      const u = (typeof firebaseAuth !== 'undefined' && firebaseAuth) ? firebaseAuth.currentUser : null;
      if (u) headers.Authorization = 'Bearer ' + (await u.getIdToken());
    } catch (_e) { /* token 取失敗就不帶，讓後端 401 */ }
    return headers;
  }

  function vertexHttpError(status, kind) {
    if (status === 401) return new Error('請先登入，登入後才能使用 AI 生成功能。');
    if (status === 429) return new Error('AI 請求過於頻繁，請休息一下再試。');
    return new Error(`${kind}（${status}）`);
  }

  function initFirebaseIfConfigured() {
    const config = window.TRAVEL_APP_CONFIG && window.TRAVEL_APP_CONFIG.FIREBASE_CONFIG;
    if (!window.firebase || !config) return false;
    if (!config.apiKey || !config.projectId) return false;

    try {
      if (!firebase.apps.length) {
        firebase.initializeApp(config);
      }
      firebaseDb = firebase.firestore();
      // 強制 long-polling：避開會 400 Bad Request 的串流 Listen 通道，讓 onSnapshot 即時更新可靠。
      // merge:true 不覆蓋預設 host（消除 "overriding the original host" 警告）；ignoreUndefinedProperties 避免 undefined 欄位害寫入整批失敗。
      try { firebaseDb.settings({ experimentalForceLongPolling: true, ignoreUndefinedProperties: true, merge: true }); } catch (e) { /* 已啟動則略過 */ }
      if (firebase.storage && config.storageBucket) {
        firebaseStorage = firebase.storage();
      }
      firebaseAuth = firebase.auth();
      firebaseEnabled = true;
      return true;
    } catch (error) {
      console.warn('Firebase 初始化失敗：', error);
      firebaseEnabled = false;
      return false;
    }
  }

  function buildItinerarySnapshot() {
    const schedule = buildReplanSchedule();
    return schedule.map((stop, index) => ({
      order: index + 1,
      id: stop.id,
      name: stop.name,
      emoji: stop.emoji,
      start: minutesToClock(stop.start),
      end: minutesToClock(stop.end),
      stayMin: stop.computedStayMin,
      transitMin: stop.transit || 0,
      transitMode: normalizeTransitMode(stop.transitMode),
      mapPinId: stop.mapPinId || null
    }));
  }

  async function logTripEvent(eventType, payload = {}) {
    if (!firebaseEnabled || !firebaseDb) return;
    // 安全規則要求登入才能寫事件：未登入直接略過，避免每個操作都噴 permission-denied
    if (typeof firebaseAuth === 'undefined' || !firebaseAuth || !firebaseAuth.currentUser) return;
    try {
      await firebaseDb
        .collection('travel_sessions')
        .doc(currentItineraryId)
        .collection('events')
        .add({
          eventType,
          sessionId: tripSessionId,
          tripId: currentItineraryId,
          tripTitle: currentTripTitle,
          payload,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch (error) {
      console.warn('Firebase 寫入失敗：', error);
    }
  }

  function ensureGeminiApiKey() {
    const existing = getGeminiApiKey();
    if (existing) return existing;
    const input = window.prompt('請先輸入 Gemini API Key（只會保存在你的瀏覽器 localStorage）');
    const apiKey = String(input || '').trim();
    if (!apiKey) return '';
    setGeminiApiKey(apiKey);
    return apiKey;
  }

  function getReplanSummaryText() {
    const schedule = buildReplanSchedule();
    if (!schedule.length) return '目前沒有行程資料。';
    return schedule.map((stop, index) => {
      const transit = stop.transit ? `，下一段${getTransitSummaryText(stop.transitMode, stop.transit)}` : '';
      return `${index + 1}. ${minutesToClock(stop.start)}-${minutesToClock(stop.end)} ${stop.name}（停留 ${stop.computedStayMin} 分鐘${transit}）`;
    }).join('\n');
  }

  function findStopByHint(hint) {
    if (!hint) return null;
    const source = String(hint).trim();
    if (!source) return null;

    const byId = replanStops.find((stop) => stop.id === source);
    if (byId) return byId;

    const normalized = normalizeText(source);
    if (!normalized) return null;

    return replanStops.find((stop) => {
      const stopNorm = normalizeText(stop.name);
      return stopNorm === normalized || stopNorm.includes(normalized) || normalized.includes(stopNorm);
    }) || null;
  }

  function sanitizeActionStop(rawStop) {
    const name = String(rawStop && rawStop.name || '').trim();
    if (!name) return null;

    const desc = String(rawStop.desc || rawStop.summary || rawStop.note || '').trim();
    const stayMin = Number.parseInt(rawStop.stayMin, 10);
    const transitMin = Number.parseInt(rawStop.transitMin, 10);
    const scenicCoordinateSource = rawStop.scenicCoordinates || rawStop['景點座標'] || rawStop.coordinates || rawStop.position || null;
    const scenicCoordinates = readCoordinateObject(scenicCoordinateSource);
    
    // 提取廁所座標
    const toiletLocations = [];
    const toiletSource = rawStop.toiletLocations || rawStop['廁所座標'] || rawStop.nearbyToilets || [];
    if (Array.isArray(toiletSource)) {
      toiletSource.forEach((toilet) => {
        if (toilet && typeof toilet === 'object') {
          const toiletName = String(toilet.name || toilet.title || '廁所').trim() || '廁所';
          const toiletCoord = readCoordinateObject(toilet.coordinates || toilet.position || toilet);
          if (toiletCoord && Number.isFinite(toiletCoord.lat) && Number.isFinite(toiletCoord.lng)) {
            toiletLocations.push({
              name: toiletName,
              lat: toiletCoord.lat,
              lng: toiletCoord.lng,
              address: toilet.address || toilet.vicinity || toilet.location || '',
              source: toilet.source || toilet.coordinateSource || '',
              confidence: toilet.confidence || ''
            });
          }
        } else if (typeof toilet === 'string') {
          toiletLocations.push({ name: toilet });
        }
      });
    }
    
    return {
      baseId: 'ai',
      emoji: String(rawStop.emoji || '📍').slice(0, 2),
      name,
      desc,
      stayMin: Number.isFinite(stayMin) ? Math.max(5, Math.min(stayMin, 180)) : 20,
      transitMin: Number.isFinite(transitMin) ? Math.max(0, Math.min(transitMin, 90)) : null,
      transitMode: normalizeTransitMode(rawStop.transitMode),
      scenicCoordinates,
      toiletLocations
    };
  }

  async function applyAiItineraryActions(actions) {
    if (!Array.isArray(actions) || !actions.length) {
      return { changed: false, logs: [] };
    }

    const logs = [];
    let changed = false;

    for (const actionRaw of actions) {
      const action = actionRaw || {};
      const type = String(action.type || '').trim();
      if (!type) continue;

      if (type === 'add_stop') {
        const template = sanitizeActionStop(action.stop || action.newStop || action);
        if (!template) continue;
        const validatedTemplate = await validateAiStopTemplate(template, currentTripRegion, currentTripTitle);
        if (!validatedTemplate) {
          logs.push(`忽略：${template.name} 無法驗證為指定地區的真實景點`);
          continue;
        }
        const duplicate = findDuplicateStopByName(template.name);
        if (duplicate) {
          logs.push(`已有同名景點：${duplicate.name}`);
          continue;
        }

        const created = createStopFromTemplate(validatedTemplate);
        const beforeStop = findStopByHint(action.insertBefore);
        const afterStop = findStopByHint(action.insertAfter);

        if (beforeStop) {
          const beforeIndex = replanStops.findIndex((s) => s.id === beforeStop.id);
          replanStops.splice(Math.max(0, beforeIndex), 0, created);
        } else if (afterStop) {
          const afterIndex = replanStops.findIndex((s) => s.id === afterStop.id);
          replanStops.splice(afterIndex + 1, 0, created);
        } else {
          const returnIndex = replanStops.findIndex((stop) => normalizeText(stop.name).includes('回到車站') || stop.id === 'return');
          const insertAt = returnIndex >= 0 ? returnIndex : replanStops.length;
          replanStops.splice(insertAt, 0, created);
        }

        changed = true;
        logs.push(`新增：${created.name}`);
        continue;
      }

      if (type === 'remove_stop') {
        const target = findStopByHint(action.target || action.stopName || action.stopId);
        if (!target || replanStops.length <= 1) continue;
        replanStops = replanStops.filter((stop) => stop.id !== target.id);
        if (activeStopMenuId === target.id) activeStopMenuId = null;
        changed = true;
        logs.push(`移除：${target.name}`);
        continue;
      }

      if (type === 'replace_stop') {
        const target = findStopByHint(action.target || action.stopName || action.stopId);
        const replacement = sanitizeActionStop(action.newStop || action.replacement || action.stop);
        if (!target || !replacement) continue;
        const validatedReplacement = await validateAiStopTemplate(replacement, currentTripRegion, currentTripTitle);
        if (!validatedReplacement) {
          logs.push(`忽略：${replacement.name} 無法驗證為指定地區的真實景點`);
          continue;
        }
        target.name = validatedReplacement.name;
        target.emoji = validatedReplacement.emoji;
        target.stayMin = validatedReplacement.stayMin;
        target.transitMin = validatedReplacement.transitMin;
        target.transitMode = normalizeTransitMode(validatedReplacement.transitMode);
        target.scenicCoordinates = validatedReplacement.scenicCoordinates || target.scenicCoordinates || null;
        target.nearbyToiletLocations = validatedReplacement.toiletLocations && validatedReplacement.toiletLocations.length > 0 
          ? validatedReplacement.toiletLocations 
          : (target.nearbyToiletLocations || []);
        changed = true;
        logs.push(`替換：${target.name}`);
        continue;
      }

      if (type === 'set_time') {
        const target = findStopByHint(action.target || action.stopName || action.stopId);
        if (!target) continue;
        const startMin = clockToMinutes(String(action.start || ''));
        const endMin = clockToMinutes(String(action.end || ''));
        if (!Number.isFinite(startMin) || !Number.isFinite(endMin) || endMin <= startMin) continue;
        target.manualStartMin = startMin;
        target.manualEndMin = endMin;
        target.stayMin = endMin - startMin;
        // 檢查並自動調整重疊的後續行程
        adjustOverlappingStops(target.id);
        changed = true;
        logs.push(`調整時間：${target.name} ${minutesToClock(startMin)}-${minutesToClock(endMin)}`);
        continue;
      }

      if (type === 'reorder' && Array.isArray(action.orderedNames) && action.orderedNames.length) {
        const ordered = [];
        action.orderedNames.forEach((name) => {
          const stop = findStopByHint(name);
          if (stop && !ordered.some((item) => item.id === stop.id)) {
            ordered.push(stop);
          }
        });
        replanStops.forEach((stop) => {
          if (!ordered.some((item) => item.id === stop.id)) {
            ordered.push(stop);
          }
        });
        if (ordered.length === replanStops.length) {
          replanStops = ordered;
          changed = true;
          logs.push('重新排序行程');
        }
      }
    }

    if (changed) {
      isReplanning = true;
      updateItineraryStageUI();
      renderReplanBoard();
      refreshRouteDirections();
      void syncMapToCurrentTrip();
      logTripEvent('itinerary_updated_by_ai', {
        actionLogs: logs,
        itinerary: buildItinerarySnapshot()
      });
    }

    return { changed, logs };
  }

  function appendAiMessage(role, text, cardData) {
    const area = document.getElementById('aiChatArea');
    if (!area) return;

    const msgClass = role === 'user' ? 'msg-user' : 'msg-ai';
    const avatar = role === 'user' ? '🧍' : '🤖';

    const wrapper = document.createElement('div');
    wrapper.className = `chat-msg ${msgClass}`;

    wrapper.innerHTML = `
      <div class="chat-avatar">${avatar}</div>
      <div>
        <div class="chat-bubble">${escapeHtml(text).replace(/\n/g, '<br>')}</div>
      </div>
    `;

    if (cardData && cardData.title) {
      const contentWrap = wrapper.querySelector('.chat-bubble').parentElement;
      const cardEl = document.createElement('div');
      cardEl.className = 'action-card';
      cardEl.setAttribute('role', 'button');
      cardEl.tabIndex = 0;
      cardEl.innerHTML = `
        <div>
          <div style="font-weight: 600; font-size: 13px; color: var(--accent-dark);">${escapeHtml(cardData.title)}</div>
          <div style="font-size: 11px; color: var(--accent);">${escapeHtml(cardData.subtitle || '可加入目前行程')}</div>
        </div>
        <div style="background: #fff; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: var(--accent); font-weight: bold;">+</div>
      `;
      const runCardAction = () => handleAiRecommendationAction(cardData, cardEl);
      cardEl.addEventListener('click', runCardAction);
      cardEl.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          runCardAction();
        }
      });
      contentWrap.appendChild(cardEl);
    }

    area.appendChild(wrapper);
    area.scrollTop = area.scrollHeight;
  }

  function getActiveTripSignals() {
    const normalizedStops = replanStops.map((stop) => normalizeText(stop.name));
    const interests = Array.isArray(currentTripPreferences.interests) ? currentTripPreferences.interests : [];
    const pace = String(currentTripPreferences.pace || '').trim();
    const peopleText = String(currentTripPreferences.people || '').trim();
    const peopleCount = Number.parseInt(peopleText, 10);
    const startMin = getReplanStartMinutes();
    const endMin = clockToMinutes(currentTripWindow.end) || (startMin + 105);
    const durationMin = Math.max(30, endMin - startMin);
    return {
      region: currentTripRegion || currentTripTitle,
      interests,
      pace,
      peopleCount: Number.isFinite(peopleCount) ? peopleCount : 2,
      durationMin,
      stopNames: normalizedStops,
      theme: String(currentTripPreferences.theme || '').trim()
    };
  }

  function buildPersonalizedAiSuggestion() {
    const signals = getActiveTripSignals();
    const contextText = normalizeText([
      currentTripTitle,
      currentTripRegion,
      signals.theme,
      signals.interests.join(' '),
      replanStops.map((stop) => stop.name).join(' ')
    ].join(' '));
    const paceIsTight = signals.durationMin <= 120 || signals.pace.includes('緊');
    const paceIsRelaxed = signals.pace.includes('鬆') || signals.pace.includes('慢') || signals.durationMin >= 180;
    const hasFoodInterest = signals.interests.some((item) => /美食|甜點|小吃|咖啡/.test(item)) || /咖啡|甜點|市場|夜市|美食/.test(contextText);
    const hasCultureInterest = signals.interests.some((item) => /文創|散步|拍照|書店/.test(item)) || /文創|書店|散策|小店/.test(contextText);
    const hasViewInterest = signals.interests.some((item) => /海景|自然|風景|夕陽/.test(item)) || /海|港|河|景|公園/.test(contextText);
    const withGroup = signals.peopleCount >= 4;

    let template = {
      intro: `嗨！我是你的 TravelLink 專屬助理。你這趟「${currentTripTitle}」大約有 ${Math.round(signals.durationMin / 5) * 5} 分鐘可運用，我先幫你挑一個不會拖慢節奏的備用點。`,
      recommendation: {
        title: `順路補給：${signals.region} 在地輕食小店`,
        subtitle: `步行 4 分鐘 · 停留 20 分鐘 · 適合目前節奏`,
        stop: {
          name: `${signals.region} 在地輕食小店`,
          emoji: '🥪',
          stayMin: 20
        },
        insertBefore: null
      }
    };

    if (hasFoodInterest && paceIsTight) {
      template = {
        intro: `看起來你這趟時間比較精簡，我改推一個補給型停點，比較不會壓縮到後面的行程。`,
        recommendation: {
          title: `快閃推薦：${signals.region} 甜點補給`,
          subtitle: `步行 3 分鐘 · 停留 15 分鐘 · 適合短時段微旅行`,
          stop: {
            name: `${signals.region} 甜點補給`,
            emoji: '🍰',
            stayMin: 15
          },
          insertBefore: null
        }
      };
    } else if (hasCultureInterest) {
      template = {
        intro: `你這趟有文創散步的味道，我幫你挑了一個能延續氣氛、又不會繞太遠的點。`,
        recommendation: {
          title: `風格加碼：${signals.region} 獨立書店`,
          subtitle: `步行 5 分鐘 · 停留 20 分鐘 · 適合文青散策`,
          stop: {
            name: `${signals.region} 獨立書店`,
            emoji: '📚',
            stayMin: 20
          },
          insertBefore: null
        }
      };
    } else if (hasViewInterest) {
      template = {
        intro: `這條路線很適合多留一個拍照喘口氣的節點，我挑了一個視野型停靠點給你。`,
        recommendation: {
          title: `景色推薦：${signals.region} 觀景散步點`,
          subtitle: `步行 6 分鐘 · 停留 20 分鐘 · 適合拍照放空`,
          stop: {
            name: `${signals.region} 觀景散步點`,
            emoji: '🌅',
            stayMin: 20
          },
          insertBefore: null
        }
      };
    } else if (withGroup || paceIsRelaxed) {
      template = {
        intro: `你這趟節奏偏輕鬆，也比較適合加一個大家都能一起停留的小段休息。`,
        recommendation: {
          title: `順遊推薦：${signals.region} 茶飲休息站`,
          subtitle: `步行 4 分鐘 · 停留 18 分鐘 · 適合多人小歇`,
          stop: {
            name: `${signals.region} 茶飲休息站`,
            emoji: '🍵',
            stayMin: 18
          },
          insertBefore: null
        }
      };
    }

    // 防呆：若 template 化推薦名稱剛好撞到行程中既有景點 / 已去過 / 被封鎖名單，回退到基本「在地輕食小店」
    const recName = template.recommendation?.stop?.name;
    if (recName) {
      const recNorm = (recName || '').replace(/\s/g, '').toLowerCase();
      const conflicts = findDuplicateStopByName(recName)
        || (typeof isPlaceVisited === 'function' && isPlaceVisited(recName))
        || ((typeof getBlockedSpotNames === 'function')
            && getBlockedSpotNames(currentTripRegion || '').some(n => n.replace(/\s/g, '').toLowerCase() === recNorm));
      if (conflicts) {
        template.recommendation = {
          title: `順路補給：${signals.region} 在地輕食小店`,
          subtitle: `步行 4 分鐘 · 停留 20 分鐘 · 適合目前節奏`,
          stop: { name: `${signals.region} 在地輕食小店`, emoji: '🥪', stayMin: 20 },
          insertBefore: null
        };
      }
    }

    return template;
  }

  function renderAiWelcomeMessage(force = false) {
    const area = document.getElementById('aiChatArea');
    if (!area) return;

    const signature = JSON.stringify({
      title: currentTripTitle,
      region: currentTripRegion,
      start: currentTripWindow.start,
      end: currentTripWindow.end,
      preferences: currentTripPreferences,
      stops: replanStops.map((stop) => `${stop.name}:${stop.stayMin}:${stop.transitMin}`)
    });

    if (!force && aiConversationHistory.length > 0) return;
    if (!force && aiWelcomeSignature === signature && area.childElementCount > 0) return;

    aiWelcomeSignature = signature;
    area.innerHTML = '';
    const welcome = buildPersonalizedAiSuggestion();
    appendAiMessage('ai', welcome.intro, welcome.recommendation);
  }

  // 推薦景點驗證失敗時的備援：用 Google Places 在目的地附近找一個可信景點
  async function findNearbyFallbackStop(originalStop, region, title) {
    const service = getPlacesService();
    if (!service || !region) return null;

    const center = await resolveTripCenterAsync(region, title);
    if (!center || !Number.isFinite(center.lat) || !Number.isFinite(center.lng)) return null;

    const norm = (s) => String(s || '').replace(/\s/g, '').toLowerCase();
    const existing = new Set(replanStops.map(s => norm(s.name)));
    const visited = new Set(getVisitedPlaces().map(p => norm(p.name)));
    const blocked = new Set((getBlockedSpotNames(region) || []).map(norm));

    // 從原推薦的 desc/emoji 抓關鍵字作為 fallback 搜尋方向
    const desc = String(originalStop?.desc || originalStop?.name || '');
    const hintMap = [
      ['散步', '景觀'], ['步道', '步道'], ['瀑布', '瀑布'], ['咖啡', '咖啡'],
      ['美食', '餐廳'], ['夜市', '夜市'], ['海', '海邊'], ['公園', '公園'],
      ['溫泉', '溫泉'], ['拍照', '景觀'], ['文化', '文化景點']
    ];
    const matched = hintMap.find(([kw]) => desc.includes(kw));
    const queries = matched
      ? [`${region} ${matched[1]}`, `${region} 熱門景點`]
      : [`${region} 熱門景點`, `${region} 景點`];

    const okStatus = () => hasGooglePlacesService()
      ? google.maps.places.PlacesServiceStatus.OK : 'OK';

    for (const q of queries) {
      const results = await new Promise((resolve) => {
        service.textSearch({
          query: q,
          location: new google.maps.LatLng(center.lat, center.lng),
          radius: 8000
        }, (res, status) => {
          if (status !== okStatus() || !Array.isArray(res)) return resolve([]);
          resolve(res);
        });
      });

      for (const place of results) {
        const name = place.name || '';
        if (!name) continue;
        const key = norm(name);
        if (existing.has(key) || visited.has(key) || blocked.has(key)) continue;
        const loc = place.geometry?.location;
        if (!loc) continue;
        const pos = { lat: loc.lat(), lng: loc.lng() };
        if (isCoordinatesOutsideRegion(pos, region, title)) continue;

        return {
          emoji: originalStop?.emoji || '📍',
          name,
          desc: place.formatted_address || '由附近熱門景點推薦',
          stayMin: originalStop?.stayMin || 30,
          transitMin: originalStop?.transitMin || null,
          transitMode: originalStop?.transitMode || null,
          scenicCoordinates: pos
        };
      }
    }

    return null;
  }

  async function handleAiRecommendationAction(cardData, cardEl) {
    if (!cardData || !cardData.stop) return;

    const applyResult = await applyAiItineraryActions([{
      type: 'add_stop',
      stop: cardData.stop,
      insertBefore: cardData.insertBefore,
      insertAfter: cardData.insertAfter
    }]);

    const addedName = cardData.stop.name || '推薦景點';
    if (!applyResult.changed) {
      const duplicate = findDuplicateStopByName(addedName);
      if (duplicate) {
        isReplanning = true;
        activeStopMenuId = duplicate.id;
        updateItineraryStageUI();
        renderReplanBoard();
        refreshRouteDirections();
        appendAiMessage('ai', `這個推薦我已經先放在你的行程裡了，我幫你定位到「${duplicate.name}」，可以直接微調順序或時間。`);
        return;
      }

      // 原推薦驗證失敗（Google Places 查不到）→ 改推目的地附近的熱門景點
      const fallback = await findNearbyFallbackStop(cardData.stop, currentTripRegion, currentTripTitle);
      if (fallback) {
        const fallbackResult = await applyAiItineraryActions([{
          type: 'add_stop',
          stop: fallback,
          insertBefore: cardData.insertBefore,
          insertAfter: cardData.insertAfter
        }]);
        if (fallbackResult.changed) {
          isReplanning = true;
          const insertedFallback = findDuplicateStopByName(fallback.name);
          if (insertedFallback) activeStopMenuId = insertedFallback.id;
          updateItineraryStageUI();
          renderReplanBoard();
          refreshRouteDirections();
          appendAiMessage('ai', `「${addedName}」在 Google 地圖上找不到對應的景點座標，我幫你改推附近的「${fallback.name}」，可以直接調整看看。`);
          logTripEvent('chat_recommendation_fallback_applied', {
            original: addedName,
            fallback: fallback.name,
            itinerary: buildItinerarySnapshot()
          });
          return;
        }
      }

      appendAiMessage('ai', `「${addedName}」目前沒有成功加入，附近也找不到合適的替代景點，請再點一次或直接告訴我你想怎麼調整。`);
      return;
    }

    isReplanning = true;
    const insertedStop = findDuplicateStopByName(addedName);
    if (insertedStop) activeStopMenuId = insertedStop.id;
    updateItineraryStageUI();
    renderReplanBoard();
    refreshRouteDirections();
    appendAiMessage('ai', `已幫你把「${addedName}」加入行程，接在順路的位置。你現在可以直接調整順序，或再叫我幫你換成別種風格。`);
    logTripEvent('chat_recommendation_applied', {
      recommendation: cardData,
      itinerary: buildItinerarySnapshot()
    });

    if (cardEl) {
      cardEl.style.opacity = '0.7';
      cardEl.style.cursor = 'default';
      cardEl.innerHTML = `
        <div>
          <div style="font-weight: 600; font-size: 13px; color: var(--accent-dark);">${escapeHtml(cardData.title)}</div>
          <div style="font-size: 11px; color: var(--accent);">已加入目前行程</div>
        </div>
        <div style="background: #fff; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: var(--accent); font-weight: bold;">✓</div>
      `;
      cardEl.replaceWith(cardEl.cloneNode(true));
    }
  }

  function setAiInputState(disabled) {
    const input = document.getElementById('aiChatInput');
    const button = document.getElementById('aiChatSendBtn');
    if (input) input.disabled = disabled;
    if (button) button.disabled = disabled;
  }

  function buildGeminiSystemPrompt() {
    return [
      '你是 TravelLink 的隨行管家 AI。',
      '請以繁體中文回答。',
      '你的任務是：即時推薦景點、餐廳、備案，並在需要時幫使用者調整行程。',
      '回傳必須是 JSON，不要使用 markdown code block。',
      '【重要指令】當使用者明確要求「新增」景點或行程時，請務必使用 "add_stop" 動作，千萬不要使用 "replace_stop" 覆蓋原有的行程。',
      '【重要指令】新增景點時，stop 請一併提供 "景點座標"，格式為 {"lat": 數字, "lng": 數字}；若已知 Firebase 中的同名景點，請沿用相同座標與資訊，不要重新生成。',
      '【廁所座標】新增景點時，請同時提供 "廁所座標" 陣列（最多 3 個附近廁所），格式為 [{"name": "廁所正式名稱", "lat": 數字, "lng": 數字, "address": "地址或位置描述", "source": "資料來源", "confidence": "high|medium"}, ...]。',
      '【廁所座標精度】廁所 lat/lng 必須是實際廁所/公廁入口或設施點位的 WGS84 decimal degrees，至少 6 位小數，且距離該景點 500 公尺內；不得用景點座標、停車場、行政區中心、道路中心或概略區域座標替代。',
      '【廁所座標查證】若無法確認廁所名稱與座標互相對應，或資料來源互相矛盾，請保留廁所 name/address 但省略 lat/lng；完全無可信資料時傳空陣列 []。',
      '【去重指令】推薦景點時，必須先檢查 context 中「已在行程中」的禁止清單，禁止推薦清單上的景點。如使用者要求更換現有景點，請用 "replace_stop" 而非 "add_stop"。',
      'JSON 格式：',
      '{',
      '  "reply": "給使用者看的自然語句",',
      '  "recommendation": {"title": "可選", "subtitle": "可選"},',
      '  "actions": [',
      '    {"type": "add_stop", "stop": {"name": "景點名", "emoji": "🍜", "stayMin": 30, "景點座標": {"lat": 0, "lng": 0}, "廁所座標": [{"name": "廁所A", "lat": 0, "lng": 0, "address": "地址", "source": "資料來源", "confidence": "high"}]}, "insertAfter": "可選"},',
      '    {"type": "remove_stop", "target": "景點名"},',
      '    {"type": "replace_stop", "target": "景點名", "newStop": {"name": "新景點", "emoji": "🌇", "stayMin": 25, "景點座標": {"lat": 0, "lng": 0}, "廁所座標": []}},',
      '    {"type": "set_time", "target": "景點名", "start": "15:10", "end": "15:40"},',
      '    {"type": "reorder", "orderedNames": ["景點A", "景點B"]}',
      '  ]',
      '}',
      '如果不需要調整，actions 回傳空陣列。'
    ].join('\n');
  }

  function safeParseJson(text) {
    if (!text) return null;
    const direct = String(text).trim();
    try {
      return JSON.parse(direct);
    } catch (error) {
      const fenced = direct
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/```$/i, '')
        .trim();
      try {
        return JSON.parse(fenced);
      } catch (e2) {
        return null;
      }
    }
  }

  // ── AI 重新規劃 ──────────────────────────────────────────────

  // 將「天數字串」統一轉成分鐘（支援 N小時 / 兩天一夜，並相容舊字串）
  function parseDurationMinutes(days) {
    const s = String(days || '').trim();
    if (s === '2天' || s === '兩天一夜') return 960;
    const h = s.match(/^(\d+(?:\.\d+)?)\s*小時$/);
    if (h) return Math.round(parseFloat(h[1]) * 60);
    if (s === '半天') return 240;
    if (s === '1天')  return 480;
    return 480;
  }

  // 人數 → 整數（容錯舊字串：「6人」→6、「3-4人」→3、「5-8人」→5、「1人」→1）
  function getPeopleCount(people) {
    const n = parseInt(String(people || ''), 10);
    return Number.isFinite(n) && n > 0 ? Math.min(20, n) : 2;
  }
  // 人數分級：影響站數（stopDelta）與 prompt 的景點/用餐指示
  function getPeopleProfile(people) {
    const count = getPeopleCount(people);
    if (count <= 1) return { count, tier: 'solo', stopDelta: 0,
      planRule: '獨旅行程：重視個人節奏與安靜體驗，景點不須考慮大型團體容納量，可含較私密、需排隊或單人友善的場所',
      introSentence: '生成一份適合獨旅者的完整可執行行程，重視個人節奏、自我探索與彈性安排，景點偏向可獨自前往的地點' };
    if (count <= 3) return { count, tier: 'small', stopDelta: 0,
      planRule: `${count} 人小型同行：安排彈性高，可含精緻小店、咖啡廳或需短暫排隊的人氣店；用餐選擇不受大團體限制`,
      introSentence: `生成一份適合 ${count} 人小型同行的完整可執行行程，安排靈活、可兼顧個別喜好` };
    if (count <= 6) return { count, tier: 'medium', stopDelta: -1,
      planRule: `${count} 人中型同行：優先安排可容納 ${count} 人的餐廳並預留訂位時段，避免座位極少或排隊過久的店；景點適合多人共同停留，站與站之間預留集合與移動緩衝`,
      introSentence: `生成一份適合 ${count} 人中型團體的完整可執行行程，考慮團體動態與共同用餐安排` };
    return { count, tier: 'large', stopDelta: -2,
      planRule: `${count} 人大型團體：景點與餐廳必須能容納大團體、強烈建議事先訂位並安排共同用餐；避免狹小空間、長時間排隊或單人體驗型場所；集合、上下車與移動需預留更多緩衝，站點精簡、每站停留拉長`,
      introSentence: `生成一份適合 ${count} 人大型團體的完整可執行行程，全程選擇可接待大團體的場所、預留訂位與共同用餐時段，並安排充足的集合緩衝` };
  }

  // 預算（人均）→ prompt 字串：人均＋依人數換算的整團總額（鏡像 explore 的 describeBudget，v8 無預算 UI、僅帶值）
  function describeBudgetForPrompt(budget, people) {
    const str = String(budget || '').trim();
    if (!str) return '';
    const tiers = [
      { key: '節省', perMin: 0,    perMax: 500 },
      { key: '適中', perMin: 500,  perMax: 1500 },
      { key: '舒適', perMin: 1500, perMax: 3000 },
      { key: '豪華', perMin: 3000, perMax: null }
    ];
    let tier = tiers.find(t => str.includes(t.key));
    if (!tier) {
      const nums = (str.match(/\d[\d,]*/g) || []).map(n => parseInt(n.replace(/,/g, ''), 10)).filter(Number.isFinite);
      if (nums.length) {
        const amount = Math.max(...nums);
        tier = tiers.find(t => t.perMax == null ? amount >= t.perMin : amount <= t.perMax) || tiers[tiers.length - 1];
      }
    }
    if (!tier) return str; // 無法解析→原樣帶入
    const count = getPeopleCount(people);
    const money = n => '$' + Math.round(n).toLocaleString('en-US');
    const open = tier.perMax == null;
    const per = open ? `${money(tier.perMin)} 以上` : (tier.perMin > 0 ? `${money(tier.perMin)}–${money(tier.perMax)}` : `${money(tier.perMax)} 內`);
    const group = open ? `${money(tier.perMin * count)}+` : (tier.perMin > 0 ? `${money(tier.perMin * count)}–${money(tier.perMax * count)}` : `${money(tier.perMax * count)} 內`);
    return `每人 ${per}（${count} 人共約 ${group}）`;
  }

  // === 交通費估算（讀 window.WAI_COST_CONFIG；缺檔時回退 0/null，不影響既有功能）===
  function getCostConfig() {
    return (typeof window !== 'undefined' && window.WAI_COST_CONFIG && typeof window.WAI_COST_CONFIG === 'object') ? window.WAI_COST_CONFIG : null;
  }
  // 目的地 → 離島每人往返船票（非離島回 0）。正規化沿用 getLocalPoiList：臺→台、去縣市、寬鬆比對。
  function getFerryRoundTrip(destination) {
    const cfg = getCostConfig();
    if (!cfg || !cfg.ferryRoundTrip) return 0;
    const norm = (s) => String(s || '').trim().replace(/臺/g, '台');
    const dest = norm(destination);
    if (!dest) return 0;
    const stripped = dest.replace(/[縣市]$/u, '').trim();
    for (const key of Object.keys(cfg.ferryRoundTrip)) {
      const k = norm(key);
      if (k === dest || (stripped && k === stripped) || dest.includes(k) || k.includes(dest) || (stripped && (stripped.includes(k) || k.includes(stripped)))) {
        const v = Number(cfg.ferryRoundTrip[key]);
        if (Number.isFinite(v) && v > 0) return v;
      }
    }
    return 0;
  }
  function getTripDayCount(days) {
    const m = String(days || '').match(/(\d+)\s*天/);
    if (m) return Math.max(1, parseInt(m[1], 10));
    return 1;
  }
  function readCostStopCoord(s) {
    if (!s) return null;
    const lat = Number(s.lat), lng = Number(s.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
    const c = s.scenicCoordinates || s.coordinates || s['景點座標'];
    if (c && Number.isFinite(Number(c.lat)) && Number.isFinite(Number(c.lng))) return { lat: Number(c.lat), lng: Number(c.lng) };
    return null;
  }
  function estimateLegCost(distMeters, mode) {
    const cfg = getCostConfig();
    const r = cfg && cfg.modeRates && cfg.modeRates[mode] ? cfg.modeRates[mode] : (cfg && cfg.modeRates ? cfg.modeRates.car : null);
    if (!r) return 0;
    const km = Math.max(0, Number(distMeters) || 0) / 1000;
    return (Number(r.base) || 0) + (Number(r.perKm) || 0) * km;
  }
  // 精算（卡片/重新規劃用）：逐段距離×費率；非 perPerson 模式按乘載折算每人。回每人金額。
  function estimateTripTransport(stops, opts) {
    const o = opts || {};
    const cfg = getCostConfig();
    const count = getPeopleCount(o.people);
    const modeKey = (cfg && cfg.modeRates && cfg.modeRates[o.mode]) ? o.mode : 'car';
    const r = cfg && cfg.modeRates ? cfg.modeRates[modeKey] : null;
    const ferryPerPerson = getFerryRoundTrip(o.destination);
    let movePerPerson = 0;
    const list = Array.isArray(stops) ? stops.filter(readCostStopCoord) : [];
    if (r && list.length >= 2) {
      let legSum = 0;
      for (let i = 1; i < list.length; i++) {
        const a = readCostStopCoord(list[i - 1]), b = readCostStopCoord(list[i]);
        legSum += estimateLegCost(approxDistanceMeters(a.lat, a.lng, b.lat, b.lng), modeKey);
      }
      if (r.perPerson) {
        movePerPerson = Math.round(legSum); // 大眾：每人每趟
      } else {
        const vehicles = Math.max(1, Math.ceil(count / (Number(r.capacity) || 1)));
        movePerPerson = Math.round((legSum * vehicles) / count);
      }
    }
    return { ferryPerPerson, movePerPerson, totalPerPerson: ferryPerPerson + movePerPerson, count, modeKey };
  }
  // 粗估（生成前/無站點 prompt 用）：每日站間移動額度 × 天數 + 離島船票
  function estimateTransportRough(destination, mode, people, days) {
    const cfg = getCostConfig();
    const count = getPeopleCount(people);
    const m = (mode && cfg && cfg.modeRates && cfg.modeRates[mode]) ? mode : 'car';
    const dayCount = getTripDayCount(days);
    const allowance = cfg && cfg.dailyMoveAllowance && Number.isFinite(Number(cfg.dailyMoveAllowance[m])) ? Number(cfg.dailyMoveAllowance[m]) : 0;
    const movePerPerson = Math.round(allowance * dayCount);
    const ferryPerPerson = getFerryRoundTrip(destination);
    return { ferryPerPerson, movePerPerson, totalPerPerson: ferryPerPerson + movePerPerson, count };
  }
  // 由人均級距範圍扣掉交通 → 可動用（餐飲/活動）。回 { tier, transport, min, max, open, label, money }；無 budget 回 null。
  function buildBudgetBreakdown(budget, people, transportPerPerson) {
    const tiers = [
      { key: '節省', perMin: 0,    perMax: 500 },
      { key: '適中', perMin: 500,  perMax: 1500 },
      { key: '舒適', perMin: 1500, perMax: 3000 },
      { key: '豪華', perMin: 3000, perMax: null }
    ];
    const str = String(budget || '').trim();
    let tier = tiers.find(t => str.includes(t.key));
    if (!tier) {
      const nums = (str.match(/\d[\d,]*/g) || []).map(n => parseInt(n.replace(/,/g, ''), 10)).filter(Number.isFinite);
      if (nums.length) { const amount = Math.max(...nums); tier = tiers.find(t => t.perMax == null ? amount >= t.perMin : amount <= t.perMax) || tiers[tiers.length - 1]; }
    }
    if (!tier) return null;
    const money = n => '$' + Math.round(n).toLocaleString('en-US');
    const t = Math.max(0, Math.round(Number(transportPerPerson) || 0));
    const open = tier.perMax == null;
    const dMin = Math.max(0, tier.perMin - t);
    const dMax = open ? null : Math.max(0, tier.perMax - t);
    const label = open ? `${money(dMin)}+` : (tier.perMin > 0 ? `${money(dMin)}–${money(dMax)}` : `${money(dMax)} 內`);
    return { tier, transport: t, min: dMin, max: dMax, open, label, money };
  }

  function calcReplanEndTime(startTime, days) {
    const duration = parseDurationMinutes(days);
    const parts = String(startTime || '09:00').split(':').map(Number);
    const total = (parts[0] * 60 + (parts[1] || 0)) + duration;
    return minutesToClock(total);
  }

  const BLOCKED_SPOTS_KEY = 'wai_blocked_spots';
  const VISITED_PLACES_KEY = 'wai_visited_places';

  function getVisitedPlaces() {
    try { return JSON.parse(localStorage.getItem(VISITED_PLACES_KEY) || '[]'); } catch { return []; }
  }

  function isPlaceVisited(name) {
    const norm = (name || '').replace(/\s/g, '').toLowerCase();
    return getVisitedPlaces().some(p => (p.name || '').replace(/\s/g, '').toLowerCase() === norm);
  }

  // 造訪紀錄的唯一存檔出口：localStorage ＋ 登入時整包鏡像到 users/{uid}.visitedSpots。
  // 用整包重寫而非 arrayUnion/arrayRemove：紀錄帶 photos 後會「修改既有元素」，
  // arrayUnion 蓋不掉、arrayRemove 又靠完全相等比對（帶 photos 的元素永遠刪不掉）；
  // 且登入流程本來就是 Firestore 整包覆蓋 localStorage，整包重寫與之對稱。
  function saveVisitedPlaces(places) {
    try { localStorage.setItem(VISITED_PLACES_KEY, JSON.stringify(places)); } catch (e) { console.warn('Save visited to localStorage failed:', e); }
    if (firebaseEnabled && firebaseAuth && firebaseAuth.currentUser && firebaseDb) {
      firebaseDb.collection('users').doc(firebaseAuth.currentUser.uid)
        .set({ visitedSpots: places }, { merge: true })
        .catch(e => console.warn('Sync visitedSpots failed:', e));
    }
  }

  // 找到同名造訪紀錄 → mutator 就地修改 → 存檔。照片增刪都走這裡。
  function updateVisitedPlaceByName(name, mutator) {
    const places = getVisitedPlaces();
    const norm = (name || '').replace(/\s/g, '').toLowerCase();
    const place = places.find(p => (p.name || '').replace(/\s/g, '').toLowerCase() === norm);
    if (!place) return false;
    mutator(place);
    saveVisitedPlaces(places);
    return true;
  }

  function toggleVisitedPlace(stop, extras = {}) {
    const places = getVisitedPlaces();
    const norm = (stop.name || '').replace(/\s/g, '').toLowerCase();
    const idx = places.findIndex(p => (p.name || '').replace(/\s/g, '').toLowerCase() === norm);
    const isAdding = idx < 0;

    if (isAdding) {
      places.push({
        name: stop.name,
        region: currentTripRegion || '',
        visitDate: new Date().toISOString().slice(0, 10),
        tripId: currentItineraryId || '',
        tripTitle: currentTripTitle || '',
        emoji: stop.emoji || '📍',
        gpsVerified: extras.gpsVerified ?? null, // true=GPS 驗證到場、false=超距強制打卡、null=手動/舊資料
        photos: []                               // {url, path, ts}；path=Storage 路徑（刪檔用）
      });
    } else {
      // 移除紀錄時一併清掉 Storage 上的照片（失敗靜默，孤兒檔可容忍）
      const removed = places.splice(idx, 1)[0];
      if (removed && Array.isArray(removed.photos) && typeof firebaseStorage !== 'undefined' && firebaseStorage) {
        removed.photos.forEach(p => { if (p && p.path) firebaseStorage.ref(p.path).delete().catch(() => {}); });
      }
    }

    saveVisitedPlaces(places);
    return isAdding;
  }

  function getBlockedSpotNames(region) {
    try {
      const data = JSON.parse(localStorage.getItem(BLOCKED_SPOTS_KEY) || '{}');
      return Array.isArray(data[region]) ? data[region] : [];
    } catch { return []; }
  }

  function saveBlockedSpotNames(names, region) {
    if (!names.length || !region) return;
    try {
      const data = JSON.parse(localStorage.getItem(BLOCKED_SPOTS_KEY) || '{}');
      const existing = new Set(data[region] || []);
      names.forEach(n => { if (n) existing.add(n); });
      data[region] = Array.from(existing).slice(-100);
      localStorage.setItem(BLOCKED_SPOTS_KEY, JSON.stringify(data));
    } catch {}
  }

  function buildReplenishPrompt(dest, needed, excludedNames, wizardData = {}) {
    const interests = (wizardData.interests || []).join('、') || '多元體驗';
    const theme = wizardData.theme || '經典旅人';
    const people = wizardData.people || '2人';
    const isSolo = people === '1人';
    const excluded = excludedNames.slice(0, 30).join('、');
    return [
      `你是台灣微旅行規劃 AI。請為 ${dest} 地區補充 ${needed + 1} 個景點（多補 1 個備用以防驗證失敗）。`,
      '【重要限制】',
      `以下景點已使用或驗證失敗，絕對禁止重複：${excluded}`,
      isSolo ? `旅行方式：獨旅，風格：${theme}，興趣：${interests}` : `同行人數：${people}，風格：${theme}，興趣：${interests}`,
      `👥 人數考量：${getPeopleProfile(people).planRule}`,
      '【要求】',
      `1. 景點必須是 ${dest} 地區真實存在、能在 Google Maps 搜尋到的具體地點，使用正式名稱`,
      '2. 禁止模糊描述（如「部落巷弄深度探索」「當地文化體驗」），必須是具體場所名稱',
      '3. 座標使用 WGS84 精確小數（至少 6 位），必須是景點實際位置',
      '【JSON 格式（只回傳 JSON）】',
      '{"stops":[{"name":"景點正式名稱","emoji":"📍","duration":45,"desc":"推薦理由","lat":22.123456,"lng":121.123456,"businessHours":"週一至週日 09:00-17:00"}]}'
    ].join('\n');
  }

  // 合併後時間偏短時：沿路線補景點填滿剩餘時段（不要集中同一點）
  function buildTimeFillPrompt(dest, needed, shortfallMin, excludedNames, wizardData = {}) {
    const interests = (wizardData.interests || []).join('、') || '多元體驗';
    const theme = wizardData.theme || '經典旅人';
    const people = wizardData.people || '2人';
    const isSolo = people === '1人';
    const startLoc = (wizardData.startLocation || '').trim();
    const endLoc = (wizardData.endLocation || '').trim();
    const excluded = excludedNames.slice(0, 40).join('、');
    return [
      `你是台灣微旅行規劃 AI。目前 ${dest} 行程時間偏短，請沿行程路線補 ${needed + 1} 個景點（多補 1 個備用），用來填滿約 ${shortfallMin} 分鐘的空檔。`,
      '【重要限制】',
      `以下景點已使用，絕對禁止重複：${excluded || '（無）'}`,
      isSolo ? `旅行方式：獨旅，風格：${theme}，興趣：${interests}` : `同行人數：${people}，風格：${theme}，興趣：${interests}`,
      '【要求】',
      (startLoc || endLoc)
        ? `1. 景點請沿「${startLoc || dest}」→「${dest}」→「${endLoc || dest}」路線廊道分散（距路線 10 公里內），不要全部集中在同一點，避免大幅折返`
        : '1. 景點沿行程路線分散，不要集中在同一點',
      `2. 必須是 ${dest} 周邊真實存在、能在 Google Maps 搜尋到的具體地點，使用正式名稱；禁止模糊描述`,
      '3. 座標使用 WGS84 精確小數（至少 6 位），必須是景點實際位置',
      '4. duration 為建議停留分鐘數（15–90），依景點規模設定',
      '【JSON 格式（只回傳 JSON）】',
      '{"stops":[{"name":"景點正式名稱","emoji":"📍","duration":45,"desc":"推薦理由","lat":22.123456,"lng":121.123456,"businessHours":"週一至週日 09:00-17:00"}]}'
    ].join('\n');
  }

  function buildNearbyFallbackPrompt(dest, needed, allExcluded, wizardData = {}) {
    const interests = (wizardData.interests || []).join('、') || '多元體驗';
    const theme = wizardData.theme || '經典旅人';
    const days = wizardData.days || '1天';
    const startTime = wizardData.startTime || currentTripWindow.start || '09:00';
    const endTime = calcReplanEndTime(startTime, days);
    const people = wizardData.people || '2人';
    const isSolo = people === '1人';
    const pace = wizardData.pace || '平衡';
    const excluded = allExcluded.slice(0, 40).join('、');
    return [
      `你是台灣微旅行規劃 AI。${dest} 地區景點驗證不足，請改為推薦距離 ${dest} 合理車程（50 公里內）的 ${needed + 1} 個替代景點（多補 1 個備用）。`,
      '【行程限制（必須符合）】',
      `時間窗口：${startTime} ～ ${endTime}，行程長度：${days}`,
      isSolo ? `旅行方式：獨旅，節奏：${pace}，風格：${theme}` : `旅伴：${people}，節奏：${pace}，風格：${theme}`,
      `👥 人數考量：${getPeopleProfile(people).planRule}`,
      `興趣方向：${interests}`,
      '【排除清單（絕對禁止重複）】',
      excluded || '（無）',
      '【景點要求】',
      `1. 優先選擇距 ${dest} 50 公里內、適合當日安排的具體景點`,
      '2. 必須是台灣真實存在、能在 Google Maps 搜尋到的地點，使用正式名稱',
      '3. 禁止模糊描述（如「附近景點」「周邊步道」），必須是具體場所名稱',
      '4. 座標使用 WGS84 精確小數（至少 6 位），必須是景點實際位置',
      '【JSON 格式（只回傳 JSON）】',
      '{"stops":[{"name":"景點正式名稱","emoji":"📍","duration":45,"desc":"推薦理由","lat":22.123456,"lng":121.123456,"businessHours":"週一至週日 09:00-17:00"}]}'
    ].join('\n');
  }

  function buildAiReplanPrompt(wizardData, livePoiHint = '') {
    const dest = wizardData.dest || wizardData.destCustom || currentTripRegion || '台東';
    const days = wizardData.days || '1天';
    const startTime = wizardData.startTime || currentTripWindow.start || '09:00';
    const endTime = calcReplanEndTime(startTime, days);
    const people = wizardData.people || '2人';
    const isSolo = people === '1人';
    const pace = wizardData.pace || '平衡';
    const interests = (wizardData.interests || []).join('、') || '多元體驗';
    const theme = wizardData.theme || '經典旅人';
    const startLoc = (wizardData.startLocation || '').trim();
    const endLoc = (wizardData.endLocation || '').trim();
    const budget = (wizardData.budget || '').trim();
    const accommodation = (wizardData.accommodation || '').trim();
    const desiredSpots = (wizardData.desiredSpots || '').trim();
    const _durMin = parseDurationMinutes(days);
    const _mid = Math.max(1, Math.round(_durMin / 60));
    const _base = (String(days) === '2天' || String(days) === '兩天一夜') ? [8, 14] : [Math.max(1, _mid - 1), _mid + 2];
    const _peopleProfile = getPeopleProfile(people);
    const min = Math.max(1, _base[0] + _peopleProfile.stopDelta);
    const max = Math.max(min, _base[1] + _peopleProfile.stopDelta);
    const blockedSpots = getBlockedSpotNames(dest).slice(-25);
    const blockedHint = blockedSpots.length
      ? `7. 以下景點驗證失敗或不真實，絕對禁止使用：${blockedSpots.join('、')}`
      : null;
    const visitedInRegion = getVisitedPlaces()
      .filter(p => !p.region || p.region === dest)
      .map(p => p.name)
      .slice(-30);
    const visitedHint = visitedInRegion.length
      ? `8. 以下景點用戶已去過，請勿再次安排（可安排附近其他景點）：${visitedInRegion.join('、')}`
      : null;
    const desiredNote = desiredSpots
      ? `\n⚠️ 用戶特別希望前往：${desiredSpots}。請優先安排這些景點，並圍繞它們規劃行程。`
      : '';
    return [
      `你是台灣微旅行規劃 AI。根據以下條件，${_peopleProfile.introSentence}，使用 JSON 格式回覆。`,
      '',
      '【行程條件】',
      `目的地：${dest}`,
      `行程長度：${days}（時間窗口 ${startTime} ～ ${endTime}）`,
      isSolo ? `旅行方式：獨旅，節奏：${pace}，風格：${theme}` : `同行人數：${people}，節奏：${pace}，風格：${theme}`,
      `興趣：${interests}`,
      budget ? `預算：${describeBudgetForPrompt(budget, people)}` : null,
      budget ? (() => {
        const live = (Array.isArray(replanStops) && replanStops.length >= 2)
          ? estimateTripTransport(replanStops, { mode: wizardData.transportMode, people, destination: dest })
          : estimateTransportRough(dest, wizardData.transportMode, people, days);
        const liveFees = sumStopFeesPerPerson(replanStops, dest);
        const bd = buildBudgetBreakdown(budget, people, live.totalPerPerson + liveFees);
        if (!bd || live.totalPerPerson <= 0) return null;
        const ferryPart = live.ferryPerPerson > 0 ? `離島船票 $${live.ferryPerPerson}、` : '';
        const feePart = liveFees > 0 ? `、景點門票約 $${liveFees}` : '';
        return `交通預估：每人約 $${live.totalPerPerson}（${ferryPart}站間移動約 $${live.movePerPerson}）${feePart}。可動用於餐飲與付費體驗：每人約 ${bd.label}，請在此額度內安排，避免規劃會超支的高消費景點`;
      })() : null,
      accommodation ? `住宿安排：${accommodation}` : null,
      startLoc ? `出發車站：${startLoc}` : null,
      endLoc ? `回程車站：${endLoc}` : null,
      desiredSpots ? desiredNote : null,
      livePoiHint ? livePoiHint : null,
      '',
      '【規劃規則】',
      `1. 必須包含 ${min}–${max} 個主要景點`,
      `2. 行程從 ${startTime} 開始，最後一站結束時間必須在 ${endTime} 前後 15 分鐘內，不可提前超過 15 分鐘`,
      `3. 每個景點必須是台灣 ${dest} 地區真實存在、能在 Google Maps 搜尋到的具體地點，使用正式名稱`,
      '4. 嚴禁使用「在地午餐」「當地早餐」「附近餐廳」等模糊飲食描述，餐飲景點必須填入具體店家名稱',
      (() => {
        // 單日行程：時間窗涵蓋用餐時段就強制安排具體店名的用餐站（餐廳候選由系統即時提供）
        if (String(days) === '2天' || String(days) === '兩天一夜') return null;
        const sM = clockToMinutes(startTime), eM = clockToMinutes(endTime);
        const overlaps = (a, b) => sM <= b && eM >= a;
        const meals = [];
        if (overlaps(11 * 60 + 30, 13 * 60 + 30)) meals.push('午餐（約 12:00–13:00）');
        if (overlaps(17 * 60 + 30, 19 * 60 + 30)) meals.push('晚餐（約 18:00–19:00）');
        return meals.length ? `🍽️ 必須安排${meals.join('與')}用餐站，使用具體店家名稱（優先從上方「即時餐廳候選」清單挑選、名稱需完全一致），排在對應用餐時段` : null;
      })(),
      '5. 座標使用 WGS84 精確小數（至少 6 位），必須是景點實際位置',
      '6. duration 為建議停留分鐘數（10–180），依景點規模設定，不要固定用 30/60/90',
      '🏞️ 大型景區（如三仙台、伯朗大道、鯉魚潭）請拆成該景區內 2–4 個具體子景點／觀景點（例：三仙台觀景台、三仙台跨海拱橋、比西里岸部落、礫石灘），每個給精確座標，不要只填一個籠統的景區名；系統會自動把鄰近子景點合併成一站並標示範圍',
      `👥 人數考量：${_peopleProfile.planRule}`,
      (startLoc || endLoc) ? `🗺️ 廊道分布：景點請沿「${startLoc || dest}」→「${dest}」→「${endLoc || dest}」路線廊道分布（盡量在距路線 5 公里內，景點不足時可擴展至 10 公里），行程方向由起點往目的地核心再往終點收尾，不要安排需大幅折返的景點` : null,
      blockedHint,
      visitedHint,
      '',
      '【JSON 回傳格式（只回傳 JSON，不加任何說明文字）】',
      '{"title":"行程標題","stops":[{"name":"景點正式名稱","emoji":"📍","time":"HH:MM","duration":45,"desc":"推薦理由","lat":22.123456,"lng":121.123456,"businessHours":"週一至週日 09:00-17:00"}]}'
    ].filter(l => l !== null).join('\n');
  }

  async function replanWithAI() {
    const wizardData = currentTripPreferences || {};
    const dest = wizardData.dest || wizardData.destCustom || currentTripRegion;
    if (!dest) {
      window.alert('找不到目的地資訊，請先匯入行程後再重新規劃。');
      return;
    }

    if (Array.isArray(replanStops) && replanStops.length
      && !window.confirm('「重新規劃」會讓 AI 重新生成整份行程，覆蓋目前的景點與順序。要繼續嗎？')) return;

    // 共編：取重生成鎖，避免與 owner / 其他可編輯成員同時重生成互相覆蓋
    let _regenLocked = false;
    if (currentTripIsCollab && window.WAI_COLLAB && firebaseEnabled && firebaseDb) {
      try {
        let myEmail = '', myName = '';
        try { const u = JSON.parse(localStorage.getItem('wai_user') || '{}'); myEmail = (u && u.currentUser && u.currentUser.email) || ''; myName = (u && u.currentUser && u.currentUser.name) || ''; } catch (_e) {}
        const lock = await WAI_COLLAB.acquireRegenLock(currentItineraryId, { email: myEmail, name: myName });
        if (!lock.ok) { window.alert(`${lock.holder} 正在重新生成，請稍候再試。`); return; }
        _regenLocked = true;
      } catch (e) { console.warn('取重生成鎖失敗（略過鎖）：', e); }
    }

    enterReplanMode();

    const planningList = document.getElementById('replanSortableList');
    const totalTimeEl = document.getElementById('replanTotalWindow');
    if (planningList) planningList.innerHTML = '';
    if (totalTimeEl) totalTimeEl.textContent = '--';
    const _rgOverlay = document.getElementById('replanGenOverlay');
    const _rgPhase = document.getElementById('replanGenPhase');
    const _rgOutput = document.getElementById('replanGenOutput');
    function _addRgLine(text, type) {
      if (!_rgOutput) return;
      const d = document.createElement('div');
      d.className = 'replan-gen-line replan-gen-' + (type || 'info');
      d.textContent = text;
      _rgOutput.appendChild(d);
      _rgOutput.scrollTop = _rgOutput.scrollHeight;
    }
    if (_rgOutput) _rgOutput.innerHTML = '';
    if (_rgOverlay) _rgOverlay.style.display = 'flex';
    if (_rgPhase) _rgPhase.textContent = '查詢景點中…';
    _addRgLine('$ WanderAI --replan --dest ' + dest, 'info');

    try {
      // 本地優先：有本地景點資料就用它，缺該目的地時才回退 live Google Maps
      const _localHint = buildLocalPoiHintBlock(dest);
      if (_localHint) _addRgLine('> 已從本地景點資料庫取得清單，交由 AI 重新排序…', 'info');
      let livePoiHint = _localHint || await fetchLiveMapsPoiHintBlock(dest, wizardData.interests || []);
      // 餐廳一律即時抓（本地 poi-data 不含餐廳），每次重新規劃都從 Google Maps 撈最新餐廳候選
      const _foodHint = await fetchLiveFoodHintBlock(dest).catch(() => '');
      if (_foodHint) { livePoiHint = (livePoiHint || '') + '\n' + _foodHint; _addRgLine('> 已即時取得餐廳候選…', 'info'); }
      // 在 DevTools Console 標明景點清單來源：本地 / live Maps / 無
      console.info(`[POI來源] ${_localHint ? '本地 poi-data.js' : (livePoiHint ? 'live Google Maps' : '無清單（AI 自行生成）')}｜目的地：${dest}｜（重新規劃）`);
      if (_rgPhase) _rgPhase.textContent = 'AI 生成行程中…';
      _addRgLine('> AI 正在生成新行程，請稍候…', 'info');

      // 一律走 Vertex AI（不再退回 Gemini API key）
      const vertex = getVertexConfig();
      if (!vertex.ready) {
        throw new Error('尚未設定 Vertex AI：請在 weather.env.js 填入 VERTEX_PROJECT_ID 與 VERTEX_API_KEY。');
      }
      const endpoint = `${VERTEX_API_BASE}/publishers/google/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(vertex.apiKey)}`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: await vertexAuthHeaders(),
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: buildAiReplanPrompt(wizardData, livePoiHint) }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.8 }
        })
      });
      if (!response.ok) throw vertexHttpError(response.status, 'Vertex API 錯誤');

      const data = await response.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const parsed = safeParseJson(text);
      if (!parsed?.stops?.length) throw new Error('AI 未回傳有效景點清單');

      if (_rgPhase) _rgPhase.textContent = `驗證景點中（共 ${parsed.stops.length} 個）…`;
      _addRgLine(`> 驗證景點真實性，共 ${parsed.stops.length} 個…`, 'info');

      const region = currentTripRegion || dest;
      let newStops = [];
      const rejectedNames = [];
      for (const s of parsed.stops) {
        const template = {
          name: s.name, emoji: s.emoji || '📍', desc: s.desc || '',
          stayMin: Math.max(10, Math.min(180, s.duration || 30)),
          transitMode: getPreferredVehicleMode(), transitMin: null, baseId: 'replan-ai',
          businessHours: s.businessHours || null, toiletLocations: []
        };
        const aiHint = (Number.isFinite(Number(s.lat)) && Number.isFinite(Number(s.lng)))
          ? normalizeCoordinatePair(s.lat, s.lng)
          : null;
        let validated = await validateAiStopTemplate(template, region, currentTripTitle, aiHint);
        if (!validated && aiHint && !isCoordinatesOutsideRegion(aiHint, region, s.name)) {
          validated = { ...template, scenicCoordinates: aiHint };
        }
        if (!validated) { console.warn(`[replanWithAI] 排除未驗證景點：${s.name}`); rejectedNames.push(s.name); continue; }
        const stop = createStopFromTemplate({ ...validated, stayMin: template.stayMin, baseId: 'replan-ai', transitMode: getPreferredVehicleMode(), transitMin: null });
        newStops.push(stop);
      }

      saveBlockedSpotNames(rejectedNames, region);

      const MIN_REPLAN_STOPS = 3;
      if (newStops.length < MIN_REPLAN_STOPS && rejectedNames.length > 0) {
        const needed = MIN_REPLAN_STOPS - newStops.length + 1;
        const allUsedNorm = new Set([...rejectedNames, ...newStops.map(s => s.name)].map(n => normalizeText(n)));
        if (_rgPhase) _rgPhase.textContent = '補充替代景點中…';
        _addRgLine(`> ⚠️ 已排除 ${rejectedNames.length} 個無法驗證景點，補充新景點…`, 'warn');
        const replenishRes = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: buildReplenishPrompt(dest, needed, [...rejectedNames, ...newStops.map(s => s.name)], wizardData) }] }],
            generationConfig: { responseMimeType: 'application/json', temperature: 0.9 }
          })
        });
        if (replenishRes.ok) {
          const repData = await replenishRes.json();
          const repText = repData?.candidates?.[0]?.content?.parts?.[0]?.text || '';
          const repParsed = safeParseJson(repText);
          if (repParsed?.stops?.length) {
            for (const s of repParsed.stops) {
              if (allUsedNorm.has(normalizeText(s.name))) continue;
              const tmpl = {
                name: s.name, emoji: s.emoji || '📍', desc: s.desc || '',
                stayMin: Math.max(10, Math.min(180, s.duration || 30)),
                transitMode: getPreferredVehicleMode(), transitMin: null, baseId: 'replan-ai',
                businessHours: s.businessHours || null, toiletLocations: []
              };
              const hint = (Number.isFinite(Number(s.lat)) && Number.isFinite(Number(s.lng)))
                ? normalizeCoordinatePair(s.lat, s.lng) : null;
              let val = await validateAiStopTemplate(tmpl, region, currentTripTitle, hint);
              if (!val && hint && !isCoordinatesOutsideRegion(hint, region, s.name)) {
                val = { ...tmpl, scenicCoordinates: hint };
              }
              if (!val) { saveBlockedSpotNames([s.name], region); continue; }
              newStops.push(createStopFromTemplate({ ...val, stayMin: tmpl.stayMin, baseId: 'replan-ai', transitMode: getPreferredVehicleMode(), transitMin: null }));
              allUsedNorm.add(normalizeText(s.name));
            }
          }
        }
      }

      // 第三層 fallback：景點仍不足時，放寬地區限制搜尋附近景點
      if (newStops.length < MIN_REPLAN_STOPS) {
        const nearbyNeeded = MIN_REPLAN_STOPS - newStops.length + 1;
        const nearbyUsedNorm = new Set([...rejectedNames, ...newStops.map(s => s.name)].map(n => normalizeText(n)));
        if (_rgPhase) _rgPhase.textContent = `搜尋 ${dest} 周邊替代景點…`;
        _addRgLine(`> 🗺️ 搜尋 ${dest} 周邊替代景點…`, 'warn');
        const nearbyRes = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: buildNearbyFallbackPrompt(dest, nearbyNeeded, [...rejectedNames, ...newStops.map(s => s.name)], wizardData) }] }],
            generationConfig: { responseMimeType: 'application/json', temperature: 1.0 }
          })
        });
        if (nearbyRes.ok) {
          const nearbyData = await nearbyRes.json();
          const nearbyText = nearbyData?.candidates?.[0]?.content?.parts?.[0]?.text || '';
          const nearbyParsed = safeParseJson(nearbyText);
          if (nearbyParsed?.stops?.length) {
            for (const s of nearbyParsed.stops) {
              if (nearbyUsedNorm.has(normalizeText(s.name))) continue;
              const tmpl = {
                name: s.name, emoji: s.emoji || '📍', desc: s.desc || '',
                stayMin: Math.max(10, Math.min(180, s.duration || 30)),
                transitMode: getPreferredVehicleMode(), transitMin: null, baseId: 'replan-ai',
                businessHours: s.businessHours || null, toiletLocations: []
              };
              const hint = (Number.isFinite(Number(s.lat)) && Number.isFinite(Number(s.lng)))
                ? normalizeCoordinatePair(s.lat, s.lng) : null;
              let val = await validateAiStopTemplate(tmpl, region, currentTripTitle, hint);
              // 附近景點放寬地區限制：AI 座標在台灣範圍內即接受
              if (!val && hint && isInTaiwanBounds(hint)) {
                val = { ...tmpl, scenicCoordinates: hint };
              }
              if (!val) continue;
              newStops.push(createStopFromTemplate({ ...val, stayMin: tmpl.stayMin, baseId: 'replan-ai', transitMode: getPreferredVehicleMode(), transitMin: null }));
              nearbyUsedNorm.add(normalizeText(s.name));
              if (newStops.length >= MIN_REPLAN_STOPS) break;
            }
          }
        }
      }

      if (newStops.length < 2) throw new Error(`驗證後只剩 ${newStops.length} 個有效景點，無法建立行程`);

      // 合併同一大景區內密集子景點（如三仙台觀景台／跨海步橋 → 單一「三仙台」站）
      newStops = mergeNearbySubAttractions(newStops);

      // 若沒有 type='start' 的注入起點，改以第一站作為錨點保留
      const preservedStartStop = replanStops.find(s => s.type === 'start') || replanStops[0];
      const preservedEndStop = replanStops.find(s => s.type === 'end');
      // 過濾掉 AI 新生成中與保留起點重名的站點，避免重複
      const startNorm = preservedStartStop ? normalizeText(preservedStartStop.name) : '';
      const filteredNewStops = startNorm
        ? newStops.filter(s => normalizeText(s.name) !== startNorm)
        : newStops;
      replanStops = filteredNewStops;
      if (preservedStartStop) replanStops.unshift({ ...preservedStartStop, transitMin: null });
      if (preservedEndStop) {
        replanStops.push(preservedEndStop);
      } else if (preservedStartStop) {
        // 沒有現成終點 → 合成「返回出發點」終點（沿用起點的座標/pin），避免重新規劃後行程沒有終點
        replanStops.push({ ...preservedStartStop, id: `stop-return-${Date.now()}`, type: 'end', stayMin: 0, transitMin: null });
      }

      // === 合併後時間回填：行程縮水超過 45 分時，沿路線補景點填回目標時段（含回終點交通、不超時）===
      try {
        const targetMin = parseDurationMinutes(wizardData.days || '1天');
        const usedNorm = new Set(replanStops.map(s => normalizeText(s.name)).concat(rejectedNames.map(n => normalizeText(n))));
        for (let iter = 0; iter < 3; iter++) {
          const shortfall = targetMin - estimateTripMinutes(replanStops);
          if (shortfall <= 45) break;
          const need = Math.max(1, Math.min(4, Math.ceil(shortfall / 50)));
          if (_rgPhase) _rgPhase.textContent = '補景點填滿時段中…';
          _addRgLine(`> ⏳ 行程偏短約 ${shortfall} 分，沿路線補景點…`, 'warn');
          let res;
          try {
            res = await fetch(endpoint, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ role: 'user', parts: [{ text: buildTimeFillPrompt(dest, need, shortfall, replanStops.map(s => s.name).concat(rejectedNames), wizardData) }] }],
                generationConfig: { responseMimeType: 'application/json', temperature: 0.9 }
              })
            });
          } catch (_e) { break; }
          if (!res.ok) break;
          const data = await res.json();
          const parsed = safeParseJson(data?.candidates?.[0]?.content?.parts?.[0]?.text || '');
          if (!parsed?.stops?.length) break;
          let addedAny = false;
          for (const s of parsed.stops) {
            const nrm = normalizeText(s.name);
            if (!nrm || usedNorm.has(nrm)) continue;
            const tmpl = {
              name: s.name, emoji: s.emoji || '📍', desc: s.desc || '',
              stayMin: Math.max(15, Math.min(90, s.duration || 45)),
              transitMode: getPreferredVehicleMode(), transitMin: null, baseId: 'replan-fill',
              businessHours: s.businessHours || null, toiletLocations: []
            };
            const hint = (Number.isFinite(Number(s.lat)) && Number.isFinite(Number(s.lng))) ? normalizeCoordinatePair(s.lat, s.lng) : null;
            let val = await validateAiStopTemplate(tmpl, region, currentTripTitle, hint);
            if (!val && hint && !isCoordinatesOutsideRegion(hint, region, s.name)) val = { ...tmpl, scenicCoordinates: hint };
            if (!val) { saveBlockedSpotNames([s.name], region); continue; }
            const stop = createStopFromTemplate({ ...val, stayMin: tmpl.stayMin, baseId: 'replan-fill', transitMode: getPreferredVehicleMode(), transitMin: null });
            const endIdx = replanStops.findIndex(x => x.type === 'end');
            replanStops.splice(endIdx >= 0 ? endIdx : replanStops.length, 0, stop); // 插在終點站之前
            usedNorm.add(nrm);
            // 重算（含該站→終點回程）；超出目標+15 就縮短停留，仍超出則移除該站
            let after = estimateTripMinutes(replanStops);
            if (after > targetMin) {
              const over = after - (targetMin);
              if (stop.stayMin - over >= 15) { stop.stayMin -= over; after = estimateTripMinutes(replanStops); }
              if (after > targetMin) { replanStops.splice(replanStops.indexOf(stop), 1); continue; }
            }
            addedAny = true;
            if (estimateTripMinutes(replanStops) >= targetMin - 15) break;
          }
          replanStops = mergeNearbySubAttractions(replanStops); // 收斂新補入的鄰近子景點
          if (!addedAny) break;
        }
      } catch (fillErr) { console.warn('[replanWithAI] 時間回填略過：', fillErr); }

      // 先重驗座標：AI 回的座標可能錯位（如成功漁港→富岡），必須在 enrich/排序之前校正，
      // 否則 reorderStopsAlongRoute 會用錯誤座標排序而出現來回跑、不順路。
      try { replanStops = await verifyStopCoordinatesWithPlaces(replanStops, region, currentTripTitle); }
      catch (verifyErr) { console.warn('[replanWithAI] 座標重驗略過：', verifyErr); }
      // 大景區以單站進來、合併不到鄰近站時，用 Places 附近搜尋補出子景點並標記合併（只貼標籤，不加站）
      try { replanStops = await enrichBigAttractionSubSpots(replanStops, region); }
      catch (enrichErr) { console.warn('[replanWithAI] 補子景點略過：', enrichErr); }
      // 最後輸出前重排一次，避免合併/補景點後路線南北來回跑
      try { replanStops = reorderStopsAlongRoute(replanStops, region); }
      catch (orderErr) { console.warn('[replanWithAI] 路線重排略過：', orderErr); }
      // 對齊描述「（含 …）」與 mergedSubSpots，並清掉累加的重複括號
      reconcileMergedSubSpots(replanStops);

      // 重新規劃結果若仍超出設定時長，套用與匯出相同的壓縮（停留最久優先、每站最多縮 35%）
      try {
        const _rgFit = fitScheduleToTimeLimit();
        if (_rgFit.changed && typeof showToast === 'function') {
          const _endStr = _rgFit.limitEndMin != null ? minutesToClock(_rgFit.limitEndMin) : '';
          showToast(_rgFit.fits
            ? `⏱ 重新規劃已壓縮超時行程，調整至 ${_endStr} 前結束`
            : `⏱ 已盡量壓縮行程（每站最多縮 35%），仍略超出 ${_endStr}`,
            _rgFit.fits ? 'green' : 'orange');
        }
      } catch (fitErr) { console.warn('[replanWithAI] 超時壓縮略過：', fitErr); }

      if (_rgOverlay) _rgOverlay.style.display = 'none';
      renderReplanBoard();
      refreshRouteDirections();
      schedulePersistTrip();

    } catch (e) {
      console.error('[replanWithAI]', e);
      if (_rgOverlay) _rgOverlay.style.display = 'none';
      cancelReplan();
      window.alert(`AI 重新規劃失敗：${e.message}\n\n請確認 API Key 正確，並再試一次。`);
    } finally {
      if (_regenLocked) { try { await WAI_COLLAB.releaseRegenLock(currentItineraryId); } catch (_e) {} }
    }
  }

  async function requestGeminiTravelPlan(userMessage, livePoiHint = '') {
    const vertex = getVertexConfig();
    let endpoint;
    if (vertex.ready) {
      endpoint = `${VERTEX_API_BASE}/publishers/google/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(vertex.apiKey)}`;
    } else {
      const apiKey = ensureGeminiApiKey();
      if (!apiKey) throw new Error('尚未設定 API Key。');
      endpoint = `${GEMINI_API_BASE}/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
    }

    const existingStops = (replanStops || [])
      .filter(s => s.type !== 'start' && s.type !== 'end')
      .map(s => s.name);
    const contextBlock = [
      `行程名稱：${currentTripTitle}`,
      `時段：${currentTripWindow.start}-${currentTripWindow.end}`,
      '目前行程：',
      getReplanSummaryText(),
      existingStops.length
        ? `\n🚫 以下景點已在行程中，禁止重複推薦（除非使用者明確要求替換）：${existingStops.join('、')}`
        : '',
      livePoiHint ? livePoiHint : ''
    ].filter(Boolean).join('\n');
    const payload = {
      contents: [
        {
          role: 'user',
          parts: [{ text: `${buildGeminiSystemPrompt()}\n\n${contextBlock}\n\n使用者訊息：${userMessage}` }]
        }
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.6
      }
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: await vertexAuthHeaders(),
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw vertexHttpError(response.status, 'Gemini API 失敗');
    }

    const data = await response.json();
    const text = data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0]
      ? data.candidates[0].content.parts[0].text
      : '';

    const parsed = safeParseJson(text);
    if (!parsed) {
      throw new Error('AI 回傳格式不是有效 JSON。');
    }
    return parsed;
  }

  // 從本地靜態檔 window.WAI_POI_DATA（爬蟲 npm run export:local 產生）取某目的地的景點清單。
  // dest 正規化：精確鍵 → 去掉「縣/市」後綴 → 與既有鍵互相包含比對。無資料回 []。
  function getLocalPoiList(destination) {
    const data = (typeof window !== 'undefined' && window.WAI_POI_DATA) || null;
    // 正規化：臺→台（OpenData 用「臺東」、前端用「台東」，否則比對不到）；去頭尾空白
    const norm = (s) => String(s || '').trim().replace(/臺/g, '台');
    const dest = norm(destination);
    if (!data || !dest) return [];
    const stripped = dest.replace(/[縣市]$/u, '').trim();
    // 合併所有「正規化後相符」的桶（如「臺東」「台東」拆成兩桶需合併），並以名稱去重
    const seen = new Set();
    const out = [];
    for (const key of Object.keys(data)) {
      if (key === '__generatedAt' || !Array.isArray(data[key]) || !data[key].length) continue;
      const k = norm(key);
      const match = k === dest || (stripped && k === stripped)
        || dest.includes(k) || k.includes(dest)
        || (stripped && (stripped.includes(k) || k.includes(stripped)));
      if (!match) continue;
      for (const poi of data[key]) {
        const id = poi && poi.name ? String(poi.name).trim() : '';
        if (id && seen.has(id)) continue;
        if (id) seen.add(id);
        out.push(poi);
      }
    }
    return out;
  }

  // 門票費用（只來自本地已驗證資料 poi-data.js 的 fee/feeNote，爬蟲 enrich:fees 寫入的真實票價）。
  function normalizeFeeName(s) { return String(s || '').replace(/\s/g, '').replace(/臺/g, '台').toLowerCase(); }
  // 建目的地本地 POI 的門票對照表：正規化名稱 → { fee(數字|null), feeNote }。只含有票價資訊的景點。
  function getLocalPoiFeeMap(destination) {
    const map = new Map();
    const list = getLocalPoiList(destination) || [];
    for (const p of list) {
      if (!p || !p.name) continue;
      const hasFee = Number.isFinite(Number(p.fee));
      if (!hasFee && !p.feeNote) continue;
      map.set(normalizeFeeName(p.name), { fee: hasFee ? Number(p.fee) : null, feeNote: p.feeNote || '' });
    }
    return map;
  }
  // 人工維護票價表（attraction-fee-config.js）查名稱 → { fee, feeNote } 或 null。
  function getCuratedFee(name) {
    const cfg = (typeof window !== 'undefined' && window.WAI_ATTRACTION_FEE) || null;
    if (!cfg || !cfg.paid || !name) return null;
    const key = normalizeFeeName(name);
    for (const k of Object.keys(cfg.paid)) {
      if (normalizeFeeName(k) === key) {
        const e = cfg.paid[k] || {};
        return { fee: Number.isFinite(Number(e.fee)) ? Number(e.fee) : null, feeNote: e.note || '' };
      }
    }
    return null;
  }
  // 以景點名稱查門票，回 { fee, feeNote } 或 null。優先人工維護表 → 其次本地資料(TDX 抓的)。
  function lookupStopFee(feeMap, name) {
    const curated = getCuratedFee(name);
    if (curated) return curated;
    if (!feeMap || !feeMap.size || !name) return null;
    return feeMap.get(normalizeFeeName(name)) || null;
  }
  // 加總各站每人門票（只計有數字者；0=免費不加錢）。門票為每人各付，不除以人數。
  // 排除用餐站（餐廳算餐飲、不算門票），避免與 poi-data/restaurant-data 重疊者重複計。
  function sumStopFeesPerPerson(stops, destination) {
    const feeMap = getLocalPoiFeeMap(destination);
    const foodMap = getLocalFoodCostMap(destination);
    let sum = 0;
    for (const s of (Array.isArray(stops) ? stops : [])) {
      if (stopIsFood(s, foodMap)) continue; // 餐廳歸餐飲
      const hit = lookupStopFee(feeMap, s && s.name);
      if (hit && Number.isFinite(hit.fee)) sum += hit.fee;
    }
    return Math.round(sum);
  }

  // 餐廳人均消費（restaurant-data.js，爬蟲 crawl:food 用 Places searchNearby 抓的 priceRange/priceLevel）。
  // 建目的地餐廳的人均對照表：正規化名稱 → { costPerPerson(數字|null), costNote }。
  function getLocalFoodCostMap(destination) {
    const data = (typeof window !== 'undefined' && window.WAI_RESTAURANT_DATA) || null;
    const map = new Map();
    if (!data) return map;
    const norm = (s) => String(s || '').trim().replace(/臺/g, '台');
    const dest = norm(destination);
    if (!dest) return map;
    const stripped = dest.replace(/[縣市]$/u, '').trim();
    for (const key of Object.keys(data)) {
      if (key === '__generatedAt' || !Array.isArray(data[key])) continue;
      const k = norm(key);
      const match = k === dest || (stripped && k === stripped) || dest.includes(k) || k.includes(dest) || (stripped && (stripped.includes(k) || k.includes(stripped)));
      if (!match) continue;
      for (const r of data[key]) {
        if (!r || !r.name) continue;
        const hasCost = Number.isFinite(Number(r.costPerPerson));
        if (!hasCost && !r.costNote) continue;
        map.set(normalizeFeeName(r.name), { costPerPerson: hasCost ? Number(r.costPerPerson) : null, costNote: r.costNote || '' });
      }
    }
    return map;
  }
  // 以餐廳名稱查人均消費，回 { costPerPerson, costNote } 或 null。優先 stop 自帶的（生成時寫入），其次本地餐廳表。
  function lookupStopFoodCost(costMap, stop) {
    if (!stop) return null;
    if (Number.isFinite(Number(stop.costPerPerson))) return { costPerPerson: Number(stop.costPerPerson), costNote: stop.costNote || '' };
    if (!costMap || !costMap.size || !stop.name) return null;
    return costMap.get(normalizeFeeName(stop.name)) || null;
  }
  // 判斷是否為用餐站：isFoodStop（店名/emoji）或「在餐廳資料庫查得到」皆算餐廳。
  // 後者可修正 poi-data/restaurant-data 重疊時，店名不含關鍵字（如「林家臭豆腐」）被誤判成景點的情況。
  function stopIsFood(stop, foodCostMap) {
    if (typeof isFoodStop === 'function' && isFoodStop(stop)) return true;
    return !!lookupStopFoodCost(foodCostMap, stop);
  }
  // 加總各用餐站每人餐費（只計有數字者）。餐費為每人各付，不除以人數。
  function sumStopFoodPerPerson(stops, destination) {
    const costMap = getLocalFoodCostMap(destination);
    let sum = 0;
    for (const s of (Array.isArray(stops) ? stops : [])) {
      const hit = lookupStopFoodCost(costMap, s);
      if (hit && Number.isFinite(hit.costPerPerson)) sum += hit.costPerPerson;
    }
    return Math.round(sum);
  }

  // 用本地景點清單組 hint（沿用 v8 的「只能從此清單挑選」指令），交給 AI 重新排序。無資料回 ''。
  function buildLocalPoiHintBlock(destination) {
    const pois = getLocalPoiList(destination);
    if (!pois.length) return '';
    const lines = pois.slice(0, 40).map((p) => {
      const lat = Number(p.lat), lng = Number(p.lng);
      return [
        `景點名稱：${p.name}`,
        (Number.isFinite(lat) && Number.isFinite(lng)) ? `景點座標：lat ${lat}, lng ${lng}` : '',
        p.businessHours ? `營業時間：${p.businessHours}` : '',
        p.address ? `地址：${p.address}` : '',
        p.desc ? `描述：${p.desc}` : ''
      ].filter(Boolean).join('\n');
    });
    return `\n【本地景點資料庫】\n以下景點來自本地已驗證資料，座標均已驗證。你的任務是依照目前的行程狀態，只能從此清單中挑選景點來推薦或安排行程，禁止自行創造清單以外的景點，景點名稱必須與清單完全一致：\n\n${lines.join('\n\n')}`;
  }

  async function fetchLiveMapsPoiHintBlock(destination, interests = []) {
    if (!destination || !hasGooglePlacesService()) return '';
    const service = getPlacesService();
    const terms = new Set(['景點', '餐廳']);
    (interests || []).forEach(interest => {
      const mapping = {
        '美食': ['美食', '餐廳', '小吃'],
        '文化': ['文化', '部落', '工藝'],
        '自然': ['步道', '自然景觀'],
        '休閒': ['公園', '景點'],
        '藝術': ['藝術', '博物館'],
        '歷史': ['歷史', '古蹟'],
        '購物': ['市集', '商圈'],
        '戶外': ['戶外', '山林']
      };
      (mapping[interest] || []).forEach(t => terms.add(t));
    });

    const queries = Array.from(terms).slice(0, 3).map(t => `${destination} ${t}`);
    const seenNames = new Set();
    const allPlaces = [];

    for (const query of queries) {
      const results = await new Promise((resolve) => {
        service.textSearch({ query, language: 'zh-TW' }, (res, status) => {
          if (status === google.maps.places.PlacesServiceStatus.OK && res) {
            resolve(res);
          } else {
            resolve([]);
          }
        });
      });
      for (const place of results.slice(0, 8)) {
        const name = place.name;
        if (!name || seenNames.has(name)) continue;
        seenNames.add(name);
        allPlaces.push({
          name,
          rating: place.rating,
          address: place.formatted_address || place.vicinity || ''
        });
      }
    }
    if (allPlaces.length === 0) return '';

    const lines = allPlaces.map(p => {
      return [
        `景點名稱：${p.name}`,
        p.address ? `地址：${p.address}` : '',
        p.rating ? `評分：${p.rating}` : ''
      ].filter(Boolean).join('\n');
    });
    return `\n【Google Maps 即時景點清單】\n以下景點已直接從 Google Maps 取得，座標均已驗證。你的任務是依照目前的行程狀態，只能從此清單中挑選景點來推薦或安排行程，禁止自行創造清單以外的景點，景點名稱必須與清單完全一致：\n\n${lines.join('\n\n')}`;
  }

  // 餐廳每次重新規劃都即時抓最新（本地 poi-data.js 不含餐廳）
  async function fetchLiveFoodHintBlock(destination) {
    if (!destination || !hasGooglePlacesService()) return '';
    const service = getPlacesService();
    const queries = ['餐廳', '美食', '小吃'].map(t => `${resolveGeoRegion(destination)} ${t}`);
    const seenNames = new Set();
    const allPlaces = [];
    for (const query of queries) {
      const results = await new Promise((resolve) => {
        service.textSearch({ query, language: 'zh-TW' }, (res, status) => {
          resolve(status === google.maps.places.PlacesServiceStatus.OK && res ? res : []);
        });
      });
      for (const place of results.slice(0, 8)) {
        const name = place.name;
        if (!name || seenNames.has(name)) continue;
        seenNames.add(name);
        allPlaces.push({ name, rating: place.rating, address: place.formatted_address || place.vicinity || '' });
      }
    }
    if (!allPlaces.length) return '';
    const lines = allPlaces.map(p => [
      `餐廳名稱：${p.name}`,
      p.address ? `地址：${p.address}` : '',
      p.rating ? `評分：${p.rating}` : ''
    ].filter(Boolean).join('\n'));
    return `\n【即時餐廳候選（Google Maps）】\n用餐站請從以下餐廳挑選，名稱需與清單完全一致：\n\n${lines.join('\n\n')}`;
  }

  async function handleAiSendMessage() {
    if (isAiResponding) return;
    const input = document.getElementById('aiChatInput');
    if (!input) return;

    const userMessage = String(input.value || '').trim();
    if (!userMessage) return;

    if (userMessage.toLowerCase().startsWith('/gemini-key ')) {
      const key = userMessage.slice('/gemini-key '.length).trim();
      if (!key) {
        appendAiMessage('ai', '請在 /gemini-key 後面貼上你的 API Key。');
      } else {
        setGeminiApiKey(key);
        appendAiMessage('ai', '已儲存 Gemini API Key，現在可以直接問我即時行程調整。');
      }
      input.value = '';
      return;
    }

    appendAiMessage('user', userMessage);
    logTripEvent('chat_user_message', {
      message: userMessage
    });
    input.value = '';
    isAiResponding = true;
    setAiInputState(true);
    
    // 顯示加載指示器
    const loadingMsg = document.createElement('div');
    loadingMsg.className = 'chat-msg msg-ai';
    loadingMsg.id = 'aiLoadingIndicator';
    loadingMsg.innerHTML = `
      <div class="chat-avatar">🤖</div>
      <div>
        <div class="chat-bubble" style="display: flex; align-items: center; gap: 8px;">
          <span id="aiChatLoadingText">🔄 管家思考中</span>
          <span style="animation: spin 1s linear infinite;">⏳</span>
        </div>
      </div>
    `;
    const area = document.getElementById('aiChatArea');
    if (area) {
      area.appendChild(loadingMsg);
      area.scrollTop = area.scrollHeight;
    }

    try {
      const loadingTextSpan = document.getElementById('aiChatLoadingText');
      if (loadingTextSpan) loadingTextSpan.textContent = '🔄 正在從 Google Maps 抓取即時景點…';
      const dest = currentTripRegion || currentTripTitle || '台灣';
      const livePoiHint = await fetchLiveMapsPoiHintBlock(dest, currentTripPreferences?.interests || []);
      if (loadingTextSpan) loadingTextSpan.textContent = '🔄 管家思考中';

      const aiResult = await requestGeminiTravelPlan(userMessage, livePoiHint);
      const applyResult = await applyAiItineraryActions(aiResult.actions || []);

      const replyLines = [];
      replyLines.push(String(aiResult.reply || '我幫你整理了一個即時建議。'));
      if (applyResult.logs.length) {
        replyLines.push('');
        replyLines.push(`已套用：${applyResult.logs.join('、')}`);
      }
      
      // 移除加載指示器
      const loading = document.getElementById('aiLoadingIndicator');
      if (loading) loading.remove();

      appendAiMessage('ai', replyLines.join('\n'), aiResult.recommendation || null);
      logTripEvent('chat_ai_reply', {
        message: replyLines.join('\n'),
        recommendation: aiResult.recommendation || null,
        actionLogs: applyResult.logs,
        itinerary: buildItinerarySnapshot()
      });
      aiConversationHistory.push({ role: 'user', text: userMessage });
      aiConversationHistory.push({ role: 'ai', text: replyLines.join('\n') });
    } catch (error) {
      // 移除加載指示器
      const loading = document.getElementById('aiLoadingIndicator');
      if (loading) loading.remove();
      
      appendAiMessage('ai', `目前無法連線到 Gemini：${error.message}\n你可以先輸入 /gemini-key 你的APIKey，或稍後再試。`);
      logTripEvent('chat_ai_error', {
        message: String(error && error.message || error)
      });
    } finally {
      isAiResponding = false;
      setAiInputState(false);
      const area = document.getElementById('aiChatArea');
      if (area) area.scrollTop = area.scrollHeight;
      if (input) input.focus();
    }
  }

  function bindAiChatEvents() {
    const input = document.getElementById('aiChatInput');
    const button = document.getElementById('aiChatSendBtn');
    if (!input || !button) return;

    button.addEventListener('click', handleAiSendMessage);
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        handleAiSendMessage();
      }
    });
  }

  // 展開 / 收起 AI 抽屜
  function toggleAI() {
    const drawer = document.getElementById('aiDrawer');
    const willOpen = drawer && !drawer.classList.contains('open');
    if (!drawer) return;
    drawer.classList.toggle('open');
    if (willOpen) {
      renderAiWelcomeMessage();
      const input = document.getElementById('aiChatInput');
      if (input) input.focus();
    }
  }

  // 司機行程掌控面板拖動控制
  let driverPanelDragStart = 0;
  let isDraggingPanel = false;
  let driverPanelDidDrag = false;
  const driverPanelHandle = document.getElementById('driverPanelHandle');
  const driverPanel = document.getElementById('mobileDriverPanel');

  if (driverPanelHandle && driverPanel) {
    driverPanelHandle.addEventListener('touchstart', (e) => {
      isDraggingPanel = true;
      driverPanelDidDrag = false;
      driverPanelDragStart = e.touches[0].clientY;
      driverPanelHandle.style.opacity = '0.7';
    }, false);

    document.addEventListener('touchmove', (e) => {
      if (!isDraggingPanel || driverPanelDragStart === 0) return;
      
      const touchY = e.touches[0].clientY;
      const deltaY = touchY - driverPanelDragStart;
      const threshold = 15;

      if (deltaY > threshold) {
        driverPanel.classList.add('collapsed');
        driverPanelDidDrag = true;
        updateDriverPanelState();
      } else if (deltaY < -threshold) {
        driverPanel.classList.remove('collapsed');
        driverPanelDidDrag = true;
        updateDriverPanelState();
      }
    }, false);

    document.addEventListener('touchend', () => {
      isDraggingPanel = false;
      driverPanelDragStart = 0;
      driverPanelHandle.style.opacity = '1';
    }, false);

    // 支持滑鼠拖動（桌面測試）
    driverPanelHandle.addEventListener('mousedown', (e) => {
      isDraggingPanel = true;
      driverPanelDidDrag = false;
      driverPanelDragStart = e.clientY;
      driverPanelHandle.style.opacity = '0.7';
    }, false);

    document.addEventListener('mousemove', (e) => {
      if (!isDraggingPanel || driverPanelDragStart === 0) return;
      
      const deltaY = e.clientY - driverPanelDragStart;
      const threshold = 15;

      if (deltaY > threshold) {
        driverPanel.classList.add('collapsed');
        driverPanelDidDrag = true;
        updateDriverPanelState();
      } else if (deltaY < -threshold) {
        driverPanel.classList.remove('collapsed');
        driverPanelDidDrag = true;
        updateDriverPanelState();
      }
    }, false);

    document.addEventListener('mouseup', () => {
      isDraggingPanel = false;
      driverPanelDragStart = 0;
      driverPanelHandle.style.opacity = '1';
    }, false);

    driverPanelHandle.addEventListener('click', (e) => {
      e.preventDefault();
      if (driverPanelDidDrag) {
        driverPanelDidDrag = false;
        return;
      }
      driverPanel.classList.toggle('collapsed');
      updateDriverPanelState();
    }, false);

    updateDriverPanelState();
  }

  function buildRideStopList() {
    const schedule = buildReplanSchedule();
    if (!schedule || schedule.length === 0) return [];
    
    return schedule.map((stop, idx) => {
      const isEndpointStop = stop.type === 'start' || stop.type === 'end';
      const timeStr = minutesToClock(stop.start);
      
      let dotStyle = '';
      if (currentTripStatus === 'ongoing') {
        if (idx < currentStopIndex) {
          dotStyle = 'background: var(--ink3);'; // Grayed out
        } else if (idx === currentStopIndex) {
          dotStyle = 'background: var(--accent); box-shadow: 0 0 0 3px var(--accent-light);'; // Active highlight
        } else {
          dotStyle = 'background: var(--accent2);'; // Normal upcoming
        }
      } else {
        if (idx === 0) {
          dotStyle = 'background: var(--accent);';
        } else if (idx === schedule.length - 1) {
          dotStyle = 'background: var(--ink2);';
        } else {
          dotStyle = 'background: var(--accent2);';
        }
      }

      return {
        id: stop.id,
        emoji: stop.emoji || '📍',
        name: stop.name,
        timeStr,
        isEndpointStop,
        dotStyle,
        isCurrent: (currentTripStatus === 'ongoing' && idx === currentStopIndex),
        isVisited: (currentTripStatus === 'ongoing' && idx < currentStopIndex),
        desc: stop.desc || ''
      };
    });
  }

  const rideModes = [
    {
      id: 'identity',
      label: 'identity',
      title: '你今天的角色是？',
      subtitle: '先辨識身份，再切換到正確的任務面板。',
      badge: '身份選擇',
      icon: '🎭',
      chips: ['乘客', '司機', '協作者'],
      template: () => `
        <div class="phone-status"><span>9:41</span><span class="status-icons">◉ ◉ ◉ 100%</span></div>
        <div class="screen-header">
          <div class="screen-title">你今天的角色是？</div>
          <div class="screen-subtitle">根據目前定位，請先選擇這趟行程的主身份。</div>
        </div>
        <div class="screen-body">
          <div class="screen-card soft">
            <div class="screen-pill-row">
              <span class="screen-pill green">已登入</span>
              <span class="screen-pill gray">台東站附近</span>
            </div>
          </div>
          <div class="role-grid">
            <div class="role-card active"><div><div class="role-card-name">規劃者</div><div class="role-card-sub">查看完整旅程、調整節奏與收藏回憶。</div></div><div class="screen-pill blue">推薦</div></div>
            <div class="role-card"><div><div class="role-card-name">乘客</div><div class="role-card-sub">只看接送、等待與轉乘資訊。</div></div><div class="screen-pill">切換</div></div>
            <div class="role-card"><div><div class="role-card-name">司機</div><div class="role-card-sub">顯示路況、接駁與動態改道。</div></div><div class="screen-pill orange">行駛中</div></div>
            <div class="role-card"><div><div class="role-card-name">協作者</div><div class="role-card-sub">幫忙編輯行程、補充備註與照片。</div></div><div class="screen-pill gray">共編</div></div>
          </div>
          <div class="screen-actions">
            <button class="screen-btn primary">確認身份</button>
            <button class="screen-btn secondary">稍後再說</button>
          </div>
        </div>
      `
    },
    {
      id: 'change-identity',
      label: 'change identity',
      title: '切換身份',
      subtitle: '在不同旅程狀態下，快速改成合適的使用模式。',
      badge: '模式切換',
      icon: '🪪',
      chips: ['身份', '旅伴', '裝置'],
      template: () => `
        <div class="phone-status"><span>9:41</span><span class="status-icons">◉ ◉ ◉ 100%</span></div>
        <div class="screen-header">
          <div class="screen-title">切換身份</div>
          <div class="screen-subtitle">目前帳號：Alanylove。你可以切到不同旅伴模式。</div>
        </div>
        <div class="screen-body">
          <div class="screen-card success">
            <div class="screen-row">
              <div class="screen-kv"><div class="screen-kv-label">Current</div><div class="screen-kv-value">規劃者</div></div>
              <div class="screen-pill green">已啟用</div>
            </div>
          </div>
          <div class="role-grid">
            <div class="role-card active"><div><div class="role-card-name">規劃者</div><div class="role-card-sub">可以編輯全部內容與同步成員。</div></div><div class="screen-pill blue">主模式</div></div>
            <div class="role-card"><div><div class="role-card-name">訪客</div><div class="role-card-sub">先瀏覽內容，不會留下編輯紀錄。</div></div><div class="screen-pill gray">保守</div></div>
            <div class="role-card"><div><div class="role-card-name">旅伴</div><div class="role-card-sub">可回覆留言並加入共編路線。</div></div><div class="screen-pill green">互動</div></div>
            <div class="role-card"><div><div class="role-card-name">司機</div><div class="role-card-sub">顯示駕駛專屬路線與動態提醒。</div></div><div class="screen-pill orange">專注</div></div>
          </div>
          <div class="screen-actions">
            <button class="screen-btn primary">確認切換</button>
            <button class="screen-btn secondary">查看行程</button>
          </div>
          <div class="screen-card soft"><div class="screen-pill-row"><span class="screen-pill">自動同步</span><span class="screen-pill">共享行程</span><span class="screen-pill">提醒模式</span></div></div>
        </div>
      `
    },
    {
      id: 'confirm-identity',
      label: 'confirm identity',
      title: '確認身份',
      subtitle: '切換後會重新載入對應的 UI 與安全提示。',
      badge: '安全確認',
      icon: '✅',
      chips: ['確認', '取消', '授權'],
      template: () => `
        <div class="phone-status"><span>9:41</span><span class="status-icons">◉ ◉ ◉ 100%</span></div>
        <div class="screen-header">
          <div class="screen-title">確認要切換成司機模式？</div>
          <div class="screen-subtitle">這會啟用導航、路況與改道建議。</div>
        </div>
        <div class="screen-body">
          <div class="screen-card alert" style="text-align:center; padding: 18px 12px;">
            <div style="font-size: 40px; line-height: 1; margin-bottom: 8px;">🚕</div>
            <div style="font-size: 15px; font-weight: 800; color: var(--ink);">切換為司機模式</div>
            <div style="font-size: 12px; color: var(--ink2); margin-top: 6px; line-height: 1.5;">將顯示行駛中的路線、接人提示與安全建議。</div>
          </div>
          <div class="screen-actions">
            <button class="screen-btn primary">確認</button>
            <button class="screen-btn secondary">取消</button>
          </div>
          <div class="screen-card soft">
            <div class="screen-row">
              <div class="screen-kv"><div class="screen-kv-label">提示</div><div class="screen-kv-value" style="font-size:14px;">需切到對應裝置權限</div></div>
              <span class="screen-pill orange">一次確認</span>
            </div>
          </div>
        </div>
      `
    },
    {
      id: 'driver-mode',
      label: 'Driver mode',
      title: '駕駛模式',
      subtitle: '提供目前路況、導航狀態與剩餘時間。',
      badge: '駕駛中',
      icon: '🧭',
      chips: ['導航', 'ETA', '安全'],
      template: () => `
        <div class="phone-status"><span>9:41</span><span class="status-icons">◉ ◉ ◉ 100%</span></div>
        <div class="screen-header">
          <div class="screen-title">駕駛模式</div>
          <div class="screen-subtitle">正在前往接人點，請注意前方路況與轉彎提示。</div>
        </div>
        <div class="screen-body">
          <div class="screen-row">
            <div class="screen-card soft" style="flex:1;">
              <div class="screen-kv-label">ETA</div><div class="screen-kv-value">25 分鐘</div>
            </div>
            <div class="screen-card soft" style="flex:1;">
              <div class="screen-kv-label">距離</div><div class="screen-kv-value">8.5 km</div>
            </div>
          </div>
          <div class="screen-card">
            <div class="timeline-mini">
              <div class="timeline-mini-item"><div class="timeline-mini-dot"></div><div class="timeline-mini-content"><div class="timeline-mini-title">前方路口</div><div class="timeline-mini-sub">300m 後左轉，接上目的地前方道路。</div></div></div>
              <div class="timeline-mini-item"><div class="timeline-mini-dot" style="background: var(--accent2);"></div><div class="timeline-mini-content"><div class="timeline-mini-title">接人點</div><div class="timeline-mini-sub">乘客已在月台出口等候。</div></div></div>
              <div class="timeline-mini-item"><div class="timeline-mini-dot" style="background: var(--ink3);"></div><div class="timeline-mini-content"><div class="timeline-mini-title">到達時間</div><div class="timeline-mini-sub">預計 10:30 抵達。</div></div></div>
            </div>
          </div>
          <div class="screen-card success">
            <div class="screen-row"><div class="screen-kv"><div class="screen-kv-label">Status</div><div class="screen-kv-value" style="font-size:15px;">路線穩定，建議維持現行方向</div></div><span class="screen-pill green">穩定</span></div>
          </div>
        </div>
      `
    },
    {
      id: 'driver-route',
      label: 'Driver route',
    title: '今日路線',
    subtitle: '顯示每日出發點、停靠點與時間標記。',
    badge: '路線總覽',
    icon: '🗺️',
    chips: ['Day 1', 'Route', 'Stops'],
    template: () => {
      const stops = buildRideStopList();
      if (stops.length === 0) {
        return `
          <div class="phone-status"><span>9:41</span><span class="status-icons">◉ ◉ ◉ 100%</span></div>
          <div class="screen-header">
            <div class="screen-title">今日路線</div>
            <div class="screen-subtitle">尚未載入路線</div>
          </div>
          <div class="screen-body" style="justify-content:center;align-items:center;color:var(--ink3);">
            <div>🗺️ 暫無路線資料</div>
          </div>
        `;
      }

      const startStop = stops[0];
      const remainingStops = stops.slice(1);
      
      const listHtml = remainingStops.map(s => {
        let extraClass = s.isCurrent ? ' active' : (s.isVisited ? ' visited' : '');
        const textDecoration = s.isVisited ? 'style="text-decoration:line-through;color:var(--ink3);"' : '';
        return `
          <div class="timeline-mini-item${extraClass}">
            <div class="timeline-mini-dot" style="${s.dotStyle}"></div>
            <div class="timeline-mini-content">
              <div class="timeline-mini-title" ${textDecoration}>${s.emoji} ${escapeHtml(s.name)}</div>
              <div class="timeline-mini-sub">${s.timeStr} · ${escapeHtml(s.desc || '暫無描述')}</div>
            </div>
          </div>
        `;
      }).join('');

      return `
        <div class="phone-status"><span>9:41</span><span class="status-icons">◉ ◉ ◉ 100%</span></div>
        <div class="screen-header">
          <div class="screen-title">今日路線</div>
          <div class="screen-subtitle">Day 1 · ${stops.length} 筆停靠點 · 進行中狀態同步。</div>
        </div>
        <div class="screen-body">
          <div class="screen-card soft">
            <div class="screen-row">
              <div class="screen-kv">
                <div class="screen-kv-label">起點</div>
                <div class="screen-kv-value" style="font-size:15px;">${escapeHtml(startStop.name)}</div>
              </div>
              <span class="screen-pill blue">${startStop.timeStr}</span>
            </div>
          </div>
          <div class="screen-card">
            <div class="timeline-mini">
              ${listHtml}
            </div>
          </div>
          <div class="screen-actions">
            <button class="screen-btn primary" onclick="setRideMode('driver-mode')">開始導航</button>
            <button class="screen-btn secondary" onclick="switchView('itinerary')">編輯路線</button>
          </div>
        </div>
      `;
    }
  },
    {
      id: 'passenger',
      label: 'passenger',
      title: '乘客專區',
      subtitle: '讓乘客看到候車、接駁與可操作功能。',
      badge: '乘客視角',
      icon: '🧍',
      chips: ['等待中', '接駁', '共編'],
      template: () => `
        <div class="phone-status"><span>9:41</span><span class="status-icons">◉ ◉ ◉ 100%</span></div>
        <div class="screen-header">
          <div class="screen-title">乘客專區</div>
          <div class="screen-subtitle">你目前已在車站，離上車還有 4 人進度。</div>
        </div>
        <div class="screen-body">
          <div class="screen-card success">
            <div class="screen-row"><div class="screen-kv"><div class="screen-kv-label">目前狀態</div><div class="screen-kv-value" style="font-size:15px;">已進入等候中</div></div><span class="screen-pill green">4 人</span></div>
          </div>
          <div class="screen-actions">
            <button class="screen-btn secondary">找廁所</button>
            <button class="screen-btn secondary">聯絡司機</button>
            <button class="screen-btn secondary">查看行李</button>
            <button class="screen-btn secondary">拍照留念</button>
          </div>
          <div class="screen-card soft">
            <div class="screen-row" style="align-items:flex-start;"><div class="screen-kv"><div class="screen-kv-label">小提醒</div><div class="screen-kv-value" style="font-size:15px;">請在月台出口附近等候</div></div><span class="screen-pill blue">自動提醒</span></div>
          </div>
          <div class="screen-card">
            <div class="timeline-mini-item" style="margin-bottom:8px;"><div class="timeline-mini-dot"></div><div class="timeline-mini-content"><div class="timeline-mini-title">乘車小組</div><div class="timeline-mini-sub">司機已發送定位更新與車牌資訊。</div></div></div>
          </div>
        </div>
      `
    },
    {
      id: 'shotgun',
      label: 'shotgun',
      title: '副駕輔助',
      subtitle: '副駕模式會強調導覽、協助與即時提醒。',
      badge: '協助模式',
      icon: '🎤',
      chips: ['語音', '提醒', '副駕'],
      template: () => `
        <div class="phone-status"><span>9:41</span><span class="status-icons">◉ ◉ ◉ 100%</span></div>
        <div class="screen-header">
          <div class="screen-title">副駕輔助</div>
          <div class="screen-subtitle">前方約 500m 有路況變化，建議預先口述提醒。</div>
        </div>
        <div class="screen-body">
          <div class="screen-card alert">
            <div class="screen-row"><div class="screen-kv"><div class="screen-kv-label">警示</div><div class="screen-kv-value" style="font-size:15px;">前方變道，請注意左右車流</div></div><span class="screen-pill orange">即時</span></div>
          </div>
          <div class="screen-card soft">
            <div class="screen-pill-row"><span class="screen-pill">開啟語音</span><span class="screen-pill">播報路況</span><span class="screen-pill">分享目的地</span></div>
          </div>
          <div class="screen-card">
            <div class="timeline-mini-item"><div class="timeline-mini-dot" style="background: var(--accent2);"></div><div class="timeline-mini-content"><div class="timeline-mini-title">500m 後右轉</div><div class="timeline-mini-sub">進入主幹道後會更順暢。</div></div></div>
          </div>
          <div class="screen-actions">
            <button class="screen-btn primary">查看路線</button>
            <button class="screen-btn secondary">取消提醒</button>
          </div>
        </div>
      `
    },
    {
      id: 'change-road',
      label: 'change road',
      title: '替代路線建議',
      subtitle: '發生塞車或突發狀況時，提供可替換的路線與 ETA。',
      badge: '改道建議',
      icon: '🔀',
      chips: ['改道', 'ETA', '風險'],
      template: () => `
        <div class="phone-status"><span>9:41</span><span class="status-icons">◉ ◉ ◉ 100%</span></div>
        <div class="screen-header">
          <div class="screen-title">替代路線建議</div>
          <div class="screen-subtitle">主路段壅塞 8 分鐘，AI 建議改走河堤支線。</div>
        </div>
        <div class="screen-body">
          <div class="screen-card success">
            <div class="screen-row"><div class="screen-kv"><div class="screen-kv-label">推薦路線</div><div class="screen-kv-value" style="font-size:15px;">河堤支線</div></div><span class="screen-pill green">快 8 分鐘</span></div>
          </div>
          <div class="screen-card danger">
            <div class="screen-row"><div class="screen-kv"><div class="screen-kv-label">原始路線</div><div class="screen-kv-value" style="font-size:15px;">市區幹道</div></div><span class="screen-pill orange">壅塞</span></div>
          </div>
          <div class="screen-card soft">
            <div class="screen-pill-row"><span class="screen-pill">改道後 ETA 25 分鐘</span><span class="screen-pill">少 3 個紅燈</span></div>
          </div>
          <div class="screen-actions">
            <button class="screen-btn primary">採用新路線</button>
            <button class="screen-btn secondary">維持原路線</button>
          </div>
        </div>
      `
    },
    {
      id: 'user',
      label: 'user',
      title: '現在在哪裡',
      subtitle: '顯示目前位置與快速操作入口，適合單人導航。',
      badge: '定位狀態',
      icon: '📍',
      chips: ['定位', '附近', '操作'],
      template: () => `
        <div class="phone-status"><span>9:41</span><span class="status-icons">◉ ◉ ◉ 100%</span></div>
        <div class="screen-header">
          <div class="screen-title">現在在哪裡</div>
          <div class="screen-subtitle">小碎島海灘附近，等待下一段接駁。</div>
        </div>
        <div class="screen-body">
          <div class="screen-card soft" style="text-align:center; padding: 18px 12px;">
            <div style="font-size: 42px; margin-bottom: 8px;">🏖️</div>
            <div class="screen-kv-value" style="font-size:16px;">小碎島</div>
            <div style="font-size: 12px; color: var(--ink2); margin-top: 4px; line-height: 1.45;">小雨轉晴，步行約 6 分鐘可到停車點。</div>
          </div>
          <div class="screen-row">
            <div class="screen-card" style="flex:1; text-align:center;"><div class="screen-kv-label">天氣</div><div class="screen-kv-value">26°</div></div>
            <div class="screen-card" style="flex:1; text-align:center;"><div class="screen-kv-label">步行</div><div class="screen-kv-value">6 分鐘</div></div>
          </div>
          <div class="screen-actions">
            <button class="screen-btn primary">回到行程</button>
            <button class="screen-btn secondary">分享位置</button>
          </div>
        </div>
      `
    },
    {
      id: 'trip-detail',
      label: 'trip detail',
    title: '今天行程',
    subtitle: '完整時間線與地點清單，方便總覽與分享。',
    badge: '行程詳情',
    icon: '🧾',
    chips: ['Day 1', '細節', '分享'],
    template: () => {
      const stops = buildRideStopList();
      if (stops.length === 0) {
        return `
          <div class="phone-status"><span>9:41</span><span class="status-icons">◉ ◉ ◉ 100%</span></div>
          <div class="screen-header">
            <div class="screen-title">今天行程</div>
            <div class="screen-subtitle">尚未載入行程</div>
          </div>
          <div class="screen-body" style="justify-content:center;align-items:center;color:var(--ink3);">
            <div>🗺️ 暫無行程資料</div>
          </div>
        `;
      }

      let totalTransit = 0;
      replanStops.forEach(s => {
        if (s.transitMin) totalTransit += s.transitMin;
      });
      const transitText = totalTransit > 0 ? `${totalTransit} 分鐘移動` : '開始今日旅程';

      const titleText = currentTripRegion ? `${currentTripRegion}探索` : '微旅行';
      const subtitleText = `Day 1 · ${stops.length} 個節點。`;

      const listHtml = stops.map(s => {
        let extraClass = s.isCurrent ? ' active' : (s.isVisited ? ' visited' : '');
        const textDecoration = s.isVisited ? 'style="text-decoration:line-through;color:var(--ink3);"' : '';
        return `
          <div class="timeline-mini-item${extraClass}">
            <div class="timeline-mini-dot" style="${s.dotStyle}"></div>
            <div class="timeline-mini-content">
              <div class="timeline-mini-title" ${textDecoration}>${s.emoji} ${escapeHtml(s.name)}</div>
              <div class="timeline-mini-sub">${s.timeStr} · ${escapeHtml(s.desc || '暫無描述')}</div>
            </div>
          </div>
        `;
      }).join('');

      return `
        <div class="phone-status"><span>9:41</span><span class="status-icons">◉ ◉ ◉ 100%</span></div>
        <div class="screen-header">
          <div class="screen-title">今天行程</div>
          <div class="screen-subtitle">${escapeHtml(titleText)} · ${subtitleText}</div>
        </div>
        <div class="screen-body">
          <div class="screen-card soft">
            <div class="screen-row">
              <div class="screen-kv">
                <div class="screen-kv-label">行程狀態</div>
                <div class="screen-kv-value" style="font-size:15px;color:var(--accent);font-weight:700;">
                  ${currentTripStatus === 'ongoing' ? '⚡ 進行中' : currentTripStatus === 'completed' ? '🎉 已完成' : '✏️ 規劃中'}
                </div>
              </div>
              <span class="screen-pill blue">${transitText}</span>
            </div>
          </div>
          <div class="screen-card">
            <div class="timeline-mini">
              ${listHtml}
            </div>
          </div>
          <div class="screen-actions">
            <button class="screen-btn primary" onclick="openTravelTools('export')">分享行程</button>
            <button class="screen-btn secondary" onclick="switchView('itinerary')">查看詳細</button>
          </div>
        </div>
      `;
    }
  },
    {
      id: 'memory',
      label: 'memory',
      title: '旅遊回憶',
      subtitle: '把每段旅行照片與註記收進收藏區。',
      badge: '回憶收藏',
      icon: '📚',
      chips: ['照片', '回憶', '收藏'],
      template: () => `
        <div class="phone-status"><span>9:41</span><span class="status-icons">◉ ◉ ◉ 100%</span></div>
        <div class="screen-header">
          <div class="screen-title">旅遊回憶</div>
          <div class="screen-subtitle">把今天的故事整理成可以回看的相簿。</div>
        </div>
        <div class="screen-body">
          <div class="screen-card soft">
            <div class="screen-row"><div class="screen-kv"><div class="screen-kv-label">今天新增</div><div class="screen-kv-value" style="font-size:15px;">6 張照片 / 3 則註記</div></div><span class="screen-pill green">已同步</span></div>
          </div>
          <div class="memory-grid">
            <div class="memory-tile"><div class="memory-thumb">🌊</div><div class="memory-meta"><div class="memory-name">海邊散步</div><div class="memory-note">日落前的藍調時刻。</div></div></div>
            <div class="memory-tile"><div class="memory-thumb">🍜</div><div class="memory-meta"><div class="memory-name">夜市晚餐</div><div class="memory-note">朋友推薦的在地小吃。</div></div></div>
            <div class="memory-tile"><div class="memory-thumb">🚗</div><div class="memory-meta"><div class="memory-name">接駁路線</div><div class="memory-note">改道後少等 8 分鐘。</div></div></div>
            <div class="memory-tile"><div class="memory-thumb">📸</div><div class="memory-meta"><div class="memory-name">合照</div><div class="memory-note">完成這趟共乘紀錄。</div></div></div>
          </div>
          <div class="screen-actions">
            <button class="screen-btn primary">加入相簿</button>
            <button class="screen-btn secondary" onclick="openTravelTools('export')">匯出分享</button>
          </div>
        </div>
      `
    }
  ];

  const rideModeRail = document.getElementById('rideModeRail');
  const rideModeKicker = document.getElementById('rideModeKicker');
  const rideModeTitle = document.getElementById('rideModeTitle');
  const rideModeSubtitle = document.getElementById('rideModeSubtitle');
  const rideModeBadge = document.getElementById('rideModeBadge');
  const rideModeScreen = document.getElementById('rideModeScreen');
  let activeRideMode = 'passenger';

  function renderRideflowRail() {
    if (!rideModeRail) return;
    rideModeRail.innerHTML = rideModes.map((mode) => `
      <button class="mode-chip${mode.id === activeRideMode ? ' active' : ''}" onclick="setRideMode('${mode.id}')">
        <div class="mode-chip-top">
          <div>
            <div class="mode-chip-label">${mode.label}</div>
            <div class="mode-chip-title">${mode.title}</div>
          </div>
          <div style="font-size: 18px; line-height: 1;">${mode.icon}</div>
        </div>
        <div class="mode-chip-desc">${mode.subtitle}</div>
      </button>
    `).join('');
  }

  function renderRideMode(modeId) {
    const mode = rideModes.find((item) => item.id === modeId) || rideModes[0];
    activeRideMode = mode.id;
    rideModeKicker.textContent = mode.label;
    rideModeTitle.textContent = mode.title;
    rideModeSubtitle.textContent = mode.subtitle;
    rideModeBadge.textContent = mode.badge;
    rideModeScreen.innerHTML = mode.template();
    renderRideflowRail();
    bindRideflowActions(mode.id);
  }

  function setRideMode(modeId) {
    renderRideMode(modeId);
  }

  function openItineraryStop(stopId) {
    const stop = replanStops.find(s => s.id === stopId) || replanStops.find(s => s.id.includes(stopId));
    if (!stop) {
      switchView('itinerary');
      return;
    }

    switchView('itinerary');
    activeItineraryStopId = stop.id;
    // 自動聚焦該停靠點所屬的路線階段（不清除 activeItineraryStopId），讓地圖路線跳到該段並顯示 pin
    const _stopIdx = replanStops.findIndex(s => s.id === stop.id);
    const _stage = getRouteStageBySourceStopIndex(_stopIdx)
      || routeStageCache.find(s => s && s.destinationStopIndex === _stopIdx) || null;
    if (_stage && _stage.index !== activeRouteStage) {
      activeRouteStage = _stage.index;
      updateRouteRendererVisibility(currentRouteBounds, _stage.origin, _stage.destination);
    }
    renderToiletMarkersForActiveRouteStage();

    if (stop.mapPinId) {
      showPinInfo(stop.mapPinId);
    }

    const stopNode = document.getElementById(`itinerary-stop-${stop.id}`) || document.getElementById(`itinerary-stop-${stopId}`);
    if (stopNode) {
      const panel = stopNode.closest('.left-panel') || document.querySelector('.left-panel');
      if (panel) {
        const panelRect = panel.getBoundingClientRect();
        const nodeRect = stopNode.getBoundingClientRect();
        const targetScrollTop = panel.scrollTop + (nodeRect.top - panelRect.top) - (panelRect.height / 2) + (nodeRect.height / 2);
        panel.scrollTo({ top: targetScrollTop, behavior: 'smooth' });
      } else {
        stopNode.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }

  function bindRideflowActions(modeId) {
    const modeButtons = {
      identity: [
        () => {
          setUserRole('passenger');
          openItineraryStop('luggage');
        },
        () => switchView('itinerary')
      ],
      'change-identity': [
        () => {
          setUserRole('driver');
          openItineraryStop('cafe');
        },
        () => switchView('members')
      ],
      'confirm-identity': [
        () => {
          setUserRole('driver');
          openItineraryStop('shop');
        },
        () => switchView('itinerary')
      ],
      'driver-mode': [
        () => {
          setUserRole('driver');
          openItineraryStop('luggage');
        },
        () => openItineraryStop('shop')
      ],
      'driver-route': [
        () => {
          setUserRole('driver');
          openItineraryStop('luggage');
        },
        () => setRideMode('change-road')
      ],
      passenger: [
        () => {
          setUserRole('passenger');
          openItineraryStop('luggage');
        },
        () => switchView('members'),
        () => openItineraryStop('return'),
        () => switchView('weather')
      ],
      shotgun: [
        () => openItineraryStop('shop'),
        () => openItineraryStop('cafe')
      ],
      'change-road': [
        () => openItineraryStop('shop'),
        () => openItineraryStop('return')
      ],
      user: [
        () => openItineraryStop('return'),
        () => switchView('members')
      ],
      'trip-detail': [
        () => switchView('members'),
        () => openItineraryStop('shop')
      ],
      memory: [
        () => switchView('members'),
        () => openItineraryStop('return')
      ]
    };

    const buttons = rideModeScreen.querySelectorAll('button');
    const handlers = modeButtons[modeId] || [];
    buttons.forEach((button, index) => {
      const handler = handlers[index];
      if (!handler) return;
      button.addEventListener('click', handler);
    });
  }

  // ── Google Maps API 整合 ──
  let map;
  let markers = {};
  let mergedAreaShapes = {}; // 大景點涵蓋範圍的半透明色塊（key = mapPinId）
  let currentOpenPin = null; // 紀錄目前打開資訊卡的圖釘
  let directionsService;
  let directionsRenderers = []; // 存放每個階段的 Renderer
  let walkRenderers = [];   // 每個階段的步行 overlay 陣列（停車點↔景點）
  let parkingMarkers = [];  // 每個階段的 🅿️ 停車點 marker 陣列
  let activeRouteStage = null; // null 代表顯示全部路線
  let activeItineraryStopId = null; // 當點選行程階段時的活跃停靠點
  let currentRouteBounds = null;
  let currentRouteFocusBounds = null;
  let routeStageCache = [];
  let mobileRouteSheetExpanded = false;
  let routeRenderToken = 0;
  let mapRebuildToken = 0;
  let routeViewportAnimationToken = 0;
  let toiletRenderToken = 0;
  let routeMidLabels = [];

  const mapPinLocations = {};

  const ROUTE_MODE_COLORS = { car: '#1D4ED8', scooter: '#EA580C', walk: '#F97316' };

  function createEmojiPinIcon(emoji) {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="56" height="72" viewBox="0 0 56 72">
        <defs>
          <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#000000" flood-opacity="0.18"/>
          </filter>
        </defs>
        <g filter="url(#shadow)">
          <path d="M28 68C28 68 8 46.8 8 28C8 17.2 16.9 8 28 8C39.1 8 48 17.2 48 28C48 46.8 28 68 28 68Z" fill="#2e7d6d"/>
          <circle cx="28" cy="28" r="15" fill="#ffffff"/>
          <text x="28" y="33" text-anchor="middle" font-size="18">${emoji}</text>
        </g>
      </svg>`;

    return {
      url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
      scaledSize: new google.maps.Size(56, 72),
      anchor: new google.maps.Point(28, 68)
    };
  }

  function createEmojiPinIconNumbered(emoji, number) {
    const label = String(number);
    const fontSize = label.length > 1 ? 9 : 11;
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="64" height="72" viewBox="0 0 64 72">
        <defs>
          <filter id="sh2" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#000000" flood-opacity="0.18"/>
          </filter>
        </defs>
        <g filter="url(#sh2)">
          <path d="M28 68C28 68 8 46.8 8 28C8 17.2 16.9 8 28 8C39.1 8 48 17.2 48 28C48 46.8 28 68 28 68Z" fill="#2e7d6d"/>
          <circle cx="28" cy="28" r="15" fill="#ffffff"/>
          <text x="28" y="33" text-anchor="middle" font-size="18">${emoji}</text>
        </g>
        <circle cx="50" cy="13" r="10" fill="#1a56db" stroke="#ffffff" stroke-width="2"/>
        <text x="50" y="17" text-anchor="middle" font-size="${fontSize}" font-weight="800" fill="#ffffff" font-family="system-ui,sans-serif">${label}</text>
      </svg>`;
    return {
      url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
      scaledSize: new google.maps.Size(64, 72),
      anchor: new google.maps.Point(28, 68)
    };
  }

  // 大景點內的小景點：紫色水滴大頭針（與主站點青綠、路線藍/橘明顯區隔）
  function createSubSpotPinIcon() {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="30" height="40" viewBox="0 0 30 40">
        <defs>
          <filter id="ssh" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="1.5" stdDeviation="1.5" flood-color="#000000" flood-opacity="0.2"/>
          </filter>
        </defs>
        <g filter="url(#ssh)">
          <path d="M15 38C15 38 4 25.5 4 14.5C4 8.7 8.9 4 15 4C21.1 4 26 8.7 26 14.5C26 25.5 15 38 15 38Z" fill="#7C3AED" stroke="#ffffff" stroke-width="2.2"/>
          <circle cx="15" cy="14.5" r="5" fill="#ffffff"/>
        </g>
      </svg>`;
    return {
      url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
      scaledSize: new google.maps.Size(30, 40),
      anchor: new google.maps.Point(15, 38)
    };
  }

  function createRouteMidLabelIcon(modeIcon, destName, color) {
    const truncated = (destName || '').length > 7 ? destName.substring(0, 7) + '…' : (destName || '目的地');
    const charCount = [...truncated].length;
    const textW = charCount * 13 + 36;
    const totalW = textW + 4;
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="26" viewBox="0 0 ${totalW} 26">
        <rect x="0" y="0" rx="13" ry="13" width="${totalW}" height="26" fill="${color}" opacity="0.93"/>
        <text x="${totalW / 2}" y="17" text-anchor="middle" font-size="12" font-weight="700" fill="#ffffff" font-family="system-ui,sans-serif">${modeIcon}→${truncated}</text>
      </svg>`;
    return {
      url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
      scaledSize: new google.maps.Size(totalW, 26),
      anchor: new google.maps.Point(totalW / 2, 13)
    };
  }

  function createLatLng(lat, lng) {
    return { lat, lng };
  }

  // Ensure a coordinate object is safe to use with Google Maps (fallback to trip center)
  function safeLatLng(pos) {
    const coordinates = readCoordinateObject(pos);
    if (coordinates) return coordinates;
    try {
      const fallback = resolveTripCenter(currentTripRegion, currentTripTitle) || { lat: 23.6978, lng: 120.9605 };
      // use debug level to reduce Console noise in production
      if (console && typeof console.debug === 'function') {
        console.debug('safeLatLng: failed to parse coordinate, falling back to trip center', pos, '=>', fallback);
      }
      return fallback;
    } catch (e) {
      if (console && typeof console.debug === 'function') {
        console.debug('safeLatLng: failed to parse coordinate and resolve trip center, using hardcoded fallback', pos, e);
      }
      return { lat: 23.6978, lng: 120.9605 };
    }
  }

  function rememberMarkerBasePosition(marker, position) {
    if (!marker) return null;
    const coordinates = safeLatLng(position);
    marker._basePosition = coordinates;
    return coordinates;
  }

  function getMarkerBasePosition(marker) {
    if (!marker) return null;
    if (marker._basePosition) return marker._basePosition;
    const position = marker.getPosition && marker.getPosition();
    if (!position) return null;
    return createLatLng(position.lat(), position.lng());
  }

  function buildMarkerGroupKey(position) {
    if (!position) return '';
    return `${position.lat.toFixed(6)},${position.lng.toFixed(6)}`;
  }

  function getMarkerGroup(pinId) {
    const marker = markers[pinId];
    if (!marker) return [];

    const basePosition = getMarkerBasePosition(marker) || mapPinLocations[pinId];
    if (!basePosition) return [{ pinId, marker }];

    const groupKey = buildMarkerGroupKey(basePosition);
    return Object.entries(markers)
      .map(([otherPinId, otherMarker]) => ({
        pinId: otherPinId,
        marker: otherMarker,
        basePosition: getMarkerBasePosition(otherMarker)
      }))
      .filter((item) => item.marker && item.basePosition && buildMarkerGroupKey(item.basePosition) === groupKey);
  }

  function setMarkerLayerState(pinId, isActive) {
    const group = getMarkerGroup(pinId);
    group.forEach((item, index) => {
      if (!item.marker) return;
      if (isActive) {
        const baseZIndex = item.pinId === pinId ? 2000 : 1990 - index;
        item.marker.setZIndex(baseZIndex);
      } else {
        item.marker.setZIndex(null);
      }
    });
  }

  function clearRenderedMapMarkers() {
    Object.values(markers).forEach((marker) => {
      if (marker && typeof marker.setMap === 'function') {
        marker.setMap(null);
      }
    });
    markers = {};
    Object.values(mergedAreaShapes).forEach((circle) => {
      if (circle && typeof circle.setMap === 'function') {
        circle.setMap(null);
      }
    });
    mergedAreaShapes = {};
    clearSubSpotMarkers();
  }

  function getStopToiletLocations(stop) {
    if (!stop) return [];
    const rawList = Array.isArray(stop.nearbyToiletLocations)
      ? stop.nearbyToiletLocations
      : Array.isArray(stop.nearbyToilets)
        ? stop.nearbyToilets
        : [];

    return rawList.map((item, index) => {
      if (!item) return null;
      if (typeof item === 'string') {
        return { name: item };
      }
      const coordinates = readCoordinateObject(item)
        || readCoordinateObject(item.location)
        || readCoordinateObject(item.position)
        || readCoordinateObject(item.coordinates);
      const name = String(item.name || item.title || item.label || item.address || item.vicinity || `廁所 ${index + 1}`).trim();
      return {
        name: name || `廁所 ${index + 1}`,
        lat: coordinates ? coordinates.lat : null,
        lng: coordinates ? coordinates.lng : null,
        address: item.address || item.vicinity || item.location || '',
        source: item.source || item.coordinateSource || '',
        confidence: item.confidence || ''
      };
    }).filter(Boolean);
  }

  const MAX_TRUSTED_TOILET_DISTANCE_METERS = 500;
  const TOILET_COORDINATE_SEARCH_RADIUS_METERS = 1200;

  function hasUsableCoordinate(item) {
    return item && Number.isFinite(Number(item.lat)) && Number.isFinite(Number(item.lng));
  }

  function normalizeToiletCoordinate(item) {
    const coordinates = readCoordinateObject(item);
    return coordinates && hasUsableCoordinate(coordinates) ? coordinates : null;
  }

  function getStopCoordinateForToiletSearch(stop) {
    if (!stop) return null;
    const directCoordinate = normalizeToiletCoordinate(stop)
      || readCoordinateObject(stop.scenicCoordinates)
      || readCoordinateObject(stop['景點座標'])
      || readCoordinateObject(stop.coordinates)
      || readCoordinateObject(stop.position);
    if (directCoordinate) return directCoordinate;

    const pinId = stop.mapPinId || stop.pinId;
    if (pinId && mapPinLocations && mapPinLocations[pinId]) {
      const pinCoordinate = readCoordinateObject(mapPinLocations[pinId]);
      if (pinCoordinate) return pinCoordinate;
    }
    if (pinId && typeof pinData !== 'undefined' && pinData && pinData[pinId]) {
      const pinCoordinate = readCoordinateObject(pinData[pinId]);
      if (pinCoordinate) return pinCoordinate;
    }
    return null;
  }

  const TRANSIT_HUB_KEYWORDS = ['火車站', '高鐵站', '捷運站', '機場', '轉運站', '航廈', '客運站', '港口', '碼頭', '車站', 'station', 'airport', 'terminal'];
  function isTransitHubStop(name) {
    if (!name) return false;
    const text = String(name).toLowerCase();
    return TRANSIT_HUB_KEYWORDS.some((k) => text.includes(k.toLowerCase()));
  }

  function getToiletDistanceFromStop(stop, toilet) {
    const stopCoordinates = getStopCoordinateForToiletSearch(stop);
    const toiletCoordinates = normalizeToiletCoordinate(toilet);
    if (!stopCoordinates || !toiletCoordinates) return Number.POSITIVE_INFINITY;
    return measureDistanceMeters(stopCoordinates, toiletCoordinates);
  }

  function isTrustedToiletCoordinate(stop, toilet) {
    return getToiletDistanceFromStop(stop, toilet) <= MAX_TRUSTED_TOILET_DISTANCE_METERS;
  }

  function isLikelyToiletText(value) {
    const text = normalizeText(value);
    return ['廁所', '厕所', '洗手間', '洗手间', '公廁', '公厕', 'toilet', 'restroom', 'bathroom', 'wc']
      .some((keyword) => text.includes(normalizeText(keyword)));
  }

  function getPlaceResultCoordinate(place) {
    if (!place || !place.geometry || !place.geometry.location) return null;
    return readCoordinateObject(place);
  }

  function getToiletNameMatchScore(query, placeName) {
    const normalizedQuery = normalizeText(query);
    const normalizedName = normalizeText(placeName);
    if (!normalizedQuery || !normalizedName) return 0;
    if (normalizedName === normalizedQuery) return 100;
    if (normalizedName.includes(normalizedQuery) || normalizedQuery.includes(normalizedName)) return 85;

    const queryHasToilet = isLikelyToiletText(query);
    const nameHasToilet = isLikelyToiletText(placeName);
    if (queryHasToilet && nameHasToilet) return 60;

    const minLength = Math.min(normalizedQuery.length, normalizedName.length);
    let sharedRun = 0;
    for (let start = 0; start < normalizedQuery.length; start += 1) {
      for (let end = start + 2; end <= normalizedQuery.length; end += 1) {
        const segment = normalizedQuery.slice(start, end);
        if (normalizedName.includes(segment)) {
          sharedRun = Math.max(sharedRun, segment.length);
        }
      }
    }
    return minLength > 0 && sharedRun / minLength >= 0.45 ? 45 : 0;
  }

  const ACCOMMODATION_EXCLUSION_KEYWORDS = ['旅館', '民宿', '飯店', '旅宿', '旅店', '汽車旅館', '客棧', '青年旅', 'hotel', 'motel', 'inn', 'hostel'];

  function isAccommodationPlace(name) {
    if (!name) return false;
    const text = String(name).toLowerCase();
    return ACCOMMODATION_EXCLUSION_KEYWORDS.some((k) => text.includes(k.toLowerCase()));
  }

  function chooseBestToiletPlaceResult(results, stop, query) {
    const stopCoordinates = getStopCoordinateForToiletSearch(stop);
    if (!stopCoordinates || !Array.isArray(results)) return null;

    const candidates = results
      .map((place) => {
        const coordinates = getPlaceResultCoordinate(place);
        if (!coordinates) return null;
        const distance = measureDistanceMeters(stopCoordinates, coordinates);
        if (distance > MAX_TRUSTED_TOILET_DISTANCE_METERS) return null;
        const name = String(place.name || '').trim();
        const nameScore = getToiletNameMatchScore(query, name);
        const toiletNameScore = isLikelyToiletText(name) ? 20 : 0;
        const distanceScore = Math.max(0, 40 - Math.round(distance / 15));
        const score = nameScore + toiletNameScore + distanceScore;
        return { place, coordinates, distance, score, nameScore, toiletNameScore };
      })
      .filter(Boolean)
      .filter((candidate) => !isAccommodationPlace(candidate.place.name))
      .filter((candidate) => candidate.nameScore >= 45 || candidate.toiletNameScore > 0)
      .sort((a, b) => b.score - a.score || a.distance - b.distance);

    return candidates[0] || null;
  }

  async function searchPlacesForToilet(stop, query, service) {
    const stopCoordinates = getStopCoordinateForToiletSearch(stop);
    if (!stop || !query || !service || !stopCoordinates) return [];

    const nearbyResults = await new Promise((resolve) => {
      service.nearbySearch({
        location: new google.maps.LatLng(stopCoordinates.lat, stopCoordinates.lng),
        radius: TOILET_COORDINATE_SEARCH_RADIUS_METERS,
        keyword: query
      }, (res, status) => {
        const okStatus = hasGooglePlacesService() ? google.maps.places.PlacesServiceStatus.OK : 'OK';
        resolve(status === okStatus && Array.isArray(res) ? res : []);
      });
    });

    if (nearbyResults.length) return nearbyResults;

    return new Promise((resolve) => {
      service.textSearch({
        query,
        location: new google.maps.LatLng(stopCoordinates.lat, stopCoordinates.lng),
        radius: TOILET_COORDINATE_SEARCH_RADIUS_METERS
      }, (res, status) => {
        const okStatus = hasGooglePlacesService() ? google.maps.places.PlacesServiceStatus.OK : 'OK';
        resolve(status === okStatus && Array.isArray(res) ? res : []);
      });
    });
  }

  function clearRenderedMapMarkers() {
    Object.values(markers).forEach((marker) => {
      if (marker && typeof marker.setMap === 'function') {
        marker.setMap(null);
      }
    });
    markers = {};
    Object.values(mergedAreaShapes).forEach((circle) => {
      if (circle && typeof circle.setMap === 'function') {
        circle.setMap(null);
      }
    });
    mergedAreaShapes = {};
    clearSubSpotMarkers();
  }

  function isToiletMarkerId(markerId) {
    return String(markerId || '').startsWith('toilet-');
  }

  function clearToiletMarkers() {
    Object.entries(markers).forEach(([markerId, marker]) => {
      if (!isToiletMarkerId(markerId)) return;
      if (marker && typeof marker.setMap === 'function') {
        marker.setMap(null);
      }
      delete markers[markerId];
    });

    if (typeof pinData !== 'undefined') {
      Object.keys(pinData).forEach((pinId) => {
        if (isToiletMarkerId(pinId)) {
          delete pinData[pinId];
        }
      });
    }
  }

  function getStopsForActiveRouteStageToilets() {
    if (activeRouteStage === null) return [];
    const stage = routeStageCache.find((item) => item && item.index === activeRouteStage);
    if (!stage) return [];

    const stopIndexes = [
      stage.sourceStopIndex,
      stage.destinationStopIndex
    ].filter((index) => Number.isInteger(index) && replanStops[index]);

    return Array.from(new Set(stopIndexes)).map((index) => ({
      stop: replanStops[index],
      stopIndex: index
    }));
  }

  function getStopsForActiveItineraryToilets() {
    if (!activeItineraryStopId) return [];
    const stopIndex = replanStops.findIndex((stop) => stop.id === activeItineraryStopId);
    if (stopIndex < 0) return [];

    const stop = replanStops[stopIndex];
    return [{
      stop: stop,
      stopIndex: stopIndex
    }];
  }

  // ── 大景點子景點（小景點）大頭針：只在選取該階段時顯示、不畫路線 ──────────────
  function isSubSpotMarkerId(id) {
    return String(id || '').startsWith('subspot-');
  }

  // 子景點描述：依名稱關鍵字產生較具體的介紹，取代生硬的「xxx 的子景點」
  function describeSubSpot(subName, parentName) {
    const nm = String(subName || '').trim();
    const parent = String(parentName || '').trim();
    const within = parent ? `位於「${parent}」一帶，` : '';
    const table = [
      [/燈塔/, '是醒目的燈塔地標，適合眺望海景、拍照打卡。'],
      [/涼亭|觀景亭|休憩/, '是可歇腳的休憩涼亭，能放慢腳步欣賞周邊風景。'],
      [/步道|棧道|步行|健行/, '是一段適合散步慢行、親近自然的步道。'],
      [/拱橋|吊橋|橋/, '是別具特色的橋樑地標，是取景拍照的好位置。'],
      [/沙灘|海灘|礫石|海岸|潮間帶|岬/, '是親海的海岸據點，可賞浪、踏水、看海景。'],
      [/觀景|景觀|眺望|平台|瞭望|制高/, '是視野開闊的觀景點，適合遠眺與拍照。'],
      [/部落|聚落/, '是充滿在地人文風情的部落聚落，值得放慢腳步感受。'],
      [/廟|宮|寺|教堂/, '是在地信仰中心，可感受傳統文化氛圍。'],
      [/漁港|碼頭|港/, '是充滿生活感的港邊據點，可欣賞漁港風情。'],
      [/公園|廣場|綠地/, '是適合放鬆走逛的休憩空間。'],
      [/沙漠|草原|濕地|生態|地質|岩|火山/, '是別具特色的自然地景，值得細細觀察。'],
      [/博物館|文化館|展館|故事館|紀念館/, '是了解在地故事與文化的展覽空間。']
    ];
    for (const [re, tail] of table) {
      if (re.test(nm)) return `「${nm}」${within}${tail}`;
    }
    return parent
      ? `「${nm}」是「${parent}」周邊值得順遊的據點，可一併安排停留、細細探索。`
      : `「${nm}」是周邊值得順遊的據點，可一併安排停留。`;
  }

  function clearSubSpotMarkers() {
    Object.entries(markers).forEach(([markerId, marker]) => {
      if (!isSubSpotMarkerId(markerId)) return;
      if (marker && typeof marker.setMap === 'function') marker.setMap(null);
      delete markers[markerId];
    });
    if (typeof pinData !== 'undefined') {
      Object.keys(pinData).forEach((pinId) => { if (isSubSpotMarkerId(pinId)) delete pinData[pinId]; });
    }
  }

  // 缺 mergedMemberCoords 時，用 Places 以子景點名 + 站中心解析座標（取最近相符、快取）
  const _subSpotCoordCache = new Map();
  function resolveSubSpotCoord(name, center) {
    const nm = String(name || '').trim();
    if (!nm || !center) return Promise.resolve(null);
    const key = `${normalizeText(nm)}@${center.lat.toFixed(3)},${center.lng.toFixed(3)}`;
    if (_subSpotCoordCache.has(key)) return Promise.resolve(_subSpotCoordCache.get(key));
    const service = getPlacesService();
    if (!service) return Promise.resolve(null);
    return new Promise((resolve) => {
      service.textSearch({ query: nm, location: new google.maps.LatLng(center.lat, center.lng), radius: 1200 }, (res, status) => {
        const ok = hasGooglePlacesService() ? google.maps.places.PlacesServiceStatus.OK : 'OK';
        let coord = null;
        if (status === ok && Array.isArray(res) && res.length) {
          let best = null, bestD = Infinity;
          for (const p of res) {
            const loc = p && p.geometry && p.geometry.location;
            if (!loc) continue;
            const c = { lat: loc.lat(), lng: loc.lng() };
            const d = measureDistanceMeters(c, center);
            if (d < bestD) { bestD = d; best = c; }
          }
          if (best && bestD <= 3000) coord = best; // 太遠視為誤配，捨棄
        }
        _subSpotCoordCache.set(key, coord);
        resolve(coord);
      });
    });
  }

  let subSpotRenderToken = 0;
  async function renderSubSpotMarkersForActiveRouteStage() {
    if (!map || !window.google || !google.maps) return;
    const myToken = ++subSpotRenderToken;
    clearSubSpotMarkers();

    let stops = [];
    if (activeItineraryStopId) stops = getStopsForActiveItineraryToilets();
    else if (activeRouteStage !== null) stops = getStopsForActiveRouteStageToilets();
    if (!stops.length) { layoutMapMarkers(); return; }

    for (const { stop } of stops) {
      if (myToken !== subSpotRenderToken) return;
      if (!stop || !stop.isMergedAttraction || !Array.isArray(stop.mergedSubSpots) || !stop.mergedSubSpots.length) continue;
      const center = readStopCoordinates(stop);
      if (!center) continue;
      const memberCoords = Array.isArray(stop.mergedMemberCoords) ? stop.mergedMemberCoords : [];
      for (let i = 0; i < stop.mergedSubSpots.length; i++) {
        if (myToken !== subSpotRenderToken) return;
        const subName = String(stop.mergedSubSpots[i] || '').trim();
        if (!subName) continue;
        // 優先用 mergedMemberCoords（[0]=母站，[i+1] 對應子景點）；缺則 Places 解析
        let coord = null;
        const mc = memberCoords[i + 1];
        if (mc && Number.isFinite(Number(mc.lat)) && Number.isFinite(Number(mc.lng))) {
          coord = { lat: Number(mc.lat), lng: Number(mc.lng) };
        } else {
          coord = await resolveSubSpotCoord(subName, center);
          if (myToken !== subSpotRenderToken) return;
        }
        if (!coord) continue;
        const pinId = `subspot-${stop.id}-${i}`;
        if (typeof pinData !== 'undefined') {
          pinData[pinId] = { title: `📍 ${subName}`, desc: describeSubSpot(subName, stop.name), notice: '', lat: coord.lat, lng: coord.lng };
        }
        const marker = new google.maps.Marker({
          position: coord, map,
          title: subName,
          icon: createSubSpotPinIcon(),
          zIndex: 3
        });
        rememberMarkerBasePosition(marker, coord);
        markers[pinId] = marker;
        marker.addListener('click', () => { showPinInfo(pinId); map.panTo(marker.getPosition()); });
      }
    }
    if (myToken === subSpotRenderToken) layoutMapMarkers();
  }

  async function resolveToiletCoordinatesNearStop(stop, toilet, service) {
    if (!stop || !toilet) return null;
    if (!getStopCoordinateForToiletSearch(stop)) return null;

    const existingCoordinates = normalizeToiletCoordinate(toilet);
    if (existingCoordinates && isTrustedToiletCoordinate(stop, existingCoordinates)) {
      return {
        ...toilet,
        lat: existingCoordinates.lat,
        lng: existingCoordinates.lng,
        coordinateSource: toilet.coordinateSource || 'existing_verified',
        distanceMeters: Math.round(getToiletDistanceFromStop(stop, existingCoordinates))
      };
    }

    const query = String(toilet.name || toilet.title || toilet.label || '').trim();
    if (!query || !service) return null;

    const results = await searchPlacesForToilet(stop, query, service);
    const bestMatch = chooseBestToiletPlaceResult(results, stop, query);
    if (!bestMatch) return null;

    return {
      name: bestMatch.place.name || query,
      lat: bestMatch.coordinates.lat,
      lng: bestMatch.coordinates.lng,
      vicinity: bestMatch.place.vicinity || toilet.vicinity || '',
      coordinateSource: existingCoordinates ? 'places_rechecked_bad_existing' : 'places_resolved',
      distanceMeters: Math.round(bestMatch.distance)
    };
  }

  async function fetchFallbackToiletsNearStop(stop, service) {
    const stopCoordinates = getStopCoordinateForToiletSearch(stop);
    if (!service || !stopCoordinates) return [];

    // 合併大景區（如三仙台）座標多落在園區中心，廁所常超過 500m；依其涵蓋半徑放寬搜尋，上限 1500m
    const effRadius = (stop && stop.isMergedAttraction)
      ? Math.min(1500, Math.max(MAX_TRUSTED_TOILET_DISTANCE_METERS, Number(stop.mergedRadiusMeters) || 0))
      : MAX_TRUSTED_TOILET_DISTANCE_METERS;

    const fallbackResults = await new Promise((resolve) => {
      service.nearbySearch({
        location: new google.maps.LatLng(stopCoordinates.lat, stopCoordinates.lng),
        radius: effRadius,
        keyword: '廁所'
      }, (res, status) => {
        const okStatus = hasGooglePlacesService() ? google.maps.places.PlacesServiceStatus.OK : 'OK';
        resolve(status === okStatus && Array.isArray(res) ? res : []);
      });
    });

    return fallbackResults
      .map((place) => {
        const coordinates = getPlaceResultCoordinate(place);
        if (!coordinates) return null;
        const distance = getToiletDistanceFromStop(stop, coordinates);
        if (distance > effRadius) return null;
        return {
          name: place.name || '廁所',
          lat: coordinates.lat,
          lng: coordinates.lng,
          vicinity: place.vicinity || '',
          coordinateSource: 'places_fallback',
          distanceMeters: Math.round(distance)
        };
      })
      .filter(Boolean)
      .filter((item) => !isAccommodationPlace(item.name))
      .slice(0, 3);
  }

  function updateToiletSectionsInDOM() {
    replanStops.forEach((stop) => {
      const el = document.getElementById(`toilet-section-${stop.mapPinId}`);
      if (!el) return;
      if (isTransitHubStop(stop.name)) {
        el.innerHTML = `<span style="font-size:12px;color:var(--ink3);">🚻 站內設有廁所</span>`;
      } else if (Array.isArray(stop.nearbyToiletLocations) && stop.nearbyToiletLocations.length > 0) {
        el.innerHTML = `<span class="nearby-toilets-label">附近廁所</span><div class="nearby-toilets-list">${stop.nearbyToiletLocations.slice(0, 3).map(t => `<span class="toilet-item">🚻 ${t.name || t}</span>`).join('')}</div>`;
      } else {
        el.innerHTML = `<span style="font-size:12px;color:var(--ink3);">🚻 附近廁所資料不足，建議出發前自行確認</span>`;
      }
    });
  }

  function getAllToiletsFromStops() {
    return replanStops
      .map((stop, stopIndex) => ({ stop, stopIndex }))
      .filter(item => item.stop && (getStopCoordinateForToiletSearch(item.stop) || Array.isArray(item.stop.nearbyToiletLocations)));
  }

  async function renderAllToiletMarkers() {
    if (!map || !window.google || !google.maps) return;
    clearToiletMarkers();

    const stopsToRender = getAllToiletsFromStops();
    if (stopsToRender.length === 0) {
      layoutMapMarkers();
      return;
    }

    const service = getPlacesService();

    for (const { stop, stopIndex } of stopsToRender) {
      const rawToilets = getStopToiletLocations(stop).slice(0, 3);
      const toilets = [];

      for (const toilet of rawToilets) {
        const resolvedToilet = await resolveToiletCoordinatesNearStop(stop, toilet, service);
        if (resolvedToilet) toilets.push(resolvedToilet);
      }

      // 若 Firebase 內只有名稱或舊座標不可信，則用「廁所」作為最後兜底搜尋。
      if (toilets.length === 0) {
        toilets.push(...await fetchFallbackToiletsNearStop(stop, service));
      }

      if (toilets.length > 0) {
        stop.nearbyToiletLocations = toilets.slice(0, 3);
      }

      toilets.slice(0, 3).forEach((toilet, index) => {
        const stopMarkerId = stop.id || stop.mapPinId || `stop-${stopIndex + 1}`;
        const toiletPinId = `toilet-${stopMarkerId}-${index + 1}`;
        const toiletPosition = safeLatLng(toilet);
        pinData[toiletPinId] = {
          title: `🚻 ${toilet.name}`,
          desc: `附近廁所，鄰近 ${stop.name || '此景點'}，位置可能需自行確認。`,
          notice: `點擊定位此廁所，方便規劃行程時找到最近的休息設施。`,
          lat: toiletPosition.lat,
          lng: toiletPosition.lng
        };
        const marker = new google.maps.Marker({
          position: toiletPosition,
          map: map,
          title: pinData[toiletPinId].title,
          icon: createEmojiPinIcon('🚻')
        });
        rememberMarkerBasePosition(marker, toiletPosition);
        markers[toiletPinId] = marker;
        marker.addListener('click', () => {
          showPinInfo(toiletPinId);
          layoutMapMarkers();
          map.panTo(marker.getPosition());
        });
      });
    }

    layoutMapMarkers();
    updateToiletSectionsInDOM();
  }

  // 只補「廁所文字資料」到各站卡片，不在地圖上放廁所 pin。
  // 自 commit ec9724b 起，廁所 pin 只在點選階段時顯示，連帶讓載入時不再搜尋廁所、
  // 卡片廁所行因此一直停在「搜尋中…」。此函式在載入/套用新規劃後背景搜尋一次，
  // 把結果快取到 stop.nearbyToiletLocations 並更新文字（地圖 pin 仍維持只在點選階段時出現）。
  let toiletPrefetchToken = 0;
  async function prefetchAllStopToiletData() {
    const myToken = ++toiletPrefetchToken;
    if (!window.google || !google.maps || !hasGooglePlacesService()) {
      updateToiletSectionsInDOM();
      return;
    }
    const stops = getAllToiletsFromStops();
    if (stops.length === 0) {
      updateToiletSectionsInDOM();
      return;
    }
    const service = getPlacesService();
    for (const { stop } of stops) {
      if (myToken !== toiletPrefetchToken) return; // 已被新的載入/規劃取代，中止
      if (isTransitHubStop(stop.name)) continue;   // 交通樞紐顯示「站內設有廁所」，免搜尋
      if (Array.isArray(stop.nearbyToiletLocations) && stop.nearbyToiletLocations.length > 0) continue; // 已有快取
      const rawToilets = getStopToiletLocations(stop).slice(0, 3);
      let toilets = [];
      for (const toilet of rawToilets) {
        if (myToken !== toiletPrefetchToken) return;
        const resolved = await resolveToiletCoordinatesNearStop(stop, toilet, service);
        if (resolved) toilets.push(resolved);
      }
      if (toilets.length === 0) {
        if (myToken !== toiletPrefetchToken) return;
        toilets = await fetchFallbackToiletsNearStop(stop, service);
      }
      if (toilets.length > 0) stop.nearbyToiletLocations = toilets.slice(0, 3);
      if (myToken !== toiletPrefetchToken) return;
      updateToiletSectionsInDOM(); // 每解析完一站即時更新，不必等全部
    }
    if (myToken === toiletPrefetchToken) updateToiletSectionsInDOM();
  }

  async function renderToiletMarkersForActiveRouteStage() {
    if (!map || !window.google || !google.maps) return;
    // Token guard: if a newer call arrives, abandon this one mid-async to prevent race conditions
    const myToken = ++toiletRenderToken;
    clearToiletMarkers();
    renderSubSpotMarkersForActiveRouteStage(); // 子景點小圓點與廁所同步（同樣只在選取階段時顯示）

    let stopsToRender = [];

    // 優先顯示點選的行程階段的廁所
    if (activeItineraryStopId) {
      stopsToRender = getStopsForActiveItineraryToilets();
    } else if (activeRouteStage !== null) {
      stopsToRender = getStopsForActiveRouteStageToilets();
    } else {
      // 未選擇任何階段時，不顯示廁所標記
      stopsToRender = [];
    }

    if (stopsToRender.length === 0) {
      if (myToken === toiletRenderToken) layoutMapMarkers();
      return;
    }

    const service = getPlacesService();

    for (const { stop, stopIndex } of stopsToRender) {
      if (myToken !== toiletRenderToken) return; // 已被新呼叫取代，中止
      const rawToilets = getStopToiletLocations(stop).slice(0, 3);
      let toilets = [];

      for (const toilet of rawToilets) {
        if (myToken !== toiletRenderToken) return;
        const resolvedToilet = await resolveToiletCoordinatesNearStop(stop, toilet, service);
        if (resolvedToilet) toilets.push(resolvedToilet);
      }

      // 若無可信座標，則使用 Google Places API 動態搜尋附近廁所。
      if (myToken !== toiletRenderToken) return;
      if (toilets.length === 0) {
        toilets = await fetchFallbackToiletsNearStop(stop, service);
        if (myToken !== toiletRenderToken) return;
        if (toilets.length > 0) {
          stop.nearbyToiletLocations = toilets;
        }
      }

      if (toilets.length > 0) {
        stop.nearbyToiletLocations = toilets.slice(0, 3);
      }

      toilets.slice(0, 3).forEach((toilet, index) => {
        const stopMarkerId = stop.id || stop.mapPinId || `stop-${stopIndex + 1}`;
        const toiletPinId = `toilet-${stopMarkerId}-${index + 1}`;
        const toiletPosition = safeLatLng(toilet);
        pinData[toiletPinId] = {
          title: `🚻 ${toilet.name}`,
          desc: `附近廁所，鄰近 ${stop.name || '此景點'}，位置可能需自行確認。`,
          notice: `點擊定位此廁所，方便規劃行程時找到最近的休息設施。`,
          lat: toiletPosition.lat,
          lng: toiletPosition.lng
        };
        const marker = new google.maps.Marker({
          position: toiletPosition,
          map: map,
          title: pinData[toiletPinId].title,
          icon: createEmojiPinIcon('🚻')
        });
        rememberMarkerBasePosition(marker, toiletPosition);
        markers[toiletPinId] = marker;
        marker.addListener('click', () => {
          showPinInfo(toiletPinId);
          layoutMapMarkers();
          map.panTo(marker.getPosition());
        });
      });
    }

    if (myToken !== toiletRenderToken) return;
    layoutMapMarkers();
    updateToiletSectionsInDOM();
  }

  // 一組經緯度的凸包（Andrew monotone chain）；少於 3 點回原點集
  function convexHullLatLng(points) {
    const pts = (points || [])
      .map(p => ({ lat: Number(p.lat), lng: Number(p.lng) }))
      .filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng));
    if (pts.length < 3) return pts;
    pts.sort((a, b) => a.lng - b.lng || a.lat - b.lat);
    const cross = (o, a, b) => (a.lng - o.lng) * (b.lat - o.lat) - (a.lat - o.lat) * (b.lng - o.lng);
    const lower = [];
    for (const p of pts) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); }
    const upper = [];
    for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p); }
    lower.pop(); upper.pop();
    return lower.concat(upper);
  }

  // 把多邊形頂點沿「離質心方向」外擴 padMeters，讓區塊飽滿一點
  function padPolygonOutward(poly, ref, padMeters) {
    const latScale = 110540;
    const lngScale = 111320 * Math.cos((ref.lat || 0) * Math.PI / 180) || 1;
    return poly.map(p => {
      const dLat = p.lat - ref.lat, dLng = p.lng - ref.lng;
      const distM = Math.hypot(dLat * latScale, dLng * lngScale) || 1;
      const f = (distM + padMeters) / distM;
      return { lat: ref.lat + dLat * f, lng: ref.lng + dLng * f };
    });
  }

  // 以中心畫一個方形區塊（成員不足以構成多邊形時的後備，非圓圈）
  function boxAroundLatLng(center, halfMeters) {
    const latScale = 110540;
    const lngScale = 111320 * Math.cos((center.lat || 0) * Math.PI / 180) || 1;
    const dLat = halfMeters / latScale, dLng = halfMeters / lngScale;
    return [
      { lat: center.lat + dLat, lng: center.lng - dLng },
      { lat: center.lat + dLat, lng: center.lng + dLng },
      { lat: center.lat - dLat, lng: center.lng + dLng },
      { lat: center.lat - dLat, lng: center.lng - dLng }
    ];
  }

  // 大景點區塊路徑：成員子景點的凸包（外擴 120m）；成員不足則用方形區塊
  function buildMergedAreaPath(stop, center) {
    const raw = (Array.isArray(stop.mergedMemberCoords) ? stop.mergedMemberCoords : [])
      .map(c => ({ lat: Number(c.lat), lng: Number(c.lng) }))
      .filter(c => Number.isFinite(c.lat) && Number.isFinite(c.lng));
    // 以 center（marker 代表座標）為基準丟離群點：離島常有子景點被 geocode 到海上/過遠，
    // 會把凸包拉成指向海面的尖刺。用「中位數×3」門檻（尊重叢集尺度）剔除離群，再保證含 center。
    let members = raw;
    if (raw.length >= 2) {
      const dists = raw.map(c => measureDistanceMeters(center, c));
      const sorted = [...dists].sort((a, b) => a - b);
      const med = sorted[Math.floor(sorted.length / 2)] || 0;
      const thr = Math.min(1200, Math.max(350, med * 3));
      members = raw.filter((c, i) => dists[i] <= thr);
    }
    const hullInput = members.concat([{ lat: center.lat, lng: center.lng }]);
    const hull = convexHullLatLng(hullInput);
    if (hull.length >= 3) {
      const ref = {
        lat: hullInput.reduce((s, c) => s + c.lat, 0) / hullInput.length,
        lng: hullInput.reduce((s, c) => s + c.lng, 0) / hullInput.length
      };
      return padPolygonOutward(hull, ref, 120);
    }
    const half = Math.min(900, Math.max(180, Number(stop.mergedRadiusMeters) || 0));
    return boxAroundLatLng(center, half);
  }

  // ── 大景點真實邊界（OpenStreetMap / Overpass）──────────────────
  const _osmBoundaryCache = new Map(); // key: normalizeText(name)@lat,lng → path|null

  function _osmRingArea(ring) {
    let a = 0; // 經緯度平面 shoelace，僅用來比較環大小
    for (let i = 0, n = ring.length; i < n; i++) {
      const p = ring[i], q = ring[(i + 1) % n];
      a += p.lng * q.lat - q.lng * p.lat;
    }
    return Math.abs(a) / 2;
  }

  function _osmRingFromGeometry(geom) {
    return (Array.isArray(geom) ? geom : [])
      .map(g => ({ lat: Number(g.lat), lng: Number(g.lon) }))
      .filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  }

  // 從 Overpass 結果挑出「名稱相符、面合理、質心離中心最近」的面狀邊界環
  // 加上標籤黑名單與面積/距離上限：擋掉海灣/水體/海岸線/行政邊界等大型面（覆蓋海面→畸形）
  const _OSM_BAD_NATURAL = /^(water|bay|strait|coastline|wetland|reef|shoal|cape|peninsula)$/i;
  function pickOsmBoundary(data, name, center, radiusMeters) {
    const els = data && Array.isArray(data.elements) ? data.elements : [];
    const R = Number(radiusMeters) || 0;
    const MAX_CENTROID_DIST = Math.min(2000, Math.max(600, R * 1.5)); // 質心離 center 太遠 → 拒
    const MAX_RING_RADIUS = Math.min(2500, Math.max(700, R * 2.5));   // 環太大（海灣/島嶼/行政區）→ 拒
    let best = null, bestDist = Infinity;
    for (const el of els) {
      const tags = (el && el.tags) || {};
      const elName = tags.name;
      if (!elName || !placeNameMatchesStrict(elName, name)) continue;
      // 標籤黑名單：水體/海岸/水道/行政邊界/地名點 → 跳過
      if (tags.boundary || tags.place || tags.waterway || tags.water) continue;
      if (tags.natural && _OSM_BAD_NATURAL.test(tags.natural)) continue;
      let ring = null;
      if (el.type === 'way' && Array.isArray(el.geometry)) {
        const r = _osmRingFromGeometry(el.geometry);
        // 只接受「封閉環」（面）；開放線（道路/步道）跳過，避免畫出怪多邊形
        if (r.length >= 4) {
          const a = r[0], b = r[r.length - 1];
          if (Math.abs(a.lat - b.lat) < 1e-7 && Math.abs(a.lng - b.lng) < 1e-7) ring = r.slice(0, -1);
        }
      } else if (el.type === 'relation' && Array.isArray(el.members)) {
        let outerBest = null, outerArea = -1; // multipolygon：取面積最大的 outer 環
        for (const m of el.members) {
          if (m && m.role === 'outer' && Array.isArray(m.geometry)) {
            const r = _osmRingFromGeometry(m.geometry);
            if (r.length >= 3) { const ar = _osmRingArea(r); if (ar > outerArea) { outerArea = ar; outerBest = r; } }
          }
        }
        ring = outerBest;
      }
      if (!ring || ring.length < 3) continue;
      const cen = {
        lat: ring.reduce((s, p) => s + p.lat, 0) / ring.length,
        lng: ring.reduce((s, p) => s + p.lng, 0) / ring.length
      };
      const dist = measureDistanceMeters(cen, center);
      if (dist > MAX_CENTROID_DIST) continue; // 質心太遠 → 不是這個景點
      const ringR = ring.reduce((mx, p) => Math.max(mx, measureDistanceMeters(cen, p)), 0);
      if (ringR > MAX_RING_RADIUS) continue;  // 環太大 → 海灣/島嶼/行政區，棄
      if (dist < bestDist) { bestDist = dist; best = ring; }
    }
    return best;
  }

  // 持久快取（localStorage）：載入時讀入，成功結果寫回；失敗不寫
  const _OSM_CACHE_LS_KEY = 'wai_osm_boundary_cache';
  (function _loadOsmBoundaryCache() {
    try {
      const obj = JSON.parse(localStorage.getItem(_OSM_CACHE_LS_KEY) || '{}') || {};
      Object.keys(obj).forEach(k => _osmBoundaryCache.set(k, obj[k]));
    } catch (e) { /* ignore */ }
  })();

  function _osmKey(name, center) {
    return `${normalizeText(name)}@${Number(center.lat).toFixed(3)},${Number(center.lng).toFixed(3)}`;
  }

  // 把景點名清成可放進 Overpass 正規表達式的字串（去括號附註、跳脫特殊字元）
  function _osmNameRegex(name) {
    let s = String(name || '').replace(/[（(][^）)]*[）)]/g, '').trim();
    s = s.replace(/[\\^$.*+?()[\]{}|"]/g, '\\$&');
    return s.length >= 2 ? s : '';
  }

  // 抽稀環點數，控制 localStorage 體積
  function _simplifyRing(ring, maxPts) {
    if (!Array.isArray(ring) || ring.length <= maxPts) return ring;
    const step = Math.ceil(ring.length / maxPts);
    const out = [];
    for (let i = 0; i < ring.length; i += step) out.push(ring[i]);
    return out;
  }

  function _persistOsmEntry(key, value) {
    const stored = Array.isArray(value) ? _simplifyRing(value, 120) : null;
    _osmBoundaryCache.set(key, stored);
    try {
      let obj = {};
      try { obj = JSON.parse(localStorage.getItem(_OSM_CACHE_LS_KEY) || '{}') || {}; } catch (e) { obj = {}; }
      obj[key] = stored;
      const keys = Object.keys(obj);
      if (keys.length > 200) keys.slice(0, keys.length - 200).forEach(k => delete obj[k]); // 清舊鍵
      localStorage.setItem(_OSM_CACHE_LS_KEY, JSON.stringify(obj));
    } catch (e) { /* quota/unavailable → 僅留記憶體快取 */ }
  }

  // 全域單併發 + 端點備援 + 429 退避（避免一次 render 連發多支被限流）
  const _OVERPASS_ENDPOINTS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.private.coffee/api/interpreter'
  ];
  let _osmInFlight = Promise.resolve();
  function _osmSleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  function _overpassRequest(q) {
    const run = async () => {
      for (let attempt = 0; attempt < _OVERPASS_ENDPOINTS.length * 2; attempt++) {
        const ep = _OVERPASS_ENDPOINTS[attempt % _OVERPASS_ENDPOINTS.length];
        try {
          // 每次 fetch 加 client 逾時：慢/掛的端點（如 504）會 fail-fast 換下一個，不卡住佇列
          const _ctrl = new AbortController();
          const _to = setTimeout(() => _ctrl.abort(), 12000);
          let res;
          try {
            res = await fetch(ep, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body: q, signal: _ctrl.signal });
          } finally { clearTimeout(_to); }
          if (res.status === 429) { await _osmSleep(1500 * (attempt + 1)); continue; }
          const text = await res.text();
          if (!res.ok || /rate_limited|Too Many Requests/i.test(text)) { await _osmSleep(1500 * (attempt + 1)); continue; }
          try { return JSON.parse(text); } catch (e) { return null; } // 成功但非 JSON → 視為無資料
        } catch (e) { /* 網路錯誤 → 換下一個端點 */ }
      }
      return null; // 全部端點皆失敗
    };
    _osmInFlight = _osmInFlight.then(run, run); // 串接，永不並發
    return _osmInFlight;
  }

  // 批次：把同一波 render 的多個大景點請求合併成「一支」Overpass union 查詢
  let _osmBatchQueue = [];
  let _osmBatchTimer = null;
  function fetchOsmBoundaryPath(name, center, radiusMeters) {
    const nm = String(name || '').trim();
    if (!nm || !center || !Number.isFinite(Number(center.lat)) || !Number.isFinite(Number(center.lng))) return Promise.resolve(null);
    const key = _osmKey(nm, center);
    if (_osmBoundaryCache.has(key)) return Promise.resolve(_osmBoundaryCache.get(key));
    return new Promise(resolve => {
      _osmBatchQueue.push({ key, name: nm, center, radius: Number(radiusMeters) || 0, resolve });
      if (_osmBatchTimer) clearTimeout(_osmBatchTimer);
      _osmBatchTimer = setTimeout(_flushOsmBatch, 60);
    });
  }

  async function _flushOsmBatch() {
    const batch = _osmBatchQueue; _osmBatchQueue = []; _osmBatchTimer = null;
    const byKey = new Map();
    batch.forEach(b => { if (!byKey.has(b.key)) byKey.set(b.key, b); });
    const todo = [...byKey.values()].filter(b => !_osmBoundaryCache.has(b.key));
    let data = null;
    const groups = todo.map(b => {
      const R = Math.min(3000, Math.max(1200, Math.round(b.radius * 2)));
      const term = _osmNameRegex(b.name);
      // 伺服器端用「名稱」過濾（只回該名稱的面），避免掃全區的公園/行政邊界導致 504 逾時
      return term ? `wr["name"~"${term}"](around:${R},${b.center.lat},${b.center.lng});` : '';
    }).filter(Boolean).join('');
    if (groups) {
      data = await _overpassRequest(`[out:json][timeout:25];(${groups});out geom;`);
    }
    batch.forEach(b => {
      if (_osmBoundaryCache.has(b.key)) { b.resolve(_osmBoundaryCache.get(b.key)); return; }
      if (data) { const path = pickOsmBoundary(data, b.name, b.center, b.radius); _persistOsmEntry(b.key, path || null); b.resolve(path || null); }
      else { b.resolve(null); } // 查詢失敗（限流/網路）→ 不快取、回 null（維持近似區塊、下次可重試）
    });
  }

  function renderMapMarkersFromCurrentLocations() {
    if (!map || !window.google || !google.maps) return;
    clearRenderedMapMarkers();

    const stopOrderByPin = {};
    const stopByPin = {};
    replanStops.forEach((stop, index) => {
      if (stop.mapPinId) { stopOrderByPin[stop.mapPinId] = index + 1; stopByPin[stop.mapPinId] = stop; }
    });

    for (const id in mapPinLocations) {
      const loc = mapPinLocations[id];
      if (!loc || !Number.isFinite(Number(loc.lat)) || !Number.isFinite(Number(loc.lng))) continue;
      const position = safeLatLng(loc);
      const stopNumber = stopOrderByPin[id];
      const marker = new google.maps.Marker({
        position,
        map: map,
        title: loc.title,
        icon: stopNumber !== undefined
          ? createEmojiPinIconNumbered(loc.title.split(' ')[0], stopNumber)
          : createEmojiPinIcon(loc.title.split(' ')[0])
      });
      rememberMarkerBasePosition(marker, position);

      // 大景點：先以子景點涵蓋範圍畫半透明區塊（70% 透明），再非同步抓 OSM 真實邊界升級
      const _stop = stopByPin[id];
      if (_stop && _stop.isMergedAttraction && ((_stop.mergedSubSpots && _stop.mergedSubSpots.length) || Number(_stop.mergedRadiusMeters) > 0)) {
        const _poly = new google.maps.Polygon({
          map,
          paths: buildMergedAreaPath(_stop, position),
          strokeColor: '#2f6fb0', strokeOpacity: 0.6, strokeWeight: 1,
          fillColor: '#4a90d9', fillOpacity: 0.3, // 0.3 = 70% 透明度
          clickable: false, zIndex: 1
        });
        mergedAreaShapes[id] = _poly;
        // 抓 OpenStreetMap 真實輪廓；回來後若該圖層仍是當前物件（未被重繪），換成真實邊界並加強描邊
        fetchOsmBoundaryPath(_stop.name, position, Math.max(Number(_stop.mergedRadiusMeters) || 0, 800)).then((path) => {
          if (path && path.length >= 3 && mergedAreaShapes[id] === _poly) {
            _poly.setPaths(path);
            _poly.setOptions({ strokeColor: '#1f5f9e', strokeOpacity: 0.95, strokeWeight: 2 });
          }
        }).catch(() => {});
      }

      markers[id] = marker;
      if (pinData[id]) {
        pinData[id].lat = position.lat;
        pinData[id].lng = position.lng;
      }
      marker.addListener('click', () => {
        showPinInfo(id);
        layoutMapMarkers();
        map.panTo(marker.getPosition());
      });
    }

    renderToiletMarkersForActiveRouteStage();
    layoutMapMarkers();
  }

  async function syncMapToCurrentTrip() {
    const rebuilt = await rebuildMapPinLocationsFromStops();
    if (!rebuilt) return;
    if (!map || !window.google || !google.maps) return;
    renderMapMarkersFromCurrentLocations();
    calculateAndDisplayRoute(buildRouteLocationsFromStops());
    await renderToiletMarkersForActiveRouteStage();
  }

  function offsetLatLng(position, lngOffset, latOffset) {
    const latitudeRadians = position.lat * Math.PI / 180;
    const lngScale = 111320 * Math.cos(latitudeRadians);
    const latScale = 110540;
    return createLatLng(
      position.lat + (latOffset / latScale),
      position.lng + (lngOffset / lngScale)
    );
  }

  function layoutMapMarkers() {
    if (!map) return;

    // 選取階段時，只顯示該階段的起點與終點景點 pin（廁所 pin 由 renderToiletMarkersForActiveRouteStage 管理）
    let visibleAttractionPinIds = null; // null = 全部顯示
    if (activeRouteStage !== null) {
      const stage = routeStageCache.find((item) => item && item.index === activeRouteStage);
      if (stage) {
        visibleAttractionPinIds = new Set();
        const originStop = Number.isInteger(stage.sourceStopIndex) ? replanStops[stage.sourceStopIndex] : null;
        const destStop = Number.isInteger(stage.destinationStopIndex) ? replanStops[stage.destinationStopIndex] : null;
        if (originStop && originStop.mapPinId) visibleAttractionPinIds.add(originStop.mapPinId);
        if (destStop && destStop.mapPinId) visibleAttractionPinIds.add(destStop.mapPinId);
      }
    }

    const markerGroups = new Map();
    Object.entries(markers).forEach(([markerId, marker]) => {
      if (!marker) return;

      if (!isToiletMarkerId(markerId) && !isSubSpotMarkerId(markerId)) {
        const shouldShow = visibleAttractionPinIds === null || visibleAttractionPinIds.has(markerId);
        marker.setVisible(shouldShow);
        if (mergedAreaShapes[markerId]) mergedAreaShapes[markerId].setVisible(shouldShow);
        if (!shouldShow) return;
      }

      const basePosition = getMarkerBasePosition(marker);
      if (!basePosition) return;
      const groupKey = buildMarkerGroupKey(basePosition);
      if (!markerGroups.has(groupKey)) {
        markerGroups.set(groupKey, []);
      }
      markerGroups.get(groupKey).push({ markerId, marker, basePosition });
    });

    markerGroups.forEach((group) => {
      group.forEach((item, index) => {
        if (!item.marker || !item.basePosition) return;
        try {
          const lat = Number(item.basePosition.lat);
          const lng = Number(item.basePosition.lng);
          if (Number.isFinite(lat) && Number.isFinite(lng)) {
            item.marker.setPosition(new google.maps.LatLng(lat, lng));
          }
        } catch (err) {
          // defensive: ignore invalid positions
        }
        item.marker.setZIndex(group.length > 1 ? 2000 - index : null);
      });
    });
  }

  function getRouteLocationForStop(stop, index) {
    if (!stop || !stop.mapPinId) return null;

    const marker = markers[stop.mapPinId];
    const basePosition = getMarkerBasePosition(marker);
    if (basePosition) {
      const _pos = safeLatLng(basePosition);
      return {
        lat: _pos.lat,
        lng: _pos.lng,
        title: `${stop.emoji || '📍'} ${stop.name || '景點'}`,
        name: stop.name || '景點',
        stopIndex: index
      };
    }

    const fallbackLocation = mapPinLocations[stop.mapPinId];
    if (fallbackLocation) {
      const _pos = safeLatLng(fallbackLocation);
      return {
        lat: _pos.lat,
        lng: _pos.lng,
        title: `${stop.emoji || (fallbackLocation.title && fallbackLocation.title.split(' ')[0]) || '📍'} ${stop.name || fallbackLocation.title}`,
        name: stop.name || fallbackLocation.title || '景點',
        stopIndex: index
      };
    }

    return null;
  }

  function buildRouteLocationsFromStops() {
    return replanStops.map((stop, index) => getRouteLocationForStop(stop, index)).filter(Boolean);
  }

  // ── 停車樞紐：景點最近停車點（TDX 優先 → Places 退回）+ 停車點↔景點步行路徑 ──────────
  const PARKING_WALKABLE_RADIUS_METERS = 500;   // 直線粗篩半徑（先撈候選）
  const PARKING_MAX_WALK_MINUTES = 10;          // 最終以「實際步行時間」為準
  const PARKING_MAX_WALK_SECONDS = PARKING_MAX_WALK_MINUTES * 60;
  const _parkingCoordCache = new Map();
  const _walkRouteCache = new Map();

  function _coordKey(c) {
    return `${Number(c.lat).toFixed(4)},${Number(c.lng).toFixed(4)}`;
  }

  // 從候選停車點（依直線距離排序）中，挑「實際步行時間 ≤10 分鐘」的最近一筆；都超過/無法驗證 → null
  async function pickWalkableParking(center, candidates) {
    for (const cand of (candidates || [])) {
      const route = await resolveWalkRoute(cand, center);
      const leg = route && route.routes && route.routes[0] && route.routes[0].legs && route.routes[0].legs[0];
      const sec = leg && leg.duration ? Number(leg.duration.value) : null;
      if (Number.isFinite(sec) && sec <= PARKING_MAX_WALK_SECONDS) return cand;
    }
    return null;
  }

  // 台東縣府公有／民營路外停車場（app/parking-data.js，crawler `crawl:parking`＋`export:local` 產生）。
  // TDX 對台東這種鄉村縣覆蓋很稀疏，這份是縣府自己維護的資料，零額外 API 成本，優先使用。
  function getLocalParkingList() {
    const data = window.WAI_PARKING_DATA;
    return (data && Array.isArray(data.taitungCounty)) ? data.taitungCounty : [];
  }

  // 解析某景點最近、步行 ≤10 分鐘可達的停車點：本地縣府資料 → TDX → Google Places 退回 → null
  async function resolveParkingCoord(center) {
    if (!center || !Number.isFinite(Number(center.lat)) || !Number.isFinite(Number(center.lng))) {
      return null;
    }
    const key = _coordKey(center);
    if (_parkingCoordCache.has(key)) return _parkingCoordCache.get(key);
    const finish = (coord) => { _parkingCoordCache.set(key, coord || null); return coord || null; };

    try {
      const county = resolveTdxCounty(currentTripRegion);
      // 1) 本地縣府資料（僅台東本島；目前資料集不含綠島／蘭嶼）→ 用步行時間挑
      if (county === 'Taitung') {
        const localList = getLocalParkingList();
        const chosenLocal = await pickWalkableParking(center, nearbyTdxParkings(center, localList, PARKING_WALKABLE_RADIUS_METERS, 3));
        if (chosenLocal) return finish(chosenLocal);
      }
      // 2) TDX 候選 → 用步行時間挑
      if (county) {
        const list = await fetchTdxParking(county);
        const chosen = await pickWalkableParking(center, nearbyTdxParkings(center, list, PARKING_WALKABLE_RADIUS_METERS, 3));
        if (chosen) return finish(chosen);
      }
      // 3) Places 候選 → 用步行時間挑
      const placeCands = await listParkingFromPlaces(center);
      const chosen2 = await pickWalkableParking(center, placeCands);
      return finish(chosen2);
    } catch (e) {
      return finish(null);
    }
  }

  // Places 停車場候選（≤500m 直線、依距離排序前 3 筆）；nearbySearch type:'parking' → textSearch 退回
  function listParkingFromPlaces(center) {
    const service = getPlacesService();
    if (!service) return Promise.resolve([]);
    const okStatus = () => hasGooglePlacesService() ? google.maps.places.PlacesServiceStatus.OK : 'OK';
    const loc = new google.maps.LatLng(center.lat, center.lng);
    const toCandidates = (res) => {
      if (!Array.isArray(res) || !res.length) return [];
      return res
        .map((p) => {
          const g = p && p.geometry && p.geometry.location;
          if (!g) return null;
          const c = { lat: g.lat(), lng: g.lng(), name: p.name || '停車場' };
          return { cand: c, d: measureDistanceMeters(center, c) };
        })
        .filter((x) => x && x.d <= PARKING_WALKABLE_RADIUS_METERS)
        .sort((a, b) => a.d - b.d)
        .slice(0, 3)
        .map((x) => x.cand);
    };
    return new Promise((resolve) => {
      service.nearbySearch(
        { location: loc, radius: PARKING_WALKABLE_RADIUS_METERS, type: 'parking', keyword: '停車場' },
        (res, status) => {
          const cands = (status === okStatus()) ? toCandidates(res) : [];
          if (cands.length) { resolve(cands); return; }
          service.textSearch(
            { query: '停車場', location: loc, radius: PARKING_WALKABLE_RADIUS_METERS },
            (res2, status2) => resolve(status2 === okStatus() ? toCandidates(res2) : [])
          );
        }
      );
    });
  }

  // 停車點 ↔ 景點 的步行路徑（無序快取，進/出共用），失敗回 null
  function resolveWalkRoute(parking, attraction) {
    if (!directionsService || !parking || !attraction) return Promise.resolve(null);
    const a = _coordKey(parking), b = _coordKey(attraction);
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (_walkRouteCache.has(key)) return Promise.resolve(_walkRouteCache.get(key));
    return new Promise((resolve) => {
      directionsService.route({
        origin: { lat: Number(parking.lat), lng: Number(parking.lng) },
        destination: { lat: Number(attraction.lat), lng: Number(attraction.lng) },
        travelMode: google.maps.TravelMode.WALKING
      }, (response, status) => {
        const ok = status === 'OK' || (google.maps.DirectionsStatus && status === google.maps.DirectionsStatus.OK);
        const result = ok ? response : null;
        _walkRouteCache.set(key, result);
        resolve(result);
      });
    });
  }

  function _promiseWithTimeout(promise, ms) {
    return Promise.race([
      promise,
      new Promise((resolve) => setTimeout(() => resolve(null), ms))
    ]);
  }

  // 對所有「開車類」路段的目的地景點平行解析停車點，回傳 { stopIndex: {lat,lng,name}|null }
  async function resolveParkingForStages(locations, renderToken) {
    const parkingByStopIndex = {};
    const tasks = [];
    for (let i = 0; i < locations.length - 1; i++) {
      const stageMode = routeStageCache[i] ? normalizeTransitMode(routeStageCache[i].mode) : 'walk';
      if (stageMode !== 'car' && stageMode !== 'scooter') continue;
      const dest = locations[i + 1];
      const di = dest.stopIndex;
      if (Object.prototype.hasOwnProperty.call(parkingByStopIndex, di)) continue;
      parkingByStopIndex[di] = null;
      tasks.push(
        _promiseWithTimeout(resolveParkingCoord({ lat: Number(dest.lat), lng: Number(dest.lng) }), 9000)
          .then((p) => { if (renderToken === routeRenderToken) parkingByStopIndex[di] = p || null; })
          .catch(() => {})
      );
    }
    await Promise.all(tasks);
    return parkingByStopIndex;
  }

  const WALK_LINE_COLOR = '#F97316';
  let parkingInfoWindow = null;

  // 階段聚焦時，該 overlay 是否該顯示（null=顯示全部）
  function stageVisible(i) {
    return activeRouteStage === null || activeRouteStage === i;
  }

  function clearStageWalkParkingOverlays() {
    walkRenderers.forEach((arr) => (arr || []).forEach((o) => { if (o && o.setMap) o.setMap(null); }));
    walkRenderers = [];
    parkingMarkers.forEach((arr) => (arr || []).forEach((m) => { if (m && m.setMap) m.setMap(null); }));
    parkingMarkers = [];
    if (parkingInfoWindow) parkingInfoWindow.close();
  }

  function drawParkingMarker(stageIndex, parking, renderToken) {
    if (renderToken !== routeRenderToken || !parking || !map) return;
    const marker = new google.maps.Marker({
      position: { lat: Number(parking.lat), lng: Number(parking.lng) },
      map: stageVisible(stageIndex) ? map : null,
      icon: createRouteMidLabelIcon('🅿️', parking.name || '停車場', '#1D4ED8'),
      zIndex: 950,
      title: parking.name || '停車場'
    });
    marker.addListener('click', () => {
      if (!parkingInfoWindow) parkingInfoWindow = new google.maps.InfoWindow();
      parkingInfoWindow.setContent(`<div style="font-size:13px;font-weight:700;color:#1D4ED8;">🅿️ ${parking.name || '停車場'}</div>`);
      parkingInfoWindow.open(map, marker);
    });
    (parkingMarkers[stageIndex] = parkingMarkers[stageIndex] || []).push(marker);
  }

  // 畫一條停車點↔景點的綠色虛線步行線；回傳步行時間文字（取不到回 ''）
  // 回傳 { text, minutes }：text 供階段卡提示、minutes 供排程納入「停車後步行」時間
  function drawWalkOverlay(stageIndex, parking, attraction, renderToken) {
    const dash = { icon: { path: 'M 0,-1 0,1', strokeColor: WALK_LINE_COLOR, strokeOpacity: 1, strokeWeight: 6, scale: 3 }, offset: '0', repeat: '14px' };
    return resolveWalkRoute(parking, attraction).then((result) => {
      if (renderToken !== routeRenderToken || !map) return { text: '', minutes: null };
      const arr = (walkRenderers[stageIndex] = walkRenderers[stageIndex] || []);
      const visMap = stageVisible(stageIndex) ? map : null;
      if (result && result.routes && result.routes[0] && result.routes[0].overview_path) {
        const wr = new google.maps.Polyline({
          map: visMap,
          path: result.routes[0].overview_path,
          strokeColor: WALK_LINE_COLOR,
          strokeOpacity: 0,
          zIndex: 1100,
          icons: [dash]
        });
        arr.push(wr);
        const leg = result.routes[0].legs && result.routes[0].legs[0];
        const sec = leg && leg.duration ? Number(leg.duration.value) : null;
        return {
          text: (leg && leg.duration && leg.duration.text) || '',
          minutes: Number.isFinite(sec) ? Math.max(1, Math.round(sec / 60)) : null
        };
      }
      const line = new google.maps.Polyline({
        map: visMap,
        path: [{ lat: Number(parking.lat), lng: Number(parking.lng) }, { lat: Number(attraction.lat), lng: Number(attraction.lng) }],
        strokeColor: WALK_LINE_COLOR, strokeOpacity: 0, geodesic: true, zIndex: 1100, icons: [dash]
      });
      arr.push(line);
      return { text: '', minutes: null };
    });
  }

  function refreshRouteDirections() {
    if (!map || !directionsService) return;
    calculateAndDisplayRoute(buildRouteLocationsFromStops());
  }

  function focusRouteBoundsWithMotion(bounds, maxZoom = null) {
    if (!map || !bounds) return;
    const animationToken = ++routeViewportAnimationToken;
    const center = bounds.getCenter && bounds.getCenter();

    if (Number.isFinite(maxZoom)) {
      // Stage selection mode: always use fitBounds to ensure both endpoints are visible
      // and the map never pans to the midpoint (which may be offshore for coastal routes)
      map.fitBounds(bounds, { padding: 80 });
      google.maps.event.addListenerOnce(map, 'idle', () => {
        if (animationToken !== routeViewportAnimationToken) return;
        if (map.getZoom() > maxZoom) map.setZoom(maxZoom);
      });
      return;
    }

    // Full-route mode (no maxZoom): two-step pan-then-fit animation
    if (center && typeof map.panTo === 'function') {
      map.panTo(center);
    }
    window.setTimeout(() => {
      if (animationToken !== routeViewportAnimationToken) return;
      map.fitBounds(bounds);
    }, center ? 260 : 0);
  }

  function updateRouteRendererVisibility(routeBounds, origin, destination) {
    if (!map || !window.google || !google.maps) return;

    // Validate stage endpoints: ensure lat/lng are finite and within region bounds
    function isValidStageCoordinate(coord, region = currentTripRegion) {
      if (!coord) return false;
      const lat = Number(coord.lat);
      const lng = Number(coord.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
      // Prevent offshore/out-of-bounds coordinates
      if (isCoordinatesOutsideRegion({ lat, lng }, region)) return false;
      return true;
    }

    const boundsToUse = activeRouteStage === null
      ? (routeBounds || currentRouteBounds)
      : (() => {
          // Stage mode: verify both origin and destination before building bounds
          const originValid = isValidStageCoordinate(origin);
          const destinationValid = isValidStageCoordinate(destination);
          
          if (!originValid || !destinationValid) {
            // Fallback to full route if either endpoint is invalid
            console.warn('[updateRouteRendererVisibility] Invalid stage coordinates detected, falling back to full route bounds');
            return currentRouteBounds;
          }
          
          const bounds = new google.maps.LatLngBounds();
          bounds.extend(new google.maps.LatLng(Number(origin.lat), Number(origin.lng)));
          bounds.extend(new google.maps.LatLng(Number(destination.lat), Number(destination.lng)));
          return bounds;
        })();

    if (activeRouteStage === null && boundsToUse) {
      focusRouteBoundsWithMotion(boundsToUse);
    } else if (boundsToUse) {
      focusRouteBoundsWithMotion(boundsToUse, 16);
    }

    currentRouteFocusBounds = boundsToUse || currentRouteBounds;

    directionsRenderers.forEach((renderer, idx) => {
      if (renderer) {
        renderer.setMap(activeRouteStage === null || idx === activeRouteStage ? map : null);
      }
    });

    routeMidLabels.forEach((label, idx) => {
      if (label) {
        label.setMap(activeRouteStage === null || idx === activeRouteStage ? map : null);
      }
    });

    // 步行線與 🅿️ 停車點：比照階段顯示/隱藏
    walkRenderers.forEach((arr, idx) => {
      (arr || []).forEach((o) => { if (o && o.setMap) o.setMap(activeRouteStage === null || idx === activeRouteStage ? map : null); });
    });
    parkingMarkers.forEach((arr, idx) => {
      (arr || []).forEach((m) => { if (m && m.setMap) m.setMap(activeRouteStage === null || idx === activeRouteStage ? map : null); });
    });

    const panel = document.getElementById('directionsPanel');
    if (panel) {
      Array.from(panel.children).forEach((child) => {
        if (activeRouteStage !== null && parseInt(child.dataset.index, 10) === activeRouteStage) {
          child.style.borderColor = 'var(--accent)';
          child.style.backgroundColor = 'var(--accent-light)';
          child.style.boxShadow = '0 10px 24px rgba(46, 125, 109, 0.14)';
          child.style.transform = 'translateY(-2px)';
        } else {
          child.style.borderColor = 'var(--border)';
          child.style.backgroundColor = 'transparent';
          child.style.boxShadow = 'none';
          child.style.transform = 'translateY(0)';
        }
      });
    }

    renderMobileRouteSheet();
    renderToiletMarkersForActiveRouteStage();
  }

  function selectRouteStage(stageIndex) {
    const stage = routeStageCache.find((item) => item && item.index === stageIndex);
    if (!stage) return;

    activeRouteStage = activeRouteStage === stageIndex ? null : stageIndex;
    activeItineraryStopId = null; // 清除行程階段選擇
    mobileRouteSheetExpanded = true;
    updateRouteRendererVisibility(currentRouteBounds, stage.origin, stage.destination);
    renderToiletMarkersForActiveRouteStage();
    renderItineraryDisplay();
  }

  // 桌機「路線階段」面板的邊緣收合把手（slide-to-edge）
  function toggleDirectionsPanel() {
    const panel = document.getElementById('directionsPanel');
    const handle = document.getElementById('directionsPanelHandle');
    if (!panel || !handle) return;
    const collapsed = panel.classList.toggle('collapsed');
    handle.classList.toggle('collapsed', collapsed);
    handle.textContent = collapsed ? '階段 ▸' : '階段 ◂';
  }
  function setDirectionsPanelHandleVisible(visible) {
    const handle = document.getElementById('directionsPanelHandle');
    if (!handle) return;
    if (visible) {
      handle.hidden = false;
    } else {
      // 隱藏時還原為展開狀態，下次顯示是展開的
      handle.hidden = true;
      const panel = document.getElementById('directionsPanel');
      if (panel) panel.classList.remove('collapsed');
      handle.classList.remove('collapsed');
      handle.textContent = '階段 ◂';
    }
  }

  function toggleMobileRouteSheet(forceExpanded = null) {
    if (!isMobileLayout()) return;
    if (typeof forceExpanded === 'boolean') {
      mobileRouteSheetExpanded = forceExpanded;
    } else {
      mobileRouteSheetExpanded = !mobileRouteSheetExpanded;
    }
    renderMobileRouteSheet();
  }

  function renderMobileRouteSheet() {
    const sheet = document.getElementById('mobileRouteSheet');
    const summary = document.getElementById('mobileRouteSummary');
    const list = document.getElementById('mobileRouteList');
    const icon = document.getElementById('mobileRouteToggleIcon');
    if (!sheet || !summary || !list || !icon) return;

    const mobileVisible = isMobileLayout() && document.body.classList.contains('mobile-mode-map');
    sheet.style.display = mobileVisible ? 'flex' : 'none';

    if (!mobileVisible) {
      sheet.classList.remove('expanded');
      return;
    }

    sheet.classList.toggle('expanded', mobileRouteSheetExpanded);
    icon.textContent = mobileRouteSheetExpanded ? '▾' : '▴';

    const stages = routeStageCache.filter(Boolean);
    const activeStage = stages.find((stage) => stage.index === activeRouteStage);
    summary.textContent = activeStage
      ? `目前聚焦第 ${activeStage.index + 1} 段 · ${activeStage.origin.name || activeStage.origin.title} → ${activeStage.destination.name || activeStage.destination.title}`
      : `${stages.length} 段路徑 · 點開可收合查看`;

    list.innerHTML = stages.length ? stages.map((stage) => `
      <button class="mobile-route-item ${activeRouteStage === stage.index ? 'active' : ''}" type="button" onclick="selectRouteStage(${stage.index})">
        <div class="mobile-route-item-main">
          <div class="mobile-route-item-head">
            <div class="mobile-route-item-time">${escapeHtml(getRouteStageTimeText(stage) || '時間計算中')}</div>
            <div class="mobile-route-item-name">階段 ${stage.index + 1}：${escapeHtml(stage.origin.name || stage.origin.title)} → ${escapeHtml(stage.destination.name || stage.destination.title)}</div>
          </div>
          <div class="mobile-route-item-meta">${escapeHtml(getTransitModeMeta(stage.mode).icon)} ${escapeHtml(getTransitModeMeta(stage.mode).label)} · ${escapeHtml((!stage.distance || isDistanceAbnormallySmall(stage.distance)) ? '距離計算中' : stage.distance)} · ${escapeHtml(getRouteStageTimeText(stage) || '路線時間計算中')}</div>
        </div>
        <div class="mobile-route-item-badge">${activeRouteStage === stage.index ? '聚焦中' : '點看'}</div>
      </button>
    `).join('') : '<div style="padding: 12px 2px; font-size: 12px; color: var(--ink2);">路線資料載入中。</div>';
  }

  function refreshMobileMapLayout() {
    if (!map || !window.google || !google.maps) return;
    updateMobileViewportMetrics();
    applyMobileMapHeight();
    updateMobileDriverPanelLayout();
    window.setTimeout(() => {
      google.maps.event.trigger(map, 'resize');
      if (currentRouteFocusBounds || currentRouteBounds) {
        try {
          map.fitBounds(currentRouteFocusBounds || currentRouteBounds);
        } catch (error) {
          // ignore resize race conditions
        }
      }
      renderMobileRouteSheet();
    }, 80);
  }

  async function initMap() {
    if (map) return;
    await rebuildMapPinLocationsFromStops();
    const initialCenter = getMapFocusCenter();
    const mapOptions = {
      center: initialCenter,
      zoom: 15,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      zoomControl: true,
      styles: [
        {
          "featureType": "poi",
          "stylers": [{ "visibility": "off" }]
        }
      ]
    };

    map = new google.maps.Map(document.getElementById("googleMap"), mapOptions);

    // 添加交通層以顯示塞車路段
    const trafficLayer = new google.maps.TrafficLayer();
    trafficLayer.setMap(map);

    directionsService = new google.maps.DirectionsService();
    renderMapMarkersFromCurrentLocations();
    // 繪製階段性路線 (利用 Directions API)
    calculateAndDisplayRoute(buildRouteLocationsFromStops());
  }

  function calculateAndDisplayRoute(locations) {
    const renderToken = ++routeRenderToken;
    const schedule = buildReplanSchedule();

    // sanitize locations to ensure no NaN/invalid coords are passed to Directions API
    locations = (locations || []).filter((l) => l && Number.isFinite(Number(l.lat)) && Number.isFinite(Number(l.lng)));

    if (locations.length < 2) {
      routeStageCache = [];
      directionsRenderers.forEach((renderer) => { if (renderer) renderer.setMap(null); });
      directionsRenderers = [];
      routeMidLabels.forEach((m) => { if (m) m.setMap(null); });
      routeMidLabels = [];
      activeRouteStage = null;
      clearToiletMarkers();
      clearStageWalkParkingOverlays();
      currentRouteBounds = null;
      currentRouteFocusBounds = null;
      const panel = document.getElementById('directionsPanel');
      if (panel) {
        panel.innerHTML = '';
      }
      setDirectionsPanelHandleVisible(false); // 無路線：收起把手
      renderMobileRouteSheet();
      renderItineraryDisplay();
      return;
    }

    currentRouteBounds = null;
    currentRouteFocusBounds = null;
    routeStageCache = locations.slice(0, -1).map((origin, index) => ({
      index,
      origin,
      destination: locations[index + 1],
      sourceStopIndex: origin.stopIndex,
      destinationStopIndex: locations[index + 1].stopIndex,
      mode: schedule[origin.stopIndex] ? normalizeTransitMode(schedule[origin.stopIndex].transitMode) : 'car',
      distance: '',
      duration: '',
      departureMin: null,
      arrivalMin: null,
      timeRange: ''
    }));
    syncRouteStageScheduleTimes(schedule);

    directionsRenderers.forEach((renderer) => { if (renderer) renderer.setMap(null); });
    directionsRenderers = [];
    routeMidLabels.forEach((m) => { if (m) m.setMap(null); });
    routeMidLabels = [];
    activeRouteStage = null;
    clearToiletMarkers();
    clearStageWalkParkingOverlays();

    const panel = document.getElementById('directionsPanel');
    if (panel) {
      panel.innerHTML = '';
      panel.style.display = isMobileLayout() ? 'none' : 'block';
    }
    setDirectionsPanelHandleVisible(!isMobileLayout()); // 桌機有路線才顯示收合把手

    const routeBounds = new google.maps.LatLngBounds();
    locations.forEach((location) => {
      routeBounds.extend(new google.maps.LatLng(Number(location.lat), Number(location.lng)));
    });
    currentRouteBounds = routeBounds;
    map.fitBounds(routeBounds);
    renderMobileRouteSheet();

    // 先解析各「開車類」目的地的停車點（TDX 優先 → Places 退回），再建線
    resolveParkingForStages(locations, renderToken).then((parkingByStopIndex) => {
    if (renderToken !== routeRenderToken) return;
    for (let i = 0; i < locations.length - 1; i++) {
      const origin = locations[i];
      const destination = locations[i + 1];
      const stageMode = routeStageCache[i] ? normalizeTransitMode(routeStageCache[i].mode) : 'walk';
      const stageMeta = getTransitModeMeta(stageMode);
      // 停車樞紐：開車段連到停車點，第 0 段起點仍用景點本身、其後用上一段目的地的停車點
      const isParkingMode = (stageMode === 'car' || stageMode === 'scooter');
      const destParking = isParkingMode ? (parkingByStopIndex[destination.stopIndex] || null) : null;
      const originParking = (isParkingMode && i >= 1) ? (parkingByStopIndex[origin.stopIndex] || null) : null;
      // 記錄此開車段的目的地有沒有搜到鄰近停車場，供左側交通列 / 右側階段卡顯示警示
      if (routeStageCache[i]) {
        routeStageCache[i].parkingSearched = isParkingMode;
        routeStageCache[i].parkingFound = !!destParking;
      }
      // 這段沒有停車點（走路段/找不到停車場/切換交通工具）→ 清掉目的站殘留的停車步行時間
      if (!destParking && typeof destination.stopIndex === 'number' && replanStops[destination.stopIndex]) {
        replanStops[destination.stopIndex].parkWalkMin = null;
      }
      const driveOrigin = originParking || origin;
      const driveDest = destParking || destination;
      const directionRequest = buildGoogleRouteRequest(stageMode, driveOrigin, driveDest);

      directionsService.route(
        directionRequest,
        (response, status) => {
          if (status === 'OK') {
            if (renderToken !== routeRenderToken) return;

            // 從所有替代路線中選距離最短的，避免 API 預設給繞遠路的路線
            let bestRouteIndex = 0;
            if (response.routes.length > 1) {
              let minDist = Infinity;
              response.routes.forEach((route, idx) => {
                const dist = route.legs.reduce((sum, leg) => sum + (leg.distance ? leg.distance.value : 0), 0);
                if (dist < minDist) { minDist = dist; bestRouteIndex = idx; }
              });
            }

            const leg = response.routes[bestRouteIndex].legs[0];
            const segColor = ROUTE_MODE_COLORS[stageMode] || '#EA580C';
            const renderer = new google.maps.Polyline({
              map: map,
              path: response.routes[bestRouteIndex].overview_path,
              strokeColor: segColor,
              strokeWeight: 6,
              strokeOpacity: 0.95,
              geodesic: true,
              zIndex: 1000,
              icons: [
                {
                  icon: {
                    path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
                    scale: 8,
                    strokeColor: '#ffffff',
                    fillColor: '#ffffff',
                    fillOpacity: 1
                  },
                  offset: '15%',
                  repeat: '80px'
                },
                {
                  icon: {
                    path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
                    scale: 5,
                    strokeColor: segColor,
                    fillColor: segColor,
                    fillOpacity: 1
                  },
                  offset: '15%',
                  repeat: '80px'
                }
              ]
            });
            directionsRenderers[i] = renderer;

            // 在路線中間加入方向標籤，讓使用者清楚知道往哪個景點移動
            const overviewPath = response.routes[bestRouteIndex].overview_path;
            if (overviewPath && overviewPath.length > 0) {
              const midPoint = overviewPath[Math.floor(overviewPath.length / 2)];
              const destLabel = destination.name || destination.title || '';
              const midMarker = new google.maps.Marker({
                position: midPoint,
                map: map,
                icon: createRouteMidLabelIcon(stageMeta.icon, destLabel, segColor),
                zIndex: 900,
                clickable: false
              });
              routeMidLabels[i] = midMarker;
            }

            const fallbackTransitMin = schedule[origin.stopIndex] ? schedule[origin.stopIndex].transit : 0;
            const legEstimate = getGoogleLegEstimate(leg, fallbackTransitMin);

            if (routeStageCache[i]) {
              routeStageCache[i].mode = stageMode;
              routeStageCache[i].distance = legEstimate.distanceText;
              routeStageCache[i].duration = legEstimate.durationText;

              if (typeof origin.stopIndex === 'number' && replanStops[origin.stopIndex]) {
                replanStops[origin.stopIndex].transitMin = legEstimate.durationMinutes;
                // 開頁自動繪路線也會走到這裡：使用者尚未互動就不寫回（載入只讀不寫），
                // 避免每次重新整理都以 Google 回填的 transitMin 改動 Firestore。
                if (tripUserDirty) schedulePersistTrip();
                else scheduleDisplayRefit(); // Google 實測交通比估算長 → 顯示端補壓縮，免得橫幅顯示「超出規劃時間」
              }
            }

            const updatedSchedule = buildReplanSchedule();
            syncRouteStageScheduleTimes(updatedSchedule);
            const stageTimeText = getRouteStageTimeText(routeStageCache[i]);

            const stageDiv = document.createElement('div');
            stageDiv.style.marginBottom = '12px';
            stageDiv.style.border = '1px solid var(--border)';
            stageDiv.style.borderRadius = '12px';
            stageDiv.style.padding = '12px';
            stageDiv.style.cursor = 'pointer';
            stageDiv.style.transition = 'transform 0.22s ease, border-color 0.22s ease, background-color 0.22s ease, box-shadow 0.22s ease';

            if (i === activeRouteStage) {
              stageDiv.style.borderColor = 'var(--accent)';
              stageDiv.style.backgroundColor = 'var(--accent-light)';
              stageDiv.style.boxShadow = '0 10px 24px rgba(46, 125, 109, 0.14)';
              stageDiv.style.transform = 'translateY(-2px)';
            }

            stageDiv.innerHTML = `
              <div style="font-weight: 800; font-size: 14px; color: var(--ink); margin-bottom: 4px;">
                階段 ${i + 1}：${origin.name || origin.title} ➔ ${destination.name || destination.title}
              </div>
              <div style="font-size: 12px; color: var(--ink2);">
                ${stageMeta.icon} ${stageMeta.label} · ${stageTimeText || '時間計算中'}${legEstimate.distanceText && !isDistanceAbnormallySmall(legEstimate.distanceText) ? ' · 距離：' + legEstimate.distanceText : ''} · 預估 ${legEstimate.durationText}
                <span class="stage-walk-note-origin" style="display:none;margin-top:3px;color:#16A34A;font-weight:600;"></span>
                <span class="stage-walk-note" style="display:none;margin-top:3px;color:#16A34A;font-weight:600;"></span>
                ${(isParkingMode && !destParking) ? `<span style="display:block;margin-top:3px;color:#C2410C;font-weight:600;">🅿️ 目的地（${shortStopName(destination.name || destination.title || '下一站')}）找不到鄰近停車場，請自行尋找路邊或付費停車</span>` : ''}
              </div>
            `;

            stageDiv.addEventListener('click', () => {
              selectRouteStage(i);
            });

            stageDiv.dataset.index = i;
            if (panel) {
              panel.appendChild(stageDiv);
              Array.from(panel.children)
                .sort((a, b) => parseInt(a.dataset.index, 10) - parseInt(b.dataset.index, 10))
                .forEach((node) => panel.appendChild(node));
            }

            // 停車樞紐：畫 🅿️ 停車點 + 停車點↔景點綠色虛線步行線
            if (destParking) {
              drawParkingMarker(i, destParking, renderToken);
              drawWalkOverlay(i, destParking, destination, renderToken).then((walk) => {
                if (renderToken !== routeRenderToken || !walk) return;
                if (walk.text) {
                  const note = stageDiv.querySelector('.stage-walk-note');
                  if (note) {
                    note.textContent = `🅿️ 停車後步行約 ${walk.text} 到${destination.name || destination.title || '景點'}`;
                    note.style.display = 'block';
                  }
                }
                // 「停車後步行」納入排程：寫進目的站的暫態欄位（不存 Firestore，
                // 每次畫路線重算），buildReplanSchedule 會把它加進該段交通時間，
                // 左側時間軸與後續站的開始時刻才會反映真實情況。
                if (Number.isFinite(walk.minutes) && walk.minutes > 0
                    && typeof destination.stopIndex === 'number' && replanStops[destination.stopIndex]) {
                  replanStops[destination.stopIndex].parkWalkMin = walk.minutes;
                  scheduleParkWalkRefresh();
                }
              });
            }
            if (originParking) {
              drawParkingMarker(i, originParking, renderToken);
              drawWalkOverlay(i, originParking, origin, renderToken).then((walk) => {
                if (renderToken !== routeRenderToken || !walk || !walk.text) return;
                const note = stageDiv.querySelector('.stage-walk-note-origin');
                if (note) {
                  // 標明是「出發端」的停車場（上一段抵達時停的），避免與目的地找不到停車場的警示讀起來矛盾
                  note.textContent = `🚶 出發前先從${shortStopName(origin.name || origin.title || '景點')}步行約 ${walk.text} 回停車場取車`;
                  note.style.display = 'block';
                }
              });
            }

            renderItineraryDisplay();
            renderMobileRouteSheet();
          } else {
            console.error('Directions request failed due to ' + status);
          }
        }
      );
    }
    });
  }

  function highlightPin(pinId) {
    const group = getMarkerGroup(pinId);
    if (!group.length) return;

    setMarkerLayerState(pinId, true);
    group.forEach((item) => {
      item.marker.setAnimation(google.maps.Animation.BOUNCE);
    });

    setTimeout(() => {
      group.forEach((item) => {
        if (item.marker) item.marker.setAnimation(null);
      });
    }, 1400);
  }

  function unhighlightPin(pinId) {
    if (currentOpenPin === pinId) return;
    const group = getMarkerGroup(pinId);
    group.forEach((item) => {
      if (item.marker) item.marker.setAnimation(null);
    });
    setMarkerLayerState(pinId, false);
  }

  // ── 行程標點導覽資料與邏輯 ──
  const pinData = {};

  function formatDayBusinessHours(businessHoursStr, departureDate) {
    if (!businessHoursStr) return '';
    const lines = String(businessHoursStr).split('\n');
    if (departureDate) {
      const jsDay = new Date(departureDate + 'T00:00:00').getDay();
      const apiIndex = jsDay === 0 ? 6 : jsDay - 1;
      const dayLine = lines[apiIndex];
      if (dayLine) return /休息|closed/i.test(dayLine) ? '🔴 ' + dayLine : '🕐 ' + dayLine;
    }
    return '🕐 ' + (lines[0] || businessHoursStr);
  }

  function showPinInfo(pinId) {
    const data = pinData[pinId];
    if (!data) return;

    if (isModifyWindowOpen && modifySource === 'map') {
      const mappedSpot = modifySpotCatalog.find((spot) => spot.source === 'map' && spot.pinId === pinId);
      if (mappedSpot) {
        selectedModifySpotId = mappedSpot.id;
        renderModifyWindowBody();
      }
    }
    
    // 替換卡片內容
    const nameFromTitle = String(data.title || '').replace(/^[^\s]+\s+/, '').trim();
    const finalDesc = buildSpotDescription(nameFromTitle, data.desc, currentTripRegion, currentTripTitle);
    const finalNotice = buildSpotNotice(nameFromTitle, data.desc, data.notice);
    document.getElementById('micTitle').innerText = data.title;
    document.getElementById('micDesc').innerText = finalDesc;
    document.getElementById('micNotice').innerText = finalNotice;
    const micHoursEl = document.getElementById('micHours');
    if (micHoursEl) {
      const deptDate = currentTripPreferences?.departureDate;
      const hoursText = formatDayBusinessHours(data.businessHours, deptDate);
      micHoursEl.textContent = hoursText;
      micHoursEl.style.display = hoursText ? '' : 'none';
    }

    const matchedStop = Array.isArray(replanStops)
      ? replanStops.find((s) => s.mapPinId === pinId && s.type !== 'start' && s.type !== 'end')
      : null;
    const visitedRow = document.getElementById('micVisitedRow');
    const visitedBtn = document.getElementById('micVisitedBtn');
    if (visitedRow && visitedBtn) {
      if (matchedStop) {
        const v = isPlaceVisited(matchedStop.name);
        visitedRow.style.display = '';
        visitedBtn.dataset.stopId = matchedStop.id;
        visitedBtn.textContent = v ? '✓ 已去過' : '📌 去過了';
        visitedBtn.classList.toggle('visited', v);
        visitedBtn.onclick = (e) => { e.stopPropagation(); handleToggleVisited(matchedStop.id, visitedBtn); };
      } else {
        visitedRow.style.display = 'none';
        visitedBtn.onclick = null;
      }
    }

    // 合併大景點：子景點改用獨立「附近景點」中標題 + 小標籤列出（取代舊的內文「（含 …）」；
    // 景點介紹（#micDesc）已於上方設為乾淨 finalDesc，不再嵌入「（含 …）」。資料來自 mergedSubSpots）
    const micNearbyEl = document.getElementById('micNearby');
    if (micNearbyEl) {
      const nearbySubs = matchedStop && matchedStop.isMergedAttraction && Array.isArray(matchedStop.mergedSubSpots)
        ? matchedStop.mergedSubSpots.filter(Boolean)
        : [];
      if (nearbySubs.length) {
        micNearbyEl.innerHTML = nearbySubs.map(n => `<span class="mic-nearby-pill">${escapeHtml(n)}</span>`).join('');
        micNearbyEl.style.display = '';
      } else {
        micNearbyEl.innerHTML = '';
        micNearbyEl.style.display = 'none';
      }
    }

    // 顯示卡片
    document.getElementById('mapInfoCard').classList.add('show');
    
    // 重置所有圖釘，並高亮當前點擊的圖釘
    document.querySelectorAll('.map-pin').forEach(p => p.classList.remove('active'));
    const pinElement = document.getElementById(pinId);
    if (pinElement) {
      pinElement.classList.add('active');
    }
    setMarkerLayerState(pinId, true);
    currentOpenPin = pinId;

    // 平滑移動地圖到該位置
    if (map && data && data.lat != null && data.lng != null) {
      const lat = Number(data.lat);
      const lng = Number(data.lng);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        map.panTo(new google.maps.LatLng(lat, lng));
      }
    }
  }

  function closePinInfo() {
    // 隱藏卡片
    document.getElementById('mapInfoCard').classList.remove('show');
    // 移除點擊產生的高亮
    if (currentOpenPin) {
      const pin = document.getElementById(currentOpenPin);
      if(pin) pin.classList.remove('active');
      setMarkerLayerState(currentOpenPin, false);
      currentOpenPin = null;
    }
  }

  // ── 透過 LINE 分享行程邏輯 ──
  function shareViaLine() {
    const shareText = buildShareText();
    const shareTitle = `${currentTripTitle || '未命名行程'} · WanderAI`;
    
    // 優先使用系統原生分享選單 (Mobile 體驗最佳)
    if (navigator.share) {
      navigator.share({
        title: shareTitle,
        text: shareText
      }).catch(err => console.log('分享取消或失敗', err));
    } else {
      // 若瀏覽器不支援 Web Share API (如部分 Desktop 環境)，改用 LINE 專屬連結
      const lineUrl = `https://line.me/R/msg/text/?${encodeURIComponent(shareText)}`;
      window.open(lineUrl, '_blank');
    }
  }

  // ── 使用者登入與 Google 登入整合 (W1) ──
  window.openLogin = function() {
    const overlay = document.getElementById('loginOverlay');
    if (overlay) overlay.classList.add('open');
  };

  window.closeLogin = function() {
    const overlay = document.getElementById('loginOverlay');
    if (overlay) overlay.classList.remove('open');
  };

  window.switchAuthTab = function(tab) {
    const loginTab = document.getElementById('loginTab');
    const registerTab = document.getElementById('registerTab');
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    if (loginTab && registerTab && loginForm && registerForm) {
      loginTab.classList.toggle('active', tab === 'login');
      registerTab.classList.toggle('active', tab === 'register');
      loginForm.style.display = tab === 'login' ? '' : 'none';
      registerForm.style.display = tab === 'register' ? '' : 'none';
    }
  };

  window.toggleUserDropdown = function() {
    const dd = document.getElementById('userDropdown');
    if (dd) dd.classList.toggle('open');
  };

  window.openChangePwd = function() {
    const u = firebaseAuth && firebaseAuth.currentUser;
    if (!u) return feedbackToast('請先登入', 'orange');
    const hasPwd = (u.providerData || []).some(p => p && p.providerId === 'password');
    if (!hasPwd) return feedbackToast('你以社群帳號登入，請至 Google／Facebook 修改密碼', 'orange');
    ['cpwCurrent', 'cpwNew', 'cpwConfirm'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    const overlay = document.getElementById('changePwdOverlay');
    if (overlay) overlay.classList.add('open');
  };

  window.closeChangePwd = function() {
    const overlay = document.getElementById('changePwdOverlay');
    if (overlay) overlay.classList.remove('open');
  };

  function isValidEmail(s) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
  }

  // 資安：把 Firebase 原始錯誤轉成「不可區分」的通用訊息（與 explore 相同邏輯）。
  // 不可把 e.message 直接秀給使用者——錯誤差異會讓攻擊者列舉有效帳號（撞庫偵察）。
  function authErrorMessage(e, kind) {
    const code = (e && e.code) || '';
    if (code === 'auth/too-many-requests') return '嘗試次數過多，帳號已暫時鎖定，請稍後再試。';
    if (code === 'auth/network-request-failed') return '網路連線異常，請檢查網路後再試。';
    if (kind === 'register') {
      if (code === 'auth/email-already-in-use') return '這個 Email 無法使用，請改用其他信箱，或直接嘗試登入。';
      if (code === 'auth/weak-password') return '密碼強度不足，請使用至少 8 個字元並混合英數。';
      if (code === 'auth/invalid-email') return 'Email 格式不正確。';
      return '註冊失敗，請稍後再試。';
    }
    return '帳號或密碼錯誤，請確認後再試。';
  }

  window.doLogin = async function() {
    if (!firebaseEnabled || !firebaseAuth) return feedbackToast('Firebase 尚未初始化', 'orange');
    const emailEl = document.getElementById('loginEmail');
    const pwdEl = document.getElementById('loginPwd');
    const email = emailEl ? emailEl.value.trim() : '';
    const pwd = pwdEl ? pwdEl.value : '';
    if (!email || !pwd) return feedbackToast('請填寫帳號和密碼', 'orange');
    if (!isValidEmail(email)) return feedbackToast('請輸入正確的電子信箱格式', 'orange');
    try {
      await firebaseAuth.signInWithEmailAndPassword(email, pwd);
      feedbackToast('👋 歡迎回來！', 'green');
      window.closeLogin();
    } catch (e) {
      feedbackToast(authErrorMessage(e, 'login'), 'red');
    }
  };

  window.doRegister = async function() {
    if (!firebaseEnabled || !firebaseAuth) return feedbackToast('Firebase 尚未初始化', 'orange');
    const nameEl = document.getElementById('regName');
    const emailEl = document.getElementById('regEmail');
    const pwdEl = document.getElementById('regPwd');
    const name = nameEl ? nameEl.value.trim() : '';
    const email = emailEl ? emailEl.value.trim() : '';
    const pwd = pwdEl ? pwdEl.value : '';
    if (!name || !email || !pwd) return feedbackToast('請填寫所有欄位', 'orange');
    if (!isValidEmail(email)) return feedbackToast('請輸入正確的電子信箱格式', 'orange');
    if (pwd.length < 8) return feedbackToast('密碼至少需要 8 個字元', 'orange');
    try {
      const userCredential = await firebaseAuth.createUserWithEmailAndPassword(email, pwd);
      const user = userCredential.user;
      if (firebaseDb) {
        await firebaseDb.collection('users').doc(user.uid).set({
          uid: user.uid,
          email: email,
          name: name,
          emoji: '🌟',
          preferences: { interests: [], pace: '平衡', avoid: '', avoidTags: [] },
          visitedSpots: [],
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      }
      feedbackToast(`🎉 歡迎加入 WanderAI，${name}！`, 'green');
      window.closeLogin();
      feedbackToast('您可至「我的微旅行」首頁設定個人偏好。', 'blue');
    } catch (e) {
      feedbackToast(authErrorMessage(e, 'register'), 'red');
    }
  };

  window.doSocialLogin = async function(providerName) {
    if (!firebaseEnabled || !firebaseAuth) return feedbackToast('Firebase 尚未初始化', 'orange');
    try {
      let provider = null;
      if (providerName === 'Google') provider = new firebase.auth.GoogleAuthProvider();
      else if (providerName === 'Facebook') provider = new firebase.auth.FacebookAuthProvider();
      else return;
      
      const userCredential = await firebaseAuth.signInWithPopup(provider);
      const user = userCredential.user;
      
      if (firebaseDb) {
        const docRef = firebaseDb.collection('users').doc(user.uid);
        const doc = await docRef.get();
        if (!doc.exists) {
          await docRef.set({
            uid: user.uid,
            email: user.email || '',
            name: user.displayName || '社群用戶',
            emoji: providerName === 'Google' ? '🌐' : '📘',
            preferences: { interests: [], pace: '平衡', avoid: '', avoidTags: [] },
            visitedSpots: [],
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
          });
          feedbackToast('🎉 歡迎首次登入 WanderAI！', 'green');
        } else {
          feedbackToast(`👋 歡迎回來，${user.displayName || '使用者'}！`, 'green');
        }
      }
      window.closeLogin();
    } catch (e) {
      // 社群登入取消/失敗：不洩漏原始錯誤
      const code = (e && e.code) || '';
      feedbackToast(code === 'auth/popup-closed-by-user' ? '已取消登入' : authErrorMessage(e, 'login'), 'red');
    }
  };

  window.doLogout = function() {
    if (firebaseAuth) firebaseAuth.signOut();
    feedbackToast('已登出，重整頁面中…');
    setTimeout(() => { window.location.reload(); }, 800);
  };

  window.doChangePassword = async function() {
    if (!firebaseEnabled || !firebaseAuth) return feedbackToast('Firebase 尚未初始化', 'orange');
    const u = firebaseAuth.currentUser;
    if (!u) return feedbackToast('請先登入', 'orange');
    const curEl = document.getElementById('cpwCurrent');
    const npEl = document.getElementById('cpwNew');
    const cfEl = document.getElementById('cpwConfirm');
    const cur = curEl ? curEl.value : '';
    const np = npEl ? npEl.value : '';
    const cf = cfEl ? cfEl.value : '';
    if (!cur || !np || !cf) return feedbackToast('請填寫所有欄位', 'orange');
    if (np.length < 8) return feedbackToast('新密碼至少需要 8 個字元', 'orange');
    if (np !== cf) return feedbackToast('兩次輸入的新密碼不一致', 'orange');
    if (np === cur) return feedbackToast('新密碼不可與目前密碼相同', 'orange');
    try {
      const cred = firebase.auth.EmailAuthProvider.credential(u.email, cur);
      await u.reauthenticateWithCredential(cred);
      await u.updatePassword(np);
      feedbackToast('🔒 密碼已更新', 'green');
      window.closeChangePwd();
    } catch (e) {
      const code = e && e.code;
      let msg;
      if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') msg = '目前密碼不正確';
      else if (code === 'auth/weak-password') msg = '新密碼強度不足';
      else if (code === 'auth/too-many-requests') msg = '嘗試次數過多，請稍後再試';
      else msg = '密碼更新失敗：' + ((e && e.message) || '未知錯誤');
      feedbackToast(msg, 'red');
    }
  };

  function renderUserMenuWithData(name, emoji, email) {
    const wrap = document.getElementById('userMenuWrap');
    if (!wrap) return;
    if (!name || !email) {
      wrap.innerHTML = `<button class="login-prompt-btn" onclick="openLogin()">登入 / 註冊</button>`;
    } else {
      const u = firebaseAuth && firebaseAuth.currentUser;
      const _hasPwd = !!(u && (u.providerData || []).some(p => p && p.providerId === 'password'));
      wrap.innerHTML = `
        <div class="user-avatar-btn" onclick="toggleUserDropdown()" title="${escapeFeedbackText(name)}">
          ${escapeFeedbackText(emoji)}
        </div>
        <div class="user-dropdown" id="userDropdown">
          <div class="user-dropdown-header">
            <div class="user-dropdown-name">${escapeFeedbackText(name)}</div>
            <div class="user-dropdown-email">${escapeFeedbackText(email)}</div>
          </div>
          <div class="user-dd-item" onclick="window.location='ai-travel-explore-final.html?view=mytrips';toggleUserDropdown()">📋 我的微旅行</div>
          <div class="user-dd-item" onclick="window.location='ai-travel-explore-final.html?openPref=1';toggleUserDropdown()">🎯 修改個人喜好</div>
          ${_hasPwd ? `<div class="user-dd-item" onclick="openChangePwd();toggleUserDropdown()">🔒 修改密碼</div>` : ''}
          <div class="user-dd-sep"></div>
          <div class="user-dd-item danger" onclick="doLogout()">👋 登出</div>
        </div>`;
    }
  }

  function setupAuthListener() {
    if (!firebaseEnabled || !firebaseAuth) return;
    firebaseAuth.onAuthStateChanged(async (user) => {
      if (user) {
        let name = user.displayName || user.email?.split('@')[0] || '使用者';
        let emoji = '😊';
        let preferences = { interests: [], pace: '平衡', avoid: '', avoidTags: [] };
        let visitedSpots = [];
        
        let cachedData = null;
        try {
          const raw = localStorage.getItem('wai_user');
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && parsed.currentUser && parsed.currentUser.email === user.email) {
              cachedData = parsed.currentUser;
            }
          }
        } catch (_) {}

        if (cachedData) {
          name = cachedData.name || name;
          emoji = cachedData.emoji || emoji;
          preferences = cachedData.preferences || preferences;
          visitedSpots = cachedData.visitedSpots || visitedSpots;
        }

        renderUserMenuWithData(name, emoji, user.email);

        if (firebaseDb) {
          try {
            const doc = await firebaseDb.collection('users').doc(user.uid).get();
            if (doc.exists) {
              const data = doc.data();
              name = data.name || name;
              emoji = data.emoji || emoji;
              preferences = data.preferences || preferences;
              if (data.visitedSpots && Array.isArray(data.visitedSpots)) {
                visitedSpots = data.visitedSpots;
                localStorage.setItem(VISITED_PLACES_KEY, JSON.stringify(visitedSpots));
              }
            }
          } catch (e) {
            console.warn('無法從 Firestore 讀取使用者資料', e);
          }
        }

        const currentUserObj = { uid: user.uid, email: user.email, name, emoji, preferences, visitedSpots };
        localStorage.setItem('wai_user', JSON.stringify({ isLoggedIn: true, currentUser: currentUserObj }));
        renderUserMenuWithData(name, emoji, user.email);
      } else {
        localStorage.removeItem('wai_user');
        renderUserMenuWithData('', '', '');
      }
    });
  }

  document.addEventListener('click', e => {
    const wrap = document.getElementById('userMenuWrap');
    if (wrap && !wrap.contains(e.target)) {
      const dd = document.getElementById('userDropdown');
      if (dd) dd.classList.remove('open');
    }
  });

  async function startApp() {
    initFirebaseIfConfigured();
    setupAuthListener();
    await initFromUrl();
    if (window.google && window.google.maps) {
      if (!map) {
        await initMap();
      } else {
        await syncMapToCurrentTrip();
      }
    }
    renderRideMode(activeRideMode);
    renderPrototypeTripId();
    renderItineraryDisplay();
    refreshRouteDirections();
    updateItineraryStageUI();
    logTripEvent('session_started', {
      itinerary: buildItinerarySnapshot()
    });
    bindAiChatEvents();
    renderAiWelcomeMessage(true);
    syncMobileViewMode();
  }

  startApp();

  window.addEventListener('resize', () => {
    syncMobileViewMode();
    updateMobileDriverPanelLayout();
  });
  window.addEventListener('load', () => {
    if (window.google && window.google.maps && !map) {
      initMap();
    }
  });
