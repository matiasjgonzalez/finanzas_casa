@echo off
rem Prueba de punta a punta en un navegador real, sobre la base de PRUEBA (no toca tus datos).
rem Uso: e2e   o   e2e --sin-compilar
"%~dp0backend\.venv\Scripts\python.exe" "%~dp0e2e\run.py" %*
