# TravelLink AI — 自架網站部署指南（直接開 Port 對外）

> **適用環境**：Windows 11 + Node.js + 靜態 HTML  
> **架構**：Nginx（網頁伺服器）→ 對外開 Port 80/443  
> **前置需求**：固定 IP 或 DDNS 服務

---

## 一、架構總覽

```
使用者（瀏覽器）
    │
    ↓  Port 80/443
┌──────────────────────────────────────┐
│  你的電腦（Windows 11）              │
│                                      │
│  ┌────────────┐    ┌──────────────┐  │
│  │   Nginx    │───→│ 靜態檔案目錄 │  │
│  │ (反向代理)  │    │ /UIUX/*.html │  │
│  │ Port 80/443│    └──────────────┘  │
│  └────────────┘                      │
│       │                              │
│       ├── 安全規則（擋惡意 IP）       │
│       ├── 隱藏敏感檔案（.env 等）    │
│       └── Rate Limiting（限流）      │
│                                      │
│  ┌────────────┐                      │
│  │    PM2     │ ← 可選，管理行程     │
│  └────────────┘                      │
└──────────────────────────────────────┘
    │
    ↓  外部 API（前端直接呼叫）
Firebase / Google Maps / Gemini / TDX
```

---

## 二、Step 1 — 安裝 Nginx（Windows 版）

### 1.1 下載 Nginx

到 https://nginx.org/en/download.html 下載 **Stable 版** 的 Windows zip。

```powershell
# 解壓到 C:\nginx（路徑不要有中文或空格）
# 解壓後結構應為：
# C:\nginx\nginx.exe
# C:\nginx\conf\nginx.conf
# C:\nginx\html\
```

### 1.2 測試 Nginx 能否啟動

```powershell
cd C:\nginx
.\nginx.exe
```

開瀏覽器訪問 `http://localhost`，看到 "Welcome to nginx!" 就成功了。

```powershell
# 停止 Nginx
.\nginx.exe -s stop
```

---

## 三、Step 2 — 設定 Nginx（含安全防護）

把 `C:\nginx\conf\nginx.conf` 替換為以下內容：

```nginx
worker_processes  1;

events {
    worker_connections  1024;
}

http {
    include       mime.types;
    default_type  application/octet-stream;
    sendfile      on;
    keepalive_timeout  65;

    # ========================================
    # 安全防護 1：日誌格式（方便追蹤攻擊）
    # ========================================
    log_format  main  '$remote_addr - [$time_local] "$request" '
                      '$status $body_bytes_sent "$http_user_agent"';

    access_log  logs/access.log  main;
    error_log   logs/error.log;

    # ========================================
    # 安全防護 2：封鎖已知惡意 IP
    # ========================================
    # 建立一個 blocklist 檔案（見 Step 3）
    include       conf/blocklist.conf;

    # ========================================
    # 安全防護 3：限制請求速率（防掃描/DDoS）
    # ========================================
    # 每個 IP 每秒最多 10 個請求
    limit_req_zone $binary_remote_addr zone=general:10m rate=10r/s;
    # API 相關路徑更嚴格：每秒 2 個
    limit_req_zone $binary_remote_addr zone=api:10m rate=2r/s;

    # ========================================
    # 安全防護 4：隱藏 Nginx 版本號
    # ========================================
    server_tokens off;

    # ========================================
    # 安全防護 5：限制請求 body 大小（防大檔攻擊）
    # ========================================
    client_max_body_size 10m;

    server {
        listen       80;
        server_name  _;

        # 網站根目錄指向你的專案
        root  "C:/Users/USER/Desktop/UIUX";
        index ai-travel-explore-final.html;

        # ========================================
        # 安全防護 6：封鎖所有隱藏檔/敏感檔
        # ========================================
        # 擋掉 .env / .git / .claude / .config 等
        location ~ /\. {
            deny all;
            return 404;
        }

        # 擋掉 weather.env.js（含 API 金鑰）
        location = /weather.env.js {
            deny all;
            return 404;
        }

        # 擋掉 crawler 目錄（含 serviceAccount）
        location /crawler/ {
            deny all;
            return 404;
        }

        # 擋掉 node_modules
        location /node_modules/ {
            deny all;
            return 404;
        }

        # ========================================
        # 安全防護 7：安全標頭
        # ========================================
        add_header X-Frame-Options "SAMEORIGIN" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header X-XSS-Protection "1; mode=block" always;
        add_header Referrer-Policy "strict-origin-when-cross-origin" always;
        add_header Permissions-Policy "camera=(), microphone=(), geolocation=(self)" always;

        # ========================================
        # 主要路由：靜態檔案服務
        # ========================================
        location / {
            # 套用速率限制
            limit_req zone=general burst=20 nodelay;

            try_files $uri $uri/ =404;
        }

        # ========================================
        # 靜態資源快取（CSS/JS/圖片）
        # ========================================
        location ~* \.(css|js|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
            expires 7d;
            add_header Cache-Control "public, immutable";
        }

        # ========================================
        # 自訂 404 錯誤頁面（可選）
        # ========================================
        error_page 404 /404.html;
        location = /404.html {
            internal;
        }
    }
}
```

