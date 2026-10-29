@echo off
rem Levanta la aplicación completa. Uso: dev   (o doble clic sobre este archivo)
rem Ejecuta dev.ps1 permitiendo scripts SOLO para esta ejecución (no cambia la configuración de Windows).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0dev.ps1"
