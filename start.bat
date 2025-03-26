@echo off
REM Start the Node.js server (server.js)
start /B node server.js

REM Wait for the server to start (adjust the timeout as necessary)
timeout /t 5 /nobreak

REM Wait for 2 seconds before clearing the screen
timeout /t 2 /nobreak

REM Clear the command prompt screen
cls

REM Run update_data.py and wait for it to finish
python update_data.py

REM Open the frontend (index.html) via the server's URL (port 5000)
start http://localhost:5000