---

## 四、Step 3 — 建立 IP 封鎖清單

建立 `C:\nginx\conf\blocklist.conf`：

```nginx
# ==========================================
# IP 封鎖清單 — 發現惡意 IP 就加在這裡
# 修改後執行：nginx -s reload 即可生效
# ==========================================

# 2026-06-23 掃描攻擊
deny 192.3.130.113;
deny 45.198.224.188;

# 常見掃描器 IP 段（可依需求新增）
# deny 185.220.101.0/24;
# deny 45.148.10.0/24;
```

---

## 五、Step 4 — 處理 API 金鑰安全問題

你的 `weather.env.js` 含有 Google Maps / Gemini / Firebase 金鑰。直接開 Port 對外時，**這個檔案不能被外部存取**。

### 方案 A：Nginx 已擋（上方設定已包含）
上方 nginx.conf 已加入 `location = /weather.env.js { deny all; }` 規則。

### 方案 B：改用環境變數注入（更安全）
建立一個不含真實金鑰的公開版本：

```powershell
# 建立一個公開用的設定檔（不含真實金鑰）
# 真實金鑰由你在本機瀏覽器 console 手動設定，或改用後端代理
```

### 方案 C：Google Maps / Firebase 金鑰限制
最重要的是在 Google Cloud Console 和 Firebase Console 限制金鑰：

| 金鑰 | 設定位置 | 限制方式 |
|------|---------|---------|
| Google Maps API Key | Google Cloud Console → 憑證 | HTTP 參照網址限制 → 只允許你的網域 |
| Firebase API Key | Firebase Console → 專案設定 | 已內建網域限制（授權網域設定） |
| Gemini API Key | Google AI Studio | 設定 IP 或網域限制 |

```
Google Cloud Console → API 和服務 → 憑證 → 你的 API Key → 應用程式限制
→ HTTP 參照網址（網站）
→ 新增：你的網域（例如 yourdomain.ddns.net/*）
→ 新增：localhost/*（開發用）
```

---

## 六、Step 5 — 設定 DDNS（如果沒有固定 IP）

大多數家用網路沒有固定 IP，需要 DDNS 服務。

### 免費 DDNS 服務推薦

| 服務 | 免費方案 | 網域格式 |
|------|---------|---------|
| No-IP | 1 個免費 hostname | yourname.ddns.net |
| DuckDNS | 5 個免費 hostname | yourname.duckdns.org |
| Dynu | 免費 | yourname.dynu.net |

### 以 No-IP 為例

1. 到 https://www.noip.com 註冊帳號
2. 建立一個 hostname（例如 `travellink-ai.ddns.net`）
3. 下載安裝 **No-IP DUC**（Dynamic Update Client），它會自動更新你的 IP

---

## 七、Step 6 — 路由器 Port Forwarding（通訊埠轉發）

在路由器設定頁面（通常是 `192.168.1.1` 或 `192.168.0.1`）：

```
外部 Port 80   →  你的電腦內網 IP:80
外部 Port 443  →  你的電腦內網 IP:443（如果有 SSL）
```

### 查看你的內網 IP

```powershell
ipconfig | findstr "IPv4"
# 記下類似 192.168.1.xxx 的地址
```

### 路由器設定步驟（各品牌大同小異）

1. 登入路由器管理頁面
2. 找到「Port Forwarding」或「通訊埠轉發」或「虛擬伺服器」
3. 新增規則：

| 服務名稱 | 外部埠 | 內部 IP | 內部埠 | 協定 |
|---------|-------|---------|-------|------|
| HTTP | 80 | 192.168.1.xxx | 80 | TCP |
| HTTPS | 443 | 192.168.1.xxx | 443 | TCP |

---

## 八、Step 7 — 加入 SSL（HTTPS）

直接開 Port 對外**強烈建議加 HTTPS**，否則所有資料（含 API 金鑰）都是明文傳輸。

### 使用 Let's Encrypt + win-acme（Windows 免費 SSL）

