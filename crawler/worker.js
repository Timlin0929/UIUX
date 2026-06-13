const fs = require('fs');
const path = require('path');
const vm = require('vm');
const axios = require('axios');
const admin = require('firebase-admin');
const minimist = require('minimist');

const argv = minimist(process.argv.slice(2));

function loadLocalAppConfig() {
  const configPath = process.env.WEATHER_ENV_PATH || path.resolve(__dirname, '..', 'weather.env.js');
  if (!fs.existsSync(configPath)) return {};

  try {
    const sandbox = { window: {} };
    vm.runInNewContext(fs.readFileSync(configPath, 'utf8'), sandbox, {
      filename: configPath,
      timeout: 1000
    });
    return sandbox.window.TRAVEL_APP_CONFIG || {};
  } catch (e) {
    console.warn('Unable to load weather.env.js config:', e.message);
    return {};
  }
}

const LOCAL_APP_CONFIG = loadLocalAppConfig();
const DRY = !!(argv['dry-run'] || argv.dry);
const IMPORT_MODE = !!(argv.import || argv.mode === 'import');
const EXPORT_LOCAL_MODE = !!(argv['export-local'] || argv.export || argv.mode === 'export-local');
const VERIFY_PLACES_MODE = !!(argv['verify-places'] || argv.mode === 'verify-places');
const CRAWL_FOOD_MODE = !!(argv['crawl-food'] || argv.mode === 'crawl-food');
const FORCE = !!argv.force;
const VERIFY_NEAR_METERS = parseInt(process.env.VERIFY_NEAR_METERS || '5000', 10);
const EXPORT_LOCAL_PATH = process.env.EXPORT_LOCAL_PATH || path.resolve(__dirname, '..', 'poi-data.js');
const RESTAURANT_DATA_PATH = process.env.RESTAURANT_DATA_PATH || path.resolve(__dirname, '..', 'restaurant-data.js');
const MIN_FOOD_POIS = parseInt(process.env.MIN_FOOD_POIS || '3', 10);
const FOOD_PER_DEST = parseInt(process.env.FOOD_PER_DEST || '25', 10);
const LIMIT = parseInt(argv.limit || process.env.CRAWL_LIMIT || '50', 10);
const IMPORT_LIMIT = parseInt(argv.importLimit || process.env.IMPORT_LIMIT || '500', 10);
const FETCH_LIMIT = parseInt(argv.fetchLimit || process.env.CRAWL_FETCH_LIMIT || String(LIMIT * 5), 10);
// 「免費額度用完前停止」：單次執行最多打幾次 Google API（geocode / Places searchText）。0 = 不限。
const MAX_CALLS = parseInt(argv['max-calls'] || process.env.CRAWL_MAX_CALLS || '0', 10);
// 「平均分散在一週」：把工作切成 N 份只跑第 K 份，形如 --slice 3/7（K 從 1 起算）。空 = 不切。
const SLICE_RAW = String(argv.slice || process.env.CRAWL_SLICE || '').trim();
const POI_COLLECTION = process.env.POI_COLLECTION || 'scenic_points';
const GOOGLE_KEY = process.env.GOOGLE_MAPS_API_KEY || LOCAL_APP_CONFIG.GOOGLE_MAPS_API_KEY || null;
if (GOOGLE_KEY) {
  const keySource = process.env.GOOGLE_MAPS_API_KEY ? 'env GOOGLE_MAPS_API_KEY' : 'weather.env.js GOOGLE_MAPS_API_KEY';
  console.log(`Google Maps key loaded from: ${keySource} (${GOOGLE_KEY.slice(0, 8)}...)`);
} else {
  console.warn('GOOGLE_MAPS_API_KEY 未設定，廁所搜尋將略過。');
}
const OPENDATA_URL = process.env.OPENDATA_SOURCE_URL || 'https://media.taiwan.net.tw/XMLReleaseALL_public/scenic_spot_C_f.json';
const CRAWL_REGION = argv.region || argv.city || process.env.CRAWL_REGION || process.env.CRAWL_CITY || '\u53f0\u6771\u7e23';
const MAX_NEARBY_TOILET_DISTANCE_METERS = 500;
const REGION_ALIASES = {
  '\u53f0\u6771': ['\u53f0\u6771', '\u81fa\u6771', '\u53f0\u6771\u7e23', '\u81fa\u6771\u7e23', '\u7da0\u5cf6', '\u862d\u5dbc'],
  '\u81fa\u6771': ['\u53f0\u6771', '\u81fa\u6771', '\u53f0\u6771\u7e23', '\u81fa\u6771\u7e23', '\u7da0\u5cf6', '\u862d\u5dbc'],
  '\u53f0\u6771\u7e23': ['\u53f0\u6771', '\u81fa\u6771', '\u53f0\u6771\u7e23', '\u81fa\u6771\u7e23', '\u7da0\u5cf6', '\u862d\u5dbc'],
  '\u81fa\u6771\u7e23': ['\u53f0\u6771', '\u81fa\u6771', '\u53f0\u6771\u7e23', '\u81fa\u6771\u7e23', '\u7da0\u5cf6', '\u862d\u5dbc']
};

// === 額度守門 + 一週分散切片 ===
let apiCallsUsed = 0;
function noteApiCall(n) { apiCallsUsed += (n || 1); }
function callBudgetExhausted() { return MAX_CALLS > 0 && apiCallsUsed >= MAX_CALLS; }
function parseSlice(raw) {
  const m = /^(\d+)\s*\/\s*(\d+)$/.exec(raw || '');
  if (!m) return null;
  const idx = parseInt(m[1], 10);
  const total = parseInt(m[2], 10);
  if (!(total > 0) || idx < 1 || idx > total) {
    console.warn(`--slice 格式無效（${raw}），需為 K/N 且 1 ≤ K ≤ N，本次忽略切片。`);
    return null;
  }
  return { idx: idx - 1, total }; // idx 轉為 0 起算
}
function inSlice(i, slice) { return !slice || (i % slice.total) === slice.idx; }
const WORK_SLICE = parseSlice(SLICE_RAW);
if (WORK_SLICE) console.log(`Slice 模式：只處理第 ${WORK_SLICE.idx + 1}/${WORK_SLICE.total} 份（依文件順序均分）。`);
if (MAX_CALLS > 0) console.log(`API 預算：本次最多 ${MAX_CALLS} 次 Google 呼叫，達上限即停止。`);

