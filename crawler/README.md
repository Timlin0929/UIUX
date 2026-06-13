# Scenic Points Crawler 使用說明

這個 Node.js 工具會從「交通部觀光署 OpenData」抓取景點資料，並寫入 Firebase Firestore 的 `scenic_points` 集合。

目前預設：

- Firestore collection：`scenic_points`
- 匯入地區：`台東縣`
- 匯入上限：`500` 筆
- 座標欄位：`scenicCoordinates.lat` / `scenicCoordinates.lng`

## 安裝

進入 crawler 資料夾：

```powershell
cd C:\Users\USER\Desktop\UIUX\crawler
```

安裝套件：

```powershell
npm install
```

如果 PowerShell 擋住 `npm.ps1`，請改用：

```powershell
npm.cmd install
```

## 設定 Firebase 權限

這支程式需要 Firebase Admin service account。

請把 Firebase 下載的私鑰 JSON 放在：

```text
C:\Users\USER\Desktop\UIUX\crawler\serviceAccount.json
```

然後在 PowerShell 設定：

```powershell
$env:FIREBASE_SERVICE_ACCOUNT_PATH="C:\Users\USER\Desktop\UIUX\crawler\serviceAccount.json"
```

如果沒有設定，執行時會出現：

```text
Missing Firebase service account.
```

## 匯入 OpenData 景點

先用預覽模式，不會寫入 Firebase：

```powershell
npm run import:dry
```

確認輸出內容沒問題後，正式匯入：

```powershell
npm run import
```

如果 PowerShell 擋住 npm，請改用：

```powershell
npm.cmd run import:dry
npm.cmd run import
```

## 刪掉 scenic_points 後會自動新增嗎？

會。

Firestore 不需要先手動建立 collection。只要執行：

```powershell
npm run import
```

程式會自動建立新的 `scenic_points` collection，並寫入台東縣景點資料。

注意：Firestore Console 只有在第一筆文件寫入後，才會顯示新的 collection。

## 匯入後會寫入哪些欄位？

每筆景點會寫入類似這些欄位：

```text
id
name
desc
notice
region
city
county
scenicCoordinates.lat
scenicCoordinates.lng
lat
lng
formatted_address
tripTitle
source
crawl_source
crawl_confidence
official_opendata_id
official_opendata_name
official_opendata_match
updatedAt
last_crawled
needsCrawl
```

其中 `scenicCoordinates.lat` / `scenicCoordinates.lng` 是目前前端景點資料使用的座標格式。

## 補齊既有景點資料

如果 Firestore 裡已經有景點文件，只想補座標或地址，可以在該文件加上：

```js
needsCrawl: true
```

然後先跑預覽：

```powershell
npm run dry
```

確認沒問題後寫入：

```powershell
npm start
```

這個模式只會處理已存在且 `needsCrawl: true` 的文件，不會自動新增 OpenData 全部景點。

## 匯出本地景點檔（給前端離線優先使用）

把 Firestore `scenic_points` 匯出成前端可直接載入的靜態檔 `..\poi-data.js`（`window.WAI_POI_DATA`），讓「生成 / 重新規劃行程」時先用本地景點清單交給 AI 排序，減少 Google Places / Firebase 呼叫。

先預覽（不寫檔，只印出內容）：

```powershell
npm run export:local:dry
```

確認沒問題後正式產檔：

```powershell
npm run export:local
```

說明：

- 會依景點的行政區把資料分桶成前端目的地鍵（如「台東」「綠島」「蘭嶼」）。
- 每筆只保留變動不大的欄位：`name / lat / lng / desc / address / businessHours / duration? / nearbyToiletLocations`。
- 預設輸出到專案根目錄的 `poi-data.js`；可用 `$env:EXPORT_LOCAL_PATH` 覆寫路徑。
- 前端兩頁（explore、planner-v8）以 `<script src="poi-data.js">` 載入；檔案為空 `{}` 時自動回退 Firebase / live Maps。

## 用 Places 校正景點座標／時間／評分（verify:places）

OpenData 的座標/營業時間較粗略。這個模式用 Google Places 對每個 `scenic_points` **嚴格比對名稱**，把更精準的**座標、營業時間、評分、place_id** 寫回 Firestore（**保留 OpenData 原名稱**），並把永久歇業者標記起來。校正一次後重跑 `export:local`，`poi-data.js` 即達 Places 等級，而**前端執行階段仍 0 Places 費用**。

先試跑前 5 筆（省額度）：

```powershell
npm run verify:places:dry -- --limit 5
```

正式校正（寫回 Firestore）：

```powershell
npm run verify:places
```

