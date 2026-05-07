@echo off
setlocal
set "BASE=%~dp0"
set "INDEX=%BASE%index.html"
set "PROFILE=%BASE%.profile-edge-2"
set "URL=file:///%INDEX:\=/%"

start "" msedge --app="%URL%" --user-data-dir="%PROFILE%" --allow-file-access-from-files --window-size=1600,980 --window-position=40,40
