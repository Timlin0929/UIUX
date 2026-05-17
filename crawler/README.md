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