說明：

- 預設**跳過已驗證**的文件；要全部重新校正加 `-- --force`。
- 只接受「名稱嚴格比對且落在 OpenData 座標 `VERIFY_NEAR_METERS`(預設 5000m) 內」者，擋掉同名異地；比不到就保留 OpenData。
- 成本：約 1 次 searchText／景點（一次性 Enterprise SKU，**不含** reviews 高價 SKU）。
- 校正後記得 `npm run export:local` 才會反映到 `poi-data.js`。

## 餐廳快取（crawl:food → restaurant-data.js）

餐廳變動快、且不在 `poi-data.js` 裡。這個模式依景點形心，用 Places 抓每個目的地的餐廳候選，寫成獨立檔 `..\restaurant-data.js`（`window.WAI_RESTAURANT_DATA`）。前端 `fetchGoogleMapsFoodList` **本地優先**：有快取就用、跳過 Places；命中的餐廳站連執行階段驗證也一併跳過。

先預覽：

```powershell
npm run crawl:food:dry
```

正式產檔：

```powershell
npm run crawl:food
```

說明：

- 只對景點數 ≥ `MIN_FOOD_POIS`(預設 3) 的目的地產生；每目的地收 `FOOD_PER_DEST`(預設 25) 間。
- 欄位：`name / lat / lng / businessHours / address / rating`，與前端即時抓的格式一致。
- 成本：約 3 個目的地 × 3 詞 ≈ 9 次 searchText（~US$0.3）。
- 由 `..\ai-travel-explore-final.html` 以 `<script src="restaurant-data.js">` 載入；檔案不存在時前端自動回退即時抓。

## 每兩週自動爬餐廳（Windows 工作排程）

由 [`run-food-crawl.bat`](run-food-crawl.bat) + 工作排程執行，工作名稱 **`WanderAI Food Crawl`**，每 2 週週日 03:00，輸出寫到 `crawler/crawl-food.log`。

| 操作 | 指令 |
|---|---|
| 查看狀態/下次執行 | `schtasks /query /tn "WanderAI Food Crawl" /v /fo LIST` |
| 立即手動跑一次 | `schtasks /run /tn "WanderAI Food Crawl"` |
| 改時間（例 04:00） | `schtasks /change /tn "WanderAI Food Crawl" /st 04:00` |
| 停用 / 啟用 | `schtasks /change /tn "WanderAI Food Crawl" /disable`（`/enable`） |
| 刪除 | `schtasks /delete /tn "WanderAI Food Crawl" /f` |
| 重新建立 | `schtasks /create /tn "WanderAI Food Crawl" /tr "C:\Users\USER\Desktop\UIUX\crawler\run-food-crawl.bat" /sc WEEKLY /mo 2 /d SUN /st 03:00 /f` |

注意：目前為 **Interactive only**（使用者登入時才會跑），不需密碼；需機器開機。服務帳號路徑寫死在 `.bat` 內，搬移專案請同步修改。若要「未登入也跑」，重建時加 `/ru <帳號> /rp <密碼>`。

## 每日分散爬蟲（一週平均跑完 + 免費額度用完前停止）

`verify:places` 對全部 `scenic_points` 逐筆打 Places（可能上百次），一次跑完容易吃掉免費額度。改用兩個旗標把它**平均分散在一週**、並在**預算內停止**：

| 旗標 | 作用 |
|---|---|
| `--slice K/N` | 把待處理文件均分成 N 份，只跑第 K 份（K 從 1 起算）。例：`--slice 3/7` |
| `--max-calls N` | 本次最多打 N 次 Google API（geocode／Places searchText），達上限即停，**未處理者下次續跑**。`0`＝不限 |

- `verify:places` 會自動**跳過已驗證**的文件，所以同一片隔天重跑只會處理還沒做的；7 天跑完整輪後就閒置（每天 0 工作量）。
- `--slice` / `--max-calls` 也可用環境變數 `CRAWL_SLICE` / `CRAWL_MAX_CALLS` 設定。
- `crawl:food` 在切片／預算模式下改為**部分更新**：先讀既有 `restaurant-data.js`，只覆寫本次處理到的目的地，不會清掉其他天已爬的資料。

手動試一片（含預算上限）：

```powershell
npm run verify:places -- --slice 2/7 --max-calls 120
```

### 用工作排程每天自動分散

[`run-weekly-crawl.bat`](run-weekly-crawl.bat) 會**依星期幾**自動算出今天要跑哪一片（週日=1…週六=7），以 `CRAWL_MAX_CALLS`（預設 120）為當日上限跑 `verify:places`，再重產 `poi-data.js`（`export:local` 零 API 費用）。輸出寫到 `crawler\weekly-crawl.log`。

