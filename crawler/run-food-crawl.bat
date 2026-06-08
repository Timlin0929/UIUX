@echo off
chcp 65001 >nul
REM WanderAI restaurant cache crawler (run biweekly by Windows Task Scheduler).
REM The Google Maps key is loaded automatically from ..\weather.env.js by worker.js.
set "FIREBASE_SERVICE_ACCOUNT_PATH=C:\Users\USER\Desktop\UIUX\crawler\serviceAccount.json"
cd /d "C:\Users\USER\Desktop\UIUX\crawler"
echo [%date% %time%] crawl:food start>> "crawl-food.log"
node worker.js --crawl-food >> "crawl-food.log" 2>&1
echo [%date% %time%] crawl:food done (exit %errorlevel%)>> "crawl-food.log"
