@echo off
mosquitto_sub -h 172.20.10.2 -p 1883 -t "terrarium/terrarium_01/+/+" -v
pause
