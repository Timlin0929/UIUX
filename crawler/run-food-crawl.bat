@echo off
chcp 65001 >nul
REM WanderAI restaurant cache crawler (run biweekly by Windows Task Scheduler).
REM 金鑰：優先用 crawler-key.local.bat（爬蟲專用、無 referrer 限制、gitignored）；
REM 沒有該檔才退回 ..\weather.env.js —— 但那支是瀏覽器限制鍵，伺服器端會 403。
set "FIREBASE_SERVICE_ACCOUNT_PATH=C:\Users\USER\Desktop\UIUX\crawler\serviceAccount.json"
cd /d "C:\Users\USER\Desktop\UIUX\crawler"
if exist "crawler-key.local.bat" call "crawler-key.local.bat"
echo [%date% %time%] crawl:food start>> "crawl-food.log"
node worker.js --crawl-food >> "crawl-food.log" 2>&1
echo [%date% %time%] crawl:food done (exit %errorlevel%)>> "crawl-food.log"
