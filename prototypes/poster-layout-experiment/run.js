// 實驗：先決定站點位置 → 畫構圖草稿 → 請 AI 照草稿畫「沒有文字」的底圖 → 程式疊上編號與站名。
// 不影響正式流程。在 repo 根目錄執行：node prototypes/poster-layout-experiment/run.js
// 金鑰讀 server/.env 的 VERTEX_API_KEY，只在本機 Node 使用，不經過瀏覽器。
'use strict';
const fs = require('fs');
const path = require('path');
// VERTEX_API_KEY 有 IP 限制（只認這台機器的 IPv4）；Node 預設可能走 IPv6 → 403，所以強制 IPv4
require('dns').setDefaultResultOrder('ipv4first');
try { require('net').setDefaultAutoSelectFamily(false); } catch (_e) {}

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(__dirname, 'out');
const puppeteer = require(path.join(ROOT, 'server', 'node_modules', 'puppeteer-core'));

const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, 'server', '.env'), 'utf8')
  .split(/\r?\n/).map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].trim()]));
const KEY = env.VERTEX_API_KEY;
const PROJECT = (fs.readFileSync(path.join(ROOT, 'app', 'weather.env.js'), 'utf8').match(/VERTEX_PROJECT_ID:\s*'([^']+)'/) || [])[1];
if (!KEY || !PROJECT) throw new Error('缺少 VERTEX_API_KEY 或 VERTEX_PROJECT_ID');

const SAMPLES = Number(process.env.SAMPLES || 2);
// 第二輪：PROMPT_V=2、只跑 LAYOUTS=loop；檔名加上版本，不覆蓋第一輪結果
const PROMPT_V = Number(process.env.PROMPT_V || 1);
const ONLY = (process.env.LAYOUTS || '').split(',').filter(Boolean);
const W = 1600, H = 900;

// 使用者回報的那趟「1012 蘭嶼」行程（起點＝終點），座標取自 app/poi-data.js、restaurant-data.js
const STOPS = [
  { name: '開元漁港', lat: 22.0444, lng: 121.5581, hint: '漁港、拼板舟、渡輪' },
  { name: '蘭嶼燈塔', lat: 22.05624, lng: 121.50837, hint: '白色燈塔' },
  { name: '坦克岩', lat: 22.08544, lng: 121.5051, hint: '像坦克的海邊岩石' },
  { name: '五孔洞', lat: 22.0803804, lng: 121.5114468, hint: '海蝕洞穴' },
  { name: '火把岩 Jimavonot', lat: 22.0806624, lng: 121.5175019, hint: '尖聳的岩柱' },
  { name: '情人洞', lat: 22.0618685, lng: 121.5733384, hint: '心形的海蝕拱門' },
  { name: 'Do VanWa(在海邊).蘭嶼', lat: 22.0798454, lng: 121.5184896, hint: '海邊餐廳、餐點' },
  { name: '野銀舊部落', lat: 22.0373811, lng: 121.5676827, hint: '達悟族地下屋' },
  { name: '蘭嶼氣象站', lat: 22.0371572, lng: 121.5585787, hint: '山上的氣象站、雷達' },
  { name: '鱷魚岩', lat: 22.08437, lng: 121.50449, hint: '像鱷魚的岩石' },
  { name: '開元漁港', lat: 22.0444, lng: 121.5581, hint: '漁港（回到起點）' }
];

// 起點＝終點只畫一個標記；places = 實際要畫的點，order = 路線經過的 place 索引
function buildPlaces() {
  const places = [];
  const order = STOPS.map((s, i) => {
    const found = places.findIndex((p) => p.name === s.name);
    if (found >= 0) { places[found].numbers.push(i + 1); return found; }
    places.push({ name: s.name, lat: s.lat, lng: s.lng, hint: s.hint, numbers: [i + 1] });
    return places.length - 1;
  });
  return { places, order };
}

