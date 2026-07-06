@echo off
netstat -ano | findstr ":3001" | findstr "LISTENING" >nul
if errorlevel 1 (
  cd /d C:\Users\USER\Desktop\UIUX\server
  start "" /B node server.js
)