// 讀取既有的自動產生檔（window.<globalName> = {...}），給「部分更新」時合併用；失敗則回傳 {}。
function loadExistingGlobalFile(filePath, globalName) {
  try {
    if (!fs.existsSync(filePath)) return {};
    const sandbox = { window: {} };
    vm.runInNewContext(fs.readFileSync(filePath, 'utf8'), sandbox, { filename: filePath, timeout: 2000 });
    const obj = sandbox.window[globalName];
    return (obj && typeof obj === 'object') ? obj : {};
  } catch (e) {
    console.warn(`讀取既有 ${path.basename(filePath)} 失敗，改以全新檔案產生：`, e.message);
    return {};
  }
}

function initFirebase() {
  if (!admin.apps.length) {
    const saPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
    const saJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    let credential;
    if (saJson) {
      credential = admin.credential.cert(JSON.parse(saJson));
    } else if (saPath && fs.existsSync(saPath)) {
      credential = admin.credential.cert(require(saPath));
    } else {
      console.error('Missing Firebase service account. Set FIREBASE_SERVICE_ACCOUNT_PATH or FIREBASE_SERVICE_ACCOUNT_JSON.');
      process.exit(1);
    }
    admin.initializeApp({ credential });
  }
  return admin.firestore();
}

async function geocodeAddress(address) {
  if (!GOOGLE_KEY) return null;
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${GOOGLE_KEY}`;
    noteApiCall();
    const r = await axios.get(url, { timeout: 15000 });
    if (r.data && r.data.results && r.data.results.length) return r.data.results[0];
  } catch (e) {
    console.error('geocode error', e.message);
  }
  return null;
}

function measureDistanceMeters(origin, target) {
  if (!origin || !target) return Number.POSITIVE_INFINITY;
  const originLat = Number(origin.lat);
  const originLng = Number(origin.lng);
  const targetLat = Number(target.lat);
  const targetLng = Number(target.lng);
  if (![originLat, originLng, targetLat, targetLng].every(Number.isFinite)) {
    return Number.POSITIVE_INFINITY;
  }
  const toRadians = (degrees) => degrees * Math.PI / 180;
  const earthRadius = 6371000;
  const dLat = toRadians(targetLat - originLat);
  const dLng = toRadians(targetLng - originLng);
  const lat1 = toRadians(originLat);
  const lat2 = toRadians(targetLat);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function fetchNearbyToiletsGoogle(lat, lng) {
  if (!GOOGLE_KEY) return [];
  try {
    // 使用新版 Places API (v1)，避免 legacy nearbysearch 被拒
    noteApiCall();
    const r = await axios.post(
      'https://places.googleapis.com/v1/places:searchText',
      {
        textQuery: '公廁',
        locationBias: {
          circle: {
            center: { latitude: lat, longitude: lng },
            radius: MAX_NEARBY_TOILET_DISTANCE_METERS
          }
        },
        languageCode: 'zh-TW',
        maxResultCount: 5
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': GOOGLE_KEY,
          'X-Goog-FieldMask': 'places.displayName,places.location,places.formattedAddress,places.id'
        },
        timeout: 15000
      }
    );
    const places = Array.isArray(r.data && r.data.places) ? r.data.places : [];
    const seenIds = new Set();
    const results = [];
    for (const place of places) {
      if (!place.location) continue;
      const pos = { lat: place.location.latitude, lng: place.location.longitude };
      if (measureDistanceMeters({ lat, lng }, pos) > MAX_NEARBY_TOILET_DISTANCE_METERS) continue;
      const id = place.id || `${pos.lat}|${pos.lng}`;
      if (seenIds.has(id)) continue;
      seenIds.add(id);
      results.push({
        name: (place.displayName && place.displayName.text) || '公廁',
        lat: pos.lat,
        lng: pos.lng,
        address: place.formattedAddress || '',
        source: 'google',
        confidence: 'verified'
      });
      if (results.length >= 3) break;
    }
    return results;
  } catch (e) {
    if (e.response && e.response.status === 403) {
      console.warn('Google Places API 403：請至 Google Cloud Console 啟用「Places API (New)」，目前跳過 Google 廁所搜尋。');
    } else {
      console.warn('Google Places toilet fetch error:', e.message);
    }
    return [];
  }
}

async function fetchNearbyToilets(lat, lng) {
  if (!lat || !lng || !GOOGLE_KEY) return [];
  return fetchNearbyToiletsGoogle(lat, lng);
}

function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[()（）「」『』【】\[\],，.。·・-]/g, '');
}

// === Places 名稱嚴格比對（與前端 ai-travel-explore-final.js 同款，避免綁到同名異地）===
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
function placeNameMatchesQuery(displayName, queryName) {
  if (!displayName || !queryName) return true;
  const clean = (s) => String(s).replace(/[\s（）()[\]「」·\-_\/,.。，、！!？?～~]/g, '').toLowerCase();
  const dn = clean(displayName);
  const qn = clean(queryName);
  if (!dn || !qn) return true;
  if (dn.includes(qn) || qn.includes(dn)) return true;
  const dCore = clean(stripGenericPlaceSuffix(displayName));
  const qCore = clean(stripGenericPlaceSuffix(queryName));
  if (dCore && qCore) {
    if (dCore.includes(qCore) || qCore.includes(dCore)) return true;
    if (dCore.length >= 2 && qCore.length >= 2 && dCore.slice(0, 2) === qCore.slice(0, 2)) return true;
  }
  return false;
}

function readNested(source, paths) {
  for (const pathSpec of paths) {
    const value = pathSpec.split('.').reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), source);
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return '';
}

function textMatchesRegion(value, region) {
  const normalizedValue = normalizeText(value);
  const normalizedRegion = normalizeText(region);
  if (!normalizedRegion) return true;
  if (!normalizedValue) return false;
  const aliases = REGION_ALIASES[region] || REGION_ALIASES[normalizedRegion] || [region];
  return aliases.some((alias) => {
    const normalizedAlias = normalizeText(alias);
    return normalizedValue.includes(normalizedAlias) || normalizedAlias.includes(normalizedValue);
  });
}

function toNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function normalizeOpenDataSpot(raw) {
  const name = readNested(raw, ['AttractionName', 'Name', 'name']);
  const lat = toNumber(readNested(raw, ['PositionLat', 'Position.PositionLat', 'Py', 'Latitude', 'lat']));
  const lng = toNumber(readNested(raw, ['PositionLon', 'Position.PositionLon', 'Px', 'Longitude', 'lng']));
  if (!name || lat === null || lng === null) return null;

  const city = readNested(raw, ['PostalAddress.City', 'PostalAddress_City', 'Region', 'City']);
  const town = readNested(raw, ['PostalAddress.Town', 'PostalAddress_Town', 'Town']);
  const address = readNested(raw, ['PostalAddress.Address', 'PostalAddress', 'Add', 'Address']);

  return {
    id: readNested(raw, ['AttractionID', 'Id', 'ID']),
    name,
    normalizedName: normalizeText(name),
    lat,
    lng,
    city,
    town,
    address,
    description: readNested(raw, ['Description', 'Toldescribe', 'DescriptionDetail', 'Remarks']),
    openTime: readNested(raw, ['OpenTime', 'Opentime']),
    phone: readNested(raw, ['Phone', 'Tel']),
    website: readNested(raw, ['WebsiteUrl', 'Website']),
    updateTime: readNested(raw, ['UpdateTime'])
  };
}

function extractOpenDataRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.XML_Head?.Infos?.Info)) return payload.XML_Head.Infos.Info;
  if (Array.isArray(payload?.Infos?.Info)) return payload.Infos.Info;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.items)) return payload.items;
  return [];
}

async function fetchOfficialScenicSpots() {
  try {
    const response = await axios.get(OPENDATA_URL, { timeout: 30000 });
    const rows = extractOpenDataRows(response.data);
    const spots = rows.map(normalizeOpenDataSpot).filter(Boolean);
    console.log('Loaded official OpenData scenic spots', spots.length);
    return spots;
  } catch (e) {
    console.error('official opendata fetch error', e.message);
    return [];
  }
}

function findOfficialSpot(name, region, spots) {
  const normalizedName = normalizeText(name);
  const normalizedRegion = normalizeText(region);
  if (!normalizedName || !spots.length) return null;

  const exact = spots.find((spot) => spot.normalizedName === normalizedName);
  if (exact) return { spot: exact, score: 100, reason: 'exact_name' };

  const candidates = spots
    .map((spot) => {
      const regionText = normalizeText([spot.city, spot.town, spot.address].filter(Boolean).join(''));
      let score = 0;
      if (spot.normalizedName.includes(normalizedName) || normalizedName.includes(spot.normalizedName)) score += 75;
      if (normalizedRegion && regionText.includes(normalizedRegion)) score += 20;
      return { spot, score };
    })
    .filter((candidate) => candidate.score >= 75)
    .sort((a, b) => b.score - a.score);

  if (!candidates.length) return null;
  return { ...candidates[0], reason: candidates[0].score >= 95 ? 'name_region' : 'partial_name' };
}

function spotMatchesRegion(spot, region) {
  if (!region) return true;
  const regionText = [spot.city, spot.town, spot.address].filter(Boolean).join('');
  return textMatchesRegion(regionText, region);
}

function docMatchesRegion(data, region) {
  if (!region) return true;
  const regionText = [
    data.region,
    data.city,
    data.county,
    data.destination,
    data.formatted_address,
    data.address,
    data.name,
    data.tripTitle,
    data.id
  ].filter(Boolean).join('');
  return textMatchesRegion(regionText, region);
}

function applyLocationUpdate(update, lat, lng, address) {
  update['scenicCoordinates.lat'] = lat;
  update['scenicCoordinates.lng'] = lng;
  update.lat = lat;
  update.lng = lng;
  if (address) update.formatted_address = address;
}

function normalizeDocKey(text) {
  return String(text || '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

function makeDocId(spot) {
  const name = String(spot.name || '').trim();
  const region = String(spot.town || spot.city || CRAWL_REGION || '').trim();

  if (!name) {
    // Fallback: generate from coordinates
    if (spot.lat && spot.lng) {
      return `spot_${spot.lat.toFixed(4)}_${spot.lng.toFixed(4)}`;
    }
    return null;
  }

  // Strip trailing region from name (matches buildScenicPointKey in ai-travel-planner-v8.html)
  let baseName = name;
  if (region && baseName.endsWith(region) && baseName.length > region.length) {
    baseName = baseName.slice(0, -region.length).trim();
  }

  const key = normalizeDocKey(baseName + region);
  if (key) return key;

  // Fallback: coordinates
  if (spot.lat && spot.lng) {
    return `spot_${spot.lat.toFixed(4)}_${spot.lng.toFixed(4)}`;
  }

  return null;
}

async function buildImportedScenicPoint(spot) {
  const region = spot.town || spot.city || CRAWL_REGION;
  const docId = makeDocId(spot);
  
  if (!docId) {
    console.warn('Unable to generate docId for spot:', {
      name: spot.name,
      city: spot.city,
      town: spot.town,
      id: spot.id,
      lat: spot.lat,
      lng: spot.lng,
      address: spot.address
    });
    return null;
  }
  
  // Fetch nearby toilets
  let nearbyToiletLocations = [];
  if (GOOGLE_KEY && spot.lat && spot.lng) {
    nearbyToiletLocations = await fetchNearbyToilets(spot.lat, spot.lng);
    if (nearbyToiletLocations.length > 0) {
      console.log(`Found ${nearbyToiletLocations.length} nearby toilets for ${spot.name}`);
    }
    // Add delay to avoid rate limiting
    await new Promise((r) => setTimeout(r, 250));
  }
  
  const data = {
    id: docId,
    name: spot.name,
    desc: spot.description || '',
    notice: '',
    region,
    city: spot.city || '\u53f0\u6771\u7e23',
    county: spot.city || '\u53f0\u6771\u7e23',
    scenicCoordinates: {
      lat: spot.lat,
      lng: spot.lng
    },
    lat: spot.lat,
    lng: spot.lng,
    formatted_address: spot.address || [spot.city, spot.town].filter(Boolean).join(''),
    tripTitle: `${region} 1\u5929\u5fae\u65c5\u884c`,
    source: 'official_opendata',
    crawl_source: 'official_opendata',
    crawl_confidence: 100,
    official_opendata_id: spot.id || null,
    official_opendata_name: spot.name,
    official_opendata_match: 'import',
    nearbyToiletLocations: nearbyToiletLocations,
    toiletCoordinatesVerifiedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    last_crawled: admin.firestore.FieldValue.serverTimestamp(),
    needsCrawl: false
  };

  if (spot.openTime) data.openTime = spot.openTime;
  if (spot.phone) data.phone = spot.phone;
  if (spot.website) data.website = spot.website;
  if (spot.updateTime) data.official_opendata_updated_at = spot.updateTime;

  return { docId, data };
}

function scoreMatch(name, geocodeResult, regionCenter) {
  if (!geocodeResult) return 0;
  const formatted = (geocodeResult.formatted_address || '').toLowerCase();
  const nameLower = (name || '').toLowerCase();
  let score = 50;
  if (formatted.includes(nameLower)) score += 40;
  if (geocodeResult.types && geocodeResult.types.includes('establishment')) score += 10;
  if (regionCenter && geocodeResult.geometry) {
    const lat = geocodeResult.geometry.location.lat;
    const lng = geocodeResult.geometry.location.lng;
    const R = 6371000;
    const toRad = (d) => (d * Math.PI) / 180;
    const dlat = toRad(lat - regionCenter.lat);
    const dlng = toRad(lng - regionCenter.lng);
    const a = Math.sin(dlat / 2) * Math.sin(dlat / 2) + Math.cos(toRad(lat)) * Math.cos(toRad(regionCenter.lat)) * Math.sin(dlng / 2) * Math.sin(dlng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const dist = R * c;
    if (dist < 2000) score += 10;
    else if (dist < 10000) score += 5;
    if (dist > 50000) score -= 30;
  }
  return Math.max(0, score);
}

async function processBatch(db) {
  console.log('Using Firestore collection', POI_COLLECTION);
  const allOfficialSpots = await fetchOfficialScenicSpots();
  const officialSpots = CRAWL_REGION ? allOfficialSpots.filter((spot) => spotMatchesRegion(spot, CRAWL_REGION)) : allOfficialSpots;
  if (CRAWL_REGION) {
    console.log('Region filter enabled', CRAWL_REGION, 'official spots', officialSpots.length);
  }
  const q = db.collection(POI_COLLECTION).where('needsCrawl', '==', true).limit(CRAWL_REGION ? FETCH_LIMIT : LIMIT);
  const snap = await q.get();
  if (snap.empty) {
    console.log(`No docs needing crawl (set needsCrawl=true on ${POI_COLLECTION} docs).`);
    return;
  }
  let processed = 0;
  let skippedByRegion = 0;
  let eligibleIdx = -1;
  let slicedCount = 0;
  for (const doc of snap.docs) {
    const data = doc.data();
    if (!docMatchesRegion(data, CRAWL_REGION)) {
      skippedByRegion += 1;
      console.log('Skipping', doc.id, 'outside region filter', CRAWL_REGION);
      continue;
    }
    eligibleIdx += 1; // 分片 / 預算守門（geocode 補齊也算 Google 呼叫）
    if (!inSlice(eligibleIdx, WORK_SLICE)) { slicedCount += 1; continue; }
    if (callBudgetExhausted()) { console.log(`已達 API 預算（${MAX_CALLS} 次），提前停止補齊（未處理者下次續跑）。`); break; }
    const name = data.name || doc.id;
    const region = data.region || data.city || '';
    const regionCenter = data.destination_center || data.region_center || null;
    const addressHint = [name, region].filter(Boolean).join(', ');
    console.log('Processing', doc.id, name);
    const officialMatch = findOfficialSpot(name, region, officialSpots);
    let geocode = null;
    if (!officialMatch && GOOGLE_KEY) {
      geocode = await geocodeAddress(addressHint);
      await new Promise((r) => setTimeout(r, 250));
    }
    const score = officialMatch ? officialMatch.score : scoreMatch(name, geocode, regionCenter);
    const update = {
      last_crawled: admin.firestore.FieldValue.serverTimestamp(),
      crawl_source: officialMatch ? 'official_opendata' : (geocode ? 'google_geocode' : 'none'),
      crawl_confidence: score
    };
    let lat = null;
    let lng = null;
    if (officialMatch) {
      applyLocationUpdate(
        update,
        officialMatch.spot.lat,
        officialMatch.spot.lng,
        officialMatch.spot.address || [officialMatch.spot.city, officialMatch.spot.town].filter(Boolean).join('')
      );
      lat = officialMatch.spot.lat;
      lng = officialMatch.spot.lng;
      update.official_opendata_id = officialMatch.spot.id || null;
      update.official_opendata_name = officialMatch.spot.name;
      update.official_opendata_match = officialMatch.reason;
      if (officialMatch.spot.updateTime) update.official_opendata_updated_at = officialMatch.spot.updateTime;
    } else if (geocode && geocode.geometry && geocode.geometry.location) {
      applyLocationUpdate(update, geocode.geometry.location.lat, geocode.geometry.location.lng, geocode.formatted_address);
      lat = geocode.geometry.location.lat;
      lng = geocode.geometry.location.lng;
    }
    
    // Fetch nearby toilets if we have coordinates
    if (lat && lng && GOOGLE_KEY) {
      const nearbyToilets = await fetchNearbyToilets(lat, lng);
      update.nearbyToiletLocations = nearbyToilets;
      update.toiletCoordinatesVerifiedAt = admin.firestore.FieldValue.serverTimestamp();
      if (nearbyToilets.length > 0) {
        console.log(`Added ${nearbyToilets.length} nearby toilets for ${doc.id}`);
      } else {
        console.log(`Cleared nearby toilets for ${doc.id}; no verified toilets within ${MAX_NEARBY_TOILET_DISTANCE_METERS}m`);
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    
    if (DRY) {
      console.log('DRY update for', doc.id, update);
    } else {
      await doc.ref.set(update, { merge: true });
      console.log('Wrote', doc.id, 'score', score);
    }
    processed += 1;
    if (processed >= LIMIT) break;
  }
  if (CRAWL_REGION) {
    console.log('Region filter summary', { region: CRAWL_REGION, processed, skippedByRegion, sliced: slicedCount, apiCalls: apiCallsUsed, slice: SLICE_RAW || 'all', maxCalls: MAX_CALLS || 'none' });
  }
}

async function processImport(db) {
  console.log('Using Firestore collection', POI_COLLECTION);
  console.log('Import mode enabled for region', CRAWL_REGION);

  const allOfficialSpots = await fetchOfficialScenicSpots();
  const spots = allOfficialSpots
    .filter((spot) => spotMatchesRegion(spot, CRAWL_REGION))
    .slice(0, IMPORT_LIMIT);

  if (!spots.length) {
    console.log('No official OpenData spots matched import region', CRAWL_REGION);
    return;
  }

  let imported = 0;
  let skipped = 0;
  for (const spot of spots) {
    const result = await buildImportedScenicPoint(spot);
    if (!result || !result.docId) {
      console.log('Skipping spot without valid document id', spot.name);
      skipped += 1;
      continue;
    }

    const { docId, data } = result;
    if (DRY) {
      console.log('DRY import for', docId, data);
    } else {
      await db.collection(POI_COLLECTION).doc(docId).set(data, { merge: true });
      console.log('Imported', docId);
    }
    imported += 1;
  }

  console.log('Import summary', { region: CRAWL_REGION, imported, skipped, dryRun: DRY });
}

// 由景點的行政區資訊推導前端 explore wizard 使用的「目的地鍵」（dest token）
// 例：綠島鄉→「綠島」、蘭嶼鄉→「蘭嶼」、台東市/台東縣→「台東」。
function deriveDestKey(data) {
  // 統一「臺」→「台」：OpenData 多用「臺東縣」，但前端 dest 用「台東」，不統一會分裂成兩桶且比對不到。
  const tw = (s) => String(s || '').replace(/臺/g, '台');
  const text = [data.region, data.city, data.county, data.town, data.formatted_address, data.address, data.name]
    .filter(Boolean).map(tw).join(' ');
  const islandRules = [
    { key: '綠島', kw: ['綠島'] },
    { key: '蘭嶼', kw: ['蘭嶼'] },
    { key: '小琉球', kw: ['小琉球', '琉球鄉'] }
  ];
  for (const rule of islandRules) {
    if (rule.kw.some((k) => text.includes(k))) return rule.key;
  }
  // 一般本島：取 city/county 去掉「縣/市」後綴當鍵；缺值則用 CRAWL_REGION。
  const base = tw(String(data.city || data.county || data.region || CRAWL_REGION || '').trim());
  return base.replace(/[縣市]$/u, '').trim() || base;
}

// 從描述文字解析「建議停留時間」（分鐘）。與前端 ai-travel-explore-final.js 的同名函式保持一致。
function parseDurationFromText(text) {
  if (!text || typeof text !== 'string') return null;
  const durations = [];
  for (const m of text.matchAll(/(\d+(?:\.\d+)?)\s*[個个]?小時/g)) {
    const h = parseFloat(m[1]);
    if (h >= 0.25 && h <= 8) durations.push(Math.round(h * 60));
  }
  for (const m of text.matchAll(/(\d+)\s*分[鐘钟]?/g)) {
    const min = parseInt(m[1]);
    if (min >= 10 && min <= 480) durations.push(min);
  }
  for (const m of text.matchAll(/(\d+(?:\.\d+)?)\s*h(?:ours?|rs?)\b/gi)) {
    const h = parseFloat(m[1]);
    if (h >= 0.25 && h <= 8) durations.push(Math.round(h * 60));
  }
  for (const m of text.matchAll(/(\d+)\s*min(?:utes?)?\b/gi)) {
    const min = parseInt(m[1]);
    if (min >= 10 && min <= 480) durations.push(min);
  }
  if (!durations.length) return null;
  durations.sort((a, b) => a - b);
  return durations[Math.floor(durations.length / 2)];
}

// 依景點類型估「建議停留時間」（分鐘）。關鍵字比對 name+desc，回傳穩定預設值（語感對齊前端 prompt 的示例）。
const DURATION_KEYWORD_TABLE = [
  { min: 90, kw: ['溫泉', '泡湯'] },
  { min: 75, kw: ['樂園', '遊樂', '農場', '牧場'] },
  { min: 65, kw: ['博物館', '美術館', '文物館', '故事館', '展覽', '園區'] },
  { min: 55, kw: ['步道', '登山', '健行', '森林', '瀑布'] },
  { min: 50, kw: ['老街', '商圈', '夜市'] },
  { min: 45, kw: ['市場', '漁港', '碼頭'] },
  { min: 40, kw: ['公園', '廣場', '部落', '社區'] },
  { min: 35, kw: ['海灘', '沙灘', '海濱', '海岸', '潭', '湖'] },
  { min: 30, kw: ['觀景', '景觀台', '眺望', '燈塔', '橋'] },
  { min: 25, kw: ['廟', '寺', '宮', '教堂', '神社'] }
];
const DURATION_DEFAULT_MINUTES = 60;

// 用免費來源推估 duration：既有值 → 描述解析 → 關鍵字分類 → 全域預設。完全不打 Places API。
function estimateDuration(data) {
  const explicit = Number(data && data.duration);
  if (Number.isFinite(explicit) && explicit > 0) return Math.round(explicit);
  const fromText = parseDurationFromText(data && (data.desc || data.description));
  if (fromText) return fromText;
  const hay = `${(data && data.name) || ''} ${(data && (data.desc || data.description)) || ''}`;
  for (const row of DURATION_KEYWORD_TABLE) {
    if (row.kw.some((k) => hay.includes(k))) return row.min;
  }
  return DURATION_DEFAULT_MINUTES;
}

// 把一筆 scenic_points 文件映射成前端要的精簡 POI（只保留變動不大的穩定欄位）
function toLocalPoi(data) {
  const coord = data.scenicCoordinates || {};
  const lat = toNumber(coord.lat != null ? coord.lat : data.lat);
  const lng = toNumber(coord.lng != null ? coord.lng : data.lng);
  if (!data.name || lat === null || lng === null) return null;
  const poi = {
    name: String(data.name).trim(),
    lat,
    lng,
    desc: data.desc || data.description || '',
    address: data.formatted_address || data.address || '',
    businessHours: data.placeOpeningHours || data.openTime || data.businessHours || ''
  };
  if (Number.isFinite(Number(data.placesRating)) && Number(data.placesRating) > 0) poi.rating = Number(data.placesRating);
  if (data.placeVerified === true) poi.placeVerified = true; // 供前端 verify 短路：命中即可跳過 Places 呼叫
  poi.duration = estimateDuration(data);
  if (Array.isArray(data.nearbyToiletLocations) && data.nearbyToiletLocations.length) {
    poi.nearbyToiletLocations = data.nearbyToiletLocations;
  }
  return poi;
}

// 對單一景點用 Places (New) searchText 嚴格比對名稱，回傳校正資料或 null。
// FieldMask 只取座標/營業時間/評分/id/狀態（Enterprise 等級，不含 reviews 的 Atmosphere 高價 SKU），且名稱不更動。
async function fetchPlaceVerification(name, region, center) {
  if (!GOOGLE_KEY || !name) return null;
  const body = {
    textQuery: `${name} ${region || ''}`.trim(),
    languageCode: 'zh-TW',
    maxResultCount: 5
  };
  const hasCenter = center && Number.isFinite(center.lat) && Number.isFinite(center.lng);
  if (hasCenter) {
    body.locationBias = { circle: { center: { latitude: center.lat, longitude: center.lng }, radius: 30000 } };
  }
  try {
    noteApiCall();
    const r = await axios.post(
      'https://places.googleapis.com/v1/places:searchText',
      body,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': GOOGLE_KEY,
          'X-Goog-FieldMask': 'places.displayName,places.location,places.regularOpeningHours,places.rating,places.id,places.businessStatus'
        },
        timeout: 15000
      }
    );
    const places = Array.isArray(r.data && r.data.places) ? r.data.places : [];
    for (const p of places) {
      if (!p.location) continue;
      const dn = p.displayName && p.displayName.text;
      // 嚴格名稱比對 → 擋掉只共用通用後綴的別處地點
      if (!placeNameMatchesQuery(dn, name)) continue;
      const pos = { lat: p.location.latitude, lng: p.location.longitude };
      // 有 OpenData 座標時，要求 Places 結果落在附近（VERIFY_NEAR_METERS）→ 擋掉同名異地（如本島也有「南寮漁港」）
      if (hasCenter && measureDistanceMeters(center, pos) > VERIFY_NEAR_METERS) continue;
      const hours = (p.regularOpeningHours && Array.isArray(p.regularOpeningHours.weekdayDescriptions))
        ? p.regularOpeningHours.weekdayDescriptions.join('\n') : '';
      return {
        lat: pos.lat,
        lng: pos.lng,
        businessHours: hours,
        rating: (typeof p.rating === 'number') ? p.rating : null,
        placeId: p.id || null,
        businessStatus: p.businessStatus || null,
        matchedName: dn || null
      };
    }
    return null;
  } catch (e) {
    if (e.response && e.response.status === 403) {
      console.warn('Places API 403：請至 GCP Console 啟用「Places API (New)」。');
    } else {
      console.warn(`Places verify error (${name}):`, e.message);
    }
    return null;
  }
}

// 一次性：用 Places 校正 scenic_points 的座標/營業時間/評分（名稱保留 OpenData 原值），寫回 Firestore。
// 之後重跑 export:local 即可讓 poi-data.js 達 Places 等級，執行階段仍 0 Places 費用。
async function verifyPlaces(db) {
  if (!GOOGLE_KEY) { console.error('需要 GOOGLE_MAPS_API_KEY 才能用 Places 校正。'); return; }
  console.log(`Verify-places mode: reading collection ${POI_COLLECTION}（force=${FORCE}, near=${VERIFY_NEAR_METERS}m）`);
  const snap = await db.collection(POI_COLLECTION).get();
  if (snap.empty) { console.log(`No documents in ${POI_COLLECTION}.`); return; }
  let scanned = 0, verified = 0, unmatched = 0, skipped = 0, closed = 0, sliced = 0, eligibleIdx = -1;
  for (const doc of snap.docs) {
    const data = doc.data();
    if (CRAWL_REGION && !docMatchesRegion(data, CRAWL_REGION)) continue;
    if (!FORCE && data.placeVerified === true) { skipped += 1; continue; }
    eligibleIdx += 1; // 只對「真正待校正」的文件分片，讓一週各天工作量平均
    if (!inSlice(eligibleIdx, WORK_SLICE)) { sliced += 1; continue; }
    if (callBudgetExhausted()) { console.log(`已達 API 預算（${MAX_CALLS} 次），提前停止 verify-places（未處理者下次續跑）。`); break; }
    if (argv.limit !== undefined && scanned >= LIMIT) break; // --limit N 時只處理前 N 筆（省 Places 額度，便於試跑）
    scanned += 1;
    const coord = data.scenicCoordinates || {};
    const center = {
      lat: toNumber(coord.lat != null ? coord.lat : data.lat),
      lng: toNumber(coord.lng != null ? coord.lng : data.lng)
    };
    const region = String(data.county || data.city || data.region || CRAWL_REGION || '').replace(/臺/g, '台').trim();
    const res = await fetchPlaceVerification(data.name, region, center);
    await new Promise((r) => setTimeout(r, 250)); // 避免觸發速率限制
    if (!res) {
      unmatched += 1;
      console.log(`✗ 無嚴格配對，保留 OpenData：${data.name}`);
      if (!DRY) await doc.ref.set({ placeVerified: false, placeVerifiedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      continue;
    }
    const isClosed = res.businessStatus === 'CLOSED_PERMANENTLY';
    if (isClosed) closed += 1;
    verified += 1;
    const moved = (Number.isFinite(center.lat) && Number.isFinite(center.lng))
      ? Math.round(measureDistanceMeters(center, { lat: res.lat, lng: res.lng })) : null;
    console.log(`✓ ${data.name}｜座標位移 ${moved != null ? moved + 'm' : 'n/a'}｜評分 ${res.rating != null ? res.rating : '—'}${isClosed ? '｜⚠ 已永久歇業' : ''}`);
    if (DRY) continue;
    const update = {
      scenicCoordinates: { lat: res.lat, lng: res.lng },
      lat: res.lat,
      lng: res.lng,
      coordinateSource: 'google_places',
      placeVerified: true,
      placeVerifiedAt: admin.firestore.FieldValue.serverTimestamp(),
      place_id: res.placeId,
      placesRating: res.rating,
      placeBusinessStatus: res.businessStatus,
      placePermanentlyClosed: isClosed
    };
    if (res.businessHours) update.placeOpeningHours = res.businessHours;
    // 首次校正時保留原始 OpenData 座標供追溯
    if (data.opendataCoordinates === undefined && Number.isFinite(center.lat) && Number.isFinite(center.lng)) {
      update.opendataCoordinates = { lat: center.lat, lng: center.lng };
    }
    await doc.ref.set(update, { merge: true });
  }
  console.log('Verify-places summary', { region: CRAWL_REGION, scanned, verified, unmatched, closed, skipped, sliced, apiCalls: apiCallsUsed, slice: SLICE_RAW || 'all', maxCalls: MAX_CALLS || 'none', dryRun: DRY });
}

async function exportLocal(db) {
  console.log('Export-local mode: reading collection', POI_COLLECTION);
  const snap = await db.collection(POI_COLLECTION).get();
  if (snap.empty) {
    console.log(`No documents in ${POI_COLLECTION}; nothing to export.`);
    return;
  }
  const buckets = {};
  const seenPerKey = {};
  let total = 0;
  for (const doc of snap.docs) {
    const data = doc.data();
    if (CRAWL_REGION && !docMatchesRegion(data, CRAWL_REGION)) continue;
    if (data.placePermanentlyClosed === true) continue; // 跳過 Places 標記已永久歇業者
    const poi = toLocalPoi(data);
    if (!poi) continue;
    const destKey = deriveDestKey(data);
    if (!destKey) continue;
    if (!buckets[destKey]) { buckets[destKey] = []; seenPerKey[destKey] = new Set(); }
    const dedupeKey = normalizeText(poi.name);
    if (seenPerKey[destKey].has(dedupeKey)) continue;
    seenPerKey[destKey].add(dedupeKey);
    buckets[destKey].push(poi);
    total += 1;
  }

  const summary = Object.keys(buckets).map((k) => `${k}:${buckets[k].length}`).join(', ');
  console.log(`Export-local prepared ${total} POIs across keys → ${summary || '(none)'}`);

  const payload = Object.assign({ __generatedAt: new Date().toISOString() }, buckets);
  const fileBody = `// Auto-generated by crawler (npm run export:local). Do not edit by hand.\n`
    + `window.WAI_POI_DATA = ${JSON.stringify(payload, null, 2)};\n`;

  if (DRY) {
    console.log('DRY export-local; would write', EXPORT_LOCAL_PATH);
    console.log(fileBody.slice(0, 800) + (fileBody.length > 800 ? '\n... (truncated)' : ''));
    return;
  }
  fs.writeFileSync(EXPORT_LOCAL_PATH, fileBody, 'utf8');
  console.log('Export-local wrote', EXPORT_LOCAL_PATH);
}

