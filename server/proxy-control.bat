@echo off
REM 後端代理控制台 GUI（雙擊即可）
powershell -NoProfile -ExecutionPolicy Bypass -STA -File "%~dp0proxy-control.ps1"
