@echo off
chcp 65001 >nul
REM ============================================================================
REM WanderAI 每日爬蟲：把 verify:places 平均分散在一週的 7 天執行，並在 API
REM 預算內停止（免費額度用完前就停，未處理者隔天的下一片自動續跑）。
REM   - 切片：依星期幾跑 1/7 ~ 7/7（週日=1 ... 週六=7）。
REM   - 預算：每天最多 CRAWL_MAX_CALLS 次 Google 呼叫，達上限即停。
REM   - 跑完 verify 後重產 poi-data.js（export:local 不打 Google API、零費用）。
REM Google Maps key 由 worker.js 自動從 ..\weather.env.js 載入。
REM 由 Windows 工作排程每天 03:00 執行；輸出寫到 crawler\weekly-crawl.log。
REM ============================================================================
set "FIREBASE_SERVICE_ACCOUNT_PATH=C:\Users\USER\Desktop\UIUX\crawler\serviceAccount.json"
cd /d "C:\Users\USER\Desktop\UIUX\crawler"

REM 每天的 API 呼叫上限。請依你的免費額度調整（見 README「每日分散爬蟲」）。
if not defined CRAWL_MAX_CALLS set "CRAWL_MAX_CALLS=120"

REM 依星期幾決定今天跑哪一片（Sunday=0 -> 1，... Saturday=6 -> 7）。
for /f %%i in ('powershell -NoProfile -Command "[int]((Get-Date).DayOfWeek) + 1"') do set "DOW=%%i"

echo [%date% %time%] weekly verify slice %DOW%/7 (max %CRAWL_MAX_CALLS% calls) start>> "weekly-crawl.log"
node worker.js --verify-places --slice %DOW%/7 --max-calls %CRAWL_MAX_CALLS% >> "weekly-crawl.log" 2>&1
echo [%date% %time%] verify done (exit %errorlevel%), refreshing poi-data.js>> "weekly-crawl.log"
node worker.js --export-local >> "weekly-crawl.log" 2>&1
echo [%date% %time%] weekly crawl done (exit %errorlevel%)>> "weekly-crawl.log"
