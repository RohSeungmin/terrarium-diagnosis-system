@echo off
mosquitto_sub -h 127.0.0.1 -p 1883 -t "terrarium/terrarium_01/+/+" -v
pause