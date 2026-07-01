# 使用者回饋系統 — Firestore Schema（Android / 網頁端對齊用）

> **任務**：B1 使用者回饋系統、B2 深度連結  
> **狀態**：網頁端已實作（2026 Week 1）。Android 端請依此 schema 對齊。  
> **原則**：沿用既有 `micro_trips` 文件，回饋以 **map 欄位** 掛在行程下（與 `members` map 相同慣例，避免額外 collection 與安全規則變更）。

---

## 一、資料位置

```
micro_trips/{tripId}
  ├─ ...（既有欄位：stops, wizardData, members, inviteCode ...）
  └─ feedback: {                     // map，key = emailKey（見下方規則）
        <emailKey>: <FeedbackEntry>
     }
```

- **emailKey 規則**（與 `collab.js` 的 `emailKey()` 完全一致，兩端必須相同）：
  ```
  emailKey(email) = email.toLowerCase().replace(/[^a-z0-9]/g, '_')
  ```
  例：`Tim.Lin@Gmail.com` → `tim_lin_gmail_com`

- 每位使用者對同一趟行程只有一筆回饋（重複提交 = 覆蓋自己的那筆）。

---

## 二、FeedbackEntry 欄位定義

| 欄位 | 型別 | 必填 | 說明 |
|------|------|:----:|------|
| `email` | string | ✅ | 回饋者 email（原始大小寫） |
| `name` | string | ✅ | 顯示名稱 |
| `tripRating` | number (1–5) | ✅ | **行程整體評分**（星等） |
| `aiAccuracy` | number (1–5) | ✅ | **AI 準確度回饋**：AI 生成的行程是否合理、符合需求（1=很不準，5=非常準） |
| `comment` | string | ⬜ | 選填文字意見（上限建議 500 字） |
| `visitedCount` | number | ✅ | 此趟「已到訪」景點數（快照，寫入當下計算） |
| `totalStops` | number | ✅ | 此趟總景點數（不含 start/end 節點） |
| `submittedAt` | number | ✅ | 提交時間，`Date.now()` 毫秒時間戳 |
| `appPlatform` | string | ✅ | 來源平台：`'web'` \| `'android'` |

### JSON 範例

```json
{
  "feedback": {
    "tim_lin_gmail_com": {
      "email": "tim.lin@gmail.com",
      "name": "林泓廷",
      "tripRating": 5,
      "aiAccuracy": 4,
      "comment": "路線很順，但第二站營業時間有誤差",
      "visitedCount": 5,
      "totalStops": 6,
      "submittedAt": 1782000000000,
      "appPlatform": "web"
    }
  }
}
```

---

## 三、寫入方式（重要：map 的 dot-key 陷阱）

`set(..., { merge: true })` **不支援** 用點號路徑當 key（會被當成字面欄位名），必須用**巢狀物件**寫進 map：

```js
// ✅ 正確（巢狀物件）
const patch = {};
patch[emailKey] = feedbackEntry;
await db.collection('micro_trips').doc(tripId)
        .set({ feedback: patch }, { merge: true });

// ❌ 錯誤（dot-key 會建立名為 "feedback.xxx" 的字面欄位）
await ref.set({ ['feedback.' + emailKey]: entry }, { merge: true });
```

此規則與 `collab.js` 寫 `members` map 的註解一致。

---

## 四、每景點到訪標記（既有，兩端沿用）

「每景點到訪標記」在網頁端**已存在**，資料獨立於 feedback：

```
users/{uid}
  └─ visitedSpots: [                 // arrayUnion / arrayRemove 維護
        { name, region, visitDate, tripId, tripTitle, emoji }
     ]
```

- 網頁端 localStorage 對應 key：`wai_visited_places`
- 切換函式：`toggleVisitedPlace(stop)` / `isPlaceVisited(name)`
- feedback 內的 `visitedCount` 即由此清單對「本趟景點」比對計算。

---

## 五、本地快取（網頁端，離線 / 個人行程用）

網頁端另存一份 localStorage 供離線預填與個人（非 collab）行程：

```
localStorage["wai_trip_feedback"] = {
  "<tripId>": { tripRating, aiAccuracy, comment, submittedAt }
}
```

Android 端可用等效本地儲存（SharedPreferences / Room），欄位對齊即可。

---

## 六、B2 深度連結 / URL 格式（兩端對齊）

| 情境 | URL 格式 | 說明 |
|------|---------|------|
| 開啟自己的行程 | `ai-travel-planner-v8.html?id=<tripId>` | 同帳號跨裝置 |
| 唯讀分享（訪客） | `ai-travel-planner-v8.html?sharedId=<tripId>&token=<shareToken>&guest=1` | collab 行程，訪客免登入唯讀 |
| 邀請碼加入 | 邀請碼字串（8 碼 base32，格式 `AB3D-7K9P`） | 由 `WAI_COLLAB.joinByCode()` 處理 |

- `shareToken`：20 碼 base32，由 `WAI_COLLAB.generateShareToken()` 產生。
- Android 深連結（App Link）建議 host/path 與上述 query 參數對應，或以 custom scheme `travellink://trip?id=...` 承接後轉內部路由。

---

## 七、待兩端確認的協商點（週末對齊）

1. `aiAccuracy` 採 **1–5 星**（本 schema）還是三段式（good/ok/bad）？→ 目前定為 **1–5**，Android 若偏好三段式需雙方改。
2. `feedback` 放 **map 欄位**（本 schema）還是獨立 `trip_feedback` collection？→ 目前定為 **map**，若需跨行程分析再議。
3. Firestore 安全規則：feedback 寫入權限（成員可寫自己那筆 / 是否允許 viewer 寫）→ 由 D4「安全規則收緊」統一處理。
