---
name: codex-verify
description: 把最近的變更丟給本機 Codex CLI 做第二雙眼睛驗證。使用者輸入 /codex-verify（可帶 commit 範圍或數量）時執行：整理本次變更範圍與驗收標準 → codex exec 審查 → 結果存 codex-review.md 並摘要回報。
---

# /codex-verify — 用 Codex CLI 驗證最近的變更

把指定範圍的 commit（含驗收標準）交給本機 `codex` CLI 非互動審查，產出報告。

## 參數解析（$ARGUMENTS）
- 空 → 範圍 = `HEAD~1..HEAD`（最後一個 commit）。
- 數字 N → `HEAD~N..HEAD`。
- 含 `..` 的字串 → 直接當 git range。
- 其他文字 → 附加為「額外關注重點」。

## 步驟

1. **組驗證上下文**（你來寫，這是本 skill 的價值所在）：
   - `git log --oneline <range>` 列出要審的 commit。
   - 依據本 session 的上下文（或 commit message），寫出這些變更的「目的」與「驗收標準」清單——像交接給不知情同事。若 session 上下文不含這些 commit（例如使用者驗舊 commit），從 commit message 與 diff 推導。

2. **寫 prompt 檔**到 scratchpad（避免 shell 引號地獄），內容格式：
   ```
   你是資深審查者。請在這個 repo 審查以下 commit 範圍：<range>
   先執行 `git log --oneline <range>` 與 `git diff <range>` 看完整變更。

   ## 變更目的
   <一段話>

   ## 驗收標準（逐條核對 diff 是否達成、有無破壞）
   - <條列>

   ## 額外關注
   - 本專案是無建置步驟的靜態原型（file:// 可跑、plain script 非 module）
   - F12 必須零紅字：檢查新增路徑是否有未捕捉的 async 錯誤
   - innerHTML 前必須 escapeHtml；Firestore stops 欄位需三處同步（persist／initFromUrl×2／collab 快照）
   - <使用者指定的額外重點（如有）>

   請輸出：(1) 驗收標準逐條 PASS/FAIL/存疑 (2) 發現的 bug（含檔案:行號與觸發情境） (3) 建議（可選）。用繁體中文。
   ```

3. **執行 Codex**（用 Bash tool；可能跑數分鐘，timeout 給滿 600000，或 run_in_background）：
   ```bash
   codex exec --sandbox read-only -C "C:/Users/USER/Desktop/UIUX" "$(cat <prompt檔>)" > <scratchpad>/codex-out.txt 2>&1
   ```
   - `--sandbox read-only`：只給讀權限，Codex 不能改 repo。
   - 若 `codex exec` 回錯（未登入等），把錯誤原樣回報給使用者，不要重試超過一次。

4. **產出報告**：把 Codex 輸出整理存到 repo 根目錄 `codex-review.md`（已 gitignore），開頭附：日期、range、commit 清單。然後在對話中用繁中摘要：整體結論、FAIL/存疑項、bug 清單。Codex 的誤報要標註你的判斷（你比它了解上下文）。

## 注意
- Codex 的發現是「線索」不是「判決」——每個 FAIL/bug 你要自己對照程式碼確認後再轉述，標明「已確認」或「Codex 認為但我查證後不成立（原因）」。
- 不要把任何 secrets（server/.env、serviceAccount.json 內容）寫進 prompt。