// 版面 A：照真實經緯度投影，太近的點互相推開（最少 190px）
function geoLayout(places) {
  const lats = places.map((p) => p.lat), lngs = places.map((p) => p.lng);
  const kx = Math.cos(22.06 * Math.PI / 180);
  const spanX = (Math.max(...lngs) - Math.min(...lngs)) * kx, spanY = Math.max(...lats) - Math.min(...lats);
  const box = { x0: 230, x1: W - 230, y0: 150, y1: H - 150 };
  const scale = Math.min((box.x1 - box.x0) / spanX, (box.y1 - box.y0) / spanY);
  const cx = (box.x0 + box.x1) / 2, cy = (box.y0 + box.y1) / 2;
  const mx = (Math.max(...lngs) + Math.min(...lngs)) / 2, my = (Math.max(...lats) + Math.min(...lats)) / 2;
  const pts = places.map((p) => ({ x: cx + (p.lng - mx) * kx * scale, y: cy - (p.lat - my) * scale }));
  for (let it = 0; it < 400; it++) {
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
      const dx = pts[j].x - pts[i].x, dy = pts[j].y - pts[i].y, d = Math.hypot(dx, dy) || 1;
      if (d < 190) { const push = (190 - d) / 2, ux = dx / d, uy = dy / d; pts[i].x -= ux * push; pts[i].y -= uy * push; pts[j].x += ux * push; pts[j].y += uy * push; }
    }
    pts.forEach((p) => { p.x = Math.max(box.x0, Math.min(box.x1, p.x)); p.y = Math.max(box.y0, Math.min(box.y1, p.y)); });
  }
  return pts;
}

// 版面 B：依行程順序平均排在一個環上（路線不交叉，和 AI 自己畫的示意地圖類似）
function loopLayout(places, order) {
  const seq = [];
  order.forEach((idx) => { if (!seq.includes(idx)) seq.push(idx); });
  const pts = new Array(places.length);
  seq.forEach((idx, k) => {
    const a = Math.PI - (k / seq.length) * Math.PI * 2; // 從左邊開始、順時針
    pts[idx] = { x: W / 2 + Math.cos(a) * 590, y: H / 2 - Math.sin(a) * 300 + 20 };
  });
  return pts;
}

function buildPrompt(places, order) {
  if (PROMPT_V >= 2) return buildPromptV2(places);
  const list = STOPS.map((s, i) => `${i + 1}. ${s.name}（${s.hint}）`).join('\n');
  const merged = places.filter((p) => p.numbers.length > 1).map((p) => `第 ${p.numbers.join('、')} 站都是「${p.name}」，草稿上只有一個圓點（標 ${p.numbers[0]}）`).join('；');
  return [
    '請以附圖為「構圖草稿」，繪製一張「1012 蘭嶼」旅遊地圖插畫。',
    '附圖說明：紅色編號圓點是各站的位置，灰色虛線是行程路線。',
    '完成圖的要求：',
    '1. 每一站的小插圖要畫在草稿上對應編號圓點的位置（中心對齊，不要移動），路線沿著草稿虛線的走向，用一條連續的手繪虛線依序連接。',
    '2. 背景是俯瞰的手繪示意地圖：蘭嶼島的海岸線、藍色的海、綠色山脈與道路。',
    '3. 主角是可愛的卡通「卡皮巴拉」，在幾站旁邊當嚮導或旅伴。',
    '4. 非常重要：圖上「完全不要出現任何文字、數字、編號、標籤、圓點或圖例」，這些之後會由程式另外加上。每個站點插圖的下方留一點空白，讓之後放得下名稱標籤。',
    '5. 日式雜誌插畫風格，可愛、清新，比例 16:9。',
    '',
    '各編號對應的地點（只用來決定插圖內容，不要寫進圖裡）：',
    list,
    merged ? `（${merged}）` : ''
  ].join('\n');
}

