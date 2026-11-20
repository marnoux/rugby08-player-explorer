@echo off
rem Starts the Rugby 08 squad and player editor and opens it in your browser.
rem Keep this window open while you edit; close it when you're done.
cd /d "%~dp0"
node editor\server.js --open
pause