// 對單一目的地（以形心 center 為中心）用 Places searchText 抓餐廳候選。
// 名稱/座標/時間/評分皆 Places 來源；不含 reviews 高價 SKU。
async function fetchRestaurantsNear(region, center) {
  if (!GOOGLE_KEY) return [];
  const terms = ['餐廳', '美食', '小吃'];
  const seen = new Set();
  const out = [];
  for (const term of terms) {
    const body = {
      textQuery: `${region || ''} ${term}`.trim(),
      languageCode: 'zh-TW',
      maxResultCount: 10
    };
    if (center && Number.isFinite(center.lat) && Number.isFinite(center.lng)) {
      body.locationBias = { circle: { center: { latitude: center.lat, longitude: center.lng }, radius: 20000 } };
    }
    try {
      noteApiCall();
      const r = await axios.post(
        'https://places.googleapis.com/v1/places:searchText',
        body,
        {
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': GOOGLE_KEY,
            'X-Goog-FieldMask': 'places.displayName,places.location,places.regularOpeningHours,places.rating,places.formattedAddress,places.id,places.businessStatus'
          },
          timeout: 15000
        }
      );
      const places = Array.isArray(r.data && r.data.places) ? r.data.places : [];
      for (const p of places) {
        if (!p.location) continue;
        if (p.businessStatus === 'CLOSED_PERMANENTLY') continue;
        const name = (p.displayName && p.displayName.text) || '';
        if (!name) continue;
        const dedupe = normalizeText(name);
        if (seen.has(dedupe)) continue;
        seen.add(dedupe);
        const hours = (p.regularOpeningHours && Array.isArray(p.regularOpeningHours.weekdayDescriptions))
          ? p.regularOpeningHours.weekdayDescriptions.join('\n') : '';
        const poi = {
          name,
          lat: p.location.latitude,
          lng: p.location.longitude,
          businessHours: hours,
          address: p.formattedAddress || ''
        };
        if (typeof p.rating === 'number') poi.rating = p.rating;
        out.push(poi);
        if (out.length >= FOOD_PER_DEST) break;
      }
    } catch (e) {
      if (e.response && e.response.status === 403) {
        console.warn('Places API 403：請至 GCP Console 啟用「Places API (New)」。');
      } else {
        console.warn(`Restaurant fetch error (${region}/${term}):`, e.message);
      }
    }
    await new Promise((r) => setTimeout(r, 250)); // 限速
    if (out.length >= FOOD_PER_DEST) break;
  }
  return out;
}