// 第二輪指令：第一輪有一半偷寫字（含簡體字）、畫出空白標籤框、把小插圖往外推或放錯位置
function buildPromptV2(places) {
  const list = places.map((p) => `圓點 ${p.numbers[0]}：${p.name}（畫：${p.hint}）`).join('\n');
  return [
    '請以附圖為「構圖草稿」，繪製一張蘭嶼旅遊地圖插畫（底圖）。',
    '附圖說明：紅色編號圓點是各站的位置，灰色虛線是行程路線。',
    '',
    '【位置】每一站的小插圖，中心必須正好畫在草稿上對應圓點的位置：不要往外移、不要移到島的中央、也不要和其他站交換位置。路線用一條連續的手繪虛線，沿著草稿虛線依序連接各站。',
    '【內容】背景是俯瞰的手繪示意地圖：蘭嶼島的海岸線、藍色的海、綠色山脈與道路。主角是可愛的卡通「卡皮巴拉」，在其中兩三站旁邊當嚮導或旅伴。日式雜誌插畫風格，可愛、清新，比例 16:9。',
    '【絕對禁止】整張圖不能有任何文字：不要寫站名、不要寫標題、不要任何中文（繁體或簡體）、英文、數字或編號；也不要畫空白的標籤框、文字底板、圖例或紅色圓點。站名與編號之後會由程式另外疊上，圖上只要有插畫。',
    '',
    '各圓點要畫的內容（只用來決定插圖內容，不要寫進圖裡）：',
    list
  ].join('\n');
}

async function renderPng(browser, html, w, h, file) {
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h });
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts && document.fonts.ready);
  const el = await page.$('#c');
  await el.screenshot({ path: file, omitBackground: false });
  await page.close();
}

function sketchHtml(places, order, pts) {
  const data = JSON.stringify({ places, order, pts, W, H });
  return `<!doctype html><meta charset="utf-8"><body style="margin:0"><canvas id="c" width="${W}" height="${H}"></canvas><script>
  const { places, order, pts, W, H } = ${data};
  const g = document.getElementById('c').getContext('2d');
  g.fillStyle = '#f4f1ea'; g.fillRect(0, 0, W, H);
  g.setLineDash([18, 14]); g.lineWidth = 6; g.strokeStyle = '#8a857c'; g.beginPath();
  order.forEach((idx, i) => { const p = pts[idx]; i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y); }); g.stroke();
  g.setLineDash([]);
  places.forEach((pl, i) => { const p = pts[i];
    g.fillStyle = '#e0452b'; g.beginPath(); g.arc(p.x, p.y, 40, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff'; g.font = 'bold 40px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(pl.numbers[0]), p.x, p.y + 2); });
  </script>`;
}

function compositeHtml(imgB64, mime, places, pts) {
  const data = JSON.stringify({ places, pts, W, H });
  return `<!doctype html><meta charset="utf-8"><body style="margin:0"><canvas id="c"></canvas><script>
  const { places, pts, W, H } = ${data};
  const img = new Image();
  img.onload = () => {
    const c = document.getElementById('c'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const s = c.width / W, sy = c.height / H;
    const font = '"Microsoft JhengHei","Noto Sans TC","PingFang TC",sans-serif';
    places.forEach((pl, i) => {
      const x = pts[i].x * s, y = pts[i].y * sy;
      const num = pl.numbers.join('／');
      const r = 22 * s * (num.length > 2 ? 1.25 : 1);
      // 編號圓點
      g.shadowColor = 'rgba(0,0,0,.25)'; g.shadowBlur = 6 * s;
      g.fillStyle = '#f07b3f'; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
      g.shadowBlur = 0; g.lineWidth = 4 * s; g.strokeStyle = '#fff'; g.stroke();
      g.fillStyle = '#fff'; g.font = 'bold ' + Math.round((num.length > 2 ? 17 : 24) * s) + 'px ' + font;
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(num, x, y + 1 * s);
      // 站名標籤（圓點下方）
      g.font = 'bold ' + Math.round(22 * s) + 'px ' + font;
      const tw = g.measureText(pl.name).width, ph = 34 * s, pw = tw + 22 * s, ly = y + r + 8 * s;
      g.fillStyle = 'rgba(255,255,255,.93)'; g.strokeStyle = '#2e7d6d'; g.lineWidth = 2.5 * s;
      g.beginPath(); g.roundRect(x - pw / 2, ly, pw, ph, ph / 2); g.fill(); g.stroke();
      g.fillStyle = '#22201d'; g.fillText(pl.name, x, ly + ph / 2 + 1 * s);
    });
    document.title = 'done';
  };
  img.src = 'data:${mime};base64,${imgB64}';
  </script>`;
}

