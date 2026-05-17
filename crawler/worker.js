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
const LIMIT = parseInt(argv.limit || process.env.CRAWL_LIMIT || '50', 10);
const IMPORT_LIMIT = parseInt(argv.importLimit || process.env.IMPORT_LIMIT || '500', 10);
const FETCH_LIMIT = parseInt(argv.fetchLimit || process.env.CRAWL_FETCH_LIMIT || String(LIMIT * 5), 10);
const POI_COLLECTION = process.env.POI_COLLECTION || 'scenic_points';
const GOOGLE_KEY = process.env.GOOGLE_MAPS_API_KEY || LOCAL_APP_CONFIG.GOOGLE_MAPS_API_KEY || LOCAL_APP_CONFIG.GEMINI_API_KEY || null;
const OPENDATA_URL = process.env.OPENDATA_SOURCE_URL || 'https://media.taiwan.net.tw/XMLReleaseALL_public/scenic_spot_C_f.json';
const CRAWL_REGION = argv.region || argv.city || process.env.CRAWL_REGION || process.env.CRAWL_CITY || '\u53f0\u6771\u7e23';
const TOILET_SEARCH_TERMS = ['廁所', '洗手間', '洗手間', '公廁', 'toilet', 'restroom', 'bathroom'];
const MAX_NEARBY_TOILET_DISTANCE_METERS = 500;
const REGION_ALIASES = {
  '\u53f0\u6771': ['\u53f0\u6771', '\u81fa\u6771', '\u53f0\u6771\u7e23', '\u81fa\u6771\u7e23', '\u7da0\u5cf6', '\u862d\u5dbc'],
  '\u81fa\u6771': ['\u53f0\u6771', '\u81fa\u6771', '\u53f0\u6771\u7e23', '\u81fa\u6771\u7e23', '\u7da0\u5cf6', '\u862d\u5dbc'],
  '\u53f0\u6771\u7e23': ['\u53f0\u6771', '\u81fa\u6771', '\u53f0\u6771\u7e23', '\u81fa\u6771\u7e23', '\u7da0\u5cf6', '\u862d\u5dbc'],
  '\u81fa\u6771\u7e23': ['\u53f0\u6771', '\u81fa\u6771', '\u53f0\u6771\u7e23', '\u81fa\u6771\u7e23', '\u7da0\u5cf6', '\u862d\u5dbc']
};

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

async function fetchNearbyToilets(lat, lng) {
  if (!GOOGLE_KEY || !lat || !lng) return [];
  try {
    const merged = [];
    const seenKeys = new Set();

    for (const term of TOILET_SEARCH_TERMS) {
      const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${MAX_NEARBY_TOILET_DISTANCE_METERS}&keyword=${encodeURIComponent(term)}&key=${GOOGLE_KEY}`;
      const r = await axios.get(url, { timeout: 15000 });
      const results = Array.isArray(r.data && r.data.results) ? r.data.results : [];

      for (const place of results) {
        if (!place || !place.geometry || !place.geometry.location) continue;
        const name = String(place.name || '').trim();
        const vicinity = String(place.vicinity || '').trim();
        const toiletLocation = {
          lat: place.geometry.location.lat,
          lng: place.geometry.location.lng
        };
        if (measureDistanceMeters({ lat, lng }, toiletLocation) > MAX_NEARBY_TOILET_DISTANCE_METERS) continue;
        const key = `${normalizeText(name)}|${normalizeText(vicinity)}|${place.place_id || ''}`;
        if (!name || seenKeys.has(key)) continue;
        seenKeys.add(key);
        merged.push({
          name,
          lat: toiletLocation.lat,
          lng: toiletLocation.lng,
          vicinity
        });
        if (merged.length >= 3) break;
      }

      if (merged.length >= 3) break;
    }

    return merged.slice(0, 3);
  } catch (e) {
    console.error('fetch nearby toilets error', e.message);
    return [];
  }
}

function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[()（）「」『』【】\[\],，.。·・-]/g, '');
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

function makeDocId(spot) {
  // Try multiple strategies to generate a valid doc ID
  const candidates = [
    // Strategy 1: name + city/town
    [spot.name, spot.town || spot.city],
    // Strategy 2: just name
    [spot.name],
    // Strategy 3: name + address
    [spot.name, spot.address],
    // Strategy 4: use id if available
    [spot.id],
    // Strategy 5: use all available text
    [spot.name, spot.town, spot.city, spot.address]
  ];

  for (const parts of candidates) {
    const candidate = parts
      .filter(Boolean)
      .join('')
      .replace(/[\/\\#?]/g, '')
      .trim();
    if (candidate.length > 0) {
      return candidate;
    }
  }

  // Fallback: generate from coordinates
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
  for (const doc of snap.docs) {
    const data = doc.data();
    if (!docMatchesRegion(data, CRAWL_REGION)) {
      skippedByRegion += 1;
      console.log('Skipping', doc.id, 'outside region filter', CRAWL_REGION);
      continue;
    }
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
    console.log('Region filter summary', { region: CRAWL_REGION, processed, skippedByRegion });
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

async function main() {
  const db = initFirebase();
  if (IMPORT_MODE) {
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
