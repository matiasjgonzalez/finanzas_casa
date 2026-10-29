@echo off
rem Modo rápido (frontend compilado, servido por la API en http://localhost:8000).
rem Uso: prod          solo desde esta computadora
rem      prod -Red     también desde los celulares de la red de la casa
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0prod.ps1" %*
