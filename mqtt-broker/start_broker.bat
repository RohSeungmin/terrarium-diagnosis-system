@echo off
cd /d "%~dp0"
mosquitto -c "%~dp0broker\mosquitto.conf" -v
pause