async function generate(sketchB64, prompt) {
  const url = `https://aiplatform.googleapis.com/v1beta1/projects/${encodeURIComponent(PROJECT)}/locations/global/publishers/google/models/gemini-3-pro-image:generateContent?key=${encodeURIComponent(KEY)}`;
  const t0 = Date.now();
  const res = await fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ inlineData: { mimeType: 'image/png', data: sketchB64 } }, { text: prompt }] }],
      generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '16:9' } }
    })
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`HTTP ${res.status} ${(body.error && body.error.message || '').slice(0, 200)}`);
  const part = (body.candidates?.[0]?.content?.parts || []).find((p) => p.inlineData?.data && !p.thought);
  if (!part) throw new Error('沒有圖片：' + JSON.stringify(body).slice(0, 200));
  return { b64: part.inlineData.data, mime: part.inlineData.mimeType || 'image/png', sec: Math.round((Date.now() - t0) / 1000) };
}

async function waitDone(browser, html, file) {
  const page = await browser.newPage();
  await page.setViewport({ width: 800, height: 600 });
  await page.setContent(html, { waitUntil: 'load' });
  await page.waitForFunction(() => document.title === 'done', { timeout: 30000 });
  const el = await page.$('#c');
  await el.screenshot({ path: file });
  await page.close();
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', process.env.CHROME_PATH].filter(Boolean).find((p) => fs.existsSync(p));
  const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new' });
  const { places, order } = buildPlaces();
  const prompt = buildPrompt(places, order);
  fs.writeFileSync(path.join(OUT, PROMPT_V >= 2 ? `prompt-v${PROMPT_V}.txt` : 'prompt.txt'), prompt, 'utf8');
  const layouts = { geo: geoLayout(places), loop: loopLayout(places, order) };
  // 沿用既有結果（第一輪），新的 run 附加上去
  const resultsPath = path.join(OUT, 'results.json');
  const prev = fs.existsSync(resultsPath) ? JSON.parse(fs.readFileSync(resultsPath, 'utf8')) : null;
  const results = { generatedAt: new Date().toISOString(), W, H, places, order, layouts, runs: (prev && prev.runs || []).filter((r) => !r.error) };
  for (const [name, pts] of Object.entries(layouts)) {
    await renderPng(browser, sketchHtml(places, order, pts), W, H, path.join(OUT, `${name}-sketch.png`));
  }
  const jobs = [];
  for (const name of Object.keys(layouts)) {
    if (ONLY.length && !ONLY.includes(name)) continue;
    for (let k = 1; k <= SAMPLES; k++) jobs.push({ name, k });
  }
  // 一次跑兩張，避免撞到 Vertex 速率限制
  for (let i = 0; i < jobs.length; i += 2) {
    await Promise.all(jobs.slice(i, i + 2).map(async ({ name, k }) => {
      const sketch = fs.readFileSync(path.join(OUT, `${name}-sketch.png`)).toString('base64');
      try {
        const r = await generate(sketch, prompt);
        const ext = r.mime.includes('jpeg') ? 'jpg' : 'png';
        const base = PROMPT_V >= 2 ? `${name}-v${PROMPT_V}-${k}` : `${name}-${k}`;
        fs.writeFileSync(path.join(OUT, `${base}-ai.${ext}`), Buffer.from(r.b64, 'base64'));
        await waitDone(browser, compositeHtml(r.b64, r.mime, places, layouts[name]), path.join(OUT, `${base}-final.png`));
        results.runs.push({ layout: name, sample: k, promptV: PROMPT_V, ai: `${base}-ai.${ext}`, final: `${base}-final.png`, seconds: r.sec });
        console.log(`✓ ${name} #${k}（${r.sec}s）`);
      } catch (e) {
        results.runs.push({ layout: name, sample: k, error: e.message });
        console.log(`✗ ${name} #${k}：${e.message}`);
      }
    }));
  }
  results.runs.sort((a, b) => ((b.promptV || 1) - (a.promptV || 1)) || (a.layout + a.sample).localeCompare(b.layout + b.sample));
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2), 'utf8');
  await browser.close();
  console.log('完成：', path.join(OUT, 'results.json'));
})().catch((e) => { console.error(e); process.exit(1); });