1. 下載 win-acme：https://www.win-acme.com/
2. 解壓後執行：

```powershell
# 在 win-acme 目錄執行
.\wacs.exe
```

3. 依照互動式選單：
   - 選擇你的網域（例如 `travellink-ai.ddns.net`）
   - 驗證方式選 HTTP-01（需要 Port 80 開放）
   - 會自動產生憑證

4. 取得憑證後，更新 nginx.conf 加入 SSL：

```nginx
server {
    listen       443 ssl;
    server_name  travellink-ai.ddns.net;

    ssl_certificate      "C:/nginx/ssl/fullchain.pem";
    ssl_certificate_key  "C:/nginx/ssl/privkey.pem";
    ssl_protocols        TLSv1.2 TLSv1.3;
    ssl_ciphers          HIGH:!aNULL:!MD5;

    # ... 其他設定同上方 ...
}

# HTTP 自動跳轉 HTTPS
server {
    listen 80;
    server_name travellink-ai.ddns.net;
    return 301 https://$host$request_uri;
}
```

---

## 九、Step 8 — 用 PM2 保持 Nginx 常駐（可選）

如果你希望 Nginx 開機自動啟動且掛掉自動重啟：

### 方式 A：Windows 服務（推薦）

用 `nssm`（Non-Sucking Service Manager）將 Nginx 註冊為 Windows 服務：

```powershell
# 1. 下載 nssm：https://nssm.cc/download
# 2. 執行：
nssm install nginx

# 3. 在彈出的視窗中設定：
#    Path: C:\nginx\nginx.exe
#    Startup directory: C:\nginx
#    Service name: nginx

# 4. 啟動服務
nssm start nginx
```

### 方式 B：PM2（如果你比較熟 Node.js）

```powershell
# 安裝 PM2
npm install -g pm2 pm2-windows-startup

# 用 PM2 管理 Nginx（透過啟動腳本）
pm2 start "C:\nginx\nginx.exe" --name nginx --cwd "C:\nginx"
pm2 save
pm2-startup install
```

---

## 十、安全防護總整理

### 已在 nginx.conf 中啟用的防護

| # | 防護措施 | 作用 | 擋什麼 |
|---|---------|------|--------|
| 1 | IP 封鎖清單 (`blocklist.conf`) | 直接拒絕已知惡意 IP | 你 log 中的 `192.3.130.113` 等 |
| 2 | 隱藏檔封鎖 (`location ~ /\.`) | 所有 `.` 開頭的檔案/資料夾回 404 | `.git/`、`.claude/`、`.config/`、`.env` |
| 3 | 敏感檔案封鎖 | `weather.env.js`、`crawler/` 回 404 | API 金鑰檔、serviceAccount |
| 4 | 請求速率限制 (`limit_req`) | 每 IP 每秒最多 10 次 | 掃描器大量請求（你 log 中的 400 錯誤） |
| 5 | 隱藏版本號 (`server_tokens off`) | 不洩漏 Nginx 版本 | 攻擊者找版本漏洞 |
| 6 | 安全標頭 | 防 XSS/點擊劫持/MIME 嗅探 | 常見 Web 攻擊 |
| 7 | Body 大小限制 (`client_max_body_size`) | 限制上傳大小 10MB | 大檔癱瘓攻擊 |

### 額外建議的防護

| # | 防護措施 | 做法 |
|---|---------|------|
| 8 | **Windows 防火牆** | 只開放 Port 80 和 443，其他全擋 |
| 9 | **定期檢查 log** | 每週看 `C:\nginx\logs\access.log`，新惡意 IP 加入封鎖清單 |
| 10 | **自動封鎖腳本** | 見下方 Step 11 |

---

## 十一、自動封鎖惡意 IP 腳本（可選進階）

建立 `C:\nginx\scripts\auto-block.ps1`，定期掃描 log 封鎖高頻 IP：