// 產生獨立的餐廳快取 restaurant-data.js：依 scenic_points 分桶算形心，逐桶抓餐廳。
async function crawlFood(db) {
  if (!GOOGLE_KEY) { console.error('需要 GOOGLE_MAPS_API_KEY 才能爬餐廳。'); return; }
  console.log('Crawl-food mode: reading collection', POI_COLLECTION);
  const snap = await db.collection(POI_COLLECTION).get();
  if (snap.empty) { console.log(`No documents in ${POI_COLLECTION}; nothing to crawl.`); return; }

  // 依 deriveDestKey 分桶，累積座標以算形心
  const agg = {};
  for (const doc of snap.docs) {
    const data = doc.data();
    if (CRAWL_REGION && !docMatchesRegion(data, CRAWL_REGION)) continue;
    const coord = data.scenicCoordinates || {};
    const lat = toNumber(coord.lat != null ? coord.lat : data.lat);
    const lng = toNumber(coord.lng != null ? coord.lng : data.lng);
    if (lat === null || lng === null) continue;
    const key = deriveDestKey(data);
    if (!key) continue;
    if (!agg[key]) agg[key] = { sumLat: 0, sumLng: 0, count: 0 };
    agg[key].sumLat += lat; agg[key].sumLng += lng; agg[key].count += 1;
  }

  const targets = Object.keys(agg).filter((k) => agg[k].count >= MIN_FOOD_POIS);
  console.log(`Crawl-food targets（POI ≥ ${MIN_FOOD_POIS}）：${targets.map((k) => `${k}(${agg[k].count})`).join(', ') || '(none)'}`);

  // 切片或預算模式為「部分更新」：先載入既有檔，只覆寫本次處理到的目的地，避免清掉其他天已爬的資料。
  const partial = !!(WORK_SLICE || MAX_CALLS > 0);
  const buckets = {};
  if (partial) {
    const existing = loadExistingGlobalFile(RESTAURANT_DATA_PATH, 'WAI_RESTAURANT_DATA');
    Object.keys(existing).forEach((k) => { if (k !== '__generatedAt') buckets[k] = existing[k]; });
  }
  let processedTargets = 0, slicedTargets = 0;
  for (let i = 0; i < targets.length; i++) {
    const key = targets[i];
    if (!inSlice(i, WORK_SLICE)) { slicedTargets += 1; continue; }
    if (callBudgetExhausted()) { console.log(`已達 API 預算（${MAX_CALLS} 次），提前停止 crawl-food（其餘目的地保留既有資料）。`); break; }
    const center = { lat: agg[key].sumLat / agg[key].count, lng: agg[key].sumLng / agg[key].count };
    const restaurants = await fetchRestaurantsNear(key, center);
    buckets[key] = restaurants;
    processedTargets += 1;
    console.log(`🍽 ${key}：${restaurants.length} 間餐廳`);
  }
  if (partial) console.log(`Crawl-food 部分更新：本次更新 ${processedTargets} 個目的地，略過 ${slicedTargets} 個（切片），API 呼叫 ${apiCallsUsed} 次。`);

  const total = Object.keys(buckets).reduce((n, k) => n + buckets[k].length, 0);
  const payload = Object.assign({ __generatedAt: new Date().toISOString() }, buckets);
  const fileBody = `// Auto-generated by crawler (npm run crawl:food). Do not edit by hand.\n`
    + `window.WAI_RESTAURANT_DATA = ${JSON.stringify(payload, null, 2)};\n`;

  if (DRY) {
    console.log(`DRY crawl-food; would write ${RESTAURANT_DATA_PATH}（${total} 間）`);
    console.log(fileBody.slice(0, 800) + (fileBody.length > 800 ? '\n... (truncated)' : ''));
    return;
  }
  fs.writeFileSync(RESTAURANT_DATA_PATH, fileBody, 'utf8');
  console.log(`Crawl-food wrote ${RESTAURANT_DATA_PATH}（${total} 間餐廳，跨 ${targets.length} 個目的地）`);
}

async function main() {
  const db = initFirebase();
  if (CRAWL_FOOD_MODE) {
    await crawlFood(db);
  } else if (VERIFY_PLACES_MODE) {
    await verifyPlaces(db);
  } else if (EXPORT_LOCAL_MODE) {
    await exportLocal(db);
  } else if (IMPORT_MODE) {
    await processImport(db);
  } else {
    await processBatch(db);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
