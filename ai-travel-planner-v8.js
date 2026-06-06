
  let currentItineraryId = 'TRIP-EMPTY';
  let currentTripTitle = '';
  let currentTripWindow = { start: '', end: '' };
  let currentTripRegion = '';
  let currentInviteCode = '';
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
  const VERTEX_API_BASE = 'https://aiplatform.googleapis.com/v1';
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
  let firebaseEnabled = false;
  const geocodeCache = new Map();
  const scenicPointCache = new Map();
  const placeSearchCache = new Map();
  const tdxSpotsCache = new Map();
  const TDX_AUTH_URL = 'https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token';
  const TDX_SCENIC_BASE = 'https://tdx.transportdata.tw/api/basic/v2/Tourism/ScenicSpot';
  const replanStartMinutes = 14 * 60;
  let replanStops = [];
  let persistTripDebounceTimer = null;
  let persistTripMaxWaitTimer = null;
  const TRANSIT_MODE_OPTIONS = [
    { value: 'taxi', label: '計程車', icon: '🚕' },
    { value: 'scooter', label: '機車', icon: '🛵' },
    { value: 'car', label: '汽車', icon: '🚗' },
    { value: 'walk', label: '走路', icon: '🚶' },
    { value: 'public', label: '大眾交通', icon: '🚌' }
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

  function resolveTripCenter(region, title = '') {
    const preset = findRegionMapPreset(region, title);
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
    const normalized = normalizeMapText(region || '');
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
    const regionName = String(region || '').trim();
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

  async function fetchTdxScenicSpots(county) {
    if (!county) return [];
    if (tdxSpotsCache.has(county)) return tdxSpotsCache.get(county);
    const cfg = window.TRAVEL_APP_CONFIG || {};
    const appId = cfg.TDX_APP_ID;
    const appKey = cfg.TDX_APP_KEY;
    if (!appId || !appKey) return [];
    try {
      const tokenRes = await fetch(TDX_AUTH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=client_credentials&client_id=${encodeURIComponent(appId)}&client_secret=${encodeURIComponent(appKey)}`
      });
      if (!tokenRes.ok) return [];
      const { access_token } = await tokenRes.json();
      const dataRes = await fetch(
        `${TDX_SCENIC_BASE}/${county}?$select=ScenicSpotName,Position,OpenTime,DescriptionDetail&$top=200&$format=JSON`,
        { headers: { Authorization: `Bearer ${access_token}` } }
      );
      if (!dataRes.ok) return [];
      const spots = await dataRes.json();
      const normalized = spots
        .filter(s => s.Position?.PositionLat && s.Position?.PositionLon)
        .map(s => ({
          name: s.ScenicSpotName,
          lat: s.Position.PositionLat,
          lng: s.Position.PositionLon,
          openTime: s.OpenTime || '',
          desc: (s.DescriptionDetail || '').slice(0, 100)
        }));
      tdxSpotsCache.set(county, normalized);
      console.info(`[TDX] 載入 ${county} 景點 ${normalized.length} 筆`);
      return normalized;
    } catch (e) {
      console.warn('[TDX] 抓取失敗，跳過 TDX 驗證', e.message);
      tdxSpotsCache.set(county, []);
      return [];
    }
  }

  function findTdxScenicMatch(stopName, county) {
    const spots = tdxSpotsCache.get(county) || [];
    const norm = normalizeText(stopName);
    if (!norm) return null;
    return spots.find(s => {
      const sNorm = normalizeText(s.name);
      return sNorm.includes(norm) || norm.includes(sNorm);
    }) || null;
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

    const docRef = getScenicPointDocRef(name, region);
    // 如果無法取得 docRef 或無 firebase，僅保留快取，不寫入
    if (!docRef || !firebaseEnabled) return scenicPointCache.get(key);

    try {
      const verified = await verifyPlaceWithOpenData(name, { lat: coordinates.lat, lng: coordinates.lng }, region);
      if (!verified) {
        console.info(`OpenData 驗證未通過，暫不寫入 Firebase：${name}`);
        // 更新快取狀態 (未驗證)
        scenicPointCache.set(key, { ...cachedRecord, verified: false });
        return scenicPointCache.get(key);
      }

      // 驗證通過後先在快取標記為 verified，並以非同步方式寫入 Firebase（避免被外部重建 token 取消）
      scenicPointCache.set(key, { ...record, verified: true });
      // fire-and-forget 寫入，錯誤則記錄，但不影響目前流程
      docRef.set({ ...record, verified: true }, { merge: true })
        .then(() => {
          // 成功寫入
        })
        .catch((err) => {
          console.warn('寫入景點座標失敗（非同步）：', err);
          // 若寫入失敗，仍保留快取但標記為未驗證
          scenicPointCache.set(key, { ...cachedRecord, verified: false });
        });
    } catch (error) {
      console.warn('寫入景點座標失敗：', error);
    }

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
    const reg = region ? ' ' + String(region).trim() : '';
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
    let snapped = 0, checked = 0;
    for (const stop of stops) {
      // 座標已鎖定的站（本島港/離島返程港）不重驗，避免被「超出離島範圍」誤判而搬到島上
      if (!stop || stop.type === 'start' || stop.type === 'end' || stop._lockedCoordinates) continue;
      const name = String(stop.name || '').trim();
      if (!name) continue;
      checked++;
      const cur = readStopCoordinates(stop);
      let cand = null;
      try { cand = await searchStrictPlaceCandidate(name, stop, region, title); } catch (e) { continue; }
      if (!cand || !cand.position) { console.info('[coord reverify] 無嚴格配對候選：', name); continue; }
      if (isCoordinatesOutsideRegion(cand.position, region, name)) { console.info('[coord reverify] 候選超出範圍，略過：', name, cand.name); continue; }
      const dist = cur ? measureDistanceMeters(cur, cand.position) : Infinity;
      if (!cur || dist > 800) {
        stop.lat = cand.position.lat;
        stop.lng = cand.position.lng;
        stop.scenicCoordinates = { lat: cand.position.lat, lng: cand.position.lng };
        stop.coordinateSource = 'places_reverify';
        snapped++;
        console.info('[coord reverify snap]', name, '→', cand.name, cand.position, '(原', cur, '偏移', Number.isFinite(dist) ? Math.round(dist) + 'm' : '無座標', ')');
      }
    }
    console.info(`[coord reverify] 完成：檢查 ${checked} 站、校正 ${snapped} 站`);
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
    const preset = findRegionMapPreset(region, title);
    if (preset) return { ...preset.center };

    const candidates = [region, title, `${region || ''} 台灣`, `${title || ''} 台灣`]
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
    await fetchTdxScenicSpots(tdxCounty);
    const tdxMatch = findTdxScenicMatch(String(template.name || '').trim(), tdxCounty);
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
      const explicitTripId = params.get('id');
      const myTrips = JSON.parse(localStorage.getItem('wai_mytrips') || '[]');
      const rememberedTripId = localStorage.getItem(ACTIVE_TRIP_LOCAL_KEY) || '';
      const fallbackTripId = rememberedTripId || (myTrips[0] && myTrips[0].id) || '';
      const tripId = explicitTripId || fallbackTripId;
      if (tripId) {
        let trip = myTrips.find(t => t.id === tripId);
        
        if (!trip && typeof firebase !== 'undefined' && firebaseEnabled && firebaseDb) {
           try {
             const doc = await firebaseDb.collection('micro_trips').doc(tripId).get();
             if (doc.exists) trip = doc.data();
           } catch (err) {
             console.warn('Failed to fetch trip from Firebase:', err);
           }
        }

        if (trip) {
          localStorage.setItem(ACTIVE_TRIP_LOCAL_KEY, trip.id);
          currentItineraryId = trip.id;
          currentTripTitle = trip.title || trip.aiTitle || '微旅行';
          tripSessionId = `${currentItineraryId}-${Date.now()}`;
          if (trip.inviteCode) currentInviteCode = trip.inviteCode;
          
          // Update Titles in DOM immediately
          const heroTitleEl = document.querySelector('#view-itinerary .hero-title');
          if (heroTitleEl) heroTitleEl.textContent = currentTripTitle;
          const bpTitleEl = document.querySelector('.boarding-pass .bp-top > div:nth-child(3)');
          if (bpTitleEl) bpTitleEl.textContent = currentTripTitle;
          
          const heroTags = document.querySelectorAll('#view-itinerary .hero-meta .hero-tag');
          if (heroTags.length >= 2) {
             heroTags[1].textContent = `📍 ${trip.region || '客製化行程'}`;
          }
          currentTripRegion = trip.region || currentTripRegion;
          currentTripPreferences = trip.wizardData || {};
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
                    businessHours: s.businessHours || null,
                    desc: s.desc || '',
                    isMergedAttraction: s.isMergedAttraction || false,
                    mergedSubSpots: s.mergedSubSpots || null,
                    mergedRadiusMeters: s.mergedRadiusMeters || null,
                    mergedMemberCoords: s.mergedMemberCoords || null,
                    lat: safePos.lat, lng: safePos.lng, nearbyToiletLocations: []
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
                businessHours: s.businessHours || scenicRecord?.businessHours || null,
                desc: (scenicRecord?.desc || s.desc || ''),
                isMergedAttraction: s.isMergedAttraction || false,
                mergedSubSpots: s.mergedSubSpots || null,
                mergedRadiusMeters: s.mergedRadiusMeters || null,
                mergedMemberCoords: s.mergedMemberCoords || null,
                lat: _pos.lat,
                lng: _pos.lng,
                nearbyToiletLocations: s.nearbyToiletLocations || []
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
                transitMode: 'public',
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

          // 載入 + enrichment 完畢，回寫補上的 placeId / businessHours / scenicCoordinates
          schedulePersistTrip();
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
    const aN = normalizeText(a.name || '');
    const bN = normalizeText(b.name || '');
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

  // 是否該歸入同一大景區（以距離為主）
  function shouldClusterStops(a, b) {
    const ca = readStopCoordinates(a);
    const cb = readStopCoordinates(b);
    if (ca && cb) {
      const d = approxDistanceMeters(ca.lat, ca.lng, cb.lat, cb.lng);
      if (d <= SUB_SPOT_MERGE_RADIUS_M) return true;            // 距離為主：1.2km 內即同區
      if (d <= SUB_SPOT_NAME_MERGE_RADIUS_M && isSameAttractionFamily(a, b)) return true; // 同名再放寬
      return false;
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
      const score = names.reduce((acc, other) => acc + (normalizeText(other).includes(cn) ? 1 : 0), 0);
      if (score > bestScore || (score === bestScore && (best === '' || cand.length < best.length))) {
        best = cand; bestScore = score;
      }
    }
    return best || names[0] || '景點';
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
    const mergedStay = Math.min(90, (maxStay || 30) + 30 * (members.length - 1));
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
  const BIG_AREA_KEYWORDS = ['台', '潭', '步道', '大道', '園區', '國家風景區', '瀑布', '山', '岬', '灣', '古道', '部落', '濕地', '牧場'];
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
        ? `https://aiplatform.googleapis.com/v1beta1/projects/${encodeURIComponent(vertex.projectId)}/locations/global/publishers/google/models/${imageModel}:generateContent?key=${encodeURIComponent(vertex.apiKey)}`
        : `${GEMINI_API_BASE}/${imageModel}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            responseModalities: ["IMAGE"],
            imageConfig: { aspectRatio: '16:9' }
          }
        })
      });
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

  function downloadItineraryImage() {
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
    if (normalized === 'public') return google.maps.TravelMode.TRANSIT;
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
    const sourceIndex = replanStops.findIndex((item) => item.id === sourceId);
    const targetIndex = replanStops.findIndex((item) => item.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;

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
            <input class="modify-time-input" type="time" value="${selectedModifyStartTime || defaultStart}" oninput="updateModifyTimeRange('start', this.value)">
            <span class="modify-time-sep">到</span>
            <input class="modify-time-input" type="time" value="${selectedModifyEndTime || defaultEnd}" oninput="updateModifyTimeRange('end', this.value)">
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
        <div class="travellog-region-title">📍 ${region}（${spots.length} 個景點）</div>
        <div class="travellog-spots">
          ${spots.map(s => `
            <div class="travellog-spot-card">
              <span class="travellog-spot-emoji">${s.emoji || '📍'}</span>
              <div class="travellog-spot-info">
                <span class="travellog-spot-name">${s.name}</span>
                <span class="travellog-spot-meta">${s.visitDate || ''}${s.tripTitle ? ' · ' + s.tripTitle : ''}</span>
              </div>
              <button class="travellog-remove-btn" onclick="removeVisitedPlaceByName('${s.name.replace(/'/g, '&#39;')}')">✕</button>
            </div>
          `).join('')}
        </div>
      </div>
    `).join('');
  }

  function removeVisitedPlaceByName(name) {
    const places = getVisitedPlaces().filter(p => p.name !== name);
    localStorage.setItem(VISITED_PLACES_KEY, JSON.stringify(places));
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

  async function persistCurrentTripStops() {
    if (!currentItineraryId || currentItineraryId === 'TRIP-EMPTY') return;

    const stopsSnapshot = replanStops.map((stop) => ({
      name: stop.name,
      emoji: stop.emoji || '📍',
      type: stop.type || null,
      stayMin: stop.stayMin,
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
      // 景點介紹（乾淨 prose，不含「（含 …）」）一併保存，避免存檔重載後描述消失、只剩括號
      desc: stop.desc || '',
      // 合併大景點欄位一併保存，避免切換交通工具等觸發存檔後，重新載入時「🧩 含…」子景點資訊消失
      isMergedAttraction: stop.isMergedAttraction || false,
      mergedSubSpots: stop.mergedSubSpots || null,
      mergedRadiusMeters: stop.mergedRadiusMeters || null,
      mergedMemberCoords: stop.mergedMemberCoords || null
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
        const patch = { ...myTrips[tripIndex], stops: stopsSnapshot };
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

    if (firebaseEnabled && firebaseDb) {
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
        const { __saving, ...cleanLocal } = localTrip || {};
        const fbPatch = localTrip
          ? { ...cleanLocal, stops: stopsSnapshot }
          : { id: currentItineraryId, stops: stopsSnapshot };
        // 只在拿到真實 email 時才寫，避免未登入時用空值覆蓋既有文件的正確 userEmail
        if (userEmail) fbPatch.userEmail = userEmail;
        fbPatch.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
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

  // 一次切換全程主要交通工具：所有「車輛類」路段改用新工具，保留走路與大眾交通
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
      <div class="replan-card ${activeStopMenuId === stop.id ? 'selected' : ''}" draggable="${isModifyWindowOpen && modifyTargetStopId === stop.id ? 'false' : 'true'}" data-stop-id="${stop.id}">
        <div class="replan-handle">⋮⋮</div>
        <div class="replan-time">${minutesToClock(stop.start)} - ${minutesToClock(stop.end)}</div>
        <div class="replan-spot">
          <div>
            <div class="replan-spot-name">${stop.name}</div>
            ${stop.isMergedAttraction && stop.mergedSubSpots && stop.mergedSubSpots.length ? `<div class="merged-subspots-row" style="font-size:11px;color:var(--ink3);margin:2px 0;">🧩 含 ${stop.mergedSubSpots.join('、')}</div>` : ''}
            <div class="replan-spot-meta">停留 <select class="replan-duration-select" onclick="event.stopPropagation()" ondragstart="event.stopPropagation()" onchange="event.stopPropagation(); updateStopStayTime('${stop.id}', Number(this.value))">${getSuggestedStayDurations(stop).map(m => `<option value="${m}" ${(stop.stayMin ?? stop.computedStayMin) === m ? 'selected' : ''}>${m} 分鐘</option>`).join('')}</select>${stop.transit ? ` · 後續 <select class="replan-transit-select" onclick="event.stopPropagation()" ondragstart="event.stopPropagation()" onchange="event.stopPropagation(); setSegmentTransitMode('${stop.id}', this.value)">${(() => { const cur = normalizeTransitMode(stop.transitMode); const allowed = new Set(['walk', 'public', getPreferredVehicleMode(), cur]); return TRANSIT_MODE_OPTIONS.filter(mo => allowed.has(mo.value)).map(mo => `<option value="${mo.value}" ${cur === mo.value ? 'selected' : ''}>${mo.icon} ${mo.label}</option>`).join(''); })()}</select> ${getTransitDurationText(stop.transit)}` : ''}</div>
            ${(() => { const w = getBusinessHoursWarning(stop); return w ? `<div class="replan-hours-warn">${w}</div>` : ''; })()}
          </div>
          <div class="replan-emoji">${stop.emoji}</div>
        </div>
        <div class="replan-inline-actions ${activeStopMenuId === stop.id ? 'active' : ''}">
          <button class="replan-inline-btn" onclick="event.stopPropagation(); modifyStopById('${stop.id}')">✎ 修改</button>
          <button class="replan-inline-btn delete" onclick="event.stopPropagation(); removeStopById('${stop.id}')">－ 刪除</button>
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

  function updateItineraryStageUI() {
    const plannedBlock = document.getElementById('itineraryPlannedBlock');
    const planningBlock = document.getElementById('itineraryPlanningBlock');
    const startBtn = document.getElementById('replanStartBtn');
    const applyBtn = document.getElementById('replanApplyBtn');
    const cancelBtn = document.getElementById('replanCancelBtn');

    if (plannedBlock) {
      plannedBlock.style.display = isReplanning ? 'none' : '';
    }
    if (planningBlock) {
      planningBlock.classList.toggle('active', isReplanning);
    }

    if (isReplanning) {
      renderReplanBoard();
    }

    if (startBtn) startBtn.style.display = isReplanning ? 'none' : '';
    if (applyBtn) applyBtn.style.display = isReplanning ? '' : 'none';
    if (cancelBtn) cancelBtn.style.display = isReplanning ? '' : 'none';
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
      const nodeDotStyle = isLast ? 'background: var(--accent2); box-shadow: 0 0 0 4px var(--accent2-light);' : '';
      const spotCardStyle = isLast ? 'border-color: var(--accent2);' : '';
      const tagStyle = tag.style ? `style="${tag.style}"` : '';
      const isEndpointStop = stop.type === 'start' || stop.type === 'end';
      const endpointLabel = stop.type === 'start' ? '🚩 起點' : stop.type === 'end' ? '🏁 終點' : '';

      html += `
        <div id="itinerary-stop-${stop.id}" class="timeline-item" onclick="openItineraryStop('${stop.id}')" onmouseenter="highlightPin('${stop.mapPinId || 'pin-' + (index + 1)}')" onmouseleave="unhighlightPin('${stop.mapPinId || 'pin-' + (index + 1)}')">
          <div class="time-box"><div class="time-val">${timeStr}</div></div>
          <div class="node"><div class="node-dot" ${nodeDotStyle}></div></div>
          <div class="content-box">
            <div class="spot-card" ${spotCardStyle}>
              <div class="spot-emoji-box">${stop.emoji}</div>
              <div class="spot-card-copy">
                <div class="spot-name">${stop.name}</div>
                ${stop.isMergedAttraction && stop.mergedSubSpots && stop.mergedSubSpots.length ? `<div class="merged-subspots-row" style="font-size:12px;color:var(--ink3);margin:2px 0;">🧩 含 ${stop.mergedSubSpots.join('、')}</div>` : ''}
                <div class="spot-tags">${isEndpointStop ? `<span class="tag" style="background:var(--accent2-light);color:var(--accent2-dark);">${endpointLabel}</span>` : stop.stayMin > 0 ? `<span class="tag stay-time-tag">⏱ ${stop.stayMin < 60 ? stop.stayMin + '分' : (stop.stayMin % 60 === 0 ? (stop.stayMin/60) + '小時' : Math.floor(stop.stayMin/60) + '時' + (stop.stayMin%60) + '分')}</span><button class="stay-edit-btn" onclick="event.stopPropagation(); openStayTimeAdjuster('${stop.id}')">調整</button><button class="stay-edit-btn visited-toggle-btn ${isPlaceVisited(stop.name) ? 'visited' : ''}" data-stop-id="${stop.id}" onclick="event.stopPropagation(); handleToggleVisited('${stop.id}', this)">${isPlaceVisited(stop.name) ? '✓ 已去過' : '📌 去過了'}</button>` : ''}${tag.text ? `<span class="tag" ${tagStyle}>${tag.text}</span>` : ''}</div>
                ${!isEndpointStop && stop.businessHours ? `<div class="stop-hours-row">${typeof formatDayBusinessHours === 'function' ? formatDayBusinessHours(stop.businessHours, currentTripPreferences?.departureDate) : ''}</div>` : ''}
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
        let transitText = getTransitSummaryText(transitMode, transitMin);
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
        // 下拉只提供：所選交通工具 + 走路 + 大眾交通（並保留目前值以相容舊行程）
        const allowedModes = new Set(['walk', 'public', getPreferredVehicleMode(), transitMode]);
        const segmentModeOptions = TRANSIT_MODE_OPTIONS.filter((modeOption) => allowedModes.has(modeOption.value));
        html += `<div class="transit-block">
          <div class="transit-block-main">${transitText}</div>
          <label class="transit-mode-wrap">交通工具
            <select class="transit-mode-select" onchange="setSegmentTransitMode('${stop.id}', this.value)" onclick="event.stopPropagation()">
              ${segmentModeOptions.map((modeOption) => `<option value="${modeOption.value}" ${transitMode === modeOption.value ? 'selected' : ''}>${modeOption.icon} ${modeOption.label}</option>`).join('')}
            </select>
          </label>
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

    // 手機上的視圖模式邏輯
    if (isMobileLayout()) {
      if (viewId === 'current-spot') {
        setMobileMode('current-spot');
      } else {
        setMobileMode(currentUserRole === 'driver' ? 'map' : 'functions');
      }
    }
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
    return { apiKey, projectId, ready: !!(apiKey && projectId) };
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
      if (firebase.storage && config.storageBucket) {
        firebaseStorage = firebase.storage();
      }
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

  function toggleVisitedPlace(stop) {
    const places = getVisitedPlaces();
    const norm = (stop.name || '').replace(/\s/g, '').toLowerCase();
    const idx = places.findIndex(p => (p.name || '').replace(/\s/g, '').toLowerCase() === norm);
    if (idx >= 0) {
      places.splice(idx, 1);
    } else {
      places.push({
        userId: (typeof currentUser !== 'undefined' && currentUser?.id) || null,
        name: stop.name,
        region: currentTripRegion || '',
        visitDate: new Date().toISOString().slice(0, 10),
        tripId: currentItineraryId || '',
        tripTitle: currentTripTitle || '',
        emoji: stop.emoji || '📍'
      });
    }
    localStorage.setItem(VISITED_PLACES_KEY, JSON.stringify(places));
    return idx < 0;
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
      budget ? `預算：${budget}` : null,
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
      const livePoiHint = _localHint || await fetchLiveMapsPoiHintBlock(dest, wizardData.interests || []);
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: buildAiReplanPrompt(wizardData, livePoiHint) }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.8 }
        })
      });
      if (!response.ok) throw new Error(`Vertex API 錯誤（${response.status}）`);

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
      if (preservedEndStop) replanStops.push(preservedEndStop);

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

      if (_rgOverlay) _rgOverlay.style.display = 'none';
      renderReplanBoard();
      refreshRouteDirections();
      schedulePersistTrip();

    } catch (e) {
      console.error('[replanWithAI]', e);
      if (_rgOverlay) _rgOverlay.style.display = 'none';
      cancelReplan();
      window.alert(`AI 重新規劃失敗：${e.message}\n\n請確認 API Key 正確，並再試一次。`);
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Gemini API 失敗（${response.status}）`);
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
      template: () => `
        <div class="phone-status"><span>9:41</span><span class="status-icons">◉ ◉ ◉ 100%</span></div>
        <div class="screen-header">
          <div class="screen-title">今日路線</div>
          <div class="screen-subtitle">Day 1 · 4 筆停靠點 · 可直接拖曳調整順序。</div>
        </div>
        <div class="screen-body">
          <div class="screen-card soft">
            <div class="screen-row"><div class="screen-kv"><div class="screen-kv-label">起點</div><div class="screen-kv-value" style="font-size:15px;">台東火車站</div></div><span class="screen-pill blue">08:00</span></div>
          </div>
          <div class="screen-card">
            <div class="timeline-mini">
              <div class="timeline-mini-item"><div class="timeline-mini-dot"></div><div class="timeline-mini-content"><div class="timeline-mini-title">小吃攤</div><div class="timeline-mini-sub">10:20 · 補給與短暫休息。</div></div></div>
              <div class="timeline-mini-item"><div class="timeline-mini-dot" style="background: var(--accent2);"></div><div class="timeline-mini-content"><div class="timeline-mini-title">海濱公園</div><div class="timeline-mini-sub">12:10 · 主要停留節點。</div></div></div>
              <div class="timeline-mini-item"><div class="timeline-mini-dot" style="background: var(--ink3);"></div><div class="timeline-mini-content"><div class="timeline-mini-title">夜市</div><div class="timeline-mini-sub">18:30 · 晚餐與散步。</div></div></div>
            </div>
          </div>
          <div class="screen-actions">
            <button class="screen-btn primary">開始導航</button>
            <button class="screen-btn secondary">編輯路線</button>
          </div>
        </div>
      `
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
      template: () => `
        <div class="phone-status"><span>9:41</span><span class="status-icons">◉ ◉ ◉ 100%</span></div>
        <div class="screen-header">
          <div class="screen-title">今天行程</div>
          <div class="screen-subtitle">Day 1 · 台東車站到海濱散策 · 4 個節點。</div>
        </div>
        <div class="screen-body">
          <div class="screen-card soft">
            <div class="screen-row"><div class="screen-kv"><div class="screen-kv-label">預估時間</div><div class="screen-kv-value" style="font-size:15px;">23 分鐘移動</div></div><span class="screen-pill blue">今日</span></div>
          </div>
          <div class="screen-card">
            <div class="timeline-mini">
              <div class="timeline-mini-item"><div class="timeline-mini-dot"></div><div class="timeline-mini-content"><div class="timeline-mini-title">台東車站出發</div><div class="timeline-mini-sub">14:00 · 取車 / 集合。</div></div></div>
              <div class="timeline-mini-item"><div class="timeline-mini-dot" style="background: var(--accent2);"></div><div class="timeline-mini-content"><div class="timeline-mini-title">海濱公園</div><div class="timeline-mini-sub">16:30 · 看夕陽與休息。</div></div></div>
              <div class="timeline-mini-item"><div class="timeline-mini-dot" style="background: var(--ink3);"></div><div class="timeline-mini-content"><div class="timeline-mini-title">觀光夜市</div><div class="timeline-mini-sub">18:30 · 晚餐與逛街。</div></div></div>
            </div>
          </div>
          <div class="screen-actions">
            <button class="screen-btn primary" onclick="openTravelTools('export')">分享行程</button>
            <button class="screen-btn secondary">編輯內容</button>
          </div>
        </div>
      `
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
  let currentOpenPin = null; // 紀錄目前打開資訊卡的圖釘
  let directionsService;
  let directionsRenderers = []; // 存放每個階段的 Renderer
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

  const ROUTE_MODE_COLORS = { car: '#1D4ED8', scooter: '#EA580C', walk: '#16A34A', public: '#7C3AED' };

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

  function renderMapMarkersFromCurrentLocations() {
    if (!map || !window.google || !google.maps) return;
    clearRenderedMapMarkers();

    const stopOrderByPin = {};
    replanStops.forEach((stop, index) => {
      if (stop.mapPinId) stopOrderByPin[stop.mapPinId] = index + 1;
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

      if (!isToiletMarkerId(markerId)) {
        const shouldShow = visibleAttractionPinIds === null || visibleAttractionPinIds.has(markerId);
        marker.setVisible(shouldShow);
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
      currentRouteBounds = null;
      currentRouteFocusBounds = null;
      const panel = document.getElementById('directionsPanel');
      if (panel) {
        panel.innerHTML = '';
      }
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

    const panel = document.getElementById('directionsPanel');
    if (panel) {
      panel.innerHTML = '';
      panel.style.display = isMobileLayout() ? 'none' : 'block';
    }

    const routeBounds = new google.maps.LatLngBounds();
    locations.forEach((location) => {
      routeBounds.extend(new google.maps.LatLng(Number(location.lat), Number(location.lng)));
    });
    currentRouteBounds = routeBounds;
    map.fitBounds(routeBounds);
    renderMobileRouteSheet();

    for (let i = 0; i < locations.length - 1; i++) {
      const origin = locations[i];
      const destination = locations[i + 1];
      const stageMode = routeStageCache[i] ? normalizeTransitMode(routeStageCache[i].mode) : 'walk';
      const stageMeta = getTransitModeMeta(stageMode);
      const directionRequest = buildGoogleRouteRequest(stageMode, origin, destination);

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
            const renderer = new google.maps.DirectionsRenderer({
              map: map,
              suppressMarkers: true,
              preserveViewport: true,
              routeIndex: bestRouteIndex,
              polylineOptions: {
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
              }
            });
            renderer.setDirections(response);
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
                schedulePersistTrip();
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

            renderItineraryDisplay();
            renderMobileRouteSheet();
          } else {
            console.error('Directions request failed due to ' + status);
          }
        }
      );
    }
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

    // 合併大景點：在景點介紹後補一行「（含 …）」（資料來自 mergedSubSpots，與時間軸一致；desc 本身只存乾淨 prose）
    const includedText = matchedStop ? formatIncludedSubSpots(matchedStop) : '';
    const micDescEl = document.getElementById('micDesc');
    if (micDescEl) micDescEl.innerText = includedText ? `${finalDesc}\n${includedText}` : finalDesc;

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

  async function startApp() {
    initFirebaseIfConfigured();
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