建立每天 03:00 執行的工作：

```powershell
schtasks /create /tn "WanderAI Weekly Crawl" /tr "C:\Users\USER\Desktop\UIUX\crawler\run-weekly-crawl.bat" /sc DAILY /st 03:00 /f
```

| 操作 | 指令 |
|---|---|
| 立即手動跑今天這一片 | `schtasks /run /tn "WanderAI Weekly Crawl"` |
| 改每日上限（例 80） | 設環境變數 `CRAWL_MAX_CALLS`，或直接改 `.bat` 內的預設值 |
| 停用 / 啟用 | `schtasks /change /tn "WanderAI Weekly Crawl" /disable`（`/enable`） |
| 刪除 | `schtasks /delete /tn "WanderAI Weekly Crawl" /f` |

**`CRAWL_MAX_CALLS` 怎麼定？** 取決於你的免費額度：Google Maps Platform 每月約 US$200 免額，這個 `verify:places` 的 searchText（含座標／營業時間／評分欄位）約 Enterprise 等級，**每月免費額度約可換 5,000–6,000 次**。預設 120/天 × 30 ≈ 3,600/月，落在免額內。若你已有其他用途在吃同一份額度，請把每日上限調低。

## 各資料檔與刷新流程

| 檔案 | 全域變數 | 由誰產生 | 何時刷新 |
|---|---|---|---|
| `..\poi-data.js` | `window.WAI_POI_DATA` | `export:local`（資料來自 `verify:places`） | 景點/校正有變時：`verify:places -- --force` → `export:local` |
| `..\restaurant-data.js` | `window.WAI_RESTAURANT_DATA` | `crawl:food` | 每兩週自動；要立即更新就手動 `crawl:food` |

兩份皆為自動產生檔，請勿手動編輯。

## 可選設定

通常不用改，但需要時可以在 PowerShell 設定：

```powershell
$env:POI_COLLECTION="scenic_points"
$env:CRAWL_REGION="台東縣"
$env:CRAWL_LIMIT="50"
$env:CRAWL_FETCH_LIMIT="250"
$env:IMPORT_LIMIT="500"
```

說明：

- `POI_COLLECTION`：要寫入的 Firestore collection，預設 `scenic_points`
- `CRAWL_REGION`：地區限制，預設 `台東縣`
- `CRAWL_LIMIT`：補齊既有文件時最多處理幾筆
- `CRAWL_FETCH_LIMIT`：補齊模式最多先讀取幾筆候選文件
- `IMPORT_LIMIT`：匯入模式最多匯入幾筆，預設 `500`
- `VERIFY_NEAR_METERS`：verify:places 接受 Places 結果與 OpenData 座標的最大距離，預設 `5000`
- `MIN_FOOD_POIS`：crawl:food 目的地最少景點數門檻，預設 `3`
- `FOOD_PER_DEST`：crawl:food 每目的地最多收幾間餐廳，預設 `25`
- `CRAWL_MAX_CALLS`：單次執行最多打幾次 Google API，達上限即停（免費額度守門），`0`＝不限
- `CRAWL_SLICE`：把工作均分成 N 份只跑第 K 份，形如 `3/7`（等同 `--slice`，用於一週分散）
- `RESTAURANT_DATA_PATH` / `EXPORT_LOCAL_PATH`：覆寫輸出檔路徑

## 常用流程

第一次匯入台東縣景點：

```powershell
cd C:\Users\USER\Desktop\UIUX\crawler
$env:FIREBASE_SERVICE_ACCOUNT_PATH="C:\Users\USER\Desktop\UIUX\crawler\serviceAccount.json"
npm run import:dry
npm run import
```

只檢查既有景點並補資料：

```powershell
cd C:\Users\USER\Desktop\UIUX\crawler
$env:FIREBASE_SERVICE_ACCOUNT_PATH="C:\Users\USER\Desktop\UIUX\crawler\serviceAccount.json"
npm run dry
npm start
```

## 注意事項

- `npm run import:dry` 和 `npm run dry` 都是安全預覽，不會寫入 Firebase。
- `npm run import` 會從 OpenData 建立或更新 `scenic_points` 文件。
- `npm start` 只會補齊既有且 `needsCrawl: true` 的文件。
- `serviceAccount.json` 是私鑰，不要上傳 GitHub。
- 如果需要 Google Geocoding fallback，可以設定 `GOOGLE_MAPS_API_KEY`；沒有設定時，程式會嘗試讀取上一層的 `weather.env.js`。