```powershell
# auto-block.ps1 — 掃描 Nginx log，自動封鎖每分鐘超過 60 次請求的 IP

$logFile = "C:\nginx\logs\access.log"
$blockFile = "C:\nginx\conf\blocklist.conf"
$threshold = 60  # 每分鐘超過此數量就封鎖

# 讀取最近 1 分鐘的 log
$cutoff = (Get-Date).AddMinutes(-1).ToString("dd/MMM/yyyy:HH:mm")
$lines = Get-Content $logFile -Tail 5000 | Where-Object { $_ -match $cutoff }

# 統計各 IP 請求次數
$ipCounts = @{}
foreach ($line in $lines) {
    if ($line -match "^([\d\.]+)") {
        $ip = $matches[1]
        if (-not $ipCounts.ContainsKey($ip)) { $ipCounts[$ip] = 0 }
        $ipCounts[$ip]++
    }
}

# 讀取現有封鎖清單
$existing = Get-Content $blockFile -ErrorAction SilentlyContinue

# 封鎖超過閾值的 IP
$added = 0
foreach ($ip in $ipCounts.Keys) {
    if ($ipCounts[$ip] -gt $threshold) {
        $denyLine = "deny $ip;"
        if ($existing -notcontains $denyLine) {
            Add-Content $blockFile "`n# $(Get-Date -Format 'yyyy-MM-dd HH:mm') auto-blocked ($($ipCounts[$ip]) req/min)"
            Add-Content $blockFile $denyLine
            $added++
            Write-Host "Blocked: $ip ($($ipCounts[$ip]) requests)"
        }
    }
}

# 如果有新封鎖，重載 Nginx
if ($added -gt 0) {
    & C:\nginx\nginx.exe -s reload
    Write-Host "Nginx reloaded. $added new IP(s) blocked."
}
```

設定 Windows 排程每 5 分鐘自動執行：

```powershell
# 在 PowerShell（系統管理員）中執行
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-File C:\nginx\scripts\auto-block.ps1"
$trigger = New-ScheduledTaskTrigger -RepetitionInterval (New-TimeSpan -Minutes 5) -Once -At (Get-Date)
Register-ScheduledTask -TaskName "Nginx Auto Block" -Action $action -Trigger $trigger -RunLevel Highest
```

---

## 十二、Windows 防火牆設定

```powershell
# 在 PowerShell（系統管理員）中執行

# 只允許 Port 80 (HTTP)
New-NetFirewallRule -DisplayName "Allow HTTP" -Direction Inbound -Protocol TCP -LocalPort 80 -Action Allow

# 只允許 Port 443 (HTTPS)
New-NetFirewallRule -DisplayName "Allow HTTPS" -Direction Inbound -Protocol TCP -LocalPort 443 -Action Allow

# 確認其他 Port 沒有不必要的開放
Get-NetFirewallRule -Direction Inbound -Action Allow | Select-Object DisplayName, LocalPort
```

---

## 十三、部署後驗證清單

部署完成後，依序檢查：

```
□ 1. http://你的網域 能正常顯示首頁
□ 2. https://你的網域 能正常顯示（如有設 SSL）
□ 3. http://你的網域/weather.env.js → 回 404（金鑰不外洩）
□ 4. http://你的網域/.git/ → 回 404
□ 5. http://你的網域/.claude/ → 回 404
□ 6. http://你的網域/crawler/ → 回 404
□ 7. http://你的網域/.config/anthropic/credentials/default.json → 回 404
□ 8. Google Maps 地圖正常顯示
□ 9. Firebase 登入正常運作
□ 10. AI 行程生成正常運作
□ 11. 手機瀏覽器可正常使用
```

---

## 十四、快速指令參考

```powershell
# Nginx 操作
cd C:\nginx
.\nginx.exe              # 啟動
.\nginx.exe -s stop      # 停止
.\nginx.exe -s reload    # 重載設定（改 conf 後用這個）
.\nginx.exe -t           # 測試設定檔語法

# 查看 log
Get-Content C:\nginx\logs\access.log -Tail 50    # 最新 50 行
Get-Content C:\nginx\logs\error.log -Tail 20     # 錯誤 log

# 查看誰在連線
netstat -an | findstr ":80"
netstat -an | findstr ":443"
```

---

## 十五、架構比較：直接開 Port vs Cloudflare Tunnel

你目前選擇直接開 Port，以下是與 Cloudflare Tunnel 的比較，供日後參考：

| 項目 | 直接開 Port（你的選擇） | Cloudflare Tunnel |
|------|----------------------|-------------------|
| 需要固定 IP | 是（或用 DDNS） | 不需要 |
| HTTPS | 需自行設定 Let's Encrypt | 自動提供 |
| DDoS 防護 | 需自行設定 | Cloudflare 自動擋 |
| CDN 加速 | 無 | Cloudflare 全球 CDN |
| 路由器設定 | 需要 Port Forwarding | 不需要 |
| 安全性 | 你的真實 IP 暴露 | IP 隱藏在 Cloudflare 後面 |
| 難度 | 中等 | 較簡單 |
| 費用 | 免費 | 免費 |

> 如果之後想切換到 Cloudflare Tunnel，只需安裝 `cloudflared` 並執行一行指令，不需改動 Nginx 設定。
