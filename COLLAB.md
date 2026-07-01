# 多人共同建立行程（Collaborative Trip Building）

依產品決策實作的 MVP：**同看一份 + 團體生成 + 成員清單**（暫不做即時逐欄共編）。

## 決策對照

| 項目 | 決策 | 實作 |
|---|---|---|
| 協作深度 | 同看一份 + 團體生成 + 成員清單 | 共用 `micro_trips` doc + `onSnapshot` 即時成員清單 |
| 編輯權限 | 加入者預設 **viewer**；owner 可調角色 | `joinByCode` 預設 viewer；成員面板 owner 可改 viewer/editor |
| 節奏 / 預算 | 節奏**多數決**、預算**平均** | `aggregateGroupProfile`（平手取較放鬆；預算取數值平均） |
| 生成時機 | owner **隨時可生成** | 成員面板「🚀 生成團體行程」僅 owner 可見可按 |
| 共編頁面 | 走 `ai-travel-planner-v8` 同頁 | `?sharedId=` 載入；viewer/訪客唯讀 |
| 規模 | 每團 **10 人**、含**訪客唯讀連結** | `MAX_MEMBERS=10`；`?sharedId=&token=&guest=1` 唯讀連結 |

## 檔案

| 檔案 | 角色 |
|---|---|
| [collab.js](app/collab.js) | `window.WAI_COLLAB`：邀請碼/分享 token、建立/加入、成員與角色、團體偏好彙整（純函式可測） |
| [ai-travel-explore-final.js](app/ai-travel-explore-final.js) | 建立共用行程、真實加入、成員面板、團體生成、`loadState` 載入「我加入的」 |
| [ai-travel-explore-final.html](app/ai-travel-explore-final.html) | `#collabPanelOverlay` 成員面板；載入 `collab.js` |
| [ai-travel-planner-v8.js](app/ai-travel-planner-v8.js) | `?sharedId=`/`guest` 載入共用行程；viewer/訪客唯讀橫幅 + 鎖存檔 |
| [firestore.rules](firestore.rules) | 安全規則（含 collab） |

## 資料模型（沿用既有 `micro_trips`）

```
micro_trips/{tripId}
  collab:true, ownerUid, ownerEmail, ownerName,
  inviteCode, shareToken, guestReadable:true, maxMembers:10,
  memberEmails:[...]                 // array-contains 查「我加入的」
  members:{ <emailKey>:{ email,name,role,ready,prefs{...},joinedAt } }
  userEmail: ownerEmail              // 保留既有欄位，owner 既有查詢仍找得到
invites/{CODE} -> { tripId, active:true, createdBy, createdAt }
```

## 流程

- **建立（owner）**：建立精靈選「多人共作」→ 填行程參數 → `createSharedTrip` 寫 doc + 邀請碼 → 開成員面板（**不自動生成**）。
- **加入（member）**：輸入邀請碼 → `joinByCode`（預設 viewer）→ 開成員面板，填自己的偏好。
- **生成（owner 隨時）**：面板按「生成團體行程」→ `aggregateGroupProfile` 彙整 → 套進 prompt（`buildPreferenceLines` 走團體分支：興趣聯集、節奏多數決、預算平均、**禁忌聯集為硬限制**）→ 一般生成流程寫回 stops。
- **編輯/檢視**：面板「在編輯器開啟」→ v8 `?sharedId=`；owner/editor 可編輯並存回，viewer/訪客唯讀（橫幅提示、變更不寫回）。
- **訪客唯讀連結**：面板「複製唯讀連結」→ `…v8.html?sharedId=…&token=…&guest=1`，未登入也能看（靠 `guestReadable` 規則）。

## 部署規則

⚠️ [firestore.rules](firestore.rules) 是**新檔**，部署會**覆蓋**你目前線上的規則。請先比對既有規則（尤其 `poi_cache` / `scenic_points` 段，這裡是依現況推測）再部署：

```
firebase deploy --only firestore:rules
```

> **⚠️ 加入人數沒更新？多半是規則沒重新部署。** `allow update` 必須包含 `|| (resource.data.collab == true)` 這條，**新成員第一次加入時還不在 `memberEmails`**，少了它寫入會被拒、人數永遠不會增加。改完 `firestore.rules` 後務必重新 `firebase deploy --only firestore:rules`。測試請用**兩個不同帳號**（同帳號再次加入是 no-op，不會 +1，前端會顯示「你已在此行程中」）。

`micro_trips` 需要 `memberEmails` 的 array-contains 索引（單欄位 array-contains 通常自動建立；若 console 提示需建索引，依連結點建即可）。

## 本機測試步驟（需真實 Firebase 連線）

1. 帳號 A 登入 → 建立「多人共作」行程 → 取得邀請碼 / 唯讀連結。
2. 帳號 B（另一瀏覽器）登入 → 「輸入邀請碼加入」→ 兩人都在成員清單、看到同一份行程。
3. B 填偏好並儲存 → A 的面板即時看到 B 的 ready 與「團體綜合」更新。
4. A 把 B 調為 editor → B 在 v8 `?sharedId=` 可編輯並存回；改回 viewer → B 變唯讀（橫幅、改動不存）。
5. A 按「生成團體行程」→ 結果同時尊重雙方興趣與**全員禁忌聯集**。
6. 未登入開唯讀連結 → 可瀏覽、不可編輯。

## 已知限制（prototype；未來可硬化）

- **角色細分靠 App 把關**：為了讓新成員能加入，`allow update` 對 `collab==true` 的行程開放給任一登入者（否則卡在「先有雞還是先有蛋」）。也就是說規則層只擋到「登入 vs 未登入」；viewer 不可改「行程內容」是由前端（成員面板只給 owner 角色控制）與 v8（唯讀鎖存檔）保證，而非規則。要規則級強制角色，建議改以 **uid 當 member 鍵** + 維護 `editorEmails` 陣列供規則 `in` 比對，或把「加入」改成 Cloud Function / callable 控管。
- **非即時逐欄共編**：v8 編輯為「最後存回者為準」，無同時編輯合併（符合本次決策範圍）。
- **訪客讀取**：靠 `guestReadable==true` 開放未登入讀取整份 doc；分享連結的 `token` 由前端比對（規則未綁 token）。連結外洩＝可讀，請視為「知道連結即可看」。
- 純函式（彙整/產碼）已用 `node` 單元測試；觸及 Firestore 的部分需在有金鑰與網路的環境實測（本機 `file://` 多受限）。
